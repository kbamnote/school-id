const path = require('node:path');
const Upload = require('../models/Upload');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const localDriver = require('../services/storage/local.driver');
const storage = require('../services/storage');
const { PERMISSIONS } = require('../constants/permissions');

/**
 * Files that belong to one individual rather than to the organisation at
 * large. These need an ownership check on top of the tenant check.
 */
const PERSONAL_KINDS = [
  'submission_photo',
  'submission_signature',
  'submission_document',
  'user_avatar',
];

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

/**
 * GET /api/files/*
 *
 * The ONLY way a stored file is served. Authorisation is re-checked here on
 * every request, because a storage URL that is guessable or shareable would
 * otherwise hand out photographs and ID documents to anyone who found it.
 */
const serve = asyncHandler(async (req, res) => {
  // Everything after /api/files/ is the provider's public id.
  const publicId = req.params[0];
  if (!publicId) throw ApiError.badRequest('No file requested');

  const upload = await Upload.findOne({ publicId });
  if (!upload) throw ApiError.notFound('File not found');

  // Public assets (an organisation logo shown on a sign-in page) skip the checks.
  if (!upload.isPublic) {
    if (!req.user) throw ApiError.unauthorized('Sign in to view this file');

    const isOwnTenant =
      upload.organization && req.tenantId && String(upload.organization) === String(req.tenantId);

    // Platform staff may view any client's file; everyone else only their own
    // tenant's. A mismatch is a 404, not a 403 - see the ApiError notes.
    if (!req.isPlatformUser && !isOwnTenant) {
      throw ApiError.notFound('File not found');
    }

    /**
     * Tenant membership is NOT sufficient for personal files.
     *
     * A photograph or signature belongs to one individual. Without this check
     * any classmate in the same organisation could fetch it, since they pass
     * the tenant test. Staff who review submissions legitimately need access,
     * so the gate is the submissions.view permission - not merely being
     * signed in to the right organisation.
     */
    if (PERSONAL_KINDS.includes(upload.kind) && !req.isPlatformUser) {
      const isOwner = upload.uploadedBy && String(upload.uploadedBy) === String(req.user._id);
      const canReview = (req.permissions || []).includes(PERMISSIONS.SUBMISSIONS_VIEW);
      if (!isOwner && !canReview) {
        throw ApiError.notFound('File not found');
      }
    }
  }

  // Cloudinary serves the bytes itself; hand back a short-lived signed URL
  // rather than proxying the file through this process.
  if (upload.provider === 'cloudinary') {
    const signed = storage.signedUrl(upload.publicId, { expiresInSeconds: 300 });
    return res.redirect(302, signed);
  }

  const buffer = await localDriver.read(upload.publicId).catch(() => null);
  if (!buffer) throw ApiError.notFound('File not found');

  const ext = path.extname(upload.publicId).toLowerCase();
  res.setHeader('Content-Type', upload.mimetype || MIME_BY_EXT[ext] || 'application/octet-stream');
  // Never let a stored file be interpreted as an inline document by the browser.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(upload.originalName || 'file')}"`
  );
  res.setHeader('Cache-Control', upload.isPublic ? 'public, max-age=86400' : 'private, max-age=0, no-store');

  return res.send(buffer);
});

module.exports = { serve };
