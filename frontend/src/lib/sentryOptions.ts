import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * A URL with its query string and fragment removed. The fragment matters
 * most: invite, password-reset and email-confirmation links carry their
 * one-time token there (`/reset-password#<token>`), and the page URL a
 * browser error is reported with includes it.
 */
export const withoutQueryOrFragment = (url: string): string => url.split(/[?#]/, 1)[0] ?? url;

const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    if (event.request.url) event.request.url = withoutQueryOrFragment(event.request.url);
    delete event.request.query_string;
  }
  return event;
};

const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = withoutQueryOrFragment(data[key]);
    }
  }
  return breadcrumb;
};

/**
 * Settings shared by every Sentry setup in the web app (browser, Next.js
 * server, Edge), matching the API's in backend/src/observability/sentry.ts.
 *
 * Errors only: no performance tracing. And no personal data: public form
 * pages carry respondents' answers in request bodies, and the SDK would
 * otherwise attach bodies, cookies, headers and user details. URLs lose their
 * query string and fragment on the way out, in events and in the navigation
 * and request breadcrumbs, since `dataCollection` alone does not cover the
 * browser's own page URL.
 */
export const sentryOptions = {
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    httpHeaders: { request: { allow: ["user-agent", "content-type"] }, response: false },
    urlQueryParams: false,
  },
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
