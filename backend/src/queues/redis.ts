import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/**
 * Single shared connection for every BullMQ queue and worker. BullMQ requires
 * `maxRetriesPerRequest: null` so blocking commands are not aborted mid-wait.
 */
export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});
