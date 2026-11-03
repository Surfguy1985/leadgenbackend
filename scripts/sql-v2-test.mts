// Migration v2 rehearsal on PGlite: init → snapshot → v2 up → P0 tests → down → schema == snapshot → up again.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "..");
const M = (f: string) => readFileSync(join(root, f), "utf8");
const db = new PGlite();
let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fails++; };
const throws = async (sql: string) => { try { await db.exec(sql); return false; } catch { await db.exec("reset role;").catch(() => {}); return true; } };
const errOf = async (sql: string) => { try { await db.exec(sql); return ""; } catch (e) { await db.exec("reset role;").catch(() => {}); return String((e as Error).message); } };
const snap = async () => JSON.stringify((await db.query(`select table_name, column_name, is_nullable, data_type from information_schema.columns where table_schema='public' order by 1,2`)).rows)
  + JSON.stringify((await db.query(`select tablename, policyname, qual from pg_policies where schemaname='public' order by 1,2`)).rows);
const as = async (role: string, uid: string | null, sql: string) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { return (await db.query(sql)).rows as Record<string, unknown>[]; } finally { await db.exec("reset role;"); }
};
const asErr = async (role: string, uid: string, sql: string) => { await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { await db.query(sql); return ""; } catch (e) { return String((e as Error).message); } finally { await db.exec("reset role;"); } };

await db.exec(M("supabase/test/shim.sql"));
await db.exec(M("supabase/migrations/20261103000000_init.sql"));
const before = await snap();
await db.exec(M("supabase/migrations/20261103020000_v2_phase1.sql"));
ok("v2 applies on top of init", true);
await db.exec("grant select on all tables in schema public to anon, authenticated; grant insert, update, delete on saved_items, alerts_preferences to authenticated;");

// ---- fixtures (local only) ----
const OWN = "00000000-0000-0000-0000-0000000000a1", FIN = "00000000-0000-0000-0000-0000000000a2", CON = "00000000-0000-0000-0000-0000000000a3";
const PAID = "00000000-0000-0000-0000-0000000000c1", TRIAL = "00000000-0000-0000-0000-0000000000c2", FREE = "00000000-0000-0000-0000-0000000000c3", PAID2 = "00000000-0000-0000-0000-0000000000c4";
const users = [OWN, FIN, CON, PAID, TRIAL, FREE, PAID2];
const S = "30000000-0000-0000-0000-000000000001", S2 = "30000000-0000-0000-0000-000000000002", R = "31000000-0000-0000-0000-000000000001";
const LEAD = "40000000-0000-0000-0000-0000000000f1", BID = "40000000-0000-0000-0000-0000000000b1", BID2 = "40000000-0000-0000-0000-0000000000b2";
await db.exec(`
insert into auth.users values ${users.map(u => `('${u}')`).join(",")};
insert into profiles(user_id, role) select id, 'contractor' from auth.users;
insert into admin_roles(user_id, role) values ('${OWN}','owner');
insert into admin_roles(user_id, role, granted_by) values ('${FIN}','finance_admin','${OWN}'),('${CON}','content_admin','${OWN}');
insert into organizations(id, owner_user_id, business_name) values
 ('10000000-0000-0000-0000-0000000000c1','${PAID}','Paid Co'),('10000000-0000-0000-0000-0000000000c2','${TRIAL}','Trial Co'),
 ('10000000-0000-0000-0000-0000000000c3','${FREE}','Free Co'),('10000000-0000-0000-0000-0000000000c4','${PAID2}','Paid2 Co');
insert into contractor_profiles(id, organization_id, trades) select ('20000000'||substr(id::text,9))::uuid, id, '{cleaning}' from organizations;
insert into subscriptions(organization_id, plan_code, status) values
 ('10000000-0000-0000-0000-0000000000c1','pro_match','active'),('10000000-0000-0000-0000-0000000000c2','pro_match','trialing'),
 ('10000000-0000-0000-0000-0000000000c4','starter','active');
insert into sources(id,name,kind) values ('${S}','Approved feed','official_api'),('${S2}','Unknown rights feed','official_api');
insert into source_rights(id,source_id,approval_version,can_fetch,can_publish_summary,approved_at) values ('${R}','${S}',1,true,true,now());
update sources set enabled=true, current_rights_id='${R}' where id='${S}';
update sources set enabled=true where id='${S2}';
insert into opportunities(id,kind,listing_type,title,trade,status,visibility,source_id,source_record_id,geographic_scope) values
 ('${BID}','public_bid','public_bid','Statewide janitorial','cleaning','published','public','${S}','N1','statewide'),
 ('${BID2}','public_bid','public_bid','No-rights bid','cleaning','published','public','${S2}','N2','zip');
insert into opportunities(id,kind,listing_type,title,trade,status,visibility) values ('${LEAD}','private_lead','direct_verified','Clean my house','cleaning','draft','private');
insert into consents(id,opportunity_id,purpose,sharing_scope,privacy_version) values
 ('50000000-0000-0000-0000-0000000000a1','${LEAD}','public_listing','non_identifying','v2'),
 ('50000000-0000-0000-0000-0000000000a2','${LEAD}','contact_share','up_to_5','v2');
insert into job_submissions(opportunity_id, verified_at, public_listing_consent_id, contact_share_consent_id) values ('${LEAD}', now(), '50000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-0000000000a2');
update opportunities set consent_id='50000000-0000-0000-0000-0000000000a2', status='published' where id='${LEAD}';
insert into lead_contacts(opportunity_id,email,phone) values ('${LEAD}','home@example.com','2145550100');
insert into matches(opportunity_id, contractor_id, match_score) select '${LEAD}', id, 80 from contractor_profiles;
`);
const reveal = `select * from reveal_contact('${LEAD}')`;

