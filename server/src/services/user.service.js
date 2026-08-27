const User = require('../models/User');
const OrgCategory = require('../models/OrgCategory');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const ApiError = require('../utils/ApiError');
const { ROLES, assignableRoles } = require('../constants/roles');
const { USER_STATUS } = require('../constants/workflow');
const { generatePassword } = require('../utils/strings');
const orgService = require('./organization.service');

/**
 * Guards role assignment.
 *
 * Without this a client admin could create a CLIENT_OWNER - or worse a
 * SUPER_ADMIN - and escalate straight out of their own tenant.
 */
function assertCanAssignRole(actor, role) {
  const allowed = assignableRoles(actor.role);
  if (!allowed.includes(role)) {
    throw ApiError.forbidden(`Your role cannot create a ${role} account.`, {
      code: 'ROLE_NOT_ASSIGNABLE',
      details: { allowed },
    });
  }
}

/** Confirms a category/department belongs to this tenant before it is attached. */
async function resolveReferences(organizationId, { orgCategory, department }) {
  const result = {};

  if (orgCategory) {
    const category = await OrgCategory.findOne({ _id: orgCategory, organization: organizationId });
    if (!category) throw ApiError.badRequest('That category does not exist in your organisation.');
    result.category = category;
  }

  if (department) {
    const dept = await Department.findOne({ _id: department, organization: organizationId });
    if (!dept) throw ApiError.badRequest('That department does not exist in your organisation.');
    result.department = dept;
  }

  return result;
}

/**
 * Creates one user.
 *
 * End users get a generated login ID from their category's counter
 * (STU00001). Staff sign in with email. The temporary password is returned to
 * the caller once and never persisted in readable form.
 */
async function createUser(payload, { actor, organizationId }) {
  const role = payload.role || ROLES.END_USER;
  assertCanAssignRole(actor, role);

  const { category, department } = await resolveReferences(organizationId, payload);

  if (role === ROLES.END_USER) {
    if (!category) {
      throw ApiError.badRequest('Select a category for this user - it determines their ID.', {
        details: [{ field: 'orgCategory', message: 'Category is required' }],
      });
    }
    const currentCount = await User.countDocuments({ organization: organizationId, role: ROLES.END_USER });
    await orgService.assertWithinLimit(organizationId, 'maxUsers', currentCount);
  } else {
    const currentCount = await User.countDocuments({
      organization: organizationId,
      role: { $in: [ROLES.CLIENT_OWNER, ROLES.CLIENT_ADMIN, ROLES.CLIENT_REVIEWER, ROLES.CLIENT_STAFF] },
    });
    await orgService.assertWithinLimit(organizationId, 'maxAdmins', currentCount);

    if (!payload.email) {
      throw ApiError.badRequest('Staff accounts need an email address to sign in with.', {
        details: [{ field: 'email', message: 'Email is required for staff accounts' }],
      });
    }
  }

  if (payload.email) {
    const clash = await User.findOne({ email: payload.email.toLowerCase() }).lean();
    if (clash) {
      throw ApiError.conflict('That email is already registered.', {
        details: [{ field: 'email', message: 'This email is already in use' }],
      });
    }
  }

  const loginId = category ? await category.nextLoginId() : null;
  const password = payload.password || generatePassword(10);

  const user = await User.create({
    organization: organizationId,
    name: payload.name,
    email: payload.email ? payload.email.toLowerCase() : null,
    phone: payload.phone || '',
    loginId,
    password,
    role,
    orgCategory: category?._id || null,
    department: department?._id || null,
    externalId: payload.externalId || '',
    status: USER_STATUS.ACTIVE,
    mustChangePassword: true,
    notes: payload.notes || '',
    createdBy: actor._id,
  });

  await Promise.all([
    Organization.updateOne({ _id: organizationId }, { $inc: { 'stats.userCount': 1 } }),
    category ? OrgCategory.updateOne({ _id: category._id }, { $inc: { userCount: 1 } }) : null,
    department ? Department.updateOne({ _id: department._id }, { $inc: { userCount: 1 } }) : null,
  ]);

  return { user, temporaryPassword: password };
}

