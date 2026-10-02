import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AuthPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sign-up and sign-in page", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("signs up, keeps the session and opens the builder", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(201, { token: "tok-1", user: { id: "u1", email: "ada@x.test", role: "OWNER", orgId: "o1" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AuthPage />);
    expect(screen.getByRole("heading", { name: "Create your workspace" })).toBeTruthy();

    await user.type(screen.getByTestId("auth-email"), "ada@x.test");
    await user.type(screen.getByTestId("auth-password"), "pass-word-1");
    await user.type(screen.getByTestId("auth-org"), "Analytical Engines");
    await user.click(screen.getByTestId("auth-submit"));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/signup$/);
    expect(JSON.parse(String(init.body))).toEqual({
      email: "ada@x.test",
      password: "pass-word-1",
      organizationName: "Analytical Engines",
    });
    expect(localStorage.getItem("forma_token")).toBe("tok-1");
    expect(push).toHaveBeenCalledWith("/builder");
  });

  it("signs a returning user in to their dashboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, { token: "tok-2", user: { id: "u1", email: "ada@x.test", role: "OWNER", orgId: "o1" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AuthPage />);
    await user.click(screen.getByTestId("auth-tab-login"));
    await user.type(screen.getByTestId("auth-email"), "ada@x.test");
    await user.type(screen.getByTestId("auth-password"), "pass-word-1");
    await user.click(screen.getByTestId("auth-submit"));

    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(/\/api\/auth\/login$/);
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("offers the demo workspace only when one is configured, and signs in to it in one click", async () => {
    expect(screen.queryByTestId("demo-login")).toBeNull();
    render(<AuthPage />);
    expect(screen.queryByTestId("demo-login")).toBeNull();
    cleanup();

    vi.stubEnv("NEXT_PUBLIC_DEMO_EMAIL", "owner@forma.demo");
    vi.stubEnv("NEXT_PUBLIC_DEMO_PASSWORD", "demo-pass-1");
    vi.resetModules();
    const { default: DemoAuthPage } = await import("./page");
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, { token: "tok-3", user: { id: "u9", email: "owner@forma.demo", role: "OWNER", orgId: "o9" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<DemoAuthPage />);
    await user.click(screen.getByRole("button", { name: "Explore the demo" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/login$/);
    expect(JSON.parse(String(init.body))).toEqual({ email: "owner@forma.demo", password: "demo-pass-1" });
    expect(push).toHaveBeenCalledWith("/dashboard");
    vi.unstubAllEnvs();
  });

  it("shows the server's reason and stays put when sign-in fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(401, { message: "Invalid credentials" })));
    const user = userEvent.setup();

    render(<AuthPage />);
    await user.click(screen.getByTestId("auth-tab-login"));
    await user.type(screen.getByTestId("auth-email"), "ada@x.test");
    await user.type(screen.getByTestId("auth-password"), "wrong-password");
    await user.click(screen.getByTestId("auth-submit"));

    expect((await screen.findByTestId("auth-status")).textContent).toBe("Invalid credentials");
    expect(localStorage.getItem("forma_token")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("offers password reset only when signing in, and leaves the organization optional", async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
    expect((screen.getByTestId("auth-org") as HTMLInputElement).required).toBe(true);

    await user.click(screen.getByTestId("auth-tab-login"));
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    expect((screen.getByTestId("auth-org") as HTMLInputElement).required).toBe(false);
  });
});
