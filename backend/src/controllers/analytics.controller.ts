import type { Request, Response } from "express";
import type { z } from "zod";

import { computeFormAnalytics } from "../services/formAnalytics";
import type { FormField } from "../types/formSchema";
import { HttpError } from "../utils/httpError";
import type { analyticsQuery } from "../validation/misc";

export const getFormAnalytics = async (req: Request, res: Response) => {
  const { formId } = req.params as { formId: string };
  const { days, timeZone } = req.query as unknown as z.output<typeof analyticsQuery>;

  const form = await req.db!.form.findFirst({
    where: { id: formId },
    select: {
      id: true,
      schema: true,
      organization: { select: { tier: true } },
    },
  });

  if (!form) throw new HttpError(404, "Form not found");

  if (form.organization.tier === "FREE") {
    return res.status(403).json({
      message:
        "Analytics is a Premium feature. Upgrade to unlock drop-off rates, heatmaps, and full submission history.",
      code: "UPGRADE_REQUIRED",
    });
  }

  const [analytics, totalResponses] = await Promise.all([
    computeFormAnalytics({
      formId: form.id,
      orgId: req.user!.orgId,
      schema: (form.schema ?? []) as FormField[],
      days,
      timeZone,
    }).catch((error: unknown) => {
      // The zone passed Node's check but Postgres's time zone database, which
      // can differ in version, does not know it.
      if (error instanceof Error && /time zone .* not recognized/i.test(error.message)) {
        throw new HttpError(400, "timeZone: is not a known time zone");
      }
      throw error;
    }),
    req.db!.response.count({ where: { formId: form.id } }),
  ]);

  return res.json({ formId: form.id, totalResponses, ...analytics });
};
