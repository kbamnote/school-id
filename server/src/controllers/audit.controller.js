const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { ok, paginated } = require('../utils/apiResponse');
const { parsePagination, mergeFilters, buildSearch } = require('../utils/query');
const { tenantScope } = require('../middleware/tenant');
const audit = require('../services/audit.service');

/**
 * Builds the filter for one audit query.
 *
 * A client sees only their own organisation's entries; MR Print World sees
 * everything, and may narrow to one client. The tenant clause comes from
 * `tenantScope`, which reads the verified token - never from a query
 * parameter, or a client could simply ask for another client's history.
 */
function buildFilters(req, { platform }) {
  const scope = platform
    ? req.query.organization
      ? { organization: req.query.organization }
      : {}
    : tenantScope(req);

  return mergeFilters(
    scope,
    req.query.action ? { action: req.query.action } : null,
    req.query.entityType ? { entityType: req.query.entityType } : null,
    req.query.actor ? { actor: req.query.actor } : null,
    req.query.severity ? { severity: req.query.severity } : null,
    req.query.from || req.query.to
      ? {
          createdAt: {
            ...(req.query.from ? { $gte: new Date(req.query.from) } : {}),
            ...(req.query.to ? { $lte: new Date(req.query.to) } : {}),
          },
        }
      : null,
    req.query.search ? buildSearch(req.query.search, ['description', 'entityLabel', 'actorName']) : null
  );
}

/** GET /api/audit  and  GET /api/super-admin/audit */
function listFor({ platform }) {
  return asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filters = buildFilters(req, { platform });

    /*
     * The client name is only resolved for the platform view, where entries
     * from many organisations are mixed together. A client's own feed is
     * entirely their own, so the lookup would be wasted work there.
     */
    const query = AuditLog.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit);
    if (platform) query.populate('organization', 'name');

    const [items, total] = await Promise.all([
      query.lean(),
      AuditLog.countDocuments(filters),
    ]);

    return paginated(
      res,
      items.map((entry) => ({
        ...entry,
        id: String(entry._id),
        _id: undefined,
        organizationName: entry.organization?.name || null,
        organization: entry.organization?._id
          ? String(entry.organization._id)
          : entry.organization
            ? String(entry.organization)
            : null,
      })),
      { page, limit, total }
    );
  });
}

/**
 * GET /api/audit/actions - the vocabulary, for building filter menus.
 *
 * Served from the constant rather than a distinct() over the collection, so
 * the filter offers every action the system can record, not only the ones
 * that happen to have occurred already.
 */
const actions = asyncHandler(async (req, res) =>
  ok(res, {
    actions: Object.values(audit.ACTIONS)
      .map((action) => ({
        value: action,
        group: action.split('.')[0],
        label: action
          .split('.')[1]
          .replace(/_/g, ' ')
          .replace(/^\w/, (c) => c.toUpperCase()),
      }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
    severities: ['info', 'warning', 'critical'],
  })
);

module.exports = {
  listForClient: listFor({ platform: false }),
  listForPlatform: listFor({ platform: true }),
  actions,
};
