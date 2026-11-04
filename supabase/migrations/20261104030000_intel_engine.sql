-- P0 intelligence engine: spec registry fields, staged records with scores/provenance, entity resolution, review queue, schedules.
alter table sources
  add column if not exists source_url text, add column if not exists access_method text, add column if not exists authentication text,
  add column if not exists allowed_collection boolean not null default false, add column if not exists allowed_storage boolean not null default false,
  add column if not exists allowed_public_display boolean not null default false, add column if not exists allowed_redistribution boolean not null default false,
  add column if not exists personal_data_restrictions text, add column if not exists refresh_schedule text not null default 'daily' check (refresh_schedule in ('hourly','6h','daily','weekly','manual')),
  add column if not exists last_successful_sync timestamptz, add column if not exists last_attempt_at timestamptz, add column if not exists error_status text,
  add column if not exists data_owner text, add column if not exists rights_review_date date,
  add column if not exists rights_decision text not null default 'pending' check (rights_decision in ('approved','pending','rejected')),
  add column if not exists rights_reason text, add column if not exists trust_tier int not null default 2 check (trust_tier between 1 and 3),
  add column if not exists connector text, add column if not exists dry_run boolean not null default true;

alter table organizations
  add column if not exists entity_key text, add column if not exists license_number text, add column if not exists taxpayer_number text,
  add column if not exists uei text, add column if not exists quality_score int, add column if not exists score_breakdown jsonb,
  add column if not exists verification_sources text[] not null default '{}', add column if not exists intel_label text;
create index if not exists organizations_entity_key_idx on organizations (entity_key);
create index if not exists organizations_quality_idx on organizations (quality_score desc nulls last);
alter table opportunities add column if not exists quality_score int, add column if not exists score_breakdown jsonb, add column if not exists intel_label text;
create index if not exists opportunities_quality_idx on opportunities (quality_score desc nulls last);

create table if not exists intel_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade, external_id text not null,
  record_type text not null check (record_type in ('job','contractor','buyer','permit_signal','hoa')),
  label text not null check (label in ('active_job','future_procurement','business_prospect','contractor_profile','unverified_signal','project_signal')),
  fields jsonb not null, provenance jsonb not null default '{}',       -- per-field {source, fetched_at}
  score int not null default 0, score_breakdown jsonb not null default '{}', gate_failures text[] not null default '{}',
  status text not null default 'review' check (status in ('published','review','rejected','archived')),
  organization_id uuid references organizations(id) on delete set null, opportunity_id uuid references opportunities(id) on delete set null,
  contains_personal_data boolean not null default false,
  fetched_at timestamptz not null default now(), reviewed_by uuid, reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_id, external_id));
create index if not exists intel_records_status_score_idx on intel_records (status, score desc);
create index if not exists intel_records_gates_idx on intel_records using gin (gate_failures);
alter table intel_records enable row level security; -- service-role only

insert into app_settings(key,value) values ('quality_threshold','{"publish":80}') on conflict (key) do nothing;

-- Export guard: no homeowner PII and no non-redistributable sources in any export.
create or replace view intel_export as
  select r.id, r.record_type, r.label, r.score, r.fields - array['owner_name','owner_phone','owner_email','mailing_address','street_address'] as fields, r.fetched_at, s.name as source
  from intel_records r join sources s on s.id = r.source_id
  where r.status = 'published' and s.allowed_redistribution and not r.contains_personal_data;
revoke all on intel_export from anon, authenticated;

