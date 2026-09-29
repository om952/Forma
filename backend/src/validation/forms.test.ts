import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFormBody, formSchemaSchema, submissionBody, updateFormBody } from "./forms";

const text = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "text",
  label: `Field ${id}`,
  required: false,
  ...extra,
});

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: "r1",
  ifFieldId: "a",
  operator: "equals",
  value: "yes",
  action: "show",
  targetFieldId: "b",
  ...overrides,
});

const issuesOf = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
  (result.error?.issues ?? []).map((issue) => `${issue.path.join(".")}: ${issue.message}`);

describe("formSchemaSchema", () => {
  it("accepts a well-formed schema, including builder-style UUID ids", () => {
    const result = formSchemaSchema.safeParse([
      text("4f0c1d9e-2b7a-4c3e-9a51-0d6f2e8b7c11"),
      { id: "field_1727600000000_ab12", type: "select", label: "Pick", required: true, options: ["A", "B"] },
      text("b", { rules: [rule({ ifFieldId: "4f0c1d9e-2b7a-4c3e-9a51-0d6f2e8b7c11" })] }),
    ]);
    assert.ok(result.success, issuesOf(result).join("; "));
  });

  it("rejects duplicate field ids", () => {
    assert.deepEqual(issuesOf(formSchemaSchema.safeParse([text("a"), text("a")])), [
      "1.id: is used by another field",
    ]);
  });

  it("requires options on a select field", () => {
    assert.deepEqual(
      issuesOf(formSchemaSchema.safeParse([{ id: "s", type: "select", label: "S", required: false }])),
      ["0.options: a select field needs at least one option"]
    );
  });

  it("rejects rules that point at missing fields, at their own field, or sit on another field", () => {
    assert.deepEqual(issuesOf(formSchemaSchema.safeParse([text("b", { rules: [rule({ ifFieldId: "ghost" })] })])), [
      "0.rules.0.ifFieldId: refers to a field that is not in this form",
    ]);
    assert.deepEqual(issuesOf(formSchemaSchema.safeParse([text("b", { rules: [rule({ ifFieldId: "b" })] })])), [
      "0.rules.0.ifFieldId: a rule cannot depend on its own field",
    ]);
    assert.deepEqual(
      issuesOf(formSchemaSchema.safeParse([text("a"), text("b", { rules: [rule({ targetFieldId: "a" })] })])),
      ["1.rules.0.targetFieldId: must be the field the rule belongs to"]
    );
  });

  it("rejects unknown field types, blank labels and unsafe ids", () => {
    assert.equal(formSchemaSchema.safeParse([text("a", { type: "html" })]).success, false);
    assert.equal(formSchemaSchema.safeParse([text("a", { label: "   " })]).success, false);
    assert.equal(formSchemaSchema.safeParse([text("a b")]).success, false);
    assert.equal(formSchemaSchema.safeParse([text("a'--")]).success, false);
  });

  it("caps a form at 100 fields", () => {
    const fields = Array.from({ length: 101 }, (_, i) => text(`f${i}`));
    assert.equal(formSchemaSchema.safeParse(fields).success, false);
  });
});

describe("createFormBody", () => {
  it("trims the title and turns a blank thank-you message into null", () => {
    const result = createFormBody.parse({ title: "  Feedback  ", schema: [], thankYouMessage: "   " });
    assert.equal(result.title, "Feedback");
    assert.equal(result.thankYouMessage, null);
  });

  it("requires a title", () => {
    assert.equal(createFormBody.safeParse({ title: "", schema: [] }).success, false);
  });
});

describe("updateFormBody", () => {
  it("needs at least one change", () => {
    assert.equal(updateFormBody.safeParse({}).success, false);
    assert.ok(updateFormBody.safeParse({ isActive: false }).success);
  });

  it("rejects a non-boolean isActive rather than coercing it", () => {
    assert.equal(updateFormBody.safeParse({ isActive: "false" }).success, false);
  });
});

describe("submissionBody", () => {
  it("accepts string answers keyed by field id", () => {
    assert.ok(submissionBody.safeParse({ q1: "Ada", agree: "true" }).success);
  });

  it("rejects non-string answers, which used to crash validation", () => {
    assert.equal(submissionBody.safeParse({ q1: 42 }).success, false);
    assert.equal(submissionBody.safeParse({ q1: { nested: true } }).success, false);
  });

  it("rejects oversized answers", () => {
    assert.equal(submissionBody.safeParse({ q1: "x".repeat(10_001) }).success, false);
  });
});
