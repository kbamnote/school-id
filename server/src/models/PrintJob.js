const mongoose = require('mongoose');
const Counter = require('./Counter');
const { JOB_STATUS } = require('../constants/workflow');

/**
 * One production job at MR Print World, created from a submitted lot.
 *
 * The lot is the client's view of the batch; the job is the factory's. They
 * are separate documents because they answer to different people: the client
 * owns the lot, MR Print World owns the job, and neither should be able to
 * move the other's state directly.
 */
const historySchema = new mongoose.Schema(
  {
    from: String,
    to: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const printJobSchema = new mongoose.Schema(
  {
    /** Which client this belongs to. Set from the lot, never from a request. */
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    organizationName: { type: String, default: '' },

    jobNumber: { type: String, required: true, unique: true, index: true },

    lot: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintingLot', required: true, index: true },
    lotNumber: { type: String, default: '' },

    form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', default: null },
    formTitle: { type: String, default: '' },
    productType: { type: String, default: 'id_card' },

    quantity: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.RECEIVED,
      index: true,
    },
    statusHistory: { type: [historySchema], default: [] },

    priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    /**
     * Numeric mirror of `priority`, purely so the queue can be sorted.
     * Sorting the string descending gives urgent > normal > high, which puts
     * high-priority work at the BOTTOM of the list - exactly backwards.
     */
    priorityRank: { type: Number, default: 0, index: true },
    receivedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },

    /** MR Print World staff member responsible. */
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedAt: { type: Date, default: null },

    /** Internal to MR Print World - never shown to the client. */
    internalNotes: { type: String, default: '', maxlength: 5000 },
    /** Visible to the client on their job view. */
    clientNotes: { type: String, default: '', maxlength: 2000 },

    /** Populated when the job is returned over a data problem. */
    dataIssue: {
      raisedAt: { type: Date, default: null },
      raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, default: '' },
      records: {
        type: [{ submission: mongoose.Schema.Types.ObjectId, label: String, reason: String, _id: false }],
        default: [],
      },
      resolvedAt: { type: Date, default: null },
    },

    proofVersion: { type: Number, default: 0 },
    approvedProof: { type: mongoose.Schema.Types.ObjectId, ref: 'Proof', default: null },

    printingStartedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    dispatch: {
      method: { type: String, default: '' },
      trackingNumber: { type: String, default: '' },
      courier: { type: String, default: '' },
      dispatchedTo: { type: String, default: '' },
      note: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

printJobSchema.index({ status: 1, priorityRank: -1, receivedAt: 1 });
printJobSchema.index({ organization: 1, status: 1 });

const PRIORITY_RANK = { normal: 0, high: 1, urgent: 2 };

/** Keeps priorityRank in step with priority, however the document was changed. */
printJobSchema.pre('save', function syncPriorityRank(next) {
  if (this.isModified('priority') || this.isNew) {
    this.priorityRank = PRIORITY_RANK[this.priority] ?? 0;
  }
  next();
});

printJobSchema.statics.PRIORITY_RANK = PRIORITY_RANK;

/** True when the job is finished, one way or another. */
printJobSchema.virtual('isClosed').get(function isClosed() {
  return [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED].includes(this.status);
});

/** Days since the job arrived - drives the ageing view in production. */
printJobSchema.virtual('ageDays').get(function ageDays() {
  if (!this.receivedAt) return 0;
  return Math.floor((Date.now() - this.receivedAt.getTime()) / 86400000);
});

/** True when a due date has passed on a job that is not yet finished. */
printJobSchema.virtual('isOverdue').get(function isOverdue() {
  if (!this.dueDate) return false;
  if ([JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED].includes(this.status)) return false;
  return this.dueDate < new Date();
});

/** Year-scoped job number, e.g. JOB-2026-000042. */
printJobSchema.statics.nextJobNumber = async function nextJobNumber() {
  const year = new Date().getFullYear();
  const seq = await Counter.next(`job:${year}`);
  return `JOB-${year}-${String(seq).padStart(6, '0')}`;
};

module.exports = mongoose.model('PrintJob', printJobSchema);