// ---- RT-01 / RT-07: contact reveal ----
ok("RT-01 anon cannot read lead_contacts", (await as("anon", null, "select * from lead_contacts")).length === 0);
ok("RT-01 anon cannot call reveal_contact", (await asErr("anon", "", reveal)) !== "");
ok("RT-01 anon cannot read contact_disclosures/job_submissions/manage_tokens", (await as("anon", null, "select 1 from contact_disclosures union all select 1 from job_submissions union all select 1 from manage_tokens")).length === 0);
ok("RT-07 trial account cannot reveal", (await asErr("authenticated", TRIAL, reveal)).includes("plan_not_entitled"));
ok("RT-07 free account cannot reveal", (await asErr("authenticated", FREE, reveal)).includes("plan_not_entitled"));
ok("RT-01 paid matched contractor can reveal", (await as("authenticated", PAID, reveal))[0]?.email === "home@example.com");
ok("RT-01 reveal writes disclosure + audit", (await db.query("select 1 from contact_disclosures")).rows.length === 1 && (await db.query("select 1 from audit_logs where action='contact_reveal'")).rows.length === 1);
ok("RT-01 contractor without access still sees no contacts", (await as("authenticated", PAID2, "select 1 from lead_contacts")).length === 0);
await db.exec(`update consents set withdrawn_at = now() where id='50000000-0000-0000-0000-0000000000a2'`);
ok("RT-08 withdrawal blocks further reveals", (await asErr("authenticated", PAID2, reveal)) !== "");
ok("RT-08 withdrawal revokes existing contact access", (await as("authenticated", PAID, "select 1 from lead_contacts")).length === 0);
ok("RT-08 withdrawal logged as status event", (await db.query(`select 1 from opportunity_events where opportunity_id='${LEAD}' and to_status='withdrawn'`)).rows.length === 1);

