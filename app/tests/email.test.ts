import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail, emailProvider } from "../src/lib/email";

test("email: skipped with no provider; brevo used when only BREVO_API_KEY set", async () => {
  delete process.env.RESEND_API_KEY; delete process.env.BREVO_API_KEY; process.env.ALERT_FROM_EMAIL = "Crewforthat <a@b.co>";
  assert.equal(emailProvider(), null);
  assert.equal((await sendEmail({ to: "x@y.co", subject: "s", html: "h" })).sent, false);
  process.env.BREVO_API_KEY = "k"; let url = ""; let body: any = null;
  const f = (async (u: string, i: any) => { url = u; body = JSON.parse(i.body); return new Response(JSON.stringify({ messageId: "m1" }), { status: 201 }); }) as unknown as typeof fetch;
  const r = await sendEmail({ to: "x@y.co", subject: "s", html: "h" }, f);
  assert.deepEqual(r, { sent: true, id: "m1" }); assert.match(url, /brevo/); assert.deepEqual(body.sender, { name: "Crewforthat", email: "a@b.co" });
  delete process.env.BREVO_API_KEY;
});
