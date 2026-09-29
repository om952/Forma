import {
  createForm,
  deleteForm,
  getFormById,
  getForms,
  getFormsSummary,
  getPublicForm,
  updateForm,
} from "../controllers/form.controller";
import {
  recordFieldReached,
  startFormSession,
} from "../controllers/formSession.controller";
import { trackingLimiter } from "../middlewares/rateLimit.middleware";
import { idParams, paginationQuery } from "../validation/common";
import { createFormBody, updateFormBody } from "../validation/forms";
import { fieldReachedBody } from "../validation/misc";
import { route, type RouteSpec } from "./define";

const formParams = idParams("id");

export const formRoutes: RouteSpec[] = [
  // Before "/:id", which would otherwise match "summary".
  route({
    method: "get",
    path: "/summary",
    summary: "Dashboard totals: forms, active forms and responses",
    access: "user",
    responses: { 200: "`{ forms, activeForms, responses }`." },
    handler: getFormsSummary,
  }),
  route({
    method: "get",
    path: "/",
    summary: "List the organization's forms, newest first",
    access: "user",
    request: { query: paginationQuery },
    responses: { 200: "A page of forms: `{ items, nextCursor }`." },
    handler: getForms,
  }),
  route({
    method: "post",
    path: "/",
    summary: "Create a form",
    access: "user",
    request: { body: createFormBody },
    responses: {
      201: "Created.",
      403: "The Free plan's 3-form limit is reached.",
    },
    handler: createForm,
  }),
  route({
    method: "get",
    path: "/:id",
    summary: "Get a form with its schema",
    access: "user",
    request: { params: formParams },
    responses: { 200: "The form.", 404: "No such form in this organization." },
    handler: getFormById,
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Update a form's title, schema, thank-you message or status",
    access: "user",
    request: { params: formParams, body: updateFormBody },
    responses: { 200: "The updated form.", 404: "No such form in this organization." },
    handler: updateForm,
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete a form and its responses",
    access: ["OWNER", "ADMIN"],
    request: { params: formParams },
    responses: { 200: "Deleted.", 404: "No such form in this organization." },
    handler: deleteForm,
  }),
  route({
    method: "get",
    path: "/:id/public",
    summary: "What a respondent needs to fill in the form",
    access: "public",
    request: { params: formParams },
    responses: {
      200: "The form's title, fields and thank-you message.",
      403: "The form is not accepting submissions.",
      404: "No such form.",
    },
    handler: getPublicForm,
  }),
  route({
    method: "post",
    path: "/:id/sessions",
    summary: "Record that someone opened the form",
    description:
      "Starts an anonymous visit for the analytics funnel. Send the returned `sessionId` with progress reports, and as the `X-Form-Session` header when submitting.",
    access: "public",
    middleware: [trackingLimiter],
    request: { params: formParams },
    responses: {
      201: "`{ sessionId }`.",
      404: "No such form, or it is not accepting submissions.",
      429: "Too many requests for this form from this address.",
    },
    handler: startFormSession,
  }),
  route({
    method: "post",
    path: "/:id/sessions/:sessionId/fields",
    summary: "Record that the respondent reached a field",
    access: "public",
    middleware: [trackingLimiter],
    request: { params: idParams("id", "sessionId"), body: fieldReachedBody },
    responses: {
      204: "Recorded.",
      404: "Unknown session or field, or the visit already ended in a submission.",
      429: "Too many requests for this form from this address.",
    },
    handler: recordFieldReached,
  }),
];
