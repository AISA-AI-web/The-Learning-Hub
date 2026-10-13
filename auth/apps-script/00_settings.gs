/**
 * AISA Learning Hub — Apps Script backend.
 *
 * 00_settings.gs — the values you might need to change. Nothing in the
 * other files needs editing to run the Hub day to day.
 *
 * This project is the Hub's whole backend: it signs staff in, records what
 * they do, and reads and writes the spreadsheet it is bound to. It is split
 * into files by job. Apps Script loads every file into one shared scope, so
 * a function in one file can call a function in any other, and the order
 * the files sit in the editor does not matter.
 *
 *   00_settings.gs              this file
 *   01_sheets.gs                every tab: its name, its columns, how to open it
 *   02_router.gs                doPost and doGet: every action, and who may ask
 *   03_helpers.gs               timestamps and small shared utilities
 *   04_cache.gs                 the read cache in front of the spreadsheet
 *   10_sessions.gs              signing in: Google ID tokens, session tokens
 *   11_people.gs                admins, newsletter senders, roster tags, names
 *   20_tracking.gs              events, completions, page views, clicks, dwell
 *   21_admin_dashboard.gs       the admin dashboard's overview and bundle
 *   30_notifications.gs         the notification bell
 *   31_email.gs                 reminder emails and the newsletter mail-out
 *   40_module_responses.gs      teachers' typed answers inside modules
 *   41_surveys.gs               the goal form, and any survey after it
 *   42_performance_reviews.gs   line managers and the review round trip
 *   90_editor_tools.gs          things you run by hand from the editor
 *
 * How to deploy is in auth/apps-script/README.md in the repo. In short:
 * paste the files that changed, Run → checkHubInstall (90_editor_tools.gs),
 * then Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 * Never "New deployment": that mints a new URL and takes the Hub offline.
 */

/* Signing in. OAUTH_CLIENT_ID is the Hub's Google sign-in client (the same
 * id is in auth/gate.js); only verified Google accounts on ALLOWED_DOMAIN
 * get in, and a session then lasts SESSION_DURATION_DAYS. */
const OAUTH_CLIENT_ID        = '719019551782-h9pdg57s6oq4jpo884a53o0d1pgel1u6.apps.googleusercontent.com';
const ALLOWED_DOMAIN         = 'aisa.sch.ae';
const SESSION_DURATION_DAYS  = 365;

/* Every timestamp the Hub writes is Abu Dhabi time, "+04:00" — see
 * isoLocal() in 03_helpers.gs. */
const TIMEZONE               = 'Asia/Dubai';  // Abu Dhabi (GST, UTC+04:00, no DST)

/* Who may send a newsletter to the whole school. Deliberately NOT the
 * `admins` tab: every SLT admin can post notifications and read the
 * tracker, but a school-wide mail blast is a much bigger button and is
 * held to two named people. Edit this list to change who has it.
 * This is the only enforcement that matters — the Hub's sign-in gate is
 * client-side, so hiding the button in the page proves nothing. */
const NEWSLETTER_SENDERS = ['bbaki@aisa.sch.ae', 'hodai@aisa.sch.ae'];

/* Surveys can live in their own spreadsheet rather than the analytics
 * one. Leave empty to use the spreadsheet this script is bound to
 * (nothing to set up, the tab is created on first write). To split them
 * out: create a spreadsheet, paste its ID here, redeploy. The ID is the
 * long string in its URL between /d/ and /edit. Nothing else changes —
 * every survey function goes through _surveysSpreadsheet().
 *
 * Worth splitting out when the goal responses should be shareable with
 * secondary SLT without handing over the whole analytics workbook. */
const SURVEYS_SPREADSHEET_ID = '';

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_00_settings_() {}
