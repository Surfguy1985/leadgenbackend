// Applies a SQL file to the live DB. Tries direct host, then session pooler. Password from env only.
import pg from "pg"; import { readFileSync } from "node:fs";
const ref = "xwmgblhbnnsftqigfqzq", pw = process.env.SUPABASE_DB_PASSWORD;
const targets = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["us-east-1","us-east-2","us-west-1","us-west-2","ca-central-1","eu-west-1","eu-west-2","eu-central-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-south-1","sa-east-1"]
    .flatMap(r => [0,1].map(n => ({ host: `aws-${n}-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` }))),
];
export async function connect() {
  for (const t of targets) {
    const c = new pg.Client({ ...t, password: pw, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000 });
    try { await c.connect(); console.error("connected via", t.host); return c; } catch (e) { console.error(t.host, e.message.slice(0,120)); }
  }
  throw new Error("no connection");
}
if (process.argv[2]) { const c = await connect(); try { await c.query(readFileSync(process.argv[2], "utf8")); console.log("applied", process.argv[2]); } finally { await c.end(); } }
