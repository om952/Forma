import { Router } from "express";

import {
  cancelSubscription,
  createOrder,
  createSubscription,
  getSubscriptionStatus,
  handleWebhook,
} from "../controllers/payment.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";

const router = Router();

router.get("/status", authMiddleware, getSubscriptionStatus);
router.post("/create-order", authMiddleware, createOrder);
router.post("/create-subscription", authMiddleware, requireRole("OWNER", "ADMIN"), createSubscription);
router.post("/cancel-subscription", authMiddleware, requireRole("OWNER", "ADMIN"), cancelSubscription);
router.post("/webhook", handleWebhook);

export default router;
