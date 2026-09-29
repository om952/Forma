import { Router } from "express";

import {
  createInvite,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from "../controllers/org.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { inviteLimiter } from "../middlewares/rateLimit.middleware";
import { requireRole } from "../middlewares/rbac.middleware";

/**
 * The signed-in user's own organization. `requireRole` is the coarse gate;
 * who may act on whom is decided in `utils/orgRoles.ts`.
 */
const router = Router();

router.use(authMiddleware);

router.get("/members", listMembers);
router.patch("/members/:userId", requireRole("OWNER"), updateMemberRole);
router.delete("/members/:userId", requireRole("OWNER", "ADMIN"), removeMember);

router.get("/invites", requireRole("OWNER", "ADMIN"), listInvites);
router.post("/invites", requireRole("OWNER", "ADMIN"), inviteLimiter, createInvite);
router.delete("/invites/:inviteId", requireRole("OWNER", "ADMIN"), revokeInvite);

export default router;
