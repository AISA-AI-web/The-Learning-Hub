/* admin-analytics-charts.js — the chart kit behind admin-analytics.html.
 *
 * Plain SVG and HTML, no library: every chart here is drawn at the width
 * of its card (the page redraws on resize), keeps its marks thin, gives
 * every mark a hover/focus tooltip, and can show its numbers as a table
 * (tableView), so no value is ever only in a colour or a tooltip.
 *
 * Colour jobs (validated with the dataviz skill's palette checker against
 * the white card surface; gold sits under 3:1, so wherever it carries a
 * series the value is also printed or in the table view):
 *   one series      AISA purple #21076C; gold #D8B664 picks out the one
 *                   bar or point the text is about; lavender is "less"
 *   several series  CAT, in this order and never cycled:
 *                   purple #4B2DBE, teal #1E9E8A, gold #C49A2C, pink #E0607F
 *                   (adjacent pairs pass; the first three pass all pairs)
 *   magnitude       one purple ramp, light to dark (ramp())
 *
 * Every label goes in with textContent, never innerHTML: page titles,
 * click labels and names are data the Hub's users wrote.
 */
(function () {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';
    var C = {
        ink: '#17132b', ink2: '#4d4866', muted: '#77728c',
        grid: '#ece9f4', base: '#c9c3db', surface: '#ffffff',
        purple: '#21076C', gold: '#D8B664', goldInk: '#7a5d10',
        lav: '#d9d3ef', lav2: '#efecf8', crit: '#b42318'
    };
    var CAT = ['#4B2DBE', '#1E9E8A', '#C49A2C', '#E0607F'];

    /* ---------- DOM ---------- */

    function h(tag, attrs, kids) {
        var n = document.createElement(tag);
        setAll(n, attrs);
        add(n, kids);
        return n;
    }
    function s(tag, attrs, kids) {
        var n = document.createElementNS(NS, tag);
        setAll(n, attrs);
        add(n, kids);
        return n;
    }
    function setAll(n, attrs) {
        if (!attrs) return;
        Object.keys(attrs).forEach(function (k) {
            var v = attrs[k];
            if (v === null || v === undefined || v === false) return;
            if (k === 'text') n.textContent = String(v);
            else n.setAttribute(k, String(v));
        });
    }
    function add(n, kids) {
        if (kids === null || kids === undefined) return;
        [].concat(kids).forEach(function (k) {
            if (k === null || k === undefined || k === false) return;
            n.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
        });
    }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
    function widthOf(host) {
        var w = host.clientWidth || (host.getBoundingClientRect ? host.getBoundingClientRect().width : 0);
        return Math.max(240, Math.floor(w || 600));
    }

    /* ---------- numbers and text ---------- */

    var NF = new Intl.NumberFormat('en-GB');
    function fmt(n) { return isFinite(n) ? NF.format(Math.round(n)) : '–'; }
    function fmt1(n) {
        if (!isFinite(n)) return '–';
        var r = Math.round(n * 10) / 10;
        return NF.format(r);
    }
    function pct(part, whole) { return whole ? Math.round(part / whole * 100) : 0; }
    function compact(n) {
        if (n >= 10000) return NF.format(Math.round(n / 1000)) + 'K';
        return NF.format(n);
    }

    var ctx2d = null;
    function textW(str, size, weight) {
        if (!ctx2d) {
            try { ctx2d = document.createElement('canvas').getContext('2d'); } catch (e) { ctx2d = null; }
        }
        if (!ctx2d) return String(str).length * size * 0.55;
        ctx2d.font = (weight || 400) + ' ' + size + 'px "DM Sans", system-ui, sans-serif';
        return ctx2d.measureText(String(str)).width;
    }
    function fit(str, size, weight, maxW) {
        str = String(str);
        if (textW(str, size, weight) <= maxW) return str;
        while (str.length > 1 && textW(str + '…', size, weight) > maxW) str = str.slice(0, -1);
        return str.length > 1 ? str + '…' : '';
    }

    /* A clean axis: 0 up to a round number at or above max, 3–5 steps. */
    function niceTicks(max, want) {
        want = want || 4;
        if (!(max > 0)) return [0, 1];
        var raw = max / want;
        var mag = Math.pow(10, Math.floor(Math.log10(raw)));
        var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; })
            .find(function (st) { return st >= raw; }) || 10 * mag;
        if (step < 1 && max >= 1) step = 1;
        var out = [];
        for (var v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v * 1000) / 1000);
        if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
        return out;
    }

    /* Light-to-dark purple, interpolated in linear light so the middle
     * steps don't go muddy. t in 0..1. */
    function hexRgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function unlin(c) {
        c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        return Math.max(0, Math.min(255, Math.round(c * 255)));
    }
    function mix(a, b, t) {
        var A = hexRgb(a).map(lin), B = hexRgb(b).map(lin);
        var o = A.map(function (v, i) { return unlin(v + (B[i] - v) * t); });
        return '#' + o.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
    }
    function ramp(t) { return t <= 0 ? '#f4f2fa' : mix('#e6e1f5', C.purple, Math.max(0, Math.min(1, t))); }
    function rampInk(t) { return t > 0.55 ? '#ffffff' : C.ink; }

    /* ---------- tooltip ---------- */

    var tipEl = null;
    function tipNode() {
        if (!tipEl) {
            tipEl = h('div', { 'class': 'ac-tip', role: 'tooltip' });
            document.body.appendChild(tipEl);
        }
        return tipEl;
    }
    /* content: { title, rows: [{ v, l, c, line }], note } — the value leads,
     * the label follows, a short stroke of the series colour keys it. */
    function showTip(x, y, content) {
        if (!content) { hideTip(); return; }
        var t = tipNode();
        clear(t);
        if (content.title) t.appendChild(h('div', { 'class': 'ac-tip-t', text: content.title }));
        (content.rows || []).forEach(function (r) {
            var row = h('div', { 'class': 'ac-tip-r' });
            if (r.c) row.appendChild(h('span', { 'class': 'ac-tip-k', style: 'background:' + r.c }));
            row.appendChild(h('b', { text: r.v }));
            if (r.l) row.appendChild(h('span', { 'class': 'ac-tip-l', text: r.l }));
            t.appendChild(row);
        });
        if (content.note) t.appendChild(h('div', { 'class': 'ac-tip-n', text: content.note }));
        t.style.display = 'block';
        var w = t.offsetWidth, ht = t.offsetHeight;
        var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        var left = x + 14, top = y + 14;
        if (left + w > vw - 8) left = Math.max(8, x - w - 14);
        if (top + ht > vh - 8) top = Math.max(8, y - ht - 14);
        t.style.left = left + 'px';
        t.style.top = top + 'px';
    }
    function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
    function hover(node, fn, focusable) {
        node.addEventListener('pointermove', function (e) { showTip(e.clientX, e.clientY, fn(e)); });
        node.addEventListener('pointerleave', hideTip);
        if (focusable) {
            node.setAttribute('tabindex', '0');
            node.addEventListener('focus', function (e) {
                var r = node.getBoundingClientRect();
                showTip(r.left + r.width / 2, r.top + r.height / 2, fn(e));
            });
            node.addEventListener('blur', hideTip);
        }
    }
    window.addEventListener('scroll', hideTip, { passive: true });

    /* ---------- small shared pieces ---------- */

    function svgRoot(w, ht, label) {
        return s('svg', { width: w, height: ht, viewBox: '0 0 ' + w + ' ' + ht, role: 'img',
                          'aria-label': label || '', 'class': 'ac-svg' });
    }
    function txt(x, y, str, o) {
        o = o || {};
        return s('text', {
            x: x, y: y, 'text-anchor': o.anchor || 'start', 'font-size': o.size || 11,
            'font-weight': o.weight || 400, fill: o.fill || C.muted, 'class': o.cls || null,
            'dominant-baseline': o.baseline || null, text: str
        });
    }
    /* A bar with its data end rounded and its baseline end square. */
    function colPath(x, y, w, ht, r) {
        r = Math.min(r === undefined ? 4 : r, w / 2, ht);
        if (ht <= 0) return '';
        return 'M' + x + ',' + (y + ht) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
               'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
               'V' + (y + ht) + 'Z';
    }
    function rowPath(x, y, w, ht, r) {
        r = Math.min(r === undefined ? 4 : r, ht / 2, w);
        if (w <= 0) return '';
        return 'M' + x + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
               'V' + (y + ht - r) + 'Q' + (x + w) + ',' + (y + ht) + ' ' + (x + w - r) + ',' + (y + ht) +
               'H' + x + 'Z';
    }

    function legend(items, cls) {
        var box = h('div', { 'class': 'ac-legend' + (cls ? ' ' + cls : '') });
        items.forEach(function (it) {
            var key = h('span', { 'class': 'ac-legend-k ac-legend-' + (it.shape || 'rect'),
                                  style: it.shape === 'ring' ? 'border-color:' + it.color : 'background:' + it.color });
            box.appendChild(h('span', { 'class': 'ac-legend-i' }, [key, h('span', { text: it.name })]));
        });
        return box;
    }

    function empty(host, message) {
        clear(host);
        host.appendChild(h('p', { 'class': 'ac-empty', text: message || 'Nothing to show for this selection.' }));
    }

    /* The numbers behind a chart, as a table, behind a disclosure. */
    function tableView(host, columns, rows, opts) {
        opts = opts || {};
        var old = host.querySelector(':scope > details.ac-data');
        if (old) host.removeChild(old);
        if (!rows || !rows.length) return;
        var table = h('table', { 'class': 'ac-table' });
        var thead = h('thead');
        var tr = h('tr');
        columns.forEach(function (c, i) {
            tr.appendChild(h('th', { text: c, 'class': i ? 'num' : null, scope: 'col' }));
        });
        thead.appendChild(tr);
        table.appendChild(thead);
        var tb = h('tbody');
        rows.forEach(function (r) {
            var row = h('tr');
            r.forEach(function (v, i) { row.appendChild(h('td', { text: v, 'class': i ? 'num' : null })); });
            tb.appendChild(row);
        });
        table.appendChild(tb);
        var d = h('details', { 'class': 'ac-data' }, [
            h('summary', { text: opts.summary || 'Show the numbers' }),
            h('div', { 'class': 'ac-table-scroll' }, [table])
        ]);
        host.appendChild(d);
    }

    /* ---------- columns: a handful of categories, labelled ---------- */
    /* o.data: [{ label, sub, value, valueText, subText, color, tip }] */
    function columns(host, o) {
        clear(host);
        var data = o.data || [];
        if (!data.length) { empty(host, o.empty); return; }
        var W = widthOf(host), H = o.height || 230;
        var top = 40, bottom = data.some(function (d) { return d.sub; }) ? 36 : 22;
        var plotH = H - top - bottom;
        var max = o.max || Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
        var band = W / data.length;
        var bw = Math.min(o.maxBar || 44, band * 0.62);
        var svg = svgRoot(W, H, o.label);
        svg.appendChild(s('line', { x1: 0, x2: W, y1: top + plotH + 0.5, y2: top + plotH + 0.5, stroke: C.base, 'stroke-width': 1 }));
        data.forEach(function (d, i) {
            var cx = band * i + band / 2;
            var bh = Math.max(d.value > 0 ? 2 : 0, plotH * d.value / max);
            var y = top + plotH - bh;
            var g = s('g', { 'class': 'ac-mark' });
            g.appendChild(s('rect', { x: band * i, y: 0, width: band, height: H, fill: 'transparent' }));
            g.appendChild(s('path', { d: colPath(cx - bw / 2, y, bw, bh), fill: d.color || C.purple }));
            g.appendChild(txt(cx, y - (d.subText ? 18 : 6), d.valueText !== undefined ? d.valueText : fmt(d.value),
                              { anchor: 'middle', size: 13, weight: 700, fill: C.ink }));
            if (d.subText) g.appendChild(txt(cx, y - 5, fit(d.subText, 10.5, 400, band - 4), { anchor: 'middle', size: 10.5 }));
            g.appendChild(txt(cx, top + plotH + 15, fit(d.label, 11.5, 600, band - 4), { anchor: 'middle', size: 11.5, weight: 600, fill: C.ink }));
            if (d.sub) g.appendChild(txt(cx, top + plotH + 29, fit(d.sub, 10.5, 400, band - 4), { anchor: 'middle', size: 10.5 }));
            hover(g, function () { return d.tip || { title: d.label, rows: [{ v: d.valueText || fmt(d.value), l: d.subText || '' }] }; }, true);
            svg.appendChild(g);
        });
        host.appendChild(svg);
    }

    /* ---------- trend: one shared time axis, stacked panels ----------
     * o.labels   one per bucket (short), o.titles one per bucket (tooltip)
     * o.panels   [{ kind: 'line'|'bars'|'stack', name, values | series,
     *               color, height, area, peak, fmt }]
     * o.markers  [{ index, label }]  a thin rule and a label (reminders)
     * One crosshair runs through every panel and the tooltip lists every
     * panel's value at that bucket. */
    function trend(host, o) {
        clear(host);
        var n = (o.labels || []).length;
        if (!n) { empty(host, o.empty); return; }
        var W = widthOf(host);
        var padL = 34, padR = o.padR || 12, gap = 18, axisH = 22;
        var plotW = W - padL - padR;
        var band = plotW / n;
        var xc = function (i) { return padL + band * i + band / 2; };
        var panels = o.panels || [];
        var markTop = (o.markers && o.markers.length) || (panels[0] && panels[0].peak) ? 18 : 6;
        var y0 = markTop, layout = [];
        panels.forEach(function (p, pi) {
            var ph = p.height || 140;
            var titleH = p.title ? 22 : 0;
            layout.push({ p: p, top: y0 + titleH, h: ph, titleY: y0 + 9 });
            y0 += titleH + ph + (pi < panels.length - 1 ? gap : 0);
        });
        var H = y0 + axisH;
        var svg = svgRoot(W, H, o.label);

        layout.forEach(function (L) {
            var p = L.p;
            var vals = p.kind === 'stack'
                ? Array.apply(null, Array(n)).map(function (_, i) {
                    return p.series.reduce(function (a, sr) { return a + (sr.values[i] || 0); }, 0); })
                : p.values;
            var vmax = Math.max.apply(null, vals.filter(function (v) { return v !== null && isFinite(v); }).concat([0]));
            var ticks = niceTicks(p.max || vmax || 1, p.ticks || 3);
            var tmax = ticks[ticks.length - 1] || 1;
            L.y = function (v) { return L.top + L.h - L.h * v / tmax; };
            if (p.title) svg.appendChild(txt(padL - 30, L.titleY, p.title, { size: 11, fill: C.muted }));
            ticks.forEach(function (tk) {
                var yy = Math.round(L.y(tk)) + 0.5;
                svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: yy, y2: yy,
                    stroke: tk === 0 ? C.base : C.grid, 'stroke-width': 1 }));
                svg.appendChild(txt(padL - 6, yy + 3.5, compact(tk), { anchor: 'end', size: 10.5 }));
            });
            if (p.kind === 'bars') {
                var bw = Math.max(1, Math.min(22, band - 2));
                p.values.forEach(function (v, i) {
                    if (!v) return;
                    var hh = Math.max(1.5, L.h * v / tmax);
                    var col = (p.colors && p.colors[i]) || p.color || C.gold;
                    svg.appendChild(s('path', { d: colPath(xc(i) - bw / 2, L.top + L.h - hh, bw, hh, Math.min(3, bw / 2)), fill: col }));
                });
            } else if (p.kind === 'stack') {
                var sbw = Math.max(1, Math.min(22, band - 2));
                for (var i = 0; i < n; i++) {
                    var acc = 0;
                    var total = vals[i];
                    p.series.forEach(function (sr, si) {
                        var v = sr.values[i] || 0;
                        if (!v) return;
                        var yTop = L.y(acc + v), yBot = L.y(acc);
                        var hh = yBot - yTop;
                        var isTop = (acc + v === total);
                        /* 2px of surface between segments */
                        var hDraw = Math.max(1, hh - (acc > 0 ? 2 : 0));
                        svg.appendChild(s('path', {
                            d: isTop ? colPath(xc(i) - sbw / 2, yTop, sbw, hDraw, Math.min(3, sbw / 2))
                                     : 'M' + (xc(i) - sbw / 2) + ',' + yTop + 'h' + sbw + 'v' + hDraw + 'h' + (-sbw) + 'Z',
                            fill: sr.color
                        }));
                        acc += v;
                    });
                }
            } else {
                var pts = [];
                p.values.forEach(function (v, i) { pts.push(v === null || v === undefined ? null : [xc(i), L.y(v)]); });
                var segs = [], cur = [];
                pts.forEach(function (pt) { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } });
                if (cur.length) segs.push(cur);
                segs.forEach(function (sg) {
                    var d = 'M' + sg.map(function (pt) { return pt[0].toFixed(1) + ',' + pt[1].toFixed(1); }).join('L');
                    if (p.area && sg.length > 1) {
                        svg.appendChild(s('path', { d: d + 'L' + sg[sg.length - 1][0].toFixed(1) + ',' + (L.top + L.h) +
                            'L' + sg[0][0].toFixed(1) + ',' + (L.top + L.h) + 'Z', fill: p.color || C.purple, 'fill-opacity': 0.1 }));
                    }
                    svg.appendChild(s('path', { d: d, fill: 'none', stroke: p.color || C.purple, 'stroke-width': 2,
                        'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
                    if (sg.length === 1) svg.appendChild(s('circle', { cx: sg[0][0], cy: sg[0][1], r: 3, fill: p.color || C.purple }));
                });
                if (p.peak && vmax > 0) {
                    var pi2 = p.values.indexOf(vmax);
                    var px = xc(pi2), py = L.y(vmax);
                    svg.appendChild(s('circle', { cx: px, cy: py, r: 4.5, fill: p.color || C.purple, stroke: C.surface, 'stroke-width': 2 }));
                    /* above the point, clear of the line, kept inside the plot */
                    var label = p.peak(pi2, vmax);
                    var lw = textW(label, 11.5, 700);
                    var lx = Math.max(padL + lw / 2, Math.min(W - padR - lw / 2, px));
                    svg.appendChild(txt(lx, py - 10, label, { anchor: 'middle', size: 11.5, weight: 700, fill: C.ink }));
                }
            }
        });

        /* x axis: as many labels as fit */
        var bottomY = layout.length ? layout[layout.length - 1].top + layout[layout.length - 1].h : H - axisH;
        var lw = Math.max.apply(null, o.labels.map(function (l) { return textW(l, 10.5, 400); })) + 14;
        var every = Math.max(1, Math.ceil(lw / band));
        o.labels.forEach(function (l, i) {
            if (i % every) return;
            svg.appendChild(txt(xc(i), bottomY + 15, l, { anchor: 'middle', size: 10.5 }));
        });

        (o.markers || []).forEach(function (m) {
            if (m.index < 0 || m.index >= n) return;
            var mx = Math.round(xc(m.index)) + 0.5;
            svg.appendChild(s('line', { x1: mx, x2: mx, y1: 12, y2: bottomY, stroke: C.ink, 'stroke-width': 1, 'stroke-opacity': 0.55 }));
            svg.appendChild(txt(mx, 9, m.label, { anchor: mx > W - 60 ? 'end' : (mx < 60 ? 'start' : 'middle'), size: 10.5, weight: 700, fill: C.ink }));
        });

        /* crosshair */
        var cross = s('line', { y1: markTop, y2: bottomY, stroke: C.ink, 'stroke-width': 1, 'stroke-opacity': 0.35, visibility: 'hidden' });
        svg.appendChild(cross);
        var hit = s('rect', { x: padL, y: 0, width: plotW, height: H, fill: 'transparent', 'class': 'ac-hit' });
        svg.appendChild(hit);
        function at(e) {
            var r = svg.getBoundingClientRect();
            var i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - padL) / band)));
            cross.setAttribute('x1', xc(i)); cross.setAttribute('x2', xc(i));
            cross.setAttribute('visibility', 'visible');
            var rows = [];
            layout.forEach(function (L) {
                var p = L.p, f = p.fmt || fmt;
                if (p.kind === 'stack') {
                    p.series.slice().reverse().forEach(function (sr) {
                        rows.push({ v: f(sr.values[i] || 0), l: sr.name, c: sr.color });
                    });
                } else if (p.values[i] !== null && p.values[i] !== undefined) {
                    rows.push({ v: f(p.values[i]), l: p.name, c: (p.colors && p.colors[i]) || p.color || (p.kind === 'bars' ? C.gold : C.purple) });
                }
            });
            var m = (o.markers || []).filter(function (mk) { return mk.index === i; })[0];
            return { title: (o.titles || o.labels)[i], rows: rows, note: m ? m.note || m.label : null };
        }
        hit.addEventListener('pointermove', function (e) { showTip(e.clientX, e.clientY, at(e)); });
        hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
        host.appendChild(svg);
        if (o.legend) host.appendChild(legend(o.legend));
    }

    /* ---------- lines on a numeric x (days since an issue came out) ---------- */
    /* o.series [{ name, color, values (null = no data yet), width }], o.xLabel(i) */
    function lines(host, o) {
        clear(host);
        var series = (o.series || []).filter(function (sr) { return sr.values.some(function (v) { return v !== null; }); });
        if (!series.length) { empty(host, o.empty); return; }
        var n = Math.max.apply(null, series.map(function (sr) { return sr.values.length; }));
        var W = widthOf(host), H = o.height || 240;
        var endLabelW = Math.max.apply(null, series.map(function (sr) { return textW(sr.endLabel || sr.name, 11, 700); })) + 14;
        var padL = 30, padR = Math.min(endLabelW, W * 0.35), padT = 10, padB = 24;
        var plotW = W - padL - padR, plotH = H - padT - padB;
        var vmax = Math.max.apply(null, series.map(function (sr) {
            return Math.max.apply(null, sr.values.filter(function (v) { return v !== null; }).concat([0])); }));
        var ticks = niceTicks(vmax || 1, 3), tmax = ticks[ticks.length - 1];
        var x = function (i) { return padL + (n > 1 ? plotW * i / (n - 1) : plotW / 2); };
        var y = function (v) { return padT + plotH - plotH * v / tmax; };
        var svg = svgRoot(W, H, o.label);
        ticks.forEach(function (tk) {
            var yy = Math.round(y(tk)) + 0.5;
            svg.appendChild(s('line', { x1: padL, x2: padL + plotW, y1: yy, y2: yy, stroke: tk === 0 ? C.base : C.grid }));
            svg.appendChild(txt(padL - 6, yy + 3.5, compact(tk), { anchor: 'end', size: 10.5 }));
        });
        var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 44))));
        for (var i = 0; i < n; i += step) svg.appendChild(txt(x(i), H - 6, o.xLabel ? o.xLabel(i) : String(i), { anchor: 'middle', size: 10.5 }));
        var ends = [];
        series.forEach(function (sr) {
            var pts = [];
            sr.values.forEach(function (v, i) { if (v !== null) pts.push([x(i), y(v), v, i]); });
            if (!pts.length) return;
            svg.appendChild(s('path', { d: 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L'),
                fill: 'none', stroke: sr.color, 'stroke-width': sr.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
            var last = pts[pts.length - 1];
            svg.appendChild(s('circle', { cx: last[0], cy: last[1], r: 4, fill: sr.color, stroke: C.surface, 'stroke-width': 2 }));
            ends.push({ x: last[0], y: last[1], text: sr.endLabel || sr.name, color: sr.color });
        });
        /* end labels: leader-free, but never on top of each other */
        ends.sort(function (a, b) { return a.y - b.y; });
        for (var k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
        ends.forEach(function (e) {
            svg.appendChild(txt(e.x + 8, e.y + 4, e.text, { size: 11, weight: 700, fill: C.ink }));
        });
        var cross = s('line', { y1: padT, y2: padT + plotH, stroke: C.ink, 'stroke-opacity': 0.35, visibility: 'hidden' });
        svg.appendChild(cross);
        var hit = s('rect', { x: padL - 6, y: 0, width: plotW + 12, height: H, fill: 'transparent', 'class': 'ac-hit' });
        svg.appendChild(hit);
        hit.addEventListener('pointermove', function (e) {
            var r = svg.getBoundingClientRect();
            var i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - padL) / (plotW / Math.max(1, n - 1)))));
            cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
            showTip(e.clientX, e.clientY, {
                title: o.xTitle ? o.xTitle(i) : String(i),
                rows: series.filter(function (sr) { return sr.values[i] !== null && sr.values[i] !== undefined; })
                    .map(function (sr) { return { v: fmt(sr.values[i]), l: sr.name, c: sr.color }; })
            });
        });
        hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
        host.appendChild(svg);
        if (o.legend !== false && series.length > 1) {
            host.appendChild(legend(series.map(function (sr) { return { name: sr.name, color: sr.color, shape: 'line' }; })));
        }
    }

    /* ---------- ranked bars (HTML): label, value, a thin bar ---------- */
    /* rows [{ label, value, valueText, color, note, tip, onClick, active }] */
    function rankBars(host, rows, o) {
        o = o || {};
        clear(host);
        if (!rows.length) { empty(host, o.empty); return; }
        var max = o.max || Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
        var list = h('div', { 'class': 'ac-rank' });
        rows.forEach(function (r) {
            var item = h(r.onClick ? 'button' : 'div', { 'class': 'ac-rank-i' + (r.active ? ' is-active' : ''), type: r.onClick ? 'button' : null });
            item.appendChild(h('div', { 'class': 'ac-rank-top' }, [
                h('span', { 'class': 'ac-rank-l', text: r.label }),
                h('span', { 'class': 'ac-rank-v', text: r.valueText !== undefined ? r.valueText : fmt(r.value) })
            ]));
            var track = h('div', { 'class': 'ac-rank-track' });
            track.appendChild(h('div', { 'class': 'ac-rank-fill',
                style: 'width:' + Math.max(r.value > 0 ? 1.2 : 0, 100 * r.value / max) + '%;background:' + (r.color || C.purple) }));
            item.appendChild(track);
            if (r.note) item.appendChild(h('div', { 'class': 'ac-rank-n', text: r.note }));
            if (r.tip) hover(item, function () { return r.tip; });
            if (r.onClick) item.addEventListener('click', r.onClick);
            list.appendChild(item);
        });
        host.appendChild(list);
    }

    /* ---------- funnel: ranked bars in course order, with the drop between ---------- */
    function funnel(host, steps, o) {
        o = o || {};
        clear(host);
        if (!steps.length || !steps[0].value) { empty(host, o.empty); return; }
        var total = o.total || steps[0].value;
        var worst = -1, worstDrop = 0;
        for (var i = 1; i < steps.length; i++) {
            var drop = steps[i - 1].value - steps[i].value;
            if (drop > worstDrop) { worstDrop = drop; worst = i; }
        }
        var list = h('div', { 'class': 'ac-rank ac-funnel' });
        steps.forEach(function (st, i) {
            if (i > 0) {
                var d = steps[i - 1].value - st.value;
                var t = d > 0 ? '↓ ' + fmt(d) + ' fewer' : (d < 0 ? '↑ ' + fmt(-d) + ' more' : 'no change');
                list.appendChild(h('div', { 'class': 'ac-funnel-d' + (i === worst ? ' is-worst' : ''), text: t }));
            }
            var item = h('div', { 'class': 'ac-rank-i' });
            item.appendChild(h('div', { 'class': 'ac-rank-top' }, [
                h('span', { 'class': 'ac-rank-l', text: st.label }),
                h('span', { 'class': 'ac-rank-v', text: fmt(st.value) + ' · ' + pct(st.value, total) + '%' })
            ]));
            var track = h('div', { 'class': 'ac-rank-track' });
            track.appendChild(h('div', { 'class': 'ac-rank-fill',
                style: 'width:' + (100 * st.value / total) + '%;background:' + (i === worst ? C.crit : C.purple) }));
            item.appendChild(track);
            list.appendChild(item);
        });
        host.appendChild(list);
    }

    /* ---------- 100% stacked rows (HTML) ---------- */
    /* rows [{ label, parts: [n, ...] }], cats [{ name, color, ink }] */
    function stack100(host, rows, cats, o) {
        o = o || {};
        clear(host);
        rows = rows.filter(function (r) { return r.parts.some(function (v) { return v > 0; }); });
        if (!rows.length) { empty(host, o.empty); return; }
        host.appendChild(legend(cats.map(function (c) { return { name: c.name, color: c.color }; })));
        var W = widthOf(host);
        var labelW = Math.min(110, Math.max.apply(null, rows.map(function (r) { return textW(r.label, 12, 700); })) + 12);
        var barW = W - labelW;
        var list = h('div', { 'class': 'ac-s100' });
        rows.forEach(function (r) {
            var total = r.parts.reduce(function (a, b) { return a + b; }, 0);
            var line = h('div', { 'class': 'ac-s100-r' });
            line.appendChild(h('div', { 'class': 'ac-s100-l', style: 'width:' + labelW + 'px', text: r.label }));
            var bar = h('div', { 'class': 'ac-s100-b' });
            r.parts.forEach(function (v, i) {
                if (!v) return;
                var share = v / total;
                var seg = h('div', { 'class': 'ac-s100-s', style: 'flex:' + v + ' 1 0px;background:' + cats[i].color + ';color:' + (cats[i].ink || '#fff') });
                var label = Math.round(share * 100) + '%';
                if (share * barW > textW(label, 11, 700) + 12) seg.appendChild(h('span', { text: label }));
                hover(seg, function () {
                    return { title: r.label + ' · ' + cats[i].name, rows: [{ v: Math.round(share * 100) + '%', l: fmt(v) + ' of ' + fmt(total) + (o.unit ? ' ' + o.unit : ''), c: cats[i].color }] };
                });
                bar.appendChild(seg);
            });
            line.appendChild(bar);
            list.appendChild(line);
        });
        host.appendChild(list);
    }

    /* ---------- donut: one whole, at most four parts ---------- */
    function donut(host, o) {
        clear(host);
        var parts = (o.parts || []).filter(function (p) { return p.value > 0; });
        var total = parts.reduce(function (a, p) { return a + p.value; }, 0);
        if (!total) { empty(host, o.empty); return; }
        var size = Math.min(o.size || 220, widthOf(host));
        var R = size / 2 - 2, r0 = R * 0.66, cx = size / 2, cy = size / 2;
        var svg = svgRoot(size, size, o.label);
        svg.setAttribute('class', 'ac-svg ac-donut');
        var a = -Math.PI / 2;
        parts.forEach(function (p) {
            var sweep = 2 * Math.PI * p.value / total;
            var a2 = a + sweep;
            var d;
            if (parts.length === 1) {
                d = 'M' + cx + ',' + (cy - R) + 'A' + R + ',' + R + ' 0 1 1 ' + (cx - 0.01) + ',' + (cy - R) + 'Z' +
                    'M' + cx + ',' + (cy - r0) + 'A' + r0 + ',' + r0 + ' 0 1 0 ' + (cx - 0.01) + ',' + (cy - r0) + 'Z';
            } else {
                var big = sweep > Math.PI ? 1 : 0;
                d = 'M' + (cx + R * Math.cos(a)) + ',' + (cy + R * Math.sin(a)) +
                    'A' + R + ',' + R + ' 0 ' + big + ' 1 ' + (cx + R * Math.cos(a2)) + ',' + (cy + R * Math.sin(a2)) +
                    'L' + (cx + r0 * Math.cos(a2)) + ',' + (cy + r0 * Math.sin(a2)) +
                    'A' + r0 + ',' + r0 + ' 0 ' + big + ' 0 ' + (cx + r0 * Math.cos(a)) + ',' + (cy + r0 * Math.sin(a)) + 'Z';
            }
            var path = s('path', { d: d, fill: p.color, stroke: C.surface, 'stroke-width': parts.length > 1 ? 2 : 0, 'fill-rule': 'evenodd', 'class': 'ac-mark' });
            hover(path, function () { return { title: p.name, rows: [{ v: fmt(p.value), l: pct(p.value, total) + '% of ' + fmt(total), c: p.color }] }; }, true);
            svg.appendChild(path);
            a = a2;
        });
        if (o.center) {
            svg.appendChild(txt(cx, cy + 4, o.center, { anchor: 'middle', size: Math.round(size * 0.17), weight: 700, fill: C.purple }));
            if (o.centerSub) svg.appendChild(txt(cx, cy + size * 0.13, o.centerSub, { anchor: 'middle', size: 11 }));
        }
        var wrap = h('div', { 'class': 'ac-donut-wrap' }, [svg]);
        host.appendChild(wrap);
        host.appendChild(legend(parts.map(function (p) { return { name: p.name + ': ' + fmt(p.value), color: p.color }; })));
    }

    /* ---------- dumbbell: opened (ring) vs finished (dot), grouped ---------- */
    /* groups [{ name, rows: [{ label, a, b, share, shareText, highlight }] }] */
    function dumbbell(host, o) {
        clear(host);
        var groups = (o.groups || []).filter(function (g) { return g.rows.length; });
        if (!groups.length) { empty(host, o.empty); return; }
        var W = widthOf(host);
        var allRows = [].concat.apply([], groups.map(function (g) { return g.rows; }));
        var narrow = W < 520;
        var labelW = narrow ? 0 : Math.min(W * 0.36, Math.max.apply(null, allRows.map(function (r) { return textW(r.label, 11.5, 400); })) + 12);
        var shareW = 46, padR = shareW + 8;
        var plotX = labelW + 8, plotW = W - plotX - padR;
        var rowH = narrow ? 40 : 27, groupH = 24, axisH = 22;
        var H = 8 + groups.length * groupH + allRows.length * rowH + axisH;
        var max = Math.max.apply(null, allRows.map(function (r) { return Math.max(r.a || 0, r.b || 0); })) || 1;
        var ticks = niceTicks(max, narrow ? 3 : 6), tmax = ticks[ticks.length - 1];
        var x = function (v) { return plotX + plotW * v / tmax; };
        var svg = svgRoot(W, H, o.label);
        var plotTop = 8, plotBottom = H - axisH;
        ticks.forEach(function (tk) {
            var xx = Math.round(x(tk)) + 0.5;
            svg.appendChild(s('line', { x1: xx, x2: xx, y1: plotTop, y2: plotBottom, stroke: tk === 0 ? C.base : C.grid }));
            svg.appendChild(txt(xx, H - 6, compact(tk), { anchor: 'middle', size: 10.5 }));
        });
        var yy = plotTop;
        groups.forEach(function (g) {
            svg.appendChild(txt(0, yy + 16, g.name.toUpperCase(), { size: 10.5, weight: 700, fill: C.purple, cls: 'ac-eyebrow-svg' }));
            yy += groupH;
            g.rows.forEach(function (r) {
                var cy = yy + rowH / 2 + (narrow ? 7 : 0);
                var row = s('g', { 'class': 'ac-mark' });
                row.appendChild(s('rect', { x: 0, y: yy, width: W, height: rowH, fill: 'transparent' }));
                if (narrow) row.appendChild(txt(plotX, yy + 11, fit(r.label, 11.5, 400, plotW), { size: 11.5, fill: C.ink }));
                else row.appendChild(txt(labelW, cy + 4, fit(r.label, 11.5, 400, labelW - 6), { anchor: 'end', size: 11.5, fill: C.ink }));
                if (r.a !== null && r.a !== undefined) {
                    row.appendChild(s('line', { x1: x(r.b || 0), x2: x(r.a), y1: cy, y2: cy, stroke: C.lav, 'stroke-width': 6, 'stroke-linecap': 'round' }));
                    row.appendChild(s('circle', { cx: x(r.a), cy: cy, r: 5, fill: C.surface, stroke: '#5B44C2', 'stroke-width': 2.2 }));
                }
                row.appendChild(s('circle', { cx: x(r.b || 0), cy: cy, r: 5.5, fill: r.highlight ? C.gold : C.purple, stroke: C.surface, 'stroke-width': 1.5 }));
                row.appendChild(txt(W - shareW, cy + 4, r.shareText, { size: 11.5, weight: 700, fill: r.highlight ? C.crit : C.ink }));
                hover(row, function () {
                    return { title: r.label, rows: [
                        { v: r.a === null || r.a === undefined ? 'n/a' : fmt(r.a), l: 'opened it', c: '#5B44C2' },
                        { v: fmt(r.b || 0), l: 'finished it', c: C.purple },
                        { v: r.shareText, l: 'of openers finished' }
                    ], note: r.note || null };
                }, true);
                svg.appendChild(row);
                yy += rowH;
            });
        });
        host.appendChild(svg);
    }

    /* ---------- lollipop: a count per whole number ---------- */
    function lollipop(host, o) {
        clear(host);
        var data = o.data || [];
        if (!data.length || !data.some(function (d) { return d.value; })) { empty(host, o.empty); return; }
        var W = widthOf(host), H = o.height || 210;
        var top = 26, bottom = o.xTitle ? 38 : 22, plotH = H - top - bottom;
        var max = Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
        var band = W / data.length;
        var svg = svgRoot(W, H, o.label);
        svg.appendChild(s('line', { x1: 0, x2: W, y1: top + plotH + 0.5, y2: top + plotH + 0.5, stroke: C.base }));
        data.forEach(function (d, i) {
            var cx = band * i + band / 2;
            var yv = top + plotH - plotH * d.value / max;
            var g = s('g', { 'class': 'ac-mark' });
            g.appendChild(s('rect', { x: band * i, y: 0, width: band, height: H, fill: 'transparent' }));
            if (d.value > 0) {
                g.appendChild(s('line', { x1: cx, x2: cx, y1: top + plotH, y2: yv, stroke: d.color || C.purple, 'stroke-width': 3 }));
                g.appendChild(s('circle', { cx: cx, cy: yv, r: Math.min(6.5, band / 3), fill: d.color || C.purple, stroke: C.surface, 'stroke-width': 1.5 }));
            }
            if (band > 16 || d.value === max) g.appendChild(txt(cx, yv - 10, fmt(d.value), { anchor: 'middle', size: 11.5, weight: 700, fill: C.ink }));
            g.appendChild(txt(cx, top + plotH + 15, d.label, { anchor: 'middle', size: 10.5 }));
            hover(g, function () { return d.tip; }, true);
            svg.appendChild(g);
        });
        if (o.xTitle) svg.appendChild(txt(W / 2, H - 4, o.xTitle, { anchor: 'middle', size: 11 }));
        host.appendChild(svg);
    }

    /* ---------- heat grid (HTML) ---------- */
    /* rowLabels, colLabels, values[r][c], tip(r, c, v), colEvery */
    function heat(host, o) {
        clear(host);
        var max = 0;
        o.values.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });
        if (!max) { empty(host, o.empty); return; }
        var W = widthOf(host);
        var cols = o.colLabels.length;
        var labelW = 34;
        var cell = Math.max(8, Math.floor((W - labelW) / cols) - 2);
        var grid = h('div', { 'class': 'ac-heat', style: 'grid-template-columns:' + labelW + 'px repeat(' + cols + ',' + cell + 'px)' });
        o.values.forEach(function (row, r) {
            grid.appendChild(h('div', { 'class': 'ac-heat-rl', text: o.rowLabels[r] }));
            row.forEach(function (v, c) {
                var t = Math.sqrt(v / max);
                var cellEl = h('div', { 'class': 'ac-heat-c', style: 'height:' + Math.max(cell * 0.8, 14) + 'px;background:' + ramp(v ? t : 0) });
                hover(cellEl, function () { return o.tip(r, c, v); });
                grid.appendChild(cellEl);
            });
        });
        grid.appendChild(h('div'));
        var every = o.colEvery || Math.ceil(30 / (cell + 2));
        o.colLabels.forEach(function (l, c) {
            grid.appendChild(h('div', { 'class': 'ac-heat-cl', text: c % every ? '' : l }));
        });
        host.appendChild(grid);
        var scale = h('div', { 'class': 'ac-heat-scale' }, [h('span', { text: 'Less' })]);
        [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
            scale.appendChild(h('span', { 'class': 'ac-heat-sw', style: 'background:' + ramp(t === 0 ? 0 : t) }));
        });
        scale.appendChild(h('span', { text: 'More (busiest: ' + fmt(max) + (o.unit ? ' ' + o.unit : '') + ')' }));
        host.appendChild(scale);
    }

    /* ---------- calendar: one square per day, weeks as columns ---------- */
    /* days [{ key, label, value }] in order, starting on a Monday */
    function calendar(host, o) {
        clear(host);
        var days = o.days || [];
        if (!days.length) { empty(host, o.empty); return; }
        var max = Math.max.apply(null, days.map(function (d) { return d.value; })) || 1;
        var weeks = Math.ceil(days.length / 7);
        var W = widthOf(host);
        var cell = Math.max(9, Math.min(14, Math.floor((W - 30) / weeks) - 3));
        var grid = h('div', { 'class': 'ac-cal', style: 'grid-template-columns:repeat(' + weeks + ',' + cell + 'px);grid-template-rows:repeat(7,' + cell + 'px)' });
        days.forEach(function (d) {
            var c = h('div', { 'class': 'ac-cal-c', style: 'background:' + (d.value ? ramp(0.25 + 0.75 * d.value / max) : '#f1eff7') });
            hover(c, function () { return { title: d.label, rows: [{ v: fmt(d.value), l: o.unit || '' }] }; });
            grid.appendChild(c);
        });
        host.appendChild(h('div', { 'class': 'ac-cal-scroll' }, [grid]));
    }

    /* ---------- treemap (HTML, squarified) ---------- */
    /* items [{ name, value, sub }], o.onClick(item), o.active (name) */
    function treemap(host, o) {
        clear(host);
        var items = (o.items || []).filter(function (it) { return it.value > 0; })
            .sort(function (a, b) { return b.value - a.value; });
        if (!items.length) { empty(host, o.empty); return; }
        var W = widthOf(host), H = o.height || 300;
        var total = items.reduce(function (a, it) { return a + it.value; }, 0);
        var scale = W * H / total;
        var nodes = items.map(function (it) { return { it: it, area: it.value * scale }; });
        var rects = [];
        (function squarify(list, x, y, w, ht) {
            if (!list.length) return;
            if (list.length === 1) { rects.push({ n: list[0], x: x, y: y, w: w, h: ht }); return; }
            var side = Math.min(w, ht), row = [], i = 0, best = Infinity;
            function worst(r) {
                var sum = r.reduce(function (a, n) { return a + n.area; }, 0);
                var mx = Math.max.apply(null, r.map(function (n) { return n.area; }));
                var mn = Math.min.apply(null, r.map(function (n) { return n.area; }));
                return Math.max(side * side * mx / (sum * sum), (sum * sum) / (side * side * mn));
            }
            while (i < list.length) {
                var trial = row.concat([list[i]]);
                var wv = worst(trial);
                if (wv <= best) { row = trial; best = wv; i++; } else break;
            }
            var sum = row.reduce(function (a, n) { return a + n.area; }, 0);
            if (w >= ht) {
                var cw = sum / ht, cy = y;
                row.forEach(function (n) { var rh = n.area / cw; rects.push({ n: n, x: x, y: cy, w: cw, h: rh }); cy += rh; });
                squarify(list.slice(i), x + cw, y, w - cw, ht);
            } else {
                var rhh = sum / w, cx = x;
                row.forEach(function (n) { var rw = n.area / rhh; rects.push({ n: n, x: cx, y: y, w: rw, h: rhh }); cx += rw; });
                squarify(list.slice(i), x, y + rhh, w, ht - rhh);
            }
        })(nodes, 0, 0, W, H);
        var box = h('div', { 'class': 'ac-tree', style: 'height:' + H + 'px' });
        rects.forEach(function (r) {
            var it = r.n.it;
            var active = o.active && o.active === it.name;
            var b = h('button', {
                type: 'button', 'class': 'ac-tree-b' + (active ? ' is-active' : ''),
                style: 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + Math.max(0, r.w - 2) + 'px;height:' + Math.max(0, r.h - 2) + 'px',
                'aria-label': it.name + ', ' + fmt(it.value) + ' page views'
            });
            var share = (100 * it.value / total).toFixed(1) + '%';
            if (r.w > 64 && r.h > 34) {
                b.appendChild(h('span', { 'class': 'ac-tree-n', text: fit(it.name, 12, 700, r.w - 16) }));
                b.appendChild(h('span', { 'class': 'ac-tree-v', text: share }));
            }
            hover(b, function () { return { title: it.name, rows: [{ v: fmt(it.value), l: 'page views · ' + share }], note: it.sub || null }; });
            if (o.onClick) b.addEventListener('click', function () { o.onClick(it); });
            box.appendChild(b);
        });
        host.appendChild(box);
    }

    /* ---------- radial: 24 hours round a clock ---------- */
    function radial(host, o) {
        clear(host);
        var v = o.values || [];
        var max = Math.max.apply(null, v.concat([0]));
        if (!max) { empty(host, o.empty); return; }
        var size = Math.min(o.size || 280, widthOf(host));
        var c = size / 2, r0 = size * 0.14, R = size / 2 - 26;
        var svg = svgRoot(size, size, o.label);
        [0.5, 1].forEach(function (f) {
            svg.appendChild(s('circle', { cx: c, cy: c, r: r0 + (R - r0) * f, fill: 'none', stroke: C.grid }));
        });
        var top = (o.highlight || []);
        v.forEach(function (val, hr) {
            if (!val) return;
            var a1 = (hr / 24) * 2 * Math.PI - Math.PI / 2 + 0.025;
            var a2 = ((hr + 1) / 24) * 2 * Math.PI - Math.PI / 2 - 0.025;
            var rr = r0 + (R - r0) * val / max;
            var d = 'M' + (c + r0 * Math.cos(a1)) + ',' + (c + r0 * Math.sin(a1)) +
                    'L' + (c + rr * Math.cos(a1)) + ',' + (c + rr * Math.sin(a1)) +
                    'A' + rr + ',' + rr + ' 0 0 1 ' + (c + rr * Math.cos(a2)) + ',' + (c + rr * Math.sin(a2)) +
                    'L' + (c + r0 * Math.cos(a2)) + ',' + (c + r0 * Math.sin(a2)) +
                    'A' + r0 + ',' + r0 + ' 0 0 0 ' + (c + r0 * Math.cos(a1)) + ',' + (c + r0 * Math.sin(a1)) + 'Z';
            var p = s('path', { d: d, fill: top.indexOf(hr) !== -1 ? C.gold : C.purple, 'class': 'ac-mark' });
            hover(p, function () { return { title: o.hourLabel(hr), rows: [{ v: fmt(val), l: o.unit || '' }] }; }, true);
            svg.appendChild(p);
        });
        [['12am', 0], ['6am', 6], ['12pm', 12], ['6pm', 18]].forEach(function (lb) {
            var a = (lb[1] / 24) * 2 * Math.PI - Math.PI / 2;
            svg.appendChild(txt(c + (R + 14) * Math.cos(a), c + (R + 14) * Math.sin(a) + 4, lb[0], { anchor: 'middle', size: 10.5 }));
        });
        svg.appendChild(txt(c, c + 4, '24h', { anchor: 'middle', size: 11, weight: 700, fill: C.ink }));
        host.appendChild(h('div', { 'class': 'ac-donut-wrap' }, [svg]));
    }

    /* ---------- waffle: one square per person ---------- */
    /* groups [{ name, count, color, people: [names] }] */
    function waffle(host, o) {
        clear(host);
        var groups = o.groups || [];
        var total = groups.reduce(function (a, g) { return a + g.count; }, 0);
        if (!total) { empty(host, o.empty); return; }
        var box = h('div', { 'class': 'ac-waffle' });
        groups.forEach(function (g) {
            for (var i = 0; i < g.count; i++) {
                var sq = h('span', { 'class': 'ac-waffle-s', style: 'background:' + g.color });
                (function (name) {
                    hover(sq, function () { return { title: g.name, rows: name ? [{ v: name }] : [] }; });
                })(g.people && g.people[i]);
                box.appendChild(sq);
            }
        });
        host.appendChild(box);
        host.appendChild(legend(groups.map(function (g) { return { name: g.name + ': ' + fmt(g.count), color: g.color }; })));
    }

    /* ---------- sparkline for a stat tile ---------- */
    function spark(host, values, o) {
        o = o || {};
        clear(host);
        if (!values || values.length < 2) return;
        var W = o.width || 120, H = o.height || 28;
        var max = Math.max.apply(null, values.concat([1]));
        var x = function (i) { return 2 + (W - 4) * i / (values.length - 1); };
        var y = function (v) { return H - 3 - (H - 6) * v / max; };
        var svg = svgRoot(W, H, o.label || 'trend');
        svg.setAttribute('class', 'ac-svg ac-spark');
        svg.appendChild(s('path', { d: 'M' + values.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('L'),
            fill: 'none', stroke: o.color || 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-opacity': 0.8 }));
        svg.appendChild(s('circle', { cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 2.6, fill: o.color || 'currentColor' }));
        host.appendChild(svg);
    }

    window.AisaCharts = {
        C: C, CAT: CAT, h: h, clear: clear, fmt: fmt, fmt1: fmt1, pct: pct, textW: textW, ramp: ramp,
        legend: legend, empty: empty, tableView: tableView, showTip: showTip, hideTip: hideTip, hover: hover,
        columns: columns, trend: trend, lines: lines, rankBars: rankBars, funnel: funnel, stack100: stack100,
        donut: donut, dumbbell: dumbbell, lollipop: lollipop, heat: heat, calendar: calendar,
        treemap: treemap, radial: radial, waffle: waffle, spark: spark
    };
})();
