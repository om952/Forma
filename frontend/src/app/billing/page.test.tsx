import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BillingPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/billing",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const owner = { id: "u1", email: "ada@x.test", role: "OWNER", orgId: "o1" };

const freePlan = {
  tier: "FREE",
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasSubscription: false,
  billingMode: "live",
};

/** Answers the header's /api/auth/me, and /api/payments/status with `status`. */
const stubApi = (status: () => Response) => {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith("/api/auth/me") ? reply(200, { user: owner }) : status()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("billing page", () => {
  beforeEach(() => {
    localStorage.setItem("forma_token", "tok");
    localStorage.setItem("forma_user", JSON.stringify(owner));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("offers no plan when it can't tell which one the organisation is on, and retries", async () => {
    let fail = true;
    stubApi(() => (fail ? reply(500, { message: "Internal server error" }) : reply(200, freePlan)));
    const user = userEvent.setup();

    render(<BillingPage />);

    expect(await screen.findByText("Couldn't load this page")).toBeTruthy();
    // A Premium organisation must never be offered "Subscribe" because of a failed request.
    expect(screen.queryByTestId("billing-subscribe")).toBeNull();

    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("billing-subscribe")).toBeTruthy();
  });

  it("mentions the test card only when checkout uses Razorpay test keys", async () => {
    stubApi(() => reply(200, freePlan));
    render(<BillingPage />);
    await screen.findByTestId("billing-subscribe");
    expect(screen.queryByText(/Test mode/)).toBeNull();

    cleanup();
    stubApi(() => reply(200, { ...freePlan, billingMode: "test" }));
    render(<BillingPage />);
    expect(await screen.findByText(/Test mode/)).toBeTruthy();
  });

  it("offers Cancel only when a Razorpay subscription is attached", async () => {
    const premium = { ...freePlan, tier: "PREMIUM", status: "active" };
    stubApi(() => reply(200, premium));
    render(<BillingPage />);
    expect(await screen.findByText(/nothing to cancel/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel Subscription" })).toBeNull();

    cleanup();
    stubApi(() => reply(200, { ...premium, hasSubscription: true }));
    render(<BillingPage />);
    expect(await screen.findByRole("button", { name: "Cancel Subscription" })).toBeTruthy();
  });
});
