/* Mind Wardrobe — cancellable choreography between scenes.
 *
 * Every sequence runs through `run(seq, finalize)`. Data is always written
 * before a sequence starts; `finalize` rebuilds the resting UI from the store,
 * so skipping, interrupting or finishing a sequence all end in the same state.
 */
(function () {
  'use strict';
  const MW = window.MW;
  const U = MW.util;
  const G = MW.garments;

  const EASE = 'cubic-bezier(.45,.05,.25,1)';
  const running = new Set();
  // every animation a sequence created; cleared when the sequence ends so no
  // finished `fill: both` effect lingers on elements that stay on screen
  const owned = new Set();
  let token = 0;
  let current = null;

  const layer = () => document.getElementById('flight');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function play(el, frames, opts) {
    const a = el.animate(frames, Object.assign({ fill: 'both', easing: EASE }, opts));
    running.add(a);
    owned.add(a);
    return a.finished.then(
      () => {
        running.delete(a);
        return true;
      },
      () => {
        running.delete(a);
        return false;
      }
    );
  }

  function run(seq, finalize) {
    if (current) finish();
    const t = ++token;
    const job = { t, finalize, done: false, startedAt: performance.now() };
    current = job;
    layer().classList.add('is-active');
    const alive = () => token === t && !job.done;
    return Promise.resolve()
      .then(() => seq(alive))
      .catch((err) => console.error('[motion]', err))
      .then(() => {
        if (current === job) finish();
      });
  }

  function finish() {
    const job = current;
    if (!job || job.done) return;
    job.done = true;
    current = null;
    token++;
    owned.forEach((a) => {
      try {
        a.cancel();
      } catch (e) {
        /* already gone */
      }
    });
    owned.clear();
    running.clear();
    const L = layer();
    L.innerHTML = '';
    L.classList.remove('is-active');
    try {
      job.finalize();
    } catch (e) {
      console.error('[motion] finalize', e);
    }
  }

  // A tap during a sequence skips to its end (ignoring the tail of the tap that started it).
  function skip() {
    if (current && performance.now() - current.startedAt > 350) finish();
  }

  const busy = () => !!current;

  /* ---------------- geometry helpers ---------------- */

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const shiftX = (r, dx) => ({ x: r.x + dx, y: r.y, w: r.w, h: r.h });
  const place = (el, r) => {
    el.style.left = r.x + 'px';
    el.style.top = r.y + 'px';
    el.style.width = r.w + 'px';
    el.style.height = r.h + 'px';
  };
  // transform (origin 0 0) that makes a box placed at `a` occupy `b`
  const toward = (a, b, rot) =>
    `translate(${(b.x - a.x).toFixed(2)}px, ${(b.y - a.y).toFixed(2)}px) rotate(${rot || 0}deg) scale(${(b.w / a.w).toFixed(4)}, ${(b.h / a.h).toFixed(4)})`;
  const IDENTITY = 'translate(0px, 0px) rotate(0deg) scale(1, 1)';

  // map garment viewBox units onto a (possibly not yet visible) rectangle
  function mapper(rect) {
    const s = Math.min(rect.w / G.VB.w, rect.h / G.VB.h);
    const ox = rect.x + (rect.w - G.VB.w * s) / 2;
    const oy = rect.y + (rect.h - G.VB.h * s) / 2;
    return { s, rect: (x, y, w, h) => ({ x: ox + x * s, y: oy + y * s, w: w * s, h: h * s }) };
  }

  // Garment torso in viewBox units, and where the folded slab sits relative to it.
  const BODY = { cx: 200, cy: 236, w: 200, h: 390 };
  function bundleRectFor(gRect, B) {
    const M = mapper(gRect);
    const k = (BODY.h * 0.64 * M.s) / B.h;
    const c = M.rect(BODY.cx, BODY.cy, 0, 0);
    return { x: c.x - (B.w * k) / 2, y: c.y - (B.h * k) / 2, w: B.w * k, h: B.h * k };
  }

  // Squash the (sleeves-folded) garment down to the slab's footprint, around the torso centre.
  function squashFrames(gRect, bRect) {
    const M = mapper(gRect);
    const c = M.rect(BODY.cx, BODY.cy, 0, 0);
    const sx = bRect.w / (BODY.w * M.s);
    const sy = bRect.h / (BODY.h * M.s);
    return {
      origin: `${(c.x - gRect.x).toFixed(1)}px ${(c.y - gRect.y).toFixed(1)}px`,
      open: 'scale(1, 1)',
      narrow: `scale(${(sx * 1.6).toFixed(3)}, 1)`,
      slab: `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
    };
  }

  // Sleeves fold inward around the shoulder and lie over the torso (as in the first draft).
  const SLEEVE_FOLD = 70; // lies diagonally across the chest
  const sleeveFrame = (s, t) => {
    const px = +s.dataset.px;
    const py = +s.dataset.py;
    const deg = +s.dataset.dir * SLEEVE_FOLD * t;
    return { transform: `translate(${px}px, ${py}px) rotate(${deg.toFixed(1)}deg) translate(${-px}px, ${-py}px)` };
  };
  const sleevesOnTop = (svg) => {
    const sl = Array.from(svg.querySelectorAll('.gm-sleeve'));
    sl.forEach((g) => svg.appendChild(g));
    return sl;
  };

  function makeBundleEl(rec) {
    const B = G.bundle(rec);
    const el = document.createElement('div');
    el.className = 'fl-bundle';
    el.innerHTML = B.svg;
    return { el, B };
  }

  function visibleIn(r, box) {
    return r.y + r.h > box.y + 8 && r.y < box.y + box.h - 8;
  }

  /* ================================================================== */
  /* SAVE: notes → slips → pocket → fold → wardrobe drawer               */
  /* ================================================================== */
  async function saveSeq(alive, ctx) {
    const { editor, wardrobe, record } = ctx;
    const L = layer();

    if (U.reducedMotion()) {
      await play(editor.root.querySelector('.editor'), [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
      return;
    }

    const type = G.typeFor(record.temperature);
    const savedIds = new Set(record.notes.map((n) => n.id));
    const lis = editor.noteEls();
    const filled = lis.filter((li) => savedIds.has(li.dataset.id));
    lis.filter((li) => !savedIds.has(li.dataset.id)).forEach((li) => play(li, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 }));
    play(editor.foot, [{ opacity: 1 }, { opacity: 0.25 }], { duration: 250 });

    // --- 1. paper sheets become slips and slide into the actual pocket -----
    editor.renderGarment({ slips: record.notes.map((n) => n.id), hideSlips: true });
    const svg = editor.garmentSvg();
    const M = mapper(rectOf(svg));
    const boxes = G.slipRects(type, record.notes.length);
    const svgSlips = svg.querySelectorAll('.gm-slip');
    const scroll = rectOf(editor.scroller);

    await Promise.all(
      filled.map(async (li, i) => {
        const k = Math.min(i, boxes.length - 1);
        const sb = boxes[k];
        const lift = sb.h * 0.92;
        let from = rectOf(li.querySelector('.note-sheet') || li);
        if (!visibleIn(from, scroll)) {
          // a sheet scrolled out of view starts from the nearest edge of the note area
          const y = from.y < scroll.y ? scroll.y - from.h * 0.4 : scroll.y + scroll.h - from.h * 0.6;
          from = { x: from.x, y, w: from.w, h: from.h };
        }
        const to = M.rect(sb.x, sb.y - lift, sb.w, sb.h);
        const mw = Math.min(from.w * 0.26, 120);
        const mh = mw * 0.9;
        const mid = { x: from.x + from.w / 2 - mw / 2, y: from.y + from.h / 2 - mh / 2 - 10, w: mw, h: mh };

        const slip = document.createElement('div');
        slip.className = 'fl-slip';
        slip.style.setProperty('--paper', G.paperFor(li.dataset.id));
        slip.innerHTML = `<div class="fl-slip-text">${U.esc(li.querySelector('textarea').value)}</div><span class="fl-crease"></span>`;
        place(slip, from);
        L.appendChild(slip);
        li.style.visibility = 'hidden';

        const delay = i * 170;
        play(slip.firstChild, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay });
        play(slip.lastChild, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: delay + 300 });
        const rot0 = parseFloat(getComputedStyle(li).getPropertyValue('--rot')) || 0;
        const ok = await play(
          slip,
          [
            { transform: `translate(0px, 0px) rotate(${rot0}deg) scale(1, 1)` },
            { transform: toward(from, mid, -5), offset: 0.36, easing: 'cubic-bezier(.3,0,.2,1)' },
            { transform: toward(from, to, sb.rot) },
          ],
          { duration: 1050, delay }
        );
        if (!ok || !alive()) return;
        slip.remove();
        const g = svgSlips[k];
        g.style.opacity = '1';
        await play(g, [{ transform: `translate(0px, ${-lift}px)` }, { transform: 'translate(0px, 0px)' }], {
          duration: 460,
          easing: 'cubic-bezier(.55,0,.75,.2)',
        });
      })
    );
    if (!alive()) return;
    await wait(200);
    if (!alive()) return;

    // --- 2. fold the garment: sleeves back, sides in, hem up ----------------
    const gRect = rectOf(svg);
    const clone = svg.cloneNode(true);
    clone.classList.add('fl-garment');
    place(clone, gRect);
    L.appendChild(clone);
    svg.style.visibility = 'hidden';

    const sleeves = sleevesOnTop(clone);
    if (sleeves.length) {
      await Promise.all(
        sleeves.map((s, i) => play(s, [sleeveFrame(s, 0), sleeveFrame(s, 1)], { duration: 480, delay: i * 140, easing: 'cubic-bezier(.6,0,.3,1)' }))
      );
    } else {
      await wait(160);
    }
    if (!alive()) return;
    const { el: bEl, B } = makeBundleEl(record);
    const bRect = bundleRectFor(gRect, B);
    const SQ = squashFrames(gRect, bRect);
    clone.style.transformOrigin = SQ.origin;
    await play(clone, [{ transform: SQ.open }, { transform: SQ.narrow, offset: 0.5 }, { transform: SQ.slab }], {
      duration: 620,
      easing: 'cubic-bezier(.5,0,.3,1)',
    });
    if (!alive()) return;

    // --- 3. the flattened garment becomes the folded slab ----------------------
    place(bEl, bRect);
    bEl.style.transformOrigin = '50% 100%';
    L.appendChild(bEl);
    play(clone, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    await play(
      bEl,
      [
        { opacity: 0, transform: 'scale(1, 0.9)' },
        { opacity: 1, transform: 'scale(1, 1.03)', offset: 0.7 },
        { opacity: 1, transform: 'scale(1, 1)' },
      ],
      { duration: 360, easing: 'cubic-bezier(.3,.8,.4,1)' }
    );
    if (!alive()) return;

    // --- 4. wardrobe returns; the bundle is filed into its slot -------------
    const sceneW = ctx.sceneWidth();
    wardrobe.render(ctx.records(), { hiddenId: record.id, animate: true, focusId: record.id });
    const target = shiftX(rectOf(wardrobe.bundleEl(record.id)), sceneW);
    const from = rectOf(bEl);
    bEl.style.transformOrigin = '0 0';
    const midR = {
      x: (from.x + target.x) / 2,
      y: Math.min(from.y, target.y) - 60,
      w: (from.w + target.w) / 2,
      h: (from.h + target.h) / 2,
    };
    ctx.pan('wardrobe', 720);
    await play(bEl, [{ transform: IDENTITY }, { transform: toward(from, midR, -3), offset: 0.5 }, { transform: toward(from, target, 0) }], {
      duration: 860,
      delay: 60,
      easing: 'cubic-bezier(.4,0,.3,1)',
    });
  }

  /* ================================================================== */
  /* OPEN: bundle leaves the drawer → unfolds → slips come out → notes  */
  /* ================================================================== */
  async function openSeq(alive, ctx) {
    const { editor, wardrobe, record } = ctx;
    const L = layer();
    const bundleEl = wardrobe.bundleEl(record.id);

    if (U.reducedMotion() || !bundleEl) {
      editor.reveal();
      await ctx.pan('editor', 0);
      await play(editor.root.querySelector('.editor'), [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      return;
    }

    const sceneW = ctx.sceneWidth();
    const gsvg = editor.garmentSvg();
    gsvg.style.visibility = 'hidden';
    const gRestRect = rectOf(gsvg); // where the garment will rest once the editor is in view
    const gNow = shiftX(gRestRect, -sceneW);

    const { el: bEl, B } = makeBundleEl(record);
    const from = rectOf(bundleEl);
    place(bEl, from);
    L.appendChild(bEl);
    bundleEl.style.visibility = 'hidden';

    // lift it out of the drawer
    await play(bEl, [{ transform: IDENTITY }, { transform: 'translate(0px, -50px) rotate(0deg) scale(1, 1)' }], {
      duration: 160,
      easing: 'cubic-bezier(.3,0,.2,1)',
    });
    if (!alive()) return;

    // travel to the editor while the scene pans
    const bTarget = bundleRectFor(gNow, B);
    ctx.pan('editor', 560);
    await play(bEl, [{ transform: 'translate(0px, -50px) rotate(0deg) scale(1, 1)' }, { transform: toward(from, bTarget, 0) }], {
      duration: 580,
      easing: 'cubic-bezier(.45,0,.25,1)',
    });
    if (!alive()) return;

    // unfold
    const gRect = rectOf(gsvg);
    const SQ = squashFrames(gRect, bundleRectFor(gRect, B));
    const clone = gsvg.cloneNode(true);
    clone.classList.add('fl-garment');
    clone.style.visibility = 'visible';
    clone.style.transformOrigin = SQ.origin;
    place(clone, gRect);
    L.appendChild(clone);
    play(bEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    const sleeves = sleevesOnTop(clone);
    sleeves.forEach((s, i) => {
      play(s, [sleeveFrame(s, 1), Object.assign({ offset: 0.5 }, sleeveFrame(s, 1)), sleeveFrame(s, 0)], {
        duration: 720 + i * 80,
        easing: 'cubic-bezier(.5,0,.3,1)',
      });
    });
    await play(
      clone,
      [
        { opacity: 0, transform: SQ.slab },
        { opacity: 1, transform: SQ.slab, offset: 0.2 },
        { opacity: 1, transform: SQ.narrow, offset: 0.5 },
        { opacity: 1, transform: SQ.open },
      ],
      { duration: 560, easing: 'cubic-bezier(.4,0,.3,1)' }
    );
    if (sleeves.length) await wait(160 + (sleeves.length - 1) * 80);
    if (!alive()) return;
    gsvg.style.visibility = '';
    clone.remove();
    bEl.remove();

    // slips rise out of the pocket and open into the paper notes
    const svgSlips = Array.from(gsvg.querySelectorAll('.gm-slip'));
    const type = G.typeFor(record.temperature);
    const lis = editor.noteEls().filter((li) => li.querySelector('textarea').value.trim());
    const boxes = G.slipRects(type, Math.max(1, lis.length));
    const M = mapper(rectOf(gsvg));
    await Promise.all(
      svgSlips.map((g, i) => {
        const lift = boxes[i].h * 0.92;
        return play(g, [{ transform: 'translate(0px, 0px)' }, { transform: `translate(0px, ${-lift}px)` }], {
          duration: 200,
          delay: i * 40,
          easing: 'cubic-bezier(.2,.8,.3,1)',
        });
      })
    );
    if (!alive()) return;
    const scroll = rectOf(editor.scroller);
    await Promise.all(
      lis.map(async (li, i) => {
        const k = Math.min(i, boxes.length - 1);
        const sb = boxes[k];
        const to = rectOf(li.querySelector('.note-sheet') || li);
        if (!visibleIn(to, scroll)) {
          await wait(260);
          li.style.visibility = 'visible';
          return;
        }
        const start = M.rect(sb.x, sb.y - sb.h * 0.92, sb.w, sb.h);
        const slip = document.createElement('div');
        slip.className = 'fl-slip';
        slip.style.setProperty('--paper', G.paperFor(li.dataset.id));
        slip.innerHTML = `<div class="fl-slip-text">${U.esc(li.querySelector('textarea').value)}</div><span class="fl-crease"></span>`;
        place(slip, to);
        L.appendChild(slip);
        if (svgSlips[k]) svgSlips[k].style.opacity = '0';
        const delay = i * 70;
        const rot1 = parseFloat(getComputedStyle(li).getPropertyValue('--rot')) || 0;
        play(slip.firstChild, [{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: 420, delay });
        play(slip.lastChild, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: delay + 120 });
        const ok = await play(slip, [{ transform: toward(to, start, sb.rot) }, { transform: `translate(0px, 0px) rotate(${rot1}deg) scale(1, 1)` }], {
          duration: 420,
          delay,
          easing: 'cubic-bezier(.3,.6,.25,1)',
        });
        if (!ok || !alive()) return;
        li.style.visibility = 'visible';
        slip.remove();
      })
    );
  }

  MW.motion = { run, finish, skip, busy, play, wait };
  MW.sequences = { saveSeq, openSeq };
})();
