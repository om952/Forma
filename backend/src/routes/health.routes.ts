import type { Queue } from "bullmq";
import type { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { logger } from "../observability/logger";
import { notificationQueue } from "../queues/notification.queue";
import { redisRequestConnection } from "../queues/redis";
import { webhookQueue } from "../queues/webhook.queue";
import { isShuttingDown } from "../shutdown";
import { route, type RouteSpec } from "./define";

const CHECK_TIMEOUT_MS = 2000;

/**
 * A queue whose oldest waiting job has sat this long has nobody working it.
 * Retries don't trip it: their backoff is seconds, not minutes.
 */
export const STALLED_AFTER_MS = 5 * 60 * 1000;

const withTimeout = <T>(work: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
};

type CheckResult = { ok: boolean; latencyMs: number };

const runCheck = async (
  name: string,
  check: () => Promise<unknown>
): Promise<CheckResult> => {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)),
          CHECK_TIMEOUT_MS
        );
      }),
    ]);

    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    // Details go to the log, not the response: this endpoint is public, and a
    // connection error can name internal hosts.
    logger.warn({ err: error, check: name }, "Readiness check failed");
    return { ok: false, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Liveness: the process is up and its event loop is turning. Deliberately
 * checks nothing else — a platform restarts a container that fails this, and
 * restarting the API does not fix a database outage.
 */
const live = (_req: Request, res: Response) => {
  res.json({ status: "ok" });
};


/**
 * Readiness: this instance can serve traffic right now. A load balancer stops
 * routing to an instance that fails it, which is also how a draining instance
 * is taken out of rotation during shutdown.
 */
const ready = async (_req: Request, res: Response) => {
  if (isShuttingDown()) {
    return res.status(503).json({ status: "shutting_down" });
  }

  const [database, redis] = await Promise.all([
    runCheck("database", () => prisma.$queryRaw`SELECT 1`),
    runCheck("redis", () => redisRequestConnection.ping()),
  ]);

  const ok = database.ok && redis.ok;

  return res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "unavailable",
    checks: { database, redis },
  });
};

const queueStatus = async (queue: Queue, now: number) => {
  const [waiting, [oldest]] = await withTimeout(
    Promise.all([queue.getWaitingCount(), queue.getJobs(["waiting"], 0, 0, true)])
  );
  const oldestWaitingMs = oldest ? Math.max(0, now - oldest.timestamp) : 0;
  return { waiting, oldestWaitingMs, stalled: oldestWaitingMs > STALLED_AFTER_MS };
};

/**
 * Whether the workers are keeping up, for alerting. Readiness can't tell: it
 * runs in the API, and a dead worker process leaves the API perfectly
 * healthy while webhooks and emails silently pile up. This answers 503 once
 * the oldest waiting job in any queue has waited past STALLED_AFTER_MS.
 *
 * Deliberately not part of /health/ready: a stalled worker is no reason to
 * take a healthy API out of the load balancer.
 */
const queues = async (_req: Request, res: Response) => {
  const now = Date.now();
  try {
    const [webhooks, emails] = await Promise.all([
      queueStatus(webhookQueue, now),
      queueStatus(notificationQueue, now),
    ]);
    const ok = !webhooks.stalled && !emails.stalled;
    return res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "stalled",
      queues: { webhooks, emails },
    });
  } catch (error) {
    logger.warn({ err: error }, "Queue health check failed");
    return res.status(503).json({ status: "unavailable" });
  }
};

export const healthRoutes: RouteSpec[] = [
  route({
    method: "get",
    path: "/live",
    summary: "Liveness: the process is up",
    access: "public",
    responses: { 200: "`{ status: \"ok\" }`." },
    handler: live,
  }),
  // The original endpoint, kept for anything already pointed at it.
  route({
    method: "get",
    path: "/",
    summary: "Liveness (original path)",
    operationId: "liveLegacy",
    access: "public",
    responses: { 200: "`{ status: \"ok\" }`." },
    handler: live,
  }),
  route({
    method: "get",
    path: "/ready",
    summary: "Readiness: Postgres and Redis are reachable",
    access: "public",
    responses: {
      200: "Ready to serve traffic.",
      503: "A dependency is down, or the instance is shutting down.",
    },
    handler: ready,
  }),
  route({
    method: "get",
    path: "/queues",
    summary: "Whether the queue workers are keeping up",
    description:
      "For alerting, not load balancing. 503 when a queue's oldest waiting job has waited more than 5 minutes (no worker is consuming it) or Redis is unreachable.",
    access: "public",
    responses: {
      200: "Every queue is being worked: `{ status, queues: { webhooks, emails } }`.",
      503: "A queue has stalled, or Redis is unreachable.",
    },
    handler: queues,
  }),
];
