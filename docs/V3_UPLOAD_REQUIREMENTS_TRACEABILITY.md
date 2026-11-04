# Crewforthat — upload-to-implementation traceability (Phase 1 v3)
Updated 2026-11-03. Source of truth: uploaded `Phase1_Complete_Readme.md` / `Phase1_Complete_Readme.txt` v3.0.
Older `AI_Property_Lead_Marketplace_README (1).md` and `archangel-frontend-handoff*.zip` are superseded when v3 differs. The `workline-complete-backend.zip` contains 44 source files, including five n8n exports; uploaded specifications are not themselves deployment evidence.

## Status vocabulary
- **DEPLOYED** — implementation merged to the production-connected branch and a deployment completed (not necessarily tested as signed-in user).
- **IMPLEMENTED / UNVERIFIED** — source or schema exists but functional acceptance test has not passed.
- **CONTROLLED / DISABLED** — intentionally held back to prevent false claims, unsafe processing or unauthorized charge.
- **MISSING / BLOCKED** — required Phase 1 work not yet implemented/connected.
Never equate 'table exists', 'code exists', or 'build READY' with a feature passing its complete end-to-end test.

| v3 requirement | Current implementation/evidence | Current gate |
|---|---|---|
| 3 discovery tabs: Jobs Now / Future Contracts / Find Buyers | Webflow pages + public Supabase opportunities read endpoint `/api/public/opportunities`; no fabricated future/buyer inventory | Jobs Now live (six approved official bids); other collections need legitimate source data |
| Public source attribution, status, deadline, last checked | CMS bindings; original notice link; card/detail templates; rights-gated `public_opportunities` view | Browser interactions verified on six real entries; recurring source checks still require monitoring |
| Mobile-first browsing | Rounded Webflow layouts, search/trade filters, sorting, empty states | Dedicated 375/390/430px, tablet, 200% zoom, keyboard, screen reader acceptance pending |
| Contractor sign-in and email verification | Supabase magic-link login, callback, cookie refresh, protected dashboard | Signed-out route protection verified; real test email login needs provider acceptance |
| Company creation | `/api/contractor/onboard` and 3-step `/onboarding` | Code/build implemented; real account onboarding not independently completed |
| Trade, ZIP and statewide matching | Contractor schema, DB fields, matching and statewide public-bid rules | Matching unit tests added; physical radius and regulated-trade qualifications require further QA |
| Business claims with independent verification | `/api/contractor/claims` and `/claim-business`: records pending evidence/manual moderation, never self-transfers | IMPLEMENTED; independent admin claim review and rollback not end-to-end tested |
| Saved opportunity shortlist | `/api/contractor/saved`, `/app`, `/app/saved`; RLS scoped to contractor | IMPLEMENTED; Free cap=5; authenticated workflow acceptance pending |
| Saved trade/ZIP searches | `saved_searches` migration + `/api/contractor/searches`, `/app/searches` and `/app` filter saving | IMPLEMENTED; authenticated workflow acceptance pending |
| Contractor alert frequency/marketing consent | `alerts_preferences`, `/api/contractor/preferences`, `/app/settings` | IMPLEMENTED; actual email dispatch blocked |
| Personal work feed & dashboard | `/app`, `/dashboard`; RLS-scoped matches, public listings and truthful empty states | IMPLEMENTED; zero pilot contractor orgs currently |
| First-party homeowner/manager job posting | `/post-job` form, `/api/intake`, Turnstile, consent, staging lifecycle | CONTROLLED / DISABLED until email delivery + acceptance; field mapping and negative tests required |
| Explicit limited-contact and separate public-listing consent | Intake form and consent schema, restricted `lead_contacts` | Implementation present; real consent and withdrawal roundtrip untested |
| Grok optional conversational intake | `/api/ai/chat`, `/api/ai/classify`, safe schema, backend key | Requires provider credential/budget, prompt-injection tests and homeowner UX acceptance |
| Secure manage/edit/close/withdraw link | `/api/manage`, `manage_tokens`, archive policy | IMPLEMENTED / UNVERIFIED; email delivery remains blocked |
| Owner/admin moderation | `/admin`, `moderation_queue`, admin roles, audit trail | IMPLEMENTED; complex multi-admin permission and two-person approvals not fully tested |
| Owner snapshot | `/admin/overview` with actual counts, role restrictions, no imaginary MRR | IMPLEMENTED; Stripe reconciliation and charting outstanding |
| Buyer/organization graph and vendor links | `organizations`, `properties`, `organization_relationships`, directory CMS | Database structure exists; significant authorized property/buyer population and claim verification MISSING |
| Ingestion source rights registry | `sources`, `source_rights`, `fetcher.ts`, ingest routes, rights-gated view | IMPLEMENTED; authorization records, source inventory and runtime reliability need proof |
| SAM.gov official procurement import | `connectors/samgov.ts`, source ingestion/workflow exports | Initial six public bids shown; scheduled full coverage, stale/closed handling and attribution tests required |
| Community / social intelligence | v3 requires authorized opt-in feeds only | NO unauthorized Facebook/Nextdoor scraping. Partner-approved referrals require source contracts |
| Auto dedupe and freshness lifecycle | database hashes, event states, scheduled rules and archive policy | IMPLEMENTED / UNVERIFIED; 48h/7d/14d configurable timers need timed scenario tests |
| Contractor matching + email notifications | `lib/matching.ts`, `lib/workflows.ts`, private pilot allowlist | No complete verified lead->matched contractor->delivered alert yet |
| Weekly digests / unsubscribe | `alerts_preferences`, scheduled worker code | Delivery not confirmed. Must respect off/weekly/daily and dedupe |
| Billing plans | v3 Free + Starter $39.99, Pro Match $79.99, Growth $149.99, Elite $299.99; 3-day trials modeled in `plans` | Paid plans set `visible=false,purchasable=false`; safe until Stripe tests, benefits and trial transparency pass |
| Stripe checkout, portal and signed webhooks | `/api/stripe/*`, ledger tables, audit | Code present; test clocks, trial/cancel/refund, reconciliation not accepted |
| Source corrections and report-listing | `/api/public/report-listing`, `/report-listing` -> moderation | IMPLEMENTED / UNVERIFIED authenticated and abuse-flow acceptance |
| Support and disputes | `moderation_queue` supports support/billing/abuse cases, admin queue | Dedicated external customer support intake, response SLA and dispute outcomes MISSING |
| Privacy account requests | `/api/contractor/privacy`, `/app/privacy`, hashed email and manual moderation queue | IMPLEMENTED / UNVERIFIED; legal review, authenticated tests and execution operations missing |
| Contractor consent for public directory / data use | organization opt-in fields modeled | UI, claim verification/rollback and actual opt-in publication workflow incomplete |
| English/Spanish | language preference stored in `alerts_preferences` | Actual translated strings not shipped. UI labels explicit: preference only |
| Accessibility | semantic labels, live regions, reduced-motion provisions in major pages | WCAG 2.2 audit, screen reader tests and remediation pending |
| Source/data rights adversarial tests | `scripts/sql-v2-test.mts`, `scripts/live-rls-check.mjs`, `app/tests` | Need current CI test run evidence, cross-tenant and external penetration checks |
| Monitoring, retries, dead letters, alert owners | `workflow_failures`, `connector_health`, audit records, admin overview | Monitoring alert transport, Sentry, incidents and emergency runbook acceptance pending |
| Backups / DR | Supabase hosted database | Restore exercise, RPO/RTO and verified rollback evidence MISSING |
| Custom domain and brand | Crewforthat Webflow staging hostname; Vercel backend domain | Branded domain, DNS, SPF/DKIM/DMARC, verified Resend sender not done |
| Phase 2 swipe, chat, bid negotiation, reviews and escrow | Intentionally deferred by v3 source | DO NOT build or advertise in Phase 1 |

