const { env } = require('../config/env');

const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 };

/**
 * LOG_LEVEL overrides the default when set, which is what lets the test suite
 * run quietly - otherwise every deliberate 404 and rejected upload prints a
 * warning and buries the actual test output.
 */
const configured = String(process.env.LOG_LEVEL || '').toLowerCase();
const active =
  configured && configured in LEVELS ? LEVELS[configured] : LEVELS[env.isProd ? 'info' : 'debug'];

const stamp = () => new Date().toISOString();

function emit(level, args) {
  if (active < 0 || LEVELS[level] > active) return;
  const prefix = `[${stamp()}] ${level.toUpperCase()}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, ...args);
}

module.exports = {
  error: (...a) => emit('error', a),
  warn: (...a) => emit('warn', a),
  info: (...a) => emit('info', a),
  debug: (...a) => emit('debug', a),
};
