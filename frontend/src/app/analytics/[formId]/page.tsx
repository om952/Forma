"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AppHeader from "../../../components/AppHeader";
import FormSubNav from "../../../components/FormSubNav";
import { apiFetch, getApiBaseUrl } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth";

type AnalyticsSeries = {
  date: string;
  count: number;
};

type FieldStat = {
  fieldId: string;
  label: string;
  type: string;
  shown: number;
  filled: number;
  dropOff: number;
};

type AnalyticsResponse = {
  formId: string;
  totalResponses: number;
  series: AnalyticsSeries[];
  fieldStats: FieldStat[];
};

const RAZORPAY_KEY_ID =
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "YOUR_RAZORPAY_KEY_HERE";

const loadRazorpay = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Razorpay is not available"));
      return;
    }

    if ("Razorpay" in window) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });

export default function AnalyticsPage() {
  const params = useParams<{ formId?: string }>();
  const formId = typeof params.formId === "string" ? params.formId : "";
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  const maxCount = useMemo(() => {
    if (!analytics?.series?.length) return 1;
    return Math.max(...analytics.series.map((item) => item.count), 1);
  }, [analytics]);

  const maxShown = useMemo(() => {
    if (!analytics?.fieldStats?.length) return 1;
    return Math.max(...analytics.fieldStats.map((f) => f.shown), 1);
  }, [analytics]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      setStatus(null);
      setUpgradeRequired(false);
      try {
        if (!formId) {
          setStatus("Form ID is missing from the URL.");
          return;
        }
        if (!token) {
          setStatus("Please sign in to view analytics.");
          return;
        }

        const response = await apiFetch(`/api/analytics/${formId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));

          // Free tier: show an upgrade prompt rather than a generic error.
          if (response.status === 403 && body.code === "UPGRADE_REQUIRED") {
            setUpgradeRequired(true);
            return;
          }

          throw new Error(body.message || "Failed to load analytics");
        }

        const data = (await response.json()) as AnalyticsResponse;
        setAnalytics(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setStatus(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [formId, token]);

  const handleUpgrade = async () => {
    try {
      await loadRazorpay();
      if (!token) {
        setStatus("Please sign in to upgrade.");
        return;
      }

      const response = await apiFetch("/api/payments/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: 19900, currency: "INR" }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Unable to create payment order");
      }

      const { orderId, amount, currency, keyId } = (await response.json()) as {
        orderId: string;
        amount: number;
        currency: string;
        keyId?: string;
      };

      const RazorpayCtor = (window as Window & { Razorpay?: any }).Razorpay;
      if (!RazorpayCtor) throw new Error("Razorpay SDK not available");

      const checkout = new RazorpayCtor({
        key: keyId ?? RAZORPAY_KEY_ID,
        amount,
        currency,
        name: "Forma",
        description: "Upgrade to Premium",
        order_id: orderId,
        theme: { color: "#4f46e5" },
      });

      checkout.open();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    }
  };

  return (
    <div className="page-bg">
      <AppHeader />
      <FormSubNav formId={formId} active="analytics" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header>
          <p className="eyebrow">Analytics</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Form Insights</h1>
          <p className="text-sm text-slate-600">
            Responses, drop-off rates, and field-level activity.
          </p>
        </header>

        {upgradeRequired ? (
          <div className="card-elevated mx-auto max-w-xl text-center">
            <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Premium feature
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
              Unlock analytics
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              See submission trends, per-field drop-off rates, and heatmaps for this
              form. Upgrade your organisation to Premium to turn it on.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button className="btn-primary" onClick={handleUpgrade}>
                Upgrade to Premium
              </button>
              <Link href="/billing" className="btn-secondary">
                View plans
              </Link>
            </div>
            {status ? <div className="status-error mt-6">{status}</div> : null}
          </div>
        ) : (
        <>
        <section className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="card-elevated">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Submissions</h2>
                <p className="text-sm text-slate-600">{analytics?.totalResponses ?? 0} total</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Last 7 days
              </span>
            </div>

            <div className="mt-8 flex items-end gap-3">
              {(analytics?.series ?? []).map((item) => (
                <div key={item.date} className="flex flex-1 flex-col gap-2">
                  <div className="h-32 rounded-2xl bg-slate-100 p-2">
                    <div
                      className="h-full rounded-2xl bg-slate-900"
                      style={{ height: `${(item.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <div className="text-center text-xs text-slate-500">{item.date.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>

          <aside className="card-elevated">
            <h3 className="text-lg font-semibold text-slate-900">Upgrade</h3>
            <p className="mt-2 text-sm text-slate-600">
              Unlock premium analytics and unlimited forms.
            </p>
            <button className="btn-primary mt-6 w-full" onClick={handleUpgrade}>
              Upgrade to Premium
            </button>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              API: {apiBase}
            </div>
            {token ? (
              <p className="mt-2 text-xs text-slate-500">Authenticated</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Not signed in.{" "}
                <Link className="text-slate-900 underline" href="/auth">
                  Go to auth
                </Link>
              </p>
            )}
          </aside>
        </section>

        <section className="card-elevated">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Field Drop-off Rates</h2>
            <p className="text-sm text-slate-600">
              Percentage of users who viewed a field but didn't fill it.
            </p>
          </div>

          <div className="space-y-5">
            {analytics?.fieldStats?.map((field) => {
              const fillRate = field.shown > 0 ? (field.filled / field.shown) * 100 : 0;
              return (
                <div key={field.fieldId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-900">{field.label}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {field.type}
                      </span>
                    </div>
                    <div className="text-right text-sm">
                      <span className="font-semibold text-slate-900">{field.dropOff}% drop-off ·{" "}</span>
                      <span className="text-slate-500">{field.filled}/{field.shown}</span>
                    </div>
                  </div>

                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-900"
                      style={{ width: `${fillRate}%` }}
                    />
                  </div>

                  {field.dropOff > 50 ? (
                    <p className="text-xs text-rose-600">
                      High drop-off — consider making this field optional or improving the label.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {analytics?.fieldStats?.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
              No fields in this form yet.
            </div>
          ) : null}
        </section>

        <section className="card-elevated">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Submission Heatmap</h2>
            <p className="text-sm text-slate-600">Field activity relative to total views.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {analytics?.fieldStats?.map((field) => {
              const intensity =
                maxShown > 0 ? Math.round((field.shown / maxShown) * 100) : 0;
              return (
                <div
                  key={field.fieldId}
                  className="rounded-2xl border border-slate-200 p-4 text-center"
                  style={{
                    backgroundColor: `rgba(15, 23, 42, ${Math.max(0.05, intensity / 200)})`,
                  }}
                >
                  <p className="text-sm font-medium text-slate-900">{field.label}</p>
                  <p className="mt-1 text-xs text-slate-600">{field.shown} views</p>
                  <p className="text-xs text-slate-500">{intensity}% intensity</p>
                </div>
              );
            })}
          </div>
        </section>

        {status ? <div className="status-error">{status}</div> : null}
        </>
        )}

        {isLoading ? <div className="status-info">Loading analytics...</div> : null}
      </div>
    </div>
  );
}
