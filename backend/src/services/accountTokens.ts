import type { AuthTokenPurpose, Prisma } from "@prisma/client";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { queueAccountEmail } from "../queues/notification.queue";
import {
  expiresIn,
  generateToken,
  hashToken,
  isWellFormedToken,
  TOKEN_TTL_MS,
} from "../utils/tokens";

const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, "");

/**
 * Links carry the token in the URL fragment. Browsers never send the fragment
 * to a server, so the token stays out of access logs, proxies and Referer
 * headers; the page reads it and POSTs it to the API.
 */
export const frontendLink = (path: string, token: string): string =>
  `${frontendUrl}${path}#${token}`;

/** Minimum gap between two emails of the same kind to the same user. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const TTL: Record<AuthTokenPurpose, number> = {
  PASSWORD_RESET: TOKEN_TTL_MS.passwordReset,
  EMAIL_VERIFICATION: TOKEN_TTL_MS.emailVerification,
};

/**
 * Replaces the user's outstanding tokens of this purpose with a fresh one, so
 * only the newest link works. Returns null instead when one was issued within
 * the cooldown, which stops anyone from flooding an inbox.
 */
const issueToken = async (
  userId: string,
  purpose: AuthTokenPurpose
): Promise<string | null> => {
  const recent = await prisma.authToken.findFirst({
    where: {
      userId,
      purpose,
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { id: true },
  });

  if (recent) return null;

  const token = generateToken();

  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: expiresIn(TTL[purpose]),
      },
    }),
  ]);

  return token;
};

/** Returns false when a link went out less than a minute ago. */
export const sendVerificationEmail = async (user: {
  id: string;
  email: string;
}): Promise<boolean> => {
  const token = await issueToken(user.id, "EMAIL_VERIFICATION");
  if (!token) return false;

  await queueAccountEmail({
    kind: "verify-email",
    to: user.email,
    url: frontendLink("/verify-email", token),
  });

  return true;
};

/** Returns false when a link went out less than a minute ago. */
export const sendPasswordResetEmail = async (user: {
  id: string;
  email: string;
  organization: { name: string };
}): Promise<boolean> => {
  const token = await issueToken(user.id, "PASSWORD_RESET");
  if (!token) return false;

  await queueAccountEmail({
    kind: "password-reset",
    to: user.email,
    orgName: user.organization.name,
    url: frontendLink("/reset-password", token),
  });

  return true;
};

/**
 * Marks a token used and returns its user's id, or null if the token is
 * unknown, meant for something else, expired or already used.
 *
 * The conditional update is what makes a token single-use: of two concurrent
 * requests carrying the same token, only one updates a row.
 */
export const consumeAuthToken = async (
  tx: Prisma.TransactionClient,
  token: unknown,
  purpose: AuthTokenPurpose
): Promise<string | null> => {
  if (!isWellFormedToken(token)) return null;

  const record = await tx.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, purpose: true },
  });

  if (!record || record.purpose !== purpose) return null;

  const now = new Date();
  const { count } = await tx.authToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  return count === 1 ? record.userId : null;
};
