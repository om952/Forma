import {
  cancelSubscription,
  createSubscription,
  getSubscriptionStatus,
  handleWebhook,
} from "../controllers/payment.controller";
import { createSubscriptionBody } from "../validation/misc";
import { route, type RouteSpec } from "./define";

export const paymentRoutes: RouteSpec[] = [
  route({
    method: "get",
    path: "/status",
    summary: "The organization's plan and subscription state",
    access: "user",
    responses: {
      200: "`{ tier, status, currentPeriodEnd, cancelAtPeriodEnd, hasSubscription, billingMode }`; `billingMode` is `live`, `test` (Razorpay test keys) or `disabled`.",
    },
    handler: getSubscriptionStatus,
  }),
  route({
    method: "post",
    path: "/create-subscription",
    summary: "Start a Premium subscription checkout",
    access: ["OWNER", "ADMIN"],
    request: { body: createSubscriptionBody },
    responses: {
      200: "The Razorpay subscription to open in checkout.",
      409: "Already subscribed.",
      503: "Billing is not configured on this server.",
    },
    handler: createSubscription,
  }),
  route({
    method: "post",
    path: "/cancel-subscription",
    summary: "Cancel at the end of the paid period",
    access: ["OWNER", "ADMIN"],
    responses: { 200: "Cancelled; Premium lasts until the period ends.", 404: "No active subscription." },
    handler: cancelSubscription,
  }),
  route({
    method: "post",
    path: "/webhook",
    summary: "Razorpay subscription events",
    description:
      "Called by Razorpay, verified by the `X-Razorpay-Signature` HMAC over the raw body. Each event is applied once, and one older than the state already applied is ignored.",
    access: "public",
    responses: { 200: "Accepted.", 400: "Missing or invalid signature, or malformed payload." },
    handler: handleWebhook,
  }),
];
