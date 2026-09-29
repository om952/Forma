import { createHash, randomBytes } from "crypto";

/**
 * Secrets for one-time links (invites, password resets, email verification).
 *
 * 256 random bits, base64url so they survive a URL fragment untouched: always
 * 43 characters from [A-Za-z0-9_-].
 */
export const generateToken = (): string => randomBytes(32).toString("base64url");

/**
 * The form a token is stored and looked up in. SHA-256 rather than bcrypt: a
 * 256-bit random token has nothing to brute-force, and the hash has to be
 * deterministic so the row can be found by it. A leaked database therefore
 * holds no working links.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** Rejects anything that could not have come from `generateToken`. */
export const isWellFormedToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

const HOUR = 60 * 60 * 1000;

/** How long each kind of link stays valid. */
export const TOKEN_TTL_MS = {
  invite: 7 * 24 * HOUR,
  passwordReset: HOUR,
  emailVerification: 24 * HOUR,
} as const;

export const expiresIn = (ttlMs: number, now = new Date()): Date =>
  new Date(now.getTime() + ttlMs);
