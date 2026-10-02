import { Worker } from "bullmq";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { logger } from "../observability/logger";
import {
  maintenanceQueue,
  PURGE_OLD_FORM_SESSIONS_JOB,
  scheduleMaintenanceJobs,
} from "../queues/maintenance.queue";
import { redisConnection } from "../queues/redis";
import { retentionCutoff } from "../utils/retention";

const log = logger.child({ worker: "maintenance" });

/**
 * Deletes FormSession rows older than the retention window. Unscoped by
 * design — this is a housekeeping sweep across every organization, not a
 * request made on one tenant's behalf, so it uses the raw client rather than
 * `req.db`. A session row has nothing pointing at it by foreign key (a
 * Response's link to it is nulled on delete instead), so deleting the row
 * outright is safe.
 */
export const purgeOldFormSessions = async (now = new Date()) => {
  const cutoff = retentionCutoff(env.FORM_SESSION_RETENTION_DAYS, now);
  const { count } = await prisma.formSession.deleteMany({
    where: { viewedAt: { lt: cutoff } },
  });
  return count;
};

export const createMaintenanceWorker = () => {
  const worker = new Worker(
    maintenanceQueue.name,
    async (job) => {
      if (job.name !== PURGE_OLD_FORM_SESSIONS_JOB) return;

      const deleted = await purgeOldFormSessions();
      log.info({ deleted }, "Purged old form visits");
    },
    { connection: redisConnection }
  );

  worker.on("failed", (job, error) => {
    log.error({ jobId: job?.id, name: job?.name, err: error }, "Maintenance job failed");
  });

  worker.on("error", (error) => {
    log.error({ err: error }, "Maintenance worker error");
  });

  // Registers the nightly schedule. BullMQ stores it in Redis, so this only
  // needs to run once per deploy, not once per process — calling it again on
  // every restart is a harmless no-op (see scheduleMaintenanceJobs).
  void scheduleMaintenanceJobs().catch((error: unknown) =>
    log.error({ err: error }, "Failed to schedule maintenance jobs")
  );

  return worker;
};
