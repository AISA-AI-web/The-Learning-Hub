/* =========================================================================
   Assessment Design in the Age of AI
   English ↔ Arabic dictionary. Consumed by onboarding-i18n.js.

   Two halves, because the engine matches one text node at a time:

   AR_DICT   — whole text nodes, attributes (title, alt, placeholder,
               aria-label) and the strings the page's own script writes
               at run time: the quiz feedback, the planner status, the
               Next/Finish label. Keys are whitespace-normalised; the
               engine falls back to a normalised lookup, so a key can be
               written on one line even where the HTML wraps it.

   AR_BLOCKS — sentences broken up by inline <strong>/<em>/<a>, where
               translating a third of a sentence at a time would wreck
               Arabic word order, plus a few plain sentences that need a
               .ltr span round a run of Latin names. Keyed by the
               element's normalised English innerHTML, exactly as the
               browser serialises it (&mdash; arrives as —, &amp; stays
               &amp;). The bootstrap at the bottom stamps the Arabic onto
               matching elements as data-ar, and the engine swaps the
               whole block.

   "Module n of 7" and "n% Done" are generated with live numbers, so they
   are patterns in onboarding-i18n.js rather than keys here.

   CONVENTIONS
   - Product, framework and researcher names (ChatGPT, Turnitin, AIAS,
     APA, Perkins …) stay in Latin script, matching the other -ar.js
     files. Latin runs inside Arabic sentences are wrapped in .ltr where
     punctuation would otherwise jump ends.
   - The APA and MLA example citations are left in English on purpose
     (data-no-translate in the page): they show a citation format, and a
     translated one would no longer be a correct APA or MLA reference.
   - Traffic-light colours: Red / Amber / Green → الأحمر / الأصفر / الأخضر.
     The planner's <option value>s stay English, so a draft saved in one
     language reloads in the other.
   - "Prompt" → مُوجَّه, as in ai-curriculum-readiness-ar.js.

   EDITING THE ENGLISH
   Change an English string in ai-and-assessment.html and its key here
   has to change too, or that string silently stays English in the
   Arabic view. AR_BLOCKS misses are reported in the console by name.
   Bump ai-and-assessment-ar.js?v=N in the page after any edit here.
   ========================================================================= */
