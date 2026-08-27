const mongoose = require('mongoose');
const { PROOF_STATUS } = require('../constants/workflow');

/**
 * A proof sent to the client for sign-off before printing.
 *
 * Versioned and append-only in spirit: a new proof never overwrites an old
 * one. When a dispute arises about what was approved, the answer has to be a
 * specific file with a specific signature against it - not "the latest one".
 */
const proofSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintJob', required: true, index: true },
    jobNumber: { type: String, default: '' },
    lot: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintingLot', default: null },

    /** 1, 2, 3... per job. Never reused, even if a version is superseded. */
    version: { type: Number, required: true },

    file: {
      upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
      url: String,
      publicId: String,
      originalName: String,
      mimetype: String,
      bytes: Number,
      width: Number,
      height: Number,
    },

    /** What changed in this version - shown to the client above the proof. */
    notes: { type: String, default: '', maxlength: 2000 },

    status: {
      type: String,
      enum: Object.values(PROOF_STATUS),
      default: PROOF_STATUS.PENDING,
      index: true,
    },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },

    /**
     * The signature. Who at the client accepted this exact file, and when.
     * This is the record that authorises spending materials.
     */
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedByName: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decisionComment: { type: String, default: '', maxlength: 2000 },

    /** Set when a later version replaces this one. */
    supersededAt: { type: Date, default: null },
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

/* One version number per job. */
proofSchema.index({ job: 1, version: 1 }, { unique: true });
proofSchema.index({ organization: 1, status: 1, createdAt: -1 });

proofSchema.virtual('isPending').get(function isPending() {
  return this.status === PROOF_STATUS.PENDING;
});

/** Next version number for a job. Counts existing proofs rather than reusing. */
proofSchema.statics.nextVersion = async function nextVersion(jobId) {
  const latest = await this.findOne({ job: jobId }).sort({ version: -1 }).select('version').lean();
  return (latest?.version || 0) + 1;
};

module.exports = mongoose.model('Proof', proofSchema);
