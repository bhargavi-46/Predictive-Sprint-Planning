import { ZodError } from 'zod';
import { ApiError } from './error.js';

/**
 * Schema validation at the HTTP boundary.
 *
 * Controllers previously hand-checked each field, which meant validation rules
 * were scattered, inconsistently applied, and impossible to reuse. Declaring
 * them as schemas keeps every rule in one place and guarantees a controller
 * only ever sees data that has already been parsed and coerced.
 *
 * The parsed result replaces the raw input, so downstream code gets typed
 * values (numbers as numbers, dates as Dates) rather than raw strings.
 */
export function validate({ body, query, params }) {
  return (req, _res, next) => {
    try {
      if (params) req.params = params.parse(req.params);
      if (query) Object.assign(req.query, query.parse(req.query));
      if (body) req.body = body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Collapse Zod's tree into "field: message" lines the UI can show.
        const detail = err.issues
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ');
        return next(new ApiError(400, detail));
      }
      return next(err);
    }
  };
}
