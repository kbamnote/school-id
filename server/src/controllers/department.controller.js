const Department = require('../models/Department');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters } = require('../utils/query');
const { tenantScope, findScoped, withTenant } = require('../middleware/tenant');
const audit = require('../services/audit.service');

const SORTABLE = ['name', 'code', 'kind', 'sortOrder', 'createdAt'];

/** GET /api/departments */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, SORTABLE, { sortOrder: 1, name: 1 });

  const filters = [tenantScope(req)];
  if (req.query.kind) filters.push({ kind: req.query.kind });
  if (req.query.parent) filters.push({ parent: req.query.parent });
  if (req.query.isActive !== undefined) filters.push({ isActive: req.query.isActive === 'true' });

  const filter = mergeFilters(...filters, buildSearch(req.query.search, ['name', 'code']));

  const [items, total] = await Promise.all([
    Department.find(filter).populate('parent', 'name kind').sort(sort).skip(skip).limit(limit),
    Department.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/**
 * GET /api/departments/tree
 * Nested view for pickers, so a Class > Section hierarchy reads correctly.
 */
const tree = asyncHandler(async (req, res) => {
  const all = await Department.find({ ...tenantScope(req), isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const byId = new Map(all.map((d) => [String(d._id), { ...d, id: String(d._id), children: [] }]));
  const roots = [];

  for (const node of byId.values()) {
    const parentId = node.parent ? String(node.parent) : null;
    // A node whose parent was deleted or deactivated is promoted to a root
    // rather than silently disappearing from the tree.
    if (parentId && byId.has(parentId)) byId.get(parentId).children.push(node);
    else roots.push(node);
  }

  return ok(res, { departments: roots });
});

/** GET /api/departments/:id */
const getOne = asyncHandler(async (req, res) => {
  const department = await findScoped(Department, req.params.id, req, {
    populate: { path: 'parent', select: 'name kind' },
  });
  const userCount = await User.countDocuments({ ...tenantScope(req), department: department._id });
  return ok(res, { department, userCount });
});

/** POST /api/departments */
const create = asyncHandler(async (req, res) => {
  // A parent must belong to the same tenant - findScoped enforces that.
  if (req.body.parent) {
    await findScoped(Department, req.body.parent, req);
  }

  const department = await Department.create(
    withTenant(req, { ...req.body, createdBy: req.user._id })
  );

  await audit.record(req, {
    action: audit.ACTIONS.DEPARTMENT_CREATED,
    entityType: 'Department',
    entity: department._id,
    entityLabel: department.name,
    description: `${department.kind} "${department.name}" created`,
  });

  return created(res, { department }, 'Created');
});

/** PATCH /api/departments/:id */
const update = asyncHandler(async (req, res) => {
  const department = await findScoped(Department, req.params.id, req);
  const before = department.toObject();

  if (req.body.parent) {
    if (String(req.body.parent) === String(department._id)) {
      throw ApiError.badRequest('A group cannot be its own parent.');
    }
    await findScoped(Department, req.body.parent, req);

    // Walk up the proposed chain: re-parenting under a descendant would create
    // a cycle and make the tree query loop forever.
    let cursor = await Department.findById(req.body.parent).select('parent').lean();
    let depth = 0;
    while (cursor?.parent && depth < 20) {
      if (String(cursor.parent) === String(department._id)) {
        throw ApiError.badRequest('That would create a circular hierarchy.');
      }
      // eslint-disable-next-line no-await-in-loop
      cursor = await Department.findById(cursor.parent).select('parent').lean();
      depth += 1;
    }
  }

  Object.assign(department, req.body);
  await department.save();

  await audit.record(req, {
    action: audit.ACTIONS.DEPARTMENT_UPDATED,
    entityType: 'Department',
    entity: department._id,
    entityLabel: department.name,
    description: `${department.kind} "${department.name}" updated`,
    changes: audit.diff(before, department.toObject(), ['name', 'code', 'kind', 'isActive']),
  });

  return ok(res, { department }, 'Updated');
});

/** DELETE /api/departments/:id */
const remove = asyncHandler(async (req, res) => {
  const department = await findScoped(Department, req.params.id, req);

  const [userCount, childCount] = await Promise.all([
    User.countDocuments({ ...tenantScope(req), department: department._id }),
    Department.countDocuments({ ...tenantScope(req), parent: department._id }),
  ]);

  if (userCount > 0) {
    throw ApiError.conflict(
      `${userCount} user${userCount === 1 ? ' is' : 's are'} assigned to "${department.name}". Reassign them first.`,
      { code: 'DEPARTMENT_IN_USE', details: { userCount } }
    );
  }
  if (childCount > 0) {
    throw ApiError.conflict(
      `"${department.name}" has ${childCount} group${childCount === 1 ? '' : 's'} beneath it. Remove those first.`,
      { code: 'DEPARTMENT_HAS_CHILDREN', details: { childCount } }
    );
  }

  await department.deleteOne();

  await audit.record(req, {
    action: audit.ACTIONS.DEPARTMENT_DELETED,
    entityType: 'Department',
    entity: department._id,
    entityLabel: department.name,
    description: `${department.kind} "${department.name}" deleted`,
    severity: 'warning',
  });

  return ok(res, null, 'Deleted');
});

module.exports = { list, tree, getOne, create, update, remove };
