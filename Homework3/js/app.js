/* Mind Wardrobe — application state and flow between wardrobe and editor. */
(function () {
  'use strict';
  const MW = window.MW;
  const U = MW.util;
  const G = MW.garments;
  const motion = MW.motion;

  /* ---------------- storage namespace (demo data never touches real data) ---------------- */
  const params = new URLSearchParams(location.search);
  const demo = params.has('demo');
  const store = new MW.Store(demo ? 'mindWardrobe.demo.v3' : 'mindWardrobe.v1');
  if (demo && (params.get('demo') === 'reset' || !store.hasSavedData())) store.seed(MW.sampleRecords());
  // the wardrobe comes with a few sample garments (added once; the user's own records are kept)
  if (!demo) {
    // devices that got the first set of samples receive the 10/26 garment and the tail thoughts once
    const hadFirstSet = (() => {
      try {
        return !!localStorage.getItem('mindWardrobe.samples.v1');
      } catch (e) {
        return false;
      }
    })();
    store.seedOnce(MW.sampleRecords(), 'mindWardrobe.samples.v1');
    if (hadFirstSet) {
      const firstSet = ['sample-1016', 'sample-1021', 'sample-1022', 'sample-1023', 'sample-1025'];
      store.patchOnce('mindWardrobe.samples.v2', (records) => MW.updateSamples(records, firstSet));
    } else {
      store.patchOnce('mindWardrobe.samples.v2', () => false);
    }
  }
  // ask the browser not to evict local data (best effort; Safari/Chrome may decline)
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    /* not available */
  }

  const track = document.getElementById('track');
  const wardScene = document.getElementById('wardrobe');
  const edScene = document.getElementById('editor');
  const flight = document.getElementById('flight');
  const toastEl = document.getElementById('toast');

  let view = 'wardrobe';
  let draft = null;

  const editor = new MW.Editor(edScene, {
    onSave: save,
    onCancel: cancel,
    onDelete: removeRecord,
    isBusy: () => motion.busy(),
  });
  const wardrobe = new MW.Wardrobe(wardScene, {
    onCreate: startNew,
    onOpen: openRecord,
    onDiscard: discardRecord,
    isBusy: () => motion.busy() || view !== 'wardrobe',
  });

  /* ---------------- view / pan ---------------- */

  const sceneWidth = () => wardScene.getBoundingClientRect().width;

  function setView(v) {
    view = v;
    document.body.classList.toggle('view-editor', v === 'editor');
    track.style.transform = v === 'editor' ? 'translate3d(-50%, 0, 0)' : 'translate3d(0, 0, 0)';
    wardScene.inert = v !== 'wardrobe';
    edScene.inert = v !== 'editor';
    wardScene.setAttribute('aria-hidden', String(v !== 'wardrobe'));
    edScene.setAttribute('aria-hidden', String(v !== 'editor'));
  }

  function pan(v, ms) {
    let from = 0;
    try {
      from = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
    } catch (e) {
      from = view === 'editor' ? -sceneWidth() : 0;
    }
    setView(v);
    if (!ms || U.reducedMotion()) return Promise.resolve(true);
    const to = v === 'editor' ? -sceneWidth() : 0;
    return motion.play(track, [{ transform: `translate3d(${from}px, 0, 0)` }, { transform: `translate3d(${to}px, 0, 0)` }], {
      duration: ms,
      easing: 'cubic-bezier(.65,0,.25,1)',
      fill: 'none',
    });
  }

  const ctx = (record) => ({
    editor,
    wardrobe,
    record,
    pan,
    sceneWidth,
    records: () => store.all(),
  });

  /* ---------------- flows ---------------- */

  function makeDraft(base) {
    const d = base;
    d.original = MW.snapshotDraft(d);
    return d;
  }

  function startNew() {
    if (motion.busy() || view !== 'wardrobe') return;
    draft = makeDraft({ mode: 'new', id: null, temperature: 15, notes: [{ id: G.newNoteId(), text: '', tails: [] }] });
    editor.load(draft);
    motion.run(
      async (alive) => {
        const svg = editor.garmentSvg();
        const p = pan('editor', 680);
        if (svg && !U.reducedMotion()) {
          motion.play(svg, [{ opacity: 0, transform: 'translateY(24px) scale(.94)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], {
            duration: 520,
            delay: 300,
            easing: 'cubic-bezier(.3,.7,.3,1)',
          });
        }
        await p;
        if (alive()) await motion.wait(140);
      },
      () => {
        setView('editor');
        editor.focusFirst();
      }
    );
  }

  function openRecord(id) {
    if (motion.busy() || view !== 'wardrobe') return;
    const rec = store.get(id);
    if (!rec) return;
    draft = makeDraft({
      mode: 'edit',
      id: rec.id,
      temperature: rec.temperature,
      notes: rec.notes.length
        ? rec.notes.map((n) => ({ id: n.id, text: n.text, tails: (n.tails || []).map((t) => ({ id: t.id, text: t.text })) }))
        : [{ id: G.newNoteId(), text: '', tails: [] }],
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    });
    editor.load(draft, { conceal: true, slips: true });
    motion.run(
      (alive) => MW.sequences.openSeq(alive, ctx(rec)),
      () => {
        setView('editor');
        editor.reveal();
        wardrobe.render(store.all(), { hiddenId: rec.id });
      }
    );
  }

  function save() {
    if (!draft || motion.busy() || view !== 'editor' || !editor.canSave()) return;
    const notes = draft.notes
      .map((n) => ({
        id: n.id,
        text: n.text.trim(),
        tails: (n.tails || []).map((t) => ({ id: t.id, text: t.text.trim() })).filter((t) => t.text),
      }))
      .filter((n) => n.text || n.tails.length);
    if (!notes.length) {
      editor.flagEmpty();
      return;
    }
    const wasNew = draft.mode !== 'edit' || !draft.id;
    let rec = null;
    if (!wasNew) rec = store.update(draft.id, { temperature: draft.temperature, notes });
    // a record deleted in another tab is saved again rather than lost
    if (!rec) rec = store.create({ temperature: draft.temperature, notes });
    if (!rec) {
      toast('저장하지 못했어요. 다시 시도해 주세요.');
      return;
    }
    // From here on this draft can only ever update the same record.
    draft.mode = 'edit';
    draft.id = rec.id;
    const storageFailed = !!store.lastError;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    motion.run(
      (alive) => MW.sequences.saveSeq(alive, ctx(rec)),
      () => {
        draft = null;
        setView('wardrobe');
        editor.clear();
        wardrobe.render(store.all(), { focusId: rec.id });
        wardrobe.settle(rec.id);
        if (storageFailed) toast('이 브라우저에 저장하지 못했어요. 창을 닫으면 사라질 수 있어요.', 3600);
        else toast(wasNew ? '옷장에 넣었어요' : '고친 마음을 다시 넣었어요');
        if (!wasNew) maybeShowBinHint();
      }
    );
  }

  const HINT_KEY = 'mindWardrobe.hints.v1';
  function maybeShowBinHint() {
    let seen = false;
    try {
      seen = !!localStorage.getItem(HINT_KEY);
      if (!seen) localStorage.setItem(HINT_KEY, 'bin');
    } catch (e) {
      /* no storage: show it this once anyway */
    }
    if (!seen) setTimeout(() => wardrobe.showBinHint(), 350);
  }

  /** A garment dropped into the donation bin: remove it, offer a short undo. */
  let quiet = false;
  function discardRecord(id) {
    const rec = store.get(id);
    if (!rec) return;
    const next = store.all().filter((r) => r.id !== id);
    wardrobe.render(next, { animate: true });
    quiet = true;
    store.remove(id);
    quiet = false;
    toast('헌옷수거함에 넣었어요', 5000, {
      label: '되돌리기',
      run: () => {
        if (!store.restore(rec)) return;
        quiet = true;
        wardrobe.render(store.all(), { animate: true, focusId: rec.id });
        quiet = false;
        wardrobe.settle(rec.id);
        toast('다시 옷장에 넣었어요');
      },
    });
  }

  function cancel() {
    if (motion.busy() || view !== 'editor') return;
    const id = draft && draft.mode === 'edit' ? draft.id : null;
    draft = null; // discard the draft; the store still holds the exact saved values
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    wardrobe.render(store.all(), { hiddenId: id });
    motion.run(
      async () => {
        await pan('wardrobe', 640);
      },
      () => {
        setView('wardrobe');
        editor.clear();
        wardrobe.render(store.all(), id ? { focusId: id } : {});
        if (id) {
          wardrobe.settle(id);
          maybeShowBinHint();
        }
      }
    );
  }

  function removeRecord() {
    if (!draft || draft.mode !== 'edit' || !draft.id || motion.busy()) return;
    const id = draft.id;
    if (!store.remove(id)) return;
    draft = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    motion.run(
      async (alive) => {
        const svg = editor.garmentSvg();
        if (svg && !U.reducedMotion()) {
          await motion.play(svg, [{ opacity: 1, transform: 'scale(1) rotate(0deg)' }, { opacity: 0, transform: 'scale(.7) rotate(-6deg)' }], {
            duration: 320,
            easing: 'ease-in',
          });
        }
        if (!alive()) return;
        wardrobe.render(store.all(), { animate: true });
        await pan('wardrobe', 640);
      },
      () => {
        setView('wardrobe');
        editor.clear();
        wardrobe.render(store.all());
        toast('옷을 정리했어요');
      }
    );
  }

  /* ---------------- feedback ---------------- */

  let toastTimer = 0;
  function toast(msg, ms, action) {
    toastEl.textContent = '';
    toastEl.append(msg);
    toastEl.classList.toggle('has-action', !!action);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        toastEl.classList.remove('is-on', 'has-action');
        action.run();
      });
      toastEl.append(btn);
    }
    toastEl.classList.remove('is-on');
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on', 'has-action'), ms || 1800);
  }

  store.on('error', () => toast('브라우저 저장 공간에 저장하지 못했어요', 3200));
  store.on('change', () => {
    if (!quiet && !motion.busy() && view === 'wardrobe') wardrobe.render(store.all());
  });

  /* ---------------- global input ---------------- */

  flight.addEventListener('pointerdown', () => motion.skip());

  document.addEventListener('keydown', (e) => {
    if (motion.busy()) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        motion.skip();
      }
      return;
    }
    if (view !== 'editor') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      editor.requestBack();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  });

  const isTyping = () => document.activeElement && document.activeElement.tagName === 'TEXTAREA';
  function setAppHeight() {
    document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  }
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      // the iPad software keyboard must not squash the layout
      if (!isTyping()) setAppHeight();
      if (motion.busy()) motion.finish();
      wardrobe.fit();
      wardrobe.hideTag();
    });
  });
  window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && motion.busy()) motion.finish();
  });

  /* ---------------- boot ---------------- */

  setAppHeight();
  setView('wardrobe');
  wardrobe.fit();
  wardrobe.render(store.all());
  wardrobe.reveal(null); // start at the newest end of a long drawer
  if (demo) document.body.classList.add('is-demo');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => wardrobe.fit());

  // Small inspection hook for testing in the console. Not used by the UI.
  MW.app = {
    store,
    state: () => ({ view, busy: motion.busy(), draft: draft && JSON.parse(JSON.stringify(draft)) }),
  };
})();
