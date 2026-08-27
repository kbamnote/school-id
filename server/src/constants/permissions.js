/**
 * The permission catalogue.
 *
 * A permission is the ONLY thing authorisation middleware ever checks. Roles
 * are just named bundles of these strings, so adding a capability never means
 * touching route guards.
 */
const PERMISSIONS = {
  // MR Print World platform administration
  PLATFORM_MANAGE: 'platform.manage',
  CLIENT_VIEW: 'client.view',
  CLIENT_MANAGE: 'client.manage',
  PLAN_MANAGE: 'plans.manage',

  // Organisation settings
  ORG_VIEW: 'org.view',
  ORG_EDIT: 'org.edit',

  // People
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_IMPORT: 'users.import',
  USERS_EXPORT: 'users.export',
  USERS_CREDENTIALS: 'users.credentials', // generate / reset passwords

  // Structure
  CATEGORIES_MANAGE: 'categories.manage',
  DEPARTMENTS_MANAGE: 'departments.manage',

  // Forms
  FORMS_VIEW: 'forms.view',
  FORMS_CREATE: 'forms.create',
  FORMS_EDIT: 'forms.edit',
  FORMS_PUBLISH: 'forms.publish',
  FORMS_DELETE: 'forms.delete',
  FORMS_ASSIGN: 'forms.assign',

  // Submissions
  SUBMISSIONS_VIEW: 'submissions.view',
  SUBMISSIONS_EDIT: 'submissions.edit',
  SUBMISSIONS_APPROVE: 'submissions.approve',
  SUBMISSIONS_EXPORT: 'submissions.export',

  // Printing lots
  LOTS_VIEW: 'lots.view',
  LOTS_CREATE: 'lots.create',
  LOTS_SUBMIT: 'lots.submit', // the deliberate "send to MR Print World" action

  // Production (MR Print World side)
  JOBS_VIEW: 'jobs.view',
  JOBS_MANAGE: 'jobs.manage',
  JOBS_EXPORT: 'jobs.export',

  // Proofs
  PROOFS_VIEW: 'proofs.view',
  PROOFS_UPLOAD: 'proofs.upload',
  PROOFS_APPROVE: 'proofs.approve',

  // Card design
  DESIGNS_VIEW: 'designs.view',
  DESIGNS_MANAGE: 'designs.manage',

  // Oversight
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',

  // End user - their own record only
  SELF_SUBMIT: 'self.submit',
  SELF_VIEW: 'self.view',
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

module.exports = { PERMISSIONS, ALL_PERMISSIONS };
