const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

const REFRESH_COOKIE = 'mrpw_rt';

/**
 * Access token payload is intentionally minimal: identity + the tenant it is
 * scoped to. Permissions are NOT embedded - they are resolved from the live
 * user on each request, so revoking access takes effect immediately instead of
 * waiting for the token to expire.
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      org: user.organization ? String(user.organization) : null,
      tv: user.tokenVersion,
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpires, issuer: 'mrpw-printdata' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user._id), tv: user.tokenVersion },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpires, issuer: 'mrpw-printdata' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { issuer: 'mrpw-printdata' });
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.jwt.refreshSecret, { issuer: 'mrpw-printdata' });
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.', {
      code: 'REFRESH_INVALID',
    });
  }
}

/** Converts `7d` / `15m` / `30s` into milliseconds for the cookie maxAge. */
function durationToMs(value) {
  const match = /^(\d+)([smhd])$/.exec(String(value).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return n * unit;
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true, // unreadable from JS, so XSS cannot steal the long-lived token
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/api/auth',  // never sent to any other endpoint
    maxAge: durationToMs(env.jwt.refreshExpires),
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/api/auth',
  });
}

module.exports = {
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  durationToMs,
};
