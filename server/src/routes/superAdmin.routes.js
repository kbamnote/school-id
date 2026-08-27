const express = require('express');
const ApiError = require('../utils/ApiError');
const orgCtrl = require('../controllers/organization.controller');
const planCtrl = require('../controllers/plan.controller');
const jobCtrl = require('../controllers/job.controller');
const proofCtrl = require('../controllers/proof.controller');
const reportCtrl = require('../controllers/report.controller');
const dashboardCtrl = require('../controllers/platformDashboard.controller');
const { authenticate, requirePlatform, requirePermission, blockIfPasswordChangeRequired } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { singleImage, singleDocument } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const orgSchemas = require('../validators/organization.validator');
const planSchemas = require('../validators/plan.validator');
const jobSchemas = require('../validators/job.validator');
const proofSchemas = require('../validators/proof.validator');
const { PERMISSIONS: P } = require('../constants/permissions');
const auditCtrl = require('../controllers/audit.controller');
const activity = require('../validators/activity.validator');

const router = express.Router();

/**
 * Everything under /api/super-admin belongs to MR Print World.
 *
 * `requirePlatform` is applied once at the router level rather than per-route,
 * so a new endpoint added here cannot accidentally be left unguarded.
 */
router.use(authenticate, blockIfPasswordChangeRequired, requirePlatform);

/* --------------------------------- audit --------------------------------- */
/* Static segment before anything dynamic. */
router.get('/audit/actions', requirePermission(P.AUDIT_VIEW), auditCtrl.actions);
router.get(
  '/audit',
  requirePermission(P.AUDIT_VIEW),
  validateQuery(activity.auditListSchema),
  auditCtrl.listForPlatform
);

/* ------------------------------ dashboard -------------------------------- */
router.get('/dashboard', dashboardCtrl.summary);

/* ------------------------------- clients --------------------------------- */
router.get(
  '/organizations',
  requirePermission(P.CLIENT_VIEW),
  validateQuery(orgSchemas.listSchema),
  orgCtrl.list
);
router.get('/organizations/stats', requirePermission(P.CLIENT_VIEW), orgCtrl.listStats);
router.get('/organizations/:id', requirePermission(P.CLIENT_VIEW), orgCtrl.getOne);

router.post(
  '/organizations',
  requirePermission(P.CLIENT_MANAGE),
  validateBody(orgSchemas.createSchema),
  orgCtrl.create
);
router.patch(
  '/organizations/:id',
  requirePermission(P.CLIENT_MANAGE),
  validateBody(orgSchemas.updateSchema),
  orgCtrl.update
);
router.patch(
  '/organizations/:id/status',
  requirePermission(P.CLIENT_MANAGE),
  validateBody(orgSchemas.statusSchema),
  orgCtrl.changeStatus
);
router.put(
  '/organizations/:id/subscription',
  requirePermission(P.CLIENT_MANAGE),
  validateBody(orgSchemas.subscriptionSchema),
  orgCtrl.updateSubscription
);
router.post(
  '/organizations/:id/logo',
  requirePermission(P.CLIENT_MANAGE),
  uploadLimiter,
  singleImage('logo'),
  orgCtrl.uploadLogo
);

/* -------------------------------- plans ---------------------------------- */
router.get('/plans', planCtrl.list);
router.post(
  '/plans',
  requirePermission(P.PLAN_MANAGE),
  validateBody(planSchemas.createSchema),
  planCtrl.create
);
router.patch(
  '/plans/:id',
  requirePermission(P.PLAN_MANAGE),
  validateBody(planSchemas.updateSchema),
  planCtrl.update
);
router.delete('/plans/:id', requirePermission(P.PLAN_MANAGE), planCtrl.remove);

/* ----------------------------- print jobs -------------------------------- */
/* Static segments before /:id. */
router.get('/jobs/stats', requirePermission(P.JOBS_VIEW), jobCtrl.stats);
router.get('/jobs/pipeline', requirePermission(P.JOBS_VIEW), jobCtrl.pipeline);
router.get('/jobs/operators', requirePermission(P.JOBS_VIEW), jobCtrl.operators);

router.get(
  '/jobs',
  requirePermission(P.JOBS_VIEW),
  validateQuery(jobSchemas.listSchema),
  jobCtrl.list
);
router.get('/jobs/:id', requirePermission(P.JOBS_VIEW), jobCtrl.getOne);

router.patch(
  '/jobs/:id',
  requirePermission(P.JOBS_MANAGE),
  validateBody(jobSchemas.updateSchema),
  jobCtrl.update
);
router.patch(
  '/jobs/:id/status',
  requirePermission(P.JOBS_MANAGE),
  validateBody(jobSchemas.statusSchema),
  jobCtrl.changeStatus
);
router.patch(
  '/jobs/:id/assign',
  requirePermission(P.JOBS_MANAGE),
  validateBody(jobSchemas.assignSchema),
  jobCtrl.assign
);
router.post(
  '/jobs/:id/data-issue',
  requirePermission(P.JOBS_MANAGE),
  validateBody(jobSchemas.dataIssueSchema),
  jobCtrl.raiseDataIssue
);

/* ------------------------------- proofs ---------------------------------- */
router.get(
  '/proofs',
  requirePermission(P.PROOFS_VIEW),
  validateQuery(proofSchemas.listSchema),
  proofCtrl.platformList
);
router.get('/jobs/:id/proofs', requirePermission(P.PROOFS_VIEW), proofCtrl.jobProofs);
router.post(
  '/jobs/:id/proofs',
  requirePermission(P.PROOFS_UPLOAD),
  uploadLimiter,
  singleDocument('file'),
  validateBody(proofSchemas.uploadSchema),
  proofCtrl.upload
);

/* ------------------------ reports & exports ------------------------------ */
router.get('/reports', requirePermission(P.REPORTS_VIEW), reportCtrl.platformReports);
router.get('/jobs/:id/export', requirePermission(P.JOBS_EXPORT), reportCtrl.exportJobPackage);

/**
 * Anything unmatched under /super-admin stops here.
 *
 * Without this the request falls through to the tenant-scoped client router
 * mounted at '/', which answers "This endpoint is scoped to a client
 * organisation" - a confusing 403 for what is really a typo, and misleading
 * for platform staff, who correctly have no tenant.
 */
router.use((req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} /api/super-admin${req.path}`));
});

module.exports = router;
