import { Prisma } from "@prisma/client";

import type { FormField, FormRule } from "../types/formSchema";

/*
 * The database-free parts of form analytics: visibility rules compiled to SQL,
 * calendar arithmetic, and shaping query rows for the response. Kept apart
 * from the queries in services/formAnalytics.ts so they can be tested without
 * a database.
 */

/** A visit with no activity for this long, and no submission, was abandoned. */
export const ABANDON_AFTER_MS = 30 * 60 * 1000;

// ---- Visibility rules as SQL ----------------------------------------------

/** An answer as stored on the Response row; a missing one counts as "". */
const answerSql = (fieldId: string) =>
  Prisma.sql`coalesce(payload ->> ${fieldId}::text, '')`;

const ruleConditionSql = (rule: FormRule): Prisma.Sql => {
  const value = answerSql(rule.ifFieldId);

  switch (rule.operator) {
    case "equals":
      return Prisma.sql`(${value} = ${rule.value}::text)`;
    case "not_equals":
      return Prisma.sql`(${value} <> ${rule.value}::text)`;
    case "contains":
      return Prisma.sql`(strpos(${value}, ${rule.value}::text) > 0)`;
    case "not_contains":
      return Prisma.sql`(strpos(${value}, ${rule.value}::text) = 0)`;
    default:
      return Prisma.sql`FALSE`;
  }
};

/**
 * The SQL twin of `isFieldVisible` in types/formSchema.ts, evaluated against a
 * Response's payload. The two must stay in step.
 */
export const visibilitySql = (field: FormField): Prisma.Sql => {
  if (!field.rules?.length) return Prisma.sql`TRUE`;

  return Prisma.join(
    field.rules.map((rule) =>
      rule.action === "show"
        ? ruleConditionSql(rule)
        : Prisma.sql`(NOT ${ruleConditionSql(rule)})`
    ),
    " AND ",
    "(",
    ")"
  );
};

/** Answered means checked, for a checkbox, and not blank for anything else. */
export const answeredSql = (field: FormField): Prisma.Sql =>
  field.type === "checkbox"
    ? Prisma.sql`(${answerSql(field.id)} = 'true')`
    : Prisma.sql`(${answerSql(field.id)} ~ '\\S')`;

// ---- Calendar helpers -----------------------------------------------------

/** The calendar date ("2026-09-29") that `date` falls on in `timeZone`. */
export const localDate = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export const addDays = (day: string, amount: number): string => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
};

/** Monday = 0 … Sunday = 6, for a calendar date. */
export const weekdayIndex = (day: string): number => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
};

export type HourlyCount = { day: string; hour: number; count: number };

/** Submissions per day, oldest first, with empty days filled in. */
export const buildSeries = (rows: HourlyCount[], from: string, days: number) => {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.day, (totals.get(row.day) ?? 0) + row.count);

  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(from, offset);
    return { date, count: totals.get(date) ?? 0 };
  });
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Submissions by weekday (rows, Monday first) and hour of day (columns). */
export const buildHeatmap = (rows: HourlyCount[]) => {
  const cells = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
  for (const row of rows) {
    cells[weekdayIndex(row.day)]![row.hour]! += row.count;
  }
  return { weekdays: WEEKDAYS, cells, max: Math.max(0, ...cells.flat()) };
};

/** A percentage with one decimal place, or null when there is no base. */
export const percent = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
