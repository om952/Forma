import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { expiresIn, generateToken, hashToken, isWellFormedToken } from "./tokens";

describe("generateToken", () => {
  it("produces 43-character URL-safe tokens", () => {
    const token = generateToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(isWellFormedToken(token));
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    assert.equal(tokens.size, 1000);
  });
});

describe("hashToken", () => {
  it("is deterministic, so a stored hash can be looked up", () => {
    const token = generateToken();
    assert.equal(hashToken(token), hashToken(token));
  });

  it("does not contain the token", () => {
    const token = generateToken();
    const hash = hashToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes(token));
  });
});

describe("isWellFormedToken", () => {
  it("rejects anything generateToken could not have produced", () => {
    assert.ok(!isWellFormedToken(undefined));
    assert.ok(!isWellFormedToken(42));
    assert.ok(!isWellFormedToken(""));
    assert.ok(!isWellFormedToken("short"));
    assert.ok(!isWellFormedToken(`${"a".repeat(42)}=`));
    assert.ok(!isWellFormedToken("a".repeat(44)));
    assert.ok(!isWellFormedToken(`${"a".repeat(42)}/`));
  });
});

describe("expiresIn", () => {
  it("adds the TTL to the given time", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(expiresIn(60_000, now).toISOString(), "2026-01-01T00:01:00.000Z");
  });
});
