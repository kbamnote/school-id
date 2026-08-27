const Submission = require('../models/Submission');
const Form = require('../models/Form');
const ApiError = require('../utils/ApiError');
const formService = require('./form.service');
const { fingerprint } = require('../utils/strings');
const {
  SUBMISSION_STATUS,
  SUBMISSION_TRANSITIONS,
  canTransition,
} = require('../constants/workflow');
const { isDataBearing, isFileField } = require('../constants/fieldTypes');

/**
 * Freezes the form's current fields onto the submission.
 *
 * Taken at submit time, not at draft time: a draft should pick up form
 * corrections made while it sat unfinished, but once the user commits, the
 * shape of what they answered must stop moving.
 */
function buildSnapshot(form) {
  return form.fields
    .filter((f) => !f.archived)
    .sort((a, b) => a.order - b.order)
    .map((f) => ({
      key: f.key,
      type: f.type,
      label: f.label,
      required: f.required,
      order: f.order,
      options: f.options?.length ? [...f.options] : undefined,
      validation: f.validation ? { ...f.validation.toObject?.() ?? f.validation } : undefined,
      fileSettings: f.fileSettings
        ? { ...f.fileSettings.toObject?.() ?? f.fileSettings }
        : undefined,
    }));
}

/**
 * Computes the duplicate fingerprint for a submission.
 * Returns null when the form has no duplicate rule, or a required value is absent.
 */
function computeDuplicateHash(form, values) {
  const keys = form.duplicateCheckFields || [];
  if (!keys.length) return null;

  const parts = keys.map((k) => values[k]);
  // A partial match is not evidence of a duplicate - skip rather than guess.
  if (parts.some((p) => p === undefined || p === null || String(p).trim() === '')) return null;

  return fingerprint(parts.map((p) => (typeof p === 'object' ? JSON.stringify(p) : p)));
}

/** Finds an earlier submission on the same form with the same fingerprint. */
async function findDuplicate(form, hash, excludeId) {
  if (!hash) return null;
  return Submission.findOne({
    form: form._id,
    duplicateHash: hash,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    status: { $nin: [SUBMISSION_STATUS.DRAFT, SUBMISSION_STATUS.NOT_STARTED] },
  })
    .select('_id userName userLoginId status')
    .lean();
}

/** Guards a status change against the declared state machine. */
function assertTransition(from, to) {
  if (from === to) return;
  if (!canTransition(SUBMISSION_TRANSITIONS, from, to)) {
    throw ApiError.conflict(
      `A submission cannot move from "${from.replace(/_/g, ' ')}" to "${to.replace(/_/g, ' ')}".`,
      { code: 'INVALID_TRANSITION', details: { from, to } }
    );
  }
}

/**
 * Validates a submission for final submission.
 *
 * Validates against the LIVE form, since this is the moment the snapshot is
 * taken - the user is committing to the form as it currently stands.
 */
function validateForSubmit(form, submission) {
  const values = submission.allValues();
  const { valid, errors } = formService.validateSubmission(form, values);

  if (form.settings?.requireDeclaration && !submission.declarationAccepted) {
    errors.__declaration = 'You must accept the declaration before submitting.';
    return { valid: false, errors };
  }

  return { valid, errors };
}

/**
 * Percentage of required fields that carry a value.
 * Drives the progress indicator on the user's form list.
 */
function completeness(form, submission) {
  const required = form.fields.filter(
    (f) => !f.archived && f.required && isDataBearing(f.type)
  );
  if (!required.length) return 100;

  const values = submission?.allValues?.() || {};
  const filled = required.filter((f) => !formService.isBlank(values[f.key])).length;
  return Math.round((filled / required.length) * 100);
}

/**
 * Gets or creates the caller's record for a form.
 *
 * `NOT_STARTED` is never persisted - a record only exists once the user has
 * actually saved something, so the collection does not fill with empty rows
 * for every assigned person.
 */
async function getOrCreateDraft(form, user, { source = 'portal' } = {}) {
  let submission = await Submission.findOne({ form: form._id, user: user._id });

  if (!submission) {
    submission = new Submission({
      organization: form.organization,
      form: form._id,
      user: user._id,
      userLoginId: user.loginId || null,
      userName: user.name,
      orgCategory: user.orgCategory?._id || user.orgCategory || null,
      department: user.department?._id || user.department || null,
      data: {},
      status: SUBMISSION_STATUS.DRAFT,
      source,
    });
  }

  return submission;
}

/** Prefills a new draft from what the organisation already knows. */
function prefillFromUser(form, user) {
  const prefill = {};
  const byKey = new Map(form.fields.map((f) => [f.key, f]));

  const candidates = {
    full_name: user.name,
    name: user.name,
    student_name: user.name,
    employee_name: user.name,
    email: user.email || '',
    email_address: user.email || '',
    contact_no: user.phone || '',
    contact_number: user.phone || '',
    phone: user.phone || '',
    admission_no: user.externalId || '',
    admission_number: user.externalId || '',
    employee_id: user.externalId || '',
    roll_no: user.externalId || '',
  };

  for (const [key, value] of Object.entries(candidates)) {
    if (value && byKey.has(key) && !isFileField(byKey.get(key).type)) {
      prefill[key] = value;
    }
  }

  // Anything the form author gave a default value.
  for (const field of form.fields) {
    if (field.defaultValue !== undefined && prefill[field.key] === undefined) {
      prefill[field.key] = field.defaultValue;
    }
  }

  return prefill;
}

/** Recalculates a form's denormalised submission counters. */
async function refreshFormStats(formId) {
  const rows = await Submission.aggregate([
    { $match: { form: formId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  const drafts = byStatus[SUBMISSION_STATUS.DRAFT] || 0;
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  const approvedish = [
    SUBMISSION_STATUS.APPROVED,
    SUBMISSION_STATUS.IN_LOT,
    SUBMISSION_STATUS.SENT_FOR_PRINTING,
    SUBMISSION_STATUS.PRINTED,
    SUBMISSION_STATUS.COMPLETED,
  ].reduce((sum, s) => sum + (byStatus[s] || 0), 0);

  await Form.updateOne(
    { _id: formId },
    {
      $set: {
        // Drafts are not submissions - they have not been handed over yet.
        'stats.submissionCount': total - drafts,
        'stats.approvedCount': approvedish,
      },
    }
  );

  return byStatus;
}

module.exports = {
  buildSnapshot,
  computeDuplicateHash,
  findDuplicate,
  assertTransition,
  validateForSubmit,
  completeness,
  getOrCreateDraft,
  prefillFromUser,
  refreshFormStats,
};
