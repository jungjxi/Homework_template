// =====================================================================
// BuryScene — 가운데 패널, Level 2 (Matter.js)
//   꾹 누르기 → 떼기 = "한 삽" (포인터 또는 Space / Enter / ↓ 를 누르고 있다가 뗀다)
//     누르는 동안: 봉투 옆 흙바닥에 삽이 파고들며 흙을 싣는다 (구덩이가 파인다)
//     떼면: 흙을 퍼 올려 봉투 위에 털고(Shovel), 그 순간
//           흙 한 줌이 떨어지고 봉투가 한 스텝 흙 속으로 눌려 내려간다.
//     덜 판 채로 떼면 흙이 흘러내리고 아무 일도 없다.
//   스텝 수(steps)만큼 반복하면 완전히 묻힌다. buryProgress = 내려간 깊이 비율.
//
//   흙 구조
//     · 흙 표면 = 높이맵 (열 31개). 각 열은 Matter static 사각형이고,
//       앞쪽 흙 형태도 같은 높이맵으로 그린다.
//       봉투가 들어가면 봉투 폭만큼 그릇처럼 파이고 양옆은 살짝 솟는다.
//       봉투 윗부분이 표면 근처까지 내려가면 다시 메워진다.
//     · 표면 위 흙 입자 48개 (Matter body) 가 밀려나고 튀고 구덩이로 떨어져
//       봉투 위를 덮는다.
//     · 봉투 충돌체 = static 타원 2개 (몸통, 매듭/귀). 흙 열과는 충돌하지 않는다.
//
//   카메라: 봉투가 깊어질수록 화면이 camMax 만큼 아래로 내려가 흙을 더 보여준다.
//           (월드 좌표 = 화면 좌표 + camY. 배경 하늘만 화면 좌표에 고정)
//
//   렌더: 배경 → 구덩이 안쪽 흙 → 봉투 → 앞쪽 흙 (높이맵) → 흙 입자 → 삽
//         (파는 중인 삽은 흙 표면 위만 보이게 잘라서 날이 흙 속에 들어간 것처럼)
//   state: idle → digging → settling → done
//   잔여: 아무 흔적 없는 평평한 흙
// =====================================================================

class BuryScene extends Scene {
  constructor() {
    super(1, "HOLD TO DIG · RELEASE TO COVER", CONFIG.palette.areia);
    const c = CONFIG.bury;
    this.bag = new TrashBag();
    const s = this.bag.scale;
    this.y0 = this.H * c.homeY; // 가운데 근처에서 시작
    this.surface0 = this.y0 + BAG.bottom * s + 1; // 흙 표면은 봉투 바닥에 맞춘다
    this.yFinal = this.surface0 + c.coverMargin - BAG.top * s; // 매듭 끝까지 표면 아래
    this.depth = this.yFinal - this.y0;
    // 묻을수록 화면(카메라)이 아래로 내려간다. 월드 y = 화면 y + camY
    //   (카메라 이동량이 깊이의 55% 를 넘지 않아야 드래그 ↔ 화면 대응이 단조롭다)
    const finalBottom = this.yFinal + BAG.bottom * s;
    this.camMax = clamp(finalBottom + c.camPad - this.H, 0, this.depth * 0.55);
    this.camY = 0;
    this.bag.x = this.W / 2;
    this.bag.y = this.y0;

    this.targetX = this.W / 2;
    this.targetY = this.y0;
    this.shovels = [];
    this.held = null; // 지금 누르고 있는 삽
    this.holdBy = null; // "pointer" | "key"
    this.keySide = 1; // 키보드로 팔 때 봉투 양옆을 번갈아
    this.hole = { x: 0, d: 0 }; // 삽이 파는 자리의 구덩이
    this.queued = 0; // 다 실어서 뗀 삽 수 (흙을 털기 전 것 포함)
    this.stepsDone = 0; // 흙을 턴 삽질 수 (봉투가 내려간 스텝)
    this.buryProgress = 0;
    this.state = "idle";
    this.press = 0;
    this.prevY = this.y0;
    this.acc = 0;
    this.fullT = 0; // 끝까지 밀어 넣은 채 유지한 시간
    this.settleT = 0;
    this.settleFrom = 0;
    this.afterT = 0;
    this.bagRemoved = false;

    this.initPhysics();
  }

