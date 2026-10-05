// =====================================================================
// BurnScene — 왼쪽 패널, Level 1
//   포인터가 라이터가 된다. 봉투에 대고 클릭 한 번이면 그 지점에서 불이 붙는다.
//   그을림은 점화 지점에서 둥글게 퍼지고(burnProgress 0→1, 약 1.9초)
//   opacity / 쪼그라듦 / 재 양이 함께 진행된다.
//   state: idle → burning → done
//   잔여: 봉투가 있던 자리에서 위로 흩어지는 재 (완료 후에도 약하게 계속)
// =====================================================================

class BurnScene extends Scene {
  constructor() {
    super(0, "CLICK TO IGNITE", CONFIG.palette.cafe);
    const c = CONFIG.burn;
    this.bag = new TrashBag();
    this.home = { x: this.W / 2, y: this.H * c.homeY };
    this.bag.x = this.home.x;
    this.bag.y = this.home.y;

    this.state = "idle";
    this.burnProgress = 0;
    this.burnT = 0;
    this.hover = null; // 패널 로컬 포인터 위치 (sketch 가 매 프레임 넣어 준다)

    // 라이터: 포인터 = 노즐 끝
    this.lighter = { x: 0, y: 0, vis: 0, flame: 0, flameT: 0, leaveT: -1 };

    this.ash = [];
    this.flames = [];
    this.smoke = [];
    this.sparks = [];
    this.acc = { ash: 0, flame: 0, smoke: 0 };
  }

  setWidth(W) {
    const dx = (W - this.W) / 2;
    super.setWidth(W);
    this.home.x = W / 2;
    this.bag.x += dx;
    this.lighter.x += dx;
    for (const arr of [this.ash, this.flames, this.smoke, this.sparks]) for (const p of arr) p.x += dx;
  }

  // -------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------
  update(dt) {
    this.updateCommon(dt);
    const c = CONFIG.burn;
    const bag = this.bag;

    // 봉투는 제자리에서 둥실
    if (this.state !== "done") {
      const k = expDecay(2.2, dt);
      bag.x += (this.home.x - bag.x) * k;
      bag.y += (this.home.y + Math.sin(this.t * 1.1) * 3 - bag.y) * k;
    }

    if (this.state === "burning") {
      this.burnT += dt;
      const p = (this.burnProgress = clamp(this.burnT / c.duration, 0, 1));
      bag.baseSy = 1 - 0.16 * easeOutCubic(p);
      bag.baseSx = 1 - 0.05 * p;
      bag.alpha = 1 - smoothstep(0.42, 1, p);
      bag.burn.p = p;
      this.emitBurning(dt, p);
      if (p >= 1 && bag.alpha < 0.02) {
        this.state = "done";
        this.complete = true;
        bag.visible = false;
      }
    } else if (this.state === "done") {
      this.emitAfter(dt);
    }

    bag.updateDynamics(dt);
    this.updateLighter(dt);

    for (const arr of [this.ash, this.flames, this.smoke, this.sparks]) for (const p of arr) p.update(dt);
    const W = this.W;
    const H = this.H;
    this.ash = this.ash.filter((p) => !p.dead && !p.offscreen(W, H));
    this.flames = this.flames.filter((p) => !p.dead);
    this.smoke = this.smoke.filter((p) => !p.dead);
    this.sparks = this.sparks.filter((p) => !p.dead);
  }

  updateLighter(dt) {
    const L = this.lighter;
    const lc = CONFIG.burn.lighter;
    if (L.leaveT >= 0) {
      // 점화 후: 불꽃을 잠시 대고 있다가 아래로 빠지며 사라진다
      L.leaveT += dt;
      if (L.leaveT > lc.hold) {
        const k = (L.leaveT - lc.hold) / lc.leave;
        L.x += 50 * dt;
        L.y += 160 * dt * (0.4 + k);
        L.vis = Math.max(0, 1 - k);
      }
    } else {
      const show = this.active && this.state === "idle" && this.hover;
      if (this.hover) {
        L.x = this.hover.x;
        L.y = this.hover.y;
      }
      L.vis = show ? Math.min(1, L.vis + dt / 0.2) : Math.max(0, L.vis - dt / 0.25);
    }
    L.flameT -= dt;
    L.flame = L.flameT > 0 ? Math.min(1, L.flame + dt / 0.06) : Math.max(0, L.flame - dt / 0.12);
  }

