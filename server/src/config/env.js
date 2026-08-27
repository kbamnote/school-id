/**
 * Central environment loader + validator.
 *
 * The app refuses to boot on a missing/insecure critical value rather than
 * failing later at request time with a confusing error.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: num(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: process.env.MONGO_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 12),

  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    maxMb: num(process.env.UPLOAD_MAX_MB, 8),
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      folder: process.env.CLOUDINARY_FOLDER || 'mrpw-printdata',
    },
  },

  mail: {
    /**
     * `log` writes the message to the server log instead of sending it, so
     * the whole notification flow is testable before an SMTP account exists -
     * the same arrangement as STORAGE_DRIVER=local.
     */
    driver: (process.env.MAIL_DRIVER || 'log').toLowerCase(),
    from: process.env.MAIL_FROM || 'MR Print World <no-reply@mrprintworld.local>',
    smtp: {
      host: process.env.SMTP_HOST,
      port: num(process.env.SMTP_PORT, 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },

  rateLimit: {
    windowMin: num(process.env.RATE_LIMIT_WINDOW_MIN, 15),
    max: num(process.env.RATE_LIMIT_MAX, 300),
    authMax: num(process.env.AUTH_RATE_LIMIT_MAX, 10),
  },

  bootstrap: {
    name: process.env.SUPER_ADMIN_NAME,
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },

  trustProxy: bool(process.env.TRUST_PROXY, false),
};

/** Values without which the server cannot safely run. */
const REQUIRED = [
  ['MONGO_URI', env.mongoUri],
  ['JWT_ACCESS_SECRET', env.jwt.accessSecret],
  ['JWT_REFRESH_SECRET', env.jwt.refreshSecret],
];

function validateEnv() {
  const missing = REQUIRED.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy server/.env.example to server/.env and fill them in.'
    );
  }

  if (env.jwt.accessSecret === env.jwt.refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
  }

  if (env.isProd) {
    const weak = [
      ['JWT_ACCESS_SECRET', env.jwt.accessSecret],
      ['JWT_REFRESH_SECRET', env.jwt.refreshSecret],
    ].filter(([, v]) => v.startsWith('change-me') || v.length < 32);

    if (weak.length) {
      throw new Error(
        `Refusing to start in production with weak secrets: ${weak
          .map(([k]) => k)
          .join(', ')} (must be >= 32 chars and not the example value).`
      );
    }
  }

  /*
   * A loopback database in production is almost always the example value left
   * in place. Inside a container 127.0.0.1 is the container itself, so this
   * fails with a bare ECONNREFUSED that says nothing about the real cause.
   * ALLOW_LOCAL_DB exists for the rare host-networking deployment.
   */
  if (env.isProd && !bool(process.env.ALLOW_LOCAL_DB, false)) {
    const host = String(env.mongoUri || '');
    if (/@?(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(host)) {
      throw new Error(
        'MONGO_URI points at localhost in production - this is the example value, ' +
          'not a real database. Set it to your Atlas connection string ending in a ' +
          'database name. (Set ALLOW_LOCAL_DB=true if a local database is genuinely intended.)'
      );
    }
  }

  if (env.mail.driver === 'smtp') {
    const { host, user, pass } = env.mail.smtp;
    if (!host || !user || !pass) {
      throw new Error(
        'MAIL_DRIVER=smtp but SMTP_HOST / SMTP_USER / SMTP_PASS are not all set.'
      );
    }
  }

  if (env.storage.driver === 'cloudinary') {
    const { cloudName, apiKey, apiSecret } = env.storage.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'STORAGE_DRIVER=cloudinary but CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / ' +
          'CLOUDINARY_API_SECRET are not all set.'
      );
    }
  }
}

module.exports = { env, validateEnv };
