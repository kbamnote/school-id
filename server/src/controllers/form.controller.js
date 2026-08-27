const Form = require('../models/Form');
const FormAssignment = require('../models/FormAssignment');
const OrgCategory = require('../models/OrgCategory');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters } = require('../utils/query');
const { tenantScope, findScoped, withTenant } = require('../middleware/tenant');
const formService = require('../services/form.service');
const orgService = require('../services/organization.service');
const audit = require('../services/audit.service');
const { randomToken } = require('../utils/strings');
const {
  FIELD_DEFINITIONS,
  FIELD_GROUPS,
  FIELD_LIBRARY,
  isDataBearing,
} = require('../constants/fieldTypes');

const SORTABLE = ['title', 'status', 'createdAt', 'updatedAt', 'stats.submissionCount'];

/** GET /api/forms/field-types - the builder palette. */
const fieldTypes = asyncHandler(async (req, res) =>
  ok(res, {
    types: Object.values(FIELD_DEFINITIONS),
    groups: FIELD_GROUPS,
    library: FIELD_LIBRARY,
  })
);

/** GET /api/forms */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, SORTABLE, { updatedAt: -1 });

  const filters = [tenantScope(req)];
  if (req.query.status) filters.push({ status: req.query.status });
  if (req.query.productType) filters.push({ productType: req.query.productType });

  const filter = mergeFilters(...filters, buildSearch(req.query.search, ['title', 'description']));

  const [items, total] = await Promise.all([
    Form.find(filter)
      .select('-fields') // the list never needs the full field definitions
      .populate('createdBy', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Form.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/forms/:id */
const getOne = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req, {
    populate: { path: 'createdBy', select: 'name' },
  });

  const [assignments, assignedCount] = await Promise.all([
    FormAssignment.find({ form: form._id, organization: req.tenantId })
      .populate('orgCategory', 'name code color')
      .populate('department', 'name kind')
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 }),
    formService.resolveAssignedUsers(form._id, req.tenantId, { countOnly: true }),
  ]);

  return ok(res, {
    form,
    assignments: assignments.map((a) => ({ ...a.toJSON(), description: a.describe() })),
    assignedCount,
    publicUrl: form.allowPublicLink
      ? `/f/${req.user.organization.slug}/${form.slug}?t=${form.linkToken}`
      : null,
  });
});

/** POST /api/forms */
const create = asyncHandler(async (req, res) => {
  const currentCount = await Form.countDocuments(tenantScope(req));
  await orgService.assertWithinLimit(req.tenantId, 'maxForms', currentCount);

  const slug = await Form.generateSlug(req.tenantId, req.body.title);
  const fields = formService.normaliseFields(req.body.fields || []);
  formService.assertValidDuplicateKeys(fields, req.body.duplicateCheckFields);

  const form = await Form.create(
    withTenant(req, {
      ...req.body,
      slug,
      fields,
      status: 'draft',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    })
  );

  await Organization.updateOne({ _id: req.tenantId }, { $inc: { 'stats.formCount': 1 } });

  await audit.record(req, {
    action: audit.ACTIONS.FORM_CREATED,
    entityType: 'Form',
    entity: form._id,
    entityLabel: form.title,
    description: `Form "${form.title}" created with ${fields.length} fields`,
  });

  return created(res, { form }, 'Form created');
});

/**
 * PATCH /api/forms/:id
 *
 * Once a form has submissions, field keys and types are frozen and removed
 * fields are archived rather than deleted - see form.service. Editing the
 * structure underneath collected answers is how print data silently rots.
 */
const update = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req);
  const before = form.toObject();

  if (req.body.title && req.body.title !== form.title) {
    form.slug = await Form.generateSlug(req.tenantId, req.body.title, form._id);
  }

  if (req.body.fields) {
    const hasSubmissions = form.stats.submissionCount > 0;
    form.fields = hasSubmissions
      ? formService.mergeFieldsPreservingData(form.fields, req.body.fields)
      : formService.normaliseFields(req.body.fields);
  }

  if (req.body.duplicateCheckFields) {
    formService.assertValidDuplicateKeys(form.fields, req.body.duplicateCheckFields);
  }

  const { fields, slug, status, linkToken, stats, organization, ...safe } = req.body;
  Object.assign(form, safe);
  form.updatedBy = req.user._id;
  await form.save();

  await audit.record(req, {
    action: audit.ACTIONS.FORM_UPDATED,
    entityType: 'Form',
    entity: form._id,
    entityLabel: form.title,
    description: `Form "${form.title}" updated`,
    changes: audit.diff(before, form.toObject(), ['title', 'description', 'productType']),
    metadata: { fieldCount: form.fields.filter((f) => !f.archived).length },
  });

  return ok(res, { form }, 'Form saved');
});

