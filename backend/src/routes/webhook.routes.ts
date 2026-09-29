import {
  createWebhook,
  deleteWebhook,
  getWebhooks,
  listDeadLetters,
  replayDeadLetter,
  testWebhook,
  updateWebhook,
} from "../controllers/webhook.controller";
import { idParams, paginationQuery } from "../validation/common";
import {
  createWebhookBody,
  listWebhooksQuery,
  updateWebhookBody,
} from "../validation/webhooks";
import { route, type RouteSpec } from "./define";

const MANAGERS = ["OWNER", "ADMIN"] as const;

export const webhookRoutes: RouteSpec[] = [
  route({
    method: "get",
    path: "/:formId/dead-letters",
    summary: "List deliveries that failed every retry, newest first",
    access: MANAGERS,
    request: { params: idParams("formId"), query: paginationQuery },
    responses: {
      200: "`{ items, nextCursor }`.",
      404: "No such form in this organization.",
    },
    handler: listDeadLetters,
  }),
  route({
    method: "post",
    path: "/dead-letters/:deadLetterId/replay",
    summary: "Queue a failed delivery again",
    access: MANAGERS,
    request: { params: idParams("deadLetterId") },
    responses: { 200: "Re-queued.", 404: "No such failed delivery in this organization." },
    handler: replayDeadLetter,
  }),
  route({
    method: "get",
    path: "/",
    summary: "List a form's webhooks",
    access: "user",
    request: { query: listWebhooksQuery },
    responses: { 200: "The webhooks.", 404: "No such form in this organization." },
    handler: getWebhooks,
  }),
  route({
    method: "post",
    path: "/",
    summary: "Add a webhook to a form",
    description:
      "Slack and Zapier URLs get payloads shaped for them. Internal and private addresses are refused.",
    access: MANAGERS,
    request: { body: createWebhookBody },
    responses: {
      201: "Created.",
      400: "The URL is invalid or points somewhere Forma won't call.",
      404: "No such form in this organization.",
    },
    handler: createWebhook,
  }),
  route({
    method: "patch",
    path: "/:webhookId",
    summary: "Change a webhook's URL or pause it",
    access: MANAGERS,
    request: { params: idParams("webhookId"), body: updateWebhookBody },
    responses: {
      200: "The updated webhook.",
      400: "The URL is invalid or points somewhere Forma won't call.",
      404: "No such webhook in this organization.",
    },
    handler: updateWebhook,
  }),
  route({
    method: "delete",
    path: "/:webhookId",
    summary: "Delete a webhook",
    access: MANAGERS,
    request: { params: idParams("webhookId") },
    responses: { 200: "Deleted.", 404: "No such webhook in this organization." },
    handler: deleteWebhook,
  }),
  route({
    method: "post",
    path: "/:webhookId/test",
    summary: "Send a sample payload to a webhook",
    access: MANAGERS,
    request: { params: idParams("webhookId") },
    responses: { 200: "Queued.", 404: "No such webhook in this organization." },
    handler: testWebhook,
  }),
];
