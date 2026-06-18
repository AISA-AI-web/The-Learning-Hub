# CLAUDE.md

Notes for future sessions on The Learning Hub.

## Apps Script — pending redeploy

`auth/apps-script.gs` has uncommitted-on-Google changes from recent
commits that need to be pasted into the Apps Script project and
redeployed (Deploy → Manage deployments → New version). The URL in
`gate.js` stays the same. Until the redeploy happens, the new endpoints
fail silently and the dependent UIs stay empty:

- **Abu Dhabi timezone:** `nowIsoLocal()` writes `+04:00` instead of
  UTC `Z` for all new rows. Existing rows untouched.
- **Per-section dwell tracking:** new `dwell` sheet + `record_dwell` and
  `admin_dwell` actions. The admin dashboard's Engagement section
  populates from `admin_dwell` once it's live.

## Next Digital Lion Newsletter — items to include

- **NotebookLM ⇄ Google Drive auto-sync.** Files uploaded to NotebookLM
  now auto-sync from Google Drive — no more re-uploading after edits.
  Worth a dedicated section (huge daily-use win for teachers building
  unit packs and study guides). Link to Drive and to the existing
  NotebookLM PD module.
