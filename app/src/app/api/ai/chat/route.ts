import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase";
import { SYSTEM_PROMPT, xaiChat } from "@/lib/xai";
import { runTool, toolDefs } from "@/lib/grokTools";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { env, missingEnv } from "@/lib/env";

export const runtime = "nodejs";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user","assistant"]), content: z.string().max(4000) })).min(1).max(40),
  // Set by the UI only when the user clicks the explicit consent button showing the sharing terms.
  consent_confirmed_version: z.string().max(40).nullable().default(null),
});

export async function POST(req: Request) {
  const nc = missingEnv("XAI_API_KEY"); if (nc) return nc;
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  if (!rateLimit(`chat:${u.user.id}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const consentVersion = b.data.consent_confirmed_version === env.privacyVersion() ? b.data.consent_confirmed_version : null;
  const ctx = { userId: u.user.id, consentConfirmedVersion: consentVersion, ip: clientIp(req) };
  type M = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };
  const messages: M[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\nCurrent privacy/consent version: ${env.privacyVersion()}. Use tools only as described. Reply in plain language.` },
    ...b.data.messages,
  ];

  try {
    for (let step = 0; step < 5; step++) {
      const out = await xaiChat({ messages, tools: toolDefs, temperature: 0.2 });
      const msg = out.choices[0]?.message;
      if (!msg) break;
      if (!msg.tool_calls?.length) return NextResponse.json({ reply: msg.content ?? "" });
      messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        const result = await runTool(tc.function.name, tc.function.arguments, ctx);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    return NextResponse.json({ reply: "I need a person to look at this. I've flagged it for review." });
  } catch {
    return NextResponse.json({ error: "ai_unavailable", fallback: "/post-job#form" }, { status: 503 });
  }
}
