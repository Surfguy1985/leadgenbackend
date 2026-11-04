/** Accepts only same-origin relative paths like "/onboarding"; rejects "//x", "/\\x", schemes, and control chars. */
export function safeNext(raw: string | null | undefined, fallback: string | null = null): string | null {
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(raw)) return fallback;
  try { const u = new URL(raw, "https://x.invalid"); if (u.origin !== "https://x.invalid") return fallback; return u.pathname + u.search + u.hash; }
  catch { return fallback; }
}