/**
 * Issues a fresh password for an existing user.
 * Bumping tokenVersion signs them out of every active session immediately.
 */
async function resetCredentials(user) {
  const password = generatePassword(10);
  user.password = password;
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();
  return password;
}

/* ------------------------------ bulk import ------------------------------ */

const IMPORT_COLUMNS = [
  { key: 'name', label: 'Name', required: true, aliases: ['full name', 'student name', 'employee name', 'fullname'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email id', 'e-mail', 'mail'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['mobile', 'contact', 'contact no', 'mobile no', 'phone no'] },
  { key: 'category', label: 'Category', required: true, aliases: ['role', 'type', 'user type'] },
  { key: 'department', label: 'Department', required: false, aliases: ['class', 'section', 'branch', 'group'] },
  { key: 'externalId', label: 'External ID', required: false, aliases: ['admission no', 'employee id', 'roll no', 'admission number', 'emp id'] },
];

/** Loose header matching so "Admission No" maps to externalId without manual work. */
function autoMapColumns(headers) {
  const mapping = {};
  const normalise = (s) => String(s || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');

  for (const header of headers) {
    const key = normalise(header);
    const match = IMPORT_COLUMNS.find(
      (col) => normalise(col.key) === key || normalise(col.label) === key || col.aliases.includes(key)
    );
    if (match && !Object.values(mapping).includes(match.key)) {
      mapping[header] = match.key;
    }
  }
  return mapping;
}

/**
 * Validates rows without writing anything.
 *
 * Import is deliberately two-phase: the client sees exactly what will happen -
 * which rows are valid, which are duplicates, which are broken - before a
 * single record is created. Blind bulk inserts are how databases get poisoned.
 */
async function validateImport(rows, mapping, organizationId) {
  const [categories, departments] = await Promise.all([
    OrgCategory.find({ organization: organizationId }).lean(),
    Department.find({ organization: organizationId }).lean(),
  ]);

  const categoryByName = new Map();
  for (const c of categories) {
    categoryByName.set(c.name.toLowerCase(), c);
    categoryByName.set(c.code.toLowerCase(), c);
  }
  const departmentByName = new Map();
  for (const d of departments) {
    departmentByName.set(d.name.toLowerCase(), d);
    if (d.code) departmentByName.set(d.code.toLowerCase(), d);
  }

  // Pre-load the emails present in this batch so duplicates are caught in one
  // query rather than one per row.
  const emailsInFile = rows
    .map((r) => String(r[Object.keys(mapping).find((k) => mapping[k] === 'email')] || '').trim().toLowerCase())
    .filter(Boolean);
  const existingEmails = new Set(
    (await User.find({ email: { $in: emailsInFile } }).select('email').lean()).map((u) => u.email)
  );

  const seenEmails = new Set();
  const results = [];

  rows.forEach((row, index) => {
    const mapped = {};
    for (const [header, key] of Object.entries(mapping)) {
      const raw = row[header];
      // Collapse ALL internal whitespace, not just the ends. A spreadsheet cell
      // can legitimately contain a newline, and a name carrying one breaks the
      // layout of anything it is later printed onto.
      mapped[key] = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : raw;
    }

    const errors = [];
    const warnings = [];

    if (!mapped.name) errors.push('Name is missing');

    let category = null;
    if (!mapped.category) {
      errors.push('Category is missing');
    } else {
      category = categoryByName.get(String(mapped.category).toLowerCase());
      if (!category) errors.push(`Category "${mapped.category}" does not exist`);
    }

    let department = null;
    if (mapped.department) {
      department = departmentByName.get(String(mapped.department).toLowerCase());
      if (!department) warnings.push(`Department "${mapped.department}" not found - will be left blank`);
    }

    if (mapped.email) {
      const email = String(mapped.email).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errors.push(`"${mapped.email}" is not a valid email`);
      } else if (existingEmails.has(email)) {
        errors.push(`${email} is already registered`);
      } else if (seenEmails.has(email)) {
        errors.push(`${email} appears more than once in this file`);
      } else {
        seenEmails.add(email);
      }
    }

    if (mapped.phone && !/^[0-9+\-\s()]{6,20}$/.test(String(mapped.phone))) {
      warnings.push(`"${mapped.phone}" does not look like a phone number`);
    }

    results.push({
      // 1-based, and +1 again for the header row, so it matches what the
      // operator sees in Excel.
      rowNumber: index + 2,
      data: {
        name: mapped.name || '',
        email: mapped.email || '',
        phone: mapped.phone || '',
        externalId: mapped.externalId || '',
        categoryId: category?._id || null,
        categoryName: category?.name || mapped.category || '',
        departmentId: department?._id || null,
        // Only the RESOLVED name. An unmatched value is reported in `warnings`
        // and must not appear here, or the preview and the credential slip
        // would claim a department the user was never actually assigned to.
        departmentName: department?.name || '',
        departmentInput: mapped.department || '',
      },
      errors,
      warnings,
      valid: errors.length === 0,
    });
  });

  return {
    rows: results,
    summary: {
      total: results.length,
      valid: results.filter((r) => r.valid).length,
      invalid: results.filter((r) => !r.valid).length,
      warnings: results.filter((r) => r.warnings.length).length,
    },
  };
}

/**
 * Commits validated rows.
 *
 * IDs are reserved per category as one contiguous block, so a concurrent
 * import cannot interleave and hand out the same number twice.
 */
async function commitImport(validRows, { actor, organizationId }) {
  const currentCount = await User.countDocuments({ organization: organizationId, role: ROLES.END_USER });
  await orgService.assertWithinLimit(organizationId, 'maxUsers', currentCount, validRows.length);

  const byCategory = new Map();
  for (const row of validRows) {
    const key = String(row.data.categoryId);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(row);
  }

  const categories = await OrgCategory.find({
    _id: { $in: [...byCategory.keys()] },
    organization: organizationId,
  });

  const docs = [];
  const credentials = [];

  for (const category of categories) {
    const group = byCategory.get(String(category._id)) || [];
    // eslint-disable-next-line no-await-in-loop
    const loginIds = await category.nextLoginIdBlock(group.length);

    group.forEach((row, i) => {
      const password = generatePassword(10);
      docs.push({
        organization: organizationId,
        name: row.data.name,
        email: row.data.email ? row.data.email.toLowerCase() : null,
        phone: row.data.phone || '',
        loginId: loginIds[i],
        password,
        role: ROLES.END_USER,
        orgCategory: category._id,
        department: row.data.departmentId || null,
        externalId: row.data.externalId || '',
        status: USER_STATUS.ACTIVE,
        mustChangePassword: true,
        createdBy: actor._id,
      });
      credentials.push({
        name: row.data.name,
        loginId: loginIds[i],
        password,
        category: category.name,
        department: row.data.departmentName || '',
      });
    });
  }

  // `create` (not insertMany) so the pre-save hook hashes every password.
  const inserted = await User.create(docs);

  const categoryCounts = {};
  const departmentCounts = {};
  for (const doc of docs) {
    categoryCounts[doc.orgCategory] = (categoryCounts[doc.orgCategory] || 0) + 1;
    if (doc.department) departmentCounts[doc.department] = (departmentCounts[doc.department] || 0) + 1;
  }

  await Promise.all([
    Organization.updateOne({ _id: organizationId }, { $inc: { 'stats.userCount': inserted.length } }),
    ...Object.entries(categoryCounts).map(([id, n]) =>
      OrgCategory.updateOne({ _id: id }, { $inc: { userCount: n } })
    ),
    ...Object.entries(departmentCounts).map(([id, n]) =>
      Department.updateOne({ _id: id }, { $inc: { userCount: n } })
    ),
  ]);

  return { count: inserted.length, credentials };
}

module.exports = {
  IMPORT_COLUMNS,
  assertCanAssignRole,
  createUser,
  resetCredentials,
  autoMapColumns,
  validateImport,
  commitImport,
};
