-- Crewforthat — migration v2 (Phase 1 spec v3.0). ADDITIVE ONLY: no drops of existing columns/tables/data.
-- Reverse with supabase/rollback/20261103020000_v2_phase1_down.sql.
begin;

create or replace function deny_mutation_generic() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;

-- ===== 1. Config: plans + entitlements (DB-driven, admin-editable) =====
create table plans (
  code text primary key check (code ~ '^[a-z_]+$'),
  name text not null,
  monthly_price_cents int not null check (monthly_price_cents >= 0),
  trial_days int not null default 0 check (trial_days between 0 and 14),
  stripe_price_id text unique,
  purchasable boolean not null default false,   -- owner toggles (hide unbuilt tiers)
  visible boolean not null default false,
  sort int not null default 0,
  entitlements jsonb not null default '{}',      -- feature flags + limits, never trusted from client
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into plans(code,name,monthly_price_cents,trial_days,purchasable,visible,sort,entitlements) values
 ('free','Free',0,0,true,true,0,     '{"tabs":["jobs_now"],"public_bids":true,"private_leads":false,"contact_reveal":false,"saved_limit":5,"digest":"weekly"}'),
 ('starter','Starter',3999,3,true,true,1,'{"tabs":["jobs_now","future_contracts"],"public_bids":true,"private_leads":true,"contact_reveal":true,"saved_limit":25,"digest":"daily","trades_max":1,"zips_max":5}'),
 ('pro_match','Pro Match',7999,3,true,true,2,'{"tabs":["jobs_now","future_contracts","find_buyers"],"public_bids":true,"private_leads":true,"contact_reveal":true,"saved_limit":200,"digest":"daily","matched_alerts":true,"trades_max":5,"zips_max":50,"property_intel":true}'),
 ('growth','Growth',14999,3,false,false,3,'{"tabs":["jobs_now","future_contracts","find_buyers"],"public_bids":true,"private_leads":true,"contact_reveal":true,"saved_limit":1000,"multi_territory":true,"team_seats":3}'),
 ('elite','Elite',29999,3,false,false,4,'{"tabs":["jobs_now","future_contracts","find_buyers"],"public_bids":true,"private_leads":true,"contact_reveal":true,"saved_limit":5000,"multi_territory":true,"team_seats":10,"advanced_reporting":true}');

create table app_settings (key text primary key, value jsonb not null, updated_by uuid, updated_at timestamptz not null default now());
insert into app_settings(key,value) values
 ('archive_policy','{"direct_urgent":{"reconfirm_h":48,"hide_h":72},"direct":{"reconfirm_d":7,"hide_d":14},"recurring":{"reconfirm_d":30,"hide_d":30},"apartment":{"reconfirm_d":7,"hide_d":21},"social_signal":{"reconfirm_h":72,"hide_h":72},"public_bid":{"close":"official_deadline"},"profile":{"recheck_d":90}}'),
 ('market','{"direct_leads":"DFW","public_bids":"TX"}'),
 ('private_lead_cap','{"max":5,"min_target":3}'),
 ('trial','{"enabled":true,"days":3,"contact_reveal":false}');

-- ===== 2. Source registry + versioned rights (deny by default) =====
alter table sources
  add column base_domain text, add column source_type text check (source_type in ('api','feed','download','official_web','partner','direct')),
  add column robots_or_access_notes text, add column terms_url text, add column owner text,
  add column refresh_interval interval, add column api_quota int, add column cost_limit_usd numeric(10,2),
  add column allowed_hostnames text[] not null default '{}', add column enabled boolean not null default false,
  add column emergency_paused boolean not null default false, add column current_rights_id uuid;
create table source_rights (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  approval_version int not null,
  allowed_purposes text[] not null default '{}',
  can_fetch boolean not null default false, can_store_raw boolean not null default false,
  can_publish_summary boolean not null default false, can_make_derivatives boolean not null default false,
  can_export boolean not null default false, can_resell boolean not null default false,
  attribution text, max_age_days int, retention_days int,
  approved_by uuid references auth.users(id), approved_at timestamptz, review_due_at timestamptz, expires_at timestamptz,
  notes text, created_at timestamptz not null default now(),
  unique (source_id, approval_version)
);
alter table sources add constraint sources_current_rights_fk foreign key (current_rights_id) references source_rights(id);
create trigger source_rights_immutable before update or delete on source_rights for each row execute function deny_mutation_generic();

-- Fail-closed rights check: unknown / expired / paused / disabled source => false
create or replace function source_can(p_source uuid, p_action text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.enabled and not s.emergency_paused
       and r.approved_at is not null and (r.expires_at is null or r.expires_at > now())
       and case p_action when 'fetch' then r.can_fetch when 'store' then r.can_store_raw
                         when 'publish' then r.can_publish_summary when 'export' then r.can_export
                         when 'resell' then r.can_resell when 'derive' then r.can_make_derivatives else false end
    from sources s join source_rights r on r.id = s.current_rights_id where s.id = p_source), false);
