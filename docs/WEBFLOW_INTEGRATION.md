# Webflow integration guide

Webflow hosts the **public pages**: Home, `/opportunities`, `/opportunities/[slug]`, `/post-job`, `/contractors/join`, `/privacy`, `/terms`, `/contact`, `/delete-data`.
The Next.js companion app (`NEXT_PUBLIC_APP_URL`) hosts `/dashboard`, `/admin`, `/login`, and all `/api/*` routes. Link to it as `app.your-domain`.

### Live setup (2026-11-03)
- Site: `lead gen site` (`6aea50af3438b5c365ffeb89`), staging https://lead-gen-site-dc4966.webflow.io (no custom domain yet).
- Opportunities collection ID: `6aea5647a8c00f5fff3b39f0` (set as `WEBFLOW_OPPORTUNITIES_COLLECTION_ID` in Vercel). All 12 field slugs verified against `/api/webflow/sync`.
- `/post-job` page (`6aea5281c00e2a00244db8a5`): HtmlEmbed with `webflow/post-job-embed.html` inserted above the original native Webflow form inside `.pj-formcard`. The native form was left untouched; hide it in the Designer once the embed is confirmed, so submissions don't land in Webflow's form inbox.
- **Still needed:** `WEBFLOW_API_TOKEN` (site token with CMS read+write) in Vercel. Until then `/api/webflow/sync` returns 503 `not_configured`.

## 1. CMS collection: "Opportunities" (read-only mirror)
Create a collection with these fields. Slugs must match exactly, because `/api/webflow/sync` writes them.

| Field name | Slug | Type |
|---|---|---|
| Name | `name` | Plain text (built-in) |
| Slug | `slug` | Slug (built-in) |
| Opportunity ID | `opportunity-id` | Plain text |
| Summary | `summary` | Plain text (multi-line) |
| Kind label | `kind-label` | Plain text ("Public bid (not exclusive)" / "Discovery signal (unverified)") |
| Trade | `trade` | Plain text (filterable) |
| City | `city` | Plain text |
| ZIP | `zip` | Plain text |
| Deadline | `deadline` | Date/Time (may be empty, never fabricated) |
| Source URL | `source-url` | Link |
| Published date | `published-date` | Date/Time |
| Last verified | `last-verified` | Date/Time |

Only **approved public bids and discovery signals** are synced. Private leads, contact details, and test data are never sent to Webflow. Expired, cancelled, or withdrawn items are unpublished automatically.
Create a Webflow API token (Site settings → Apps & integrations → API access) with `CMS:write`. Put it in `WEBFLOW_API_TOKEN` and the collection ID in `WEBFLOW_OPPORTUNITIES_COLLECTION_ID`.
Schedule the sync from n8n: a Schedule node every 15 min that runs an HTTP POST to `{APP_URL}/api/webflow/sync` with header `x-shared-secret`.

**`/opportunities` page:** a Collection List bound to Opportunities, with filters by trade, city, and kind (Webflow native filtering or Finsweet CMS Filter). Show the kind label prominently.
**Template page:** show summary, kind label, deadline (hide if empty), last verified, and a button "View original notice", linked to `source-url`. For public bids, add the text "Public bid. Apply directly with the issuing agency."

## 2. "Post a Job" form → `/api/intake`
Use a Webflow **Embed** element (not a native Webflow Form), so submissions go straight to the backend with Turnstile and never get stored in Webflow's form inbox. The native form inbox would keep contact PII in Webflow.

Required field `name`s (must match exactly): `name`, `email`, `phone` (optional), `zip` (5 digits), `city`, `address` (optional), `description`, `timeline`, `property_type`, `consent_share`, `consent_privacy`, plus the hidden `submission_id`, `website` (honeypot, keep empty), and Turnstile's `cf-turnstile-response`.

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<form id="post-job">
  <input name="name" required placeholder="Your name">
  <input name="email" type="email" required placeholder="Email">
  <input name="phone" type="tel" placeholder="Phone (optional)">
  <input name="zip" required pattern="\d{5}" placeholder="ZIP">
  <input name="city" placeholder="City">
  <select name="property_type"><option>residential</option><option>multifamily</option><option>commercial</option></select>
  <textarea name="description" required minlength="10" placeholder="What do you need done?"></textarea>
  <input name="timeline" placeholder="When? (e.g. next 2 weeks)">
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <label><input type="checkbox" name="consent_share" value="true" required>
    I agree to share this request and my contact details with up to 5 eligible, matched contractors through Crewforthat so they can contact me about this job. I can withdraw at any time. No contractor or outcome is guaranteed.</label>
  <label><input type="checkbox" name="consent_privacy" value="true" required> I have read the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>.</label>
  <div class="cf-turnstile" data-sitekey="0x4AAAAAAFykd3724PLNQGyS"></div>
  <button type="submit">Submit request</button>
  <p id="post-job-msg" role="status"></p>