  // 딸깍 — 휠에서 불티, 노즐에서 불꽃
  flick(duration) {
    const L = this.lighter;
    L.flameT = duration;
    for (let i = 0; i < 9; i++) this.sparks.push(new SparkParticle(L.x + rand(-3, 3), L.y + rand(0, 6)));
  }

  ignite(px, py) {
    const [lx, ly] = this.bag.toLocal(px, py);
    this.bag.burn = { p: 0, seed: rand(100), ox: lx, oy: ly };
    this.state = "burning";
    this.burnT = 0;
    this.lighter.leaveT = 0;
    this.flick(CONFIG.burn.lighter.hold);
    // 붙는 순간 불꽃이 한 번 확 오른다
    for (let i = 0; i < 12; i++) this.flames.push(new FlameParticle(px + rand(-14, 14), py + rand(-8, 8), 1.3));
  }

  // 그을림 경계 위의 점 (봉투 밖이면 몇 번 다시 뽑는다)
  edgePoint() {
    for (let k = 0; k < 5; k++) {
      const pt = this.bag.burnEdgePoint(this.t);
      if (pt) return pt;
    }
    return null;
  }

  emitBurning(dt, p) {
    const c = CONFIG.burn;
    this.acc.ash += dt * c.ashRate * (0.25 + Math.sin(Math.PI * p));
    this.acc.flame += dt * c.flameRate * (1 - 0.6 * p);
    this.acc.smoke += dt * 3.2;
    while (this.acc.ash >= 1) {
      this.acc.ash -= 1;
      const pt = this.edgePoint();
      if (pt && this.ash.length < c.maxAsh) this.ash.push(new AshParticle(pt[0], pt[1]));
    }
    while (this.acc.flame >= 1) {
      this.acc.flame -= 1;
      const pt = this.edgePoint();
      if (pt && this.flames.length < c.maxFlames) this.flames.push(new FlameParticle(pt[0], pt[1], 1.4));
    }
    while (this.acc.smoke >= 1) {
      this.acc.smoke -= 1;
      const pt = this.edgePoint();
      if (pt && this.smoke.length < c.maxSmoke) this.smoke.push(new SmokePuff(pt[0], pt[1]));
    }
  }

  // 봉투가 사라진 뒤에도 그 자리에서 재가 약하게 계속 올라온다
  emitAfter(dt) {
    const c = CONFIG.burn;
    const s = this.bag.scale;
    this.acc.ash += dt * c.ashAfter;
    while (this.acc.ash >= 1) {
      this.acc.ash -= 1;
      if (this.ash.length >= c.maxAsh) continue;
      const x = this.bag.x + rand(-120, 120) * s;
      const y = this.bag.y + rand(-60, 90) * s;
      this.ash.push(new AshParticle(x, y, 0.5));
    }
  }