$$;

create table ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'running' check (status in ('running','succeeded','failed','blocked_rights','blocked_budget')),
  new_count int not null default 0, updated_count int not null default 0, closed_count int not null default 0,
  error text, cost_usd numeric(10,4) not null default 0
);
alter table raw_ingestions add column revision text, add column ingestion_run_id uuid references ingestion_runs(id);
create table connector_health (
  source_id uuid primary key references sources(id) on delete cascade,
  last_success_at timestamptz, last_checked_at timestamptz, consecutive_failures int not null default 0,
  last_error text, updated_at timestamptz not null default now()
);

-- ===== 3. Opportunities v2 (three tabs, provenance, lifecycle) =====
alter table opportunities
  add column listing_type text check (listing_type in ('direct_verified','public_bid','upcoming_forecast','buyer_prospect','social_signal_unverified')),
  add column rights_id uuid references source_rights(id),
  add column geographic_scope text not null default 'zip' check (geographic_scope in ('zip','city','metro','statewide')),
  add column urgency text check (urgency in ('urgent','normal','recurring')),
  add column organization_ref uuid, -- buyer org (FK below)
  add column official_apply_url text,
  add column last_checked_at timestamptz,
  add column reliability numeric(3,2) check (reliability between 0 and 1),
  add column is_inferred boolean not null default false,
  add column reconfirm_due_at timestamptz, add column hide_after timestamptz,
  add column closed_at timestamptz, add column close_reason text, add column archived_at timestamptz,
  add column revision int not null default 1;
-- tab is derived, never stored separately
create or replace function opportunity_tab(lt text, k opportunity_kind) returns text language sql immutable as $$
  select case coalesce(lt, case k when 'public_bid' then 'public_bid' when 'private_lead' then 'direct_verified' else 'social_signal_unverified' end)
    when 'direct_verified' then 'jobs_now' when 'public_bid' then 'jobs_now' when 'social_signal_unverified' then 'jobs_now'
    when 'upcoming_forecast' then 'future_contracts' when 'buyer_prospect' then 'find_buyers' end $$;
create index on opportunities (listing_type, status);
create index on opportunities (hide_after) where hide_after is not null;

create table opportunity_events (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  event text not null, from_status text, to_status text, revision int,
  actor text not null, evidence_url text, metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create trigger opportunity_events_immutable before update on opportunity_events for each row execute function deny_mutation_generic();
create table opportunity_facts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  field text not null, value jsonb, evidence_url text, text_span text,
  confidence numeric(3,2) check (confidence between 0 and 1),
  status text not null default 'not_specified' check (status in ('confirmed','typical_verify','not_specified')),
  is_inferred boolean not null default false, source_id uuid references sources(id), rights_id uuid references source_rights(id),
  collected_at timestamptz not null default now(), last_checked_at timestamptz
);

-- Central status-change log + revision bump + alert suppression (RT-08)
create or replace function on_opportunity_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.revision := old.revision + 1;
    if new.status in ('expired','withdrawn','cancelled','rejected') then
      new.closed_at := coalesce(new.closed_at, now());
      if new.status <> 'rejected' then new.visibility := case when new.visibility = 'public' then 'internal' else new.visibility end; end if;
      update notifications set status = 'suppressed' where opportunity_id = new.id and status = 'queued';
      update lead_access set status = 'expired' where opportunity_id = new.id and status = 'active' and new.status <> 'withdrawn';
    end if;
    insert into opportunity_events(opportunity_id, event, from_status, to_status, revision, actor)
    values (new.id, 'status_change', old.status::text, new.status::text, new.revision, coalesce(nullif(current_setting('app.actor', true),''), 'system'));
  end if;
  return new;
end $$;
create trigger opportunities_status_change before update of status on opportunities for each row execute function on_opportunity_status();

-- ===== 4. Directory: organizations, properties, relationships, claims =====
alter table organizations alter column owner_user_id drop not null; -- directory entities may be unclaimed (reverse only if none null)
alter table organizations
  add column kind text not null default 'contractor' check (kind in ('contractor','buyer','property_owner','manager','agency','hoa','hotel','retail','airport','school','government','general_contractor','other')),
  add column slug text unique, add column public_website text, add column public_business_phone text,
  add column city text, add column zip text check (zip is null or zip ~ '^\d{5}$'),
  add column vendor_onboarding_url text,
  add column claim_status text not null default 'unclaimed' check (claim_status in ('unclaimed','pending','claimed','disputed')),
  add column is_directory_listed boolean not null default false,
  add column source_id uuid references sources(id), add column rights_id uuid references source_rights(id),
  add column last_checked_at timestamptz,
  add column public_profile_optin boolean not null default false, add column data_use_optin boolean not null default false,
  add column webflow_item_id text, add column webflow_synced_at timestamptz;
alter table opportunities add constraint opportunities_org_fk foreign key (organization_ref) references organizations(id) on delete set null;

create table properties (
  id uuid primary key default gen_random_uuid(),
  name text, property_type text, address_line text, city text, zip text check (zip is null or zip ~ '^\d{5}$'),
  source_id uuid references sources(id), rights_id uuid references source_rights(id), evidence_url text,
  last_checked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table organization_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  related_org_id uuid references organizations(id) on delete cascade,
  relation text not null check (relation in ('owns','manages','vendor_of','parent_of')),
  verification verification_status not null default 'unverified',
  evidence_url text, effective_from date, effective_to date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table profile_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('domain_email','document_review')), -- never phone/public-text only (RT-05)
  claim_email text, challenge_hash text, challenge_expires_at timestamptz, attempts int not null default 0,
  evidence jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','challenge_sent','verified','approved','rejected','disputed','rolled_back')),
  reviewed_by uuid references auth.users(id), decided_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index profile_claims_one_open on profile_claims (organization_id, claimant_user_id) where status in ('pending','challenge_sent');

alter table contractor_profiles
  add column min_job_value numeric(12,2), add column availability_confirmed_at timestamptz,
  add column goal text check (goal in ('now','future','buyers','all')), add column statewide boolean not null default false,
  add column public_display jsonb not null default '{}';

-- ===== 5. Homeowner flow v2: submissions, split consents, manage tokens, disclosures =====
create table job_submissions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid unique references opportunities(id) on delete cascade,
  submitter_kind text not null default 'homeowner' check (submitter_kind in ('homeowner','property_manager')),
  organization_name text, vendor_instructions_url text, public_rfp_url text,
  verified_at timestamptz, verify_channel text,
  public_listing_consent_id uuid references consents(id), contact_share_consent_id uuid references consents(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table manage_tokens (  -- RT-21: random, single-purpose, hashed, expiring, revocable
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('verify','manage','reconfirm')),
  expires_at timestamptz not null, used_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table contact_disclosures ( -- every reveal, append-only (RT-01)
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  contractor_id uuid not null references contractor_profiles(id) on delete cascade,
  requested_by uuid not null, consent_id uuid not null references consents(id), plan_code text not null,
  purpose text not null, created_at timestamptz not null default now()
);
create trigger contact_disclosures_immutable before update on contact_disclosures for each row execute function deny_mutation_generic();

-- ===== 6. Contractor app: saved items, alert prefs =====
create table saved_items (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractor_profiles(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  note text, created_at timestamptz not null default now(),
  check (num_nonnulls(opportunity_id, organization_id) = 1),
  unique nulls not distinct (contractor_id, opportunity_id, organization_id)
);
create table alerts_preferences (
  contractor_id uuid primary key references contractor_profiles(id) on delete cascade,
  frequency text not null default 'weekly' check (frequency in ('off','instant','daily','weekly')),
  tabs text[] not null default '{jobs_now}', language text not null default 'en' check (language in ('en','es')),
  marketing_optin boolean not null default false, unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ===== 7. Billing v2 =====
alter table subscriptions
  add column plan_code text references plans(code) default 'free',
  add column trial_end timestamptz, add column cancel_at_period_end boolean not null default false,
  add column last_event_created timestamptz; -- out-of-order protection (RT-06)
alter table stripe_events add column created timestamptz, add column subscription_id text, add column payload_hash text;
create table billing_ledger (
  id uuid primary key default gen_random_uuid(),
  stripe_object_id text not null unique, kind text not null check (kind in ('charge','refund','fee','payout','invoice','credit')),
  organization_id uuid references organizations(id), amount_cents bigint not null, currency text not null default 'usd',
  occurred_at timestamptz not null, stripe_event_id text references stripe_events(id), created_at timestamptz not null default now()
);
create trigger billing_ledger_immutable before update or delete on billing_ledger for each row execute function deny_mutation_generic();
create table billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id), stripe_refund_or_credit_id text,
  amount_cents bigint not null, reason text not null check (length(reason) >= 5),
  requested_by uuid not null, approved_by uuid, created_at timestamptz not null default now(),
  check (approved_by is null or approved_by <> requested_by)
);

-- ===== 8. Admin roles, actions, support, privacy, AI usage =====
create table admin_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','finance_admin','content_admin','support_agent','auditor_readonly')),
  granted_by uuid references auth.users(id), granted_at timestamptz not null default now(),
  primary key (user_id, role),
  check (granted_by is null or granted_by <> user_id) -- no self-grant (RT-11); null only for bootstrap via SQL editor
);
create table admin_actions (
  id bigint generated always as identity primary key,
  actor uuid not null, action text not null, object_type text not null, object_id text,
  reason text, requires_second_approval boolean not null default false, approved_by uuid,
  diff jsonb not null default '{}', created_at timestamptz not null default now(),
  check (approved_by is null or approved_by <> actor)
);
create trigger admin_actions_immutable before delete on admin_actions for each row execute function deny_mutation_generic();
alter table moderation_queue add column priority text not null default 'P2' check (priority in ('P0','P1','P2','P3')),
  add column case_type text not null default 'data_review' check (case_type in ('data_review','report_listing','claim','privacy','abuse','billing','support','rights'));
