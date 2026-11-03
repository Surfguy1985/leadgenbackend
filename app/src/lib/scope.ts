import { createHash, createHmac } from "node:crypto";
import { env } from "./env";
export function normalizeScope(s: string) {
  return createHash("sha256").update(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()).digest("hex");
}


/** HMAC token for the email-verification link (WF-01). */
export function verifyToken(id: string) { return createHmac("sha256", env.n8nSecret()).update(`verify:${id}`).digest("hex").slice(0, 32); }
