const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const { randomToken } = require('../utils/strings');
const authService = require('../services/auth.service');
const mailer = require('../services/mail');
const tokenService = require('../services/token.service');
const audit = require('../services/audit.service');
const logger = require('../utils/logger');

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { loginId, password, organizationSlug } = req.body;

  let user;
  try {
    user = await authService.authenticateCredentials({ loginId, password, organizationSlug });
  } catch (err) {
    await audit.record(req, {
      action: audit.ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'User',
      entityLabel: String(loginId || '').slice(0, 80),
      description: `Failed sign-in attempt for "${loginId}"`,
      severity: 'warning',
      organization: null,
    });
    throw err;
  }

  const full = await authService.loadFullUser(user._id);

  tokenService.setRefreshCookie(res, tokenService.signRefreshToken(full));

  await audit.record(
    { ...req, user: full, tenantId: full.organization?._id || null },
    {
      action: audit.ACTIONS.AUTH_LOGIN,
      entityType: 'User',
      entity: full._id,
      entityLabel: full.loginId || full.email,
      description: `${full.name} signed in`,
      organization: full.organization?._id || null,
    }
  );

  return ok(
    res,
    {
      accessToken: tokenService.signAccessToken(full),
      user: authService.publicUser(full),
    },
    'Signed in successfully'
  );
});

/**
 * POST /api/auth/refresh
 * Rotates the refresh cookie on every use so a stolen cookie has a short life.
 */
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[tokenService.REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No active session', { code: 'NO_SESSION' });

  const payload = tokenService.verifyRefreshToken(token);
  const user = await authService.loadFullUser(payload.sub);

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.tokenVersion !== payload.tv) {
    tokenService.clearRefreshCookie(res);
    throw ApiError.unauthorized('Your session was ended. Please sign in again.', {
      code: 'SESSION_REVOKED',
    });
  }
  if (user.status !== 'active') {
    tokenService.clearRefreshCookie(res);
    throw ApiError.forbidden('This account is no longer active.');
  }

  tokenService.setRefreshCookie(res, tokenService.signRefreshToken(user));

  return ok(
    res,
    {
      accessToken: tokenService.signAccessToken(user),
      user: authService.publicUser(user),
    },
    'Session refreshed'
  );
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  tokenService.clearRefreshCookie(res);
  if (req.user) {
    await audit.record(req, {
      action: audit.ACTIONS.AUTH_LOGOUT,
      entityType: 'User',
      entity: req.user._id,
      entityLabel: req.user.loginId || req.user.email,
      description: `${req.user.name} signed out`,
    });
  }
  return ok(res, null, 'Signed out');
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) =>
  ok(res, { user: authService.publicUser(req.user) })
);

/** POST /api/auth/change-password */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect', {
      code: 'WRONG_PASSWORD',
      details: [{ field: 'currentPassword', message: 'Incorrect password' }],
    });
  }
  if (currentPassword === newPassword) {
    throw ApiError.badRequest('Your new password must be different from the current one', {
      details: [{ field: 'newPassword', message: 'Choose a different password' }],
    });
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  // Invalidates every existing token for this account, everywhere.
  user.tokenVersion += 1;
  await user.save();

  // The caller's own session is now stale too - reissue it so they stay signed in.
  const full = await authService.loadFullUser(user._id);
  tokenService.setRefreshCookie(res, tokenService.signRefreshToken(full));

  await audit.record(req, {
    action: audit.ACTIONS.AUTH_PASSWORD_CHANGED,
    entityType: 'User',
    entity: user._id,
    entityLabel: user.loginId || user.email,
    description: `${user.name} changed their password`,
    severity: 'warning',
  });

  return ok(
    res,
    {
      accessToken: tokenService.signAccessToken(full),
      user: authService.publicUser(full),
    },
    'Password updated'
  );
});

/**
 * POST /api/auth/forgot-password
 * Always reports success - a different response for an unknown address would
 * turn this endpoint into an account-enumeration oracle.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() });

  const GENERIC = 'If that email is registered, a password reset link has been sent.';

  if (!user) return ok(res, null, GENERIC);

  const rawToken = randomToken(32);
  user.setResetToken(rawToken, 30);
  await user.save({ validateBeforeSave: false });

  const link = mailer.absoluteUrl(`/reset-password?token=${rawToken}`);

  await mailer.send({
    to: user.email,
    subject: 'Reset your MR Print World password',
    text:
      `Hello ${user.name},\n\n` +
      `Use this link to set a new password. It expires in 30 minutes.\n\n${link}\n\n` +
      'If you did not ask for this, you can ignore this email - your password has not changed.\n',
  });

  return ok(res, null, GENERIC);
});

/** POST /api/auth/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await authService.findByResetToken(token);
  if (!user) {
    throw ApiError.badRequest('This reset link is invalid or has expired.', {
      code: 'RESET_TOKEN_INVALID',
    });
  }

  user.password = password;
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  user.mustChangePassword = false;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.tokenVersion += 1;
  await user.save();

  await audit.record(req, {
    action: audit.ACTIONS.AUTH_PASSWORD_RESET,
    entityType: 'User',
    entity: user._id,
    entityLabel: user.loginId || user.email,
    description: `Password reset completed for ${user.name}`,
    severity: 'warning',
    organization: user.organization || null,
  });

  return ok(res, null, 'Password reset. You can now sign in.');
});

module.exports = {
  login,
  refresh,
  logout,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
};
