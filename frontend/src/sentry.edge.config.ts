import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./lib/sentryOptions";

/* Errors in the Edge runtime (middleware). Same settings as the server. */
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, ...sentryOptions });
}
