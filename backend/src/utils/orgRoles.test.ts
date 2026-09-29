import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkInvite,
  checkRemoval,
  checkRoleChange,
  invitableRoles,
  isOrgRole,
} from "./orgRoles";

const owner = { id: "u-owner", role: "OWNER" as const };
const otherOwner = { id: "u-owner-2", role: "OWNER" as const };
const admin = { id: "u-admin", role: "ADMIN" as const };
const otherAdmin = { id: "u-admin-2", role: "ADMIN" as const };
const member = { id: "u-member", role: "MEMBER" as const };

describe("isOrgRole", () => {
  it("accepts exactly the three roles", () => {
    assert.ok(isOrgRole("OWNER"));
    assert.ok(isOrgRole("ADMIN"));
    assert.ok(isOrgRole("MEMBER"));
    assert.ok(!isOrgRole("owner"));
    assert.ok(!isOrgRole("SUPERADMIN"));
    assert.ok(!isOrgRole(undefined));
  });
});

describe("checkInvite", () => {
  it("lets an owner invite admins and members", () => {
    assert.deepEqual(invitableRoles("OWNER"), ["ADMIN", "MEMBER"]);
    assert.ok(checkInvite("OWNER", "ADMIN").ok);
    assert.ok(checkInvite("OWNER", "MEMBER").ok);
  });

  it("never grants ownership by invite", () => {
    assert.deepEqual(checkInvite("OWNER", "OWNER"), {
      ok: false,
      status: 403,
      message:
        "Invite them as an admin or member, then make them an owner from the member list.",
    });
  });

  it("lets an admin invite members only", () => {
    assert.ok(checkInvite("ADMIN", "MEMBER").ok);
    assert.equal(checkInvite("ADMIN", "ADMIN").ok, false);
    assert.equal(checkInvite("ADMIN", "OWNER").ok, false);
  });

  it("does not let a member invite anyone", () => {
    for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
      const decision = checkInvite("MEMBER", role);
      assert.equal(decision.ok, false);
      assert.equal(!decision.ok && decision.status, 403);
    }
  });
});

describe("checkRoleChange", () => {
  it("lets an owner promote and demote others", () => {
    assert.ok(checkRoleChange({ actor: owner, target: member, newRole: "ADMIN", ownerCount: 1 }).ok);
    assert.ok(checkRoleChange({ actor: owner, target: admin, newRole: "OWNER", ownerCount: 1 }).ok);
    assert.ok(checkRoleChange({ actor: owner, target: otherOwner, newRole: "MEMBER", ownerCount: 2 }).ok);
  });

  it("refuses to demote the last owner, including an owner demoting themselves", () => {
    const decision = checkRoleChange({ actor: owner, target: owner, newRole: "ADMIN", ownerCount: 1 });
    assert.equal(decision.ok, false);
    assert.equal(!decision.ok && decision.status, 409);
  });

  it("lets an owner step down while another owner remains", () => {
    assert.ok(checkRoleChange({ actor: owner, target: owner, newRole: "ADMIN", ownerCount: 2 }).ok);
  });

  it("does not let admins or members change roles", () => {
    for (const actor of [admin, member]) {
      const decision = checkRoleChange({ actor, target: member, newRole: "ADMIN", ownerCount: 1 });
      assert.equal(decision.ok, false);
      assert.equal(!decision.ok && decision.status, 403);
    }
  });

  it("does not let an admin promote themselves", () => {
    assert.equal(
      checkRoleChange({ actor: admin, target: admin, newRole: "OWNER", ownerCount: 1 }).ok,
      false
    );
  });
});

describe("checkRemoval", () => {
  it("lets an owner remove anyone else", () => {
    assert.ok(checkRemoval({ actor: owner, target: member, ownerCount: 1 }).ok);
    assert.ok(checkRemoval({ actor: owner, target: admin, ownerCount: 1 }).ok);
    assert.ok(checkRemoval({ actor: owner, target: otherOwner, ownerCount: 2 }).ok);
  });

  it("never removes the last owner", () => {
    const decision = checkRemoval({ actor: owner, target: otherOwner, ownerCount: 1 });
    assert.equal(decision.ok, false);
    assert.equal(!decision.ok && decision.status, 409);
  });

  it("does not let anyone remove themselves", () => {
    for (const actor of [owner, admin, member]) {
      const decision = checkRemoval({ actor, target: actor, ownerCount: 2 });
      assert.equal(decision.ok, false);
      assert.equal(!decision.ok && decision.status, 400);
    }
  });

  it("lets an admin remove members but not admins or owners", () => {
    assert.ok(checkRemoval({ actor: admin, target: member, ownerCount: 1 }).ok);
    assert.equal(checkRemoval({ actor: admin, target: otherAdmin, ownerCount: 1 }).ok, false);
    assert.equal(checkRemoval({ actor: admin, target: owner, ownerCount: 1 }).ok, false);
  });

  it("does not let a member remove anyone", () => {
    const decision = checkRemoval({ actor: member, target: { id: "u-x", role: "MEMBER" }, ownerCount: 1 });
    assert.equal(decision.ok, false);
    assert.equal(!decision.ok && decision.status, 403);
  });
});