  // -------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------
  render(ctx) {
    const T = CONFIG.tone;
    const P = CONFIG.palette;
    this.fillBackground(ctx, [
      [0, T.burnTop],
      [0.55, T.burnMid],
      [1, T.burnBottom],
    ]);

    // 타는 동안 봉투 주변 공기가 데워진다
    if (this.state === "burning") {
      const heat = Math.sin(Math.PI * this.burnProgress);
      const r = 280 * this.bag.scale;
      const { x, y } = this.bag;
      ctx.fillStyle = radGrad(ctx, x, y, 0, x, y, r, [
        [0, rgba(P.vermelho, 0.16 * heat)],
        [1, rgba(P.vermelho, 0)],
      ]);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    this.bag.render(ctx, this.t);
    for (const p of this.smoke) p.render(ctx);
    for (const p of this.flames) p.render(ctx);
    for (const p of this.ash) p.render(ctx);
    this.renderLighter(ctx);
    for (const p of this.sparks) p.render(ctx);
  }

  // 플랫한 일회용 라이터. 로컬 원점 = 노즐 끝.
  renderLighter(ctx) {
    const L = this.lighter;
    if (L.vis <= 0.01) return;
    const lc = CONFIG.burn.lighter;
    const P = CONFIG.palette;
    const T = CONFIG.tone;

    // 불꽃은 기울지 않고 항상 위로
    if (L.flame > 0.01) {
      const fl = L.flame * (0.85 + 0.15 * noise(this.t * 9));
      const h = 30 * fl * lc.scale;
      const w = 8 * fl * lc.scale;
      const sway = (noise(40, this.t * 4) - 0.5) * 5;
      ctx.save();
      ctx.globalAlpha *= L.vis;
      ctx.beginPath();
      ctx.moveTo(L.x + sway, L.y - h);
      ctx.quadraticCurveTo(L.x + w * 1.4, L.y - h * 0.25, L.x, L.y + 2);
      ctx.quadraticCurveTo(L.x - w * 1.4, L.y - h * 0.25, L.x + sway, L.y - h);
      ctx.fillStyle = rgba(P.vermelho, 0.9);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(L.x + sway * 0.6, L.y - h * 0.62);
      ctx.quadraticCurveTo(L.x + w * 0.7, L.y - h * 0.15, L.x, L.y + 1);
      ctx.quadraticCurveTo(L.x - w * 0.7, L.y - h * 0.15, L.x + sway * 0.6, L.y - h * 0.62);
      ctx.fillStyle = rgba(P.amarelo, 0.95);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(lc.tilt);
    ctx.scale(lc.scale, lc.scale);
    ctx.globalAlpha *= L.vis;

    // 몸통
    ctx.beginPath();
    traceRoundRect(ctx, -9, 26, 36, 70, 9);
    ctx.fillStyle = linGrad(ctx, -9, 0, 27, 0, [
      [0, rgba(shade(P.vermelho, 0.18))],
      [0.4, rgba(P.vermelho)],
      [1, rgba(T.flameRedDeep)],
    ]);
    ctx.fill();
    grain.fillPath(ctx, CONFIG.grain.objectAlpha * 1.4);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(-3, 34, 3.5, 54);

    // 금속 머리 (바람막이)
    ctx.beginPath();
    traceRoundRect(ctx, -7, 6, 32, 22, 3);
    ctx.fillStyle = linGrad(ctx, -7, 0, 25, 0, [
      [0, rgba(shade(P.areia, 0.3))],
      [0.5, rgba(shade(P.areia, -0.12))],
      [1, rgba(shade(P.areia, -0.3))],
    ]);
    ctx.fill();
    ctx.fillStyle = "rgba(60,48,40,0.35)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      traceEllipse(ctx, -1 + i * 6, 20, 1.3, 1.3);
      ctx.fill();
    }

    // 휠
    ctx.beginPath();
    traceEllipse(ctx, 17, 6, 7, 7);
    ctx.fillStyle = rgba(shade(P.areia, -0.45));
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(12 + i * 3, 1);
      ctx.lineTo(12 + i * 3, 11);
      ctx.stroke();
    }

    // 노즐
    ctx.beginPath();
    traceRoundRect(ctx, -3.5, 0, 7, 8, 1.5);
    ctx.fillStyle = rgba(shade(P.areia, -0.55));
    ctx.fill();
    ctx.restore();
  }

  renderDebug(ctx) {
    debugBagOutline(ctx, this.bag);
    if (this.bag.burn && this.bag.visible) {
      const [x, y] = this.bag.toWorld(this.bag.burn.ox, this.bag.burn.oy);
      ctx.fillStyle = "rgba(255,0,0,0.9)";
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  }

  debugInfo() {
    return `burn ${this.state} p=${this.burnProgress.toFixed(2)} ash=${this.ash.length} fl=${this.flames.length}`;
  }

  // -------------------------------------------------------------------
  // interaction — 클릭 한 번
  // -------------------------------------------------------------------
  cursorAt() {
    return this.active && this.state === "idle" ? "none" : "default";
  }

  pointerDown(x, y) {
    if (!this.active || this.state !== "idle") return false;
    this.touched = true;
    this.hover = { x, y };
    this.lighter.x = x;
    this.lighter.y = y;
    this.lighter.vis = 1; // 터치: 누르는 순간 그 자리에 나타난다
    if (this.bag.contains(x, y, 0)) this.ignite(x, y);
    else this.flick(CONFIG.burn.lighter.flick);
    return false; // 드래그가 아니다
  }
}

// 디버그: 봉투 히트 영역
function debugBagOutline(ctx, bag) {
  if (!bag.visible) return;
  ctx.save();
  ctx.translate(bag.x, bag.y);
  ctx.rotate(bag.rot);
  ctx.scale(bag.scale * bag.sx, bag.scale * bag.sy);
  ctx.strokeStyle = "rgba(0,255,120,0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  traceEllipse(ctx, 0, BAG.ellCy, BAG.ellRx, BAG.ellRy);
  ctx.rect(-100, BAG.top, 200, BAG.top * -1 - 90);
  ctx.stroke();
  ctx.restore();
}
