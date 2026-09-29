import { Queue } from "bullmq";

import { redisConnection } from "./redis";

export const notificationQueue = new Queue("email-notifications", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

export type NotificationJobData =
  | {
      kind: "owner";
      to: string;
      formName: string;
      formId: string;
      responseId: string;
      fields: Array<{ label: string; value: string }>;
    }
  | {
      kind: "respondent";
      to: string;
      formName: string;
    }
  | AccountEmailJobData;

/** Emails about the recipient's own account. Each carries a one-time link. */
export type AccountEmailJobData =
  | {
      kind: "invite";
      to: string;
      orgName: string;
      inviterEmail: string | null;
      role: string;
      url: string;
    }
  | {
      kind: "password-reset";
      to: string;
      orgName: string;
      url: string;
    }
  | {
      kind: "verify-email";
      to: string;
      url: string;
    };

/**
 * The job's data holds a working link, so it is deleted from Redis as soon as
 * it finishes instead of being kept for inspection like submission emails. A
 * failure is still logged by the worker, without the link.
 */
export const queueAccountEmail = (data: AccountEmailJobData) =>
  notificationQueue.add(data.kind, data, {
    removeOnComplete: true,
    removeOnFail: true,
  });
