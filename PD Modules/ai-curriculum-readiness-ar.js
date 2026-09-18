/* =========================================================================
   AI Literacy Curriculum: Teacher Readiness
   English ↔ Arabic dictionary. Consumed by onboarding-i18n.js.

   Two halves, because the engine matches one text node at a time:

   AR_DICT   — whole text nodes. Keys are whitespace-normalised; the
               engine falls back to a normalised lookup, so a key can be
               written on one line even where the HTML wraps it.

   AR_BLOCKS — sentences broken up by inline <strong>/<em>/<a>, where
               translating a third of a sentence at a time would wreck
               Arabic word order. Keyed by the element's normalised
               English innerHTML; the bootstrap at the bottom stamps the
               Arabic onto matching elements as data-ar, and the engine
               swaps the whole block.

   CONVENTIONS
   - People's names, email addresses and product names stay in Latin
     script, matching safeguarding-ar.js. Latin runs inside Arabic
     sentences are wrapped in .ltr so punctuation doesn't jump ends.
   - "ADEK" is rendered as دائرة التعليم والمعرفة in prose.

   ⚠ FRAMEWORK TERMINOLOGY IS NOT OFFICIAL
   The phase names, strand names and proficiency tiers below are faithful
   translations, NOT ADEK's published Arabic. ADEK issues this curriculum
   in Arabic too; before this module is released to Arabic-reading staff,
   check these against ADEK's own Arabic naming and replace any that
   differ. A teacher who sees different strand names here than in the
   curriculum will reasonably assume one of them is wrong.
   ========================================================================= */
