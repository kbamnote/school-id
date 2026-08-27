const express = require('express');
const categoryCtrl = require('../controllers/category.controller');
const departmentCtrl = require('../controllers/department.controller');
const userCtrl = require('../controllers/user.controller');
const formCtrl = require('../controllers/form.controller');
const submissionCtrl = require('../controllers/submission.controller');
const lotCtrl = require('../controllers/lot.controller');
const proofCtrl = require('../controllers/proof.controller');
const reportCtrl = require('../controllers/report.controller');
const dashboardCtrl = require('../controllers/clientDashboard.controller');
const auditCtrl = require('../controllers/audit.controller');
const {
  authenticate,
  requirePermission,
  blockIfPasswordChangeRequired,
} = require('../middleware/auth');
const { stripClientTenant, requireTenant } = require('../middleware/tenant');
const { validateBody, validateQuery } = require('../middleware/validate');
const { singleSheet } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const s = require('../validators/people.validator');
const f = require('../validators/form.validator');
const sub = require('../validators/submission.validator');
const lot = require('../validators/lot.validator');
const proof = require('../validators/proof.validator');
const activity = require('../validators/activity.validator');
const { PERMISSIONS: P } = require('../constants/permissions');

const router = express.Router();

/**
 * Tenant-scoped routes.
 *
 * The middleware order here is the isolation guarantee, applied once at the
 * router so no individual endpoint can forget it:
 *   authenticate      -> establishes req.tenantId from the verified token only
 *   stripClientTenant -> deletes any organisation id the client tried to send
 *   requireTenant     -> rejects users with no organisation
 */
router.use(authenticate, blockIfPasswordChangeRequired, stripClientTenant, requireTenant);

/* ------------------------------ dashboard -------------------------------- */
/**
 * ORG_VIEW, not merely "signed in".
 *
 * The summary exposes organisation-wide counts, the category breakdown and the
 * recent audit feed. An END_USER is inside the tenant but must not see any of
 * it - they only ever get their own record.
 */
router.get('/dashboard', requirePermission(P.ORG_VIEW), dashboardCtrl.summary);

/* --------------------------------- audit --------------------------------- */
/* Static segment first, so "actions" is never read as a filter value. */
router.get('/audit/actions', requirePermission(P.AUDIT_VIEW), auditCtrl.actions);
router.get(
  '/audit',
  requirePermission(P.AUDIT_VIEW),
  validateQuery(activity.auditListSchema),
  auditCtrl.listForClient
);

/* ------------------------------ categories ------------------------------- */
router.get(
  '/categories',
  requirePermission(P.USERS_VIEW),
  validateQuery(s.categoryListSchema),
  categoryCtrl.list
);
router.get('/categories/:id', requirePermission(P.USERS_VIEW), categoryCtrl.getOne);
router.post(
  '/categories',
  requirePermission(P.CATEGORIES_MANAGE),
  validateBody(s.categoryCreateSchema),
  categoryCtrl.create
);
router.patch(
  '/categories/:id',
  requirePermission(P.CATEGORIES_MANAGE),
  validateBody(s.categoryUpdateSchema),
  categoryCtrl.update
);
router.delete('/categories/:id', requirePermission(P.CATEGORIES_MANAGE), categoryCtrl.remove);

/* ----------------------------- departments ------------------------------- */
router.get(
  '/departments',
  requirePermission(P.USERS_VIEW),
  validateQuery(s.departmentListSchema),
  departmentCtrl.list
);
router.get('/departments/tree', requirePermission(P.USERS_VIEW), departmentCtrl.tree);
router.get('/departments/:id', requirePermission(P.USERS_VIEW), departmentCtrl.getOne);
router.post(
  '/departments',
  requirePermission(P.DEPARTMENTS_MANAGE),
  validateBody(s.departmentCreateSchema),
  departmentCtrl.create
);
router.patch(
  '/departments/:id',
  requirePermission(P.DEPARTMENTS_MANAGE),
  validateBody(s.departmentUpdateSchema),
  departmentCtrl.update
);
router.delete('/departments/:id', requirePermission(P.DEPARTMENTS_MANAGE), departmentCtrl.remove);

