# Deprecated: n8n workflows

These exports are kept for reference only. All steps now run inside the app (see `app/src/lib/workflows.ts`):

- WF-01 direct intake: `runIntakeWorkflow`, run with `after()` from `/api/intake`
- WF-02 SAM.gov ingest: `runSamGov` in the daily cron
- WF-04 match/notify: `matchAndNotify`, run with `after()` on admin approval
- WF-06 freshness: `runFreshness` in the daily cron (per-notice SAM.gov recheck not ported)
- WF-09 ops/retries: `recordFailure` + `retrySweep` in the daily cron (operator email not ported)

`N8N_WF01_WEBHOOK_URL` is no longer used. `N8N_WEBHOOK_SHARED_SECRET` is still read as a legacy fallback for `APP_SHARED_SECRET`.
