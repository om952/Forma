"use client";

import { useToastStore } from "../lib/toast";

/**
 * Renders the toasts raised with `toast.success` / `toast.error`. Mounted once
 * in the root layout. The live regions are always present, so screen readers
 * announce a toast as soon as it is added.
 */
export default function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  const render = (kind: "success" | "error") =>
    toasts
      .filter((t) => t.kind === kind)
      .map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          data-kind={t.kind}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-[0_8px_28px_-6px_rgba(15,23,42,0.18)] animate-floatIn ${
            t.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span aria-hidden="true">{t.kind === "success" ? "✓" : "!"}</span>
          <p className="flex-1">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="-my-1 -mr-1 rounded-md px-1.5 text-base leading-none opacity-60 transition hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ));

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:left-auto sm:w-96">
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {render("success")}
      </div>
      <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
        {render("error")}
      </div>
    </div>
  );
}
