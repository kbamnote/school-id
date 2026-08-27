const mongoose = require('mongoose');
const Counter = require('./Counter');
const { LOT_STATUS } = require('../constants/workflow');

/**
 * A batch of approved records handed to MR Print World as one production job.
 *
 * The lot is the boundary between the client's workspace and the factory:
 * everything before it is editable, everything after it is revision-controlled.
 */
const printingLotSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    /** Human reference, e.g. LOT-2026-000124. Unique across the platform. */
    lotNumber: { type: String, required: true, unique: true, index: true },

    name: { type: String, trim: true, default: '', maxlength: 200 },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },

    form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },
    formTitle: { type: String, default: '' },
    productType: { type: String, default: 'id_card' },

    submissions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Submission' }],
      default: [],
    },
    /** Denormalised so lists do not have to size the array on every row. */
    recordCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(LOT_STATUS),
      default: LOT_STATUS.DRAFT,
      index: true,
    },

    priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    requiredBy: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** The deliberate hand-over. Set once, when the client sends the lot. */
    submittedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Set when MR Print World sends the lot back over a data problem. */
    returnedAt: { type: Date, default: null },
    returnReason: { type: String, default: '' },
    /** Specific records production objected to, so the client is not left guessing. */
    returnedRecords: {
      type: [{ submission: mongoose.Schema.Types.ObjectId, reason: String, _id: false }],
      default: [],
    },

    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },

    printJob: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintJob', default: null },

    /**
     * Increments each time the lot is re-sent after a return, so production can
     * tell a corrected batch from the original.
     */
    revision: { type: Number, default: 1 },
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

printingLotSchema.index({ organization: 1, status: 1, createdAt: -1 });
printingLotSchema.index({ organization: 1, form: 1 });

/** True while the client can still change what is in the lot. */
printingLotSchema.virtual('isEditable').get(function isEditable() {
  return [LOT_STATUS.DRAFT, LOT_STATUS.READY, LOT_STATUS.RETURNED].includes(this.status);
});

/** True once production owns it. */
printingLotSchema.virtual('isWithProduction').get(function isWithProduction() {
  return [LOT_STATUS.SUBMITTED, LOT_STATUS.IN_PRODUCTION, LOT_STATUS.COMPLETED].includes(
    this.status
  );
});

/**
 * Allocates the next lot number for the current year.
 *
 * Year-scoped and counter-backed, so numbering restarts each January without
 * ever reusing a value within a year - two operators creating lots at the same
 * moment cannot collide.
 */
printingLotSchema.statics.nextLotNumber = async function nextLotNumber() {
  const year = new Date().getFullYear();
  const seq = await Counter.next(`lot:${year}`);
  return `LOT-${year}-${String(seq).padStart(6, '0')}`;
};

module.exports = mongoose.model('PrintingLot', printingLotSchema);
