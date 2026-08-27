const PrintingLot = require('../models/PrintingLot');
const CardDesign = require('../models/CardDesign');
const PrintJob = require('../models/PrintJob');
const Submission = require('../models/Submission');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const { assertObjectId, mergeFilters, buildSearch } = require('../utils/query');
const { tenantScope, findScoped } = require('../middleware/tenant');
const reportService = require('../services/report.service');
const exportService = require('../services/export.service');
const sheetService = require('../services/sheet.service');
const audit = require('../services/audit.service');
const { isDataBearing, isFileField } = require('../constants/fieldTypes');

/* ========================================================================== */
/* REPORTS                                                                    */
/* ========================================================================== */

/** GET /api/reports - the client's own reporting view. */
const clientReports = asyncHandler(async (req, res) => {
  const scope = tenantScope(req);

  const [people, forms, volume, jobs] = await Promise.all([
    reportService.peopleBreakdown(req.tenantId),
    reportService.formCompletion(req.tenantId),
    reportService.printingVolume(scope, 12),
    reportService.jobsByStatus(scope),
  ]);

  return ok(res, { people, forms, volume, jobs });
});

/** GET /api/super-admin/reports - MR Print World's platform view. */
const platformReports = asyncHandler(async (req, res) => {
  const [volume, jobs, clients, turnaroundStats] = await Promise.all([
    reportService.printingVolume({}, 12),
    reportService.jobsByStatus(),
    reportService.clientVolume(20),
    reportService.turnaround(),
  ]);

  return ok(res, { volume, jobs, clients, turnaround: turnaroundStats });
});

/* ========================================================================== */
/* EXPORTS                                                                    */
/* ========================================================================== */

/**
 * Streams the print package for a lot.
 *
 * Shared by both portals - MR Print World needs it to produce the cards, and
 * the client is entitled to a copy of their own data. `scoped` decides which
 * ownership rule applies.
 */
async function sendPrintPackage(req, res, { scoped }) {
  assertObjectId(req.params.id, 'lot id');

  const lot = scoped
    ? await findScoped(PrintingLot, req.params.id, req)
    : await PrintingLot.findById(req.params.id);

  if (!lot) throw ApiError.notFound('Lot not found');

  const submissions = await exportService.loadForLot(lot);
  if (!submissions.length) {
    throw ApiError.badRequest('This lot has no records to export.', { code: 'EMPTY_LOT' });
  }

  const folderName = lot.lotNumber;

  /*
   * The card layout to print, found by the LOT's organisation rather than the
   * requester's. MR Print World exports the same package with no tenant of
   * their own, so scoping this to req.tenantId would silently ship a package
   * with no cards whenever production downloaded it.
   */
  const cardDesign = await CardDesign.findOne({
    organization: lot.organization,
    form: lot.form,
    status: 'active',
  });

  // Recorded BEFORE streaming: once the response is piped the headers are
  // gone, and an export that leaves the building must be logged either way.
  await audit.record(req, {
    action: audit.ACTIONS.DATA_EXPORTED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description:
      `Print package for ${lot.lotNumber} (${submissions.length} records, with photographs` +
      `${cardDesign ? ' and rendered cards' : ''}) was downloaded`,
    organization: lot.organization,
    severity: 'critical',
    metadata: { records: submissions.length },
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);
  // The size is not known until the archive is built, so no Content-Length.
  res.setHeader('Cache-Control', 'no-store');

  await exportService.streamPrintPackage(res, { lot, submissions, folderName, cardDesign });
}

/** GET /api/lots/:id/export - the client's own lot. */
const exportLotForClient = asyncHandler(async (req, res) =>
  sendPrintPackage(req, res, { scoped: true })
);

/** GET /api/super-admin/jobs/:id/export - by job, for production. */
const exportJobPackage = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');
  const job = await PrintJob.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');

  // Reuse the lot path by pointing at the job's lot.
  req.params.id = String(job.lot);
  return sendPrintPackage(req, res, { scoped: false });
});

/**
 * GET /api/submissions/export
 * A flat spreadsheet of submissions - no assets, for checking rather than printing.
 */
const exportSubmissions = asyncHandler(async (req, res) => {
  const filters = [tenantScope(req)];
  if (req.query.form) filters.push({ form: req.query.form });
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.orgCategory) filters.push({ orgCategory: req.query.orgCategory });

  const filter = mergeFilters(
    ...filters,
    buildSearch(req.query.search, ['userName', 'userLoginId'])
  );

  const submissions = await Submission.find(filter)
    .populate('orgCategory', 'name')
    .populate('department', 'name')
    .populate('form', 'title')
    .sort({ userLoginId: 1 })
    .limit(20000);

  if (!submissions.length) {
    throw ApiError.badRequest('There is nothing to export with those filters.');
  }

  const snapshot = submissions.find((s) => s.formSnapshot?.length)?.formSnapshot || [];

  const columns = [
    { key: 'loginId', header: 'User ID' },
    { key: 'name', header: 'Name' },
    { key: 'category', header: 'Category' },
    { key: 'department', header: 'Department' },
    { key: 'form', header: 'Form' },
    { key: 'status', header: 'Status' },
    { key: 'submittedAt', header: 'Submitted' },
    { key: 'attempts', header: 'Attempts' },
    ...snapshot
      .filter((f) => isDataBearing(f.type) && !isFileField(f.type))
      .map((f) => ({ key: f.key, header: f.label })),
  ];

  const rows = submissions.map((s) => {
    const base = {
      loginId: s.userLoginId || '',
      name: s.userName,
      category: s.orgCategory?.name || '',
      department: s.department?.name || '',
      form: s.form?.title || '',
      status: s.status.replace(/_/g, ' '),
      submittedAt: s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-IN') : '',
      attempts: s.submissionCount || 0,
    };
    for (const field of snapshot) {
      if (isFileField(field.type) || !isDataBearing(field.type)) continue;
      base[field.key] = exportService.flattenValue(field, (s.data || {})[field.key]);
    }
    return base;
  });

  await audit.record(req, {
    action: audit.ACTIONS.DATA_EXPORTED,
    entityType: 'Submission',
    entityLabel: `${rows.length} submissions`,
    description: `${rows.length} submission records exported`,
    severity: 'warning',
  });

  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.csv"');
    return res.send(sheetService.buildCsv(columns, rows));
  }

  const buffer = await sheetService.buildXlsx(columns, rows, 'Submissions');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="submissions.xlsx"');
  return res.send(Buffer.from(buffer));
});

module.exports = {
  clientReports,
  platformReports,
  exportLotForClient,
  exportJobPackage,
  exportSubmissions,
};
