const PrintJob = require('../models/PrintJob');
const PrintingLot = require('../models/PrintingLot');
const Submission = require('../models/Submission');
const Organization = require('../models/Organization');
const ApiError = require('../utils/ApiError');
const {
  JOB_STATUS,
  JOB_TRANSITIONS,
  LOT_STATUS,
  SUBMISSION_STATUS,
  canTransition,
} = require('../constants/workflow');

/** Guards a job status change against the declared pipeline. */
function assertTransition(from, to) {
  if (from === to) return;
  if (!canTransition(JOB_TRANSITIONS, from, to)) {
    throw ApiError.conflict(
      `A job cannot move from "${from.replace(/_/g, ' ')}" to "${to.replace(/_/g, ' ')}".`,
      { code: 'INVALID_JOB_TRANSITION', details: { from, to, allowed: JOB_TRANSITIONS[from] || [] } }
    );
  }
}

/**
 * Creates the production job for a lot that has just been sent.
 *
 * Idempotent: a lot re-sent after a data issue reuses its existing job rather
 * than spawning a duplicate, so production keeps one continuous record of the
 * batch instead of losing its history at every revision.
 */
async function createFromLot(lot, { actor } = {}) {
  const existing = await PrintJob.findOne({ lot: lot._id });

  if (existing) {
    // A returned job re-enters the pipeline at verification.
    existing.quantity = lot.recordCount;
    existing.status = JOB_STATUS.DATA_VERIFICATION;
    existing.statusHistory.push({
      from: existing.status,
      to: JOB_STATUS.DATA_VERIFICATION,
      by: actor?._id || null,
      byName: actor?.name || 'System',
      at: new Date(),
      note: `Lot re-sent by the client (revision ${lot.revision})`,
    });
    existing.dataIssue.resolvedAt = new Date();
    await existing.save();
    return { job: existing, isNew: false };
  }

  const org = await Organization.findById(lot.organization).select('name').lean();

  const job = await PrintJob.create({
    organization: lot.organization,
    organizationName: org?.name || '',
    jobNumber: await PrintJob.nextJobNumber(),
    lot: lot._id,
    lotNumber: lot.lotNumber,
    form: lot.form,
    formTitle: lot.formTitle,
    productType: lot.productType,
    quantity: lot.recordCount,
    priority: lot.priority,
    dueDate: lot.requiredBy || null,
    status: JOB_STATUS.RECEIVED,
    receivedAt: new Date(),
    statusHistory: [
      {
        from: null,
        to: JOB_STATUS.RECEIVED,
        byName: 'System',
        at: new Date(),
        note: `Received from ${org?.name || 'client'} as ${lot.lotNumber}`,
      },
    ],
  });

  lot.printJob = job._id;
  lot.status = LOT_STATUS.IN_PRODUCTION;
  await lot.save();

  return { job, isNew: true };
}

/** Applies a status change and records who moved it. */
async function changeStatus(job, to, { actor, note } = {}) {
  assertTransition(job.status, to);

  const from = job.status;
  job.status = to;
  job.statusHistory.push({
    from,
    to,
    by: actor?._id || null,
    byName: actor?.name || 'System',
    at: new Date(),
    note: note || '',
  });

  // Timestamps that reports and dispatch slips depend on.
  if (to === JOB_STATUS.PRINTING && !job.printingStartedAt) job.printingStartedAt = new Date();
  if (to === JOB_STATUS.DISPATCHED) job.dispatchedAt = new Date();
  if (to === JOB_STATUS.COMPLETED) job.completedAt = new Date();

  await job.save();
  return job;
}

/**
 * Returns a job to the client over a data problem.
 *
 * The lot goes back to `returned` and its records are released to
 * `correction_required`, so the people concerned can actually fix them. Simply
 * flagging the job would leave the client able to see a complaint but not act
 * on it.
 */
async function raiseDataIssue(job, { actor, reason, records = [] }) {
  assertTransition(job.status, JOB_STATUS.DATA_ISSUE);

  const lot = await PrintingLot.findById(job.lot);
  if (!lot) throw ApiError.notFound('The lot behind this job no longer exists');

  const targeted = records.map((r) => String(r.submission)).filter(Boolean);

  // Named records go back for correction; the rest stay put so a small problem
  // does not force the client to redo the whole batch.
  if (targeted.length) {
    await Submission.updateMany(
      { _id: { $in: targeted }, organization: job.organization },
      {
        $set: {
          status: SUBMISSION_STATUS.CORRECTION_REQUIRED,
          printingLot: null,
          correctionRequested: {
            at: new Date(),
            by: actor?._id || null,
            note: `MR Print World returned this record: ${reason}`,
            fields: [],
          },
        },
      }
    );
    lot.submissions = lot.submissions.filter((s) => !targeted.includes(String(s)));
    lot.recordCount = lot.submissions.length;
  }

  lot.status = LOT_STATUS.RETURNED;
  lot.returnedAt = new Date();
  lot.returnReason = reason;
  lot.returnedRecords = records.map((r) => ({
    submission: r.submission,
    reason: r.reason || reason,
  }));
  await lot.save();

  job.status = JOB_STATUS.DATA_ISSUE;
  job.dataIssue = {
    raisedAt: new Date(),
    raisedBy: actor?._id || null,
    reason,
    records: records.map((r) => ({
      submission: r.submission,
      label: r.label || '',
      reason: r.reason || reason,
    })),
    resolvedAt: null,
  };
  job.statusHistory.push({
    from: job.status,
    to: JOB_STATUS.DATA_ISSUE,
    by: actor?._id || null,
    byName: actor?.name || 'System',
    at: new Date(),
    note: reason,
  });
  await job.save();

  return { job, lot, returnedCount: targeted.length };
}

/** Marks the whole batch printed, then completed, once dispatch is confirmed. */
async function markRecords(job, submissionStatus) {
  const lot = await PrintingLot.findById(job.lot).select('submissions organization').lean();
  if (!lot?.submissions?.length) return 0;

  const result = await Submission.updateMany(
    { _id: { $in: lot.submissions }, organization: job.organization },
    { $set: { status: submissionStatus, printJob: job._id } }
  );
  return result.modifiedCount || 0;
}

module.exports = {
  assertTransition,
  createFromLot,
  changeStatus,
  raiseDataIssue,
  markRecords,
  JOB_STATUS,
};
