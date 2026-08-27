const Organization = require('../models/Organization');
const User = require('../models/User');
const PrintJob = require('../models/PrintJob');
const PrintingLot = require('../models/PrintingLot');
const Submission = require('../models/Submission');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/apiResponse');
const { ORG_STATUS, JOB_STATUS, LOT_STATUS, SUBMISSION_STATUS } = require('../constants/workflow');
const { ROLES } = require('../constants/roles');

/**
 * GET /api/super-admin/dashboard
 *
 * Every figure is computed with aggregation on the server. Sending raw rows to
 * the browser to be counted there would not survive a few thousand clients.
 */
const summary = asyncHandler(async (req, res) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    orgRows,
    userRows,
    newThisMonth,
    recentActivity,
    recentClients,
    jobRows,
    lotRows,
    submissionRows,
    overdueJobs,
    recentJobs,
  ] = await Promise.all([
    Organization.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

    User.aggregate([
      { $match: { role: { $ne: ROLES.SUPER_ADMIN } } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),

    Organization.countDocuments({ createdAt: { $gte: monthStart } }),

    AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(12)
      .select('action entityType entityLabel description actorName createdAt severity')
      .lean(),

    Organization.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name slug type status logo stats createdAt')
      .populate('subscription', 'planName'),

    PrintJob.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, quantity: { $sum: '$quantity' } } },
    ]),

    PrintingLot.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

    Submission.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

    PrintJob.countDocuments({
      dueDate: { $lt: new Date() },
      status: { $nin: [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED] },
    }),

    PrintJob.find({ status: { $nin: [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED] } })
      .select('jobNumber lotNumber organizationName status quantity priority receivedAt dueDate')
      .sort({ priorityRank: -1, receivedAt: 1 })
      .limit(6),
  ]);

  const toMap = (rows) => rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  const orgByStatus = toMap(orgRows);
  const userByRole = toMap(userRows);
  const jobByStatus = toMap(jobRows);
  const lotByStatus = toMap(lotRows);
  const subByStatus = toMap(submissionRows);

  const qtyByStatus = jobRows.reduce((acc, r) => ({ ...acc, [r._id]: r.quantity }), {});
  const countJobs = (list) => list.reduce((sum, s) => sum + (jobByStatus[s] || 0), 0);

  return ok(res, {
    clients: {
      total: orgRows.reduce((sum, r) => sum + r.count, 0),
      active: orgByStatus[ORG_STATUS.ACTIVE] || 0,
      suspended: orgByStatus[ORG_STATUS.SUSPENDED] || 0,
      archived: orgByStatus[ORG_STATUS.ARCHIVED] || 0,
      newThisMonth,
    },
    users: {
      total: userRows.reduce((sum, r) => sum + r.count, 0),
      endUsers: userByRole[ROLES.END_USER] || 0,
      clientAdmins: (userByRole[ROLES.CLIENT_OWNER] || 0) + (userByRole[ROLES.CLIENT_ADMIN] || 0),
      reviewers: userByRole[ROLES.CLIENT_REVIEWER] || 0,
    },
    submissions: {
      total: submissionRows.reduce((sum, r) => sum + r.count, 0),
      pendingReview: [
        SUBMISSION_STATUS.SUBMITTED,
        SUBMISSION_STATUS.RESUBMITTED,
        SUBMISSION_STATUS.UNDER_REVIEW,
      ].reduce((sum, s) => sum + (subByStatus[s] || 0), 0),
      correctionRequired: subByStatus[SUBMISSION_STATUS.CORRECTION_REQUIRED] || 0,
      approved: subByStatus[SUBMISSION_STATUS.APPROVED] || 0,
    },
    production: {
      totalJobs: jobRows.reduce((sum, r) => sum + r.count, 0),
      lotsAwaitingVerification: countJobs([JOB_STATUS.RECEIVED, JOB_STATUS.DATA_VERIFICATION]),
      dataIssues: jobByStatus[JOB_STATUS.DATA_ISSUE] || 0,
      awaitingProofApproval: countJobs([
        JOB_STATUS.PROOF_READY,
        JOB_STATUS.AWAITING_CLIENT_APPROVAL,
      ]),
      inPrinting: countJobs([JOB_STATUS.PRINTING, JOB_STATUS.QUALITY_CHECK]),
      readyForDispatch: jobByStatus[JOB_STATUS.READY_FOR_DISPATCH] || 0,
      dispatched: jobByStatus[JOB_STATUS.DISPATCHED] || 0,
      completed: jobByStatus[JOB_STATUS.COMPLETED] || 0,
      overdue: overdueJobs,
      // Cards somewhere in the pipeline, not yet delivered.
      cardsInProduction: Object.entries(qtyByStatus)
        .filter(([s]) => ![JOB_STATUS.COMPLETED, JOB_STATUS.DISPATCHED, JOB_STATUS.CANCELLED].includes(s))
        .reduce((sum, [, q]) => sum + q, 0),
    },
    lots: {
      total: lotRows.reduce((sum, r) => sum + r.count, 0),
      withProduction: (lotByStatus[LOT_STATUS.SUBMITTED] || 0) + (lotByStatus[LOT_STATUS.IN_PRODUCTION] || 0),
      returned: lotByStatus[LOT_STATUS.RETURNED] || 0,
      completed: lotByStatus[LOT_STATUS.COMPLETED] || 0,
    },
    recentJobs,
    recentClients,
    recentActivity,
  });
});

module.exports = { summary };
