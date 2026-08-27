const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const handler = (req, res) =>
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.',
    code: 'RATE_LIMITED',
  });

/**
 * Broad limiter applied to the whole /api surface.
 *
 * Keyed on the authenticated user where possible, falling back to IP.
 * A school office or company floor sits behind a single NAT address, so an
 * IP-only budget would let one busy administrator throttle all their
 * colleagues at once. Anonymous traffic still shares the per-IP budget,
 * which is what protects the unauthenticated endpoints.
 */
const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMin * 60 * 1000,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // This limiter runs before `authenticate`, so req.user does not exist yet.
    // The bearer token is used purely as a bucket label - it is never trusted
    // here, and a forged one still fails verification downstream.
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return `s:${crypto.createHash('sha256').update(header.slice(7)).digest('hex').slice(0, 32)}`;
    }
    return `ip:${req.ip}`;
  },
  handler,
});

/**
 * Tight limiter for credential endpoints. Keyed on IP + submitted identifier so
 * one attacker cannot lock out a whole office behind a shared NAT, while still
 * blocking password spraying against a single account.
 */
const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMin * 60 * 1000,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const id = String(req.body?.loginId || req.body?.email || '').toLowerCase().slice(0, 80);
    return `${req.ip}:${id}`;
  },
  handler,
});

/** Uploads are expensive - keep them on their own budget. */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
