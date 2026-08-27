const mongoose = require('mongoose');
const { SUBMISSION_STATUS, SUBMISSION_LOCKED_STATUSES } = require('../constants/workflow');

/**
 * A frozen copy of one field, as it stood when the record was submitted.
 *
 * Without this, editing a published form would retroactively change the
 * meaning of data already collected and approved - a label change would
 * silently relabel printed cards, and a new required field would make
 * historical records look incomplete.
 */
const snapshotFieldSchema = new mongoose.Schema(
  {
    key: String,
    type: String,
    label: String,
    required: Boolean,
    order: Number,
    options: { type: [String], default: undefined },
    validation: { type: mongoose.Schema.Types.Mixed, default: undefined },
    fileSettings: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

/** A stored file answer. */
const fileValueSchema = new mongoose.Schema(
  {
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
    url: String,
    publicId: String,
    /** Which driver holds the blob. Absent on records saved before card rendering. */
    provider: String,
    originalName: String,
    mimetype: String,
    bytes: Number,
    width: Number,
    height: Number,
  },
  { _id: false }
);

/** One review decision, kept for the audit trail. */
const reviewSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['approved', 'rejected', 'correction_requested', 'edited'],
      required: true,
    },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
    /** Field keys the reviewer flagged, with the reason for each. */
    fieldNotes: {
      type: [{ key: String, message: String, _id: false }],
      default: [],
    },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },

    /** The person the record is about. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Denormalised so exports and print lists do not need a join per row. */
    userLoginId: { type: String, default: null },
    userName: { type: String, default: '' },
    orgCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'OrgCategory', default: null, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },

    /** Answers, keyed by the form's stable field keys. */
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** File answers, kept apart from `data` so uploads can be swept and re-served. */
    files: { type: Map, of: fileValueSchema, default: () => new Map() },

    /** The form's fields as they were when this was submitted. */
    formSnapshot: { type: [snapshotFieldSchema], default: [] },
    formVersionAt: { type: Date, default: null },

    status: {
      type: String,
      enum: Object.values(SUBMISSION_STATUS),
      default: SUBMISSION_STATUS.DRAFT,
      index: true,
    },

    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Set while a correction is outstanding; cleared on resubmit. */
    correctionRequested: {
      at: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      note: { type: String, default: '' },
      fields: { type: [{ key: String, message: String, _id: false }], default: [] },
    },

    reviews: { type: [reviewSchema], default: [] },

    /** How many times the user has submitted this record. */
    submissionCount: { type: Number, default: 0 },

    declarationAccepted: { type: Boolean, default: false },
    declarationAcceptedAt: { type: Date, default: null },

    /**
     * Hash of the form's duplicateCheckFields values. Indexed but NOT unique -
     * a duplicate is flagged for a human to judge, never silently rejected,
     * because two people can legitimately share a name and date of birth.
     */
    duplicateHash: { type: String, default: null, index: true },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', default: null },

    /** Production links, populated in phases 8-9. */
    printingLot: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintingLot', default: null, index: true },
    printJob: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintJob', default: null },

    /** How the record reached us - useful when diagnosing odd data. */
    source: { type: String, enum: ['portal', 'public_link', 'admin'], default: 'portal' },
    submittedIp: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.submittedIp;
        return ret;
      },
    },
  }
);

/* One record per person per form. */
submissionSchema.index({ form: 1, user: 1 }, { unique: true });
submissionSchema.index({ organization: 1, status: 1, updatedAt: -1 });
submissionSchema.index({ organization: 1, form: 1, status: 1 });
submissionSchema.index({ organization: 1, userName: 1 });
submissionSchema.index({ form: 1, duplicateHash: 1 });

/** True once the record is beyond the user's control. */
submissionSchema.methods.isLockedForUser = function isLockedForUser() {
  return SUBMISSION_LOCKED_STATUSES.includes(this.status);
};

/** True when the user may still edit - drafts and correction requests. */
submissionSchema.methods.isEditableByUser = function isEditableByUser(form) {
  if (this.isLockedForUser()) return false;
  if (this.status === SUBMISSION_STATUS.CORRECTION_REQUIRED) return true;
  if (this.status === SUBMISSION_STATUS.DRAFT || this.status === SUBMISSION_STATUS.NOT_STARTED) {
    return true;
  }
  // Submitted but not yet picked up - editable only if the form allows it.
  if (
    [SUBMISSION_STATUS.SUBMITTED, SUBMISSION_STATUS.RESUBMITTED].includes(this.status) &&
    form?.settings?.allowEditAfterSubmit
  ) {
    return true;
  }
  return false;
};

/** Merges `data` and `files` into the single object exports and printing use. */
submissionSchema.methods.allValues = function allValues() {
  const values = { ...(this.data || {}) };
  const files = this.files instanceof Map ? Object.fromEntries(this.files) : this.files || {};
  for (const [key, value] of Object.entries(files)) {
    values[key] = value;
  }
  return values;
};

module.exports = mongoose.model('Submission', submissionSchema);
