# The Digital Lion: reference pack for the newsletter harvester

This file tells the harvester what belongs in the next issue. Read it with
`past-issues/*.md`, which hold the full English text of every published
issue.

Everything below is **as of Tuesday 13 October 2026**. The harvester should
use live sources to check anything time-sensitive (sections 7 and 8 in
particular) and should not trust this file for those facts.

---

## 1. The newsletter

**The Digital Lion** is the Teaching & Learning newsletter of the American
International School in Abu Dhabi (AISA). It is written by **Brandon Baki,
Head of AI & Innovation** (`bbaki@aisa.sch.ae`). Each issue is a page on the
Learning Hub (`Media Hub/<mmmdd>.html`), and a short email points staff to it.
Each issue is published in English and Arabic.

Readers are AISA teaching staff from KG to Grade 12, and sometimes all staff.
Many read in Arabic. The work week is Monday to Friday, and all times are
Abu Dhabi time (UTC+4).

**Its job** is to tell staff four things: what changed, what they need to
do, by when, and whether it applies to them. Topics are AI, ed-tech, Google
Workspace, ADEK requirements and the Hub itself.

**It is not an AI news digest.** Every item has to pass one test: *so what,
for an AISA teacher, this week?*

---

## 2. Issue ledger

| No. | Date | Headline | For | Led with |
|---|---|---|---|---|
| 1 | Mon 4 May 2026 | What's New on the Learning Hub *(then called "Digital Tools")* | Teaching staff | Chalkie.ai trial |
| 2 | Mon 11 May 2026 | What's New on the Learning Hub | Teaching staff | Head of AI note: class visits + AI & Innovation survey |
| 3 | Mon 18 May 2026 | Class visits this week: here's the plan | Teaching staff | Class visits *(single theme)* |
| 4 | Wed 17 Jun 2026 | Year-end roundup: what's new on the Hub, in Workspace, and from ADEK | All staff | The Hub now signs you in |
| 5 | Fri 18 Sep 2026 | What's happening with AI at AISA | All teaching staff | AI Literacy rollout *(single theme, every item labelled "For:")* |

**Next issue: No. 6.** No issue has gone out since 18 September. The
harvester should check `Media Hub/media.html`, or the highest `Issue No.` in
`Media Hub/*.html`, in case one has gone out since this file was written.

### What each issue carried

- **No. 1:** Chalkie.ai trial · IB Exam Format Generator Gem (shout-outs to
  Will Lester for asking and Shawn Carder for the LaTeX idea) · Hub-wide
  search · smaller upgrades (Library Hub split, request buttons, real
  logos, Orientation Hub) · Coming soon (five items).
- **No. 2:** Head of AI note and AI & Innovation survey · Wired Wednesdays
  launch · Gemini in Gmail & Drive (with a "Slides is glitchy" warning) ·
  NotebookLM inside Gemini and Gems · Chalkie training module · Workspace
  Studio module · Scope & Sequence Auditor Gem · smaller upgrades ·
  Coming soon.
- **No. 3:** Almost entirely the class visits: why they are happening, the
  day-by-grade schedule, and the exact observation form shared openly.
  Also: the survey still open, the MAP Testing K–5 hub (credit to Quitney
  Price and Stephanie Brown) and Wired Wednesdays.
- **No. 4:** Hub sign-in, saved progress, dashboard and auto certificates
  · Gemini schedules meetings in Calendar · Drive mobile scanner ·
  Classroom learning outcomes · Chalkie trial ended, feedback form coming
  · ADEK's August and September dates · fillable performance review forms
  (coming) · Student Hall Pass Hub (September) · MagicSchool podcast
  creator, with an opinion that NotebookLM is better · Antigravity "for
  tinkerers".
- **No. 5:** a key-dates table · "Do you have to do the training?"
  (checked against the 62-teacher cohort) · thanks to the AI Specialists ·
  Monday face-to-face training · readiness module due 20 Sept · how often
  you'll teach it · AI Growth Test · Level 1 due 30 Sept for new staff ·
  Level 1 certificates · secondary personal goal form · keep student
  details out of AI tools.

---

## 3. What matters: the pattern across five issues

### Tier 1: an issue is built around these

1. **Something staff must do, with a date**, from ADEK or AISA. Examples:
   the curriculum start, the readiness module deadline, the Level 1
   deadline, the AI Growth Test window, mandatory training. When there are
   several, Issue 5 put them in a **key-dates table at the top**. Copy
   that.
2. **A change to how staff work in the Hub or their core tools.** Examples:
   the Hub now signs you in (No. 4), or a new *required* module.
3. **Something happening to staff that they would otherwise worry about.**
   The class visits got most of two issues of plain transparency: what the
   visits are, what they are not, and the exact form used.

### Tier 2: strong items

