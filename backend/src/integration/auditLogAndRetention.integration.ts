import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { prisma } from "../db/prisma";
import { webhookQueue } from "../queues/webhook.queue";
import { recordAuditLog } from "../services/auditLog";
import { purgeOldFormSessions } from "../workers/maintenance.worker";
import { addMember, createOrg, startApp, type Call } from "./harness";

/*
 * The audit log records role changes, member removal, and webhook
 * create/edit/delete (billing changes need real Razorpay credentials this
 * test environment doesn't have, so they are covered by the unit tests on
 * the controllers' pure logic instead). It must never block the action it is
 * recording, only owners and admins may read it, and it stays within one
 * organization like everything else in the app.
 */

let call: Call;
let stop: () => Promise<void>;

let owner: Awaited<ReturnType<typeof createOrg>>;
let admin: Awaited<ReturnType<typeof addMember>>;
let member: Awaited<ReturnType<typeof addMember>>;
let formId = "";

before(async () => {
  ({ call, stop } = await startApp());

  owner = await createOrg(call, "audit-owner");
  admin = await addMember(call, owner.token, "ADMIN");
  member = await addMember(call, owner.token, "MEMBER");

  const form = await call("POST", "/api/forms", {
    token: owner.token,
    body: { title: "Audited form", schema: [] },
  });
  formId = form.body.id;
});

after(async () => {
  await stop();
});

/** The audit log's newest entries for this org, as an owner would read them. */
const auditLog = async () => call("GET", "/api/org/audit-log", { token: owner.token });

describe("audit log entries for sensitive actions", () => {
  it("records a role change, with the before and after role", async () => {
    const reply = await call("PATCH", `/api/org/members/${member.userId}`, {
      token: owner.token,
      body: { role: "ADMIN" },
    });
    assert.equal(reply.status, 200);

    const log = await auditLog();
    const entry = log.body.items.find((row: any) => row.action === "member.role_changed" && row.targetId === member.userId);
    assert.ok(entry, "expected a member.role_changed entry");
    assert.equal(entry.actorEmail, owner.email);
    assert.deepEqual(entry.metadata, { targetEmail: member.email, from: "MEMBER", to: "ADMIN" });

    // Restore for later tests.
    await call("PATCH", `/api/org/members/${member.userId}`, { token: owner.token, body: { role: "MEMBER" } });
  });

  it("records a webhook's whole lifecycle: created, updated, deleted", async () => {
    const created = await call("POST", "/api/webhooks", {
      token: owner.token,
      body: { formId, url: "https://example.com/audit-hook" },
    });
    assert.equal(created.status, 201);
    const webhookId = created.body.id;

    await call("PATCH", `/api/webhooks/${webhookId}`, { token: owner.token, body: { isActive: false } });
    await call("DELETE", `/api/webhooks/${webhookId}`, { token: owner.token });

    const log = await auditLog();
    const actions = log.body.items
      .filter((row: any) => row.targetId === webhookId)
      .map((row: any) => row.action)
      .sort();
    assert.deepEqual(actions, ["webhook.created", "webhook.deleted", "webhook.updated"]);

    const updated = log.body.items.find((row: any) => row.action === "webhook.updated" && row.targetId === webhookId);
    assert.equal(updated.metadata.isActive, false);
    assert.equal(updated.metadata.fromUrl, undefined); // only the URL changed if it was part of the update
  });

  it("records who was removed and their role, after the account is gone", async () => {
    const temp = await addMember(call, owner.token, "MEMBER");
    await call("DELETE", `/api/org/members/${temp.userId}`, { token: owner.token });

    const log = await auditLog();
    const entry = log.body.items.find((row: any) => row.action === "member.removed" && row.targetId === temp.userId);
    assert.ok(entry, "expected a member.removed entry");
    assert.deepEqual(entry.metadata, { targetEmail: temp.email, role: "MEMBER" });

    // The actor and target rows are independent: the log outlives the account.
    assert.equal(await prisma.user.findUnique({ where: { id: temp.userId } }), null);
  });

  it("is never the reason the action it records fails", async () => {
    // A bad org id can never happen through the API, but proves the write
    // path degrades quietly: recordAuditLog swallows its own errors.
    const before = await prisma.auditLog.count();
    await recordAuditLog({
      orgId: "does-not-exist",
      actor: null,
      action: "webhook.created",
      metadata: { note: "orgId violates the AuditLog -> Organization foreign key" },
    });
    // No throw above, and no row was written for the org that doesn't exist.
    assert.equal(await prisma.auditLog.count(), before);
  });
});

