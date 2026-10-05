// =====================================================================
// EndingUI — 화면 전체(흰 여백 포함)를 덮는 엔딩 레이어 (DOM)
//   · 암전: 페이지 배경과 작품 위를 단색 검정으로 덮는다
//   · "DELETED?" 타자기 효과: 글자 간격을 조금씩 불규칙하게, 밑줄 커서
//   · 타이핑이 끝나면 작은 RESTART
// =====================================================================

class EndingUI {
  constructor(onRestart) {
    this.root = document.getElementById("ending");
    this.shade = this.root.querySelector(".shade");
    this.title = this.root.querySelector(".title");
    this.typed = this.root.querySelector(".typed");
    this.caret = this.root.querySelector(".caret");
    this.rest = this.root.querySelector(".rest");
    this.restartBtn = this.root.querySelector(".restart");

    this.restartBtn.addEventListener("click", () => onRestart());
    this.reset();
  }

  reset() {
    this.text = CONFIG.ending.text;
    this.count = -1; // 표시된 글자 수 (-1 = 아직 렌더 안 함)
    this.timer = 0;
    this.doneT = -1; // 타이핑이 끝난 뒤 흐른 시간
    this.last = {};
    this.root.classList.remove("show-restart", "typing", "done");
    this.setCount(0);
    this.apply(0);
  }

  setCount(n) {
    if (n === this.count) return;
    this.count = n;
    this.typed.textContent = this.text.slice(0, n);
    this.rest.textContent = this.text.slice(n); // 자리만 차지 → 문장이 가운데에 고정
  }

  // 캔버스 배율에 맞춰 글자 크기
  layout(S) {
    const px = Math.max(20, Math.round(CONFIG.ending.textSize * S));
    this.title.style.fontSize = `${px}px`;
  }

  update(dt, app) {
    const e = CONFIG.ending;

    this.apply(app.darkness);

    // 타자기
    if (app.typingStarted) {
      this.root.classList.add("typing");
      if (this.count < this.text.length) {
        this.timer -= dt;
        while (this.timer <= 0 && this.count < this.text.length) {
          this.setCount(this.count + 1);
          const next = this.text[this.count];
          this.timer += rand(e.typeMin, e.typeMax) + (next === "?" ? e.typePauseBefore : 0);
        }
      } else {
        if (this.doneT < 0) this.doneT = 0;
        this.doneT += dt;
        this.root.classList.add("done");
        if (this.doneT > e.restartDelay) this.root.classList.add("show-restart");
      }
    }
  }

  apply(d) {
    const e = CONFIG.ending;
    const visible = d > 0.001;
    this.set("vis", visible, (v) => (this.root.style.visibility = v ? "visible" : "hidden"));
    // 페이지 배경(흰 여백, 패널 사이 간격)도 함께 검정으로
    const g = Math.round(255 * (1 - d));
    this.set("bg", g, (v) => (document.body.style.backgroundColor = `rgb(${v},${v},${v})`));
    const shade = Math.min(1, e.overlay * d);
    this.set("shade", shade.toFixed(3), (v) => (this.shade.style.opacity = v));
  }

  // 값이 바뀔 때만 DOM 에 쓴다
  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }
}