- **New on the Hub, and a teacher can open it today:** a PD module, a Gem,
  a tool card or a form. Each got four parts: what it is, what you get,
  where to find it, and a button.
- **Google Workspace, Gemini, NotebookLM or Classroom features that change
  a teacher's week**, and are actually live for AISA's Workspace for
  Education accounts. Always with a concrete how-to ("Drive app → ＋ →
  Scan") or example prompts.
- **Asks with a deadline that feed a real decision**, such as the AI &
  Innovation survey or the Chalkie renewal feedback.
- **Live sessions staff can attend.**

### Tier 3: smaller upgrades worth a mention

These are one-liners under *"Smaller upgrades worth a mention"*:

- Hub changes staff can see: search, filters, the bilingual toggle,
  logos, the archive.
- Updates to tools already on the Hub or on the Approved Tools Register.
- *Coming soon*, but only for work genuinely in progress.

### Tier 4: worth knowing

These are clearly labelled and go at the end:

- Advanced or frontier tools "for tinkerers" (Antigravity).
- Competitor features, with an honest opinion (MagicSchool's podcast
  creator compared with NotebookLM).

### Welcome in any issue

- **Credit to named colleagues** who asked for, built or presented
  something. Previous credits: Will Lester, Shawn Carder, Quitney Price,
  Stephanie Brown, the AI Specialists volunteers. Hub modules also credit
  Nastassia van Jaarsveldt and Joel Hunter. If an item started with a
  colleague's request, say who asked.
- **Honest caveats.** Examples: "Slides is glitchy", "Chalkie
  presentations cluster at DOK 1", "personal opinion: …". The newsletter
  earns trust by saying what doesn't work.

### Leave out

- **Internal plumbing.** Most of the Hub's commit log is this: `?v=N`
  cache pins, `gate.js` transport, Apps Script redeploys, admin-dashboard
  speed, tests, PDF builds for ADEK evidence folders, logo resharpening.
  Teachers never see any of it. If a plumbing change has a visible effect
  (for example, "pages load faster"), it gets one *smaller upgrades* line
  at most.
- **Admin-only features** such as the admin dashboard, charts and
  notification tooling. The exception is an item explicitly addressed to
  SLT.
- **Anything unreleased or in preview.** On `pd.html`, a card with
  `data-preview-for` or `data-admin-only` is not released. Announcing it
  sends the school to a "Coming soon" screen.
- **Dead ends.** Don't tell staff to go and use something they can't open
  yet. InstrucTwin was kept out of Issue 5 because staff accounts were not
  showing their assigned grades. *Coming soon* is fine if it is labelled.
- **AISA dates AISA hasn't announced.** AISA's own AI Growth Test dates
  were deliberately left out of Issue 5, because Brandon announces those
  himself. ADEK's published dates are fine if they are labelled as ADEK's.
- **General AI industry news with no classroom angle.** That includes
  model launches, benchmarks, funding rounds and vendor marketing.
- **Tools that aren't on the AISA Approved Tools Register, presented as a
  recommendation.** If one is worth knowing about, say plainly that it is
  not approved for school data. Note that being on the register is not
  the same as being approved for student data.
- **Student data, or anything that identifies a student. Never.**
- **Staff personal data.** That includes what individual teachers wrote
  in modules or forms, who is behind on training, and who ADEK has flagged.
  ADEK contacts affected teachers directly, and the newsletter never names
  them.
- **Anything from a document marked Confidential**, such as the
  Anti-Bullying Policy PDF.

---

## 4. House style

- **Say who it's for first.** Use `For: …` and be precise, for example
  "teachers of Grades 4–12", "secondary teaching staff" or "teachers new
  to AISA this year". Only say "everyone" if it really is everyone.
- **Plain and direct, in the second person.** Issue 5's standfirst is the
  model: *"Here's what's happening, what's coming, and what — if anything
  — you need to do."*
- **Write dates in full, with the weekday:** "Wednesday, September 30".
  Give times as Abu Dhabi time and always state the year.
- **Write one trailer line per item for the email.** Issue 5's `ITEMS` list
  in `sep18.html` is the model. It is blunter and shorter than the page:
  an action and a date, in 30 words or fewer.
- **Write for translation.** Every item will be translated into Arabic, so
  use short sentences and no idioms.
- **Name the role when the item is about a post** ("the AI Lead"). Two
  exceptions: Safeguarding Leads stay named, because you report a concern
  to a person, and credits always name people.
- **Write in Brandon's voice.** Issues speak in his first person ("email
  me", "I'll confirm"), as Issue 5 does. Getting the facts right still
  comes before sounding like him.

---

## 5. Where past items came from, and what each source tends to yield

Every Google source below means the **`bbaki@aisa.sch.ae`** account,
through the Gmail, Calendar and Drive connectors. Never use Brandon's
personal account.

| Source | Yields | Past examples |
|---|---|---|
| Learning Hub repo, commits on `main` (public on GitHub) | New on the Hub: modules, Gems, tools, forms, Hub upgrades | Search bar, sign-in, Workspace Studio module, goal form, Sustainability |
| `CLAUDE.md` → *Next Digital Lion Newsletter — items to include* | **Brandon's own backlog. Ranks highest:** he has already decided these matter | NotebookLM ⇄ Drive auto-sync |
| Google Workspace Updates blog | Gemini, Drive, Calendar, Classroom, Meet and Chat features | Gemini in Calendar, Drive scanner, Classroom outcomes |
| Gemini release notes · NotebookLM updates | Gemini app and NotebookLM features | NotebookLM in Gems, Gemini in Gmail & Drive |
| ADEK (email from `adek.gov.ae`, ADEK site, InstrucTwin, PASS) | Mandates, deadlines, training, testing windows | AI literacy curriculum, Level 1, AI Growth Test, readiness self-assessment |
| Vendors of tools AISA uses (section 6) | Feature changes and trials | MagicSchool podcast, Chalkie trial |
| Calendar | Sessions and deadlines | Face-to-face training, Wired Wednesdays |
| Colleagues' email | Requests, shout-outs, things they built | IB Exam Generator (Will Lester), MAP guide (Price & Brown) |
| Drive: *Shared with me* | ADEK documents and guidance, colleagues' initiative documents. **Nothing marked Confidential** | — (new source) |

**Two rules for Workspace features.** First, check who actually has the
feature. A feature only counts if it is live for AISA's **Workspace for
Education** accounts. Check the post's edition list, and whether it is a
Rapid Release or Scheduled Release rollout. Many Gemini features are
limited to certain editions or add-ons. If you can't tell, mark the item
*Needs confirming: available to AISA accounts?*

Second, don't report a feature as live while it is still a gradual
rollout.

---

## 6. What AISA staff actually use

Updates that touch these tools matter more than anything else on the web.

**Tools & Resources on the Hub:**

- **Gemini Gems built in-house:** IB Exam Format Generator, Scope &
  Sequence Auditor, EduSim.
- **AI assistants:** Magic School AI, NotebookLM, Gemini Storybooks,
  Chalkie.ai (trial ended June 2026, renewal not announced).
- **Interactive tools:** PBL Chatbot, PIRLSpal.
- **Assessment:** MAP Growth (NWEA) and the MAP Testing Hub, the AI Growth
  Test guide.
- **Curriculum:** Twinkl, the Lesson Planning Tool.
- **Forms:** My Personal Goal 2026–27 (secondary), Classroom AI
  Integration Snapshot, TA / Admin Support Staff / Hallway & Bus Monitor
  reviews.

**Core platforms:** Google Workspace for Education (Gemini, Gmail, Drive,
Docs, Slides, Calendar, Classroom, Meet, Workspace Studio), NotebookLM.
**ADEK platforms:** InstrucTwin at `adek.instructwin.com` (curriculum
materials), the AI Growth Test portal at `instructwin.com/aigt`, and PASS.

**Named in the AI Vision & Ethical Framework module:** ChatGPT, Gemini,
MagicSchool, Brisk, Canva, Diffit, Khanmigo. These appear as examples.
Don't assume any of them is approved for any particular use.

**PD modules on the Hub (`PD Modules/pd.html`):**

- **Required:**
  - AI Literacy Teacher Readiness, for the 62-teacher ADEK cohort only.
  - AI Vision & Ethical Framework.
  - Return to School.
  - Safeguarding.
  - Sustainability at AISA (required since 7 Oct 2026).
- **Optional:** Workspace Studio, NotebookLM, Chalkie, Success Criteria,
  AI & Assessment, Payroll & PRF, Visa & Emirates ID, Campus Safety,
  SharePoint Workflows.
- **Preview, not released:** Anti-Bullying Policy.

**Other Hub destinations:** the AI Literacy Hub, the KG–12 AI Literacy
Scope & Sequence, the AI Growth Test guide, your Dashboard and
certificates, the Library Hub, the Orientation Hub and Committees.

---

## 7. Open threads

These are promises and loose ends from past issues. When one resolves, it
becomes a candidate, often a strong one, because staff were told to
expect it. The harvester re-checks each one on every run.

| From | Thread | Status on 13 Oct 2026 (from the repo) | Becomes news when |
|---|---|---|---|
| No. 1 | IB Exam Format Generator training module | Not on `pd.html` | It ships |
| No. 1 | LaTeX-to-PDF module, co-designed with Shawn Carder | Not shipped | It ships (credit Shawn) |
| No. 1–2 | Training linked from every tool card | Only Chalkie's card so far | More cards get a training link |
| No. 1–2 | Request buttons re-pointed to purpose-built forms | Planned | Done |
| No. 2 | Gemini's Slides generation is glitchy: "we'll update the moment Google fixes it" | Unknown | Google ships a fix (check Workspace Updates) |
| No. 2 | "NotebookLM-powered Gems" recipe pack | Not shipped | It ships |
| No. 2–3 | Wired Wednesdays | Spring season ended 24 Jun. Home-page card replaced by the AI Literacy Hub on 20 Sep. Effectively paused, and never announced as such | Sessions resume |
| No. 4 | Chalkie.ai renewal, decided from the feedback form | Never announced | A decision is made |
| No. 4 | Fillable performance review forms | Live on Tools & Resources. The send-to-line-manager workflow waits on an Apps Script redeploy | The line-manager workflow goes live |
| No. 4 | Student Hall Pass Hub, rolled out division by division from September | Nothing in the repo | Rollout starts |
| No. 5 | AI Specialists team list: "you'll hear from me directly" | Unknown | The team is confirmed |
| No. 5 | InstrucTwin: grades not showing in staff accounts | Address confirmed as `adek.instructwin.com` (21 Sep). Lessons and grade assignments **not confirmed visible** | Grades are visible to staff. Only then does InstrucTwin go back in |
| No. 5 | AI Growth Test: AISA's dates and who proctors Grades 6–12 | ADEK's window closed Sun 4 Oct. AISA dates never appeared in an issue | ADEK extends the window, a second window opens, or results arrive |
| No. 5 | Level 1 certificates: ADEK resetting sections people rushed through | Unknown | ADEK issues certificates. **Never name the teachers affected** |
| No. 5 | Level 1 deadline of Wed 30 Sep for new staff | Passed | ADEK extends it or chases |
| Backlog | **NotebookLM ⇄ Google Drive auto-sync**: files in NotebookLM now sync from Drive, so no re-uploading after edits | Held back from No. 5 because it didn't fit the theme. Brandon wants it in | **Now.** A ready-made Tier 2 item for No. 6. Link Drive and the NotebookLM module |

---

## 8. Shipped on the Hub since Issue No. 5

All of these come from the repo's commits. They are candidates for
No. 6, with a verdict on each.

| Date | What | Verdict |
|---|---|---|
| Sun 20 Sep | **AI Literacy Hub:** one front door for everything AI Literacy, on the home page where the Wired Wednesdays card used to be | Tier 2. Possibly already known to the cohort from the session, but never in an issue |
| Mon 21 Sep | Readiness module gained a face-to-face segment and activities | Tier 3, for the cohort only |
| Mon 21 Sep | InstrucTwin address confirmed as `adek.instructwin.com` | **Hold.** Grades are still not confirmed visible (see the dead-end rule) |
| Tue 22 Sep | PDFs of the guide and training for ADEK evidence folders | Leave out (compliance artefact) |
| Wed 23 Sep | Hub data loading made faster | Plumbing. At most one *smaller upgrades* line |
| Sat 26 Sep | Logo sharpened | Leave out |
| **Wed 7 Oct** | **Sustainability at AISA released: required for all staff**, about 30 minutes, certificate 0.5 h. Requested and resourced by **Ms Nastassia van Jaarsveldt, Chair of the Sustainability Committee**, so credit her | **Tier 1.** Note the module page has its own launch-email button. Check sent mail for a Sustainability launch email. If it went out, the newsletter *reminds* and doesn't *announce* |
| Wed 7 Oct | Anti-Bullying Policy module, built from material supplied by Joel Hunter | **Hold. Preview only (three reviewers).** Not released, so do not announce it. When it is released, credit Joel Hunter |
| Mon 19 Oct | **PD Day material, October 2026:** a new Hub page (`PD Day/october-2026.html`) with the slides from three sessions: *Choose your own AI adventure* (Brandon, with the PD Arcade game and its seven station guides), and two workshops by **Amira El Turabi**, *Getting the Room to Think (Aloud!)* on oracy and *Small Changes, Big Reach* on proactive differentiation, so credit her. Also **Quitney Price**'s *Data to Action* (data literacy), with her slides and a formative assessment tracker teachers can copy to their own Drive; credit her too. Each has the meeting-log name. On the home page, in the menu and in search; more sessions are being added | Tier 2, as the follow-up to the PD days: "the material stays online". Brandon's deck also announced that MagicSchool is not being renewed (access ended Tue 20 Oct) |

---

## 9. Corrections

New material always waits for the next issue. But if a fact published in
the **latest** issue has since changed, and it is about something still
ahead, that is a correction rather than new material. Issue 5 was
corrected on its own page on 21 Sep, when the session audience widened.
The harvester flags these separately, so Brandon can fix the live page.

Once a date in the latest issue has passed, it is history and not a
correction. Ignore it unless the passing itself is news, for example an
extended deadline.
