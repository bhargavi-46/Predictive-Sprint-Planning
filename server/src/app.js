import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { randomUUID } from 'node:crypto';

import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { httpLogger } from './observability/logger.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';

/**
 * Builds the Express app without binding a port, so tests can mount it
 * directly with supertest.
 */
export function createApp() {
  const app = express();

  // Behind a reverse proxy in production; needed for correct client IPs,
  // which the rate limiter keys on.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers. CSP is left to the static host serving the SPA — this
  // process only answers JSON, so a content policy here protects nothing.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || '*',
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    })
  );

  app.use(compression());

  /**
   * Correlation id. Every log line and error response carries the same id, so
   * a user-reported failure can be traced to its exact request in the logs.
   */
  app.use((req, res, next) => {
    req.id = req.get('X-Request-Id') || randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });

  app.use(httpLogger);
  app.use(express.json({ limit: '1mb' }));

  // Auth endpoints get a much tighter budget than the rest of the API:
  // unauthenticated and a natural target for credential stuffing.
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api', apiLimiter);

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