/* -------------------------------- users ---------------------------------- */
/* Static segments are declared before /:id so they are not captured by it. */
router.get('/users/stats', requirePermission(P.USERS_VIEW), userCtrl.stats);
router.get('/users/assignable-roles', requirePermission(P.USERS_VIEW), userCtrl.roles);
router.get(
  '/users/export',
  requirePermission(P.USERS_EXPORT),
  validateQuery(s.userListSchema),
  userCtrl.exportUsers
);
router.get('/users/import/template', requirePermission(P.USERS_IMPORT), userCtrl.importTemplate);
router.post(
  '/users/import/parse',
  requirePermission(P.USERS_IMPORT),
  uploadLimiter,
  singleSheet('file'),
  userCtrl.parseImport
);
router.post(
  '/users/import/commit',
  requirePermission(P.USERS_IMPORT),
  validateBody(s.importCommitSchema),
  userCtrl.commitImport
);

router.get(
  '/users',
  requirePermission(P.USERS_VIEW),
  validateQuery(s.userListSchema),
  userCtrl.list
);
router.get('/users/:id', requirePermission(P.USERS_VIEW), userCtrl.getOne);
router.post(
  '/users',
  requirePermission(P.USERS_CREATE),
  validateBody(s.userCreateSchema),
  userCtrl.create
);
router.patch(
  '/users/:id',
  requirePermission(P.USERS_EDIT),
  validateBody(s.userUpdateSchema),
  userCtrl.update
);
router.patch(
  '/users/:id/status',
  requirePermission(P.USERS_EDIT),
  validateBody(s.userStatusSchema),
  userCtrl.changeStatus
);
router.post(
  '/users/:id/reset-password',
  requirePermission(P.USERS_CREDENTIALS),
  userCtrl.resetPassword
);
router.delete('/users/:id', requirePermission(P.USERS_DELETE), userCtrl.remove);

/* -------------------------------- forms ---------------------------------- */
/* Static segments first, so /field-types is not swallowed by /:id. */
router.get('/forms/field-types', requirePermission(P.FORMS_VIEW), formCtrl.fieldTypes);

router.get(
  '/forms',
  requirePermission(P.FORMS_VIEW),
  validateQuery(f.listSchema),
  formCtrl.list
);
router.get('/forms/:id', requirePermission(P.FORMS_VIEW), formCtrl.getOne);
router.post(
  '/forms',
  requirePermission(P.FORMS_CREATE),
  validateBody(f.createSchema),
  formCtrl.create
);
router.patch(
  '/forms/:id',
  requirePermission(P.FORMS_EDIT),
  validateBody(f.updateSchema),
  formCtrl.update
);
router.patch(
  '/forms/:id/status',
  requirePermission(P.FORMS_PUBLISH),
  validateBody(f.statusSchema),
  formCtrl.changeStatus
);
router.post('/forms/:id/duplicate', requirePermission(P.FORMS_CREATE), formCtrl.duplicate);
router.delete('/forms/:id', requirePermission(P.FORMS_DELETE), formCtrl.remove);
router.post(
  '/forms/:id/link',
  requirePermission(P.FORMS_PUBLISH),
  validateBody(f.linkSchema),
  formCtrl.manageLink
);

/* ---------------------------- assignments -------------------------------- */
router.get('/forms/:id/assignees', requirePermission(P.FORMS_VIEW), formCtrl.assignees);
router.post(
  '/forms/:id/assignments',
  requirePermission(P.FORMS_ASSIGN),
  validateBody(f.assignSchema),
  formCtrl.assign
);
router.delete(
  '/forms/:id/assignments/:assignmentId',
  requirePermission(P.FORMS_ASSIGN),
  formCtrl.unassign
);

/* ----------------------------- submissions ------------------------------- */
/* Static segments before /:id. */
router.get(
  '/submissions/stats',
  requirePermission(P.SUBMISSIONS_VIEW),
  validateQuery(sub.statsSchema),
  submissionCtrl.stats
);
router.post(
  '/submissions/bulk',
  requirePermission(P.SUBMISSIONS_APPROVE),
  validateBody(sub.bulkSchema),
  submissionCtrl.bulk
);

