const mongoose = require('mongoose');

/**
 * Append-only record of every consequential action.
 *
 * Nothing in the application updates or deletes these documents - the model
 * blocks it - because an audit trail that can be edited is not an audit trail.
 */
const auditLogSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },

    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    /** Snapshot of the actor - survives the user being renamed or deleted. */
    actorName: { type: String, default: 'System' },
    actorRole: { type: String, default: null },

    action: { type: String, required: true, index: true }, // e.g. submission.approved
    entityType: { type: String, required: true, index: true }, // e.g. Submission
    entity: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    entityLabel: { type: String, default: '' }, // human reference, e.g. STU00124

    description: { type: String, default: '' },

    /** Field-level before/after for edits, so a data correction is reconstructable. */
    changes: { type: [{ field: String, from: mongoose.Schema.Types.Mixed, to: mongoose.Schema.Types.Mixed, _id: false }], default: [] },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    ip: { type: String, default: null },
    userAgent: { type: String, default: null },

    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

auditLogSchema.index({ organization: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entity: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const blockMutation = function blockMutation(next) {
  next(new Error('Audit logs are append-only and cannot be modified or removed.'));
};

auditLogSchema.pre('findOneAndUpdate', blockMutation);
auditLogSchema.pre('updateOne', blockMutation);
auditLogSchema.pre('updateMany', blockMutation);
auditLogSchema.pre('deleteOne', blockMutation);
auditLogSchema.pre('deleteMany', blockMutation);
auditLogSchema.pre('findOneAndDelete', blockMutation);

module.exports = mongoose.model('AuditLog', auditLogSchema);
