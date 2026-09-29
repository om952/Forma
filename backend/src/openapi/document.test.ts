import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import type { RouteSpec } from "../routes/define";
import { buildOpenApiDocument, toOpenApiPath } from "./document";

const handler = () => undefined;
const publicThing = () => undefined;

const specs: RouteSpec[] = [
  {
    method: "get",
    path: "/",
    summary: "List things",
    operationId: "listThings",
    access: "user",
    request: { query: z.object({ limit: z.coerce.number().default(20), cursor: z.string().optional() }) },
    responses: { 200: "A page." },
    handler,
  },
  {
    method: "patch",
    path: "/:id",
    summary: "Change a thing",
    operationId: "changeThing",
    access: ["OWNER"],
    request: { params: z.object({ id: z.string() }), body: z.object({ name: z.string().min(1) }) },
    responses: { 200: "Changed.", 404: "Not found." },
    handler,
  },
  {
    method: "get",
    path: "/:id/public",
    summary: "Public view",
    access: "public",
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: "The thing." },
    handler: publicThing,
  },
];

const doc = buildOpenApiDocument([{ prefix: "/api/things", tag: "Things", routes: specs }], {
  title: "Test",
  version: "1",
}) as { openapi: string; paths: Record<string, Record<string, any>> };

describe("toOpenApiPath", () => {
  it("joins the prefix and turns :params into {params}", () => {
    assert.equal(toOpenApiPath("/api/forms", "/"), "/api/forms");
    assert.equal(toOpenApiPath("/api/forms", "/:id/sessions/:sessionId"), "/api/forms/{id}/sessions/{sessionId}");
  });
});

describe("buildOpenApiDocument", () => {
  it("names each operation, by default after its handler", () => {
    assert.equal(doc.paths["/api/things"]!.get.operationId, "listThings");
    assert.equal(doc.paths["/api/things/{id}/public"]!.get.operationId, "publicThing");
  });

  it("refuses duplicate operation ids", () => {
    assert.throws(
      () =>
        buildOpenApiDocument(
          [{ prefix: "/x", tag: "X", routes: [specs[0]!, { ...specs[0]!, path: "/other" }] }],
          { title: "T", version: "1" }
        ),
      /operationId "listThings" is missing or not unique/
    );
  });

  it("is OpenAPI 3.1 with every declared operation", () => {
    assert.equal(doc.openapi, "3.1.0");
    assert.deepEqual(Object.keys(doc.paths).sort(), ["/api/things", "/api/things/{id}", "/api/things/{id}/public"]);
    assert.ok(doc.paths["/api/things"]!.get);
    assert.ok(doc.paths["/api/things/{id}"]!.patch);
  });

  it("documents query and path parameters, required only when they must be sent", () => {
    const list = doc.paths["/api/things"]!.get;
    assert.deepEqual(
      list.parameters.map((p: any) => [p.name, p.in, p.required]),
      [["limit", "query", false], ["cursor", "query", false]]
    );
    const patch = doc.paths["/api/things/{id}"]!.patch;
    assert.deepEqual(patch.parameters.map((p: any) => [p.name, p.in, p.required]), [["id", "path", true]]);
  });

  it("derives security, roles and the standard error responses from access", () => {
    const patch = doc.paths["/api/things/{id}"]!.patch;
    assert.deepEqual(patch.security, [{ bearerAuth: [] }]);
    assert.deepEqual(patch["x-roles"], ["OWNER"]);
    assert.deepEqual(Object.keys(patch.responses).sort(), ["200", "400", "401", "403", "404"]);

    const pub = doc.paths["/api/things/{id}/public"]!.get;
    assert.deepEqual(pub.security, []);
    assert.equal(pub.responses["401"], undefined);
  });

  it("describes the request body with JSON Schema", () => {
    const body = doc.paths["/api/things/{id}"]!.patch.requestBody.content["application/json"].schema;
    assert.equal(body.type, "object");
    assert.deepEqual(body.required, ["name"]);
    assert.equal(body.properties.name.minLength, 1);
  });
});
