import type { Request, Response } from "express";

import { prisma } from "../db/prisma";
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

type SubmitParams = {
  formId?: string;
};

export const getFormResponses = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { formId } = req.params as { formId?: string };

    if (!formId || typeof formId !== "string") {
      return res.status(400).json({ message: "formId is required" });
    }

    const form = await req.db.form.findFirst({
      where: { id: formId, orgId: req.user.orgId },
      select: { id: true },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    const responses = await req.db.response.findMany({
      where: { formId, orgId: req.user.orgId },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        payload: true,
        submittedAt: true,
      },
    });

    return res.json(responses);
  } catch (error) {
    console.error("getFormResponses failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
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

export const exportResponsesCsv = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { formId } = req.params as { formId?: string };

    if (!formId || typeof formId !== "string") {
      return res.status(400).json({ message: "formId is required" });
    }

    const form = await req.db.form.findFirst({
      where: { id: formId, orgId: req.user.orgId },
      select: { id: true, name: true, schema: true },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    const schema = (form.schema as FormField[] | null) ?? [];

    const responses = await req.db.response.findMany({
      where: { formId, orgId: req.user.orgId },
      orderBy: { submittedAt: "desc" },
      select: { payload: true, submittedAt: true },
    });

    const header = [...schema.map((field) => field.label), "Submitted At"];
    const rows = responses.map((response) => {
      const payload = (response.payload ?? {}) as Record<string, string>;
      return [
        ...schema.map((field) => payload[field.id] ?? ""),
        response.submittedAt.toISOString(),
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    const safeName =
      form.name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "form";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}-responses.csv"`
    );
    // Leading BOM so Excel reads the file as UTF-8.
    return res.send(`﻿${csv}`);
  } catch (error) {
    console.error("exportResponsesCsv failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const submitForm = async (req: Request, res: Response) => {
  try {
    const { formId } = req.params as SubmitParams;

    if (!formId) {
      return res.status(400).json({ message: "formId is required" });
    }

    const payload = req.body as SubmissionBody;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ message: "payload must be an object" });
    }

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
        payload: payload as any,
      },
    });

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
      console.error("Failed to queue submission notifications", error);
    }

    return res.status(201).json({
      id: responseRecord.id,
      formId: responseRecord.formId,
      submittedAt: responseRecord.submittedAt,
      queuedWebhooks: webhooks.length,
    });
  } catch (error) {
    console.error("submitForm failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
