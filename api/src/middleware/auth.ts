import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Middleware: verify Supabase JWT and attach user ID to request
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing authorization header" });
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Attach user ID to request for downstream handlers
    (req as any).userId = data.user.id;
    (req as any).userEmail = data.user.email;
    next();
  } catch (err) {
    console.error("[Auth] Token verification failed:", err);
    return res.status(401).json({ message: "Authentication failed" });
  }
}

// Helper to get user ID from request (set by requireAuth middleware)
export function getUserId(req: Request): string {
  return (req as any).userId;
}
