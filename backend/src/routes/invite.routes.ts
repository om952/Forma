import { acceptInvite, lookupInvite } from "../controllers/invite.controller";
import { authLimiter } from "../middlewares/rateLimit.middleware";
import { acceptInviteBody, inviteLookupBody } from "../validation/account";
import { route, type RouteSpec } from "./define";

/* The invitee's side: they have no account yet. See invite.controller.ts. */
export const inviteRoutes: RouteSpec[] = [
  route({
    method: "post",
    path: "/lookup",
    summary: "What an invitation is for",
    description: "The token comes from the invite link's fragment and goes in the body, never the URL.",
    access: "public",
    middleware: [authLimiter],
    request: { body: inviteLookupBody },
    responses: {
      200: "`{ email, role, organization, invitedBy, expiresAt }`.",
      404: "The invitation is invalid, used or expired.",
      409: "The address is already a member.",
    },
    handler: lookupInvite,
  }),
  route({
    method: "post",
    path: "/accept",
    summary: "Accept an invitation and create the account",
    access: "public",
    middleware: [authLimiter],
    request: { body: acceptInviteBody },
    responses: {
      201: "`{ token, user, organization }`: signed in.",
      404: "The invitation is invalid, used or expired.",
      409: "The address is already a member.",
    },
    handler: acceptInvite,
  }),
];
