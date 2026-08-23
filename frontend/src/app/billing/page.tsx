"use client";

import { useEffect, useState } from "react";

import AppHeader from "../../components/AppHeader";
import { apiFetch, getApiBaseUrl } from "../../lib/api";
import { getAuthToken } from "../../lib/auth";

type SubscriptionStatus = {
  tier: "FREE" | "PREMIUM";
  status: string | null;
  currentPeriodEnd: string | null;
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

export default function BillingPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await apiFetch("/api/payments/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed to load subscription status");
        const data = (await response.json()) as SubscriptionStatus;
        setStatus(data);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Error");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [token]);

  const handleSubscribe = async () => {
    try {
      setError(null);
      await loadRazorpay();
      if (!token) return;

      const response = await apiFetch("/api/payments/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: selectedPlan }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to create subscription");
      }

      const { subscriptionId, amount, currency, keyId } = (await response.json()) as {
        subscriptionId: string;
        amount: number;
        currency: string;
        keyId?: string;
      };

      const RazorpayCtor = (window as Window & { Razorpay?: any }).Razorpay;
      if (!RazorpayCtor) throw new Error("Razorpay SDK not available");

      const checkout = new RazorpayCtor({
        key: keyId ?? RAZORPAY_KEY_ID,
        subscription_id: subscriptionId,
        amount,
        currency,
        name: "Forma",
        description: `Forma Premium - ${selectedPlan}`,
        handler: () => {
          setStatus({
            tier: "PREMIUM",
            status: "active",
            currentPeriodEnd: null,
          });
        },
        theme: { color: "#4f46e5" },
      });

      checkout.open();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error");
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your premium subscription?")) return;
    if (!token) return;

    try {
      const response = await apiFetch("/api/payments/cancel-subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to cancel");
      setStatus({ tier: "FREE", status: "cancelled", currentPeriodEnd: null });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error");
    }
  };

  if (loading) {
    return (
      <div className="page-bg">
        <AppHeader />
        <div className="flex items-center justify-center py-24">
          <p className="text-slate-500">Loading billing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-bg">
      <AppHeader />
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-6">
          <p className="eyebrow">Billing</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Plans</h1>
        </div>

        {error ? <div className="status-error mb-6">{error}</div> : null}

        {status?.tier === "PREMIUM" ? (
          <div className="card-elevated border-emerald-200 bg-emerald-50/80">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-emerald-900">Premium Plan</h2>
                <p className="mt-1 text-sm text-emerald-700">
                  Status: {status.status ?? "active"}
                  {status.currentPeriodEnd
                    ? ` · Renews on ${new Date(status.currentPeriodEnd).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                Active
              </span>
            </div>

            <ul className="mt-6 space-y-2 text-sm text-emerald-800">
              <li>✓ Unlimited forms</li>
              <li>✓ Advanced analytics (drop-off, heatmaps)</li>
              <li>✓ Webhooks to Slack, Zapier, custom endpoints</li>
              <li>✓ File uploads without limits</li>
            </ul>

            <button
              onClick={handleCancel}
              className="mt-6 rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Cancel Subscription
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="card-elevated">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Upgrade to Premium</h2>
              <p className="mt-2 text-sm text-slate-600">
                You are currently on the Free plan. Upgrade to unlock advanced features.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <button
                  onClick={() => setSelectedPlan("monthly")}
                  className={`rounded-2xl border p-6 text-left transition ${
                    selectedPlan === "monthly"
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-sm font-medium text-slate-500">Monthly</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">₹199</div>
                  <div className="text-xs text-slate-500">per month</div>
                </button>

                <button
                  onClick={() => setSelectedPlan("yearly")}
                  className={`rounded-2xl border p-6 text-left transition ${
                    selectedPlan === "yearly"
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-sm font-medium text-slate-500">Yearly</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">₹1999</div>
                  <div className="text-xs text-slate-500">per year (save 16%)</div>
                </button>
              </div>

              <button
                onClick={handleSubscribe}
                className="btn-primary mt-6 w-full"
              >
                Subscribe to Premium
              </button>

              <p className="mt-4 text-xs text-slate-500">
                Test mode: no real charges. Use Razorpay test card 5267 3181 8797 5449.
              </p>
            </div>

            <div className="card-elevated">
              <h3 className="text-lg font-semibold text-slate-900">Free plan limits</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>✓ Up to 3 forms</li>
                <li>✓ Basic analytics (7-day submissions)</li>
                <li>✗ Drop-off rates & heatmaps</li>
                <li>✗ Unlimited webhooks</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
