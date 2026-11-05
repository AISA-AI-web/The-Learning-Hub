/* ai-literacy-cohort.js — who the AI Literacy: Teacher Readiness module is required of.
 *
 * The 62 teachers named on AISA's ADEK Implementation Form, as truncated SHA-256
 * hashes of their lower-cased email addresses (not the addresses: this repository
 * is public). Tidiness, not security: the addresses are first-initial-plus-surname,
 * so anyone determined could hash their way through them. It decides what a page
 * SAYS; it is not a permission gate.
 *
 * Read by readiness-notice.js (the pop-up on the module) and admin-analytics.js
 * (so the analytics count the 62, not every Hub user). The truth is
 * AI_LITERACY_COHORT in admin-dashboard.html; Media Hub/sep18.html keeps its own
 * copy. `node tests/readiness-notice-test.js` fails when any of them differ.
 * To regenerate, from the repo root:
 *
 *   python3 -c "
 *   import io,re,hashlib
 *   s=io.open('admin-dashboard.html',encoding='utf-8').read()
 *   m=re.search(r'const AI_LITERACY_COHORT = \\[(.*?)\\n        \\];', s, re.S)
 *   for h in sorted(hashlib.sha256(e.strip().lower().encode()).hexdigest()[:16]
 *                   for e in re.findall(r'email:\\s*\\"([^\\"]+)\\"', m.group(1))):
 *       print(h)"
 */
window.AISA_AI_LITERACY_COHORT = [
    '03afd203169a1936','0bf1a8dee292009b','0cadf880e6a11a11','1976c658c130524b',
    '24e2785d8d701538','29c1ae8e9f8fe30c','2f158e7a9b0938de','324fde0d915dea57',
    '33420d6b184c6181','41eafd550d997b5e','47132fe92ab3036b','4a3ad5b5ace9fa1c',
    '4de18673d73474d2','568ed8b25d0a06e7','57d378bce8a37423','5862909b1ece457d',
    '5a019ff374270710','5cc820e9e3a036aa','5ffe6a7351b1d55b','62e9cce0d4fdcca5',
    '634cb6dd65c891e4','636473af16bcb5b8','647789b73bf6a371','6c40a35e3fb9e4a3',
    '811a611273a288e2','8184379433df6e42','81ae0ef9915c7bc0','8c9c66f59f1fe12e',
    '8ec704cbccc4bcb6','8efbf6620bacaf62','8f6826587ce07d8c','913e834d668b8e3d',
    '91b00caa00ca869a','96ba37dfb464dc5c','9b2214aee7e78090','9fc20fcf4118cd85',
    '9fcfcb2c755c0637','a2794280e36a31f0','a4f5bb445b2daeaf','a513efbb7f95c470',
    'a5f056cdea3b7cee','a790ffeb40eb8825','ac1624ea685f3d6c','b4040b00d0379642',
    'b44569a4c5a5eb2c','ba743363f343a3d3','bd541eb727fd4b23','be788d461bfca2cf',
    'c457888bf76a8186','c69bc06291e9a9d7','d37840b1e279889a','daf4b851588b4f92',
    'e59f325eae3a90be','e96e6e1d67301568','e9f473a4fd50fbed','ed90a36f2eaf752c',
    'ee523697dc60237b','f0c0e765225f574e','f5d969f0400b2040','f61e32f4534f9a1c',
    'f86b7cbaee023d91','ffd024a1c256aa37'
];
