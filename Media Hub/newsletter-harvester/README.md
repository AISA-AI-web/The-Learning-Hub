# Newsletter harvester

This is a scheduled **Claude in Chrome** task. Once a week it collects
everything that might belong in the next *Digital Lion* and leaves Brandon
a ranked digest as a draft in his AISA Gmail. It never sends, posts or
changes anything else.

It reads Gmail, Chat, Calendar and Drive **through the browser, as
`bbaki@aisa.sch.ae`**, and never through connectors. The Google
connectors on Brandon's Claude account belong to his personal Gmail,
which this task must never read. The prompt forbids them by name and
makes the harvester confirm the signed-in account on every Google page
before it reads anything.

| File | What it is |
|---|---|
| `system-prompt.md` | The task's prompt. Paste everything below its line into the scheduled task |
| `reference-pack.md` | What matters. The issue ledger, the tiers, what to leave out, house style, the tools AISA uses, open threads, and what has shipped since the last issue |
| `past-issues/*.md` | The English text of every published issue, generated from the pages |
| `build-past-issues.py` | Regenerates `past-issues/` from `Media Hub/*.html` |

## Setting it up

1. **Install Claude in Chrome in the AISA Chrome profile.** Chrome
   extensions are installed per profile, so use the profile signed in as
   `bbaki@aisa.sch.ae`, not the personal one. If both Google accounts are
   signed in to the same profile, the harvester picks the school one with
   `?authuser=` and checks it on every page. Separate profiles are still
   the safer setup.
2. **Create a shortcut from the prompt and schedule it.**
   - Make a shortcut whose prompt is the body of `system-prompt.md`.
   - Schedule it with the clock icon at the top right of the extension
     panel.
   - Run it weekly. Thursday afternoon, Abu Dhabi time, leaves Friday to
     write an issue for Monday.
3. **Keep Chrome open at that time.** Scheduled browser tasks run only
   while Chrome is open and the computer is awake, which is another reason
   to choose a school-day afternoon.
4. **Merge this folder to `main`.** The harvester reads the reference
   pack, the past issues and the commit log from the public GitHub repo,
   so it needs no clone and no repo access. That only works once the pack
   is on `main`.
5. **Do one supervised run first.** Watch it the first time to check
   three things:
   - it confirms `bbaki@aisa.sch.ae` on each Google page
   - it puts opened emails back to unread
   - the draft lands in Drafts unsent.

**About connectors.** The Chrome side panel can run as a Cowork session,
where your Claude account's connectors may also be available. That is
why the prompt names them and rules them out. If you can switch the
Google connectors off for this task, do that as well; the prompt is the
backstop, not the only guard.

## What it reads, and what it doesn't

**It reads** the GitHub repo (public), Gmail, Chat, Calendar and Drive as
`bbaki@aisa.sch.ae`, and the web: Workspace Updates, Gemini release
notes, NotebookLM, ADEK, and the vendors of tools on the Hub.

**It never opens** the Hub's admin dashboard, the admin charts, the
spreadsheet behind the Hub, or appraisal and HR documents. It never
quotes Chat or email.

It leaves your accounts as it found them: emails and Chat conversations
it opens are marked unread again, and nothing is starred, archived,
moved or answered.

## Keeping it current

**When an issue goes out:**

1. Run `python3 "Media Hub/newsletter-harvester/build-past-issues.py"`.
   The harvester finds the new file by listing the folder on GitHub, so
   the prompt doesn't change.
2. In `reference-pack.md`:
   - Add the issue to the ledger (§2).
   - Clear *Shipped since* (§8).
   - Update *Open threads* (§7): close what the issue resolved, and add
     anything it promised ("dates to follow", "I'll confirm…").
3. Move anything the issue used out of *Next Digital Lion Newsletter —
   items to include* in `CLAUDE.md`.
4. Push to `main`. The harvester reads `main`, not your local copy.

**Between issues:** if something has to go in the next issue, put it under
*Next Digital Lion Newsletter — items to include* in `CLAUDE.md`. The
harvester ranks that list above everything it finds itself.

## Privacy

The digest summarises internal email, Chat and ADEK correspondence, so it
lives in the AISA Gmail and **never in this repo, which is public**.
Nothing in this folder is private either: the past issues are already
published, and the pack is written from them and from the repo.
