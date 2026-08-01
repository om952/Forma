import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOwnerNotificationEmail,
  buildRespondentConfirmationEmail,
  escapeHtml,
} from "./email.utils";

describe("escapeHtml", () => {
  it("escapes the characters that break out of HTML context", () => {
    assert.equal(
      escapeHtml(`<script>alert("x")</script>`),
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands without double-escaping the result", () => {
    assert.equal(escapeHtml("Tom & Jerry"), "Tom &amp; Jerry");
    assert.equal(escapeHtml("a < b & c"), "a &lt; b &amp; c");
  });
});

describe("buildOwnerNotificationEmail", () => {
  const base = {
    formName: "Feedback",
    fields: [{ label: "Name", value: "Ada" }],
    responsesUrl: "https://example.com/responses/f1",
  };

  it("includes the form name and the submitted values", () => {
    const email = buildOwnerNotificationEmail(base);
    assert.match(email.subject, /Feedback/);
    assert.match(email.html, /Ada/);
    assert.match(email.text, /Name: Ada/);
  });

  it("neutralises markup submitted by a respondent", () => {
    const email = buildOwnerNotificationEmail({
      ...base,
      fields: [{ label: "Name", value: "<img src=x onerror=alert(1)>" }],
    });
    assert.ok(!email.html.includes("<img"), "raw markup must not survive");
    assert.match(email.html, /&lt;img/);
  });

  it("escapes a malicious field label too", () => {
    const email = buildOwnerNotificationEmail({
      ...base,
      fields: [{ label: "<b>Name</b>", value: "Ada" }],
    });
    assert.ok(!email.html.includes("<b>Name</b>"));
  });

  it("omits blank answers but still renders", () => {
    const email = buildOwnerNotificationEmail({
      ...base,
      fields: [
        { label: "Name", value: "Ada" },
        { label: "Phone", value: "   " },
      ],
    });
    assert.ok(!email.html.includes("Phone"));
    assert.match(email.html, /Ada/);
  });

  it("handles a submission with no answers at all", () => {
    const email = buildOwnerNotificationEmail({ ...base, fields: [] });
    assert.match(email.html, /no filled-in fields/);
  });
});

describe("buildRespondentConfirmationEmail", () => {
  it("names the form and escapes it", () => {
    const email = buildRespondentConfirmationEmail({
      formName: `Survey <b>2026</b>`,
    });
    assert.match(email.subject, /Survey/);
    assert.ok(!email.html.includes("<b>2026</b>"));
  });
});
