import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBillingEvent, planChangeForEvent, type BillingEvent } from "./billing.utils";

const subscriptionBody = (
  event: string,
  entity: Record<string, unknown> = { id: "sub_123", status: "active", current_end: 1_800_000_000 }
) =>
  JSON.stringify({
    entity: "event",
    event,
    created_at: 1_790_000_000,
    payload: { subscription: { entity } },
  });

const eventOf = (type: string, status: string | null = "active"): BillingEvent => ({
  id: "evt_1",
  type,
  createdAt: new Date(1_790_000_000_000),
  subscription: { id: "sub_123", status, currentEnd: new Date(1_800_000_000_000) },
});

describe("parseBillingEvent", () => {
  it("reads the event id, type, time and subscription", () => {
    const event = parseBillingEvent(subscriptionBody("subscription.charged"), "evt_abc");

    assert.deepEqual(event, {
      id: "evt_abc",
      type: "subscription.charged",
      createdAt: new Date(1_790_000_000_000),
      subscription: {
        id: "sub_123",
        status: "active",
        currentEnd: new Date(1_800_000_000_000),
      },
    });
  });

  // Without the header, an exact redelivery must still map to the same key.
  it("falls back to a stable hash of the body for the id", () => {
    const body = subscriptionBody("subscription.charged");
    const first = parseBillingEvent(body, undefined);
    const second = parseBillingEvent(body, "  ");

    assert.match(first?.id ?? "", /^sha256:[0-9a-f]{64}$/);
    assert.equal(first?.id, second?.id);
    assert.notEqual(
      first?.id,
      parseBillingEvent(subscriptionBody("subscription.halted"), undefined)?.id
    );
  });

  it("leaves subscription null for non-subscription events", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      created_at: 1_790_000_000,
      payload: { payment: { entity: { id: "pay_1", notes: { orgId: "org_1" } } } },
    });

    assert.equal(parseBillingEvent(body, "evt_1")?.subscription, null);
  });

  it("tolerates a missing current_end", () => {
    const event = parseBillingEvent(
      subscriptionBody("subscription.authenticated", { id: "sub_1", status: "authenticated", current_end: null }),
      "evt_1"
    );

    assert.equal(event?.subscription?.currentEnd, null);
  });

  it("rejects bodies that are not Razorpay events", () => {
    assert.equal(parseBillingEvent("not json", "evt_1"), null);
    assert.equal(parseBillingEvent("{}", "evt_1"), null);
    assert.equal(parseBillingEvent(JSON.stringify({ event: 42 }), "evt_1"), null);
  });
});

describe("planChangeForEvent", () => {
  it("upgrades on activation, charge and resume", () => {
    for (const type of ["subscription.activated", "subscription.charged", "subscription.resumed"]) {
      assert.deepEqual(planChangeForEvent(eventOf(type)), {
        tier: "PREMIUM",
        subscriptionStatus: "active",
        currentPeriodEnd: new Date(1_800_000_000_000),
      });
    }
  });

  it("downgrades when the subscription ends and clears a scheduled cancel", () => {
    for (const [type, status] of [
      ["subscription.cancelled", "cancelled"],
      ["subscription.halted", "halted"],
      ["subscription.completed", "completed"],
      ["subscription.paused", "paused"],
    ] as const) {
      assert.deepEqual(planChangeForEvent(eventOf(type)), {
        tier: "FREE",
        subscriptionStatus: status,
        cancelAtPeriodEnd: false,
      });
    }
  });

  it("keeps the tier while a renewal is being retried", () => {
    assert.deepEqual(planChangeForEvent(eventOf("subscription.pending")), {
      subscriptionStatus: "pending",
    });
  });

  it("records authentication without upgrading", () => {
    const change = planChangeForEvent(eventOf("subscription.authenticated", "authenticated"));

    assert.equal(change?.tier, undefined);
    assert.equal(change?.subscriptionStatus, "authenticated");
  });

  // The ₹1 hole: a captured payment of any amount used to grant Premium.
  it("never changes the plan for one-off payments or orders", () => {
    for (const type of ["payment.captured", "order.paid", "payment.authorized"]) {
      assert.equal(planChangeForEvent({ ...eventOf(type), subscription: null }), null);
    }
  });

  it("ignores unknown subscription events", () => {
    assert.equal(planChangeForEvent(eventOf("subscription.something_new")), null);
  });
});
