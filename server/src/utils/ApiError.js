/**
 * Operational (expected) error. Anything thrown that is NOT an ApiError is
 * treated as a programmer error and its details are hidden in production.
 */
class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || null;
    this.details = details || null;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', opts) {
    return new ApiError(400, msg, opts);
  }
  static unauthorized(msg = 'Authentication required', opts) {
    return new ApiError(401, msg, opts);
  }
  static forbidden(msg = 'You do not have permission to perform this action', opts) {
    return new ApiError(403, msg, opts);
  }
  /**
   * Used for genuinely-missing records AND for cross-tenant access attempts.
   * Returning 403 on a cross-tenant hit would confirm the record exists, which
   * itself leaks tenant data - so those funnel through here too.
   */
  static notFound(msg = 'Resource not found', opts) {
    return new ApiError(404, msg, opts);
  }
  static conflict(msg = 'Conflict', opts) {
    return new ApiError(409, msg, opts);
  }
  static unprocessable(msg = 'Validation failed', opts) {
    return new ApiError(422, msg, opts);
  }
  static tooMany(msg = 'Too many requests', opts) {
    return new ApiError(429, msg, opts);
  }
  static internal(msg = 'Something went wrong', opts) {
    return new ApiError(500, msg, opts);
  }
}

module.exports = ApiError;
