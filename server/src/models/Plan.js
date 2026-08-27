const mongoose = require('mongoose');

/**
 * Subscription plan template. Limits are copied onto the Subscription at
 * assignment time so changing a plan never silently re-limits existing clients.
 * `-1` means unlimited.
 */
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true, default: '' },

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

    pricing: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
      interval: { type: String, enum: ['monthly', 'yearly', 'one_time'], default: 'yearly' },
    },

    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

planSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Plan', planSchema);
