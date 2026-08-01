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
    };
