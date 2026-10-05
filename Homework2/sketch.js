// =====================================================================
// Delete, Delete, Delete
// p5.js (전역 모드) + Matter.js
//
// 쓰레기봉투 하나를 세 번, 서로 다른 방법으로 화면에서 '삭제'한다.
//   [ BURN ] [ BURY ] [ SINK ]  →  암전  →  DELETED?
//
// 파일 구조
//   js/config.js          CONFIG (팔레트, 크기, 타이밍)
//   js/utils.js           수학 / 색 / 그라디언트 / 경로 헬퍼
//   js/GrainTexture.js    한 번만 만드는 grain 타일
//   js/TrashBag.js        공통 쓰레기봉투 (형태, 내부 쓰레기, 레이어 렌더)
//   js/particles.js       재 / 불꽃 / 연기 / 기포
//   js/SoilParticle.js    Matter.js 흙 입자
//   js/Shovel.js          BURY 의 삽 (클릭 한 번 = 삽 하나)
//   js/Fish.js            SINK 에서 봉투를 뜯어 먹는 물고기
//   js/scenes/*.js        Scene, BurnScene, BuryScene, SinkScene
//   js/AppState.js        순차 진행 + 엔딩 타임라인
//   js/EndingUI.js        엔딩 DOM (암전, 타자기, RESTART)
//   sketch.js             (이 파일) 진입점, 레이아웃, 입력 라우팅, 렌더 루프
//
// 입력: BURN = 라이터 클릭 / BURY = 꾹 눌러 파고 떼서 덮기 (포인터 또는 Space·Enter·↓) / SINK = 드래그
// 키: D = 디버그 표시, R = 처음부터
// =====================================================================

// 현재 레이아웃 (논리 px). 패널 높이는 H 고정, 폭 PW 는 창 비율에 따라 바뀐다.
//   캔버스 = [패널][GAP][패널][GAP][패널], S = 논리 → CSS px 배율
const LAYOUT = { H: CONFIG.H, PW: 600, GAP: 16, W: 1832, S: 1, cw: 0, ch: 0 };

let app; // AppState
let ending; // EndingUI
let grain; // GrainTexture
let DEBUG = false;
let drag = null; // { id, scene, i }
let fpsSmooth = 60;

const panelX = (i) => i * (LAYOUT.PW + LAYOUT.GAP);

// ---------------------------------------------------------------------
// p5 진입점
// ---------------------------------------------------------------------
function setup() {
  pixelDensity(Math.min(CONFIG.maxPixelDensity, displayDensity()));
  computeLayout();
  const cnv = createCanvas(LAYOUT.cw, LAYOUT.ch);
  cnv.parent("frame");
  noiseSeed(26);
  grain = new GrainTexture(CONFIG.grain.tile);
  app = new AppState();
  ending = new EndingUI(restart);
  ending.layout(LAYOUT.S);
  bindPointer(cnv.elt);
  bindKeys();
}

function draw() {
  const dt = Math.min(deltaTime, 50) / 1000;

  // update
  app.update(dt);
  ending.update(dt, app);
  if (drag && !drag.scene.dragging) drag = null; // 씬이 스스로 드래그를 끝낸 경우
  updateHover();

  // render — 패널 사이 간격은 투명하게 비워 페이지 배경(흰 벽 → 엔딩 때 검정)이 보인다
  const ctx = drawingContext;
  clear();
  ctx.save();
  ctx.scale(LAYOUT.S, LAYOUT.S);
  app.scenes.forEach((scene, i) => {
    const x0 = panelX(i);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, LAYOUT.PW, LAYOUT.H);
    ctx.clip();
    ctx.translate(x0, 0);
    scene.render(ctx);
    scene.renderHint(ctx);
    scene.renderGray(ctx);
    scene.renderVeil(ctx);
    if (DEBUG) scene.renderDebug(ctx);
    ctx.restore();
  });
  // 세 패널 위에 아주 약한 grain
  ctx.beginPath();
  for (let i = 0; i < 3; i++) ctx.rect(panelX(i), 0, LAYOUT.PW, LAYOUT.H);
  grain.fillPath(ctx, CONFIG.grain.overlayAlpha);
  ctx.restore();

  if (DEBUG) drawDebugHud(ctx, dt);
}

function windowResized() {
  const prevPW = LAYOUT.PW;
  computeLayout();
  resizeCanvas(LAYOUT.cw, LAYOUT.ch);
  if (Math.abs(LAYOUT.PW - prevPW) > 0.01)
    for (const s of app.scenes) s.setWidth(LAYOUT.PW);
  ending.layout(LAYOUT.S);
}

function restart() {
  app = new AppState();
  drag = null;
  ending.reset();
}

