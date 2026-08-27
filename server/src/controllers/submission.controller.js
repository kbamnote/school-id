const Submission = require('../models/Submission');
const Form = require('../models/Form');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, paginated } = require('../utils/apiResponse');
const { parsePagination, parseSort, buildSearch, mergeFilters, assertObjectId } = require('../utils/query');
const { tenantScope, findScoped } = require('../middleware/tenant');
const submissionService = require('../services/submission.service');
const formService = require('../services/form.service');
const audit = require('../services/audit.service');
const notifications = require('../services/notification.service');
const { SUBMISSION_STATUS } = require('../constants/workflow');
const { isDataBearing, isFileField } = require('../constants/fieldTypes');

const SORTABLE = ['userName', 'userLoginId', 'status', 'submittedAt', 'updatedAt'];
const SEARCHABLE = ['userName', 'userLoginId'];

/** Status groups the review screens work in. */
const STATUS_GROUPS = {
  pending: [
    SUBMISSION_STATUS.SUBMITTED,
    SUBMISSION_STATUS.RESUBMITTED,
    SUBMISSION_STATUS.UNDER_REVIEW,
  ],
  corrections: [SUBMISSION_STATUS.CORRECTION_REQUIRED],
  approved: [SUBMISSION_STATUS.APPROVED],
  production: [
    SUBMISSION_STATUS.IN_LOT,
    SUBMISSION_STATUS.SENT_FOR_PRINTING,
    SUBMISSION_STATUS.PRINTED,
    SUBMISSION_STATUS.COMPLETED,
  ],
  drafts: [SUBMISSION_STATUS.DRAFT],
};

function buildFilters(req) {
  const filters = [tenantScope(req)];

  if (req.query.status) filters.push({ status: req.query.status });
  else if (req.query.group && STATUS_GROUPS[req.query.group]) {
    filters.push({ status: { $in: STATUS_GROUPS[req.query.group] } });
  }

  if (req.query.form) filters.push({ form: req.query.form });
  if (req.query.orgCategory) filters.push({ orgCategory: req.query.orgCategory });
  if (req.query.department) filters.push({ department: req.query.department });
  if (req.query.duplicates === 'true') filters.push({ duplicateOf: { $ne: null } });

  return mergeFilters(...filters, buildSearch(req.query.search, SEARCHABLE));
}

