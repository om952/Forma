import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import type { FormField } from "../types/formSchema";
import {
  ABANDON_AFTER_MS,
  addDays,
  answeredSql,
  buildHeatmap,
  buildSeries,
  localDate,
  percent,
  visibilitySql,
  type HourlyCount,
} from "../utils/analytics";

/*
 * Form analytics, aggregated in Postgres so the numbers stay exact however
 * many responses a form has. Nothing here loads responses into memory.
 *
 * Two sources:
 * - Response rows: what was submitted. Daily counts, the day-by-hour heatmap,
 *   and per-field skip rates (visible but left blank).
 * - FormSession rows: every visit to the public form, including people who
 *   never submitted. The funnel (viewed, started, completed) and per-field
 *   drop-off (where people who started stopped).
 */

// ---- Queries --------------------------------------------------------------

type Input = {
  formId: string;
  orgId: string;
  schema: FormField[];
  days: number;
  timeZone: string;
  now?: Date;
};

export const computeFormAnalytics = async (input: Input) => {
  const { formId, orgId, schema, days, timeZone } = input;
  const now = input.now ?? new Date();

  const to = localDate(now, timeZone);
  const from = addDays(to, -(days - 1));
  // Rows are filtered on local time below; this bound only lets the index on
  // the timestamp do most of the work first. It is a day wider than the
  // window on each side, which no time zone offset exceeds.
  const coarseSince = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000);
  const abandonedBefore = new Date(now.getTime() - ABANDON_AFTER_MS);

  const localTime = (column: string) =>
    Prisma.sql`((${Prisma.raw(`"${column}"`)} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)`;

  const hourly = await prisma.$queryRaw<HourlyCount[]>(Prisma.sql`
    SELECT to_char(local, 'YYYY-MM-DD') AS day,
           EXTRACT(HOUR FROM local)::int AS hour,
           COUNT(*)::int AS count
    FROM (
      SELECT ${localTime("submittedAt")} AS local
      FROM "Response"
      WHERE "formId" = ${formId} AND "orgId" = ${orgId} AND "submittedAt" >= ${coarseSince}
    ) r
    WHERE local >= ${from}::date
    GROUP BY 1, 2
  `);

  const inWindow = (column: string) =>
    Prisma.sql`${Prisma.raw(`"${column}"`)} >= ${coarseSince} AND ${localTime(column)} >= ${from}::date`;

  const [funnel] = await prisma.$queryRaw<
    Array<{
      views: number;
      starts: number;
      completions: number;
      abandoned: number;
      medianSeconds: number | null;
    }>
  >(Prisma.sql`
    SELECT COUNT(*)::int AS views,
           COUNT(*) FILTER (WHERE "startedAt" IS NOT NULL)::int AS starts,
           COUNT(*) FILTER (WHERE "submittedAt" IS NOT NULL)::int AS completions,
           COUNT(*) FILTER (
             WHERE "startedAt" IS NOT NULL AND "submittedAt" IS NULL
               AND "lastActiveAt" < ${abandonedBefore}
           )::int AS abandoned,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM ("submittedAt" - "startedAt"))
           ) FILTER (WHERE "submittedAt" IS NOT NULL AND "startedAt" IS NOT NULL)
             AS "medianSeconds"
    FROM "FormSession"
    WHERE "formId" = ${formId} AND "orgId" = ${orgId} AND ${inWindow("viewedAt")}
  `);

  const reach = await prisma.$queryRaw<
    Array<{ fieldId: string; reached: number; abandonedHere: number }>
  >(Prisma.sql`
    SELECT f."fieldId",
           COUNT(*)::int AS reached,
           COUNT(*) FILTER (
             WHERE s."submittedAt" IS NULL AND s."lastActiveAt" < ${abandonedBefore}
               AND s."lastFieldId" = f."fieldId"
           )::int AS "abandonedHere"
    FROM "FormSession" s
    CROSS JOIN LATERAL unnest(s."fieldsTouched") AS f("fieldId")
    WHERE s."formId" = ${formId} AND s."orgId" = ${orgId} AND ${inWindow("viewedAt")}
    GROUP BY f."fieldId"
  `);

  // Two counts per field in a single pass: how many submissions showed the
  // field (its rules evaluated against that submission), and how many of
  // those answered it. Aliases are positional; field ids never reach the SQL
  // text, only its parameters.
  const skipCounts = schema.length
    ? (
        await prisma.$queryRaw<Array<Record<string, number>>>(Prisma.sql`
          SELECT ${Prisma.join(
            schema.flatMap((field, index) => [
              Prisma.sql`COUNT(*) FILTER (WHERE ${visibilitySql(field)})::int AS ${Prisma.raw(`"shown${index}"`)}`,
              Prisma.sql`COUNT(*) FILTER (WHERE ${visibilitySql(field)} AND ${answeredSql(field)})::int AS ${Prisma.raw(`"answered${index}"`)}`,
            ])
          )}
          FROM "Response"
          WHERE "formId" = ${formId} AND "orgId" = ${orgId} AND ${inWindow("submittedAt")}
        `)
      )[0] ?? {}
    : {};

  const reachById = new Map(reach.map((row) => [row.fieldId, row]));
  const responsesInWindow = hourly.reduce((sum, row) => sum + row.count, 0);
  const views = funnel?.views ?? 0;
  const starts = funnel?.starts ?? 0;
  const completions = funnel?.completions ?? 0;

  return {
    range: { days, timeZone, from, to },
    responses: responsesInWindow,
    funnel: {
      views,
      starts,
      completions,
      abandoned: funnel?.abandoned ?? 0,
      startRate: percent(starts, views),
      completionRate: percent(completions, starts),
      medianSecondsToComplete:
        funnel?.medianSeconds === null || funnel?.medianSeconds === undefined
          ? null
          : Math.round(Number(funnel.medianSeconds)),
    },
    fields: schema.map((field, index) => {
      const reached = reachById.get(field.id)?.reached ?? 0;
      const abandonedHere = reachById.get(field.id)?.abandonedHere ?? 0;
      const shown = skipCounts[`shown${index}`] ?? 0;
      const answered = skipCounts[`answered${index}`] ?? 0;

      return {
        fieldId: field.id,
        label: field.label,
        type: field.type,
        required: field.required,
        reached,
        abandonedHere,
        dropOffRate: percent(abandonedHere, reached),
        shown,
        answered,
        skipRate: percent(shown - answered, shown),
      };
    }),
    series: buildSeries(hourly, from, days),
    heatmap: buildHeatmap(hourly),
  };
};

export type FormAnalytics = Awaited<ReturnType<typeof computeFormAnalytics>>;
