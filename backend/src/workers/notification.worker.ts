import { Worker, Job } from "bullmq";
import { Resend } from "resend";

import { env } from "../config/env";
import { logger } from "../observability/logger";
import {
  notificationQueue,
  type NotificationJobData,
} from "../queues/notification.queue";
import { redisConnection } from "../queues/redis";
import {
  buildEmailVerificationEmail,
  buildInviteEmail,
  buildOwnerNotificationEmail,
  buildPasswordResetEmail,
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

const log = logger.child({ worker: "notification" });

const buildContent = (data: NotificationJobData): EmailContent => {
  switch (data.kind) {
    case "owner":
      return buildOwnerNotificationEmail({
        formName: data.formName,
        fields: data.fields,
        responsesUrl: `${frontendUrl}/responses/${data.formId}`,
      });
    case "respondent":
      return buildRespondentConfirmationEmail({ formName: data.formName });
    case "invite":
      return buildInviteEmail(data);
    case "password-reset":
      return buildPasswordResetEmail(data);
    case "verify-email":
      return buildEmailVerificationEmail(data);
  }
};

export const createNotificationWorker = () => {
  const worker = new Worker<NotificationJobData>(
    notificationQueue.name,
    async (job: Job<NotificationJobData>) => {
      if (!resend) {
        // Lets invites, resets and verification be exercised locally without
        // an email provider. Never in production: the link is a credential.
        if (env.NODE_ENV === "development" && "url" in job.data) {
          log.info(
            { kind: job.data.kind, to: job.data.to, url: job.data.url },
            "Email is not configured; this is the link it would have carried"
          );
          return;
        }

        log.debug(
          { kind: job.data.kind },
          "Skipping email — RESEND_API_KEY is not set"
        );
        return;
      }

      const content = buildContent(job.data);

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
      concurrency: env.NOTIFICATION_WORKER_CONCURRENCY,
      limiter: {
        max: 20,
        duration: 1000,
      },
    }
  );

  worker.on("failed", (job, error) => {
    log.warn(
      {
        jobId: job?.id,
        kind: job?.data?.kind,
        attempt: job?.attemptsMade,
        reason: error.message,
      },
      "Notification job failed"
    );
  });

  worker.on("error", (error) => {
    log.error({ err: error }, "Notification worker error");
  });

  return worker;
};
