# Newsletter harvester

This is a scheduled Claude task. Once a week it collects everything that
might belong in the next *Digital Lion* and leaves Brandon a ranked digest
as a Gmail draft. It never sends, posts or commits anything.

| File | What it is |
|---|---|
| `system-prompt.md` | The task's prompt. Paste everything below its line into the scheduled task |
| `reference-pack.md` | What matters. The issue ledger, the tiers, what to leave out, house style, the tools AISA uses, open threads, and what has shipped since the last issue |
| `past-issues/*.md` | The English text of every published issue, generated from the pages |
| `build-past-issues.py` | Regenerates `past-issues/` from `Media Hub/*.html` |

## Setting it up

**Recommended: a Claude Code routine with this repository attached.** With
the repo attached, the harvester reads the pack directly and reads the
commit log, which is where most *New on the Hub* items come from.

- **Prompt:** the body of `system-prompt.md`.
- **Repository:** `AISA-AI-web/The-Learning-Hub`. It needs read access
  only.
- **Connectors:** Gmail and Google Calendar. Add Google Drive only if you
  switch `OUTPUT` to `google_doc`.
  **Connect the AISA Google account (`bbaki@aisa.sch.ae`), not a personal
  one.** ADEK's mail and the domain's Workspace notices go to the school
  account. With a personal account connected, the harvester will run
  without errors and find almost nothing.
- **Schedule:** weekly. Thursday afternoon, Abu Dhabi time, leaves Friday
  to write an issue for Monday. Start a fresh session on each run; the
  prompt is self-contained.
- **Network:** the environment needs web access for the Workspace Updates
  blog, Gemini release notes and ADEK. Without it the run still works, and
  the digest reports *Web ✗* under Sources.

**Without the repo** (for example a scheduled task in the Claude app):
attach `reference-pack.md` and the five `past-issues/*.md` files to the
task. The harvester then has no commit log. It depends on Gmail, Calendar
and the web, plus whatever you have put in the pack's *Shipped since*
table.

## Keeping it current

**When an issue goes out:**

1. Run `python3 "Media Hub/newsletter-harvester/build-past-issues.py"`.
2. In `reference-pack.md`:
   - Add the issue to the ledger (§2).
   - Clear *Shipped since* (§8).
   - Update *Open threads* (§7): close what the issue resolved, and add
     anything it promised ("dates to follow", "I'll confirm…").
3. Move anything the issue used out of *Next Digital Lion Newsletter —
   items to include* in `CLAUDE.md`.

**Between issues:** if something has to go in the next issue, put it under
*Next Digital Lion Newsletter — items to include* in `CLAUDE.md`. The
harvester ranks that list above everything it finds itself.

## Privacy

The digest contains summaries of internal and ADEK email, so it lives in
Gmail and **never in this repo, which is public**. Nothing in this folder
is private either: the past issues are already published, and the pack is
written from them and from the repo.
