// Must come first: it loads `.env` and validates it, so every module imported
// below sees a populated, checked environment (or the process has already died
// with a readable report).
import { configWarnings, env, runWorkersInApi } from "./config/env";
// Second: error reporting has to be live before anything else can fail.
import "./observability/sentry";

import { app } from "./app";
import { logger } from "./observability/logger";
import { registerGracefulShutdown } from "./shutdown";
import { startWorkers } from "./workers";

const workers = runWorkersInApi ? startWorkers() : [];

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, workersInProcess: workers.length > 0 },
    "API listening"
  );

  for (const warning of configWarnings) {
    logger.warn(warning);
  }
});

registerGracefulShutdown({ server, workers });
