import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiJson, errorMessage } from "./api";

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("apiJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends JSON with the session token and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(201, { id: "f1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiJson("/api/forms", { token: "tok", body: { title: "T" } })).resolves.toEqual({ id: "f1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/forms$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer tok" });
    expect(init.body).toBe(JSON.stringify({ title: "T" }));
  });

  it("uses GET without a body, and PATCH or DELETE when asked", async () => {
    // A fresh response per call: a body can only be read once.
    const fetchMock = vi.fn().mockImplementation(async () => reply(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await apiJson("/api/org/members", { token: "tok" });
    await apiJson("/api/org/members/u1", { token: "tok", method: "DELETE" });

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("GET");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBeUndefined();
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("DELETE");
  });

  it("returns undefined for 204 No Content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiJson("/api/auth/logout-all", { method: "POST" })).resolves.toBeUndefined();
  });

  it("throws the server's message, status and code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply(403, { message: "Analytics is a Premium feature.", code: "UPGRADE_REQUIRED" }))
    );

    const error = await apiJson("/api/analytics/f1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: "UPGRADE_REQUIRED", message: "Analytics is a Premium feature." });
    expect(errorMessage(error)).toBe("Analytics is a Premium feature.");
  });

  it("still throws something readable when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })));
    await expect(apiJson("/api/forms")).rejects.toMatchObject({ status: 502, message: "Request failed (502)" });
  });
});
