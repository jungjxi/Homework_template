// =====================================================================
// Shovel — BURY 의 삽 한 번 (꾹 누르기 → 떼기 = 한 삽)
//   enter : 봉투 옆 흙바닥으로 들어온다
//   dig   : 누르고 있는 동안 날이 흙 속으로 파고들며 흙을 싣는다 (load 0 → 1)
//   떼면
//     · 다 실었으면 (load = 1) : lift → carry → tip → leave
//         흙을 퍼 올려 봉투 위로 옮기고, 날을 기울여 흙을 턴다.
//         터는 순간 onRelease(끝점 x, y) 를 한 번 부른다. (BuryScene 이 흙 입자를 뿌리고
//         봉투를 한 스텝 내린다)
//     · 덜 실었으면 : spill → leave  (흙이 흘러내리고 아무 일도 없다)
//   좌표: BuryScene 월드 좌표. 로컬 원점 = 삽날 중심, 손잡이는 -y 방향.
//   dir = +1 이면 봉투 오른쪽에서 파고, -1 이면 왼쪽 (렌더할 때 좌우 반전)
// =====================================================================

const SHOVEL = {
  enter: 0.18,
  digTime: 0.7, // 이만큼 누르고 있어야 한 삽이 가득 찬다
  digDepth: 22, // 날이 흙 속으로 들어가는 깊이
  lift: 0.2, // 퍼 올리기
  carry: 0.3, // 봉투 위로 옮기기
  tip: 0.18, // 흙 털기
  spill: 0.32, // 덜 찬 채로 뗐을 때
  leave: 0.34,
  releaseAt: 0.55, // tip 구간 중 흙이 떨어지는 시점 (비율)
  rotDig: -0.08, // 팔 때 (손잡이가 거의 수직, 봉투 쪽으로 살짝)
  rotIn: 0.95, // 흙을 싣고 있을 때 (날이 봉투 쪽 아래를 향해 거의 눕는다)
  rotOut: 0.05, // 털 때 (날 끝이 아래로)
  from: [90, -110], // 들어오고 나가는 방향 (dir 쪽 위)
};

class Shovel {
  constructor(x, y, dir) {
    this.dir = dir;
    this.digX = x; // 파는 자리 (흙 표면)
    this.digY = y;
    this.phase = "enter";
    this.pt = 0; // 현재 phase 경과 시간
    this.t = 0;
    this.load = 0;
    this.onRelease = null;
    this.dumpAt = null; // () => [x, y] 흙을 털 위치 (carry 시작 때 정한다)
    this.released = false; // 흙을 털었거나 흘렸다
    this.dead = false;
    this.mound = irregularPoly(Math.random, 9, 19, 0.28);
    this.pose = { x: x + dir * SHOVEL.from[0], y: y + SHOVEL.from[1], rot: SHOVEL.rotDig, alpha: 0 };
    this.from = null; // 다음 phase 의 시작 자세
  }

  get loaded() {
    return this.load >= 1;
  }

  // 흙 속에 있는 동안 (BuryScene 이 흙 표면 위로만 그리도록 자른다)
  get inGround() {
    return this.phase === "enter" || this.phase === "dig" || this.phase === "lift" || this.phase === "spill";
  }

  // 아직 손을 떼기 전 (다음 삽을 시작할 수 없다)
  get busy() {
    return this.phase !== "leave";
  }

  // 손을 뗐다
  letGo(onRelease, dumpAt) {
    if (this.phase !== "enter" && this.phase !== "dig") return;
    this.go(this.loaded ? "lift" : "spill");
    this.onRelease = onRelease;
    this.dumpAt = dumpAt;
    if (!this.loaded) this.released = true;
  }

  go(phase) {
    this.phase = phase;
    this.pt = 0;
    this.from = { ...this.pose };
  }

  // 날이 흙에 들어가 있는 자세 (load 에 따라 깊어진다)
  digPose() {
    const S = SHOVEL;
    const k = easeOutCubic(Math.min(1, this.load));
    const shake = (1 - k * 0.7) * (this.phase === "dig" ? 1 : 0);
    return {
      x: this.digX + Math.sin(this.t * 41) * 1.6 * shake,
      y: this.digY - 12 + S.digDepth * k + Math.abs(Math.sin(this.t * 27)) * 1.5 * shake,
      rot: S.rotDig + 0.14 * k + Math.sin(this.t * 23) * 0.04 * shake, // 다 차면 지렛대처럼 바깥으로 젖힌다
    };
  }

