/* admin-teams.js — the teaching teams, for the admin dashboard's "Team or grade level" filter (9 Nov 2026).
 *
 * From the school's faculty list for 2026–27 (Brandon, 9 Nov 2026). Only who is in which team, and who leads it, is kept:
 * no rooms, extensions or courses. The repository is public, so keep it that way.
 *
 * Each member is [name, email, lead]. An email is given only where it is already in this repository (the AI Literacy cohort
 * in admin-dashboard.html, and a few staff named elsewhere in the Hub); everyone else is matched to the staff list by name
 * in the browser (matchTeams() in admin-dashboard.js), and anyone who cannot be matched is listed under the filter, so a
 * name can be corrected here. Add an email to make a match certain.
 *
 * `area` decides the heading the team is listed under. A change here needs admin-teams.js?v=N bumped in admin-dashboard.html.
 */
window.AISA_TEAMS = [
    { id: 'kg1', label: 'KG1', area: 'elem', homeroom: true, members: [
        ['Haley Hidalgo', 'hhidalgo@aisa.sch.ae', 'GLL'], ['Ellen Barton', 'ebarton@aisa.sch.ae'], ['Sandrine Lazare', 'slazare@aisa.sch.ae'],
        ['Donia Amir', 'damir@aisa.sch.ae'], ['Zantia De Beer', 'zbeer@aisa.sch.ae']] },
    { id: 'kg2', label: 'KG2', area: 'elem', homeroom: true, members: [
        ['Sabrina Stream', 'sstream@aisa.sch.ae', 'GLL'], ['Arpita Varma', 'avarma@aisa.sch.ae'], ['Lauren Hill', 'lahill@aisa.sch.ae'],
        ['Michelle Forrester', 'mforrester@aisa.sch.ae'], ['Helen Campbell', 'hcampbell@aisa.sch.ae']] },
    { id: 'g1', label: 'Grade 1', area: 'elem', homeroom: true, members: [
        ['Sonya Davis', 'sdavis@aisa.sch.ae'], ['Marwa Hussein', 'mhussein@aisa.sch.ae', 'GLL'], ['Fatima Martin', 'fmartin@aisa.sch.ae'],
        ['Derian Vega', 'dvega@aisa.sch.ae'], ['Sissy Pieterse', 'apieterse@aisa.sch.ae']] },
    { id: 'g2', label: 'Grade 2', area: 'elem', homeroom: true, members: [
        ['Kate Heyns', 'kheyns@aisa.sch.ae', 'GLL'], ['Adryne San Martins', 'amartins@aisa.sch.ae'], ['Alejandra Echeverri', 'aecheverri@aisa.sch.ae'],
        ['Ashwati Nair', 'anair@aisa.sch.ae'], ['Chandler Monroe', 'cmonroe@aisa.sch.ae']] },
    { id: 'g3', label: 'Grade 3', area: 'elem', homeroom: true, members: [
        ['Geoff Kurton', 'gkurton@aisa.sch.ae', 'GLL'], ['Ula Wyss', 'uwyss@aisa.sch.ae'], ['Anna Siju', 'asiju@aisa.sch.ae'],
        ['Emily McKeever', 'emckeever@aisa.sch.ae'], ['Cassandra Henry', 'chenry@aisa.sch.ae']] },
    { id: 'g4', label: 'Grade 4', area: 'elem', homeroom: true, members: [
        ['JP Heyns', 'jheyns@aisa.sch.ae', 'GLL'], ['Aisling Brehony', 'abrehony@aisa.sch.ae'], ['Kasey Stafford', 'kstafford@aisa.sch.ae'],
        ['Jacolien du Plooy', 'jplooy@aisa.sch.ae']] },
    { id: 'g5', label: 'Grade 5', area: 'elem', homeroom: true, members: [
        ['Amy Classen', 'aclassen@aisa.sch.ae', 'GLL'], ['Jennifer Van Belle', 'jvanbelle@aisa.sch.ae'], ['Natashia Naicker', 'nnaicker@aisa.sch.ae'],
        ['Ryan Myles', 'rmyles@aisa.sch.ae'], ['Francois Botha', 'fbotha@aisa.sch.ae']] },
    { id: 'elem-specialists', label: 'Elementary specialists', area: 'elem', members: [
        ['Brooke Hoiseth', '', 'Specialist GLL'], ['Christine Canalas'], ['Dmytro Verbenski'], ['Kimberly Masters']] },
    { id: 'elem-arabic', label: 'Elementary Arabic, Islamic & UAE SS', area: 'elem', members: [
        ['Rafif Al Husari', '', 'Arabic GLL'], ['Nancy Ibrahim'], ['Ishraq Jumeian'], ['Doaa Alawneh'], ['Dima Abdullah'], ['May Moustaffa'],
        ['Rasha Elsayed'], ['Ibtissam Al Bayouk'], ['Nour Rabah'], ['Alaa Al Moghrabe'], ['Soheel Ghanem'], ['Khaled Essam']] },

    { id: 'ms-math', label: 'MS Math', area: 'ms', members: [
        ['Ayla Din-Zahid', '', 'HOD'], ['Caidon Classen'], ['Ashleigh Bothma'], ['Claudia Sacco']] },
    { id: 'ms-english', label: 'MS English', area: 'ms', members: [
        ['William Hoiseth'], ['Brian Wyatt Wilkins'], ['Nicola Sparks']] },
    { id: 'ms-science', label: 'MS Science', area: 'ms', members: [
        ['Nastassia Van Jaarsveldt', '', 'HOD'], ['Lara Kibbi'], ['Liam Josephs'], ['Egbal Mohamed', 'emohamed@aisa.sch.ae'],
        ['Mouhcine Mekouar', 'mmekouar@aisa.sch.ae']] },
    { id: 'ms-humanities', label: 'MS Humanities', area: 'ms', members: [
        ['William Cowie', '', 'HOD'], ['Robin Martin Lawson', 'rlawson@aisa.sch.ae'], ['Naveen Graham']] },

    { id: 'hs-math', label: 'HS Math', area: 'hs', members: [
        ['Shawn Carder', '', 'HOD'], ['Max Sangster'], ['Sudashna Naidoo', 'snaidoo@aisa.sch.ae'], ['Nkralefac Canaldo'], ['Dominic Girod'],
        ['Hosam Abdelsalam', 'habdelsalam@aisa.sch.ae'], ['Tammie Collins']] },
    { id: 'hs-english', label: 'HS English', area: 'hs', members: [
        ['Brandon Fula', '', 'HOD'], ['Jennifer Hecker', 'jhecker@aisa.sch.ae'], ['Given Hinampas', 'ghinampas@aisa.sch.ae'],
        ['Jeffery Koch', 'jkoch@aisa.sch.ae'], ['Sharon Siwela'], ['Mogamat Armien'], ['Camilia Darwish', 'cdarwish@aisa.sch.ae']] },
    { id: 'hs-science', label: 'HS Science', area: 'hs', members: [
        ['Arindam Banerjee'], ['Savannah Bezuidenhout'], ['Mrityunjoy Chakraborty'], ['Devashree Chakraborty'],
        ['Brent Fortune', 'bfortune@aisa.sch.ae', 'HOD'], ['Garfonkeel Gallego']] },
    { id: 'hs-social', label: 'HS Social Studies', area: 'hs', members: [
        ['Robynne May', '', 'HOD'], ['William Scott Lester', 'wlester@aisa.sch.ae'], ['Damian Chetty', 'dchetty@aisa.sch.ae'], ['Carlos Martinez'],
        ['Julie Mullins'], ['Lisa Holder'], ['Hannah Pilgrim']] },
    { id: 'hs-languages', label: 'HS Foreign Language', area: 'hs', members: [
        ['Veronica Player', 'vplayer@aisa.sch.ae', 'HOD'], ['Paulo Vitor', 'pvitor@aisa.sch.ae'], ['Jennifer Matar', 'jmatar@aisa.sch.ae'],
        ['Jenel Sanchez', 'jsanchez@aisa.sch.ae']] },

    { id: 'sec-arabic', label: 'Secondary Arabic, Islamic & UAE SS', area: 'sec', members: [
        ['Ahmed El Sawaf', 'aelsawaf@aisa.sch.ae', 'HOD'], ['Abdelfattah Zalama', 'azalama@aisa.sch.ae'], ['Fairouz Babikir', 'fbabikir@aisa.sch.ae'],
        ['Belal Tantawe', 'btantawi@aisa.sch.ae'], ['Naglaa Mattar', 'nmater@aisa.sch.ae'], ['Ashraf Mohamed'], ['Hiam Maoued', 'hmaoued@aisa.sch.ae'],
        ['Amro Alazab'], ['Hossam Mahanna', 'hmahanna@aisa.sch.ae'], ['Jamila Albakour', 'jalbakour@aisa.sch.ae'], ['Abdelrahman Youssef'],
        ['Abdel Moamen Alroz', 'amalroz@aisa.sch.ae']] },
    { id: 'vapa', label: 'Visual & performing arts (VAPA)', area: 'sec', members: [
        ['Nataliia Verbenska', '', 'HOD'], ['Ellen Grobler'], ['Matthew Minnies']] },
    { id: 'pe', label: 'MS/HS PE', area: 'sec', members: [
        ['Darrell Traylor', '', 'HOD'], ['Cherry Spencer'], ['Danielle Masters'], ['Lelan Washington']] },

    { id: 'student-services', label: 'K–12 Student Services', area: 'k12', members: [
        ['Stephanie Brown', '', 'Head of Inclusion'], ['Emily Hogan'], ['Roshni Rampersadth'], ['Princess Powe'], ['Demi Jones'], ['Patricia Levins'],
        ['Soha Andary'], ['Sukaina Maklai'], ['Naiema Zaki'], ['Jennifer Guss'], ['Joel Hunter', 'jhunter@aisa.sch.ae'], ['Laylin Chong'],
        ['Sara Al Beainy']] },
    { id: 'library', label: 'Library', area: 'k12', members: [
        ['Aline Carnevale'], ['Elnur Nazaraliyev', 'enazaraliyev@aisa.sch.ae']] },
    { id: 'curriculum', label: 'Curriculum', area: 'k12', members: [
        ['Amira El Turabi', 'aturabi@aisa.sch.ae'], ['Kelly Mejia', 'kmejia@aisa.sch.ae'], ['Quitney Price'], ['Brandon Baki', 'bbaki@aisa.sch.ae'],
        ['Antonio Mejia']] },
    { id: 'subs', label: 'Permanent substitutes', area: 'k12', members: [['Anna Kamm']] }
];

/* The headings in the filter, in order, and the "whole area" option each one starts with. */
window.AISA_TEAM_AREAS = [
    { id: 'elem', label: 'KG & Elementary', all: 'All KG–Grade 5 homeroom teams', homeroomOnly: true },
    { id: 'ms', label: 'Middle School', all: 'All Middle School departments' },
    { id: 'hs', label: 'High School', all: 'All High School departments' },
    { id: 'sec', label: 'Secondary (MS & HS)', all: '' },
    { id: 'k12', label: 'Across the school', all: '' }
];
