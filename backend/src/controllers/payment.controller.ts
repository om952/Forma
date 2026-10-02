import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import Razorpay from "razorpay";

import { billingConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { recordAuditLog } from "../services/auditLog";
import {
  LIVE_SUBSCRIPTION_STATUSES,
  parseBillingEvent,
  planChangeForEvent,
  type BillingEvent,
} from "../utils/billing.utils";

const PREMIUM_PLANS = {
  monthly: { amount: 19900, currency: "INR" },
  yearly: { amount: 199900, currency: "INR" },
};

/**
 * Billing is optional configuration — the app runs fine without it, with the
 * upgrade flow switched off. 503 rather than 500: nothing is broken, the
 * feature is simply not enabled on this deployment.
 */
const billingUnavailable = (res: Response) =>
  res.status(503).json({
    message: "Billing is not configured on this deployment.",
    code: "BILLING_DISABLED",
  });

const getRazorpayClient = (config: NonNullable<typeof billingConfig>) =>
  new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret,
  });

export const createSubscription = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!billingConfig) return billingUnavailable(res);

    const plan = (req.body as { plan?: string }).plan;
    const selectedPlan = plan === "yearly" ? "yearly" : "monthly";
    const planConfig = PREMIUM_PLANS[selectedPlan];

    const org = await prisma.organization.findUnique({
      where: { id: req.user.orgId },
    });

    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (
      org.razorpaySubscriptionId &&
      org.subscriptionStatus &&
      LIVE_SUBSCRIPTION_STATUSES.has(org.subscriptionStatus)
    ) {
      return res.status(409).json({
        message: org.cancelAtPeriodEnd
          ? "Your current subscription is still running until the end of its period. You can subscribe again after it ends."
          : "Your organisation already has an active subscription.",
        code: "SUBSCRIPTION_EXISTS",
      });
    }

    let razorpayCustomerId = org.razorpayCustomerId;
    const razorpay = getRazorpayClient(billingConfig);

    if (!razorpayCustomerId) {
      const customer = await razorpay.customers.create({
        email: req.user.email,
        name: org.name,
        notes: { orgId: org.id },
      });
      razorpayCustomerId = customer.id;

      await prisma.organization.update({
        where: { id: org.id },
        data: { razorpayCustomerId },
      });
    }

    const planName = `forma_premium_${selectedPlan}`;
    const period = selectedPlan === "monthly" ? "monthly" : "yearly";
    let planEntity;
    try {
      const plans = await razorpay.plans.all({ count: 100 });
      // Match on the price too, not just the name. The price is what the
      // customer pays, so a plan left over at an old or edited price must
      // never be reused.
      planEntity = plans.items.find(
        (p: any) =>
          p.item?.name === planName &&
          p.item?.amount === planConfig.amount &&
          p.item?.currency === planConfig.currency &&
          p.period === period &&
          p.interval === 1
      );
    } catch (error) {
      req.log.error({ err: error }, "Failed to list plans");
    }

    if (!planEntity) {
      planEntity = await razorpay.plans.create({
        period,
        interval: 1,
        item: {
          name: planName,
          amount: planConfig.amount,
          currency: planConfig.currency,
          description: `Forma Premium - ${selectedPlan}`,
        },
      } as any);
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planEntity.id,
      customer_id: razorpayCustomerId,
      total_count: selectedPlan === "monthly" ? 12 : 1,
      quantity: 1,
      notes: { orgId: org.id },
    } as any);

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        razorpaySubscriptionId: subscription.id,
        subscriptionStatus: "created",
        cancelAtPeriodEnd: false,
      },
    });

    await recordAuditLog({
      orgId: org.id,
      actor: { id: req.user.id, email: req.user.email },
      action: "billing.subscription_started",
      targetId: subscription.id,
      metadata: { plan: selectedPlan, amount: planConfig.amount, currency: planConfig.currency },
    });

    return res.status(201).json({
      subscriptionId: subscription.id,
      amount: planConfig.amount,
      currency: planConfig.currency,
      keyId: billingConfig.keyId,
    });
  } catch (error) {
    const typedError = error as {
      error?: { description?: string; reason?: string };
      message?: string;
    };
    const detail =
      typedError?.error?.description ??
      typedError?.error?.reason ??
      typedError?.message ??
      "Unknown error";

    req.log.error({ err: error, detail }, "createSubscription failed");
    return res.status(502).json({
      message: "Razorpay subscription creation failed",
      detail,
    });
  }
};

/**
 * Applies one verified billing event, exactly once and never out of order.
 *
 * - The organisation is found by the event's subscription id, not by the
 *   `notes.orgId` the subscription was created with. An event for a
 *   subscription the org has since replaced then changes nothing.
 * - The conditional `updateMany` only writes when this event is at least as
 *   new as the last one applied, so a delayed `subscription.halted` cannot
 *   downgrade an org that has renewed since. It is a single statement, so two
 *   events racing for the same org cannot both pass the check. Events created
 *   in the same second apply in arrival order.
 * - The event row is written in the same transaction. A redelivery conflicts
 *   on its primary key and rolls back everything it did.
 */
