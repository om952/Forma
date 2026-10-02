import * as Sentry from "@sentry/nextjs";

/** Loads the Sentry setup for whichever runtime Next.js is starting. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Reports errors thrown while the server renders a page or runs a route. */
export const onRequestError = Sentry.captureRequestError;
