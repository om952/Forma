// Must come first: it loads `.env` and validates it, so every module imported
// below sees a populated, checked environment (or the process has already died
// with a readable report).
import {
  configWarnings,
  corsOrigins,
  env,
  runWorkersInApi,
  trustProxy,
} from "./config/env";
// Second: error reporting has to be live before anything else can fail.
import "./observability/sentry";

import path from "path";

import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";

import { apiLimiter } from "./middlewares/rateLimit.middleware";
import { httpLogger, logger } from "./observability/logger";
import { registerGracefulShutdown } from "./shutdown";
import authRoutes from "./routes/auth.routes";
import analyticsRoutes from "./routes/analytics.routes";
import filesRoutes from "./routes/files.routes";
import formRoutes from "./routes/form.routes";
import inviteRoutes from "./routes/invite.routes";
import orgRoutes from "./routes/org.routes";
import healthRoutes from "./routes/health.routes";
import paymentRoutes from "./routes/payment.routes";
import responseRoutes from "./routes/response.routes";
import uploadRoutes from "./routes/upload.routes";
import webhookRoutes from "./routes/webhook.routes";
import { defaultUploadDir } from "./storage/local";
import { startWorkers } from "./workers";

const app = express();

/**
 * Rate limiting keys on `req.ip`, which behind a load balancer is the balancer's
 * own address — every user would then share one bucket. `TRUST_PROXY` says how
 * many proxy hops to believe (usually `1`).
 *
 * Off by default on purpose: trusting `X-Forwarded-For` when nothing upstream
 * overwrites it lets a caller forge their own IP and walk past every limiter.
 * Set it only once you know a proxy is actually in front of this process.
 */
if (trustProxy !== undefined) {
  app.set("trust proxy", trustProxy);
}

app.use(httpLogger);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header means this is not a browser cross-origin request —
      // curl, health checks and the Razorpay webhook all arrive this way, and
      // there is no cross-origin decision to make for them.
      if (!origin) return callback(null, true);

      // Denying by omitting the CORS headers (rather than raising) lets the
      // browser block it without turning every probe into a 500 in our logs.
      return callback(null, corsOrigins.includes(origin));
    },
    credentials: true,
  })
);
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
// Uploads arrive as base64 inside JSON, so they need far more headroom than the
// 100kb default. Mounted first; the global parser below then skips these.
app.use("/api/uploads", express.json({ limit: "10mb" }));
app.use(express.json());

/**
 * Links saved before uploads moved to `/api/files` point here. Kept so those
 * responses still open; new uploads are never served from this path.
 */
app.use(
  "/uploads",
  express.static(path.resolve(env.UPLOAD_DIR ?? defaultUploadDir), {
    /**
     * These files were uploaded by anonymous respondents and are served from the
     * API's own origin. Rendered inline, an uploaded `.svg` or `.html` would run
     * as same-origin script — stored XSS against anyone who opens an attachment.
     * Force a download, stop MIME sniffing, and neuter any embedded content.
     */
    setHeaders: (res) => {
      res.setHeader("Content-Disposition", "attachment");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    },
  })
);

app.use("/health", healthRoutes);

app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/responses", responseRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/webhooks", webhookRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

/**
 * Last stop for anything a handler threw or passed to `next`. Client errors
 * raised by middleware (malformed JSON, a body over the size limit) keep their
 * status; everything else is logged with its stack and answered with a
 * generic 500 that never leaks internals.
 */
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);

  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;

  if (status >= 400 && status < 500) {
    const expose =
      typeof error === "object" && error && "expose" in error && error.expose;
    const message =
      expose && error instanceof Error ? error.message : "Bad request";

    return res.status(status).json({ message, requestId: req.id });
  }

  req.log.error({ err: error }, "Unhandled error in request");
  return res
    .status(500)
    .json({ message: "Internal server error", requestId: req.id });
});

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
