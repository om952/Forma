/** One entry from GET /api/org/audit-log. */
export type AuditEntry = {
  id: string;
  actorEmail: string | null;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const ROLE_NAMES: Record<string, string> = { OWNER: "owner", ADMIN: "admin", MEMBER: "member" };

const text = (value: unknown) => (typeof value === "string" ? value : "");
const role = (value: unknown) => ROLE_NAMES[text(value)] ?? text(value).toLowerCase();

/**
 * An audit entry as a sentence, e.g. "ada@acme.test changed bob@acme.test from
 * member to admin". The actor is left out here and shown separately; an entry
 * with no actor was made by the system (a Razorpay event).
 */
export const describeAuditEntry = (entry: AuditEntry): string => {
  const m = entry.metadata ?? {};

  switch (entry.action) {
    case "member.role_changed":
      return `Changed ${text(m.targetEmail)} from ${role(m.from)} to ${role(m.to)}`;
    case "member.removed":
      return `Removed ${text(m.targetEmail)} (${role(m.role)})`;
    case "webhook.created":
      return `Added a webhook to ${text(m.url)}`;
    case "webhook.updated": {
      const changes: string[] = [];
      if (m.toUrl) changes.push(`pointed it at ${text(m.toUrl)}`);
      if (m.isActive === false) changes.push("paused it");
      if (m.isActive === true) changes.push("resumed it");
      return changes.length ? `Changed a webhook: ${changes.join(", ")}` : "Changed a webhook";
    }
    case "webhook.deleted":
      return `Deleted the webhook to ${text(m.url)}`;
    case "billing.subscription_started":
      return `Started a Premium ${text(m.plan)} subscription`;
    case "billing.subscription_cancel_requested":
      return "Cancelled Premium, effective at the end of the paid period";
    case "billing.subscription_cancelled_immediately":
      return "Cancelled Premium";
    case "billing.tier_changed":
      return `Plan changed to ${text(m.tier) === "PREMIUM" ? "Premium" : "Free"}`;
    default:
      return entry.action;
  }
};

/** Who did it: the person's email, or "Razorpay" for billing events. */
export const auditActor = (entry: AuditEntry): string =>
  entry.actorEmail ?? (entry.metadata?.source === "razorpay_webhook" ? "Razorpay" : "System");
