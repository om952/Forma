import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FormField } from "../types/formSchema";
import {
  addDays,
  answeredSql,
  buildHeatmap,
  buildSeries,
  localDate,
  percent,
  visibilitySql,
  weekdayIndex,
} from "./analytics";

const field = (overrides: Partial<FormField> = {}): FormField => ({
  id: "q1",
  type: "text",
  label: "Q1",
  required: false,
  ...overrides,
});

describe("visibilitySql", () => {
  it("is TRUE for a field without rules", () => {
    assert.equal(visibilitySql(field()).text, "TRUE");
  });

  it("ANDs each rule, negating hide rules", () => {
    const sql = visibilitySql(
      field({
        rules: [
          { id: "r1", ifFieldId: "a", operator: "equals", value: "yes", action: "show", targetFieldId: "q1" },
          { id: "r2", ifFieldId: "b", operator: "contains", value: "x", action: "hide", targetFieldId: "q1" },
        ],
      })
    );
    assert.equal(
      sql.text,
      "((coalesce(payload ->> $1::text, '') = $2::text) AND (NOT (strpos(coalesce(payload ->> $3::text, ''), $4::text) > 0)))"
    );
    assert.deepEqual(sql.values, ["a", "yes", "b", "x"]);
  });

  it("keeps field ids and rule values out of the SQL text", () => {
    const sql = visibilitySql(
      field({
        rules: [
          { id: "r1", ifFieldId: "a", operator: "not_equals", value: "'; DROP TABLE x; --", action: "show", targetFieldId: "q1" },
        ],
      })
    );
    assert.ok(!sql.text.includes("DROP"));
    assert.deepEqual(sql.values, ["a", "'; DROP TABLE x; --"]);
  });
});

describe("answeredSql", () => {
  it("counts a checkbox only when checked", () => {
    assert.match(answeredSql(field({ type: "checkbox" })).text, /= 'true'/);
  });

  it("counts other fields when not blank", () => {
    assert.match(answeredSql(field()).text, /~ '\\S'/);
  });
});

describe("calendar helpers", () => {
  it("reads the local date in a time zone", () => {
    const instant = new Date("2026-09-29T20:00:00Z");
    assert.equal(localDate(instant, "UTC"), "2026-09-29");
    assert.equal(localDate(instant, "Asia/Kolkata"), "2026-09-30");
    assert.equal(localDate(instant, "America/Los_Angeles"), "2026-09-29");
  });

  it("adds days across month and year ends", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  it("numbers weekdays from Monday", () => {
    assert.equal(weekdayIndex("2026-09-28"), 0); // Monday
    assert.equal(weekdayIndex("2026-10-04"), 6); // Sunday
  });
});

describe("buildSeries", () => {
  it("sums hours per day and fills empty days", () => {
    const series = buildSeries(
      [
        { day: "2026-09-28", hour: 9, count: 2 },
        { day: "2026-09-28", hour: 14, count: 1 },
        { day: "2026-09-30", hour: 0, count: 4 },
      ],
      "2026-09-28",
      3
    );
    assert.deepEqual(series, [
      { date: "2026-09-28", count: 3 },
      { date: "2026-09-29", count: 0 },
      { date: "2026-09-30", count: 4 },
    ]);
  });
});

describe("buildHeatmap", () => {
  it("adds counts into weekday-by-hour cells", () => {
    const heatmap = buildHeatmap([
      { day: "2026-09-28", hour: 9, count: 2 }, // Monday
      { day: "2026-10-05", hour: 9, count: 3 }, // the next Monday
      { day: "2026-10-04", hour: 23, count: 1 }, // Sunday
    ]);
    assert.equal(heatmap.cells.length, 7);
    assert.equal(heatmap.cells[0]!.length, 24);
    assert.equal(heatmap.cells[0]![9], 5);
    assert.equal(heatmap.cells[6]![23], 1);
    assert.equal(heatmap.max, 5);
  });

  it("is all zeros with no data", () => {
    const heatmap = buildHeatmap([]);
    assert.equal(heatmap.max, 0);
    assert.ok(heatmap.cells.flat().every((cell) => cell === 0));
  });
});

describe("percent", () => {
  it("rounds to one decimal and is null without a base", () => {
    assert.equal(percent(1, 3), 33.3);
    assert.equal(percent(0, 5), 0);
    assert.equal(percent(3, 0), null);
  });
});
