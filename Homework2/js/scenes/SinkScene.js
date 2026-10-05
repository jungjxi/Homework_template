// =====================================================================
// SinkScene — 오른쪽 패널, Level 3
//   봉투를 아래로 끌수록 수면은 반대로 올라온다 (bag Y ↓ / waterLevel ↑).
//   봉투 중심이 수면 아래로 충분히 들어간 상태에서 손을 놓아야 가라앉는다.
//   조건 미충족 → 원위치 쪽으로 살짝 되돌아간다.
//   조건 충족   → 잠깐 둥실 → 봉투가 천천히 내려가며 물이 화면 끝까지 차오른다
//              → 주황 물고기들이 와서 봉투를 조금씩 뜯어 먹는다 (구멍 + 흩어지는 조각)
//              → 물고기가 멈추고 배를 뒤집으며, 물고기와 봉투가 함께 가라앉는다
//              → 모두 캔버스 아래로 사라지면 완료.
//
//   렌더: 배경 → 뒤쪽 물 → 봉투(뜯긴 구멍) → 앞쪽 물 필름 → 수면선 → 물고기 → 조각 → 기포
//   state: idle → dragging → (returning → idle) | floating → filling → feeding → sinking → done
//   잔여: 봉투가 사라진 뒤에도 영원히 올라오는 기포
// =====================================================================

class SinkScene extends Scene {
  constructor() {
    super(2, "DRAG INTO WATER", CONFIG.palette.azul);
    const c = CONFIG.sink;
    this.bag = new TrashBag();
    this.home = { x: this.W / 2, y: this.H * c.homeY };
    this.bag.x = this.home.x;
    this.bag.y = this.home.y;
    this.restY = this.home.y;
    this.target = { x: this.home.x, y: this.home.y };
    this.grab = { dx: 0, dy: 0 };

    this.level0 = this.H * c.levelY;
    this.level = this.level0;
    this.state = "idle";
    this.sinkProgress = 0;

    this.retT = 0;
    this.retFrom = 0;
    this.retTo = 0;
    this.floatT = 0;
    this.floatY0 = 0;
    this.sinkT = 0;
    this.sinkV = 0;
    this.sinkX = 0;
    this.sinkStartY = 0;

    // 물 차오름 / 물고기
    this.fillT = 0;
    this.fillFrom = { level: 0, y: 0 };
    this.feedT = 0;
    this.fish = [];
    this.flakes = [];
    this.totalBites = 0;
    this.off = null; // 뜯긴 봉투를 합성할 오프스크린 캔버스

    this.entered = false;
    this.bubbles = [];
    this.trail = [];
    this.trailT = 0;
    this.splashes = [];
    this.lastX = this.W / 2;
    this.clusterT = 3;
    this.acc = { edge: 0, trail: 0, deep: 0 };
    this.surfaceAt = this.surfaceAt.bind(this);
  }

  setWidth(W) {
    const dx = (W - this.W) / 2;
    super.setWidth(W);
    this.home.x = W / 2;
    this.bag.x += dx;
    this.target.x += dx;
    this.sinkX += dx;
    this.lastX += dx;
    for (const f of this.fish) {
      f.x += dx;
      f.target.x += dx;
    }
    for (const p of this.flakes) p.x += dx;
    for (const p of this.trail) p.x += dx;
    for (const b of this.bubbles) {
      b.x += dx;
      b.x0 += dx;
    }
    for (const s of this.splashes) s.x += dx;
  }

  // 봉투 위치에 반응하는 수면 (시각적 은유)
  levelFor(bagY) {
    const c = CONFIG.sink;
    return Math.max(this.H * c.levelMin, this.level0 - c.coupling * Math.max(0, bagY - this.home.y));
  }

  // 잔잔한 사인파 두 개 + 봉투가 들어갈 때의 국소 파문
  surfaceAt(x) {
    const t = this.t;
    let y = this.level + 1.6 * Math.sin(x * 0.021 + t * 1.05) + 1.1 * Math.sin(x * 0.047 - t * 1.6 + 1.3);
    for (const s of this.splashes) {
      const age = t - s.t0;
      y += s.amp * Math.exp(-age * 1.15) * Math.exp(-(((x - s.x) / 110) ** 2)) * Math.sin(x * 0.075 - age * 5.5);
    }
    return y;
  }

  splash(x, amp) {
    this.splashes.push({ x, amp, t0: this.t });
  }

  depthMet() {
    return this.bag.y - this.surfaceAt(this.bag.x) >= CONFIG.sink.depthRatio * this.bag.height;
  }

