"""Generates importable n8n workflow JSON (n8n >= 1.x). Re-run after edits: python3 scripts/gen-n8n.py"""
import json, os
APP = "={{$env.APP_URL}}"
SB = "={{$env.SUPABASE_URL}}/rest/v1"
SB_CRED = {"httpHeaderAuth": {"id": "SUPABASE_SERVICE", "name": "Supabase service role (apikey + Authorization headers)"}}
SECRET_HDR = {"parameters": [{"name": "x-shared-secret", "value": "={{$env.N8N_WEBHOOK_SHARED_SECRET}}"}, {"name": "Content-Type", "value": "application/json"}]}
ERR_WF = {"errorWorkflow": "WF-09 Ops and errors"}

def node(name, typ, params, pos, ver=1, **kw):
    n = {"parameters": params, "name": name, "type": typ, "typeVersion": ver, "position": pos, "id": name.lower().replace(" ", "-")}
    n.update(kw); return n
def http(name, method, url, pos, body=None, sb=False, qs=None, headers=None, retry=True):
    p = {"method": method, "url": url, "options": {"timeout": 30000, **({"batching": {"batch": {"batchSize": 1, "batchInterval": 2000}}} if "sam.gov" in url else {})}}
    if sb:
        p.update({"authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"})
    if headers: p.update({"sendHeaders": True, "headerParameters": headers})
    if qs: p.update({"sendQuery": True, "queryParameters": {"parameters": [{"name": k, "value": v} for k, v in qs.items()]}})
    if body is not None: p.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
    kw = {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 5000} if retry else {}
    if sb: kw["credentials"] = SB_CRED
    return node(name, "n8n-nodes-base.httpRequest", p, pos, 4.2, **kw)
