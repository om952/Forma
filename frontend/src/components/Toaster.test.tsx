import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toast, useToastStore } from "../lib/toast";
import Toaster from "./Toaster";

describe("Toaster", () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }));
  afterEach(cleanup);

  it("announces successes politely and errors assertively", () => {
    render(<Toaster />);
    act(() => {
      toast.success("Webhook added.");
      toast.error("Couldn't reach Forma.");
    });

    expect(screen.getByRole("status").textContent).toContain("Webhook added.");
    expect(screen.getByRole("alert").textContent).toContain("Couldn't reach Forma.");
  });

  it("closes a toast from its dismiss button", async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    act(() => {
      toast.success("Form deleted.");
    });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Form deleted.")).toBeNull();
  });
});