  // -------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------
  update(dt) {
    this.updateCommon(dt);
    const c = CONFIG.sink;
    const bag = this.bag;

    switch (this.state) {
      case "idle": {
        const inWater = bag.bottomY > this.level;
        const bob = Math.sin(this.t * 1.2) * (inWater ? 4 : 3);
        bag.y += (this.restY + bob - bag.y) * expDecay(3, dt);
        bag.x += (this.home.x - bag.x) * expDecay(1.5, dt);
        this.level += (this.levelFor(bag.y) - this.level) * expDecay(5, dt);
        break;
      }
      case "dragging": {
        const k = expDecay(20, dt);
        bag.x += (this.target.x - bag.x) * k;
        bag.y += (this.target.y - bag.y) * k;
        this.level += (this.levelFor(bag.y) - this.level) * expDecay(10, dt);
        break;
      }
      case "returning": {
        this.retT += dt;
        const k = easeOutCubic(clamp(this.retT / 0.9, 0, 1));
        bag.y = mix(this.retFrom, this.retTo, k);
        this.level += (this.levelFor(bag.y) - this.level) * expDecay(5, dt);
        if (k >= 1) {
          this.state = "idle";
          this.restY = this.retTo;
        }
        break;
      }
      case "floating": {
        // 손을 놓은 뒤 잠깐 둥실 (먼저 살짝 떠오른다)
        this.floatT += dt;
        const f = this.floatT;
        bag.y = this.floatY0 - 12 * Math.exp(-2.4 * f) * Math.sin(f * 5.2);
        if (f >= c.floatTime) {
          this.state = "filling";
          this.fillT = 0;
          this.fillFrom = { level: this.level, y: bag.y };
        }
        break;
      }
      case "filling": {
        // 봉투는 천천히 내려가고, 물은 화면 끝까지 차오른다
        this.fillT += dt;
        const k = clamp(this.fillT / c.fillTime, 0, 1);
        bag.y = mix(this.fillFrom.y, this.H * c.feedY, easeInOutCubic(k));
        this.level = mix(this.fillFrom.level, c.fillLevel, easeInOutSine(k));
        bag.rotOffset = (noise(12, this.t * 0.3) - 0.5) * 0.2;
        this.sinkProgress = 0.1 * k;
        if (k >= 1) this.startFeeding();
        break;
      }
      case "feeding": {
        this.feedT += dt;
        bag.y += (this.H * c.feedY + Math.sin(this.t * 1.1) * 4 - bag.y) * expDecay(2, dt);
        bag.rotOffset = (noise(12, this.t * 0.3) - 0.5) * 0.2;
        this.updateFeeding(dt);
        this.sinkProgress = 0.1 + 0.5 * clamp(this.totalBites / c.bites, 0, 1);
        if (this.totalBites >= c.bites || this.feedT > c.feedMax) this.startSinking();
        break;
      }
      case "sinking": {
        // 처음엔 느리고 이후 조금씩 가속. 물고기도 뒤집혀 함께 가라앉는다.
        this.sinkT += dt;
        const ramp = 0.6 + 0.4 * Math.min(1, this.sinkT / 3);
        this.sinkV = Math.min(c.vMax, this.sinkV + c.accel * ramp * dt);
        bag.y += this.sinkV * dt;
        bag.x = this.sinkX + (noise(77, this.sinkT * 0.25) - noise(77, 0)) * 34;
        bag.rotOffset = (noise(12, this.sinkT * 0.3) - 0.5) * 0.28;
        for (const f of this.fish) {
          f.dieDelay -= dt;
          if (f.dieDelay <= 0) f.die();
          else f.steer(f.target.x, f.target.y, c.fishSpeed * 0.4, dt, 2);
        }
        this.sinkProgress = 0.6 + 0.4 * clamp((bag.y - this.sinkStartY) / (this.H + 220 - this.sinkStartY), 0, 1);
        if (bag.visible && bag.topY > this.H + 8) bag.visible = false;
        if (!bag.visible && this.fish.every((f) => f.y - f.len > this.H + 10)) {
          this.state = "done";
          this.complete = true;
          this.sinkProgress = 1;
        }
        break;
      }
    }
    for (const f of this.fish) f.update(dt);
    for (const p of this.flakes) p.update(dt);
    this.flakes = this.flakes.filter((p) => !p.dead && !p.offscreen(this.W, this.H));

    // 수면에 처음 닿는 순간 파문
    if (bag.visible) {
      const surf = this.surfaceAt(bag.x);
      if (!this.entered && bag.bottomY > surf) {
        this.entered = true;
        this.splash(bag.x, c.splashAmp);
      } else if (this.entered && bag.bottomY < surf - 12) {
        this.entered = false;
      }
    }

    bag.updateDynamics(dt);
    this.emitBubbles(dt);

    for (const b of this.bubbles) b.update(dt, this.surfaceAt);
    this.bubbles = this.bubbles.filter((b) => !b.dead && b.y > -20);
    this.splashes = this.splashes.filter((s) => this.t - s.t0 < 6);
  }

