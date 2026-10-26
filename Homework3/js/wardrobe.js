/* Mind Wardrobe — a three-shelf wardrobe. Folded garments are filed upright like books,
 * oldest first, left to right, shelf by shelf. Each shelf is closed by double doors.
 * When all three shelves are full, the next garments go to the next wardrobe (page). */
(function () {
  'use strict';
  const MW = window.MW;
  const U = MW.util;
  const G = MW.garments;

  const STAGE_W = 900;
  const STAGE_H = 756; // shelf (40–640) + dots + prompt, equal top and bottom margins
  const FIT = 0.92;
  const FRAME = { x: 170, y: 40, w: 560, h: 600 };
  const SHELF = { x: 188, w: 524, h: 174, tops: [62, 252, 442] };
  const PAD = 14; // inner padding of a shelf
  const GAP = 3; // between filed garments
  const NEW_MIN = 40; // a shelf with less room than this counts as full
  const LIFT = 12;
  const LONG_PRESS = 420; // ms to pick a garment up
  const DRAG_SLOP = 8; // px a press may wobble before it counts as a move

  const C = {
    frame: '#e9e2d6',
    edge: '#f4f0e9',
    back: '#ddd4c6',
    shade: '#d3c9b9',
    board: '#f2ede5',
    plinth: '#ddd5c8',
    floor: '#ebe6dd',
    pencil: '#262a33',
  };

  const key = (page, shelf) => page + ':' + shelf;

  function artSVG() {
    let seed = 500;
    const P = (pts, fill, r, j, extra) =>
      `<path d="${U.cutPath(pts, { r: r == null ? 6 : r, jitter: j == null ? 0.8 : j, seed: ++seed })}" fill="${fill}"${extra || ''}/>`;
    const pencil = (d) =>
      `<path d="${d}" fill="none" stroke="${C.pencil}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".32"/>`;
    const F = FRAME;
    let shelves = '';
    let lines = '';
    SHELF.tops.forEach((top) => {
      const x0 = SHELF.x;
      const x1 = SHELF.x + SHELF.w;
      const y1 = top + SHELF.h;
      shelves += P([[x0, top], [x1, top], [x1, y1], [x0, y1]], C.back, 2, 0.4);
      shelves += P([[x0, top], [x1, top], [x1, top + 10], [x0, top + 10]], C.shade, 1, 0.3);
      shelves += P([[x0, y1 - 6], [x1, y1 - 6], [x1, y1], [x0, y1]], C.board, 1, 0.3);
      lines += pencil(`M${x0} ${top}L${x1} ${top}L${x1} ${y1}L${x0} ${y1}Z`);
    });
    return `<svg class="ward-art" viewBox="0 0 ${STAGE_W} ${STAGE_H}" aria-hidden="true" focusable="false">
      ${P([[F.x - 26, F.y + F.h - 4], [F.x + F.w + 26, F.y + F.h - 6], [F.x + F.w + 30, F.y + F.h + 14], [F.x - 30, F.y + F.h + 16]], C.floor, 10, 1.5)}
      ${P([[F.x, F.y], [F.x + F.w, F.y], [F.x + F.w, F.y + F.h], [F.x, F.y + F.h]], C.frame, 4)}
      ${P([[F.x - 6, F.y - 8], [F.x + F.w + 6, F.y - 8], [F.x + F.w + 6, F.y + 4], [F.x - 6, F.y + 4]], C.edge, 3)}
      ${P([[F.x + 6, F.y + F.h - 22], [F.x + F.w - 6, F.y + F.h - 22], [F.x + F.w - 6, F.y + F.h], [F.x + 6, F.y + F.h]], C.plinth, 2)}
      ${shelves}
      <g filter="url(#rough)">
        ${pencil(`M${F.x - 6} ${F.y - 8}L${F.x + F.w + 6} ${F.y - 8}L${F.x + F.w + 6} ${F.y + 4}L${F.x - 6} ${F.y + 4}Z`)}
        ${pencil(`M${F.x} ${F.y + 4}L${F.x} ${F.y + F.h}L${F.x + F.w} ${F.y + F.h}L${F.x + F.w} ${F.y + 4}`)}
        ${lines}
      </g>
    </svg>`;
  }

  // A small clothing-donation bin standing on the floor to the left of the wardrobe.
  function binSVG() {
    const tee = 'M36 60l6-4h4a4 4 0 0 0 8 0h4l6 4-3 6-3-1.5V80H42V64.5L39 66z';
    return `<svg viewBox="-9 -40 106 156" aria-hidden="true" focusable="false">
      <path class="bin-body" d="${U.cutPath([[12, 26], [76, 26], [73, 112], [15, 112]], { r: 6, jitter: 0.5, seed: 61 })}" fill="#9cc0a7"/>
      <path d="${U.cutPath([[24, 36], [64, 36], [64, 42], [24, 42]], { r: 3, jitter: 0.2, seed: 62 })}" fill="#3f7a54"/>
      <path d="${tee}" fill="#fcfbf8" opacity=".95"/>
      <g class="bin-lid">
        <path d="${U.cutPath([[6, 12], [82, 12], [82, 26], [6, 26]], { r: 5, jitter: 0.5, seed: 63 })}" fill="#55966a"/>
        <path d="${U.cutPath([[34, 5], [54, 5], [54, 12], [34, 12]], { r: 3, jitter: 0.3, seed: 64 })}" fill="#427d56"/>
      </g>
      <g filter="url(#rough)" fill="none" stroke="#262a33" stroke-width="1.2" opacity=".3">
        <path d="M12 26L76 26L73 112L15 112Z"/>
      </g>
    </svg>`;
  }

  const CHEVRON = (d) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d > 0 ? 'M9.5 5.5 16 12l-6.5 6.5' : 'M14.5 5.5 8 12l6.5 6.5'}"/></svg>`;

  class Wardrobe {
    constructor(scene, handlers) {
      this.scene = scene;
      this.onCreate = handlers.onCreate;
      this.onOpen = handlers.onOpen;
      this.onDiscard = handlers.onDiscard;
      this.isBusy = handlers.isBusy || (() => false);
      this.press = null;
      this.suppressClick = false;
      this.hintTimer = 0;
      this.els = new Map();
      this.recs = new Map();
      this.pack = null;
      this.page = null;
      this.openSet = new Set();
      this.hiddenId = null;
      this.selectedId = null;
      this.hotId = null;
      this.lastPointer = 'mouse';
      this.selTimer = 0;
      this.scale = 1;

      const shelf = (i) => {
        const top = SHELF.tops[i];
        const pos = `left:${SHELF.x}px;top:${top}px;width:${SHELF.w}px;height:${SHELF.h}px`;
        return `
          <div class="cubby" data-shelf="${i}" style="${pos}">
            <button class="cubby-new" type="button" aria-label="새 마음 적기 — 빈 칸" hidden><span class="pulse" aria-hidden="true"></span></button>
          </div>
          <div class="doors" data-shelf="${i}" style="${pos}">
            <button class="door door-l" type="button" data-shelf="${i}" aria-expanded="false"><span class="door-line"></span></button>
            <button class="door door-r" type="button" data-shelf="${i}" aria-expanded="false" tabindex="-1" aria-hidden="true"><span class="door-line"></span></button>
            <span class="pulse door-pulse" aria-hidden="true" hidden></span>
          </div>`;
      };
      scene.innerHTML = `
        <h1 class="sr-only">마음 옷장</h1>
        <div class="ward-stage">
          ${artSVG()}
          <div class="shelves">${[0, 1, 2].map(shelf).join('')}</div>
          <button class="page-arrow sk prev" type="button" aria-label="이전 옷장" hidden>${CHEVRON(-1)}</button>
          <button class="page-arrow sk next" type="button" aria-label="다음 옷장" hidden>${CHEVRON(1)}</button>
          <div class="page-dots" aria-hidden="true"></div>
          <div class="bin" role="img" aria-label="헌옷수거함 — 옷을 꾹 눌러 끌어다 놓으면 버려져요">${binSVG()}</div>
          <p class="bin-hint" role="status" hidden>옷을 꾹 눌러<br>헌옷수거함에 버릴 수 있어요.</p>
          <p class="ward-prompt">오늘의 마음은 더웠나요? 추웠나요?</p>
        </div>
        <div class="tag" aria-hidden="true"></div>`;
      this.stage = scene.querySelector('.ward-stage');
      this.shelvesEl = scene.querySelector('.shelves');
      this.cubbies = Array.from(scene.querySelectorAll('.cubby'));
      this.doors = Array.from(scene.querySelectorAll('.doors'));
      this.prevBtn = scene.querySelector('.page-arrow.prev');
      this.nextBtn = scene.querySelector('.page-arrow.next');
      this.dots = scene.querySelector('.page-dots');
      this.tag = scene.querySelector('.tag');
      this.bin = scene.querySelector('.bin');
      this.binHint = scene.querySelector('.bin-hint');
      this.bind();
      this.bindDrag();
    }

    /* ---------------- input ---------------- */

    bind() {
      const st = this.stage;
      st.addEventListener('pointerdown', (e) => (this.lastPointer = e.pointerType || 'mouse'), true);
      st.addEventListener('click', (e) => {
        const door = e.target.closest('.door');
        if (door) {
          this.clearSelection();
          this.toggleShelf(+door.dataset.shelf);
          return;
        }
        if (e.target.closest('.cubby-new')) {
          this.clearSelection();
          this.onCreate();
          return;
        }
        const arrow = e.target.closest('.page-arrow');
        if (arrow) {
          this.goPage(this.page + (arrow.classList.contains('next') ? 1 : -1));
          return;
        }
        const b = e.target.closest('.bundle');
        if (this.suppressClick) {
          // the press became a drag; it was not a tap
          this.suppressClick = false;
          return;
        }
        if (!b) {
          this.clearSelection();
          return;
        }
        const id = b.dataset.id;
        if (e.detail === 0 || this.lastPointer === 'mouse' || this.selectedId === id) {
          this.clearSelection();
          this.onOpen(id);
        } else {
          this.select(id);
        }
      });
      st.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const b = e.target.closest('.bundle');
        if (b) this.setHot(b.dataset.id);
      });
      st.addEventListener('pointerout', (e) => {
        if (e.pointerType !== 'mouse') return;
        const b = e.target.closest('.bundle');
        if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) this.setHot(null);
      });
      st.addEventListener('focusin', (e) => {
        const b = e.target.closest('.bundle');
        if (b) this.setHot(b.dataset.id);
      });
      st.addEventListener('focusout', () => this.setHot(null));
    }

    /* ---------------- press & drag a garment to the donation bin ---------------- */

    bindDrag() {
      const st = this.stage;
      st.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.bundle')) e.preventDefault();
      });
      st.addEventListener('pointerdown', (e) => {
        this.suppressClick = false;
        this.hideBinHint();
        const b = e.target.closest('.bundle');
        if (!b || this.press || this.isBusy()) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const p = { id: b.dataset.id, el: b, pid: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false };
        p.timer = setTimeout(() => this.startDrag(p), LONG_PRESS);
        b.classList.add('is-pressing');
        this.press = p;
        try {
          b.setPointerCapture(e.pointerId);
        } catch (err) {
          /* best effort */
        }
      });
      st.addEventListener('pointermove', (e) => {
        const p = this.press;
        if (!p || e.pointerId !== p.pid) return;
        p.x = e.clientX;
        p.y = e.clientY;
        if (p.active) return this.moveDrag(p);
        if (Math.hypot(p.x - p.x0, p.y - p.y0) > DRAG_SLOP) {
          // a mouse may simply start dragging; a finger that moves before the long press is not a pick-up
          if (p.type === 'mouse') this.startDrag(p);
          else this.endPress();
        }
      });
      const up = (e) => {
        const p = this.press;
        if (!p || e.pointerId !== p.pid) return;
        if (p.active) this.dropDrag(p, e.type !== 'pointercancel');
        else this.endPress();
      };
      st.addEventListener('pointerup', up);
      st.addEventListener('pointercancel', up);
    }

    endPress() {
      const p = this.press;
      if (!p) return;
      clearTimeout(p.timer);
      p.el.classList.remove('is-pressing');
      this.press = null;
    }

    startDrag(p) {
      if (p.active || this.press !== p || this.isBusy()) return;
      clearTimeout(p.timer);
      p.active = true;
      this.suppressClick = true;
      this.clearSelection();
      this.setHot(null);
      const r = p.el.getBoundingClientRect();
      p.dx = p.x - r.left;
      p.dy = p.y - r.top;
      const g = document.createElement('div');
      g.className = 'drag-ghost';
      g.innerHTML = p.el.firstChild.innerHTML;
      Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.appendChild(g);
      p.ghost = g;
      p.home = r;
      p.el.classList.remove('is-pressing');
      p.el.style.visibility = 'hidden';
      this.bin.classList.add('is-ready');
      if (navigator.vibrate) navigator.vibrate(12);
      this.moveDrag(p);
    }

    overBin(x, y) {
      const r = this.bin.getBoundingClientRect();
      const pad = 28 * this.scale;
      return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad;
    }

    moveDrag(p) {
      const over = this.overBin(p.x, p.y);
      this.bin.classList.toggle('is-over', over);
      p.ghost.style.transform = `translate(${(p.x - p.dx - p.home.left).toFixed(1)}px, ${(p.y - p.dy - p.home.top).toFixed(1)}px) rotate(-5deg) scale(1.06)`;
    }

    dropDrag(p, released) {
      this.press = null;
      const into = released && this.overBin(p.x, p.y);
      this.bin.classList.remove('is-ready', 'is-over');
      const g = p.ghost;
      const done = () => g.remove();
      const reduced = U.reducedMotion();
      if (into) {
        const b = this.bin.getBoundingClientRect();
        const tx = b.left + b.width / 2 - p.home.left - p.home.width / 2;
        const ty = b.top + b.height * 0.3 - p.home.top - p.home.height / 2;
        const a = g.animate(
          [{ transform: g.style.transform, opacity: 1 }, { transform: `translate(${tx}px, ${ty}px) rotate(8deg) scale(0.18)`, opacity: 0.2 }],
          { duration: reduced ? 1 : 320, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
        );
        a.onfinish = () => {
          done();
          if (!reduced) this.bin.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1, 0.92)' }, { transform: 'scale(1)' }], { duration: 260 });
          this.onDiscard(p.id);
        };
        return;
      }
      // not over the bin: the garment goes back to its place on the shelf
      const a = g.animate([{ transform: g.style.transform }, { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' }], {
        duration: reduced ? 1 : 260,
        easing: 'cubic-bezier(.3,.7,.3,1)',
        fill: 'forwards',
      });
      a.onfinish = () => {
        done();
        if (p.el.isConnected && p.id !== this.hiddenId) p.el.style.visibility = '';
      };
    }

    /** One-time tip next to the bin. */
    showBinHint() {
      this.binHint.hidden = false;
      this.bin.classList.add('is-hinting');
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => this.hideBinHint(), 6500);
    }

    hideBinHint() {
      clearTimeout(this.hintTimer);
      if (this.binHint.hidden) return;
      this.binHint.hidden = true;
      this.bin.classList.remove('is-hinting');
    }

    fit() {
      const r = this.scene.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.scale = Math.min(r.width / STAGE_W, r.height / STAGE_H) * FIT;
      this.stage.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
    }

    /* ---------------- packing ---------------- */

    /** Oldest first: fill shelf 1 left→right, then shelf 2, 3, then the next wardrobe. */
    layout(list) {
      const pages = [];
      const where = new Map();
      const ensure = (p) => {
        while (pages.length <= p) pages.push([[], [], []]);
      };
      let page = 0;
      let shelf = 0;
      let x = PAD;
      const limit = SHELF.w - PAD;
      for (const r of list) {
        const S = G.bundleSize(r.temperature);
        if (x > PAD && x + S.w > limit) {
          x = PAD;
          shelf++;
          if (shelf > 2) {
            shelf = 0;
            page++;
          }
        }
        ensure(page);
        pages[page][shelf].push({ r, x, w: S.w, h: S.h });
        where.set(r.id, { page, shelf });
        x += S.w + GAP;
      }
      let next = { page, shelf, x };
      if (limit - x < NEW_MIN) next = shelf < 2 ? { page, shelf: shelf + 1, x: PAD } : { page: page + 1, shelf: 0, x: PAD };
      ensure(next.page);
      return { pages, where, next };
    }

    /**
     * Render records (newest-first in, filed oldest-first).
     * opts.hiddenId — keep that garment's place but don't show it (in flight / taken out)
     * opts.focusId  — show the page holding that garment and open its shelf
     * opts.animate  — slide garments that moved
     */
    render(records, opts) {
      const o = opts || {};
      const list = records.slice().reverse();
      this.recs = new Map(list.map((r) => [r.id, r]));
      this.pack = this.layout(list);
      this.hiddenId = o.hiddenId || null;
      if (o.focusId && this.pack.where.has(o.focusId)) {
        const w = this.pack.where.get(o.focusId);
        this.page = w.page;
        this.openSet.add(key(w.page, w.shelf));
      }
      if (this.page == null) this.page = this.pack.next.page;
      this.page = U.clamp(this.page, 0, this.pack.pages.length - 1);
      this.draw(!!o.animate);
    }

    draw(animate) {
      const before = new Map();
      if (animate && !U.reducedMotion()) {
        this.els.forEach((el, id) => {
          if (el.isConnected) before.set(id, el.getBoundingClientRect());
        });
      }
      const page = this.pack.pages[this.page];
      const shown = new Set();
      page.forEach((items, s) => {
        const cubby = this.cubbies[s];
        items.forEach((it, i) => {
          const r = it.r;
          shown.add(r.id);
          let el = this.els.get(r.id);
          if (!el) {
            el = document.createElement('button');
            el.type = 'button';
            el.className = 'bundle';
            el.dataset.id = r.id;
            el.innerHTML = '<span class="bundle-lift"></span>';
            this.els.set(r.id, el);
          }
          const sig = [r.temperature, r.updatedAt, r.notes.map((n) => n.id).join(',')].join('|');
          if (el.dataset.sig !== sig) {
            const b = G.bundle(r);
            el.firstChild.innerHTML = b.svg;
            el.style.width = b.w + 'px';
            el.style.height = b.h + 'px';
            el.dataset.sig = sig;
            el.setAttribute('aria-label', G.describe(r));
          }
          el.style.left = it.x + 'px';
          el.style.zIndex = String(i + 1);
          el.style.visibility = r.id === this.hiddenId ? 'hidden' : '';
          cubby.insertBefore(el, cubby.querySelector('.cubby-new'));
        });
      });
      this.els.forEach((el, id) => {
        if (!this.recs.has(id)) this.els.delete(id);
        if (!shown.has(id)) el.remove();
      });

      // doors, the empty place for the next garment, and its onboarding pulse
      const next = this.pack.next;
      this.cubbies.forEach((cubby, s) => {
        const open = this.openSet.has(key(this.page, s));
        const current = next.page === this.page && next.shelf === s;
        const newBtn = cubby.querySelector('.cubby-new');
        newBtn.hidden = !current;
        if (current) newBtn.style.left = Math.max(0, next.x - GAP) + 'px';
        cubby.inert = !open;
        const doors = this.doors[s];
        doors.classList.toggle('is-open', open);
        doors.querySelector('.door-pulse').hidden = !current || open;
        doors.querySelectorAll('.door').forEach((d) => {
          d.setAttribute('aria-expanded', String(open));
          d.setAttribute('aria-label', `${s + 1}번째 칸 ${open ? '닫기' : '열기'}`);
        });
      });
      this.scene.classList.toggle('is-empty', this.recs.size === 0);

      // paging
      const pages = this.pack.pages.length;
      this.prevBtn.hidden = this.page <= 0;
      this.nextBtn.hidden = this.page >= pages - 1;
      this.dots.innerHTML = pages > 1 ? this.pack.pages.map((_, i) => `<i class="${i === this.page ? 'on' : ''}"></i>`).join('') : '';

      if (this.selectedId && !shown.has(this.selectedId)) this.clearSelection();
      if (this.hotId && !shown.has(this.hotId)) this.setHot(null);

      before.forEach((r0, id) => {
        const el = this.els.get(id);
        if (!el || !el.isConnected) return;
        const r1 = el.getBoundingClientRect();
        const dx = (r0.left - r1.left) / this.scale;
        const dy = (r0.top - r1.top) / this.scale;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], {
          duration: 650,
          delay: 120,
          easing: 'cubic-bezier(.3,.7,.2,1)',
          fill: 'backwards',
        });
      });
    }

    toggleShelf(s) {
      const k = key(this.page, s);
      if (this.openSet.has(k)) this.openSet.delete(k);
      else this.openSet.add(k);
      this.hideTag();
      this.draw(false);
    }

    goPage(p) {
      if (!this.pack) return;
      const target = U.clamp(p, 0, this.pack.pages.length - 1);
      if (target === this.page) return;
      const dir = target > this.page ? 1 : -1;
      this.page = target;
      this.clearSelection();
      this.setHot(null);
      this.draw(false);
      if (!U.reducedMotion()) {
        this.shelvesEl.animate([{ transform: `translateX(${dir * 40}px)`, opacity: 0 }, { transform: 'translateX(0px)', opacity: 1 }], {
          duration: 280,
          easing: 'cubic-bezier(.3,.7,.3,1)',
        });
      }
    }

    bundleEl(id) {
      const el = this.els.get(id);
      return el && el.isConnected ? el : null;
    }

    /** Show the page (and open the shelf) holding a garment; with no id, show where the next one goes. */
    reveal(id) {
      if (!this.pack) return;
      if (id && this.pack.where.has(id)) {
        const w = this.pack.where.get(id);
        this.page = w.page;
        this.openSet.add(key(w.page, w.shelf));
      } else if (!id) {
        this.page = this.pack.next.page;
      }
      this.draw(false);
    }

    /** Small settling drop for a garment that just returned to its shelf. */
    settle(id) {
      const el = this.bundleEl(id);
      if (!el) return;
      const lift = el.firstChild;
      if (U.reducedMotion()) {
        lift.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        return;
      }
      lift.animate(
        [{ transform: 'translateY(-14px)' }, { transform: 'translateY(2px)', offset: 0.7 }, { transform: 'translateY(0px)' }],
        { duration: 320, easing: 'cubic-bezier(.3,0,.3,1)' }
      );
    }

    /* ---------------- hover / touch selection labels ---------------- */

    setHot(id) {
      if (this.hotId && this.els.get(this.hotId)) this.els.get(this.hotId).classList.remove('is-hot');
      this.hotId = id;
      if (id && this.els.get(id)) {
        this.els.get(id).classList.add('is-hot');
        this.showTag(id, false);
      } else if (this.selectedId) {
        this.showTag(this.selectedId, true);
      } else {
        this.hideTag();
      }
    }

    select(id) {
      this.clearSelection();
      this.selectedId = id;
      const el = this.els.get(id);
      if (el) el.classList.add('is-selected');
      this.showTag(id, true);
      clearTimeout(this.selTimer);
      this.selTimer = setTimeout(() => this.clearSelection(), 4000);
    }

    clearSelection() {
      clearTimeout(this.selTimer);
      if (this.selectedId && this.els.get(this.selectedId)) this.els.get(this.selectedId).classList.remove('is-selected');
      this.selectedId = null;
      if (!this.hotId) this.hideTag();
    }

    showTag(id, touchHint) {
      const el = this.bundleEl(id);
      const rec = this.recs.get(id);
      if (!el || !rec) return;
      const T = G.TYPES[G.typeFor(rec.temperature)];
      const first = rec.notes[0] ? rec.notes[0].text : '';
      this.tag.innerHTML =
        `<span class="tag-date">${U.esc(U.fmtTag(rec.createdAt))}</span>` +
        `<span class="tag-main"><span class="tag-type">${U.esc(T.name)}</span><span class="tag-temp">${U.fmtTemp(rec.temperature)}</span></span>` +
        (first ? `<span class="tag-note">${U.esc(first)}</span>` : '') +
        (touchHint ? '<span class="tag-hint">한 번 더 누르면 꺼내요</span>' : '');
      const sr = this.scene.getBoundingClientRect();
      const br = el.getBoundingClientRect();
      const x = br.left - sr.left + br.width / 2;
      const gap = (LIFT + 8) * this.scale;
      const h = this.tag.offsetHeight;
      const below = br.top - sr.top - gap - h < 8;
      const y = below ? br.bottom - sr.top + 8 : br.top - sr.top - gap;
      const half = this.tag.offsetWidth / 2 + 8;
      const cx = U.clamp(x, half, sr.width - half);
      this.tag.classList.toggle('is-below', below);
      this.tag.style.transform = `translate(${cx.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, ${below ? '0' : '-100%'})`;
      this.tag.style.setProperty('--arrow', `${(x - cx).toFixed(1)}px`);
      this.tag.classList.add('is-on');
    }

    hideTag() {
      this.tag.classList.remove('is-on');
    }
  }

  MW.Wardrobe = Wardrobe;
})();
