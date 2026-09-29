import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";

import { redisRequestConnection } from "../queues/redis";

/**
 * Limiters are backed by Redis rather than the default in-memory store: an
 * in-process counter would let a caller multiply their allowance by the number
 * of running API instances, which defeats the point behind a load balancer.
 *
 * Note this uses the *request-path* connection, not the queue one — see
 * `queues/redis.ts`. The queue client blocks forever waiting on a reconnect,
 * which on the request path would hang every API call during a Redis outage.
 */
const createStore = (prefix: string) =>
  new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]): Promise<RedisReply> => {
      const [command, ...rest] = args;

      if (!command) {
        return Promise.reject(
          new Error("Rate limit store issued an empty Redis command")
        );
      }

      return redisRequestConnection.call(command, ...rest) as Promise<RedisReply>;
    },
  });

const baseOptions = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  /**
   * If Redis is unreachable, serve the request instead of returning 500. A
   * Redis outage already costs us webhooks and email; it should not also take
   * the whole API down. The trade-off is that limits are not enforced during
   * that window — acceptable, because the alternative is a total outage.
   */
  passOnStoreError: true,
} as const;

/**
 * Signup and login. Deliberately tight: this is the endpoint an attacker
 * hammers with a credential list.
 *
 * Successful requests are not counted, so a shared office IP full of
 * legitimate users never exhausts the budget — only failures do.
 */
export const authLimiter = rateLimit({
  ...baseOptions,
  store: createStore("auth"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: {
    message: "Too many authentication attempts. Try again in a few minutes.",
  },
});

/**
 * Endpoints that email someone on request: "forgot password" and "resend
 * verification". Every request counts, successful or not, since each one can
 * put a message in a stranger's inbox. Each user also has a one-minute
 * cooldown per email kind (see `services/accountTokens.ts`).
 */
export const accountEmailLimiter = rateLimit({
  ...baseOptions,
  store: createStore("account-email"),
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { message: "Too many emails requested. Try again in a few minutes." },
});

/**
 * Sending invites. Keyed by the signed-in user rather than the IP, so one
 * admin inviting their whole team from an office network does not lock out
 * their colleagues. Must run after `authMiddleware`.
 */
export const inviteLimiter = rateLimit({
  ...baseOptions,
  store: createStore("invite"),
  windowMs: 60 * 60 * 1000,
  limit: 50,
  keyGenerator: (req: Request) =>
    req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? "unknown"),
  message: { message: "Too many invitations sent. Try again later." },
});

/**
 * Public form submissions. Keyed by form as well as by IP: a burst against one
 * busy form should not lock a respondent out of every other form on the
 * platform.
 */
export const submissionLimiter = rateLimit({
  ...baseOptions,
  store: createStore("submit"),
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req: Request) =>
    `${ipKeyGenerator(req.ip ?? "unknown")}:${req.params.formId ?? "unknown"}`,
  message: {
    message: "Too many submissions from this address. Please slow down.",
  },
});

/**
 * Anonymous uploads. Each one costs disk, so this is stricter than submission:
 * without it a stranger can fill the volume from a single laptop.
 */
export const uploadLimiter = rateLimit({
  ...baseOptions,
  store: createStore("upload"),
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: { message: "Too many uploads from this address. Try again later." },
});

/**
 * Backstop across the whole API. Generous enough that no normal session sees
 * it; low enough to blunt a scraper walking the endpoints.
 */
export const apiLimiter = rateLimit({
  ...baseOptions,
  store: createStore("api"),
  windowMs: 15 * 60 * 1000,
  limit: 600,
  /**
   * Razorpay's callbacks all originate from a handful of their IPs, so a busy
   * billing period would drain one shared bucket and we would start dropping
   * payment events. The endpoint is already authenticated by HMAC signature —
   * an unsigned request is rejected cheaply — so an IP budget buys nothing here.
   */
  skip: (req: Request) => req.path === "/payments/webhook",
  message: { message: "Too many requests. Please slow down." },
});
