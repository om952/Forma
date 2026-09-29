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
import {
  accountEmailLimiter,
  authLimiter,
} from "../middlewares/rateLimit.middleware";
import {
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  resetPasswordBody,
  signupBody,
  verifyEmailBody,
} from "../validation/account";
import { route, type RouteSpec } from "./define";

const SESSION = "`{ token, user }`: a JWT for the `Authorization: Bearer` header, and the user.";
const THROTTLED = "Too many attempts from this address; try again later.";

export const authRoutes: RouteSpec[] = [
  route({
    method: "post",
    path: "/signup",
    summary: "Create an organization and its first owner",
    description: "Also emails a link to confirm the address.",
    access: "public",
    middleware: [authLimiter],
    request: { body: signupBody },
    responses: {
      201: `${SESSION} Also returns the new organization.`,
      409: "An organization with that name already exists.",
      429: THROTTLED,
    },
    handler: signup,
  }),
  route({
    method: "post",
    path: "/login",
    summary: "Sign in",
    description:
      "An address may have accounts in several organizations. If the password opens more than one, the answer is 409 `ORGANIZATION_REQUIRED`: send `organizationName` too.",
    access: "public",
    middleware: [authLimiter],
    request: { body: loginBody },
    responses: {
      200: SESSION,
      401: "Invalid credentials.",
      409: "Several accounts match; the organization is needed (`code: ORGANIZATION_REQUIRED`).",
      429: THROTTLED,
    },
    handler: login,
  }),
  route({
    method: "get",
    path: "/me",
    summary: "The signed-in user and their organization",
    access: "user",
    responses: { 200: "`{ user, organization }`, read fresh from the database." },
    handler: me,
  }),
  route({
    method: "post",
    path: "/change-password",
    summary: "Change the password and sign out every other session",
    access: "user",
    middleware: [authLimiter],
    request: { body: changePasswordBody },
    responses: {
      200: "`{ message, token }`: a new token for this session.",
      400: "The current password is wrong, or the new one is not allowed.",
      429: THROTTLED,
    },
    handler: changePassword,
  }),
  route({
    method: "post",
    path: "/logout-all",
    summary: "Sign out everywhere, this session included",
    access: "user",
    responses: { 204: "Every token issued so far is revoked." },
    handler: logoutEverywhere,
  }),
  route({
    method: "post",
    path: "/forgot-password",
    summary: "Email a password reset link",
    description:
      "Always the same answer, whether or not the address has an account. The link is valid for 1 hour and works once.",
    access: "public",
    middleware: [accountEmailLimiter],
    request: { body: forgotPasswordBody },
    responses: { 200: "Accepted.", 429: THROTTLED },
    handler: forgotPassword,
  }),
  route({
    method: "post",
    path: "/reset-password",
    summary: "Set a new password with a reset link's token",
    description: "Signs out every existing session.",
    access: "public",
    middleware: [authLimiter],
    request: { body: resetPasswordBody },
    responses: { 200: "Password changed.", 400: "The link is invalid, used or expired.", 429: THROTTLED },
    handler: resetPassword,
  }),
  route({
    method: "post",
    path: "/verify-email",
    summary: "Confirm an email address with a link's token",
    access: "public",
    middleware: [authLimiter],
    request: { body: verifyEmailBody },
    responses: { 200: "Confirmed.", 400: "The link is invalid, used or expired.", 429: THROTTLED },
    handler: verifyEmail,
  }),
  route({
    method: "post",
    path: "/resend-verification",
    summary: "Email a new confirmation link",
    access: "user",
    middleware: [accountEmailLimiter],
    responses: { 200: "Sent, or already confirmed.", 429: "A link went out less than a minute ago." },
    handler: resendVerification,
  }),
];
