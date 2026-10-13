# Newsletter harvester

This is a weekly scheduled Claude task that **writes the next *Digital
Lion*** for Brandon to review. It gathers everything since the last issue
from the Hub's commits, Gmail, Calendar, Drive and the web. It picks what
belongs, the way past issues have, and writes the issue as a finished HTML
page in the current house style.

The page arrives as an **attachment on a Gmail draft** to
`bbaki@aisa.sch.ae`, with editor's notes in the body: what's in it and
why, what to verify, and what was held back. The task never sends,
publishes or commits anything.

| File | What it is |
|---|---|
| `system-prompt.md` | The task's prompt. Paste everything below its line into the scheduled task |
| `reference-pack.md` | What matters. The issue ledger, the tiers, what to leave out, house style, the tools AISA uses, open threads, and what has shipped since the last issue |
| `past-issues/*.md` | The English text of every published issue, generated from the pages |
| `issue-template.html` | The page the harvester fills in. Built from Issue No. 5 (`sep18.html`), so a new issue looks the same |
| `check-issue.py` | Run on a draft before delivery. Fails on missing Arabic, leftover placeholders, dead links, links to unreleased modules, a stale `gate.js` pin, or a mail-out block that doesn't match the page |
| `build-past-issues.py` | Regenerates `past-issues/` from `Media Hub/*.html` |

## Setting it up

Use **a Claude Code routine at claude.ai/code** with these settings:

- **Prompt:** the body of `system-prompt.md`.
- **Repository:** `AISA-AI-web/The-Learning-Hub`, read access only. The
  routine needs the checkout for the template, the checker and the commit
  log, and it needs a shell to run the checker and base64-encode the
  attachment.
- **Connectors:** Gmail, Google Calendar and Google Drive, all signed in
  as `bbaki@aisa.sch.ae`. The prompt checks each one's account before
  using it and skips any that isn't the school account.
- **Schedule:** weekly. Thursday afternoon, Abu Dhabi time, leaves Friday
  to review and publish on Monday, which is the issue date the harvester
  uses by default. Start a fresh session on each run.
- **Network:** web access for the Workspace Updates blog, Gemini release
  notes and ADEK. Without it the run still works, and the notes report
  *Web ✗*.

**This folder must be on `main`,** because that is the branch the routine
checks out.

## Reviewing and publishing a draft

**To preview it,** download the attachment and open it in a browser. The
styling loads from the web. The logo and footer seal are relative paths,
so they only appear once the file is in `Media Hub/`. The language toggle
lives in the Hub's menu, so to see the Arabic, open the page from the Hub.

**To publish it,** follow the *To publish* line in the draft's notes:

1. Save the file as `Media Hub/<mon><day>.html`.
2. Remove the `CHECK` comments.
3. Update `media.html`, `index.html`, `menu.js` and `search-index.js`.
   The last two trigger the `?v=` cascade described in `CLAUDE.md`.
4. Send it with the page's own mail bar.

Handing the attachment to a Claude Code session with "publish this
issue" covers steps 1–3.

**Have the Arabic checked** before it goes out. It is the harvester's
draft, and ADEK's framework terms in Arabic are not official.

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
4. Push to `main`.

If a later issue changes the house style, rebuild `issue-template.html`
from it the same way: copy its `<head>`, hero, cards, sign-off, footer and
scripts, then replace the content with placeholders.

**Between issues:** if something has to go in the next issue, put it under
*Next Digital Lion Newsletter — items to include* in `CLAUDE.md`. The
harvester ranks that list above everything it finds itself.

## Privacy

The notes summarise internal and ADEK email, so they live in Gmail and
**never in this repo, which is public**. The draft page also stays out of
the repo until Brandon publishes it, because an unreviewed page would be
world-readable on GitHub the moment it was pushed.
