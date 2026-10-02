import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./lib/sentryOptions";

/*
 * Browser error reporting. Off unless NEXT_PUBLIC_SENTRY_DSN was set when the
 * app was built (NEXT_PUBLIC_ values are inlined into the bundle). No session
 * replay: it would record respondents filling in forms. What is never
 * collected is in lib/sentryOptions.ts.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({ dsn, ...sentryOptions });
}
