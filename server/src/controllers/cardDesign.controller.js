const CardDesign = require('../models/CardDesign');
const Form = require('../models/Form');
const Submission = require('../models/Submission');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent, paginated } = require('../utils/apiResponse');
const { parsePagination, mergeFilters, assertObjectId } = require('../utils/query');
const { tenantScope, findScoped, withTenant } = require('../middleware/tenant');
const designService = require('../services/cardDesign.service');
const cardService = require('../services/card.service');
const uploadService = require('../services/upload.service');
const audit = require('../services/audit.service');

/** Loads the design and its form together - almost everything here needs both. */
async function loadWithForm(id, req) {
  const design = await findScoped(CardDesign, id, req);
  const form = await Form.findOne({ _id: design.form, ...tenantScope(req) });
  if (!form) throw ApiError.notFound('The form this design belongs to no longer exists');
  return { design, form };
}

/* ------------------------------- reading --------------------------------- */

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filters = mergeFilters(
    tenantScope(req),
    req.query.form ? { form: req.query.form } : null,
    req.query.status ? { status: req.query.status } : null
  );

  const [items, total] = await Promise.all([
    CardDesign.find(filters)
      .select('-elements')
      .populate('form', 'title status')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    CardDesign.countDocuments(filters),
  ]);

  return paginated(res, items, { page, limit, total });
});

const getOne = asyncHandler(async (req, res) => {
  const { design, form } = await loadWithForm(req.params.id, req);

  return ok(res, {
    design,
    fields: designService.bindableFields(form),
    warnings: designService.lint(design, form),
    form: { id: form._id, title: form.title, status: form.status },
  });
});

/* ------------------------------- writing --------------------------------- */

const create = asyncHandler(async (req, res) => {
  const form = await Form.findOne({ _id: req.body.form, ...tenantScope(req) });
  if (!form) throw ApiError.notFound('Form not found');

  const design = await CardDesign.create(
    withTenant(req, {
      ...req.body,
      elements: [],
      status: 'draft',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    })
  );

  await audit.record(req, {
    action: audit.ACTIONS.DESIGN_CREATED,
    entityType: 'CardDesign',
    entity: design._id,
    entityLabel: design.name,
    description: `Created card design "${design.name}" for form "${form.title}"`,
  });

  return created(res, { design, fields: designService.bindableFields(form) });
});

const update = asyncHandler(async (req, res) => {
  const { design, form } = await loadWithForm(req.params.id, req);
  const before = design.toObject();

  if (req.body.elements) {
    designService.assertValidFieldKeys(form, req.body.elements);
    design.elements = designService.syncFieldTypes(form, req.body.elements);
  }

  for (const key of ['name', 'widthMm', 'heightMm', 'dpi', 'orientation', 'hasBack']) {
    if (req.body[key] !== undefined) design[key] = req.body[key];
  }
  if (req.body.frontBackgroundColor !== undefined) {
    design.front.backgroundColor = req.body.frontBackgroundColor;
  }
  if (req.body.backBackgroundColor !== undefined) {
    design.back.backgroundColor = req.body.backBackgroundColor;
  }

  design.updatedBy = req.user._id;
  await design.save();

  await audit.record(req, {
    action: audit.ACTIONS.DESIGN_UPDATED,
    entityType: 'CardDesign',
    entity: design._id,
    entityLabel: design.name,
    description: `Updated card design "${design.name}"`,
    changes: audit.diff(before, design.toObject(), ['name', 'widthMm', 'heightMm', 'dpi', 'hasBack']),
  });

  return ok(res, { design, warnings: designService.lint(design, form) });
});

const setStatus = asyncHandler(async (req, res) => {
  const { design, form } = await loadWithForm(req.params.id, req);

  if (req.body.status === 'active') {
    // Activating an empty design would send blank cards to production.
    if (!design.elements.length) {
      throw ApiError.badRequest(
        'Add at least one element before activating this design.',
        { code: 'DESIGN_EMPTY' }
      );
    }
    await designService.activate(design);
  } else {
    design.status = 'draft';
    await design.save();
  }

  await audit.record(req, {
    action:
      req.body.status === 'active'
        ? audit.ACTIONS.DESIGN_ACTIVATED
        : audit.ACTIONS.DESIGN_DEACTIVATED,
    entityType: 'CardDesign',
    entity: design._id,
    entityLabel: design.name,
    description:
      req.body.status === 'active'
        ? `Activated card design "${design.name}" for form "${form.title}"`
        : `Moved card design "${design.name}" back to draft`,
    severity: 'info',
  });

  return ok(res, { design });
});

const remove = asyncHandler(async (req, res) => {
  const design = await findScoped(CardDesign, req.params.id, req);

  if (design.status === 'active') {
    throw ApiError.conflict(
      'Move this design back to draft before deleting it.',
      { code: 'DESIGN_ACTIVE' }
    );
  }

  for (const face of ['front', 'back']) {
    if (design[face]?.artwork?.publicId) {
      await uploadService.destroy(design[face].artwork.publicId);
    }
  }
  await design.deleteOne();

  await audit.record(req, {
    action: audit.ACTIONS.DESIGN_DELETED,
    entityType: 'CardDesign',
    entity: design._id,
    entityLabel: design.name,
    description: `Deleted card design "${design.name}"`,
    severity: 'warning',
  });

  return noContent(res);
});