/** GET /api/submissions */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, SORTABLE, { submittedAt: -1, updatedAt: -1 });
  const filter = buildFilters(req);

  const [items, total] = await Promise.all([
    Submission.find(filter)
      // The full answer payload is not needed for a list - only the summary
      // columns and the photo thumbnail.
      .select('-formSnapshot -reviews -data')
      .populate('form', 'title productType')
      .populate('orgCategory', 'name color')
      .populate('department', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Submission.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/submissions/stats - counts for the filter chips. */
const stats = asyncHandler(async (req, res) => {
  const base = tenantScope(req);
  const match = req.query.form ? { ...base, form: req.query.form } : base;

  const rows = await Submission.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  const countIn = (list) => list.reduce((sum, s) => sum + (byStatus[s] || 0), 0);

  const duplicates = await Submission.countDocuments({ ...match, duplicateOf: { $ne: null } });

  return ok(res, {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    drafts: countIn(STATUS_GROUPS.drafts),
    pending: countIn(STATUS_GROUPS.pending),
    corrections: countIn(STATUS_GROUPS.corrections),
    approved: countIn(STATUS_GROUPS.approved),
    production: countIn(STATUS_GROUPS.production),
    rejected: byStatus[SUBMISSION_STATUS.REJECTED] || 0,
    duplicates,
    byStatus,
  });
});

/**
 * GET /api/submissions/:id
 *
 * Returns the record rendered against its OWN snapshot, not the live form, so
 * a reviewer sees exactly the questions the person was asked.
 */
const getOne = asyncHandler(async (req, res) => {
  const submission = await findScoped(Submission, req.params.id, req, {
    populate: [
      { path: 'form', select: 'title description productType settings duplicateCheckFields' },
      { path: 'user', select: 'name loginId email phone externalId status' },
      { path: 'orgCategory', select: 'name code color' },
      { path: 'department', select: 'name kind' },
      { path: 'approvedBy', select: 'name' },
      { path: 'duplicateOf', select: 'userName userLoginId status submittedAt' },
    ],
  });

  // A draft has no snapshot yet - fall back to the live form so the record is
  // still viewable rather than appearing empty.
  let fields = submission.formSnapshot;
  if (!fields?.length) {
    const form = await Form.findById(submission.form._id).select('fields');
    fields = (form?.fields || [])
      .filter((f) => !f.archived)
      .sort((a, b) => a.order - b.order)
      .map((f) => f.toObject());
  }

  const files =
    submission.files instanceof Map ? Object.fromEntries(submission.files) : submission.files || {};

  return ok(res, {
    submission,
    fields,
    values: submission.data || {},
    files,
    // Anything answered under a field that no longer exists on the form.
    orphanedValues: Object.keys(submission.data || {}).filter(
      (k) => !fields.some((f) => f.key === k)
    ),
  });
});

/** Applies one review decision and records it. */
async function applyDecision(req, submission, { action, status, note, fieldNotes }) {
  submissionService.assertTransition(submission.status, status);

  submission.reviews.push({
    action,
    by: req.user._id,
    byName: req.user.name,
    at: new Date(),
    note: note || '',
    fieldNotes: fieldNotes || [],
  });

  submission.status = status;
  submission.reviewedAt = new Date();

  if (status === SUBMISSION_STATUS.APPROVED) {
    submission.approvedAt = new Date();
    submission.approvedBy = req.user._id;
    // Clearing this matters: an approved record must not still look like it
    // has an outstanding correction on the user's screen.
    submission.correctionRequested = { at: null, by: null, note: '', fields: [] };
  }

  if (status === SUBMISSION_STATUS.CORRECTION_REQUIRED) {
    submission.correctionRequested = {
      at: new Date(),
      by: req.user._id,
      note: note || '',
      fields: fieldNotes || [],
    };
  }

  /**
   * Leaving the approved state clears the approval stamp.
   *
   * A record that was approved, sent back, and resubmitted is NOT approved -
   * leaving `approvedAt` in place makes the review screen claim it was signed
   * off while it sits in the pending queue. The approval is still in
   * `reviews`, so the history is not lost.
   */
  if (
    status !== SUBMISSION_STATUS.APPROVED &&
    [SUBMISSION_STATUS.CORRECTION_REQUIRED, SUBMISSION_STATUS.REJECTED].includes(status)
  ) {
    submission.approvedAt = null;
    submission.approvedBy = null;
  }

  await submission.save();

  /*
   * Told here rather than in each endpoint, so the single and bulk paths
   * cannot drift - a record corrected in bulk must reach its owner exactly
   * like one corrected on its own.
   */
  await notifyOwner(req, submission, action, note);

  return submission;
}

/** Tells the person whose record it is what was decided about it. */
async function notifyOwner(req, submission, action, note) {
  const shared = {
    organization: submission.organization,
    entityType: 'Submission',
    entity: submission._id,
    link: `/portal/forms/${submission.form}`,
  };
  const options = { actor: req.user._id, actorName: req.user.name };

  if (action === 'approved') {
    return notifications.notify(submission.user, {
      ...shared,
      type: notifications.TYPES.SUBMISSION_APPROVED,
      title: 'Your details were approved',
      body: 'Your organisation has approved your details. Nothing further is needed from you.',
      severity: 'success',
    }, options);
  }

  if (action === 'correction_requested') {
    return notifications.notify(submission.user, {
      ...shared,
      type: notifications.TYPES.SUBMISSION_CORRECTION_REQUIRED,
      title: 'Changes were requested on your form',
      body: note || 'Some of your details need correcting. Open the form to see what to fix.',
      severity: 'warning',
      // The one notification a person must not miss: until they act, their
      // card cannot be printed.
    }, { ...options, email: true });
  }

  if (action === 'rejected') {
    return notifications.notify(submission.user, {
      ...shared,
      type: notifications.TYPES.SUBMISSION_REJECTED,
      title: 'Your submission was not accepted',
      body: note || 'Your organisation did not accept this submission.',
      severity: 'critical',
    }, { ...options, email: true });
  }

  return null;
}

/** POST /api/submissions/:id/approve */
const approve = asyncHandler(async (req, res) => {
  const submission = await findScoped(Submission, req.params.id, req);

  /**
   * Re-approving is a no-op, not a second approval.
   *
   * Without this the record would gain another "approved" review entry and a
   * fresh approvedAt, so the history would show two approvals that never
   * happened - and a double-clicked button would quietly rewrite when the
   * record was signed off.
   */
  if (submission.status === SUBMISSION_STATUS.APPROVED) {
    return ok(res, { submission }, 'This record was already approved');
  }

  const form = await Form.findById(submission.form).select('fields settings');
  const { valid, errors } = formService.validateSubmission(form, submission.allValues());
  if (!valid) {
    throw ApiError.unprocessable(
      'This record is incomplete and cannot be approved. Request a correction instead.',
      {
        code: 'INCOMPLETE_SUBMISSION',
        details: Object.entries(errors).map(([field, message]) => ({ field, message })),
      }
    );
  }

  await applyDecision(req, submission, {
    action: 'approved',
    status: SUBMISSION_STATUS.APPROVED,
    note: req.body.note,
  });
  await submissionService.refreshFormStats(submission.form);

  await audit.record(req, {
    action: audit.ACTIONS.SUBMISSION_APPROVED,
    entityType: 'Submission',
    entity: submission._id,
    entityLabel: submission.userLoginId || submission.userName,
    description: `${submission.userName}'s submission was approved`,
    metadata: { formId: String(submission.form) },
  });

  return ok(res, { submission }, 'Approved');
});

/** POST /api/submissions/:id/request-correction */
const requestCorrection = asyncHandler(async (req, res) => {
  const submission = await findScoped(Submission, req.params.id, req);
  const { note, fields } = req.body;

  if (!note && !fields?.length) {
    throw ApiError.badRequest(
      'Say what needs correcting - either an overall note or specific fields.',
      { code: 'CORRECTION_REASON_REQUIRED' }
    );
  }

  // Field keys must exist on the record's own snapshot, or the user would be
  // shown a note against a question they were never asked.
  if (fields?.length) {
    const known = new Set((submission.formSnapshot || []).map((f) => f.key));
    const unknown = fields.map((f) => f.key).filter((k) => known.size && !known.has(k));
    if (unknown.length) {
      throw ApiError.badRequest(`Unknown field(s): ${unknown.join(', ')}`, {
        code: 'UNKNOWN_FIELD',
      });
    }
  }

  await applyDecision(req, submission, {
    action: 'correction_requested',
    status: SUBMISSION_STATUS.CORRECTION_REQUIRED,
    note,
    fieldNotes: fields,
  });
  await submissionService.refreshFormStats(submission.form);

  await audit.record(req, {
    action: audit.ACTIONS.SUBMISSION_CORRECTION_REQUESTED,
    entityType: 'Submission',
    entity: submission._id,
    entityLabel: submission.userLoginId || submission.userName,
    description: `Correction requested from ${submission.userName}: ${note || `${fields.length} field(s)`}`,
    severity: 'warning',
    metadata: { fields: (fields || []).map((f) => f.key) },
  });

  return ok(res, { submission }, 'Correction requested');
});

/** POST /api/submissions/:id/reject */
const reject = asyncHandler(async (req, res) => {
  const submission = await findScoped(Submission, req.params.id, req);
  if (!req.body.note) {
    throw ApiError.badRequest('Give a reason for rejecting this record.');
  }

  await applyDecision(req, submission, {
    action: 'rejected',
    status: SUBMISSION_STATUS.REJECTED,
    note: req.body.note,
  });
  await submissionService.refreshFormStats(submission.form);

  await audit.record(req, {
    action: audit.ACTIONS.SUBMISSION_REJECTED,
    entityType: 'Submission',
    entity: submission._id,
    entityLabel: submission.userLoginId || submission.userName,
    description: `${submission.userName}'s submission was rejected: ${req.body.note}`,
    severity: 'critical',
  });

  return ok(res, { submission }, 'Rejected');
});

/**
 * PATCH /api/submissions/:id/data
 *
 * Lets a reviewer fix an obvious typo without bouncing the record back.
 * Every changed value is recorded field-by-field, because silently editing
 * someone else's declared data with no trace is exactly what an audit log
 * exists to prevent.
 */
const editData = asyncHandler(async (req, res) => {
  const submission = await findScoped(Submission, req.params.id, req);

  if (submission.status === SUBMISSION_STATUS.COMPLETED) {
    throw ApiError.conflict('This record is completed and can no longer be edited.');
  }
  if (submission.printingLot) {
    throw ApiError.conflict(
      'This record is already in a printing lot. Remove it from the lot before editing.',
      { code: 'SUBMISSION_IN_LOT' }
    );
  }

  const fields = submission.formSnapshot?.length
    ? submission.formSnapshot
    : (await Form.findById(submission.form).select('fields')).fields.filter((f) => !f.archived);

  const editable = new Map(
    fields.filter((f) => isDataBearing(f.type) && !isFileField(f.type)).map((f) => [f.key, f])
  );

  const before = { ...(submission.data || {}) };
  const changes = [];

  for (const [key, value] of Object.entries(req.body.data || {})) {
    const field = editable.get(key);
    if (!field) continue;

    // Each edited value is validated exactly as the user's own would be.
    const error = formService.validateValue(field, value);
    if (error) {
      throw ApiError.unprocessable(error, {
        code: 'VALIDATION_ERROR',
        details: [{ field: key, message: error }],
      });
    }

    if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
      changes.push({ field: `${field.label} (${key})`, from: before[key] ?? null, to: value });
      submission.data = { ...submission.data, [key]: value };
    }
  }

  if (!changes.length) {
    return ok(res, { submission }, 'No changes were made');
  }

  submission.reviews.push({
    action: 'edited',
    by: req.user._id,
    byName: req.user.name,
    at: new Date(),
    note: req.body.note || 'Corrected by an administrator',
    fieldNotes: changes.map((c) => ({ key: c.field, message: `${c.from} -> ${c.to}` })),
  });

  /**
   * Editing an identity field changes the fingerprint, so the duplicate link
   * has to be re-evaluated - not merely recomputed. Leaving the old link in
   * place would show the reviewer a duplicate warning pointing at a record it
   * no longer matches, which is worse than no warning at all.
   */
  const form = await Form.findById(submission.form).select('duplicateCheckFields');
  const previousHash = submission.duplicateHash;
  submission.duplicateHash = submissionService.computeDuplicateHash(form, submission.allValues());

  if (submission.duplicateHash !== previousHash) {
    const match = await submissionService.findDuplicate(
      { _id: submission.form, duplicateCheckFields: form.duplicateCheckFields },
      submission.duplicateHash,
      submission._id
    );
    submission.duplicateOf = match ? match._id : null;
  }

  submission.markModified('data');
  await submission.save();

  await audit.record(req, {
    action: audit.ACTIONS.SUBMISSION_EDITED_BY_ADMIN,
    entityType: 'Submission',
    entity: submission._id,
    entityLabel: submission.userLoginId || submission.userName,
    description: `${req.user.name} edited ${changes.length} field(s) on ${submission.userName}'s record`,
    severity: 'warning',
    changes,
  });

  return ok(res, { submission, changed: changes.length }, `${changes.length} field(s) updated`);
});

/**
 * POST /api/submissions/bulk
 * Approve or request correction across many records in one action.
 */
const bulk = asyncHandler(async (req, res) => {
  const { ids, action, note } = req.body;

  const submissions = await Submission.find({ _id: { $in: ids }, ...tenantScope(req) });
  // A short list means some ids were not ours; refuse rather than partially act.
  if (submissions.length !== ids.length) {
    throw ApiError.forbidden('Some of those records do not belong to your organisation.');
  }

  const succeeded = [];
  const failed = [];
  const formIds = new Set();

  for (const submission of submissions) {
    formIds.add(String(submission.form));
    try {
      if (action === 'approve') {
        // Same no-op rule as the single approve - do not double-stamp.
        if (submission.status === SUBMISSION_STATUS.APPROVED) {
          succeeded.push(String(submission._id));
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const form = await Form.findById(submission.form).select('fields settings');
        const { valid } = formService.validateSubmission(form, submission.allValues());
        if (!valid) {
          failed.push({
            id: String(submission._id),
            name: submission.userName,
            reason: 'Incomplete - required details are missing',
          });
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await applyDecision(req, submission, {
          action: 'approved',
          status: SUBMISSION_STATUS.APPROVED,
          note,
        });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await applyDecision(req, submission, {
          action: 'correction_requested',
          status: SUBMISSION_STATUS.CORRECTION_REQUIRED,
          note,
        });
      }
      succeeded.push(String(submission._id));
    } catch (err) {
      failed.push({
        id: String(submission._id),
        name: submission.userName,
        reason: err.message,
      });
    }
  }

  await Promise.all([...formIds].map((id) => submissionService.refreshFormStats(id)));

  await audit.record(req, {
    action:
      action === 'approve'
        ? audit.ACTIONS.SUBMISSION_APPROVED
        : audit.ACTIONS.SUBMISSION_CORRECTION_REQUESTED,
    entityType: 'Submission',
    entityLabel: `${succeeded.length} records`,
    description: `Bulk ${action}: ${succeeded.length} succeeded, ${failed.length} skipped`,
    severity: 'warning',
    metadata: { action, succeeded: succeeded.length, failed: failed.length },
  });

  return ok(
    res,
    { succeeded: succeeded.length, failed },
    `${succeeded.length} record${succeeded.length === 1 ? '' : 's'} updated`
  );
});

/** POST /api/submissions/:id/dismiss-duplicate - the reviewer says they are different people. */
const dismissDuplicate = asyncHandler(async (req, res) => {
  const submission = await findScoped(Submission, req.params.id, req);

  if (!submission.duplicateOf) {
    return ok(res, { submission }, 'This record is not flagged as a duplicate');
  }

  const previous = submission.duplicateOf;
  submission.duplicateOf = null;
  await submission.save();

  await audit.record(req, {
    action: audit.ACTIONS.SUBMISSION_EDITED_BY_ADMIN,
    entityType: 'Submission',
    entity: submission._id,
    entityLabel: submission.userLoginId || submission.userName,
    description: `Duplicate flag dismissed on ${submission.userName}'s record - confirmed as a different person`,
    severity: 'warning',
    metadata: { wasDuplicateOf: String(previous) },
  });

  return ok(res, { submission }, 'Duplicate flag removed');
});

module.exports = {
  list,
  stats,
  getOne,
  approve,
  requestCorrection,
  reject,
  editData,
  bulk,
  dismissDuplicate,
};
