import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldScope, withOrgScope } from "./orgScope";

describe("shouldScope", () => {
  it("scopes where-bearing operations on tenant models", () => {
    assert.equal(shouldScope("Form", "findMany"), true);
    assert.equal(shouldScope("Form", "findUnique"), true);
    assert.equal(shouldScope("Form", "update"), true);
    assert.equal(shouldScope("Form", "delete"), true);
    assert.equal(shouldScope("Form", "count"), true);
    assert.equal(shouldScope("Response", "findMany"), true);
    assert.equal(shouldScope("Webhook", "deleteMany"), true);
    assert.equal(shouldScope("WebhookDeadLetter", "findFirst"), true);
    assert.equal(shouldScope("User", "findMany"), true);
  });

  it("leaves creates alone — they have no where to filter", () => {
    assert.equal(shouldScope("Form", "create"), false);
    assert.equal(shouldScope("Response", "create"), false);
    assert.equal(shouldScope("Form", "createMany"), false);
  });

  it("never scopes Organization — it has no orgId column of its own", () => {
    assert.equal(shouldScope("Organization", "findUnique"), false);
    assert.equal(shouldScope("Organization", "update"), false);
  });

  it("passes through unknown models rather than guessing", () => {
    assert.equal(shouldScope(undefined, "findMany"), false);
    // Prisma emits Pascal-case model names; a case mismatch must not silently
    // disable scoping for a model we think is covered.
    assert.equal(shouldScope("form", "findMany"), false);
  });
});

describe("withOrgScope", () => {
  it("adds orgId when there is no existing where", () => {
    assert.deepEqual(withOrgScope({}, "org_A"), { where: { orgId: "org_A" } });
  });

  it("merges into an existing where", () => {
    assert.deepEqual(withOrgScope({ where: { id: "f1" } }, "org_A"), {
      where: { id: "f1", orgId: "org_A" },
    });
  });

  it("preserves sibling args such as select and orderBy", () => {
    assert.deepEqual(
      withOrgScope({ where: { id: "f1" }, select: { id: true } }, "org_A"),
      { where: { id: "f1", orgId: "org_A" }, select: { id: true } }
    );
  });

  it("does not let a caller-supplied orgId widen the tenant boundary", () => {
    assert.deepEqual(
      withOrgScope({ where: { id: "f1", orgId: "org_ATTACKER" } }, "org_A"),
      { where: { id: "f1", orgId: "org_A" } }
    );
  });

  it("does not mutate the caller's args", () => {
    const original = { where: { id: "f1" } };
    withOrgScope(original, "org_A");
    assert.deepEqual(original, { where: { id: "f1" } });
  });
});
