"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch, getApiBaseUrl } from "../../lib/api";
import { getAuthToken } from "../../lib/auth";
import { useFormBuilderStore } from "../../stores/formBuilderStore";

export default function FormBuilderPage() {
  const { schema, addField } = useFormBuilderStore();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);

    try {
      if (!token) {
        setStatus("Please sign in before saving a form.");
        return;
      }

      const response = await apiFetch("/api/forms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "My First Form",
          schema,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || "Failed to save form");
      }

      setStatus("Form saved successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#f7f4ef_0%,#e7f5f2_45%,#fff2e2_100%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:flex-row">
        <aside className="w-full rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur lg:w-72">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Toolbox
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Forma Builder
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              Add fields from the left and preview your form layout on the
              right.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-900"
              onClick={() => addField("text")}
            >
              Add Text Field
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-900"
              onClick={() => addField("select")}
            >
              Add Select Field
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-900"
              onClick={() => addField("file")}
            >
              Add File Upload
            </button>
          </div>

          <div className="mt-8 space-y-3">
            <button
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Form"}
            </button>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              API: {apiBase}
            </div>
            {token ? (
              <p className="text-xs text-slate-500">Authenticated</p>
            ) : (
              <p className="text-xs text-slate-500">
                Not signed in. <Link className="text-slate-900 underline" href="/auth">Go to auth</Link>
              </p>
            )}
            {status ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                {status}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex-1 rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Live Preview
              </h2>
              <p className="text-sm text-slate-600">
                {schema.length === 0
                  ? "Add a field to start building."
                  : `${schema.length} field${schema.length > 1 ? "s" : ""} added.`}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Draft
            </span>
          </div>

          <div className="mt-8 space-y-5">
            {schema.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
                Drag in fields to see them here.
              </div>
            ) : (
              schema.map((field) => (
                <div
                  key={field.id}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                >
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    {field.label}
                    {field.required ? " *" : ""}
                  </label>
                  {field.type === "text" ? (
                    <input
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                      placeholder="Type here..."
                    />
                  ) : null}
                  {field.type === "select" ? (
                    <select className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm">
                      <option>Select an option</option>
                    </select>
                  ) : null}
                  {field.type === "file" ? (
                    <input
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                      type="file"
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