// ---------------------------------------------------------------------
// 레이아웃: 사방 여백을 같게, 패널 사이에 작은 간격
//   패널 높이(논리 730)가 캔버스 높이를 채우고, 남는 가로를 세 패널이 나눈다.
//   패널 폭이 panelMin/Max 를 벗어나는 극단적인 창에서만 한쪽 여백이 넓어진다.
// ---------------------------------------------------------------------
function computeLayout() {
  const f = CONFIG.frame;
  const L = CONFIG.layout;
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  const m = clamp(iw * f.marginRatio, f.marginMin, f.marginMax);
  const gap = clamp(m * L.gapRatio, L.gapMin, L.gapMax); // CSS px
  let cw = Math.max(200, iw - m * 2);
  let ch = Math.max(120, ih - m * 2);

  let S = ch / LAYOUT.H;
  const pw = (cw - 2 * gap) / 3 / S;
  if (pw < L.panelMin) {
    S = (cw - 2 * gap) / (3 * L.panelMin);
    ch = LAYOUT.H * S;
  } else if (pw > L.panelMax) {
    cw = 3 * L.panelMax * S + 2 * gap;
  }

  LAYOUT.cw = Math.floor(cw);
  LAYOUT.ch = Math.floor(ch);
  LAYOUT.S = LAYOUT.ch / LAYOUT.H;
  LAYOUT.GAP = gap / LAYOUT.S;
  LAYOUT.W = LAYOUT.cw / LAYOUT.S;
  LAYOUT.PW = (LAYOUT.W - 2 * LAYOUT.GAP) / 3;
}

// ---------------------------------------------------------------------
// 입력: Pointer Events 하나로 마우스 / 트랙패드 / 터치
// ---------------------------------------------------------------------
let hover = { x: -1, y: -1 };

// 논리 x → 패널 번호 (간격 위면 -1)
function panelAt(x) {
  const i = Math.floor(x / (LAYOUT.PW + LAYOUT.GAP));
  if (i < 0 || i > 2 || x - panelX(i) > LAYOUT.PW) return -1;
  return i;
}

function bindPointer(el) {
  const toLogical = (e) => {
    const r = el.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * LAYOUT.W,
      y: ((e.clientY - r.top) / r.height) * LAYOUT.H,
    };
  };

  el.addEventListener("pointerdown", (e) => {
    if (drag) return;
    const p = toLogical(e);
    hover = p;
    const i = panelAt(p.x);
    if (i < 0 || i !== app.activeStage) return;
    const scene = app.scenes[i];
    // 클릭형 씬은 여기서 처리하고 false, 드래그형(SINK)은 true 를 돌려준다
    if (scene.pointerDown(p.x - panelX(i), p.y)) {
      drag = { id: e.pointerId, scene, i };
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        // 캡처할 수 없는 포인터여도 드래그는 계속된다
      }
      e.preventDefault();
    }
  });

  el.addEventListener("pointermove", (e) => {
    const p = toLogical(e);
    hover = p;
    if (drag && e.pointerId === drag.id)
      drag.scene.pointerMove(p.x - panelX(drag.i), p.y);
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.scene.pointerUp();
    if (el.hasPointerCapture(e.pointerId))
      el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("lostpointercapture", end);
  el.addEventListener("pointerleave", () => {
    if (!drag) hover = { x: -1, y: -1 };
  });
}

// 키보드: D / R 은 전역, 나머지는 조작 중인 씬으로 (BURY 의 Space·Enter·↓ 누르기/떼기)
function bindKeys() {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "d" || e.key === "D") DEBUG = !DEBUG;
    else if (e.key === "r" || e.key === "R") restart();
    else if (app.activeStage < 3 && app.scenes[app.activeStage].keyDown(e))
      e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    if (app.activeStage < 3 && app.scenes[app.activeStage].keyUp(e))
      e.preventDefault();
  });
  // 키를 누른 채 창을 벗어나면 keyup 이 오지 않으므로 뗀 것으로 친다
  window.addEventListener("blur", () => {
    if (app.activeStage < 3) app.scenes[app.activeStage].keyUp({ key: " " });
  });
}

// 포인터 위치를 각 씬에 알려 주고(라이터 등), 커서 모양을 정한다
function updateHover() {
  const el = drawingContext.canvas;
  const hi = hover.x >= 0 ? panelAt(hover.x) : -1;
  app.scenes.forEach((s, i) => {
    s.hover = i === hi ? { x: hover.x - panelX(i), y: hover.y } : null;
  });
  let c = "default";
  if (drag) c = "grabbing";
  else if (hi >= 0 && hi === app.activeStage)
    c = app.scenes[hi].cursorAt(hover.x - panelX(hi), hover.y);
  if (el.style.cursor !== c) el.style.cursor = c;
}

// ---------------------------------------------------------------------
// 디버그 HUD
// ---------------------------------------------------------------------
function drawDebugHud(ctx, dt) {
  if (dt > 0) fpsSmooth += (1 / dt - fpsSmooth) * 0.05;
  const lines = [
    `fps ${fpsSmooth.toFixed(0)}  stage ${app.activeStage}  burn:${app.burnComplete} bury:${app.buryComplete} sink:${app.sinkComplete}  dark ${app.darkness.toFixed(2)}`,
    `panel ${LAYOUT.PW.toFixed(0)}×${LAYOUT.H}  gap ${LAYOUT.GAP.toFixed(1)}  S ${LAYOUT.S.toFixed(3)}`,
    ...app.scenes.map((s) => s.debugInfo()),
  ];
  ctx.save();
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(6, 6, 470, lines.length * 15 + 8);
  ctx.fillStyle = "#fff";
  lines.forEach((l, i) => ctx.fillText(l, 12, 22 + i * 15));
  ctx.restore();
}
