import IORedis from "ioredis";

import { env } from "../config/env";
import { logger } from "../observability/logger";

const redisUrl = env.REDIS_URL;

/**
 * Single shared connection for every BullMQ queue and worker. BullMQ requires
 * `maxRetriesPerRequest: null` so blocking commands are not aborted mid-wait.
 */
export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

/**
 * Separate connection for anything on the HTTP request path — today, the rate
 * limiters.
 *
 * The queue connection above must wait indefinitely for a reconnect, which is
 * exactly wrong here: sharing it would make every API request hang for the
 * duration of a Redis outage instead of erroring. These settings reject in
 * about a second instead, which is what lets the limiters degrade to
 * allow-and-continue rather than taking the API down with Redis.
 */
export const redisRequestConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: 1,
  // `commandTimeout` is what bounds the wait — it is the reason a Redis outage
  // costs a request ~1s instead of hanging it forever.
  commandTimeout: 1000,
  // The offline queue stays ON deliberately. `rate-limit-redis` loads its Lua
  // script the moment a store is constructed, which is before this socket has
  // finished connecting; with the queue off that first command fails and the
  // store never recovers for the life of the process. Queuing lets boot-time
  // init wait for the connection, and `commandTimeout` still caps every wait.
  enableOfflineQueue: true,
});

// ioredis throws on an unhandled `error` event. The limiters already treat a
// store failure as "allow the request", so this only needs to stop the process
// from dying — and to say so once rather than on every reconnect attempt.
let requestRedisErrorLogged = false;

redisRequestConnection.on("error", (error: Error) => {
  if (requestRedisErrorLogged) return;

  requestRedisErrorLogged = true;
  logger.error(
    { reason: error.message },
    "Redis unavailable — rate limits are not being enforced"
  );
});

redisRequestConnection.on("ready", () => {
  requestRedisErrorLogged = false;
});
