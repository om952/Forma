import { Router } from "express";

import { submitForm } from "../controllers/response.controller";

const router = Router();

router.post("/:formId", submitForm);

export default router;