/** PATCH /api/forms/:id/status - publish, close or return to draft. */
const changeStatus = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req);
  const { status } = req.body;
  const from = form.status;

  if (status === 'published') {
    const dataFields = form.fields.filter((f) => !f.archived && isDataBearing(f.type));
    if (!dataFields.length) {
      throw ApiError.badRequest(
        'Add at least one field that collects data before publishing this form.',
        { code: 'FORM_HAS_NO_FIELDS' }
      );
    }
    form.publishedAt = form.publishedAt || new Date();
    form.closedAt = null;
  }

  if (status === 'closed') form.closedAt = new Date();
  // Returning a live form to draft would strand anyone mid-submission.
  if (status === 'draft' && form.stats.submissionCount > 0) {
    throw ApiError.conflict(
      'This form already has submissions and cannot be returned to draft. Close it instead.',
      { code: 'FORM_HAS_SUBMISSIONS' }
    );
  }

  form.status = status;
  form.updatedBy = req.user._id;
  await form.save();

  await audit.record(req, {
    action: status === 'published' ? audit.ACTIONS.FORM_PUBLISHED : audit.ACTIONS.FORM_CLOSED,
    entityType: 'Form',
    entity: form._id,
    entityLabel: form.title,
    description: `Form "${form.title}" moved from ${from} to ${status}`,
    severity: 'warning',
    changes: [{ field: 'status', from, to: status }],
  });

  return ok(res, { form }, `Form ${status}`);
});

/** POST /api/forms/:id/duplicate */
const duplicate = asyncHandler(async (req, res) => {
  const source = await findScoped(Form, req.params.id, req);

  const currentCount = await Form.countDocuments(tenantScope(req));
  await orgService.assertWithinLimit(req.tenantId, 'maxForms', currentCount);

  const title = `${source.title} (copy)`;
  const copy = await Form.create({
    organization: req.tenantId,
    title,
    slug: await Form.generateSlug(req.tenantId, title),
    description: source.description,
    productType: source.productType,
    // Archived fields are not carried over - the copy starts clean.
    fields: source.fields.filter((f) => !f.archived).map((f) => f.toObject()),
    settings: source.settings,
    duplicateCheckFields: source.duplicateCheckFields,
    status: 'draft',
    linkToken: randomToken(16),
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await Organization.updateOne({ _id: req.tenantId }, { $inc: { 'stats.formCount': 1 } });

  await audit.record(req, {
    action: audit.ACTIONS.FORM_CREATED,
    entityType: 'Form',
    entity: copy._id,
    entityLabel: copy.title,
    description: `Form "${copy.title}" duplicated from "${source.title}"`,
  });

  return created(res, { form: copy }, 'Form duplicated');
});

/** DELETE /api/forms/:id */
const remove = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req);

  // Deleting a form with submissions would strand the collected data.
  if (form.stats.submissionCount > 0) {
    throw ApiError.conflict(
      `"${form.title}" has ${form.stats.submissionCount} submissions and cannot be deleted. Close it instead.`,
      { code: 'FORM_HAS_SUBMISSIONS', details: { submissions: form.stats.submissionCount } }
    );
  }

  await FormAssignment.deleteMany({ form: form._id, organization: req.tenantId });
  await form.deleteOne();
  await Organization.updateOne({ _id: req.tenantId }, { $inc: { 'stats.formCount': -1 } });

  await audit.record(req, {
    action: audit.ACTIONS.FORM_DELETED,
    entityType: 'Form',
    entity: form._id,
    entityLabel: form.title,
    description: `Form "${form.title}" deleted`,
    severity: 'critical',
  });

  return ok(res, null, 'Form deleted');
});

