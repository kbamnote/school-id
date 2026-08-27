const { z } = require('zod');
const { objectId, listQuery } = require('./common');
const { JOB_STATUS } = require('../constants/workflow');

const listSchema = listQuery.extend({
  status: z.enum(Object.values(JOB_STATUS)).optional(),
  organization: objectId.optional(),
  priority: z.enum(['normal', 'high', 'urgent']).optional(),
  assignedTo: objectId.optional(),
  group: z.enum(['open', 'attention', 'overdue']).optional(),
});

const statusSchema = z.object({
  status: z.enum(Object.values(JOB_STATUS)),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

const dataIssueSchema = z.object({
  reason: z.string().trim().min(1, 'Say what is wrong with the data').max(1000),
  /**
   * Optional. Naming specific records sends only those back for correction,
   * so a small problem does not force the client to redo the whole batch.
   */
  records: z
    .array(
      z.object({
        submission: objectId,
        label: z.string().trim().max(120).optional(),
        reason: z.string().trim().max(500).optional(),
      })
    )
    .max(2000)
    .optional(),
});

const assignSchema = z.object({
  assignedTo: objectId.nullable().optional(),
});

const updateSchema = z.object({
  priority: z.enum(['normal', 'high', 'urgent']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  internalNotes: z.string().trim().max(5000).optional(),
  clientNotes: z.string().trim().max(2000).optional(),
  dispatch: z
    .object({
      method: z.string().trim().max(80).optional(),
      trackingNumber: z.string().trim().max(120).optional(),
      courier: z.string().trim().max(120).optional(),
      dispatchedTo: z.string().trim().max(200).optional(),
      note: z.string().trim().max(500).optional(),
    })
    .partial()
    .optional(),
});

module.exports = { listSchema, statusSchema, dataIssueSchema, assignSchema, updateSchema };
