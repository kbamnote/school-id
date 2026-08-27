const User = require('../models/User');
const OrgCategory = require('../models/OrgCategory');
const Department = require('../models/Department');
const Form = require('../models/Form');
const Submission = require('../models/Submission');
const AuditLog = require('../models/AuditLog');
const Subscription = require('../models/Subscription');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/apiResponse');
const { tenantScope } = require('../middleware/tenant');
const { ROLES } = require('../constants/roles');
const { USER_STATUS, SUBMISSION_STATUS } = require('../constants/workflow');

/**
 * GET /api/dashboard
 *
 * The client's own overview. Every aggregate is bounded by `tenantScope`, so
 * this endpoint physically cannot report another organisation's numbers.
 */
const summary = asyncHandler(async (req, res) => {
  const scope = tenantScope(req);

  const [
    userRows,
    categoryCount,
    departmentCount,
    categories,
    recentActivity,
    subscription,
    formRows,
    submissionRows,
  ] = await Promise.all([
      User.aggregate([
        { $match: scope },
        { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } },
      ]),
      OrgCategory.countDocuments(scope),
      Department.countDocuments(scope),
      OrgCategory.find({ ...scope, isActive: true })
        .select('name code color userCount idPrefix')
        .sort({ sortOrder: 1, name: 1 })
        .limit(12)
        .lean(),
      AuditLog.find(scope)
        .sort({ createdAt: -1 })
        .limit(10)
        .select('action entityLabel description actorName createdAt severity')
        .lean(),
      Subscription.findOne(scope).lean(),

      Form.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Submission.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

  let totalUsers = 0;
  let endUsers = 0;
  let staff = 0;
  let activeUsers = 0;

  for (const row of userRows) {
    totalUsers += row.count;
    if (row._id.status === USER_STATUS.ACTIVE) activeUsers += row.count;
    if (row._id.role === ROLES.END_USER) endUsers += row.count;
    else staff += row.count;
  }

  const toMap = (rows) => rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  const formRaw = toMap(formRows);
  const formByStatus = {
    draft: formRaw.draft || 0,
    published: formRaw.published || 0,
    closed: formRaw.closed || 0,
  };

  const subByStatus = toMap(submissionRows);
  const countIn = (list) => list.reduce((sum, s) => sum + (subByStatus[s] || 0), 0);

  const submissionTotal = submissionRows.reduce((sum, r) => sum + r.count, 0);
  // Drafts have not been handed over, so they are not part of the review workload.
  const submittedTotal = submissionTotal - (subByStatus[SUBMISSION_STATUS.DRAFT] || 0);
  const approvedOrBeyond = countIn([
    SUBMISSION_STATUS.APPROVED,
    SUBMISSION_STATUS.IN_LOT,
    SUBMISSION_STATUS.SENT_FOR_PRINTING,
    SUBMISSION_STATUS.PRINTED,
    SUBMISSION_STATUS.COMPLETED,
  ]);

  return ok(res, {
    users: { total: totalUsers, endUsers, staff, active: activeUsers },
    structure: { categories: categoryCount, departments: departmentCount },
    forms: {
      total: formByStatus.draft + formByStatus.published + formByStatus.closed,
      published: formByStatus.published,
      draft: formByStatus.draft,
      closed: formByStatus.closed,
    },
    submissions: {
      total: submissionTotal,
      drafts: subByStatus[SUBMISSION_STATUS.DRAFT] || 0,
      pendingReview: countIn([
        SUBMISSION_STATUS.SUBMITTED,
        SUBMISSION_STATUS.RESUBMITTED,
        SUBMISSION_STATUS.UNDER_REVIEW,
      ]),
      correctionRequired: subByStatus[SUBMISSION_STATUS.CORRECTION_REQUIRED] || 0,
      approved: subByStatus[SUBMISSION_STATUS.APPROVED] || 0,
      // Of everything submitted (drafts excluded), how much has been signed off.
      completionPercent:
        submittedTotal > 0 ? Math.round((approvedOrBeyond / submittedTotal) * 100) : 0,
    },
    printing: { lots: 0, activeJobs: 0, completedJobs: 0, proofsAwaiting: 0 },
    categories,
    limits: subscription
      ? { planName: subscription.planName, ...subscription.limits }
      : null,
    recentActivity,
  });
});

module.exports = { summary };
