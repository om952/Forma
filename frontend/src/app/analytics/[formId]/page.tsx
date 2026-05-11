"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, getApiBaseUrl } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth";

type AnalyticsSeries = {
  date: string;
  count: number;
};

type AnalyticsResponse = {
  formId: string;
  totalResponses: number;
  series: AnalyticsSeries[];
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
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  const maxCount = useMemo(() => {
    if (!analytics?.series?.length) {
      return 1;
    }

    return Math.max(...analytics.series.map((item) => item.count), 1);
  }, [analytics]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      setStatus(null);

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
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
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

      const { orderId, amount, currency, keyId } =
        (await response.json()) as {
          orderId: string;
          amount: number;
          currency: string;
          keyId?: string;
        };

      const RazorpayCtor = (window as Window & { Razorpay?: any }).Razorpay;

      if (!RazorpayCtor) {
        throw new Error("Razorpay SDK not available");
      }

      const checkout = new RazorpayCtor({
        key: keyId ?? RAZORPAY_KEY_ID,
        amount,
        currency,
        name: "Forma",
        description: "Upgrade to Premium",
        order_id: orderId,
        theme: { color: "#1f2937" },
      });

      checkout.open();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fef7ed_0%,#f3f4f6_45%,#eef2ff_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Analytics
          </p>
          <h1 className="text-3xl font-semibold">Form Insights</h1>
          <p className="text-sm text-slate-600">
            Responses and activity over the last 7 days.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Submissions</h2>
                <p className="text-sm text-slate-600">
                  {analytics?.totalResponses ?? 0} total
                </p>
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
                      style={{
                        height: `${(item.count / maxCount) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="text-center text-xs text-slate-500">
                    {item.date.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
            <h3 className="text-lg font-semibold">Upgrade</h3>
            <p className="mt-2 text-sm text-slate-600">
              Unlock premium analytics and unlimited forms.
            </p>
            <button
              className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              onClick={handleUpgrade}
            >
              Upgrade to Premium
            </button>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              API: {apiBase}
            </div>
            {token ? (
              <p className="mt-2 text-xs text-slate-500">Authenticated</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Not signed in. <Link className="text-slate-900 underline" href="/auth">Go to auth</Link>
              </p>
            )}
          </aside>
        </section>

        {status ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {status}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-500">
            Loading analytics...
          </div>
        ) : null}
      </div>
    </div>
  );
}
