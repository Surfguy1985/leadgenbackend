// Applies shim + migrations to an in-memory Postgres (PGlite) and runs RLS / dedupe assertions.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const db = new PGlite();
const run = (f: string) => db.exec(readFileSync(f, "utf8"));
let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fails++; };
async function throws(sql: string) { try { await db.exec(sql); return false; } catch { return true; } }

await run(join(root, "supabase/test/shim.sql"));
for (const f of readdirSync(join(root, "supabase/migrations")).sort()) await run(join(root, "supabase/migrations", f));
console.log("migrations applied");

const A = "00000000-0000-0000-0000-00000000000a", C1 = "00000000-0000-0000-0000-0000000000c1", C2 = "00000000-0000-0000-0000-0000000000c2";
await db.exec(`
insert into auth.users values ('${A}'),('${C1}'),('${C2}');
insert into profiles(user_id, role) values ('${A}','admin'),('${C1}','contractor'),('${C2}','contractor');
insert into organizations(id, owner_user_id, business_name) values ('10000000-0000-0000-0000-000000000001','${C1}','Org1'),('10000000-0000-0000-0000-000000000002','${C2}','Org2');
insert into contractor_profiles(id, organization_id, trades) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{landscaping}'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','{landscaping}');
insert into sources(id,name,kind,active,reuse_allowed) values ('30000000-0000-0000-0000-000000000001','SAM.gov','official_api',true,true);
insert into source_rights(id,source_id,approval_version,can_fetch,can_publish_summary,approved_at) values ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,true,true,now());
update sources set enabled=true, current_rights_id='31000000-0000-0000-0000-000000000001' where id='30000000-0000-0000-0000-000000000001';
insert into opportunities(id,kind,title,trade,status,visibility,source_id,source_record_id) values
 ('40000000-0000-0000-0000-000000000001','public_bid','Pub bid','landscaping','published','public','30000000-0000-0000-0000-000000000001','N1'),
 ('40000000-0000-0000-0000-000000000003','public_bid','Draft bid','landscaping','needs_review','public','30000000-0000-0000-0000-000000000001','N2');
insert into opportunities(id,kind,title,trade,status,visibility) values ('40000000-0000-0000-0000-000000000002','private_lead','Private','landscaping','draft','private');
insert into consents(id,opportunity_id,purpose,sharing_scope,privacy_version) values ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','p','s','v1');
update opportunities set consent_id='50000000-0000-0000-0000-000000000001', status='published' where id='40000000-0000-0000-0000-000000000002';
insert into lead_contacts(opportunity_id,email) values ('40000000-0000-0000-0000-000000000002','secret@example.com');
insert into lead_access(opportunity_id,contractor_id,consent_basis) values ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
grant select on all tables in schema public to anon, authenticated;
`);

const as = async (role: string, uid: string | null, sql: string) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec("reset role;"); }
};
ok("anon sees only approved public opportunity", JSON.stringify(await as("anon", null, "select title from opportunities order by title")) === JSON.stringify([{ title: "Pub bid" }]));
ok("anon sees no lead_contacts", (await as("anon", null, "select * from lead_contacts")).length === 0);
ok("anon sees no consents/matches/subscriptions", (await as("anon", null, "select 1 from consents union all select 1 from subscriptions union all select 1 from matches")).length === 0);
ok("contractor w/o access cannot see private lead", (await as("authenticated", C2, "select 1 from opportunities where kind='private_lead'")).length === 0);
ok("contractor w/o access cannot see contacts", (await as("authenticated", C2, "select 1 from lead_contacts")).length === 0);
ok("contractor with lead_access sees private lead + contact", (await as("authenticated", C1, "select email from lead_contacts")).length === 1);
ok("contractor cannot see other org", (await as("authenticated", C1, "select business_name from organizations")).length === 1);
ok("admin sees all opportunities", (await as("authenticated", A, "select 1 from opportunities")).length === 3);
ok("anon cannot insert opportunities", await throws("set role anon; insert into opportunities(kind,title,trade) values ('public_bid','x','y'); reset role;"));
await db.exec("reset role;");
ok("same source record twice is rejected", await throws(`insert into opportunities(kind,title,trade,source_id,source_record_id) values ('public_bid','dup','x','30000000-0000-0000-0000-000000000001','N1')`));
ok("raw_ingestion dedupe hash unique", await (async () => { await db.exec(`insert into raw_ingestions(source_id,source_record_id,payload_hash,permitted_payload) values ('30000000-0000-0000-0000-000000000001','N1','h','{}')`); return throws(`insert into raw_ingestions(source_id,source_record_id,payload_hash,permitted_payload) values ('30000000-0000-0000-0000-000000000001','N1','h','{}')`); })());
ok("private lead cannot publish without consent", await throws(`insert into opportunities(kind,title,trade,status) values ('private_lead','x','y','published')`));
ok("test data cannot be public", await throws(`insert into opportunities(kind,title,trade,visibility,is_test_data) values ('public_bid','x','y','public',true)`));
ok("audit_logs append-only", await (async () => { await db.exec(`insert into audit_logs(actor,action,object_type) values ('t','t','t')`); return throws("delete from audit_logs"); })());
await db.exec(`update consents set withdrawn_at = now() where id='50000000-0000-0000-0000-000000000001'`);
ok("withdrawn consent revokes contact access", (await as("authenticated", C1, "select 1 from lead_contacts")).length === 0);
ok("withdrawn consent withdraws opportunity", (await db.query<{ status: string }>("select status from opportunities where id='40000000-0000-0000-0000-000000000002'")).rows[0].status === "withdrawn");
ok("private bucket created non-public", (await db.query<{ public: boolean }>("select public from storage.buckets where id='job-photos'")).rows[0].public === false);
for (let i = 0; i < 5; i++) await db.query("select record_workflow_failure('WF-01','n','e','{\"x\":1}')");
ok("WF-09 dead-letters after 5 attempts", (await db.query<{ state: string }>("select state from workflow_failures where workflow='WF-01'")).rows[0].state === "dead_letter");
await db.exec("update opportunities set status='expired' where id='40000000-0000-0000-0000-000000000001'");
await db.exec(`insert into notifications(recipient_id,opportunity_id,dedupe_key) values ('${C1}','40000000-0000-0000-0000-000000000001','k1')`);
ok("expired opp alerts suppressed", (await db.query<{ n: number }>("select suppress_closed_notifications() as n")).rows[0].n === 1);
ok("anon cannot call ops RPC", await throws("set role anon; select suppress_closed_notifications(); reset role;"));
await db.exec("reset role;");
console.log(fails ? `${fails} FAILED` : "ALL SQL CHECKS PASSED");
process.exit(fails ? 1 : 0);
