// =====================================================================
// TrashBag — 세 패널이 공유하는 쓰레기봉투
//   · 형태는 로컬 좌표(원점 = 몸통 중심, 단위 = 논리 px)로 한 번만 만든다.
//     같은 시드를 쓰므로 세 봉투는 같은 오브제의 복제본이다.
//   · 렌더 순서
//       ① 내부 쓰레기 (몸통 경로로 클립)
//       ② 반투명 비닐 몸통 (중앙은 투명, 가장자리는 불투명)
//       ③ 안쪽 림 / 하이라이트
//       ④ 주름
//       ⑤ 매듭 + 비닐 귀
//       (+) 그을림 오버레이 (BURN) — 점화 지점에서 퍼진다
//   · 씬은 x, y, rot, baseSx/baseSy, alpha, burn, visible 만 바꿔서
//     같은 봉투에 서로 다른 행동을 준다.
// =====================================================================

// 로컬 좌표 기준 치수 (scale = 1)
const BAG = {
  top: -190, // 귀 끝
  bottom: 110, // 몸통 바닥
  neckY: -112,
  halfW: 156,
  // 히트 테스트 / 충돌용 몸통 타원
  ellCy: 5,
  ellRx: 150,
  ellRy: 108,
};

class TrashBag {
  constructor() {
    this.geom = TrashBag.geometry();
    // 좁은 패널에서는 봉투를 비례해서 줄인다 (생성 시점의 패널 폭 기준)
    const L = CONFIG.layout;
    this.scale = CONFIG.bag.scale * clamp(LAYOUT.PW / L.bagRefWidth, L.bagMinScale, 1);

    this.x = 0;
    this.y = 0;
    this.rot = 0;
    this.rotOffset = 0; // 씬이 주는 추가 기울기 (가라앉을 때 흔들림 등)
    this.baseSx = 1;
    this.baseSy = 1;
    this.sx = 1;
    this.sy = 1;
    this.alpha = 1;
    this.visible = true;
    this.burn = null; // { p: 0..1, seed, ox, oy } — ox/oy: 점화 지점 (로컬 좌표)
    this.bites = []; // SINK: 물고기가 뜯어 먹은 자리 { x, y, pts } (로컬 좌표)

    // 움직임에서 나오는 2차 반응 (스프링)
    this.vx = 0;
    this.vy = 0;
    this.rotV = 0;
    this.sq = 0;
    this.sqV = 0;
    this.innerX = 0;
    this.innerY = 0;
    this.ixV = 0;
    this.iyV = 0;
    this.wobble = 0;
    this._px = undefined;
    this._py = undefined;

    this._buf = this.geom.body.map((p) => [p[0], p[1]]);
  }

