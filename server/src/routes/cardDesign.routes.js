const express = require('express');
const ctrl = require('../controllers/cardDesign.controller');
const {
  authenticate,
  requirePermission,
  blockIfPasswordChangeRequired,
} = require('../middleware/auth');
const { stripClientTenant, requireTenant } = require('../middleware/tenant');
const { validateBody, validateQuery } = require('../middleware/validate');
const { singleImage } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const v = require('../validators/cardDesign.validator');
const { PERMISSIONS: P } = require('../constants/permissions');

const router = express.Router();

/**
 * Card designs.
 *
 * Same tenant guarantee as the other client routes: the organisation comes
 * from the verified token only, and any organisation id in the request body is
 * stripped before a handler can see it.
 */
router.use(authenticate, blockIfPasswordChangeRequired, stripClientTenant, requireTenant);

router.get('/', requirePermission(P.DESIGNS_VIEW), validateQuery(v.listSchema), ctrl.list);

/*
 * Static segments before `:id`, so "/card-designs/fonts" is never parsed as a
 * design whose id is the word "fonts".
 */
router.get('/fonts', requirePermission(P.DESIGNS_VIEW), (req, res) =>
  res.json({ success: true, data: { fonts: v.FONT_FAMILIES } })
);

router.get('/:id', requirePermission(P.DESIGNS_VIEW), ctrl.getOne);
router.get(
  '/:id/preview',
  requirePermission(P.DESIGNS_VIEW),
  validateQuery(v.previewSchema),
  ctrl.preview
);

router.post('/', requirePermission(P.DESIGNS_MANAGE), validateBody(v.createSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission(P.DESIGNS_MANAGE),
  validateBody(v.updateSchema),
  ctrl.update
);
router.post(
  '/:id/status',
  requirePermission(P.DESIGNS_MANAGE),
  validateBody(v.statusSchema),
  ctrl.setStatus
);
router.delete('/:id', requirePermission(P.DESIGNS_MANAGE), ctrl.remove);

router.post(
  '/:id/artwork',
  requirePermission(P.DESIGNS_MANAGE),
  uploadLimiter,
  ...singleImage('artwork'),
  validateBody(v.artworkSchema),
  ctrl.uploadArtwork
);
router.delete('/:id/artwork/:face', requirePermission(P.DESIGNS_MANAGE), ctrl.removeArtwork);

module.exports = router;
