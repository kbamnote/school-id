const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('../utils/logger');
const serializePlugin = require('../models/plugins/serialize');

// Registered BEFORE any model is compiled, so every schema picks it up.
mongoose.plugin(serializePlugin);

mongoose.set('strictQuery', true);
// Surface accidental full-collection scans during development.
if (!env.isProd) mongoose.set('debug', false);

async function connectDB() {
  /*
   * Name the database, not just "connected". Two environments pointed at
   * different databases on the same cluster look identical in the logs, and
   * the symptom is a valid password being rejected - which reads as an auth
   * bug rather than a configuration one.
   */
  mongoose.connection.on('connected', () =>
    logger.info(`MongoDB connected -> ${mongoose.connection.name} @ ${mongoose.connection.host}`)
  );
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: !env.isProd, // in production indexes are built/managed deliberately
  });

  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB };
