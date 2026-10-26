/* Mind Wardrobe — editor: temperature slider · garment · paper notes. Owns only the draft. */
(function () {
  'use strict';
  const MW = window.MW;
  const U = MW.util;
  const G = MW.garments;

  const MIN = G.MIN_T;
  const MAX = G.MAX_T;
  const TICKS = [40, 30, 20, 10, 0, -10, -20];
  const MAX_NOTES = 4; // sheets per garment; every sheet that carries tail thoughts uses one more
  const MAX_TAILS = 5;

  const tailTilt = (id) => (((U.hash(id) % 7) - 3) * 0.6).toFixed(2);
  // slightly uneven stitched-label outline, stable per tail
  const tailClip = (id) => {
    const r = U.rng(U.hash(id));
    const j = (n) => (r() * n).toFixed(1);
    return `polygon(${j(3)}% ${j(6)}%, ${100 - +j(3)}% ${j(5)}%, 100% ${100 - +j(6)}%, ${j(4)}% 100%)`;
  };
  const TAIL_CHARS = 30;
  // off-screen twin of a tail textarea, used to test whether a value still fits the tag
  let probe = null;
  const tailProbe = () => {
    if (!probe) {
      probe = document.createElement('textarea');
      probe.className = 'tail-probe';
      probe.setAttribute('aria-hidden', 'true');
      probe.tabIndex = -1;
      document.body.appendChild(probe);
    }
    return probe;
  };

  const ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 25.5l7.5 7.5L35.5 16"/></svg>';
  const ICON_PENCIL =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1-4.2L15.8 5a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L8.7 18.5z"/><path d="M13.8 7l3.2 3.2M4.5 19.5l4.2-1"/></svg>';

  const noteRot = (id) => (((U.hash(id) % 9) - 4) * 0.32).toFixed(2);

  class Editor {
    constructor(root, handlers) {
      this.root = root;
      this.h = handlers;
      this.draft = null;
      this.type = null;
      this.armTimers = {};
      root.innerHTML = `
        <div class="editor">
          <header class="ed-head">
            <button class="ed-back sk" type="button"><span class="ed-back-icon">${ICON_BACK}</span><span class="ed-back-label">옷장</span></button>
            <div class="ed-titles">
              <h2 class="ed-title">오늘의 마음 온도는 어땠나요?</h2>
              <p class="ed-reading" aria-live="polite"><span class="ed-deg"></span><span class="ed-feel"></span></p>
            </div>
            <button class="ed-edit sk" type="button" aria-label="이 기록 고치기" hidden>${ICON_PENCIL}</button>
          </header>
          <div class="ed-temp">
            <div class="thermo" role="slider" tabindex="0" aria-label="마음 온도" aria-orientation="vertical"
                 aria-valuemin="${MIN}" aria-valuemax="${MAX}">
              <div class="thermo-track sk">
                <div class="thermo-fill"></div>
                ${TICKS.map((t) => `<span class="thermo-tick" style="top:${((MAX - t) / (MAX - MIN)) * 100}%">${U.fmtTemp(t, false)}</span>`).join('')}
                <div class="thermo-thumb" aria-hidden="true"></div>
              </div>
            </div>
          </div>
          <div class="ed-garment">
            <div class="garment-stage"></div>
            <p class="garment-name sk"><span class="garment-type"></span><span class="garment-range"></span></p>
            <button class="ed-delete" type="button">이 옷 버리기</button>
          </div>
          <div class="ed-notes">
            <div class="notes-scroll">
              <div class="notes-group">
                <p class="note-tag sk" hidden><span class="note-tag-hole" aria-hidden="true"></span><span class="note-tag-text"></span></p>
                <ol class="notes" aria-label="쪽지"></ol>
                <button class="add-note sk" type="button">+ 쪽지 추가</button>
              </div>
            </div>
            <div class="notes-foot">
              <div class="foot-row">
                <p class="save-hint" role="status" aria-live="polite"></p>
                <button class="save-btn sk" type="button" aria-label="주머니에 넣고 옷장에 보관하기">${ICON_CHECK}</button>
              </div>
            </div>
          </div>
        </div>`;
      const $ = (s) => root.querySelector(s);
      this.thermo = $('.thermo');
      this.trackEl = $('.thermo-track');
      this.fill = $('.thermo-fill');
      this.thumb = $('.thermo-thumb');
      this.degEl = $('.ed-deg');
      this.feelEl = $('.ed-feel');
      this.editBtn = $('.ed-edit');
      this.tagEl = $('.note-tag');
      this.tagText = $('.note-tag-text');
      this.mode = 'new';
      this.stage = $('.garment-stage');
      this.typeEl = $('.garment-type');
      this.rangeEl = $('.garment-range');
      this.list = $('.notes');
      this.scroller = $('.notes-scroll');
      this.addBtn = $('.add-note');
      this.saveBtn = $('.save-btn');
      this.hint = $('.save-hint');
      this.backBtn = $('.ed-back');
      this.backLabel = $('.ed-back-label');
      this.delBtn = $('.ed-delete');
      this.foot = $('.notes-foot');
      this.bindSlider();
      this.bindNotes();
      // web fonts can change text metrics after first layout
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.centerTails());
      let rz = 0;
      window.addEventListener('resize', () => {
        cancelAnimationFrame(rz);
        rz = requestAnimationFrame(() => this.centerTails());
      });
      this.bindButtons();
    }

    /* ---------------- temperature slider ---------------- */

    bindSlider() {
      const el = this.thermo;
      let pid = null;
      const valueAt = (e) => {
        const r = this.trackEl.getBoundingClientRect();
        const t = U.clamp((e.clientY - r.top) / r.height, 0, 1);
        return Math.round(MAX - t * (MAX - MIN));
      };
      el.addEventListener('pointerdown', (e) => {
        if (!this.draft || this.h.isBusy() || this.mode === 'read' || pid !== null) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pid = e.pointerId;
        try {
          el.setPointerCapture(pid);
        } catch (err) {
          /* capture is best-effort */
        }
        el.classList.add('is-drag');
        this.setTemp(valueAt(e), true);
        e.preventDefault();
      });
      el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid) return;
        this.setTemp(valueAt(e), true);
      });
      const end = (e) => {
        if (e.pointerId !== pid) return;
        pid = null;
        el.classList.remove('is-drag');
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      el.addEventListener('keydown', (e) => {
        if (!this.draft) return;
        const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
        let v = null;
        if (e.key in steps) v = this.draft.temperature + steps[e.key];
        else if (e.key === 'Home') v = MIN;
        else if (e.key === 'End') v = MAX;
        if (v === null) return;
        e.preventDefault();
        this.setTemp(v, true);
      });
    }

    setTemp(v, user) {
      if (!this.draft) return;
      if (user && (this.h.isBusy() || this.mode === 'read')) return;
      const t = U.clamp(Math.round(v), MIN, MAX);
      const prevType = this.type;
      const prevTemp = this.draft.temperature;
      this.draft.temperature = t;
      const C = G.colorsFor(t);
      const T = G.TYPES[C.type];
      this.type = C.type;
      const k = (MAX - t) / (MAX - MIN);
      this.thumb.style.top = (k * 100).toFixed(3) + '%';
      this.fill.style.height = ((1 - k) * 100).toFixed(3) + '%';
      this.root.style.setProperty('--g-base', C.base);
      this.root.style.setProperty('--g-plate', C.plate);
      const feel = G.feelFor(t);
      this.degEl.textContent = U.fmtTemp(t);
      this.feelEl.textContent = feel;
      this.thermo.setAttribute('aria-valuenow', String(t));
      this.thermo.setAttribute('aria-valuetext', `${U.fmtTemp(t)}, ${feel}, ${T.name}`);
      this.typeEl.textContent = T.name;
      this.rangeEl.textContent = `${U.fmtTemp(T.min, false)} ~ ${U.fmtTemp(T.max, false)}`;
      if (user && t === prevTemp && prevType) return;
      this.renderGarment();
      if (user && prevType && prevType !== C.type && !U.reducedMotion()) {
        const svg = this.garmentSvg();
        if (svg) {
          svg.animate(
            [{ transform: 'scale(.92) rotate(-1.5deg)', opacity: 0.4 }, { transform: 'scale(1.02)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }],
            { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' }
          );
        }
      }
      this.updateState();
    }

    renderGarment(opts) {
      if (!this.draft) return;
      this.stage.innerHTML = G.garmentSVG(this.draft.temperature, opts);
    }

    garmentSvg() {
      return this.stage.querySelector('svg');
    }

    /* ---------------- notes ---------------- */

    makeNote(note, index) {
      const li = document.createElement('li');
      li.className = 'note';
      li.dataset.id = note.id;
      li.style.setProperty('--paper', G.paperFor(note.id));
      li.style.setProperty('--rot', noteRot(note.id) + 'deg');
      li.innerHTML =
        '<div class="note-sheet">' +
        '<span class="note-tape" aria-hidden="true"></span>' +
        `<textarea rows="2" spellcheck="false" autocomplete="off" placeholder="${index === 0 ? '떠오른 생각을 적어 보세요' : '같은 온도의 다른 생각도 적어 보세요'}"></textarea>` +
        `<button class="note-del" type="button" aria-label="이 쪽지 떼어내기">${ICON_X}</button>` +
        '<div class="note-actions"><button class="tail-add" type="button">+ 꼬리 생각 추가</button></div>' +
        '</div>' +
        '<div class="tails" aria-label="꼬리 생각"></div>';
      const ta = li.querySelector('textarea');
      ta.value = note.text;
      ta.readOnly = this.mode === 'read';
      const row = li.querySelector('.tails');
      (note.tails || []).forEach((t) => row.appendChild(this.makeTail(t)));
      return li;
    }

    /* ---------------- tail thoughts (small stitched tags under a sheet) ---------------- */

    makeTail(tail) {
      const el = document.createElement('div');
      el.className = 'tail';
      el.dataset.id = tail.id;
      el.style.setProperty('--tilt', tailTilt(tail.id) + 'deg');
      el.style.setProperty('--clip', tailClip(tail.id));
      el.innerHTML =
        `<textarea class="tail-input" rows="5" maxlength="${TAIL_CHARS}" spellcheck="false" autocomplete="off" enterkeyhint="done" placeholder="꼬리 생각" aria-label="꼬리 생각"></textarea>` +
        `<button class="tail-del" type="button" aria-label="꼬리 생각 떼어내기">${ICON_X}</button>`;
      const input = el.firstChild;
      input.value = tail.text;
      input.dataset.ok = tail.text;
      input.readOnly = this.mode === 'read';
      return el;
    }

    /** Sheets in use: each sheet, plus one more for every sheet that has tail thoughts. */
    capacityLeft() {
      if (!this.draft) return 0;
      const notes = this.draft.notes;
      return MAX_NOTES - notes.length - notes.filter((n) => n.tails && n.tails.length).length;
    }

    findNote(el) {
      const li = el.closest('.note');
      const note = li && this.draft && this.draft.notes.find((n) => n.id === li.dataset.id);
      return { li, note };
    }

    addTail(btn) {
      if (!this.draft || this.h.isBusy() || this.mode === 'read') return;
      const { li, note } = this.findNote(btn);
      if (!note) return;
      note.tails = note.tails || [];
      if (note.tails.length >= MAX_TAILS || (!note.tails.length && this.capacityLeft() <= 0)) return;
      const tail = { id: U.uid('tail'), text: '' };
      note.tails.push(tail);
      const row = li.querySelector('.tails');
      // older tags slide one place to the left as the new one is sewn on at the far right
      const before = new Map(Array.from(row.children).map((t) => [t, t.getBoundingClientRect().left]));
      const el = this.makeTail(tail);
      row.appendChild(el);
      this.centerTail(el.firstChild);
      el.firstChild.focus({ preventScroll: true });
      if (!U.reducedMotion()) {
        before.forEach((x0, t) => {
          const dx = x0 - t.getBoundingClientRect().left;
          const r = tailTilt(t.dataset.id);
          if (Math.abs(dx) > 0.5) t.animate([{ transform: `translateX(${dx}px) rotate(${r}deg)` }, { transform: `translateX(0px) rotate(${r}deg)` }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
        });
        const r = tailTilt(tail.id);
        el.animate([{ opacity: 0, transform: `translateY(-10px) rotate(${r}deg)` }, { opacity: 1, transform: `translateY(0px) rotate(${r}deg)` }], { duration: 240, easing: 'cubic-bezier(.3,.8,.3,1)' });
      }
      this.updateState();
    }

    removeTail(btn) {
      if (!this.draft || this.h.isBusy() || this.mode === 'read') return;
      const { note } = this.findNote(btn);
      const el = btn.closest('.tail');
      if (!note || !el) return;
      note.tails = (note.tails || []).filter((t) => t.id !== el.dataset.id);
      el.remove();
      this.updateState();
    }

    // a tail thought is one line that must fit its tag
    fitsTail(input, value) {
      if (value.length > TAIL_CHARS) return false;
      const p = tailProbe();
      p.style.width = input.clientWidth + 'px';
      p.value = value;
      return p.scrollHeight <= input.clientHeight + 1;
    }

    /** Start the text in the middle of the tag: top padding = (tag height − text height) / 2. */
    centerTail(ta) {
      if (!ta || !ta.offsetHeight) return;
      const p = tailProbe();
      p.style.width = ta.clientWidth + 'px';
      p.value = ta.value || ta.placeholder;
      const pad = Math.max(0, Math.floor((ta.offsetHeight - p.scrollHeight) / 2));
      ta.style.paddingTop = pad + 'px';
    }

    centerTails(root) {
      (root || this.list).querySelectorAll('.tail-input').forEach((ta) => this.centerTail(ta));
    }

    /** Mirror a tail input into the draft; a value that no longer fits falls back to the last one that did. */
    syncTail(input, composing) {
      if (!composing && !this.fitsTail(input, input.value)) input.value = input.dataset.ok || '';
      if (!composing) input.dataset.ok = input.value;
      this.centerTail(input);
      const { note } = this.findNote(input);
      const tail = note && (note.tails || []).find((t) => t.id === input.closest('.tail').dataset.id);
      if (tail) tail.text = input.value;
      this.updateState();
    }

    /** Refuse typing/pasting past the tag's edge before it happens (caret position respected). */
    guardTail(e) {
      const el = e.target;
      if (el.readOnly || e.isComposing || e.inputType === 'insertCompositionText') return;
      let data = e.data;
      if (data == null && e.dataTransfer) data = e.dataTransfer.getData('text/plain');
      if (!data) return; // deleting always fits
      data = data.replace(/\s+/g, ' ');
      const v = el.value;
      const a = el.selectionStart;
      const b = el.selectionEnd;
      if (this.fitsTail(el, v.slice(0, a) + data + v.slice(b))) return;
      e.preventDefault();
      let d = data;
      while (d && !this.fitsTail(el, v.slice(0, a) + d + v.slice(b))) d = d.slice(0, -1);
      if (d) {
        el.setRangeText(d, a, b, 'end');
        this.syncTail(el, false);
      }
    }

    renumber() {
      this.noteEls().forEach((li, i) => li.querySelector('textarea').setAttribute('aria-label', `쪽지 ${i + 1}`));
    }

    autosize(ta) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }

    bindNotes() {
      this.list.addEventListener('input', (e) => {
        if (e.target.classList.contains('tail-input')) return this.syncTail(e.target, e.isComposing);
        const ta = e.target.closest('textarea');
        if (!ta || !this.draft) return;
        const id = ta.closest('.note').dataset.id;
        const note = this.draft.notes.find((n) => n.id === id);
        if (note) note.text = ta.value;
        this.autosize(ta);
        this.updateState();
      });
      this.list.addEventListener('beforeinput', (e) => {
        if (e.target.classList && e.target.classList.contains('tail-input')) this.guardTail(e);
      });
      this.list.addEventListener('compositionstart', (e) => {
        const el = e.target;
        if (el.classList.contains('tail-input')) el.dataset.pre = el.value;
      });
      this.list.addEventListener('compositionend', (e) => {
        const el = e.target;
        if (!el.classList.contains('tail-input')) return;
        // a syllable that would run past the edge is simply not added
        if (!this.fitsTail(el, el.value)) el.value = el.dataset.pre != null ? el.dataset.pre : el.dataset.ok || '';
        this.syncTail(el, false);
      });
      this.list.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('tail-input') && e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          e.target.blur();
        }
      });
      this.list.addEventListener('click', (e) => {
        const del = e.target.closest('.note-del');
        if (del) return this.removeNote(del.closest('.note').dataset.id);
        const add = e.target.closest('.tail-add');
        if (add) return this.addTail(add);
        const tdel = e.target.closest('.tail-del');
        if (tdel) this.removeTail(tdel);
      });
    }

    addNote() {
      if (!this.draft || this.h.isBusy() || this.capacityLeft() <= 0) return;
      const prev = this.draft.notes[this.draft.notes.length - 1];
      const note = { id: G.newNoteId(prev && prev.id), text: '', tails: [] };
      this.draft.notes.push(note);
      const li = this.makeNote(note, this.draft.notes.length - 1);
      this.list.appendChild(li);
      this.renumber();
      const ta = li.querySelector('textarea');
      this.autosize(ta);
      // focusing inside the tap handler lets iPad open the keyboard
      ta.focus({ preventScroll: true });
      this.updateState();
      this.scroller.scrollTo({ top: this.scroller.scrollHeight, behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      if (!U.reducedMotion()) {
        const r = noteRot(note.id);
        li.animate(
          [{ opacity: 0, transform: `translateY(-18px) rotate(${r - 4}deg)` }, { opacity: 1, transform: `translateY(0) rotate(${r}deg)` }],
          { duration: 280, easing: 'cubic-bezier(.3,.8,.3,1)' }
        );
      }
      this.updateState();
    }

    removeNote(id) {
      if (!this.draft || this.h.isBusy()) return;
      const idx = this.draft.notes.findIndex((n) => n.id === id);
      if (idx < 0) return;
      const li = this.list.querySelector(`.note[data-id="${CSS.escape(id)}"]`);
      if (this.draft.notes.length === 1) {
        // the last sheet is cleared rather than removed — a garment always has paper ready
        this.draft.notes[0].text = '';
        this.draft.notes[0].tails = [];
        const ta = li.querySelector('textarea');
        ta.value = '';
        li.querySelector('.tails').innerHTML = '';
        this.autosize(ta);
        this.updateState();
        return;
      }
      this.draft.notes.splice(idx, 1);
      const done = () => {
        li.remove();
        this.renumber();
        this.updateState();
      };
      if (U.reducedMotion()) return done();
      li.style.pointerEvents = 'none';
      const r = noteRot(id);
      const a = li.animate(
        [{ opacity: 1, transform: `rotate(${r}deg)` }, { opacity: 0, transform: `translateX(40px) rotate(${+r + 8}deg) scale(.9)` }],
        { duration: 200, easing: 'ease-in', fill: 'forwards' }
      );
      a.onfinish = done;
      a.oncancel = done;
    }

    noteEls() {
      return Array.from(this.list.querySelectorAll('.note'));
    }

    hasContent() {
      return !!this.draft && this.draft.notes.some((n) => n.text.trim() || (n.tails || []).some((t) => t.text.trim()));
    }

    isDirty() {
      if (!this.draft) return false;
      return snapshot(this.draft) !== this.draft.original;
    }

    updateState() {
      const ready = this.hasContent();
      this.saveBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
      this.saveBtn.classList.toggle('is-ready', ready);
      if (ready) this.hint.textContent = '';
      const count = this.draft ? this.draft.notes.length : 0;
      const left = this.capacityLeft();
      const read = this.mode === 'read';
      this.addBtn.hidden = left <= 0 || read;
      // a sheet can take tails while it has fewer than five, and a first tail needs a free sheet slot
      this.noteEls().forEach((li) => {
        const note = this.draft && this.draft.notes.find((n) => n.id === li.dataset.id);
        const n = note && note.tails ? note.tails.length : 0;
        li.querySelector('.tail-add').hidden = read || !note || n >= MAX_TAILS || (n === 0 && left <= 0);
        li.classList.toggle('has-tails', n > 0);
      });
      const single = count === 1;
      this.list.classList.toggle('is-single', !!single);
      this.list.classList.toggle('is-blank', !!single && !ready);
    }

    flagEmpty() {
      this.hint.textContent = '쪽지에 한 줄이라도 적어 주세요';
      const first = this.noteEls()[0];
      if (!first) return;
      const ta = first.querySelector('textarea');
      ta.focus({ preventScroll: true });
      if (!U.reducedMotion()) {
        const r = noteRot(first.dataset.id);
        first.animate(
          [0, -7, 6, -4, 2, 0].map((x) => ({ transform: `translateX(${x}px) rotate(${r}deg)` })),
          { duration: 360, easing: 'ease-out' }
        );
      }
    }

    /* ---------------- buttons ---------------- */

    bindButtons() {
      this.addBtn.addEventListener('click', () => this.addNote());
      this.saveBtn.addEventListener('click', () => this.h.onSave());
      this.backBtn.addEventListener('click', () => this.requestBack());
      this.editBtn.addEventListener('click', () => {
        if (this.h.isBusy() || this.mode !== 'read') return;
        this.setMode('edit');
      });
      this.delBtn.addEventListener('click', () => {
        if (this.h.isBusy()) return;
        if (this.arm('del', this.delBtn, '정말 버릴까요? 한 번 더 누르기', '이 옷 버리기')) this.h.onDelete();
      });
    }

    /** Two-step confirmation without a modal. Returns true when confirmed. */
    arm(key, btn, armedText, idleText, labelEl) {
      const target = labelEl || btn;
      if (btn.classList.contains('is-armed')) {
        this.disarm(key, btn, idleText, labelEl);
        return true;
      }
      btn.classList.add('is-armed');
      target.textContent = armedText;
      clearTimeout(this.armTimers[key]);
      this.armTimers[key] = setTimeout(() => this.disarm(key, btn, idleText, labelEl), 3200);
      return false;
    }

    disarm(key, btn, idleText, labelEl) {
      clearTimeout(this.armTimers[key]);
      btn.classList.remove('is-armed');
      (labelEl || btn).textContent = idleText;
    }

    requestBack() {
      if (!this.draft || this.h.isBusy()) return;
      if (!this.isDirty() || this.arm('back', this.backBtn, '저장 안 하고 나가기', '옷장', this.backLabel)) this.h.onCancel();
    }

    /* ---------------- lifecycle ---------------- */

    /**
     * Load a draft. opts.conceal hides the notes (they emerge from the pocket),
     * opts.slips shows the saved slips sitting in the pocket.
     */
    load(draft, opts) {
      const o = opts || {};
      this.draft = draft;
      this.type = null;
      this.disarm('del', this.delBtn, '이 옷 버리기');
      this.disarm('back', this.backBtn, '옷장', this.backLabel);
      this.hint.textContent = '';
      this.foot.style.opacity = '';
      this.list.innerHTML = '';
      draft.notes.forEach((n, i) => this.list.appendChild(this.makeNote(n, i)));
      this.renumber();
      this.noteEls().forEach((li) => this.autosize(li.querySelector('textarea')));
      this.centerTails();
      this.scroller.scrollTop = 0;
      const saved = draft.mode === 'edit';
      this.tagEl.hidden = !saved;
      if (saved) {
        this.tagText.textContent = U.fmtTag(draft.createdAt);
        this.tagEl.setAttribute('aria-label', `${U.fmtDate(draft.createdAt)}에 넣어 둔 옷`);
      }
      this.setMode(saved ? 'read' : 'new');
      this.setTemp(draft.temperature, false);
      if (o.slips) this.renderGarment({ slips: draft.notes.filter((n) => n.text.trim()).map((n) => n.id) });
      this.list.classList.toggle('is-concealed', !!o.conceal);
      this.updateState();
    }

    /**
     * 'new'  — writing a new memo
     * 'read' — looking at a saved garment: notes are read-only and centred, no add/save
     * 'edit' — the pencil was pressed: everything can be changed again
     */
    setMode(mode) {
      this.mode = mode;
      ['new', 'read', 'edit'].forEach((m) => this.root.classList.toggle('mode-' + m, m === mode));
      const read = mode === 'read';
      this.editBtn.hidden = !read;
      this.thermo.setAttribute('aria-readonly', String(read));
      this.thermo.tabIndex = read ? -1 : 0;
      this.noteEls().forEach((li) => (li.querySelector('textarea').readOnly = read));
      this.list.querySelectorAll('.tail-input').forEach((i) => (i.readOnly = read));
      this.updateState();
      if (mode === 'edit' && !U.reducedMotion()) {
        this.root.querySelectorAll('.note-del, .add-note, .notes-foot, .ed-delete, .tail-add, .tail-del').forEach((el) =>
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
        );
      }
    }

    canSave() {
      return this.mode !== 'read';
    }

    /** Show everything in its resting state (end of the opening sequence). */
    reveal() {
      this.list.classList.remove('is-concealed');
      this.noteEls().forEach((li) => (li.style.visibility = ''));
      this.renderGarment();
      this.centerTails();
      this.noteEls().forEach((li) => this.autosize(li.querySelector('textarea')));
    }

    focusFirst() {
      if (!U.finePointer()) return; // don't pop the software keyboard uninvited
      const ta = this.list.querySelector('textarea');
      if (ta) ta.focus({ preventScroll: true });
    }

    clear() {
      this.draft = null;
      this.setMode('new');
      this.tagEl.hidden = true;
      this.type = null;
      this.list.innerHTML = '';
      this.stage.innerHTML = '';
      this.foot.style.opacity = '';
      this.hint.textContent = '';
    }
  }

  function snapshot(d) {
    return JSON.stringify({
      t: d.temperature,
      n: d.notes
        .map((n) => [n.text.trim(), (n.tails || []).map((t) => t.text.trim()).filter(Boolean)])
        .filter(([text, tails]) => text || tails.length),
    });
  }

  MW.Editor = Editor;
  MW.snapshotDraft = snapshot;
})();
