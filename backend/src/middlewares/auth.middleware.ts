import type { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";

type AuthPayload = {
  userId: string;
  orgId: string;
};

export type AuthUser = {
  id: string;
  orgId: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authMiddleware = (
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

    if (!decoded?.userId || !decoded?.orgId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = { id: decoded.userId, orgId: decoded.orgId };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