/* ------------------------------- artwork --------------------------------- */

const uploadArtwork = asyncHandler(async (req, res) => {
  const design = await findScoped(CardDesign, req.params.id, req);
  if (!req.file) throw ApiError.badRequest('Attach the artwork image to upload.');

  const face = req.body.face === 'back' ? 'back' : 'front';

  const { upload, stored } = await uploadService.store(req.file, {
    organization: design.organization,
    kind: 'card_design',
    uploadedBy: req.user._id,
    // Not public: the artwork carries the client's branding and is only ever
    // shown to people already inside the organisation.
    isPublic: false,
    folder: `card-artwork/${design.organization}`,
  });

  // Replacing artwork removes the previous blob so storage does not accumulate.
  if (design[face]?.artwork?.publicId) {
    await uploadService.destroy(design[face].artwork.publicId);
  }

  design[face].artwork = {
    upload: upload._id,
    url: stored.url,
    publicId: stored.publicId,
    provider: stored.provider,
    width: stored.width,
    height: stored.height,
  };
  if (face === 'back') design.hasBack = true;
  design.updatedBy = req.user._id;
  await design.save();

  await audit.record(req, {
    action: audit.ACTIONS.DESIGN_ARTWORK_UPLOADED,
    entityType: 'CardDesign',
    entity: design._id,
    entityLabel: design.name,
    description: `Uploaded ${face} artwork for card design "${design.name}"`,
  });

  return ok(res, { design });
});

const removeArtwork = asyncHandler(async (req, res) => {
  const design = await findScoped(CardDesign, req.params.id, req);
  const face = req.params.face === 'back' ? 'back' : 'front';

  if (design[face]?.artwork?.publicId) {
    await uploadService.destroy(design[face].artwork.publicId);
  }
  design[face].artwork = undefined;
  design.updatedBy = req.user._id;
  await design.save();

  return ok(res, { design });
});

/* ------------------------------- preview --------------------------------- */

/**
 * GET /api/card-designs/:id/preview
 *
 * Renders the card exactly as it will print, using a real record when one is
 * named and placeholder values otherwise. This is the check that matters
 * before a lot goes to production: the browser preview is an approximation of
 * the layout, but this is the renderer that actually produces the files.
 */
const preview = asyncHandler(async (req, res) => {
  const { design, form } = await loadWithForm(req.params.id, req);
  const face = req.query.face === 'back' ? 'back' : 'front';

  let values = {};
  let files = {};

  if (req.query.submission) {
    assertObjectId(req.query.submission, 'submission id');
    const submission = await Submission.findOne({
      _id: req.query.submission,
      ...tenantScope(req),
    });
    if (!submission) throw ApiError.notFound('Submission not found');

    values = {
      ...(submission.data || {}),
      loginId: submission.userLoginId || '',
      name: submission.userName || '',
    };
    files =
      submission.files instanceof Map
        ? Object.fromEntries(submission.files)
        : submission.files || {};
  } else {
    // Sample values, so an unfinished design still shows its shape.
    for (const field of designService.bindableFields(form)) {
      if (field.type === 'photo' || field.type === 'signature') continue;
      values[field.key] = field.type === 'date' ? new Date().toISOString() : field.label;
    }
  }

  const png = await cardService.renderFace(design, face, { values, files });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // A preview reflects data that can change on the next request.
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(png);
});

/* --------------------------- the end user's card -------------------------- */

/**
 * GET /api/portal/forms/:formId/card-design
 *
 * The layout the portal needs to draw a live preview while someone fills the
 * form in. It returns the design only - never anyone else's values - and only
 * when the design is active, so drafts stay invisible to end users.
 */
const forPortal = asyncHandler(async (req, res) => {
  assertObjectId(req.params.formId, 'form id');

  const design = await CardDesign.findOne({
    form: req.params.formId,
    status: 'active',
    ...tenantScope(req),
  });

  // No active design is normal, not an error - the form simply has no card.
  if (!design) return ok(res, { design: null });

  return ok(res, { design });
});

/**
 * GET /api/portal/submissions/:id/card
 *
 * The rendered card for the signed-in person's own record, so they can see
 * the finished article rather than a browser approximation.
 */
const myCard = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'submission id');

  const submission = await Submission.findOne({
    _id: req.params.id,
    user: req.user._id,
    ...tenantScope(req),
  });
  if (!submission) throw ApiError.notFound('Submission not found');

  const design = await CardDesign.findOne({
    form: submission.form,
    status: 'active',
    ...tenantScope(req),
  });
  if (!design) throw ApiError.notFound('No card design for this form');

  const face = req.query.face === 'back' ? 'back' : 'front';
  const png = await cardService.renderFace(design, face, {
    values: {
      ...(submission.data || {}),
      loginId: submission.userLoginId || '',
      name: submission.userName || '',
    },
    files:
      submission.files instanceof Map
        ? Object.fromEntries(submission.files)
        : submission.files || {},
  });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(png);
});

module.exports = {
  list,
  getOne,
  create,
  update,
  setStatus,
  remove,
  uploadArtwork,
  removeArtwork,
  preview,
  forPortal,
  myCard,
};
