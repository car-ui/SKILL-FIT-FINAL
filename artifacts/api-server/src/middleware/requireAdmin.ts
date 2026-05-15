import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    adminUsername?: string;
    adminRole?: string;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.adminUsername) {
    res.status(401).json({ error: "Unauthorized. Please log in." });
    return;
  }
  next();
}
