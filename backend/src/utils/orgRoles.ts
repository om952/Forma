/**
 * Who may do what to whom inside an organization.
 *
 * Kept free of Prisma and Express so the rules can be tested on their own —
 * these decide who can take over an org, so they should be verifiable without
 * a database.
 *
 *   OWNER   invites ADMINs and MEMBERs, changes anyone's role, removes anyone
 *   ADMIN   invites and removes MEMBERs
 *   MEMBER  nothing here
 *
 * An organization always keeps at least one OWNER, and nobody removes
 * themselves (a user belongs to exactly one organization, so that would
 * delete their account).
 */

export const ORG_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const isOrgRole = (value: unknown): value is OrgRole =>
  typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);

/** Roles `actor` may invite someone at. Ownership is granted by role change. */
export const invitableRoles = (actor: OrgRole): OrgRole[] => {
  if (actor === "OWNER") return ["ADMIN", "MEMBER"];
  if (actor === "ADMIN") return ["MEMBER"];
  return [];
};

export type Decision =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 409; message: string };

const allow: Decision = { ok: true };

const deny = (status: 400 | 403 | 409, message: string): Decision => ({
  ok: false,
  status,
  message,
});

type Member = { id: string; role: OrgRole };

export const checkInvite = (actor: OrgRole, role: OrgRole): Decision => {
  if (invitableRoles(actor).includes(role)) return allow;

  if (actor === "MEMBER") {
    return deny(403, "Only owners and admins can invite people.");
  }

  return deny(
    403,
    actor === "ADMIN"
      ? "Admins can only invite members."
      : "Invite them as an admin or member, then make them an owner from the member list."
  );
};

/**
 * `ownerCount` is the number of OWNERs in the organization, read inside the
 * same transaction that applies the change.
 */
export const checkRoleChange = (input: {
  actor: Member;
  target: Member;
  newRole: OrgRole;
  ownerCount: number;
}): Decision => {
  const { actor, target, newRole, ownerCount } = input;

  if (actor.role !== "OWNER") {
    return deny(403, "Only an owner can change roles.");
  }

  if (target.role === "OWNER" && newRole !== "OWNER" && ownerCount <= 1) {
    return deny(
      409,
      "An organization needs at least one owner. Make someone else an owner first."
    );
  }

  return allow;
};

export const checkRemoval = (input: {
  actor: Member;
  target: Member;
  ownerCount: number;
}): Decision => {
  const { actor, target, ownerCount } = input;

  if (actor.id === target.id) {
    return deny(400, "You can't remove yourself from the organization.");
  }

  if (actor.role === "OWNER") {
    if (target.role === "OWNER" && ownerCount <= 1) {
      return deny(409, "An organization needs at least one owner.");
    }
    return allow;
  }

  if (actor.role === "ADMIN") {
    return target.role === "MEMBER"
      ? allow
      : deny(403, "Admins can only remove members.");
  }

  return deny(403, "Only owners and admins can remove people.");
};
