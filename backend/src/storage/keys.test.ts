import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFileKey, downloadNameFor, isValidFileKey } from "./keys";

const FILE_ID = "367512a3-30a9-4533-b7b5-1c9f56ab5876";

describe("isValidFileKey", () => {
  it("accepts keys the upload route builds", () => {
    assert.equal(isValidFileKey(buildFileKey("cmumbkp4b0002tijnci79gww9", FILE_ID, "photo.png")), true);
    assert.equal(isValidFileKey(buildFileKey("form_1", FILE_ID, "My_CV-2026.pdf")), true);
  });

  // Keys come straight from the request path, so anything that could walk out
  // of the upload directory or name an unexpected file type is refused.
  it("refuses traversal and anything off-pattern", () => {
    for (const key of [
      `forms/../../etc/${FILE_ID}_passwd.txt`,
      `forms/f1/../${FILE_ID}_x.png`,
      `forms/f1/${FILE_ID}_x.png/../../y.png`,
      `forms/f1/sub/${FILE_ID}_x.png`,
      `forms/f1/${FILE_ID}_x.html`,
      `forms/f1/${FILE_ID}_x.svg`,
      `forms/f1/${FILE_ID}_.hidden.png`,
      `forms/f1/notauuid_x.png`,
      `/forms/f1/${FILE_ID}_x.png`,
      `other/f1/${FILE_ID}_x.png`,
      `forms/f1/${FILE_ID}_x.png%00.html`,
      "",
    ]) {
      assert.equal(isValidFileKey(key), false, key);
    }
  });
});

describe("downloadNameFor", () => {
  it("drops the directory and the uuid prefix", () => {
    assert.equal(downloadNameFor(buildFileKey("f1", FILE_ID, "My_CV.pdf")), "My_CV.pdf");
  });
});
