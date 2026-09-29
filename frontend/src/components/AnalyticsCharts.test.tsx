import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DailyColumns, DropOffTable, Heatmap, formatDuration, type FieldAnalytics } from "./AnalyticsCharts";

afterEach(cleanup);

const field = (overrides: Partial<FieldAnalytics>): FieldAnalytics => ({
  fieldId: "f",
  label: "Field",
  type: "text",
  reached: 0,
  abandonedHere: 0,
  dropOffRate: null,
  shown: 0,
  answered: 0,
  skipRate: null,
  ...overrides,
});

describe("formatDuration", () => {
  it("reads like a person would say it", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(200)).toBe("3m 20s");
    expect(formatDuration(3900)).toBe("1h 5m");
  });
});

describe("DropOffTable", () => {
  it("flags the field most people leave at, and shows no rate where nobody arrived", () => {
    render(
      <DropOffTable
        fields={[
          field({ fieldId: "name", label: "Name", reached: 10, abandonedHere: 1, dropOffRate: 10 }),
          field({ fieldId: "phone", label: "Phone", reached: 9, abandonedHere: 4, dropOffRate: 44.4 }),
          field({ fieldId: "notes", label: "Notes", reached: 0 }),
        ]}
      />
    );

    const rows = screen.getAllByTestId("dropoff-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("Most people leave here")).toBeTruthy();
    expect(within(rows[0]!).queryByText("Most people leave here")).toBeNull();
    expect(within(rows[1]!).getByText("44.4%")).toBeTruthy();
    expect(within(rows[2]!).getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("Heatmap", () => {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  cells[1]![14] = 3;
  cells[4]![9] = 1;

  it("draws a cell for every weekday and hour, and a table with the same counts", () => {
    const { container } = render(
      <Heatmap weekdays={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} cells={cells} max={3} timeZone="UTC" />
    );

    expect(container.querySelectorAll("[data-cell]")).toHaveLength(168);
    const table = container.querySelector("details table")!;
    const total = Array.from(table.querySelectorAll<HTMLTableCellElement>("tbody td"))
      .filter((cell) => cell.cellIndex > 0)
      .reduce((sum, cell) => sum + Number(cell.textContent), 0);
    expect(total).toBe(4);
    expect(screen.getByText(/Busiest hour: 3 responses/)).toBeTruthy();
  });

  it("reads an hour aloud on keyboard focus, value first", () => {
    render(<Heatmap weekdays={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} cells={cells} max={3} timeZone="UTC" />);
    const chart = screen.getByRole("img", { name: /weekday and hour/ });

    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "ArrowDown" });
    for (let i = 0; i < 14; i++) fireEvent.keyDown(chart, { key: "ArrowRight" });

    const tip = screen.getByRole("status");
    expect(tip.textContent).toContain("3 responses");
    expect(tip.textContent).toContain("Tue, 14:00–15:00");
  });
});

describe("DailyColumns", () => {
  it("labels only the busiest day and never shows half a response on the axis", () => {
    const series = [
      { date: "2026-09-28", count: 0 },
      { date: "2026-09-29", count: 1 },
      { date: "2026-09-30", count: 0 },
    ];
    const { container } = render(<DailyColumns series={series} />);

    expect(screen.queryByText("0.5")).toBeNull();
    const labels = Array.from(container.querySelectorAll("span")).filter((span) => span.textContent === "1");
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});