def code(name, js, pos): return node(name, "n8n-nodes-base.code", {"jsCode": js}, pos, 2)
def iff(name, expr, pos): return node(name, "n8n-nodes-base.if", {"conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"}, "combinator": "and", "conditions": [{"leftValue": expr, "rightValue": True, "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}}, pos, 2)
def wf(name, nodes, conns, note):
    c = {}
    for src, dsts in conns.items():
        outs = dsts if isinstance(dsts[0], list) else [dsts]
        c[src] = {"main": [[{"node": d, "type": "main", "index": 0} for d in o] for o in outs]}
    sticky = node("Notes", "n8n-nodes-base.stickyNote", {"content": note, "width": 520, "height": 260}, [-400, -300])
    return {"name": name, "nodes": [sticky] + nodes, "connections": c, "settings": {"executionOrder": "v1", **(ERR_WF if "WF-09" not in name else {})}, "active": False, "tags": [{"name": "lead-marketplace"}]}

MATCH_JS = open("app/src/lib/matching.ts").read()
# ---------- WF-01 ----------
wf01 = wf("WF-01 Direct job intake", [
  node("Intake webhook", "n8n-nodes-base.webhook", {"httpMethod": "POST", "path": "wf01-intake", "responseMode": "onReceived", "authentication": "headerAuth", "options": {}}, [0, 0], 2, credentials={"httpHeaderAuth": {"id": "N8N_SHARED", "name": "x-shared-secret header"}}, webhookId="wf01-intake"),
  http("Grok classify", "POST", f"{APP}/api/ai/classify", [220, 0], body='={{ JSON.stringify({ opportunity_id: $json.body.opportunity_id, source_kind: "direct", has_consent: true, text: $json.body.text }) }}', headers=SECRET_HDR),
  http("Send verification email", "POST", "https://api.resend.com/emails", [440, 0], headers={"parameters": [{"name": "Authorization", "value": "=Bearer {{$env.RESEND_API_KEY}}"}]},
       body='={{ JSON.stringify({ from: $env.ALERT_FROM_EMAIL, to: [$("Intake webhook").item.json.body.email], subject: "Archangel Advertising: confirm your service request", html: `<p>Thanks for using Archangel Advertising. Please confirm your request so we can share it with up to 5 eligible, matched contractors.</p><p><a href="${$("Intake webhook").item.json.body.verify_url}">Confirm request</a></p><p>No contractor is guaranteed. You can withdraw anytime at ${$env.APP_URL}/delete-data.</p>` }) }}'),
  code("Note: verify → review → publish", "// Status is set to 'verified' only after the email link is clicked (app route) AND a moderator approves\n// in /admin (first 100 submissions are always reviewed). Publishing a private lead triggers WF-04 via\n// a Supabase Database Webhook on opportunities (status -> published).\nreturn $input.all();", [660, 0]),
], {"Intake webhook": ["Grok classify"], "Grok classify": ["Send verification email"], "Send verification email": ["Note: verify → review → publish"]},
"## WF-01 Direct job intake\nWebflow form → /api/intake (Turnstile, consent, dedupe by submission_id, contacts stored in lead_contacts) → this webhook → Grok classify (uncertain → moderation_queue) → email verification → human approval in /admin → published (private) → WF-04.\nWithdrawn consent is enforced by a DB trigger (revokes access, suppresses queued notifications).")

# ---------- WF-02 ----------
NAICS = ["561730","561720","561210","561790","236220","236118","238160","238220","238210","238320","238990","562111"]
wf02 = wf("WF-02 SAM.gov procurement ingestion", [
  node("Twice daily", "n8n-nodes-base.scheduleTrigger", {"rule": {"interval": [{"field": "cronExpression", "expression": "0 6,15 * * *"}]}}, [0, 0], 1.2),
  code("Build NAICS queries", "const fmt=d=>`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;\nconst to=new Date(), from=new Date(Date.now()-3*864e5);\nconst naics=" + json.dumps(NAICS) + ";\nreturn naics.map(n=>({json:{ncode:n,postedFrom:fmt(from),postedTo:fmt(to),offset:0}}));", [220, 0]),
  http("SAM.gov Get Opportunities", "GET", "https://api.sam.gov/opportunities/v2/search", [440, 0],
       qs={"api_key": "={{$env.SAM_GOV_API_KEY}}", "postedFrom": "={{$json.postedFrom}}", "postedTo": "={{$json.postedTo}}", "state": "TX", "ncode": "={{$json.ncode}}", "ptype": "o,k,p,r", "limit": "1000", "offset": "={{$json.offset}}"}),
  # rate limit: one NAICS query every 2s (see batching option set below)
  code("Normalize (all Texas) + hash", r"""
const crypto = require('crypto');
const out = [];
for (const item of $input.all()) {
  const recs = item.json.opportunitiesData || [];
  if ((item.json.totalRecords||0) > (item.json.offset||0) + recs.length) out.push({json:{_needsNextPage:true, totalRecords:item.json.totalRecords}}); // paginate: raise window or loop
  for (const r of recs) {
    const pop = r.placeOfPerformance || {};
    const zip = (pop.zip || '').slice(0,5) || null;
    if (pop.state?.code && pop.state.code !== 'TX') continue; // public bids: all of Texas (state=TX query + guard)
    // Store only permitted metadata (no POC personal data, no full protected description)
    const permitted = { noticeId: r.noticeId, title: r.title, solicitationNumber: r.solicitationNumber, type: r.type, postedDate: r.postedDate,
      responseDeadLine: r.responseDeadLine, naicsCode: r.naicsCode, setAside: r.typeOfSetAsideDescription, active: r.active,
      agency: r.fullParentPathName, city: pop.city?.name || null, state: pop.state?.code || 'TX', zip, uiLink: `https://sam.gov/opp/${r.noticeId}/view` };
    const payload_hash = crypto.createHash('sha256').update(JSON.stringify(permitted)).digest('hex');
    out.push({ json: { source_record_id: r.noticeId, source_url: permitted.uiLink, payload_hash, permitted_payload: permitted } });
  }
}
return out.filter(o => !o.json._needsNextPage);""", [660, 0]),
  http("Insert raw_ingestion (dedupe)", "POST", f"{SB}/raw_ingestions?on_conflict=source_id,source_record_id,payload_hash", [880, 0], sb=True,
       headers={"parameters": [{"name": "Prefer", "value": "resolution=ignore-duplicates,return=representation"}]},
       body='={{ JSON.stringify({ source_id: $env.SAM_SOURCE_ID, source_record_id: $json.source_record_id, source_url: $json.source_url, payload_hash: $json.payload_hash, permitted_payload: $json.permitted_payload }) }}'),
  iff("New or changed?", "={{ !!$json.id }}", [1100, 0]),
  code("Skip if inactive/expired", "const now=Date.now();\nreturn $input.all().filter(i=>{const p=i.json.permitted_payload||{}; const d=p.responseDeadLine?Date.parse(p.responseDeadLine):null; return p.active!=='No' && (!d || d>now);});", [1320, 0]),
  http("Grok classify", "POST", f"{APP}/api/ai/classify", [1540, 0], headers=SECRET_HDR,
       body='={{ JSON.stringify({ raw_ingestion_id: $json.id, source_kind: "official_api", has_consent: false, text: JSON.stringify($json.permitted_payload) }) }}'),
  code("Map to opportunity", r"""
return $input.all().map((i, idx) => {
  const raw = $('Skip if inactive/expired').all()[idx].json; const p = raw.permitted_payload; const c = i.json.classification || {};
  return { json: { kind: 'public_bid', title: String(p.title).slice(0,200), summary: c.summary || null, trade: c.trade || 'government_procurement',
    subtrades: c.subtrades || [], property_type: 'government', city: p.city, state: 'TX', zip: p.zip,
    deadline: p.responseDeadLine || null, source_id: $env.SAM_SOURCE_ID, source_url: p.uiLink, source_record_id: p.noticeId,
    last_verified_at: new Date().toISOString(),
    // Publish only when classification passed all deterministic checks; otherwise human review
    status: (i.json.ok && !i.json.needs_review) ? 'published' : 'needs_review',
    visibility: (i.json.ok && !i.json.needs_review) ? 'public' : 'internal',
    published_at: (i.json.ok && !i.json.needs_review) ? new Date().toISOString() : null } };
});""", [1760, 0]),
  http("Upsert opportunity", "POST", f"{SB}/opportunities?on_conflict=source_id,source_record_id", [1980, 0], sb=True,
       headers={"parameters": [{"name": "Prefer", "value": "resolution=merge-duplicates,return=representation"}]}, body="={{ JSON.stringify($json) }}"),
], {"Twice daily": ["Build NAICS queries"], "Build NAICS queries": ["SAM.gov Get Opportunities"], "SAM.gov Get Opportunities": ["Normalize + DFW filter + hash"],
    "Normalize + DFW filter + hash": ["Insert raw_ingestion (dedupe)"], "Insert raw_ingestion (dedupe)": ["New or changed?"], "New or changed?": [["Skip if inactive/expired"], []],
    "Skip if inactive/expired": ["Grok classify"], "Grok classify": ["Map to opportunity"], "Map to opportunity": ["Upsert opportunity"]},
"## WF-02 SAM.gov Get Opportunities Public API\nGET https://api.sam.gov/opportunities/v2/search (postedFrom/postedTo MM/dd/yyyy, limit<=1000, offset). Filters: state=TX (all of Texas), property-service NAICS. Private leads remain a DFW pilot; public bids are statewide.\nStores permitted metadata only + sha256 hash; unique (source_id, source_record_id[, hash]) prevents duplicates. Public bids are labeled non-exclusive and link to the original notice.\nSet env SAM_GOV_API_KEY, SAM_SOURCE_ID (row in sources). Daily request quota depends on SAM.gov account role.\nAdd Texas SmartBuy / city portals as separate branches only after terms review.")

# ---------- WF-04 ----------
score_js = r"""
// Mirror of app/src/lib/matching.ts — weights: trade 40, geo 25, qualifications 20, activity 10, preferences 5
const W={trade:40,geo:25,qualifications:20,activity:10,preferences:5}; const REG=['plumbing','electrical','hvac','roofing'];
const o = $('Load opportunity').first().json;
const out=[];
for (const it of $('Load contractors').all()) { const rows = Array.isArray(it.json)?it.json:[it.json];
 for (const c of rows) {
  if(!c.accepts_leads) continue;
  if((o.subtrades||[]).some(s=>REG.includes(s)) && c.license_status!=='verified') continue; // never allocate ineligible regulated trade
  if(!(c.trades||[]).includes(o.trade)) continue;
  const geo = o.zip && c.zip_codes.includes(o.zip) ? 1 : (o.zip && c.zip_codes.some(z=>z.slice(0,3)===o.zip.slice(0,3)) ? .5 : 0); if(!geo) continue;
  const plan = c.organizations?.subscriptions?.[0]; const paid = plan && ['active','trialing'].includes(plan.status);
  if (o.kind==='private_lead' && !paid) continue; // private leads routed to paying members under disclosed terms
  const qual=(c.license_status==='verified'?.5:0)+(c.insurance_status==='verified'?.5:0);
  const days=c.last_active_at?(Date.now()-Date.parse(c.last_active_at))/864e5:999; const act=days<=7?1:days<=30?.5:0;
  const pt=c.preferences?.property_types; const pref=!pt?.length||pt.includes(o.property_type)?1:0;
  const f={trade:W.trade,geo:geo*W.geo,qualifications:qual*W.qualifications,activity:act*W.activity,preferences:pref*W.preferences};
  const score=Math.round(Object.values(f).reduce((a,b)=>a+b,0)*100)/100;
  out.push({json:{opportunity_id:o.id, contractor_id:c.id, owner_user_id:c.organizations.owner_user_id, email:c.alert_email, max_alerts_daily:c.max_alerts_daily, match_score:score, match_factors:f, title:o.title, kind:o.kind, city:o.city, zip:o.zip}});
 }}
out.sort((a,b)=>b.json.match_score-a.json.match_score);
// Private leads: shared with up to 5 contractors (target minimum 3). Public bids: no cap (non-exclusive public info).
if (o.kind==='private_lead') { const top=out.slice(0,5); if (top.length<3) top.forEach(t=>t.json.under_min_target=true); if(top.length<3) console.log(`private lead ${o.id}: only ${top.length} eligible contractors (target 3) — flag for ops review`); return top; }
return out;"""
wf04 = wf("WF-04 Matching and notification", [
  node("Opportunity published (DB webhook)", "n8n-nodes-base.webhook", {"httpMethod": "POST", "path": "wf04-match", "responseMode": "onReceived", "authentication": "headerAuth", "options": {}}, [0, 0], 2, credentials={"httpHeaderAuth": {"id": "N8N_SHARED", "name": "x-shared-secret header"}}, webhookId="wf04-match"),
  http("Load opportunity", "GET", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/opportunities?id=eq.{{{{$json.body.record.id}}}}&status=eq.published&select=id,kind,title,trade,subtrades,zip,city,property_type,expires_at,deadline", [220, 0], sb=True),
  http("Load contractors", "GET", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/contractor_profiles?trades=cs.{{{{'{{' + $json.trade + '}}'}}}}&accepts_leads=eq.true&select=*,organizations(owner_user_id,subscriptions(plan,status))", [440, 0], sb=True),
  code("Score (40/25/20/10/5)", score_js, [660, 0]),
  http("Upsert match", "POST", f"{SB}/matches?on_conflict=opportunity_id,contractor_id", [880, 0], sb=True,
       headers={"parameters": [{"name": "Prefer", "value": "resolution=ignore-duplicates,return=representation"}]},
       body='={{ JSON.stringify({ opportunity_id: $json.opportunity_id, contractor_id: $json.contractor_id, match_score: $json.match_score, match_factors: $json.match_factors }) }}'),
  http("Queue notification (dedupe_key)", "POST", f"{SB}/notifications?on_conflict=dedupe_key", [1100, 0], sb=True,
       headers={"parameters": [{"name": "Prefer", "value": "resolution=ignore-duplicates,return=representation"}]},
       body='={{ JSON.stringify({ recipient_id: $("Score (40/25/20/10/5)").item.json.owner_user_id, opportunity_id: $("Score (40/25/20/10/5)").item.json.opportunity_id, channel: "email", status: "queued", dedupe_key: `opp:${$("Score (40/25/20/10/5)").item.json.opportunity_id}:user:${$("Score (40/25/20/10/5)").item.json.owner_user_id}:email` }) }}'),
  iff("Newly queued? (event dedupe)", "={{ !!$json.id }}", [1320, 0]),
  http("Resend alert", "POST", "https://api.resend.com/emails", [1540, 0], headers={"parameters": [{"name": "Authorization", "value": "=Bearer {{$env.RESEND_API_KEY}}"}, {"name": "Idempotency-Key", "value": "={{$json.dedupe_key}}"}]},
       body='={{ JSON.stringify({ from: $env.ALERT_FROM_EMAIL, to: [$("Score (40/25/20/10/5)").item.json.email], subject: `New ${$("Score (40/25/20/10/5)").item.json.kind === "public_bid" ? "public bid" : "verified request"}: ${$("Score (40/25/20/10/5)").item.json.title}`, html: `<p>${$("Score (40/25/20/10/5)").item.json.city || ""} ${$("Score (40/25/20/10/5)").item.json.zip || ""}</p><p><a href="${$env.APP_URL}/dashboard">View in your dashboard</a></p><p style="font-size:12px">Match score is a routing heuristic, not a guarantee of work. Sent by Archangel Advertising.</p>` }) }}'),
  http("Mark sent", "PATCH", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/notifications?dedupe_key=eq.{{{{$('Newly queued? (event dedupe)').item.json.dedupe_key}}}}", [1760, 0], sb=True, body='={{ JSON.stringify({ status: "sent", sent_at: new Date().toISOString() }) }}'),
], {"Opportunity published (DB webhook)": ["Load opportunity"], "Load opportunity": ["Load contractors"], "Load contractors": ["Score (40/25/20/10/5)"], "Score (40/25/20/10/5)": ["Upsert match"],
    "Upsert match": ["Queue notification (dedupe_key)"], "Queue notification (dedupe_key)": ["Newly queued? (event dedupe)"], "Newly queued? (event dedupe)": [["Resend alert"], []], "Resend alert": ["Mark sent"]},
"## WF-04 Matching / notification\nTrigger: Supabase Database Webhook on opportunities UPDATE where status becomes 'published' → POST here with x-shared-secret.\nTrade → ZIP/ZIP3 → regulated-trade license gate → plan check (private leads need paid plan) → score 40/25/20/10/5 → dedupe_key unique → Resend → dashboard badge (notifications.status).\nTODO before launch: enforce max_alerts_daily per contractor (count today's sent notifications). Verify empty-result handling of Prefer: ignore-duplicates in staging.")

# ---------- WF-06 ----------
wf06 = wf("WF-06 Freshness and quality control", [
  node("Every 6 hours", "n8n-nodes-base.scheduleTrigger", {"rule": {"interval": [{"field": "hours", "hoursInterval": 6}]}}, [0, 0], 1.2),
  http("Expire past deadline", "PATCH", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/opportunities?deadline=lt.{{{{new Date().toISOString()}}}}&status=in.(published,matched,notified)", [220, -120], sb=True,
       headers={"parameters": [{"name": "Prefer", "value": "return=representation"}]}, body='={{ JSON.stringify({ status: "expired", visibility: "internal" }) }}'),
  http("Expire past expires_at", "PATCH", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/opportunities?expires_at=lt.{{{{new Date().toISOString()}}}}&status=in.(published,matched,notified)", [220, 60], sb=True,
       headers={"parameters": [{"name": "Prefer", "value": "return=representation"}]}, body='={{ JSON.stringify({ status: "expired", visibility: "internal" }) }}'),
  http("Suppress queued alerts for closed opps", "POST", f"{SB}/rpc/suppress_closed_notifications", [440, 0], sb=True, body="={}"),
  http("Load live SAM notices to recheck", "GET", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/opportunities?kind=eq.public_bid&source_id=eq.{{{{$env.SAM_SOURCE_ID}}}}&status=in.(published,matched,notified)&last_verified_at=lt.{{{{new Date(Date.now()-864e5).toISOString()}}}}&select=id,source_record_id&limit=200", [660, 0], sb=True),
  code("Split", "const rows=$input.first().json; return (Array.isArray(rows)?rows:[rows]).filter(r=>r.id).map(r=>({json:r}));", [880, 0]),
  http("SAM.gov recheck by noticeid", "GET", "https://api.sam.gov/opportunities/v2/search", [1100, 0],
       qs={"api_key": "={{$env.SAM_GOV_API_KEY}}", "noticeid": "={{$json.source_record_id}}", "limit": "1", "offset": "0",
           "postedFrom": "={{ (d=>`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`)(new Date(Date.now()-364*864e5)) }}",
           "postedTo": "={{ (d=>`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`)(new Date()) }}"}),
  code("Decide status", "return $input.all().map((i,idx)=>{const src=$('Split').all()[idx].json; const r=(i.json.opportunitiesData||[])[0];\n const gone=!r || r.active==='No' || /cancel/i.test(r.type||'');\n return {json:{id:src.id, patch: gone?{status:'cancelled',visibility:'internal'}:{last_verified_at:new Date().toISOString(), deadline:r.responseDeadLine||null}}};});", [1320, 0]),
  http("Apply", "PATCH", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/opportunities?id=eq.{{{{$json.id}}}}", [1540, 0], sb=True, body="={{ JSON.stringify($json.patch) }}"),
], {"Every 6 hours": ["Expire past deadline", "Expire past expires_at"], "Expire past deadline": ["Suppress queued alerts for closed opps"], "Suppress queued alerts for closed opps": ["Load live SAM notices to recheck"],
    "Load live SAM notices to recheck": ["Split"], "Split": ["SAM.gov recheck by noticeid"], "SAM.gov recheck by noticeid": ["Decide status"], "Decide status": ["Apply"]},
"## WF-06 Freshness + quality\nExpires items past deadline/expires_at (never fabricates a deadline), suppresses queued alerts for closed items (RPC), and re-checks SAM.gov notices daily for cancellation/archival.\nRecheck consumes SAM.gov quota — keep limit modest.")

# ---------- WF-09 ----------
wf09 = wf("WF-09 Ops and errors", [
  node("Error Trigger", "n8n-nodes-base.errorTrigger", {}, [0, 0], 1),
  code("Shape failure", "const e=$json; return [{json:{workflow:e.workflow?.name||'unknown', node:e.execution?.lastNodeExecuted||null, error:String(e.execution?.error?.message||'').slice(0,2000), payload:{execution_id:e.execution?.id, url:e.execution?.url}}}];", [220, 0]),
  http("Record in workflow_failures", "POST", f"{SB}/rpc/record_workflow_failure", [440, 0], sb=True, retry=True,
       body='={{ JSON.stringify({ p_workflow: $json.workflow, p_node: $json.node, p_error: $json.error, p_payload: $json.payload }) }}'),
  http("Alert operator (Resend)", "POST", "https://api.resend.com/emails", [660, 0], headers={"parameters": [{"name": "Authorization", "value": "=Bearer {{$env.RESEND_API_KEY}}"}]},
       body='={{ JSON.stringify({ from: $env.ALERT_FROM_EMAIL, to: [$env.OPS_ALERT_EMAIL], subject: `[ops] ${$("Shape failure").item.json.workflow} failed (${$json[0]?.state || $json.state || "retrying"})`, text: `${$("Shape failure").item.json.node}: ${$("Shape failure").item.json.error}\\n${$("Shape failure").item.json.payload.url || ""}` }) }}'),
  node("Retry sweep (every 10 min)", "n8n-nodes-base.scheduleTrigger", {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}}, [0, 240], 1.2),
  http("Load due retries", "GET", f"={{{{$env.SUPABASE_URL}}}}/rest/v1/workflow_failures?state=eq.retrying&next_retry_at=lt.{{{{new Date().toISOString()}}}}&select=*&limit=50", [220, 240], sb=True),
  code("Re-dispatch note", "// Re-run via n8n API: POST {N8N_API_URL}/executions/{id}/retry (requires n8n API key credential),\n// or for WF-01 handoffs re-POST payload to the WF-01 webhook. Items stay visible in /admin until resolved.\nreturn $input.all();", [440, 240]),
], {"Error Trigger": ["Shape failure"], "Shape failure": ["Record in workflow_failures"], "Record in workflow_failures": ["Alert operator (Resend)"], "Retry sweep (every 10 min)": ["Load due retries"], "Load due retries": ["Re-dispatch note"]},
"## WF-09 Ops and errors\nSet as Error Workflow on WF-01/02/04/06. Error → record_workflow_failure RPC (exponential backoff 1,2,4,8,16 min; after 5 attempts → dead_letter) → email operator → retry sweep. Failed leads are never silently dropped; dead letters show in /admin.")

os.makedirs("n8n", exist_ok=True)
for fn, w in [("WF-01-direct-intake", wf01), ("WF-02-sam-gov-ingestion", wf02), ("WF-04-matching-notification", wf04), ("WF-06-freshness", wf06), ("WF-09-ops-errors", wf09)]:
    json.dump(w, open(f"n8n/{fn}.json", "w"), indent=2)
print("ok")
