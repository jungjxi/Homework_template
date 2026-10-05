// =====================================================================
// utils — 수학 / 이징 / 색 / 그라디언트 / 경로 헬퍼
//   p5 전역 함수(lerp, random, TAU …)와 이름이 겹치지 않게 짓는다.
// =====================================================================

const PI2 = Math.PI * 2;

// ---------------------------------------------------------------------
// 수학
// ---------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// 프레임레이트와 무관한 지수 접근 계수
const expDecay = (rate, dt) => 1 - Math.exp(-rate * dt);

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// ---------------------------------------------------------------------
// 랜덤
// ---------------------------------------------------------------------
const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gauss = () => {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(PI2 * Math.random());
};

// 시드 랜덤 — 세 봉투가 완전히 같은 형태가 되도록
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// 색 — 배열 [r,g,b] 또는 "#rrggbb" 둘 다 받는다
// ---------------------------------------------------------------------
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toRgb = (c) => (typeof c === "string" ? hexRgb(c) : c);

function rgba(c, a = 1) {
  const [r, g, b] = toRgb(c);
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

function mixRgb(c1, c2, t) {
  const a = toRgb(c1);
  const b = toRgb(c2);
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

// amt > 0 : 흰색 쪽으로, amt < 0 : 검정 쪽으로
function shade(c, amt) {
  return amt >= 0 ? mixRgb(c, [255, 255, 255], amt) : mixRgb(c, [0, 0, 0], -amt);
}

// ---------------------------------------------------------------------
// 그라디언트 (stops: [[t, cssColor], ...])
// ---------------------------------------------------------------------
function linGrad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

function radGrad(ctx, x0, y0, r0, x1, y1, r1, stops) {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

// ---------------------------------------------------------------------
// 경로 — pts: [[x, y], ...]
// ---------------------------------------------------------------------

// 닫힌 부드러운 곡선 (중점을 지나는 quadratic). 점 순서(= winding)를 유지한다.
function traceSmooth(ctx, pts) {
  const n = pts.length;
  const last = pts[n - 1];
  ctx.moveTo((last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  ctx.closePath();
}

// 열린 부드러운 곡선. start=false 면 현재 경로에 이어 붙인다.
function traceOpenSmooth(ctx, pts, start = true) {
  if (start) ctx.moveTo(pts[0][0], pts[0][1]);
  else ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(l[0], l[1]);
}

function tracePoly(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// ccw=true : 화면 기준 반시계 (봉투 몸통 경로와 같은 winding → nonzero 합집합)
function traceEllipse(ctx, cx, cy, rx, ry, rot = 0, ccw = false) {
  ctx.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  ctx.ellipse(cx, cy, rx, ry, rot, 0, PI2, ccw);
}

function traceRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 불규칙한 조각 (재, 흙, 비닐 포장지 …)
function irregularPoly(rnd, n, r, jitter) {
  const pts = [];
  const off = rnd() * PI2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * PI2 + (rnd() - 0.5) * (PI2 / n) * 0.6;
    const rr = r * (1 - jitter + rnd() * 2 * jitter);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

// Matter.js 용 타원 꼭짓점 (볼록)
function ellipseVerts(rx, ry, n) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI2;
    v.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
  }
  return v;
}
