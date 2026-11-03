// Live RLS checks over REST. Uses temporary auth users + rows tagged "__rls_test__"; deletes everything afterwards.
// Never prints keys. Usage: node scripts/live-rls-check.mjs  (reads .env.local values via env)
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => /^\w+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const TAG = "__rls_test__", results = []; let fail = 0;
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); if (!cond) fail++; };
async function req(path, { key = ANON, jwt, method = "GET", body, headers = {} } = {}) {
  const r = await fetch(URL_ + path, { method, headers: { apikey: key, Authorization: `Bearer ${jwt || key}`, "Content-Type": "application/json", Prefer: "return=representation", ...headers }, body: body === undefined ? undefined : (typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body)) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
}
const svc = (p, o = {}) => req(p, { ...o, key: SVC });
const ins = async (t, row) => { const r = await svc(`/rest/v1/${t}`, { method: "POST", body: row }); if (r.s >= 300) throw new Error(`insert ${t}: ${r.s} ${JSON.stringify(r.j).slice(0, 200)}`); return r.j[0]; };
const users = {}, created = { opps: [], consents: [], orgs: [], src: null, objects: [] };

const TABLES = ["plans","app_settings","source_rights","ingestion_runs","connector_health","opportunity_events","opportunity_facts","properties","organization_relationships","profile_claims","job_submissions","manage_tokens","contact_disclosures","saved_items","alerts_preferences","billing_ledger","billing_adjustments","admin_roles","admin_actions","privacy_requests","ai_usage","profiles","organizations","contractor_profiles","sources","raw_ingestions","consents","opportunities","lead_contacts","matches","lead_access","notifications","subscriptions","moderation_queue","audit_logs","stripe_events","workflow_failures"];
try {
  // 1. Schema presence
  for (const t of TABLES) { const r = await svc(`/rest/v1/${t}?select=*&limit=0`); ok(`table ${t} exists`, r.s === 200, r.s === 200 ? "" : `${r.s} ${r.j?.code || ""} ${r.j?.message || ""}`); }
  const v = await svc(`/rest/v1/public_opportunities?select=id&limit=0`); ok("view public_opportunities exists", v.s === 200, `${v.s}`);
  for (const col of ["contractor_profiles?select=alert_email", "opportunities?select=webflow_item_id,webflow_synced_at"]) { const r = await svc(`/rest/v1/${col}&limit=0`); ok(`columns ${col}`, r.s === 200, r.s === 200 ? "" : r.j?.message); }
  const b = await svc(`/storage/v1/bucket/job-photos`); ok("bucket job-photos exists and private", b.s === 200 && b.j.public === false, `${b.s}`);
  const rpc = await svc(`/rest/v1/rpc/suppress_closed_notifications`, { method: "POST", body: {} }); ok("rpc suppress_closed_notifications (service)", rpc.s === 200, `${rpc.s}`);
  const auditBefore = (await svc(`/rest/v1/audit_logs?select=id`, { headers: { Prefer: "count=exact" } })).j.length;
  const missing = results.filter(r => r.startsWith("FAIL")); if (missing.length) throw new Error("schema incomplete; skipping RLS checks");

  // 2. Temporary users
  for (const n of ["contractorA", "contractorB", "homeowner", "admin"]) {
    const email = `rls-test-${n.toLowerCase()}-${Date.now()}@example.com`, password = crypto.randomUUID() + "Aa1!";
    const u = await svc(`/auth/v1/admin/users`, { method: "POST", body: { email, password, email_confirm: true, user_metadata: { rls_test: true } } });
    if (u.s >= 300) throw new Error(`create user ${n}: ${u.s} ${JSON.stringify(u.j).slice(0, 150)}`);
    const tok = await req(`/auth/v1/token?grant_type=password`, { method: "POST", body: { email, password } });
    if (tok.s >= 300) throw new Error(`sign in ${n}: ${tok.s}`);
    users[n] = { id: u.j.id, jwt: tok.j.access_token };
  }
  const A = users.contractorA, B = users.contractorB, H = users.homeowner, AD = users.admin;
  for (const [n, u] of Object.entries(users)) await ins("profiles", { user_id: u.id, role: n === "admin" ? "admin" : n === "homeowner" ? "homeowner" : "contractor", display_name: TAG });
  const orgA = await ins("organizations", { owner_user_id: A.id, business_name: TAG + "A" }), orgB = await ins("organizations", { owner_user_id: B.id, business_name: TAG + "B" });
  created.orgs.push(orgA.id, orgB.id);
  const cpA = await ins("contractor_profiles", { organization_id: orgA.id, trades: ["plumbing"], zip_codes: ["75201"] });
  const cpB = await ins("contractor_profiles", { organization_id: orgB.id, trades: ["plumbing"], zip_codes: ["75201"] });
  await ins("subscriptions", { organization_id: orgA.id, plan: "local_pro", status: "active" });
  const src = await ins("sources", { name: TAG + Date.now(), kind: "direct", active: true, reuse_allowed: true }); created.src = src.id;
  const P = await ins("opportunities", { kind: "public_bid", title: TAG + "public", trade: "plumbing", status: "published", visibility: "public", verification_status: "verified" }); created.opps.push(P.id);
  const D = await ins("opportunities", { kind: "public_bid", title: TAG + "draft", trade: "plumbing", status: "draft", visibility: "internal", is_test_data: true }); created.opps.push(D.id);
  const L = await ins("opportunities", { kind: "private_lead", title: TAG + "private", trade: "plumbing", status: "needs_review", visibility: "private", owner_user_id: H.id, is_test_data: true }); created.opps.push(L.id);
  const C = await ins("consents", { subject_user_id: H.id, opportunity_id: L.id, purpose: TAG, sharing_scope: "up to 5 matched contractors", privacy_version: "test" }); created.consents.push(C.id);
  await svc(`/rest/v1/opportunities?id=eq.${L.id}`, { method: "PATCH", body: { consent_id: C.id, status: "published" } });
  await ins("lead_contacts", { opportunity_id: L.id, contact_name: TAG, email: "rls-test@example.com", phone: "000" });
  const LA = await ins("lead_access", { opportunity_id: L.id, contractor_id: cpA.id, consent_basis: C.id });
  await ins("matches", { opportunity_id: L.id, contractor_id: cpA.id, match_score: 80 });
  await ins("notifications", { recipient_id: A.id, opportunity_id: L.id, dedupe_key: `${TAG}${L.id}` });
  const ids = `id=in.(${created.opps.join(",")})`;
  const seen = async (jwt, path = `/rest/v1/opportunities?select=id&${ids}`) => { const r = await req(path, { jwt }); return Array.isArray(r.j) ? r.j.map(x => x.id).sort() : r; };


  // v2 checks
  const pl = await svc(`/rest/v1/plans?select=code,monthly_price_cents,trial_days,visible,purchasable&order=sort`);
  ok("plans seeded with v3 prices", JSON.stringify(pl.j.map(x => [x.code, x.monthly_price_cents])) === JSON.stringify([["free",0],["starter",3999],["pro_match",7999],["growth",14999],["elite",29999]]), JSON.stringify(pl.j.map(x => x.code)));
  const apl = await req(`/rest/v1/plans?select=code`); ok("anon sees only visible plans", Array.isArray(apl.j) && apl.j.length === 3, `${apl.j?.length}`);
  const st = await svc(`/rest/v1/app_settings?select=key`); ok("app_settings seeded", Array.isArray(st.j) && st.j.length >= 4, `${st.j?.length}`);
  const rvAnon = await req(`/rest/v1/rpc/reveal_contact`, { method: "POST", body: { p_opportunity: L.id } }); ok("reveal_contact denied to anon", rvAnon.s >= 400, `${rvAnon.s}`);
  const rvFree = await req(`/rest/v1/rpc/reveal_contact`, { jwt: A.jwt, method: "POST", body: { p_opportunity: L.id } }); ok("reveal_contact denied to free/unsubscribed contractor", rvFree.s >= 400 && JSON.stringify(rvFree.j).includes("plan_not_entitled"), `${rvFree.s}`);
  const rvB = await req(`/rest/v1/rpc/reveal_contact`, { jwt: B.jwt, method: "POST", body: { p_opportunity: L.id } }); ok("reveal_contact denied to unmatched contractor", rvB.s >= 400, `${rvB.s}`);
  const sw = await req(`/rest/v1/rpc/archive_sweep`, { method: "POST", body: {} }); ok("archive_sweep denied to anon", sw.s >= 400, `${sw.s}`);
  const sg = await req(`/rest/v1/admin_roles`, { jwt: A.jwt, method: "POST", body: { user_id: A.id, role: "owner", granted_by: A.id } }); ok("admin self-grant denied", sg.s >= 400, `${sg.s}`);
  for (const t of ["source_rights","contact_disclosures","job_submissions","manage_tokens","billing_ledger","admin_roles"]) { const r = await req(`/rest/v1/${t}?select=*`, { jwt: A.jwt }); ok(`contractor cannot read ${t}`, r.s >= 400 || (Array.isArray(r.j) && r.j.length === 0), `${r.s}`); }
  // 3. Anon
  ok("anon sees only published public bid (opportunities)", JSON.stringify(await seen()) === JSON.stringify([P.id]));
  ok("anon sees only published public bid (public_opportunities view)", JSON.stringify(await seen(undefined, `/rest/v1/public_opportunities?select=id&${ids}`)) === JSON.stringify([P.id]));
  for (const t of ["lead_contacts", "consents", "profiles", "organizations", "contractor_profiles", "lead_access", "matches", "notifications", "subscriptions", "audit_logs", "raw_ingestions", "stripe_events", "workflow_failures", "moderation_queue"]) {
    const r = await req(`/rest/v1/${t}?select=*&limit=5`); ok(`anon reads 0 rows from ${t}`, (Array.isArray(r.j) && r.j.length === 0) || r.s === 401 || r.s === 403, `${r.s}`);
  }
  const ai = await req(`/rest/v1/opportunities`, { method: "POST", body: { kind: "public_bid", title: TAG + "anon", trade: "x", status: "published", visibility: "public" } });
  ok("anon cannot insert opportunities", ai.s >= 400, `${ai.s}`); if (ai.s < 300) created.opps.push(ai.j[0].id);
  const ar = await req(`/rest/v1/rpc/suppress_closed_notifications`, { method: "POST", body: {} }); ok("anon cannot call ops RPC", ar.s >= 400, `${ar.s}`);
  const ar2 = await req(`/rest/v1/rpc/record_workflow_failure`, { method: "POST", body: { p_workflow: TAG, p_node: "x", p_error: "x", p_payload: {} } }); ok("anon cannot call record_workflow_failure", ar2.s >= 400, `${ar2.s}`);

  // 4. Authenticated roles
  ok("contractor A (lead_access) sees public + private lead", JSON.stringify(await seen(A.jwt)) === JSON.stringify([P.id, L.id].sort()));
  ok("contractor A sees lead contact", (await req(`/rest/v1/lead_contacts?select=id&opportunity_id=eq.${L.id}`, { jwt: A.jwt })).j.length === 1);
  ok("contractor B (no access) sees only public bid", JSON.stringify(await seen(B.jwt)) === JSON.stringify([P.id]));
  ok("contractor B cannot see lead contact", (await req(`/rest/v1/lead_contacts?select=id&opportunity_id=eq.${L.id}`, { jwt: B.jwt })).j.length === 0);
  ok("contractor B sees only own contractor profile", JSON.stringify((await req(`/rest/v1/contractor_profiles?select=id&id=in.(${cpA.id},${cpB.id})`, { jwt: B.jwt })).j.map(x => x.id)) === JSON.stringify([cpB.id]));
  ok("contractor B sees no matches/notifications of A", (await req(`/rest/v1/matches?select=id&opportunity_id=eq.${L.id}`, { jwt: B.jwt })).j.length === 0 && (await req(`/rest/v1/notifications?select=id&opportunity_id=eq.${L.id}`, { jwt: B.jwt })).j.length === 0);
  ok("contractor A sees own match + notification", (await req(`/rest/v1/matches?select=id&opportunity_id=eq.${L.id}`, { jwt: A.jwt })).j.length === 1 && (await req(`/rest/v1/notifications?select=id&opportunity_id=eq.${L.id}`, { jwt: A.jwt })).j.length === 1);
  ok("contractor B cannot see A's subscription", (await req(`/rest/v1/subscriptions?select=id&organization_id=eq.${orgA.id}`, { jwt: B.jwt })).j.length === 0);
  ok("homeowner sees own private lead + public bid", JSON.stringify(await seen(H.jwt)) === JSON.stringify([P.id, L.id].sort()));
  ok("homeowner sees own consent", (await req(`/rest/v1/consents?select=id&id=eq.${C.id}`, { jwt: H.jwt })).j.length === 1);
  ok("contractor B cannot see homeowner consent", (await req(`/rest/v1/consents?select=id&id=eq.${C.id}`, { jwt: B.jwt })).j.length === 0);
  ok("admin sees all 3 test opportunities", (await seen(AD.jwt)).length === 3);
  const esc = await req(`/rest/v1/profiles?user_id=eq.${B.id}`, { jwt: B.jwt, method: "PATCH", body: { role: "admin" } });
  const roleB = (await svc(`/rest/v1/profiles?select=role&user_id=eq.${B.id}`)).j[0].role;
  ok("user cannot self-promote to admin", roleB !== "admin", `${esc.s}`);
  const oi = await req(`/rest/v1/opportunities`, { jwt: B.jwt, method: "POST", body: { kind: "public_bid", title: TAG + "auth", trade: "x", status: "published", visibility: "public" } });
  ok("authenticated cannot insert opportunities", oi.s >= 400, `${oi.s}`); if (oi.s < 300) created.opps.push(oi.j[0].id);
  const ou = await req(`/rest/v1/opportunities?id=eq.${P.id}`, { jwt: A.jwt, method: "PATCH", body: { title: "hacked" } });
  ok("authenticated cannot update opportunities", (await svc(`/rest/v1/opportunities?select=title&id=eq.${P.id}`)).j[0].title === TAG + "public", `${ou.s}`);
  const ac = await req(`/rest/v1/rpc/suppress_closed_notifications`, { jwt: A.jwt, method: "POST", body: {} }); ok("authenticated cannot call ops RPC", ac.s >= 400, `${ac.s}`);
  // revocation removes access
  await svc(`/rest/v1/lead_access?id=eq.${LA.id}`, { method: "PATCH", body: { status: "revoked" } });
  ok("revoked lead_access hides private lead + contact from A", JSON.stringify(await seen(A.jwt)) === JSON.stringify([P.id]) && (await req(`/rest/v1/lead_contacts?select=id&opportunity_id=eq.${L.id}`, { jwt: A.jwt })).j.length === 0);
  // check constraints
  const c1 = await svc(`/rest/v1/opportunities`, { method: "POST", body: { kind: "private_lead", title: TAG + "noconsent", trade: "x", status: "published", visibility: "private", is_test_data: true } });
  ok("constraint: private lead cannot publish without consent", c1.s >= 400, `${c1.s}`); if (c1.s < 300) created.opps.push(c1.j[0].id);
  const c2 = await svc(`/rest/v1/opportunities`, { method: "POST", body: { kind: "public_bid", title: TAG + "testpub", trade: "x", status: "published", visibility: "public", is_test_data: true } });
  ok("constraint: test data never public", c2.s >= 400, `${c2.s}`); if (c2.s < 300) created.opps.push(c2.j[0].id);
  // storage
  const up = async (u, path) => (await fetch(`${URL_}/storage/v1/object/job-photos/${path}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${u.jwt}`, "Content-Type": "image/png" }, body: new Uint8Array([137, 80, 78, 71]) })).status;
  const s1 = await up(H, `${H.id}/${TAG}.png`); if (s1 < 300) created.objects.push(`${H.id}/${TAG}.png`);
  ok("storage: user can upload to own folder", s1 < 300, `${s1}`);
  const s2 = await up(B, `${H.id}/${TAG}b.png`); if (s2 < 300) created.objects.push(`${H.id}/${TAG}b.png`);
  ok("storage: user cannot upload to another user's folder", s2 >= 400, `${s2}`);
  const rd = await fetch(`${URL_}/storage/v1/object/authenticated/job-photos/${H.id}/${TAG}.png`, { headers: { apikey: ANON, Authorization: `Bearer ${B.jwt}` } });
  ok("storage: other user cannot read photo", rd.status >= 400, `${rd.status}`);
  const pub = await fetch(`${URL_}/storage/v1/object/public/job-photos/${H.id}/${TAG}.png`); ok("storage: no public URL access", pub.status >= 400, `${pub.status}`);
  const auditAfter = (await svc(`/rest/v1/audit_logs?select=id`)).j.length; ok("no audit_logs rows written by test (append-only, undeletable)", auditAfter === auditBefore);
} catch (e) { results.push("ERROR " + e.message); fail++; }
finally {
  // 5. Cleanup
  const cl = [];
  if (created.objects.length) cl.push((await svc(`/storage/v1/object/job-photos`, { method: "DELETE", body: { prefixes: created.objects } })).s);
  if (created.opps.length) {
    const ids = created.opps.join(",");
    for (const t of ["lead_access", "matches", "notifications", "lead_contacts", "moderation_queue"]) cl.push((await svc(`/rest/v1/${t}?opportunity_id=in.(${ids})`, { method: "DELETE" })).s);
    cl.push((await svc(`/rest/v1/opportunities?id=in.(${ids})`, { method: "PATCH", body: { consent_id: null, status: "withdrawn" } })).s);
    cl.push((await svc(`/rest/v1/consents?opportunity_id=in.(${ids})`, { method: "DELETE" })).s);
    cl.push((await svc(`/rest/v1/opportunities?id=in.(${ids})`, { method: "DELETE" })).s);
  }
  if (created.src) cl.push((await svc(`/rest/v1/sources?id=eq.${created.src}`, { method: "DELETE" })).s);
  for (const u of Object.values(users)) cl.push((await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" })).s); // cascades profiles/orgs/contractor_profiles/subscriptions
  // verify
  const left = [];
  for (const [t, f] of [["opportunities", `title=like.${TAG}*`], ["sources", `name=like.${TAG}*`], ["profiles", `display_name=eq.${TAG}`], ["organizations", `business_name=like.${TAG}*`], ["consents", `purpose=eq.${TAG}`], ["notifications", `dedupe_key=like.${TAG}*`]]) { const r = await svc(`/rest/v1/${t}?select=id&${f}`); if (!Array.isArray(r.j) || r.j.length) left.push(`${t}:${Array.isArray(r.j) ? r.j.length : r.s}`); }
  const lu = await svc(`/auth/v1/admin/users?per_page=200`); const leftUsers = (lu.j.users || []).filter(u => u.email?.startsWith("rls-test-")).length;
  const totals = {}; for (const t of TABLES) { const r = await svc(`/rest/v1/${t}?select=id&limit=1000`); totals[t] = Array.isArray(r.j) ? r.j.length : r.s; }
  results.push(`CLEANUP statuses: ${cl.join(",")}; leftover test rows: ${left.length ? left.join(" ") : "none"}; leftover test users: ${leftUsers}`);
  results.push("ROW COUNTS after cleanup: " + JSON.stringify(totals));
  console.log(results.join("\n")); console.log(fail ? `\n${fail} FAILED` : "\nALL LIVE CHECKS PASSED");
  process.exitCode = fail ? 1 : 0;
}
