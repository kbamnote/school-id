const express = require('express');
const ctrl = require('../controllers/auth.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const schemas = require('../validators/auth.validator');

const router = express.Router();

/* Credential endpoints carry the tight rate limiter. */
router.post('/login', authLimiter, validateBody(schemas.loginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', optionalAuth, ctrl.logout);

router.post(
  '/forgot-password',
  authLimiter,
  validateBody(schemas.forgotPasswordSchema),
  ctrl.forgotPassword
);
router.post(
  '/reset-password',
  authLimiter,
  validateBody(schemas.resetPasswordSchema),
  ctrl.resetPassword
);

router.get('/me', authenticate, ctrl.me);
router.post(
  '/change-password',
  authenticate,
  validateBody(schemas.changePasswordSchema),
  ctrl.changePassword
);

module.exports = router;
