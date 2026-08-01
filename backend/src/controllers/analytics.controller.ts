import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { isFieldVisible, type FormField } from "../types/formSchema";

type AnalyticsParams = {
  formId?: string;
};

type DailyRow = {
  date: Date;
  count: number;
};

export const getFormAnalytics = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { formId } = req.params as AnalyticsParams;

    if (!formId) {
      return res.status(400).json({ message: "formId is required" });
    }

    const form = await req.db.form.findFirst({
      where: {
        id: formId,
        orgId: req.user.orgId,
      },
      select: {
        id: true,
        schema: true,
        organization: { select: { tier: true } },
      },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    if (form.organization.tier === "FREE") {
      return res.status(403).json({
        message:
          "Analytics is a Premium feature. Upgrade to unlock drop-off rates, heatmaps, and full submission history.",
        code: "UPGRADE_REQUIRED",
      });
    }

    const schema = form.schema as FormField[];

    const totalResponses = await req.db.response.count({
      where: {
        formId,
        orgId: req.user.orgId,
      },
    });

    const responses = await req.db.response.findMany({
      where: {
        formId,
        orgId: req.user.orgId,
      },
      select: {
        id: true,
        payload: true,
        submittedAt: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 1000,
    });

    const fieldStats = schema.map((field) => {
      let shown = 0;
      let filled = 0;

      for (const response of responses) {
        const payload = response.payload as Record<string, string>;
        if (isFieldVisible(field, payload)) {
          shown += 1;
          const value = payload[field.id] ?? "";
          if (value && value.trim() !== "") {
            filled += 1;
          }
        }
      }

      const dropOff = shown > 0 ? ((shown - filled) / shown) * 100 : 0;

      return {
        fieldId: field.id,
        label: field.label,
        type: field.type,
        shown,
        filled,
        dropOff: Math.round(dropOff * 100) / 100,
      };
    });

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 6);
    startDate.setUTCHours(0, 0, 0, 0);

    const dailyRows = await prisma.$queryRaw<DailyRow[]>(Prisma.sql`
      SELECT date_trunc('day', "submittedAt") AS date, COUNT(*)::int AS count
      FROM "Response"
      WHERE "formId" = ${formId}
        AND "orgId" = ${req.user.orgId}
        AND "submittedAt" >= ${startDate}
      GROUP BY 1
      ORDER BY 1
    `);

    const countsByDate = new Map(
      dailyRows.map((row) => [row.date.toISOString().slice(0, 10), row.count])
    );

    const series = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setUTCDate(startDate.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);

      return {
        date: key,
        count: countsByDate.get(key) ?? 0,
      };
    });

    return res.json({
      formId,
      totalResponses,
      fieldStats,
      series,
    });
  } catch (error) {
    console.error("getFormAnalytics failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
