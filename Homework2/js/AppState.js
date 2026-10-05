// =====================================================================
// AppState — 순차 진행 상태 머신 + 엔딩 타임라인
//   activeStage 0 : BURN 만 조작 가능
//               1 : BURY
//               2 : SINK
//               3 : 모두 완료 → 정적 → 화면 전체 암전 → "DELETED?" 타이핑 → RESTART
//   엔딩 화면 자체는 EndingUI(DOM)가 그린다. 여기서는 시간만 관리한다.
//   씬 시뮬레이션은 엔딩 뒤에서도 계속 돈다 (재, 기포).
// =====================================================================

class AppState {
  constructor() {
    this.scenes = [new BurnScene(), new BuryScene(), new SinkScene()];
    this.activeStage = 0;
    this.burnComplete = false;
    this.buryComplete = false;
    this.sinkComplete = false;

    this.endT = 0; // 세 작업이 끝난 뒤 흐른 시간
    this.darkness = 0; // 암전 진행도 0 → 1 (eased)

    this.scenes[0].activate();
    this.scenes.forEach((s, i) => (s.gray = i === this.activeStage ? 0 : 1));
  }

  get burnProgress() {
    return this.scenes[0].burnProgress;
  }
  get buryProgress() {
    return this.scenes[1].buryProgress;
  }
  get sinkProgress() {
    return this.scenes[2].sinkProgress;
  }

  // 암전 진행도가 textStart 를 넘으면 타이핑 시작
  get typingStarted() {
    const e = CONFIG.ending;
    return this.activeStage === 3 && this.endT >= e.hold + e.fade * e.textStart;
  }

  update(dt) {
    for (const s of this.scenes) s.update(dt);

    while (this.activeStage < 3 && this.scenes[this.activeStage].complete) {
      if (this.activeStage === 0) this.burnComplete = true;
      if (this.activeStage === 1) this.buryComplete = true;
      if (this.activeStage === 2) this.sinkComplete = true;
      this.activeStage++;
      if (this.activeStage < 3) this.scenes[this.activeStage].activate();
    }

    // 조작 중인 패널만 컬러. 세 작업이 끝나면 셋 다 컬러로 돌아와 결과를 함께 보여준다.
    const step = dt / CONFIG.gray.fade;
    this.scenes.forEach((s, i) => {
      const target = this.activeStage < 3 && i !== this.activeStage ? 1 : 0;
      s.gray = target > s.gray ? Math.min(target, s.gray + step) : Math.max(target, s.gray - step);
    });

    if (this.activeStage === 3) {
      const e = CONFIG.ending;
      this.endT += dt;
      this.darkness = easeInOutCubic(clamp((this.endT - e.hold) / e.fade, 0, 1));
    }
  }
}
