const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Canonical action names. Using constants rather than free strings keeps the
 * audit log filterable - a typo'd action would otherwise silently vanish from
 * every report that queries it.
 */
const ACTIONS = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',
  AUTH_PASSWORD_RESET: 'auth.password_reset',

  ORG_CREATED: 'organization.created',
  ORG_UPDATED: 'organization.updated',
  ORG_SUSPENDED: 'organization.suspended',
  ORG_ACTIVATED: 'organization.activated',
  ORG_ARCHIVED: 'organization.archived',

  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_IMPORTED: 'user.imported',
  USER_CREDENTIALS_RESET: 'user.credentials_reset',
  USER_STATUS_CHANGED: 'user.status_changed',

  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  CATEGORY_DELETED: 'category.deleted',
  DEPARTMENT_CREATED: 'department.created',
  DEPARTMENT_UPDATED: 'department.updated',
  DEPARTMENT_DELETED: 'department.deleted',

  FORM_CREATED: 'form.created',
  FORM_UPDATED: 'form.updated',
  FORM_PUBLISHED: 'form.published',
  FORM_CLOSED: 'form.closed',
  FORM_DELETED: 'form.deleted',
  FORM_ASSIGNED: 'form.assigned',

  SUBMISSION_SAVED: 'submission.saved',
  SUBMISSION_SUBMITTED: 'submission.submitted',
  SUBMISSION_RESUBMITTED: 'submission.resubmitted',
  SUBMISSION_APPROVED: 'submission.approved',
  SUBMISSION_REJECTED: 'submission.rejected',
  SUBMISSION_CORRECTION_REQUESTED: 'submission.correction_requested',
  SUBMISSION_EDITED_BY_ADMIN: 'submission.edited_by_admin',

  LOT_CREATED: 'lot.created',
  LOT_UPDATED: 'lot.updated',
  LOT_SUBMITTED: 'lot.submitted',
  LOT_CANCELLED: 'lot.cancelled',
  LOT_RECORDS_RELEASED: 'lot.records_released',

  JOB_RECEIVED: 'job.received',
  JOB_STATUS_CHANGED: 'job.status_changed',
  JOB_DATA_ISSUE_RAISED: 'job.data_issue_raised',
  JOB_ASSIGNED: 'job.assigned',
  JOB_EXPORTED: 'job.exported',

  PROOF_UPLOADED: 'proof.uploaded',
  PROOF_APPROVED: 'proof.approved',
  PROOF_CHANGES_REQUESTED: 'proof.changes_requested',

  DESIGN_CREATED: 'design.created',
  DESIGN_UPDATED: 'design.updated',
  DESIGN_DELETED: 'design.deleted',
  DESIGN_ACTIVATED: 'design.activated',
  DESIGN_DEACTIVATED: 'design.deactivated',
  DESIGN_ARTWORK_UPLOADED: 'design.artwork_uploaded',

  DATA_EXPORTED: 'data.exported',
};

/** Field-level diff between two plain objects, restricted to `fields`. */
function diff(before = {}, after = {}, fields = []) {
  const keys = fields.length ? fields : [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes = [];
  for (const field of keys) {
    const from = before?.[field];
    const to = after?.[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, from: from ?? null, to: to ?? null });
    }
  }
  return changes;
}

/**
 * Writes an audit entry.
 *
 * Deliberately never throws: an audit write failing must not roll back or
 * break the business action the user just performed. Failures are logged so
 * they are still visible in server logs.
 */
async function record(req, { action, entityType, entity, entityLabel, description, changes, metadata, severity, organization }) {
  try {
    const org =
      organization !== undefined ? organization : req?.tenantId || null;

    await AuditLog.create({
      organization: org,
      actor: req?.user?._id || null,
      actorName: req?.user?.name || 'System',
      actorRole: req?.user?.role || null,
      action,
      entityType,
      entity: entity || null,
      entityLabel: entityLabel || '',
      description: description || '',
      changes: changes || [],
      metadata: metadata || {},
      ip: req?.ip || null,
      userAgent: req?.headers?.['user-agent']?.slice(0, 300) || null,
      severity: severity || 'info',
    });
  } catch (err) {
    logger.error('Failed to write audit log', { action, entityType, message: err.message });
  }
}

module.exports = { ACTIONS, record, diff };
