const mongoose = require('mongoose');

/**
 * Metadata for every stored file.
 *
 * The blob itself lives in the storage provider; this record is what the
 * authorisation layer consults before serving it. Serving straight from a
 * provider URL would bypass tenant checks entirely, so protected files are
 * always reached through their Upload record.
 */
const uploadSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },

    provider: { type: String, enum: ['local', 'cloudinary'], required: true },
    publicId: { type: String, required: true, index: true },
    url: { type: String, required: true },

    /** What this file is attached to, for cleanup and access decisions. */
    kind: {
      type: String,
      enum: [
        'org_logo',
        'user_avatar',
        'submission_photo',
        'submission_signature',
        'submission_document',
        'proof',
        'card_design',
        'import_sheet',
        'misc',
      ],
      default: 'misc',
      index: true,
    },

    /** The name the user recognises. Never used to build a filesystem path. */
    originalName: { type: String, default: '' },
    mimetype: { type: String, default: '' },
    bytes: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },

    /**
     * Public files (an organisation logo) may be served without a session.
     * Anything containing personal data must stay private.
     */
    isPublic: { type: Boolean, default: false },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Set when the owning record is deleted, so a sweeper can reclaim the blob. */
    orphanedAt: { type: Date, default: null },
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

uploadSchema.index({ organization: 1, kind: 1, createdAt: -1 });

module.exports = mongoose.model('Upload', uploadSchema);
