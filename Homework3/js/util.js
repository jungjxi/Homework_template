/* Mind Wardrobe — shared helpers (geometry, color, DOM, formatting) */
(function () {
  'use strict';
  const MW = (window.MW = window.MW || {});
  const U = {};

  U.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  U.lerp = (a, b, t) => a + (b - a) * t;

  // Small deterministic PRNG so hand-cut wobbles look identical on every render.
  U.rng = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  U.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  U.uid = (prefix) => {
    let core;
    try {
      core = crypto.randomUUID();
    } catch (e) {
      core = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    return prefix + '-' + core;
  };

  /* ---------- color ---------- */
  const toRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const toHex = (rgb) =>
    '#' + rgb.map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  U.mix = (a, b, t) => {
    const A = toRgb(a);
    const B = toRgb(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  };

  /* ---------- cut-paper geometry ---------- */
  const f = (n) => Math.round(n * 10) / 10;

  // Closed path through `pts` with softly rounded corners and a slight hand-cut jitter.
  // `r` may be a number or an array (one radius per vertex).
  U.cutPath = (pts, opt) => {
    const o = opt || {};
    const r = o.r == null ? 7 : o.r;
    const jitter = o.jitter == null ? 1.2 : o.jitter;
    const rand = U.rng(o.seed || 1);
    const p = pts.map(([x, y]) => [x + (rand() - 0.5) * 2 * jitter, y + (rand() - 0.5) * 2 * jitter]);
    const n = p.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = p[(i - 1 + n) % n];
      const b = p[i];
      const c = p[(i + 1) % n];
      const rr = Array.isArray(r) ? r[i] || 0 : r;
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      const r1 = Math.min(rr, l1 / 2);
      const r2 = Math.min(rr, l2 / 2);
      const s = [b[0] + ((a[0] - b[0]) * r1) / l1, b[1] + ((a[1] - b[1]) * r1) / l1];
      const e = [b[0] + ((c[0] - b[0]) * r2) / l2, b[1] + ((c[1] - b[1]) * r2) / l2];
      d += (i === 0 ? 'M' : 'L') + f(s[0]) + ' ' + f(s[1]);
      d += 'Q' + f(b[0]) + ' ' + f(b[1]) + ' ' + f(e[0]) + ' ' + f(e[1]);
    }
    return d + 'Z';
  };

  U.polyPath = (pts) => 'M' + pts.map(([x, y]) => f(x) + ' ' + f(y)).join('L');

  // Right half (top-centre → bottom-centre) mirrored into a full symmetric outline.
  U.sym = (right, cx) => {
    const c = cx == null ? 200 : cx;
    return right.concat(right.slice(1, -1).reverse().map(([x, y]) => [2 * c - x, y]));
  };

  U.mirror = (pts, cx) => {
    const c = cx == null ? 200 : cx;
    return pts.map(([x, y]) => [2 * c - x, y]);
  };

  // Points along a→b that swell outward in `n` soft bumps (quilting, knit edges).
  U.bumps = (a, b, n, amp, side, samples) => {
    const sm = samples || 4;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (dy / len) * (side || 1);
    const ny = (-dx / len) * (side || 1);
    const out = [];
    for (let k = 0; k < n; k++) {
      for (let s = 1; s <= sm; s++) {
        const t = (k + s / sm) / n;
        const off = amp * Math.sin(Math.PI * (s / sm));
        out.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
      }
    }
    return out;
  };

  /* ---------- DOM ---------- */
  U.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  U.reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  U.finePointer = () => !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

  /* ---------- formatting ---------- */
  U.fmtTemp = (v, unit) => {
    const n = Math.round(v);
    const s = n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
    return s + (unit === false ? '°' : '°C');
  };

  let dateFmt = null;
  U.fmtDate = (iso) => {
    try {
      dateFmt =
        dateFmt ||
        new Intl.DateTimeFormat('ko-KR', {
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        });
      return dateFmt.format(new Date(iso));
    } catch (e) {
      return String(iso);
    }
  };

  // Garment-tag style stamp: "10/26 오후 9:07"
  U.fmtTag = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const h = d.getHours();
    return `${d.getMonth() + 1}/${d.getDate()} ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  MW.util = U;
})();
