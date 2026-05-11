import type { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { webhookQueue } from "../queues/webhook.queue";

type SubmissionBody = Record<string, unknown>;

type SubmitParams = {
  formId?: string;
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
        isActive: true,
      },
    });

    if (!form || !form.isActive) {
      return res.status(404).json({ message: "Form not found" });
    }

    const responseRecord = await prisma.response.create({
      data: {
        formId: form.id,
        orgId: form.orgId,
        payload,
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

    const jobPayload = {
      formId: form.id,
      responseId: responseRecord.id,
      submittedAt: responseRecord.submittedAt.toISOString(),
      data: payload,
    };

    await Promise.all(
      webhooks.map((hook) =>
        webhookQueue.add("deliver", {
          url: hook.url,
          payload: jobPayload,
        })
      )
    );

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
