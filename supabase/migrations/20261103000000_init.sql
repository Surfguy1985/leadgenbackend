-- Archangel Advertising lead marketplace — initial schema (spec §4)
-- Public bids / discovery signals / verified private leads are strictly separated.
-- gen_random_uuid() is built into Postgres 13+ (no extension needed)

-- ---------- Enums ----------
create type user_role as enum ('homeowner','manager','contractor','admin');
create type source_kind as enum ('official_api','partner','direct','community_referral');
create type opportunity_kind as enum ('public_bid','discovery_signal','private_lead');
-- Lifecycle: ingested → classified → needs_review / verified → published → matched → notified → responded / expired / withdrawn
create type lifecycle_status as enum ('draft','ingested','classified','needs_review','verified','published','matched','notified','responded','expired','withdrawn','cancelled','rejected');
create type visibility as enum ('public','private','internal');
create type verification_status as enum ('unverified','pending','verified','rejected');
create type processing_status as enum ('pending','processing','processed','failed','dead_letter','skipped');
create type review_state as enum ('open','in_review','approved','rejected','merged','split');
create type sub_status as enum ('incomplete','trialing','active','past_due','canceled','unpaid','paused');
create type plan_tier as enum ('free','local_pro','multi_trade');

-- ---------- Helpers ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Tables ----------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role user_role not null default 'homeowner',
  display_name text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  type text not null default 'contractor',
  verified_status verification_status not null default 'unverified',
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contractor_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  trades text[] not null default '{}',
  zip_codes text[] not null default '{}',
  service_radius int check (service_radius is null or service_radius between 0 and 250),
  license_status verification_status not null default 'unverified',
  insurance_status verification_status not null default 'unverified',
  accepts_leads boolean not null default true,
  max_alerts_daily int not null default 10 check (max_alerts_daily between 0 and 500),
  preferences jsonb not null default '{}',
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on contractor_profiles using gin (trades);
create index on contractor_profiles using gin (zip_codes);

create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind source_kind not null,
  base_url text,
  terms_reviewed_at timestamptz,
  permission_scope text,
  reuse_allowed boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table raw_ingestions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  source_record_id text not null,
  source_url text,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  permitted_payload jsonb not null,
  processing_status processing_status not null default 'pending',
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Immutable dedupe: same record + same content never ingested twice
create unique index raw_ingestions_dedupe on raw_ingestions (source_id, source_record_id, payload_hash);
create index on raw_ingestions (processing_status);

create table consents (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references auth.users(id) on delete set null,
  opportunity_id uuid, -- FK added after opportunities
  purpose text not null,
  sharing_scope text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  privacy_version text not null,
  proof jsonb not null default '{}', -- ip hash, user agent, form id, checkbox text
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  kind opportunity_kind not null,
  title text not null,
  summary text,
  trade text not null,
  subtrades text[] not null default '{}',
  property_type text,
  city text,
  state text not null default 'TX',
  zip text check (zip is null or zip ~ '^\d{5}$'),
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  deadline timestamptz,
  is_recurring boolean,
  source_id uuid references sources(id),
  source_url text,
  source_record_id text,
  owner_user_id uuid references auth.users(id) on delete set null, -- requester for private leads
  submission_id text, -- WF-01 idempotency
  scope_hash text,    -- normalized-scope hash for human-reviewed dedupe
  published_at timestamptz,
  last_verified_at timestamptz,
  expires_at timestamptz,
  status lifecycle_status not null default 'ingested',
  visibility visibility not null default 'internal',
  verification_status verification_status not null default 'unverified',
  consent_id uuid references consents(id),
  is_test_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_order check (budget_min is null or budget_max is null or budget_min <= budget_max),
  -- discovery signals are never purchasable/private leads and never carry consent-based routing
  constraint private_lead_needs_consent check (kind <> 'private_lead' or status in ('draft','ingested','classified','needs_review','withdrawn','rejected') or consent_id is not null),
  constraint test_data_never_public check (not is_test_data or visibility <> 'public')
);
alter table opportunities add constraint opportunities_source_dedupe unique (source_id, source_record_id);
alter table opportunities add constraint opportunities_submission_dedupe unique (submission_id);
create index on opportunities (status, visibility, kind);
create index on opportunities (trade, zip);
create index on opportunities (scope_hash);
alter table consents add constraint consents_opportunity_fk foreign key (opportunity_id) references opportunities(id) on delete cascade;

