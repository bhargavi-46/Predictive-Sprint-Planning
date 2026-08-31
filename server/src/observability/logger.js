import pino from 'pino';
import pinoHttp from 'pino-http';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Structured JSON logging.
 *
 * JSON rather than printf strings because logs are queried, not read: a log
 * aggregator can filter on `statusCode >= 500` or group by `requestId` only if
 * the fields are real fields. In development a human-readable transport is
 * used instead, since nobody greps their own terminal.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  base: { service: 'sprint-api' },
  redact: {
    // Credentials and tokens must never reach disk, even at debug level.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout, no extra dependency
        },
      }),
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  // Health checks would otherwise dominate the log volume.
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
