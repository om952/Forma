import { Worker, Job } from "bullmq";

import { prisma } from "../db/prisma";
import { logger } from "../observability/logger";
import {
  redisConnection,
  webhookQueue,
  type WebhookJobData,
} from "../queues/webhook.queue";
import { MAX_WEBHOOK_REDIRECTS, assertDeliverableUrl } from "../utils/ssrf";
import { detectPayloadType, isRetriesExhausted } from "../utils/webhook.utils";

const REQUEST_TIMEOUT_MS = 8000;

const log = logger.child({ worker: "webhook" });

export const createWebhookWorker = () => {
  const worker = new Worker<WebhookJobData>(
    webhookQueue.name,
    async (job: Job<WebhookJobData>) => {
      const { url, payload } = job.data;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const body = JSON.stringify(payload);

      try {
        // Re-checked here and not just at creation time: the row may predate the
        // guard, and DNS for an already-approved hostname can be repointed at an
        // internal address at any time.
        let target = await assertDeliverableUrl(url);
        let redirects = 0;
        let response: Response;

        // Redirects are followed by hand so every hop is validated. Left to
        // `fetch`, a public URL could 302 straight to the metadata endpoint and
        // walk past the check above.
        while (true) {
          response = await fetch(target, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Forma-Webhooks/1.0",
            },
            body,
            signal: controller.signal,
            redirect: "manual",
          });

          const location = response.headers.get("location");

          if (response.status < 300 || response.status > 399 || !location)
            break;

          if (redirects >= MAX_WEBHOOK_REDIRECTS) {
            throw new Error(
              `Webhook delivery failed: more than ${MAX_WEBHOOK_REDIRECTS} redirects`
            );
          }

          // The payload is re-POSTed rather than downgraded to GET on 301/302 —
          // a webhook that redirects still wants the submission body.
          target = await assertDeliverableUrl(
            new URL(location, target).toString()
          );
          redirects += 1;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Webhook delivery failed (${response.status}): ${text || "empty"}`
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

  worker.on("completed", (job) => {
    log.info(
      {
        jobId: job?.id,
        formId: job?.data?.formId,
        url: job?.data?.url,
        type: detectPayloadType(job?.data?.url ?? ""),
      },
      "Webhook delivered"
    );
  });

  worker.on("failed", async (job, error) => {
    // A failed attempt is routine — BullMQ retries it. Only the final failure,
    // logged below as a dead letter, is an error.
    log.warn(
      {
        jobId: job?.id,
        formId: job?.data?.formId,
        url: job?.data?.url,
        type: detectPayloadType(job?.data?.url ?? ""),
        attempt: job?.attemptsMade,
        reason: error.message,
      },
      "Webhook delivery attempt failed"
    );

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

      log.error(
        {
          jobId: job.id,
          formId: job.data.formId,
          url: job.data.url,
          reason: error.message,
        },
        "Webhook dead-lettered after exhausting retries"
      );
    } catch (dbError) {
      // Never let a logging failure take down the worker.
      log.error(
        { err: dbError, jobId: job.id },
        "Failed to persist dead-letter row"
      );
    }
  });

  worker.on("error", (error) => {
    log.error({ err: error }, "Webhook worker error");
  });

  return worker;
};