  // -------------------------------------------------------------------
  // 형태 (공유 캐시)
  // -------------------------------------------------------------------
  static geometry() {
    if (TrashBag._geom) return TrashBag._geom;
    const rnd = mulberry32(20260929);
    const T = CONFIG.tone;
    const P = CONFIG.palette;

    // 1) 몸통 외곽 — 반폭 프로파일 w(v), v: 0 = 바닥, 1 = 목
    const half = (v) => {
      if (v < 0.4) {
        const u = (0.4 - v) / 0.4;
        return 150 * Math.pow(1 - Math.pow(u, 3.2), 1 / 3.2);
      }
      const k = (v - 0.4) / 0.6;
      return 10 + 140 * (1 - Math.pow(k, 1.45)) * (1 - 0.15 * k);
    };
    const N = 34;
    const body = [];
    // 오른쪽: 바닥 → 목 (조금 더 부풀어 있다)
    for (let k = 0; k <= N; k++) {
      const v = k / N;
      const w = half(v) * 1.04 * (1 + 0.035 * Math.sin(v * 11 + 1.3) + 0.02 * Math.sin(v * 23 + 0.4));
      body.push([w, 110 - 222 * v]);
    }
    // 왼쪽: 목 → 바닥
    for (let k = N; k >= 1; k--) {
      const v = k / N;
      const w = half(v) * 0.97 * (1 + 0.03 * Math.sin(v * 9 + 4.1) + 0.025 * Math.sin(v * 19 + 2.2));
      body.push([-w, 110 - 222 * v]);
    }
    // 바닥은 내용물 때문에 살짝 울퉁불퉁
    for (const p of body) {
      if (p[1] > 88) p[1] += 3 * Math.sin(p[0] * 0.07 + 0.5) * ((p[1] - 88) / 22);
    }
    const normals = body.map(([x, y]) => {
      const dx = x;
      const dy = y - 5;
      const l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    });

    // 2) 내부 쓰레기 — 몸통 하단 약 60~65% 에 모여 있다 (y ≥ -35)
    //    m: 흔들릴 때 내용물이 따라 움직이는 정도
    const blob = (x, y, s, c, r = 0, m = 1) => ({
      type: "blob", x, y, s, c, r, m,
      pts: irregularPoly(rnd, 9, s, 0.2),
    });
    const wrap = (x, y, s, c, r = 0, m = 1) => ({
      type: "wrap", x, y, s, c, r, m,
      pts: irregularPoly(rnd, 7, s, 0.32),
    });
    const items = [
      blob(10, 40, 34, P.cafe, 0.3, 0.6),
      wrap(38, -12, 44, P.amarelo, 0.4, 1.1),
      wrap(-55, -2, 40, P.vermelho, -0.3, 1.0),
      blob(-122, 38, 26, P.areia, 0, 0.8),
      blob(116, 28, 24, T.brownLight, 0.5, 0.8),
      { type: "cup", x: -95, y: 44, r: 0.45, m: 0.9, w1: 50, w2: 34, h: 64 },
      { type: "can", x: -24, y: 18, r: 1.05, m: 0.8, w: 44, h: 82, c: P.vermelho },
      { type: "straw", x: 74, y: -2, r: 0.95, m: 1.2, len: 96 },
      { type: "bottle", x: 64, y: 46, r: -0.55, m: 0.7, w: 38, h: 120 },
      wrap(-80, 76, 18, T.green, 0.8, 0.6),
      { type: "box", x: 112, y: 78, r: 0.2, m: 0.5, w: 46, h: 32 },
      { type: "bigcap", x: -44, y: 76, r: -0.25, m: 0.4, R: 34 },
      { type: "cap", x: 6, y: 92, r: 0, m: 0.4, R: 10, c: T.blueCap },
      { type: "cap", x: 46, y: 96, r: 0, m: 0.4, R: 9, c: P.vermelho },
      { type: "cap", x: -122, y: 84, r: 0, m: 0.4, R: 8, c: P.amarelo },
    ];

    // 3) 비닐의 불균일한 뿌연 부분
    const haze = [
      { x: -30, y: -55, r: 80, a: 0.36 },
      { x: 62, y: 28, r: 62, a: 0.3 },
      { x: -92, y: 58, r: 52, a: 0.26 },
      { x: 20, y: 86, r: 46, a: 0.22 },
      { x: 110, y: -30, r: 40, a: 0.26 },
      { x: -10, y: 30, r: 44, a: 0.18 },
    ];

    // 4) 매듭에서 아래로 퍼지는 주름 [x0, y0, cx, cy, x1, y1]
    const wrinkles = [
      [-5, -106, -40, -80, -122, -38],
      [-3, -104, -22, -70, -70, -18],
      [0, -104, -4, -70, -22, -44],
      [2, -104, 14, -68, 30, -28],
      [4, -105, 36, -76, 88, -24],
      [6, -106, 50, -86, 126, -56],
      [-104, 58, -86, 76, -60, 86],
      [84, 68, 100, 56, 112, 38],
    ];

    // 5) 하이라이트 (왼쪽 위에서 빛)
    const highlights = [
      { x: -104, y: -8, rx: 9, ry: 36, rot: 0.38 },
      { x: -72, y: -58, rx: 5, ry: 20, rot: 0.62 },
      { x: 122, y: 24, rx: 6, ry: 26, rot: -0.2 },
    ];

    // 6) 비닐 귀 (매듭 위 두 갈래)
    const ear = (bx, by, tx, ty, w) => {
      const dx = tx - bx;
      const dy = ty - by;
      const L = Math.hypot(dx, dy);
      return {
        cx: bx + dx * 0.55,
        cy: by + dy * 0.55,
        rx: L * 0.55,
        ry: w,
        ang: Math.atan2(dy, dx),
      };
    };
    const ears = [ear(-3, -120, -80, -178, 22), ear(3, -120, 86, -170, 25)];

    TrashBag._geom = { body, normals, items, haze, wrinkles, highlights, ears };
    return TrashBag._geom;
  }