window.AR_DICT = {
    "Internal cascade training":
        "تدريب داخلي تعاقبي",
    "AI Literacy Curriculum: Teacher Readiness":
        "منهج الثقافة في الذكاء الاصطناعي: جاهزية المعلّم",
    "Complete by 20 September 2026":
        "يُستكمل بحلول 20 سبتمبر 2026",
    "Teaching begins week of 21 September":
        "يبدأ التدريس في أسبوع 21 سبتمبر",
    "In person, 21 September":
        "حضوريًا، 21 سبتمبر",
    "Admin preview":
        "معاينة للمسؤولين",
    "Not yet released to staff.":
        "لم تُطرح للموظفين بعد.",
    "Your answers are not being saved.":
        "لا يتم حفظ إجاباتك.",
    "Chapters":
        "الفصول",
    "Progress":
        "التقدّم",
    "Previous":
        "السابق",
    "Next chapter":
        "الفصل التالي",
    "Chapter 1 of 7":
        "الفصل 1 من 7",
    "Why you, why now":
        "لماذا أنت، ولماذا الآن",
    "What you're actually teaching":
        "ما الذي ستُدرّسه فعليًا",
    "Who is doing the thinking?":
        "مَن الذي يقوم بالتفكير؟",
    "Your first lesson":
        "درسك الأوّل",
    "What good work looks like":
        "كيف يبدو العمل الجيّد",
    "Responsible AI and the AISA route":
        "الذكاء الاصطناعي المسؤول ومسار AISA",
    "Commit":
        "الالتزام",
    "Segment 1 · 4 minutes":
        "الجزء 1 · 4 دقائق",
    "Segment 2 · 7 minutes":
        "الجزء 2 · 7 دقائق",
    "Segment 3 · 14 minutes":
        "الجزء 3 · 14 دقيقة",
    "Segment 4 · 13 minutes":
        "الجزء 4 · 13 دقيقة",
    "Segment 5 · 8 minutes":
        "الجزء 5 · 8 دقائق",
    "Segment 6 · 10 minutes":
        "الجزء 6 · 10 دقائق",
    "Segment 7 · 4 minutes":
        "الجزء 7 · 4 دقائق",
    "A student hands in a paragraph that is better than anything they have written all year. In class, they cannot explain a single sentence of it. It has happened several times now.":
        "يُسلّم طالب فقرة أفضل من أي شيء كتبه طوال العام. وفي الصف، لا يستطيع شرح جملة واحدة منها. وقد تكرّر ذلك عدة مرات.",
    "That is not a discipline problem, and it is not going away. It is the problem this curriculum exists to solve, and it is already in your room.":
        "هذه ليست مشكلة انضباط، ولن تختفي من تلقاء نفسها. إنها المشكلة التي وُجد هذا المنهج لحلّها، وهي موجودة في صفّك بالفعل.",
    "That scenario is ADEK's own — \"The Perfect Homework\", from the Train-the-Trainer safeguarding lab.":
        "هذا السيناريو من إعداد دائرة التعليم والمعرفة نفسها — «الواجب المثالي»، من مختبر حماية الطفل في برنامج تدريب المدربين.",
    "The plain facts":
        "الحقائق بوضوح",
    "Why this module is shaped the way it is":
        "لماذا صُمّمت هذه الوحدة بهذا الشكل",
    "Sixty minutes, one sitting. By the end you will have a written delivery plan for your first AI Literacy lesson, and we will both know what you still need before you teach it.":
        "ستون دقيقة، في جلسة واحدة. وبنهايتها ستكون لديك خطة تنفيذ مكتوبة لدرسك الأول في الثقافة بالذكاء الاصطناعي، وسنعرف كلانا ما الذي ما زلت تحتاجه قبل أن تُدرّسه.",
    "Video to follow.":
        "الفيديو سيُضاف لاحقًا.",
    "The four phases":
        "المراحل الأربع",
    "The four strands":
        "المحاور الأربعة",
    "Phase":
        "المرحلة",
    "Grades":
        "الصفوف",
    "Learner profile":
        "ملف المتعلّم",
    "Pedagogical signature":
        "البصمة التربوية",
    "1 / KG":
        "1 / رياض الأطفال",
    "2 / Cycle 1":
        "2 / الحلقة الأولى",
    "3 / Cycle 2":
        "3 / الحلقة الثانية",
    "4 / Cycle 3":
        "4 / الحلقة الثالثة",
    "AI Aware Explorer":
        "المستكشف المدرك للذكاء الاصطناعي",
    "AI Literate Thinker":
        "المفكّر المتمكّن من الذكاء الاصطناعي",
    "AI Solution Builder":
        "باني حلول الذكاء الاصطناعي",
    "AI Systems & Solutions Designer":
        "مصمّم أنظمة وحلول الذكاء الاصطناعي",
    "AI Conceptual Understanding":
        "الفهم المفاهيمي للذكاء الاصطناعي",
    "Critical Evaluation and Informed Interaction":
        "التقييم الناقد والتفاعل الواعي",
    "AI Creation, Engineering and System Design":
        "الإبداع والهندسة وتصميم الأنظمة بالذكاء الاصطناعي",
    "Responsible Governance, Data Privacy and Societal Impact":
        "الحوكمة المسؤولة وخصوصية البيانات والأثر المجتمعي",
    "Time allocation":
        "الحصص المخصّصة",
    "Place three outcomes":
        "حدّد موضع ثلاثة نواتج",
    "Not an exam on the architecture — the point is that you can place your own lessons. Pick the strand each outcome belongs to.":
        "ليس اختبارًا في البنية — المقصود أن تكون قادرًا على تحديد موضع دروسك أنت. اختر المحور الذي ينتمي إليه كل ناتج.",
    "Phase 1 — AI Aware Explorer (KG1–KG2)":
        "المرحلة 1 — المستكشف المدرك للذكاء الاصطناعي (روضة 1–روضة 2)",
    "Phase 2 — AI Literate Thinker (Grades 1–5)":
        "المرحلة 2 — المفكّر المتمكّن من الذكاء الاصطناعي (الصفوف 1–5)",
    "Phase 3 — AI Solution Builder (Grades 6–8)":
        "المرحلة 3 — باني حلول الذكاء الاصطناعي (الصفوف 6–8)",
    "Phase 4 — AI Systems & Solutions Designer (Grades 9–12)":
        "المرحلة 4 — مصمّم أنظمة وحلول الذكاء الاصطناعي (الصفوف 9–12)",
    "This is the one idea that most changes what happens in your room. Everything else in the module is arrangement; this is the substance.":
        "هذه هي الفكرة الأكثر تأثيرًا في ما يحدث داخل صفّك. وكل ما عداها في هذه الوحدة تنظيم؛ أما هذه فهي الجوهر.",
    "Two words that are not the same thing":
        "مصطلحان ليسا الشيء نفسه",
    "The five facilitation moves":
        "حركات التيسير الخمس",
    "Prompt":
        "التوجيه",
    "Inquiry":
        "الاستقصاء",
    "Critique & evaluate":
        "النقد والتقييم",
    "Practice":
        "التطبيق",
    "Reflect":
        "التأمّل",
    "Frame a task that leaves thinking to do.":
        "صُغ مهمة تُبقي هناك تفكيرًا يُنجَز.",
    "Identify claims, questions and evidence needs.":
        "حدّد الادّعاءات والأسئلة وما يلزم من أدلة.",
    "Check, classify, compare and justify.":
        "تحقّق وصنّف وقارن وبرّر.",
    "Repeat the skill with less support.":
        "كرّر المهارة بدعم أقل.",
    "Explain the learning and transfer it.":
        "اشرح ما تعلّمته وانقله إلى سياق جديد.",
    "The five moves are a repertoire, not a formula. They mark five moments where a teacher can either protect or take over a learner's thinking.":
        "الحركات الخمس ذخيرة تربوية لا وصفة جامدة. وهي تُحدّد خمس لحظات يستطيع فيها المعلّم إما أن يحمي تفكير المتعلّم أو أن يستولي عليه.",
    "Ms Hana's lesson":
        "درس الأستاذة هناء",
    "The source text given to learners":
        "النص المصدر الذي أُعطي للمتعلمين",
    "The faulty AI summary":
        "الملخّص المعيب الذي أنتجه الذكاء الاصطناعي",
    "Use these to judge each option":
        "استخدم هذه المعايير للحكم على كل خيار",
    "The AI response must not finish the task.":
        "يجب ألا تُنجز استجابة الذكاء الاصطناعي المهمة نيابةً عن المتعلّم.",
    "Learners must select, check, compare, justify or revise.":
        "على المتعلمين أن يختاروا ويتحقّقوا ويقارنوا ويبرّروا أو يُنقّحوا.",
    "Teacher questions should probe rather than reveal.":
        "ينبغي لأسئلة المعلّم أن تستقصي لا أن تكشف الإجابة.",
    "Practice fades support; reflection transfers the method.":
        "التطبيق يقلّل الدعم تدريجيًا؛ والتأمّل ينقل الطريقة إلى سياقات أخرى.",
    "Choose the strongest move at each moment":
        "اختر الحركة الأقوى في كل لحظة",
    "Practice summary — same source text":
        "ملخّص للتطبيق — النص المصدر نفسه",
    "Now repair one":
        "الآن أصلِح واحدة",
    "During a fictional two-week Grade 7 trial, students kept phones away during lunch. Of 84 students who answered a follow-up survey, 56 said they talked with classmates more, 18 noticed no difference and 10 felt less comfortable. Board-game borrowing rose from 40 in the previous two weeks to 73 during the trial. The school did not measure learning or academic results. The student council recommended a longer trial before any permanent decision and requested a quiet-space option.":
        "خلال تجربة افتراضية استمرت أسبوعين في الصف السابع، أبعد الطلاب هواتفهم أثناء استراحة الغداء. ومن أصل 84 طالبًا أجابوا عن استبيان لاحق، قال 56 إنهم تحدثوا مع زملائهم أكثر، ولم يلحظ 18 أي فرق، وشعر 10 بارتياح أقل. وارتفعت استعارة ألعاب الطاولة من 40 في الأسبوعين السابقين إلى 73 خلال التجربة. ولم تَقِس المدرسة التعلّم ولا النتائج الأكاديمية. وأوصى مجلس الطلبة بتجربة أطول قبل اتخاذ أي قرار دائم، وطلب توفير خيار مساحة هادئة.",
    "\"The phone-free lunch was preferred by nearly every Grade 7 student. It doubled social interaction and improved academic learning. No students were negatively affected, so the school should immediately make the phone ban permanent.\"":
        "«فضّل استراحةَ الغداء الخالية من الهواتف كلُّ طلاب الصف السابع تقريبًا. وقد ضاعفت التفاعل الاجتماعي وحسّنت التعلّم الأكاديمي. ولم يتأثر أي طالب سلبًا، لذا ينبغي للمدرسة أن تجعل حظر الهواتف دائمًا على الفور.»",
    "\"Two-thirds of surveyed students talked more during the trial, and board-game borrowing increased. These results prove phone-free lunches improve every student's wellbeing, so a permanent ban is the only reasonable option.\"":
        "«تحدّث ثلثا الطلاب المشمولين بالاستبيان أكثر خلال التجربة، وازدادت استعارة ألعاب الطاولة. وتُثبت هذه النتائج أن استراحات الغداء الخالية من الهواتف تُحسّن رفاه كل طالب، لذا فإن الحظر الدائم هو الخيار المعقول الوحيد.»",
    "\"This AI summary is wrong. Find the five mistakes I noticed.\"":
        "«هذا الملخّص خاطئ. جِدوا الأخطاء الخمسة التي لاحظتُها.»",
    "\"How faithfully does this summary represent the source? Mark one claim you currently trust and one you would check. Do not decide overall yet.\"":
        "«إلى أي مدى يُمثّل هذا الملخّص النصَّ المصدر بأمانة؟ ضع علامة على ادّعاء تثق به الآن وآخر تودّ التحقق منه. ولا تُصدر حكمًا عامًا بعد.»",
    "\"Ask an AI tool to rewrite the summary more accurately.\"":
        "«اطلبوا من أداة ذكاء اصطناعي إعادة كتابة الملخّص بدقة أكبر.»",
    "Ms Hana underlines four claims and writes the matching source evidence beside each one.":
        "تضع الأستاذة هناء خطًا تحت أربعة ادّعاءات وتكتب الدليل المقابل من النص المصدر بجانب كل منها.",
    "\"Which version sounds more professional? Vote for the one you prefer.\"":
        "«أي نسخة تبدو أكثر احترافية؟ صوّتوا للنسخة التي تفضّلونها.»",
    "\"Choose the claim that would matter most if it were wrong. Turn it into a checking question and name the evidence you need.\"":
        "«اختاروا الادّعاء الذي سيكون الأهم لو كان خاطئًا. حوّلوه إلى سؤال تحقّق، وسمّوا الدليل الذي تحتاجونه.»",
    "Classify each claim as supported, misleading or not established; cite an exact sentence or number, justify the decision and revise one claim.":
        "صنّفوا كل ادّعاء بأنه مدعوم أو مضلّل أو غير ثابت؛ واستشهدوا بجملة أو رقم بعينه، وبرّروا القرار، ونقّحوا ادّعاءً واحدًا.",
    "Ms Hana reveals a colour-coded answer slide and learners copy the correct classifications.":
        "تعرض الأستاذة هناء شريحة إجابات ملوّنة، وينسخ المتعلمون التصنيفات الصحيحة.",
    "Learners vote by show of hands on whether the whole summary is accurate.":
        "يصوّت المتعلمون برفع الأيدي على ما إذا كان الملخّص كله دقيقًا.",
    "Give the same checklist, matched evidence, colour labels and sentence stems used in the first task.":
        "تقديم قائمة التحقق نفسها والأدلة المطابقة والرموز اللونية وبدايات الجمل المستخدمة في المهمة الأولى.",
    "Ask the chatbot to correct its own summary, then discuss whether the new version sounds better.":
        "الطلب من روبوت المحادثة تصحيح ملخّصه، ثم مناقشة ما إذا كانت النسخة الجديدة تبدو أفضل.",
    "Individually select the most consequential weakness, cite evidence, justify a classification and revise it — without category prompts or a teacher-selected claim.":
        "أن يختار كل متعلّم بمفرده أكثر نقاط الضعف أثرًا، ويستشهد بالدليل، ويبرّر التصنيف، ويُنقّحه — من دون تلميحات بالفئات ومن دون ادّعاء يختاره المعلّم.",
    "\"Write definitions for supported, misleading and not established.\"":
        "«اكتبوا تعريفات لـ: مدعوم، ومضلّل، وغير ثابت.»",
    "\"The next time an AI summary sounds confident, what will you check first, and why?\"":
        "«في المرة القادمة التي يبدو فيها ملخّص الذكاء الاصطناعي واثقًا، ما أول ما ستتحقّقون منه، ولماذا؟»",
    "\"Did you enjoy evaluating the AI summary?\"":
        "«هل استمتعتم بتقييم ملخّص الذكاء الاصطناعي؟»",
    "The teacher frames and probes; learners select, check, justify and revise.":
        "المعلّم يصوغ ويستقصي؛ والمتعلمون يختارون ويتحقّقون ويبرّرون ويُنقّحون.",
    "Finding your lesson":
        "الوصول إلى درسك",
    "Your six-line delivery plan":
        "خطة التنفيذ المكوّنة من ستة أسطر",
    "This is the thing that will be on your desk when the lesson starts.":
        "هذه هي الورقة التي ستكون على مكتبك عند بدء الدرس.",
    "Find your grade, then your unit.":
        "ابحث عن صفّك، ثم عن وحدتك.",
    "Open your first lesson for the week of 21 September.":
        "افتح درسك الأوّل لأسبوع 21 سبتمبر.",
    "Read the lesson template through once — note what each section is for.":
        "اقرأ قالب الدرس كاملًا مرة واحدة — ولاحظ الغرض من كل قسم.",
    "Locate the student-facing materials before the lesson, not during it.":
        "حدّد مكان المواد الموجّهة للطلاب قبل الدرس لا أثناءه.",
    "1 · The outcome this lesson is heading for":
        "1 · الناتج الذي يسعى إليه هذا الدرس",
    "2 · The hook — what you open with":
        "2 · المدخل التشويقي — بماذا تبدأ",
    "4 · What students will produce that shows their thinking":
        "4 · ما سيُنتجه الطلاب ويُظهر تفكيرهم",
    "I could not get into InstrucTwin, so this plan is incomplete.":
        "لم أتمكّن من الدخول إلى InstrucTwin، لذا فإن هذه الخطة غير مكتملة.",
    "Three things student work has to do":
        "ثلاثة أمور يجب أن يحقّقها عمل الطالب",
    "Outcome":
        "الناتج",
    "Two pieces of work":
        "عملان",
    "Sample A":
        "العيّنة أ",
    "Sample B":
        "العيّنة ب",
    "Both samples below are invented for this module — they are illustrations, not real student work.":
        "العيّنتان أدناه مُختلقتان لأغراض هذه الوحدة — فهما توضيحيتان وليستا عملًا حقيقيًا لطالب.",
    "A polished AI output is not proof of learning. Assess the thinking behind it.":
        "المخرَج المصقول من الذكاء الاصطناعي ليس دليلًا على التعلّم. قيّم التفكير الذي وراءه.",
    "Which shows more learning — and what is your evidence?":
        "أيّهما يُظهر تعلّمًا أكبر — وما دليلك؟",
    "Name the one question you would ask the author of Sample A to find out what they actually understand.":
        "حدّد السؤال الواحد الذي ستطرحه على كاتب العيّنة أ لتعرف ما يفهمه فعلًا.",
    "\"The phone-free lunch trial demonstrates a significant positive correlation between device restriction and peer socialisation. The data indicates a marked increase in collaborative engagement, with board-game circulation rising substantially. These findings suggest that a permanent policy would yield sustained benefits for student wellbeing and community cohesion.\"":
        "«تُظهر تجربة الغداء الخالي من الهواتف ارتباطًا إيجابيًا دالًّا بين تقييد الأجهزة والتواصل الاجتماعي بين الأقران. وتشير البيانات إلى زيادة ملحوظة في المشاركة التعاونية، مع ارتفاع كبير في تداول ألعاب الطاولة. وتوحي هذه النتائج بأن سياسة دائمة ستحقّق فوائد مستدامة لرفاه الطلاب وتماسك المجتمع المدرسي.»",
    "\"56 out of 84 said they talked more. That's most but not all — 10 felt worse and the summary didn't say that. I checked the board game number (40 → 73) and that one is in the source. But 'improved academic learning' is not, because it says they didn't measure learning. So I'd call that one not established. I'd want a longer trial too, like the council said.\"":
        "«قال 56 من أصل 84 إنهم تحدثوا أكثر. هذه أغلبية لكنها ليست الجميع — 10 شعروا بأسوأ، والملخّص لم يذكر ذلك. تحقّقتُ من رقم ألعاب الطاولة (40 ← 73) وهذا موجود في النص المصدر. أما «تحسّن التعلّم الأكاديمي» فغير موجود، لأن النص يقول إنهم لم يقيسوا التعلّم. لذا سأعتبر هذا الادّعاء غير ثابت. وأودّ أيضًا تجربة أطول، كما قال المجلس.»",
    "This is the highest-stakes part of the module. ADEK's responsible-use framework is its own thing — it is not a restatement of AISA's AI Vision and Ethical Framework, and you need both.":
        "هذا هو الجزء الأعلى مخاطرةً في الوحدة. فإطار الاستخدام المسؤول الصادر عن دائرة التعليم والمعرفة كيان قائم بذاته — وليس إعادة صياغة لإطار AISA لرؤية الذكاء الاصطناعي وأخلاقياته، وأنت بحاجة إلى كليهما.",
    "The five principles, and what each looks like in a classroom":
        "المبادئ الخمسة، وكيف يبدو كل منها داخل الصف",
    "Responsible use — the five principles":
        "الاستخدام المسؤول — المبادئ الخمسة",
    "Principle":
        "المبدأ",
    "In practice":
        "في التطبيق",
    "Human oversight":
        "الإشراف البشري",
    "Data privacy":
        "خصوصية البيانات",
    "Wellbeing and safeguarding":
        "الرفاه وحماية الطفل",
    "Honesty and integrity":
        "الأمانة والنزاهة",
    "Fairness":
        "العدالة",
    "AI assists; people decide and stay accountable.":
        "الذكاء الاصطناعي يساعد؛ والبشر يقرّرون ويتحمّلون المسؤولية.",
    "Never put personal or sensitive data into a prompt.":
        "لا تُدخل أبدًا بيانات شخصية أو حساسة في أي مُوجَّه.",
    "Protect students from harmful or age-inappropriate content.":
        "احمِ الطلاب من المحتوى الضار أو غير المناسب لأعمارهم.",
    "Cite sources, no invented facts, and no passing AI work off as your own.":
        "استشهد بالمصادر، ولا تختلق حقائق، ولا تنسب عمل الذكاء الاصطناعي إلى نفسك.",
    "Check outputs for bias and unfair assumptions.":
        "افحص المخرجات بحثًا عن التحيّز والافتراضات غير العادلة.",
    "The five everyday risks":
        "المخاطر اليومية الخمسة",
    "Risk":
        "الخطر",
    "What it looks like":
        "كيف يبدو",
    "Over-reliance":
        "الإفراط في الاعتماد",
    "Misinformation":
        "المعلومات المضلّلة",
    "Bias":
        "التحيّز",
    "Privacy":
        "الخصوصية",
    "Wellbeing":
        "الرفاه",
    "Critical thinking fades.":
        "يضمر التفكير الناقد.",
    "Invented facts and no sources.":
        "حقائق مختلقة وبلا مصادر.",
    "Unfair or skewed outputs.":
        "مخرجات غير عادلة أو منحازة.",
    "Personal data exposed in prompts.":
        "بيانات شخصية مكشوفة داخل المُوجَّهات.",
    "Harmful or age-inappropriate content.":
        "محتوى ضار أو غير مناسب للعمر.",
    "Notice → Record → Report → Act → Review.":
        "لاحِظ ← سجّل ← أبلِغ ← تصرّف ← راجِع.",
    "The AISA route":
        "مسار AISA",
    "Elementary":
        "المرحلة الابتدائية",
    "Secondary":
        "المرحلة الثانوية",
    "Counsellors: Laylin Chong · Sara AlBeainy":
        "المرشدون الطلابيون: Laylin Chong · Sara AlBeainy",
    "Counsellors: Naiema Zaki (HS) · Jenn Guss (HS) · Joel Hunter (MS)":
        "المرشدون الطلابيون: Naiema Zaki (ثانوي) · Jenn Guss (ثانوي) · Joel Hunter (متوسط)",
    "The first ten minutes — a worked example":
        "الدقائق العشر الأولى — مثال محلول",
    "During an approved classroom activity, an AI tool unexpectedly generates disturbing or age-inappropriate content. A student is visibly upset and shows you the response.":
        "أثناء نشاط صفّي معتمد، تُنتج أداة ذكاء اصطناعي على نحو غير متوقع محتوى مزعجًا أو غير مناسب للعمر. ويبدو على أحد الطلاب انزعاج واضح، ويعرض عليك الاستجابة.",
    "An AI-related concern is a safeguarding concern. It goes down the same route as any other — to your Safeguarding Lead, not to the IT team and not to the tool's support desk.":
        "أي مخاوف تتعلق بالذكاء الاصطناعي هي مخاوف تتعلق بحماية الطفل. وتسلك المسار نفسه الذي تسلكه أي مخاوف أخرى — إلى مسؤول حماية الطفل لديك، لا إلى فريق تقنية المعلومات ولا إلى دعم الأداة.",
    "Acknowledgement":
        "الإقرار",
    "I have read the responsible-use principles, the five risks and the escalation route above.":
        "لقد قرأتُ مبادئ الاستخدام المسؤول، والمخاطر الخمسة، ومسار التصعيد الوارد أعلاه.",
    "This records that you have read it, with a timestamp. It is not a test of understanding — that is confirmed face to face on 21 September, with two live scenarios.":
        "يسجّل هذا أنك قرأته، مع ختم زمني. وليس اختبارًا للفهم — فذلك يُتحقّق منه حضوريًا في 21 سبتمبر عبر سيناريوهين مباشرين.",
    "The one thing I will do in my first lesson that I would not have done before this module":
        "الشيء الواحد الذي سأفعله في درسي الأول ولم أكن لأفعله قبل هذه الوحدة",
    "The one question I'm bringing to 21 September":
        "السؤال الواحد الذي سأحمله معي إلى 21 سبتمبر",
    "Finish and record my completion":
        "إنهاء وتسجيل إكمالي",
    "Done — and on the record.":
        "تمّ — ومُسجَّل رسميًا.",
    "Your completion is logged against the ADEK internal-training requirement, and your delivery plan is saved. I will read every line 5 and line 6 before we meet.":
        "سُجّل إكمالك ضمن متطلب التدريب الداخلي لدائرة التعليم والمعرفة، وحُفظت خطة التنفيذ الخاصة بك. وسأقرأ كل سطر 5 وسطر 6 قبل أن نلتقي.",
    "We meet on 21 September.":
        "نلتقي في 21 سبتمبر.",
    "Time and room to be confirmed.":
        "سيُؤكَّد الوقت والقاعة لاحقًا.",
    "Print my one-pager":
        "اطبع ورقتي المرجعية",
    "AI Literacy — my first lesson":
        "الثقافة في الذكاء الاصطناعي — درسي الأول",
    "My delivery plan":
        "خطة التنفيذ الخاصة بي",
    "Hook":
        "المدخل التشويقي",
    "Facilitation moves":
        "حركات التيسير",
    "Evidence of thinking":
        "الدليل على التفكير",
    "Least sure about":
        "أقل ما أنا واثق منه",
    "If something goes wrong":
        "إذا حدث خطأ ما",
    "AISA escalation route":
        "مسار التصعيد في AISA",
    "To be confirmed — follow the AISA Safeguarding module until this is issued.":
        "سيُؤكَّد لاحقًا — اتّبع وحدة حماية الطفل في AISA إلى حين صدوره.",    "This module is the sixty minutes that gets you to your first lesson.":
        "هذه الوحدة هي الستون دقيقة التي توصلك إلى درسك الأول.",
    "Hook, model, practice, commit. That is the shape of a good AI lesson, and it is the shape of the next fifty-six minutes. The format is part of the message.":
        "مدخل تشويقي، ثم نمذجة، ثم تطبيق، ثم التزام. هذا هو شكل الدرس الجيّد في الذكاء الاصطناعي، وهو شكل الدقائق الست والخمسين القادمة. فالصيغة نفسها جزء من الرسالة.",
    "Yes.":
        "نعم.",
    "Checking, classifying, comparing and justifying against evidence is the heart of strand 2.":
        "التحقّق والتصنيف والمقارنة والتبرير استنادًا إلى الدليل هو جوهر المحور الثاني.",
    "This is the KG1 ethics focus — strand 4 starts on day one, it is not bolted on at the top of the school.":
        "هذا هو محور الأخلاقيات في الروضة الأولى — فالمحور الرابع يبدأ من اليوم الأول، وليس إضافةً تُلحق في نهاية المرحلة الدراسية.",
    "Human senses versus machine inputs, unplugged, is the Phase 1 core milestone.":
        "المقارنة بين الحواس البشرية ومدخلات الآلة، بلا أجهزة، هي المحطة الأساسية في المرحلة الأولى.",
    "It leaves the judgement open and gives learners something to do. Announcing that it is wrong hands them the answer; asking AI to rewrite it removes the task altogether.":
        "إنه يُبقي الحكم مفتوحًا ويمنح المتعلمين عملًا يؤدونه. أما الإعلان بأنه خاطئ فيمنحهم الإجابة جاهزة؛ وطلب إعادة الكتابة من الذكاء الاصطناعي يُلغي المهمة برمّتها.",
    "Learners select the claim and name the evidence. Doing the underlining for them is the trap — it looks like modelling and is actually substitution.":
        "المتعلمون هم من يختارون الادّعاء ويسمّون الدليل. أما وضع الخطوط نيابةً عنهم فهو الفخ — يبدو نمذجةً وهو في حقيقته إحلال محلّهم.",
    "Classify, cite, justify, revise — four verbs, all of them the learner's. A vote produces an opinion with no evidence behind it.":
        "صنّف، واستشهد، وبرّر، ونقّح — أربعة أفعال، كلها من نصيب المتعلّم. أما التصويت فيُنتج رأيًا بلا دليل خلفه.",
    "Practice means less scaffolding, not the same scaffolding again. Repeating the full support structure tests recall, not transfer.":
        "التطبيق يعني تقليل الدعم، لا تكرار الدعم نفسه. فإعادة بنية الدعم كاملةً تختبر الاستدعاء لا النقل إلى سياق جديد.",
    "Reflection has to point forwards to be transfer. Definitions test vocabulary; enjoyment tells you nothing about the learning.":
        "على التأمّل أن يتّجه إلى الأمام ليكون نقلًا إلى سياق جديد. فالتعريفات تختبر المفردات؛ والاستمتاع لا يخبرك بشيء عن التعلّم.",
    "Which grade are you teaching?":
        "أي صف تُدرّس؟",
    "Choose your grade…":
        "اختر صفّك…",
    "This is the thing that will be on your desk when the lesson starts. Write it against the focus above — it is what your grade's lesson is actually for.":
        "هذه هي الورقة التي ستكون على مكتبك عند بدء الدرس. اكتبها في ضوء المحاور أعلاه — فهي ما يهدف إليه درس صفّك فعلًا.",
    "Then: the lesson itself on InstrucTwin":
        "ثم: الدرس نفسه على InstrucTwin",
    "When you have access":
        "عندما يتوفّر لك الدخول",
    "I could not get into InstrucTwin.":
        "لم أتمكّن من الدخول إلى InstrucTwin.",
    "This grade is learning":
        "ما يتعلّمه هذا الصف",
    "KG1":
        "روضة 1",
    "KG2":
        "روضة 2",
    "Grade 1":
        "الصف 1",
    "Grade 2":
        "الصف 2",
    "Grade 3":
        "الصف 3",
    "Grade 4":
        "الصف 4",
    "Grade 5":
        "الصف 5",
    "Grade 6":
        "الصف 6",
    "Grade 7":
        "الصف 7",
    "Grade 8":
        "الصف 8",
    "Grade 9":
        "الصف 9",
    "Grade 10":
        "الصف 10",
    "Grade 11":
        "الصف 11",
    "Grade 12":
        "الصف 12",
    "optional":
        "اختياري",
    "Not quite finished.":
        "لم تكتمل بعد.",
    "These still need an answer before your completion can be recorded:":
        "ما زالت هذه تحتاج إلى إجابة قبل أن يُسجَّل إكمالك:",
    "One answer still to fill in":
        "ما زالت إجابة واحدة بحاجة إلى تعبئة",
    "Fill in the required answers to continue":
        "أكمل الإجابات المطلوبة للمتابعة",
    "Scope & Sequence":
        "نطاق المحتوى وتسلسله",
    "The whole map, grade by grade":
        "الخريطة كاملة، صفًا بصف",
    "Open the Scope & Sequence":
        "افتح نطاق المحتوى وتسلسله",
    "Opens in a new tab. The purple button in the corner of the screen opens the same thing from any point in this module.":
        "يُفتح في علامة تبويب جديدة. والزرّ البنفسجي في زاوية الشاشة يفتح الشيء نفسه من أي موضع في هذه الوحدة.",
    "It opens in a new tab, so you will not lose anything you have typed.":
        "يُفتح في علامة تبويب جديدة، فلن تفقد شيئًا ممّا كتبتَه.",
};

