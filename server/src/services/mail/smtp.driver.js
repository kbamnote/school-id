const { env } = require('../../config/env');

/**
 * Real SMTP delivery.
 *
 * `nodemailer` is required lazily so the package is only needed by
 * deployments that actually set MAIL_DRIVER=smtp - the default `log` driver
 * must keep working in an install that never added the dependency.
 */
let transport = null;

function getTransport() {
  if (transport) return transport;

  let nodemailer;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    nodemailer = require('nodemailer');
  } catch {
    throw new Error(
      'MAIL_DRIVER=smtp requires the "nodemailer" package. Run: npm install nodemailer'
    );
  }

  const { host, port, secure, user, pass } = env.mail.smtp;
  transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return transport;
}

async function send({ from, to, subject, text, html }) {
  await getTransport().sendMail({ from, to, subject, text, html });
}

module.exports = { send };
