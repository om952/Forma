import { Router, type RequestHandler } from "express";
import type { z } from "zod";

import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import type { OrgRole } from "../utils/orgRoles";
import { parse } from "../validation/parse";

/**
 * Who may call a route: anyone, any signed-in user, or signed-in users with
 * one of the listed roles.
 */
export type Access = "public" | "user" | readonly OrgRole[];

/**
 * One endpoint, declared as data. `buildRouter` turns these into Express
 * routes and `openapi/document.ts` into the API reference, so the two cannot
 * disagree about who may call an endpoint or what it accepts.
 */
export type RouteSpec = {
  method: "get" | "post" | "patch" | "delete";
  /** Relative to the router's mount point, in Express syntax (`/:formId`). */
  path: string;
  summary: string;
  description?: string;
  /** Defaults to the handler's name. Must be unique across the API. */
  operationId?: string;
  access: Access;
  /** Validated before the handler runs; the handler sees the parsed values. */
  request?: {
    params?: z.ZodObject;
    query?: z.ZodObject;
    body?: z.ZodType;
  };
  /** Status codes this endpoint answers with, and what each means. */
  responses: Record<number, string>;
  /** Runs after authentication and before validation, e.g. a rate limiter. */
  middleware?: RequestHandler[];
  handler: RequestHandler;
};

export const route = (spec: RouteSpec): RouteSpec => spec;

/**
 * Replaces `req.params`, `req.query` and `req.body` with their parsed form, so
 * defaults and transforms (trimmed strings, numbers from query strings) apply
 * and a handler can trust the types. Throws a 400 on the first bad part.
 */
const validate =
  (request: NonNullable<RouteSpec["request"]>): RequestHandler =>
  (req, _res, next) => {
    if (request.params) {
      req.params = parse(request.params, req.params, "params") as typeof req.params;
    }

    if (request.query) {
      // Express 5 exposes `query` as a getter, so it is shadowed rather than assigned.
      Object.defineProperty(req, "query", {
        value: parse(request.query, req.query, "query"),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    if (request.body) {
      req.body = parse(request.body, req.body, "body");
    }

    next();
  };

export const buildRouter = (specs: RouteSpec[]): Router => {
  const router = Router();

  for (const spec of specs) {
    // Every path parameter must be validated, so a handler never sees one it
    // cannot trust and the API reference can describe each one.
    for (const [, name] of spec.path.matchAll(/:([A-Za-z0-9_]+)/g)) {
      if (!spec.request?.params?.shape[name!]) {
        throw new Error(`${spec.method.toUpperCase()} ${spec.path}: ":${name}" has no params schema`);
      }
    }

    const chain: RequestHandler[] = [];

    if (spec.access !== "public") chain.push(authMiddleware);
    if (Array.isArray(spec.access)) chain.push(requireRole(...spec.access));
    chain.push(...(spec.middleware ?? []));
    if (spec.request) chain.push(validate(spec.request));
    chain.push(spec.handler);

    router[spec.method](spec.path, ...chain);
  }

  return router;
};
