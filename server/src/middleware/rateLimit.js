import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

/**
 * Request budgets.
 *
 * Without these, the login endpoint accepts unlimited password guesses — the
 * single most exploitable surface in the API. bcrypt makes each guess slow,
 * but slow is not the same as bounded.
 *
 * Limits are disabled under NODE_ENV=test so the suite can hammer endpoints
 * freely; every other environment enforces them.
 */
const shared = {
  standardHeaders: 'draft-7', // RateLimit-* response headers
  legacyHeaders: false,
  skip: () => isTest,
};

/** Generous ceiling for ordinary authenticated traffic. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

/**
 * Tight budget for credential endpoints. Counts only failed attempts, so a
 * user logging in correctly on several devices is never locked out.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many sign-in attempts from this address. Try again in 15 minutes.',
  },
});
