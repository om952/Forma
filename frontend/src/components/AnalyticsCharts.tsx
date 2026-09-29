"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

/*
 * Charts for the analytics page. One mark color (the app's indigo) for single
 * series, and a one-hue light-to-dark ramp for the heatmap, both checked with
 * the data-viz palette validator against the white card surface. Every chart
 * has a hover and keyboard tooltip and a table view, so no value depends on
 * color or hovering alone.
 */

export const MARK = "#4f46e5";
const GRID = "#e2e8f0";
const EMPTY_CELL = "#f1f5f9";
/** Fewer to more; the lightest step still clears 2:1 on white. */
export const HEAT_RAMP = ["#a1affb", "#818cf8", "#6366f1", "#4f46e5", "#3730a3"] as const;

// ---- Formatting -----------------------------------------------------------

export const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? "compact" : "standard" }).format(value);

export const formatDay = (date: string, withWeekday = false) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  });

export const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

const plural = (count: number, word: string) => `${formatNumber(count)} ${word}${count === 1 ? "" : "s"}`;

/** A round axis maximum (1, 2, 5 × 10^n) at or above `value`. */
const niceMax = (value: number) => {
  if (value <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
};

// ---- Pieces ---------------------------------------------------------------

export function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="kpi">
      <p className="text-xs font-medium text-slate-500" data-testid="kpi-label">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900" data-testid="kpi-value">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

type Tip = { left: number; top: number; value: string; label: string } | null;

/** Value first, label second: the reader already knows what they pointed at. */
function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left: tip.left, top: tip.top - 8 }}
    >
      <p className="font-semibold text-slate-900">{tip.value}</p>
      <p className="text-slate-500">{tip.label}</p>
    </div>
  );
}

function TableView({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-indigo-600 hover:text-indigo-500">
        {summary}
      </summary>
      <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200">{children}</div>
    </details>
  );
}

/** Where a mark sits inside its chart container, for placing the tooltip. */
const anchorOf = (mark: Element, container: Element) => {
  const m = mark.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  return { left: m.left - c.left + m.width / 2, top: m.top - c.top };
};

// ---- Submissions per day ----------------------------------------------------

