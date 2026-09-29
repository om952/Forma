/**
 * Pure rules for turning Razorpay subscription webhooks into plan state.
 *
 * Razorpay delivers webhooks at least once and in no guaranteed order, so the
 * controller never trusts a single event on its own: it dedupes on the event
 * id and refuses to apply an event older than the last one it applied. What
 * lives here is the part that needs no database — reading the event and
 * deciding what it means for the organisation.
 */

import { createHash } from "node:crypto";

import { z } from "zod";

const webhookBodySchema = z.object({
  event: z.string().min(1),
  // Unix seconds. Razorpay always sends it; it is what orders events.
  created_at: z.number().int().positive().optional(),
  payload: z
    .object({
      subscription: z
        .object({
          entity: z.object({
            id: z.string().min(1),
            status: z.string().optional(),
            current_end: z.number().int().positive().nullable().optional(),
          }),
        })
        .optional(),
    })
    .optional(),
});

export type BillingEvent = {
  /** Razorpay's event id, used as the dedupe key. */
  id: string;
  type: string;
  /** When Razorpay created the event — not when we received it. */
  createdAt: Date;
  subscription: {
    id: string;
    status: string | null;
    currentEnd: Date | null;
  } | null;
};

/**
 * Parses a verified webhook body. Returns null when the body is not a
 * Razorpay event at all.
 *
 * `eventIdHeader` is `x-razorpay-event-id`. Should it ever be missing, a hash
 * of the signed body stands in: an exact redelivery is then still a no-op.
 */
export const parseBillingEvent = (
  rawBody: string,
  eventIdHeader: string | undefined
): BillingEvent | null => {
  let json: unknown;

  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const parsed = webhookBodySchema.safeParse(json);
  if (!parsed.success) return null;

  const { event, created_at, payload } = parsed.data;
  const entity = payload?.subscription?.entity;

  return {
    id:
      eventIdHeader?.trim() ||
      `sha256:${createHash("sha256").update(rawBody).digest("hex")}`,
    type: event,
    createdAt: created_at ? new Date(created_at * 1000) : new Date(),
    subscription: entity
      ? {
          id: entity.id,
          status: entity.status ?? null,
          currentEnd: entity.current_end ? new Date(entity.current_end * 1000) : null,
        }
      : null,
  };
};

export type PlanChange = {
  tier?: "FREE" | "PREMIUM";
  subscriptionStatus: string;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
};

/**
 * What a subscription event means for the organisation's plan, or null when
 * it has no bearing on it.
 *
 * Only subscription events move the tier. One-off `payment.*` and `order.*`
 * events are deliberately ignored: a payment on its own proves nothing about
 * which plan, or how much, was paid for.
 */
export const planChangeForEvent = (event: BillingEvent): PlanChange | null => {
  const subscription = event.subscription;
  if (!subscription) return null;

  const periodEnd = subscription.currentEnd
    ? { currentPeriodEnd: subscription.currentEnd }
    : {};

  switch (event.type) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      return {
        tier: "PREMIUM",
        subscriptionStatus: subscription.status ?? "active",
        ...periodEnd,
      };

    // Mandate approved but nothing charged yet, or a plan/quantity change:
    // record the status, leave the tier alone.
    case "subscription.authenticated":
    case "subscription.updated":
      return {
        subscriptionStatus: subscription.status ?? "authenticated",
        ...periodEnd,
      };

    // A renewal charge failed and Razorpay is retrying. Keep Premium while it
    // does — `halted` follows if the retries run out.
    case "subscription.pending":
      return { subscriptionStatus: "pending" };

    case "subscription.halted":
    case "subscription.cancelled":
    case "subscription.completed":
    case "subscription.paused":
      return {
        tier: "FREE",
        subscriptionStatus: event.type.slice("subscription.".length),
        cancelAtPeriodEnd: false,
      };

    default:
      return null;
  }
};

/**
 * Statuses in which the organisation already holds a subscription that is
 * running or about to. Starting a second one would leave two mandates charging
 * the customer, and only the newer one tracked here.
 */
export const LIVE_SUBSCRIPTION_STATUSES = new Set(["authenticated", "active", "pending"]);
