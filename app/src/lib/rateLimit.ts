// Simple in-memory limiter (per instance). Swap for Upstash/Redis in production.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now(); const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
  h.n++; return h.n <= max;
}
export function clientIp(req: Request) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"; }
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false; let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
