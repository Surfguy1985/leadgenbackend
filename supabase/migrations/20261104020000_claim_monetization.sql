-- Claim monetization: real views, funnel events, founding seats, priority slots, reminders + suppression. All counters are DB-backed (no invented scarcity).
alter table organizations add column if not exists primary_trade text;
create index if not exists organizations_city_trade_idx on organizations (lower(city), primary_trade);

create table if not exists listing_views (
  id bigserial primary key, organization_id uuid not null references organizations(id) on delete cascade,
  day date not null default current_date, viewer_hash text not null, unique (organization_id, day, viewer_hash));
create table if not exists funnel_events (
  id bigserial primary key, event text not null check (event in ('view','claim_start','verified','trial','paid','canceled')),
  organization_id uuid references organizations(id) on delete set null, city text not null default '', trade text not null default '',
  meta jsonb not null default '{}', created_at timestamptz not null default now());
create index if not exists funnel_events_ev_idx on funnel_events (event, created_at);
create table if not exists founding_members (
  organization_id uuid primary key references organizations(id) on delete cascade, city text not null, trade text not null,
  percent_off int not null, created_at timestamptz not null default now());
create table if not exists priority_slots (
  organization_id uuid primary key references organizations(id) on delete cascade, city text not null, trade text not null,
  granted_at timestamptz not null default now());
create table if not exists claim_reminders (
  organization_id uuid not null references organizations(id) on delete cascade, email text not null, step int not null check (step between 1 and 2),
  status text not null default 'queued' check (status in ('queued','sent','skipped','failed')), sent_at timestamptz, created_at timestamptz not null default now(),
  primary key (organization_id, step));
create table if not exists email_suppressions (email text primary key, reason text not null default 'unsubscribe', created_at timestamptz not null default now());
alter table listing_views enable row level security; alter table funnel_events enable row level security; alter table founding_members enable row level security;
alter table priority_slots enable row level security; alter table claim_reminders enable row level security; alter table email_suppressions enable row level security;
-- (service-role only: no policies)

-- Atomic seat reservation: serialised per city+trade, refuses when the configured cap is reached.
create or replace function reserve_founding_seat(p_org uuid, p_city text, p_trade text) returns boolean language plpgsql security definer set search_path = public as $$
declare cap int := coalesce((select (value->>'slots')::int from app_settings where key='founding_offer'), 10);
        pct int := coalesce((select (value->>'percent_off')::int from app_settings where key='founding_offer'), 25);
begin
  perform pg_advisory_xact_lock(hashtext('founding:'||p_city||':'||p_trade));
  if exists (select 1 from founding_members where organization_id = p_org) then return true; end if;
  if (select count(*) from founding_members where city = p_city and trade = p_trade) >= cap then raise exception 'founding_full'; end if;
  insert into founding_members(organization_id, city, trade, percent_off) values (p_org, p_city, p_trade, pct); return true;
end $$;
create or replace function grant_priority_slot(p_org uuid, p_city text, p_trade text) returns boolean language plpgsql security definer set search_path = public as $$
declare cap int := coalesce((select (value->>'per_city_trade')::int from app_settings where key='priority_slots'), 5);
begin
  perform pg_advisory_xact_lock(hashtext('priority:'||p_city||':'||p_trade));
  if exists (select 1 from priority_slots where organization_id = p_org) then return true; end if;
  if (select count(*) from priority_slots where city = p_city and trade = p_trade) >= cap then return false; end if;
  insert into priority_slots(organization_id, city, trade) values (p_org, p_city, p_trade); return true;
end $$;
revoke all on function reserve_founding_seat(uuid,text,text) from public, anon, authenticated;
revoke all on function grant_priority_slot(uuid,text,text) from public, anon, authenticated;

insert into app_settings(key,value) values
 ('founding_offer','{"slots":10,"percent_off":25,"stripe_coupon":null}'),
 ('priority_slots','{"per_city_trade":5}'),
 ('claim_headlines','["Is your business already listed? Claim it free.","Customers are finding your business here. Make sure it''s right."]')
on conflict (key) do nothing;
-- Public business contact email (business address only, from public records or the business itself; never homeowner PII).
alter table organizations add column if not exists public_email text check (public_email is null or public_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
