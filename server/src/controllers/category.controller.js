const OrgCategory = require('../models/OrgCategory');
const User = require('../models/User');
const Counter = require('../models/Counter');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters } = require('../utils/query');
const { tenantScope, findScoped, withTenant } = require('../middleware/tenant');
const orgService = require('../services/organization.service');
const audit = require('../services/audit.service');
const { padSequence } = require('../utils/strings');

const SORTABLE = ['name', 'code', 'sortOrder', 'createdAt', 'userCount'];

/**
 * GET /api/categories
 *
 * Every query here is force-scoped to the caller's tenant by `tenantScope`.
 * A client cannot widen it, because any organisation id they send was already
 * stripped from the request before this ran.
 */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, SORTABLE, { sortOrder: 1, name: 1 });

  const filters = [tenantScope(req)];
  if (req.query.isActive !== undefined) filters.push({ isActive: req.query.isActive === 'true' });

  const filter = mergeFilters(...filters, buildSearch(req.query.search, ['name', 'code', 'idPrefix']));

  const [items, total] = await Promise.all([
    OrgCategory.find(filter).sort(sort).skip(skip).limit(limit),
    OrgCategory.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/categories/:id */
const getOne = asyncHandler(async (req, res) => {
  const category = await findScoped(OrgCategory, req.params.id, req);

  // The counter is the source of truth for the next ID, not the user count -
  // deleting a user must never cause an ID to be reissued.
  const counter = await Counter.findOne({
    key: `user:${category.organization}:${category._id}`,
  }).lean();
  const nextSeq = (counter?.seq || 0) + 1;

  return ok(res, {
    category,
    nextLoginId: padSequence(category.idPrefix, nextSeq, category.idPadding),
    issuedCount: counter?.seq || 0,
  });
});

/** POST /api/categories */
const create = asyncHandler(async (req, res) => {
  const currentCount = await OrgCategory.countDocuments(tenantScope(req));
  await orgService.assertWithinLimit(req.tenantId, 'maxCategories', currentCount);

  const category = await OrgCategory.create(
    withTenant(req, { ...req.body, createdBy: req.user._id })
  );

  await audit.record(req, {
    action: audit.ACTIONS.CATEGORY_CREATED,
    entityType: 'OrgCategory',
    entity: category._id,
    entityLabel: category.code,
    description: `Category "${category.name}" created with ID prefix ${category.idPrefix}`,
  });

  return created(res, { category }, 'Category created');
});

/**
 * PATCH /api/categories/:id
 *
 * `idPrefix` and `idPadding` are locked once IDs have been issued: changing
 * them would make already-printed cards disagree with the database.
 */
const update = asyncHandler(async (req, res) => {
  const category = await findScoped(OrgCategory, req.params.id, req);
  const before = category.toObject();

  const changingIdFormat =
    (req.body.idPrefix && req.body.idPrefix !== category.idPrefix) ||
    (req.body.idPadding && req.body.idPadding !== category.idPadding);

  if (changingIdFormat) {
    const counter = await Counter.findOne({
      key: `user:${category.organization}:${category._id}`,
    }).lean();
    if (counter?.seq > 0) {
      throw ApiError.conflict(
        `The ID format cannot be changed - ${counter.seq} ID${counter.seq === 1 ? ' has' : 's have'} already been issued in this category. Create a new category instead.`,
        { code: 'ID_FORMAT_LOCKED', details: { issued: counter.seq } }
      );
    }
  }

  Object.assign(category, req.body);
  await category.save();

  await audit.record(req, {
    action: audit.ACTIONS.CATEGORY_UPDATED,
    entityType: 'OrgCategory',
    entity: category._id,
    entityLabel: category.code,
    description: `Category "${category.name}" updated`,
    changes: audit.diff(before, category.toObject(), ['name', 'code', 'idPrefix', 'isActive']),
  });

  return ok(res, { category }, 'Category updated');
});

/**
 * DELETE /api/categories/:id
 * Refuses while users are assigned - deactivating keeps the history intact.
 */
const remove = asyncHandler(async (req, res) => {
  const category = await findScoped(OrgCategory, req.params.id, req);

  const inUse = await User.countDocuments({ ...tenantScope(req), orgCategory: category._id });
  if (inUse > 0) {
    throw ApiError.conflict(
      `${inUse} user${inUse === 1 ? ' is' : 's are'} assigned to "${category.name}". Deactivate the category instead of deleting it.`,
      { code: 'CATEGORY_IN_USE', details: { userCount: inUse } }
    );
  }

  await category.deleteOne();

  await audit.record(req, {
    action: audit.ACTIONS.CATEGORY_DELETED,
    entityType: 'OrgCategory',
    entity: category._id,
    entityLabel: category.code,
    description: `Category "${category.name}" deleted`,
    severity: 'warning',
  });

  return ok(res, null, 'Category deleted');
});

module.exports = { list, getOne, create, update, remove };
