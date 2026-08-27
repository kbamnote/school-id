const User = require('../models/User');
const Organization = require('../models/Organization');
const ApiError = require('../utils/ApiError');
const { ORG_STATUS, USER_STATUS } = require('../constants/workflow');
const { ROLE_HOME } = require('../constants/roles');
const { hashToken } = require('../utils/strings');

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

/**
 * Shapes the user object returned to the client.
 *
 * Everything the UI needs to render is here, and nothing else - no hash, no
 * reset token, no lockout counters. This is the ONLY function that builds a
 * user payload, so there is one place to audit for leaks.
 */
function publicUser(user) {
  const org = user.organization;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    loginId: user.loginId,
    phone: user.phone,
    role: user.role,
    permissions: user.effectivePermissions(),
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    avatarUrl: user.avatar?.url || null,
    externalId: user.externalId || '',
    home: ROLE_HOME[user.role] || '/',
    organization:
      org && org._id
        ? {
            id: String(org._id),
            name: org.name,
            slug: org.slug,
            status: org.status,
            logoUrl: org.logo?.url || null,
            settings: org.settings || {},
          }
        : null,
    orgCategory: user.orgCategory?._id
      ? {
          id: String(user.orgCategory._id),
          name: user.orgCategory.name,
          code: user.orgCategory.code,
        }
      : null,
    department: user.department?._id
      ? {
          id: String(user.department._id),
          name: user.department.name,
          kind: user.department.kind,
        }
      : null,
    lastLoginAt: user.lastLoginAt,
  };
}

/**
 * Resolves a login identifier to exactly one account.
 *
 * Email is globally unique so it resolves directly. A generated loginId is only
 * unique WITHIN a tenant, so two schools can both have STU00001 - when that is
 * ambiguous we ask for the organisation rather than guessing, which would
 * otherwise let someone log into the wrong tenant's account.
 */
async function resolveLoginUser(loginId, organizationSlug) {
  const value = String(loginId || '').trim();
  if (!value) throw ApiError.badRequest('Enter your email or user ID');

  const isEmail = value.includes('@');

  if (isEmail) {
    return User.findOne({ email: value.toLowerCase() }).select(
      '+password +failedLoginAttempts +lockedUntil'
    );
  }

  let organizationId = null;
  if (organizationSlug) {
    const org = await Organization.findOne({ slug: String(organizationSlug).toLowerCase() })
      .select('_id')
      .lean();
    if (!org) throw ApiError.unauthorized('Invalid credentials');
    organizationId = org._id;
  }

  const filter = {
    loginId: value.toUpperCase(),
    ...(organizationId ? { organization: organizationId } : {}),
  };

  const matches = await User.find(filter)
    .select('+password +failedLoginAttempts +lockedUntil')
    .limit(2);

  if (matches.length > 1) {
    throw ApiError.badRequest(
      'This user ID exists in more than one organisation. Please select your organisation and try again.',
      { code: 'ORGANIZATION_REQUIRED' }
    );
  }

  return matches[0] || null;
}

/** Records a failed attempt and locks the account once the threshold is hit. */
async function registerFailedAttempt(user) {
  const attempts = (user.failedLoginAttempts || 0) + 1;
  const update = { failedLoginAttempts: attempts };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    update.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    update.failedLoginAttempts = 0;
  }
  await User.updateOne({ _id: user._id }, { $set: update });
}

async function clearFailedAttempts(user) {
  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } }
  );
}

/**
 * Verifies credentials and every gate that must pass before a session exists.
 *
 * All credential failures return the SAME generic message: a distinct "no such
 * user" response would let an attacker enumerate valid IDs.
 */
async function authenticateCredentials({ loginId, password, organizationSlug }) {
  const user = await resolveLoginUser(loginId, organizationSlug);
  const GENERIC = 'Invalid credentials. Please check your details and try again.';

  if (!user) throw ApiError.unauthorized(GENERIC);

  if (user.isLocked()) {
    throw ApiError.tooMany(
      `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`,
      { code: 'ACCOUNT_LOCKED' }
    );
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    await registerFailedAttempt(user);
    throw ApiError.unauthorized(GENERIC);
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden(
      'This account is not active. Please contact your administrator.',
      { code: 'ACCOUNT_INACTIVE' }
    );
  }

  // Tenant status is checked at login as well as on every request, so a
  // suspended client cannot get a fresh session at all.
  if (user.organization) {
    const org = await Organization.findById(user.organization).select('status name').lean();
    if (!org) throw ApiError.forbidden('Your organisation no longer exists.');
    if (org.status === ORG_STATUS.SUSPENDED) {
      throw ApiError.forbidden(
        'Your organisation account is suspended. Please contact MR Print World.',
        { code: 'ORG_SUSPENDED' }
      );
    }
    if (org.status === ORG_STATUS.ARCHIVED) {
      throw ApiError.forbidden('This organisation account has been archived.', {
        code: 'ORG_ARCHIVED',
      });
    }
  }

  await clearFailedAttempts(user);
  return user;
}

/** Loads a user with the references `publicUser` needs populated. */
function loadFullUser(id) {
  return User.findById(id)
    .populate('organization', 'name slug status logo settings')
    .populate('orgCategory', 'name code idPrefix')
    .populate('department', 'name code kind');
}

/** Finds a user by a raw reset token, comparing against the stored hash. */
async function findByResetToken(rawToken) {
  return User.findOne({
    resetTokenHash: hashToken(rawToken),
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires');
}

module.exports = {
  publicUser,
  authenticateCredentials,
  loadFullUser,
  findByResetToken,
  resolveLoginUser,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
};
