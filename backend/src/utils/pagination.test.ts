import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pageArgs, pageOf } from "./pagination";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

describe("pageArgs", () => {
  it("asks for one extra row", () => {
    assert.deepEqual(pageArgs({ limit: 20 }), { take: 21 });
  });

  it("starts after the cursor row", () => {
    assert.deepEqual(pageArgs({ limit: 5, cursor: "r9" }), {
      take: 6,
      cursor: { id: "r9" },
      skip: 1,
    });
  });
});

describe("pageOf", () => {
  it("returns a cursor when more rows follow", () => {
    const page = pageOf(rows(6), 5);
    assert.equal(page.items.length, 5);
    assert.equal(page.nextCursor, "r4");
  });

  it("returns no cursor on the last page", () => {
    assert.deepEqual(pageOf(rows(5), 5), { items: rows(5), nextCursor: null });
    assert.deepEqual(pageOf([], 5), { items: [], nextCursor: null });
  });
});
