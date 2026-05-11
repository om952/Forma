import type { Request, Response } from "express";

import { prisma } from "../db/prisma";

type CreateFormBody = {
  title?: string;
  schema?: unknown;
};

const isSchemaArray = (value: unknown): value is Array<Record<string, unknown>> =>
  Array.isArray(value);

export const createForm = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { title, schema } = req.body as CreateFormBody;

    if (!title || !schema) {
      return res.status(400).json({ message: "title and schema are required" });
    }

    if (!isSchemaArray(schema)) {
      return res.status(400).json({ message: "schema must be an array" });
    }

    const [organization, formCount] = await prisma.$transaction([
      prisma.organization.findUnique({
        where: { id: req.user.orgId },
        select: { tier: true },
      }),
      prisma.form.count({
        where: { orgId: req.user.orgId },
      }),
    ]);

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (organization.tier === "FREE" && formCount >= 3) {
      return res.status(403).json({
        message: "Free tier allows up to 3 forms. Upgrade to create more.",
      });
    }

    const form = await prisma.form.create({
      data: {
        name: String(title),
        schema,
        orgId: req.user.orgId,
        createdById: req.user.id,
      },
    });

    return res.status(201).json({
      id: form.id,
      name: form.name,
      orgId: form.orgId,
      createdAt: form.createdAt,
    });
  } catch (error) {
    console.error("createForm failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
