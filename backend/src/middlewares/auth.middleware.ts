import type { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";

import { prisma } from "../db/prisma";
import {
  createScopedPrismaClient,
  type ScopedPrismaClient,
} from "../db/scopedPrisma";

type AuthPayload = {
  userId: string;
  orgId: string;
  role: string;
};

export type AuthUser = {
  id: string;
  orgId: string;
  email: string;
  role: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /**
       * Tenant-bound Prisma client, attached by `authMiddleware`. Prefer this
       * over the raw `prisma` singleton in any authenticated handler — it
       * injects the caller's `orgId` automatically.
       */
      db?: ScopedPrismaClient;
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return res.status(500).json({ message: "JWT secret is not configured" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthPayload;

    if (!decoded?.userId || !decoded?.orgId || !decoded?.role) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, orgId: true, email: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = { id: user.id, orgId: user.orgId, email: user.email, role: user.role };
    req.db = createScopedPrismaClient(user.orgId);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
