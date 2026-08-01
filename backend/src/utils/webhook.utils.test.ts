import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectPayloadType, isRetriesExhausted } from "./webhook.utils";

describe("detectPayloadType", () => {
  it("recognises Slack and Zapier hooks", () => {
    assert.equal(
      detectPayloadType("https://hooks.slack.com/services/A/B/C"),
      "slack"
    );
    assert.equal(
      detectPayloadType("https://hooks.zapier.com/hooks/catch/1/2"),
      "zapier"
    );
  });

  it("falls back to generic for anything else", () => {
    assert.equal(detectPayloadType("https://example.com/webhook"), "generic");
  });

  it("is case-insensitive", () => {
    assert.equal(detectPayloadType("HTTPS://HOOKS.SLACK.COM/x"), "slack");
  });
});

describe("isRetriesExhausted", () => {
  // Guards an off-by-one that would either dead-letter on every retry or never
  // dead-letter at all — and which cannot be caught without a live queue.
  it("is false while attempts remain", () => {
    assert.equal(isRetriesExhausted(1, 3), false);
    assert.equal(isRetriesExhausted(2, 3), false);
  });

  it("is true on the final attempt", () => {
    assert.equal(isRetriesExhausted(3, 3), true);
  });

  it("is true if attempts somehow overshoot", () => {
    assert.equal(isRetriesExhausted(4, 3), true);
  });

  it("treats a missing ceiling as a single attempt", () => {
    assert.equal(isRetriesExhausted(1, undefined), true);
    assert.equal(isRetriesExhausted(0, undefined), false);
  });
});
