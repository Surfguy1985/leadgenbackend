import type { NextConfig } from "next";
// Allow the Webflow site (WEBFLOW_ORIGIN) to POST to the intake endpoint from the browser embed.
const origin = process.env.WEBFLOW_ORIGIN || "https://your-site.webflow.io";
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/api/intake", headers: [
      { key: "Access-Control-Allow-Origin", value: origin },
      { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "Content-Type" },
      { key: "Vary", value: "Origin" },
    ] }, { source: "/(dashboard|admin)(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};
export default config;
