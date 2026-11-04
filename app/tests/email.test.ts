import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../src/lib/email";
test("sendEmail no-ops without RESEND_API_KEY and never calls fetch", async () => {
  delete process.env.RESEND_API_KEY; let called = false;
  const r = await sendEmail({ to: "a@example.com", subject: "s", html: "h" }, (async () => { called = true; return new Response("{}"); }) as typeof fetch);
  assert.equal(r.sent, false); assert.equal(called, false); assert.ok("skipped" in r && r.skipped);
});
test("sendEmail passes idempotency key when configured", async () => {
  process.env.RESEND_API_KEY = "test"; process.env.ALERT_FROM_EMAIL = "x@example.com"; let key = "";
  const r = await sendEmail({ to: "a@example.com", subject: "s", html: "h", idempotencyKey: "k1" }, (async (_u: unknown, i?: RequestInit) => { key = (i!.headers as Record<string, string>)["Idempotency-Key"]; return new Response('{"id":"e1"}'); }) as typeof fetch);
  assert.equal(key, "k1"); assert.equal(r.sent, true);
  delete process.env.RESEND_API_KEY; delete process.env.ALERT_FROM_EMAIL;
});
