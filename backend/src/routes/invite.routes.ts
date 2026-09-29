import { Router } from "express";

import { acceptInvite, lookupInvite } from "../controllers/invite.controller";
import { authLimiter } from "../middlewares/rateLimit.middleware";

/** Public: the invitee has no account yet. See `invite.controller.ts`. */
const router = Router();

router.post("/lookup", authLimiter, lookupInvite);
router.post("/accept", authLimiter, acceptInvite);

export default router;
