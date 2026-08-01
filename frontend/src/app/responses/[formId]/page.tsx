"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, getApiBaseUrl } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth";

type ResponseItem = {
  id: string;
  payload: Record<string, string>;
  submittedAt: string;
};

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
  const [status, setStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!formId || !token) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const authHeader = { Authorization: `Bearer ${token}` };
        const [responsesRes, formRes] = await Promise.all([
          apiFetch(`/api/responses/${formId}`, { headers: authHeader }),
          apiFetch(`/api/forms/${formId}`, { headers: authHeader }),
        ]);

        if (!responsesRes.ok) {
          const body = await responsesRes.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load responses");
        }

        const data = (await responsesRes.json()) as ResponseItem[];
        setResponses(data);

        // Used to show field labels instead of raw field ids.
        if (formRes.ok) {
          setForm((await formRes.json()) as FormSummary);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setStatus(message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [formId, token]);

  const labelForField = (fieldId: string) =>
    form?.schema?.find((field) => field.id === fieldId)?.label ?? fieldId;

  const handleExport = async () => {
    if (!formId || !token) return;

    setIsExporting(true);
    setStatus(null);
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
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page-bg">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="eyebrow">Responses</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {form?.name ?? "Submissions"}
            </h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExport}
              disabled={isExporting || responses.length === 0}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
            <Link href={`/analytics/${formId}`} className="btn-secondary">
              Analytics
            </Link>
            <Link href="/dashboard" className="btn-primary">
              Dashboard
            </Link>
          </div>
        </header>

        {status ? <div className="status-error mb-6">{status}</div> : null}

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
        ) : responses.length === 0 ? (
          <div className="card-elevated p-10 text-center">
            <p className="text-slate-600">No submissions yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {responses.map((resp) => (
              <div key={resp.id} className="card-elevated">
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
          </div>
        )}
      </div>
    </div>
  );
}
