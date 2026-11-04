# CrewForThat Data Source Registry Spec (from Bryce, 2026-11-03)
Goal: buyer and contractor intelligence that continuously sources contractors to claim (and pay for) their profiles, plus demand data.
Lifecycle per record: discover, check permissions, extract (Grok), dedupe, classify (active job / future procurement / business prospect / contractor profile / unverified signal), geolocate, publish and match, refresh, archive, track quality.
Source config fields: source_name, source_url, source_type, access_method, authentication, allowed_collection, allowed_storage, allowed_public_display, allowed_redistribution (default false), personal_data_restrictions, refresh_schedule, last_successful_sync, error_status, data_owner, rights_review_date.
P0: SAM.gov API (done); USAspending API (awards, buyers, contractors); Texas ESBD procurement; Texas HOA mgmt-certificate DB (hoa.texas.gov); DFW permits (Fort Worth ArcGIS issued permits, DallasNow/Accela) and DCAD bulk; TDLR licenses and Texas franchise-tax status API; direct homeowner submissions; claimed contractor profiles.
P1: HUD multifamily datasets, DFW Airport / ISDs / cities (Dallas Bonfire, Fort Worth), Texas Comptroller open data (hotel tax permits, sales-tax permit holders), mgmt-company sites (permission only).
P2: commercial bid platforms (license), social (partnership/submissions only, NO scraping, Groups API gone), nationwide permits.
Rules: permit signals are never labeled as hiring; prospects are labeled as prospects; relationships are shown as facts only when records back them; homeowner PII is never in resale; Google Places can't be stored long-term.
Admin "Data Operations": Source Coverage, Freshness, Rights, Contractor Network (discovered vs claimed), Buyer Intelligence, Revenue; add source / request sync / pause / change frequency / review records without code.
Census CBP/ZBP is for aggregate market sizing only.
