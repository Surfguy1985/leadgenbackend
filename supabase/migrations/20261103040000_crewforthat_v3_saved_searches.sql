-- Crewforthat v3: saved search filters. Added via applied production migration.
-- User owned / deny anonymous / no private lead contact data.
CREATE TABLE IF NOT EXISTS public.saved_searches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contractor_id uuid NOT NULL REFERENCES public.contractor_profiles(id) ON DELETE CASCADE,
 label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
 query text NOT NULL DEFAULT '' CHECK (char_length(query) <= 160),
 trade text,
 zip text CHECK (zip IS NULL OR zip ~ '^[0-9]{5}$'),
 tab text NOT NULL DEFAULT 'jobs_now' CHECK (tab IN ('jobs_now','upcoming','buyers')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_searches_owner_idx ON public.saved_searches(contractor_id,created_at DESC);
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saved_searches FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_searches TO authenticated;
DROP POLICY IF EXISTS saved_searches_own ON public.saved_searches;
CREATE POLICY saved_searches_own ON public.saved_searches FOR ALL TO authenticated
USING (contractor_id IN (SELECT public.my_contractor_ids()))
WITH CHECK (contractor_id IN (SELECT public.my_contractor_ids()));
