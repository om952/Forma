import { z } from "zod";

import { HttpError } from "../utils/httpError";

export type ValidationIssue = { path: string; message: string };

// "is required" reads better than Zod's "expected string, received undefined"
// for the most common mistake: leaving a field out.
z.config({
  customError: (issue) =>
    issue.code === "invalid_type" && issue.input === undefined
      ? "is required"
      : undefined,
});

const formatPath = (path: PropertyKey[]) => path.map(String).join(".");

/**
 * Parses untrusted input, or throws a 400 whose message names the first
 * problem ("schema.2.label: must not be empty") and whose `issues` list every
 * one, so a client can mark each bad field.
 */
export const parse = <S extends z.ZodType>(
  schema: S,
  input: unknown,
  source: "body" | "query" | "params"
): z.output<S> => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
  const [first] = issues;
  const message = first?.path
    ? `${first.path}: ${first.message}`
    : `Invalid request ${source}: ${first?.message ?? "malformed"}`;

  throw new HttpError(400, message, { issues });
};
