const PrintingLot = require('../models/PrintingLot');
const Submission = require('../models/Submission');
const Form = require('../models/Form');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters } = require('../utils/query');
const { tenantScope, findScoped } = require('../middleware/tenant');
const lotService = require('../services/lot.service');
const submissionService = require('../services/submission.service');
const jobService = require('../services/job.service');
const audit = require('../services/audit.service');
const notifications = require('../services/notification.service');
const { PERMISSIONS } = require('../constants/permissions');
const { LOT_STATUS, SUBMISSION_STATUS } = require('../constants/workflow');

const SORTABLE = ['lotNumber', 'status', 'recordCount', 'createdAt', 'submittedAt'];

/**
 * GET /api/lots/eligible
 * Approved records not yet in any lot - the pool a new lot draws from.
 */
const eligible = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = mergeFilters(
    lotService.eligibleFilter(req.tenantId, req.query.form),
    req.query.orgCategory ? { orgCategory: req.query.orgCategory } : null,
    req.query.department ? { department: req.query.department } : null,
    buildSearch(req.query.search, ['userName', 'userLoginId'])
  );

  const [items, total] = await Promise.all([
    Submission.find(filter)
      .select('userName userLoginId status orgCategory department files approvedAt duplicateOf')
      .populate('orgCategory', 'name color')
      .populate('department', 'name')
      .sort({ userLoginId: 1, userName: 1 })
      .skip(skip)
      .limit(limit),
    Submission.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/**
 * POST /api/lots/validate
 * Dry run. Shows exactly what would happen without creating anything.
 */
const validate = asyncHandler(async (req, res) => {
  const result = await lotService.validateRecords(
    req.body.submissions,
    req.tenantId,
    req.body.form
  );
  return ok(res, result);
});

/** GET /api/lots */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, SORTABLE, { createdAt: -1 });

  const filters = [tenantScope(req)];
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.form) filters.push({ form: req.query.form });

  const filter = mergeFilters(...filters, buildSearch(req.query.search, ['lotNumber', 'name']));

  const [items, total] = await Promise.all([
    PrintingLot.find(filter)
      .select('-submissions')
      .populate('createdBy', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    PrintingLot.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/lots/stats */
const stats = asyncHandler(async (req, res) => {
  const rows = await PrintingLot.aggregate([
    { $match: tenantScope(req) },
    { $group: { _id: '$status', count: { $sum: 1 }, records: { $sum: '$recordCount' } } },
  ]);

  const byStatus = rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  const eligibleCount = await Submission.countDocuments(lotService.eligibleFilter(req.tenantId));

  return ok(res, {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    draft: byStatus[LOT_STATUS.DRAFT] || 0,
    ready: byStatus[LOT_STATUS.READY] || 0,
    submitted: byStatus[LOT_STATUS.SUBMITTED] || 0,
    inProduction: byStatus[LOT_STATUS.IN_PRODUCTION] || 0,
    returned: byStatus[LOT_STATUS.RETURNED] || 0,
    completed: byStatus[LOT_STATUS.COMPLETED] || 0,
    totalRecords: rows.reduce((sum, r) => sum + r.records, 0),
    eligibleRecords: eligibleCount,
  });
});

/** GET /api/lots/:id */
const getOne = asyncHandler(async (req, res) => {
  const lot = await findScoped(PrintingLot, req.params.id, req, {
    populate: [
      { path: 'createdBy', select: 'name' },
      { path: 'submittedBy', select: 'name' },
      { path: 'form', select: 'title productType' },
    ],
  });

  const records = await Submission.find({ _id: { $in: lot.submissions } })
    .select('userName userLoginId status orgCategory department files duplicateOf')
    .populate('orgCategory', 'name color')
    .populate('department', 'name')
    .sort({ userLoginId: 1 });

  return ok(res, { lot, records });
});

/**
 * POST /api/lots
 * Creates a lot from a set of approved records.
 */
const create = asyncHandler(async (req, res) => {
  const { submissions: ids, form: formId, name, notes, priority, requiredBy } = req.body;

  const form = await findScoped(Form, formId, req);

  const validation = await lotService.validateRecords(ids, req.tenantId, formId);
  if (!validation.valid.length) {
    throw ApiError.badRequest(
      'None of the selected records can go into a lot. Fix the problems listed and try again.',
      { code: 'NO_VALID_RECORDS', details: validation }
    );
  }

  const lot = await PrintingLot.create({
    organization: req.tenantId,
    lotNumber: await PrintingLot.nextLotNumber(),
    name: name || `${form.title} - ${new Date().toLocaleDateString('en-IN')}`,
    notes: notes || '',
    form: form._id,
    formTitle: form.title,
    productType: form.productType,
    priority: priority || 'normal',
    requiredBy: requiredBy || null,
    status: LOT_STATUS.DRAFT,
    createdBy: req.user._id,
  });

  // Only the records that actually passed - invalid ones are reported back,
  // never quietly swept into production.
  await lotService.attachRecords(lot, validation.valid.map((r) => r.id));

  await audit.record(req, {
    action: audit.ACTIONS.LOT_CREATED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description: `${lot.lotNumber} created with ${validation.valid.length} record${validation.valid.length === 1 ? '' : 's'} from "${form.title}"`,
    metadata: {
      included: validation.valid.length,
      excluded: validation.invalid.length,
    },
  });

  return created(
    res,
    { lot, included: validation.valid.length, excluded: validation.invalid },
    `${lot.lotNumber} created with ${validation.valid.length} record${validation.valid.length === 1 ? '' : 's'}`
  );
});

/** PATCH /api/lots/:id */
const update = asyncHandler(async (req, res) => {
  const lot = await findScoped(PrintingLot, req.params.id, req);

  if (!lot.isEditable) {
    throw ApiError.conflict(
      `${lot.lotNumber} is with MR Print World and can no longer be edited here.`,
      { code: 'LOT_LOCKED', details: { status: lot.status } }
    );
  }

  const { name, notes, priority, requiredBy } = req.body;
  Object.assign(lot, {
    ...(name !== undefined ? { name } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(requiredBy !== undefined ? { requiredBy } : {}),
  });
  await lot.save();

  await audit.record(req, {
    action: audit.ACTIONS.LOT_UPDATED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description: `${lot.lotNumber} details updated`,
  });

  return ok(res, { lot }, 'Lot updated');
});

/** POST /api/lots/:id/records - add more approved records. */
const addRecords = asyncHandler(async (req, res) => {
  const lot = await findScoped(PrintingLot, req.params.id, req);

  if (!lot.isEditable) {
    throw ApiError.conflict(`${lot.lotNumber} can no longer be changed.`, { code: 'LOT_LOCKED' });
  }

  const validation = await lotService.validateRecords(req.body.submissions, req.tenantId, lot.form);
  const addedCount = await lotService.attachRecords(lot, validation.valid.map((r) => r.id));

  await audit.record(req, {
    action: audit.ACTIONS.LOT_UPDATED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description: `${addedCount} record(s) added to ${lot.lotNumber}`,
    metadata: { added: addedCount, rejected: validation.invalid.length },
  });

  return ok(
    res,
    { lot, added: addedCount, excluded: validation.invalid },
    `${addedCount} record${addedCount === 1 ? '' : 's'} added`
  );
});

/** DELETE /api/lots/:id/records - release records back to approved. */
const removeRecords = asyncHandler(async (req, res) => {
  const lot = await findScoped(PrintingLot, req.params.id, req);

  if (!lot.isEditable) {
    throw ApiError.conflict(`${lot.lotNumber} can no longer be changed.`, { code: 'LOT_LOCKED' });
  }

  const removed = await lotService.detachRecords(lot, req.body.submissions);

  await audit.record(req, {
    action: audit.ACTIONS.LOT_RECORDS_RELEASED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description: `${removed} record(s) removed from ${lot.lotNumber} and returned to approved`,
    severity: 'warning',
  });

  return ok(res, { lot, removed }, `${removed} record${removed === 1 ? '' : 's'} removed`);
});

/**
 * POST /api/lots/:id/submit
 *
 * The deliberate hand-over. Everything in the lot is re-validated first,
 * because approval and production are separated in time - this is the last
 * moment anything can be caught before it costs materials.
 */
const submitLot = asyncHandler(async (req, res) => {
  const lot = await findScoped(PrintingLot, req.params.id, req);

  /**
   * Explicit guard for an already-sent lot.
   *
   * assertTransition treats from === to as a no-op, so without this the
   * re-validation below would run against records that are now
   * `sent_for_printing` and fail with a confusing "invalid records" error
   * rather than the plain truth: it has already gone.
   */
  if (lot.isWithProduction) {
    throw ApiError.conflict(
      `${lot.lotNumber} was already sent to MR Print World on ${lot.submittedAt?.toLocaleDateString('en-IN') || 'an earlier date'}.`,
      { code: 'LOT_ALREADY_SUBMITTED', details: { status: lot.status } }
    );
  }

  lotService.assertTransition(lot.status, LOT_STATUS.SUBMITTED);

  if (!lot.submissions.length) {
    throw ApiError.badRequest('This lot is empty. Add records before sending it.', {
      code: 'EMPTY_LOT',
    });
  }

  const validation = await lotService.validateRecords(
    lot.submissions.map(String),
    req.tenantId,
    lot.form
  );

  // Records already in THIS lot legitimately show "in_lot"; that is not a fault.
  const realProblems = validation.invalid.filter(
    (r) => !(r.problems.length === 1 && r.problems[0] === 'Already in another printing lot')
  );

  if (realProblems.length && !req.body.force) {
    throw ApiError.unprocessable(
      `${realProblems.length} record${realProblems.length === 1 ? ' has a problem' : 's have problems'} and would fail in production. Remove or fix them first.`,
      { code: 'LOT_HAS_INVALID_RECORDS', details: { invalid: realProblems } }
    );
  }

  const wasReturned = lot.status === LOT_STATUS.RETURNED;

  lot.status = LOT_STATUS.SUBMITTED;
  lot.submittedAt = new Date();
  lot.submittedBy = req.user._id;
  if (wasReturned) {
    // A corrected batch is a new revision, so production can tell it apart.
    lot.revision += 1;
    lot.returnedAt = null;
    lot.returnReason = '';
    lot.returnedRecords = [];
  }
  await lot.save();

  // Records become production-locked: no further client-side edits.
  await Submission.updateMany(
    { _id: { $in: lot.submissions }, organization: req.tenantId },
    { $set: { status: SUBMISSION_STATUS.SENT_FOR_PRINTING } }
  );

  await submissionService.refreshFormStats(lot.form);

  // Hand it to production. Idempotent, so a re-sent lot keeps its job and its
  // history rather than spawning a duplicate.
  const { job, isNew } = await jobService.createFromLot(lot, { actor: req.user });

  await audit.record(req, {
    action: audit.ACTIONS.JOB_RECEIVED,
    entityType: 'PrintJob',
    entity: job._id,
    entityLabel: job.jobNumber,
    description: `${job.jobNumber} ${isNew ? 'opened' : 'reopened'} for ${lot.lotNumber} (${lot.recordCount} records)`,
    organization: lot.organization,
    severity: 'warning',
  });

  await audit.record(req, {
    action: audit.ACTIONS.LOT_SUBMITTED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description: `${lot.lotNumber} sent to MR Print World with ${lot.recordCount} record${lot.recordCount === 1 ? '' : 's'}${wasReturned ? ` (revision ${lot.revision})` : ''}`,
    severity: 'critical',
    metadata: { records: lot.recordCount, revision: lot.revision, forced: Boolean(req.body.force) },
  });

  // MR Print World's production staff, who are outside every tenant.
  await notifications.notifyPlatform(
    PERMISSIONS.JOBS_VIEW,
    {
      type: notifications.TYPES.LOT_SUBMITTED,
      title: `${lot.lotNumber} arrived for printing`,
      body: `${lot.recordCount} record${lot.recordCount === 1 ? '' : 's'}${wasReturned ? ` (revision ${lot.revision})` : ''} as ${job.jobNumber}.`,
      link: `/super-admin/jobs/${job._id}`,
      entityType: 'PrintJob',
      entity: job._id,
      severity: 'info',
    },
    { actor: req.user._id, actorName: req.user.name }
  );

  return ok(
    res,
    { lot },
    `${lot.lotNumber} sent to MR Print World as ${job.jobNumber}. These records are now locked.`
  );
});

/** POST /api/lots/:id/cancel */
const cancel = asyncHandler(async (req, res) => {
  const lot = await findScoped(PrintingLot, req.params.id, req);

  lotService.assertTransition(lot.status, LOT_STATUS.CANCELLED);

  // Cancelling frees every record to be used in a future lot.
  const released = await lotService.detachRecords(lot, lot.submissions.map(String));

  lot.status = LOT_STATUS.CANCELLED;
  lot.cancelledAt = new Date();
  lot.cancelReason = req.body.reason || '';
  await lot.save();

  await audit.record(req, {
    action: audit.ACTIONS.LOT_CANCELLED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description: `${lot.lotNumber} cancelled: ${req.body.reason || 'no reason given'}. ${released} records returned to approved.`,
    severity: 'critical',
  });

  return ok(res, { lot, released }, `${lot.lotNumber} cancelled`);
});

/** PATCH /api/lots/:id/ready - mark a draft as reviewed and ready to send. */
const markReady = asyncHandler(async (req, res) => {
  const lot = await findScoped(PrintingLot, req.params.id, req);
  lotService.assertTransition(lot.status, LOT_STATUS.READY);

  lot.status = LOT_STATUS.READY;
  await lot.save();

  await audit.record(req, {
    action: audit.ACTIONS.LOT_UPDATED,
    entityType: 'PrintingLot',
    entity: lot._id,
    entityLabel: lot.lotNumber,
    description: `${lot.lotNumber} marked ready to send`,
  });

  return ok(res, { lot }, 'Marked ready');
});

module.exports = {
  eligible,
  validate,
  list,
  stats,
  getOne,
  create,
  update,
  addRecords,
  removeRecords,
  submitLot,
  cancel,
  markReady,
};
