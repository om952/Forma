"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Shown when a page throws while rendering. Unlike `global-error.tsx` it sits
 * inside the root layout, so fonts, styles and toasts keep working.
 */
export default function PageError({
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
    <div className="page-bg flex items-center justify-center px-6 py-16">
      <div className="card-elevated w-full max-w-md text-center" data-testid="page-error">
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
          <Link href="/dashboard" className="btn-secondary">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