router.get(
  '/submissions',
  requirePermission(P.SUBMISSIONS_VIEW),
  validateQuery(sub.listSchema),
  submissionCtrl.list
);
router.get(
  '/submissions/export',
  requirePermission(P.SUBMISSIONS_EXPORT),
  validateQuery(sub.exportSchema),
  reportCtrl.exportSubmissions
);
router.get('/submissions/:id', requirePermission(P.SUBMISSIONS_VIEW), submissionCtrl.getOne);

router.post(
  '/submissions/:id/approve',
  requirePermission(P.SUBMISSIONS_APPROVE),
  validateBody(sub.approveSchema),
  submissionCtrl.approve
);
router.post(
  '/submissions/:id/request-correction',
  requirePermission(P.SUBMISSIONS_APPROVE),
  validateBody(sub.correctionSchema),
  submissionCtrl.requestCorrection
);
router.post(
  '/submissions/:id/reject',
  requirePermission(P.SUBMISSIONS_APPROVE),
  validateBody(sub.rejectSchema),
  submissionCtrl.reject
);
router.patch(
  '/submissions/:id/data',
  requirePermission(P.SUBMISSIONS_EDIT),
  validateBody(sub.editSchema),
  submissionCtrl.editData
);
router.post(
  '/submissions/:id/dismiss-duplicate',
  requirePermission(P.SUBMISSIONS_APPROVE),
  submissionCtrl.dismissDuplicate
);

/* ------------------------------- lots ------------------------------------ */
/* Static segments before /:id. */
router.get(
  '/lots/eligible',
  requirePermission(P.LOTS_CREATE),
  validateQuery(lot.eligibleSchema),
  lotCtrl.eligible
);
router.get('/lots/stats', requirePermission(P.LOTS_VIEW), lotCtrl.stats);
router.post(
  '/lots/validate',
  requirePermission(P.LOTS_CREATE),
  validateBody(lot.validateSchema),
  lotCtrl.validate
);

router.get('/lots', requirePermission(P.LOTS_VIEW), validateQuery(lot.listSchema), lotCtrl.list);
router.get('/lots/:id', requirePermission(P.LOTS_VIEW), lotCtrl.getOne);
router.post(
  '/lots',
  requirePermission(P.LOTS_CREATE),
  validateBody(lot.createSchema),
  lotCtrl.create
);
router.patch(
  '/lots/:id',
  requirePermission(P.LOTS_CREATE),
  validateBody(lot.updateSchema),
  lotCtrl.update
);
router.patch('/lots/:id/ready', requirePermission(P.LOTS_CREATE), lotCtrl.markReady);
router.post(
  '/lots/:id/records',
  requirePermission(P.LOTS_CREATE),
  validateBody(lot.recordsSchema),
  lotCtrl.addRecords
);
router.delete(
  '/lots/:id/records',
  requirePermission(P.LOTS_CREATE),
  validateBody(lot.recordsSchema),
  lotCtrl.removeRecords
);

/* Sending to production is its own permission - a reviewer may assemble a lot
   but not commit it to the factory. */
router.post(
  '/lots/:id/submit',
  requirePermission(P.LOTS_SUBMIT),
  validateBody(lot.submitSchema),
  lotCtrl.submitLot
);
router.post(
  '/lots/:id/cancel',
  requirePermission(P.LOTS_SUBMIT),
  validateBody(lot.cancelSchema),
  lotCtrl.cancel
);

/* ------------------------------- proofs ---------------------------------- */
router.get(
  '/proofs',
  requirePermission(P.PROOFS_VIEW),
  validateQuery(proof.listSchema),
  proofCtrl.clientList
);
router.get('/proofs/:id', requirePermission(P.PROOFS_VIEW), proofCtrl.clientGet);

/* Approving a proof authorises MR Print World to spend materials, so it is
   its own permission - a reviewer may look without being able to sign off. */
router.post(
  '/proofs/:id/decision',
  requirePermission(P.PROOFS_APPROVE),
  validateBody(proof.decisionSchema),
  proofCtrl.decide
);

/* ------------------------ reports & exports ------------------------------ */
router.get('/reports', requirePermission(P.REPORTS_VIEW), reportCtrl.clientReports);

/* The full print package - data plus every photograph. Exporting personal
   data is its own permission and is always written to the audit log. */
router.get('/lots/:id/export', requirePermission(P.SUBMISSIONS_EXPORT), reportCtrl.exportLotForClient);

module.exports = router;