create table lead_contacts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references opportunities(id) on delete cascade,
  contact_name text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  contractor_id uuid not null references contractor_profiles(id) on delete cascade,
  match_score numeric(5,2) not null check (match_score between 0 and 100),
  match_factors jsonb not null default '{}',
  notification_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, contractor_id)
);

create table lead_access (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  contractor_id uuid not null references contractor_profiles(id) on delete cascade,
  access_type text not null default 'contact',
  granted_at timestamptz not null default now(),
  consent_basis uuid not null references consents(id),
  status text not null default 'active' check (status in ('active','revoked','expired','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, contractor_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  channel text not null default 'email',
  status text not null default 'queued' check (status in ('queued','sent','failed','suppressed','read')),
  sent_at timestamptz,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan plan_tier not null default 'free',
  status sub_status not null default 'incomplete',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table moderation_queue (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  raw_ingestion_id uuid references raw_ingestions(id) on delete cascade,
  reason text not null,
  details jsonb not null default '{}',
  review_state review_state not null default 'open',
  reviewer uuid references auth.users(id),
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on moderation_queue (review_state);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null, -- user uuid, 'system', 'n8n:WF-01', 'stripe'
  action text not null,
  object_type text not null,
  object_id text,
  metadata jsonb not null default '{}',
  "timestamp" timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on audit_logs ("timestamp");

-- Support tables (ops): Stripe idempotency + WF-09 dead letters
create table stripe_events (
  id text primary key, -- Stripe event id
  type text not null,
  processed_at timestamptz not null default now()
);
create table workflow_failures (
  id uuid primary key default gen_random_uuid(),
  workflow text not null,
  node text,
  payload jsonb,
  error text,
  attempts int not null default 0,
  next_retry_at timestamptz,
  state text not null default 'retrying' check (state in ('retrying','dead_letter','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['profiles','organizations','contractor_profiles','sources','raw_ingestions','consents','opportunities','lead_contacts','matches','lead_access','notifications','subscriptions','moderation_queue','audit_logs','workflow_failures'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop; end $$;

-- audit_logs are append-only
create or replace function deny_mutation() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_logs_immutable before update or delete on audit_logs for each row execute function deny_mutation();

-- Withdrawn consent immediately stops access + notifications (WF-01 rule)
create or replace function on_consent_withdrawn() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update lead_access set status = 'revoked' where consent_basis = new.id and status = 'active';
    update opportunities set status = 'withdrawn', visibility = 'internal' where consent_id = new.id;
    update notifications set status = 'suppressed' where opportunity_id = new.opportunity_id and status = 'queued';
    insert into audit_logs(actor, action, object_type, object_id) values ('system','consent_withdrawn','consent', new.id::text);
  end if;
  return new;
end $$;
create trigger consents_withdrawn after update of withdrawn_at on consents for each row execute function on_consent_withdrawn();

-- ---------- Authorization helpers ----------
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin');
$$;
create or replace function my_contractor_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select cp.id from contractor_profiles cp join organizations o on o.id = cp.organization_id where o.owner_user_id = auth.uid();
$$;
create or replace function has_lead_access(opp uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lead_access la join consents c on c.id = la.consent_basis
    where la.opportunity_id = opp and la.status = 'active' and c.withdrawn_at is null
      and la.contractor_id in (select my_contractor_ids()));
$$;

-- ---------- Row-level security ----------
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table contractor_profiles enable row level security;
alter table sources enable row level security;
alter table raw_ingestions enable row level security;
alter table opportunities enable row level security;
alter table lead_contacts enable row level security;
alter table consents enable row level security;
alter table matches enable row level security;
alter table lead_access enable row level security;
alter table notifications enable row level security;
alter table subscriptions enable row level security;
alter table moderation_queue enable row level security;
alter table audit_logs enable row level security;
alter table stripe_events enable row level security;
alter table workflow_failures enable row level security;
-- (service_role bypasses RLS; all writes for leads, billing, admin go through server routes / n8n with service key)

create policy profiles_self on profiles for select using (user_id = auth.uid() or is_admin());
create policy profiles_self_upd on profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid() and role <> 'admin');

create policy orgs_owner on organizations for select using (owner_user_id = auth.uid() or is_admin());
create policy orgs_owner_upd on organizations for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy cp_owner on contractor_profiles for select using (id in (select my_contractor_ids()) or is_admin());
create policy cp_owner_upd on contractor_profiles for update using (id in (select my_contractor_ids())) with check (id in (select my_contractor_ids()));

create policy sources_public on sources for select using (active and reuse_allowed);

-- PUBLIC: only approved, published, public opportunities that are not test data and not private leads
create policy opps_public on opportunities for select to anon, authenticated using (
  visibility = 'public' and status in ('published','matched','notified','responded')
  and kind in ('public_bid','discovery_signal') and verification_status <> 'rejected' and not is_test_data);
-- Requester sees own; contractor sees private leads only via lead_access; admins see all
create policy opps_owner on opportunities for select to authenticated using (owner_user_id = auth.uid());
create policy opps_access on opportunities for select to authenticated using (has_lead_access(id));
create policy opps_admin on opportunities for select to authenticated using (is_admin());

-- lead_contacts: NEVER public; only via active lead_access with live consent, or admin
create policy contacts_access on lead_contacts for select to authenticated using (has_lead_access(opportunity_id) or is_admin());

create policy consents_self on consents for select to authenticated using (subject_user_id = auth.uid() or is_admin());
create policy matches_own on matches for select to authenticated using (contractor_id in (select my_contractor_ids()) or is_admin());
create policy access_own on lead_access for select to authenticated using (contractor_id in (select my_contractor_ids()) or is_admin());
create policy notif_own on notifications for select to authenticated using (recipient_id = auth.uid());
create policy subs_own on subscriptions for select to authenticated using (organization_id in (select id from organizations where owner_user_id = auth.uid()) or is_admin());
create policy mod_admin on moderation_queue for select to authenticated using (is_admin());
create policy audit_admin on audit_logs for select to authenticated using (is_admin());
create policy raw_admin on raw_ingestions for select to authenticated using (is_admin());
-- stripe_events, workflow_failures: no policies → service role only

-- Safe public view (coarse location only; no contacts, no owner)
create view public_opportunities with (security_invoker = true) as
  select id, kind, title, summary, trade, subtrades, property_type, city, state, zip,
         budget_min, budget_max, deadline, source_url, published_at, last_verified_at, expires_at, status
  from opportunities;
grant select on public_opportunities to anon, authenticated;

-- ---------- Storage: private bucket for job photos (signed URLs only) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos','job-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
create policy job_photos_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy job_photos_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Ops helpers used by n8n (service role only) ----------
alter table contractor_profiles add column alert_email text; -- where WF-04 sends alerts (verified at join)

create or replace function suppress_closed_notifications() returns int language sql security definer set search_path = public as $$
  with u as (update notifications n set status = 'suppressed' from opportunities o
    where n.opportunity_id = o.id and n.status = 'queued' and o.status in ('expired','withdrawn','cancelled','rejected') returning 1)
  select count(*)::int from u;
$$;

-- WF-09: exponential backoff 1,2,4,8,16 min; dead-letter after 5 attempts
create or replace function record_workflow_failure(p_workflow text, p_node text, p_error text, p_payload jsonb)
returns workflow_failures language plpgsql security definer set search_path = public as $$
declare r workflow_failures; begin
  select * into r from workflow_failures where workflow = p_workflow and coalesce(node,'') = coalesce(p_node,'') and payload = p_payload and state = 'retrying' limit 1;
  if found then
    update workflow_failures set attempts = attempts + 1, error = p_error,
      state = case when attempts + 1 >= 5 then 'dead_letter' else 'retrying' end,
      next_retry_at = now() + make_interval(mins => power(2, attempts)::int)
    where id = r.id returning * into r;
  else
    insert into workflow_failures(workflow, node, error, payload, attempts, next_retry_at)
    values (p_workflow, p_node, p_error, p_payload, 1, now() + interval '1 minute') returning * into r;
  end if;
  return r;
end $$;
revoke execute on function suppress_closed_notifications() from public, anon, authenticated;
revoke execute on function record_workflow_failure(text,text,text,jsonb) from public, anon, authenticated;

-- Webflow CMS mirror of approved public opportunities
alter table opportunities add column webflow_item_id text, add column webflow_synced_at timestamptz;
