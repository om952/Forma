import { describe, expect, it } from "vitest";

import { orderedAnswers } from "./responses";

const schema = [
  { id: "name", label: "Your name", type: "text" },
  { id: "email", label: "Work email", type: "email" },
  { id: "ok", label: "Contact me", type: "checkbox" },
];

describe("orderedAnswers", () => {
  it("lists answers in the form's order, whatever order the payload's keys are in", () => {
    const payload = { ok: "true", email: "a@x.test", name: "Ada" };
    expect(orderedAnswers(payload, schema).map((a) => a.label)).toEqual(["Your name", "Work email", "Contact me"]);
  });

  it("shows checkboxes as Yes or No", () => {
    expect(orderedAnswers({ ok: "true" }, schema)[0]?.text).toBe("Yes");
    expect(orderedAnswers({ ok: "false" }, schema)[0]?.text).toBe("No");
  });

  it("puts answers to fields no longer on the form last, under their ids", () => {
    const answers = orderedAnswers({ old_field: "x", name: "Ada" }, schema);
    expect(answers.map((a) => [a.label, a.text])).toEqual([
      ["Your name", "Ada"],
      ["old_field", "x"],
    ]);
  });

  it("still lists everything before the form itself has loaded", () => {
    expect(orderedAnswers({ name: "Ada" }).map((a) => a.label)).toEqual(["name"]);
  });
});