describe("who may read the audit log", () => {
  it("owners and admins can; members cannot", async () => {
    assert.equal((await call("GET", "/api/org/audit-log", { token: owner.token })).status, 200);
    assert.equal((await call("GET", "/api/org/audit-log", { token: admin.token })).status, 200);
    assert.equal((await call("GET", "/api/org/audit-log", { token: member.token })).status, 403);
  });

  it("paginates, newest first", async () => {
    for (let i = 0; i < 5; i++) {
      await call("PATCH", `/api/org/members/${member.userId}`, {
        token: owner.token,
        body: { role: i % 2 === 0 ? "ADMIN" : "MEMBER" },
      });
    }

    const first = await call("GET", "/api/org/audit-log?limit=3", { token: owner.token });
    assert.equal(first.status, 200);
    assert.equal(first.body.items.length, 3);
    assert.ok(first.body.nextCursor);

    const timestamps = first.body.items.map((row: any) => Date.parse(row.createdAt));
    assert.deepEqual([...timestamps].sort((a, b) => b - a), timestamps);

    const second = await call("GET", `/api/org/audit-log?limit=3&cursor=${first.body.nextCursor}`, {
      token: owner.token,
    });
    const firstIds = new Set(first.body.items.map((row: any) => row.id));
    assert.ok(second.body.items.every((row: any) => !firstIds.has(row.id)));
  });

  it("never shows another organization's entries", async () => {
    const other = await createOrg(call, "audit-other");
    await call("POST", "/api/webhooks", {
      token: other.token,
      body: {
        formId: (await call("POST", "/api/forms", { token: other.token, body: { title: "Other", schema: [] } })).body
          .id,
        url: "https://example.com/other-org-hook",
      },
    });

    const ownEntries = await call("GET", "/api/org/audit-log?limit=100", { token: other.token });
    assert.ok(ownEntries.body.items.every((row: any) => row.metadata?.url !== "https://example.com/audit-hook"));

    const ownerEntries = await call("GET", "/api/org/audit-log?limit=100", { token: owner.token });
    assert.ok(ownerEntries.body.items.every((row: any) => row.metadata?.url !== "https://example.com/other-org-hook"));
  });
});

describe("FormSession retention", () => {
  it("deletes only visits older than the retention window", async () => {
    const old = await prisma.formSession.create({
      data: { orgId: owner.orgId, formId, viewedAt: new Date("2020-01-01T00:00:00Z") },
    });
    const recent = await prisma.formSession.create({
      data: { orgId: owner.orgId, formId },
    });

    const deleted = await purgeOldFormSessions(new Date("2026-09-30T00:00:00Z"));
    assert.ok(deleted >= 1);

    assert.equal(await prisma.formSession.findUnique({ where: { id: old.id } }), null);
    assert.ok(await prisma.formSession.findUnique({ where: { id: recent.id } }));
  });
});

describe("queue health, for alerting on a dead worker", () => {
  it("reports 503 once a job has waited past the threshold, and 200 again once it's gone", async () => {
    // No worker runs in these tests, so anything added just waits, as it
    // would with the worker process down.
    const stale = await webhookQueue.add(
      "deliver",
      { orgId: owner.orgId, formId, webhookId: null, url: "https://example.com/never", payload: {} },
      { timestamp: Date.now() - 10 * 60 * 1000, attempts: 1 }
    );

    const stalled = await call("GET", "/health/queues");
    assert.equal(stalled.status, 503);
    assert.equal(stalled.body.status, "stalled");
    assert.equal(stalled.body.queues.webhooks.stalled, true);
    assert.ok(stalled.body.queues.webhooks.oldestWaitingMs >= 10 * 60 * 1000);

    await stale.remove();
    const recovered = await call("GET", "/health/queues");
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.status, "ok");
  });
});
