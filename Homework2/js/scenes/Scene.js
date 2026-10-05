// =====================================================================
// Scene — 세 패널의 공통 기반
//   하위 클래스가 구현: update(dt) / render(ctx) / renderDebug(ctx)
//   입력 (필요한 것만 덮어쓴다)
//     pointerDown(x,y) → 드래그를 시작하면 true (이후 pointerMove / pointerUp 이 온다)
//     keyDown(e) / keyUp(e) → 처리했으면 true
//     cursorAt(x,y)    → CSS cursor 값
//     hover            → 패널 로컬 포인터 위치 또는 null (sketch 가 매 프레임 넣어 준다)
//   좌표는 모두 패널 로컬(0..W × 0..730) 논리 px. W 는 창 비율에 따라 바뀐다.
// =====================================================================

class Scene {
  constructor(index, hint, hintColor) {
    this.index = index;
    this.W = LAYOUT.PW;
    this.H = CONFIG.H;
    this.hint = hint;
    this.hintColor = hintColor;

    this.t = 0;
    this.active = false;
    this.activeT = 0;
    this.complete = false;
    this.dragging = false;
    this.touched = false; // 처음 조작하면 힌트가 사라진다
    this.hintAlpha = 0;
    this.veil = 1; // 아직 활성화되지 않은 패널의 아주 옅은 흰 베일
    this.gray = 0; // 0 = 컬러, 1 = 흑백 (AppState 가 조절)
    this.hover = null;
  }

  pointerDown() {
    return false;
  }
  pointerMove() {}
  pointerUp() {}
  keyDown() {
    return false;
  }
  keyUp() {
    return false;
  }
  cursorAt() {
    return "default";
  }

  // 창 크기가 바뀌어 패널 폭이 달라졌을 때. 내용은 가운데를 기준으로 옮긴다.
  setWidth(W) {
    this.W = W;
  }

  activate() {
    this.active = true;
    this.activeT = 0;
  }

  updateCommon(dt) {
    this.t += dt;
    if (this.active) this.activeT += dt;

    const v = CONFIG.veil;
    if (this.active) this.veil = Math.max(0, this.veil - dt / v.fade);

    const h = CONFIG.hint;
    const show = this.active && !this.touched && !this.complete && this.activeT > h.delay;
    this.hintAlpha = show
      ? Math.min(1, this.hintAlpha + dt / h.fadeIn)
      : Math.max(0, this.hintAlpha - dt / h.fadeOut);
  }

  renderHint(ctx) {
    if (this.hintAlpha < 0.01) return;
    const h = CONFIG.hint;
    ctx.save();
    ctx.font = `500 ${h.size}px ${CONFIG.font}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba(this.hintColor, h.alpha * easeInOutSine(this.hintAlpha));
    let x = h.x;
    for (const ch of this.hint) {
      ctx.fillText(ch, x, h.y);
      x += ctx.measureText(ch).width + h.tracking;
    }
    ctx.restore();
  }

  // 흑백: 회색을 saturation 모드로 덮으면 명도는 그대로, 채도만 0 이 된다.
  // globalAlpha 로 중간 단계(부분 탈색)도 자연스럽게 섞인다.
  renderGray(ctx) {
    if (this.gray <= 0.002) return;
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = easeInOutSine(this.gray);
    ctx.fillStyle = "#808080";
    ctx.fillRect(-2, -2, this.W + 4, this.H + 4);
    ctx.restore();
  }

  renderVeil(ctx) {
    if (this.veil <= 0.002) return;
    ctx.fillStyle = `rgba(255,255,255,${CONFIG.veil.alpha * easeInOutSine(this.veil)})`;
    ctx.fillRect(-2, -2, this.W + 4, this.H + 4);
  }

  // 패널 전체를 덮는 배경 (이웃 패널과 틈 없이 맞닿도록 살짝 넘치게)
  fillBackground(ctx, stops) {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, this.H, stops);
    ctx.fillRect(-2, -2, this.W + 4, this.H + 4);
  }

  debugInfo() {
    return "";
  }
}