-- P0 source registry (rights reviewed 2026-11-03). enabled stays false + dry_run true until an owner flips them in Data Operations.
insert into sources (name, kind, base_url, source_url, source_type, access_method, authentication, allowed_hostnames, terms_url, data_owner, owner,
  allowed_collection, allowed_storage, allowed_public_display, allowed_redistribution, personal_data_restrictions, refresh_schedule, rights_review_date,
  rights_decision, rights_reason, trust_tier, connector, dry_run, enabled) values
 ('USAspending awards (TX)','official_api','https://api.usaspending.gov','https://api.usaspending.gov/api/v2/search/spending_by_award/','api','REST POST','none',
   '{api.usaspending.gov}','https://www.usaspending.gov/about','U.S. Treasury (DATA Act)','Treasury',true,true,true,false,
   'Awardee business names only; no individual recipients.','daily','2026-11-03','approved','Federal data, public domain (17 USC 105); no key; attribution to USAspending.gov.',1,'usaspending',true,false),
 ('TDLR licenses (data.texas.gov 7358-krk7)','official_api','https://data.texas.gov','https://data.texas.gov/resource/7358-krk7.json','api','Socrata SODA','optional app token',
   '{data.texas.gov}','https://data.texas.gov/','Texas Dept. of Licensing and Regulation','TDLR',true,true,true,false,
   'Contractor license types only; display business name, license type/number, expiry, county. Never display owner_name, owner phone, or mailing address (often a home).','daily','2026-11-03','approved','Official Texas open-data mirror of the public TDLR license search; public information. License field unspecified, so redistribution stays off.',1,'tdlr',true,false),
 ('Texas franchise tax (data.texas.gov 9cir-efmm)','official_api','https://data.texas.gov','https://data.texas.gov/resource/9cir-efmm.json','api','Socrata SODA','optional app token',
   '{data.texas.gov}','https://comptroller.texas.gov/about/policies/privacy.php','Texas Comptroller','Comptroller',true,true,false,false,
   'Verification only (right-to-transact status, entity id, city/ZIP); not shown as a list.','weekly','2026-11-03','approved','Comptroller publishes as public business information on the state open-data portal.',1,'franchise_tax',true,false),
 ('Fort Worth issued permits (ArcGIS)','official_api','https://mapit.fortworthtexas.gov','https://mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Permits/FeatureServer/0','api','ArcGIS REST query','none',
   '{mapit.fortworthtexas.gov}','https://www.fortworthtexas.gov/departments/development-services/permits/issued','City of Fort Worth','Development Services',true,true,true,false,
   'Project signals only, never labelled hiring. Drop Owner_Full_Name always; residential permits keep ZIP + type only (no street address).','daily','2026-11-03','approved','City publishes issued permits as open data via its public ArcGIS service.',1,'fw_permits',true,false),
 ('Texas HOA management certificates','official_api','https://www.hoa.texas.gov','https://www.hoa.texas.gov','official_web','web search UI','none',
   '{}','https://www.hoa.texas.gov','Texas Real Estate Commission',null,false,false,false,false,'Contact names are individuals.','manual','2026-11-03','pending','No API or bulk file found and no published reuse terms; needs a written OK or a Public Information Act bulk request before any automated collection.',1,null,true,false),
 ('Texas ESBD solicitations','official_api','https://www.txsmartbuy.gov','https://www.txsmartbuy.gov/esbd','official_web','web app','none',
   '{}','https://www.txsmartbuy.gov','Texas Comptroller (Statewide Procurement)',null,false,false,false,false,null,'manual','2026-11-03','pending','No public API; JS web app. Request a feed/export from the Comptroller (or a written OK) before automated collection; Grok extraction would then run grounded-only.',1,null,true,false),
 ('DCAD bulk appraisal data','official_api','https://www.dallascad.org','https://www.dallascad.org/DataProducts.aspx','download','bulk ZIP','none',
   '{}','https://www.dallascad.org/DataProducts.aspx','Dallas Central Appraisal District',null,false,false,false,false,'Owner names/addresses are homeowner PII.','manual','2026-11-03','rejected','Downloads are public but no reuse/redistribution terms are stated and files are mostly homeowner names/addresses. Revisit for commercial parcels only with written permission.',1,null,true,false)
on conflict (name) do update set source_url=excluded.source_url, rights_decision=excluded.rights_decision, rights_reason=excluded.rights_reason,
  personal_data_restrictions=excluded.personal_data_restrictions, allowed_hostnames=excluded.allowed_hostnames, connector=excluded.connector, trust_tier=excluded.trust_tier;

-- Versioned rights rows for the approved sources (fetch + store + summary; no export/resale).
insert into source_rights (source_id, approval_version, allowed_purposes, can_fetch, can_store_raw, can_publish_summary, can_make_derivatives, can_export, can_resell, attribution, retention_days, notes, approved_at, review_due_at)
select id, coalesce((select max(approval_version) from source_rights r where r.source_id = s.id), 0) + 1, '{directory,matching,verification}', true, false,
       name not like 'Texas franchise%', true, false, false, data_owner, 400, rights_reason, now(), now() + interval '180 days'
from sources s where rights_decision = 'approved' and connector is not null and current_rights_id is null;
update sources s set current_rights_id = (select id from source_rights r where r.source_id = s.id order by approval_version desc limit 1)
where rights_decision = 'approved' and connector is not null and current_rights_id is null;
