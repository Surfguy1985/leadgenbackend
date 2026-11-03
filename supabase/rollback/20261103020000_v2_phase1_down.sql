-- Reverses 20261103020000_v2_phase1.sql. Drops ONLY objects v2 added. Pre-existing tables/columns/data are untouched.
-- Note: organizations.owner_user_id NOT NULL is restored only if no unclaimed directory orgs exist (else left nullable).
begin;
drop function if exists archive_sweep();
drop view if exists public_opportunities;
drop policy if exists opps_public on opportunities;
create policy opps_public on opportunities for select to anon, authenticated using (
  visibility = 'public' and status in ('published','matched','notified','responded')
  and kind in ('public_bid','discovery_signal') and verification_status <> 'rejected' and not is_test_data);
create view public_opportunities with (security_invoker = true) as
  select id, kind, title, summary, trade, subtrades, property_type, city, state, zip,
         budget_min, budget_max, deadline, source_url, published_at, last_verified_at, expires_at, status
  from opportunities;
grant select on public_opportunities to anon, authenticated;
drop policy if exists orgs_directory_public on organizations;
drop trigger if exists lead_access_cap on lead_access;
drop trigger if exists opportunities_status_change on opportunities;
drop function if exists reveal_contact(uuid, text);
drop function if exists enforce_lead_cap();
drop function if exists can_reveal_contacts(uuid);
drop function if exists current_plan(uuid);
drop function if exists on_opportunity_status();
drop table if exists ai_usage, privacy_requests, admin_actions, admin_roles, billing_adjustments, billing_ledger,
  alerts_preferences, saved_items, contact_disclosures, manage_tokens, job_submissions, profile_claims,
  organization_relationships, properties, opportunity_facts, opportunity_events, connector_health cascade;
alter table moderation_queue drop column if exists priority, drop column if exists case_type;
alter table subscriptions drop column if exists plan_code, drop column if exists trial_end, drop column if exists cancel_at_period_end, drop column if exists last_event_created;
alter table stripe_events drop column if exists created, drop column if exists subscription_id, drop column if exists payload_hash;
alter table contractor_profiles drop column if exists min_job_value, drop column if exists availability_confirmed_at, drop column if exists goal, drop column if exists statewide, drop column if exists public_display;
alter table opportunities drop constraint if exists opportunities_org_fk;
alter table opportunities drop column if exists listing_type, drop column if exists rights_id, drop column if exists geographic_scope,
  drop column if exists urgency, drop column if exists organization_ref, drop column if exists official_apply_url, drop column if exists last_checked_at,
  drop column if exists reliability, drop column if exists is_inferred, drop column if exists reconfirm_due_at, drop column if exists hide_after,
  drop column if exists closed_at, drop column if exists close_reason, drop column if exists archived_at, drop column if exists revision;
drop function if exists opportunity_tab(text, opportunity_kind);
alter table organizations drop column if exists kind, drop column if exists slug, drop column if exists public_website, drop column if exists public_business_phone,
  drop column if exists city, drop column if exists zip, drop column if exists vendor_onboarding_url, drop column if exists claim_status,
  drop column if exists is_directory_listed, drop column if exists source_id, drop column if exists rights_id, drop column if exists last_checked_at,
  drop column if exists public_profile_optin, drop column if exists data_use_optin, drop column if exists webflow_item_id, drop column if exists webflow_synced_at;
do $$ begin if not exists (select 1 from organizations where owner_user_id is null) then alter table organizations alter column owner_user_id set not null; end if; end $$;
alter table raw_ingestions drop column if exists revision, drop column if exists ingestion_run_id;
drop table if exists ingestion_runs cascade;
alter table sources drop constraint if exists sources_current_rights_fk;
drop table if exists source_rights cascade;
drop function if exists source_can(uuid, text);
alter table sources drop column if exists base_domain, drop column if exists source_type, drop column if exists robots_or_access_notes, drop column if exists terms_url,
  drop column if exists owner, drop column if exists refresh_interval, drop column if exists api_quota, drop column if exists cost_limit_usd,
  drop column if exists allowed_hostnames, drop column if exists enabled, drop column if exists emergency_paused, drop column if exists current_rights_id;
drop table if exists app_settings, plans cascade;
drop function if exists has_admin_role(text[]);
drop function if exists deny_mutation_generic();
insert into audit_logs(actor, action, object_type, metadata) values ('migration','schema_v2_rolled_back','schema','{"version":"20261103020000"}');
commit;
