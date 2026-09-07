const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');

const { env } = require('./config/env');

// Registers every mongoose model up front so populate() can always resolve them.
require('./models');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');
const ApiError = require('./utils/ApiError');
const logger = require('./utils/logger');

const app = express();

if (env.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ------------------------------- security -------------------------------- */
app.use(
  helmet({
    // Uploaded images are served to a different origin (the Vite dev server /
    // the deployed client), so the default same-origin policy would block them.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: env.isProd ? undefined : false,
  })
);

const allowedOrigins = env.clientUrl.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // No origin = same-origin, curl, or a mobile client. Allowed.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);

      /*
       * A plain Error here reaches the catch-all handler and is reported as a
       * generic 500, which tells whoever is debugging nothing at all - the
       * browser just shows a failed request. An ApiError renders as a 403
       * naming the offending origin, and the log records what CLIENT_URL
       * actually contains, which is the thing that is wrong.
       */
      logger.warn('Blocked a request by CORS', { origin, allowed: allowedOrigins });
      return cb(
        ApiError.forbidden(
          `Origin ${origin} is not allowed. Add it to CLIENT_URL on the server.`,
          { code: 'CORS_ORIGIN_BLOCKED' }
        )
      );
    },
    credentials: true, // required for the refresh-token cookie
  })
);

/* ------------------------------- parsing --------------------------------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(compression());

// Strips `$`-prefixed and dotted keys so user input cannot become a mongo operator.
app.use(mongoSanitize({ replaceWith: '_' }));

if (!env.isProd) app.use(morgan('dev'));

/* -------------------------------- routes --------------------------------- */
app.get('/health', (req, res) =>
  res.json({ success: true, service: 'mrpw-printdata-api', uptime: process.uptime() })
);

app.use('/api', apiLimiter, routes);

/* ------------------------------- fallbacks ------------------------------- */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
