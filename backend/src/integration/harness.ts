import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { app } from "../app";
import { prisma } from "../db/prisma";
import { notificationQueue } from "../queues/notification.queue";
import { redisConnection, redisRequestConnection } from "../queues/redis";
import { webhookQueue } from "../queues/webhook.queue";

/*
 * Integration tests run the real Express app on a random port, against the
 * Postgres and Redis named by DATABASE_URL and REDIS_URL (with migrations
 * applied). Each run creates its own organizations, so no cleanup is needed
 * on a throwaway test database.
 */

export type Reply = { status: number; body: any };

export type Call = (
  method: string,
  path: string,
  options?: { token?: string; body?: unknown; headers?: Record<string, string> }
) => Promise<Reply>;

export const startApp = async () => {
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const call: Call = async (method, path, options = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON (CSV, empty 204): keep the text.
    }
    return { status: response.status, body };
  };

  const stop = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([notificationQueue.close(), webhookQueue.close()]);
    await Promise.allSettled([redisConnection.quit(), redisRequestConnection.quit()]);
    await prisma.$disconnect();
  };

  return { base, call, stop };
};

let counter = 0;

/** A new organization with its owner, signed in. Optionally on Premium. */
export const createOrg = async (call: Call, label: string, options: { premium?: boolean } = {}) => {
  const suffix = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `${label}-${suffix}@integration.test`;
  const reply = await call("POST", "/api/auth/signup", {
    body: { email, password: "integration-pass-1", organizationName: `${label} ${suffix}` },
  });
  if (reply.status !== 201) {
    throw new Error(`signup failed: ${reply.status} ${JSON.stringify(reply.body)}`);
  }

  const orgId = reply.body.user.orgId as string;
  if (options.premium) {
    await prisma.organization.update({ where: { id: orgId }, data: { tier: "PREMIUM" } });
  }

  return {
    email,
    token: reply.body.token as string,
    userId: reply.body.user.id as string,
    orgId,
  };
};

/** Invites `role` into the org and accepts, returning the new member signed in. */
export const addMember = async (
  call: Call,
  ownerToken: string,
  role: "ADMIN" | "MEMBER"
) => {
  const email = `member-${Date.now().toString(36)}${(counter++).toString(36)}@integration.test`;
  const invite = await call("POST", "/api/org/invites", { token: ownerToken, body: { email, role } });
  if (invite.status !== 201 || !invite.body.inviteUrl) {
    throw new Error(`invite failed: ${invite.status} ${JSON.stringify(invite.body)}`);
  }

  const token = String(invite.body.inviteUrl).split("#")[1];
  const accepted = await call("POST", "/api/invites/accept", {
    body: { token, password: "integration-pass-1" },
  });
  if (accepted.status !== 201) {
    throw new Error(`accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  }

  return {
    email,
    token: accepted.body.token as string,
    userId: accepted.body.user.id as string,
    inviteId: invite.body.invite.id as string,
  };
};
