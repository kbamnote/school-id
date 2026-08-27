const { z } = require('zod');

/**
 * Draft and submit payloads.
 *
 * `data` is passthrough because its shape is defined by the form, not by us -
 * the controller filters it against the form's real field keys and the
 * validation engine checks each value against its field definition. Trying to
 * describe it statically here would duplicate that logic and drift from it.
 */
const draftSchema = z.object({
  data: z.record(z.any()).optional(),
  declarationAccepted: z.boolean().optional(),
});

const submitSchema = z.object({
  data: z.record(z.any()).optional(),
  declarationAccepted: z.boolean().optional(),
});

module.exports = { draftSchema, submitSchema };
