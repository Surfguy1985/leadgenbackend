/** AI v2 guardrails: pure helpers (tested). */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const STREET = /\b\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Ct|Court|Way|Pkwy|Cir)\b\.?/g;

/** Strip direct contact details before text goes to the model (data minimization). City/ZIP stay. */
export function redactPII(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, "[phone]").replace(STREET, "[street address]");
}

const INJECTION = [/ignore (all|any|previous|prior|the above) (instructions|prompts)/i, /you are now/i, /system prompt/i, /disregard .{0,30}instructions/i, /<\/?(system|assistant|untrusted_source)>/i, /reveal .{0,20}(key|secret|prompt)/i];
export function looksLikeInjection(text: string): boolean { return INJECTION.some(r => r.test(text)); }

/** USD per 1M tokens (input, output). Conservative defaults; override via app_settings later. */
export const PRICES: Record<string, [number, number]> = { default: [3, 15] };
export function costUsd(model: string, inTok = 0, outTok = 0): number {
  const [i, o] = PRICES[model] ?? PRICES.default; return +(inTok * i / 1e6 + outTok * o / 1e6).toFixed(6);
}
export function overBudget(spentTodayUsd: number, budgetUsd: number): boolean { return spentTodayUsd >= budgetUsd; }
