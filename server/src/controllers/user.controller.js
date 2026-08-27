const User = require('../models/User');
const OrgCategory = require('../models/OrgCategory');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters } = require('../utils/query');
const { tenantScope, findScoped } = require('../middleware/tenant');
const userService = require('../services/user.service');
const sheetService = require('../services/sheet.service');
const audit = require('../services/audit.service');
const { ROLES, assignableRoles } = require('../constants/roles');
const { USER_STATUS } = require('../constants/workflow');

const SORTABLE = ['name', 'loginId', 'email', 'createdAt', 'lastLoginAt', 'status'];
const SEARCHABLE = ['name', 'loginId', 'email', 'phone', 'externalId'];

/** GET /api/users */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, SORTABLE);

  const filters = [tenantScope(req)];
  if (req.query.role) filters.push({ role: req.query.role });
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.orgCategory) filters.push({ orgCategory: req.query.orgCategory });
  if (req.query.department) filters.push({ department: req.query.department });
  // `staff` and `endUsers` are the two views the UI actually needs.
  if (req.query.group === 'staff') {
    filters.push({ role: { $ne: ROLES.END_USER } });
  } else if (req.query.group === 'endUsers') {
    filters.push({ role: ROLES.END_USER });
  }

  const filter = mergeFilters(...filters, buildSearch(req.query.search, SEARCHABLE));

  const [items, total] = await Promise.all([
    User.find(filter)
      .populate('orgCategory', 'name code idPrefix color')
      .populate('department', 'name kind')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/users/stats - counts for the filter chips. */
const stats = asyncHandler(async (req, res) => {
  const scope = tenantScope(req);
  const [byStatus, byRole, byCategory] = await Promise.all([
    User.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: scope }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { ...scope, orgCategory: { $ne: null } } },
      { $group: { _id: '$orgCategory', count: { $sum: 1 } } },
    ]),
  ]);

  const statusMap = byStatus.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
  const roleMap = byRole.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});

  return ok(res, {
    total: byStatus.reduce((s, r) => s + r.count, 0),
    active: statusMap[USER_STATUS.ACTIVE] || 0,
    inactive: statusMap[USER_STATUS.INACTIVE] || 0,
    suspended: statusMap[USER_STATUS.SUSPENDED] || 0,
    endUsers: roleMap[ROLES.END_USER] || 0,
    staff: Object.entries(roleMap)
      .filter(([role]) => role !== ROLES.END_USER)
      .reduce((s, [, count]) => s + count, 0),
    byCategory: byCategory.map((r) => ({ categoryId: String(r._id), count: r.count })),
  });
});

/** GET /api/users/:id */
const getOne = asyncHandler(async (req, res) => {
  const user = await findScoped(User, req.params.id, req, {
    populate: [
      { path: 'orgCategory', select: 'name code idPrefix color' },
      { path: 'department', select: 'name kind' },
      { path: 'createdBy', select: 'name' },
    ],
  });
  return ok(res, { user });
});

/** POST /api/users */
const create = asyncHandler(async (req, res) => {
  const { user, temporaryPassword } = await userService.createUser(req.body, {
    actor: req.user,
    organizationId: req.tenantId,
  });

  await audit.record(req, {
    action: audit.ACTIONS.USER_CREATED,
    entityType: 'User',
    entity: user._id,
    entityLabel: user.loginId || user.email,
    description: `${user.name} (${user.loginId || user.email}) was added`,
    metadata: { role: user.role },
  });

  return created(
    res,
    {
      user,
      // Shown once so the administrator can hand it over; never retrievable again.
      credentials: {
        loginId: user.loginId,
        email: user.email,
        temporaryPassword,
      },
    },
    'User created'
  );
});

