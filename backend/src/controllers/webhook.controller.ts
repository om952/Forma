import type { Request, Response } from "express";

import { webhookQueue } from "../queues/webhook.queue";
import { BlockedUrlError, assertDeliverableUrl } from "../utils/ssrf";
import { detectPayloadType } from "../utils/webhook.utils";

/**
 * Validates a destination the tenant supplied, returning the message to show
 * them if it is not deliverable. Checking at write time gives immediate
 * feedback; the worker re-checks at delivery time because DNS can change
 * between the two.
 */
const rejectionReasonFor = async (url: string): Promise<string | null> => {
  try {
    await assertDeliverableUrl(url);
    return null;
  } catch (error) {
    if (error instanceof BlockedUrlError) return error.message;
    throw error;
  }
};

export const getWebhooks = async (req: Request, res: Response) => {
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

    const webhooks = await req.db.webhook.findMany({
      where: { formId, orgId: req.user.orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.json(
      webhooks.map((w) => ({
        ...w,
        type: detectPayloadType(w.url),
      }))
    );
  } catch (error) {
    req.log.error({ err: error }, "getWebhooks failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createWebhook = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { formId } = req.params as { formId?: string };
    const { url } = req.body as { url?: string };

    if (!formId || typeof formId !== "string") {
      return res.status(400).json({ message: "formId is required" });
    }

    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "Valid URL is required" });
    }

    const rejection = await rejectionReasonFor(url);

    if (rejection) {
      return res.status(400).json({ message: rejection });
    }

    const form = await req.db.form.findFirst({
      where: { id: formId, orgId: req.user.orgId },
      select: { id: true, orgId: true },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    const webhook = await req.db.webhook.create({
      data: {
        formId,
        orgId: form.orgId,
        url,
        isActive: true,
      },
    });

    return res.status(201).json({
      ...webhook,
      type: detectPayloadType(webhook.url),
    });
  } catch (error) {
    req.log.error({ err: error }, "createWebhook failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateWebhook = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { webhookId } = req.params as { webhookId?: string };
    const { url, isActive } = req.body as { url?: string; isActive?: boolean };

    if (!webhookId || typeof webhookId !== "string") {
      return res.status(400).json({ message: "webhookId is required" });
    }

    const existing = await req.db.webhook.findFirst({
      where: { id: webhookId, orgId: req.user.orgId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Webhook not found" });
    }

    const data: { url?: string; isActive?: boolean } = {};
    if (url !== undefined) {
      if (typeof url !== "string") {
        return res.status(400).json({ message: "Valid URL is required" });
      }

      const rejection = await rejectionReasonFor(url);

      if (rejection) {
        return res.status(400).json({ message: rejection });
      }

      data.url = url;
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const webhook = await req.db.webhook.update({
      where: { id: webhookId },
      data,
    });

    return res.json({
      ...webhook,
      type: detectPayloadType(webhook.url),
    });
  } catch (error) {
    req.log.error({ err: error }, "updateWebhook failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteWebhook = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { webhookId } = req.params as { webhookId?: string };

    if (!webhookId || typeof webhookId !== "string") {
      return res.status(400).json({ message: "webhookId is required" });
    }

    const existing = await req.db.webhook.findFirst({
      where: { id: webhookId, orgId: req.user.orgId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Webhook not found" });
    }

    await req.db.webhook.delete({
      where: { id: webhookId },
    });

    return res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "deleteWebhook failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Deliveries that exhausted every retry, newest first. */
export const listDeadLetters = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { formId } = req.params as { formId?: string };

    if (!formId || typeof formId !== "string") {
      return res.status(400).json({ message: "formId is required" });
    }

    const form = await req.db.form.findFirst({
      where: { id: formId },
      select: { id: true },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    const deadLetters = await req.db.webhookDeadLetter.findMany({
      where: { formId },
      orderBy: { failedAt: "desc" },
      take: 100,
      select: {
        id: true,
        url: true,
        lastError: true,
        attemptsMade: true,
        failedAt: true,
      },
    });

    return res.json(deadLetters);
  } catch (error) {
    req.log.error({ err: error }, "listDeadLetters failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Re-queue a dead-lettered delivery. A fresh failure simply creates a new row. */
export const replayDeadLetter = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { deadLetterId } = req.params as { deadLetterId?: string };

    if (!deadLetterId || typeof deadLetterId !== "string") {
      return res.status(400).json({ message: "deadLetterId is required" });
    }

    const deadLetter = await req.db.webhookDeadLetter.findFirst({
      where: { id: deadLetterId },
    });

    if (!deadLetter) {
      return res.status(404).json({ message: "Failed delivery not found" });
    }

    const type = detectPayloadType(deadLetter.url);

    await webhookQueue.add(
      "deliver",
      {
        orgId: deadLetter.orgId,
        formId: deadLetter.formId,
        webhookId: deadLetter.webhookId,
        url: deadLetter.url,
        payload: deadLetter.payload as Record<string, unknown>,
      },
      {
        attempts: type === "slack" ? 5 : 3,
        backoff: { type: "exponential", delay: 2000 },
      }
    );

    await req.db.webhookDeadLetter.delete({ where: { id: deadLetterId } });

    return res.json({ message: "Delivery re-queued", url: deadLetter.url });
  } catch (error) {
    req.log.error({ err: error }, "replayDeadLetter failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const testWebhook = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { webhookId } = req.params as { webhookId?: string };

    if (!webhookId || typeof webhookId !== "string") {
      return res.status(400).json({ message: "webhookId is required" });
    }

    const webhook = await req.db.webhook.findFirst({
      where: { id: webhookId, orgId: req.user.orgId },
    });

    if (!webhook) {
      return res.status(404).json({ message: "Webhook not found" });
    }

    const type = detectPayloadType(webhook.url);

    let samplePayload: Record<string, unknown> = {
      event: "test",
      formId: webhook.formId,
      webhookId: webhook.id,
      message: "This is a test webhook from Forma",
      timestamp: new Date().toISOString(),
    };

    if (type === "slack") {
      samplePayload = {
        text: "Test webhook from Forma",
        attachments: [
          {
            color: "#0f172a",
            text: "This is a test submission payload.",
            footer: "Forma",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };
    } else if (type === "zapier") {
      samplePayload = {
        event: "test",
        formId: webhook.formId,
        webhookId: webhook.id,
        submittedAt: new Date().toISOString(),
        data: { sample: "value", note: "This is a test from Forma" },
      };
    }

    await webhookQueue.add(
      "deliver",
      {
        orgId: req.user.orgId,
        formId: webhook.formId,
        webhookId: webhook.id,
        url: webhook.url,
        payload: samplePayload,
      },
      {
        attempts: type === "slack" ? 5 : 3,
        backoff: { type: "exponential", delay: 2000 },
      }
    );

    return res.json({
      message: "Test webhook queued",
      url: webhook.url,
      type,
    });
  } catch (error) {
    req.log.error({ err: error }, "testWebhook failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};