/* Sentence-level translations for blocks containing inline markup. */
window.AR_BLOCKS = {
    "<strong>Video to follow.</strong> The written version below carries the same content — nothing in this module depends on the video.":
        "<strong>الفيديو سيُضاف لاحقًا.</strong> النسخة المكتوبة أدناه تحمل المحتوى نفسه — ولا شيء في هذه الوحدة يتوقف على الفيديو.",
    "AI literacy is a <strong>mandatory entitlement for every student, KG to Grade 12</strong> — not an elective, and not only for ICT.":
        "الثقافة في الذكاء الاصطناعي <strong>حق إلزامي لكل طالب، من الروضة حتى الصف 12</strong> — وليست مادة اختيارية، وليست حكرًا على تقنية المعلومات.",
    "We meet in person on <strong>21 September</strong> to rehearse — moderation, micro-teach, and the questions you raise here.":
        "نلتقي حضوريًا في <strong>21 سبتمبر</strong> للتدرّب — ضبط معايير التقييم، والتدريس المصغّر، والأسئلة التي تطرحها هنا.",
    "One spiral curriculum, KG to Grade 12: <strong>four phases</strong>, <strong>four strands</strong> running through every grade, and <strong>three proficiency tiers</strong>. Read the whole table once, then read your own band properly.":
        "منهج حلزوني واحد من الروضة حتى الصف 12: <strong>أربع مراحل</strong>، و<strong>أربعة محاور</strong> تمتد عبر كل صف، و<strong>ثلاثة مستويات إتقان</strong>. اقرأ الجدول كاملًا مرة واحدة، ثم اقرأ نطاقك أنت بتمعّن.",
    "KG1–KG2<br><span style=\"color:var(--aisa-muted)\">Ages 4–5</span>":
        "روضة 1–روضة 2<br><span style=\"color:var(--aisa-muted)\">4–5 سنوات</span>",
    "Play → explore → understand<br><strong>Unplugged; no direct AI tool use</strong>":
        "اللعب ← الاستكشاف ← الفهم<br><strong>بلا أجهزة؛ دون أي استخدام مباشر لأدوات الذكاء الاصطناعي</strong>",
    "Grades 1–5<br><span style=\"color:var(--aisa-muted)\">Ages 6–10</span>":
        "الصفوف 1–5<br><span style=\"color:var(--aisa-muted)\">6–10 سنوات</span>",
    "Reason → interact → refine<br>Rules, logic and data; begins interacting with AI tools":
        "الاستدلال ← التفاعل ← التحسين<br>القواعد والمنطق والبيانات؛ ويبدأ التفاعل مع أدوات الذكاء الاصطناعي",
    "Grades 6–8<br><span style=\"color:var(--aisa-muted)\">Ages 11–13</span>":
        "الصفوف 6–8<br><span style=\"color:var(--aisa-muted)\">11–13 سنة</span>",
    "Build → evaluate → improve<br>Data, models and workflows":
        "البناء ← التقييم ← التحسين<br>البيانات والنماذج وسير العمل",
    "Grades 9–12<br><span style=\"color:var(--aisa-muted)\">Ages 14–18</span>":
        "الصفوف 9–12<br><span style=\"color:var(--aisa-muted)\">14–18 سنة</span>",
    "Design → integrate → govern<br>Integrated AI systems":
        "التصميم ← الدمج ← الحوكمة<br>أنظمة ذكاء اصطناعي متكاملة",
    "<strong>The most commonly assumed-wrong thing in the framework:</strong> KG uses <em>no</em> AI tools at all. Phase 1 is entirely unplugged. Tool use begins in Phase 2, Grade 1 and up.":
        "<strong>أكثر ما يُفترَض خطأً في الإطار:</strong> رياض الأطفال <em>لا</em> تستخدم أدوات الذكاء الاصطناعي إطلاقًا. فالمرحلة 1 بلا أجهزة تمامًا. ويبدأ استخدام الأدوات في المرحلة 2، من الصف الأول فصاعدًا.",
    "These run through <em>every</em> grade, gaining complexity as the phases climb.":
        "تمتد هذه المحاور عبر <em>كل</em> صف، ويزداد تعقيدها كلما ارتقت المراحل.",
    "KG and Grades 1–5: <strong>one period per week</strong>. Grades 6–8 and 9–12: <strong>two periods per week</strong>.":
        "رياض الأطفال والصفوف 1–5: <strong>حصة واحدة أسبوعيًا</strong>. الصفوف 6–8 و9–12: <strong>حصتان أسبوعيًا</strong>.",
    "<strong>How AISA delivers this in Grades 6–12:</strong> one timetabled period per week, with the rest of the entitlement completed asynchronously. Elementary is unchanged — one timetabled period per week.":
        "<strong>كيف تطبّق AISA ذلك في الصفوف 6–12:</strong> حصة واحدة مجدولة أسبوعيًا، مع استكمال بقية الاستحقاق بشكل غير متزامن. أمّا المرحلة الابتدائية فلا تتغيّر — حصة واحدة مجدولة أسبوعيًا.",
    "<strong>1.</strong> \"Learners classify each claim in an AI summary as supported, misleading or not established, citing evidence.\" Which strand?":
        "<strong>1.</strong> «يصنّف المتعلمون كل ادّعاء في ملخّص أنتجه الذكاء الاصطناعي بأنه مدعوم أو مضلّل أو غير ثابت، مع الاستشهاد بالدليل.» أي محور؟",
    "<strong>2.</strong> \"Learners recognise personal information and identify trusted adults.\" Which strand?":
        "<strong>2.</strong> «يتعرّف المتعلمون على المعلومات الشخصية ويحدّدون البالغين الموثوقين.» أي محور؟",
    "<strong>3.</strong> \"Learners distinguish between human senses and basic machine inputs through unplugged play.\" Which phase?":
        "<strong>3.</strong> «يميّز المتعلمون بين الحواس البشرية ومدخلات الآلة الأساسية من خلال اللعب بلا أجهزة.» أي مرحلة؟",
    "<strong>Instructional approach</strong> — how the learning experience is designed. ADEK names five: opening, warm-up, inquiry, practice, reflect.":
        "<strong>المقاربة التدريسية</strong> — كيف تُصمَّم خبرة التعلّم. وتذكر دائرة التعليم والمعرفة خمسًا: الافتتاح، والتهيئة، والاستقصاء، والتطبيق، والتأمّل.",
    "<strong>Facilitation move</strong> — what you do in the moment. Also five, and they are what this segment is about.":
        "<strong>حركة التيسير</strong> — ما تفعله أنت في اللحظة نفسها. وهي خمس أيضًا، وهي موضوع هذا الجزء.",
    "<strong>Modelling clip to follow.</strong> The worked example below stands on its own.":
        "<strong>مقطع النمذجة سيُضاف لاحقًا.</strong> والمثال المحلول أدناه قائم بذاته.",
    "This case is set in <strong>Grade 7</strong>. The five moves are identical at every band — read it for the decisions, not the grade. What Ms Hana gets wrong here is exactly what is easiest to get wrong in a Grade 2 classroom.":
        "هذه الحالة مُعدّة لـ<strong>الصف السابع</strong>. والحركات الخمس متطابقة في كل نطاق — فاقرأها من أجل القرارات لا من أجل الصف. فما تُخطئ فيه الأستاذة هناء هنا هو تحديدًا أسهل ما يُخطأ فيه في صف ثانٍ ابتدائي.",
    "<strong>The case.</strong> Grade 7, 32 learners, 45 minutes. <em>Learning outcome:</em> learners evaluate how faithfully an AI summary represents a source, classify its claims, justify decisions with evidence and revise misleading wording.":
        "<strong>الحالة.</strong> الصف السابع، 32 متعلّمًا، 45 دقيقة. <em>ناتج التعلّم:</em> يُقيّم المتعلمون مدى أمانة تمثيل ملخّص الذكاء الاصطناعي للنص المصدر، ويصنّفون ادّعاءاته، ويبرّرون قراراتهم بالأدلة، ويُنقّحون الصياغات المضلّلة.",
    "<strong>The problem.</strong> Ms Hana's first instinct is to tell them the summary is wrong, underline every error and show a corrected version. The books would look accurate — but she would have performed the evaluation.":
        "<strong>المشكلة.</strong> أول ما يتبادر إلى ذهن الأستاذة هناء أن تخبرهم بأن الملخّص خاطئ، وتضع خطًا تحت كل خطأ، وتعرض نسخة مصحّحة. عندها ستبدو الدفاتر دقيقة — لكنها هي من أدّى التقييم.",
    "<strong>1 · Prompt.</strong> How should Ms Hana launch the evaluation?":
        "<strong>1 · التوجيه.</strong> كيف ينبغي للأستاذة هناء أن تستهلّ التقييم؟",
    "<strong>2 · Inquiry.</strong> How should learners decide what needs investigating?":
        "<strong>2 · الاستقصاء.</strong> كيف ينبغي للمتعلمين أن يقرّروا ما يستحق التقصّي؟",
    "<strong>3 · Critique &amp; evaluate.</strong> What should learners do with the source and summary?":
        "<strong>3 · النقد والتقييم.</strong> ماذا ينبغي للمتعلمين أن يفعلوا بالنص المصدر والملخّص؟",
    "<strong>4 · Practice.</strong> How should Ms Hana test whether learners can apply the skill with less support?":
        "<strong>4 · التطبيق.</strong> كيف تختبر الأستاذة هناء قدرة المتعلمين على تطبيق المهارة بدعم أقل؟",
    "<strong>5 · Reflect.</strong> How should Ms Hana help learners transfer the checking method?":
        "<strong>5 · التأمّل.</strong> كيف تساعد الأستاذة هناء المتعلمين على نقل طريقة التحقق إلى سياقات أخرى؟",
    "Pick one weak option above and rewrite it as the exact words you would say. <span class=\"hint\">Exact words, not a description of them. The important learner decision must stay open.</span>":
        "اختر خيارًا ضعيفًا مما سبق وأعد صياغته بالكلمات التي ستقولها بالضبط. <span class=\"hint\">الكلمات نفسها، لا وصفًا لها. ويجب أن يبقى قرار المتعلّم المهم مفتوحًا.</span>",
    "<strong>The takeaway, in one line:</strong> the teacher frames and probes; learners select, check, justify and revise.":
        "<strong>الخلاصة في سطر واحد:</strong> المعلّم يصوغ ويستقصي؛ والمتعلمون يختارون ويتحقّقون ويبرّرون ويُنقّحون.",
    "<strong>Screencast to follow.</strong> The written steps below cover the same ground.":
        "<strong>تسجيل الشاشة سيُضاف لاحقًا.</strong> والخطوات المكتوبة أدناه تغطي المحتوى نفسه.",
    "Sign in at <a href=\"https://schools.instructwin.com/\" target=\"_blank\" rel=\"noopener\">schools.instructwin.com</a> with your school username and password.":
        "سجّل الدخول عبر <a href=\"https://schools.instructwin.com/\" target=\"_blank\" rel=\"noopener\" class=\"ltr\">schools.instructwin.com</a> باسم المستخدم وكلمة المرور الخاصين بالمدرسة.",
    "3 · Two facilitation moves you'll use, and where <span class=\"hint\">Prompt · inquiry · critique &amp; evaluate · practice · reflect</span>":
        "3 · حركتا تيسير ستستخدمهما، وأين <span class=\"hint\">التوجيه · الاستقصاء · النقد والتقييم · التطبيق · التأمّل</span>",
    "5 · The one part you're least sure about <span class=\"hint\">This sets the agenda for 21 September. Be honest — it is more useful than being tidy.</span>":
        "5 · الجزء الواحد الذي أنت أقل ثقة فيه <span class=\"hint\">هذا ما يحدّد جدول أعمال 21 سبتمبر. كن صريحًا — فذلك أنفع من أن تكون مرتّبًا.</span>",
    "6 · What you need from Brandon before the 21st <span class=\"optional\">optional</span> <span class=\"hint\">This one reaches me as soon as you save it.</span>":
        "6 · ما تحتاجه من Brandon قبل الحادي والعشرين <span class=\"optional\">اختياري</span> <span class=\"hint\">هذا يصلني فور حفظك له.</span>",
    "Every criterion is described at three tiers: <strong>Emerging</strong>, <strong>Proficient</strong>, <strong>Advanced</strong>.":
        "يُوصف كل معيار عند ثلاثة مستويات: <strong>ناشئ</strong>، و<strong>متقِن</strong>، و<strong>متقدّم</strong>.",
    "<strong>Proficient is the entitlement.</strong> It is the baseline every student is owed — not the ceiling, and not a grade to aspire to. Design for it.":
        "<strong>«متقِن» هو الحق المكفول.</strong> فهو الحد الأدنى المستحق لكل طالب — لا السقف، ولا درجة يُطمح إليها. صمّم دروسك على أساسه.",
    "<strong>Explain</strong> the output":
        "<strong>يشرح</strong> المخرَج",
    "<strong>Evaluate and improve</strong> it":
        "<strong>يُقيّمه ويُحسّنه</strong>",
    "<strong>Justify</strong> the choices":
        "<strong>يُبرّر</strong> الخيارات",
    "<strong>We are not moderating yet.</strong> Agreeing what Proficient means, so it means the same thing in every classroom, needs other people's judgements in the room. That is the anchor session on 21 September.":
        "<strong>لسنا بصدد ضبط المعايير بعد.</strong> فالاتفاق على معنى «متقِن»، بحيث يعني الشيء نفسه في كل صف، يحتاج إلى أحكام الآخرين في القاعة. وتلك هي الجلسة المحورية في 21 سبتمبر.",
    "ADEK is explicit that this is <em>a memory aid, not an official school reporting route</em>. It helps you hold the shape of a response in your head. It does not tell you who to call. That is what the next box is for.":
        "تنصّ دائرة التعليم والمعرفة صراحةً على أن هذا <em>وسيلة تذكّر، وليس مسار إبلاغ مدرسي رسمي</em>. فهو يساعدك على استحضار شكل الاستجابة ذهنيًا، لكنه لا يخبرك بمن تتصل. وهذا ما يوضّحه المربع التالي.",
    "Assistant Principal · <strong>Safeguarding Lead (DSL)</strong><br> <a href=\"mailto:anejdawi@aisa.sch.ae\">anejdawi@aisa.sch.ae</a>":
        "مساعدة مدير المدرسة · <strong>مسؤولة حماية الطفل (DSL)</strong><br> <a href=\"mailto:anejdawi@aisa.sch.ae\" class=\"ltr\">anejdawi@aisa.sch.ae</a>",
    "MS Assistant Principal · <strong>Safeguarding Lead (DSL)</strong><br> <a href=\"mailto:slargatzis@aisa.sch.ae\">slargatzis@aisa.sch.ae</a>":
        "مساعد مدير المرحلة المتوسطة · <strong>مسؤول حماية الطفل (DSL)</strong><br> <a href=\"mailto:slargatzis@aisa.sch.ae\" class=\"ltr\">slargatzis@aisa.sch.ae</a>",
    "<strong>The timescale.</strong> Report every safeguarding concern to your DSL <strong>within 24 hours</strong>. If a child may be at immediate risk, contact them <strong>straight away</strong> — do not wait for the end of the lesson or the end of the day. Never promise a student secrecy, and never investigate it yourself.":
        "<strong>الإطار الزمني.</strong> أبلِغ مسؤول حماية الطفل بكل مخاوف الحماية <strong>خلال 24 ساعة</strong>. وإذا كان الطفل معرّضًا لخطر مباشر، فاتصل به <strong>فورًا</strong> — لا تنتظر نهاية الحصة ولا نهاية اليوم. ولا تَعِد الطالب أبدًا بالسرّية، ولا تتولَّ التحقيق بنفسك.",
    "<strong>Attend to the student first.</strong> Calm, matter-of-fact: they have done nothing wrong. Move them away from the screen.":
        "<strong>اهتمّ بالطالب أولًا.</strong> بهدوء وبأسلوب عملي: لم يرتكب أي خطأ. وأبعِده عن الشاشة.",
    "<strong>Don't delete it.</strong> Leave the response on screen or screenshot it. It is the evidence, and the DSL will need to see exactly what appeared.":
        "<strong>لا تحذفه.</strong> اترك الاستجابة على الشاشة أو التقط لها صورة. فهي الدليل، وسيحتاج مسؤول حماية الطفل إلى رؤية ما ظهر بالضبط.",
    "<strong>Stop that activity</strong> for the whole class — not just the one device. Move to the unplugged alternative.":
        "<strong>أوقف ذلك النشاط</strong> للصف كله — لا للجهاز الواحد فقط. وانتقل إلى البديل بلا أجهزة.",
    "<strong>Record it factually</strong> while it is fresh: what the student entered, what appeared, what the student said, what you did, and the time. What happened, not what you think it means.":
        "<strong>سجّل الواقعة بموضوعية</strong> وهي ما تزال حاضرة: ما أدخله الطالب، وما ظهر، وما قاله الطالب، وما فعلتَه أنت، والوقت. ما حدث فعلًا، لا ما تظن أنه يعنيه.",
    "<strong>Contact your Safeguarding Lead the same lesson.</strong> If the student is distressed or the content concerns them personally, contact the DSL immediately rather than waiting.":
        "<strong>اتصل بمسؤول حماية الطفل في الحصة نفسها.</strong> وإذا كان الطالب متضايقًا أو كان المحتوى يخصّه شخصيًا، فاتصل به فورًا بدل الانتظار.",
    "<strong>The DSL decides what happens next</strong> — including whether parents are contacted and whether the tool is withdrawn. That call is not yours to make, and neither is reassuring the student that nothing will come of it.":
        "<strong>مسؤول حماية الطفل هو من يقرّر الخطوة التالية</strong> — بما في ذلك التواصل مع أولياء الأمور وسحب الأداة من عدمه. وليس هذا قرارك، كما أنه ليس من دورك طمأنة الطالب بأن شيئًا لن يترتب على الأمر.",
    "This sits alongside the ADEK Safeguarding and Student Protection policies and Federal Decree-Law No. 26 of 2025 on Child Digital Safety. The full route, including whistleblowing and the counsellor referral process, is in the <a href=\"safeguarding-module.html\">AISA Safeguarding module</a>.":
        "يأتي هذا إلى جانب سياسات حماية الطفل ورعاية الطلبة الصادرة عن دائرة التعليم والمعرفة، والمرسوم بقانون اتحادي رقم 26 لسنة 2025 بشأن السلامة الرقمية للطفل. أما المسار الكامل، بما فيه الإبلاغ عن المخالفات وإجراءات الإحالة إلى المرشد الطلابي، فتجده في <a href=\"safeguarding-module.html\">وحدة حماية الطفل في AISA</a>.",
    "<strong>Prompt</strong> — frame a task that leaves thinking to do.":
        "<strong>التوجيه</strong> — صُغ مهمة تُبقي هناك تفكيرًا يُنجَز.",
    "<strong>Inquiry</strong> — identify claims, questions and evidence needs.":
        "<strong>الاستقصاء</strong> — حدّد الادّعاءات والأسئلة وما يلزم من أدلة.",
    "<strong>Critique &amp; evaluate</strong> — check, classify, compare and justify.":
        "<strong>النقد والتقييم</strong> — تحقّق وصنّف وقارن وبرّر.",
    "<strong>Practice</strong> — repeat the skill with less support.":
        "<strong>التطبيق</strong> — كرّر المهارة بدعم أقل.",
    "<strong>Reflect</strong> — explain the learning and transfer it.":
        "<strong>التأمّل</strong> — اشرح ما تعلّمته وانقله إلى سياق جديد.",
    "<strong>Human oversight</strong> — AI assists; people decide and stay accountable.":
        "<strong>الإشراف البشري</strong> — الذكاء الاصطناعي يساعد؛ والبشر يقرّرون ويتحمّلون المسؤولية.",
    "<strong>Data privacy</strong> — never put personal or sensitive data into a prompt.":
        "<strong>خصوصية البيانات</strong> — لا تُدخل أبدًا بيانات شخصية أو حساسة في أي مُوجَّه.",
    "<strong>Wellbeing and safeguarding</strong> — protect students from harmful or age-inappropriate content.":
        "<strong>الرفاه وحماية الطفل</strong> — احمِ الطلاب من المحتوى الضار أو غير المناسب لأعمارهم.",
    "<strong>Honesty and integrity</strong> — cite sources, no invented facts, no passing AI work off as your own.":
        "<strong>الأمانة والنزاهة</strong> — استشهد بالمصادر، ولا تختلق حقائق، ولا تنسب عمل الذكاء الاصطناعي إلى نفسك.",
    "<strong>Fairness</strong> — check outputs for bias and unfair assumptions.":
        "<strong>العدالة</strong> — افحص المخرجات بحثًا عن التحيّز والافتراضات غير العادلة.",
    "<strong>Notice → Record → Report → Act → Review.</strong> A memory aid for the shape of a response — not the reporting route.":
        "<strong>لاحِظ ← سجّل ← أبلِغ ← تصرّف ← راجِع.</strong> وسيلة تذكّر لشكل الاستجابة — لا مسار الإبلاغ.",    "ADEK has published the full lesson plans and student materials on <a href=\"https://schools.instructwin.com/\" target=\"_blank\" rel=\"noopener\">InstrucTwin</a>. Staff accounts are not yet showing the grades you are assigned to, so you may not be able to reach yours today. That is mine to chase, not yours — when it opens, read your lesson against the plan you just wrote.":
        "نشرت دائرة التعليم والمعرفة خطط الدروس الكاملة ومواد الطلاب على <a href=\"https://schools.instructwin.com/\" target=\"_blank\" rel=\"noopener\" class=\"ltr\">InstrucTwin</a>. غير أنّ حسابات الطاقم لا تُظهر بعد الصفوف المُسنَدة إليك، لذا قد لا تتمكّن من الوصول إلى درسك اليوم. ومتابعة هذا من مسؤوليتي لا من مسؤوليتك — وحين يُتاح، اقرأ درسك في ضوء الخطة التي كتبتَها للتو.",
    "<strong>Can't get in?</strong> You have not lost anything — your plan above is the part that matters, and it is already saved. Tick the box below so I know, and finish the module. Access is mine to chase, and I would rather know today than on the 20th.":
        "<strong>لا تستطيع الدخول؟</strong> لم تخسر شيئًا — فخطتك أعلاه هي الجزء المهم، وقد حُفظت بالفعل. ضع علامة في المربع أدناه لأعرف، وأكمل الوحدة. فمتابعة الدخول مسؤوليتي أنا، وأفضّل أن أعرف اليوم لا في العشرين.",
    "Teaching begins <strong>the week of 21 September 2026</strong> — your first lesson falls somewhere in that week, not necessarily on the Monday. The full curriculum, lesson plans and teacher toolkits are already on InstrucTwin.":
        "يبدأ التدريس في <strong>أسبوع 21 سبتمبر 2026</strong> — فدرسك الأوّل يقع في موضع ما من ذلك الأسبوع، وليس بالضرورة يوم الاثنين. والمنهج الكامل وخطط الدروس وحقائب المعلّم متاحة بالفعل على <span class=\"ltr\">InstrucTwin</span>.",
    "Everything so far has been preparation for this. Teaching starts the <strong>week of 21 September</strong> — your first lesson falls somewhere in that week, not necessarily on the Monday. Pick your grade and write the plan you will teach from. You do not need InstrucTwin open to do it — the curriculum focus for your grade is below.":
        "كل ما سبق كان تمهيدًا لهذا. يبدأ التدريس في <strong>أسبوع 21 سبتمبر</strong> — فدرسك الأوّل يقع في موضع ما من ذلك الأسبوع، وليس بالضرورة يوم الاثنين. اختر صفّك واكتب الخطة التي ستُدرّس منها. ولستَ بحاجة إلى فتح <span class=\"ltr\">InstrucTwin</span> لتفعل ذلك — فمحاور المنهج الخاصة بصفّك مذكورة أدناه.",
    "The shape above is the summary. The <strong>Scope &amp; Sequence</strong> is the full KG–Grade 12 curriculum map: what every grade covers, what students are expected to reach by the end of each phase, and how each strand builds year on year.":
        "ما سبق هو الملخّص. أمّا <strong>نطاق المحتوى وتسلسله</strong> فهو خريطة المنهج الكاملة من رياض الأطفال حتّى الصف 12: ما يغطّيه كل صفّ، وما يُتوقّع أن يبلغه الطلاب بنهاية كل مرحلة، وكيف يتراكم كل محور عامًا بعد عام.",
    "<strong>Want the whole picture?</strong> The <strong>Scope &amp; Sequence</strong> lays out every grade from KG to 12 — the progression map, end-of-phase expectations, and how each strand builds year on year.":
        "<strong>تريد الصورة كاملة؟</strong> يعرض <strong>نطاق المحتوى وتسلسله</strong> كل صف من رياض الأطفال حتّى الصف 12 — خريطة التدرّج، وتوقّعات نهاية كل مرحلة، وكيف يتراكم كل محور عامًا بعد عام.",
};

/* Stamp data-ar onto the elements AR_BLOCKS names, keyed by their
 * normalised English innerHTML. Runs before onboarding-i18n.js's own
 * DOMContentLoaded handler because this file is loaded first, so the
 * attributes exist by the time the engine first applies a language. */
(function () {
    'use strict';
    function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
    function stamp() {
        var map = window.AR_BLOCKS || {};
        var index = {};
        Object.keys(map).forEach(function (k) { index[norm(k)] = map[k]; });
        var missed = 0;
        Array.prototype.forEach.call(
            document.querySelectorAll('p, li, td, th, div, label, span'),
            function (el) {
                if (el.hasAttribute('data-ar')) return;
                var ar = index[norm(el.innerHTML)];
                if (ar) { el.setAttribute('data-ar', ar); delete index[norm(el.innerHTML)]; }
            }
        );
        missed = Object.keys(index).length;
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
