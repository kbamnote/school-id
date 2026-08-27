const User = require('../models/User');

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../services/token.service');
const { PLATFORM_ROLES, ROLES } = require('../constants/roles');
const { ORG_STATUS, USER_STATUS } = require('../constants/workflow');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Authenticates the request and establishes tenant context.
 *
 * The two things this sets - `req.user` and `req.tenantId` - are derived
 * ONLY from the verified token and the live database record. Nothing the
 * client sends in params, body or query is ever consulted here. That is the
 * single most important property of the whole isolation model.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyAccessToken(token);

  const user = await User.findById(payload.sub)
    .populate('organization', 'name slug status logo settings')
    .populate('orgCategory', 'name code idPrefix')
    .populate('department', 'name code kind');

  if (!user) throw ApiError.unauthorized('Account no longer exists');

  // Password changed, or the user was force-logged-out, after this token was minted.
  if (user.tokenVersion !== payload.tv || user.passwordChangedAfter(payload.iat)) {
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.', {
      code: 'SESSION_REVOKED',
    });
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('This account has been deactivated. Contact your administrator.', {
      code: 'ACCOUNT_INACTIVE',
    });
  }

  // A suspended tenant locks out every one of its users, whatever their role.
  if (user.organization) {
    const org = user.organization;
    if (org.status === ORG_STATUS.SUSPENDED) {
      throw ApiError.forbidden(
        'Your organisation account is currently suspended. Please contact MR Print World.',
        { code: 'ORG_SUSPENDED' }
      );
    }
    if (org.status === ORG_STATUS.ARCHIVED) {
      throw ApiError.forbidden('This organisation account has been archived.', {
        code: 'ORG_ARCHIVED',
      });
    }
  }

  req.user = user;
  req.permissions = user.effectivePermissions();
  req.isPlatformUser = PLATFORM_ROLES.includes(user.role);
  // null for MR Print World staff, an ObjectId for everyone else.
  req.tenantId = user.organization ? user.organization._id : null;

  return next();
});

/** Requires one of the given SECURITY roles (never an org category). */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden('Your role does not allow this action'));
    }
    return next();
  };
}

/** Requires every listed permission. This is the default guard for routes. */
function requirePermission(...perms) {
  const needed = perms.flat();
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const held = req.permissions || [];
    const missing = needed.filter((p) => !held.includes(p));
    if (missing.length) {
      return next(
        ApiError.forbidden('You do not have permission to perform this action', {
          code: 'MISSING_PERMISSION',
          details: { required: missing },
        })
      );
    }
    return next();
  };
}

/** Requires any one of the listed permissions. */
function requireAnyPermission(...perms) {
  const options = perms.flat();
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const held = req.permissions || [];
    if (!options.some((p) => held.includes(p))) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

/** MR Print World staff only. */
const requirePlatform = requireRole(PLATFORM_ROLES);

/** Only the top-level MR Print World Super Admin. */
const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

/**
 * Optional auth for endpoints that behave differently when signed in
 * (e.g. a public form link that pre-fills for a logged-in user).
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  if (!extractToken(req)) return next();
  try {
    await new Promise((resolve, reject) =>
      authenticate(req, res, (err) => (err ? reject(err) : resolve()))
    );
  } catch {
    // A bad token on an optional route simply means "anonymous".
  }
  return next();
});

/** Blocks everything except the change-password flow until a temp password is replaced. */
const blockIfPasswordChangeRequired = (req, res, next) => {
  if (req.user?.mustChangePassword) {
    return next(
      ApiError.forbidden('You must change your password before continuing.', {
        code: 'PASSWORD_CHANGE_REQUIRED',
      })
    );
  }
  return next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  requireAnyPermission,
  requirePlatform,
  requireSuperAdmin,
  blockIfPasswordChangeRequired,
};
