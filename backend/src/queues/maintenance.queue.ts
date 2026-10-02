import { Queue } from "bullmq";

import { redisConnection } from "./redis";

export const maintenanceQueue = new Queue("maintenance", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 20,
  },
});

export const PURGE_OLD_FORM_SESSIONS_JOB = "purge-old-form-sessions";

/**
 * Schedules the nightly cleanup. Safe to call every time a worker starts:
 * BullMQ keys a repeatable job by its name and repeat options, so calling this
 * again with the same schedule is a no-op rather than a duplicate.
 */
export const scheduleMaintenanceJobs = async () => {
  await maintenanceQueue.add(
    PURGE_OLD_FORM_SESSIONS_JOB,
    {},
    {
      repeat: { pattern: "0 3 * * *" }, // 03:00 UTC, away from any one region's peak traffic.
      jobId: PURGE_OLD_FORM_SESSIONS_JOB,
    }
  );
};
