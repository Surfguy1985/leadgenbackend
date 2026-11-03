// Pure, dependency-free policy for the safe fetcher (unit-tested). No network here.
export type SourcePolicy = {
  id: string; enabled: boolean; emergency_paused: boolean; allowed_hostnames: string[];
  canFetch: boolean; // result of source_can(id,'fetch') from the DB (fail-closed)
};
export const USER_AGENT = "CrewforthatBot/1.0 (+https://crewforthat.com/sources; public-records fetcher)";
export const LIMITS = { timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024, maxRedirects: 3 };
const BLOCKED_SOCIAL = /(^|\.)(facebook|fb|instagram|nextdoor|linkedin|x|twitter|tiktok|reddit|craigslist)\.(com|org)$/i;

export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); return m ? isPrivateAddress(m[1]) : false;
  }
  const p = ip.split(".").map(Number); if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

export function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return allowed.some(a => { const x = a.toLowerCase(); return h === x || h.endsWith("." + x); });
}

/** Returns null if the URL may be fetched for this source, else a deny reason. Deny by default. */
export function checkUrl(raw: string, src: SourcePolicy): string | null {
  if (!src.enabled) return "source_disabled";
  if (src.emergency_paused) return "source_paused";
  if (!src.canFetch) return "rights_deny_fetch";
  let u: URL; try { u = new URL(raw); } catch { return "bad_url"; }
  if (u.protocol !== "https:") return "https_only";
  if (u.username || u.password) return "credentials_in_url";
  if (u.port && u.port !== "443") return "nonstandard_port";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.startsWith("[")) return "ip_literal";
  if (BLOCKED_SOCIAL.test(u.hostname)) return "social_platform_blocked";
  if (!src.allowed_hostnames.length || !hostAllowed(u.hostname, src.allowed_hostnames)) return "host_not_allowlisted";
  return null;
}

/** Minimal robots.txt evaluation for our UA group or "*". Longest match wins; Allow beats Disallow on tie. */
export function robotsAllows(robots: string, path: string, ua = "CrewforthatBot"): boolean {
  const groups: { agents: string[]; rules: [boolean, string][] }[] = []; let cur: (typeof groups)[0] | null = null; let lastWasAgent = false;
  for (const line of robots.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false; if (!cur) continue;
    if (k === "allow" || k === "disallow") cur.rules.push([k === "allow", v]);
  }
  const g = groups.find(x => x.agents.includes(ua.toLowerCase())) ?? groups.find(x => x.agents.includes("*")); if (!g) return true;
  let best: [boolean, number] = [true, -1];
  for (const [allow, pat] of g.rules) {
    if (!pat) continue;
    const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (pat.length > best[1] || (pat.length === best[1] && allow))) best = [allow, pat.length];
  }
  return best[0];
}
