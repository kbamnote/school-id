const { z } = require('zod');
const { objectId, listQuery, nonEmpty, phone } = require('./common');
const { ROLE_VALUES } = require('../constants/roles');
const { USER_STATUS } = require('../constants/workflow');

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(160)
  .optional()
  .or(z.literal(''));

/* ------------------------------ categories -------------------------------- */

const categoryCreateSchema = z.object({
  name: nonEmpty('Category name', 80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]+$/, 'Use uppercase letters, numbers and underscores only')
    .min(2)
    .max(20),
  // The prefix is printed on cards, so it is letters only and short.
  idPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,8}$/, 'Use 2-8 uppercase letters, e.g. STU')
    .max(8),
  idPadding: z.coerce.number().int().min(3).max(10).optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Enter a hex colour').optional(),
  icon: z.string().trim().max(40).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const categoryUpdateSchema = categoryCreateSchema.partial();

const categoryListSchema = listQuery.extend({
  isActive: z.enum(['true', 'false']).optional(),
});

/* ----------------------------- departments -------------------------------- */

const DEPARTMENT_KINDS = ['department', 'class', 'section', 'batch', 'group', 'shift', 'branch'];

const departmentCreateSchema = z.object({
  name: nonEmpty('Name', 120),
  code: z.string().trim().toUpperCase().max(20).optional().or(z.literal('')),
  kind: z.enum(DEPARTMENT_KINDS).default('department'),
  parent: objectId.optional().nullable(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  headName: z.string().trim().max(160).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const departmentUpdateSchema = departmentCreateSchema.partial();

const departmentListSchema = listQuery.extend({
  kind: z.enum(DEPARTMENT_KINDS).optional(),
  parent: objectId.optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

/* -------------------------------- users ----------------------------------- */

const userCreateSchema = z.object({
  name: nonEmpty('Name', 160),
  email: optionalEmail,
  phone: phone.optional(),
  role: z.enum(ROLE_VALUES).optional(),
  orgCategory: objectId.optional().nullable(),
  department: objectId.optional().nullable(),
  externalId: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

const userUpdateSchema = z.object({
  name: nonEmpty('Name', 160).optional(),
  email: optionalEmail,
  phone: phone.optional(),
  role: z.enum(ROLE_VALUES).optional(),
  orgCategory: objectId.optional().nullable(),
  department: objectId.optional().nullable(),
  externalId: z.string().trim().max(60).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

const userStatusSchema = z.object({
  status: z.enum(Object.values(USER_STATUS)),
});

const userListSchema = listQuery.extend({
  role: z.enum(ROLE_VALUES).optional(),
  status: z.enum(Object.values(USER_STATUS)).optional(),
  orgCategory: objectId.optional(),
  department: objectId.optional(),
  group: z.enum(['staff', 'endUsers']).optional(),
  format: z.enum(['csv', 'xlsx']).optional(),
});

/**
 * Commit payload for bulk import.
 * Passthrough on the row shape keeps the client's echo intact; the controller
 * re-verifies every category id against the tenant regardless.
 */
const importCommitSchema = z.object({
  rows: z
    .array(
      z.object({
        valid: z.boolean(),
        data: z.object({
          name: z.string().trim().min(1).max(160),
          email: z.string().trim().max(160).optional().or(z.literal('')),
          phone: z.string().trim().max(20).optional().or(z.literal('')),
          externalId: z.string().trim().max(60).optional().or(z.literal('')),
          categoryId: objectId,
          categoryName: z.string().optional(),
          departmentId: objectId.nullable().optional(),
          departmentName: z.string().optional(),
          departmentInput: z.string().optional(),
        }),
      })
    )
    .min(1, 'There are no rows to import')
    .max(5000, 'Too many rows in one import'),
});

module.exports = {
  DEPARTMENT_KINDS,
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryListSchema,
  departmentCreateSchema,
  departmentUpdateSchema,
  departmentListSchema,
  userCreateSchema,
  userUpdateSchema,
  userStatusSchema,
  userListSchema,
  importCommitSchema,
};
