import { Router } from "express";

import { getFormAnalytics } from "../controllers/analytics.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.get("/:formId", authMiddleware, getFormAnalytics);

export default router;