window.AR_DICT = {
    /* ---- Page title (applied by the page's own script) ---- */
    "AISA | AI & Assessment Design":
        "AISA | تصميم التقييم في عصر الذكاء الاصطناعي",

    /* ---- Top nav ---- */
    "AI & Assessment PD":
        "التطوير المهني · التقييم والذكاء الاصطناعي",
    "Back to PD":
        "العودة إلى التطوير المهني",
    "Back to Learning Hub":
        "العودة إلى مركز التعلّم",
    "Back to PD Modules":
        "العودة إلى وحدات التطوير المهني",
    "AISA Logo":
        "شعار AISA",

    /* ---- Hero ---- */
    "Required PD · Assessment & Academic Integrity":
        "تطوير مهني إلزامي · التقييم والنزاهة الأكاديمية",
    "Assessment Design":
        "تصميم التقييم",
    "in the Age of AI.":
        "في عصر الذكاء الاصطناعي.",
    "AI-proof your questions. Integrate AI into the task. Reform your grading with oral defense and process artifacts. A complete, research-backed playbook for AISA classrooms.":
        "حصّن أسئلتك من الذكاء الاصطناعي. وادمج الذكاء الاصطناعي في المهمة نفسها. وأعد بناء التقدير بالدفاع الشفهي وشواهد مراحل العمل. دليل عمل متكامل، مستند إلى البحث العلمي، لصفوف AISA.",
    "~25 min":
        "~25 دقيقة",
    "6 modules + planner":
        "6 وحدات + مخطِّط",
    "Scenario Knowledge Check":
        "اختبار فهم قائم على مواقف",
    "Start the Module":
        "ابدأ الوحدة",

    /* ---- Core insight ---- */
    "The core insight":
        "الفكرة الجوهرية",
    "If an AI can answer it in 3 seconds, it's no longer an assessment. It's a typing test.":
        "إذا استطاع الذكاء الاصطناعي أن يجيب عنه في 3 ثوانٍ، فهو لم يعد تقييمًا، بل صار اختبارًا في الطباعة.",
    "You'll leave with":
        "ما ستخرج به",
    "→":
        "←",
    "A 5-level AI-use policy":
        "سياسة لاستخدام الذكاء الاصطناعي من 5 مستويات",
    "12 AI-proofing moves":
        "12 خطوة لتحصين التقييم من الذكاء الاصطناعي",
    "An oral defense rubric":
        "سُلَّم تقدير للدفاع الشفهي",
    "Citation & reflection templates":
        "نماذج للتوثيق والتأمّل",
    "A draftable redesign planner":
        "مخطِّط لإعادة التصميم تكتب فيه مسودتك",

    /* ---- Module sidebar ---- */
    "Module navigation":
        "التنقّل بين الوحدات",
    "Modules":
        "الوحدات",
    "Set the Rules":
        "ضع القواعد",
    "AI-Proof":
        "حصّن التقييم",
    "Integrate":
        "ادمج الذكاء الاصطناعي",
    "Defend (Viva)":
        "دافِع (المناقشة الشفهية)",
    "Cite & Reflect":
        "وثّق وتأمّل",
    "Check & Plan":
        "تحقّق وخطّط",
    "Cheat Sheet":
        "الملخّص المرجعي",
    "Mark Complete":
        "تحديد كمكتمل",
    "Mark as completed":
        "تحديد كمكتمل",

    /* ---- Module 1: Set the Rules ---- */
    "Policy Foundations":
        "أسس السياسة",
    "The AI Use Continuum":
        "طيف استخدام الذكاء الاصطناعي",
    "The AI Assessment Scale (AIAS)":
        "مقياس تقييم استخدام الذكاء الاصطناعي (AIAS)",
    "AIAS Levels":
        "مستويات AIAS",
    "1 · No AI":
        "1 · بلا ذكاء اصطناعي",
    "2 · AI Planning":
        "2 · التخطيط بالذكاء الاصطناعي",
    "3 · AI Collaboration":
        "3 · التعاون مع الذكاء الاصطناعي",
    "4 · Full AI":
        "4 · ذكاء اصطناعي كامل",
    "5 · AI Exploration":
        "5 · الاستكشاف بالذكاء الاصطناعي",
    "Level 1 — No AI":
        "المستوى 1 — بلا ذكاء اصطناعي",
    "Assessment completed entirely without AI assistance. Protects foundational skill demonstration.":
        "يُنجَز التقييم كاملًا دون أي مساعدة من الذكاء الاصطناعي. ويحفظ قدرة الطالب على إظهار مهاراته الأساسية.",
    "When to use":
        "متى تستخدمه",
    "Formative checks, foundational literacy/numeracy, invigilated exams, early-unit diagnostics.":
        "التحقّق التكويني، ومهارات القراءة والكتابة والحساب الأساسية، والاختبارات المراقَبة، والتشخيص في بداية الوحدة الدراسية.",
    "How to enforce":
        "كيف تطبّقه",
    "In-class, handwritten, or on a locked-down device. Don't give this as take-home.":
        "داخل الصف، بخط اليد، أو على جهاز مقفل. ولا تُعطِه واجبًا منزليًا.",
    "Level 2 — AI Planning":
        "المستوى 2 — التخطيط بالذكاء الاصطناعي",
    "Allowed":
        "مسموح",
    "Brainstorming, structuring arguments, grammar checks, summarising source material.":
        "العصف الذهني، وبناء الحجج، والتدقيق النحوي، وتلخيص المواد المصدرية.",
    "Not allowed":
        "غير مسموح",
    "Generating sentences/paragraphs that appear in the final work. Students submit their prompts log.":
        "توليد جمل أو فقرات تظهر في العمل النهائي. ويسلّم الطلاب سجلّ المُوجَّهات التي استخدموها.",
    "Level 3 — AI Collaboration":
        "المستوى 3 — التعاون مع الذكاء الاصطناعي",
    "AI co-authors specific sections. Student directs, edits, and is accountable for every claim.":
        "يشارك الذكاء الاصطناعي في كتابة أقسام محدّدة. والطالب يوجّه ويحرّر، وهو مسؤول عن كل ادّعاء.",
    "AI-generated drafts the student substantially rewrites, code scaffolds, translation, image generation.":
        "مسودات يولّدها الذكاء الاصطناعي ويعيد الطالب كتابتها إلى حدّ كبير، وهياكل برمجية أولية، والترجمة، وتوليد الصور.",
    "Required":
        "مطلوب",
    "Citation of AI use + reflection on what was accepted, rejected, and revised.":
        "توثيق استخدام الذكاء الاصطناعي + تأمّل فيما قُبل وما رُفض وما عُدّل.",
    "Level 4 — Full AI":
        "المستوى 4 — ذكاء اصطناعي كامل",
    "What's assessed":
        "ما الذي يُقيَّم",
    "Prompt quality, selection between AI outputs, fact-checking, ethical judgement.":
        "جودة المُوجَّه، والمفاضلة بين مخرجات الذكاء الاصطناعي، والتحقّق من الحقائق، والحكم الأخلاقي.",
    "Example":
        "مثال",
    "\"Use AI to draft 3 marketing pitches — critique which is strongest and why, in 400 words of your own.\"":
        "«استخدم الذكاء الاصطناعي لصياغة 3 عروض تسويقية — ثم انقد أيّها أقوى ولماذا، في 400 كلمة بقلمك.»",
    "Level 5 — AI Exploration":
        "المستوى 5 — الاستكشاف بالذكاء الاصطناعي",
    "Capstone projects, EPQ, IB extended essay, senior design, AP research.":
        "مشاريع التخرّج، ومشروع EPQ، والمقالة الموسّعة في البكالوريا الدولية IB، ومشاريع التصميم في السنة النهائية، وبحث AP.",
    "Grading focus":
        "محور التقدير",
    "Originality of the system designed, not the AI output it produces.":
        "أصالة النظام الذي صمّمه الطالب، لا مخرجات الذكاء الاصطناعي التي يُنتجها.",
    "The Traffic Light: write this on every task sheet":
        "إشارة المرور: اكتبها على كل ورقة مهمة",
    "RED":
        "الأحمر",
    "AMBER":
        "الأصفر",
    "GREEN":
        "الأخضر",
    "No AI permitted. Use of AI is academic misconduct. Often used for in-class exams and foundational skill checks.":
        "لا يُسمح بالذكاء الاصطناعي، واستخدامه مخالفة أكاديمية. يُستخدم غالبًا في الاختبارات الصفية والتحقّق من المهارات الأساسية.",
    "AI permitted for specified steps only — brainstorming, editing, language help. All uses must be cited and reflected on.":
        "يُسمح بالذكاء الاصطناعي في خطوات محدّدة فقط — العصف الذهني، والتحرير، والمساعدة اللغوية. ويجب توثيق كل استخدام والتأمّل فيه.",
    "AI use expected and encouraged. Graded on how well students direct, critique, and build upon AI outputs.":
        "استخدام الذكاء الاصطناعي متوقَّع ومُشجَّع. ويُقدَّر العمل بمدى إتقان الطلاب لتوجيه مخرجات الذكاء الاصطناعي ونقدها والبناء عليها.",
    "Pro-tip":
        "نصيحة عملية",

    /* ---- Module 2: AI-Proof ---- */
    "12 Concrete Moves":
        "12 خطوة عملية",
    "AI-Proofing Traditional Assessments":
        "تحصين التقييمات التقليدية من الذكاء الاصطناعي",
    "Require references to a specific Tuesday lab, Mr. Ahmed's anecdote, or slide 14 of the deck. AI can't know what happened in your room.":
        "اشترط الإشارة إلى تجربة مخبرية بعينها يوم الثلاثاء، أو إلى حكاية رواها الأستاذ أحمد، أو إلى الشريحة 14 من العرض. فالذكاء الاصطناعي لا يعرف ما جرى في صفّك.",
    "Use hyper-local context":
        "استخدم سياقًا محليًا دقيقًا",
    "Tie prompts to Abu Dhabi, AISA sports day, yesterday's headline, or data your students collected themselves.":
        "اربط أسئلة المهام بأبوظبي، أو باليوم الرياضي في AISA، أو بعنوان أخبار الأمس، أو ببيانات جمعها طلابك بأنفسهم.",
    "Process over product":
        "العملية قبل المنتج",
    "Grade the revision history — Google Docs version log, drafts, marginal notes — not just the final file.":
        "قدّر سجلّ المراجعات — سجلّ الإصدارات في Google Docs، والمسودات، والملاحظات الهامشية — لا الملف النهائي وحده.",
    "Two-stage tasks":
        "مهام على مرحلتين",
    "Handwritten in class":
        "بخط اليد داخل الصف",
    "For high-stakes skill checks: return to paper. Pair with short, frequent assessments rather than one big exam.":
        "في التحقّق من المهارات عالي المخاطر: عُد إلى الورق، واقرنه بتقييمات قصيرة ومتكرّرة بدلًا من اختبار واحد كبير.",
    "Multimodal response":
        "استجابة متعدّدة الوسائط",
    "Ask for a physical model, labelled sketch, whiteboard photo, or hand-annotated diagram as a required component.":
        "اطلب نموذجًا ماديًا، أو رسمًا مُعنوَنًا، أو صورة للسبّورة، أو مخططًا مشروحًا بخط اليد، مكوّنًا إلزاميًا من المهمة.",
    "Personal-experience prompts":
        "أسئلة مبنية على التجربة الشخصية",
    "\"Connect this concept to a decision you made last term.\" Lived experience can't be LLM-generated convincingly.":
        "«اربط هذا المفهوم بقرار اتخذته في الفصل الدراسي الماضي.» فالتجربة المعيشة لا تستطيع النماذج اللغوية الكبيرة أن تولّدها على نحو مقنع.",
    "Require primary sources":
        "اشترط المصادر الأولية",
    "Ask for direct quotes with page numbers from specific texts. Fabricated (\"hallucinated\") citations are the #1 AI tell.":
        "اطلب اقتباسات مباشرة بأرقام صفحاتها من نصوص محدّدة. فالمراجع المختلَقة («المُهلوَسة») هي العلامة الأولى على استخدام الذكاء الاصطناعي.",
    "Post-training-cutoff content":
        "محتوى أحدث من بيانات تدريب النموذج",
    "Base prompts on last month's news, a recent school event, or data you generated yesterday. LLMs fumble on very recent context.":
        "ابنِ أسئلة المهام على أخبار الشهر الماضي، أو على فعالية مدرسية حديثة، أو على بيانات أنتجتها بالأمس. فالنماذج اللغوية الكبيرة تتعثّر في السياقات الحديثة جدًا.",
    "Oral defense follow-up":
        "متابعة بالدفاع الشفهي",
    "Ask for the reasoning":
        "اسأل عن الاستدلال",
    "Collaborative artefacts":
        "نواتج تعاونية",
    "Group projects with individual contribution tracking (Docs suggestion mode, GitHub commits). Each student defends their slice.":
        "مشاريع جماعية مع تتبّع إسهام كل فرد (وضع الاقتراحات في Docs، وعمليات الإيداع في GitHub). ويدافع كل طالب عن الجزء الذي أنجزه.",
    "Don't rely on AI detectors":
        "لا تعتمد على أدوات كشف الذكاء الاصطناعي",

    /* ---- Module 3: Integrate ---- */
    "Assess With AI, Not Against It":
        "قيّم مع الذكاء الاصطناعي، لا ضدّه",
    "Integrating AI Into Assessments":
        "دمج الذكاء الاصطناعي في التقييمات",
    "A Pedagogical Stance":
        "موقف تربوي",
    "Pattern 1 · \"Find the Flaw\"":
        "النمط 1 · «اعثر على الخلل»",
    "Give students an AI-generated essay, code, or lab report with deliberate errors. They annotate errors, explain why they're wrong, and rewrite correctly.":
        "أعطِ الطلاب مقالة أو شيفرة برمجية أو تقريرًا مخبريًا من توليد الذكاء الاصطناعي يتضمّن أخطاء متعمَّدة. فيحدّدون الأخطاء بالتعليق عليها، ويشرحون سبب خطئها، ويعيدون كتابتها على نحو صحيح.",
    "What you're assessing":
        "ما الذي تقيّمه",
    "Domain knowledge, critical reading, and error detection — higher-order Bloom's.":
        "المعرفة بالمادة، والقراءة الناقدة، واكتشاف الأخطاء — أي المستويات العليا في تصنيف بلوم.",
    "Pattern 2 · Prompt Engineering":
        "النمط 2 · هندسة المُوجَّهات",
    "Clarity of instruction, task decomposition, specificity — real professional skills.":
        "وضوح التعليمات، وتجزئة المهمة، ودقّة التحديد — وهي مهارات مهنية حقيقية.",
    "Pattern 3 · Compare & Choose":
        "النمط 3 · قارِن واختر",
    "Generate 3 AI outputs on the same problem. Students rank them, justify the ranking against a rubric, and improve the best one.":
        "ولّد 3 مخرجات من الذكاء الاصطناعي للمسألة نفسها. يرتّبها الطلاب، ويبرّرون الترتيب وفق سُلَّم تقدير، ثم يحسّنون أفضلها.",
    "Evaluative judgement, rubric literacy, revision skills.":
        "الحكم التقييمي، وفهم سلالم التقدير، ومهارات المراجعة.",
    "Pattern 4 · Verify Every Claim":
        "النمط 4 · تحقّق من كل ادّعاء",
    "Information literacy, source evaluation, epistemic caution.":
        "الثقافة المعلوماتية، وتقييم المصادر، والحذر المعرفي.",
    "Pattern 5 · The Chat Transcript":
        "النمط 5 · نصّ المحادثة",
    "Metacognition, iterative thinking, learning-by-dialogue.":
        "ما وراء المعرفة، والتفكير التكراري، والتعلّم بالحوار.",
    "Pattern 6 · Build a Custom GPT":
        "النمط 6 · ابنِ نموذج GPT مخصّصًا",
    "Students design a custom GPT / Gem / project that teaches a younger student, tutors a concept, or solves a niche problem. Grade the system design and instructions.":
        "يصمّم الطلاب نموذج GPT أو Gem أو مشروعًا مخصّصًا يعلّم طالبًا أصغر سنًا، أو يشرح مفهومًا، أو يحلّ مشكلة متخصّصة. وقدّر أنت تصميم النظام وتعليماته.",
    "Pedagogical thinking, systems design, audience awareness, original application.":
        "التفكير التربوي، وتصميم الأنظمة، ومراعاة الجمهور، والتطبيق الأصيل.",
    "Pattern 7 · Debate the AI":
        "النمط 7 · ناظِر الذكاء الاصطناعي",
    "Student picks a position. AI is prompted to argue the strongest possible counter. Student submits the full debate transcript + a 200-word post-mortem on which AI arguments forced a concession, which they rebutted, and where the AI used sophistry.":
        "يختار الطالب موقفًا، ويُوجَّه الذكاء الاصطناعي ليدافع عن أقوى موقف مضاد ممكن. ثم يسلّم الطالب نصّ المناظرة كاملًا + مراجعة لاحقة من 200 كلمة: أيّ حجج الذكاء الاصطناعي أجبرته على التنازل، وأيّها فنّدها، وأين لجأ الذكاء الاصطناعي إلى المغالطة.",
    "Argumentation, intellectual humility, rebuttal craft, recognising fallacies.":
        "بناء الحجة، والتواضع الفكري، وإتقان التفنيد، والتعرّف على المغالطات.",
    "Pattern 8 · Red Team the Model":
        "النمط 8 · اختبر النموذج بأسلوب الفريق الأحمر",
    "Domain expertise, ethical reasoning, evidence collection, healthy scepticism.":
        "الخبرة في المادة، والاستدلال الأخلاقي، وجمع الأدلة، والتشكّك الصحي.",
    "Pattern 9 · Live Critique":
        "النمط 9 · النقد المباشر",
    "Speed of critical reading, content mastery, recognition of AI tells (over-confidence, fake citations, vague hedging).":
        "سرعة القراءة الناقدة، وإتقان المحتوى، والتعرّف على علامات الذكاء الاصطناعي (الثقة المفرطة، والمراجع المزيّفة، والتحفّظ المبهم).",
    "Equity & access":
        "الإنصاف وإتاحة الوصول",

    /* ---- Module 4: Viva voce ---- */
    "Grade Differently":
        "قدّر بطريقة مختلفة",
    "Defense-Based Assessment":
        "تقييم قائم على الدفاع",
    "Viva Voce & Oral Defense":
        "المناقشة الشفهية والدفاع عن العمل",
    "What it is":
        "ما هي",
    "A 5-10 minute defense":
        "دفاع مدته 5–10 دقائق",
    "Student sits with you (or a panel), you ask unprepared questions about their submitted work, and you grade the conversation — not just the paper.":
        "يجلس الطالب معك (أو مع لجنة)، وتطرح عليه أسئلة غير مُعَدّة مسبقًا عن العمل الذي سلّمه، ثم تقدّر الحوار — لا الورقة وحدها.",
    "Why it works":
        "لماذا تنجح",
    "AI can't sit the interview":
        "الذكاء الاصطناعي لا يستطيع حضور المقابلة",
    "Weighting":
        "الوزن في الدرجة",
    "30-50% of the grade":
        "30–50% من الدرجة",
    "The Viva Voce question bank":
        "بنك أسئلة المناقشة الشفهية",
    "Pick 3-5 of these at random per student. Keep the tone warm but precise.":
        "اختر 3–5 منها عشوائيًا لكل طالب، وحافظ على نبرة ودودة لكن دقيقة.",
    "Source & reasoning":
        "المصدر والاستدلال",
    "• \"Walk me through how you arrived at this conclusion.\"":
        "• «حدّثني خطوة بخطوة كيف وصلت إلى هذا الاستنتاج.»",
    "• \"Which source was most useful, and why?\"":
        "• «أيّ المصادر كان الأكثر فائدة، ولماذا؟»",
    "• \"Show me where in your draft you changed your mind.\"":
        "• «أرِني الموضع في مسودتك الذي غيّرت فيه رأيك.»",
    "Understanding":
        "الفهم",
    "• \"Explain this sentence as if I were a Year 7 student.\"":
        "• «اشرح هذه الجملة كما لو كنتُ طالبًا في الصف السابع.»",
    "• \"Define this technical term you used.\"":
        "• «عرّف هذا المصطلح التقني الذي استخدمته.»",
    "• \"What would you cut if I gave you half the word count?\"":
        "• «ما الذي ستحذفه لو منحتك نصف عدد الكلمات؟»",
    "Process":
        "العملية",
    "• \"What was the hardest part, and how did you handle it?\"":
        "• «ما أصعب جزء، وكيف تعاملت معه؟»",
    "• \"Which AI tools did you use, and for which steps?\"":
        "• «ما أدوات الذكاء الاصطناعي التي استخدمتها، وفي أيّ الخطوات؟»",
    "• \"What's one thing the AI got wrong that you fixed?\"":
        "• «اذكر شيئًا واحدًا أخطأ فيه الذكاء الاصطناعي وصحّحته أنت.»",
    "Extension":
        "التوسّع",
    "• \"If you had another week, what would you add?\"":
        "• «لو كان لديك أسبوع آخر، ماذا كنت ستضيف؟»",
    "• \"Give me a counterargument to your own thesis.\"":
        "• «أعطني حجة مضادة لأطروحتك أنت.»",
    "• \"What's a question your work raises but doesn't answer?\"":
        "• «ما السؤال الذي يثيره عملك ولا يجيب عنه؟»",
    "Oral defense rubric (copy-ready)":
        "سُلَّم تقدير الدفاع الشفهي (جاهز للنسخ)",
    "Criterion":
        "المعيار",
    "Emerging (1-2)":
        "ناشئ (1–2)",
    "Proficient (3)":
        "متمكّن (3)",
    "Exemplary (4)":
        "متميّز (4)",
    "Ownership of content":
        "امتلاك المحتوى",
    "Recites memorised phrases; confused when probed.":
        "يردّد عبارات محفوظة، ويرتبك عند التعمّق في السؤال.",
    "Explains main ideas confidently in own words.":
        "يشرح الأفكار الرئيسة بثقة وبكلماته الخاصة.",
    "Re-explains, reframes, and improves on the fly.":
        "يعيد الشرح، ويعيد الصياغة، ويحسّن إجابته في اللحظة نفسها.",
    "Evidence & sourcing":
        "الأدلة والمصادر",
    "Cannot locate or justify sources.":
        "لا يستطيع تحديد مصادره أو تبرير اختيارها.",
    "Names sources and summarises them accurately.":
        "يسمّي المصادر ويلخّصها بدقة.",
    "Weighs sources against each other; flags weaknesses.":
        "يوازن بين المصادر، ويشير إلى مواطن ضعفها.",
    "Response to challenge":
        "الاستجابة للتحدّي",
    "Becomes defensive; repeats earlier claims.":
        "يتّخذ موقفًا دفاعيًا، ويكرّر ادّعاءاته السابقة.",
    "Accepts feedback; adjusts position reasonably.":
        "يتقبّل الملاحظات، ويعدّل موقفه على نحو معقول.",
    "Generates counterarguments unprompted; thinks aloud.":
        "يطرح حججًا مضادة دون أن يُطلب منه، ويفكّر بصوت مسموع.",
    "AI transparency":
        "الشفافية في استخدام الذكاء الاصطناعي",
    "Vague or evasive about AI use.":
        "غامض أو مراوغ بشأن استخدامه للذكاء الاصطناعي.",
    "Names tools and steps where AI was used.":
        "يسمّي الأدوات والخطوات التي استُخدم فيها الذكاء الاصطناعي.",
    "Explains what AI got wrong and how they fixed it.":
        "يشرح ما أخطأ فيه الذكاء الاصطناعي وكيف صحّحه.",
    "Defense formats for different class sizes":
        "صيغ الدفاع بحسب حجم الصف",
    "1-on-1 Viva":
        "مناقشة فردية",
    "5-10 min. Best for capstones, IB orals, senior projects.":
        "5–10 دقائق. الأنسب لمشاريع التخرّج، والاختبارات الشفهية في البكالوريا الدولية، ومشاريع السنة النهائية.",
    "Loom/Flip Video":
        "فيديو عبر Loom أو Flip",
    "3-min walkthrough of their work + one surprise question by reply.":
        "عرض لعمل الطالب مدته 3 دقائق + سؤال مفاجئ واحد في الرد.",
    "Peer Panel":
        "لجنة من الأقران",
    "Student defends to 3 peers using your rubric. Scales to 30+ students.":
        "يدافع الطالب أمام 3 من أقرانه باستخدام سُلَّم التقدير الخاص بك. ويصلح لصفوف من 30 طالبًا فأكثر.",
    "Random Exit Ticket":
        "بطاقة خروج عشوائية",
    "Pull 5 students at random for a 2-min mini-viva after each submission.":
        "اختر 5 طلاب عشوائيًا لمناقشة شفهية مصغّرة مدتها دقيقتان بعد كل تسليم.",
    "The 30-student reality check":
        "واقع الصف ذي الثلاثين طالبًا",

    /* ---- Module 5: Cite & Reflect ---- */
    "Transparency Tools":
        "أدوات الشفافية",
    "Citing AI & Writing Reflections":
        "توثيق الذكاء الاصطناعي وكتابة التأمّلات",
    "How to cite AI":
        "كيف توثّق الذكاء الاصطناعي",
    "APA 7th Edition":
        "APA، الإصدار السابع",
    "Updated guidance":
        "إرشادات محدّثة",
    "MLA 9th Edition":
        "MLA، الإصدار التاسع",
    "Quote the prompt, name the tool version, date it, link it.":
        "اقتبس المُوجَّه، واذكر إصدار الأداة، وأرّخه، وأضف الرابط.",
    "Minimum required fields (any style)":
        "الحقول المطلوبة كحدّ أدنى (بأي نمط توثيق)",
    "Tool name":
        "اسم الأداة",
    "Version/date":
        "الإصدار/التاريخ",
    "AI outputs are irreproducible":
        "مخرجات الذكاء الاصطناعي لا يمكن استنساخها",
    "Exact prompt":
        "المُوجَّه بنصّه",
    "In an appendix, verbatim":
        "في ملحق، حرفيًا",
    "How used":
        "طريقة الاستخدام",
    "Brainstorm? Draft? Edit?":
        "عصف ذهني؟ مسودة؟ تحرير؟",
    "The AI Reflection (required on every AI-assisted task)":
        "تأمّل استخدام الذكاء الاصطناعي (مطلوب في كل مهمة استُعين فيها بالذكاء الاصطناعي)",
    "A structured 150-word statement students attach to their work. Use these four prompts:":
        "بيان منظّم من 150 كلمة يرفقه الطلاب بعملهم. استخدم هذه الأسئلة الأربعة:",
    "What did I ask?":
        "ماذا سألت؟",
    "Paste your best 2-3 prompts verbatim.":
        "الصق أفضل 2–3 مُوجَّهات استخدمتها بنصّها.",
    "What did I accept?":
        "ماذا قبلت؟",
    "Which AI suggestions made it into the final piece unchanged?":
        "أيّ اقتراحات الذكاء الاصطناعي دخلت العمل النهائي دون تغيير؟",
    "What did I reject or revise?":
        "ماذا رفضت أو عدّلت؟",
    "Name one thing the AI got wrong, misleading, or biased.":
        "اذكر شيئًا واحدًا كان فيه الذكاء الاصطناعي مخطئًا أو مضلّلًا أو منحازًا.",
    "What did I learn?":
        "ماذا تعلّمت؟",
    "One sentence on how using AI changed your thinking about the topic.":
        "جملة واحدة عن الطريقة التي غيّر بها استخدام الذكاء الاصطناعي تفكيرك في الموضوع.",
    "AI-proofing the reflection itself":
        "تحصين التأمّل نفسه من الذكاء الاصطناعي",
    "Students will absolutely use AI to write an \"AI reflection\" if you let them. Use one of these four strategies:":
        "سيستخدم الطلاب الذكاء الاصطناعي حتمًا لكتابة «تأمّل في استخدام الذكاء الاصطناعي» إن سمحت لهم بذلك. استخدم إحدى هذه الاستراتيجيات الأربع:",
    "Spoken reflection (recorded)":
        "تأمّل شفهي (مسجَّل)",
    "Student records a 60-second Flip/Loom video answering the four prompts — verbal fillers and pauses reveal real thinking.":
        "يسجّل الطالب فيديو مدته 60 ثانية عبر Flip أو Loom يجيب فيه عن الأسئلة الأربعة — فالتردّد والوقفات في الكلام تكشف التفكير الحقيقي.",
    "Screenshot audit trail":
        "سجلّ تدقيق بلقطات الشاشة",
    "Students submit dated screenshots of their AI chat(s). Chat history on ChatGPT, Claude, and Gemini is timestamped — very hard to fake.":
        "يسلّم الطلاب لقطات شاشة مؤرَّخة لمحادثاتهم مع الذكاء الاصطناعي. فسجلّ المحادثات في ChatGPT و Claude و Gemini يحمل طابعًا زمنيًا — ويصعب جدًا تزييفه.",
    "Reflect-in-pairs":
        "التأمّل في أزواج",

    /* ---- Module 6: Check & Plan ---- */
    "Apply What You've Learned":
        "طبّق ما تعلّمته",
    "Scenario Knowledge Check & Redesign Planner":
        "اختبار الفهم بالمواقف ومخطِّط إعادة التصميم",
    "Three short scenarios to test your grip on the framework, then a personal redesign planner to apply it to a real upcoming assessment.":
        "ثلاثة مواقف قصيرة تختبر مدى تمكّنك من الإطار، ثم مخطِّط شخصي لإعادة التصميم تطبّقه على تقييم حقيقي قادم.",
    "Scenario 1 · The Take-Home Essay":
        "الموقف 1 · المقالة المنزلية",
    /* Answer badges. The shuffle relabels them in English; the engine's
     * observer turns the fresh letter Arabic when Arabic is on. */
    "A":
        "أ",
    "B":
        "ب",
    "C":
        "ج",
    "Run the submissions through Turnitin's AI detector and flag any result above 20%.":
        "مرّر الأعمال المسلَّمة عبر كاشف الذكاء الاصطناعي في Turnitin، وأشِر إلى أي نتيجة تتجاوز 20%.",
    "Mark the task as AIAS Level 2 / Amber, require a handwritten reflection in class, and viva 1-in-3 students on their submission.":
        "صنّف المهمة في المستوى 2 من AIAS / الأصفر، واشترط تأمّلًا بخط اليد داخل الصف، وناقش طالبًا من كل ثلاثة شفهيًا في عمله.",
    "Ban AI entirely and trust students' integrity pledges.":
        "امنع الذكاء الاصطناعي تمامًا، وثِق بتعهّدات الطلاب بالنزاهة.",
    "Scenario 2 · Choosing the AIAS Level":
        "الموقف 2 · اختيار مستوى AIAS",
    "A Grade 9 science class is writing a lab report on a local water-quality experiment they ran yesterday. They may use AI to tidy grammar and suggest sentence structure, but all analysis, data, and conclusions must be theirs. Which AIAS level fits?":
        "يكتب طلاب العلوم في الصف 9 تقريرًا مخبريًا عن تجربة أجروها بالأمس لقياس جودة المياه المحلية. ويجوز لهم استخدام الذكاء الاصطناعي لتنقيح القواعد واقتراح بنية الجمل، لكن التحليل والبيانات والاستنتاجات كلها يجب أن تكون من عملهم. أيّ مستويات AIAS يناسب ذلك؟",
    "Level 1 — No AI.":
        "المستوى 1 — بلا ذكاء اصطناعي.",
    "Level 2 — AI Planning.":
        "المستوى 2 — التخطيط بالذكاء الاصطناعي.",
    "Level 4 — Full AI.":
        "المستوى 4 — ذكاء اصطناعي كامل.",
    "Scenario 3 · The Suspicious Submission":
        "الموقف 3 · العمل المُريب",
    "Fail the student — the detector confidence is too high to be wrong.":
        "امنح الطالب درجة الرسوب — فثقة أداة الكشف أعلى من أن تكون خاطئة.",
    "Invite the student to a short viva voce using the Module 4 question bank; grade on their ability to defend the work.":
        "ادعُ الطالب إلى مناقشة شفهية قصيرة باستخدام بنك أسئلة الوحدة 4، وقدّر عمله بناءً على قدرته على الدفاع عنه.",
    "Ignore the flag — you have no other evidence.":
        "تجاهل التنبيه — فليس لديك دليل آخر.",
    "Your Assessment Redesign Planner":
        "مخطِّط إعادة تصميم تقييمك",
    "Pick one real assessment you'll deliver in the next 3 weeks. Draft the redesign below. Your entries are saved in your browser — you can come back to them later, or print the result.":
        "اختر تقييمًا حقيقيًا واحدًا ستقدّمه خلال الأسابيع الثلاثة القادمة، واكتب مسودة إعادة تصميمه أدناه. تُحفظ مدخلاتك في متصفحك — يمكنك العودة إليها لاحقًا، أو طباعة النتيجة.",
    "Assessment title & grade level":
        "عنوان التقييم والصف",
    "e.g. Grade 10 Biology — Cellular Respiration lab report":
        "مثال: الأحياء للصف 10 — تقرير مخبري عن التنفّس الخلوي",
    "AIAS level (1-5)":
        "مستوى AIAS (1–5)",
    "Select level...":
        "اختر المستوى...",
    "1 — No AI":
        "1 — بلا ذكاء اصطناعي",
    "2 — AI Planning":
        "2 — التخطيط بالذكاء الاصطناعي",
    "3 — AI Collaboration":
        "3 — التعاون مع الذكاء الاصطناعي",
    "4 — Full AI":
        "4 — ذكاء اصطناعي كامل",
    "5 — AI Exploration":
        "5 — الاستكشاف بالذكاء الاصطناعي",
    "Traffic-light colour":
        "لون إشارة المرور",
    "Select colour...":
        "اختر اللون...",
    "Red — no AI":
        "الأحمر — بلا ذكاء اصطناعي",
    "Amber — AI for specified steps only":
        "الأصفر — ذكاء اصطناعي في خطوات محدّدة فقط",
    "Green — AI expected":
        "الأخضر — الذكاء الاصطناعي متوقَّع",
    "AI-proofing moves you'll use (pick at least 2 from Module 2)":
        "خطوات التحصين التي ستستخدمها (اختر خطوتين على الأقل من الوحدة 2)",
    "e.g. Anchor to last week's field trip to Yas Marina; require a handwritten reflection; two-stage task with in-class revision...":
        "مثال: الربط بالرحلة الميدانية إلى مرسى ياس الأسبوع الماضي؛ اشتراط تأمّل بخط اليد؛ مهمة على مرحلتين مع مراجعة داخل الصف...",
    "Oral defense format (Module 4)":
        "صيغة الدفاع الشفهي (الوحدة 4)",
    "e.g. Random exit-ticket viva for 5 students chosen at submission time; 2 minutes each; use the Process + Understanding question bank...":
        "مثال: مناقشة شفهية ببطاقة خروج عشوائية لـ5 طلاب يُختارون وقت التسليم؛ دقيقتان لكلٍّ منهم؛ باستخدام أسئلة «العملية» و«الفهم» من بنك الأسئلة...",
    "Citation & reflection requirement (Module 5)":
        "متطلّب التوثيق والتأمّل (الوحدة 5)",
    "e.g. APA 7 citation + 150-word handwritten reflection (What I asked / accepted / rejected / learned) completed in first 10 minutes of next lesson...":
        "مثال: توثيق بنمط APA 7 + تأمّل بخط اليد من 150 كلمة (ماذا سألت / قبلت / رفضت / تعلّمت) يُنجَز في أول 10 دقائق من الحصة التالية...",
    "Save to this browser":
        "احفظ في هذا المتصفح",
    "Print / Save as PDF":
        "طباعة / حفظ بصيغة PDF",
    "Clear draft":
        "امسح المسودة",

    /* ---- Module 7: Cheat sheet ---- */
    "Print this":
        "اطبعها",
    "One-page summary":
        "ملخّص في صفحة واحدة",
    "The AI Assessment Cheat Sheet":
        "الملخّص المرجعي: التقييم في عصر الذكاء الاصطناعي",
    "Everything from this module, on one card. Put it above your desk while you redesign your assessments.":
        "كل ما في هذه الوحدة على بطاقة واحدة. ضعها فوق مكتبك وأنت تعيد تصميم تقييماتك.",
    "① Policy":
        "① السياسة",
    "② AI-proof":
        "② التحصين",
    "③ Integrate":
        "③ الدمج",
    "④ Defend":
        "④ الدفاع",
    "⑤ Reflect":
        "⑤ التأمّل",
    "Anchor tasks to this week's class, local context, and personal experience.":
        "اربط المهام بحصص هذا الأسبوع، وبالسياق المحلي، وبالتجربة الشخصية.",
    "Assess prompting, critique, and fact-checking — not production.":
        "قيّم صياغة المُوجَّهات والنقد والتحقّق من الحقائق — لا الإنتاج.",
    "Viva voce 1-in-3 students at random. Weight it 30-50% of the grade.":
        "ناقش شفهيًا طالبًا من كل ثلاثة عشوائيًا، واجعل وزن المناقشة 30–50% من الدرجة.",
    "Cite AI + 150-word handwritten reflection on ask / accept / reject / learn.":
        "وثّق الذكاء الاصطناعي + تأمّل بخط اليد من 150 كلمة: ماذا سألت / قبلت / رفضت / تعلّمت.",
    "Explore more PD":
        "استكشف المزيد من التطوير المهني",

    /* ---- Completion banner + certificate modal ---- */
    "Module Complete!":
        "اكتملت الوحدة!",
    "You're ready to redesign your next assessment. Print the cheat sheet and keep it above your desk.":
        "أنت الآن مستعد لإعادة تصميم تقييمك القادم. اطبع الملخّص المرجعي واحتفظ به فوق مكتبك.",
    "Assessment Design in the Age of AI":
        "تصميم التقييم في عصر الذكاء الاصطناعي",

    /* ---- Prev / Next bar ---- */
    "Next":
        "التالي",
    "Finish":
        "إنهاء",
    "Answer the knowledge checks correctly to complete this module and continue.":
        "أجب عن أسئلة اختبار الفهم إجابةً صحيحة لإكمال هذه الوحدة والمتابعة.",

    /* ---- Footer ---- */
    "AISA - American International School in Abu Dhabi":
        "AISA - المدرسة الأمريكية الدولية في أبوظبي",
    "Teaching & Learning Guide | AI & Assessment Design Module":
        "دليل التعليم والتعلّم | وحدة تصميم التقييم في عصر الذكاء الاصطناعي",

    /* ---- Written by the page's script at run time ---- */
    "🎉 Complete!":
        "🎉 اكتملت!",
    "Correct. Detectors are unreliable and policy-only approaches invite abuse. Declaring the AIAS level, requiring a handwritten reflection, and vivaing a random sample layers three independent safeguards.":
        "إجابة صحيحة. أدوات الكشف غير موثوقة، والاكتفاء بالسياسة وحدها يفتح باب سوء الاستخدام. أما إعلان مستوى AIAS، واشتراط تأمّل بخط اليد، ومناقشة عيّنة عشوائية شفهيًا، فيبني ثلاث ضمانات مستقلة بعضها فوق بعض.",
    "Correct. Students may use AI for planning and language polish, but the analysis, data, and conclusions remain their own work. That's exactly Level 2 — AI Planning.":
        "إجابة صحيحة. يجوز للطلاب استخدام الذكاء الاصطناعي في التخطيط وتحسين اللغة، لكن التحليل والبيانات والاستنتاجات تبقى من عملهم. وهذا هو المستوى 2 تمامًا — التخطيط بالذكاء الاصطناعي.",
    "Correct. AI detectors produce false positives, especially for multilingual students. The defensible response is to let the student demonstrate ownership through a viva.":
        "إجابة صحيحة. أدوات كشف الذكاء الاصطناعي تُنتج نتائج إيجابية كاذبة، لا سيما مع الطلاب متعدّدي اللغات. والاستجابة التي يمكن الدفاع عنها هي أن تتيح للطالب إثبات ملكيته لعمله من خلال مناقشة شفهية.",
    "Not quite. AI detectors produce false positives and should never be the sole basis for an integrity decision. Layer at least three of: AIAS level, handwritten reflection, process artefacts, and viva voce.":
        "ليس تمامًا. أدوات كشف الذكاء الاصطناعي تُنتج نتائج إيجابية كاذبة، ولا ينبغي أبدًا أن تكون الأساس الوحيد لقرار يتعلّق بالنزاهة. اجمع ثلاثة على الأقل مما يلي: مستوى AIAS، والتأمّل بخط اليد، وشواهد مراحل العمل، والمناقشة الشفهية.",
    "Not quite. AI is permitted for specific steps (grammar, structure) but not for the analysis or conclusions. That matches Level 2 — AI Planning, not Level 1 or Level 4.":
        "ليس تمامًا. الذكاء الاصطناعي مسموح به في خطوات محدّدة (القواعد، والبنية) لا في التحليل أو الاستنتاجات. وهذا يطابق المستوى 2 — التخطيط بالذكاء الاصطناعي، لا المستوى 1 ولا المستوى 4.",
    "Not quite. Detector confidence is not defensible evidence, but ignoring the signal misses a coaching moment. A short viva is the best next step — it either surfaces real ownership or a real conversation about the policy.":
        "ليس تمامًا. ثقة أداة الكشف ليست دليلًا يمكن الدفاع عنه، لكن تجاهل الإشارة يُضيّع فرصة للتوجيه. والمناقشة الشفهية القصيرة هي أفضل خطوة تالية — فإما أن تكشف ملكية حقيقية للعمل، وإما أن تفتح حوارًا حقيقيًا حول السياسة.",
    "Try another option.":
        "جرّب خيارًا آخر.",
    "Saved to this browser.":
        "حُفظت في هذا المتصفح.",
    "Could not save — storage unavailable.":
        "تعذّر الحفظ — التخزين غير متاح.",
    "Draft cleared.":
        "مُسحت المسودة."
};

