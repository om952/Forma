import * as bcrypt from "bcrypt";
import type { Request, Response } from "express";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import {
  consumeAuthToken,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/accountTokens";
import { signSessionToken, toPublicUser } from "../services/session";
import {
  isValidEmail,
  normalizeEmail,
  passwordProblem,
  toSlug,
} from "../utils/accountInput";
import { HttpError } from "../utils/httpError";

const SALT_ROUNDS = env.BCRYPT_SALT_ROUNDS;

/**
 * Compared against when no account matches, so a login for an unknown email
 * takes as long as one with a wrong password and the response time does not
 * reveal which addresses have accounts. Hashed on first use, not at boot.
 */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () =>
  (dummyHash ??= bcrypt.hash("forma-timing-equaliser", SALT_ROUNDS));

type SignupBody = {
  email?: string;
  password?: string;
  organizationName?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
  organizationId?: string;
  organizationName?: string;
};

export const signup = async (req: Request, res: Response) => {
  try {
    const { email, password, organizationName } = req.body as SignupBody;

    if (!email || !password || !organizationName) {
      return res
        .status(400)
        .json({ message: "email, password, organizationName are required" });
    }

    const invalidPassword = passwordProblem(password);
    if (invalidPassword) {
      return res.status(400).json({ message: invalidPassword });
    }

    const normalizedEmail = normalizeEmail(String(email));
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "email is invalid" });
    }

    const orgName = String(organizationName).trim();
    const slug = toSlug(orgName);

    if (!slug) {
      return res.status(400).json({ message: "organizationName is invalid" });
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    });

    if (existingOrg) {
      return res.status(409).json({ message: "Organization already exists" });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);

    const { organization, user } = await prisma.$transaction(async (tx) => {
      const organizationRecord = await tx.organization.create({
        data: {
          name: orgName,
          slug,
        },
      });

      const userRecord = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: "OWNER",
          orgId: organizationRecord.id,
        },
      });

      return { organization: organizationRecord, user: userRecord };
    });

    // The account works without it; a failure here must not fail the signup.
    try {
      await sendVerificationEmail(user);
    } catch (error) {
      req.log.error({ err: error }, "Failed to queue verification email");
    }

    return res.status(201).json({
      token: signSessionToken(user),
      user: toPublicUser(user),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "signup failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, organizationId, organizationName } =
      req.body as LoginBody;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email and password are required" });
    }

    const normalizedEmail = normalizeEmail(String(email));
    let orgId = organizationId ? String(organizationId) : undefined;

    if (!orgId && organizationName) {
      const slug = toSlug(String(organizationName));

      if (!slug) {
        return res
          .status(400)
          .json({ message: "organizationName is invalid" });
      }

      const org = await prisma.organization.findUnique({ where: { slug } });

      if (!org) {
        await bcrypt.compare(String(password), await getDummyHash());
        return res.status(401).json({ message: "Invalid credentials" });
      }

      orgId = org.id;
    }

    // An address can have an account in several organizations (one per
    // invitation accepted), each with its own password.
    const candidates = await prisma.user.findMany({
      where: {
        email: normalizedEmail,
        ...(orgId ? { orgId } : {}),
      },
      take: 20,
    });

    if (candidates.length === 0) {
      await bcrypt.compare(String(password), await getDummyHash());
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const matches = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(String(password), candidate.passwordHash)) {
        matches.push(candidate);
      }
    }

    const [user] = matches;

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Only reached with a correct password, so it reveals nothing to someone
    // guessing: the same password opens accounts in more than one org.
    if (matches.length > 1) {
      return res.status(409).json({
        message:
          "This email has accounts in more than one organization. Enter the organization name to choose one.",
        code: "ORGANIZATION_REQUIRED",
      });
    }

    return res.json({
      token: signSessionToken(user),
      user: toPublicUser(user),
    });
  } catch (error) {
    req.log.error({ err: error }, "login failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** The signed-in user and their organization, read fresh from the database. */
export const me = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      organization: { select: { id: true, name: true, slug: true, tier: true } },
    },
  });

  if (!user) {
    throw new HttpError(401, "Invalid or expired token");
  }

  return res.json({
    user: toPublicUser(user),
    organization: user.organization,
  });
};

