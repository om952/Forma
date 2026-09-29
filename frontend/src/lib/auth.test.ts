import { describe, expect, it } from "vitest";

import {
  canChangeRoles,
  canDeleteForm,
  canManageBilling,
  canManageMembers,
  canRemoveMember,
  invitableRoles,
  type AuthUser,
  type OrgRole,
} from "./auth";

const user = (role: OrgRole, id = `u-${role}`): AuthUser => ({ id, email: `${id}@x.test`, role, orgId: "org" });

describe("what each role is offered", () => {
  it("lets owners and admins manage billing, webhooks, members and deletions", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      expect(canManageBilling(user(role))).toBe(true);
      expect(canManageMembers(user(role))).toBe(true);
      expect(canDeleteForm(user(role))).toBe(true);
    }
    expect(canManageBilling(user("MEMBER"))).toBe(false);
    expect(canDeleteForm(user("MEMBER"))).toBe(false);
    expect(canManageBilling(null)).toBe(false);
  });

  it("offers owners admin and member invites, admins member invites, members none", () => {
    expect(invitableRoles(user("OWNER"))).toEqual(["ADMIN", "MEMBER"]);
    expect(invitableRoles(user("ADMIN"))).toEqual(["MEMBER"]);
    expect(invitableRoles(user("MEMBER"))).toEqual([]);
    expect(invitableRoles(null)).toEqual([]);
  });

  it("lets only owners change roles", () => {
    expect(canChangeRoles(user("OWNER"))).toBe(true);
    expect(canChangeRoles(user("ADMIN"))).toBe(false);
  });

  it("offers removal like the server allows it", () => {
    const member = { id: "m", role: "MEMBER" as const };
    const admin = { id: "a", role: "ADMIN" as const };
    expect(canRemoveMember(user("OWNER"), admin)).toBe(true);
    expect(canRemoveMember(user("ADMIN"), member)).toBe(true);
    expect(canRemoveMember(user("ADMIN"), admin)).toBe(false);
    expect(canRemoveMember(user("MEMBER"), member)).toBe(false);
    // Nobody is offered removing themselves.
    expect(canRemoveMember(user("OWNER", "me"), { id: "me", role: "OWNER" })).toBe(false);
  });
});
