import { Worker, Job } from "bullmq";

import { prisma } from "../db/prisma";
import { redisConnection, webhookQueue, type WebhookJobData } from "../queues/webhook.queue";
import { detectPayloadType, isRetriesExhausted } from "../utils/webhook.utils";

const REQUEST_TIMEOUT_MS = 8000;

export const webhookWorker = new Worker<WebhookJobData>(
  webhookQueue.name,
  async (job: Job<WebhookJobData>) => {
    const { url, payload } = job.data;
    const type = detectPayloadType(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Forma-Webhooks/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Webhook delivery failed (${response.status}): ${body || "empty"}`
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  },
  {
    connection: redisConnection,
    limiter: {
      max: 50,
      duration: 1000,
    },
  }
);

webhookWorker.on("completed", (job) => {
  console.log("Webhook delivered", {
    id: job?.id,
    url: job?.data?.url,
    type: detectPayloadType(job?.data?.url ?? ""),
  });
});

webhookWorker.on("failed", async (job, error) => {
  console.error("Webhook job failed", {
    id: job?.id,
    url: job?.data?.url,
    type: detectPayloadType(job?.data?.url ?? ""),
    error: error.message,
  });

  if (!job) return;

  // This event fires on every attempt; only record once retries are exhausted.
  if (!isRetriesExhausted(job.attemptsMade, job.opts.attempts)) return;

  try {
    await prisma.webhookDeadLetter.create({
      data: {
        orgId: job.data.orgId,
        formId: job.data.formId,
        webhookId: job.data.webhookId,
        url: job.data.url,
        payload: job.data.payload as any,
        lastError: error.message.slice(0, 2000),
        attemptsMade: job.attemptsMade,
      },
    });

    console.error("Webhook dead-lettered", { id: job.id, url: job.data.url });
  } catch (dbError) {
    // Never let a logging failure take down the worker.
    console.error("Failed to persist dead-letter row", dbError);
  }
});

webhookWorker.on("error", (error) => {
  console.error("Webhook worker error", error);
});
