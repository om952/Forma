import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailVerificationEmail,
  buildInviteEmail,
  buildOwnerNotificationEmail,
  buildPasswordResetEmail,
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

describe("account emails", () => {
  const url = "https://forms.example.com/invite#abc";

  it("names the organization, inviter and role in an invite", () => {
    const email = buildInviteEmail({
      orgName: "Acme",
      inviterEmail: "ada@acme.test",
      role: "ADMIN",
      url,
    });
    assert.match(email.subject, /Acme/);
    assert.match(email.html, /ada@acme\.test/);
    assert.match(email.text, /as an admin/);
    assert.ok(email.text.includes(url));
  });

  it("escapes a hostile organization name in an invite", () => {
    const email = buildInviteEmail({
      orgName: `<img src=x onerror="alert(1)">`,
      inviterEmail: null,
      role: "MEMBER",
      url,
    });
    assert.ok(!email.html.includes("<img"));
    assert.match(email.html, /&lt;img/);
  });

  it("includes the reset link and its expiry", () => {
    const email = buildPasswordResetEmail({ orgName: "Acme", url });
    assert.ok(email.text.includes(url));
    assert.match(email.text, /1 hour/);
  });

  it("includes the verification link", () => {
    const email = buildEmailVerificationEmail({ url });
    assert.ok(email.html.includes(url));
    assert.ok(email.text.includes(url));
  });
});
