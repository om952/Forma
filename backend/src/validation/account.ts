import { z } from "zod";

import { normalizeEmail } from "../utils/accountInput";
import {
  emailSchema,
  idSchema,
  newPasswordSchema,
  orgRoleSchema,
  tokenSchema,
} from "./common";

const organizationNameSchema = z.string().trim().min(1, "must not be empty").max(100);

export const signupBody = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  organizationName: organizationNameSchema,
});

/**
 * Login checks presence only: a malformed address or short password gets the
 * same "Invalid credentials" as a wrong one, so the rules can change without
 * locking anyone out.
 */
export const loginBody = z.object({
  email: z.string().max(254).transform(normalizeEmail),
  password: z.string().min(1, "is required").max(200),
  organizationId: idSchema.optional(),
  organizationName: z.string().max(100).optional(),
});

export const forgotPasswordBody = z.object({
  email: emailSchema,
  organizationName: z.string().max(100).optional(),
});

export const resetPasswordBody = z.object({
  token: tokenSchema,
  password: newPasswordSchema,
});

export const verifyEmailBody = z.object({ token: tokenSchema });

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, "is required").max(200),
  newPassword: newPasswordSchema,
});

export const createInviteBody = z.object({
  email: emailSchema,
  role: orgRoleSchema,
});

export const changeRoleBody = z.object({ role: orgRoleSchema });

export const inviteLookupBody = z.object({ token: tokenSchema });

export const acceptInviteBody = z.object({
  token: tokenSchema,
  password: newPasswordSchema,
  name: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || null),
});
