import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectAllowedFile } from "./fileType";

const bytes = (...parts: Array<number[] | string>) =>
  Buffer.concat(parts.map((part) => (typeof part === "string" ? Buffer.from(part) : Buffer.from(part))));

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "rest of image");
const ZIP = [0x50, 0x4b, 0x03, 0x04];

describe("detectAllowedFile", () => {
  it("recognises images by their signature", () => {
    assert.deepEqual(detectAllowedFile(PNG, "photo.png"), { mime: "image/png", ext: "png" });
    assert.deepEqual(detectAllowedFile(bytes([0xff, 0xd8, 0xff, 0xe0]), "a.jpeg"), {
      mime: "image/jpeg",
      ext: "jpg",
    });
    assert.deepEqual(detectAllowedFile(bytes("GIF89a..."), "a.gif"), { mime: "image/gif", ext: "gif" });
    assert.deepEqual(detectAllowedFile(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "), "a.webp"), {
      mime: "image/webp",
      ext: "webp",
    });
  });

  it("recognises PDF", () => {
    assert.deepEqual(detectAllowedFile(bytes("%PDF-1.7\n..."), "cv.pdf"), {
      mime: "application/pdf",
      ext: "pdf",
    });
  });

  // The bytes decide, not the name: a PNG called `.pdf` is stored as `.png`.
  it("ignores a misleading extension on binary types", () => {
    assert.deepEqual(detectAllowedFile(PNG, "invoice.pdf"), { mime: "image/png", ext: "png" });
    assert.deepEqual(detectAllowedFile(PNG, "evil.html"), { mime: "image/png", ext: "png" });
  });

  it("recognises docx and xlsx from their contents", () => {
    const docx = bytes(ZIP, "..[Content_Types].xml..word/document.xml..");
    const xlsx = bytes(ZIP, "..[Content_Types].xml..xl/workbook.xml..");

    assert.equal(detectAllowedFile(docx, "resume.docx")?.ext, "docx");
    assert.equal(detectAllowedFile(xlsx, "data.xlsx")?.ext, "xlsx");
  });

  it("refuses macro-enabled documents and arbitrary zips", () => {
    const docm = bytes(ZIP, "[Content_Types].xml word/document.xml word/vbaProject.bin");

    assert.equal(detectAllowedFile(docm, "resume.docx"), null);
    assert.equal(detectAllowedFile(bytes(ZIP, "payload.exe"), "archive.zip"), null);
    assert.equal(detectAllowedFile(bytes(ZIP, "[Content_Types].xml ppt/presentation.xml"), "a.pptx"), null);
  });

  it("accepts plain text and CSV named as such", () => {
    assert.deepEqual(detectAllowedFile(bytes("name,email\nA,a@x.com\n"), "list.csv"), {
      mime: "text/csv",
      ext: "csv",
    });
    assert.deepEqual(detectAllowedFile(bytes("héllo wörld"), "notes.TXT"), {
      mime: "text/plain",
      ext: "txt",
    });
  });

  it("refuses text under any other extension", () => {
    assert.equal(detectAllowedFile(bytes("alert(1)"), "x.js"), null);
    assert.equal(detectAllowedFile(bytes("hello"), "noextension"), null);
  });

  // Scriptable formats have no allowed signature and must never fall through
  // to "text", whatever they are called.
  it("refuses HTML and SVG, including disguised as text", () => {
    assert.equal(detectAllowedFile(bytes("<svg onload=alert(1)>"), "x.svg"), null);
    assert.equal(detectAllowedFile(bytes("<!DOCTYPE html><script>"), "x.html"), null);
    assert.equal(detectAllowedFile(bytes("  <html><body>"), "notes.txt"), null);
    assert.equal(detectAllowedFile(bytes("﻿<svg/>"), "x.txt"), null);
    assert.equal(detectAllowedFile(bytes('<?xml version="1.0"?><svg/>'), "x.csv"), null);
  });

  it("refuses binaries named as text", () => {
    assert.equal(detectAllowedFile(bytes("MZ", [0x90, 0x00, 0x03]), "readme.txt"), null);
    assert.equal(detectAllowedFile(bytes([0xc3, 0x28]), "bad-utf8.txt"), null);
  });

  it("refuses empty files and executables", () => {
    assert.equal(detectAllowedFile(Buffer.alloc(0), "empty.txt"), null);
    assert.equal(detectAllowedFile(bytes([0x7f, 0x45, 0x4c, 0x46, 0x02]), "a.png"), null);
  });
});
