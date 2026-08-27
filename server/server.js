const { env, validateEnv } = require('./src/config/env');
const { connectDB, disconnectDB } = require('./src/config/db');
const logger = require('./src/utils/logger');

async function start() {
  validateEnv();
  await connectDB();

  const app = require('./src/app');
  const server = app.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Don't let a hung connection block the shutdown forever.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception - exiting', err);
    process.exit(1);
  });
}

start().catch((err) => {
  logger.error('Failed to start server:', err.message);
  process.exit(1);
});
