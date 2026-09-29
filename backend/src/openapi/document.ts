import { z } from "zod";

import type { RouteSpec } from "../routes/define";

/** A router's routes and where they are mounted. */
export type Mount = {
  prefix: string;
  tag: string;
  tagDescription?: string;
  routes: RouteSpec[];
};

type JsonObject = Record<string, unknown>;

const ERROR_REF = { $ref: "#/components/schemas/Error" };

/** Request schemas are documented as clients send them, before defaults apply. */
const toJsonSchema = (schema: z.ZodType): JsonObject => {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as JsonObject;
  return json;
};

const parametersOf = (schema: z.ZodObject | undefined, location: "path" | "query") =>
  Object.entries(schema?.shape ?? {}).map(([name, field]) => ({
    name,
    in: location,
    required: location === "path" || !(field as z.ZodType).safeParse(undefined).success,
    schema: toJsonSchema(field as z.ZodType),
  }));

/** `/api/forms` + `/:id/public` becomes `/api/forms/{id}/public`. */
export const toOpenApiPath = (prefix: string, path: string): string =>
  `${prefix}${path === "/" ? "" : path}`.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const describeAccess = (access: RouteSpec["access"]) => {
  if (access === "public") return "Public: no session needed.";
  if (access === "user") return "Any signed-in member of the organization.";
  return `Signed-in ${access.join(" or ")} only.`;
};

const operationFor = (tag: string, spec: RouteSpec): JsonObject => {
  const responses: Record<string, JsonObject> = {};

  for (const [status, description] of Object.entries(spec.responses)) {
    responses[status] =
      Number(status) >= 400
        ? { description, content: { "application/json": { schema: ERROR_REF } } }
        : { description };
  }

  const standard: Array<[string, string, boolean]> = [
    ["400", "The request failed validation; `issues` lists each problem.", Boolean(spec.request)],
    ["401", "Missing, expired or revoked session token.", spec.access !== "public"],
    ["403", "The caller's role is not allowed to do this.", Array.isArray(spec.access)],
  ];
  for (const [status, description, applies] of standard) {
    if (applies && !responses[status]) {
      responses[status] = { description, content: { "application/json": { schema: ERROR_REF } } };
    }
  }

  const { params, query, body } = spec.request ?? {};

  return {
    operationId: spec.operationId ?? spec.handler.name,
    tags: [tag],
    summary: spec.summary,
    description: [spec.description, describeAccess(spec.access)].filter(Boolean).join("\n\n"),
    security: spec.access === "public" ? [] : [{ bearerAuth: [] }],
    ...(Array.isArray(spec.access) ? { "x-roles": spec.access } : {}),
    parameters: [...parametersOf(params, "path"), ...parametersOf(query, "query")],
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: toJsonSchema(body) } },
          },
        }
      : {}),
    responses,
  };
};

/**
 * The OpenAPI 3.1 description of every mounted route, built from the same
 * declarations the server routes from.
 */
export const buildOpenApiDocument = (
  mounts: Mount[],
  info: { title: string; version: string; description?: string }
): JsonObject => {
  const paths: Record<string, Record<string, JsonObject>> = {};
  const operationIds = new Set<string>();

  for (const { prefix, tag, routes } of mounts) {
    for (const spec of routes) {
      const path = toOpenApiPath(prefix, spec.path);
      const operation = operationFor(tag, spec);
      const id = operation.operationId as string;

      if (!id || operationIds.has(id)) {
        throw new Error(`${spec.method.toUpperCase()} ${path}: operationId "${id}" is missing or not unique`);
      }
      operationIds.add(id);

      (paths[path] ??= {})[spec.method] = operation;
    }
  }

  const tags = new Map<string, string | undefined>();
  for (const mount of mounts) {
    if (!tags.get(mount.tag)) tags.set(mount.tag, mount.tagDescription);
  }

  return {
    openapi: "3.1.0",
    info,
    // Relative: the API reference describes whichever server serves it.
    servers: [{ url: "/" }],
    tags: [...tags].map(([name, description]) => ({ name, ...(description ? { description } : {}) })),
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
            requestId: { type: "string" },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: { path: { type: "string" }, message: { type: "string" } },
              },
            },
          },
        },
      },
    },
    paths,
  };
};
