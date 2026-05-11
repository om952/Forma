import { Worker } from "bullmq";

import { redisConnection, webhookQueue, type WebhookJobData } from "../queues/webhook.queue";

const REQUEST_TIMEOUT_MS = 8000;

export const webhookWorker = new Worker<WebhookJobData>(
  webhookQueue.name,
  async (job) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(job.data.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Forma-Webhooks/1.0",
        },
        body: JSON.stringify(job.data.payload),
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
  }
);

webhookWorker.on("failed", (job, error) => {
  console.error("Webhook job failed", {
    id: job?.id,
    url: job?.data?.url,
    error: error.message,
  });
});
