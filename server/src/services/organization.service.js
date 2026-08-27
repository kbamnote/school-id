const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const User = require('../models/User');
const OrgCategory = require('../models/OrgCategory');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { ORG_STATUS, USER_STATUS } = require('../constants/workflow');
const { generatePassword } = require('../utils/strings');
const uploadService = require('./upload.service');

/**
 * Assigns a plan to an organisation.
 *
 * Limits and features are COPIED onto the subscription rather than referenced,
 * so later edits to the plan template never retroactively change what an
 * existing client is allowed to do.
 */
async function assignPlan(organizationId, planId, { session, actorId, overrides } = {}) {
  const plan = planId
    ? await Plan.findById(planId).session(session || null)
    : await Plan.findOne({ isDefault: true, isActive: true }).session(session || null);

  if (!plan) {
    throw ApiError.badRequest('The selected plan does not exist.');
  }

  const template = plan.toObject();
  const limits = { ...template.limits, ...(overrides?.limits || {}) };
  const features = { ...template.features, ...(overrides?.features || {}) };
  const customised =
    Object.keys(overrides?.limits || {}).length > 0 ||
    Object.keys(overrides?.features || {}).length > 0;

  return Subscription.findOneAndUpdate(
    { organization: organizationId },
    {
      $set: {
        organization: organizationId,
        plan: plan._id,
        planCode: plan.code,
        planName: plan.name,
        limits,
        features,
        status: 'active',
        expiresAt: overrides?.expiresAt || null,
        overriddenBy: customised ? actorId || null : null,
        overrideNote: customised
          ? overrides?.note || 'Limits set manually by MR Print World'
          : '',
      },
      $setOnInsert: { startedAt: new Date() },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, session: session || null }
  );
}

/**
 * Creates a client organisation, its subscription, its first administrator and
 * a starter category - as one atomic unit.
 *
 * A transaction matters here: a half-created client (an organisation with no
 * admin, or an admin with no subscription) is worse than a clean failure,
 * because nobody can sign in to fix it.
 */
async function createOrganization(payload, { actor, adminPayload, planId, overrides } = {}) {
  const session = await mongoose.startSession();

  try {
    let created;

    await session.withTransaction(async () => {
      const slug = payload.slug
        ? payload.slug
        : await Organization.generateSlug(payload.name);

      const [organization] = await Organization.create(
        [{ ...payload, slug, createdBy: actor?._id || null }],
        { session }
      );

      const subscription = await assignPlan(organization._id, planId, {
        session,
        actorId: actor?._id,
        overrides,
      });

      organization.subscription = subscription._id;
      await organization.save({ session });

      let admin = null;
      let temporaryPassword = null;

      if (adminPayload?.email) {
        const existing = await User.findOne({ email: adminPayload.email.toLowerCase() })
          .session(session)
          .lean();
        if (existing) {
          throw ApiError.conflict(
            'That administrator email is already registered on the platform.',
            { details: [{ field: 'admin.email', message: 'This email is already in use' }] }
          );
        }

        temporaryPassword = adminPayload.password || generatePassword(12);

        const [adminUser] = await User.create(
          [
            {
              organization: organization._id,
              name: adminPayload.name,
              email: adminPayload.email.toLowerCase(),
              phone: adminPayload.phone || '',
              password: temporaryPassword,
              // The first user is the OWNER - only they can edit organisation settings.
              role: ROLES.CLIENT_OWNER,
              status: USER_STATUS.ACTIVE,
              // Forces a password change on first sign-in, so the temporary
              // password we hand over stops working immediately after.
              mustChangePassword: true,
              createdBy: actor?._id || null,
            },
          ],
          { session }
        );
        admin = adminUser;

        await Organization.updateOne(
          { _id: organization._id },
          { $inc: { 'stats.userCount': 1 } },
          { session }
        );
      }

      created = { organization, subscription, admin, temporaryPassword };
    });

    return created;
  } finally {
    await session.endSession();
  }
}

/** Status changes are funnelled through here so the side-effects stay consistent. */
async function setStatus(organization, status, { reason } = {}) {
  const now = new Date();

  if (status === ORG_STATUS.SUSPENDED) {
    organization.status = ORG_STATUS.SUSPENDED;
    organization.suspendedAt = now;
    organization.suspensionReason = reason || '';
  } else if (status === ORG_STATUS.ACTIVE) {
    organization.status = ORG_STATUS.ACTIVE;
    organization.suspendedAt = null;
    organization.suspensionReason = '';
    organization.archivedAt = null;
  } else if (status === ORG_STATUS.ARCHIVED) {
    organization.status = ORG_STATUS.ARCHIVED;
    organization.archivedAt = now;
  }

  await organization.save();
  return organization;
}

/**
 * Live counts for one organisation.
 *
 * Read from the collections rather than the denormalised `stats` block,
 * because this is what the limit checks and the client detail screen depend on
 * being exactly right.
 */
async function getUsage(organizationId) {
  const [userCount, adminCount, categoryCount] = await Promise.all([
    User.countDocuments({ organization: organizationId, role: ROLES.END_USER }),
    User.countDocuments({
      organization: organizationId,
      role: { $in: [ROLES.CLIENT_OWNER, ROLES.CLIENT_ADMIN, ROLES.CLIENT_REVIEWER, ROLES.CLIENT_STAFF] },
    }),
    OrgCategory.countDocuments({ organization: organizationId }),
  ]);

  return { userCount, adminCount, categoryCount };
}

/**
 * Enforces a plan limit before creating something.
 * `-1` means unlimited. Throws a 403 naming the limit so the UI can explain it.
 */
async function assertWithinLimit(organizationId, limitKey, currentCount, adding = 1) {
  const subscription = await Subscription.findOne({ organization: organizationId }).lean();
  if (!subscription) return; // no subscription recorded - do not block the client

  const limit = subscription.limits?.[limitKey];
  if (limit === undefined || limit === -1) return;

  if (currentCount + adding > limit) {
    throw ApiError.forbidden(
      `Your ${subscription.planName} plan allows ${limit}. Contact MR Print World to increase this limit.`,
      { code: 'PLAN_LIMIT_REACHED', details: { limitKey, limit, current: currentCount } }
    );
  }
}

/** Replaces an organisation logo, removing the previous blob afterwards. */
async function replaceLogo(organization, file, actorId) {
  const previousId = organization.logo?.publicId;

  const { stored } = await uploadService.store(file, {
    organization: organization._id,
    kind: 'org_logo',
    uploadedBy: actorId,
    // A logo carries no personal data and needs to render on sign-in screens
    // before a session exists, so it is the one asset served publicly.
    isPublic: true,
    folder: `organizations/${organization._id}`,
    transform: { width: 512, height: 512, fit: 'inside' },
  });

  organization.logo = { url: stored.url, publicId: stored.publicId };
  await organization.save();

  // Only after the new logo is safely committed.
  if (previousId) await uploadService.destroy(previousId);

  return { organization, stored };
}

module.exports = {
  createOrganization,
  assignPlan,
  setStatus,
  getUsage,
  assertWithinLimit,
  replaceLogo,
};
