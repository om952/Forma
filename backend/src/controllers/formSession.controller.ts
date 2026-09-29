import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import type { z } from "zod";

import { prisma } from "../db/prisma";
import type { FormField } from "../types/formSchema";
import { HttpError } from "../utils/httpError";
import type { fieldReachedBody } from "../validation/misc";

/*
 * Visit tracking for the public form page, feeding the analytics funnel and
 * per-field drop-off. Anonymous by design: a session is a random id the page
 * keeps for one fill of the form, and nothing identifying is stored.
 */

/**
 * The current time as Prisma stores it: UTC, in a column without a time zone.
 * A bare now() would be converted to the connection's session time zone,
 * which is only UTC if the database happens to be configured that way.
 */
const UTC_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

/** Records that someone opened the form. Returns the id the page reports progress against. */
export const startFormSession = async (req: Request, res: Response) => {
  const form = await prisma.form.findUnique({
    where: { id: (req.params as { id: string }).id },
    select: { id: true, orgId: true, isActive: true },
  });

  if (!form || !form.isActive) throw new HttpError(404, "Form not found");

  const session = await prisma.formSession.create({
    data: { formId: form.id, orgId: form.orgId },
    select: { id: true },
  });

  return res.status(201).json({ sessionId: session.id });
};

/**
 * Records that the respondent reached a field: the first one marks the visit
 * as started, and the latest is where they are (or where they stopped).
 * Ignored once the visit ended in a submission.
 */
export const recordFieldReached = async (req: Request, res: Response) => {
  const { id: formId, sessionId } = req.params as { id: string; sessionId: string };
  const { fieldId } = req.body as z.output<typeof fieldReachedBody>;

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { schema: true },
  });

  const fields = (form?.schema ?? []) as FormField[];
  if (!fields.some((field) => field.id === fieldId)) {
    throw new HttpError(404, "Field not found on this form");
  }

  // One statement, so concurrent reports for the same visit cannot lose a
  // field: the array is appended to in place, once per field.
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "FormSession"
    SET "fieldsTouched" = CASE
          WHEN ${fieldId}::text = ANY("fieldsTouched") THEN "fieldsTouched"
          ELSE array_append("fieldsTouched", ${fieldId}::text)
        END,
        "lastFieldId" = ${fieldId}::text,
        "startedAt" = COALESCE("startedAt", ${UTC_NOW}),
        "lastActiveAt" = ${UTC_NOW}
    WHERE id = ${sessionId} AND "formId" = ${formId} AND "submittedAt" IS NULL
  `);

  if (updated === 0) throw new HttpError(404, "Session not found");

  return res.status(204).end();
};

/**
 * Marks the visit that produced a submission as completed. A missing,
 * malformed or already-used session id is ignored: tracking must never get in
 * the way of accepting a response.
 */
export const completeFormSession = async (
  sessionId: string | undefined,
  formId: string,
  responseId: string
) => {
  if (!sessionId || !/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) return;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "FormSession"
    SET "submittedAt" = ${UTC_NOW},
        "responseId" = ${responseId},
        "startedAt" = COALESCE("startedAt", ${UTC_NOW}),
        "lastActiveAt" = ${UTC_NOW}
    WHERE id = ${sessionId} AND "formId" = ${formId} AND "submittedAt" IS NULL
  `);
};
