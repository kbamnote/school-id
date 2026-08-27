const mongoose = require('mongoose');
const Counter = require('./Counter');
const { padSequence } = require('../utils/strings');

/**
 * An ORGANISATION CATEGORY - Student, Teacher, Driver, HR ...
 *
 * This is tenant-owned data describing *what someone is*, and carries no
 * authorisation meaning whatsoever. Security is decided exclusively by
 * `User.role`. Keeping these apart means a client can invent any category they
 * like without ever touching the permission model.
 */
const orgCategorySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    name: { type: String, required: [true, 'Category name is required'], trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    description: { type: String, trim: true, default: '', maxlength: 500 },

    /** ID prefix for generated login IDs, e.g. STU -> STU00001. */
    idPrefix: { type: String, required: true, trim: true, uppercase: true, maxlength: 8 },
    idPadding: { type: Number, default: 5, min: 3, max: 10 },

    color: { type: String, default: '#1d45f5' },
    icon: { type: String, default: 'users' },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    /** Denormalised for list screens; recalculated by the user service. */
    userCount: { type: Number, default: 0 },

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

// Unique per tenant, not globally - every school may have a "Student" category.
orgCategorySchema.index({ organization: 1, code: 1 }, { unique: true });
orgCategorySchema.index({ organization: 1, idPrefix: 1 }, { unique: true });
orgCategorySchema.index({ organization: 1, isActive: 1, sortOrder: 1 });

/**
 * Next login ID for this category. Backed by an atomic counter so a bulk import
 * running alongside a manual "add user" can never issue the same ID twice.
 */
orgCategorySchema.methods.nextLoginId = async function nextLoginId() {
  const seq = await Counter.next(`user:${this.organization}:${this._id}`);
  return padSequence(this.idPrefix, seq, this.idPadding);
};

/** Reserves `count` consecutive IDs in a single round trip. */
orgCategorySchema.methods.nextLoginIdBlock = async function nextLoginIdBlock(count) {
  const seqs = await Counter.nextBlock(`user:${this.organization}:${this._id}`, count);
  return seqs.map((s) => padSequence(this.idPrefix, s, this.idPadding));
};

module.exports = mongoose.model('OrgCategory', orgCategorySchema);
