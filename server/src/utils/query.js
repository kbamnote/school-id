const { Types } = require('mongoose');
const ApiError = require('./ApiError');

const MAX_LIMIT = 100;

/** Normalises ?page & ?limit into safe numbers. Caps limit so a client can't ask for the whole DB. */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || 20;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Builds a mongo sort object from `?sort=-createdAt,name`.
 * `allowed` is a whitelist - an un-listed field is ignored rather than trusted,
 * which stops sort-based probing of unindexed/internal fields.
 */
function parseSort(query, allowed = [], fallback = { createdAt: -1 }) {
  if (!query.sort) return fallback;
  const sort = {};
  for (const raw of String(query.sort).split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const desc = token.startsWith('-');
    const field = desc ? token.slice(1) : token;
    if (allowed.includes(field)) sort[field] = desc ? -1 : 1;
  }
  return Object.keys(sort).length ? sort : fallback;
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** Escapes user input before it is used inside a RegExp (prevents ReDoS / operator injection). */
function escapeRegex(str = '') {
  return String(str).replace(REGEX_SPECIALS, (match) => `\\${match}`);
}

/** Case-insensitive "contains" search across several fields. */
function buildSearch(term, fields = []) {
  if (!term || !fields.length) return null;
  const rx = new RegExp(escapeRegex(String(term).trim()), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

/** Merges filter fragments, dropping empties, into a single mongo filter. */
function mergeFilters(...fragments) {
  const parts = fragments.filter((f) => f && Object.keys(f).length);
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/** Validates an :id param up front so a malformed id is a clean 400, not a cast error. */
function assertObjectId(id, label = 'id') {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
  return id;
}

module.exports = {
  MAX_LIMIT,
  parsePagination,
  parseSort,
  buildSearch,
  mergeFilters,
  escapeRegex,
  assertObjectId,
};
