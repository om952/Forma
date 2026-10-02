import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./lib/sentryOptions";

/*
 * Errors in the Next.js server (rendering, route handlers). Off unless
 * SENTRY_DSN is set at run time. Same privacy rules as the browser and the
 * API: errors only, no personal data.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, ...sentryOptions });
}
