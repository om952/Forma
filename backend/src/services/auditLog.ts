import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import { logger } from "../observability/logger";

const log = logger.child({ service: "auditLog" });

/**
 * The sensitive actions this records: role changes, member removal, webhook
 * create/edit/delete, and billing changes. Kept as a union rather than a
 * plain string so a new call site has to pick a name that already means
 * something, instead of coining its own.
 */
export type AuditAction =
  | "member.role_changed"
  | "member.removed"
  | "webhook.created"
  | "webhook.updated"
  | "webhook.deleted"
  | "billing.subscription_started"
  | "billing.subscription_cancel_requested"
  | "billing.subscription_cancelled_immediately"
  | "billing.tier_changed";

/** Null for something the system did on its own — a Razorpay event, not a click. */
export type AuditActor = { id: string; email: string } | null;

/**
 * Writes one audit log entry. Called after the action it describes has
 * already succeeded, and never throws: a dashboard nobody is looking at yet
 * must not be the reason a role change or a webhook edit fails. A failure to
 * write is itself logged, so it still shows up in the ordinary logs.
 */
export const recordAuditLog = async (input: {
  orgId: string;
  actor: AuditActor;
  action: AuditAction;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        action: input.action,
        targetId: input.targetId ?? null,
        ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (error) {
    log.error({ err: error, action: input.action, orgId: input.orgId }, "Failed to record audit log entry");
  }
};
