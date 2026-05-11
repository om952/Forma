import { Router } from "express";

import { createOrder, handleWebhook } from "../controllers/payment.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/create-order", authMiddleware, createOrder);
router.post("/webhook", handleWebhook);

export default router;
