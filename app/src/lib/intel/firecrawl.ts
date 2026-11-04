/** Minimal Firecrawl v2 client (server-only). Key from FIRECRAWL_API_KEY; never logged. */
export const firecrawlEnabled = () => !!process.env.FIRECRAWL_API_KEY;
async function call(path: string, body: unknown, timeoutMs = 60_000) {
  const key = process.env.FIRECRAWL_API_KEY; if (!key) throw new Error("firecrawl_key_missing");
  const r = await fetch(`https://api.firecrawl.dev/v2/${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`firecrawl_http_${r.status}`); return r.json() as Promise<any>;
}
/** Live fetch (maxAge 0) of raw HTML; returns the origin status code so "URL resolves" is a real check. */
export async function fcScrape(url: string): Promise<{ html: string; markdown: string; status: number }> {
  const d = await call("scrape", { url, formats: ["rawHtml", "markdown"], maxAge: 0, onlyMainContent: false, timeout: 45_000 });
  return { html: d?.data?.rawHtml ?? "", markdown: d?.data?.markdown ?? "", status: Number(d?.data?.metadata?.statusCode ?? 0) };
}
export async function fcSearch(query: string, limit = 5): Promise<{ url: string; title?: string }[]> {
  const d = await call("search", { query, limit, country: "US" });
  return (d?.data?.web ?? d?.data ?? []).map((x: any) => ({ url: x.url, title: x.title })).filter((x: any) => typeof x.url === "string");
}
