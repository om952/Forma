import { z } from "zod";

import { isValidEmail, normalizeEmail, passwordProblem } from "../utils/accountInput";
import { ORG_ROLES } from "../utils/orgRoles";

/** Record ids (cuids) and builder field ids (UUIDs): URL- and SQL-safe. */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "is not a valid id");

/** An object of path parameters, each an id. */
export const idParams = <const K extends string>(...names: K[]) =>
  z.object(
    Object.fromEntries(names.map((name) => [name, idSchema])) as Record<
      K,
      typeof idSchema
    >
  );

export const PAGE_SIZE = { default: 20, max: 100 } as const;

/**
 * Cursor pagination: pass back `nextCursor` from one page to get the next.
 * Cursors are record ids, so pages stay stable while new rows arrive.
 */
export const paginationQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_SIZE.max)
    .default(PAGE_SIZE.default),
  cursor: idSchema.optional(),
});

export type Pagination = z.output<typeof paginationQuery>;

export const emailSchema = z
  .string()
  .max(254)
  .transform(normalizeEmail)
  .refine(isValidEmail, "is not a valid email address");

export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

/**
 * One-time tokens. Only the length is checked here: a malformed token gets the
 * same "invalid or expired" answer as a wrong one.
 */
export const tokenSchema = z.string().max(200);

export const orgRoleSchema = z.enum(ORG_ROLES);

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** An IANA time zone name such as "Asia/Kolkata". */
export const timeZoneSchema = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9_+\-/]+$/, "is not a time zone")
  .refine(isTimeZone, "is not a known time zone");