  // -------------------------------------------------------------------
  // Matter.js 월드
  // -------------------------------------------------------------------
  initPhysics() {
    const { Engine, Bodies, Composite } = Matter;
    const c = CONFIG.bury;
    const W = this.W;
    const s = this.bag.scale;

    this.engine = Engine.create();
    this.engine.gravity.y = 1;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    const world = this.engine.world;

    this.colH = 560;
    this.cols = [];
    this.walls = [];
    this.buildGround(null);

    const bagOpts = {
      isStatic: true,
      friction: 0.6,
      collisionFilter: { category: CAT.BAG, mask: CAT.SOIL },
    };
    this.bagBody = Bodies.fromVertices(0, 0, [ellipseVerts(BAG.ellRx * s, BAG.ellRy * s, 22)], bagOpts);
    this.knotBody = Bodies.fromVertices(0, 0, [ellipseVerts(80 * s, 36 * s, 14)], bagOpts);
    Composite.add(world, [this.bagBody, this.knotBody]);
    this.syncBagBodies(false);

    // 흙 입자: 대부분 봉투 양옆 가까이, 일부는 넓게
    this.soil = [];
    const hw = BAG.ellRx * s;
    for (let i = 0; i < c.particles; i++) {
      const side = i % 2 ? 1 : -1;
      let x = W / 2 + side * (hw * 0.8 + Math.abs(gauss()) * 90);
      if (i % 6 === 0) x = rand(30, W - 30);
      x = clamp(x, 20, W - 20);
      const p = new SoilParticle(x, this.surface0 - 12 - rand(0, 50));
      this.soil.push(p);
    }
    Composite.add(world, this.soil.map((p) => p.body));
    for (let i = 0; i < 180; i++) Engine.update(this.engine, 1000 / 60);
  }

  // 흙 표면 높이맵 열 + 좌우 벽. prevSurfAt 이 있으면 이전 표면 모양을 이어받는다.
  buildGround(prevSurfAt) {
    const { Bodies, Composite } = Matter;
    const c = CONFIG.bury;
    const W = this.W;
    const H = this.H;
    const world = this.engine.world;
    const ground = { category: CAT.GROUND, mask: CAT.SOIL };
    Composite.remove(world, this.cols.concat(this.walls));

    this.colW = W / c.columns;
    this.rest = [];
    this.surf = [];
    this.cols = [];
    for (let i = 0; i < c.columns; i++) {
      const x = (i + 0.5) * this.colW;
      const rest = this.surface0 + 1.5 * Math.sin(i * 0.9);
      const surf = prevSurfAt ? prevSurfAt(x) : rest;
      this.rest.push(rest);
      this.surf.push(surf);
      this.cols.push(
        Bodies.rectangle(x, surf + this.colH / 2, this.colW + 2, this.colH, {
          isStatic: true,
          friction: 0.9,
          collisionFilter: ground,
        }),
      );
    }
    this.walls = [
      Bodies.rectangle(-20, H / 2, 40, H * 4, { isStatic: true, collisionFilter: ground }),
      Bodies.rectangle(W + 20, H / 2, 40, H * 4, { isStatic: true, collisionFilter: ground }),
    ];
    Composite.add(world, this.cols.concat(this.walls));
  }

  setWidth(W) {
    const dx = (W - this.W) / 2;
    const oldSurf = this.surf.slice();
    const oldColW = this.colW;
    super.setWidth(W);
    const prevSurfAt = (x) => {
      const f = clamp((x - dx) / oldColW - 0.5, 0, oldSurf.length - 1);
      const i = Math.floor(f);
      const j = Math.min(i + 1, oldSurf.length - 1);
      return mix(oldSurf[i], oldSurf[j], f - i);
    };
    this.buildGround(prevSurfAt);
    this.bag.x += dx;
    this.targetX += dx;
    this.syncBagBodies(false);
    for (const p of this.soil) {
      const pos = p.body.position;
      Matter.Body.setPosition(p.body, { x: clamp(pos.x + dx, 15, W - 15), y: pos.y }, false);
    }
  }

  // 카메라: 봉투 깊이에 따라 0 → camMax (부드럽게 시작/끝)
  camFor(bagY) {
    return this.camMax * smoothstep(0, 1, (bagY - this.y0) / this.depth);
  }

  syncBagBodies(updateVelocity = true) {
    if (this.bagRemoved) return;
    const { Body } = Matter;
    const s = this.bag.scale;
    Body.setPosition(this.bagBody, { x: this.bag.x, y: this.bag.y + BAG.ellCy * s }, updateVelocity);
    Body.setPosition(this.knotBody, { x: this.bag.x, y: this.bag.y - 148 * s }, updateVelocity);
  }

