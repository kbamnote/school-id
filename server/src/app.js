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
      return cb(new Error(`Origin ${origin} is not allowed by CORS`));
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
