import { Router } from "express";

import {
  exportResponsesCsv,
  getFormResponses,
  submitForm,
} from "../controllers/response.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { submissionLimiter } from "../middlewares/rateLimit.middleware";

const router = Router();

router.post("/:formId", submissionLimiter, submitForm);
router.get("/:formId/export", authMiddleware, exportResponsesCsv);
router.get("/:formId", authMiddleware, getFormResponses);

export default router;
