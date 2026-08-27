const { z } = require('zod');
const { objectId, listQuery } = require('./common');
const { SUBMISSION_STATUS } = require('../constants/workflow');

const fieldNoteSchema = z.object({
  key: z.string().trim().min(1).max(60),
  message: z.string().trim().min(1, 'Say what is wrong with this field').max(500),
});

const listSchema = listQuery.extend({
  status: z.enum(Object.values(SUBMISSION_STATUS)).optional(),
  group: z.enum(['pending', 'corrections', 'approved', 'production', 'drafts']).optional(),
  form: objectId.optional(),
  orgCategory: objectId.optional(),
  department: objectId.optional(),
  duplicates: z.enum(['true', 'false']).optional(),
});

/**
 * The export query.
 *
 * Separate from listSchema because validateQuery REPLACES req.query with the
 * parsed result - a key the schema does not declare is silently dropped, so
 * ?format=csv was being discarded and every export came back as xlsx.
 */
const exportSchema = listSchema.extend({
  format: z.enum(['csv', 'xlsx']).optional(),
});

const statsSchema = z.object({ form: objectId.optional() });

const approveSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

const correctionSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  fields: z.array(fieldNoteSchema).max(60).optional(),
});

const rejectSchema = z.object({
  note: z.string().trim().min(1, 'Give a reason for rejecting this record').max(1000),
});

/** Values are checked per-field by the validation engine, not described here. */
const editSchema = z.object({
  data: z.record(z.any()),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

const bulkSchema = z.object({
  // Capped so one request cannot lock the collection for minutes.
  ids: z.array(objectId).min(1, 'Select at least one record').max(500),
  action: z.enum(['approve', 'request_correction']),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

module.exports = {
  listSchema,
  exportSchema,
  statsSchema,
  approveSchema,
  correctionSchema,
  rejectSchema,
  editSchema,
  bulkSchema,
};
