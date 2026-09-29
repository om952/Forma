import type { NextFunction, Request, Response } from "express";

import { prisma } from "../db/prisma";
import {
  createScopedPrismaClient,
  type ScopedPrismaClient,
} from "../db/scopedPrisma";
import { verifySessionToken } from "../services/session";

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

  try {
    const decoded = verifySessionToken(token);

    if (!decoded?.userId || !decoded?.orgId || !decoded?.role) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, orgId: true, email: true, role: true, tokenVersion: true },
    });

    // A deleted user (removed from their org) and a token issued before the
    // user's last password change or "sign out everywhere" are both refused.
    // Tokens from before versioning existed carry no `tv` and count as 0.
    if (!user || (decoded.tv ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // The role comes from the database, not the token, so a role change takes
    // effect on the user's next request.

    req.user = { id: user.id, orgId: user.orgId, email: user.email, role: user.role };
    req.db = createScopedPrismaClient(user.orgId);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
