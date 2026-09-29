import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import type { Request, Response } from "express";
import type { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { signSessionToken, toPublicUser } from "../services/session";
import { HttpError } from "../utils/httpError";
import { hashToken, isWellFormedToken } from "../utils/tokens";
import type { acceptInviteBody, inviteLookupBody } from "../validation/account";

/**
 * The invitee's side: no session, just the token from the invite link. Both
 * endpoints take the token in the body so it never appears in a request URL.
 */

const INVALID_INVITE =
  "This invitation is invalid or has expired. Ask for a new one.";

const findOpenInvite = async (token: unknown) => {
  if (!isWellFormedToken(token)) return null;

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      invitedBy: { select: { email: true } },
    },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    return null;
  }

  return invite;
};

const alreadyMember = (email: string, orgName: string) =>
  new HttpError(
    409,
    `${email} is already a member of ${orgName}. Sign in instead.`
  );

/** What the accept page shows before the invitee sets a password. */
export const lookupInvite = async (req: Request, res: Response) => {
  const { token } = req.body as z.output<typeof inviteLookupBody>;
  const invite = await findOpenInvite(token);

  if (!invite) throw new HttpError(404, INVALID_INVITE);

  const existing = await prisma.user.findFirst({
    where: { orgId: invite.orgId, email: invite.email },
    select: { id: true },
  });

  if (existing) throw alreadyMember(invite.email, invite.organization.name);

  return res.json({
    email: invite.email,
    role: invite.role,
    organization: { name: invite.organization.name },
    invitedBy: invite.invitedBy?.email ?? null,
    expiresAt: invite.expiresAt,
  });
};

/**
 * Creates the invitee's account in the organization and signs them in. The
 * address is the one the invite was sent to; the invitee only chooses a
 * password (and optionally a name).
 */
export const acceptInvite = async (req: Request, res: Response) => {
  const { token, password, name: displayName } =
    req.body as z.output<typeof acceptInviteBody>;

  const invite = await findOpenInvite(token);
  if (!invite) throw new HttpError(404, INVALID_INVITE);

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  const now = new Date();

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Claims the invite. Of two concurrent accepts, only one matches.
      const { count } = await tx.invite.updateMany({
        where: { id: invite.id, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });

      if (count !== 1) throw new HttpError(404, INVALID_INVITE);

      return tx.user.create({
        data: {
          orgId: invite.orgId,
          email: invite.email,
          name: displayName,
          role: invite.role,
          passwordHash,
          // Only an emailed link proves the invitee reads this inbox.
          emailVerifiedAt: invite.emailedAt ? now : null,
        },
      });
    });

    req.log.info({ userId: user.id, inviteId: invite.id }, "Invite accepted");

    return res.status(201).json({
      token: signSessionToken(user),
      user: toPublicUser(user),
      organization: invite.organization,
    });
  } catch (error) {
    // The (orgId, email) unique index: they joined by some other route first.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw alreadyMember(invite.email, invite.organization.name);
    }
    throw error;
  }
};
