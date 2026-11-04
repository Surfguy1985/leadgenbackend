# Crewforthat | Marketplace acceptance gate
Updated: 2026-11-03 (America/Chicago)

## Release definition
A published Webflow page is not a production-ready marketplace. Crewforthat must complete a verified request-to-contractor handoff and provide honest, usable job discovery on mobile and desktop before a broad launch.

## Verified in the latest Webflow live acceptance pass
- 11 public site routes resolve on the staging Webflow subdomain.
- Six approved public job listings display real title, location, agency and official application links.
- The Jobs Now search filters from six to one when querying `cleaning`; clearing the query returns six.
- Sort by nearest deadline orders real listings chronologically.
- Listing details display real CMS information and a source-first application guide.
- The project intake fields have explicit labels and consent controls.
- Project intake is visibly paused when `/api/intake/status` says `acceptingRequests: false`.
- The Privacy page topic links navigate to the correct sections.
- Desktop visual QA found no apparent clipping on inspected pages. Dedicated 375px/390px and tablet responsive visual QA are still required.

## Hard launch blockers (must be resolved, not cosmetically hidden)
1. Configure a verified Resend sender domain, `RESEND_API_KEY`, and `ALERT_FROM_EMAIL` in Vercel. Test delivery, expiration, verification and withdrawal with controlled test accounts.
2. Test Turnstile + consent + secure submission + pending moderation + approval + 1 authorized contractor match and notification, then set `INTAKE_LIVE_ENABLED=true` for the production environment and redeploy. Keep disabled until these tests pass.
3. Independently verify Supabase Auth magic-link login, cookie refresh, onboarding completeness and RLS-protected contractor dashboard on a non-admin account.
4. Establish a working support channel, identity-verified deletion request process, and legally reviewed Terms/Privacy disclosures.
5. Verify pricing/checkout/cancellation/refund flows before publishing any paid plan claims.
6. Verify the browser experience at mobile (375, 390, 430), tablet (768), desktop (1280, 1440+), plus keyboard navigation, zoom 200%, screen reader semantics and reduced motion.
7. Configure a branded custom domain and remove Webflow platform branding through supported plan settings.
8. Expand real approved buyer/future-contract inventory; keep honest empty states until vetted records exist.

## Benchmark references (research only, not reproduced designs)
- Upwork job-search UI: https://mobbin.com/screens/fda48581-faa4-4f6e-b3e2-772455250c44
- Upwork detail page: https://mobbin.com/screens/d16083fd-90a5-4544-9faf-c9c5b80f52d0
- Upwork freelancer onboarding: https://mobbin.com/flows/ad2e3f6f-bc25-4d24-8e37-4648b1be36a0
- Airtasker listing creation flow: https://mobbin.com/flows/3e4ef6ee-21d2-46ba-aae9-b32270d29b9a

## Acceptance test contract
- Job discovery: search, clear, filters, sort, and external apply links work with real data and correct empty states.
- Project owner: submit -> captcha -> private persistence -> verification email -> verified token -> moderation -> approved -> eligible match -> notification -> withdraw/delete. Repeat submission is idempotent; no public PII.
- Contractor: login -> onboarding -> profile saved -> match authorization -> opportunity -> approved contact access. Anonymous users cannot retrieve private contacts.
- Errors and operations: rate limits, expired links, missing integrations, mail failures and retries produce truthful user states; no silent fake success.
- Every public page: no orphan navigation, broken links, clipping, placeholder strings or unsupported promises; legal notices are finalized before open launch.

## Current status
**NOT CLEARED FOR BROAD PRODUCTION LAUNCH.** The site is a polished public exploration experience. Direct project intake is deliberately gated until email verification and matching are proven with real controlled tests.
