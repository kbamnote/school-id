const PrintJob = require('../models/PrintJob');
const PrintingLot = require('../models/PrintingLot');
const Submission = require('../models/Submission');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters, assertObjectId } = require('../utils/query');
const jobService = require('../services/job.service');
const audit = require('../services/audit.service');
const notifications = require('../services/notification.service');
const { PERMISSIONS } = require('../constants/permissions');
const { JOB_STATUS, JOB_STATUS_ORDER, JOB_TRANSITIONS, SUBMISSION_STATUS, LOT_STATUS } = require('../constants/workflow');
const { PLATFORM_ROLES } = require('../constants/roles');

const SORTABLE = ['jobNumber', 'status', 'priorityRank', 'receivedAt', 'dueDate', 'quantity'];
const SEARCHABLE = ['jobNumber', 'lotNumber', 'organizationName', 'formTitle'];

/**
 * Production jobs are NOT tenant-scoped: MR Print World works across every
 * client. The whole router sits behind `requirePlatform`, which is what keeps
 * this safe - a client user never reaches these handlers at all.
 */
function buildFilter(req) {
  const filters = [];

  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.organization) filters.push({ organization: req.query.organization });
  if (req.query.priority) filters.push({ priority: req.query.priority });
  if (req.query.assignedTo) filters.push({ assignedTo: req.query.assignedTo });

  if (req.query.group === 'open') {
    filters.push({ status: { $nin: [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED] } });
  } else if (req.query.group === 'attention') {
    // What a production manager actually needs to look at right now.
    filters.push({
      status: { $in: [JOB_STATUS.RECEIVED, JOB_STATUS.DATA_ISSUE, JOB_STATUS.AWAITING_CLIENT_APPROVAL] },
    });
  } else if (req.query.group === 'overdue') {
    filters.push({
      dueDate: { $lt: new Date() },
      status: { $nin: [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED] },
    });
  }

  return mergeFilters(...filters, buildSearch(req.query.search, SEARCHABLE));
}

/** GET /api/super-admin/jobs */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  // Urgent first, then oldest - the natural order to work a queue in.
  const sort = parseSort(req.query, SORTABLE, { priorityRank: -1, receivedAt: 1 });

  const filter = buildFilter(req);

  const [items, total] = await Promise.all([
    PrintJob.find(filter)
      .select('-statusHistory')
      .populate('assignedTo', 'name')
      .populate('organization', 'name slug logo')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    PrintJob.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/super-admin/jobs/stats - the production board summary. */
const stats = asyncHandler(async (req, res) => {
  const [rows, overdue, unassigned] = await Promise.all([
    PrintJob.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, quantity: { $sum: '$quantity' } } },
    ]),
    PrintJob.countDocuments({
      dueDate: { $lt: new Date() },
      status: { $nin: [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED] },
    }),
    PrintJob.countDocuments({
      assignedTo: null,
      status: { $nin: [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED] },
    }),
  ]);

  const byStatus = rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  const qtyByStatus = rows.reduce((acc, r) => ({ ...acc, [r._id]: r.quantity }), {});
  const countIn = (list) => list.reduce((sum, s) => sum + (byStatus[s] || 0), 0);

  return ok(res, {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    byStatus,
    quantityByStatus: qtyByStatus,

    received: byStatus[JOB_STATUS.RECEIVED] || 0,
    inVerification: byStatus[JOB_STATUS.DATA_VERIFICATION] || 0,
    dataIssues: byStatus[JOB_STATUS.DATA_ISSUE] || 0,
    inDesign: byStatus[JOB_STATUS.DESIGN_PROCESSING] || 0,
    awaitingApproval: byStatus[JOB_STATUS.AWAITING_CLIENT_APPROVAL] || 0,
    printing: byStatus[JOB_STATUS.PRINTING] || 0,
    readyForDispatch: byStatus[JOB_STATUS.READY_FOR_DISPATCH] || 0,
    dispatched: byStatus[JOB_STATUS.DISPATCHED] || 0,
    completed: byStatus[JOB_STATUS.COMPLETED] || 0,

    open: countIn(JOB_STATUS_ORDER.filter((s) => s !== JOB_STATUS.COMPLETED)),
    overdue,
    unassigned,
    // Cards currently somewhere in the pipeline, not yet delivered.
    cardsInProduction: JOB_STATUS_ORDER.filter(
      (s) => ![JOB_STATUS.COMPLETED, JOB_STATUS.DISPATCHED].includes(s)
    ).reduce((sum, s) => sum + (qtyByStatus[s] || 0), 0),
  });
});

