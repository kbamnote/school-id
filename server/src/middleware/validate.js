const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Runs a Zod schema against part of the request and REPLACES that part with
 * the parsed result. Handlers therefore only ever see coerced, stripped,
 * schema-shaped data - unknown keys never reach a Mongoose update.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        // Express 5 makes req.query a getter; assigning per-key keeps this
        // working across versions.
        Object.keys(req.query).forEach((k) => delete req.query[k]);
        Object.assign(req.query, parsed);
      } else {
        req[source] = parsed;
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          ApiError.unprocessable('Please correct the highlighted fields', {
            code: 'VALIDATION_ERROR',
            details: err.errors.map((e) => ({
              field: e.path.join('.') || source,
              message: e.message,
            })),
          })
        );
      }
      return next(err);
    }
  };
}

const validateBody = (schema) => validate(schema, 'body');
const validateQuery = (schema) => validate(schema, 'query');
const validateParams = (schema) => validate(schema, 'params');

module.exports = { validate, validateBody, validateQuery, validateParams };
