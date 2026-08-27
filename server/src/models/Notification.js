const mongoose = require('mongoose');

/**
 * One notification for one person.
 *
 * Fanned out on write rather than stored once with a set of readers: read
 * state is per-person, and "my unread notifications" then answers from a
 * single index instead of scanning a shared row's reader list. The cost is
 * duplicate rows for a broadcast, which is bounded because fan-out only ever
 * targets an organisation's staff, never its end users.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /**
     * The tenant this belongs to. Null for MR Print World's own staff, who
     * sit outside every tenant - so this must never be used alone as the
     * authorisation check; `recipient` is what scopes a read.
     */
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },

    /** What happened, e.g. 'submission.correction_required'. */
    type: { type: String, required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', trim: true, maxlength: 1000 },

    /** Where clicking it should go, as an in-app path. */
    link: { type: String, default: '', maxlength: 400 },

    /** What it is about, so a stale notification can be resolved or hidden. */
    entityType: { type: String, default: '' },
    entity: { type: mongoose.Schema.Types.ObjectId, default: null },

    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'critical'],
      default: 'info',
    },

    /** Who caused it. Null when the system did. */
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },

    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* The list query: one person's notifications, newest first. */
notificationSchema.index({ recipient: 1, createdAt: -1 });
/* The badge query: one person's unread count. */
notificationSchema.index({ recipient: 1, readAt: 1 });

/**
 * Notifications expire after 90 days.
 *
 * They are a prompt to act, not a record - the audit log is the permanent
 * history. Without this the collection grows without bound, since every
 * workflow step writes one per interested person.
 */
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

notificationSchema.virtual('isRead').get(function isRead() {
  return Boolean(this.readAt);
});

module.exports = mongoose.model('Notification', notificationSchema);
