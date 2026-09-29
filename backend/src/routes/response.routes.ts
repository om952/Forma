import {
  exportResponsesCsv,
  getFormResponses,
  submitForm,
} from "../controllers/response.controller";
import { submissionLimiter } from "../middlewares/rateLimit.middleware";
import { idParams, paginationQuery } from "../validation/common";
import { submissionBody } from "../validation/forms";
import { route, type RouteSpec } from "./define";

const formParams = idParams("formId");

export const responseRoutes: RouteSpec[] = [
  route({
    method: "post",
    path: "/:formId",
    summary: "Submit a response to a form",
    description:
      "Answers keyed by field id, all strings. Send the visit's id as the `X-Form-Session` header to count the submission in the funnel.",
    access: "public",
    middleware: [submissionLimiter],
    request: { params: formParams, body: submissionBody },
    responses: {
      201: "Stored; webhooks and emails are queued.",
      404: "No such form, or it is not accepting submissions.",
      429: "Too many submissions from this address.",
    },
    handler: submitForm,
  }),
  route({
    method: "get",
    path: "/:formId/export",
    summary: "Download every response as CSV",
    access: "user",
    request: { params: formParams },
    responses: { 200: "A CSV file.", 404: "No such form in this organization." },
    handler: exportResponsesCsv,
  }),
  route({
    method: "get",
    path: "/:formId",
    summary: "List a form's responses, newest first",
    access: "user",
    request: { params: formParams, query: paginationQuery },
    responses: {
      200: "`{ items, nextCursor, total }`.",
      404: "No such form in this organization.",
    },
    handler: getFormResponses,
  }),
];
