/**
 * Error reporting. Entirely optional: without `SENTRY_DSN` every export here
 * is a no-op, so nothing else in the app has to know whether it is configured.
 *
 * Errors reach Sentry through the logger (see `logger.ts`): anything logged at
 * `error` or above with an `err` attached is reported. That keeps one call
 * site per failure instead of a log line plus a separate capture that the next
 * person to touch the handler forgets.
 */

import * as Sentry from "@sentry/node";

import { env } from "../config/env";

export const sentryEnabled = Boolean(env.SENTRY_DSN);

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    ...(env.APP_RELEASE ? { release: env.APP_RELEASE } : {}),
    // Errors only. Performance tracing is a separate decision with its own
    // cost.
    tracesSampleRate: 0,
    // Form submissions and uploads are respondents' personal data, and the
    // SDK attaches request bodies, cookies and headers by default. None of it
    // is needed to debug a stack trace.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: { allow: ["user-agent", "content-type", "x-request-id"] }, response: false },
      urlQueryParams: false,
    },
  });
}

export const captureException = (
  error: unknown,
  context?: Record<string, unknown>
) => {
  if (!sentryEnabled) return;

  Sentry.captureException(error, context ? { extra: context } : undefined);
};

/** Sends anything still buffered. Call before the process exits. */
export const flushErrorReports = async (timeoutMs = 2000) => {
  if (!sentryEnabled) return;

  await Sentry.close(timeoutMs);
};
