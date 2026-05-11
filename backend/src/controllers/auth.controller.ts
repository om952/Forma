import * as bcrypt from "bcrypt";
import type { Request, Response } from "express";
import * as jwt from "jsonwebtoken";

import { prisma } from "../db/prisma";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
const JWT_SECRET = process.env.JWT_SECRET;

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const signToken = (payload: { userId: string; orgId: string }) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
};

type SignupBody = {
  email?: string;
  password?: string;
  organizationName?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
  organizationId?: string;
  organizationName?: string;
};

export const signup = async (req: Request, res: Response) => {
  try {
    const { email, password, organizationName } = req.body as SignupBody;

    if (!email || !password || !organizationName) {
      return res
        .status(400)
        .json({ message: "email, password, organizationName are required" });
    }

    if (String(password).length < 8) {
      return res
        .status(400)
        .json({ message: "password must be at least 8 characters" });
    }

    const normalizedEmail = normalizeEmail(String(email));
    const orgName = String(organizationName).trim();
    const slug = toSlug(orgName);

    if (!slug) {
      return res.status(400).json({ message: "organizationName is invalid" });
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    });

    if (existingOrg) {
      return res.status(409).json({ message: "Organization already exists" });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);

    const { organization, user } = await prisma.$transaction(async (tx) => {
      const organizationRecord = await tx.organization.create({
        data: {
          name: orgName,
          slug,
        },
      });

      const userRecord = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: "OWNER",
          orgId: organizationRecord.id,
        },
      });

      return { organization: organizationRecord, user: userRecord };
    });

    const token = signToken({ userId: user.id, orgId: organization.id });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    });
  } catch (error) {
    console.error("signup failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, organizationId, organizationName } =
      req.body as LoginBody;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email and password are required" });
    }

    const normalizedEmail = normalizeEmail(String(email));
    let orgId = organizationId ? String(organizationId) : undefined;

    if (!orgId && organizationName) {
      const slug = toSlug(String(organizationName));

      if (!slug) {
        return res
          .status(400)
          .json({ message: "organizationName is invalid" });
      }

      const org = await prisma.organization.findUnique({ where: { slug } });

      if (!org) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      orgId = org.id;
    }

    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        ...(orgId ? { orgId } : {}),
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, orgId: user.orgId });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
      },
    });
  } catch (error) {
    console.error("login failed", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
