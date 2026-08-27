const { z } = require('zod');
const { objectId, listQuery, nonEmpty } = require('./common');
const { FIELD_TYPE_VALUES } = require('../constants/fieldTypes');

const PRODUCT_TYPES = ['id_card', 'certificate', 'badge', 'visiting_card', 'letter', 'other'];

const validationSchema = z
  .object({
    minLength: z.coerce.number().int().min(0).max(10000).optional(),
    maxLength: z.coerce.number().int().min(1).max(10000).optional(),
    min: z.coerce.number().optional(),
    max: z.coerce.number().optional(),
    /**
     * A user-supplied regex is compiled and run server-side, so it is length
     * capped and test-compiled here. A pathological pattern would otherwise be
     * a denial-of-service against our own validator.
     */
    pattern: z
      .string()
      .max(200)
      .refine((p) => {
        try {
          // eslint-disable-next-line no-new
          new RegExp(p);
          return true;
        } catch {
          return false;
        }
      }, 'That is not a valid regular expression')
      .optional(),
    patternMessage: z.string().trim().max(200).optional(),
    minDate: z.coerce.date().optional(),
    maxDate: z.coerce.date().optional(),
    minSelected: z.coerce.number().int().min(0).max(100).optional(),
    maxSelected: z.coerce.number().int().min(1).max(100).optional(),
    unique: z.boolean().optional(),
  })
  .partial()
  .optional();

const fileSettingsSchema = z
  .object({
    aspectRatio: z
      .string()
      .regex(/^\d{1,2}:\d{1,2}$/, 'Use a ratio such as 3:4')
      .optional(),
    minWidth: z.coerce.number().int().min(1).max(10000).optional(),
    minHeight: z.coerce.number().int().min(1).max(10000).optional(),
    maxSizeMb: z.coerce.number().min(0.1).max(50).optional(),
    acceptPdf: z.boolean().optional(),
  })
  .partial()
  .optional();

const fieldSchema = z.object({
  // Present when editing an existing field; absent for a newly added one.
  key: z.string().trim().max(60).optional(),
  type: z.enum(FIELD_TYPE_VALUES),
  label: nonEmpty('Field label', 200),
  placeholder: z.string().trim().max(200).optional().or(z.literal('')),
  helpText: z.string().trim().max(500).optional().or(z.literal('')),
  required: z.boolean().optional(),
  order: z.coerce.number().int().min(0).optional(),
  options: z.array(z.string().trim().max(200)).max(200).optional(),
  defaultValue: z.any().optional(),
  validation: validationSchema,
  fileSettings: fileSettingsSchema,
  width: z.enum(['full', 'half']).optional(),
  archived: z.boolean().optional(),
});

const settingsSchema = z
  .object({
    allowDrafts: z.boolean().optional(),
    allowEditAfterSubmit: z.boolean().optional(),
    requireDeclaration: z.boolean().optional(),
    declarationText: z.string().trim().max(1000).optional(),
    successMessage: z.string().trim().max(1000).optional(),
    opensAt: z.coerce.date().nullable().optional(),
    closesAt: z.coerce.date().nullable().optional(),
    maxSubmissions: z.coerce.number().int().min(1).nullable().optional(),
  })
  .partial()
  .optional();

const createSchema = z.object({
  title: nonEmpty('Form title', 200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  productType: z.enum(PRODUCT_TYPES).default('id_card'),
  // 150 fields is far beyond any real ID-card form and bounds the document size.
  fields: z.array(fieldSchema).max(150).optional(),
  settings: settingsSchema,
  duplicateCheckFields: z.array(z.string().trim().max(60)).max(10).optional(),
});

const updateSchema = createSchema.partial();

const statusSchema = z.object({
  status: z.enum(['draft', 'published', 'closed']),
});

const linkSchema = z.object({
  action: z.enum(['enable', 'disable', 'rotate']),
});

const assignSchema = z
  .object({
    scope: z.enum(['organization', 'category', 'department', 'users']),
    orgCategory: objectId.optional(),
    department: objectId.optional(),
    users: z.array(objectId).max(2000).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    notifyOnAssign: z.boolean().optional(),
  })
  .refine((v) => v.scope !== 'category' || Boolean(v.orgCategory), {
    message: 'Select a category',
    path: ['orgCategory'],
  })
  .refine((v) => v.scope !== 'department' || Boolean(v.department), {
    message: 'Select a department',
    path: ['department'],
  })
  .refine((v) => v.scope !== 'users' || Boolean(v.users?.length), {
    message: 'Select at least one user',
    path: ['users'],
  });

const listSchema = listQuery.extend({
  status: z.enum(['draft', 'published', 'closed']).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
});

module.exports = {
  PRODUCT_TYPES,
  createSchema,
  updateSchema,
  statusSchema,
  linkSchema,
  assignSchema,
  listSchema,
};
