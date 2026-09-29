import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import { HttpError } from "../utils/httpError";
import { paginationQuery, timeZoneSchema } from "./common";
import { parse } from "./parse";

describe("parse", () => {
  const schema = z.object({ title: z.string().min(1, "must not be empty"), count: z.number() });

  it("returns the parsed value", () => {
    assert.deepEqual(parse(schema, { title: "a", count: 1 }, "body"), { title: "a", count: 1 });
  });

  it("throws a 400 naming the first problem and listing all of them", () => {
    try {
      parse(schema, { title: "" }, "body");
      assert.fail("expected an error");
    } catch (error) {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "title: must not be empty");
      assert.deepEqual(error.details, {
        issues: [
          { path: "title", message: "must not be empty" },
          { path: "count", message: "is required" },
        ],
      });
    }
  });

  it("says which part of the request was malformed when there is no path", () => {
    assert.throws(() => parse(schema, undefined, "body"), /Invalid request body/);
  });
});

describe("paginationQuery", () => {
  it("defaults and coerces the limit from the query string", () => {
    assert.deepEqual(paginationQuery.parse({}), { limit: 20 });
    assert.deepEqual(paginationQuery.parse({ limit: "50", cursor: "abc" }), { limit: 50, cursor: "abc" });
  });

  it("caps the page size", () => {
    assert.equal(paginationQuery.safeParse({ limit: "101" }).success, false);
    assert.equal(paginationQuery.safeParse({ limit: "0" }).success, false);
  });
});

describe("timeZoneSchema", () => {
  it("accepts IANA names and rejects anything else", () => {
    assert.ok(timeZoneSchema.safeParse("Asia/Kolkata").success);
    assert.ok(timeZoneSchema.safeParse("UTC").success);
    assert.equal(timeZoneSchema.safeParse("Mars/Olympus").success, false);
    assert.equal(timeZoneSchema.safeParse("UTC'; --").success, false);
  });
});