/** POST /api/forms/:id/link - enable, disable or rotate the public link. */
const manageLink = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req);
  const { action } = req.body;

  if (action === 'enable') form.allowPublicLink = true;
  if (action === 'disable') form.allowPublicLink = false;
  if (action === 'rotate') {
    // Every previously shared URL stops working immediately.
    form.linkToken = randomToken(16);
    form.allowPublicLink = true;
  }
  await form.save();

  await audit.record(req, {
    action: audit.ACTIONS.FORM_UPDATED,
    entityType: 'Form',
    entity: form._id,
    entityLabel: form.title,
    description: `Public link ${action}d for "${form.title}"`,
    severity: 'warning',
  });

  return ok(
    res,
    {
      allowPublicLink: form.allowPublicLink,
      publicUrl: form.allowPublicLink
        ? `/f/${req.user.organization.slug}/${form.slug}?t=${form.linkToken}`
        : null,
    },
    'Link updated'
  );
});

/* ----------------------------- assignments ------------------------------- */

/** POST /api/forms/:id/assignments */
const assign = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req);
  const { scope, orgCategory, department, users, dueDate, notifyOnAssign } = req.body;

  // Each referenced entity must belong to this tenant.
  if (scope === 'category') {
    if (!orgCategory) throw ApiError.badRequest('Select a category.');
    await findScoped(OrgCategory, orgCategory, req);
  }
  if (scope === 'department') {
    if (!department) throw ApiError.badRequest('Select a department.');
    await findScoped(Department, department, req);
  }
  if (scope === 'users') {
    if (!users?.length) throw ApiError.badRequest('Select at least one user.');
    const User = require('../models/User');
    const owned = await User.countDocuments({ _id: { $in: users }, organization: req.tenantId });
    if (owned !== users.length) {
      throw ApiError.forbidden('One or more selected users do not belong to your organisation.');
    }
  }

  const assignment = await FormAssignment.create({
    organization: req.tenantId,
    form: form._id,
    scope,
    orgCategory: scope === 'category' ? orgCategory : null,
    department: scope === 'department' ? department : null,
    users: scope === 'users' ? users : [],
    dueDate: dueDate || null,
    notifyOnAssign: notifyOnAssign !== false,
    assignedBy: req.user._id,
  });

  const assignedCount = await formService.resolveAssignedUsers(form._id, req.tenantId, {
    countOnly: true,
  });
  form.stats.assignedCount = assignedCount;
  await form.save();

  await audit.record(req, {
    action: audit.ACTIONS.FORM_ASSIGNED,
    entityType: 'Form',
    entity: form._id,
    entityLabel: form.title,
    description: `"${form.title}" assigned to ${assignment.describe()}`,
    metadata: { scope, assignedCount },
  });

  return created(res, { assignment, assignedCount }, 'Form assigned');
});

/** DELETE /api/forms/:id/assignments/:assignmentId */
const unassign = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req);

  const assignment = await FormAssignment.findOne({
    _id: req.params.assignmentId,
    form: form._id,
    organization: req.tenantId,
  });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  const description = assignment.describe();
  await assignment.deleteOne();

  const assignedCount = await formService.resolveAssignedUsers(form._id, req.tenantId, {
    countOnly: true,
  });
  form.stats.assignedCount = assignedCount;
  await form.save();

  await audit.record(req, {
    action: audit.ACTIONS.FORM_ASSIGNED,
    entityType: 'Form',
    entity: form._id,
    entityLabel: form.title,
    description: `"${form.title}" unassigned from ${description}`,
    severity: 'warning',
  });

  return ok(res, { assignedCount }, 'Assignment removed');
});

/** GET /api/forms/:id/assignees - who this form currently resolves to. */
const assignees = asyncHandler(async (req, res) => {
  const form = await findScoped(Form, req.params.id, req);
  const { page, limit, skip } = parsePagination(req.query);

  const users = await formService.resolveAssignedUsers(form._id, req.tenantId, {
    select: 'name loginId email orgCategory department',
  });

  const populated = await Promise.all(
    users.slice(skip, skip + limit).map(async (u) => u.populate([
      { path: 'orgCategory', select: 'name' },
      { path: 'department', select: 'name' },
    ]))
  );

  return paginated(res, populated, { page, limit, total: users.length });
});

module.exports = {
  fieldTypes,
  list,
  getOne,
  create,
  update,
  changeStatus,
  duplicate,
  remove,
  manageLink,
  assign,
  unassign,
  assignees,
};
