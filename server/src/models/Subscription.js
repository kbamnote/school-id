const mongoose = require('mongoose');

/**
 * A tenant's live plan.
 *
 * Limits are COPIED from the Plan at assignment time rather than read through
 * a reference, so editing a plan template never retroactively restricts (or
 * gifts capacity to) organisations already on it. Super Admin can then
 * override any single limit for one client without cloning a whole plan.
 */
const subscriptionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    planCode: { type: String, required: true, uppercase: true },
    planName: { type: String, required: true },

    limits: {
      maxUsers: { type: Number, default: 500 },
      maxForms: { type: Number, default: 3 },
      maxAdmins: { type: Number, default: 2 },
      maxCategories: { type: Number, default: 5 },
      maxStorageMb: { type: Number, default: 2048 },
      maxSubmissionsPerMonth: { type: Number, default: -1 },
    },

    features: {
      bulkImport: { type: Boolean, default: true },
      cardDesigner: { type: Boolean, default: false },
      proofApproval: { type: Boolean, default: true },
      advancedReports: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
    },

    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'cancelled', 'expired'],
      default: 'active',
      index: true,
    },

    startedAt: { type: Date, default: Date.now },
    /** null = perpetual. Payment integration can populate this later. */
    expiresAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    /** Records that a human deliberately deviated from the plan template. */
    overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    overrideNote: { type: String, default: '' },
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

subscriptionSchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.expiresAt && this.expiresAt < new Date());
});

/** `-1` on any limit means unlimited. */
subscriptionSchema.methods.limitFor = function limitFor(key) {
  const value = this.limits?.[key];
  return value === undefined ? -1 : value;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
