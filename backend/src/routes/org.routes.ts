import {
  createInvite,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from "../controllers/org.controller";
import { inviteLimiter } from "../middlewares/rateLimit.middleware";
import { changeRoleBody, createInviteBody } from "../validation/account";
import { idParams } from "../validation/common";
import { route, type RouteSpec } from "./define";

/*
 * The signed-in user's own organization. `access` is the coarse gate; who may
 * act on whom is decided in utils/orgRoles.ts.
 */
export const orgRoutes: RouteSpec[] = [
  route({
    method: "get",
    path: "/members",
    summary: "List the organization's members",
    access: "user",
    responses: { 200: "The members, oldest first." },
    handler: listMembers,
  }),
  route({
    method: "patch",
    path: "/members/:userId",
    summary: "Change a member's role",
    description: "The last owner cannot be demoted.",
    access: ["OWNER"],
    request: { params: idParams("userId"), body: changeRoleBody },
    responses: {
      200: "The updated member.",
      404: "No such member.",
      409: "That would leave the organization without an owner.",
    },
    handler: updateMemberRole,
  }),
  route({
    method: "delete",
    path: "/members/:userId",
    summary: "Remove a member",
    description:
      "Deletes their account; forms they created pass to whoever removed them. Admins may remove members only, and nobody removes themselves.",
    access: ["OWNER", "ADMIN"],
    request: { params: idParams("userId") },
    responses: {
      204: "Removed.",
      400: "You cannot remove yourself.",
      404: "No such member.",
      409: "That would leave the organization without an owner.",
    },
    handler: removeMember,
  }),
  route({
    method: "get",
    path: "/invites",
    summary: "List pending invitations",
    access: ["OWNER", "ADMIN"],
    responses: { 200: "Invitations not yet accepted or expired, newest first." },
    handler: listInvites,
  }),
  route({
    method: "post",
    path: "/invites",
    summary: "Invite someone by email",
    description:
      "Owners invite admins and members, admins invite members. Replaces any pending invitation to the same address. With email off, the response carries `inviteUrl` to share by hand.",
    access: ["OWNER", "ADMIN"],
    middleware: [inviteLimiter],
    request: { body: createInviteBody },
    responses: {
      201: "`{ invite, inviteUrl? }`.",
      409: "The address is already a member.",
      429: "Too many invitations sent recently.",
    },
    handler: createInvite,
  }),
  route({
    method: "delete",
    path: "/invites/:inviteId",
    summary: "Withdraw a pending invitation",
    access: ["OWNER", "ADMIN"],
    request: { params: idParams("inviteId") },
    responses: { 204: "Withdrawn.", 404: "No such pending invitation." },
    handler: revokeInvite,
  }),
];