window.AR_BLOCKS = {
    /* ---- Core insight ---- */
    "The goal isn't to outrun AI — it's to <strong class=\"text-slate-900\">assess what AI can't do</strong>: your student's reasoning, voice, judgement, and ability to defend their choices in real time. This module shows you how, in 6 practical units.":
        "ليس الهدف أن تسبق الذكاء الاصطناعي — بل أن <strong class=\"text-slate-900\">تقيّم ما لا يستطيع الذكاء الاصطناعي فعله</strong>: استدلال طالبك، وصوته الخاص، وحكمه، وقدرته على الدفاع عن خياراته في اللحظة نفسها. وتريك هذه الوحدة كيف تفعل ذلك في 6 وحدات عملية.",

    /* ---- Module 1 ---- */
    "The single most important move: <strong class=\"text-slate-900\">tell students exactly how much AI is allowed</strong> — on each task, in writing, before they start. \"No AI\" and \"AI everywhere\" are both policies. Ambiguity is not.":
        "الخطوة الأهم على الإطلاق: <strong class=\"text-slate-900\">أخبر الطلاب بدقة بالقدر المسموح به من الذكاء الاصطناعي</strong> — في كل مهمة، كتابةً، وقبل أن يبدؤوا. «لا ذكاء اصطناعي» و«ذكاء اصطناعي في كل شيء» كلتاهما سياسة. أما الغموض فليس سياسة.",
    "Based on the framework by Perkins, Furze, Roe &amp; MacVaugh (2024). Pick one level per assessment and name it on the task sheet.":
        "مستند إلى الإطار الذي وضعه <span class=\"ltr\">Perkins, Furze, Roe &amp; MacVaugh (2024)</span>. اختر مستوى واحدًا لكل تقييم، واذكره صراحةً في ورقة المهمة.",
    "AI for ideation, outlines, feedback on drafts. The <em>final product</em> must be the student's own words.":
        "الذكاء الاصطناعي لتوليد الأفكار، ووضع المخططات، وإبداء الملاحظات على المسودات. أما <em>المنتج النهائي</em> فيجب أن يكون بكلمات الطالب نفسه.",
    "AI does most of the production. Student is assessed on <strong class=\"text-slate-900\">prompting, curation, and critique</strong>.":
        "يتولّى الذكاء الاصطناعي معظم الإنتاج، ويُقيَّم الطالب على <strong class=\"text-slate-900\">صياغة المُوجَّهات، والانتقاء، والنقد</strong>.",
    "Students build <em>with</em> AI — custom GPTs, agents, multi-tool workflows — as the subject of assessment itself.":
        "يبني الطلاب <em>بالاستعانة</em> بالذكاء الاصطناعي — نماذج <span class=\"ltr\">GPT</span> مخصّصة، ووكلاء ذكيين، وتدفّقات عمل متعدّدة الأدوات — بحيث يكون ذلك هو موضوع التقييم نفسه.",
    "Never leave AI policy to \"department norms\" — put the traffic-light colour, a one-sentence explanation, and the citation requirement <strong class=\"text-white\">on every single assignment brief</strong>. Students should not have to guess.":
        "لا تترك سياسة الذكاء الاصطناعي لـ«أعراف القسم» — ضع لون إشارة المرور، وشرحًا في جملة واحدة، ومتطلّب التوثيق <strong class=\"text-white\">على كل ورقة تكليف دون استثناء</strong>. فلا ينبغي أن يضطر الطلاب إلى التخمين.",

    /* ---- Module 2 ---- */
    "AI-detection software is unreliable and biased against multilingual students. Stop trying to <em>catch</em> AI. Design tasks where AI can't silently do the work for students in the first place.":
        "برامج كشف الذكاء الاصطناعي غير موثوقة ومنحازة ضد الطلاب متعدّدي اللغات. فتوقّف عن محاولة <em>ضبط</em> الذكاء الاصطناعي، وصمّم من البداية مهامَّ لا يستطيع فيها الذكاء الاصطناعي أن يؤدي العمل عن الطلاب خفيةً.",
    "Anchor to <em>this week's class</em>":
        "اربط المهمة بـ<em>حصص هذا الأسبوع</em>",
    "Students take home a draft; next class they revise it <em>in the room</em> based on peer feedback. Stage 2 is the graded one.":
        "يأخذ الطلاب مسودة إلى المنزل، وفي الحصة التالية يراجعونها <em>داخل الصف</em> بناءً على ملاحظات الأقران. والمرحلة الثانية هي التي تُقدَّر.",
    "Any written submission is followed by a 3-5 min interview. See <a href=\"#\" onclick=\"event.preventDefault(); switchModule(4);\" class=\"text-fuchsia-700 font-bold underline\">Module 4</a> for the full viva voce playbook.":
        "يُتبَع كل عمل كتابي بمقابلة مدتها 3–5 دقائق. راجع <a href=\"#\" onclick=\"event.preventDefault(); switchModule(4);\" class=\"text-fuchsia-700 font-bold underline\">الوحدة 4</a> للاطلاع على دليل المناقشة الشفهية كاملًا.",
    "\"Why did you choose approach A over B?\" AI produces answers; students need to defend <em>choices</em>.":
        "«لماذا اخترت النهج (أ) بدلًا من النهج (ب)؟» الذكاء الاصطناعي يُنتج إجابات، أما الطلاب فعليهم أن يدافعوا عن <em>خياراتهم</em>.",
    "Tools like Turnitin's AI detector and GPTZero produce <strong class=\"text-rose-700\">false positives</strong> — especially against non-native English writers and neurodivergent students. Use them only as a conversation starter, never as proof of misconduct.":
        "تُنتج أدوات مثل كاشف الذكاء الاصطناعي في <span class=\"ltr\">Turnitin</span> وأداة <span class=\"ltr\">GPTZero</span> <strong class=\"text-rose-700\">نتائج إيجابية كاذبة</strong> — لا سيما مع الكتّاب الذين ليست الإنجليزية لغتهم الأم، ومع الطلاب ذوي التنوّع العصبي. استخدمها مدخلًا للحوار فقط، ولا تعدّها أبدًا دليلًا على المخالفة.",

    /* ---- Module 3 ---- */
    "Some of the most powerful assessments in 2026 <em>require</em> AI. The skill being tested is not production — it's direction, critique, and judgement. Here are 9 assessment patterns to use today.":
        "بعض أقوى التقييمات في عام 2026 <em>تتطلّب</em> الذكاء الاصطناعي. فالمهارة المختبَرة ليست الإنتاج — بل التوجيه والنقد والحكم. وإليك 9 أنماط تقييم يمكنك استخدامها اليوم.",
    "The patterns below are <strong class=\"text-slate-900\">not workarounds</strong>. They demand <em>more</em> critical thinking than the essays they replace — students must evaluate, refute, fact-check, and reason against a confident, articulate adversary on every task. Designed well, AI doesn't kill critical thinking. It puts students in a daily debate with one of the most persuasive arguers on the planet.":
        "الأنماط أدناه <strong class=\"text-slate-900\">ليست حلولًا التفافية</strong>. فهي تتطلّب تفكيرًا ناقدًا <em>أكثر</em> مما تتطلّبه المقالات التي تحلّ محلّها — إذ على الطلاب أن يقيّموا ويفنّدوا ويتحقّقوا من الحقائق ويحاجّوا خصمًا واثقًا فصيحًا في كل مهمة. وإذا أُحسن التصميم، فالذكاء الاصطناعي لا يقتل التفكير الناقد، بل يضع الطلاب في مناظرة يومية مع واحد من أكثر المحاجّين إقناعًا على وجه الأرض.",
    "Students submit a problem + their <em>best prompt</em> + the resulting AI output + a justification of why this prompt worked better than a naive one.":
        "يسلّم الطلاب مسألة + <em>أفضل مُوجَّه</em> لديهم + مخرجات الذكاء الاصطناعي الناتجة عنه + تبريرًا لسبب نجاح هذا المُوجَّه أكثر من مُوجَّه ساذج.",
    "Students use AI to produce a research brief, then must verify <strong class=\"text-slate-900\">every single citation</strong> against primary sources — flagging hallucinations with evidence.":
        "يستخدم الطلاب الذكاء الاصطناعي لإعداد ملخّص بحثي، ثم عليهم التحقّق من <strong class=\"text-slate-900\">كل مرجع دون استثناء</strong> بالرجوع إلى المصادر الأولية — مع الإشارة إلى الهلوسات بالدليل.",
    "Students submit their <em>full conversation</em> with the AI as the primary artefact — you grade the questions they asked, how they pushed back, and what they rejected.":
        "يسلّم الطلاب <em>المحادثة كاملةً</em> مع الذكاء الاصطناعي بوصفها الناتج الأساسي — وأنت تقدّر الأسئلة التي طرحوها، وكيف اعترضوا، وما الذي رفضوه.",
    "Students systematically probe an AI for failure modes — surfacing one verifiable <strong class=\"text-slate-900\">hallucination</strong>, one <strong class=\"text-slate-900\">bias</strong> (gender, cultural, geographic), and one <strong class=\"text-slate-900\">factual error</strong> in their subject area, with primary-source evidence for each. This is the work AI labs literally pay people to do.":
        "يفحص الطلاب نموذج ذكاء اصطناعي بصورة منهجية بحثًا عن مواطن إخفاقه — فيكشفون <strong class=\"text-slate-900\">هلوسة</strong> واحدة يمكن التحقّق منها، و<strong class=\"text-slate-900\">تحيّزًا</strong> واحدًا (جندريًا أو ثقافيًا أو جغرافيًا)، و<strong class=\"text-slate-900\">خطأً في الحقائق</strong> واحدًا في مادتهم، مع دليل من مصدر أولي لكلٍّ منها. وهذا بالضبط هو العمل الذي تدفع مختبرات الذكاء الاصطناعي أجرًا مقابل القيام به.",
    "Project the AI on the board. Give it the assignment <em>live</em>. Students annotate the streaming output in real time — flagging weak claims, missing evidence, biased framing, and great phrasing. Run it as a 10-minute timed sprint; the student who flags the most defensible issues wins.":
        "اعرض الذكاء الاصطناعي على السبّورة، وأعطه المهمة <em>مباشرةً</em> أمام الطلاب. يعلّق الطلاب على المخرجات لحظةً بلحظة أثناء ظهورها — مشيرين إلى الادّعاءات الضعيفة، والأدلة الناقصة، والتأطير المنحاز، والصياغات المتميّزة. نفّذ النشاط سباقًا موقوتًا مدته 10 دقائق، ويفوز الطالب الذي يرصد أكبر عدد من الملاحظات التي يمكن الدفاع عنها.",
    "If your task requires AI, you must provide <strong class=\"text-white\">equal access</strong>. Use school-licensed tools, provide shared accounts, or give in-class time. Never assume students have paid plans at home.":
        "إذا كانت مهمتك تتطلّب الذكاء الاصطناعي، فعليك أن توفّر <strong class=\"text-white\">وصولًا متكافئًا</strong>. استخدم أدوات مرخّصة من المدرسة، أو وفّر حسابات مشتركة، أو امنح وقتًا داخل الصف. ولا تفترض أبدًا أن لدى الطلاب اشتراكات مدفوعة في المنزل.",

    /* ---- Module 4 ---- */
    "Borrow from Italian universities, PhD defenses, and IB orals: the <em>viva voce</em> (Latin for \"living voice\") — a short interview where students <strong class=\"text-slate-900\">defend their work aloud</strong>. It's the single most effective anti-AI measure — and it turns weak work into a coaching moment.":
        "استعِر من الجامعات الإيطالية، ومناقشات رسائل الدكتوراه، والاختبارات الشفهية في البكالوريا الدولية: <em>المناقشة الشفهية</em> (<span class=\"ltr\">viva voce</span>، وتعني باللاتينية «الصوت الحي») — مقابلة قصيرة <strong class=\"text-slate-900\">يدافع فيها الطلاب عن عملهم بصوت مسموع</strong>. إنها أنجع إجراء على الإطلاق في مواجهة الاعتماد على الذكاء الاصطناعي — وهي تحوّل العمل الضعيف إلى فرصة للتوجيه.",
    "Even if AI wrote the essay, the student must <em>understand</em> it to defend it. A 60-second follow-up question separates learning from outsourcing.":
        "حتى لو كتب الذكاء الاصطناعي المقالة، فعلى الطالب أن <em>يفهمها</em> ليدافع عنها. وسؤال متابعة مدته 60 ثانية يفصل بين التعلّم الحقيقي وإسناد العمل إلى غيره.",
    "Treat the written submission as the <em>starter</em>. The viva makes the mark. Students who can't defend their work, don't own their work.":
        "تعامل مع العمل المكتوب على أنه <em>نقطة البداية</em>، فالمناقشة الشفهية هي التي تحدّد الدرجة. والطالب الذي لا يستطيع الدفاع عن عمله لا يملك عمله.",
    "Don't try to viva every student on every task. Viva <strong class=\"text-purple-700\">one in three</strong>, randomly chosen after submissions are in. The <em>possibility</em> of being called changes the behaviour of the whole class.":
        "لا تحاول مناقشة كل طالب في كل مهمة. ناقِش <strong class=\"text-purple-700\">طالبًا من كل ثلاثة</strong>، يُختارون عشوائيًا بعد اكتمال التسليم. فمجرد <em>احتمال</em> أن يُستدعى الطالب يغيّر سلوك الصف كله.",

    /* ---- Module 5 ---- */
    "Every time a student uses AI, they should do two things: <strong class=\"text-slate-900\">cite it</strong> (like a source) and <strong class=\"text-slate-900\">reflect on it</strong> (like a co-author). Reflections themselves must be AI-proofed — otherwise students will just ask the AI to write the reflection.":
        "في كل مرة يستخدم فيها الطالب الذكاء الاصطناعي، عليه أن يفعل أمرين: أن <strong class=\"text-slate-900\">يوثّقه</strong> (كما يوثّق أي مصدر) وأن <strong class=\"text-slate-900\">يتأمّل فيه</strong> (كما يتأمّل في عمل شريك في التأليف). ويجب تحصين التأمّلات نفسها من الذكاء الاصطناعي — وإلا فسيطلب الطلاب ببساطة من الذكاء الاصطناعي أن يكتب التأمّل.",
    "In-text: (OpenAI, 2026). Include the prompt in an appendix.":
        "داخل النص: <span class=\"ltr\">(OpenAI, 2026)</span>. وأدرج المُوجَّه في ملحق.",
    "Take the first 10 minutes of the lesson <em>after</em> the submission is due. Students handwrite the reflection on an index card. No devices.":
        "خصّص أول 10 دقائق من الحصة التي تأتي <em>بعد</em> موعد التسليم. يكتب الطلاب التأمّل بخط اليد على بطاقة، دون أي أجهزة.",
    "Students interview each other for 3 minutes using the four prompts, then write <em>each other's</em> reflection. Surfaces understanding, not just output.":
        "يجري الطلاب مقابلات مع بعضهم لمدة 3 دقائق باستخدام الأسئلة الأربعة، ثم يكتب كلٌّ منهم تأمّل <em>زميله</em>. وهذا يُظهر الفهم، لا المخرجات وحدها.",

    /* ---- Module 6 ---- */
    "A Grade 11 teacher assigns a 1,000-word essay on <em>The Great Gatsby</em> due in one week. They want students to use AI for brainstorming only. Which move most directly protects the integrity of the final grade?":
        "يكلّف معلّم في الصف 11 طلابه بمقالة من 1000 كلمة عن رواية <em>غاتسبي العظيم</em> تُسلَّم خلال أسبوع، ويريد أن يستخدم الطلاب الذكاء الاصطناعي في العصف الذهني فقط. أيّ الخطوات تحمي نزاهة الدرجة النهائية على نحو أكثر مباشرة؟",
    "A student's essay sounds suspiciously polished. GPTZero reports \"98% likely AI\". What is the <em>best</em> next step?":
        "تبدو مقالة أحد الطلاب مصقولة على نحو يثير الريبة، وتُفيد أداة <span class=\"ltr\">GPTZero</span> بأنها «مكتوبة بالذكاء الاصطناعي على الأرجح بنسبة 98%». ما <em>أفضل</em> خطوة تالية؟",

    /* ---- Module 7 ---- */
    "Declare AI level (1-5) and traffic-light colour <em>on every task</em>.":
        "أعلن مستوى الذكاء الاصطناعي (1–5) ولون إشارة المرور <em>في كل مهمة</em>.",

    /* ---- Footer ---- */
    "Based on AIAS (Perkins, Furze, Roe &amp; MacVaugh, 2024) and AISA AI Policy":
        "مستند إلى مقياس <span class=\"ltr\">AIAS (Perkins, Furze, Roe &amp; MacVaugh, 2024)</span> وسياسة الذكاء الاصطناعي في AISA"
};

