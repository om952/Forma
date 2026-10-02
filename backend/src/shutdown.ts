/**
 * Ordered shutdown for SIGTERM/SIGINT.
 *
 * Container platforms send SIGTERM and then SIGKILL a short time later. Without
 * a handler, every deploy killed the process mid-flight: a webhook delivery
 * halfway through its HTTP request was simply lost, and in-flight API responses
 * were cut off. This drains in dependency order instead.
 */

import type { Server } from "node:http";

import type { Worker } from "bullmq";

import { prisma } from "./db/prisma";
import { logger } from "./observability/logger";
import { flushErrorReports } from "./observability/sentry";
import { maintenanceQueue } from "./queues/maintenance.queue";
import { notificationQueue } from "./queues/notification.queue";
import { redisConnection, redisRequestConnection } from "./queues/redis";
import { webhookQueue } from "./queues/webhook.queue";

/**
 * Hard ceiling on draining. Must stay below the platform's SIGKILL grace period
 * (30s on most) so the forced exit below is ours rather than the scheduler's.
 */
const FORCE_EXIT_MS = 15_000;

const log = logger.child({ component: "shutdown" });

let shuttingDown = false;

/** True once a drain has started. Readiness checks report 503 from then on. */
export const isShuttingDown = () => shuttingDown;

/** Runs a close step without letting one failure abort the rest of the drain. */
const closeQuietly = async (label: string, close: () => Promise<unknown>) => {
  try {
    await close();
  } catch (error) {
    log.error({ err: error, step: label }, "Failed to close cleanly");
  }
};

const closeHttpServer = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve());
    // Keep-alive sockets hold `close` open until they time out on their own, so
    // idle ones are cut loose explicitly. In-flight requests still finish.
    server.closeIdleConnections();
  });

type ShutdownTargets = {
  /** The API's HTTP server; absent in the worker process. */
  server?: Server;
  /** Queue consumers running in this process; may be empty in the API. */
  workers: Worker[];
};

export const registerGracefulShutdown = ({ server, workers }: ShutdownTargets) => {
  const shutdown = async (signal: string) => {
    // A second Ctrl-C (or a SIGTERM racing a SIGINT) must not restart the drain.
    if (shuttingDown) return;
    shuttingDown = true;

    log.info({ signal }, "Draining");

    const forceExit = setTimeout(() => {
      log.error({ afterMs: FORCE_EXIT_MS }, "Still draining — forcing exit");
      process.exit(1);
    }, FORCE_EXIT_MS);

    // The timer must not itself keep the event loop alive once we are done.
    forceExit.unref();

    // Stop taking new work before tearing anything down, so the load balancer
    // sees the port close while the dependencies below are still usable.
    if (server) {
      await closeQuietly("HTTP server", () => closeHttpServer(server));
      log.info("HTTP server closed");
    }

    // Workers next. BullMQ's `close()` waits for the job in flight to finish,
    // which is the whole reason a delivery is no longer abandoned mid-request.
    if (workers.length > 0) {
      await Promise.all(
        workers.map((worker) =>
          closeQuietly(`worker ${worker.name}`, () => worker.close())
        )
      );
      log.info("Workers drained");
    }

    await Promise.all([
      closeQuietly("webhook queue", () => webhookQueue.close()),
      closeQuietly("notification queue", () => notificationQueue.close()),
      closeQuietly("maintenance queue", () => maintenanceQueue.close()),
    ]);

    // Prisma before Redis: nothing above should still need either, but the
    // dead-letter write in the worker's `failed` handler is the last DB user.
    await closeQuietly("database", () => prisma.$disconnect());
    await Promise.all([
      closeQuietly("queue redis", () => redisConnection.quit()),
      closeQuietly("request redis", () => redisRequestConnection.quit()),
    ]);

    log.info("Shutdown complete");
    // Last, so a crash that triggered this drain still reaches Sentry.
    await closeQuietly("error reporting", () => flushErrorReports());

    clearTimeout(forceExit);
    process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // A rejection nobody handled leaves the process in an unknown state. Log it
  // loudly and drain rather than carrying on and serving from a broken one.
  process.on("unhandledRejection", (reason) => {
    log.fatal(
      { err: reason instanceof Error ? reason : new Error(String(reason)) },
      "Unhandled promise rejection"
    );
    void shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error) => {
    log.fatal({ err: error }, "Uncaught exception");
    void shutdown("uncaughtException");
  });
};
