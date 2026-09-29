// Must come first: it loads `.env` and validates it, so every module imported
// below sees a populated, checked environment (or the process has already died
// with a readable report).
import { configWarnings, corsOrigins, env, trustProxy } from "./config/env";

import path from "path";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { apiLimiter } from "./middlewares/rateLimit.middleware";
import { registerGracefulShutdown } from "./shutdown";
import authRoutes from "./routes/auth.routes";
import analyticsRoutes from "./routes/analytics.routes";
import formRoutes from "./routes/form.routes";
import paymentRoutes from "./routes/payment.routes";
import responseRoutes from "./routes/response.routes";
import uploadRoutes from "./routes/upload.routes";
import webhookRoutes from "./routes/webhook.routes";
import "./workers/webhook.worker";
import "./workers/notification.worker";

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
app.use(morgan("dev"));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"), {
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

app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/responses", responseRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/webhooks", webhookRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const server = app.listen(env.PORT, () => {
  console.log(`API running on :${env.PORT} (${env.NODE_ENV})`);

  for (const warning of configWarnings) {
    console.warn(`[config] ${warning}`);
  }
});

registerGracefulShutdown(server);
