#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');

/**
 * Pre-deployment readiness check.
 *
 * Run before promoting a build. It refuses to pass on the mistakes that are
 * silent until they are expensive: a database name that collides with another
 * project, secrets left at their example values, rate limits effectively
 * disabled, or a proxy setup that makes every client look like one IP to the
 * rate limiter.
 *
 * Exits non-zero on any failure so it can gate a deploy pipeline.
 */
const results = { pass: [], warn: [], fail: [] };

const ok = (m) => results.pass.push(m);
const warn = (m) => results.warn.push(m);
const fail = (m) => results.fail.push(m);

function checkSecrets() {
  const { JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh } = process.env;

  if (!access || !refresh) return fail('JWT secrets are not set.');
  if (access === refresh) {
    return fail('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical.');
  }

  for (const [name, value] of [
    ['JWT_ACCESS_SECRET', access],
    ['JWT_REFRESH_SECRET', refresh],
  ]) {
    if (value.length < 32) fail(`${name} is shorter than 32 characters.`);
    else if (/change-me|example|secret123|test/i.test(value)) {
      fail(`${name} still looks like a placeholder.`);
    } else ok(`${name} is set and long enough.`);
  }
  return undefined;
}

function checkDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) return fail('MONGO_URI is not set.');

  /*
   * A URI with no database name resolves to `test`. On a shared Atlas cluster
   * that is somebody else's live data - this project came within one write of
   * exactly that.
   */
  const withoutQuery = uri.split('?')[0];
  const dbName = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);

  if (!dbName || dbName.includes('.') || dbName.includes(':')) {
    fail('MONGO_URI has no database name - it will silently resolve to "test".');
  } else if (dbName === 'test') {
    fail('MONGO_URI points at the "test" database, which is never a safe target.');
  } else {
    ok(`Database name is explicit: "${dbName}".`);
  }

  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(uri)) {
    warn('Production is configured against a local database.');
  }
  return undefined;
}

function checkStorage() {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

  if (driver === 'cloudinary') {
    const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter(
      (k) => !process.env[k]
    );
    if (missing.length) fail(`STORAGE_DRIVER=cloudinary but missing: ${missing.join(', ')}.`);
    else ok('Cloudinary storage is fully configured.');
  } else if (process.env.NODE_ENV === 'production') {
    warn(
      'STORAGE_DRIVER=local in production - uploads live on the app server\'s disk ' +
        'and are lost when it is replaced.'
    );
  } else {
    ok('Local storage driver (fine outside production).');
  }
}

function checkMail() {
  const driver = (process.env.MAIL_DRIVER || 'log').toLowerCase();

  if (driver === 'smtp') {
    const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
    if (missing.length) fail(`MAIL_DRIVER=smtp but missing: ${missing.join(', ')}.`);
    else ok('SMTP is configured.');
  } else if (process.env.NODE_ENV === 'production') {
    warn(
      'MAIL_DRIVER=log in production - password resets and correction notices ' +
        'will be written to the log instead of reaching anyone.'
    );
  } else {
    ok('Log mail driver (fine outside production).');
  }
}

function checkRateLimits() {
  const authMax = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
  const apiMax = Number(process.env.RATE_LIMIT_MAX || 300);

  if (authMax > 50) fail(`AUTH_RATE_LIMIT_MAX is ${authMax} - brute-force protection is weak.`);
  else ok(`Sign-in attempts capped at ${authMax} per window.`);

  if (apiMax > 10000) warn(`RATE_LIMIT_MAX is ${apiMax}, effectively unlimited.`);
  else ok(`API requests capped at ${apiMax} per window.`);
}

function checkProxy() {
  const trust = String(process.env.TRUST_PROXY || '').toLowerCase() === 'true';

  if (process.env.NODE_ENV === 'production' && !trust) {
    /*
     * Behind a load balancer without this, every request appears to come from
     * the proxy - so the rate limiter throttles all users as one, and audit
     * entries record the proxy's address rather than the user's.
     */
    warn(
      'TRUST_PROXY is off. If the app sits behind a proxy or load balancer, ' +
        'rate limiting and audit IPs will be wrong.'
    );
  } else {
    ok('Proxy trust setting is consistent with the environment.');
  }
}

function checkBootstrapCredentials() {
  if (process.env.SUPER_ADMIN_PASSWORD) {
    warn(
      'SUPER_ADMIN_PASSWORD is still present in the environment. Remove it once ' +
        'the first administrator exists.'
    );
  } else {
    ok('No bootstrap password left in the environment.');
  }
}

async function checkIndexes() {
  const uri = process.env.MONGO_URI;
  if (!uri) return;

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    require('../models');

    // Building indexes on first write in production stalls that request.
    const names = Object.keys(mongoose.models);
    await Promise.all(names.map((n) => mongoose.models[n].createIndexes()));
    ok(`Indexes verified for ${names.length} models.`);

    const dbName = mongoose.connection.name;
    const collections = await mongoose.connection.db.listCollections().toArray();
    ok(`Connected to "${dbName}" (${collections.length} collections).`);
  } catch (err) {
    fail(`Could not verify database indexes: ${err.message}`);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

(async () => {
  console.log(`\nMR Print World - readiness check (NODE_ENV=${process.env.NODE_ENV || 'unset'})\n`);

  checkSecrets();
  checkDatabase();
  checkStorage();
  checkMail();
  checkRateLimits();
  checkProxy();
  checkBootstrapCredentials();
  await checkIndexes();

  for (const m of results.pass) console.log(`  PASS  ${m}`);
  for (const m of results.warn) console.log(`  WARN  ${m}`);
  for (const m of results.fail) console.log(`  FAIL  ${m}`);

  console.log(
    `\n${results.pass.length} passed, ${results.warn.length} warning(s), ` +
      `${results.fail.length} failure(s).\n`
  );

  if (results.fail.length) {
    console.error('Not ready to deploy.\n');
    process.exit(1);
  }
  console.log('Ready to deploy.\n');
  process.exit(0);
})();