/** GET /api/super-admin/jobs/pipeline - counts per stage, for the board. */
const pipeline = asyncHandler(async (req, res) => {
  const rows = await PrintJob.aggregate([
    { $match: { status: { $nin: [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED] } } },
    { $group: { _id: '$status', count: { $sum: 1 }, quantity: { $sum: '$quantity' } } },
  ]);
  const map = rows.reduce((acc, r) => ({ ...acc, [r._id]: r }), {});

  return ok(res, {
    stages: JOB_STATUS_ORDER.filter((s) => s !== JOB_STATUS.COMPLETED).map((status) => ({
      status,
      count: map[status]?.count || 0,
      quantity: map[status]?.quantity || 0,
    })),
  });
});

/** GET /api/super-admin/jobs/:id */
const getOne = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');

  const job = await PrintJob.findById(req.params.id)
    .populate('assignedTo', 'name email')
    .populate('organization', 'name slug logo contact')
    .populate('dataIssue.raisedBy', 'name');

  if (!job) throw ApiError.notFound('Job not found');

  // `submissions` must be selected - without it the records list below comes
  // back silently empty even though the lot is full.
  const lot = await PrintingLot.findById(job.lot).select(
    'lotNumber notes revision status submittedAt submissions'
  );
  const records = await Submission.find({ _id: { $in: lot?.submissions || [] } })
    .select('userName userLoginId status files')
    .limit(500);

  return ok(res, {
    job,
    lot,
    records,
    // Where it can legally go next - the UI offers exactly these.
    allowedTransitions: JOB_TRANSITIONS[job.status] || [],
  });
});

/** PATCH /api/super-admin/jobs/:id/status */
const changeStatus = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');
  const job = await PrintJob.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');

  const { status, note } = req.body;
  const from = job.status;

  await jobService.changeStatus(job, status, { actor: req.user, note });

  // Keep the records and the lot in step with the factory.
  if (status === JOB_STATUS.PRINTING) {
    await jobService.markRecords(job, SUBMISSION_STATUS.PRINTED);
  }
  if (status === JOB_STATUS.COMPLETED) {
    await jobService.markRecords(job, SUBMISSION_STATUS.COMPLETED);
    await PrintingLot.updateOne(
      { _id: job.lot },
      { $set: { status: LOT_STATUS.COMPLETED, completedAt: new Date() } }
    );
  }

  await audit.record(req, {
    action: audit.ACTIONS.JOB_STATUS_CHANGED,
    entityType: 'PrintJob',
    entity: job._id,
    entityLabel: job.jobNumber,
    description: `${job.jobNumber} moved from ${from.replace(/_/g, ' ')} to ${status.replace(/_/g, ' ')}`,
    organization: job.organization,
    severity: status === JOB_STATUS.COMPLETED ? 'warning' : 'info',
    changes: [{ field: 'status', from, to: status }],
    metadata: { note: note || null },
  });

  /*
   * Only the stages a client can act on or is waiting for. Notifying on every
   * internal move would train people to ignore the bell, which is worse than
   * not notifying at all.
   */
  const CLIENT_VISIBLE = [
    JOB_STATUS.PRINTING,
    JOB_STATUS.QUALITY_CHECK,
    JOB_STATUS.DISPATCHED,
    JOB_STATUS.COMPLETED,
  ];
  if (CLIENT_VISIBLE.includes(status)) {
    await notifications.notifyPermission(
      job.organization,
      PERMISSIONS.JOBS_VIEW,
      {
        type: notifications.TYPES.JOB_STATUS_CHANGED,
        title: `${job.jobNumber} is now ${status.replace(/_/g, ' ')}`,
        body: note || `Your print job moved to ${status.replace(/_/g, ' ')}.`,
        link: `/client/lots/${job.lot}`,
        entityType: 'PrintJob',
        entity: job._id,
        severity: status === JOB_STATUS.COMPLETED ? 'success' : 'info',
      },
      { actor: req.user._id, actorName: req.user.name }
    );
  }

  return ok(res, { job }, `Moved to ${status.replace(/_/g, ' ')}`);
});

