const crypto = require('crypto');

/** URL-safe slug used for organisation and form public links. */
function slugify(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Zero-padded sequence suffix, e.g. seq 24 + prefix STU -> STU00024. */
function padSequence(prefix, seq, width = 5) {
  return `${prefix}${String(seq).padStart(width, '0')}`;
}

const AMBIGUOUS_FREE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Human-typable temporary password. Excludes look-alike characters (0/O, 1/l/I)
 * because these get printed on slips and read aloud to students/staff.
 */
function generatePassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += AMBIGUOUS_FREE[bytes[i] % AMBIGUOUS_FREE.length];
  }
  return out;
}

/** Cryptographically-random opaque token (form links, password resets). */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** One-way hash for storing link/reset tokens - the raw token is never persisted. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Stable hash of selected submission values, used for duplicate detection. */
function fingerprint(values = []) {
  const normalised = values
    .map((v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

module.exports = {
  slugify,
  padSequence,
  generatePassword,
  randomToken,
  hashToken,
  fingerprint,
};
