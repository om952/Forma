import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import * as jwt from "jsonwebtoken";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { createScopedPrismaClient } from "../db/scopedPrisma";
import { addMember, createOrg, startApp, type Call } from "./harness";

/*
 * Org B, fully signed in and on Premium, aims every organization-scoped
 * endpoint at org A's records. Each attempt must look exactly like the record
 * does not exist (404), and org A's data must be untouched afterwards.
 */

let call: Call;
let stop: () => Promise<void>;

let orgA: Awaited<ReturnType<typeof createOrg>>;
let orgB: Awaited<ReturnType<typeof createOrg>>;
let memberA: Awaited<ReturnType<typeof addMember>>;
const a = { formId: "", responseId: "", webhookId: "", deadLetterId: "", inviteId: "", sessionId: "" };
let formB = "";

before(async () => {
  ({ call, stop } = await startApp());

  orgA = await createOrg(call, "org-a", { premium: true });
  orgB = await createOrg(call, "org-b", { premium: true });
  memberA = await addMember(call, orgA.token, "MEMBER");

  const form = await call("POST", "/api/forms", {
    token: orgA.token,
    body: { title: "A's private form", schema: [{ id: "secret", type: "text", label: "Secret", required: false }] },
  });
  a.formId = form.body.id;

  const response = await call("POST", `/api/responses/${a.formId}`, { body: { secret: "A's answer" } });
  a.responseId = response.body.id;

  const webhook = await call("POST", "/api/webhooks", {
    token: orgA.token,
    body: { formId: a.formId, url: "https://example.com/org-a" },
  });
  a.webhookId = webhook.body.id;

  const deadLetter = await prisma.webhookDeadLetter.create({
    data: {
      orgId: orgA.orgId,
      formId: a.formId,
      webhookId: a.webhookId,
      url: "https://example.com/org-a",
      payload: { secret: "A's payload" },
      lastError: "HTTP 500",
      attemptsMade: 3,
    },
  });
  a.deadLetterId = deadLetter.id;

  const invite = await call("POST", "/api/org/invites", {
    token: orgA.token,
    body: { email: "pending@integration.test", role: "MEMBER" },
  });
  a.inviteId = invite.body.invite.id;

  const session = await call("POST", `/api/forms/${a.formId}/sessions`);
  a.sessionId = session.body.sessionId;

  const b = await call("POST", "/api/forms", { token: orgB.token, body: { title: "B's form", schema: [] } });
  formB = b.body.id;
});

after(async () => {
  await stop();
});

describe("org B cannot reach org A's records through the API", () => {
  const attempts: Array<[string, string, () => string, unknown?]> = [
    ["GET", "form", () => `/api/forms/${a.formId}`],
    ["PATCH", "form", () => `/api/forms/${a.formId}`, { title: "Taken over" }],
    ["DELETE", "form", () => `/api/forms/${a.formId}`],
    ["GET", "responses", () => `/api/responses/${a.formId}`],
    ["GET", "CSV export", () => `/api/responses/${a.formId}/export`],
    ["GET", "analytics", () => `/api/analytics/${a.formId}`],
    ["GET", "webhooks", () => `/api/webhooks?formId=${a.formId}`],
    ["PATCH", "webhook", () => `/api/webhooks/${a.webhookId}`, { url: "https://example.com/stolen" }],
    ["DELETE", "webhook", () => `/api/webhooks/${a.webhookId}`],
    ["POST", "webhook test", () => `/api/webhooks/${a.webhookId}/test`],
    ["GET", "dead letters", () => `/api/webhooks/${a.formId}/dead-letters`],
    ["POST", "dead letter replay", () => `/api/webhooks/dead-letters/${a.deadLetterId}/replay`],
    ["PATCH", "member role", () => `/api/org/members/${memberA.userId}`, { role: "ADMIN" }],
    ["DELETE", "member", () => `/api/org/members/${memberA.userId}`],
    ["DELETE", "invite", () => `/api/org/invites/${a.inviteId}`],
  ];

  for (const [method, what, path, body] of attempts) {
    it(`${method} ${what} is a 404`, async () => {
      const reply = await call(method, path(), { token: orgB.token, ...(body ? { body } : {}) });
      assert.equal(reply.status, 404, `${method} ${path()} answered ${reply.status}: ${JSON.stringify(reply.body)}`);
    });
  }

  it("adding a webhook to A's form is a 404", async () => {
    const reply = await call("POST", "/api/webhooks", {
      token: orgB.token,
      body: { formId: a.formId, url: "https://example.com/stolen" },
    });
    assert.equal(reply.status, 404);
  });

  it("lists show none of A's records", async () => {
    const forms = await call("GET", "/api/forms", { token: orgB.token });
    assert.deepEqual(forms.body.items.map((f: { id: string }) => f.id), [formB]);

    const summary = await call("GET", "/api/forms/summary", { token: orgB.token });
    assert.deepEqual(summary.body, { forms: 1, activeForms: 1, responses: 0 });

    const members = await call("GET", "/api/org/members", { token: orgB.token });
    assert.deepEqual(members.body.map((m: { id: string }) => m.id), [orgB.userId]);

    const invites = await call("GET", "/api/org/invites", { token: orgB.token });
    assert.deepEqual(invites.body, []);
  });

  it("left every one of A's records as it was", async () => {
    const form = await prisma.form.findUnique({ where: { id: a.formId } });
    assert.equal(form?.name, "A's private form");
    assert.ok(await prisma.response.findUnique({ where: { id: a.responseId } }));
    const webhook = await prisma.webhook.findUnique({ where: { id: a.webhookId } });
    assert.equal(webhook?.url, "https://example.com/org-a");
    assert.ok(await prisma.webhookDeadLetter.findUnique({ where: { id: a.deadLetterId } }));
    const member = await prisma.user.findUnique({ where: { id: memberA.userId } });
    assert.equal(member?.role, "MEMBER");
    assert.ok(await prisma.invite.findUnique({ where: { id: a.inviteId } }));
  });
});

