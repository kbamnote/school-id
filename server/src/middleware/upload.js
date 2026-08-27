const multer = require('multer');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Uploads are buffered in memory, not written to disk by multer.
 *
 * That keeps a rejected file from ever touching the filesystem, and lets the
 * storage layer re-encode images (stripping EXIF and neutralising polyglots)
 * before anything is persisted.
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_TYPES = ['application/pdf'];
const SHEET_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/**
 * Magic-number signatures.
 *
 * The browser-supplied mimetype and the file extension are both attacker
 * controlled, so neither is trusted on its own - the first bytes of the buffer
 * have to agree.
 */
const SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  // xlsx/docx are zip containers
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/vnd.ms-excel', bytes: [0xd0, 0xcf, 0x11, 0xe0] },
];

function matchesSignature(buffer, mimetype) {
  if (mimetype === 'image/webp') {
    // RIFF....WEBP
    return (
      buffer.length > 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  // CSV is plain text and has no signature; it is validated when parsed.
  if (mimetype === 'text/csv') return true;

  const sig = SIGNATURES.find((s) => s.mime === mimetype);
  if (!sig) return false;
  if (buffer.length < sig.bytes.length) return false;
  return sig.bytes.every((byte, i) => buffer[i] === byte);
}

function buildUploader(allowedTypes, maxMb = env.storage.maxMb) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxMb * 1024 * 1024,
      files: 1,
      // Caps multipart text fields so a form post cannot be used to exhaust memory.
      fields: 40,
      fieldSize: 1024 * 100,
    },
    fileFilter(req, file, cb) {
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(
          ApiError.badRequest(
            `Unsupported file type. Allowed: ${allowedTypes
              .map((t) => t.split('/')[1])
              .join(', ')}`,
            { code: 'UNSUPPORTED_FILE_TYPE' }
          )
        );
      }
      return cb(null, true);
    },
  });
}

/**
 * Runs after multer: confirms the bytes actually match the declared type.
 * A .png that is really an HTML file with a script tag fails here.
 */
function verifySignature(req, res, next) {
  const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : [];
  for (const file of files) {
    if (!matchesSignature(file.buffer, file.mimetype)) {
      return next(
        ApiError.badRequest(
          `The contents of "${file.originalname}" do not match its file type.`,
          { code: 'FILE_CONTENT_MISMATCH' }
        )
      );
    }
  }
  return next();
}

const imageUpload = buildUploader(IMAGE_TYPES);
const documentUpload = buildUploader([...IMAGE_TYPES, ...DOC_TYPES]);
const sheetUpload = buildUploader(SHEET_TYPES, 12);

/** Single image field + signature verification, as one middleware chain. */
const singleImage = (field) => [imageUpload.single(field), verifySignature];
const singleDocument = (field) => [documentUpload.single(field), verifySignature];
const singleSheet = (field) => [sheetUpload.single(field), verifySignature];

module.exports = {
  IMAGE_TYPES,
  DOC_TYPES,
  SHEET_TYPES,
  imageUpload,
  documentUpload,
  sheetUpload,
  verifySignature,
  singleImage,
  singleDocument,
  singleSheet,
};
