const express = require('express');
const authRoutes = require('./auth.routes');
const superAdminRoutes = require('./superAdmin.routes');
const clientRoutes = require('./client.routes');
const portalRoutes = require('./portal.routes');
const fileRoutes = require('./files.routes');
const cardDesignRoutes = require('./cardDesign.routes');
const notificationRoutes = require('./notification.routes');

const router = express.Router();

router.get('/', (req, res) =>
  res.json({
    success: true,
    message: 'MR Print World - Print Data API',
    version: '1.0.0',
  })
);

router.use('/auth', authRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/portal', portalRoutes);
router.use('/files', fileRoutes);
router.use('/card-designs', cardDesignRoutes);
router.use('/notifications', notificationRoutes);

/**
 * Mounted last and at the root: this router applies authenticate + tenant
 * scoping to everything it receives, so it must sit AFTER the routers that
 * serve public or differently-scoped paths (/auth, /files).
 */
router.use('/', clientRoutes);

/* Feature routers are mounted here as each phase lands. */

module.exports = router;
