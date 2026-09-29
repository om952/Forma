import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import type { z } from "zod";

import { prisma } from "../db/prisma";
import { HttpError } from "../utils/httpError";
import { pageArgs, pageOf } from "../utils/pagination";
import type { Pagination } from "../validation/common";
import type { createFormBody, updateFormBody } from "../validation/forms";

/*
 * Inputs arrive already validated and parsed by the route declarations in
 * routes/form.routes.ts, so handlers read them with a plain type assertion.
 */

const FREE_FORM_LIMIT = 3;

export const createForm = async (req: Request, res: Response) => {
  const { title, schema, thankYouMessage } = req.body as z.output<typeof createFormBody>;

  const [organization, formCount] = await req.db!.$transaction([
    req.db!.organization.findUnique({
      where: { id: req.user!.orgId },
      select: { tier: true },
    }),
    req.db!.form.count({}),
  ]);

  if (!organization) throw new HttpError(404, "Organization not found");

  if (organization.tier === "FREE" && formCount >= FREE_FORM_LIMIT) {
    throw new HttpError(
      403,
      `Free tier allows up to ${FREE_FORM_LIMIT} forms. Upgrade to create more.`
    );
  }

  const form = await req.db!.form.create({
    data: {
      name: title,
      schema: schema as Prisma.InputJsonValue,
      thankYouMessage,
      orgId: req.user!.orgId,
      createdById: req.user!.id,
    },
  });

  return res.status(201).json({
    id: form.id,
    name: form.name,
    orgId: form.orgId,
    createdAt: form.createdAt,
  });
};

/** The organization's forms, newest first, a page at a time. */
export const getForms = async (req: Request, res: Response) => {
  const page = req.query as unknown as Pagination;

  const forms = await req.db!.form.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(page),
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { responses: true } },
    },
  });

  return res.json(pageOf(forms, page.limit));
};

/** Totals for the dashboard, independent of which page of forms is loaded. */
export const getFormsSummary = async (req: Request, res: Response) => {
  const [forms, activeForms, responses] = await Promise.all([
    req.db!.form.count({}),
    req.db!.form.count({ where: { isActive: true } }),
    req.db!.response.count({}),
  ]);

  return res.json({ forms, activeForms, responses });
};

export const getFormById = async (req: Request, res: Response) => {
  const form = await req.db!.form.findFirst({
    where: { id: (req.params as { id: string }).id },
    select: {
      id: true,
      name: true,
      schema: true,
      thankYouMessage: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { responses: true } },
    },
  });

  if (!form) throw new HttpError(404, "Form not found");

  return res.json(form);
};

/**
 * Unauthenticated fetch used by the public form-filling page. Looks a form up by
 * id alone — there is no caller org to scope by — so it deliberately uses the
 * raw `prisma` client rather than `req.db`, and returns only the fields a
 * respondent needs to render and submit the form.
 */
export const getPublicForm = async (req: Request, res: Response) => {
  const form = await prisma.form.findUnique({
    where: { id: (req.params as { id: string }).id },
    select: {
      id: true,
      name: true,
      schema: true,
      thankYouMessage: true,
      isActive: true,
    },
  });

  if (!form) throw new HttpError(404, "Form not found");

  if (!form.isActive) {
    throw new HttpError(403, "This form is not accepting submissions");
  }

  return res.json(form);
};

export const updateForm = async (req: Request, res: Response) => {
  const { title, schema, isActive, thankYouMessage } =
    req.body as z.output<typeof updateFormBody>;

  const existing = await req.db!.form.findFirst({
    where: { id: (req.params as { id: string }).id },
    select: { id: true },
  });

  if (!existing) throw new HttpError(404, "Form not found");

  const form = await req.db!.form.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { name: title } : {}),
      ...(schema !== undefined ? { schema: schema as Prisma.InputJsonValue } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(thankYouMessage !== undefined ? { thankYouMessage } : {}),
    },
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
};

export const deleteForm = async (req: Request, res: Response) => {
  const existing = await req.db!.form.findFirst({
    where: { id: (req.params as { id: string }).id },
    select: { id: true },
  });

  if (!existing) throw new HttpError(404, "Form not found");

  await req.db!.form.delete({ where: { id: existing.id } });

  return res.json({ message: "Form deleted" });
};
