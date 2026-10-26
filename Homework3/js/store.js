/* Mind Wardrobe — versioned persistence. Single source of truth for saved garments. */
(function () {
  'use strict';
  const MW = window.MW;
  const U = MW.util;
  const G = MW.garments;

  const SCHEMA = 1;

  const isDate = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const MAX_TAILS = 5;

  function cleanTails(tails) {
    if (!Array.isArray(tails)) return [];
    return tails
      .filter((t) => t && typeof t.text === 'string')
      .slice(0, MAX_TAILS)
      .map((t) => ({ id: typeof t.id === 'string' && t.id ? t.id : U.uid('tail'), text: t.text }));
  }

  function cleanNote(n) {
    if (!n || typeof n.text !== 'string') return null;
    return { id: typeof n.id === 'string' && n.id ? n.id : U.uid('note'), text: n.text, tails: cleanTails(n.tails) };
  }

  function cleanRecord(r) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null;
    const t = Math.round(Number(r.temperature));
    if (!Number.isFinite(t)) return null;
    const temperature = U.clamp(t, G.MIN_T, G.MAX_T);
    const notes = Array.isArray(r.notes) ? r.notes.map(cleanNote).filter(Boolean) : [];
    const createdAt = isDate(r.createdAt) ? r.createdAt : new Date().toISOString();
    return {
      id: r.id,
      temperature,
      garmentType: G.typeFor(temperature),
      notes,
      createdAt,
      updatedAt: isDate(r.updatedAt) ? r.updatedAt : createdAt,
    };
  }

  // Upgrade older payloads here when the schema changes.
  function migrate(data) {
    if (Array.isArray(data)) return { version: SCHEMA, records: data };
    if (!data || typeof data !== 'object') throw new Error('unreadable wardrobe data');
    if (!Array.isArray(data.records)) throw new Error('missing records');
    return data;
  }

  function cleanNotes(notes) {
    return (notes || [])
      .map((n) => ({
        id: n.id || G.newNoteId(),
        text: String(n.text || '').trim(),
        tails: cleanTails(n.tails)
          .map((t) => ({ id: t.id, text: t.text.trim() }))
          .filter((t) => t.text),
      }))
      .filter((n) => n.text || n.tails.length);
  }

  class Store {
    constructor(key) {
      this.key = key;
      this.records = [];
      this.lastError = null;
      this.listeners = {};
      this.load();
      window.addEventListener('storage', (e) => {
        if (e.key !== this.key) return;
        this.load();
        this.emit('change');
      });
    }

    on(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    }

    emit(type, arg) {
      (this.listeners[type] || []).forEach((fn) => fn(arg));
    }

    hasSavedData() {
      try {
        return localStorage.getItem(this.key) != null;
      } catch (e) {
        return false;
      }
    }

    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(this.key);
      } catch (e) {
        this.lastError = e;
        return;
      }
      if (!raw) {
        this.records = [];
        return;
      }
      try {
        const data = migrate(JSON.parse(raw));
        const seen = new Set();
        this.records = data.records
          .map(cleanRecord)
          .filter((r) => r && !seen.has(r.id) && seen.add(r.id));
      } catch (e) {
        // Keep the unreadable payload instead of silently overwriting it.
        try {
          localStorage.setItem(this.key + '.unreadable.' + Date.now(), raw);
        } catch (_) {
          /* storage full — nothing else we can do */
        }
        console.warn('[store] could not read saved wardrobe', e);
        this.records = [];
        this.lastError = e;
      }
    }

    persist() {
      try {
        const payload = { version: SCHEMA, savedAt: new Date().toISOString(), records: this.records };
        localStorage.setItem(this.key, JSON.stringify(payload));
        this.lastError = null;
        return true;
      } catch (e) {
        this.lastError = e;
        this.emit('error', e);
        return false;
      }
    }

    /** All records, newest first (copies). */
    all() {
      return clone(this.records).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    }

    get(id) {
      const r = this.records.find((x) => x.id === id);
      return r ? clone(r) : null;
    }

    /** Records created within [from, to) — for future views (e.g. a weather forecast). */
    between(from, to) {
      const a = new Date(from).toISOString();
      const b = new Date(to).toISOString();
      return this.all().filter((r) => r.createdAt >= a && r.createdAt < b);
    }

    create({ temperature, notes }) {
      const now = new Date().toISOString();
      const rec = cleanRecord({ id: U.uid('garment'), temperature, notes: cleanNotes(notes), createdAt: now, updatedAt: now });
      if (!rec || !rec.notes.length) return null;
      this.records.push(rec);
      this.persist();
      this.emit('change');
      return clone(rec);
    }

    update(id, { temperature, notes }) {
      const i = this.records.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const prev = this.records[i];
      const rec = cleanRecord({
        id,
        temperature,
        notes: cleanNotes(notes),
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
      });
      if (!rec || !rec.notes.length) return null;
      this.records[i] = rec;
      this.persist();
      this.emit('change');
      return clone(rec);
    }

    remove(id) {
      const i = this.records.findIndex((x) => x.id === id);
      if (i < 0) return false;
      this.records.splice(i, 1);
      this.persist();
      this.emit('change');
      return true;
    }

    /** Put back a record that was just removed (undo). Keeps its id and dates. */
    restore(rec) {
      const r = cleanRecord(rec);
      if (!r || this.records.some((x) => x.id === r.id)) return null;
      this.records.push(r);
      this.persist();
      this.emit('change');
      return clone(r);
    }

    /**
     * Add the sample garments once per device. Never removes or overwrites anything:
     * records already present are kept, and once the flag is set a deleted sample stays deleted.
     */
    seedOnce(records, flagKey) {
      try {
        if (localStorage.getItem(flagKey)) return false;
      } catch (e) {
        return false;
      }
      const have = new Set(this.records.map((r) => r.id));
      records
        .map(cleanRecord)
        .filter((r) => r && !have.has(r.id))
        .forEach((r) => this.records.push(r));
      if (this.persist()) {
        try {
          localStorage.setItem(flagKey, new Date().toISOString());
        } catch (e) {
          /* the samples are saved; worst case they are offered again */
        }
      }
      this.emit('change');
      return true;
    }

    /** Run a one-time data update (fn mutates the records and returns whether anything changed). */
    patchOnce(flagKey, fn) {
      try {
        if (localStorage.getItem(flagKey)) return false;
      } catch (e) {
        return false;
      }
      const changed = !!fn(this.records);
      if (changed && !this.persist()) return false; // try again next time
      try {
        localStorage.setItem(flagKey, new Date().toISOString());
      } catch (e) {
        /* ignore */
      }
      if (changed) this.emit('change');
      return changed;
    }

    /** Replace contents — only used for the separate demo wardrobe. */
    seed(records) {
      this.records = records.map(cleanRecord).filter(Boolean);
      this.persist();
      this.emit('change');
    }
  }

  // Sample garments that come with the wardrobe. Stable ids, so they can never be added twice.
  // A note is either 'text' or ['text', ['tail thought', ...]].
  const SAMPLES = [
    ['1016', [2026, 9, 16, 21, 40], -18, ['시험을 망쳤다... 슬펐다.', '장대비 속에서 20분동안 걷다가 머리부터 발끝까지 젖었다.', '새로 산 양말을 버렸다.']],
    ['1021', [2026, 9, 21, 22, 15], 27, [['오랜만에 서정쌤을 만났다. 대화가 잘 통해서 기분이 좋았다!', ['서정쌤과 하는 대화는 늘 재밌다.']], '조금 늦게 일어났지만 그래도 하루가 산뜻했다.']],
    ['1022', [2026, 9, 22, 23, 5], 19, ['전자오락수호대라는 영화를 봤다. 조금 아쉬웠지만 그래도 재밌었다.', '저녁으로 먹은 음식이 참 맛있었다.']],
    ['1023', [2026, 9, 23, 20, 30], 8, ['너무 늦게 일어나서 하루를 날렸다.', '그래도 저녁으로 먹은 치킨이 꽤 맛있었다.']],
    [
      '1025',
      [2026, 9, 25, 23, 50],
      30,
      [
        ['잔나비 콘서트에 다녀왔는데 정말 재미있었다! 길이 남을 추억이다.', ['역시 알록달록 떼창이 제일 신났다', '사랑의이름으로! 도 불러줬으면 좋았을 텐데.']],
        '점심으로 먹은 냉라면이 맛있었다.',
        '대중교통 운이 좋아서 바로바로 타고 금세 집에 왔다! 럭키!',
      ],
    ],
    ['1026', [2026, 9, 26, 19, 30], 18, ['조금은 지치고 피곤했지만 교수님께 칭찬을 들어서 행복했다.', ['수업을 같이 듣는 분이 오셔서 작업을 잘 봤다고 칭찬해주셨다.', ['피드백도 남겨주셨다. 반영해야지!']]]],
  ];

  function sampleRecords() {
    return SAMPLES.map(([key, [y, mo, d, h, mi], t, rows]) => {
      const iso = new Date(y, mo, d, h, mi).toISOString();
      let prevPaper = null;
      const notes = rows.map((row, i) => {
        const [text, tails] = Array.isArray(row) ? row : [row, []];
        // deterministic ids, nudged so neighbouring sheets get different paper
        let id = `sample-${key}-n${i + 1}`;
        for (let k = 0; G.paperFor(id) === prevPaper && k < 20; k++) id = `sample-${key}-n${i + 1}-${k}`;
        prevPaper = G.paperFor(id);
        return { id, text, tails: tails.map((tt, j) => ({ id: `${id}-t${j + 1}`, text: tt })) };
      });
      return { id: `sample-${key}`, temperature: t, notes, createdAt: iso, updatedAt: iso };
    });
  }

  /**
   * Bring an earlier copy of the samples up to date, once: add samples that did not exist yet and
   * tail thoughts that were added later. Nothing is removed or rewritten; deleted samples stay deleted
   * (only samples whose id was never seen on this device are added).
   */
  function updateSamples(records, knownIds) {
    let changed = false;
    sampleRecords().forEach((sample) => {
      const mine = records.find((r) => r.id === sample.id);
      if (!mine) {
        if (!knownIds.includes(sample.id)) {
          records.push(sample);
          changed = true;
        }
        return;
      }
      sample.notes.forEach((sn) => {
        const note = mine.notes.find((n) => n.id === sn.id);
        if (!note) return;
        note.tails = note.tails || [];
        sn.tails.forEach((st) => {
          if (note.tails.length < 5 && !note.tails.some((t) => t.id === st.id || t.text === st.text)) {
            note.tails.push(st);
            changed = true;
          }
        });
      });
    });
    return changed;
  }

  MW.Store = Store;
  MW.sampleRecords = sampleRecords;
  MW.updateSamples = updateSamples;
})();
