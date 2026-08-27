const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');
const { ROLE_VALUES, ROLES, PLATFORM_ROLES, resolvePermissions } = require('../constants/roles');
const { USER_STATUS } = require('../constants/workflow');
const { hashToken } = require('../utils/strings');

const userSchema = new mongoose.Schema(
  {
    /**
     * Null for MR Print World platform staff, required for everyone else.
     * This single field is what every tenant-isolation check keys on.
     */
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },

    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 160 },

    /** Staff/admins sign in with email; end users usually have none. */
    email: { type: String, trim: true, lowercase: true, default: null },

    /**
     * Generated human ID such as STU00001. Unique per organisation, and the
     * primary credential for end users who have no email address.
     */
    loginId: { type: String, trim: true, uppercase: true, default: null },

    phone: { type: String, trim: true, default: '' },

    password: { type: String, required: true, select: false },

    /** SECURITY role. Never derived from, or confused with, `orgCategory`. */
    role: { type: String, enum: ROLE_VALUES, required: true, index: true },

    /** Per-user permission overrides on top of the role bundle. */
    permissionOverrides: {
      granted: { type: [String], default: [] },
      revoked: { type: [String], default: [] },
    },

    /** ORGANISATION category (Student / Teacher / Driver) - pure data, no access meaning. */
    orgCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrgCategory',
      default: null,
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
      index: true,
    },

    /** The client's own identifier (admission no, employee code) from their records. */
    externalId: { type: String, trim: true, default: '' },

    avatar: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
    },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },

    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    /** Only the hash is stored - a leaked DB cannot be used to reset anyone's password. */
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpires: { type: Date, default: null, select: false },

    /** Brute-force protection, per account. */
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    /**
     * Bumped on password change / forced logout. Any refresh token issued
     * before this instant is rejected, which is what makes "sign out
     * everywhere" actually work with stateless JWTs.
     */
    tokenVersion: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Belt and braces - these are `select: false`, but a lean/spread path
        // could still surface them.
        delete ret.password;
        delete ret.resetTokenHash;
        delete ret.resetTokenExpires;
        delete ret.failedLoginAttempts;
        delete ret.lockedUntil;
        return ret;
      },
    },
  }
);

/* ------------------------------- indexes --------------------------------- */
// Email is globally unique but only among documents that actually have one -
// a partial index lets thousands of end users share `email: null`.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
// loginId is unique per tenant, not globally: two schools may both issue STU00001.
userSchema.index(
  { organization: 1, loginId: 1 },
  { unique: true, partialFilterExpression: { loginId: { $type: 'string' } } }
);
userSchema.index({ organization: 1, role: 1, status: 1 });
userSchema.index({ organization: 1, orgCategory: 1 });
userSchema.index({ organization: 1, name: 1 });

/* -------------------------------- hooks ---------------------------------- */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, env.bcryptRounds);
  // Backdated one second so a token minted in the same tick isn't invalidated
  // by its own password-change check.
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
  return next();
});

/** Normalises empty strings to null so the partial unique indexes behave. */
userSchema.pre('save', function normaliseBlanks(next) {
  if (this.email === '') this.email = null;
  if (this.loginId === '') this.loginId = null;
  return next();
});

/* ------------------------------- methods --------------------------------- */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockedUntil && this.lockedUntil > new Date());
};

userSchema.methods.isPlatformUser = function isPlatformUser() {
  return PLATFORM_ROLES.includes(this.role);
};

userSchema.methods.effectivePermissions = function effectivePermissions() {
  return resolvePermissions(this.role, this.permissionOverrides);
};

userSchema.methods.setResetToken = function setResetToken(rawToken, ttlMinutes = 30) {
  this.resetTokenHash = hashToken(rawToken);
  this.resetTokenExpires = new Date(Date.now() + ttlMinutes * 60 * 1000);
};

/** True if the password changed after a token was issued (token must be rejected). */
userSchema.methods.passwordChangedAfter = function passwordChangedAfter(issuedAtSeconds) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > issuedAtSeconds;
};

/* ------------------------------- statics --------------------------------- */
/** Login lookup: email is global, loginId is per-tenant. Password is explicitly selected. */
userSchema.statics.findForLogin = function findForLogin(loginId, organizationId = null) {
  const value = String(loginId || '').trim();
  const isEmail = value.includes('@');

  const query = isEmail
    ? { email: value.toLowerCase() }
    : { loginId: value.toUpperCase(), ...(organizationId ? { organization: organizationId } : {}) };

  return this.findOne(query).select(
    '+password +failedLoginAttempts +lockedUntil'
  );
};

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);