  // -------------------------------------------------------------------
  // 측정
  // -------------------------------------------------------------------
  get height() {
    return (BAG.bottom - BAG.top) * this.scale;
  }
  get topY() {
    return this.y + BAG.top * this.scale * this.sy;
  }
  get bottomY() {
    return this.y + BAG.bottom * this.scale * this.sy;
  }

  // 월드 ↔ 로컬 (회전, 배율, 늘어남 포함)
  toLocal(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    const c = Math.cos(-this.rot);
    const s = Math.sin(-this.rot);
    return [(dx * c - dy * s) / (this.scale * this.sx), (dx * s + dy * c) / (this.scale * this.sy)];
  }
  toWorld(lx, ly) {
    const x = lx * this.scale * this.sx;
    const y = ly * this.scale * this.sy;
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return [this.x + x * c - y * s, this.y + x * s + y * c];
  }

  // 로컬 좌표가 몸통 타원 + 매듭/귀 박스 안인지
  static insideLocal(lx, ly, pad) {
    const ex = lx / (BAG.ellRx + pad);
    const ey = (ly - BAG.ellCy) / (BAG.ellRy + pad);
    if (ex * ex + ey * ey <= 1) return true;
    return lx > -100 - pad && lx < 100 + pad && ly > BAG.top - pad && ly < -90;
  }

  contains(px, py, pad = 12) {
    const [lx, ly] = this.toLocal(px, py);
    return TrashBag.insideLocal(lx, ly, pad);
  }

