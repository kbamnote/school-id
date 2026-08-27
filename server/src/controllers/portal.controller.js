const Form = require('../models/Form');
const Submission = require('../models/Submission');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const { assertObjectId } = require('../utils/query');
const formService = require('../services/form.service');
const submissionService = require('../services/submission.service');
const uploadService = require('../services/upload.service');
const audit = require('../services/audit.service');
const notifications = require('../services/notification.service');
const { PERMISSIONS } = require('../constants/permissions');
const { SUBMISSION_STATUS } = require('../constants/workflow');
const { definition, isFileField } = require('../constants/fieldTypes');

/**
 * Loads a form the CALLER is actually assigned to.
 *
 * Being signed in to the right tenant is not enough - a student must not be
 * able to open the staff form by guessing its id. Every portal route resolves
 * the form through here.
 */
async function loadAssignedForm(formId, user) {
  assertObjectId(formId, 'form id');

  const form = await Form.findOne({ _id: formId, organization: user.organization._id });
  // 404, not 403 - a wrong-tenant id must not be distinguishable from a
  // non-existent one.
  if (!form) throw ApiError.notFound('Form not found');

  const assigned = await formService.isFormAssignedToUser(form._id, {
    _id: user._id,
    organization: user.organization._id,
    orgCategory: user.orgCategory?._id || user.orgCategory,
    department: user.department?._id || user.department,
  });
  if (!assigned) throw ApiError.notFound('Form not found');

  return form;
}

/** GET /api/portal/forms - everything assigned to the caller, with progress. */
const myForms = asyncHandler(async (req, res) => {
  const assigned = await formService.formsAssignedToUser({
    _id: req.user._id,
    organization: req.user.organization._id,
    orgCategory: req.user.orgCategory?._id || req.user.orgCategory,
    department: req.user.department?._id || req.user.department,
  });

  const submissions = await Submission.find({
    user: req.user._id,
    form: { $in: assigned.map((a) => a.form._id) },
  }).lean();

  const byForm = new Map(submissions.map((s) => [String(s.form), s]));

  const items = assigned.map(({ form, dueDate }) => {
    const submission = byForm.get(String(form._id));
    const open = form.isOpen();

    return {
      form: {
        id: String(form._id),
        title: form.title,
        description: form.description,
        productType: form.productType,
        fieldCount: form.fields.filter((f) => !f.archived).length,
      },
      dueDate,
      isOpen: open,
      closedReason: open ? null : form.closedReason(),
      status: submission?.status || SUBMISSION_STATUS.NOT_STARTED,
      submissionId: submission ? String(submission._id) : null,
      completeness: submission
        ? submissionService.completeness(form, Submission.hydrate(submission))
        : 0,
      correctionNote: submission?.correctionRequested?.note || null,
      correctionFields: submission?.correctionRequested?.fields || [],
      submittedAt: submission?.submittedAt || null,
      updatedAt: submission?.updatedAt || null,
    };
  });

  const summary = {
    total: items.length,
    notStarted: items.filter((i) => i.status === SUBMISSION_STATUS.NOT_STARTED).length,
    inProgress: items.filter((i) => i.status === SUBMISSION_STATUS.DRAFT).length,
    awaitingReview: items.filter((i) =>
      [SUBMISSION_STATUS.SUBMITTED, SUBMISSION_STATUS.RESUBMITTED, SUBMISSION_STATUS.UNDER_REVIEW].includes(i.status)
    ).length,
    needsCorrection: items.filter((i) => i.status === SUBMISSION_STATUS.CORRECTION_REQUIRED).length,
    done: items.filter((i) =>
      [
        SUBMISSION_STATUS.APPROVED,
        SUBMISSION_STATUS.IN_LOT,
        SUBMISSION_STATUS.SENT_FOR_PRINTING,
        SUBMISSION_STATUS.PRINTED,
        SUBMISSION_STATUS.COMPLETED,
      ].includes(i.status)
    ).length,
  };

  return ok(res, { forms: items, summary });
});

/**
 * GET /api/portal/forms/:id
 * The form definition plus the caller's own answers so far.
 */
