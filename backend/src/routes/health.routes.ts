import type { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { logger } from "../observability/logger";
import { redisRequestConnection } from "../queues/redis";
import { isShuttingDown } from "../shutdown";
import { route, type RouteSpec } from "./define";

const CHECK_TIMEOUT_MS = 2000;

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
];
