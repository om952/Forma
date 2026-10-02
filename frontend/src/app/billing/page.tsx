"use client";

import { useEffect, useState } from "react";

import AppHeader from "../../components/AppHeader";
import LoadError from "../../components/LoadError";
import { apiFetch, apiJson, errorMessage } from "../../lib/api";
import { canManageBilling, useAuthToken, useAuthUser } from "../../lib/auth";
import { toast } from "../../lib/toast";

type SubscriptionStatus = {
  tier: "FREE" | "PREMIUM";
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingMode: "live" | "test" | "disabled";
};

const RAZORPAY_KEY_ID =
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "YOUR_RAZORPAY_KEY_HERE";

/** The subset of Razorpay's checkout.js used here. */
type RazorpayCheckoutConstructor = new (options: Record<string, unknown>) => {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: { error?: { description?: string } }) => void
  ) => void;
};

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
    script.onerror = () =>
      reject(
        new Error(
          "The payment window couldn't load. If an ad or script blocker is on, allow checkout.razorpay.com and try again."
        )
      );
    document.body.appendChild(script);
  });

export default function BillingPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set from "Subscribe" until the payment window opens, so a second click
  // can't start a second subscription.
  const [subscribing, setSubscribing] = useState(false);
  const token = useAuthToken();
  // The API refuses plan changes from members; don't offer them the buttons.
  const canManage = canManageBilling(useAuthUser());
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped to re-read the plan after a checkout or cancellation.
  const [refreshKey, setRefreshKey] = useState(0);

  // The plan only changes once Razorpay's webhook reaches the server, so the
  // page always re-reads it rather than assuming what a checkout did.
  useEffect(() => {
    const fetchStatus = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        setLoadError(null);
        setStatus(await apiJson<SubscriptionStatus>("/api/payments/status", { token }));
      } catch (error) {
        // Without the status the page can't tell Free from Premium, so it
        // shows nothing rather than offering a Premium org "Subscribe".
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [token, refreshKey]);

  const handleSubscribe = async () => {
    if (!token || subscribing) return;
    setSubscribing(true);
    try {
      setError(null);
      setNotice(null);
      await loadRazorpay();

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

      const RazorpayCtor = (window as Window & { Razorpay?: RazorpayCheckoutConstructor })
        .Razorpay;
      if (!RazorpayCtor) throw new Error("The payment window couldn't load. Try again.");

      const checkout = new RazorpayCtor({
        key: keyId ?? RAZORPAY_KEY_ID,
        subscription_id: subscriptionId,
        amount,
        currency,
        name: "Forma",
        description: `Forma Premium - ${selectedPlan}`,
        handler: () => {
          setNotice("Payment received. Your plan will update in a few seconds.");
          window.setTimeout(() => setRefreshKey((key) => key + 1), 4000);
        },
        theme: { color: "#4f46e5" },
      });
      // Razorpay shows the failure in its window too; this keeps the reason
      // on the page after that window is closed.
      checkout.on("payment.failed", (response) => {
        setError(
          `The payment didn't go through${
            response.error?.description ? `: ${response.error.description}` : "."
          } You can try again with another card or method.`
        );
      });

      checkout.open();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancel = async () => {
    if (
      !confirm(
        "Cancel your premium subscription? You keep Premium until the end of the period you have paid for."
      )
    )
      return;
    if (!token) return;

    try {
      setError(null);
      const response = await apiFetch("/api/payments/cancel-subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Failed to cancel");
      }
      setRefreshKey((key) => key + 1);
      toast.success("Subscription cancelled. Premium stays on until the end of the paid period.");
    } catch (error) {
      setError(errorMessage(error));
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
        {notice ? <div className="status-success mb-6">{notice}</div> : null}

        {loadError ? (
          <LoadError message={loadError} onRetry={() => setRefreshKey((key) => key + 1)} />
        ) : status?.tier === "PREMIUM" ? (
          <div className="card-elevated border-emerald-200 bg-emerald-50/80">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-emerald-900" data-testid="billing-plan">Premium Plan</h2>
                <p className="mt-1 text-sm text-emerald-700">
                  Status: {status.status ?? "active"}
                  {status.currentPeriodEnd
                    ? ` · ${status.cancelAtPeriodEnd ? "Ends" : "Renews"} on ${new Date(
                        status.currentPeriodEnd
                      ).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                {status.cancelAtPeriodEnd ? "Cancelling" : "Active"}
              </span>
            </div>

            <ul className="mt-6 space-y-2 text-sm text-emerald-800">
              <li>✓ Unlimited forms</li>
              <li>✓ Analytics: funnel, per-field drop-off, response heatmap</li>
              <li>✓ Webhooks to Slack, Zapier and custom endpoints</li>
            </ul>

            {!canManage ? (
              <p className="mt-6 text-sm text-emerald-800" data-testid="billing-managers-only">
                Only owners and admins can change the plan.
              </p>
            ) : status.cancelAtPeriodEnd ? (
              <p className="mt-6 text-sm text-emerald-800">
                Your subscription won&apos;t renew. You&apos;ll move to the Free plan when this
                period ends.
              </p>
            ) : (
              <button
                onClick={handleCancel}
                className="mt-6 rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Cancel Subscription
              </button>
            )}
          </div>
        ) : !status ? null : (
          // Only once the plan is known to be Free: never offer "Subscribe" on a guess.
          <div className="space-y-6">
            <div className="card-elevated">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="billing-plan">Upgrade to Premium</h2>
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

              {canManage ? (
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="btn-primary mt-6 w-full disabled:cursor-wait disabled:opacity-60"
                  data-testid="billing-subscribe"
                >
                  {subscribing ? "Opening checkout…" : "Subscribe to Premium"}
                </button>
              ) : (
                <p className="status-info mt-6" data-testid="billing-managers-only">
                  Only owners and admins can change the plan. Ask one of them to upgrade.
                </p>
              )}

              {status?.billingMode === "test" ? (
                <p className="mt-4 text-xs text-slate-500">
                  Test mode: no real charges. Use Razorpay test card 5267 3181 8797 5449.
                </p>
              ) : null}
            </div>

            <div className="card-elevated">
              <h3 className="text-lg font-semibold text-slate-900">Free plan limits</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>✓ Up to 3 forms</li>
                <li>✓ Unlimited responses, CSV export</li>
                <li>✓ Webhooks to Slack, Zapier and custom endpoints</li>
                <li>✗ Analytics (funnel, drop-off, heatmaps)</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
