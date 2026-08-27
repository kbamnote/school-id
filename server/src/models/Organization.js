const mongoose = require('mongoose');
const { ORG_STATUS } = require('../constants/workflow');
const { slugify } = require('../utils/strings');

/**
 * A tenant. Every tenant-owned document in the system carries this _id in its
 * `organization` field, and every tenant query is force-scoped to it.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Organisation name is required'], trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },

    type: {
      type: String,
      enum: ['school', 'college', 'university', 'company', 'government', 'hospital', 'ngo', 'other'],
      default: 'other',
    },

    logo: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
    },

    contact: {
      personName: { type: String, trim: true, default: '' },
      designation: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, lowercase: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      altPhone: { type: String, trim: true, default: '' },
    },

    address: {
      line1: { type: String, trim: true, default: '' },
      line2: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
      country: { type: String, trim: true, default: 'India' },
    },

    gstNumber: { type: String, trim: true, uppercase: true, default: '' },

    /** Visible only to MR Print World - never returned to the tenant itself. */
    internalNotes: { type: String, default: '', maxlength: 5000 },

    status: {
      type: String,
      enum: Object.values(ORG_STATUS),
      default: ORG_STATUS.ACTIVE,
      index: true,
    },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: '' },
    archivedAt: { type: Date, default: null },

    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },

    settings: {
      // Whether end users may edit an already-submitted record before review.
      allowSubmissionEditBeforeReview: { type: Boolean, default: true },
      requirePhotoOnSubmission: { type: Boolean, default: true },
      autoApproveSubmissions: { type: Boolean, default: false },
      timezone: { type: String, default: 'Asia/Kolkata' },
      dateFormat: { type: String, default: 'DD/MM/YYYY' },
      primaryColor: { type: String, default: '#1d45f5' },
    },

    /** Denormalised counters - kept fresh by services, used for dashboards and limits. */
    stats: {
      userCount: { type: Number, default: 0 },
      formCount: { type: Number, default: 0 },
      submissionCount: { type: Number, default: 0 },
      storageUsedMb: { type: Number, default: 0 },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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

organizationSchema.index({ name: 'text' });
organizationSchema.index({ status: 1, createdAt: -1 });

/** True when the tenant is allowed to transact at all. */
organizationSchema.virtual('isActive').get(function isActive() {
  return this.status === ORG_STATUS.ACTIVE;
});

/** Generates a unique slug, appending -2, -3 ... on collision. */
organizationSchema.statics.generateSlug = async function generateSlug(name) {
  const base = slugify(name) || 'org';
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await this.exists({ slug: candidate })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
};

module.exports = mongoose.model('Organization', organizationSchema);
