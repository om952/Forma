import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidEmail, normalizeEmail, passwordProblem, toSlug } from "./accountInput";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    assert.ok(isValidEmail("ada@example.com"));
    assert.ok(isValidEmail("ada.lovelace+forms@mail.example.co.uk"));
  });

  it("rejects obvious typos", () => {
    assert.ok(!isValidEmail("ada.example.com"));
    assert.ok(!isValidEmail("ada@example"));
    assert.ok(!isValidEmail("ada @example.com"));
    assert.ok(!isValidEmail(""));
  });

  it("rejects addresses over 254 characters", () => {
    assert.ok(!isValidEmail(`${"a".repeat(250)}@x.io`));
  });
});

describe("passwordProblem", () => {
  it("accepts passwords from 8 to 72 bytes", () => {
    assert.equal(passwordProblem("12345678"), null);
    assert.equal(passwordProblem("x".repeat(72)), null);
  });

  it("explains what is wrong", () => {
    assert.match(passwordProblem(undefined) ?? "", /required/);
    assert.match(passwordProblem("") ?? "", /required/);
    assert.match(passwordProblem("short") ?? "", /at least 8/);
    assert.match(passwordProblem("x".repeat(73)) ?? "", /at most 72/);
  });

  it("measures the bcrypt limit in bytes, not characters", () => {
    // 25 three-byte characters: 25 characters, 75 bytes.
    assert.match(passwordProblem("€".repeat(25)) ?? "", /at most 72/);
  });
});

describe("toSlug", () => {
  it("turns an organization name into a URL-safe slug", () => {
    assert.equal(toSlug("  Acme Inc. "), "acme-inc");
    assert.equal(toSlug("R&D / Labs"), "r-d-labs");
    assert.equal(toSlug("!!!"), "");
  });
});