export function DailyColumns({ series }: { series: Array<{ date: string; count: number }> }) {
  const [tip, setTip] = useState<Tip>(null);
  const [active, setActive] = useState<number | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const max = niceMax(Math.max(0, ...series.map((point) => point.count)));
  // Counts are whole numbers: no midline at 0.5 or 2.5.
  const gridlines = Number.isInteger(max / 2) ? [0, 0.5, 1] : [0, 1];
  const peak = series.reduce((best, point, index) => (point.count > (series[best]?.count ?? -1) ? index : best), 0);
  const hasData = series.some((point) => point.count > 0);
  const ticks = [series[0], series[Math.floor(series.length / 2)], series[series.length - 1]];

  const show = (index: number) => {
    const point = series[index];
    const mark = container?.querySelector(`[data-index="${index}"]`);
    if (!point || !mark || !container) return;
    setActive(index);
    setTip({ ...anchorOf(mark, container), value: plural(point.count, "response"), label: formatDay(point.date, true) });
  };

  const hide = () => {
    setActive(null);
    setTip(null);
  };

  // Arrow keys walk the days, so the chart is one tab stop, not ninety.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const from = active ?? (event.key === "ArrowRight" ? -1 : series.length);
    show(Math.min(series.length - 1, Math.max(0, from + (event.key === "ArrowRight" ? 1 : -1))));
  };

  return (
    <div>
      <div
        ref={setContainer}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        tabIndex={0}
        role="img"
        aria-label={`Responses per day. Use the left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onFocus={() => show(active ?? series.length - 1)}
        onBlur={hide}
        onPointerLeave={hide}
      >
        <div className="flex">
          <div className="relative h-40 w-8 pr-2 text-right text-[10px] tabular-nums text-slate-400">
            {gridlines.map((fraction) => (
              <span
                key={fraction}
                className="absolute right-2 translate-y-1/2"
                style={{ bottom: `${fraction * 100}%` }}
              >
                {formatNumber(max * fraction)}
              </span>
            ))}
          </div>
          <div className="relative h-40 flex-1">
            {gridlines.map((fraction) => (
              <div
                key={fraction}
                className="absolute inset-x-0"
                style={{ bottom: `${fraction * 100}%`, borderTop: `1px solid ${GRID}` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end justify-between gap-[2px]">
              {series.map((point, index) => (
                <div
                  key={point.date}
                  data-index={index}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onPointerEnter={() => show(index)}
                >
                  {point.count > 0 ? (
                    <div
                      className="w-full max-w-[24px] rounded-t-[4px] transition-opacity"
                      style={{
                        height: `${(point.count / max) * 100}%`,
                        background: MARK,
                        opacity: active === null || active === index ? 1 : 0.55,
                      }}
                    />
                  ) : null}
                  {index === peak && point.count > 0 ? (
                    <span
                      className="absolute text-[10px] font-semibold text-slate-700"
                      style={{ bottom: `calc(${(point.count / max) * 100}% + 2px)` }}
                    >
                      {formatNumber(point.count)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="ml-8 mt-2 flex justify-between text-[10px] text-slate-400">
          {ticks.map((point, index) => (
            <span key={`${point?.date}-${index}`}>{point ? formatDay(point.date) : ""}</span>
          ))}
        </div>
        <Tooltip tip={tip} />
      </div>
      {!hasData ? <p className="mt-2 text-xs text-slate-500">No responses in this period.</p> : null}
      <TableView summary="Show as table">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 text-right font-medium">Responses</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.date} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-700">{formatDay(point.date, true)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{point.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </div>
  );
}

// ---- Weekday by hour heatmap -------------------------------------------------

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Empty, or one of five steps by share of the busiest hour. */
const cellColor = (count: number, max: number) => {
  if (count === 0 || max === 0) return EMPTY_CELL;
  const step = Math.min(HEAT_RAMP.length - 1, Math.ceil((count / max) * HEAT_RAMP.length) - 1);
  return HEAT_RAMP[Math.max(0, step)];
};

export function Heatmap({
  weekdays,
  cells,
  max,
  timeZone,
}: {
  weekdays: readonly string[];
  cells: number[][];
  max: number;
  timeZone: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [active, setActive] = useState<[number, number] | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const show = (day: number, hour: number) => {
    const mark = container?.querySelector(`[data-cell="${day}-${hour}"]`);
    if (!mark || !container) return;
    setActive([day, hour]);
    setTip({
      ...anchorOf(mark, container),
      value: plural(cells[day]?.[hour] ?? 0, "response"),
      label: `${weekdays[day]}, ${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`,
    });
  };

  const hide = () => {
    setActive(null);
    setTip(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const [day, hour] = active ?? [0, 0];
    show((day + move[0] + 7) % 7, (hour + move[1] + 24) % 24);
  };

  return (
    <div>
      <div
        ref={setContainer}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        tabIndex={0}
        role="img"
        aria-label={`Responses by weekday and hour, in ${timeZone}. Use the arrow keys to read each hour.`}
        onKeyDown={onKeyDown}
        onFocus={() => show(active?.[0] ?? 0, active?.[1] ?? 0)}
        onBlur={hide}
        onPointerLeave={hide}
      >
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}>
          {cells.map((row, day) => (
            <div key={weekdays[day]} className="contents">
              <span className="pr-2 text-right text-[10px] leading-none text-slate-500 self-center">
                {weekdays[day]}
              </span>
              {row.map((count, hour) => {
                const isActive = active?.[0] === day && active?.[1] === hour;
                return (
                  <div
                    key={hour}
                    data-cell={`${day}-${hour}`}
                    className="aspect-square rounded-[2px]"
                    style={{
                      background: cellColor(count, max),
                      outline: isActive ? "2px solid #0f172a" : undefined,
                      outlineOffset: -1,
                    }}
                    onPointerEnter={() => show(day, hour)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div
          className="mt-2 grid gap-[2px] text-[10px] text-slate-400"
          style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}
        >
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center">
              {HOUR_TICKS.includes(hour) ? String(hour).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
        <Tooltip tip={tip} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[2px]" style={{ background: EMPTY_CELL }} /> None
        </span>
        <span className="ml-2">Fewer</span>
        {HEAT_RAMP.map((color) => (
          <span key={color} className="h-3 w-5 rounded-[2px]" style={{ background: color }} />
        ))}
        <span>More</span>
        <span className="ml-auto">
          Busiest hour: {plural(max, "response")} · times in {timeZone}
        </span>
      </div>

      <TableView summary="Show as table">
        <table className="w-full text-center text-[11px] tabular-nums">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Day</th>
              {Array.from({ length: 24 }, (_, hour) => (
                <th key={hour} className="px-1 py-2 font-medium">
                  {String(hour).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((row, day) => (
              <tr key={weekdays[day]} className="border-t border-slate-100">
                <td className="px-2 py-1.5 text-left text-slate-700">{weekdays[day]}</td>
                {row.map((count, hour) => (
                  <td key={hour} className={count ? "px-1 py-1.5 text-slate-900" : "px-1 py-1.5 text-slate-300"}>
                    {count}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </div>
  );
}

// ---- Per-field drop-off -----------------------------------------------------

export type FieldAnalytics = {
  fieldId: string;
  label: string;
  type: string;
  reached: number;
  abandonedHere: number;
  dropOffRate: number | null;
  shown: number;
  answered: number;
  skipRate: number | null;
};

const percentText = (value: number | null) => (value === null ? "—" : `${value}%`);

/**
 * Fields in form order. The bar is the share of people who reached the field
 * and left the form there; the same numbers sit beside it, so this doubles as
 * the table view.
 */
export function DropOffTable({ fields }: { fields: FieldAnalytics[] }) {
  const worst = fields.reduce<FieldAnalytics | null>(
    (best, field) => ((field.dropOffRate ?? 0) > (best?.dropOffRate ?? 0) ? field : best),
    null
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="pb-3 font-medium">Field</th>
            <th className="pb-3 text-right font-medium">Reached</th>
            <th className="pb-3 text-right font-medium">Left here</th>
            <th className="w-[36%] pb-3 pl-6 font-medium">Drop-off</th>
            <th className="pb-3 text-right font-medium">Skipped</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.fieldId} className="border-t border-slate-100" data-testid="dropoff-row">
              <td className="py-3 pr-4">
                <p className="font-medium text-slate-900">{field.label}</p>
                <p className="text-xs text-slate-400">
                  {field.type}
                  {worst?.fieldId === field.fieldId ? (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                      Most people leave here
                    </span>
                  ) : null}
                </p>
              </td>
              <td className="py-3 text-right tabular-nums text-slate-700">{formatNumber(field.reached)}</td>
              <td className="py-3 text-right tabular-nums text-slate-700">{formatNumber(field.abandonedHere)}</td>
              <td className="py-3 pl-6">
                <div className="flex items-center gap-2" title={`${field.abandonedHere} of ${field.reached} who reached ${field.label} left the form there`}>
                  <div className="h-3 flex-1">
                    {field.dropOffRate ? (
                      <div
                        className="h-3 rounded-r-[4px]"
                        style={{ width: `${field.dropOffRate}%`, background: MARK }}
                      />
                    ) : null}
                  </div>
                  <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-900">
                    {percentText(field.dropOffRate)}
                  </span>
                </div>
              </td>
              <td className="py-3 text-right text-xs tabular-nums text-slate-700">
                {percentText(field.skipRate)}
                {field.shown ? (
                  <span className="block text-slate-400">
                    {field.shown - field.answered} of {field.shown}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
