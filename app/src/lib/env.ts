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
  intakeSecret: () => req("INTAKE_SHARED_SECRET"),
  n8nSecret: () => req("N8N_WEBHOOK_SHARED_SECRET"),
  n8nIntakeWebhook: () => process.env.N8N_WF01_WEBHOOK_URL,
  turnstileSecret: () => req("TURNSTILE_SECRET_KEY"),
  privacyVersion: () => process.env.PRIVACY_VERSION || "2026-11-03",
};
