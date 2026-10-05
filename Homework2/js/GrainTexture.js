// =====================================================================
// GrainTexture — 초기화 때 한 번만 만드는 노이즈 타일 (p5.Graphics)
//   · fillPath() : 현재 경로 안쪽을 grain 으로 채운다 (CSS 1px = 텍셀 1개).
//                  오브제 좌표에 고정되므로 봉투가 움직여도 텍스처가 미끄러지지 않는다.
//   매 프레임 픽셀을 새로 만들지 않고 같은 패턴을 drawImage/fill 로 재사용한다.
// =====================================================================

class GrainTexture {
  constructor(size) {
    const g = createGraphics(size, size);
    g.pixelDensity(1);
    g.loadPixels();
    const d = g.pixels;
    for (let i = 0; i < size * size; i++) {
      const v = Math.random() < 0.5 ? 0 : 255; // 어두운 점 / 밝은 점
      const a = Math.pow(Math.random(), 2.2) * 255;
      const k = i * 4;
      d[k] = d[k + 1] = d[k + 2] = v;
      d[k + 3] = a;
    }
    g.updatePixels();
    this.g = g;
    this.patterns = new WeakMap(); // 컨텍스트마다 패턴 하나 (오프스크린 캔버스에서도 쓴다)
  }

  _pattern(ctx) {
    let p = this.patterns.get(ctx);
    if (!p) {
      p = ctx.createPattern(this.g.elt, "repeat");
      this.patterns.set(ctx, p);
    }
    return p;
  }

  // 호출 전에 beginPath + trace 로 경로를 만들어 둔다
  // (세 패널 전체 오버레이도 패널 사각형 경로로 이 함수를 쓴다)
  fillPath(ctx, alpha) {
    const p = this._pattern(ctx);
    const m = ctx.getTransform();
    const k = pixelDensity() / (Math.hypot(m.a, m.b) || 1);
    p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = p;
    ctx.fill();
    ctx.restore();
  }
}