/** PATCH /api/users/:id */
const update = asyncHandler(async (req, res) => {
  const user = await findScoped(User, req.params.id, req);
  const before = user.toObject();

  if (req.body.role && req.body.role !== user.role) {
    userService.assertCanAssignRole(req.user, req.body.role);
    // Editing your own role is how an admin would grant themselves more.
    if (String(user._id) === String(req.user._id)) {
      throw ApiError.forbidden('You cannot change your own role.');
    }
  }

  // Category and department must belong to this tenant.
  if (req.body.orgCategory) await findScoped(OrgCategory, req.body.orgCategory, req);
  if (req.body.department) await findScoped(Department, req.body.department, req);

  if (req.body.email && req.body.email !== user.email) {
    const clash = await User.findOne({ email: req.body.email.toLowerCase() }).lean();
    if (clash) {
      throw ApiError.conflict('That email is already registered.', {
        details: [{ field: 'email', message: 'This email is already in use' }],
      });
    }
  }

  // loginId is the identity printed on cards - it is never editable.
  const { loginId, password, tokenVersion, organization, ...safe } = req.body;
  Object.assign(user, safe);
  await user.save();

  await audit.record(req, {
    action: audit.ACTIONS.USER_UPDATED,
    entityType: 'User',
    entity: user._id,
    entityLabel: user.loginId || user.email,
    description: `${user.name} was updated`,
    changes: audit.diff(before, user.toObject(), [
      'name', 'email', 'phone', 'role', 'status', 'externalId', 'orgCategory', 'department',
    ]),
  });

  return ok(res, { user }, 'User updated');
});

/** PATCH /api/users/:id/status */
const changeStatus = asyncHandler(async (req, res) => {
  const user = await findScoped(User, req.params.id, req);
  const { status } = req.body;

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.forbidden('You cannot change your own account status.');
  }
  if (user.role === ROLES.CLIENT_OWNER && req.user.role !== ROLES.CLIENT_OWNER) {
    throw ApiError.forbidden('Only an owner can change another owner account.');
  }

  const from = user.status;
  user.status = status;
  // Deactivating must end live sessions, not just block the next sign-in.
  if (status !== USER_STATUS.ACTIVE) user.tokenVersion += 1;
  await user.save();

  await audit.record(req, {
    action: audit.ACTIONS.USER_STATUS_CHANGED,
    entityType: 'User',
    entity: user._id,
    entityLabel: user.loginId || user.email,
    description: `${user.name} changed from ${from} to ${status}`,
    severity: 'warning',
    changes: [{ field: 'status', from, to: status }],
  });

  return ok(res, { user }, `User ${status}`);
});

/** POST /api/users/:id/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const user = await findScoped(User, req.params.id, req);

  if (user.role === ROLES.CLIENT_OWNER && req.user.role !== ROLES.CLIENT_OWNER) {
    throw ApiError.forbidden('Only an owner can reset another owner password.');
  }

  const temporaryPassword = await userService.resetCredentials(user);

  await audit.record(req, {
    action: audit.ACTIONS.USER_CREDENTIALS_RESET,
    entityType: 'User',
    entity: user._id,
    entityLabel: user.loginId || user.email,
    description: `Password reset for ${user.name} - all their sessions were ended`,
    severity: 'warning',
  });

  return ok(
    res,
    { credentials: { loginId: user.loginId, email: user.email, temporaryPassword } },
    'Password reset'
  );
});

/** DELETE /api/users/:id */
const remove = asyncHandler(async (req, res) => {
  const user = await findScoped(User, req.params.id, req);

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.forbidden('You cannot delete your own account.');
  }
  if (user.role === ROLES.CLIENT_OWNER) {
    throw ApiError.forbidden('An owner account cannot be deleted. Transfer ownership first.');
  }

  await user.deleteOne();

  await Promise.all([
    Organization.updateOne({ _id: req.tenantId }, { $inc: { 'stats.userCount': -1 } }),
    user.orgCategory
      ? OrgCategory.updateOne({ _id: user.orgCategory }, { $inc: { userCount: -1 } })
      : null,
    user.department ? Department.updateOne({ _id: user.department }, { $inc: { userCount: -1 } }) : null,
  ]);

  await audit.record(req, {
    action: audit.ACTIONS.USER_DELETED,
    entityType: 'User',
    entity: user._id,
    entityLabel: user.loginId || user.email,
    description: `${user.name} (${user.loginId || user.email}) was deleted`,
    severity: 'critical',
  });

  return ok(res, null, 'User deleted');
});

/** GET /api/users/assignable-roles */
const roles = asyncHandler(async (req, res) =>
  ok(res, { roles: assignableRoles(req.user.role) })
);

/* ------------------------------ bulk import ------------------------------ */

/**
 * POST /api/users/import/parse
 * Parses and validates only. Nothing is written until /import/commit.
 */