</form>
<script>
(function(){
  var f=document.getElementById('post-job'), m=document.getElementById('post-job-msg');
  f.addEventListener('submit', async function(e){
    e.preventDefault(); m.textContent='Sending…';
    var data=Object.fromEntries(new FormData(f));
    data.submission_id = data.submission_id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random());
    data.consent_share = f.consent_share.checked ? 'true' : 'false';
    data.consent_privacy = f.consent_privacy.checked ? 'true' : 'false';
    try {
      var r = await fetch('https://archangel-leadgen.vercel.app/api/intake', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
      var j = await r.json();
      m.textContent = r.ok ? (j.next || 'Thanks! Check your email.') : (j.issues ? j.issues.map(function(i){return i.message}).join(' ') : 'Something went wrong. Please try again.');
      if (r.ok) f.reset(); else if (window.turnstile) turnstile.reset();
    } catch(err){ m.textContent='Network error. Please try again.'; }
  });
})();
</script>
```
Create the confirmation page `/post-job/confirmed` in Webflow. The email verification link redirects there.
Optional photos: let the user upload them later from the app (private `job-photos` bucket, signed URLs). Don't use a Webflow file-upload field, because it stores files publicly on Webflow's CDN.

## 3. "Join as Contractor" (`/contractors/join`)
Keep the Webflow page as marketing, with a button to `{APP_URL}/login?next=/dashboard`. Signup, email verification, company profile, trades, ZIPs, license/insurance, and Stripe Checkout happen in the app, because they need auth.

## 4. Chat intake (optional)
`/api/ai/chat` requires a signed-in user, so embed it in the app, not Webflow. On Webflow, link "Prefer to chat?" to `{APP_URL}/post-job/chat` (to be built in the app) and keep the form above as the fallback.

## 5. Legal pages
`/privacy`, `/terms`, `/contact`, `/delete-data`. Add the delete-data form as an embed posting to a future `/api/delete-request` endpoint, or link to `mailto:`. Get a legal review before launch.

## Homeowner flow v2 (Crewforthat)
- Canonical embed source: `webflow/post-job-embed.html` (adds urgency, submitter type, and a **separate optional** public-listing consent; contact-share consent stays required, max 5 contractors).
- Direct requests are matched only in DFW ZIPs; out-of-market requests are saved, queued for review (`out_of_market`), and not sent to n8n matching.
- Each request gets a hashed, 60-day manage token; the email (n8n WF-01, `manage_url`) links to `/manage` for status / still-needed / unlist / close / withdraw.

## Tabs + Directory (Milestone 4)
- CMS (created via Webflow MCP, not published): Opportunities gained `tab`, `listing-type`, `geographic-scope`, `official-apply-url`, `last-checked`; new **Directory** collection `6aea63e1a1dadedc37604c9a` (organization-id, kind, city, zip, public-website, vendor-onboarding-url, claim-status, last-checked). Env: `WEBFLOW_DIRECTORY_COLLECTION_ID`.
- Sync (`POST /api/webflow/sync`): opportunity liveness = presence in the anon `public_opportunities` view (rights, hide_after, archive enforced by RLS); also unpublishes items whose hide_after passed. Directory: listed + (opt-in if self-created, or source rights allow publish). Only whitelisted, non-personal fields leave the DB.
- Two ways to render tabs in Webflow: (a) Collection Lists filtered on `tab` = jobs_now / upcoming / buyers (native, SEO-friendly), or (b) drop `webflow/jobs-tabs-embed.html` into an Embed (reads `GET /api/public/opportunities?tab=`). Neither has been placed on a page yet — page layout/copy is a Webflow design decision.
