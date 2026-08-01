import type { Request, Response } from "express";
import fs from "fs";
import path from "path";

import { Router } from "express";

import { prisma } from "../db/prisma";

const router = Router();

const uploadDir = path.join(__dirname, "../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload endpoint for the public form-filling page.
 *
 * Anonymous respondents have no session, so this cannot sit behind
 * `authMiddleware`. Instead every upload must name a form that exists and is
 * currently accepting submissions — that keeps it from being general-purpose
 * file hosting while still letting a stranger attach a file to a live form.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { formId, fileName, fileData, fileType } = req.body as {
      formId?: string;
      fileName?: string;
      fileData?: string;
      fileType?: string;
    };

    if (!formId || typeof formId !== "string") {
      return res.status(400).json({ message: "formId is required" });
    }

    if (!fileName || !fileData || !fileType) {
      return res.status(400).json({
        message: "fileName, fileData (base64), and fileType are required",
      });
    }

    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: { id: true, orgId: true, isActive: true },
    });

    if (!form || !form.isActive) {
      return res.status(404).json({ message: "Form not found" });
    }

    if (
      !fileType.startsWith("image/") &&
      !fileType.startsWith("application/") &&
      !fileType.startsWith("text/")
    ) {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    const buffer = Buffer.from(fileData, "base64");
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ message: "File size exceeds 5MB limit" });
    }

    // basename() first so a name like "../../x" cannot escape the upload dir.
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueName = `${Date.now()}_${form.orgId}_${safeName}`;
    const filePath = path.join(uploadDir, uniqueName);

    await fs.promises.writeFile(filePath, buffer);

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${uniqueName}`;

    return res.json({
      fileUrl,
      fileName: safeName,
      fileType,
      size: buffer.length,
    });
  } catch (error) {
    console.error("Upload failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
