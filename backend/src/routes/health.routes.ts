import { Router, type Request, type Response } from "express";

import { prisma } from "../db/prisma";
import { logger } from "../observability/logger";
import { redisRequestConnection } from "../queues/redis";
import { isShuttingDown } from "../shutdown";

const router = Router();

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

router.get("/live", live);
// The original endpoint, kept for anything already pointed at it.
router.get("/", live);

/**
 * Readiness: this instance can serve traffic right now. A load balancer stops
 * routing to an instance that fails it, which is also how a draining instance
 * is taken out of rotation during shutdown.
 */
router.get("/ready", async (_req, res) => {
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
});

export default router;