create table privacy_requests (
  id uuid primary key default gen_random_uuid(), request_type text not null check (request_type in ('export','delete','withdraw','correct')),
  email_hash text not null, opportunity_id uuid references opportunities(id) on delete set null,
  status text not null default 'open' check (status in ('open','verifying','in_progress','done','rejected')),
  handled_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table ai_usage (
  id bigint generated always as identity primary key, function_name text not null, model text not null,
  input_tokens int, output_tokens int, cost_usd numeric(10,6), ok boolean not null, error text,
  source_id uuid references sources(id), created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['plans','properties','organization_relationships','profile_claims','job_submissions','privacy_requests'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop; end $$;

-- ===== 9. Authorization helpers =====
create or replace function has_admin_role(roles text[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_roles where user_id = auth.uid() and role = any(roles))
      or (exists (select 1 from profiles where user_id = auth.uid() and role = 'admin') and 'owner' = any(roles));
$$;
create or replace function current_plan(p_org uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(s.plan_code,'free') from subscriptions s
     where s.organization_id = p_org and s.status in ('active','trialing') order by s.updated_at desc limit 1), 'free');
$$;
-- Contact reveal entitlement: paid plan with contact_reveal, status ACTIVE (never trialing, never free) (RT-07)
create or replace function can_reveal_contacts(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions s join plans p on p.code = s.plan_code
     where s.organization_id = p_org and s.status = 'active' and p.code <> 'free'
       and coalesce((p.entitlements->>'contact_reveal')::boolean, false));
$$;

-- Private-lead recipient cap (max from app_settings, default 5) enforced in DB
create or replace function enforce_lead_cap() returns trigger language plpgsql security definer set search_path = public as $$
declare cap int := coalesce((select (value->>'max')::int from app_settings where key='private_lead_cap'), 5);
begin
  if exists (select 1 from lead_access where opportunity_id = new.opportunity_id and contractor_id = new.contractor_id) then return new; end if;
  if (select count(*) from lead_access where opportunity_id = new.opportunity_id and status in ('active','expired')) >= cap then
    raise exception 'private lead recipient cap (%) reached', cap;
  end if;
  return new;
end $$;
create trigger lead_access_cap before insert on lead_access for each row execute function enforce_lead_cap();

-- Server-side reveal (called by API with the contractor's own JWT). Checks: matched, consent live, published,
-- paid active entitlement, cap; writes lead_access + disclosure + audit; returns contact.
create or replace function reveal_contact(p_opportunity uuid, p_purpose text default 'respond_to_job')
returns table(contact_name text, email text, phone text) language plpgsql security definer set search_path = public as $$
declare v_cp uuid; v_org uuid; v_consent uuid; v_plan text;
begin
  select cp.id, cp.organization_id into v_cp, v_org from contractor_profiles cp join organizations o on o.id = cp.organization_id
   where o.owner_user_id = auth.uid() limit 1;
  if v_cp is null then raise exception 'not_a_contractor' using errcode = '42501'; end if;
  if not can_reveal_contacts(v_org) then raise exception 'plan_not_entitled' using errcode = '42501'; end if;
  if not exists (select 1 from matches where opportunity_id = p_opportunity and contractor_id = v_cp) then raise exception 'not_matched' using errcode = '42501'; end if;
  select coalesce(js.contact_share_consent_id, o.consent_id) into v_consent
    from opportunities o left join job_submissions js on js.opportunity_id = o.id
   where o.id = p_opportunity and o.kind = 'private_lead' and o.status in ('published','matched','notified','responded') and o.archived_at is null;
  if v_consent is null or exists (select 1 from consents where id = v_consent and withdrawn_at is not null) then raise exception 'no_consent' using errcode = '42501'; end if;
  v_plan := current_plan(v_org);
  insert into lead_access(opportunity_id, contractor_id, consent_basis) values (p_opportunity, v_cp, v_consent) on conflict (opportunity_id, contractor_id) do nothing;
  if not exists (select 1 from lead_access where opportunity_id = p_opportunity and contractor_id = v_cp and status = 'active') then raise exception 'access_revoked' using errcode = '42501'; end if;
  insert into contact_disclosures(opportunity_id, contractor_id, requested_by, consent_id, plan_code, purpose) values (p_opportunity, v_cp, auth.uid(), v_consent, v_plan, p_purpose);
  insert into audit_logs(actor, action, object_type, object_id, metadata) values (auth.uid()::text, 'contact_reveal', 'opportunity', p_opportunity::text, jsonb_build_object('contractor', v_cp, 'plan', v_plan));
  return query select lc.contact_name, lc.email, lc.phone from lead_contacts lc where lc.opportunity_id = p_opportunity;
end $$;
revoke execute on function reveal_contact(uuid, text) from public, anon;
grant execute on function reveal_contact(uuid, text) to authenticated;
-- source_can is read-only boolean and must stay callable by anon/authenticated because RLS policies use it.

-- ===== 10. RLS for new tables (deny by default; service role bypasses) =====
alter table plans enable row level security;            create policy plans_public on plans for select using (visible);
alter table app_settings enable row level security;     create policy settings_admin on app_settings for select to authenticated using (has_admin_role(array['owner','content_admin','finance_admin','auditor_readonly']));
alter table source_rights enable row level security;    create policy rights_admin on source_rights for select to authenticated using (has_admin_role(array['owner','content_admin','auditor_readonly']));
alter table ingestion_runs enable row level security;   create policy runs_admin on ingestion_runs for select to authenticated using (has_admin_role(array['owner','content_admin','auditor_readonly']));
alter table connector_health enable row level security; create policy health_admin on connector_health for select to authenticated using (has_admin_role(array['owner','content_admin','auditor_readonly']));
alter table opportunity_events enable row level security; create policy events_admin on opportunity_events for select to authenticated using (is_admin() or has_admin_role(array['owner','content_admin','support_agent','auditor_readonly']));
alter table opportunity_facts enable row level security; create policy facts_public on opportunity_facts for select using (exists (select 1 from opportunities o where o.id = opportunity_id));
alter table properties enable row level security;       create policy props_admin on properties for select to authenticated using (has_admin_role(array['owner','content_admin','auditor_readonly']));
alter table organization_relationships enable row level security; create policy rel_admin on organization_relationships for select to authenticated using (has_admin_role(array['owner','content_admin','auditor_readonly']));
alter table profile_claims enable row level security;   create policy claims_own on profile_claims for select to authenticated using (claimant_user_id = auth.uid() or has_admin_role(array['owner','content_admin','support_agent']));
alter table job_submissions enable row level security;  create policy subs_admin on job_submissions for select to authenticated using (has_admin_role(array['owner','support_agent']));
alter table manage_tokens enable row level security;    -- no policies: service role only
alter table contact_disclosures enable row level security; create policy disc_own on contact_disclosures for select to authenticated using (contractor_id in (select my_contractor_ids()) or has_admin_role(array['owner','auditor_readonly']));
alter table saved_items enable row level security;
create policy saved_own on saved_items for all to authenticated using (contractor_id in (select my_contractor_ids())) with check (contractor_id in (select my_contractor_ids()));
alter table alerts_preferences enable row level security;
create policy prefs_own on alerts_preferences for all to authenticated using (contractor_id in (select my_contractor_ids())) with check (contractor_id in (select my_contractor_ids()));
alter table billing_ledger enable row level security;   create policy ledger_fin on billing_ledger for select to authenticated using (has_admin_role(array['owner','finance_admin','auditor_readonly']));
alter table billing_adjustments enable row level security; create policy adj_fin on billing_adjustments for select to authenticated using (has_admin_role(array['owner','finance_admin','auditor_readonly']));
alter table admin_roles enable row level security;      create policy roles_read on admin_roles for select to authenticated using (user_id = auth.uid() or has_admin_role(array['owner','auditor_readonly']));
alter table admin_actions enable row level security;    create policy actions_read on admin_actions for select to authenticated using (has_admin_role(array['owner','auditor_readonly']));
alter table privacy_requests enable row level security; create policy privacy_admin on privacy_requests for select to authenticated using (has_admin_role(array['owner','support_agent']));
alter table ai_usage enable row level security;         create policy ai_admin on ai_usage for select to authenticated using (has_admin_role(array['owner','auditor_readonly']));

-- Directory orgs (unclaimed, listed, rights allow publish) are public; owners/admins as before
create policy orgs_directory_public on organizations for select to anon, authenticated using (
  is_directory_listed and (source_id is null and public_profile_optin or source_can(source_id, 'publish')));

-- Tighten public opportunities: not archived, not past hide_after, and source rights allow publish when source-derived (RT-04/RT-08)
drop policy opps_public on opportunities;
create policy opps_public on opportunities for select to anon, authenticated using (
  visibility = 'public' and status in ('published','matched','notified','responded')
  and kind in ('public_bid','discovery_signal') and verification_status <> 'rejected' and not is_test_data
  and archived_at is null and (hide_after is null or hide_after > now())
  and (source_id is null or source_can(source_id, 'publish')));

create or replace view public_opportunities with (security_invoker = true) as
  select id, kind, title, summary, trade, subtrades, property_type, city, state, zip,
         budget_min, budget_max, deadline, source_url, published_at, last_verified_at, expires_at, status,
         listing_type, opportunity_tab(listing_type, kind) as tab, geographic_scope, official_apply_url, last_checked_at
  from opportunities;
grant select on public_opportunities to anon, authenticated;

-- Archive/reconfirm sweep (n8n daily, service role only)
create or replace function archive_sweep() returns jsonb language plpgsql security definer set search_path = public as $$
declare hidden int; expired_bids int; begin
  perform set_config('app.actor','system:archive_sweep', true);
  update opportunities set status = 'expired' where status in ('published','matched','notified','responded')
     and ((hide_after is not null and hide_after <= now()) or (kind = 'public_bid' and deadline is not null and deadline < now()));
  get diagnostics hidden = row_count;
  update opportunities set archived_at = now() where archived_at is null and status in ('expired','withdrawn','cancelled','rejected') and closed_at < now() - interval '30 days';
  get diagnostics expired_bids = row_count;
  return jsonb_build_object('expired', hidden, 'archived', expired_bids);
end $$;
revoke execute on function archive_sweep() from public, anon, authenticated;

insert into audit_logs(actor, action, object_type, metadata) values ('migration','schema_v2_applied','schema','{"version":"20261103020000"}');
commit;
