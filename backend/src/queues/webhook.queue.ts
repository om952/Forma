import { Queue } from "bullmq";

import { redisConnection } from "./redis";

// Re-exported for existing importers (e.g. the webhook worker).
export { redisConnection };

export const webhookQueue = new Queue("webhook-deliveries", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export type WebhookJobData = {
  orgId: string;
  formId: string;
  /** Null once the originating webhook has been deleted. */
  webhookId: string | null;
  url: string;
  payload: Record<string, unknown>;
};
