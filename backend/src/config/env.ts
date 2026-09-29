/**
 * Validated application configuration.
 *
 * Every `process.env` read in the app goes through here. The point is to fail
 * at boot with a readable list of what is wrong, rather than at 3am on the
 * first request that happens to need a variable nobody set — a missing
 * `JWT_SECRET` used to surface as a 500 on login, and a weak one not at all.
 *
 * Import this module first in the entrypoint: it loads `.env` as a side effect,
 * so anything importing it gets a populated environment.
 */

import "dotenv/config";
import { z } from "zod";

/**
 * Placeholder secrets that ship in example files. Harmless in development,
 * catastrophic in production — anyone reading the repo can forge a token.
 */
const PLACEHOLDER_SECRETS = new Set([
  "change_me",
  "changeme",
  "secret",
  "jwt_secret",
  "your_jwt_secret",
  "test",
  "development",
]);

const MIN_PRODUCTION_SECRET_LENGTH = 32;

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),

    // --- Core ---
    DATABASE_URL: z.string().min(1, "must not be empty"),
    JWT_SECRET: z.string().min(1, "must not be empty"),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    // --- Queues + rate limiting ---
    REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),

    // --- Network ---
    /** Comma-separated; falls back to FRONTEND_URL. Split in `corsOrigins`. */
    CORS_ORIGINS: z.string().optional(),
    FRONTEND_URL: z.url("must be a valid URL").default("http://localhost:3000"),
    /** Proxy hops to trust for the client IP. Numeric, or an Express preset. */
    TRUST_PROXY: z.string().optional(),

    // --- Billing (all three, or none) ---
    RAZORPAY_KEY_ID: z.string().min(1).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),

    // --- Email (optional by design) ---
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).default("Forma <onboarding@resend.dev>"),

    // --- Processes ---
    /**
     * Run the queue workers inside the API process as well. Defaults to on in
     * development (one command runs everything) and off otherwise: in
     * production run `dist/worker.js` as its own process so the two scale and
     * restart independently. Resolved in `runWorkersInApi`.
     */
    RUN_WORKERS_IN_API: z.stringbool().optional(),

    // --- Public URLs ---
    /**
     * Origin this API is reachable at from the outside, used to build links to
     * uploaded files. Required in production: behind a proxy the request's own
     * Host header is not trustworthy.
     */
    PUBLIC_API_URL: z.url("must be a valid URL").optional(),

    // --- File storage ---
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    /** Local driver only. Defaults to `backend/uploads`. */
    UPLOAD_DIR: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    /** `auto` for Cloudflare R2. */
    S3_REGION: z.string().min(1).default("auto"),
    /** Set for R2, MinIO or any S3-compatible store; omit for AWS. */
    S3_ENDPOINT: z.url("must be a valid URL").optional(),
    /** Omit both to use the default AWS credential chain (e.g. an IAM role). */
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    /** MinIO needs path-style URLs. */
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),

    // --- Observability ---
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    /** Errors are reported to Sentry when set. */
    SENTRY_DSN: z.url("must be a valid URL").optional(),
    /** Tags events with the deployed version, e.g. the git SHA. */
    APP_RELEASE: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production") {
      if (PLACEHOLDER_SECRETS.has(value.JWT_SECRET.trim().toLowerCase())) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_SECRET"],
          message:
            "is a placeholder from the example config — generate a real secret " +
            "(`openssl rand -base64 48`)",
        });
      } else if (value.JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_SECRET"],
          message: `must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production (got ${value.JWT_SECRET.length})`,
        });
      }
    }

    if (value.NODE_ENV === "production" && !value.PUBLIC_API_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_API_URL"],
        message:
          "is required in production — set it to the public origin of this API " +
          "(e.g. https://api.example.com) so file links point at the right host",
      });
    }

    if (value.STORAGE_DRIVER === "s3" && !value.S3_BUCKET) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET"],
        message: "is required when STORAGE_DRIVER=s3",
      });
    }

    if (Boolean(value.S3_ACCESS_KEY_ID) !== Boolean(value.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: [value.S3_ACCESS_KEY_ID ? "S3_SECRET_ACCESS_KEY" : "S3_ACCESS_KEY_ID"],
        message: "must be set together with its pair, or both left unset",
      });
    }

    // Partial billing config is worse than none: the upgrade flow would appear
    // available and then fail once the customer is already in the checkout.
    const billingKeys = [
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
      "RAZORPAY_WEBHOOK_SECRET",
    ] as const;
    const provided = billingKeys.filter((key) => value[key]);

    if (provided.length > 0 && provided.length < billingKeys.length) {
      for (const key of billingKeys) {
        if (value[key]) continue;

        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            "is required once any other Razorpay variable is set — configure all " +
            "three, or none to disable billing",
        });
      }
    }
  });

/**
 * An empty variable means "not set". Compose files and platform dashboards
 * routinely pass optional settings through as `FOO=` — without this, each one
 * would fail its format check instead of falling back to its default.
 */
const definedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== "")
);

const parsed = schema.safeParse(definedEnv);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    return `  • ${name} ${issue.message}`;
  });

  console.error(
    [
      "",
      "Invalid configuration — the server cannot start:",
      "",
      ...lines,
      "",
      "See backend/.env.example for a documented template.",
      "",
    ].join("\n")
  );

  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";

/** Browser origins allowed to call this API. */
export const corsOrigins: string[] = (env.CORS_ORIGINS ?? env.FRONTEND_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Express's `trust proxy` setting, or undefined to leave it off. Numeric strings
 * become numbers so `TRUST_PROXY=1` means "one hop" rather than the hostname "1".
 */
export const trustProxy: number | string | undefined = (() => {
  if (!env.TRUST_PROXY) return undefined;

  const hops = Number(env.TRUST_PROXY);
  return Number.isNaN(hops) ? env.TRUST_PROXY : hops;
})();

/**
 * Razorpay credentials, or null when billing is switched off. Narrowed to a
 * single object so callers get all three or none, with no partial state.
 */
export const billingConfig =
  env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
    ? {
        keyId: env.RAZORPAY_KEY_ID,
        keySecret: env.RAZORPAY_KEY_SECRET,
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
      }
    : null;

/**
 * Whether email can actually be sent. Without it, invite links are handed to
 * the inviter to share, and password reset cannot work.
 */
export const emailEnabled = Boolean(env.RESEND_API_KEY);

export const runWorkersInApi = env.RUN_WORKERS_IN_API ?? env.NODE_ENV === "development";

/** Origin used in links to uploaded files. */
export const publicApiUrl = (env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`).replace(
  /\/+$/,
  ""
);

/** Warnings for configuration that is valid but degrades a feature. */
export const configWarnings: string[] = [
  billingConfig
    ? null
    : "RAZORPAY_* is not set — billing and plan upgrades are disabled.",
  env.RESEND_API_KEY
    ? null
    : "RESEND_API_KEY is not set — no email is sent: submission notifications and email verification are skipped, invite links must be shared by hand, and password reset does not work.",
  isProduction && !env.TRUST_PROXY
    ? "TRUST_PROXY is not set — if this runs behind a proxy, rate limits will key on the proxy's IP and apply to all users at once."
    : null,
  isProduction && corsOrigins.some((origin) => origin.includes("localhost"))
    ? `CORS_ORIGINS still allows localhost (${corsOrigins.join(", ")}).`
    : null,
  isProduction && env.STORAGE_DRIVER === "local"
    ? "STORAGE_DRIVER is local — uploads are lost on redeploy unless UPLOAD_DIR is on a persistent volume. Use s3 for container platforms."
    : null,
].filter((warning): warning is string => warning !== null);
