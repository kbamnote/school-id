const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** 404 for any route that fell through the router stack. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Translates driver/library errors into clean ApiErrors before they reach the client. */
function normalise(err) {
  if (err instanceof ApiError) return err;

  // Mongoose schema validation
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.unprocessable('Validation failed', { code: 'VALIDATION_ERROR', details });
  }

  // Bad ObjectId / number cast
  if (err.name === 'CastError') {
    return ApiError.badRequest(`Invalid value for "${err.path}"`, { code: 'CAST_ERROR' });
  }

  // Unique index violation - report the field, never the attempted value
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    return ApiError.conflict(
      fields.length
        ? `A record with this ${fields.join(' + ')} already exists`
        : 'Duplicate record',
      { code: 'DUPLICATE_KEY', details: { fields } }
    );
  }

  if (err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid token', { code: 'INVALID_TOKEN' });
  }
  if (err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Session expired, please sign in again', {
      code: 'TOKEN_EXPIRED',
    });
  }

  // Multer upload failures
  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiError.badRequest(`File is larger than the ${env.storage.maxMb}MB limit`, {
      code: 'FILE_TOO_LARGE',
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiError.badRequest('Unexpected file field', { code: 'UNEXPECTED_FILE' });
  }

  if (err.type === 'entity.too.large') {
    return ApiError.badRequest('Request body too large', { code: 'BODY_TOO_LARGE' });
  }

  return null; // unknown -> treated as a programmer error below
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const known = normalise(err);

  if (known) {
    if (known.statusCode >= 500) logger.error(known.message, err);
    return res.status(known.statusCode).json({
      success: false,
      message: known.message,
      ...(known.code ? { code: known.code } : {}),
      ...(known.details ? { details: known.details } : {}),
    });
  }

  // Unexpected error: log everything server-side, reveal nothing client-side.
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    organizationId: req.tenantId,
  });

  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
    code: 'INTERNAL_ERROR',
    ...(env.isProd ? {} : { debug: { message: err.message, stack: err.stack } }),
  });
}

module.exports = { notFound, errorHandler };
