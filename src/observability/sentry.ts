import * as Sentry from '@sentry/node';

/**
 * Initialize Sentry error tracking.
 *
 * No-op when SENTRY_DSN is not configured, so local dev and tests do not
 * attempt to phone home. When configured, samples 10% of transactions for
 * performance monitoring (kept low because content generation is bursty and
 * each request is already expensive).
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    release: process.env.GIT_SHA,
    tracesSampleRate: 0.1,
  });
}