// cap: max 5 recipients
await db.exec(`insert into opportunities(id,kind,title,trade,status,visibility) values ('40000000-0000-0000-0000-0000000000f2','private_lead','Cap test','cleaning','draft','private');
insert into consents(id,opportunity_id,purpose,sharing_scope,privacy_version) values ('50000000-0000-0000-0000-0000000000b2','40000000-0000-0000-0000-0000000000f2','contact_share','up_to_5','v2');`);
await db.exec(`insert into auth.users select gen_random_uuid() from generate_series(1,6);
insert into organizations(owner_user_id,business_name) select id, 'cap'||id from auth.users where id not in (select owner_user_id from organizations where owner_user_id is not null) and id::text not like '00000000%';
insert into contractor_profiles(organization_id) select id from organizations where business_name like 'cap%';`);
let capErr = "";
for (const r of (await db.query<{ id: string }>("select cp.id from contractor_profiles cp join organizations o on o.id=cp.organization_id where o.business_name like 'cap%'")).rows) {
  try { await db.exec(`insert into lead_access(opportunity_id,contractor_id,consent_basis) values ('40000000-0000-0000-0000-0000000000f2','${r.id}','50000000-0000-0000-0000-0000000000b2')`); } catch (e) { capErr = String(e); }
}
ok("private lead capped at 5 recipients (6th rejected)", capErr.includes("cap") && (await db.query("select count(*)::int n from lead_access where opportunity_id='40000000-0000-0000-0000-0000000000f2'")).rows[0] && ((await db.query<{ n: number }>("select count(*)::int n from lead_access where opportunity_id='40000000-0000-0000-0000-0000000000f2'")).rows[0].n === 5));

// ---- RT-04: rights ----
const pub = (await as("anon", null, "select title, tab from public_opportunities order by title")).map(r => r.title);
ok("RT-04 bid from approved source is public", pub.includes("Statewide janitorial"));
ok("RT-04 bid from source with unknown rights is hidden", !pub.includes("No-rights bid"));
ok("RT-04 source_can denies unknown source", (await db.query<{ v: boolean }>(`select source_can('${S2}','fetch') v`)).rows[0].v === false);
await db.exec(`update sources set emergency_paused = true where id='${S}'`);
ok("RT-04 emergency pause hides + blocks fetch", (await as("anon", null, "select 1 from public_opportunities")).length === 0 && (await db.query<{ v: boolean }>(`select source_can('${S}','fetch') v`)).rows[0].v === false);
await db.exec(`update sources set emergency_paused = false where id='${S}'`);
await db.exec(`insert into source_rights(source_id,approval_version,can_fetch,can_publish_summary,approved_at,expires_at) values ('${S}',2,true,true,now()-interval '2 day',now()-interval '1 day');
update sources set current_rights_id=(select id from source_rights where source_id='${S}' and approval_version=2) where id='${S}';`);
ok("RT-04 expired rights fail closed", (await db.query<{ v: boolean }>(`select source_can('${S}','publish') v`)).rows[0].v === false && (await as("anon", null, "select 1 from public_opportunities")).length === 0);
ok("RT-12 export denied by default", (await db.query<{ v: boolean }>(`select source_can('${S}','export') or source_can('${S}','resell') v`)).rows[0].v === false);
ok("source_rights versions are immutable", await throws(`update source_rights set can_resell = true`));
await db.exec(`update sources set current_rights_id='${R}' where id='${S}'`);
ok("statewide bid keeps statewide scope, tab=jobs_now", JSON.stringify(await as("anon", null, "select geographic_scope, tab from public_opportunities")) === JSON.stringify([{ geographic_scope: "statewide", tab: "jobs_now" }]));

