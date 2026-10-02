"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "./globals.css";

/**
 * The last-resort error boundary: shown when something throws outside any
 * page's own handling, including in the root layout. It replaces that layout,
 * so it renders its own <html> and loads the stylesheet itself.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="page-bg flex min-h-full items-center justify-center px-6">
        <div className="card-elevated w-full max-w-md text-center">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            This page hit an unexpected error
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            It has been reported. Try again, or go back to your dashboard.
          </p>
          {error.digest ? (
            <p className="mt-3 text-xs text-slate-400">Reference: {error.digest}</p>
          ) : null}
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" className="btn-primary" onClick={() => unstable_retry()}>
              Try again
            </button>
            {/* A full reload, not client navigation: the app's own state may be what broke. */}
            <a href="/dashboard" className="btn-secondary">
              Go to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
