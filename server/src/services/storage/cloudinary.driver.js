const { v2: cloudinary } = require('cloudinary');
const sharp = require('sharp');
const { env } = require('../../config/env');

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const { cloudName, apiKey, apiSecret } = env.storage.cloudinary;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  configured = true;
}

function uploadStream(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) =>
      err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

async function save(
  buffer,
  { folder = 'misc', filename, mimetype = 'application/octet-stream', transform } = {}
) {
  ensureConfigured();

  const isImage = mimetype.startsWith('image/');
  let payload = buffer;

  if (isImage) {
    // Normalise before upload: honours the EXIF orientation flag and strips
    // metadata (phone photos carry GPS coordinates) rather than trusting the
    // client to have done it.
    let pipeline = sharp(buffer, { failOn: 'error' }).rotate();
    if (transform?.width || transform?.height) {
      pipeline = pipeline.resize({
        width: transform.width,
        height: transform.height,
        fit: transform.fit || 'cover',
        withoutEnlargement: true,
      });
    }
    payload = await pipeline.toBuffer();
  }

  const result = await uploadStream(payload, {
    folder: `${env.storage.cloudinary.folder}/${folder}`,
    resource_type: isImage ? 'image' : 'auto',
    // Cloudinary derives its own public_id; the client filename is never used.
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    // Private delivery: the raw URL alone will not serve the asset.
    type: 'authenticated',
    invalidate: true,
  });

  return {
    provider: 'cloudinary',
    publicId: result.public_id,
    url: result.secure_url,
    bytes: result.bytes,
    width: result.width || null,
    height: result.height || null,
    format: result.format || null,
    version: result.version,
    resourceType: result.resource_type,
  };
}

async function remove(publicId) {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { type: 'authenticated', invalidate: true });
}

/**
 * Time-limited signed URL. Assets are uploaded as `authenticated`, so this is
 * the only way to view one - a leaked URL stops working when it expires.
 */
function signedUrl(publicId, { expiresInSeconds = 3600, transform } = {}) {
  ensureConfigured();
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    ...(transform ? { transformation: [transform] } : {}),
  });
}

/**
 * Fetches a stored asset back as a buffer, for server-side work such as
 * compositing a card. Goes through a short-lived signed URL because the
 * assets are uploaded as `authenticated` and have no public address.
 */
async function read(publicId) {
  ensureConfigured();
  const url = signedUrl(publicId, { expiresInSeconds: 120 });
  if (!url) throw new Error('Cannot sign asset for reading');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cloudinary read failed (${response.status}) for ${publicId}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

module.exports = { save, remove, signedUrl, read };