// ---- RT-08 lifecycle ----
await db.exec(`insert into notifications(recipient_id,opportunity_id,dedupe_key) values ('${PAID}','${BID}','bid:1')`);
await db.exec(`update opportunities set hide_after = now() - interval '1 minute' where id='${BID}'`);
ok("RT-08 past hide_after is hidden immediately (read-time)", (await as("anon", null, "select 1 from public_opportunities")).length === 0);
const sweep = (await db.query<{ r: { expired: number } }>("select archive_sweep() r")).rows[0].r;
ok("archive_sweep expires stale listing, suppresses queued alerts", sweep.expired >= 1 && (await db.query<{ status: string }>("select status from notifications where dedupe_key='bid:1'")).rows[0].status === "suppressed");
ok("expiry bumps revision + logs event", (await db.query<{ revision: number }>(`select revision from opportunities where id='${BID}'`)).rows[0].revision === 2);
ok("anon cannot run archive_sweep", (await asErr("anon", "", "select archive_sweep()")) !== "");

// ---- RT-11 admin roles ----
ok("RT-11 self-grant rejected", await throws(`insert into admin_roles(user_id, role, granted_by) values ('${CON}','owner','${CON}')`));
ok("RT-11 authenticated cannot write admin_roles", (await asErr("authenticated", CON, `insert into admin_roles(user_id, role, granted_by) values ('${CON}','owner','${OWN}')`)) !== "");
ok("RT-11 content admin cannot read billing ledger", (await asErr("authenticated", CON, "select 1 from billing_ledger")) === "" && (await as("authenticated", CON, "select * from billing_ledger")).length === 0 && (await as("authenticated", CON, "select has_admin_role(array['finance_admin']) v"))[0].v === false);
ok("RT-11 finance admin cannot see source rights", (await as("authenticated", FIN, "select 1 from source_rights")).length === 0);
ok("RT-11 content admin sees source rights", (await as("authenticated", CON, "select 1 from source_rights")).length >= 1);
ok("RT-11 two-person approval: approver != actor", await throws(`insert into admin_actions(actor,action,object_type,approved_by) values ('${OWN}','mass_unpublish','opportunities','${OWN}')`));
ok("RT-11 refund adjustment needs a different approver", await throws(`insert into billing_adjustments(amount_cents,reason,requested_by,approved_by) values (100,'refund test','${FIN}','${FIN}')`));
ok("billing ledger append-only", await (async () => { await db.exec(`insert into billing_ledger(stripe_object_id,kind,amount_cents,occurred_at) values ('ch_1','charge',7999,now())`); return throws("update billing_ledger set amount_cents=1"); })());

// ---- plans / entitlements ----
ok("plans: free + 4 paid seeded with correct prices", JSON.stringify((await db.query("select code, monthly_price_cents from plans order by sort")).rows) === JSON.stringify([{code:"free",monthly_price_cents:0},{code:"starter",monthly_price_cents:3999},{code:"pro_match",monthly_price_cents:7999},{code:"growth",monthly_price_cents:14999},{code:"elite",monthly_price_cents:29999}]));
ok("free plan entitlement = public bids only", (await db.query<{ e: Record<string, unknown> }>("select entitlements e from plans where code='free'")).rows[0].e.private_leads === false);
ok("anon sees only visible plans (Growth/Elite hidden until built)", (await as("anon", null, "select code from plans")).length === 3);
ok("saved_items owner-only write", (await asErr("authenticated", FREE, `insert into saved_items(contractor_id, opportunity_id) values ('20000000-0000-0000-0000-0000000000c1','${BID}')`)) !== "");

// ---- down / reversibility ----
await db.exec("delete from lead_access; delete from matches;");
await db.exec(M("supabase/rollback/20261103020000_v2_phase1_down.sql"));
ok("down migration restores exact v1 schema (columns + policies)", (await snap()) === before);
ok("pre-existing rows survive down migration", (await db.query("select 1 from opportunities")).rows.length >= 3);
await db.exec(M("supabase/migrations/20261103020000_v2_phase1.sql").replace(/insert into plans[\s\S]*?;\n/, m => m)); 
ok("v2 re-applies cleanly after rollback", (await db.query("select count(*)::int n from plans")).rows[0] !== undefined);
console.log(fails ? `${fails} FAILED` : "ALL V2 CHECKS PASSED");
process.exit(fails ? 1 : 0);
