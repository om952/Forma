import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import type { z } from "zod";

import { emailEnabled } from "../config/env";
import { prisma } from "../db/prisma";
import { queueAccountEmail } from "../queues/notification.queue";
import { frontendLink } from "../services/accountTokens";
import { recordAuditLog } from "../services/auditLog";
import { HttpError } from "../utils/httpError";
import {
  checkInvite,
  checkRemoval,
  checkRoleChange,
  type Decision,
  type OrgRole,
} from "../utils/orgRoles";
import { pageArgs, pageOf } from "../utils/pagination";
import type { changeRoleBody, createInviteBody } from "../validation/account";
import type { Pagination } from "../validation/common";
import { expiresIn, generateToken, hashToken, TOKEN_TTL_MS } from "../utils/tokens";

const enforce = (decision: Decision) => {
  if (!decision.ok) throw new HttpError(decision.status, decision.message);
};

const actorOf = (req: Request) => ({
  id: req.user!.id,
  orgId: req.user!.orgId,
  role: req.user!.role as OrgRole,
});

/**
 * Locks the organization's OWNER rows for the rest of the transaction and
 * returns how many there are. Two owners demoting or removing each other at
 * the same moment are serialised here, so the org can never end up with none.
 */
const lockOwners = async (tx: Prisma.TransactionClient, orgId: string) => {
  const owners = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User" WHERE "orgId" = ${orgId} AND role = 'OWNER' FOR UPDATE
  `;
  return owners.length;
};

const memberSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

/** Everyone in the organization. Visible to every member. */
export const listMembers = async (req: Request, res: Response) => {
  const members = await req.db!.user.findMany({
    select: memberSelect,
    orderBy: { createdAt: "asc" },
  });

  return res.json(
    members.map(({ emailVerifiedAt, ...member }) => ({
      ...member,
      emailVerified: emailVerifiedAt !== null,
    }))
  );
};

export const updateMemberRole = async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const targetId = (req.params as { userId: string }).userId;
  const { role } = req.body as z.output<typeof changeRoleBody>;

  const updated = await prisma.$transaction(async (tx) => {
    const ownerCount = await lockOwners(tx, actor.orgId);

    const target = await tx.user.findFirst({
      where: { id: targetId, orgId: actor.orgId },
      select: { id: true, email: true, role: true },
    });

    if (!target) throw new HttpError(404, "Member not found");

    enforce(checkRoleChange({ actor, target, newRole: role, ownerCount }));

    const updatedMember = await tx.user.update({
      where: { id: target.id },
      data: { role },
      select: memberSelect,
    });

    return { updatedMember, previousRole: target.role };
  });

  req.log.info(
    { targetUserId: updated.updatedMember.id, role: updated.updatedMember.role },
    "Member role changed"
  );

  await recordAuditLog({
    orgId: actor.orgId,
    actor: { id: actor.id, email: req.user!.email },
    action: "member.role_changed",
    targetId: updated.updatedMember.id,
    metadata: {
      targetEmail: updated.updatedMember.email,
      from: updated.previousRole,
      to: updated.updatedMember.role,
    },
  });

  const { emailVerifiedAt, ...member } = updated.updatedMember;
  return res.json({ ...member, emailVerified: emailVerifiedAt !== null });
};

/**
 * Deletes the member's account: a user belongs to exactly one organization.
 * Forms they created pass to whoever removed them, so nothing is orphaned and
 * submission notifications keep reaching someone in the org.
 */
export const removeMember = async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const targetId = (req.params as { userId: string }).userId;

  const target = await prisma.$transaction(async (tx) => {
    const ownerCount = await lockOwners(tx, actor.orgId);

    const targetRecord = await tx.user.findFirst({
      where: { id: targetId, orgId: actor.orgId },
      select: { id: true, email: true, role: true },
    });

    if (!targetRecord) throw new HttpError(404, "Member not found");

    enforce(checkRemoval({ actor, target: targetRecord, ownerCount }));

    await tx.form.updateMany({
      where: { orgId: actor.orgId, createdById: targetRecord.id },
      data: { createdById: actor.id },
    });

    await tx.user.delete({ where: { id: targetRecord.id } });

    return targetRecord;
  });

  req.log.info({ targetUserId: targetId }, "Member removed");

  await recordAuditLog({
    orgId: actor.orgId,
    actor: { id: actor.id, email: req.user!.email },
    action: "member.removed",
    targetId: target.id,
    metadata: { targetEmail: target.email, role: target.role },
  });

  return res.status(204).end();
};

/** Invitations not yet accepted and not expired. */
export const listInvites = async (req: Request, res: Response) => {
  const invites = await req.db!.invite.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      email: true,
      role: true,
      emailedAt: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json(
    invites.map(({ invitedBy, emailedAt, ...invite }) => ({
      ...invite,
      emailed: emailedAt !== null,
      invitedBy: invitedBy?.email ?? null,
    }))
  );
};

/**
 * Inviting an address that already has a pending invitation replaces it, so
 * this doubles as "resend".
 *
 * With email configured the link goes only to the invitee's inbox. Without it,
 * the link is returned for the inviter to pass on; accepting such an invite
 * does not count as confirming the address.
 */
export const createInvite = async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const { email: address, role } = req.body as z.output<typeof createInviteBody>;

  enforce(checkInvite(actor.role, role));

  const existing = await req.db!.user.findFirst({
    where: { email: address },
    select: { id: true },
  });

  if (existing) {
    throw new HttpError(409, `${address} is already a member of this organization.`);
  }

  const token = generateToken();
  const now = new Date();

  const invite = await prisma.$transaction(async (tx) => {
    await tx.invite.deleteMany({
      where: { orgId: actor.orgId, email: address, acceptedAt: null },
    });

    return tx.invite.create({
      data: {
        orgId: actor.orgId,
        email: address,
        role,
        tokenHash: hashToken(token),
        invitedById: actor.id,
        emailedAt: emailEnabled ? now : null,
        expiresAt: expiresIn(TOKEN_TTL_MS.invite, now),
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
    });
  });

  const inviteUrl = frontendLink("/invite", token);

  if (emailEnabled) {
    await queueAccountEmail({
      kind: "invite",
      to: address,
      orgName: invite.organization.name,
      inviterEmail: req.user!.email,
      role,
      url: inviteUrl,
    });
  }

  req.log.info({ inviteId: invite.id, role }, "Invite created");

  const { organization: _organization, ...details } = invite;
  return res.status(201).json({
    invite: { ...details, emailed: emailEnabled, invitedBy: req.user!.email },
    ...(emailEnabled ? {} : { inviteUrl }),
  });
};

/** Sensitive actions on this organization, newest first, a page at a time. */
export const listAuditLog = async (req: Request, res: Response) => {
  const page = req.query as unknown as Pagination;

  const rows = await req.db!.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(page),
    select: {
      id: true,
      actorEmail: true,
      action: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  return res.json(pageOf(rows, page.limit));
};

/** Admins may withdraw invitations to MEMBER only, matching what they can send. */
export const revokeInvite = async (req: Request, res: Response) => {
  const actor = actorOf(req);

  const invite = await req.db!.invite.findFirst({
    where: { id: (req.params as { inviteId: string }).inviteId, acceptedAt: null },
    select: { id: true, role: true },
  });

  if (!invite) throw new HttpError(404, "Invitation not found");

  enforce(checkInvite(actor.role, invite.role));

  await req.db!.invite.delete({ where: { id: invite.id } });
  return res.status(204).end();
};
