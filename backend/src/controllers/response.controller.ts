import type { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { HttpError } from "../utils/httpError";
import { pageArgs, pageOf } from "../utils/pagination";
import type { Pagination } from "../validation/common";
import { completeFormSession } from "./formSession.controller";
import { notificationQueue } from "../queues/notification.queue";
import { webhookQueue } from "../queues/webhook.queue";
import {
  describeInvalidAnswer,
  isFieldAnswerValid,
  isFieldVisible,
  type FormField,
} from "../types/formSchema";
import {
  buildSlackPayload,
  buildZapierPayload,
  detectPayloadType,
} from "../utils/webhook.utils";

type SubmissionBody = Record<string, string>;

/** A form of the caller's organization, or a 404. */
const findOwnForm = async (req: Request) => {
  const form = await req.db!.form.findFirst({
    where: { id: (req.params as { formId: string }).formId },
    select: { id: true, name: true, schema: true },
  });

  if (!form) throw new HttpError(404, "Form not found");
  return form;
};

/** A form's responses, newest first, a page at a time, with the overall total. */
export const getFormResponses = async (req: Request, res: Response) => {
  const form = await findOwnForm(req);
  const page = req.query as unknown as Pagination;

  const [rows, total] = await Promise.all([
    req.db!.response.findMany({
      where: { formId: form.id },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      ...pageArgs(page),
      select: { id: true, payload: true, submittedAt: true },
    }),
    req.db!.response.count({ where: { formId: form.id } }),
  ]);

  return res.json({ ...pageOf(rows, page.limit), total });
};

/** Spreadsheet apps treat these leading characters as the start of a formula. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

const csvEscape = (value: unknown): string => {
  let str = value === null || value === undefined ? "" : String(value);

  // Responses come from anonymous submitters, so neutralise formula injection
  // before the file is opened in Excel/Sheets.
  if (FORMULA_TRIGGER.test(str)) {
    str = `'${str}`;
  }

  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const EXPORT_BATCH = 1000;

/**
 * Every response as CSV, streamed in batches so memory use stays flat however
 * many responses the form has. If the database fails partway, the connection
 * is cut rather than ending cleanly, so the download shows as failed instead
 * of silently truncated.
 */
export const exportResponsesCsv = async (req: Request, res: Response) => {
  const form = await findOwnForm(req);
  const schema = (form.schema as FormField[] | null) ?? [];
  const safeName = form.name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "form";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-responses.csv"`);

  const line = (cells: unknown[]) => `${cells.map(csvEscape).join(",")}\r\n`;

  // Leading BOM so Excel reads the file as UTF-8.
  res.write(`\uFEFF${line([...schema.map((field) => field.label), "Submitted At"])}`);

  try {
    let cursor: string | undefined;

    for (;;) {
      const batch = await req.db!.response.findMany({
        where: { formId: form.id },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        ...pageArgs({ limit: EXPORT_BATCH, ...(cursor ? { cursor } : {}) }),
        select: { id: true, payload: true, submittedAt: true },
      });
      const { items, nextCursor } = pageOf(batch, EXPORT_BATCH);

      const chunk = items
        .map((response) => {
          const payload = (response.payload ?? {}) as Record<string, string>;
          return line([
            ...schema.map((field) => payload[field.id] ?? ""),
            response.submittedAt.toISOString(),
          ]);
        })
        .join("");

      // Respect backpressure from a slow client.
      if (chunk && !res.write(chunk)) {
        await new Promise((resolve) => res.once("drain", resolve));
      }

      if (!nextCursor) break;
      cursor = nextCursor;
    }

    res.end();
  } catch (error) {
    req.log.error({ err: error }, "CSV export failed partway");
    res.destroy(error instanceof Error ? error : undefined);
  }
};

export const submitForm = async (req: Request, res: Response) => {
  try {
    const { formId } = req.params as { formId: string };
    const answers = req.body as SubmissionBody;

    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: {
        id: true,
        orgId: true,
        name: true,
        isActive: true,
        schema: true,
        createdBy: { select: { email: true } },
      },
    });

    if (!form || !form.isActive) {
      return res.status(404).json({ message: "Form not found" });
    }

    const schema = form.schema as FormField[];

    // Only the form's own fields are stored; anything else sent is dropped.
    const payload: SubmissionBody = {};
    for (const field of schema) {
      const value = answers[field.id];
      if (value !== undefined) payload[field.id] = value;
    }

    for (const field of schema) {
      if (!isFieldVisible(field, payload)) {
        if (payload[field.id] !== undefined) {
          delete payload[field.id];
        }
        continue;
      }

      const fieldValue = payload[field.id] ?? "";
      if (!isFieldAnswerValid(field, fieldValue)) {
        return res.status(400).json({
          message: describeInvalidAnswer(field, fieldValue),
          fieldId: field.id,
        });
      }
    }

    const responseRecord = await prisma.response.create({
      data: {
        formId: form.id,
        orgId: form.orgId,
        payload,
      },
    });

    try {
      await completeFormSession(req.get("x-form-session"), form.id, responseRecord.id);
    } catch (error) {
      req.log.warn({ err: error }, "Failed to link the submission to its visit");
    }

    const webhooks = await prisma.webhook.findMany({
      where: {
        formId: form.id,
        isActive: true,
      },
      select: {
        id: true,
        url: true,
      },
    });

    await Promise.all(
      webhooks.map((hook) => {
        const type = detectPayloadType(hook.url);
        let finalPayload: Record<string, unknown> = {
          formId: form.id,
          responseId: responseRecord.id,
          submittedAt: responseRecord.submittedAt.toISOString(),
          data: payload,
        };

        if (type === "slack") {
          finalPayload = buildSlackPayload(payload, form.name);
        } else if (type === "zapier") {
          finalPayload = buildZapierPayload(payload, form.id, responseRecord.id);
        }

        return webhookQueue.add(
          "deliver",
          {
            orgId: form.orgId,
            formId: form.id,
            webhookId: hook.id,
            url: hook.url,
            payload: finalPayload,
          },
          {
            attempts: type === "slack" ? 5 : 3,
            backoff: { type: "exponential", delay: 2000 },
          }
        );
      })
    );

    // Email notifications are best-effort: a queue hiccup must not fail a
    // submission that has already been stored.
    try {
      await notificationQueue.add("owner-notify", {
        kind: "owner",
        to: form.createdBy.email,
        formName: form.name,
        formId: form.id,
        responseId: responseRecord.id,
        fields: schema.map((field) => ({
          label: field.label,
          value: payload[field.id] ?? "",
        })),
      });

      // If the form collected an email address, confirm receipt to the sender.
      const respondentEmail = schema
        .filter((field) => field.type === "email")
        .map((field) => (payload[field.id] ?? "").trim())
        .find((value) => value !== "");

      if (respondentEmail) {
        await notificationQueue.add("respondent-confirm", {
          kind: "respondent",
          to: respondentEmail,
          formName: form.name,
        });
      }
    } catch (error) {
      req.log.error({ err: error }, "Failed to queue submission notifications");
    }

    return res.status(201).json({
      id: responseRecord.id,
      formId: responseRecord.formId,
      submittedAt: responseRecord.submittedAt,
      queuedWebhooks: webhooks.length,
    });
  } catch (error) {
    req.log.error({ err: error }, "submitForm failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};
