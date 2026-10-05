// =====================================================================
// SoilParticle — Matter.js body + 불규칙한 렌더 형태
//   물리 형태는 안정적인 정다각형, 화면에는 미리 만든 울퉁불퉁한 조각을 그린다.
// =====================================================================

// 충돌 카테고리
const CAT = { GROUND: 0x0001, SOIL: 0x0002, BAG: 0x0004 };

class SoilParticle {
  constructor(x, y) {
    this.r = rand(5, 9.5);
    this.body = Matter.Bodies.polygon(x, y, randInt(5, 7), this.r, {
      friction: 0.8,
      frictionStatic: 1,
      restitution: 0.04,
      frictionAir: 0.015,
      density: 0.0025,
      collisionFilter: { category: CAT.SOIL, mask: CAT.GROUND | CAT.SOIL | CAT.BAG },
    });
    this.pts = irregularPoly(Math.random, randInt(6, 8), this.r * 1.08, 0.28);
    this.c = shade(CONFIG.palette.cafe, rand(-0.2, 0.14));
    this.c0 = rgba(shade(this.c, 0.1));
    this.c1 = rgba(shade(this.c, -0.14));
  }

  render(ctx) {
    const b = this.body;
    const r = this.r;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.beginPath();
    traceSmooth(ctx, this.pts);
    ctx.fillStyle = linGrad(ctx, -r, -r, r, r, [
      [0, this.c0],
      [1, this.c1],
    ]);
    ctx.fill();
    ctx.restore();
  }
}
