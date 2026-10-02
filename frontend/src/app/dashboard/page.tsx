"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppHeader from "../../components/AppHeader";
import LoadError from "../../components/LoadError";
import { apiJson, errorMessage } from "../../lib/api";
import { canDeleteForm, useAuthToken, useAuthUser } from "../../lib/auth";
import { toast } from "../../lib/toast";

type FormItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { responses: number };
};

type FormPage = { items: FormItem[]; nextCursor: string | null };

type Summary = { forms: number; activeForms: number; responses: number };

const PAGE_SIZE = 24;

export default function DashboardPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by "Try again" to re-run the first page load.
  const [reloadKey, setReloadKey] = useState(0);
  const token = useAuthToken();
  const canDelete = canDeleteForm(useAuthUser());

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  // Bumped to re-read the totals after a form is deleted or switched off.
  const [summaryKey, setSummaryKey] = useState(0);

  // Totals come from the server: the list below holds only the pages loaded.
  const stats = useMemo(
    () => ({
      totalForms: summary?.forms ?? forms.length,
      totalResponses:
        summary?.responses ?? forms.reduce((sum, f) => sum + f._count.responses, 0),
      activeForms: summary?.activeForms ?? forms.filter((f) => f.isActive).length,
    }),
    [forms, summary]
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    apiJson<Summary>("/api/forms/summary", { token })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        // The tiles fall back to counting the loaded forms.
      });

    return () => {
      cancelled = true;
    };
  }, [token, summaryKey]);

  useEffect(() => {
    // Ignores a response that arrives after the effect re-ran, so it cannot
    // overwrite pages loaded since.
    let cancelled = false;

    const fetchForms = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError(null);
        const page = await apiJson<FormPage>(`/api/forms?limit=${PAGE_SIZE}`, { token });
        if (cancelled) return;
        setForms(page.items);
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchForms();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const loadMore = async () => {
    if (!token || !nextCursor) return;

    setLoadingMore(true);
    try {
      const page = await apiJson<FormPage>(
        `/api/forms?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        { token }
      );
      setForms((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this form?")) return;
    if (!token) return;

    try {
      await apiJson(`/api/forms/${id}`, { method: "DELETE", token });
      setForms((prev) => prev.filter((f) => f.id !== id));
      setSummaryKey((key) => key + 1);
      toast.success("Form deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    if (!token) return;

    try {
      await apiJson(`/api/forms/${id}`, {
        method: "PATCH",
        token,
        body: { isActive: !current },
      });
      setForms((prev) =>
        prev.map((f) => (f.id === id ? { ...f, isActive: !current } : f))
      );
      setSummaryKey((key) => key + 1);
      toast.success(
        current ? "Form disabled. It no longer accepts responses." : "Form enabled."
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="page-bg">
      <AppHeader />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Your Forms</h1>
          </div>
          <Link href="/builder" className="btn-primary">
            + New Form
          </Link>
        </header>

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
        ) : loadError ? (
          <LoadError message={loadError} onRetry={() => setReloadKey((key) => key + 1)} />
        ) : forms.length === 0 ? (
          <div className="card-elevated flex flex-col items-center p-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">
              📋
            </span>
            <h2 className="mt-5 text-lg font-semibold text-slate-900">No forms yet</h2>
            <p className="mt-2 max-w-sm text-sm text-slate-600">
              Create your first form to start collecting responses — it takes less
              than a minute.
            </p>
            <Link href="/builder" className="btn-primary mt-6 inline-block">
              Create your first form
            </Link>
          </div>
        ) : (
          <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="stat-tile">
              <span className="stat-tile-icon">📋</span>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.totalForms}</p>
                <p className="text-xs text-slate-500">Total forms</p>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon">📥</span>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.totalResponses}</p>
                <p className="text-xs text-slate-500">Total responses</p>
              </div>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-icon">🟢</span>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{stats.activeForms}</p>
                <p className="text-xs text-slate-500">Active forms</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <div
                key={form.id}
                data-testid="form-card"
                className="card-elevated transition hover:-translate-y-1"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold text-slate-900" data-testid="form-card-title">{form.name}</h3>
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
                    data-testid="form-toggle"
                    onClick={() => handleToggle(form.id, form.isActive)}
                    className="btn-secondary py-2 text-xs"
                  >
                    {form.isActive ? "Disable" : "Enable"}
                  </button>
                  {canDelete ? (
                    <button
                      data-testid="form-delete"
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
          {nextCursor ? (
            <div className="mt-6 text-center">
              <button
                type="button"
                className="btn-secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more forms"}
              </button>
            </div>
          ) : null}
          </>
        )}
      </div>
    </div>
  );
}
