const PrintingLot = require('../models/PrintingLot');
const Submission = require('../models/Submission');
const Form = require('../models/Form');
const ApiError = require('../utils/ApiError');
const formService = require('./form.service');
const {
  LOT_STATUS,
  LOT_TRANSITIONS,
  SUBMISSION_STATUS,
  LOT_ELIGIBLE_SUBMISSION_STATUSES,
  canTransition,
} = require('../constants/workflow');
const { isFileField } = require('../constants/fieldTypes');

/** Guards a lot status change against the declared state machine. */
function assertTransition(from, to) {
  if (from === to) return;
  if (!canTransition(LOT_TRANSITIONS, from, to)) {
    throw ApiError.conflict(
      `A lot cannot move from "${from.replace(/_/g, ' ')}" to "${to.replace(/_/g, ' ')}".`,
      { code: 'INVALID_LOT_TRANSITION', details: { from, to } }
    );
  }
}

/**
 * Pre-flight check on a set of records.
 *
 * Run BEFORE a lot is created and again before it is sent, because approval
 * and production are separated in time: a record approved last week can have
 * been edited since, or had its photo replaced with something unusable. The
 * whole point of a lot is that nothing enters the factory unexamined.
 */
async function validateRecords(submissionIds, organizationId, formId) {
  const submissions = await Submission.find({
    _id: { $in: submissionIds },
    organization: organizationId,
  })
    .populate('orgCategory', 'name')
    .populate('department', 'name');

  // A short result means some ids were not ours. Refuse rather than silently drop.
  if (submissions.length !== submissionIds.length) {
    throw ApiError.forbidden('Some of those records do not belong to your organisation.');
  }

  const forms = new Map();
  const valid = [];
  const invalid = [];

  for (const submission of submissions) {
    const key = String(submission.form);

    if (!forms.has(key)) {
      // eslint-disable-next-line no-await-in-loop
      forms.set(key, await Form.findById(submission.form).select('fields title settings'));
    }
    const form = forms.get(key);

    const problems = [];

    // A lot is one product from one form - mixing them would make a single
    // print run that cannot actually be produced together.
    if (formId && String(submission.form) !== String(formId)) {
      problems.push('Belongs to a different form');
    }

    if (!LOT_ELIGIBLE_SUBMISSION_STATUSES.includes(submission.status)) {
      problems.push(
        submission.status === SUBMISSION_STATUS.IN_LOT
          ? 'Already in another printing lot'
          : `Not approved (currently ${submission.status.replace(/_/g, ' ')})`
      );
    }

    // Re-validate the answers themselves, not just the status.
    const { valid: dataValid, errors } = formService.validateSubmission(
      form,
      submission.allValues()
    );
    if (!dataValid) {
      problems.push(...Object.values(errors));
    }

    // Print-quality check: an image below the field's minimum will look soft
    // on a card even though it passed submission validation.
    const files =
      submission.files instanceof Map
        ? Object.fromEntries(submission.files)
        : submission.files || {};
    for (const field of form.fields.filter((f) => !f.archived && isFileField(f.type))) {
      const file = files[field.key];
      const minWidth = field.fileSettings?.minWidth;
      if (file && minWidth && file.width && file.width < minWidth) {
        problems.push(
          `${field.label} is ${file.width}px wide, below the ${minWidth}px needed for printing`
        );
      }
    }

    const entry = {
      id: String(submission._id),
      userName: submission.userName,
      userLoginId: submission.userLoginId,
      category: submission.orgCategory?.name || '',
      department: submission.department?.name || '',
      status: submission.status,
      duplicateFlagged: Boolean(submission.duplicateOf),
      problems,
    };

    if (problems.length) invalid.push(entry);
    else valid.push(entry);
  }

  return {
    valid,
    invalid,
    summary: {
      selected: submissions.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicatesFlagged: [...valid, ...invalid].filter((r) => r.duplicateFlagged).length,
    },
  };
}

/** Moves records into a lot and marks them so they cannot join another. */
async function attachRecords(lot, submissionIds) {
  const existing = new Set(lot.submissions.map(String));
  const added = submissionIds.filter((id) => !existing.has(String(id)));

  if (!added.length) return 0;

  await Submission.updateMany(
    { _id: { $in: added }, organization: lot.organization },
    { $set: { status: SUBMISSION_STATUS.IN_LOT, printingLot: lot._id } }
  );

  lot.submissions.push(...added);
  lot.recordCount = lot.submissions.length;
  await lot.save();

  return added.length;
}

/**
 * Releases records from a lot, returning them to approved.
 * Used when a record is removed, or the whole lot is cancelled.
 */
async function detachRecords(lot, submissionIds) {
  const ids = submissionIds.map(String);

  await Submission.updateMany(
    { _id: { $in: ids }, organization: lot.organization, printingLot: lot._id },
    { $set: { status: SUBMISSION_STATUS.APPROVED, printingLot: null } }
  );

  lot.submissions = lot.submissions.filter((s) => !ids.includes(String(s)));
  lot.recordCount = lot.submissions.length;
  await lot.save();

  return ids.length;
}

/** Records eligible to be added to a lot for a given form. */
function eligibleFilter(organizationId, formId) {
  return {
    organization: organizationId,
    ...(formId ? { form: formId } : {}),
    status: { $in: LOT_ELIGIBLE_SUBMISSION_STATUSES },
    printingLot: null,
  };
}

module.exports = {
  assertTransition,
  validateRecords,
  attachRecords,
  detachRecords,
  eligibleFilter,
  LOT_STATUS,
};
