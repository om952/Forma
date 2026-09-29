import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import path from "path";

import { prisma } from "../db/prisma";
import { uploadLimiter } from "../middlewares/rateLimit.middleware";
import { buildFileKey, fileUrlFor, storage } from "../storage";
import { detectAllowedFile } from "../utils/fileType";
import { uploadBody } from "../validation/misc";
import { route, type RouteSpec } from "./define";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload endpoint for the public form-filling page.
 *
 * Anonymous respondents have no session, so this cannot sit behind
 * `authMiddleware`. Instead every upload must name a form that exists and is
 * currently accepting submissions — that keeps it from being general-purpose
 * file hosting while still letting a stranger attach a file to a live form.
 */
const uploadFile = async (req: Request, res: Response) => {
  try {
    // `fileType` may still be sent by older clients; it is never trusted.
    const { formId, fileName, fileData } = req.body as {
      formId?: unknown;
      fileName?: unknown;
      fileData?: unknown;
    };

    if (!formId || typeof formId !== "string") {
      return res.status(400).json({ message: "formId is required" });
    }

    if (
      !fileName ||
      typeof fileName !== "string" ||
      !fileData ||
      typeof fileData !== "string"
    ) {
      return res.status(400).json({
        message: "fileName and fileData (base64) are required",
      });
    }

    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: { id: true, orgId: true, isActive: true },
    });

    if (!form || !form.isActive) {
      return res.status(404).json({ message: "Form not found" });
    }

    const buffer = Buffer.from(fileData, "base64");
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ message: "File size exceeds 5MB limit" });
    }

    // Only the last path segment of whatever the browser sent is used.
    const originalName = path.basename(fileName);
    const detected = detectAllowedFile(buffer, originalName);

    if (!detected) {
      return res.status(415).json({
        message:
          "Unsupported file type. Upload an image (PNG, JPEG, GIF, WebP), a PDF, a Word or Excel document, or a .txt/.csv file.",
        code: "UNSUPPORTED_FILE_TYPE",
      });
    }

    // Stored under the extension of what the bytes are, whatever it was called.
    const baseName = originalName
      .replace(/\.[^.]*$/, "")
      .replace(/[^a-zA-Z0-9-]/g, "_")
      .slice(0, 80);
    const safeName = `${baseName || "file"}.${detected.ext}`;
    // The link is the only thing protecting the file, so the key has to be
    // unguessable: a timestamp and org id would let anyone enumerate other
    // respondents' attachments.
    const key = buildFileKey(form.id, randomUUID(), safeName);

    await storage.put(key, buffer, detected.mime);

    return res.json({
      fileUrl: fileUrlFor(key),
      fileName: safeName,
      fileType: detected.mime,
      size: buffer.length,
    });
  } catch (error) {
    req.log.error({ err: error }, "Upload failed");
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const uploadRoutes: RouteSpec[] = [
  route({
    method: "post",
    path: "/",
    summary: "Upload a file for a form field",
    description:
      "Anonymous, for respondents: the form must exist and be accepting submissions. The file arrives base64-encoded in JSON; its type is read from its bytes, and only images, PDFs, Word and Excel documents and .txt/.csv files are accepted. Returns the link to submit as the field's answer.",
    access: "public",
    middleware: [uploadLimiter],
    request: { body: uploadBody },
    responses: {
      200: "`{ fileUrl, fileName, fileType, size }`.",
      400: "Larger than 5MB.",
      404: "No such form, or it is not accepting submissions.",
      415: "Not an accepted file type.",
      429: "Too many uploads from this address.",
    },
    handler: uploadFile,
  }),
];