/* Stamp data-ar onto the elements AR_BLOCKS names, keyed by their
 * normalised English innerHTML. Runs before onboarding-i18n.js's own
 * DOMContentLoaded handler because this file is loaded first, so the
 * attributes exist by the time the engine first applies a language.
 * Same bootstrap as ai-curriculum-readiness-ar.js, with headings added
 * to the selector: one card title here carries an <em>. */
(function () {
    'use strict';
    function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
    function stamp() {
        var map = window.AR_BLOCKS || {};
        var index = {};
        Object.keys(map).forEach(function (k) { index[norm(k)] = map[k]; });
        Array.prototype.forEach.call(
            document.querySelectorAll('p, li, td, th, div, label, span, h1, h2, h3, h4, h5'),
            function (el) {
                if (el.hasAttribute('data-ar')) return;
                var ar = index[norm(el.innerHTML)];
                if (ar) { el.setAttribute('data-ar', ar); delete index[norm(el.innerHTML)]; }
            }
        );
        var missed = Object.keys(index).length;
        if (missed && window.console) {
            /* Loud on purpose: a block that stops matching after an edit
             * to the English would otherwise silently stay English while
             * everything around it turns Arabic. */
            console.warn('AR_BLOCKS: ' + missed + ' translation(s) matched nothing in the DOM —',
                         Object.keys(index));
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', stamp);
    } else {
        stamp();
    }
})();