  // -------------------------------------------------------------------
  // 물고기
  // -------------------------------------------------------------------
  startFeeding() {
    const c = CONFIG.sink;
    this.state = "feeding";
    this.feedT = 0;
    const k = this.bag.scale / CONFIG.bag.scale;
    for (let i = 0; i < c.fishCount; i++) {
      const dir = i % 2 ? -1 : 1; // 번갈아 왼쪽/오른쪽에서
      const f = new Fish(dir > 0 ? -70 : this.W + 70, this.H * c.feedY + rand(-170, 150), dir);
      f.len *= k;
      f.delay = i * 0.45;
      this.fish.push(f);
    }
  }

  startSinking() {
    const c = CONFIG.sink;
    this.state = "sinking";
    this.sinkT = 0;
    this.sinkV = c.v0;
    this.sinkStartY = this.bag.y;
    this.sinkX = this.bag.x;
    this.fish.forEach((f, i) => (f.dieDelay = 0.3 + i * 0.35));
  }

  // 물 자리 고르기: 절반쯤은 이미 뜯긴 자리를 더 안쪽으로, 나머지는 자기 쪽 가장자리
  pickBite(f) {
    const side = f.x < this.bag.x ? -1 : 1;
    const own = this.bag.bites.filter((b) => b.x * side > -20);
    if (own.length && Math.random() < 0.55) {
      const b = pick(own);
      const l = Math.hypot(b.x, b.y - 5) || 1;
      const step = rand(8, 16);
      return { x: b.x - (b.x / l) * step + rand(-8, 8), y: b.y - ((b.y - 5) / l) * step + rand(-8, 8) };
    }
    if (Math.random() < 0.12) return { x: side * rand(35, 60), y: rand(-160, -140) }; // 귀
    const a = (side > 0 ? 0 : Math.PI) + rand(-1.3, 1.3);
    return { x: Math.cos(a) * 138, y: 5 + Math.sin(a) * 96 };
  }

  updateFeeding(dt) {
    const c = CONFIG.sink;
    const bag = this.bag;
    for (const f of this.fish) {
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      if (f.mode === "approach") {
        if (!f.bite) {
          f.bite = this.pickBite(f);
          f.wait = 0;
        }
        const [tx, ty] = bag.toWorld(f.bite.x, f.bite.y);
        // 입이 목표에 닿도록 몸은 조금 뒤에서
        const hx = Math.cos(f.angle) * f.len * 0.45;
        const hy = Math.sin(f.angle) * f.len * 0.45;
        f.steer(tx - hx, ty - hy, c.fishSpeed, dt, 2.6);
        const [mx, my] = f.mouth();
        f.wait += dt;
        if (Math.hypot(mx - tx, my - ty) < 11) this.doBite(f, tx, ty);
        else if (f.wait > 6) f.bite = null; // 못 닿으면 다른 자리
      } else {
        f.steer(f.target.x, f.target.y, c.fishSpeed * 0.6, dt, 2);
        f.wait -= dt;
        if (f.wait <= 0) {
          f.mode = "approach";
          f.bite = null;
        }
      }
    }
  }

  // 한 입: 봉투에 구멍, 조각이 흩어지고 봉투가 움찔
  doBite(f, tx, ty) {
    const bag = this.bag;
    bag.bites.push({ x: f.bite.x, y: f.bite.y, pts: irregularPoly(Math.random, 9, rand(14, 21), 0.3) });
    this.totalBites++;
    bag.rotV += (f.x < bag.x ? 1 : -1) * 0.9;
    bag.wobble = 1;
    const P = CONFIG.palette;
    const T = CONFIG.tone;
    for (let i = 0; i < 7; i++) {
      const plastic = Math.random() < 0.55;
      const col = plastic ? "#FFFFFF" : pick([P.vermelho, P.amarelo, T.blueSoft, P.cafe]);
      this.flakes.push(new FlakeParticle(tx + rand(-8, 8), ty + rand(-8, 8), col, plastic ? 0.7 : 0.9));
    }
    for (let i = 0; i < 2; i++) this.spawnBubble(tx + rand(-6, 6), ty, rand(1.2, 2.6));
    // 물고 나서 잠깐 물러난다
    const dx = f.x - bag.x;
    const dy = f.y - bag.y;
    const d = Math.hypot(dx, dy) || 1;
    const back = rand(70, 130);
    f.target = {
      x: clamp(f.x + (dx / d) * back, 30, this.W - 30),
      y: clamp(f.y + (dy / d) * back, 40, this.H - 40),
    };
    f.mode = "retreat";
    f.wait = rand(0.35, 0.8);
    f.vx -= Math.cos(f.angle) * 30;
    f.vy -= Math.sin(f.angle) * 30;
  }

