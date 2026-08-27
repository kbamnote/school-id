const ApiError = require('../utils/ApiError');
const { assertObjectId } = require('../utils/query');

/**
 * Tenant isolation - layer 3.
 *
 * Layer 1 is the required `organization` field on every tenant model.
 * Layer 2 is `req.tenantId`, derived only from the verified JWT (see auth.js).
 * This file is layer 3: it strips any tenant identifier the client tried to
 * supply, and force-injects the trusted one into every query.
 */

/**
 * Removes organisation identifiers from anything client-controlled, so a
 * handler physically cannot read an attacker-supplied tenant id even by
 * mistake. Platform staff are exempt because they legitimately act across
 * tenants - but only through the explicit helpers below.
 */
function stripClientTenant(req, res, next) {
  if (req.isPlatformUser) return next();

  const KEYS = ['organization', 'organizationId', 'org', 'orgId', 'tenantId'];
  for (const key of KEYS) {
    if (req.body && key in req.body) delete req.body[key];
    if (req.query && key in req.query) delete req.query[key];
  }
  return next();
}

/** Rejects a tenant-scoped route reached by a user with no organisation. */
function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return next(
      ApiError.forbidden('This endpoint is scoped to a client organisation.', {
        code: 'NO_TENANT_CONTEXT',
      })
    );
  }
  return next();
}

/**
 * Builds the mandatory scope fragment for a query.
 *
 * Platform staff may target a specific tenant via `?organizationId=`, and only
 * they can - for a client user the parameter was already deleted above, and
 * their own tenant id is used regardless of what they sent.
 */
function tenantScope(req) {
  if (req.isPlatformUser) {
    const requested = req.query?.organizationId || req.params?.organizationId;
    if (requested) {
      assertObjectId(requested, 'organizationId');
      return { organization: requested };
    }
    return {}; // platform-wide view
  }

  if (!req.tenantId) {
    throw ApiError.forbidden('No tenant context available for this request.');
  }
  return { organization: req.tenantId };
}

/**
 * Fetches one document with the tenant scope applied.
 *
 * A cross-tenant hit returns 404, NOT 403: a 403 would confirm the record
 * exists, which itself leaks the existence of another client's data.
 */
async function findScoped(Model, id, req, { select, populate, lean = false } = {}) {
  assertObjectId(id, 'id');

  let query = Model.findOne({ _id: id, ...tenantScope(req) });
  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  if (lean) query = query.lean();

  const doc = await query;
  if (!doc) {
    throw ApiError.notFound(`${Model.modelName} not found`);
  }
  return doc;
}

/** Stamps the trusted tenant id onto a document being created. */
function withTenant(req, payload = {}) {
  const organization = req.isPlatformUser
    ? payload.organization || req.body?.organization || null
    : req.tenantId;

  if (!organization) {
    throw ApiError.badRequest('An organisation must be specified for this record.');
  }
  return { ...payload, organization };
}

module.exports = { stripClientTenant, requireTenant, tenantScope, findScoped, withTenant };
