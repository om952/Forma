import type { Request, Response } from "express";
import { Router } from "express";

import { isValidFileKey, storage } from "../storage";

const router = Router();

/**
 * Serves an uploaded file as a download.
 *
 * Unauthenticated by design: these links are sent to Slack, Zapier and email
 * where no session exists. The key carries a random UUID, so the link itself
 * is the credential — the same model as before, now independent of where the
 * bytes are stored.
 */
router.get("/forms/:formId/:fileName", async (req: Request, res: Response) => {
  const { formId, fileName } = req.params as { formId: string; fileName: string };
  const key = `forms/${formId}/${fileName}`;

  if (!isValidFileKey(key)) {
    return res.status(404).json({ message: "File not found" });
  }

  // The file was uploaded by an anonymous respondent. Never render it: force a
  // download, stop MIME sniffing, and neuter anything it might try to run.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

  try {
    const found = await storage.send(key, res);

    if (!found) {
      return res.status(404).json({ message: "File not found" });
    }
  } catch (error) {
    req.log.error({ err: error, key }, "Serving file failed");

    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
});

export default router;
