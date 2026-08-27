const { z } = require('zod');
const { objectId, listQuery } = require('./common');

const notificationListSchema = listQuery.extend({
  unread: z.enum(['true', 'false']).optional(),
  type: z.string().trim().max(60).optional(),
});

const auditListSchema = listQuery.extend({
  organization: objectId.optional(),
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  actor: objectId.optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

module.exports = { notificationListSchema, auditListSchema };
