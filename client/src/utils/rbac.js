/**
 * Mirrors server/src/constants/roles.js + permissions.js.
 *
 * Used ONLY to decide what to render. The server is the authority - every one
 * of these checks is repeated there, and a user who forges their way past this
 * file still gets a 403 from the API.
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUPER_ADMIN_STAFF: 'SUPER_ADMIN_STAFF',
  CLIENT_OWNER: 'CLIENT_OWNER',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  CLIENT_REVIEWER: 'CLIENT_REVIEWER',
  CLIENT_STAFF: 'CLIENT_STAFF',
  END_USER: 'END_USER',
};

export const PLATFORM_ROLES = [ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_STAFF];

export const CLIENT_ROLES = [
  ROLES.CLIENT_OWNER,
  ROLES.CLIENT_ADMIN,
  ROLES.CLIENT_REVIEWER,
  ROLES.CLIENT_STAFF,
];

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  SUPER_ADMIN_STAFF: 'Production Staff',
  CLIENT_OWNER: 'Owner',
  CLIENT_ADMIN: 'Administrator',
  CLIENT_REVIEWER: 'Reviewer',
  CLIENT_STAFF: 'Staff',
  END_USER: 'User',
};

export const ROLE_DESCRIPTIONS = {
  CLIENT_OWNER: 'Full control including organisation settings.',
  CLIENT_ADMIN: 'Manages users, forms, submissions and printing lots.',
  CLIENT_REVIEWER: 'Reviews and approves submissions. Cannot send lots to production.',
  CLIENT_STAFF: 'Read-only access to users, forms and submissions.',
  END_USER: 'Fills in their own assigned forms only.',
};

export const PERMISSIONS = {
  PLATFORM_MANAGE: 'platform.manage',
  CLIENT_VIEW: 'client.view',
  CLIENT_MANAGE: 'client.manage',
  PLAN_MANAGE: 'plans.manage',
  ORG_VIEW: 'org.view',
  ORG_EDIT: 'org.edit',
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_IMPORT: 'users.import',
  USERS_EXPORT: 'users.export',
  USERS_CREDENTIALS: 'users.credentials',
  CATEGORIES_MANAGE: 'categories.manage',
  DEPARTMENTS_MANAGE: 'departments.manage',
  FORMS_VIEW: 'forms.view',
  FORMS_CREATE: 'forms.create',
  FORMS_EDIT: 'forms.edit',
  FORMS_PUBLISH: 'forms.publish',
  FORMS_DELETE: 'forms.delete',
  FORMS_ASSIGN: 'forms.assign',
  SUBMISSIONS_VIEW: 'submissions.view',
  SUBMISSIONS_EDIT: 'submissions.edit',
  SUBMISSIONS_APPROVE: 'submissions.approve',
  SUBMISSIONS_EXPORT: 'submissions.export',
  LOTS_VIEW: 'lots.view',
  LOTS_CREATE: 'lots.create',
  LOTS_SUBMIT: 'lots.submit',
  JOBS_VIEW: 'jobs.view',
  JOBS_MANAGE: 'jobs.manage',
  JOBS_EXPORT: 'jobs.export',
  PROOFS_VIEW: 'proofs.view',
  PROOFS_UPLOAD: 'proofs.upload',
  PROOFS_APPROVE: 'proofs.approve',
  DESIGNS_VIEW: 'designs.view',
  DESIGNS_MANAGE: 'designs.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  SELF_SUBMIT: 'self.submit',
  SELF_VIEW: 'self.view',
};

/** Where each role belongs. Used by the route guards to bounce wrong-portal visits. */
export function portalFor(role) {
  if (PLATFORM_ROLES.includes(role)) return '/super-admin';
  if (CLIENT_ROLES.includes(role)) return '/client';
  if (role === ROLES.END_USER) return '/portal';
  return '/login';
}
