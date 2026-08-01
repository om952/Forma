import { prisma } from "./prisma";
import { shouldScope, withOrgScope } from "./orgScope";

export { shouldScope, withOrgScope } from "./orgScope";

/**
 * A Prisma client bound to a single organization. Every where-bearing operation
 * on a tenant-scoped model automatically gets `orgId` merged into its filter, so
 * a handler that forgets to scope its query still cannot cross tenants.
 *
 * Attached to each authenticated request as `req.db` by `authMiddleware`.
 */
export const createScopedPrismaClient = (orgId: string) =>
  prisma.$extends({
    name: "org-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!shouldScope(model, operation)) {
            return query(args);
          }

          return query(
            withOrgScope(args as { where?: Record<string, unknown> }, orgId) as typeof args
          );
        },
      },
    },
  });

export type ScopedPrismaClient = ReturnType<typeof createScopedPrismaClient>;
