const Organization = require('../models/Organization');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters, assertObjectId } = require('../utils/query');
const orgService = require('../services/organization.service');
const audit = require('../services/audit.service');
const { ORG_STATUS } = require('../constants/workflow');
const { ROLES } = require('../constants/roles');

const SORTABLE = ['name', 'createdAt', 'status', 'stats.userCount'];
const SEARCHABLE = ['name', 'slug', 'contact.personName', 'contact.email', 'contact.phone', 'gstNumber'];

/**
 * GET /api/super-admin/organizations
 * Server-side search, filter, sort and pagination - the list is never loaded
 * into the browser in full.
 */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, SORTABLE);

  const filters = [];
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.type) filters.push({ type: req.query.type });
  if (req.query.planCode) {
    const subs = await Subscription.find({ planCode: req.query.planCode })
      .select('organization')
      .lean();
    filters.push({ _id: { $in: subs.map((s) => s.organization) } });
  }

  const search = buildSearch(req.query.search, SEARCHABLE);
  const filter = mergeFilters(...filters, search);

  const [items, total] = await Promise.all([
    Organization.find(filter)
      .select('-internalNotes')
      .populate('subscription', 'planName planCode status limits')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Organization.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/super-admin/organizations/stats - counts for the filter chips. */
const listStats = asyncHandler(async (req, res) => {
  const rows = await Organization.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  return ok(res, {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    active: byStatus[ORG_STATUS.ACTIVE] || 0,
    suspended: byStatus[ORG_STATUS.SUSPENDED] || 0,
    archived: byStatus[ORG_STATUS.ARCHIVED] || 0,
  });
});

/** GET /api/super-admin/organizations/:id */
const getOne = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'organization id');

  const organization = await Organization.findById(req.params.id).populate(
    'subscription',
    'plan planName planCode status limits features expiresAt overrideNote'
  );
  if (!organization) throw ApiError.notFound('Client not found');

  const [usage, admins] = await Promise.all([
    orgService.getUsage(organization._id),
    User.find({
      organization: organization._id,
      role: { $in: [ROLES.CLIENT_OWNER, ROLES.CLIENT_ADMIN] },
    })
      .select('name email phone role status lastLoginAt mustChangePassword')
      .sort({ role: 1, createdAt: 1 }),
  ]);

  return ok(res, { organization, usage, admins });
});

/**
 * POST /api/super-admin/organizations
 * Creates the client, its subscription and its first owner in one transaction.
 */
const create = asyncHandler(async (req, res) => {
  const { admin, planId, limitOverrides, featureOverrides, ...orgPayload } = req.body;

  const result = await orgService.createOrganization(orgPayload, {
    actor: req.user,
    adminPayload: admin,
    planId,
    overrides: {
      ...(limitOverrides ? { limits: limitOverrides } : {}),
      ...(featureOverrides ? { features: featureOverrides } : {}),
    },
  });

  await audit.record(req, {
    action: audit.ACTIONS.ORG_CREATED,
    entityType: 'Organization',
    entity: result.organization._id,
    entityLabel: result.organization.name,
    description: `Client "${result.organization.name}" was created`,
    organization: result.organization._id,
    metadata: { planCode: result.subscription.planCode, adminCreated: Boolean(result.admin) },
  });

  return created(
    res,
    {
      organization: result.organization,
      subscription: result.subscription,
      admin: result.admin
        ? {
            id: result.admin._id,
            name: result.admin.name,
            email: result.admin.email,
            role: result.admin.role,
          }
        : null,
      /**
       * Returned exactly once, at creation, so the operator can hand it over.
       * It is never stored in readable form and never retrievable again.
       */
      temporaryPassword: result.temporaryPassword,
    },
    'Client created successfully'
  );
});

/** PATCH /api/super-admin/organizations/:id */
const update = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'organization id');

  const organization = await Organization.findById(req.params.id);
  if (!organization) throw ApiError.notFound('Client not found');

  const before = organization.toObject();
  Object.assign(organization, req.body);
  await organization.save();

  const changes = audit.diff(before, organization.toObject(), [
    'name', 'type', 'gstNumber', 'internalNotes',
  ]);

  await audit.record(req, {
    action: audit.ACTIONS.ORG_UPDATED,
    entityType: 'Organization',
    entity: organization._id,
    entityLabel: organization.name,
    description: `Client "${organization.name}" was updated`,
    organization: organization._id,
    changes,
  });

  return ok(res, { organization }, 'Client updated');
});

/**
 * PATCH /api/super-admin/organizations/:id/status
 * Suspending a client immediately locks out every one of its users - the check
 * runs on every request, not just at sign-in.
 */
const changeStatus = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'organization id');
  const { status, reason } = req.body;

  const organization = await Organization.findById(req.params.id);
  if (!organization) throw ApiError.notFound('Client not found');

  if (organization.status === status) {
    return ok(res, { organization }, 'No change - the client is already in that state');
  }

  const from = organization.status;
  await orgService.setStatus(organization, status, { reason });

  const ACTION = {
    [ORG_STATUS.ACTIVE]: audit.ACTIONS.ORG_ACTIVATED,
    [ORG_STATUS.SUSPENDED]: audit.ACTIONS.ORG_SUSPENDED,
    [ORG_STATUS.ARCHIVED]: audit.ACTIONS.ORG_ARCHIVED,
  };

  await audit.record(req, {
    action: ACTION[status],
    entityType: 'Organization',
    entity: organization._id,
    entityLabel: organization.name,
    description: `Client "${organization.name}" changed from ${from} to ${status}`,
    organization: organization._id,
    severity: status === ORG_STATUS.ACTIVE ? 'info' : 'critical',
    changes: [{ field: 'status', from, to: status }],
    metadata: { reason: reason || null },
  });

  return ok(res, { organization }, `Client ${status}`);
});

/** PUT /api/super-admin/organizations/:id/subscription */
const updateSubscription = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'organization id');
  const { planId, limits, features, expiresAt, note } = req.body;

  const organization = await Organization.findById(req.params.id);
  if (!organization) throw ApiError.notFound('Client not found');

  const subscription = await orgService.assignPlan(organization._id, planId, {
    actorId: req.user._id,
    overrides: { limits, features, expiresAt, note },
  });

  organization.subscription = subscription._id;
  await organization.save();

  await audit.record(req, {
    action: audit.ACTIONS.ORG_UPDATED,
    entityType: 'Subscription',
    entity: subscription._id,
    entityLabel: organization.name,
    description: `Subscription for "${organization.name}" set to ${subscription.planName}`,
    organization: organization._id,
    severity: 'warning',
    metadata: { planCode: subscription.planCode, limits: subscription.limits },
  });

  return ok(res, { subscription }, 'Subscription updated');
});

/** POST /api/super-admin/organizations/:id/logo */
const uploadLogo = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'organization id');
  if (!req.file) throw ApiError.badRequest('Select a logo image to upload');

  const organization = await Organization.findById(req.params.id);
  if (!organization) throw ApiError.notFound('Client not found');

  await orgService.replaceLogo(organization, req.file, req.user._id);

  return ok(res, { logo: organization.logo }, 'Logo updated');
});

module.exports = {
  list,
  listStats,
  getOne,
  create,
  update,
  changeStatus,
  updateSubscription,
  uploadLogo,
};
