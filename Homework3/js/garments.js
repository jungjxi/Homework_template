/* Mind Wardrobe — garment catalogue, temperature mapping and cut-paper SVG artwork */
(function () {
  'use strict';
  const MW = window.MW;
  const U = MW.util;

  const MIN_T = -20;
  const MAX_T = 40;
  const CREAM = '#fcfbf8';
  const VB = { w: 400, h: 460 };

  // Soft flat palette: periwinkle · green · mauve · sky · yellow · orange (cold → warm)
  const TYPES = {
    puffer: { name: '패딩 점퍼', min: -20, max: -11, base: '#6283bd', dark: '#4c6ca5', accent: '#f3cd5e', thick: 22 },
    coat: { name: '코트', min: -10, max: 0, base: '#55966a', dark: '#427d56', accent: '#ec8f5e', thick: 17 },
    sweater: { name: '스웨터', min: 1, max: 10, base: '#d9b0da', dark: '#c294c4', accent: '#55966a', thick: 18 },
    longSleeve: { name: '긴소매 셔츠', min: 11, max: 20, base: '#93b2d8', dark: '#7797c2', accent: '#ec8f5e', thick: 13 },
    tshirt: { name: '티셔츠', min: 21, max: 30, base: '#f3cd5e', dark: '#dcb33f', accent: '#6283bd', thick: 12 },
    sleeveless: { name: '민소매', min: 31, max: 40, base: '#ec8f5e', dark: '#d57647', accent: '#d9b0da', thick: 10 },
  };
  const ORDER = ['puffer', 'coat', 'sweater', 'longSleeve', 'tshirt', 'sleeveless'];

  // Note papers — pale tints taken from the same palette.
  const PAPERS = ['#fffefb', '#f6eaf6', '#fcf2d6', '#e5f0e8', '#e6eef8'];

  function typeFor(t) {
    const v = Math.round(U.clamp(t, MIN_T, MAX_T));
    for (const k of ORDER) if (v <= TYPES[k].max) return k;
    return 'sleeveless';
  }

  // Colour stays tied to the type, with a small shift inside each range so
  // neighbouring garments of the same kind are still distinguishable.
  // A loose description of how a temperature felt, shown next to the number.
  const FEELS = [
    [-16, '꽁꽁 얼어붙었어요'],
    [-11, '몹시 추웠어요'],
    [-6, '추웠어요'],
    [0, '꽤 쌀쌀했어요'],
    [5, '조금 쌀쌀했어요'],
    [10, '서늘했어요'],
    [15, '선선했어요'],
    [20, '포근했어요'],
    [25, '따뜻했어요'],
    [30, '조금 더웠어요'],
    [35, '더웠어요'],
    [40, '뜨거웠어요'],
  ];
  function feelFor(t) {
    const v = Math.round(t);
    for (const [max, text] of FEELS) if (v <= max) return text;
    return FEELS[FEELS.length - 1][1];
  }

  function colorsFor(t) {
    const type = typeFor(t);
    const T = TYPES[type];
    const u = (U.clamp(Math.round(t), T.min, T.max) - T.min) / Math.max(1, T.max - T.min);
    const k = (0.5 - u) * 0.2;
    const shade = (c) => (k >= 0 ? U.mix(c, '#f5f3ef', k * 0.7) : U.mix(c, '#262a33', -k * 0.4));
    const base = shade(T.base);
    const dark = shade(T.dark);
    return {
      type,
      base,
      dark,
      accent: T.accent,
      accentDark: U.mix(T.accent, '#262a33', 0.28),
      sleeve: U.mix(base, dark, 0.32),
      cream: CREAM,
      top: U.mix(base, '#f5f3ef', 0.3),
      plate: U.mix(base, '#f5f3ef', 0.74),
      side: U.mix(dark, '#262a33', 0.1),
    };
  }

  function paperFor(noteId) {
    return PAPERS[U.hash(String(noteId)) % PAPERS.length];
  }

  // New note ids are chosen so a note never shares paper colour with the one before it.
  function newNoteId(prevId) {
    const avoid = prevId ? paperFor(prevId) : null;
    let id = U.uid('note');
    for (let i = 0; i < 12 && avoid && paperFor(id) === avoid; i++) id = U.uid('note');
    return id;
  }

  /* ------------------------------------------------------------------ */
  /* Garment geometry (viewBox 0 0 400 460, centre line x = 200)          */
  /* Each item: {pts, fill, r} | {poly, stroke, w} | {d, stroke|fill} | {c} */
  /* ------------------------------------------------------------------ */

  const SPECS = {
    puffer() {
      const R = [[200, 60], [248, 54], [292, 64], [312, 94]];
      const seams = [96, 160, 226, 292, 358, 412];
      R.push([314, 96]);
      for (let i = 0; i < seams.length - 1; i++) {
        R.push(...U.bumps([314 + i, seams[i]], [315 + i, seams[i + 1]], 1, 10, 1, 5));
      }
      R.push([304, 424], [252, 432], [200, 434]);
      const so = [330, 80];
      const se = [378, 318];
      const si0 = [342, 326];
      const si1 = [306, 130];
      const sleeve = [{ pts: [[298, 62], so, ...U.bumps(so, se, 4, 8, 1, 4), si0, si1], fill: 'sleeve', r: 6 }];
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        sleeve.push({
          poly: [
            [U.lerp(si1[0], si0[0], t) + 2, U.lerp(si1[1], si0[1], t)],
            [U.lerp(so[0], se[0], t) + 2, U.lerp(so[1], se[1], t)],
          ],
          stroke: 'top',
          w: 3.5,
        });
      }
      sleeve.push({ pts: [[342, 318], [379, 312], [382, 346], [346, 352]], fill: 'dark', r: 6 });
      const details = [];
      for (const y of [160, 226, 292, 358]) details.push({ d: `M96 ${y} Q200 ${y + 8} 304 ${y}`, stroke: 'top', w: 4 });
      details.push({ pts: [[160, 22], [240, 22], [244, 70], [156, 70]], fill: 'base', r: 12 });
      details.push({ d: 'M162 48 Q200 53 238 48', stroke: 'top', w: 3.5 });
      details.push({ poly: [[200, 72], [200, 430]], stroke: 'top', w: 3 });
      details.push({ pts: [[193, 74], [207, 74], [207, 98], [193, 98]], fill: 'cream', r: 3, j: 0.4 });
      const box = { x: 222, y: 298, w: 66, h: 64 };
      return {
        body: R,
        bodyR: 6,
        sleeve,
        pivot: [302, 66],
        details,
        pocket: [[222, 298], [286, 296], [290, 360], [226, 364]],
        pocketR: 12,
        box,
      };
    },

    coat() {
      const lapel = [[228, 36], [248, 44], [240, 98], [258, 110], [210, 198], [203, 170]];
      const box = { x: 230, y: 316, w: 60, h: 70 };
      const pocket = [[230, 318], [288, 314], [292, 382], [234, 386]];
      return {
        body: [[200, 44], [232, 34], [292, 52], [304, 112], [310, 260], [322, 436], [200, 442]],
        bodyR: 7,
        sleeve: [
          { pts: [[288, 50], [312, 60], [338, 160], [356, 318], [322, 326], [310, 240], [300, 118]], fill: 'sleeve' },
          { pts: [[318, 298], [354, 292], [357, 320], [322, 327]], fill: 'dark', r: 4 },
        ],
        pivot: [292, 52],
        details: [
          { pts: [[170, 38], [230, 38], [203, 172], [197, 172]], fill: 'cream', r: 4 },
          { pts: [[174, 28], [226, 28], [234, 42], [166, 42]], fill: 'dark', r: 6 },
          { pts: lapel, fill: 'dark', r: 5 },
          { pts: U.mirror(lapel), fill: 'dark', r: 5 },
          { poly: [[211, 200], [214, 438]], stroke: 'dark', w: 2.5, op: 0.7 },
          { c: [178, 228, 7], fill: 'cream' },
          { c: [222, 228, 7], fill: 'cream' },
          { c: [178, 284, 7], fill: 'cream' },
          { c: [222, 284, 7], fill: 'cream' },
          { pts: U.mirror(pocket), fill: 'accent', r: 6 },
          { poly: [[118, 326], [162, 323]], stroke: 'accentDark', w: 2, dash: '5 4' },
        ],
        pocket,
        pocketR: 6,
        box,
      };
    },

    sweater() {
      const details = [
        { pts: U.sym([[200, 62], [220, 59], [234, 49], [242, 40], [253, 42], [246, 62], [226, 76], [200, 78]]), fill: 'dark', r: 3 },
        { pts: U.sym([[200, 380], [309, 376], [312, 414], [200, 420]]), fill: 'dark', r: 5 },
      ];
      for (let x = 104; x <= 296; x += 14) details.push({ poly: [[x, 386], [x + 1, 412]], stroke: 'base', w: 2.2, op: 0.55 });
      for (const cx of [140, 260]) {
        for (let y = 104; y <= 352; y += 24) {
          details.push({ poly: [[cx - 9, y], [cx, y + 9], [cx + 9, y]], stroke: 'dark', w: 3, op: 0.6 });
        }
      }
      return {
        body: [[200, 62], [220, 59], [234, 49], [242, 40], [294, 56], [306, 92], [310, 380], [312, 414], [200, 420]],
        bodyR: 7,
        sleeve: [
          { pts: [[290, 54], [318, 68], [350, 170], [370, 300], [374, 322], [330, 328], [326, 300], [306, 190], [302, 110]], fill: 'sleeve' },
          { pts: [[330, 316], [374, 312], [378, 350], [334, 356]], fill: 'dark', r: 5 },
          { poly: [[342, 318], [344, 352]], stroke: 'base', w: 2, op: 0.55 },
          { poly: [[356, 316], [358, 350]], stroke: 'base', w: 2, op: 0.55 },
        ],
        pivot: [294, 58],
        details,
        pocket: [[156, 264], [244, 262], [248, 336], [152, 338]],
        pocketR: 7,
        box: { x: 156, y: 263, w: 90, h: 74 },
      };
    },

    longSleeve() {
      const collar = [[200, 66], [232, 34], [250, 46], [226, 98]];
      const details = [
        { pts: [[166, 32], [234, 32], [240, 48], [160, 48]], fill: 'dark', r: 6 },
        { pts: [[192, 74], [208, 74], [208, 440], [192, 440]], fill: 'dark', r: 2, j: 0.6 },
        { pts: collar, fill: 'cream', r: 4 },
        { pts: U.mirror(collar), fill: 'cream', r: 4 },
      ];
      for (const y of [124, 184, 244, 304, 364]) details.push({ c: [200, y, 5], fill: 'cream' });
      return {
        body: [[200, 62], [232, 40], [290, 54], [300, 110], [302, 300], [306, 404], [296, 428], [252, 438], [200, 440]],
        bodyR: 7,
        sleeve: [
          { pts: [[284, 54], [306, 62], [338, 160], [360, 282], [324, 290], [312, 200], [298, 118]], fill: 'sleeve' },
          { pts: [[322, 278], [362, 272], [368, 318], [328, 324]], fill: 'dark', r: 5 },
          { c: [348, 306, 3.5], fill: 'cream' },
        ],
        pivot: [288, 56],
        details,
        pocket: [[222, 132], [274, 132], [274, 180], [248, 192], [222, 180]],
        pocketR: 5,
        box: { x: 222, y: 132, w: 52, h: 58 },
      };
    },

    tshirt() {
      return {
        body: [[200, 70], [214, 67], [226, 58], [233, 40], [290, 58], [298, 150], [300, 290], [305, 426], [200, 432]],
        bodyR: 7,
        sleeve: [
          { pts: [[284, 56], [306, 62], [372, 132], [338, 176], [300, 152], [294, 100]], fill: 'sleeve' },
          { pts: [[361, 120], [375, 134], [342, 175], [328, 163]], fill: 'dark', r: 4 },
        ],
        pivot: [288, 60],
        details: [
          { pts: U.sym([[200, 70], [214, 67], [226, 58], [233, 40], [244, 42], [237, 64], [220, 79], [200, 82]]), fill: 'dark', r: 3 },
          { pts: U.sym([[200, 410], [303, 406], [305, 426], [200, 432]]), fill: 'dark', r: 4 },
        ],
        pocket: [[220, 150], [270, 150], [270, 198], [262, 206], [228, 206], [220, 198]],
        pocketR: 5,
        box: { x: 220, y: 150, w: 50, h: 56 },
      };
    },

    sleeveless() {
      const strap = [[233, 34], [258, 32], [259, 46], [232, 48]];
      return {
        body: [[200, 96], [214, 92], [225, 80], [231, 60], [233, 34], [258, 32], [261, 66], [271, 102], [287, 130], [306, 146], [302, 290], [310, 428], [200, 434]],
        bodyR: 6,
        sleeve: null,
        pivot: null,
        details: [
          { pts: strap, fill: 'dark', r: 4 },
          { pts: U.mirror(strap), fill: 'dark', r: 4 },
          { pts: U.sym([[200, 406], [307, 402], [310, 428], [200, 434]]), fill: 'dark', r: 4 },
        ],
        pocket: [[216, 176], [274, 176], [274, 226], [262, 240], [228, 240], [216, 226]],
        pocketR: 5,
        box: { x: 216, y: 176, w: 58, h: 64 },
      };
    },
  };

  function compileItem(item, seed, mirror) {
    const out = Object.assign({}, item);
    if (item.pts) {
      const pts = mirror ? U.mirror(item.pts) : item.pts;
      out.d = U.cutPath(pts, { r: item.r == null ? 7 : item.r, jitter: item.j == null ? 0.6 : item.j, seed });
    } else if (item.poly) {
      out.d = U.polyPath(mirror ? U.mirror(item.poly) : item.poly);
    } else if (item.c && mirror) {
      out.c = [400 - item.c[0], item.c[1], item.c[2]];
    }
    return out;
  }

  const GEO = {};
  function geom(type) {
    if (GEO[type]) return GEO[type];
    const S = SPECS[type]();
    let seed = (ORDER.indexOf(type) + 1) * 101;
    const next = () => ++seed;
    const g = {
      pivot: S.pivot,
      box: S.box,
      body: U.cutPath(U.sym(S.body), { r: S.bodyR, jitter: 0.7, seed: next() }),
      sleeveR: S.sleeve ? S.sleeve.map((it) => compileItem(it, next(), false)) : null,
      sleeveL: S.sleeve ? S.sleeve.map((it) => compileItem(it, next(), true)) : null,
      details: S.details.map((it) => compileItem(it, next(), false)),
      pocket: U.cutPath(S.pocket, { r: S.pocketR, jitter: 0.4, seed: next() }),
      stitch: U.polyPath([[S.box.x + 8, S.box.y + 9], [S.box.x + S.box.w - 8, S.box.y + 9]]),
    };
    GEO[type] = g;
    return g;
  }

  function partSVG(p, C) {
    const col = (k) => C[k] || k;
    const op = p.op ? ` opacity="${p.op}"` : '';
    if (p.c) return `<circle cx="${p.c[0]}" cy="${p.c[1]}" r="${p.c[2]}" fill="${col(p.fill)}"${op}/>`;
    if (p.stroke) {
      const dash = p.dash ? ` stroke-dasharray="${p.dash}"` : '';
      return `<path d="${p.d}" fill="none" stroke="${col(p.stroke)}" stroke-width="${p.w || 3}" stroke-linecap="round" stroke-linejoin="round"${dash}${op}/>`;
    }
    return `<path d="${p.d}" fill="${col(p.fill)}"${op}/>`;
  }

  // Positions of the folded paper slips sitting inside a garment pocket.
  function slipRects(type, count) {
    const p = geom(type).box;
    const k = U.clamp(count, 1, 4);
    const sw = Math.min(p.w * 0.46, 32);
    const sh = p.h * 0.82;
    const rots = [-6, 5, -2, 7];
    const out = [];
    for (let i = 0; i < k; i++) {
      const x = k === 1 ? p.x + (p.w - sw) / 2 : p.x + p.w * 0.08 + (i * (p.w * 0.84 - sw)) / (k - 1);
      out.push({ x, y: p.y - 13 + (i % 2) * 5, w: sw, h: sh, rot: rots[i] });
    }
    return out;
  }

  function slipSVG(s, i, paper, hidden) {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const l = s.x + 5;
    const r = s.x + s.w - 6;
    return (
      `<g class="gm-slip" data-i="${i}"${hidden ? ' style="opacity:0"' : ''}>` +
      `<g transform="rotate(${s.rot} ${cx.toFixed(1)} ${cy.toFixed(1)})">` +
      `<rect x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}" width="${s.w.toFixed(1)}" height="${s.h.toFixed(1)}" rx="2" fill="${paper}"/>` +
      `<path d="M${l} ${(s.y + 6).toFixed(1)}H${r}M${l} ${(s.y + 11).toFixed(1)}H${(r - 6).toFixed(1)}" stroke="#262a33" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>` +
      `<path d="M${s.x + 2} ${cy.toFixed(1)}H${s.x + s.w - 2}" stroke="#262a33" stroke-width="1.2" opacity=".12"/>` +
      `</g></g>`
    );
  }

  /**
   * Unfolded garment.
   * opts.slips: array of note ids whose paper slips sit in the pocket.
   * opts.hideSlips: render the slips invisible (they are revealed by the save animation).
   */
  function garmentSVG(temp, opts) {
    const o = opts || {};
    const type = typeFor(temp);
    const g = geom(type);
    const C = colorsFor(temp);
    const slips = o.slips || [];
    const sr = slips.length ? slipRects(type, slips.length) : [];
    const parts = [];
    parts.push(`<svg class="garment" viewBox="0 0 ${VB.w} ${VB.h}" data-type="${type}" aria-hidden="true" focusable="false">`);
    if (g.sleeveL) {
      // sleeves fold inward around the shoulder (data-px/py = pivot, data-dir = rotation sign)
      const [px, py] = g.pivot;
      parts.push(`<g class="gm-sleeve" data-px="${400 - px}" data-py="${py}" data-dir="-1">${g.sleeveL.map((p) => partSVG(p, C)).join('')}</g>`);
      parts.push(`<g class="gm-sleeve" data-px="${px}" data-py="${py}" data-dir="1">${g.sleeveR.map((p) => partSVG(p, C)).join('')}</g>`);
    }
    parts.push(`<path class="gm-body" d="${g.body}" fill="${C.base}"/>`);
    parts.push(`<g class="gm-details">${g.details.map((p) => partSVG(p, C)).join('')}</g>`);
    parts.push(`<g class="gm-slips">${sr.map((s, i) => slipSVG(s, i, paperFor(slips[i]), o.hideSlips)).join('')}</g>`);
    parts.push(
      `<g class="gm-pocket"><path d="${g.pocket}" fill="${C.accent}"/>` +
        `<path d="${g.stitch}" stroke="${C.accentDark}" stroke-width="2.2" stroke-dasharray="5 4" stroke-linecap="round" fill="none"/></g>`
    );
    parts.push('</svg>');
    return parts.join('');
  }

  /* ------------------------------------------------------------------ */
  /* Folded garment filed like a book: a tall slab with a rounded fold  */
  /* on top. Identified only by colour, thickness (= warmth of the       */
  /* garment) and a quiet fabric texture. Note slips peek out on top    */
  /* like bookmarks.                                                     */
  /* ------------------------------------------------------------------ */
  const SLAB = {
    puffer: { t: 44, h: 138 },
    coat: { t: 36, h: 148 },
    sweater: { t: 32, h: 136 },
    longSleeve: { t: 24, h: 142 },
    tshirt: { t: 20, h: 132 },
    sleeveless: { t: 16, h: 126 },
  };
  const MARK = 12; // headroom for the bookmark slips

  function bundleSize(temp) {
    const s = SLAB[typeFor(temp)];
    return { w: s.t, h: s.h + MARK, body: s.h, top: MARK };
  }

  function bundle(rec) {
    const type = typeFor(rec.temperature);
    const C = colorsFor(rec.temperature);
    const S = bundleSize(rec.temperature);
    const T = S.w;
    const y0 = S.top;
    const yb = S.h;
    const rr = Math.min(10, T * 0.4); // soft folded corners, flat-ish top
    const cx = T / 2;
    const f1 = (n) => n.toFixed(1);
    const clip = U.uid('slab');
    const out = [];
    out.push(`<svg viewBox="0 0 ${T} ${S.h}" width="${T}" height="${S.h}" aria-hidden="true" focusable="false">`);

    // outline: flat bottom, folded top with a slight dome (puffer swells between seams)
    let sides = { left: `L0 ${f1(y0 + rr)}`, right: `L${T} ${yb}` };
    if (type === 'puffer') {
      const l = U.bumps([0, yb], [0, y0 + rr], 5, 2, 1, 3);
      const r = U.bumps([T, y0 + rr], [T, yb], 5, 2, 1, 3);
      sides = { left: 'L' + l.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L'), right: 'L' + r.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') };
    }
    const d =
      `M0 ${yb}${sides.left}Q0 ${y0} ${f1(rr)} ${y0}Q${f1(cx)} ${y0 - 2} ${f1(T - rr)} ${y0}Q${T} ${y0} ${T} ${f1(y0 + rr)}` + `${sides.right}Z`;

    // bookmark slips, tucked into the fold off-centre
    const notes = rec.notes || [];
    const k = Math.min(notes.length, 3);
    for (let i = 0; i < k; i++) {
      const sx = Math.min(T - 7, T * 0.56 + i * 4);
      out.push(
        `<rect x="${f1(sx)}" y="${y0 - 8 + (i % 2) * 2}" width="4.2" height="20" rx="0.8" fill="${paperFor(notes[i].id)}" transform="rotate(${6 - i * 4} ${f1(sx + 2)} ${y0 + 2})"/>`
      );
    }

    out.push(`<defs><clipPath id="${clip}"><path d="${d}"/></clipPath></defs>`);
    out.push(`<path d="${d}" fill="${C.base}"/>`);
    out.push(`<g clip-path="url(#${clip})">`);
    // volume: light left edge, shaded right edge, the fold line under the top
    out.push(`<rect x="${f1(T * 0.8)}" y="0" width="${f1(T * 0.2)}" height="${S.h}" fill="${C.dark}" opacity=".42"/>`);
    out.push(`<rect x="0" y="0" width="${f1(T * 0.15)}" height="${S.h}" fill="#ffffff" opacity=".16"/>`);
    out.push(`<path d="M2 ${y0 + 8}Q${f1(cx)} ${y0 + 11} ${f1(T - 2)} ${y0 + 8}" fill="none" stroke="${C.dark}" stroke-width="1.2" opacity=".45"/>`);

    // fabric texture
    const ink = (p, w, op, col, dash) =>
      `<path d="${p}" fill="none" stroke="${col || C.dark}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    const t0 = y0 + 18;
    const t1 = yb - 8;
    switch (type) {
      case 'puffer':
        for (let y = t0 + 8; y < t1; y += 22) out.push(ink(`M0 ${f1(y)}Q${f1(cx)} ${f1(y + 3)} ${T} ${f1(y)}`, 1.6, 0.5));
        for (let y = t0; y < t1 - 12; y += 22) out.push(ink(`M${f1(T * 0.22)} ${f1(y)}L${f1(T * 0.42)} ${f1(y - 1)}`, 2.2, 0.55, C.top));
        break;
      case 'coat':
        out.push(ink(`M4.5 ${f1(y0 + rr)}V${f1(t1)}`, 1, 0.55, null, '3 2.5'));
        out.push(ink(`M${f1(T - 4.5)} ${f1(y0 + rr)}V${f1(t1)}`, 1, 0.55, null, '3 2.5'));
        break;
      case 'sweater':
        for (let y = t0; y < t1; y += 9) {
          for (const x of [T * 0.33, T * 0.67]) out.push(ink(`M${f1(x - 2.6)} ${f1(y)}L${f1(x)} ${f1(y + 2.6)}L${f1(x + 2.6)} ${f1(y)}`, 1, 0.5));
        }
        break;
      case 'longSleeve':
        out.push(ink(`M${f1(cx + 3)} ${y0 + 10}V${yb}`, 1, 0.35));
        for (let y = t0 + 2; y < t1; y += 18) out.push(`<circle cx="${f1(cx)}" cy="${f1(y)}" r="1.5" fill="${CREAM}"/>`);
        break;
      case 'tshirt':
        for (const x of [T * 0.36, T * 0.64]) {
          out.push(ink(`M${f1(x)} ${f1(t0)}C${f1(x - 2)} ${f1(t0 + 30)} ${f1(x + 2)} ${f1(t0 + 60)} ${f1(x)} ${f1(t1 - 14)}`, 1, 0.35));
        }
        break;
      default:
        for (const x of [T * 0.34, T * 0.62]) out.push(ink(`M${f1(x)} ${y0 + 10}V${yb}`, 0.9, 0.3));
    }
    out.push('</g></svg>');
    return { svg: out.join(''), w: T, h: S.h };
  }

  function describe(rec) {
    const T = TYPES[typeFor(rec.temperature)];
    const n = (rec.notes || []).length;
    return `${T.name}, ${U.fmtTemp(rec.temperature)}, ${U.fmtDate(rec.createdAt)}에 넣어둔 옷, 쪽지 ${n}장`;
  }

  MW.garments = {
    MIN_T,
    MAX_T,
    VB,
    TYPES,
    ORDER,
    typeFor,
    feelFor,
    colorsFor,
    paperFor,
    newNoteId,
    geom,
    slipRects,
    garmentSVG,
    bundle,
    bundleSize,
    describe,
  };
})();
