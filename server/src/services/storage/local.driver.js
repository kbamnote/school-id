const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { env } = require('../../config/env');

const ROOT = path.resolve(__dirname, '../../../uploads');

/**
 * Builds a safe absolute path inside the uploads root.
 *
 * `folder` and `filename` are rejected outright if they contain traversal
 * segments, and the resolved path is verified to still sit under ROOT. Both
 * checks matter: the first catches the obvious `../`, the second catches
 * anything the first missed (symlinks, encoded separators, absolute paths).
 */
function safePath(folder = '', filename = '') {
  const parts = [folder, filename].filter(Boolean).join('/');
  if (parts.includes('..') || path.isAbsolute(parts) || /[\0]/.test(parts)) {
    throw new Error('Unsafe storage path');
  }
  const resolved = path.resolve(ROOT, folder, filename);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error('Path escapes the uploads directory');
  }
  return resolved;
}

/** Stored names are random - never the user's filename, which is attacker-controlled. */
function generateName(mimetype, requested) {
  const ext =
    (requested && path.extname(requested).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10)) ||
    `.${(mimetype.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8)}`;
  return `${crypto.randomUUID()}${ext.startsWith('.') ? ext : `.${ext}`}`;
}

async function save(buffer, { folder = 'misc', filename, mimetype = 'application/octet-stream', transform } = {}) {
  const isImage = mimetype.startsWith('image/');
  let output = buffer;
  let width = null;
  let height = null;
  let format = null;

  if (isImage) {
    // Re-encoding through sharp also strips EXIF (including GPS coordinates
    // from phone photos) and neutralises polyglot files that pretend to be images.
    let pipeline = sharp(buffer, { failOn: 'error' }).rotate();

    if (transform?.width || transform?.height) {
      pipeline = pipeline.resize({
        width: transform.width,
        height: transform.height,
        fit: transform.fit || 'cover',
        position: transform.position || 'centre',
        withoutEnlargement: true,
      });
    }

    const meta = await sharp(buffer).metadata();
    format = meta.format;
    pipeline =
      meta.format === 'png'
        ? pipeline.png({ compressionLevel: 9 })
        : pipeline.jpeg({ quality: transform?.quality || 88, mozjpeg: true });

    const result = await pipeline.toBuffer({ resolveWithObject: true });
    output = result.data;
    width = result.info.width;
    height = result.info.height;
    format = result.info.format;
  }

  const name = generateName(mimetype, filename);
  const dir = safePath(folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(safePath(folder, name), output);

  const publicId = `${folder}/${name}`;
  return {
    provider: 'local',
    publicId,
    // Served through the authenticated /api/files route, never a static mount.
    url: `/api/files/${publicId}`,
    bytes: output.length,
    width,
    height,
    format,
  };
}

async function remove(publicId) {
  const idx = String(publicId).lastIndexOf('/');
  const folder = idx === -1 ? '' : publicId.slice(0, idx);
  const filename = idx === -1 ? publicId : publicId.slice(idx + 1);
  await fs.unlink(safePath(folder, filename)).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
}

/** Local files are always served through the authorised route, so there is no signing. */
function signedUrl(publicId) {
  return `/api/files/${publicId}`;
}

/** Reads a stored file for the authorised download route. */
async function read(publicId) {
  const idx = String(publicId).lastIndexOf('/');
  const folder = idx === -1 ? '' : publicId.slice(0, idx);
  const filename = idx === -1 ? publicId : publicId.slice(idx + 1);
  return fs.readFile(safePath(folder, filename));
}

module.exports = { save, remove, signedUrl, read, ROOT, safePath, maxMb: env.storage.maxMb };
