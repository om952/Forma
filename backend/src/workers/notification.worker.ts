import { Worker, Job } from "bullmq";
import { Resend } from "resend";

import { env } from "../config/env";
import {
  notificationQueue,
  type NotificationJobData,
} from "../queues/notification.queue";
import { redisConnection } from "../queues/redis";
import {
  buildOwnerNotificationEmail,
  buildRespondentConfirmationEmail,
  type EmailContent,
} from "../utils/email.utils";

const resendApiKey = env.RESEND_API_KEY;
const emailFrom = env.EMAIL_FROM;
const frontendUrl = env.FRONTEND_URL;

/**
 * Email is optional configuration. Without a key the worker still drains the
 * queue and marks jobs complete — otherwise every submission would pile up
 * three failing jobs and noise up the logs.
 */
// The "not configured" warning is reported once at boot by `configWarnings`.
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const notificationWorker = new Worker<NotificationJobData>(
  notificationQueue.name,
  async (job: Job<NotificationJobData>) => {
    if (!resend) {
      console.warn("[notifications] Skipping email — no RESEND_API_KEY", {
        kind: job.data.kind,
      });
      return;
    }

    let content: EmailContent;

    if (job.data.kind === "owner") {
      content = buildOwnerNotificationEmail({
        formName: job.data.formName,
        fields: job.data.fields,
        responsesUrl: `${frontendUrl}/responses/${job.data.formId}`,
      });
    } else {
      content = buildRespondentConfirmationEmail({
        formName: job.data.formName,
      });
    }

    const { error } = await resend.emails.send({
      from: emailFrom,
      to: job.data.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    // The SDK reports failures in the response rather than throwing, so surface
    // them as thrown errors to let BullMQ retry.
    if (error) {
      throw new Error(`Resend rejected the email: ${error.message}`);
    }
  },
  {
    connection: redisConnection,
    limiter: {
      max: 20,
      duration: 1000,
    },
  }
);

notificationWorker.on("failed", (job, error) => {
  console.error("Notification job failed", {
    id: job?.id,
    kind: job?.data?.kind,
    error: error.message,
  });
});

notificationWorker.on("error", (error) => {
  console.error("Notification worker error", error);
});
