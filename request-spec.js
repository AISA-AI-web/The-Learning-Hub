/*
 * The "Request or report" form's questions — one list, read by the form
 * (request.js) and by the admin inbox (admin-requests.js), which labels the
 * answers and writes each request up as a prompt for an AI assistant.
 *
 * Three kinds: a training, a problem, an idea. Each question:
 *   key       the answer's name on the server (a-z, 0-9, _; at most 40)
 *   label     the question
 *   hint      a line under it (optional)
 *   type      text | textarea | choice (one, radio) | multi (tick boxes)
 *             | select | date | check (a single yes tick box)
 *   options   for choice, multi and select
 *   required  the form will not send without it. The server checks
 *             the same keys (REQUEST_KINDS in AI-Lessons'
 *             supabase/functions/learning-hub/core.mjs): change both.
 *   other     multi/choice: adds an "Other: ___" box (kept as <key>_other)
 *   ph        placeholder
 *   section   starts a new group of questions with this heading
 *
 * `title` is the request's one-line name (every kind has one, required).
 * Never ask for student names or other students' data here: the form says so.
 */
(function () {
    'use strict';

    var AUDIENCE = ['All staff', 'KG & Primary teachers', 'Secondary teachers', 'A department or subject team',
        'Teaching assistants', 'Learning Support / Inclusion', 'Leadership (SLT, LLT, team leaders)',
        'Admin & support staff', 'New staff', 'Just me'];

    var PAGES = ['Home page', 'My Dashboard', 'PD Modules page', 'A PD module (training)', 'A certificate',
        'PD Day page', 'AI Literacy Hub', 'Orientation Hub', 'Tools & Resources', 'Library Hub', 'Media Hub / newsletter',
        'Committees', 'Personal goal or evaluation form', 'Search', 'Notifications (the bell)', 'Signing in',
        'Admin dashboard or Hub Analytics', 'Another page'];

    window.AISA_REQUEST_SPEC = {
        training: {
            label: 'Request a training',
            blurb: 'A topic, tool or skill you or your colleagues need. Tell us who it is for and what they should be able to do after it.',
            icon: '\u{1F393}',
            prompt: 'Training request',
            fields: [
                { section: 'The training', key: 'title', type: 'text', required: true,
                  label: 'What should the training be about?',
                  ph: 'e.g. Using Gemini to differentiate reading passages' },
                { key: 'why', type: 'textarea', required: true,
                  label: 'What is prompting this? What problem would it solve?',
                  hint: 'What is hard, slow or unclear today, and for whom. A real example from your week helps most.' },
                { key: 'outcomes', type: 'textarea', required: true,
                  label: 'By the end, people should be able to…',
                  hint: 'Two to four things, one per line. Start each with a verb: set up, explain, decide, create.' },
                { key: 'topics', type: 'textarea',
                  label: 'Must-cover topics, steps or examples',
                  hint: 'Anything that has to be in it, in the order you would teach it if you know.' },
                { key: 'tools', type: 'text',
                  label: 'Tools, platforms or policies involved',
                  ph: 'e.g. Gemini, Google Classroom, PowerSchool, the ADEK AI policy' },

                { section: 'Who it is for', key: 'audience', type: 'multi', required: true, other: true,
                  label: 'Who needs it?', options: AUDIENCE },
                { key: 'audience_detail', type: 'text',
                  label: 'Which grade, department or team, if it is a particular one?',
                  ph: 'e.g. Grade 4 team, Secondary Science, the front office' },
                { key: 'level', type: 'choice',
                  label: 'How familiar are they with this already?',
                  options: ['New to it', 'Some experience', 'Already use it: want to go deeper', 'A mix'] },
                { key: 'expectation', type: 'choice',
                  label: 'Should it be required for them?',
                  options: ['Required', 'Recommended', 'Optional', 'Not sure'] },

                { section: 'Shape and timing', key: 'format', type: 'multi', other: true,
                  label: 'What would work best?',
                  options: ['Self-paced module on the Hub (like the PD modules)', 'Step-by-step guide or cheat sheet',
                      'Short video walkthrough', 'Templates or examples to copy', 'Live workshop or PD session',
                      'Knowledge check (quiz)', 'Certificate on completion'] },
                { key: 'length', type: 'choice',
                  label: 'How long should it take someone?',
                  options: ['Under 15 minutes', '15–30 minutes', '30–60 minutes', 'Over an hour', 'Not sure'] },
                { key: 'needed_by', type: 'date',
                  label: 'Needed by (if there is a date)',
                  hint: 'A deadline, a PD day, an inspection, the start of a unit…' },
                { key: 'urgency', type: 'choice',
                  label: 'How urgent is it?',
                  options: ['Urgent: people are stuck now', 'Soon: this term', 'Whenever it is ready'] },
                { key: 'arabic', type: 'check',
                  label: 'It should be in Arabic as well as English' },

                { section: 'Material and people', key: 'sources', type: 'textarea',
                  label: 'Documents, links or examples that should go into it',
                  hint: 'Paste links (Google Drive, websites, videos). Check the Hub team can open them. No student names or student work with names.' },
                { key: 'success', type: 'textarea',
                  label: 'How will we know it worked?',
                  hint: 'What you would see people doing differently afterwards.' },
                { key: 'experts', type: 'text',
                  label: 'Who knows this topic best at AISA?',
                  ph: 'A name or a team, if you know' },
                { key: 'can_review', type: 'check',
                  label: 'I am happy to review a draft or help build it' },
                { key: 'extra', type: 'textarea',
                  label: 'Anything else we should know?' }
            ]
        },

        bug: {
            label: 'Report a problem',
            blurb: 'Something on the Hub is broken, wrong or confusing: a page, a module, a certificate, signing in.',
            icon: '\u{1F6E0}\u{FE0F}',
            prompt: 'Problem report',
            fields: [
                { section: 'What went wrong', key: 'title', type: 'text', required: true,
                  label: 'Sum it up in one line',
                  ph: 'e.g. My Sustainability certificate downloads as a blank page' },
                { key: 'where', type: 'select', required: true,
                  label: 'Where did it happen?', options: PAGES },
                { key: 'page', type: 'text',
                  label: 'The page’s address',
                  hint: 'Filled in with the page you came from. Change it if the problem was somewhere else.' },
                { key: 'what_doing', type: 'textarea',
                  label: 'What were you trying to do?' },
                { key: 'what_happened', type: 'textarea', required: true,
                  label: 'What happened instead?',
                  hint: 'Copy any message you saw word for word.' },
                { key: 'expected', type: 'textarea',
                  label: 'What did you expect to happen?' },
                { key: 'steps', type: 'textarea',
                  label: 'Steps to make it happen again',
                  hint: 'One per line: 1. Open My Dashboard 2. Press Download certificate…' },

                { section: 'How much it matters', key: 'frequency', type: 'choice',
                  label: 'Does it happen every time?',
                  options: ['Every time', 'Sometimes', 'It happened once'] },
                { key: 'impact', type: 'choice',
                  label: 'How badly does it affect you?',
                  options: ['I cannot finish something I have to do', 'It is annoying but I can work around it', 'It is small or cosmetic'] },
                { key: 'completion', type: 'choice',
                  label: 'Did it affect a training completion or a certificate?',
                  options: ['Yes', 'No', 'Not sure'] },
                { key: 'started', type: 'text',
                  label: 'When did you first notice it?',
                  ph: 'e.g. Today, after the PD day, since September' },
                { key: 'others', type: 'choice',
                  label: 'Does it happen to colleagues too?',
                  options: ['Yes', 'No', 'I do not know'] },

                { section: 'Your device', key: 'device', type: 'select',
                  label: 'What were you using?',
                  options: ['School laptop', 'My own laptop or desktop', 'iPad or tablet', 'Phone', 'A classroom or shared computer'] },
                { key: 'tried', type: 'multi',
                  label: 'Did anything help?',
                  options: ['Reloading the page', 'Signing out and in again', 'Another browser', 'Another device', 'Nothing helped', 'I did not try anything'] },
                { key: 'screenshot', type: 'text',
                  label: 'Link to a screenshot or screen recording (optional)',
                  hint: 'Put it in Google Drive and share it with the Hub team. Nothing with student names.' },
                { key: 'extra', type: 'textarea',
                  label: 'Anything else we should know?' }
            ]
        },

        idea: {
            label: 'Share an idea',
            blurb: 'Something you would like more of, a feature that would help, or a better way to do something on the Hub.',
            icon: '\u{1F4A1}',
            prompt: 'Idea or improvement',
            fields: [
                { section: 'Your idea', key: 'title', type: 'text', required: true,
                  label: 'Your idea in one line',
                  ph: 'e.g. A “continue where I left off” button on My Dashboard' },
                { key: 'area', type: 'select',
                  label: 'Which part of the Hub is it about?',
                  options: ['PD modules and trainings', 'My Dashboard and certificates', 'Finding things (search, menus)',
                      'Notifications and emails', 'Newsletter and Media Hub', 'Tools & Resources', 'Orientation Hub',
                      'AI Literacy Hub', 'PD Day pages', 'Forms (goals, evaluations)', 'Admin tools', 'Something new', 'Other'] },
                { key: 'problem', type: 'textarea', required: true,
                  label: 'What would it fix, or what would you like more of?',
                  hint: 'What is missing or hard today. Who runs into it, and how often.' },
                { key: 'idea_detail', type: 'textarea',
                  label: 'How do you picture it working?',
                  hint: 'Walk us through it: where it would be, what you would press, what you would see.' },
                { key: 'beneficiaries', type: 'multi', other: true,
                  label: 'Who would it help?', options: AUDIENCE },
                { key: 'how_often', type: 'choice',
                  label: 'How often would you use it?',
                  options: ['Every day', 'Every week', 'Every month', 'A few times a year'] },
                { key: 'priority', type: 'choice',
                  label: 'How much would it help?',
                  options: ['Nice to have', 'It would help a lot', 'It is really needed'] },
                { key: 'examples', type: 'textarea',
                  label: 'Seen it done well somewhere? Links or examples',
                  hint: 'Another website, an app, a school, a document.' },
                { key: 'can_review', type: 'check',
                  label: 'I am happy to try an early version and give feedback' },
                { key: 'extra', type: 'textarea',
                  label: 'Anything else we should know?' }
            ]
        },

        /* About the person: asked on every kind, kept with the answers. */
        about: [
            { key: 'role', type: 'select', label: 'Your role',
              options: ['Teacher', 'Teaching assistant', 'Learning Support / Inclusion', 'Leadership', 'Coordinator or team leader',
                  'Admin or support staff', 'Other'] },
            { key: 'teach', type: 'text', label: 'Grade(s), subject or team',
              ph: 'e.g. Grade 7 & 8 Science, KG2, HR' }
        ],

        statuses: {
            new: 'New', planned: 'Planned', in_progress: 'In progress', done: 'Done', declined: 'Not going ahead'
        }
    };
})();
