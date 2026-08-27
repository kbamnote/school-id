const { z } = require('zod');
const { nonEmpty } = require('./common');

const limits = z
  .object({
    // -1 means unlimited throughout the platform.
    maxUsers: z.coerce.number().int().min(-1),
    maxForms: z.coerce.number().int().min(-1),
    maxAdmins: z.coerce.number().int().min(-1),
    maxCategories: z.coerce.number().int().min(-1),
    maxStorageMb: z.coerce.number().int().min(-1),
    maxSubmissionsPerMonth: z.coerce.number().int().min(-1),
  })
  .partial();

const features = z
  .object({
    bulkImport: z.boolean(),
    cardDesigner: z.boolean(),
    proofApproval: z.boolean(),
    advancedReports: z.boolean(),
    apiAccess: z.boolean(),
  })
  .partial();

const pricing = z
  .object({
    amount: z.coerce.number().min(0),
    currency: z.string().trim().toUpperCase().length(3),
    interval: z.enum(['monthly', 'yearly', 'one_time']),
  })
  .partial();

const createSchema = z.object({
  name: nonEmpty('Plan name', 80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]+$/, 'Use uppercase letters, numbers and underscores only')
    .min(2)
    .max(30),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  limits,
  features,
  pricing,
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

// The code is the stable identifier subscriptions were stamped with, so it
// cannot be edited after creation.
const updateSchema = createSchema.omit({ code: true }).partial();

module.exports = { createSchema, updateSchema };
