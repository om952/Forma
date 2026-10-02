"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import AppHeader from "../../../components/AppHeader";
import FormSubNav from "../../../components/FormSubNav";
import LoadError from "../../../components/LoadError";
import { apiFetch, apiJson, errorMessage } from "../../../lib/api";
import { useAuthToken } from "../../../lib/auth";
import { toast } from "../../../lib/toast";

type ResponseItem = {
  id: string;
  payload: Record<string, string>;
  submittedAt: string;
};

type ResponsePage = {
  items: ResponseItem[];
  nextCursor: string | null;
  total: number;
};

const PAGE_SIZE = 25;

type FormSummary = {
  name: string;
  schema: Array<{ id: string; label: string }>;
};

export default function ResponsesPage() {
  const params = useParams<{ formId?: string }>();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [form, setForm] = useState<FormSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const token = useAuthToken();

  useEffect(() => {
    // Ignores a response that arrives after the effect re-ran, so it cannot
    // overwrite pages loaded since.
    let cancelled = false;

    const fetchData = async () => {
      if (!formId || !token) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError(null);
        const authHeader = { Authorization: `Bearer ${token}` };
        const [responsesRes, formRes] = await Promise.all([
          apiFetch(`/api/responses/${formId}?limit=${PAGE_SIZE}`, { headers: authHeader }),
          apiFetch(`/api/forms/${formId}`, { headers: authHeader }),
        ]);

        if (!responsesRes.ok) {
          const body = await responsesRes.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load responses");
        }

        const data = (await responsesRes.json()) as ResponsePage;
        if (cancelled) return;
        setResponses(data.items);
        setNextCursor(data.nextCursor);
        setTotal(data.total);

        // Used to show field labels instead of raw field ids.
        if (formRes.ok) {
          setForm((await formRes.json()) as FormSummary);
        }
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [formId, token, reloadKey]);

  const loadMore = async () => {
    if (!token || !nextCursor) return;

    setLoadingMore(true);
    try {
      const page = await apiJson<ResponsePage>(
        `/api/responses/${formId}?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        { token }
      );
      setResponses((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setTotal(page.total);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const labelForField = (fieldId: string) =>
    form?.schema?.find((field) => field.id === fieldId)?.label ?? fieldId;

  const handleExport = async () => {
    if (!formId || !token) return;

    setIsExporting(true);
    try {
      const response = await apiFetch(`/api/responses/${formId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to export responses");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form?.name ?? "form"}-responses.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page-bg">
      <AppHeader />
      <FormSubNav formId={formId} active="responses" formName={form?.name} />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="eyebrow">Responses</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {form?.name ?? "Submissions"}
            </h1>
            {total > 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                {total} {total === 1 ? "response" : "responses"}
                {responses.length < total ? ` · showing the latest ${responses.length}` : ""}
              </p>
            ) : null}
          </div>
          <button
            data-testid="responses-export"
            onClick={handleExport}
            disabled={isExporting || responses.length === 0}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        </header>

        {!token ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">Please sign in to view responses.</p>
            <Link href="/auth" className="btn-primary mt-4 inline-block">
              Go to Auth
            </Link>
          </div>
        ) : loading ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-500">Loading responses...</p>
          </div>
        ) : loadError ? (
          <LoadError message={loadError} onRetry={() => setReloadKey((key) => key + 1)} />
        ) : responses.length === 0 ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">No submissions yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {responses.map((resp) => (
              <div key={resp.id} className="card-elevated" data-testid="response-card">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    {new Date(resp.submittedAt).toLocaleString()}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {resp.id.slice(0, 8)}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {Object.entries(resp.payload).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <span className="font-medium text-slate-700">
                        {labelForField(key)}:
                      </span>
                      <span className="break-all text-slate-600">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {nextCursor ? (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load older responses"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
