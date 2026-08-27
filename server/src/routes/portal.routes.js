const express = require('express');
const portalCtrl = require('../controllers/portal.controller');
const cardCtrl = require('../controllers/cardDesign.controller');
const {
  authenticate,
  requirePermission,
  blockIfPasswordChangeRequired,
} = require('../middleware/auth');
const { stripClientTenant, requireTenant } = require('../middleware/tenant');
const { validateBody } = require('../middleware/validate');
const { singleDocument } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const v = require('../validators/portal.validator');
const { PERMISSIONS: P } = require('../constants/permissions');

const router = express.Router();

/**
 * The end-user portal.
 *
 * Guarded by SELF_* permissions, which only END_USER holds. Every handler
 * additionally scopes to `req.user._id` - being in the right tenant is not
 * enough to read someone else's record.
 */
router.use(authenticate, blockIfPasswordChangeRequired, stripClientTenant, requireTenant);

router.get('/forms', requirePermission(P.SELF_VIEW), portalCtrl.myForms);
router.get('/forms/:id', requirePermission(P.SELF_VIEW), portalCtrl.getForm);

router.put(
  '/forms/:id/draft',
  requirePermission(P.SELF_SUBMIT),
  validateBody(v.draftSchema),
  portalCtrl.saveDraft
);
router.post(
  '/forms/:id/submit',
  requirePermission(P.SELF_SUBMIT),
  validateBody(v.submitSchema),
  portalCtrl.submit
);

router.post(
  '/forms/:id/upload/:fieldKey',
  requirePermission(P.SELF_SUBMIT),
  uploadLimiter,
  singleDocument('file'),
  portalCtrl.uploadFile
);
router.delete(
  '/forms/:id/upload/:fieldKey',
  requirePermission(P.SELF_SUBMIT),
  portalCtrl.removeFile
);

/**
 * The card layout for a form, so the portal can draw a live preview while
 * someone fills it in. Returns layout only - never another person's values -
 * and only when the design is active, so drafts stay invisible here.
 */
router.get('/forms/:formId/card-design', requirePermission(P.SELF_VIEW), cardCtrl.forPortal);

router.get('/submissions', requirePermission(P.SELF_VIEW), portalCtrl.mySubmissions);
router.get('/submissions/:id', requirePermission(P.SELF_VIEW), portalCtrl.mySubmission);

/** The print-accurate render of the signed-in person's own card. */
router.get('/submissions/:id/card', requirePermission(P.SELF_VIEW), cardCtrl.myCard);

module.exports = router;
