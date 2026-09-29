/**
 * Ordered shutdown for SIGTERM/SIGINT.
 *
 * Container platforms send SIGTERM and then SIGKILL a short time later. Without
 * a handler, every deploy killed the process mid-flight: a webhook delivery
 * halfway through its HTTP request was simply lost, and in-flight API responses
 * were cut off. This drains in dependency order instead.
 */

import type { Server } from "node:http";

import { prisma } from "./db/prisma";
import { notificationQueue } from "./queues/notification.queue";
import { redisConnection, redisRequestConnection } from "./queues/redis";
import { webhookQueue } from "./queues/webhook.queue";
import { notificationWorker } from "./workers/notification.worker";
import { webhookWorker } from "./workers/webhook.worker";

/**
 * Hard ceiling on draining. Must stay below the platform's SIGKILL grace period
 * (30s on most) so the forced exit below is ours rather than the scheduler's.
 */
const FORCE_EXIT_MS = 15_000;

/** Runs a close step without letting one failure abort the rest of the drain. */
const closeQuietly = async (label: string, close: () => Promise<unknown>) => {
  try {
    await close();
  } catch (error) {
    console.error(`[shutdown] ${label} failed to close cleanly`, error);
  }
};

const closeHttpServer = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve());
    // Keep-alive sockets hold `close` open until they time out on their own, so
    // idle ones are cut loose explicitly. In-flight requests still finish.
    server.closeIdleConnections();
  });

export const registerGracefulShutdown = (server: Server) => {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    // A second Ctrl-C (or a SIGTERM racing a SIGINT) must not restart the drain.
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[shutdown] ${signal} received — draining`);

    const forceExit = setTimeout(() => {
      console.error(
        `[shutdown] still draining after ${FORCE_EXIT_MS}ms — forcing exit`
      );
      process.exit(1);
    }, FORCE_EXIT_MS);

    // The timer must not itself keep the event loop alive once we are done.
    forceExit.unref();

    // Stop taking new work before tearing anything down, so the load balancer
    // sees the port close while the dependencies below are still usable.
    await closeQuietly("HTTP server", () => closeHttpServer(server));
    console.log("[shutdown] HTTP server closed");

    // Workers next. BullMQ's `close()` waits for the job in flight to finish,
    // which is the whole reason a delivery is no longer abandoned mid-request.
    await Promise.all([
      closeQuietly("webhook worker", () => webhookWorker.close()),
      closeQuietly("notification worker", () => notificationWorker.close()),
    ]);
    console.log("[shutdown] workers drained");

    await Promise.all([
      closeQuietly("webhook queue", () => webhookQueue.close()),
      closeQuietly("notification queue", () => notificationQueue.close()),
    ]);

    // Prisma before Redis: nothing above should still need either, but the
    // dead-letter write in the worker's `failed` handler is the last DB user.
    await closeQuietly("database", () => prisma.$disconnect());
    await Promise.all([
      closeQuietly("queue redis", () => redisConnection.quit()),
      closeQuietly("request redis", () => redisRequestConnection.quit()),
    ]);

    clearTimeout(forceExit);
    console.log("[shutdown] complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // A rejection nobody handled leaves the process in an unknown state. Log it
  // loudly and drain rather than carrying on and serving from a broken one.
  process.on("unhandledRejection", (reason) => {
    console.error("[fatal] unhandled promise rejection", reason);
    void shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error) => {
    console.error("[fatal] uncaught exception", error);
    void shutdown("uncaughtException");
  });
};
