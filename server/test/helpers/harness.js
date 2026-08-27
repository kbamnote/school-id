const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * Test harness.
 *
 * Boots the real app against a throwaway in-memory MongoDB. Env is set BEFORE
 * anything is required, because `config/env.js` reads process.env at module
 * load and refuses to start without secrets - and because requiring the app
 * first would bind the models to whatever MONGO_URI the developer happens to
 * have in `.env`. That URI points at a shared Atlas cluster on this project,
 * so getting this order wrong would run the suite against live data.
 */
let mongod = null;

async function start() {
  mongod = await MongoMemoryServer.create();

  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongod.getUri('mrpw_test');
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-x';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-y';
  process.env.STORAGE_DRIVER = 'local';
  process.env.MAIL_DRIVER = 'log';
  process.env.LOG_LEVEL = 'silent';
  // Rate limiting would make a fast suite fail on the auth endpoints.
  process.env.RATE_LIMIT_MAX = '100000';
  process.env.AUTH_RATE_LIMIT_MAX = '100000';

  const { connectDB } = require('../../src/config/db');
  await connectDB();
  require('../../src/models');

  const app = require('../../src/app');
  return app;
}

async function stop() {
  const mongoose = require('mongoose');
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  if (mongod) await mongod.stop();
}

/** Empties every collection between test files without re-booting Mongo. */
async function clear() {
  const mongoose = require('mongoose');
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

module.exports = { start, stop, clear };
