import type { Worker } from "bullmq";

import { createNotificationWorker } from "./notification.worker";
import { createWebhookWorker } from "./webhook.worker";

/**
 * Starts every queue consumer. Called by the worker process, and by the API
 * process too when RUN_WORKERS_IN_API is set.
 *
 * Workers are created here rather than at import so that importing a queue or
 * a worker module never silently starts consuming jobs in the wrong process.
 */
export const startWorkers = (): Worker[] => [
  createWebhookWorker(),
  createNotificationWorker(),
];
