const express = require('express');
const ctrl = require('../controllers/notification.controller');
const { authenticate, blockIfPasswordChangeRequired } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validate');
const v = require('../validators/activity.validator');

const router = express.Router();

/**
 * Notifications.
 *
 * Deliberately guarded by authentication ALONE, with no permission check:
 * every role has notifications, including END_USER, and each handler scopes
 * to `recipient: req.user._id`. A permission gate here would lock end users
 * out of their own messages while adding nothing - the recipient filter is
 * already the tightest possible scope.
 *
 * `stripClientTenant` / `requireTenant` are likewise absent on purpose:
 * MR Print World's staff have no organisation and must still receive theirs.
 */
router.use(authenticate, blockIfPasswordChangeRequired);

/* Static segment before any dynamic id. */
router.get('/unread-count', ctrl.unreadCount);
router.post('/read-all', ctrl.markAllRead);

router.get('/', validateQuery(v.notificationListSchema), ctrl.list);
router.post('/:id/read', ctrl.markRead);

module.exports = router;
