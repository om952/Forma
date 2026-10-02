import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { retentionCutoff } from "./retention";

describe("retentionCutoff", () => {
  it("subtracts the given number of days from now", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    assert.equal(retentionCutoff(180, now).toISOString(), "2026-04-03T00:00:00.000Z");
  });

  it("crosses month and year boundaries correctly", () => {
    const now = new Date("2027-01-05T12:00:00.000Z");
    assert.equal(retentionCutoff(10, now).toISOString(), "2026-12-26T12:00:00.000Z");
  });

  it("defaults to the current time when none is given", () => {
    const before = Date.now();
    const cutoff = retentionCutoff(0);
    const after = Date.now();
    assert.ok(cutoff.getTime() >= before && cutoff.getTime() <= after);
  });
});
