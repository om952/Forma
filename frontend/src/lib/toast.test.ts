import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOAST_DURATION_MS, toast, useToastStore } from "./toast";

describe("toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => vi.useRealTimers());

  const messages = () => useToastStore.getState().toasts.map((t) => `${t.kind}:${t.message}`);

  it("shows a toast and removes it once its time is up", () => {
    toast.success("Form deleted.");
    expect(messages()).toEqual(["success:Form deleted."]);

    vi.advanceTimersByTime(TOAST_DURATION_MS.success - 1);
    expect(messages()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(messages()).toEqual([]);
  });

  it("keeps errors up longer than successes", () => {
    toast.success("Saved.");
    toast.error("Couldn't reach Forma.");

    vi.advanceTimersByTime(TOAST_DURATION_MS.success);
    expect(messages()).toEqual(["error:Couldn't reach Forma."]);
  });

  it("can be dismissed early", () => {
    const id = toast.error("Failed");
    useToastStore.getState().dismiss(id);
    expect(messages()).toEqual([]);
  });

  it("shows a repeated message once, and at most four at a time", () => {
    toast.error("Same");
    toast.error("Same");
    expect(messages()).toEqual(["error:Same"]);

    for (const n of [1, 2, 3, 4]) toast.success(`Toast ${n}`);
    expect(messages()).toEqual(["success:Toast 1", "success:Toast 2", "success:Toast 3", "success:Toast 4"]);
  });
});