  update(dt) {
    const S = SHOVEL;
    this.t += dt;
    this.pt += dt;
    const p = this.pose;
    const f = this.from;

    switch (this.phase) {
      case "enter": {
        // 누르는 동안에는 들어오면서부터 흙이 실린다
        this.load = Math.min(1, this.load + dt / S.digTime);
        const k = easeOutCubic(Math.min(1, this.pt / S.enter));
        const d = this.digPose();
        p.x = d.x + this.dir * S.from[0] * (1 - k);
        p.y = d.y + S.from[1] * (1 - k);
        p.rot = d.rot;
        p.alpha = k;
        if (this.pt >= S.enter) this.go("dig");
        break;
      }
      case "dig": {
        this.load = Math.min(1, this.load + dt / S.digTime);
        Object.assign(p, this.digPose());
        p.alpha = 1;
        break;
      }
      case "lift": {
        // 날 끝을 지렛대처럼 들어 올려 흙을 퍼낸다
        const k = easeInOutSine(Math.min(1, this.pt / S.lift));
        p.x = f.x + this.dir * 10 * k;
        p.y = f.y - 46 * k;
        p.rot = mix(f.rot, S.rotIn, k);
        if (this.pt >= S.lift) this.go("carry");
        break;
      }
      case "carry": {
        const [tx, ty] = this.dumpAt();
        const k = easeInOutCubic(Math.min(1, this.pt / S.carry));
        p.x = mix(f.x, tx, k);
        p.y = mix(f.y, ty, k) - Math.sin(Math.PI * k) * 26;
        p.rot = S.rotIn;
        if (this.pt >= S.carry) this.go("tip");
        break;
      }
      case "tip": {
        const k = easeInOutSine(Math.min(1, this.pt / S.tip));
        p.x = f.x - this.dir * 6 * k;
        p.y = f.y + 10 * k;
        p.rot = mix(S.rotIn, S.rotOut, k);
        if (!this.released && k >= S.releaseAt) {
          this.released = true;
          const [tx, ty] = this.tipPoint();
          this.onRelease(tx, ty);
        }
        if (this.pt >= S.tip) this.go("leave");
        break;
      }
      case "spill": {
        // 덜 찬 삽: 들어 올리다가 흙이 흘러내린다
        const k = easeOutCubic(Math.min(1, this.pt / S.spill));
        p.x = f.x + Math.sin(this.pt * 38) * 2.5 * (1 - k);
        p.y = f.y - 34 * k;
        p.rot = f.rot + 0.25 * Math.sin(Math.PI * k);
        if (this.pt >= S.spill) this.go("leave");
        break;
      }
      case "leave": {
        const k = clamp(this.pt / S.leave, 0, 1);
        const e = easeInOutSine(k);
        p.x = f.x + this.dir * S.from[0] * e;
        p.y = f.y + S.from[1] * e;
        p.rot = mix(f.rot, S.rotIn * 0.6, e);
        p.alpha = 1 - k;
        if (k >= 1) this.dead = true;
        break;
      }
    }
  }

  // 날 끝 (월드 좌표)
  tipPoint() {
    const { x, y, rot } = this.pose;
    return [x - this.dir * Math.sin(rot) * 24, y + Math.cos(rot) * 24];
  }

  render(ctx) {
    const P = CONFIG.palette;
    const T = CONFIG.tone;
    const { x, y, rot, alpha } = this.pose;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.dir, 1);
    ctx.rotate(rot);
    ctx.globalAlpha *= alpha;

    // 손잡이 (나무)
    ctx.beginPath();
    traceRoundRect(ctx, -3.8, -210, 7.6, 186, 3);
    ctx.fillStyle = linGrad(ctx, -4, 0, 4, 0, [
      [0, rgba(shade(T.brownLight, 0.12))],
      [1, rgba(shade(T.brownLight, -0.18))],
    ]);
    ctx.fill();
    ctx.beginPath();
    traceRoundRect(ctx, -13, -218, 26, 10, 4);
    ctx.fillStyle = rgba(shade(T.brownLight, -0.1));
    ctx.fill();

    // 목
    ctx.beginPath();
    traceRoundRect(ctx, -6, -30, 12, 14, 2);
    ctx.fillStyle = rgba(shade(P.areia, -0.5));
    ctx.fill();

    // 날 (금속)
    ctx.beginPath();
    ctx.moveTo(-20, -18);
    ctx.lineTo(20, -18);
    ctx.quadraticCurveTo(23, 10, 0, 24);
    ctx.quadraticCurveTo(-23, 10, -20, -18);
    ctx.closePath();
    ctx.fillStyle = linGrad(ctx, -20, -18, 20, 24, [
      [0, rgba(shade(P.areia, -0.08))],
      [0.5, rgba(shade(P.areia, -0.3))],
      [1, rgba(shade(P.areia, -0.48))],
    ]);
    ctx.fill();
    grain.fillPath(ctx, CONFIG.grain.objectAlpha * 1.4);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 날 위의 흙 (실린 만큼, 털기 전까지)
    if (!this.released && this.load > 0.05) {
      const m = 0.35 + 0.65 * easeOutCubic(this.load);
      ctx.save();
      ctx.translate(0, -2 - 4 * m);
      ctx.scale(m, m);
      ctx.beginPath();
      traceSmooth(ctx, this.mound);
      ctx.fillStyle = linGrad(ctx, -19, -19, 19, 19, [
        [0, rgba(shade(P.cafe, 0.12))],
        [1, rgba(shade(P.cafe, -0.2))],
      ]);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}
