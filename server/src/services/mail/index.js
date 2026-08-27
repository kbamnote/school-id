const { env } = require('../../config/env');
const logger = require('../../utils/logger');
const logDriver = require('./log.driver');
const smtpDriver = require('./smtp.driver');

/**
 * Outbound email.
 *
 * Same shape as the storage abstraction: one interface, a driver chosen by
 * config, and a driver that works with no credentials so the flows that send
 * mail can be built and tested before an SMTP account exists. Nothing outside
 * this folder may talk to a mail transport directly.
 *
 * Driver contract:
 *   send({ to, subject, text, html }) -> void
 */
const DRIVERS = {
  log: logDriver,
  smtp: smtpDriver,
};

function driver() {
  const chosen = DRIVERS[env.mail.driver];
  if (!chosen) {
    throw new Error(
      `Unknown MAIL_DRIVER "${env.mail.driver}". Expected one of: ${Object.keys(DRIVERS).join(', ')}`
    );
  }
  return chosen;
}

/** Turns an in-app path into something clickable in an email. */
function absoluteUrl(path = '') {
  if (!path) return env.clientUrl;
  if (/^https?:\/\//i.test(path)) return path;
  return `${env.clientUrl.replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

/**
 * Sends one message.
 *
 * Never throws. A failed email must not roll back the action that triggered
 * it - a client whose approval succeeded should not see an error because a
 * mail server was briefly unreachable.
 */
async function send(message) {
  if (!message?.to) return false;
  try {
    await driver().send({ from: env.mail.from, ...message });
    return true;
  } catch (err) {
    logger.error('Failed to send email', { to: message.to, message: err.message });
    return false;
  }
}

function activeDriver() {
  return env.mail.driver;
}

module.exports = { send, absoluteUrl, activeDriver };
