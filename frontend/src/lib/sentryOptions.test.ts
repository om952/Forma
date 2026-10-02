import { describe, expect, it } from "vitest";

import { sentryOptions, withoutQueryOrFragment } from "./sentryOptions";

describe("withoutQueryOrFragment", () => {
  it("drops the query string and the fragment", () => {
    expect(withoutQueryOrFragment("https://forms.example.com/reset-password#tok123")).toBe(
      "https://forms.example.com/reset-password"
    );
    expect(withoutQueryOrFragment("/auth?email=a@b.c#x")).toBe("/auth");
    expect(withoutQueryOrFragment("/dashboard")).toBe("/dashboard");
  });
});

describe("what Sentry is sent", () => {
  it("strips the page URL and query string from an error event", () => {
    const event = sentryOptions.beforeSend({
      type: undefined,
      request: { url: "https://x.test/invite#secret-token", query_string: "a=1" },
    });
    expect(event.request).toEqual({ url: "https://x.test/invite" });
  });

  it("strips navigation and request breadcrumbs", () => {
    const crumb = sentryOptions.beforeBreadcrumb({
      category: "navigation",
      data: { from: "/verify-email#tok", to: "/dashboard?tab=1", url: "/api/x?y=2" },
    });
    expect(crumb.data).toEqual({ from: "/verify-email", to: "/dashboard", url: "/api/x" });
  });
});
