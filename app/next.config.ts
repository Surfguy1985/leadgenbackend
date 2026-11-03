import type { NextConfig } from "next";
const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // CORS for /api/intake is per-request (WEBFLOW_ORIGIN allow-list) in lib/cors.ts
    return [
      { source: "/(.*)", headers: security },
      { source: "/(dashboard|admin|onboarding|manage)(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
export default config;