/** POST /api/super-admin/jobs/:id/data-issue */
const raiseDataIssue = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');
  const job = await PrintJob.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');

  const { reason, records } = req.body;

  // Every named record must genuinely belong to this job's client.
  if (records?.length) {
    const ids = records.map((r) => r.submission);
    const owned = await Submission.countDocuments({
      _id: { $in: ids },
      organization: job.organization,
    });
    if (owned !== ids.length) {
      throw ApiError.badRequest('Some of those records do not belong to this job.');
    }
  }

  const result = await jobService.raiseDataIssue(job, {
    actor: req.user,
    reason,
    records: records || [],
  });

  await audit.record(req, {
    action: audit.ACTIONS.JOB_DATA_ISSUE_RAISED,
    entityType: 'PrintJob',
    entity: job._id,
    entityLabel: job.jobNumber,
    description: `${job.jobNumber} returned to ${job.organizationName}: ${reason}`,
    organization: job.organization,
    severity: 'critical',
    metadata: { returnedRecords: result.returnedCount, reason },
  });

  // The client must act on this before anything can print, so it also emails.
  await notifications.notifyPermission(
    job.organization,
    PERMISSIONS.SUBMISSIONS_APPROVE,
    {
      type: notifications.TYPES.JOB_DATA_ISSUE,
      title: `${job.jobNumber} was returned - data needs fixing`,
      body: reason,
      link: `/client/lots/${job.lot}`,
      entityType: 'PrintJob',
      entity: job._id,
      severity: 'critical',
    },
    { actor: req.user._id, actorName: req.user.name, email: true }
  );

  return ok(
    res,
    { job: result.job, returnedCount: result.returnedCount },
    result.returnedCount
      ? `${result.returnedCount} record${result.returnedCount === 1 ? '' : 's'} sent back for correction`
      : 'Job returned to the client'
  );
});

/** PATCH /api/super-admin/jobs/:id/assign */
const assign = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');
  const job = await PrintJob.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');

  const { assignedTo } = req.body;

  if (assignedTo) {
    // Only MR Print World staff can own a production job.
    const operator = await User.findOne({
      _id: assignedTo,
      role: { $in: PLATFORM_ROLES },
    }).select('name');
    if (!operator) {
      throw ApiError.badRequest('That person is not an MR Print World staff member.');
    }
    job.assignedTo = operator._id;
    job.assignedAt = new Date();
  } else {
    job.assignedTo = null;
    job.assignedAt = null;
  }
  await job.save();

  await audit.record(req, {
    action: audit.ACTIONS.JOB_ASSIGNED,
    entityType: 'PrintJob',
    entity: job._id,
    entityLabel: job.jobNumber,
    description: assignedTo
      ? `${job.jobNumber} assigned to an operator`
      : `${job.jobNumber} unassigned`,
    organization: job.organization,
  });

  return ok(res, { job }, assignedTo ? 'Job assigned' : 'Job unassigned');
});

/** PATCH /api/super-admin/jobs/:id */
const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');
  const job = await PrintJob.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');

  const { priority, dueDate, internalNotes, clientNotes, dispatch } = req.body;
  Object.assign(job, {
    ...(priority !== undefined ? { priority } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(internalNotes !== undefined ? { internalNotes } : {}),
    ...(clientNotes !== undefined ? { clientNotes } : {}),
    ...(dispatch !== undefined ? { dispatch: { ...job.dispatch, ...dispatch } } : {}),
  });
  await job.save();

  await audit.record(req, {
    action: audit.ACTIONS.JOB_STATUS_CHANGED,
    entityType: 'PrintJob',
    entity: job._id,
    entityLabel: job.jobNumber,
    description: `${job.jobNumber} details updated`,
    organization: job.organization,
  });

  return ok(res, { job }, 'Job updated');
});

/** GET /api/super-admin/jobs/operators - staff a job can be assigned to. */
const operators = asyncHandler(async (req, res) => {
  const staff = await User.find({ role: { $in: PLATFORM_ROLES }, status: 'active' })
    .select('name email role')
    .sort({ name: 1 });
  return ok(res, { operators: staff });
});

module.exports = {
  list,
  stats,
  pipeline,
  getOne,
  changeStatus,
  raiseDataIssue,
  assign,
  update,
  operators,
};