  spawnBubble(x, y, r) {
    if (this.bubbles.length >= CONFIG.sink.maxBubbles) return;
    this.bubbles.push(new Bubble(x, y, r));
  }

  emitBubbles(dt) {
    const c = CONFIG.sink;
    const bag = this.bag;
    const s = bag.scale;

    // 1) 물에 잠긴 봉투 가장자리에서
    if (bag.visible) {
      const surf = this.surfaceAt(bag.x);
      const sub = clamp((bag.bottomY - surf) / bag.height, 0, 1);
      if (sub > 0) {
        this.acc.edge += dt * (5 + 38 * sub) * (this.state === "sinking" ? 1.4 : 1);
        while (this.acc.edge >= 1) {
          this.acc.edge -= 1;
          const a = rand(PI2);
          const x = bag.x + Math.cos(a) * BAG.ellRx * s * rand(0.55, 1);
          const y = bag.y + BAG.ellCy * s + Math.sin(a) * BAG.ellRy * s * rand(0.55, 1);
          if (y > this.surfaceAt(x) + 4 && y < this.H + 20) this.spawnBubble(x, y);
        }
        // 지나간 경로를 기록
        this.trailT += dt;
        if (this.trailT > 0.14 && bag.y > surf) {
          this.trailT = 0;
          this.trail.push({ x: bag.x + rand(-24, 24), y: bag.y });
          if (this.trail.length > 60) this.trail.splice(rand(this.trail.length) | 0, 1);
        }
      }
      this.lastX = bag.x;
    }

    // 2) 지나간 경로에서 계속 (봉투가 사라진 뒤에도)
    if (this.trail.length) {
      this.acc.trail += dt * c.trailRate;
      while (this.acc.trail >= 1) {
        this.acc.trail -= 1;
        const p = pick(this.trail);
        const y = Math.min(p.y, this.H + 6);
        if (y > this.surfaceAt(p.x) + 6) this.spawnBubble(p.x + rand(-8, 8), y, rand(1.2, 4));
      }
    }

    // 3) 화면 아래, 보이지 않는 곳에서 영원히 올라오는 기포
    const gone = this.state === "done" || (this.state === "sinking" && bag.topY > this.H);
    if (gone) {
      this.acc.deep += dt * c.deepRate;
      while (this.acc.deep >= 1) {
        this.acc.deep -= 1;
        this.spawnBubble(this.lastX + rand(-60, 60), this.H + rand(4, 20));
      }
      this.clusterT -= dt;
      if (this.clusterT <= 0) {
        this.clusterT = rand(2.5, 6);
        const x = this.lastX + rand(-50, 50);
        const n = randInt(4, 8);
        for (let i = 0; i < n; i++) this.spawnBubble(x + rand(-10, 10), this.H + rand(5, 60), rand(1.5, 5));
      }
    }
  }

