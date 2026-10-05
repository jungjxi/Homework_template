// =====================================================================
// Fish — SINK 에서 봉투를 뜯어 먹는 주황 물고기
//   · 움직임: 목표점을 향해 부드럽게 방향을 트는 steering. 속도에 따라 꼬리가 빨리 친다.
//   · 두뇌(어디를 물지)는 SinkScene 이 정한다. 여기서는 몸과 헤엄, 죽음만 다룬다.
//   · 죽을 때: 멈추고 → 천천히 배를 뒤집고(색이 바래고) → 가라앉는다.
//   로컬 형태: 원점 = 몸 중심, +x 가 머리. 길이 len.
// =====================================================================

class Fish {
  constructor(x, y, dir) {
    this.x = x;
    this.y = y;
    this.vx = dir * 60;
    this.vy = 0;
    this.len = rand(60, 76);
    this.angle = dir > 0 ? 0 : Math.PI;
    this.phase = rand(PI2);
    this.color = mixRgb(CONFIG.palette.amarelo, CONFIG.palette.vermelho, rand(0.42, 0.62));

    this.mode = "approach"; // approach → retreat → approach … → dying
    this.target = { x, y };
    this.bite = null; // 물 자리 (봉투 로컬 좌표)
    this.wait = 0;
    this.delay = 0; // 등장 지연

    this.dying = 0; // 0 → 1 (뒤집히고 바래는 정도)
    this.dieT = -1;
    this.sinkV = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  // 머리 끝 (입)
  mouth() {
    return [this.x + Math.cos(this.angle) * this.len * 0.5, this.y + Math.sin(this.angle) * this.len * 0.5];
  }

  // 목표점으로 방향을 튼다. 가까우면 감속.
  steer(tx, ty, maxSpeed, dt, turn = 3) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = maxSpeed * Math.min(1, d / 60);
    this.vx += ((dx / d) * sp - this.vx) * expDecay(turn, dt);
    this.vy += ((dy / d) * sp - this.vy) * expDecay(turn, dt);
  }

  die() {
    if (this.dieT < 0) this.dieT = 0;
  }

  update(dt) {
    if (this.dieT >= 0) {
      // 멈춤 → 배를 뒤집음 → 가라앉음
      this.dieT += dt;
      this.vx *= Math.exp(-2.2 * dt);
      this.vy *= Math.exp(-2.2 * dt);
      this.dying = smoothstep(0.2, 2.6, this.dieT);
      if (this.dieT > 0.9) this.sinkV = Math.min(100, this.sinkV + 26 * dt);
      this.y += this.sinkV * dt;
      this.x += (noise(this.phase, this.dieT * 0.3) - 0.5) * 14 * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 몸 방향: 헤엄칠 때는 진행 방향, 죽어 가면 수평으로
    if (this.dieT < 0 && this.speed > 6) {
      let da = Math.atan2(this.vy, this.vx) - this.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.angle += da * expDecay(6, dt);
    } else if (this.dieT >= 0) {
      const flat = Math.cos(this.angle) >= 0 ? 0 : Math.PI;
      let da = flat - this.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.angle += da * expDecay(1.5, dt);
    }
    const beat = this.dieT >= 0 ? 1.2 * (1 - this.dying) : 5 + this.speed * 0.06;
    this.phase += beat * dt;
  }

  render(ctx) {
    const L = this.len;
    const h = L * 0.42;
    const P = CONFIG.palette;
    // 물속이라 아주 살짝 푸른 기, 죽어 가면 색이 바랜다
    let c = mixRgb(this.color, P.azul, 0.1);
    c = mixRgb(c, [128, 116, 110], this.dying * 0.55);
    const swish = Math.sin(this.phase) * 0.38 * (1 - this.dying * 0.8);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // 등이 항상 위로 (왼쪽을 볼 때 뒤집기), 죽으면 배가 위로
    const up = Math.cos(this.angle) >= 0 ? 1 : -1;
    ctx.scale(1, up * Math.cos(this.dying * Math.PI));

    // 꼬리
    ctx.save();
    ctx.translate(-L * 0.4, 0);
    ctx.rotate(swish);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(-L * 0.18, -h * 0.2, -L * 0.3, -h * 0.62);
    ctx.quadraticCurveTo(-L * 0.2, 0, -L * 0.3, h * 0.62);
    ctx.quadraticCurveTo(-L * 0.18, h * 0.2, 4, 0);
    ctx.fillStyle = rgba(shade(c, -0.08));
    ctx.fill();
    ctx.restore();

    // 등지느러미
    ctx.beginPath();
    ctx.moveTo(-L * 0.12, -h * 0.4);
    ctx.quadraticCurveTo(L * 0.02, -h * 0.85, L * 0.14, -h * 0.42);
    ctx.closePath();
    ctx.fillStyle = rgba(shade(c, -0.12));
    ctx.fill();

    // 몸
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.bezierCurveTo(L * 0.46, -h * 0.62, -L * 0.1, -h * 0.62, -L * 0.42, -h * 0.08);
    ctx.lineTo(-L * 0.42, h * 0.08);
    ctx.bezierCurveTo(-L * 0.1, h * 0.62, L * 0.46, h * 0.62, L * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = linGrad(ctx, 0, -h * 0.5, 0, h * 0.5, [
      [0, rgba(shade(c, -0.1))],
      [0.55, rgba(c)],
      [1, rgba(mixRgb(c, P.amarelo, 0.45))],
    ]);
    ctx.fill();
    grain.fillPath(ctx, CONFIG.grain.objectAlpha * 1.4);

    // 가슴지느러미
    ctx.beginPath();
    traceEllipse(ctx, L * 0.08, h * 0.16, L * 0.1, h * 0.14, 0.5);
    ctx.fillStyle = rgba(mixRgb(c, P.amarelo, 0.35), 0.9);
    ctx.fill();

    // 눈
    ctx.beginPath();
    traceEllipse(ctx, L * 0.3, -h * 0.1, L * 0.05, L * 0.05);
    ctx.fillStyle = this.dying > 0.5 ? "rgba(60,50,46,0.9)" : "#1B1410";
    ctx.fill();
    if (this.dying < 0.5) {
      ctx.beginPath();
      traceEllipse(ctx, L * 0.315, -h * 0.13, L * 0.015, L * 0.015);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
    }
    ctx.restore();
  }
}
