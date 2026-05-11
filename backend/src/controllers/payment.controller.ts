import type { Request, Response } from "express";
import Razorpay from "razorpay";

import { prisma } from "../db/prisma";

type CreateOrderBody = {
  amount?: number;
  currency?: string;
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
      };
    };

    const event = payload.event;
    const orgId =
      payload.payload?.payment?.entity?.notes?.orgId ??
      payload.payload?.order?.entity?.notes?.orgId;

    if (event !== "payment.captured" && event !== "order.paid") {
      return res.json({ received: true });
    }

    if (!orgId) {
      return res.json({ received: true, reason: "orgId not found" });
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: { tier: "PREMIUM" },
    });

    return res.json({ received: true });
  } catch (error) {
    console.error("handleWebhook failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