const RESET_REQUESTED_MESSAGE =
  "If an account exists for that address, we've sent a link to reset its password.";

/**
 * Always answers the same way, and does the work after answering, so neither
 * the response nor its timing reveals whether the address has an account.
 */
export const forgotPassword = async (req: Request, res: Response) => {
  const { email, organizationName } = req.body as {
    email?: unknown;
    organizationName?: unknown;
  };

  if (typeof email !== "string" || !isValidEmail(normalizeEmail(email))) {
    throw new HttpError(400, "Enter a valid email address.");
  }

  const slug =
    typeof organizationName === "string" && organizationName.trim()
      ? toSlug(organizationName)
      : undefined;

  res.json({ message: RESET_REQUESTED_MESSAGE });

  try {
    const users = await prisma.user.findMany({
      where: {
        email: normalizeEmail(email),
        ...(slug ? { organization: { slug } } : {}),
      },
      select: { id: true, email: true, organization: { select: { name: true } } },
      take: 20,
    });

    // One link per organization the address has an account in; each email
    // names its organization.
    for (const user of users) {
      await sendPasswordResetEmail(user);
    }
  } catch (error) {
    req.log.error({ err: error }, "Failed to send password reset email");
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: unknown; password?: unknown };

  const invalidPassword = passwordProblem(password);
  if (invalidPassword) {
    throw new HttpError(400, invalidPassword);
  }

  const passwordHash = await bcrypt.hash(password as string, SALT_ROUNDS);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, token, "PASSWORD_RESET");

    if (!userId) {
      throw new HttpError(
        400,
        "This reset link is invalid or has expired. Request a new one."
      );
    }

    // Bumping the version signs out every existing session, including one an
    // attacker may hold.
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    // The link arrived in their inbox, which proves they own the address.
    await tx.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });

    await tx.authToken.deleteMany({
      where: { userId, purpose: "PASSWORD_RESET", usedAt: null },
    });
  });

  return res.json({ message: "Password updated. Sign in with your new password." });
};

/** Works without a session, so the link can be opened in any browser. */
export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.body as { token?: unknown };

  await prisma.$transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, token, "EMAIL_VERIFICATION");

    if (!userId) {
      throw new HttpError(
        400,
        "This confirmation link is invalid or has expired. Sign in and request a new one."
      );
    }

    await tx.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  });

  return res.json({ message: "Email confirmed." });
};

export const resendVerification = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (!user) {
    throw new HttpError(401, "Invalid or expired token");
  }

  if (user.emailVerifiedAt) {
    return res.json({ message: "Your email is already confirmed." });
  }

  const sent = await sendVerificationEmail(user);

  if (!sent) {
    throw new HttpError(
      429,
      "We sent a link less than a minute ago. Check your inbox, or try again shortly."
    );
  }

  return res.json({ message: `We sent a new link to ${user.email}.` });
};

/**
 * Signs out every other session and returns a new token for this one, so the
 * user stays signed in where they made the change.
 */
export const changePassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (typeof currentPassword !== "string" || !currentPassword) {
    throw new HttpError(400, "currentPassword is required");
  }

  const invalidPassword = passwordProblem(newPassword);
  if (invalidPassword) {
    throw new HttpError(400, invalidPassword.replace(/^password/, "newPassword"));
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

  if (!user) {
    throw new HttpError(401, "Invalid or expired token");
  }

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    // 400 rather than 401: the session is fine, the typed password is not.
    throw new HttpError(400, "Your current password is incorrect.");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword as string, SALT_ROUNDS),
      tokenVersion: { increment: 1 },
    },
  });

  return res.json({
    message: "Password changed. Other sessions have been signed out.",
    token: signSessionToken(updated),
  });
};

/** Revokes every session token this user holds, this one included. */
export const logoutEverywhere = async (req: Request, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { tokenVersion: { increment: 1 } },
  });

  return res.status(204).end();
};
