"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import AppHeader from "../../../components/AppHeader";
import FormSubNav from "../../../components/FormSubNav";
import LoadError from "../../../components/LoadError";
import { apiFetch, apiJson, errorMessage, getApiBaseUrl } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth";
import { toast } from "../../../lib/toast";

const PRESET_WEBHOOKS = [
  {
    label: "Slack Incoming Webhook",
    value: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
  },
  {
    label: "Zapier Catch Hook",
    value: "https://hooks.zapier.com/hooks/catch/YOUR/ZAP/URL",
  },
  {
    label: "Custom Endpoint",
    value: "https://example.com/webhook",
  },
];

type Webhook = {
  id: string;
  url: string;
  isActive: boolean;
  createdAt: string;
  type?: "generic" | "slack" | "zapier";
};

type DeadLetter = {
  id: string;
  url: string;
  lastError: string;
  attemptsMade: number;
  failedAt: string;
};

type DeadLetterPage = { items: DeadLetter[]; nextCursor: string | null };

const DEAD_LETTER_PAGE = 20;

export default function WebhooksPage() {
  const params = useParams<{ formId?: string }>();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [deadLetterCursor, setDeadLetterCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const token = typeof window !== "undefined" ? getAuthToken() : null;
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    // Ignores a response that arrives after the effect re-ran, so it cannot
    // overwrite pages loaded since.
    let cancelled = false;

    const fetchWebhooks = async () => {
      if (!formId || !token) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError(null);
        const authHeader = { Authorization: `Bearer ${token}` };
        const [webhooksRes, deadLettersRes] = await Promise.all([
          apiFetch(`/api/webhooks?formId=${encodeURIComponent(formId)}`, { headers: authHeader }),
          apiFetch(`/api/webhooks/${formId}/dead-letters?limit=${DEAD_LETTER_PAGE}`, {
            headers: authHeader,
          }),
        ]);

        if (!webhooksRes.ok) {
          const body = await webhooksRes.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load webhooks");
        }
        const data = (await webhooksRes.json()) as Webhook[];
        if (cancelled) return;
        setWebhooks(data);

        // Only OWNER/ADMIN can read these; members just see no panel.
        if (deadLettersRes.ok) {
          const page = (await deadLettersRes.json()) as DeadLetterPage;
          if (cancelled) return;
          setDeadLetters(page.items);
          setDeadLetterCursor(page.nextCursor);
        }
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWebhooks();
    return () => {
      cancelled = true;
    };
  }, [formId, token, reloadKey]);

  const loadMoreDeadLetters = async () => {
    if (!token || !deadLetterCursor) return;

    setLoadingMore(true);
    try {
      const page = await apiJson<DeadLetterPage>(
        `/api/webhooks/${formId}/dead-letters?limit=${DEAD_LETTER_PAGE}&cursor=${encodeURIComponent(deadLetterCursor)}`,
        { token }
      );
      setDeadLetters((prev) => [...prev, ...page.items]);
      setDeadLetterCursor(page.nextCursor);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRetry = async (deadLetterId: string) => {
    if (!token) return;

    setRetryingId(deadLetterId);
    try {
      await apiJson(`/api/webhooks/dead-letters/${deadLetterId}/replay`, {
        method: "POST",
        token,
      });
      setDeadLetters((prev) => prev.filter((d) => d.id !== deadLetterId));
      toast.success("Delivery re-queued.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRetryingId(null);
    }
  };

  const handlePresetChange = (value: string) => {
    setSelectedPreset(value);
    const preset = PRESET_WEBHOOKS.find((p) => p.label === value);
    if (preset) setUrl(preset.value);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId || !token) return;

    setStatus(null);
    try {
      const webhook = await apiJson<Webhook>("/api/webhooks", {
        token,
        body: { formId, url },
      });
      setWebhooks((prev) => [webhook, ...prev]);
      setUrl("");
      setSelectedPreset("");
      toast.success("Webhook added.");
    } catch (error) {
      // Shown by the form: it's about the address just typed.
      setStatus(errorMessage(error));
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!token) return;
    if (!confirm("Delete this webhook? Responses will stop being sent to it.")) return;
    try {
      await apiJson(`/api/webhooks/${webhookId}`, { method: "DELETE", token });
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
      toast.success("Webhook deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleToggle = async (webhook: Webhook) => {
    if (!token) return;
    try {
      const updated = await apiJson<Webhook>(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        token,
        body: { isActive: !webhook.isActive },
      });
      setWebhooks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      toast.success(updated.isActive ? "Webhook enabled." : "Webhook disabled.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleTest = async (webhookId: string) => {
    if (!token) return;
    try {
      await apiJson(`/api/webhooks/${webhookId}/test`, { method: "POST", token });
      toast.success("Test delivery queued. Check your endpoint in a few seconds.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const typeBadge = (type?: string) => {
    if (type === "slack") return "bg-purple-100 text-purple-700";
    if (type === "zapier") return "bg-orange-100 text-orange-700";
    return "bg-slate-100 text-slate-600";
  };

  const typeLabel = (type?: string) => {
    if (type === "slack") return "Slack";
    if (type === "zapier") return "Zapier";
    return "Custom";
  };

  if (loading) {
    return (
      <div className="page-bg">
        <AppHeader />
        <div className="flex items-center justify-center py-24">
          <p className="text-slate-500">Loading webhooks...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-bg">
        <AppHeader />
        <FormSubNav formId={formId} active="webhooks" />
        <div className="mx-auto w-full max-w-3xl px-6 py-10">
          <LoadError message={loadError} onRetry={() => setReloadKey((key) => key + 1)} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-bg">
      <AppHeader />
      <FormSubNav formId={formId} active="webhooks" />
      <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Webhooks</h1>
            <p className="text-sm text-slate-500">Route submissions to Slack, Zapier, or custom URLs.</p>
          </div>
          <div className="text-xs text-slate-400">API: {apiBase}</div>
        </div>

        <div className="card-elevated">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Preset</label>
                <select
                  className="input mt-2"
                  value={selectedPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <option value="">Choose a destination...</option>
                  {PRESET_WEBHOOKS.map((preset) => (
                    <option key={preset.label} value={preset.label}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Webhook URL</label>
                <input
                  type="url"
                  required
                  data-testid="webhook-url"
                  placeholder="https://example.com/webhook"
                  className="input mt-2"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" data-testid="webhook-add">
              Add Webhook
            </button>
          </form>

          {status ? <div className="status-error mt-4" data-testid="webhooks-status">{status}</div> : null}
        </div>

        <div className="mt-6 space-y-4">
          {webhooks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              No webhooks configured. Add one to receive submissions.
            </div>
          ) : (
            webhooks.map((webhook) => (
              <div key={webhook.id} className="card transition hover:-translate-y-0.5" data-testid="webhook-row">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{webhook.url}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeBadge(
                          webhook.type
                        )}`}
                      >
                        {typeLabel(webhook.type)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {webhook.isActive ? (
                        <span className="text-emerald-600">Active</span>
                      ) : (
                        <span className="text-slate-400">Inactive</span>
                      )}
                      {" · "}
                      Added {new Date(webhook.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => handleTest(webhook.id)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleToggle(webhook)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      {webhook.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDelete(webhook.id)}
                      className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {deadLetters.length > 0 ? (
          <div className="mt-10">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Failed Deliveries</h2>
              <p className="text-sm text-slate-600">
                These exhausted every retry. Retrying puts them back in the queue.
              </p>
            </div>

            <div className="space-y-4">
              {deadLetters.map((deadLetter) => (
                <div key={deadLetter.id} className="card border-rose-200" data-testid="dead-letter-row">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {deadLetter.url}
                      </p>
                      <p className="mt-1 break-words text-xs text-rose-600">
                        {deadLetter.lastError}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {deadLetter.attemptsMade} attempt
                        {deadLetter.attemptsMade !== 1 ? "s" : ""}
                        {" · "}
                        Failed {new Date(deadLetter.failedAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRetry(deadLetter.id)}
                      disabled={retryingId === deadLetter.id}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {retryingId === deadLetter.id ? "Retrying..." : "Retry"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {deadLetterCursor ? (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={loadMoreDeadLetters}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load older failures"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
