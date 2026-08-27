const { z } = require('zod');
const { objectId, listQuery } = require('./common');
const { LOT_STATUS } = require('../constants/workflow');

/** A production run is bounded - 5000 cards is already a very large single lot. */
const submissionIds = z.array(objectId).min(1, 'Select at least one record').max(5000);

const listSchema = listQuery.extend({
  status: z.enum(Object.values(LOT_STATUS)).optional(),
  form: objectId.optional(),
});

const eligibleSchema = listQuery.extend({
  form: objectId.optional(),
  orgCategory: objectId.optional(),
  department: objectId.optional(),
});

const validateSchema = z.object({
  submissions: submissionIds,
  form: objectId.optional(),
});

const createSchema = z.object({
  form: objectId,
  submissions: submissionIds,
  name: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  priority: z.enum(['normal', 'high', 'urgent']).optional(),
  requiredBy: z.coerce.date().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  priority: z.enum(['normal', 'high', 'urgent']).optional(),
  requiredBy: z.coerce.date().nullable().optional(),
});

const recordsSchema = z.object({ submissions: submissionIds });

const submitSchema = z.object({
  /**
   * Sends the lot despite flagged problems. Deliberately explicit - the client
   * is overriding a warning, and the override is recorded in the audit log.
   */
  force: z.boolean().optional(),
});

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

module.exports = {
  listSchema,
  eligibleSchema,
  validateSchema,
  createSchema,
  updateSchema,
  recordsSchema,
  submitSchema,
  cancelSchema,
};
