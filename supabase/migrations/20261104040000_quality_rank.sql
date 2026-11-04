-- Rank by quality: append quality_score to the shared public view (column added at the END so existing readers are unaffected).
create or replace view public_opportunities with (security_invoker = true) as
  select id, kind, title, summary, trade, subtrades, property_type, city, state, zip,
         budget_min, budget_max, deadline, source_url, published_at, last_verified_at, expires_at, status,
         listing_type, opportunity_tab(listing_type, kind) as tab, geographic_scope, official_apply_url, last_checked_at,
         quality_score
  from opportunities;
grant select on public_opportunities to anon, authenticated;
