const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const mailer = require('./mail');
const { CLIENT_STAFF_ROLES, PLATFORM_ROLES, resolvePermissions } = require('../constants/roles');

/**
 * Notifications.
 *
 * Every function here is DELIBERATELY NON-THROWING. A notification is a
 * courtesy on top of a business action that has already succeeded - if
 * writing one fails, the approval, the lot or the proof must still stand.
 * Failures are logged instead, the same contract the audit service uses.
 */

const TYPES = {
  SUBMISSION_SUBMITTED: 'submission.submitted',
  SUBMISSION_APPROVED: 'submission.approved',
  SUBMISSION_REJECTED: 'submission.rejected',
  SUBMISSION_CORRECTION_REQUIRED: 'submission.correction_required',
  FORM_ASSIGNED: 'form.assigned',
  LOT_SUBMITTED: 'lot.submitted',
  LOT_RETURNED: 'lot.returned',
  JOB_STATUS_CHANGED: 'job.status_changed',
  JOB_DATA_ISSUE: 'job.data_issue',
  PROOF_READY: 'proof.ready',
  PROOF_APPROVED: 'proof.approved',
  PROOF_CHANGES_REQUESTED: 'proof.changes_requested',
  ACCOUNT_CREATED: 'account.created',
  PASSWORD_RESET: 'account.password_reset',
};

/**
 * Writes notifications for a list of recipients.
 * Skips the actor: nobody needs telling about their own action.
 */
async function notify(recipients, payload, { actor = null, actorName = '', email = false } = {}) {
  try {
    const ids = (Array.isArray(recipients) ? recipients : [recipients])
      .filter(Boolean)
      .map((r) => (r._id ? r._id : r))
      .filter((id) => !actor || String(id) !== String(actor));

    if (!ids.length) return [];

    const unique = [...new Map(ids.map((id) => [String(id), id])).values()];

    const docs = await Notification.insertMany(
      unique.map((recipient) => ({
        recipient,
        organization: payload.organization || null,
        type: payload.type,
        title: payload.title,
        body: payload.body || '',
        link: payload.link || '',
        entityType: payload.entityType || '',
        entity: payload.entity || null,
        severity: payload.severity || 'info',
        actor: actor || null,
        actorName: actorName || '',
      })),
      { ordered: false }
    );

    if (email) await emailRecipients(unique, payload);

    return docs;
  } catch (err) {
    logger.error('Failed to write notifications', {
      type: payload?.type,
      message: err.message,
    });
    return [];
  }
}

/** Sends the same notification by email, for the few that warrant it. */
async function emailRecipients(ids, payload) {
  try {
    const users = await User.find({ _id: { $in: ids } }).select('email name');
    await Promise.all(
      users
        .filter((u) => u.email)
        .map((u) =>
          mailer.send({
            to: u.email,
            subject: payload.title,
            text: `${payload.body || payload.title}\n\n${mailer.absoluteUrl(payload.link)}`,
          })
        )
    );
  } catch (err) {
    logger.error('Failed to email notifications', { message: err.message });
  }
}

/**
 * Notifies everyone in an organisation who holds a permission.
 *
 * Only STAFF roles are considered. Permissions are computed per user rather
 * than queried, because effective permissions are role bundle plus per-user
 * overrides - a Mongo query on role alone would miss a promoted reviewer and
 * include a revoked one. Restricting to staff also stops a broadcast from
 * ever fanning out across an organisation's thousands of end users.
 */
async function notifyPermission(organization, permission, payload, options = {}) {
  try {
    const staff = await User.find({
      organization,
      role: { $in: CLIENT_STAFF_ROLES },
      status: 'active',
    }).select('_id role permissionOverrides');

    const recipients = staff.filter((u) =>
      resolvePermissions(u.role, u.permissionOverrides).includes(permission)
    );

    return notify(recipients, { ...payload, organization }, options);
  } catch (err) {
    logger.error('Failed to resolve notification recipients', {
      permission,
      message: err.message,
    });
    return [];
  }
}

/**
 * Notifies MR Print World's own staff who hold a permission.
 * Platform users have no organisation, so they are matched by role instead.
 */
async function notifyPlatform(permission, payload, options = {}) {
  try {
    const staff = await User.find({
      role: { $in: PLATFORM_ROLES },
      status: 'active',
    }).select('_id role permissionOverrides');

    const recipients = staff.filter((u) =>
      resolvePermissions(u.role, u.permissionOverrides).includes(permission)
    );

    return notify(recipients, { ...payload, organization: null }, options);
  } catch (err) {
    logger.error('Failed to resolve platform notification recipients', {
      permission,
      message: err.message,
    });
    return [];
  }
}

/** How many unread notifications one person has. */
async function unreadCount(userId) {
  try {
    return await Notification.countDocuments({ recipient: userId, readAt: null });
  } catch {
    return 0;
  }
}

module.exports = {
  TYPES,
  notify,
  notifyPermission,
  notifyPlatform,
  unreadCount,
};
