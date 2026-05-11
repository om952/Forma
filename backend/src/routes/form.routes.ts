import { Router } from "express";

import { createForm } from "../controllers/form.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/", authMiddleware, createForm);

export default router;
