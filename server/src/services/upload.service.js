const Upload = require('../models/Upload');
const storage = require('./storage');
const logger = require('../utils/logger');

/**
 * Stores a file AND records it.
 *
 * Every upload must go through here rather than calling the storage driver
 * directly: the Upload record is what the authenticated /api/files route uses
 * to decide who may see the blob. A file saved without a record is
 * unreachable - which is exactly the bug this function exists to prevent.
 */
async function store(file, { organization, kind = 'misc', uploadedBy, isPublic = false, folder, transform } = {}) {
  const stored = await storage.save(file.buffer, {
    folder: folder || `${kind}/${organization || 'platform'}`,
    filename: file.originalname,
    mimetype: file.mimetype,
    transform,
  });

  const record = await Upload.create({
    organization: organization || null,
    provider: stored.provider,
    publicId: stored.publicId,
    url: stored.url,
    kind,
    originalName: file.originalname,
    mimetype: file.mimetype,
    bytes: stored.bytes,
    width: stored.width,
    height: stored.height,
    isPublic,
    uploadedBy: uploadedBy || null,
  });

  return { upload: record, stored };
}

/**
 * Removes a stored file and its record.
 * Never throws - a failed cleanup must not roll back the action that caused it.
 */
async function destroy(publicId) {
  if (!publicId) return;
  try {
    await Upload.deleteOne({ publicId });
    await storage.remove(publicId);
  } catch (err) {
    logger.error('Failed to destroy upload', { publicId, message: err.message });
  }
}

/** Flags a file for later sweeping when its owning record is deleted. */
async function markOrphaned(publicId) {
  if (!publicId) return;
  await Upload.updateOne({ publicId }, { $set: { orphanedAt: new Date() } }).catch(() => {});
}

module.exports = { store, destroy, markOrphaned };
