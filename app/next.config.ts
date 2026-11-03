import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // CORS for /api/intake is per-request (WEBFLOW_ORIGIN allow-list) in lib/cors.ts
    return [{ source: "/(dashboard|admin)(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};
export default config;