## Blocking live prerequisites
1. **RESEND email delivery:** verify sending domain, supply server-side `RESEND_API_KEY` and `ALERT_FROM_EMAIL`, test delivery and link expiry.
2. **Real contractor pilot:** register an authorized test contractor; verify RLS, service ZIP, trade, profile, saved items, notifications and contact consent.
3. **Real customer intake:** `/api/intake/status` must return false until delivery configured AND an administrator explicitly enables `INTAKE_LIVE_ENABLED=true` after controlled tests.
4. **Consent and lifecycle:** submit -> verify -> moderate -> match -> alert -> access authorization -> close/withdraw -> no more notifications; confirm no public PII.
5. **Source operations:** approved source rights, refresh rates, duplicate/expiry handling, real buyer and future listings.
6. **Billing:** configure four prices in Stripe test mode, validate full webhook and lifecycle, self-service cancellation and reconciliation, then enable paid plans individually.
7. **Owner operations and legal:** privacy and safety processing, billing exceptions, admin role separation, incident response, finalized legal docs.
8. **Mobile/security/release:** all breakpoints, keyboard and assistive tech, rate limits, hostile source text, SSRF, backups/restore and independent signoff.

## Upload precedence and phase guard
The v3 handoff explicitly supersedes v1/v2 documents and defines Phase 2 as documentation only. Inconsistencies with the earlier 3-tier pilot ($99/$199) pricing are resolved in favor of v3 ($39.99/$79.99/$149.99/$299.99), but **none** of those paid plans are currently for sale. Neither source grants third-party redistribution rights or permits private contact exports.
