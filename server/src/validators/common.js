const { z } = require('zod');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

const idParam = z.object({ id: objectId });

/** Shared list/query parameters. `.coerce` turns the query-string numbers into numbers. */
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
});

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid phone number')
  .or(z.literal(''));

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Include at least one lowercase letter')
  .regex(/[A-Z]/, 'Include at least one uppercase letter')
  .regex(/[0-9]/, 'Include at least one number');

const nonEmpty = (label, max = 160) =>
  z.string().trim().min(1, `${label} is required`).max(max);

module.exports = { objectId, idParam, listQuery, email, phone, password, nonEmpty };
