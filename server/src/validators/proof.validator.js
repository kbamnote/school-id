const { z } = require('zod');
const { objectId, listQuery } = require('./common');
const { PROOF_STATUS } = require('../constants/workflow');

const uploadSchema = z.object({
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

const listSchema = listQuery.extend({
  status: z.enum(Object.values(PROOF_STATUS)).optional(),
  organization: objectId.optional(),
});

/**
 * A change request must say what to change - approving needs no words, but
 * rejecting without a reason just wastes a round trip.
 */
const decisionSchema = z
  .object({
    decision: z.enum(['approve', 'changes_requested']),
    comment: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine((v) => v.decision !== 'changes_requested' || Boolean(v.comment?.trim()), {
    message: 'Say what needs changing',
    path: ['comment'],
  });

module.exports = { uploadSchema, listSchema, decisionSchema };