  removeBag() {
    Matter.Composite.remove(this.engine.world, [this.bagBody, this.knotBody]);
    this.bagRemoved = true;
    this.bag.visible = false;
  }

  surfAt(x) {
    const f = clamp(x / this.colW - 0.5, 0, this.surf.length - 1);
    const i = Math.floor(f);
    const j = Math.min(i + 1, this.surf.length - 1);
    return mix(this.surf[i], this.surf[j], f - i);
  }

  flatness() {
    let m = 0;
    for (let i = 0; i < this.surf.length; i++) m = Math.max(m, Math.abs(this.surf[i] - this.rest[i]));
    return m;
  }

  soilSpeed() {
    let s = 0;
    for (const p of this.soil) s += p.body.speed;
    return s / this.soil.length;
  }

  // -------------------------------------------------------------------
  // update — Matter 는 고정 스텝(1/60초)으로
  // -------------------------------------------------------------------
  update(dt) {
    this.updateCommon(dt);
    const h = 1 / 60;
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= h) {
      this.fixedStep(h);
      this.acc -= h;
    }
    this.bag.updateDynamics(dt);
    for (const sh of this.shovels) sh.update(dt);
    this.shovels = this.shovels.filter((sh) => !sh.dead);
  }

  fixedStep(h) {
    const c = CONFIG.bury;
    const bag = this.bag;

    switch (this.state) {
      case "digging": {
        // 한 삽마다 봉투가 쿵 하고 한 스텝 내려간다. 깊어질수록 조금 더 뻑뻑하다.
        const rate = mix(18, 11, this.buryProgress);
        const dy = clamp((this.targetY - bag.y) * expDecay(rate, h), 0, c.maxSpeed * h);
        bag.y += dy;
        bag.x += (this.targetX - bag.x) * expDecay(8, h);
        // 마지막 삽까지 들어가면 남은 흙이 덮이며 마무리
        // (실수 비교 대신 정수 스텝 수로 판단한다 — 누적 오차로 멈추지 않도록)
        const last = this.stepsDone >= c.steps;
        this.fullT = last && this.yFinal - bag.y < 1.5 ? this.fullT + h : 0;
        if (this.fullT > 0.25) this.beginSettle();
        break;
      }
      case "settling": {
        this.settleT += h;
        const k = easeInOutCubic(clamp(this.settleT / c.settleTime, 0, 1));
        if (!this.bagRemoved) {
          bag.y = mix(this.settleFrom, this.yFinal, k);
          bag.x += (this.W / 2 - bag.x) * expDecay(2, h);
          // 봉투가 표면 아래로 완전히 내려가고 흙이 평평해지면 봉투를 없앤다
          // (안전장치: 조건이 늦게 맞더라도 정해진 시간이 지나면 마무리)
          const ready = bag.topY > this.surface0 + 12 && this.flatness() < 1.2;
          if (k >= 1 && (ready || this.settleT > c.settleTime + 2.5)) this.removeBag();
        } else {
          this.afterT += h;
          if ((this.afterT > 1.4 && this.soilSpeed() < 0.12) || this.afterT > 3.5) {
            this.state = "done";
            this.complete = true;
          }
        }
        break;
      }
    }

    this.buryProgress = clamp((bag.y - this.y0) / this.depth, 0, 1);
    this.camY = this.camFor(bag.y);

    // 누를 때 옆으로 살짝 퍼진다
    const vy = (bag.y - this.prevY) / h;
    const stepDy = bag.y - this.prevY;
    this.prevY = bag.y;
    this.press += (clamp(vy / 300, 0, 1) - this.press) * expDecay(10, h);
    bag.baseSx = 1 + 0.05 * this.press;
    bag.baseSy = 1 - 0.04 * this.press;

    this.updateHeightfield(h);
    if (this.held && this.held.phase === "dig" && !this.held.loaded) this.spraySoil();
    this.syncBagBodies(true);
    if (stepDy > 0.3) this.kickSoil(stepDy);
    Matter.Engine.update(this.engine, h * 1000);
    this.fixParticles(vy);
  }

  // 흙 표면 높이맵: 봉투 폭만큼 파이고, 양옆이 솟고, 봉투가 지나가면 메워진다
  updateHeightfield(h) {
    const c = CONFIG.bury;
    const bag = this.bag;
    const s = bag.scale;
    const present = !this.bagRemoved;
    const d = present ? Math.max(0, bag.bottomY - this.surface0) : 0;
    const hw = BAG.ellRx * s * bag.sx;
    const fill = present ? 1 - smoothstep(-50, 25, bag.topY - this.surface0) : 0;
    const dent = Math.min(d * c.dentRatio, c.dentMax) * fill;
    const mound = c.moundHeight * Math.min(d / 120, 1) * fill;
    const rate = this.state === "digging" ? 10 : this.state === "settling" ? 3.2 : 2;
    const k = expDecay(rate, h);
    // 파는 동안 삽 자리가 파이고, 떼면 천천히 메워진다
    const hole = this.hole;
    const goal = this.held ? 18 * easeOutCubic(this.held.load) : 0;
    hole.d += (goal - hole.d) * expDecay(this.held ? 6 : 1.8, h);

    for (let i = 0; i < this.surf.length; i++) {
      const x = (i + 0.5) * this.colW;
      let target = this.rest[i];
      if (present) {
        const dx = Math.abs(x - bag.x);
        if (dx < hw) target += dent * Math.pow(Math.cos((dx / hw) * (Math.PI / 2)), 0.8);
        target -= mound * Math.exp(-(((dx - hw - 16) / 24) ** 2));
      }
      if (hole.d > 0.05) target += hole.d * Math.exp(-(((x - hole.x) / 26) ** 2));
      this.surf[i] += (target - this.surf[i]) * k;
      Matter.Body.setPosition(this.cols[i], { x, y: this.surf[i] + this.colH / 2 }, true);
    }
  }

  // 봉투가 내려가는 순간 근처 흙알이 옆/위로 튄다 (확률적으로, 과하지 않게)
  kickSoil(stepDy) {
    const { Body } = Matter;
    const bag = this.bag;
    const reach = BAG.ellRx * bag.scale + 40;
    for (const p of this.soil) {
      const b = p.body;
      const dx = b.position.x - bag.x;
      if (Math.abs(dx) > reach || b.position.y > this.surface0 + 30) continue;
      if (Math.random() > 0.08) continue;
      Body.setVelocity(b, {
        x: b.velocity.x + Math.sign(dx || 1) * stepDy * rand(0.1, 0.35),
        y: b.velocity.y - stepDy * rand(0.15, 0.45),
      });
    }
  }

  // 삽이 파는 자리 근처 흙알이 이따금 튄다
  spraySoil() {
    const x0 = this.held.digX;
    const dir = this.held.dir;
    for (const p of this.soil) {
      const b = p.body;
      if (Math.abs(b.position.x - x0) > 40 || Math.random() > 0.03) continue;
      Matter.Body.setVelocity(b, { x: dir * rand(0.3, 1.6), y: -rand(1.5, 3.4) });
    }
  }

  // 터널링 / 누수 보정
  fixParticles(bagVy) {
    const { Body } = Matter;
    const bag = this.bag;
    const s = bag.scale;
    const rx = BAG.ellRx * s;
    const ry = BAG.ellRy * s;
    const cy = bag.y + BAG.ellCy * s;
    for (const p of this.soil) {
      const b = p.body;
      const pos = b.position;
      // 화면 밖 → 표면 위에서 다시
      if (pos.y > this.H + this.camMax + 60 || pos.x < -30 || pos.x > this.W + 30) {
        Body.setPosition(b, { x: rand(120, this.W - 120), y: this.surface0 - 80 }, false);
        Body.setVelocity(b, { x: 0, y: 0 });
        continue;
      }
      const sy = this.surfAt(pos.x);
      if (!this.bagRemoved) {
        const dx = pos.x - bag.x;
        const dy = pos.y - cy;
        const q = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (q < 0.9) {
          if (dy < 0) {
            // 봉투 윗면으로 파고든 입자 → 봉투 경계 밖으로
            const f = (1 / Math.sqrt(q || 0.01)) * 1.03;
            Body.setPosition(b, { x: bag.x + dx * f, y: cy + dy * f }, false);
          } else {
            // 봉투 아래로 밀려 들어간 입자 → 흙 표면 또는 봉투 윗면 위로
            const top = cy - ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2));
            Body.setPosition(b, { x: pos.x, y: Math.min(sy, top) - p.r - 1 }, false);
          }
          Body.setVelocity(b, { x: b.velocity.x * 0.5, y: (bagVy / 60) * 0.5 });
          continue;
        }
        if (q < 1) continue; // 봉투 경계에 닿아 있는 입자는 물리에 맡긴다
      }
      // 흙 표면 아래로 빠진 입자 → 표면 위로
      if (pos.y > sy + 6) {
        Body.setPosition(b, { x: pos.x, y: sy - p.r }, false);
        Body.setVelocity(b, { x: b.velocity.x, y: 0 });
      }
    }
  }

  beginSettle() {
    if (this.state === "settling") return;
    this.state = "settling";
    this.dragging = false;
    this.held = null;
    this.settleT = 0;
    this.settleFrom = this.bag.y;
    // 남은 흙이 후두둑 떨어지도록 살짝 들썩
    const reach = BAG.ellRx * this.bag.scale + 60;
    for (const p of this.soil) {
      const b = p.body;
      if (Math.abs(b.position.x - this.bag.x) > reach) continue;
      Matter.Body.setVelocity(b, {
        x: b.velocity.x + rand(-1.4, 1.4),
        y: b.velocity.y - rand(1.2, 3.2),
      });
    }
  }

  // -------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------
  render(ctx) {
    const T = CONFIG.tone;
    const P = CONFIG.palette;
    const W = this.W;
    const H = this.H;
    this.fillBackground(ctx, [
      [0, T.buryTop],
      [1, T.buryBottom],
    ]);

    ctx.save();
    ctx.translate(0, -this.camY);
    const bottom = H + this.camMax + 10;

    // 구덩이 안쪽 벽 (앞쪽 흙이 파인 곳에서만 보인다)
    ctx.fillStyle = linGrad(ctx, 0, this.surface0, 0, bottom, [
      [0, T.soilBack],
      [1, T.soilDeep],
    ]);
    ctx.fillRect(-2, this.surface0 - 1, W + 4, bottom - this.surface0 + 1);

    this.bag.render(ctx, this.t);

    // 앞쪽 흙 (높이맵)
    const pts = [[-4, this.surf[0]]];
    for (let i = 0; i < this.surf.length; i++) pts.push([(i + 0.5) * this.colW, this.surf[i]]);
    pts.push([W + 4, this.surf[this.surf.length - 1]]);
    ctx.beginPath();
    ctx.moveTo(-4, bottom);
    traceOpenSmooth(ctx, pts, false);
    ctx.lineTo(W + 4, bottom);
    ctx.closePath();
    ctx.fillStyle = linGrad(ctx, 0, this.surface0 - 20, 0, bottom, [
      [0, T.soilTop],
      [0.2, P.cafe],
      [1, T.soilDeep],
    ]);
    ctx.fill();
    grain.fillPath(ctx, CONFIG.grain.objectAlpha);
    // 표면의 아주 옅은 밝은 가장자리
    ctx.beginPath();
    traceOpenSmooth(ctx, pts);
    ctx.strokeStyle = rgba(P.areia, 0.1);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (const p of this.soil) p.render(ctx);
    for (const sh of this.shovels) {
      if (sh.inGround) {
        // 날이 흙 속에 들어간 부분은 가린다
        ctx.save();
        ctx.beginPath();
        ctx.rect(-10, this.camY - 300, W + 20, this.surfAt(sh.digX) + 1 - (this.camY - 300));
        ctx.clip();
        sh.render(ctx);
        ctx.restore();
      } else sh.render(ctx);
    }
    ctx.restore();
  }

  renderDebug(ctx) {
    ctx.save();
    ctx.translate(0, -this.camY);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.moveTo(0, this.surface0);
    ctx.lineTo(this.W, this.surface0);
    ctx.stroke();
    // 매립 목표: 매듭 끝이 이 선 아래로
    ctx.strokeStyle = "rgba(255,80,80,0.9)";
    const ty = this.surface0 + CONFIG.bury.coverMargin;
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(this.W, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // Matter body 외곽
    ctx.strokeStyle = "rgba(0,255,160,0.8)";
    const bodies = Matter.Composite.allBodies(this.engine.world);
    for (const b of bodies) {
      const v = b.vertices;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  debugInfo() {
    return `bury ${this.state} p=${this.buryProgress.toFixed(2)} flat=${this.flatness().toFixed(1)}`;
  }

  // -------------------------------------------------------------------
  // interaction — 꾹 누르면 파고, 떼면 덮는다
  // -------------------------------------------------------------------
  canDig() {
    return (
      this.active &&
      (this.state === "idle" || this.state === "digging") &&
      this.queued < CONFIG.bury.steps &&
      !this.held &&
      !this.shovels.some((sh) => sh.busy)
    );
  }

  cursorAt() {
    return this.canDig() ? "pointer" : "default";
  }

  pointerDown(x) {
    return this.startDig(x, "pointer"); // 누르고 있는 동안 pointerUp 을 받기 위해 드래그로 잡는다
  }

  pointerUp() {
    if (this.holdBy === "pointer") this.endDig();
  }

  keyDown(e) {
    if (e.key !== " " && e.key !== "Enter" && e.key !== "ArrowDown") return false;
    if (!e.repeat && !this.held) {
      this.keySide = -this.keySide;
      this.startDig(this.bag.x + this.keySide, "key");
    }
    return true; // 자동반복도 삼킨다 (페이지 스크롤 방지)
  }

  keyUp(e) {
    if (e.key !== " " && e.key !== "Enter" && e.key !== "ArrowDown") return false;
    if (this.holdBy === "key") this.endDig();
    return true;
  }

  // 누르기 시작: 누른 쪽(봉투 왼쪽/오른쪽) 흙바닥에 삽이 들어온다
  startDig(x, by) {
    if (!this.canDig()) return false;
    const bag = this.bag;
    const dir = x >= bag.x ? 1 : -1;
    const hw = BAG.ellRx * bag.scale;
    // 봉투 가장자리 바로 바깥 (좁은 패널에서도 손잡이가 패널 안에 남도록)
    const digX = clamp(bag.x + dir * (hw * 0.8 + 18), 44, this.W - 44);
    this.held = new Shovel(digX, this.surfAt(digX), dir);
    this.shovels.push(this.held);
    this.holdBy = by;
    this.hole.x = digX;
    this.dragging = by === "pointer";
    this.touched = true;
    this.state = "digging";
    return true;
  }

  // 떼기: 다 실었으면 봉투 위로 옮겨 털고, 아니면 흘린다
  endDig() {
    const sh = this.held;
    this.held = null;
    this.holdBy = null;
    this.dragging = false;
    if (!sh) return;
    if (sh.loaded) {
      this.queued++;
      const bag = this.bag;
      const hw = BAG.ellRx * bag.scale;
      const off = sh.dir * rand(0.05, 0.3) * hw;
      // 삽날이 봉투 위, 화면 안쪽에 오도록 (봉투가 깊어지면 흙 표면 위)
      const dumpAt = () => {
        const sx = bag.x + off;
        const top = Math.min(bag.topY, this.surfAt(sx));
        return [sx, Math.max(top - 70, this.camY + 95)];
      };
      sh.letGo((tx, ty) => this.releaseScoop(tx, ty), dumpAt);
    } else {
      const [tx, ty] = sh.tipPoint();
      sh.letGo(null, null);
      this.throwSoil(tx, Math.min(ty, this.surfAt(tx) - 8), Math.round(sh.load * 3));
    }
  }

  // 삽이 흙을 터는 순간: 흙 한 줌 + 봉투 한 스텝
  releaseScoop(x, y) {
    const c = CONFIG.bury;
    if (this.state !== "digging") return;
    this.stepsDone = Math.min(c.steps, this.stepsDone + 1);
    // 마지막 스텝은 정확히 yFinal (나눗셈 누적 오차 없이)
    this.targetY = this.stepsDone >= c.steps ? this.yFinal : this.y0 + (this.depth * this.stepsDone) / c.steps;
    this.throwSoil(x, y);
  }

  // 흙 한 줌: 삽날 끝에서 쏟아진다
  throwSoil(x, y, n = CONFIG.bury.scoop) {
    const { Body, Composite } = Matter;
    const c = CONFIG.bury;
    for (let k = 0; k < n; k++) {
      const px = x + rand(-14, 14);
      const py = y + rand(-6, 6);
      let p;
      if (this.soil.length >= c.maxParticles) {
        // 상한을 넘으면 가장 오래된 입자를 새 한 줌으로 재사용
        p = this.soil.shift();
        Body.setPosition(p.body, { x: px, y: py }, false);
        Body.setAngle(p.body, rand(PI2));
      } else {
        p = new SoilParticle(px, py);
        Composite.add(this.engine.world, p.body);
      }
      Body.setVelocity(p.body, { x: rand(-1.4, 1.4), y: rand(1, 3) });
      this.soil.push(p);
    }
  }
}