const parseImport = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Select a CSV or Excel file to import');

  const { headers, rows } = await sheetService.parseSheet(req.file);
  if (!rows.length) throw ApiError.badRequest('That file has a header row but no data.');

  const mapping =
    req.body.mapping && typeof req.body.mapping === 'string'
      ? JSON.parse(req.body.mapping)
      : userService.autoMapColumns(headers);

  const validation = await userService.validateImport(rows, mapping, req.tenantId);

  return ok(res, {
    headers,
    mapping,
    availableColumns: userService.IMPORT_COLUMNS,
    ...validation,
  });
});

/** POST /api/users/import/commit */
const commitImport = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) {
    throw ApiError.badRequest('There are no valid rows to import.');
  }

  // Re-validate server-side: the client sends back rows it was shown, and a
  // tampered payload must not be able to smuggle in a foreign category id.
  const categoryIds = [...new Set(rows.map((r) => String(r.data?.categoryId)).filter(Boolean))];
  const owned = await OrgCategory.countDocuments({
    _id: { $in: categoryIds },
    organization: req.tenantId,
  });
  if (owned !== categoryIds.length) {
    throw ApiError.forbidden('One or more categories do not belong to your organisation.');
  }

  const result = await userService.commitImport(
    rows.filter((r) => r.valid),
    { actor: req.user, organizationId: req.tenantId }
  );

  await audit.record(req, {
    action: audit.ACTIONS.USER_IMPORTED,
    entityType: 'User',
    entityLabel: `${result.count} users`,
    description: `${result.count} users imported from a spreadsheet`,
    severity: 'warning',
    metadata: { count: result.count },
  });

  return ok(res, result, `${result.count} users imported`);
});

/** GET /api/users/import/template - a sample file with the expected headers. */
const importTemplate = asyncHandler(async (req, res) => {
  const categories = await OrgCategory.find({ ...tenantScope(req), isActive: true })
    .select('name')
    .limit(3)
    .lean();
  const sampleCategory = categories[0]?.name || 'Student';

  const columns = userService.IMPORT_COLUMNS.map((c) => ({ key: c.key, header: c.label }));
  const rows = [
    {
      name: 'Ravi Kumar',
      email: 'ravi@example.com',
      phone: '9876543210',
      category: sampleCategory,
      department: 'Class 10',
      externalId: 'ADM-1024',
    },
    {
      name: 'Anita Desai',
      email: '',
      phone: '9812345678',
      category: sampleCategory,
      department: 'Class 10',
      externalId: 'ADM-1025',
    },
  ];

  const buffer = await sheetService.buildXlsx(columns, rows, 'Users');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="user-import-template.xlsx"');
  return res.send(Buffer.from(buffer));
});

/** GET /api/users/export */
const exportUsers = asyncHandler(async (req, res) => {
  const filters = [tenantScope(req)];
  if (req.query.role) filters.push({ role: req.query.role });
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.orgCategory) filters.push({ orgCategory: req.query.orgCategory });

  const users = await User.find(mergeFilters(...filters, buildSearch(req.query.search, SEARCHABLE)))
    .populate('orgCategory', 'name')
    .populate('department', 'name')
    .sort({ loginId: 1, name: 1 })
    .limit(20000)
    .lean();

  const columns = [
    { key: 'loginId', header: 'User ID' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'category', header: 'Category' },
    { key: 'department', header: 'Department' },
    { key: 'externalId', header: 'External ID' },
    { key: 'role', header: 'Role' },
    { key: 'status', header: 'Status' },
  ];

  // Passwords are never exported - they exist only as hashes.
  const rows = users.map((u) => ({
    loginId: u.loginId || '',
    name: u.name,
    email: u.email || '',
    phone: u.phone || '',
    category: u.orgCategory?.name || '',
    department: u.department?.name || '',
    externalId: u.externalId || '',
    role: u.role,
    status: u.status,
  }));

  await audit.record(req, {
    action: audit.ACTIONS.DATA_EXPORTED,
    entityType: 'User',
    entityLabel: `${rows.length} users`,
    description: `${rows.length} user records exported`,
    severity: 'warning',
  });

  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    return res.send(sheetService.buildCsv(columns, rows));
  }

  const buffer = await sheetService.buildXlsx(columns, rows, 'Users');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="users.xlsx"');
  return res.send(Buffer.from(buffer));
});

module.exports = {
  list,
  stats,
  getOne,
  create,
  update,
  changeStatus,
  resetPassword,
  remove,
  roles,
  parseImport,
  commitImport,
  importTemplate,
  exportUsers,
};