  // 뜯긴 구멍 경로 (현재 변환 기준으로 봉투 로컬 좌표를 적용해 그린다)
  traceBites(ctx, grow = 0) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.scale(this.scale * this.sx, this.scale * this.sy);
    ctx.beginPath();
    for (const b of this.bites) {
      const pts = b.pts.map(([x, y]) => {
        const l = Math.hypot(x, y) || 1;
        return [b.x + x + (x / l) * grow, b.y + y + (y / l) * grow];
      });
      traceSmooth(ctx, pts);
    }
    ctx.restore();
  }

  // 점화 지점 → 봉투 끝까지 닿는 최대 반경
  burnMaxRadius() {
    const { ox, oy } = this.burn;
    let m = 0;
    for (const [x, y] of [[-162, BAG.top - 6], [162, BAG.top - 6], [-162, BAG.bottom + 6], [162, BAG.bottom + 6]]) {
      m = Math.max(m, Math.hypot(x - ox, y - oy));
    }
    return m + 30;
  }

  // 그을림 경계 반경 (각도마다 노이즈로 불규칙)
  burnRadius(a, t) {
    const b = this.burn;
    const R = this.burnMaxRadius() * easeInOutSine(clamp(b.p * 1.08, 0, 1));
    return R * (0.8 + 0.4 * noise(Math.cos(a) * 1.2 + b.seed, Math.sin(a) * 1.2 + b.seed, t * 0.6));
  }

  // 그을림 경계 위의 임의 점 (월드 좌표). 봉투 밖이면 null → 재/불꽃 방출 위치
  burnEdgePoint(t) {
    if (!this.burn) return null;
    const a = rand(PI2);
    const r = this.burnRadius(a, t);
    const lx = this.burn.ox + Math.cos(a) * r;
    const ly = this.burn.oy + Math.sin(a) * r;
    if (!TrashBag.insideLocal(lx, ly, -6)) return null;
    return this.toWorld(lx, ly);
  }

  // -------------------------------------------------------------------
  // 2차 반응: 기울기 / 늘어남 / 내용물 지연 / 비닐 출렁임
  // -------------------------------------------------------------------
  updateDynamics(dt) {
    if (dt <= 0) return;
    if (this._px === undefined) {
      this._px = this.x;
      this._py = this.y;
    }
    const vx = (this.x - this._px) / dt;
    const vy = (this.y - this._py) / dt;
    this._px = this.x;
    this._py = this.y;
    this.vx += (vx - this.vx) * expDecay(12, dt);
    this.vy += (vy - this.vy) * expDecay(12, dt);

    // 들고 움직이면 진행 방향으로 살짝 기운다
    const tr = clamp(this.vx * 0.0007, -0.3, 0.3) + this.rotOffset;
    this.rotV += ((tr - this.rot) * 70 - this.rotV * 9) * dt;
    this.rot += this.rotV * dt;

    // 세로 속도에 따른 늘어남/눌림
    const sq = clamp(this.vy * 0.00022, -0.08, 0.08);
    this.sqV += ((sq - this.sq) * 90 - this.sqV * 10) * dt;
    this.sq += this.sqV * dt;
    this.sx = this.baseSx * (1 - this.sq * 0.6);
    this.sy = this.baseSy * (1 + this.sq);

    // 내용물은 한 박자 늦게 따라온다
    const ixT = clamp(-this.vx * 0.012, -7, 7);
    const iyT = clamp(-this.vy * 0.01, -6, 6);
    this.ixV += ((ixT - this.innerX) * 60 - this.ixV * 8) * dt;
    this.iyV += ((iyT - this.innerY) * 60 - this.iyV * 8) * dt;
    this.innerX += this.ixV * dt;
    this.innerY += this.iyV * dt;

    const sp = Math.hypot(this.vx, this.vy);
    this.wobble += (Math.min(1, sp / 700) - this.wobble) * expDecay(sp > 30 ? 6 : 1.5, dt);
  }

  _bodyPts(t) {
    const g = this.geom;
    if (this.wobble < 0.002) return g.body;
    const out = this._buf;
    const amp = this.wobble * 3.2;
    for (let i = 0; i < g.body.length; i++) {
      const d = amp * Math.sin(t * 7 + i * 0.9);
      out[i][0] = g.body[i][0] + g.normals[i][0] * d;
      out[i][1] = g.body[i][1] + g.normals[i][1] * d;
    }
    return out;
  }

  // -------------------------------------------------------------------
  // 렌더
  // -------------------------------------------------------------------
  render(ctx, t) {
    if (!this.visible || this.alpha <= 0.004) return;
    const g = this.geom;
    const body = this._bodyPts(t);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.scale(this.scale * this.sx, this.scale * this.sy);
    ctx.globalAlpha *= this.alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ① 내부 쓰레기
    ctx.save();
    ctx.beginPath();
    traceSmooth(ctx, body);
    ctx.clip();
    for (const it of g.items) drawTrashItem(ctx, it, this.innerX, this.innerY);
    ctx.restore();

    // ② 비닐 몸통 — 중앙은 투명, 가장자리로 갈수록 불투명
    ctx.beginPath();
    traceSmooth(ctx, body);
    ctx.fillStyle = radGrad(ctx, -28, -24, 8, -10, 2, 186, [
      [0, "rgba(250,249,246,0.3)"],
      [0.55, "rgba(249,248,245,0.46)"],
      [0.85, "rgba(250,249,247,0.68)"],
      [1, "rgba(252,251,249,0.9)"],
    ]);
    ctx.fill();
    // 내용물 없는 윗부분 비닐은 더 뿌옇다
    ctx.fillStyle = linGrad(ctx, 0, -112, 0, -12, [
      [0, "rgba(250,249,247,0.62)"],
      [1, "rgba(250,249,247,0)"],
    ]);
    ctx.fill();

    ctx.save();
    ctx.clip();
    for (const h of g.haze) {
      ctx.fillStyle = radGrad(ctx, h.x, h.y, 0, h.x, h.y, h.r, [
        [0, `rgba(255,255,255,${h.a})`],
        [1, "rgba(255,255,255,0)"],
      ]);
      ctx.fillRect(h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
    }
    // 바닥 쪽 아주 옅은 음영 (부피감)
    ctx.fillStyle = linGrad(ctx, 0, 40, 0, 114, [
      [0, "rgba(60,48,72,0)"],
      [1, "rgba(60,48,72,0.13)"],
    ]);
    ctx.fillRect(-175, 40, 350, 80);

    // ③ 안쪽 림 — 가장자리가 더 밝고 불투명
    ctx.beginPath();
    traceSmooth(ctx, body);
    ctx.lineWidth = 18;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.stroke();

    // ④ 주름 — 옅은 그림자 + 밝은 능선
    for (const w of g.wrinkles) {
      ctx.beginPath();
      ctx.moveTo(w[0] + 2.6, w[1] + 1.2);
      ctx.quadraticCurveTo(w[2] + 2.6, w[3] + 1.2, w[4] + 2.6, w[5] + 1.2);
      ctx.strokeStyle = "rgba(70,60,86,0.09)";
      ctx.lineWidth = 3.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w[0], w[1]);
      ctx.quadraticCurveTo(w[2], w[3], w[4], w[5]);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    // 하이라이트
    for (const h of g.highlights) {
      ctx.beginPath();
      traceEllipse(ctx, h.x, h.y, h.rx, h.ry, h.rot);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fill();
      ctx.beginPath();
      traceEllipse(ctx, h.x, h.y, h.rx * 0.45, h.ry * 0.7, h.rot);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fill();
    }
    ctx.restore();

    // 외곽선 + grain
    ctx.beginPath();
    traceSmooth(ctx, body);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
    grain.fillPath(ctx, CONFIG.grain.objectAlpha);

    // ⑤ 매듭 + 귀
    this._renderKnot(ctx);

    if (this.burn) this._renderBurn(ctx, body, t);
    ctx.restore();
  }

  _renderKnot(ctx) {
    const g = this.geom;
    for (const e of g.ears) {
      ctx.beginPath();
      traceEllipse(ctx, e.cx, e.cy, e.rx, e.ry, e.ang);
      ctx.fillStyle = radGrad(ctx, e.cx, e.cy, 2, e.cx, e.cy, e.rx, [
        [0, "rgba(246,246,244,0.5)"],
        [0.7, "rgba(250,249,247,0.76)"],
        [1, "rgba(253,252,250,0.95)"],
      ]);
      ctx.fill();
      grain.fillPath(ctx, CONFIG.grain.objectAlpha);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();

      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.rotate(e.ang);
      // 옅은 음영과 접힌 선
      ctx.beginPath();
      traceEllipse(ctx, -e.rx * 0.15, e.ry * 0.32, e.rx * 0.55, e.ry * 0.38);
      ctx.fillStyle = "rgba(110,106,140,0.08)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-e.rx * 0.75, 2);
      ctx.quadraticCurveTo(0, e.ry * 0.35, e.rx * 0.7, -1);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 목: 몸통에서 매듭으로 모이는 비닐
    ctx.beginPath();
    ctx.moveTo(-15, -104);
    ctx.quadraticCurveTo(-6, -111, -9, -121);
    ctx.lineTo(9, -121);
    ctx.quadraticCurveTo(6, -111, 16, -104);
    ctx.closePath();
    ctx.fillStyle = "rgba(247,246,243,0.9)";
    ctx.fill();

    // 매듭
    ctx.beginPath();
    traceEllipse(ctx, 0, -119, 15, 10, 0.1);
    ctx.fillStyle = radGrad(ctx, -3, -121, 1, 0, -119, 16, [
      [0, "rgba(252,251,249,0.98)"],
      [1, "rgba(232,230,228,0.96)"],
    ]);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(130,124,146,0.28)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, -124);
    ctx.quadraticCurveTo(0, -117, 9, -123);
    ctx.moveTo(-6, -114);
    ctx.quadraticCurveTo(1, -118, 7, -113);
    ctx.strokeStyle = "rgba(130,124,146,0.3)";
    ctx.stroke();
  }

  // 그을림: 라이터를 댄 지점에서 불규칙한 경계가 둥글게 퍼져 나간다.
  // 실루엣 전체(몸통 + 귀 + 매듭)로 클립하므로 내부 쓰레기도 함께 어두워진다.
  _renderBurn(ctx, body, t) {
    const g = this.geom;
    const { p, ox, oy } = this.burn;

    ctx.save();
    ctx.beginPath();
    traceSmooth(ctx, body);
    for (const e of g.ears) traceEllipse(ctx, e.cx, e.cy, e.rx, e.ry, e.ang, true);
    traceEllipse(ctx, 0, -119, 15, 10, 0.1, true);
    ctx.clip();

    // 불 가까이 가면 전체가 아주 살짝 데워진다
    ctx.fillStyle = rgba(CONFIG.palette.cafe, 0.14 * smoothstep(0, 0.3, p));
    ctx.fillRect(-200, -220, 400, 360);

    const edge = [];
    let rMax = 0;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * PI2;
      const r = this.burnRadius(a, t);
      rMax = Math.max(rMax, r);
      edge.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
    if (rMax < 1) {
      ctx.restore();
      return;
    }
    // 중심(점화 지점)일수록 새까맣고, 경계로 갈수록 갈색 → 투명
    ctx.beginPath();
    traceSmooth(ctx, edge);
    ctx.fillStyle = radGrad(ctx, ox, oy, 0, ox, oy, rMax, [
      [0, "rgba(18,12,8,0.98)"],
      [0.5, "rgba(28,18,10,0.96)"],
      [0.75, "rgba(62,38,18,0.9)"],
      [0.9, "rgba(98,63,27,0.72)"],
      [1, "rgba(98,63,27,0.35)"],
    ]);
    ctx.fill();

    // 타는 경계의 얇은 불빛
    const glow = 1 - smoothstep(0.55, 1, p);
    if (glow > 0.01) {
      ctx.beginPath();
      traceSmooth(ctx, edge);
      ctx.strokeStyle = rgba(CONFIG.palette.vermelho, 0.55 * glow);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = rgba(CONFIG.palette.amarelo, 0.65 * glow);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// =====================================================================
// 내부 쓰레기 — 단순화한 벡터 오브제 (미묘한 그라디언트)
// =====================================================================
function drawTrashItem(ctx, it, ix, iy) {
  const P = CONFIG.palette;
  const T = CONFIG.tone;
  ctx.save();
  ctx.translate(it.x + ix * it.m, it.y + iy * it.m);
  ctx.rotate(it.r);

  switch (it.type) {
    case "blob": {
      ctx.beginPath();
      traceSmooth(ctx, it.pts);
      ctx.fillStyle = linGrad(ctx, -it.s, -it.s, it.s, it.s, [
        [0, rgba(shade(it.c, 0.12))],
        [1, rgba(shade(it.c, -0.14))],
      ]);
      ctx.fill();
      break;
    }
    case "wrap": {
      ctx.beginPath();
      tracePoly(ctx, it.pts);
      ctx.fillStyle = linGrad(ctx, -it.s, -it.s, it.s, it.s, [
        [0, rgba(shade(it.c, 0.14))],
        [1, rgba(shade(it.c, -0.12))],
      ]);
      ctx.fill();
      // 구김선
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0] * 0.6, it.pts[0][1] * 0.6);
      ctx.lineTo(it.pts[3][0] * 0.5, it.pts[3][1] * 0.5);
      ctx.lineTo(it.pts[5][0] * 0.4, it.pts[5][1] * 0.4);
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "can": {
      const { w, h } = it;
      ctx.beginPath();
      traceRoundRect(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fillStyle = linGrad(ctx, -w / 2, 0, w / 2, 0, [
        [0, rgba(shade(it.c, -0.25))],
        [0.35, rgba(shade(it.c, 0.15))],
        [0.6, rgba(it.c)],
        [1, rgba(shade(it.c, -0.3))],
      ]);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = rgba(P.areia, 0.85);
      ctx.fillRect(-w / 2, -h * 0.08, w, h * 0.18);
      ctx.restore();
      ctx.beginPath();
      traceEllipse(ctx, 0, -h / 2 + 4, w / 2 - 1.5, 4.5);
      ctx.fillStyle = "#D6CEC4";
      ctx.fill();
      // 찌그러진 자국
      ctx.beginPath();
      ctx.moveTo(-w / 2, h * 0.2);
      ctx.lineTo(w * 0.08, h * 0.3);
      ctx.lineTo(w / 2, h * 0.16);
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "bottle": {
      const { w, h } = it;
      ctx.beginPath();
      ctx.moveTo(-w * 0.18, -h / 2 + 10);
      ctx.lineTo(w * 0.18, -h / 2 + 10);
      ctx.quadraticCurveTo(w * 0.5, -h * 0.32, w * 0.48, -h * 0.18);
      ctx.lineTo(w * 0.34, 0); // 찌그러진 허리
      ctx.lineTo(w * 0.5, h * 0.2);
      ctx.lineTo(w * 0.46, h / 2 - 4);
      ctx.quadraticCurveTo(0, h / 2 + 4, -w * 0.46, h / 2 - 4);
      ctx.lineTo(-w * 0.5, h * 0.15);
      ctx.lineTo(-w * 0.38, -h * 0.02);
      ctx.lineTo(-w * 0.5, -h * 0.2);
      ctx.quadraticCurveTo(-w * 0.5, -h * 0.32, -w * 0.18, -h / 2 + 10);
      ctx.closePath();
      ctx.fillStyle = linGrad(ctx, -w / 2, 0, w / 2, 0, [
        [0, rgba(T.blueSoft, 0.85)],
        [0.45, rgba("#CDD0EC", 0.9)],
        [1, rgba(T.blueMid, 0.85)],
      ]);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = rgba(T.blueCap, 0.9);
      ctx.fillRect(-w / 2, h * 0.04, w, h * 0.16);
      ctx.restore();
      ctx.beginPath();
      traceRoundRect(ctx, -w * 0.21, -h / 2, w * 0.42, 12, 3);
      ctx.fillStyle = T.blueCap;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-w * 0.26, -h * 0.26);
      ctx.lineTo(-w * 0.3, h * 0.36);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    }
    case "cup": {
      const { w1, w2, h } = it;
      ctx.beginPath();
      ctx.moveTo(-w1 / 2, -h / 2);
      ctx.lineTo(w1 / 2, -h / 2);
      ctx.lineTo(w2 / 2, h / 2);
      ctx.lineTo(-w2 / 2, h / 2);
      ctx.closePath();
      ctx.fillStyle = linGrad(ctx, -w1 / 2, 0, w1 / 2, 0, [
        [0, rgba(shade(P.areia, -0.1))],
        [0.4, rgba(shade(P.areia, 0.25))],
        [1, rgba(shade(P.areia, -0.14))],
      ]);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = rgba(P.vermelho, 0.9);
      ctx.fillRect(-w1, -h * 0.18, w1 * 2, h * 0.2);
      ctx.restore();
      ctx.beginPath();
      traceEllipse(ctx, 0, -h / 2, w1 / 2, 5);
      ctx.fillStyle = "#F1EBE4";
      ctx.fill();
      break;
    }
    case "straw": {
      const L = it.len;
      const seg = 9;
      for (let i = 0; i * seg < L; i++) {
        const x0 = -L / 2 + i * seg;
        // 70% 지점에서 꺾인 빨대
        const bend = x0 > L * 0.2 ? 0.45 : 0;
        ctx.save();
        if (bend) {
          ctx.translate(L * 0.2, 0);
          ctx.rotate(bend);
          ctx.translate(-L * 0.2, 0);
        }
        ctx.fillStyle = i % 2 ? rgba(shade(P.areia, 0.4)) : rgba(P.vermelho);
        ctx.fillRect(x0, -3.5, seg + 0.6, 7);
        ctx.restore();
      }
      break;
    }
    case "box": {
      const { w, h } = it;
      ctx.beginPath();
      traceRoundRect(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fillStyle = linGrad(ctx, 0, -h / 2, 0, h / 2, [
        [0, rgba(shade(T.blueSoft, 0.15))],
        [1, rgba(shade(T.blueSoft, -0.12))],
      ]);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 3, -h * 0.18);
      ctx.lineTo(w / 2 - 3, -h * 0.18);
      ctx.strokeStyle = rgba(T.blueMid, 0.8);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      break;
    }
    case "bigcap": {
      const R = it.R;
      ctx.beginPath();
      traceRoundRect(ctx, -R, -R * 0.25, R * 2, R * 0.75, R * 0.3);
      ctx.fillStyle = linGrad(ctx, -R, 0, R, 0, [
        [0, rgba(shade(T.yellowDeep, -0.1))],
        [0.4, rgba(P.amarelo)],
        [1, rgba(shade(T.yellowDeep, -0.18))],
      ]);
      ctx.fill();
      ctx.beginPath();
      traceEllipse(ctx, 0, -R * 0.25, R, R * 0.55);
      ctx.fillStyle = radGrad(ctx, -R * 0.3, -R * 0.4, 2, 0, -R * 0.25, R, [
        [0, rgba(shade(P.amarelo, 0.25))],
        [1, rgba(P.amarelo)],
      ]);
      ctx.fill();
      ctx.beginPath();
      traceEllipse(ctx, 0, -R * 0.25, R * 0.72, R * 0.38);
      ctx.strokeStyle = rgba(T.yellowDeep, 0.7);
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "cap": {
      const R = it.R;
      ctx.beginPath();
      traceEllipse(ctx, 0, 0, R, R);
      ctx.fillStyle = radGrad(ctx, -R * 0.3, -R * 0.3, 1, 0, 0, R, [
        [0, rgba(shade(it.c, 0.22))],
        [1, rgba(shade(it.c, -0.1))],
      ]);
      ctx.fill();
      ctx.beginPath();
      traceEllipse(ctx, 0, 0, R * 0.62, R * 0.62);
      ctx.strokeStyle = rgba(shade(it.c, -0.25), 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
