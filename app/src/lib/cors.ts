/** CORS allow-list from WEBFLOW_ORIGIN (comma-separated exact origins). Unknown origins get no ACAO header. */
export function allowedOrigins(): string[] {
  return (process.env.WEBFLOW_ORIGIN || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
}
export function corsHeaders(req: Request): Record<string, string> {
  const o = req.headers.get("origin");
  const h: Record<string, string> = { Vary: "Origin" };
  if (o && allowedOrigins().includes(o)) Object.assign(h, { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" });
  return h;
}
export function withCors(req: Request, res: Response): Response {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}
export function preflight(req: Request): Response {
  const h = corsHeaders(req);
  return new Response(null, { status: h["Access-Control-Allow-Origin"] ? 204 : 403, headers: h });
}
