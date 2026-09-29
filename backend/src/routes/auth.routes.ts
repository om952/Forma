import { Router } from "express";
import {
  changePassword,
  forgotPassword,
  login,
  logoutEverywhere,
  me,
  resendVerification,
  resetPassword,
  signup,
  verifyEmail,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  accountEmailLimiter,
  authLimiter,
} from "../middlewares/rateLimit.middleware";

const router = Router();

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);

router.get("/me", authMiddleware, me);
router.post("/change-password", authMiddleware, authLimiter, changePassword);
router.post("/logout-all", authMiddleware, logoutEverywhere);

// Token endpoints count failed attempts against the auth budget, which is what
// stops anyone guessing tokens.
router.post("/forgot-password", accountEmailLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/verify-email", authLimiter, verifyEmail);
router.post(
  "/resend-verification",
  authMiddleware,
  accountEmailLimiter,
  resendVerification
);

export default router;
