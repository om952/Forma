import type { Request, Response } from "express";

import { prisma } from "../db/prisma";

type CreateFormBody = {
  title?: string;
  schema?: unknown;
  thankYouMessage?: string;
};

const normalizeThankYou = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const isSchemaArray = (value: unknown): value is Array<Record<string, unknown>> =>
  Array.isArray(value);

export const createForm = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { title, schema, thankYouMessage } = req.body as CreateFormBody;

    if (!title || !schema) {
      return res.status(400).json({ message: "title and schema are required" });
    }

    if (!isSchemaArray(schema)) {
      return res.status(400).json({ message: "schema must be an array" });
    }

    const [organization, formCount] = await req.db.$transaction([
      req.db.organization.findUnique({
        where: { id: req.user.orgId },
        select: { tier: true },
      }),
      req.db.form.count({
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

    const form = await req.db.form.create({
      data: {
        name: String(title),
        schema: schema as any,
        thankYouMessage: normalizeThankYou(thankYouMessage),
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

export const getForms = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const forms = await req.db.form.findMany({
      where: { orgId: req.user.orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { responses: true },
        },
      },
    });

    return res.json(forms);
  } catch (error) {
    console.error("getForms failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getFormById = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params as { id: string };

    if (!id || typeof id !== "string") {
      return res.status(400).json({ message: "id is required" });
    }

    const form = await req.db.form.findFirst({
      where: {
        id: id,
        orgId: req.user.orgId,
      },
      select: {
        id: true,
        name: true,
        schema: true,
        thankYouMessage: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { responses: true },
        },
      },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    return res.json(form);
  } catch (error) {
    console.error("getFormById failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Unauthenticated fetch used by the public form-filling page. Looks a form up by
 * id alone — there is no caller org to scope by — so it deliberately uses the
 * raw `prisma` client rather than `req.db`, and returns only the fields a
 * respondent needs to render and submit the form.
 */
export const getPublicForm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    if (!id || typeof id !== "string") {
      return res.status(400).json({ message: "id is required" });
    }

    const form = await prisma.form.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        schema: true,
        thankYouMessage: true,
        isActive: true,
      },
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    if (!form.isActive) {
      return res
        .status(403)
        .json({ message: "This form is not accepting submissions" });
    }

    return res.json(form);
  } catch (error) {
    console.error("getPublicForm failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateForm = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params as { id: string };
    const { title, schema, isActive, thankYouMessage } = req.body;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ message: "id is required" });
    }

    const existing = await req.db.form.findFirst({
      where: { id: id, orgId: req.user.orgId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Form not found" });
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.name = String(title);
    if (schema !== undefined) data.schema = schema;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (thankYouMessage !== undefined) {
      data.thankYouMessage = normalizeThankYou(thankYouMessage);
    }

    const form = await req.db.form.update({
      where: { id: id },
      data,
      select: {
        id: true,
        name: true,
        schema: true,
        thankYouMessage: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json(form);
  } catch (error) {
    console.error("updateForm failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteForm = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.db) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params as { id: string };

    if (!id || typeof id !== "string") {
      return res.status(400).json({ message: "id is required" });
    }

    const existing = await req.db.form.findFirst({
      where: { id: id, orgId: req.user.orgId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Form not found" });
    }

    await req.db.form.delete({ where: { id: id } });

    return res.json({ message: "Form deleted" });
  } catch (error) {
    console.error("deleteForm failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
