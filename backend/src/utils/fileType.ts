/**
 * Decides what an uploaded file really is, from its bytes.
 *
 * Uploads come from anonymous respondents, and both the `fileType` they send
 * and the file's extension are theirs to choose. Neither is evidence of
 * anything. The type is read from the content instead and checked against a
 * short allowlist; the stored name then gets the extension of what was
 * detected, so a script can't be stored as `.html` or `.svg` under a harmless
 * label.
 *
 * Kept free of any I/O so the rules are testable on plain buffers.
 */

export type DetectedFile = {
  mime: string;
  /** Extension the file is stored under, without the dot. */
  ext: string;
};

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
};

/**
 * Office Open XML files are ZIP archives; what's inside decides the format.
 * Entry names are stored uncompressed, so they can be found in the raw bytes.
 * Macro-enabled documents carry a `vbaProject.bin` and are refused outright.
 */
const detectOfficeDocument = (buffer: Buffer): DetectedFile | null => {
  if (!buffer.includes("[Content_Types].xml")) return null;
  if (buffer.includes("vbaProject.bin")) return null;

  if (buffer.includes("word/document.xml")) {
    return {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: "docx",
    };
  }

  if (buffer.includes("xl/workbook.xml")) {
    return {
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: "xlsx",
    };
  }

  return null;
};

/** Markup that a browser (or an overly helpful viewer) might execute. */
const MARKUP_PREFIX = /^\s*<(?:!doctype|html|head|body|script|svg|\?xml|iframe|object|embed)\b/i;

/**
 * Plain text is the one type with no magic bytes, so it is accepted only when
 * the respondent named it `.txt` or `.csv`, it decodes as UTF-8 with no NUL
 * bytes (so it is not a binary in disguise), and it does not open like a web
 * page.
 */
const detectText = (buffer: Buffer, fileName: string): DetectedFile | null => {
  const ext = extensionOf(fileName);
  if (ext !== "txt" && ext !== "csv") return null;
  if (buffer.includes(0)) return null;

  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }

  if (MARKUP_PREFIX.test(text.replace(/^﻿/, ""))) return null;

  return ext === "csv" ? { mime: "text/csv", ext: "csv" } : { mime: "text/plain", ext: "txt" };
};

/**
 * The file's real type if it is one we accept, otherwise null.
 *
 * `fileName` is consulted only to tell `.csv` from `.txt`; for every other
 * type the bytes alone decide.
 */
export const detectAllowedFile = (buffer: Buffer, fileName: string): DetectedFile | null => {
  if (buffer.length === 0) return null;

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", ext: "png" };
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (startsWith(buffer, ascii("GIF87a")) || startsWith(buffer, ascii("GIF89a"))) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (startsWith(buffer, ascii("RIFF")) && startsWith(buffer, ascii("WEBP"), 8)) {
    return { mime: "image/webp", ext: "webp" };
  }
  if (startsWith(buffer, ascii("%PDF-"))) {
    return { mime: "application/pdf", ext: "pdf" };
  }
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return detectOfficeDocument(buffer);
  }

  return detectText(buffer, fileName);
};
