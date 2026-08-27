const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, paginated } = require('../utils/apiResponse');
const { parsePagination, assertObjectId } = require('../utils/query');
const notifications = require('../services/notification.service');

/**
 * Notifications are scoped by RECIPIENT, never by tenant.
 *
 * `recipient: req.user._id` is the whole authorisation check on every handler
 * here. Filtering by organisation instead would let one colleague read
 * another's notifications, and would break entirely for MR Print World's
 * staff, who have no organisation at all.
 */

/** GET /api/notifications */
const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filters = { recipient: req.user._id };
  if (req.query.unread === 'true') filters.readAt = null;
  if (req.query.type) filters.type = req.query.type;

  const [items, total, unread] = await Promise.all([
    Notification.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filters),
    notifications.unreadCount(req.user._id),
  ]);

  return paginated(
    res,
    items.map((n) => ({ ...n, id: String(n._id), _id: undefined, isRead: Boolean(n.readAt) })),
    { page, limit, total },
    'OK',
    { unread }
  );
});

/** GET /api/notifications/unread-count - drives the bell badge. */
const unreadCount = asyncHandler(async (req, res) =>
  ok(res, { unread: await notifications.unreadCount(req.user._id) })
);

/** POST /api/notifications/:id/read */
const markRead = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'notification id');

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  // Already read, or not this person's - both are a 404, so the endpoint
  // cannot be used to discover that someone else's notification exists.
  if (!notification) {
    const exists = await Notification.exists({ _id: req.params.id, recipient: req.user._id });
    if (!exists) throw ApiError.notFound('Notification not found');
  }

  return ok(res, { unread: await notifications.unreadCount(req.user._id) });
});

/** POST /api/notifications/read-all */
const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return ok(res, { cleared: result.modifiedCount, unread: 0 }, 'All notifications marked as read');
});

module.exports = { list, unreadCount, markRead, markAllRead };