const recordBillingEvent = async (
  event: BillingEvent
): Promise<"applied" | "stale" | "ignored" | "duplicate"> => {
  const seen = await prisma.billingEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (seen) return "duplicate";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const org = event.subscription
        ? await tx.organization.findUnique({
            where: { razorpaySubscriptionId: event.subscription.id },
            select: { id: true },
          })
        : null;

      const change = planChangeForEvent(event);
      let outcome: "applied" | "stale" | "ignored" = "ignored";

      if (org && change) {
        const { count } = await tx.organization.updateMany({
          where: {
            id: org.id,
            OR: [
              { billingEventAt: null },
              { billingEventAt: { lte: event.createdAt } },
            ],
          },
          data: { ...change, billingEventAt: event.createdAt },
        });

        outcome = count === 1 ? "applied" : "stale";
      }

      await tx.billingEvent.create({
        data: {
          id: event.id,
          orgId: org?.id ?? null,
          type: event.type,
          outcome,
          eventAt: event.createdAt,
        },
      });

      return { outcome, orgId: org?.id, change };
    });

    // A tier flip is the one billing change worth its own audit entry — every
    // event, tier-moving or not, is already durably recorded in BillingEvent.
    // No actor: Razorpay's webhook made this happen, not a click in the app.
    if (result.outcome === "applied" && result.orgId && result.change?.tier) {
      await recordAuditLog({
        orgId: result.orgId,
        actor: null,
        action: "billing.tier_changed",
        metadata: {
          source: "razorpay_webhook",
          eventType: event.type,
          tier: result.change.tier,
          subscriptionStatus: result.change.subscriptionStatus,
        },
      });
    }

    return result.outcome;
  } catch (error) {
    // A concurrent delivery of the same event committed first.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }

    throw error;
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    if (!billingConfig) return billingUnavailable(res);

    const webhookSecret = billingConfig.webhookSecret;
    const signature = req.headers["x-razorpay-signature"];

    if (typeof signature !== "string") {
      return res.status(400).json({ message: "Missing Razorpay signature" });
    }

    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from("{}");
    const body = rawBody.toString("utf8");

    const isValid = Razorpay.validateWebhookSignature(
      body,
      signature,
      webhookSecret
    );

    if (!isValid) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const eventIdHeader = req.headers["x-razorpay-event-id"];
    const event = parseBillingEvent(
      body,
      typeof eventIdHeader === "string" ? eventIdHeader : undefined
    );

    if (!event) {
      return res.status(400).json({ message: "Malformed webhook payload" });
    }

    const outcome = await recordBillingEvent(event);

    return res.json({ received: true, outcome });
  } catch (error) {
    // A 500 makes Razorpay retry, which is what we want: nothing was recorded.
    req.log.error({ err: error }, "handleWebhook failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: req.user.orgId },
      select: {
        tier: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        razorpaySubscriptionId: true,
      },
    });

    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    return res.json({
      tier: org.tier,
      status: org.subscriptionStatus,
      currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
      // False for Premium granted without a checkout (a seeded demo, a manual
      // upgrade): there is no Razorpay subscription for "Cancel" to act on.
      hasSubscription: Boolean(org.razorpaySubscriptionId),
      // Lets the billing page say when checkout takes test cards only.
      billingMode: !billingConfig
        ? "disabled"
        : billingConfig.keyId.startsWith("rzp_test_")
          ? "test"
          : "live",
    });
  } catch (error) {
    req.log.error({ err: error }, "getSubscriptionStatus failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!billingConfig) return billingUnavailable(res);

    const org = await prisma.organization.findUnique({
      where: { id: req.user.orgId },
    });

    const status = org?.subscriptionStatus ?? null;

    // A halted subscription is still a mandate Razorpay can resume, and one
    // left at `created` is an abandoned checkout — both are worth cancelling.
    const cancellable =
      status !== null &&
      (LIVE_SUBSCRIPTION_STATUSES.has(status) || status === "created" || status === "halted");

    if (!org?.razorpaySubscriptionId || !cancellable) {
      return res.status(404).json({ message: "No active subscription found" });
    }

    const razorpay = getRazorpayClient(billingConfig);

    // The customer has paid for the current period, so an active subscription
    // runs to the end of it. Razorpay stops renewing it and sends
    // `subscription.cancelled` when the period ends, which is what downgrades.
    if (status === "active") {
      if (org.cancelAtPeriodEnd) {
        return res.json({
          message: "Subscription is already set to cancel at the end of the period",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
        });
      }

      await razorpay.subscriptions.cancel(org.razorpaySubscriptionId, true);

      await prisma.organization.update({
        where: { id: org.id },
        data: { cancelAtPeriodEnd: true },
      });

      await recordAuditLog({
        orgId: org.id,
        actor: { id: req.user.id, email: req.user.email },
        action: "billing.subscription_cancel_requested",
        targetId: org.razorpaySubscriptionId,
        metadata: { currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null },
      });

      return res.json({
        message: "Subscription will cancel at the end of the current period",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
      });
    }

    // Not paid up (never charged, or renewal failing): nothing is left to run
    // out, so cancel now. Stamping billingEventAt makes any older Razorpay
    // event still in flight for this subscription arrive as stale.
    await razorpay.subscriptions.cancel(org.razorpaySubscriptionId, false);

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        tier: "FREE",
        subscriptionStatus: "cancelled",
        cancelAtPeriodEnd: false,
        billingEventAt: new Date(),
      },
    });

    await recordAuditLog({
      orgId: org.id,
      actor: { id: req.user.id, email: req.user.email },
      action: "billing.subscription_cancelled_immediately",
      targetId: org.razorpaySubscriptionId,
      metadata: { previousStatus: status },
    });

    return res.json({ message: "Subscription cancelled", cancelAtPeriodEnd: false });
  } catch (error) {
    const typedError = error as {
      error?: { description?: string; reason?: string };
      message?: string;
    };
    const detail =
      typedError?.error?.description ??
      typedError?.error?.reason ??
      typedError?.message ??
      "Unknown error";
    req.log.error({ err: error, detail }, "cancelSubscription failed");
    return res.status(502).json({ message: "Failed to cancel subscription", detail });
  }
};
