"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch, getApiBaseUrl } from "../../lib/api";
import { canDeleteForm, getAuthToken, getAuthUser } from "../../lib/auth";

type FormItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { responses: number };
};

export default function DashboardPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    setToken(getAuthToken());
    setCanDelete(canDeleteForm(getAuthUser()));
  }, []);

  useEffect(() => {
    const fetchForms = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await apiFetch("/api/forms", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load forms");
        }

        const data = (await response.json()) as FormItem[];
        setForms(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setStatus(message);
      } finally {
        setLoading(false);
      }
    };

    fetchForms();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this form?")) return;
    if (!token) return;

    try {
      const response = await apiFetch(`/api/forms/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to delete");
      }

      setForms((prev) => prev.filter((f) => f.id !== id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    if (!token) return;

    try {
      const response = await apiFetch(`/api/forms/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !current }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to update");
      }

      setForms((prev) =>
        prev.map((f) => (f.id === id ? { ...f, isActive: !current } : f))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    }
  };

  return (
    <div className="page-bg">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Your Forms</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/builder" className="btn-primary">
              + New Form
            </Link>
            <Link href="/billing" className="btn-secondary">
              Billing
            </Link>
          </div>
        </header>

        {status ? (
          <div className="status-error mb-6">{status}</div>
        ) : null}

        {!token ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">Please sign in to view your forms.</p>
            <Link href="/auth" className="btn-primary mt-4 inline-block">
              Go to Auth
            </Link>
          </div>
        ) : loading ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-500">Loading forms...</p>
          </div>
        ) : forms.length === 0 ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">No forms yet. Create your first form!</p>
            <Link href="/builder" className="btn-primary mt-4 inline-block">
              Create Form
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <div
                key={form.id}
                className="card-elevated transition hover:-translate-y-1"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold text-slate-900">{form.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {form._count.responses} response
                      {form._count.responses !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      form.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {form.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-4 text-xs text-slate-400">
                  Updated {new Date(form.updatedAt).toLocaleDateString()}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    href={`/builder?formId=${form.id}`}
                    className="btn-primary py-2 text-xs"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/share/${form.id}`}
                    className="btn-secondary py-2 text-xs"
                  >
                    Share
                  </Link>
                  <Link
                    href={`/analytics/${form.id}`}
                    className="btn-secondary py-2 text-xs"
                  >
                    Analytics
                  </Link>
                  <Link
                    href={`/responses/${form.id}`}
                    className="btn-secondary py-2 text-xs"
                  >
                    Responses
                  </Link>
                  <Link
                    href={`/webhooks/${form.id}`}
                    className="btn-secondary py-2 text-xs"
                  >
                    Webhooks
                  </Link>
                  <button
                    onClick={() => handleToggle(form.id, form.isActive)}
                    className="btn-secondary py-2 text-xs"
                  >
                    {form.isActive ? "Disable" : "Enable"}
                  </button>
                  {canDelete ? (
                    <button
                      onClick={() => handleDelete(form.id)}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:border-rose-300"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