const getForm = asyncHandler(async (req, res) => {
  const form = await loadAssignedForm(req.params.id, req.user);

  let submission = await Submission.findOne({ form: form._id, user: req.user._id });

  const isNew = !submission;
  if (isNew) {
    submission = await submissionService.getOrCreateDraft(form, req.user);
    submission.data = submissionService.prefillFromUser(form, req.user);
  }

  const editable = submission.isEditableByUser(form);

  return ok(res, {
    form: {
      id: String(form._id),
      title: form.title,
      description: form.description,
      productType: form.productType,
      fields: form.fields.filter((f) => !f.archived).sort((a, b) => a.order - b.order),
      settings: form.settings,
      status: form.status,
    },
    isOpen: form.isOpen(),
    closedReason: form.isOpen() ? null : form.closedReason(),
    submission: {
      id: isNew ? null : String(submission._id),
      status: submission.status,
      data: submission.data || {},
      files: submission.files instanceof Map ? Object.fromEntries(submission.files) : submission.files || {},
      declarationAccepted: submission.declarationAccepted,
      correctionRequested: submission.correctionRequested,
      submittedAt: submission.submittedAt,
      submissionCount: submission.submissionCount,
      editable,
      completeness: submissionService.completeness(form, submission),
    },
  });
});

/**
 * PUT /api/portal/forms/:id/draft
 * Saves progress without validating - a half-finished draft is the point.
 */
