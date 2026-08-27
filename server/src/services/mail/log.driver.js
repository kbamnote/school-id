const logger = require('../../utils/logger');

/**
 * Writes the message to the server log instead of sending it.
 *
 * The default driver, so a fresh checkout can exercise password resets and
 * notification emails with no external account. Anything printed here would
 * have gone to a real inbox in production - never log message bodies that
 * contain secrets beyond the one-time links this system already logs.
 */
async function send({ to, subject, text }) {
  logger.info('[mail:log] message not sent - MAIL_DRIVER=log', {
    to,
    subject,
    preview: String(text || '').slice(0, 300),
  });
}

module.exports = { send };
