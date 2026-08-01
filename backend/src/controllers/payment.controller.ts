import type { Request, Response } from "express";
import Razorpay from "razorpay";

import { prisma } from "../db/prisma";

type CreateOrderBody = {
  amount?: number;
  currency?: string;
};

const PREMIUM_PLANS = {
  monthly: { amount: 19900, currency: "INR" },
  yearly: { amount: 199900, currency: "INR" },
};

const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

export const createSubscription = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const plan = (req.body as { plan?: string }).plan;
    const selectedPlan = plan === "yearly" ? "yearly" : "monthly";
    const planConfig = PREMIUM_PLANS[selectedPlan];

    const org = await prisma.organization.findUnique({
      where: { id: req.user.orgId },
    });

    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    let razorpayCustomerId = org.razorpayCustomerId;
    const razorpay = getRazorpayClient();

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
    let planEntity;
    try {
      const plans = await razorpay.plans.all({ count: 100 });
      planEntity = plans.items.find((p: any) => p.item?.name === planName);
    } catch (error) {
      console.error("Failed to list plans", error);
    }

    if (!planEntity) {
      planEntity = await razorpay.plans.create({
        period: selectedPlan === "monthly" ? "monthly" : "yearly",
        interval: 1,
        item: {
          name: planName,
          amount: planConfig.amount,
          currency: planConfig.currency,
          description: `Forma Premium - ${selectedPlan}`,
        },
        notes: { orgId: org.id },
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
      },
    });

    return res.status(201).json({
      subscriptionId: subscription.id,
      amount: planConfig.amount,
      currency: planConfig.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
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

    console.error("createSubscription failed", detail);
    return res.status(502).json({
      message: "Razorpay subscription creation failed",
      detail,
    });
  }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { amount, currency } = req.body as CreateOrderBody;
    const orderAmount = Number.isFinite(amount) ? Number(amount) : 19900;
    const orderCurrency = currency ?? "INR";

    if (orderAmount <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    const razorpay = getRazorpayClient();

    const order = await razorpay.orders.create({
      amount: Math.round(orderAmount),
      currency: orderCurrency,
      receipt: `forma_${req.user.orgId}_${Date.now()}`,
      notes: {
        orgId: req.user.orgId,
        userId: req.user.id,
      },
    });

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
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

    console.error("createOrder failed", detail);
    return res.status(502).json({
      message: "Razorpay order creation failed",
      detail,
    });
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!webhookSecret) {
      return res.status(500).json({ message: "Webhook secret is not configured" });
    }

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

    const payload = JSON.parse(body) as {
      event?: string;
      payload?: {
        payment?: { entity?: { notes?: { orgId?: string } } };
        order?: { entity?: { notes?: { orgId?: string } } };
        subscription?: { entity?: { notes?: { orgId?: string }; status?: string; current_end?: number } };
      };
    };

    const event = payload.event;
    const orgId =
      payload.payload?.payment?.entity?.notes?.orgId ??
      payload.payload?.order?.entity?.notes?.orgId ??
      payload.payload?.subscription?.entity?.notes?.orgId;

    if (!orgId) {
      return res.json({ received: true, reason: "orgId not found" });
    }

    if (event === "subscription.activated" || event === "subscription.charged") {
      const subscriptionEntity = payload.payload?.subscription?.entity;
      if (subscriptionEntity) {
        const updateData: any = {
          tier: "PREMIUM",
          subscriptionStatus: subscriptionEntity.status ?? "active",
        };
        if (subscriptionEntity.current_end) {
          updateData.currentPeriodEnd = new Date(
            subscriptionEntity.current_end * 1000
          );
        }
        await prisma.organization.update({
          where: { id: orgId },
          data: updateData,
        });
      }
      return res.json({ received: true });
    }

    if (event === "subscription.cancelled" || event === "subscription.halted") {
      await prisma.organization.update({
        where: { id: orgId },
        data: {
          tier: "FREE",
          subscriptionStatus: "cancelled",
        },
      });
      return res.json({ received: true });
    }

    if (event === "payment.captured" || event === "order.paid") {
      await prisma.organization.update({
        where: { id: orgId },
        data: { tier: "PREMIUM" },
      });
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("handleWebhook failed", error);
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
      select: { tier: true, subscriptionStatus: true, currentPeriodEnd: true },
    });

    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    return res.json({
      tier: org.tier,
      status: org.subscriptionStatus,
      currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("getSubscriptionStatus failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: req.user.orgId },
    });

    if (!org || !org.razorpaySubscriptionId) {
      return res.status(404).json({ message: "No active subscription found" });
    }

    const razorpay = getRazorpayClient();
    await razorpay.subscriptions.cancel(org.razorpaySubscriptionId);

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        tier: "FREE",
        subscriptionStatus: "cancelled",
      },
    });

    return res.json({ message: "Subscription cancelled" });
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
    console.error("cancelSubscription failed", detail);
    return res.status(502).json({ message: "Failed to cancel subscription", detail });
  }
};
