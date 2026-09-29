/**
 * Structured logging.
 *
 * One JSON object per line in production, so a log platform can index and
 * filter on fields (`reqId`, `formId`, `err.message`) rather than grepping
 * free text. Pretty-printed in development.
 *
 * Use `req.log` inside a request handler — it carries the request id, so
 * every line a request produces can be pulled up together — and `logger`
 * everywhere else. Pass errors as `{ err }` so they are serialized with their
 * stack and reported to Sentry.
 */

import { randomUUID } from "node:crypto";

import type { Request } from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";

import { env } from "../config/env";
import { captureException } from "./sentry";

const ERROR_LEVEL = 50;

export const logger = pino({
  level: env.LOG_LEVEL,
  // "level":"error" rather than "level":50 — what log platforms index on.
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Secrets that could plausibly end up in a logged object. Paths are
  // explicit on purpose: pino's redaction is fast because it does not search.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-razorpay-signature"]',
      "password",
      "passwordHash",
      "token",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[redacted]",
  },
  hooks: {
    // Report errors to Sentry at the point they are logged.
    logMethod(args, method, level) {
      const [first] = args as unknown[];

      if (
        level >= ERROR_LEVEL &&
        first &&
        typeof first === "object" &&
        "err" in first &&
        first.err instanceof Error
      ) {
        const message = typeof args[1] === "string" ? args[1] : undefined;
        captureException(first.err, message ? { message } : undefined);
      }

      return method.apply(this, args);
    },
  },
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});

/** Accepts a caller's request id only if it is short and plain. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Per-request logging, and the request id: taken from an upstream proxy's
 * `X-Request-Id` when present, generated otherwise, and echoed back in the
 * response so a user's bug report can be matched to our logs.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id =
      typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();

    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  // Health checks run every few seconds from the platform; logging each one
  // would drown everything else.
  autoLogging: { ignore: (req) => Boolean(req.url?.startsWith("/health")) },
  // Method, path and status are what's useful per request. The default
  // serializers log every header, which is noise at best and credentials at
  // worst.
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  customProps: (req) => ({ ip: (req as Request).ip }),
});
