import { getFormAnalytics } from "../controllers/analytics.controller";
import { idParams } from "../validation/common";
import { analyticsQuery } from "../validation/misc";
import { route, type RouteSpec } from "./define";

export const analyticsRoutes: RouteSpec[] = [
  route({
    method: "get",
    path: "/:formId",
    summary: "A form's funnel, per-field drop-off, daily series and heatmap",
    description:
      "Premium only. `days` picks the window (7, 30 or 90) and `timeZone` the calendar it is counted in. The funnel and drop-off come from visits to the public form; skip rates, the series and the heatmap from submissions.",
    access: "user",
    request: { params: idParams("formId"), query: analyticsQuery },
    responses: {
      200: "The analytics.",
      403: "The organization is on the Free plan (`code: UPGRADE_REQUIRED`).",
      404: "No such form in this organization.",
    },
    handler: getFormAnalytics,
  }),
];
