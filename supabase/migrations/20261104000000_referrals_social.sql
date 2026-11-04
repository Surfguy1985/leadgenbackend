-- Referrals + social auto-post. Idempotent: safe to paste into the Supabase SQL Editor more than once.
create table if not exists referral_codes (
  organization_id uuid primary key references organizations(id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_org_id uuid not null references organizations(id) on delete cascade,
  referred_org_id uuid not null unique references organizations(id) on delete cascade, -- an org can be referred once
  code text not null,
  status text not null default 'signed_up' check (status in ('signed_up','converted','void')),
  converted_at timestamptz,
  reward_status text not null default 'none' check (reward_status in ('none','pending_review','approved','applied','rejected')),
  reward_note text,
  created_at timestamptz not null default now(),
  check (referrer_org_id <> referred_org_id)
);
create index if not exists referrals_referrer_idx on referrals(referrer_org_id);
alter table referral_codes enable row level security;
alter table referrals enable row level security;
drop policy if exists referral_codes_owner_read on referral_codes;
create policy referral_codes_owner_read on referral_codes for select
  using (exists (select 1 from organizations o where o.id = organization_id and o.owner_user_id = auth.uid()));
drop policy if exists referrals_referrer_read on referrals;
create policy referrals_referrer_read on referrals for select
  using (exists (select 1 from organizations o where o.id = referrer_org_id and o.owner_user_id = auth.uid()));
-- writes happen only through the service role (no insert/update policies)

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  channel text not null,             -- 'facebook_page'
  post_date date not null,           -- one digest per channel per day
  external_post_id text,
  opportunity_ids uuid[] not null default '{}',
  status text not null default 'posted' check (status in ('posted','failed')),
  created_at timestamptz not null default now(),
  unique (channel, post_date)
);
alter table social_posts enable row level security; -- service role only
