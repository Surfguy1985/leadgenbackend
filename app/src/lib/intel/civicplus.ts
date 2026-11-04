/** CivicPlus "Bid Postings" module (Bids.aspx) parser. Pure + deterministic; only values present on the page. Contact persons are never stored. */
const text = (h: string) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " | ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
export function listBidIds(html: string): number[] {
  return Array.from(new Set(Array.from(html.matchAll(/bids\.aspx\?bidID=(\d+)/gi), m => Number(m[1])))).sort((a, b) => a - b);
}
const field = (t: string, label: string) => { const m = t.match(new RegExp(`${label}:\\s*(?:\\|\\s*)+([^|]+?)\\s*\\|`, "i")); return m ? m[1].trim() : null; };
/** "11/18/2026 10:00 AM" (America/Chicago) -> ISO. CST/CDT via fixed rule: Nov-Mar -06, else -05 (good enough for bid closes; day stays exact). */
export function parseClose(s: string | null): string | null {
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i); if (!m) return null;
  let h = Number(m[4] ?? 17); if (m[6]) { h = h % 12 + (/pm/i.test(m[6]) ? 12 : 0); }
  const mo = Number(m[1]); const off = mo >= 11 || mo <= 3 ? "-06:00" : "-05:00";
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}T${String(h).padStart(2, "0")}:${m[5] ?? "00"}:00${off}`;
}
export type CivicBid = { bid_number: string | null; title: string | null; category: string | null; status: string | null; published: string | null; closes: string | null; description: string | null };
export function parseBid(html: string): CivicBid {
  const t = text(html);
  const desc = t.match(/Description:\s*(?:\|\s*)+([\s\S]{0,1500}?)\s*\|\s*(?:\|\s*)*(?:Publication Date|Closing Date|Contact Person|Related Documents)/i)?.[1]?.replace(/\s*\|\s*/g, " ").trim() ?? null;
  return { bid_number: field(t, "Bid Number"), title: field(t, "Bid Title"), category: field(t, "Category"), status: field(t, "Status"),
    published: field(t, "Publication Date/Time"), closes: field(t, "Closing Date/Time"), description: desc };
}
/** Trade from title/category/description keywords. null => out of scope (not construction/property services). */
export function bidTrade(b: Pick<CivicBid, "title" | "category" | "description">): string | null {
  const s = `${b.title ?? ""} ${b.category ?? ""} ${b.description ?? ""}`;
  if (/landscap|mowing|tree|irrigat|turf|grounds/i.test(s)) return "landscaping";
  if (/janitor|custodial|cleaning/i.test(s)) return "cleaning";
  if (/roof|hvac|plumb|electric|paint|flooring|repair|renovat|remodel|cottage|restroom|pavilion/i.test(s)) return "residential_repair";
  if (/construct|sewer|water line|waterline|paving|pavement|street|road|drainage|bridge|concrete|interceptor|utility|facility|building|demolition|sidewalk|park|trail|public works|capital improvement/i.test(s)) return "commercial_construction";
  return null;
}
