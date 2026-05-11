import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

import { prisma } from "../db/prisma";

type AnalyticsParams = {
  formId?: string;
};

type DailyRow = {
  date: Date;
  count: number;
};

export const getFormAnalytics = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { formId } = req.params as AnalyticsParams;

    if (!formId) {
      return res.status(400).json({ message: "formId is required" });
    }

    const form = await prisma.form.findFirst({
      where: {
        id: formId,
        orgId: req.user.orgId,
      },
      select: { id: true },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    const totalResponses = await prisma.response.count({
      where: {
        formId,
        orgId: req.user.orgId,
      },
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
      series,
    });
  } catch (error) {
    console.error("getFormAnalytics failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
