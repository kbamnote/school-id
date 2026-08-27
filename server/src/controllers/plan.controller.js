const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const { assertObjectId } = require('../utils/query');
const audit = require('../services/audit.service');

/** GET /api/super-admin/plans */
const list = asyncHandler(async (req, res) => {
  const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
  const plans = await Plan.find(filter).sort({ sortOrder: 1, createdAt: 1 });

  // How many clients sit on each plan - shown next to the plan in the UI.
  const counts = await Subscription.aggregate([
    { $group: { _id: '$plan', count: { $sum: 1 } } },
  ]);
  const countMap = counts.reduce((acc, c) => ({ ...acc, [String(c._id)]: c.count }), {});

  return ok(res, {
    plans: plans.map((p) => ({ ...p.toJSON(), clientCount: countMap[String(p._id)] || 0 })),
  });
});

/** POST /api/super-admin/plans */
const create = asyncHandler(async (req, res) => {
  const plan = await Plan.create(req.body);

  // Exactly one plan may be the default for new clients.
  if (plan.isDefault) {
    await Plan.updateMany({ _id: { $ne: plan._id } }, { $set: { isDefault: false } });
  }

  await audit.record(req, {
    action: audit.ACTIONS.ORG_UPDATED,
    entityType: 'Plan',
    entity: plan._id,
    entityLabel: plan.code,
    description: `Plan "${plan.name}" created`,
    organization: null,
  });

  return created(res, { plan }, 'Plan created');
});

/** PATCH /api/super-admin/plans/:id */
const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'plan id');

  const plan = await Plan.findById(req.params.id);
  if (!plan) throw ApiError.notFound('Plan not found');

  const before = plan.toObject();
  Object.assign(plan, req.body);
  await plan.save();

  if (plan.isDefault) {
    await Plan.updateMany({ _id: { $ne: plan._id } }, { $set: { isDefault: false } });
  }

  await audit.record(req, {
    action: audit.ACTIONS.ORG_UPDATED,
    entityType: 'Plan',
    entity: plan._id,
    entityLabel: plan.code,
    // Editing a plan template deliberately does NOT alter existing
    // subscriptions - their limits were copied at assignment time.
    description: `Plan "${plan.name}" updated (existing clients keep their current limits)`,
    organization: null,
    changes: audit.diff(before, plan.toObject(), ['name', 'isActive', 'isDefault']),
    severity: 'warning',
  });

  return ok(res, { plan }, 'Plan updated');
});

/**
 * DELETE /api/super-admin/plans/:id
 * Refuses while clients are on the plan - deactivate it instead, which stops
 * new assignments without disturbing anyone already subscribed.
 */
const remove = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'plan id');

  const plan = await Plan.findById(req.params.id);
  if (!plan) throw ApiError.notFound('Plan not found');

  const inUse = await Subscription.countDocuments({ plan: plan._id });
  if (inUse > 0) {
    throw ApiError.conflict(
      `${inUse} client${inUse === 1 ? ' is' : 's are'} on this plan. Deactivate it instead of deleting it.`,
      { code: 'PLAN_IN_USE', details: { clientCount: inUse } }
    );
  }

  await plan.deleteOne();

  await audit.record(req, {
    action: audit.ACTIONS.ORG_UPDATED,
    entityType: 'Plan',
    entity: plan._id,
    entityLabel: plan.code,
    description: `Plan "${plan.name}" deleted`,
    organization: null,
    severity: 'warning',
  });

  return ok(res, null, 'Plan deleted');
});

module.exports = { list, create, update, remove };
