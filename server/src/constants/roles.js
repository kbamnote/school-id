const { PERMISSIONS: P, ALL_PERMISSIONS } = require('./permissions');

/**
 * SECURITY ROLES - a fixed system enum.
 *
 * These are NOT the same thing as an organisation's categories (Student,
 * Teacher, Driver...). Those live in the `orgcategories` collection, are
 * tenant-owned data, and carry ZERO authorisation meaning. Keeping the two
 * apart is deliberate: a client renaming a category must never be able to
 * widen anyone's access.
 */
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUPER_ADMIN_STAFF: 'SUPER_ADMIN_STAFF',
  CLIENT_OWNER: 'CLIENT_OWNER',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  CLIENT_REVIEWER: 'CLIENT_REVIEWER',
  CLIENT_STAFF: 'CLIENT_STAFF',
  END_USER: 'END_USER',
};

const ROLE_VALUES = Object.values(ROLES);

/** Roles that belong to MR Print World itself and are not scoped to a tenant. */
const PLATFORM_ROLES = [ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_STAFF];

/** Roles that must always carry an organisation reference. */
const TENANT_ROLES = [
  ROLES.CLIENT_OWNER,
  ROLES.CLIENT_ADMIN,
  ROLES.CLIENT_REVIEWER,
  ROLES.CLIENT_STAFF,
  ROLES.END_USER,
];

const CLIENT_STAFF_ROLES = [
  ROLES.CLIENT_OWNER,
  ROLES.CLIENT_ADMIN,
  ROLES.CLIENT_REVIEWER,
  ROLES.CLIENT_STAFF,
];

/** Which portal a role lands in after sign-in. */
const ROLE_HOME = {
  [ROLES.SUPER_ADMIN]: '/super-admin',
  [ROLES.SUPER_ADMIN_STAFF]: '/super-admin',
  [ROLES.CLIENT_OWNER]: '/client',
  [ROLES.CLIENT_ADMIN]: '/client',
  [ROLES.CLIENT_REVIEWER]: '/client',
  [ROLES.CLIENT_STAFF]: '/client',
  [ROLES.END_USER]: '/portal',
};

const SUPER_ADMIN_STAFF_PERMISSIONS = [
  P.CLIENT_VIEW,
  P.JOBS_VIEW,
  P.JOBS_MANAGE,
  P.JOBS_EXPORT,
  P.PROOFS_VIEW,
  P.PROOFS_UPLOAD,
  P.DESIGNS_VIEW,
  P.DESIGNS_MANAGE,
  P.LOTS_VIEW,
  P.SUBMISSIONS_VIEW,
  P.REPORTS_VIEW,
];

const CLIENT_OWNER_PERMISSIONS = [
  P.ORG_VIEW, P.ORG_EDIT,
  P.USERS_VIEW, P.USERS_CREATE, P.USERS_EDIT, P.USERS_DELETE,
  P.USERS_IMPORT, P.USERS_EXPORT, P.USERS_CREDENTIALS,
  P.CATEGORIES_MANAGE, P.DEPARTMENTS_MANAGE,
  P.FORMS_VIEW, P.FORMS_CREATE, P.FORMS_EDIT, P.FORMS_PUBLISH, P.FORMS_DELETE, P.FORMS_ASSIGN,
  P.SUBMISSIONS_VIEW, P.SUBMISSIONS_EDIT, P.SUBMISSIONS_APPROVE, P.SUBMISSIONS_EXPORT,
  P.LOTS_VIEW, P.LOTS_CREATE, P.LOTS_SUBMIT,
  P.JOBS_VIEW,
  P.PROOFS_VIEW, P.PROOFS_APPROVE,
  P.DESIGNS_VIEW, P.DESIGNS_MANAGE,
  P.REPORTS_VIEW, P.AUDIT_VIEW,
];

/** Same as the owner minus organisation-level settings control. */
const CLIENT_ADMIN_PERMISSIONS = CLIENT_OWNER_PERMISSIONS.filter((p) => p !== P.ORG_EDIT);

/** Reviews and approves data, but cannot commit anything to production. */
const CLIENT_REVIEWER_PERMISSIONS = [
  P.ORG_VIEW,
  P.USERS_VIEW,
  P.FORMS_VIEW,
  P.SUBMISSIONS_VIEW, P.SUBMISSIONS_EDIT, P.SUBMISSIONS_APPROVE, P.SUBMISSIONS_EXPORT,
  P.LOTS_VIEW,
  P.JOBS_VIEW,
  P.PROOFS_VIEW,
  P.REPORTS_VIEW,
];

/** Read-only data-entry support. */
const CLIENT_STAFF_PERMISSIONS = [
  P.ORG_VIEW,
  P.USERS_VIEW,
  P.FORMS_VIEW,
  P.SUBMISSIONS_VIEW,
  P.LOTS_VIEW,
];

const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,
  [ROLES.SUPER_ADMIN_STAFF]: SUPER_ADMIN_STAFF_PERMISSIONS,
  [ROLES.CLIENT_OWNER]: CLIENT_OWNER_PERMISSIONS,
  [ROLES.CLIENT_ADMIN]: CLIENT_ADMIN_PERMISSIONS,
  [ROLES.CLIENT_REVIEWER]: CLIENT_REVIEWER_PERMISSIONS,
  [ROLES.CLIENT_STAFF]: CLIENT_STAFF_PERMISSIONS,
  [ROLES.END_USER]: [P.SELF_SUBMIT, P.SELF_VIEW],
};

/**
 * Effective permissions = role bundle + per-user grants - per-user revokes.
 * Per-user overrides let a client promote one reviewer without inventing a role.
 */
function resolvePermissions(role, { granted = [], revoked = [] } = {}) {
  const base = ROLE_PERMISSIONS[role] || [];
  const set = new Set([...base, ...granted]);
  for (const r of revoked) set.delete(r);
  return [...set];
}

/** Roles a given actor is allowed to assign - stops privilege escalation. */
function assignableRoles(actorRole) {
  switch (actorRole) {
    case ROLES.SUPER_ADMIN:
      return ROLE_VALUES;
    case ROLES.SUPER_ADMIN_STAFF:
      return [];
    case ROLES.CLIENT_OWNER:
      return [ROLES.CLIENT_ADMIN, ROLES.CLIENT_REVIEWER, ROLES.CLIENT_STAFF, ROLES.END_USER];
    case ROLES.CLIENT_ADMIN:
      return [ROLES.CLIENT_REVIEWER, ROLES.CLIENT_STAFF, ROLES.END_USER];
    default:
      return [];
  }
}

module.exports = {
  ROLES,
  ROLE_VALUES,
  PLATFORM_ROLES,
  TENANT_ROLES,
  CLIENT_STAFF_ROLES,
  ROLE_HOME,
  ROLE_PERMISSIONS,
  resolvePermissions,
  assignableRoles,
};