describe("a session token cannot widen its own access", () => {
  it("an orgId claim naming another org is ignored: the database decides", async () => {
    const forged = jwt.sign(
      { userId: orgB.userId, orgId: orgA.orgId, role: "OWNER", tv: 0 },
      env.JWT_SECRET,
      { algorithm: "HS256" }
    );
    const forms = await call("GET", "/api/forms", { token: forged });
    assert.equal(forms.status, 200);
    assert.deepEqual(forms.body.items.map((f: { id: string }) => f.id), [formB]);
    assert.equal((await call("GET", `/api/forms/${a.formId}`, { token: forged })).status, 404);
  });

  it("an OWNER role claim does not make a member an owner", async () => {
    const forged = jwt.sign(
      { userId: memberA.userId, orgId: orgA.orgId, role: "OWNER", tv: 0 },
      env.JWT_SECRET,
      { algorithm: "HS256" }
    );
    const reply = await call("DELETE", `/api/forms/${a.formId}`, { token: forged });
    assert.equal(reply.status, 403);
    assert.ok(await prisma.form.findUnique({ where: { id: a.formId } }));
  });

  it("a token signed with another secret is refused", async () => {
    const forged = jwt.sign({ userId: orgA.userId, orgId: orgA.orgId, role: "OWNER" }, "not-the-secret");
    assert.equal((await call("GET", "/api/forms", { token: forged })).status, 401);
  });
});

describe("public endpoints stay within one form", () => {
  it("progress for A's visit cannot be reported through B's form", async () => {
    const reply = await call("POST", `/api/forms/${formB}/sessions/${a.sessionId}/fields`, {
      body: { fieldId: "secret" },
    });
    assert.equal(reply.status, 404);
  });

  it("a submission to B's form cannot complete A's visit", async () => {
    await call("POST", `/api/responses/${formB}`, { body: {}, headers: { "x-form-session": a.sessionId } });
    const session = await prisma.formSession.findUnique({ where: { id: a.sessionId } });
    assert.equal(session?.submittedAt, null);
  });
});

describe("the org-scoped database client", () => {
  it("finds nothing of another org's, even by primary key", async () => {
    const db = createScopedPrismaClient(orgB.orgId);
    assert.equal(await db.form.findUnique({ where: { id: a.formId } }), null);
    assert.equal(await db.response.findFirst({ where: { id: a.responseId } }), null);
    assert.equal(await db.user.findUnique({ where: { id: memberA.userId } }), null);
  });

  it("counts and bulk writes only touch its own org", async () => {
    const db = createScopedPrismaClient(orgB.orgId);
    const ownResponses = await prisma.response.count({ where: { orgId: orgB.orgId } });
    assert.equal(await db.response.count({}), ownResponses);
    assert.equal(await db.response.count({ where: { id: a.responseId } }), 0);

    const { count } = await db.form.updateMany({ data: { thankYouMessage: "B was here" } });
    assert.equal(count, 1);
    const formA = await prisma.form.findUnique({ where: { id: a.formId } });
    assert.equal(formA?.thankYouMessage, null);
  });

  it("an orgId in the caller's filter cannot override the scope", async () => {
    const db = createScopedPrismaClient(orgB.orgId);
    const forms = await db.form.findMany({ where: { orgId: orgA.orgId } });
    assert.deepEqual(forms.map((f) => f.id), [formB]);
  });
});
