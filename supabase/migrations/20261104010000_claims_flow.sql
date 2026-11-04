-- Claim-your-business flow (idempotent; paste in Supabase SQL Editor).
alter table profile_claims add column if not exists proof_path text;
alter table profile_claims add column if not exists decision_reason text;
-- one open claim per user per org already exists (profile_claims_one_open); disputes need their own guard
create unique index if not exists profile_claims_one_dispute on profile_claims (organization_id, claimant_user_id) where status = 'disputed';
create index if not exists profile_claims_status_idx on profile_claims (status, created_at desc);
-- Private bucket for claim proof uploads (service role only; admins view via 10-minute signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-proofs', 'claim-proofs', false, 5000000, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
