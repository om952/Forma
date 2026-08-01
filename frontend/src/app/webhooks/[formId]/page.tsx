"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, getApiBaseUrl } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth";

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

export default function WebhooksPage() {
  const params = useParams<{ formId?: string }>();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const token = typeof window !== "undefined" ? getAuthToken() : null;
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    const fetchWebhooks = async () => {
      if (!formId || !token) {
        setLoading(false);
        return;
      }

      try {
        const authHeader = { Authorization: `Bearer ${token}` };
        const [webhooksRes, deadLettersRes] = await Promise.all([
          apiFetch(`/api/webhooks/${formId}`, { headers: authHeader }),
          apiFetch(`/api/webhooks/${formId}/dead-letters`, { headers: authHeader }),
        ]);

        if (!webhooksRes.ok) throw new Error("Failed to load webhooks");
        const data = (await webhooksRes.json()) as Webhook[];
        setWebhooks(data);

        // Only OWNER/ADMIN can read these; members just see no panel.
        if (deadLettersRes.ok) {
          setDeadLetters((await deadLettersRes.json()) as DeadLetter[]);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Error");
      } finally {
        setLoading(false);
      }
    };

    fetchWebhooks();
  }, [formId, token]);

  const handleRetry = async (deadLetterId: string) => {
    if (!token) return;

    setRetryingId(deadLetterId);
    setStatus(null);
    try {
      const response = await apiFetch(
        `/api/webhooks/dead-letters/${deadLetterId}/replay`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to retry delivery");
      }

      setDeadLetters((prev) => prev.filter((d) => d.id !== deadLetterId));
      setStatus("Delivery re-queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error");
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
      const response = await apiFetch(`/api/webhooks/${formId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to create webhook");
      }

      const webhook = (await response.json()) as Webhook;
      setWebhooks((prev) => [webhook, ...prev]);
      setUrl("");
      setSelectedPreset("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error");
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!token) return;
    try {
      const response = await apiFetch(`/api/webhooks/${webhookId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete");
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error");
    }
  };

  const handleToggle = async (webhook: Webhook) => {
    if (!token) return;
    try {
      const response = await apiFetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !webhook.isActive }),
      });
      if (!response.ok) throw new Error("Failed to update");
      const updated = (await response.json()) as Webhook;
      setWebhooks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error");
    }
  };

  const handleTest = async (webhookId: string) => {
    if (!token) return;
    try {
      const response = await apiFetch(`/api/webhooks/${webhookId}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to test webhook");
      setStatus("Test webhook queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error");
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
      <div className="page-bg flex items-center justify-center">
        <p className="text-slate-500">Loading webhooks...</p>
      </div>
    );
  }

  return (
    <div className="page-bg px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              ← Back to Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Webhooks</h1>
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
                  placeholder="https://example.com/webhook"
                  className="input mt-2"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary">
              Add Webhook
            </button>
          </form>

          {status ? <div className="status-info mt-4">{status}</div> : null}
        </div>

        <div className="mt-6 space-y-4">
          {webhooks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              No webhooks configured. Add one to receive submissions.
            </div>
          ) : (
            webhooks.map((webhook) => (
              <div key={webhook.id} className="card transition hover:-translate-y-0.5">
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
                <div key={deadLetter.id} className="card border-rose-200">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
