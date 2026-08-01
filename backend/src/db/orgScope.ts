/**
 * Pure tenant-scoping rules used by the org-scoped Prisma client.
 *
 * Kept free of any Prisma/database import so it stays trivially testable — this
 * is the logic that enforces the tenant boundary, so it should be verifiable
 * without a running database.
 */

/**
 * Models carrying an `orgId` column. Operations on these get the caller's org
 * injected into `where` so a controller that forgets to filter still cannot
 * reach across tenants. `Organization` is deliberately absent — it has no
 * `orgId` of its own and is safe to pass through untouched.
 *
 * Names must match Prisma's Pascal-case model identifiers exactly.
 */
export const TENANT_MODELS = new Set([
  "Form",
  "Response",
  "Webhook",
  "User",
  "WebhookDeadLetter",
]);

/**
 * Operations that take a `where`. `create`/`createMany`/`upsert`/`aggregate`/
 * `groupBy` are intentionally excluded — they either have no `where` or aren't
 * used today, and blindly rewriting their args would do more harm than good.
 */
export const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
]);

/** Whether a given model/operation pair should have the tenant filter applied. */
export const shouldScope = (
  model: string | undefined,
  operation: string
): boolean => Boolean(model && TENANT_MODELS.has(model) && WHERE_OPS.has(operation));

/**
 * Returns a copy of `args` with `orgId` merged into `where`. `orgId` is applied
 * last so a caller can never widen the tenant boundary by passing their own.
 */
export const withOrgScope = <T extends { where?: Record<string, unknown> }>(
  args: T,
  orgId: string
): T => ({ ...args, where: { ...(args.where ?? {}), orgId } });