const saveDraft = asyncHandler(async (req, res) => {
  const form = await loadAssignedForm(req.params.id, req.user);

  if (!form.isOpen()) {
    throw ApiError.forbidden(form.closedReason() || 'This form is not accepting submissions.', {
      code: 'FORM_CLOSED',
    });
  }
  if (!form.settings?.allowDrafts) {
    throw ApiError.forbidden('This form does not allow saving drafts.', { code: 'DRAFTS_DISABLED' });
  }

  const submission = await submissionService.getOrCreateDraft(form, req.user);

  if (!submission.isEditableByUser(form)) {
    throw ApiError.forbidden(
      'This record is being reviewed and can no longer be edited.',
      { code: 'SUBMISSION_LOCKED', details: { status: submission.status } }
    );
  }

  // Only keys the form actually defines - unknown keys are discarded rather
  // than stored, so a crafted payload cannot smuggle data into the record.
  const allowed = new Set(
    form.fields.filter((f) => !f.archived && !isFileField(f.type)).map((f) => f.key)
  );
  const incoming = req.body.data || {};
  const data = { ...(submission.data || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (allowed.has(key)) data[key] = value;
  }

  submission.data = data;
  if (req.body.declarationAccepted !== undefined) {
    submission.declarationAccepted = Boolean(req.body.declarationAccepted);
  }
  // A correction being worked on stays in correction_required until resubmitted.
  if (submission.status === SUBMISSION_STATUS.NOT_STARTED) {
    submission.status = SUBMISSION_STATUS.DRAFT;
  }

  await submission.save();
  await submissionService.refreshFormStats(form._id);

  return ok(
    res,
    {
      submissionId: String(submission._id),
      status: submission.status,
      completeness: submissionService.completeness(form, submission),
      savedAt: new Date(),
    },
    'Progress saved'
  );
});

/**
 * POST /api/portal/forms/:id/submit
 * Validates, freezes the snapshot, and hands the record to the organisation.
 */
const submit = asyncHandler(async (req, res) => {
  const form = await loadAssignedForm(req.params.id, req.user);

  if (!form.isOpen()) {
    throw ApiError.forbidden(form.closedReason() || 'This form is not accepting submissions.', {
      code: 'FORM_CLOSED',
    });
  }

  const submission = await submissionService.getOrCreateDraft(form, req.user);

  if (!submission.isEditableByUser(form)) {
    throw ApiError.forbidden('This record can no longer be edited.', {
      code: 'SUBMISSION_LOCKED',
      details: { status: submission.status },
    });
  }

  const wasCorrection = submission.status === SUBMISSION_STATUS.CORRECTION_REQUIRED;

  // Merge the final payload before validating.
  const allowed = new Set(
    form.fields.filter((f) => !f.archived && !isFileField(f.type)).map((f) => f.key)
  );
  const data = { ...(submission.data || {}) };
  for (const [key, value] of Object.entries(req.body.data || {})) {
    if (allowed.has(key)) data[key] = value;
  }
  submission.data = data;
  if (req.body.declarationAccepted !== undefined) {
    submission.declarationAccepted = Boolean(req.body.declarationAccepted);
  }

  const { valid, errors } = submissionService.validateForSubmit(form, submission);
  if (!valid) {
    throw ApiError.unprocessable('Please correct the highlighted fields before submitting.', {
      code: 'VALIDATION_ERROR',
      details: Object.entries(errors).map(([field, message]) => ({ field, message })),
    });
  }

  const nextStatus = wasCorrection ? SUBMISSION_STATUS.RESUBMITTED : SUBMISSION_STATUS.SUBMITTED;
  submissionService.assertTransition(submission.status, nextStatus);

  // The snapshot is taken HERE - the shape of what was answered stops moving.
  submission.formSnapshot = submissionService.buildSnapshot(form);
  submission.formVersionAt = form.updatedAt;

  const values = submission.allValues();
  submission.duplicateHash = submissionService.computeDuplicateHash(form, values);
  const duplicate = await submissionService.findDuplicate(
    form,
    submission.duplicateHash,
    submission._id
  );
  // Flagged for a human, never auto-rejected: two people can share a name and
  // a date of birth.
  submission.duplicateOf = duplicate ? duplicate._id : null;

  submission.status = nextStatus;
  submission.submittedAt = new Date();
  submission.submissionCount += 1;
  submission.submittedIp = req.ip;
  if (submission.declarationAccepted && !submission.declarationAcceptedAt) {
    submission.declarationAcceptedAt = new Date();
  }
  if (wasCorrection) {
    submission.correctionRequested = { at: null, by: null, note: '', fields: [] };
  }

  await submission.save();
  await submissionService.refreshFormStats(form._id);

  await audit.record(req, {
    action: wasCorrection
      ? audit.ACTIONS.SUBMISSION_RESUBMITTED
      : audit.ACTIONS.SUBMISSION_SUBMITTED,
    entityType: 'Submission',
    entity: submission._id,
    entityLabel: submission.userLoginId || submission.userName,
    description: `${submission.userName} ${wasCorrection ? 'resubmitted' : 'submitted'} "${form.title}"`,
    organization: form.organization,
    metadata: { formId: String(form._id), attempt: submission.submissionCount },
  });

  /*
   * Whoever reviews for this organisation, not a fixed role: a client may
   * have promoted one person to approve without changing their role, and the
   * permission is the only thing that knows that.
   */
  await notifications.notifyPermission(
    form.organization,
    PERMISSIONS.SUBMISSIONS_APPROVE,
    {
      type: notifications.TYPES.SUBMISSION_SUBMITTED,
      title: wasCorrection ? 'A correction was resubmitted' : 'A new submission is waiting',
      body: `${submission.userName} ${wasCorrection ? 'resubmitted' : 'submitted'} "${form.title}".`,
      link: `/client/submissions/view/${submission._id}`,
      entityType: 'Submission',
      entity: submission._id,
      severity: 'info',
    },
    { actor: req.user._id, actorName: req.user.name }
  );

  return ok(
    res,
    {
      submissionId: String(submission._id),
      status: submission.status,
      duplicateFlagged: Boolean(duplicate),
      successMessage: form.settings?.successMessage,
    },
    wasCorrection ? 'Resubmitted for review' : 'Submitted for review'
  );
});

/**
 * POST /api/portal/forms/:id/upload/:fieldKey
 * Stores one file answer against a specific field.
 */
const uploadFile = asyncHandler(async (req, res) => {
  const form = await loadAssignedForm(req.params.id, req.user);
  const { fieldKey } = req.params;

  const field = form.fields.find((f) => f.key === fieldKey && !f.archived);
  if (!field) throw ApiError.badRequest('That field does not exist on this form.');
  if (!isFileField(field.type)) {
    throw ApiError.badRequest(`"${field.label}" does not accept a file.`);
  }
  if (!req.file) throw ApiError.badRequest('Select a file to upload.');

  // Per-field size cap, which can be stricter than the global one.
  const maxMb = field.fileSettings?.maxSizeMb;
  if (maxMb && req.file.size > maxMb * 1024 * 1024) {
    throw ApiError.badRequest(`${field.label} must be ${maxMb} MB or smaller.`, {
      code: 'FILE_TOO_LARGE',
    });
  }

  const submission = await submissionService.getOrCreateDraft(form, req.user);
  if (!submission.isEditableByUser(form)) {
    throw ApiError.forbidden('This record can no longer be edited.', { code: 'SUBMISSION_LOCKED' });
  }

  const def = definition(field.type);
  const { upload, stored } = await uploadService.store(req.file, {
    organization: form.organization,
    kind:
      field.type === 'photo'
        ? 'submission_photo'
        : field.type === 'signature'
          ? 'submission_signature'
          : 'submission_document',
    uploadedBy: req.user._id,
    // Personal data - never publicly served.
    isPublic: false,
    folder: `submissions/${form.organization}/${def.exportFolder || 'files'}`,
    transform: field.fileSettings?.minWidth
      ? { width: Math.max(field.fileSettings.minWidth * 2, 1200), fit: 'inside' }
      : undefined,
  });

  // Replacing a file removes the previous blob so storage does not accumulate.
  const previous = submission.files?.get?.(fieldKey);
  if (previous?.publicId) await uploadService.destroy(previous.publicId);

  if (!(submission.files instanceof Map)) submission.files = new Map();
  submission.files.set(fieldKey, {
    upload: upload._id,
    url: stored.url,
    publicId: stored.publicId,
    provider: stored.provider,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    bytes: stored.bytes,
    width: stored.width,
    height: stored.height,
  });

  if (submission.status === SUBMISSION_STATUS.NOT_STARTED) {
    submission.status = SUBMISSION_STATUS.DRAFT;
  }
  await submission.save();

  return created(
    res,
    {
      field: fieldKey,
      file: submission.files.get(fieldKey),
      completeness: submissionService.completeness(form, submission),
    },
    'File uploaded'
  );
});

/** DELETE /api/portal/forms/:id/upload/:fieldKey */
const removeFile = asyncHandler(async (req, res) => {
  const form = await loadAssignedForm(req.params.id, req.user);
  const submission = await Submission.findOne({ form: form._id, user: req.user._id });

  if (!submission) throw ApiError.notFound('Nothing to remove');
  if (!submission.isEditableByUser(form)) {
    throw ApiError.forbidden('This record can no longer be edited.', { code: 'SUBMISSION_LOCKED' });
  }

  const existing = submission.files?.get?.(req.params.fieldKey);
  if (existing?.publicId) await uploadService.destroy(existing.publicId);
  submission.files.delete(req.params.fieldKey);
  await submission.save();

  return ok(res, { completeness: submissionService.completeness(form, submission) }, 'File removed');
});

/** GET /api/portal/submissions - the caller's own history. */
const mySubmissions = asyncHandler(async (req, res) => {
  const submissions = await Submission.find({ user: req.user._id })
    .populate('form', 'title productType')
    .sort({ updatedAt: -1 })
    .limit(100);

  return ok(res, { submissions });
});

/** GET /api/portal/submissions/:id - one of the caller's own records. */
const mySubmission = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'submission id');

  // Scoped by user, not just tenant: one student must never read another's.
  const submission = await Submission.findOne({
    _id: req.params.id,
    user: req.user._id,
  }).populate('form', 'title description productType settings');

  if (!submission) throw ApiError.notFound('Submission not found');

  return ok(res, { submission });
});

module.exports = {
  myForms,
  getForm,
  saveDraft,
  submit,
  uploadFile,
  removeFile,
  mySubmissions,
  mySubmission,
};
