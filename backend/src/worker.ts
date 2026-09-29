/**
 * Queue worker process: webhook deliveries and email notifications.
 *
 * Runs separately from the API so each can be scaled and restarted on its
 * own — a burst of slow webhook endpoints no longer competes with API
 * requests for the same event loop. Start with `node dist/worker.js`.
 */

// Same order as the API: validated config first, then error reporting.
import { configWarnings, env } from "./config/env";
import "./observability/sentry";

import { logger } from "./observability/logger";
import { registerGracefulShutdown } from "./shutdown";
import { startWorkers } from "./workers";

const workers = startWorkers();

logger.info(
  { env: env.NODE_ENV, queues: workers.map((worker) => worker.name) },
  "Worker started"
);

for (const warning of configWarnings) {
  logger.warn(warning);
}

registerGracefulShutdown({ workers });
