import "server-only";
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing server env var ${name}`);
  return v;
}
export const env = {
  xaiKey: () => req("XAI_API_KEY"),
  xaiModel: () => process.env.XAI_MODEL || "grok-4.7",
  xaiBaseUrl: () => process.env.XAI_BASE_URL || "https://api.x.ai/v1",
  supabaseUrl: () => req("SUPABASE_URL"),
  supabaseAnon: () => req("SUPABASE_ANON_KEY"),
  supabaseService: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecret: () => req("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => req("STRIPE_WEBHOOK_SECRET"),
  priceLocalPro: () => req("STRIPE_PRICE_LOCAL_PRO"),
  priceMultiTrade: () => req("STRIPE_PRICE_MULTI_TRADE"),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || "https://archangel-leadgen.vercel.app",
  intakeSecret: () => req("INTAKE_SHARED_SECRET"),
  /** Server-to-server shared secret (cron, sync, classify). APP_SHARED_SECRET preferred; legacy N8N_WEBHOOK_SHARED_SECRET still accepted. */
  sharedSecret: () => process.env.APP_SHARED_SECRET || req("N8N_WEBHOOK_SHARED_SECRET"),
  turnstileSecret: () => req("TURNSTILE_SECRET_KEY"),
  privacyVersion: () => process.env.PRIVACY_VERSION || "2026-11-03",
};

/** Graceful degradation: returns a 503 JSON response when optional integrations aren't configured yet. */
export function missingEnv(...names: string[]): Response | null {
  const missing = names.filter(n => !process.env[n]);
  return missing.length ? Response.json({ error: "not_configured", missing }, { status: 503 }) : null;
}

export const hasSharedSecret = () => !!(process.env.APP_SHARED_SECRET || process.env.N8N_WEBHOOK_SHARED_SECRET);
