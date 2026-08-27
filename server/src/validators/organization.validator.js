const { z } = require('zod');
const { objectId, listQuery, nonEmpty, phone } = require('./common');
const { ORG_STATUS } = require('../constants/workflow');

const ORG_TYPES = [
  'school',
  'college',
  'university',
  'company',
  'government',
  'hospital',
  'ngo',
  'other',
];

const optionalText = (max = 160) => z.string().trim().max(max).optional().or(z.literal(''));

const contactSchema = z
  .object({
    personName: optionalText(160),
    designation: optionalText(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email').max(160).optional().or(z.literal('')),
    phone: phone.optional(),
    altPhone: phone.optional(),
  })
  .optional();

const addressSchema = z
  .object({
    line1: optionalText(200),
    line2: optionalText(200),
    city: optionalText(80),
    state: optionalText(80),
    // Indian PIN codes are six digits; anything else is a typo worth catching early.
    pincode: z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code')
      .optional()
      .or(z.literal('')),
    country: optionalText(80),
  })
  .optional();

const settingsSchema = z
  .object({
    allowSubmissionEditBeforeReview: z.boolean().optional(),
    requirePhotoOnSubmission: z.boolean().optional(),
    autoApproveSubmissions: z.boolean().optional(),
    timezone: optionalText(60),
    dateFormat: optionalText(20),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Enter a hex colour such as #1d45f5')
      .optional(),
  })
  .optional();

const limitsSchema = z
  .object({
    maxUsers: z.coerce.number().int().min(-1).optional(),
    maxForms: z.coerce.number().int().min(-1).optional(),
    maxAdmins: z.coerce.number().int().min(-1).optional(),
    maxCategories: z.coerce.number().int().min(-1).optional(),
    maxStorageMb: z.coerce.number().int().min(-1).optional(),
    maxSubmissionsPerMonth: z.coerce.number().int().min(-1).optional(),
  })
  .optional();

const featuresSchema = z
  .object({
    bulkImport: z.boolean().optional(),
    cardDesigner: z.boolean().optional(),
    proofApproval: z.boolean().optional(),
    advancedReports: z.boolean().optional(),
    apiAccess: z.boolean().optional(),
  })
  .optional();

const createSchema = z.object({
  name: nonEmpty('Organisation name', 160),
  type: z.enum(ORG_TYPES).default('other'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only')
    .min(3)
    .max(60)
    .optional(),
  gstNumber: z.string().trim().toUpperCase().max(20).optional().or(z.literal('')),
  internalNotes: z.string().trim().max(5000).optional().or(z.literal('')),
  contact: contactSchema,
  address: addressSchema,
  settings: settingsSchema,

  planId: objectId.optional(),
  limitOverrides: limitsSchema,
  featureOverrides: featuresSchema,

  /**
   * The first administrator. Optional so a client can be created before its
   * contact person is known, but the UI encourages creating one immediately.
   */
  admin: z
    .object({
      name: nonEmpty('Administrator name', 160),
      email: z.string().trim().toLowerCase().email('Enter a valid email').max(160),
      phone: phone.optional(),
      // Left blank in normal use: a secure temporary password is generated.
      password: z.string().min(8).max(128).optional(),
    })
    .optional(),
});

/** Update never touches status or subscription - those have their own endpoints. */
const updateSchema = createSchema
  .omit({ admin: true, planId: true, limitOverrides: true, featureOverrides: true, slug: true })
  .partial();

const statusSchema = z.object({
  status: z.enum([ORG_STATUS.ACTIVE, ORG_STATUS.SUSPENDED, ORG_STATUS.ARCHIVED]),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

const subscriptionSchema = z.object({
  planId: objectId,
  limits: limitsSchema,
  features: featuresSchema,
  expiresAt: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

const listSchema = listQuery.extend({
  status: z.enum([ORG_STATUS.ACTIVE, ORG_STATUS.SUSPENDED, ORG_STATUS.ARCHIVED]).optional(),
  type: z.enum(ORG_TYPES).optional(),
  planCode: z.string().trim().toUpperCase().max(30).optional(),
});

module.exports = {
  ORG_TYPES,
  createSchema,
  updateSchema,
  statusSchema,
  subscriptionSchema,
  listSchema,
};
