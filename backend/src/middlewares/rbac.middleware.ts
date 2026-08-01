import type { NextFunction, Request, Response } from "express";

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export const requireRole = (...allowedRoles: OrgRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole as OrgRole)) {
      return res
        .status(403)
        .json({ message: "Forbidden: insufficient permissions" });
    }

    return next();
  };
};
