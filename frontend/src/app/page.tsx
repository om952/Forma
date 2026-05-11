"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [formId, setFormId] = useState("");

  const handleAnalytics = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = formId.trim();
    if (trimmed) {
      router.push(`/analytics/${trimmed}`);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef2ff_0%,#fef3c7_45%,#f8fafc_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="rounded-3xl border border-white/70 bg-white/80 p-10 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur animate-[floatIn_0.6s_ease]">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
            Forma Console
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">
            Build forms. Capture responses. Trigger webhooks.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-600">
            Use the access page to authenticate, then head to the builder and
            analytics dashboards to verify the full workflow.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <Link
            href="/auth"
            className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur transition hover:-translate-y-1"
          >
            <h2 className="text-2xl font-semibold">Auth Portal</h2>
            <p className="mt-2 text-sm text-slate-600">
              Create an org or sign in to store your token locally.
            </p>
          </Link>

          <Link
            href="/builder"
            className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur transition hover:-translate-y-1"
          >
            <h2 className="text-2xl font-semibold">Form Builder</h2>
            <p className="mt-2 text-sm text-slate-600">
              Assemble a schema and save it directly to the backend.
            </p>
          </Link>
        </section>

        <form
          onSubmit={handleAnalytics}
          className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur"
        >
          <h3 className="text-xl font-semibold">Analytics Viewer</h3>
          <p className="mt-2 text-sm text-slate-600">
            Paste a form ID to open its analytics dashboard.
          </p>
          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <input
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              placeholder="Form ID"
              value={formId}
              onChange={(event) => setFormId(event.target.value)}
            />
            <button
              className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              type="submit"
            >
              Open analytics
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
