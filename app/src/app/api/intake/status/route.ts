import { NextResponse } from "next/server";
import { emailConfigured } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, non-sensitive availability signal for the Webflow project form.
 * The UI remains disabled until the verification-email service is configured
 * AND an operator enables intake after an end-to-end production test.
 */
export async function GET() {
  const acceptingRequests =
    emailConfigured() &&
    process.env.INTAKE_LIVE_ENABLED === "true" &&
    !!process.env.TURNSTILE_SECRET_KEY &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return NextResponse.json(
    { acceptingRequests },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
