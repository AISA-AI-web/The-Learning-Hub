/*
 * AISA Learning Hub: Tailwind on the brand (added 10 November 2026).
 *
 * The pages that use Tailwind's Play CDN each picked their own colour
 * family (indigo here, teal there, pink on the Media Hub), which is most
 * of why the Hub looked like a dozen different sites. Loaded right after
 * a page's own `tailwind.config = {...}` script, this folds the brand into
 * that config before Tailwind draws anything: every decorative colour
 * family becomes the AISA purple scale, yellow becomes the gold scale.
 * Green, amber, orange and red are left alone: they mean a status
 * (done, needs attention, required, problem) and nothing else.
 *
 * The scales match auth/hub.css (--lh-*). A page that needs a colour this
 * changes can still write it as a hex value.
 */
(function () {
    'use strict';
    var PURPLE = {
        50: '#F8F6FD', 100: '#F2EFFA', 200: '#E4DEF5', 300: '#C8BEE8', 400: '#A99BE0',
        500: '#7B66D9', 600: '#5B3FD0', 700: '#3A1F94', 800: '#2A1180', 900: '#21076C', 950: '#160449'
    };
    var GOLD = {
        50: '#FDFAF1', 100: '#FBF5E6', 200: '#F3E6C2', 300: '#E9D49A', 400: '#D8B664',
        500: '#C9A24A', 600: '#B8933A', 700: '#94742A', 800: '#7A5C14', 900: '#5C450F', 950: '#3B2C08'
    };
    var MAP = {
        indigo: PURPLE, violet: PURPLE, purple: PURPLE, blue: PURPLE, sky: PURPLE,
        cyan: PURPLE, teal: PURPLE, fuchsia: PURPLE, pink: PURPLE, yellow: GOLD,
        aisa: { purple: '#21076C', gold: '#D8B664', tint: '#F2EFFA' }
    };
    var tw = window.tailwind;
    if (!tw) return;
    var cfg = tw.config || {};
    cfg.theme = cfg.theme || {};
    cfg.theme.extend = cfg.theme.extend || {};
    var colors = cfg.theme.extend.colors = cfg.theme.extend.colors || {};
    Object.keys(MAP).forEach(function (k) { colors[k] = MAP[k]; });
    var ff = cfg.theme.extend.fontFamily = cfg.theme.extend.fontFamily || {};
    ff.sans = ['DM Sans', 'Cairo', 'system-ui', 'sans-serif'];
    ff.heading = ['DM Sans', 'Cairo', 'system-ui', 'sans-serif'];
    tw.config = cfg;
})();
