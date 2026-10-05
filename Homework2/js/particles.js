// =====================================================================
// particles — Matter.js 없이 p5 배열로 관리하는 가벼운 파티클
//   Particle     : 공통 (위치, 속도, 수명)
//   AshParticle  : 재 — 불규칙한 조각, 회전, 상승 + Perlin 좌우 흔들림, 일부는 낙하
//   FlameParticle: 작은 물방울 모양의 불꽃
//   SparkParticle: 라이터 휠에서 튀는 불티
//   SmokePuff    : 아주 옅은 연기
//   Bubble       : 기포 — 수면에 닿으면 pop
//   시간 단위는 초, 거리 단위는 논리 px.
// =====================================================================

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.life = 1;
    this.dead = false;
  }
  get k() {
    return this.age / this.life;
  }
  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.age >= this.life) this.dead = true;
  }
  offscreen(W, H, m = 40) {
    return this.x < -m || this.x > W + m || this.y < -m || this.y > H + m;
  }
}

// ---------------------------------------------------------------------
class AshParticle extends Particle {
  constructor(x, y, lift = 1) {
    super(x, y);
    this.size = rand(1.6, 5.8);
    this.pts = irregularPoly(Math.random, randInt(4, 6), this.size, 0.45);
    this.rot = rand(PI2);
    this.vr = rand(-2.6, 2.6);
    this.vx = rand(-14, 14);
    this.vy = -rand(25, 80) * lift;
    this.falls = Math.random() < 0.28; // 일부는 천천히 떨어진다
    this.seed = rand(1000);
    this.life = rand(3.5, 7.5);
    this.color = pick(CONFIG.tone.ash);
    this.ember = Math.random() < 0.45 ? rand(0.3, 0.9) : 0; // 처음 잠깐 달아오른 조각
  }
  update(dt) {
    this.age += dt;
    const drag = Math.exp(-0.9 * dt);
    this.vy *= drag;
    this.vy += (this.falls && this.age > 1.2 ? 22 : -4) * dt;
    this.vx *= drag;
    const wob = (noise(this.seed, this.age * 0.5) - 0.5) * 70;
    this.x += (this.vx + wob) * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    if (this.age >= this.life) this.dead = true;
  }
  render(ctx) {
    const k = this.k;
    const a = smoothstep(0, 0.12, k) * (1 - smoothstep(0.65, 1, k));
    const col =
      this.ember && this.age < this.ember
        ? rgba(mixRgb(CONFIG.palette.vermelho, this.color, this.age / this.ember), a)
        : rgba(this.color, a * 0.9);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.beginPath();
    tracePoly(ctx, this.pts);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------
class FlameParticle extends Particle {
  constructor(x, y, scale = 1) {
    super(x, y);
    this.r = rand(4, 9) * scale;
    this.vx = rand(-10, 10);
    this.vy = -rand(50, 110);
    this.life = rand(0.45, 0.95);
    this.seed = rand(1000);
  }
  update(dt) {
    super.update(dt);
    this.x += (noise(this.seed, this.age * 2) - 0.5) * 40 * dt;
  }
  render(ctx) {
    const k = this.k;
    const r = this.r * (1 - k * 0.7);
    const a = (1 - k) * 0.85;
    const { x, y } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2.2);
    ctx.quadraticCurveTo(x + r * 1.1, y - r * 0.2, x, y + r);
    ctx.quadraticCurveTo(x - r * 1.1, y - r * 0.2, x, y - r * 2.2);
    ctx.fillStyle = rgba(mixRgb(CONFIG.palette.amarelo, CONFIG.palette.vermelho, Math.min(1, k * 1.4)), a);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------
class SparkParticle extends Particle {
  constructor(x, y) {
    super(x, y);
    const a = rand(PI2);
    const v = rand(60, 170);
    this.vx = Math.cos(a) * v;
    this.vy = Math.sin(a) * v - 40;
    this.life = rand(0.2, 0.45);
    this.r = rand(0.8, 1.8);
  }
  update(dt) {
    this.vy += 260 * dt;
    super.update(dt);
  }
  render(ctx) {
    const k = this.k;
    ctx.beginPath();
    traceEllipse(ctx, this.x, this.y, this.r, this.r);
    ctx.fillStyle = rgba(mixRgb(CONFIG.palette.amarelo, CONFIG.palette.vermelho, k), 1 - k);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------
// 물고기가 뜯어낸 비닐/쓰레기 조각 — 천천히 흩어지며 가라앉는다
class FlakeParticle extends Particle {
  constructor(x, y, color, alpha) {
    super(x, y);
    this.pts = irregularPoly(Math.random, randInt(3, 5), rand(2, 5.5), 0.4);
    this.color = color;
    this.alpha = alpha;
    this.rot = rand(PI2);
    this.vr = rand(-2, 2);
    this.vx = rand(-40, 40);
    this.vy = rand(-30, 10);
    this.life = rand(3, 6);
    this.seed = rand(1000);
  }
  update(dt) {
    this.age += dt;
    const drag = Math.exp(-1.6 * dt);
    this.vx *= drag;
    this.vy = this.vy * drag + 10 * dt;
    this.x += (this.vx + (noise(this.seed, this.age * 0.6) - 0.5) * 24) * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    if (this.age >= this.life) this.dead = true;
  }
  render(ctx) {
    const k = this.k;
    const a = this.alpha * (1 - smoothstep(0.6, 1, k));
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.beginPath();
    tracePoly(ctx, this.pts);
    ctx.fillStyle = rgba(this.color, a);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------
class SmokePuff extends Particle {
  constructor(x, y) {
    super(x, y);
    this.r0 = rand(18, 30);
    this.vx = rand(-6, 6);
    this.vy = -rand(18, 32);
    this.life = rand(3, 4.5);
    this.seed = rand(1000);
  }
  update(dt) {
    super.update(dt);
    this.x += (noise(this.seed, this.age * 0.4) - 0.5) * 30 * dt;
  }
  render(ctx) {
    const k = this.k;
    const r = this.r0 * (1 + k * 1.6);
    const a = 0.075 * Math.sin(Math.PI * k);
    ctx.fillStyle = radGrad(ctx, this.x, this.y, 0, this.x, this.y, r, [
      [0, `rgba(78,60,46,${a})`],
      [1, "rgba(78,60,46,0)"],
    ]);
    ctx.fillRect(this.x - r, this.y - r, r * 2, r * 2);
  }
}

// ---------------------------------------------------------------------
class Bubble extends Particle {
  constructor(x, y, r) {
    super(x, y);
    this.x0 = x;
    this.r = r ?? rand(1.4, 6.5);
    this.speed = (26 + this.r * 9) * rand(0.8, 1.2);
    this.amp = rand(2, 7);
    this.freq = rand(1.5, 3.5);
    this.phase = rand(PI2);
    this.outline = Math.random() < 0.5;
    this.alpha = rand(0.35, 0.75);
    this.popT = -1;
    this.life = Infinity;
  }
  // surfaceAt(x) : 그 x 에서의 수면 y
  update(dt, surfaceAt) {
    this.age += dt;
    if (this.popT >= 0) {
      this.popT += dt;
      if (this.popT > 0.28) this.dead = true;
      return;
    }
    this.y -= this.speed * Math.min(1, this.age * 2.5) * dt;
    this.x = this.x0 + Math.sin(this.age * this.freq + this.phase) * this.amp;
    this.r *= 1 + 0.02 * dt; // 올라가며 아주 살짝 커진다
    const s = surfaceAt(this.x);
    if (this.y - this.r <= s + 1) {
      this.popT = 0;
      this.y = s + this.r * 0.3;
    }
  }
  render(ctx) {
    const { x, y, r } = this;
    if (this.popT >= 0) {
      const k = this.popT / 0.28;
      ctx.beginPath();
      traceEllipse(ctx, x, y, r * (1 + k * 1.3), r * (1 + k * 1.3) * 0.6);
      ctx.strokeStyle = `rgba(255,255,255,${this.alpha * (1 - k) * 0.8})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    const a = this.alpha * Math.min(1, this.age / 0.3);
    const w = Math.sin(this.age * 7 + this.phase) * 0.07;
    ctx.beginPath();
    traceEllipse(ctx, x, y, r * (1 + w), r * (1 - w));
    if (this.outline) {
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`;
      ctx.lineWidth = Math.max(0.8, r * 0.18);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(236,236,250,${a * 0.42})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.35})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    if (r > 2.2) {
      ctx.beginPath();
      traceEllipse(ctx, x - r * 0.35, y - r * 0.35, r * 0.24, r * 0.24);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
    }
  }
}