  // -------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------
  waterPath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(-4, this.H + 4);
    traceOpenSmooth(ctx, pts, false);
    ctx.lineTo(this.W + 4, this.H + 4);
    ctx.closePath();
  }

  render(ctx) {
    const T = CONFIG.tone;
    const P = CONFIG.palette;
    this.fillBackground(ctx, [
      [0, T.sinkTop],
      [1, T.sinkBottom],
    ]);

    const pts = [];
    for (let x = -4; x < this.W + 4; x += 10) pts.push([x, this.surfaceAt(x)]);
    pts.push([this.W + 4, this.surfaceAt(this.W + 4)]);

    // 뒤쪽 물
    this.waterPath(ctx, pts);
    ctx.fillStyle = linGrad(ctx, 0, this.level, 0, this.H, [
      [0, T.waterTop],
      [1, T.waterDeep],
    ]);
    ctx.fill();
    grain.fillPath(ctx, CONFIG.grain.objectAlpha);

    this.renderBag(ctx);

    // 앞쪽 물 필름: 수면 아래에 있는 부분만 파랗게, 대비는 낮게
    this.waterPath(ctx, pts);
    ctx.fillStyle = linGrad(ctx, 0, this.level, 0, this.H, [
      [0, rgba(P.azul, 0.34)],
      [1, rgba(T.azulDeep, 0.52)],
    ]);
    ctx.fill();
    ctx.fillStyle = rgba(P.areia, 0.05);
    ctx.fill();

    // 수면선
    ctx.beginPath();
    traceOpenSmooth(ctx, pts);
    ctx.strokeStyle = rgba(P.areia, 0.22);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    for (const f of this.fish) f.render(ctx);
    for (const p of this.flakes) p.render(ctx);
    for (const b of this.bubbles) b.render(ctx);
  }

  // 뜯긴 구멍이 있으면 봉투를 오프스크린에 그린 뒤 구멍을 지우고(destination-out)
  // 뜯긴 가장자리를 희게 덧칠해서(source-atop) 합성한다. 구멍끼리 겹쳐도 정확하다.
  renderBag(ctx) {
    const bag = this.bag;
    if (!bag.bites.length || !bag.visible) {
      bag.render(ctx, this.t);
      return;
    }
    const k = LAYOUT.S * pixelDensity();
    const s = bag.scale;
    const hw = 215 * s;
    const top = 245 * s;
    const bot = 175 * s;
    const w = Math.ceil(2 * hw * k);
    const h = Math.ceil((top + bot) * k);
    if (!this.off) this.off = document.createElement("canvas");
    const off = this.off;
    if (off.width !== w || off.height !== h) {
      off.width = w;
      off.height = h;
    }
    const oc = off.getContext("2d");
    const x0 = bag.x - hw;
    const y0 = bag.y - top;
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.globalCompositeOperation = "source-over";
    oc.globalAlpha = 1;
    oc.clearRect(0, 0, w, h);
    oc.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    bag.render(oc, this.t);

    oc.globalCompositeOperation = "destination-out";
    bag.traceBites(oc);
    oc.fillStyle = "#000";
    oc.fill();
    oc.globalCompositeOperation = "source-atop";
    bag.traceBites(oc);
    oc.strokeStyle = "rgba(255,255,255,0.75)";
    oc.lineWidth = 3;
    oc.stroke();
    oc.globalCompositeOperation = "source-over";

    ctx.drawImage(off, x0, y0, w / k, h / k);
  }

  renderDebug(ctx) {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    // 가라앉기 조건: 봉투 중심이 이 선 아래
    const ty = this.surfaceAt(this.bag.x) + CONFIG.sink.depthRatio * this.bag.height;
    ctx.strokeStyle = this.depthMet() ? "rgba(0,200,120,0.9)" : "rgba(255,60,60,0.9)";
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(this.W, ty);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.moveTo(0, this.level);
    ctx.lineTo(this.W, this.level);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,0,0,0.8)";
    for (const p of this.trail) ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.restore();
    debugBagOutline(ctx, this.bag);
  }

  debugInfo() {
    return `sink ${this.state} p=${this.sinkProgress.toFixed(2)} bubbles=${this.bubbles.length} bites=${this.totalBites}`;
  }

  // -------------------------------------------------------------------
  // interaction
  // -------------------------------------------------------------------
  cursorAt(x, y) {
    return this.canGrab(x, y) ? "grab" : "default";
  }

  canGrab(x, y) {
    return this.active && (this.state === "idle" || this.state === "returning") && this.bag.contains(x, y);
  }

  pointerDown(x, y) {
    if (!this.canGrab(x, y)) return false;
    this.state = "dragging";
    this.dragging = true;
    this.touched = true;
    this.grab.dx = this.bag.x - x;
    this.grab.dy = this.bag.y - y;
    this.pointerMove(x, y);
    return true;
  }

  pointerMove(x, y) {
    if (this.state !== "dragging") return;
    this.target.x = clamp(x + this.grab.dx, 150, this.W - 150);
    this.target.y = clamp(y + this.grab.dy, this.home.y - 40, this.H - 80);
  }

  pointerUp() {
    if (this.state !== "dragging") return;
    this.dragging = false;
    if (this.depthMet()) {
      this.state = "floating";
      this.floatT = 0;
      this.floatY0 = this.bag.y;
      this.sinkX = this.bag.x;
      this.splash(this.bag.x, CONFIG.sink.splashAmp * 0.6);
    } else {
      this.state = "returning";
      this.retT = 0;
      this.retFrom = this.bag.y;
      this.retTo = this.bag.y - (this.bag.y - this.home.y) * CONFIG.sink.returnRatio;
    }
  }
}
