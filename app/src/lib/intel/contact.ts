import { entityKey } from "@/lib/quality";
/** Never used as an enrichment source: social media and directories/aggregators whose terms forbid automated reuse. */
export const BLOCKED_HOST = /(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube|pinterest|nextdoor|yelp|bbb|angi|angieslist|homeadvisor|thumbtack|yellowpages|superpages|mapquest|manta|buzzfile|bizapedia|opencorporates|dnb|zoominfo|houzz|porch|chamberofcommerce|google|bing|apple|indeed|glassdoor|birdeye|nicelocal|cylex|merchantcircle|hotfrog|brownbook|dexknows|citysearch|alignable|trustpilot|expertise|threebestrated|networx|fixr|buildzoom|procore|texas|tdlr)\.[a-z.]+$/i;
const words = (s: string) => entityKey(s, "").split("|")[0].split(" ").filter(w => w.length > 2);
const PHONE = /\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/;
const CITY_TX = /\b([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,2}),?\s+(?:TX|Texas)\b/g;

/** Pure: extract only values that literally appear on the business's own page. Name must match (all significant words present). */
export function extractContact(name: string, page: string, url: string, isCity: (c: string) => boolean) {
  const hay = page.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ");
  const w = words(name); if (!w.length || !w.every(x => hay.includes(` ${x} `) || hay.startsWith(`${x} `))) return null;
  const pm = page.match(PHONE); const phone = pm ? pm[0].trim() : null;
  let city: string | null = null; for (const m of page.matchAll(CITY_TX)) { const c = m[1].trim(); const tail = c.split(" ").slice(-2).join(" "); const hit = [c, tail, c.split(" ").pop()!].find(x => isCity(x)); if (hit) { city = hit; break; } }
  return { phone, city, website: new URL(url).origin };
}

