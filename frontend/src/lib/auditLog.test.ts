import { describe, expect, it } from "vitest";

import { auditActor, describeAuditEntry, type AuditEntry } from "./auditLog";

const entry = (action: string, metadata: Record<string, unknown>, actorEmail: string | null = "ada@acme.test"): AuditEntry => ({
  id: "a1",
  actorEmail,
  action,
  targetId: null,
  metadata,
  createdAt: "2026-09-30T10:00:00.000Z",
});

describe("describeAuditEntry", () => {
  it("describes team changes", () => {
    expect(describeAuditEntry(entry("member.role_changed", { targetEmail: "bob@acme.test", from: "MEMBER", to: "ADMIN" }))).toBe(
      "Changed bob@acme.test from member to admin"
    );
    expect(describeAuditEntry(entry("member.removed", { targetEmail: "bob@acme.test", role: "MEMBER" }))).toBe(
      "Removed bob@acme.test (member)"
    );
  });

  it("describes webhook changes, including what an edit changed", () => {
    expect(describeAuditEntry(entry("webhook.created", { url: "https://hooks.test/a" }))).toBe("Added a webhook to https://hooks.test/a");
    expect(describeAuditEntry(entry("webhook.updated", { isActive: false }))).toBe("Changed a webhook: paused it");
    expect(describeAuditEntry(entry("webhook.updated", { fromUrl: "https://a.test", toUrl: "https://b.test", isActive: true }))).toBe(
      "Changed a webhook: pointed it at https://b.test, resumed it"
    );
    expect(describeAuditEntry(entry("webhook.deleted", { url: "https://hooks.test/a" }))).toBe("Deleted the webhook to https://hooks.test/a");
  });

  it("describes billing changes and credits Razorpay for its own", () => {
    const tier = entry("billing.tier_changed", { source: "razorpay_webhook", tier: "PREMIUM" }, null);
    expect(describeAuditEntry(tier)).toBe("Plan changed to Premium");
    expect(auditActor(tier)).toBe("Razorpay");
    expect(describeAuditEntry(entry("billing.subscription_started", { plan: "yearly" }))).toBe("Started a Premium yearly subscription");
  });

  it("falls back to the raw action name for anything new", () => {
    expect(describeAuditEntry(entry("forms.exported", {}))).toBe("forms.exported");
  });
});
