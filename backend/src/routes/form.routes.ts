import { Router } from "express";

import {
  createForm,
  deleteForm,
  getFormById,
  getForms,
  getPublicForm,
  updateForm,
} from "../controllers/form.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";

const router = Router();

// Public: no auth, used by the form-filling page for anonymous respondents.
router.get("/:id/public", getPublicForm);

router.post("/", authMiddleware, createForm);
router.get("/", authMiddleware, getForms);
router.get("/:id", authMiddleware, getFormById);
router.patch("/:id", authMiddleware, updateForm);
router.delete("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), deleteForm);

export default router;
