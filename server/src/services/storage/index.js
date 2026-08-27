const { env } = require('../../config/env');
const logger = require('../../utils/logger');
const localDriver = require('./local.driver');
const cloudinaryDriver = require('./cloudinary.driver');

/**
 * Storage abstraction.
 *
 * Every upload in the system goes through this one interface, so switching
 * between local disk and Cloudinary (or adding S3 later) is a config change
 * rather than a rewrite. Nothing outside this folder may touch `fs` or the
 * cloudinary SDK directly.
 *
 * Driver contract:
 *   save(buffer, { folder, filename, mimetype, transform }) -> { url, publicId, provider, bytes, width, height, format }
 *   remove(publicId) -> void
 *   signedUrl(publicId, opts) -> string | null
 *   read(publicId) -> Buffer
 */
const DRIVERS = {
  local: localDriver,
  cloudinary: cloudinaryDriver,
};

function driver() {
  const chosen = DRIVERS[env.storage.driver];
  if (!chosen) {
    throw new Error(
      `Unknown STORAGE_DRIVER "${env.storage.driver}". Expected one of: ${Object.keys(DRIVERS).join(', ')}`
    );
  }
  return chosen;
}

async function save(buffer, options) {
  return driver().save(buffer, options);
}

/**
 * Deleting a file must never break the business action that triggered it -
 * an orphaned blob is a far smaller problem than a failed request, and the
 * failure is logged for cleanup.
 */
async function remove(publicId) {
  if (!publicId) return;
  try {
    await driver().remove(publicId);
  } catch (err) {
    logger.error('Failed to remove stored file', { publicId, message: err.message });
  }
}

function signedUrl(publicId, opts) {
  return driver().signedUrl(publicId, opts);
}

/**
 * Reads a stored asset back as a buffer.
 *
 * Dispatches on the PROVIDER RECORDED WITH THE FILE, not the currently
 * configured driver. Once an organisation switches to Cloudinary its older
 * files are still on local disk, and reading them through the new driver
 * would fail - silently, in the case of card rendering, which would then
 * composite a blank card rather than raise.
 */
async function read(publicId, provider) {
  if (!publicId) throw new Error('read() requires a publicId');
  const chosen = provider ? DRIVERS[provider] : driver();
  if (!chosen) throw new Error(`Unknown storage provider "${provider}"`);
  if (typeof chosen.read !== 'function') {
    throw new Error(`Storage driver "${provider || env.storage.driver}" cannot read files back`);
  }
  return chosen.read(publicId);
}

function activeDriver() {
  return env.storage.driver;
}

module.exports = { save, remove, signedUrl, read, activeDriver };
