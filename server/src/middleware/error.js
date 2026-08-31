import { logger } from '../observability/logger.js';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps async route handlers so rejected promises reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(_req, _res, next) {
  next(new ApiError(404, 'Route not found'));
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
export function errorHandler(err, req, res, _next) {
  // Mongoose schema validation -> 400 with per-field messages
  if (err.name === 'ValidationError') {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message])
    );
    return res.status(400).json({ error: 'Validation failed', details, requestId: req.id });
  }

  /**
   * Optimistic-concurrency failure: the document changed between the client
   * reading it and saving it. A 409 tells the client to re-read and retry,
   * which is materially different from a 400 "you sent bad data".
   */
  if (err.name === 'VersionError') {
    return res.status(409).json({
      error:
        'This item was changed by someone else while you were editing. Reload to see the latest version, then reapply your change.',
      code: 'STALE_VERSION',
      requestId: req.id,
    });
  }

  // Duplicate key (currently only the unique email index)
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'An account with that email already exists',
      requestId: req.id,
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Malformed identifier: ${err.value}`,
      requestId: req.id,
    });
  }

  const status = err.status || 500;
  if (status >= 500) {
    logger.error({ err, requestId: req.id, url: req.originalUrl }, 'unhandled error');
  }

  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
    requestId: req.id,
  });
}
