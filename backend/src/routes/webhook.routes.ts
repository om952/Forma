import { Router } from "express";

import {
  createWebhook,
  deleteWebhook,
  getWebhooks,
  listDeadLetters,
  replayDeadLetter,
  testWebhook,
  updateWebhook,
} from "../controllers/webhook.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";

const router = Router();

router.get(
  "/:formId/dead-letters",
  authMiddleware,
  requireRole("OWNER", "ADMIN"),
  listDeadLetters
);
router.post(
  "/dead-letters/:deadLetterId/replay",
  authMiddleware,
  requireRole("OWNER", "ADMIN"),
  replayDeadLetter
);

router.get("/:formId", authMiddleware, getWebhooks);
router.post("/:formId", authMiddleware, requireRole("OWNER", "ADMIN"), createWebhook);
router.patch("/:webhookId", authMiddleware, requireRole("OWNER", "ADMIN"), updateWebhook);
router.delete("/:webhookId", authMiddleware, requireRole("OWNER", "ADMIN"), deleteWebhook);
router.post("/:webhookId/test", authMiddleware, requireRole("OWNER", "ADMIN"), testWebhook);

export default router;
