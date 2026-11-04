import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normCode, REF_COOKIE } from "@/lib/referrals";

/**
 * Next.js 16 auth proxy: refresh Supabase cookies before server-rendered
 * account pages or authenticated contractor API handlers execute.
 * Always create the client per request to avoid cross-user session leakage.
 */
export async function proxy(request: NextRequest) {
  // If Supabase falls back to the Site URL (redirect URL not allow-listed), the link lands on "/" with ?code= or ?token_hash=.
  // Forward it to the real callback so sign-in still completes.
  const sp = request.nextUrl.searchParams;
  if (request.nextUrl.pathname === "/" && (sp.has("code") || sp.has("token_hash") || sp.has("error_code"))) {
    const cb = new URL("/auth/callback", request.url); sp.forEach((v, k) => cb.searchParams.set(k, v));
    return NextResponse.redirect(cb);
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims validates the JWT and refreshes the session when required.
  const { data } = await supabase.auth.getClaims();
  // Signed-out visitors to onboarding go to login and come back afterwards.
  if (!data?.claims && request.nextUrl.pathname.startsWith("/onboarding")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return keepRef(request, NextResponse.redirect(login));
  }
  return keepRef(request, response);
}

/** ?ref=<code> on any app entry (e.g. from the Webflow For Contractors CTA) is remembered for 30 days. */
function keepRef(req: NextRequest, res: NextResponse) {
  const code = normCode(req.nextUrl.searchParams.get("ref"));
  if (code) res.cookies.set(REF_COOKIE, code, { maxAge: 60 * 60 * 24 * 30, httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  return res;
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*", "/onboarding/:path*", "/auth/:path*", "/api/contractor/:path*"],
};
