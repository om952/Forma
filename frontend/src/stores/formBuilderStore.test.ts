import { beforeEach, describe, expect, it } from "vitest";

import { isFieldVisible, useFormBuilderStore, type FormField } from "./formBuilderStore";

const store = () => useFormBuilderStore.getState();

describe("form builder store", () => {
  beforeEach(() => store().clear());

  it("adds a question with its type's default label, and options for a select", () => {
    store().addField("text");
    store().addField("select");

    const [text, select] = store().schema;
    expect(text).toMatchObject({ type: "text", label: "Text field", required: false });
    expect(text?.options).toBeUndefined();
    expect(select).toMatchObject({ type: "select", label: "Select field", options: ["Option 1", "Option 2"] });
    expect(text?.id).not.toEqual(select?.id);
  });

  it("drops every rule that depends on or targets a removed question", () => {
    store().addField("select");
    store().addField("text");
    store().addField("text");
    const [source, target, other] = store().schema.map((field) => field.id) as [string, string, string];

    store().addRule({ ifFieldId: source, operator: "equals", value: "Option 1", action: "show", targetFieldId: target });
    store().addRule({ ifFieldId: other, operator: "equals", value: "x", action: "hide", targetFieldId: source });
    store().addRule({ ifFieldId: target, operator: "contains", value: "y", action: "show", targetFieldId: other });

    store().removeField(source);

    expect(store().schema.map((field) => field.id)).toEqual([target, other]);
    expect(store().rules).toHaveLength(1);
    expect(store().rules[0]).toMatchObject({ ifFieldId: target, targetFieldId: other });
  });

  it("loads a saved form by splitting the rules back off the questions", () => {
    const saved: FormField[] = [
      { id: "a", type: "select", label: "A", required: true, options: ["Yes", "No"] },
      {
        id: "b",
        type: "text",
        label: "B",
        required: false,
        rules: [{ id: "r1", ifFieldId: "a", operator: "equals", value: "No", action: "show", targetFieldId: "b" }],
      },
    ];

    store().loadForm({ title: "Survey", thankYouMessage: "Thanks", schema: saved });

    expect(store().title).toBe("Survey");
    expect(store().schema.every((field) => field.rules === undefined)).toBe(true);
    expect(store().rules).toEqual(saved[1]?.rules);
  });
});

describe("isFieldVisible", () => {
  const field = (rules: FormField["rules"]): FormField => ({ id: "t", type: "text", label: "T", required: false, rules });

  it("shows a question with no rules", () => {
    expect(isFieldVisible(field(undefined), {})).toBe(true);
  });

  it("shows a question only when its show rule matches", () => {
    const shown = field([{ id: "r", ifFieldId: "a", operator: "equals", value: "No", action: "show", targetFieldId: "t" }]);
    expect(isFieldVisible(shown, { a: "No" })).toBe(true);
    expect(isFieldVisible(shown, { a: "Yes" })).toBe(false);
    expect(isFieldVisible(shown, {})).toBe(false);
  });

  it("hides a question when its hide rule matches", () => {
    const hidden = field([{ id: "r", ifFieldId: "a", operator: "contains", value: "skip", action: "hide", targetFieldId: "t" }]);
    expect(isFieldVisible(hidden, { a: "please skip this" })).toBe(false);
    expect(isFieldVisible(hidden, { a: "keep" })).toBe(true);
  });

  it("needs every rule to agree", () => {
    const both = field([
      { id: "r1", ifFieldId: "a", operator: "not_equals", value: "", action: "show", targetFieldId: "t" },
      { id: "r2", ifFieldId: "b", operator: "not_contains", value: "no", action: "show", targetFieldId: "t" },
    ]);
    expect(isFieldVisible(both, { a: "x", b: "yes" })).toBe(true);
    expect(isFieldVisible(both, { a: "x", b: "no thanks" })).toBe(false);
    expect(isFieldVisible(both, { a: "", b: "yes" })).toBe(false);
  });
});
