// =====================================================================
// CONFIG — 모든 튜닝 상수
//   · 패널 높이는 논리 730 으로 고정. 실제 캔버스와의 배율 S 는 draw 에서만 곱한다.
//   · 사방 여백을 균일하게 두기 위해 패널 폭(논리)은 창 비율에 따라 바뀐다.
//     → 현재 값은 sketch.js 의 LAYOUT 에 있다.
// =====================================================================

const CONFIG = {
  H: 730,

  // 흰 갤러리 벽 여백 (사방 동일): clamp(min, innerWidth * ratio, max)
  frame: { marginMin: 24, marginRatio: 0.04, marginMax: 60 },
  layout: {
    gapRatio: 0.33, // 패널 사이 간격 = 바깥 여백 × ratio
    gapMin: 8,
    gapMax: 20,
    panelMin: 300, // 패널 논리 폭 한계. 벗어나면 그 방향 여백만 넓어진다
    panelMax: 900,
    bagRefWidth: 560, // 패널이 이보다 좁으면 봉투를 비례해서 줄인다
    bagMinScale: 0.72,
  },
  maxPixelDensity: 2,

  font: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',

  // 기본 팔레트
  palette: {
    azul: "#322470",
    cafe: "#623F1B",
    amarelo: "#EDCC4D",
    vermelho: "#BB240A",
    areia: "#E5DBD1",
  },

  // 그라디언트용 파생색 (팔레트에서 명도/채도만 아주 조금 옮긴 값)
  tone: {
    // BURN
    burnTop: "#E2B347",
    burnMid: "#EAC34B",
    burnBottom: "#EDCC4D",
    flameRedLight: "#CB3413",
    flameRedDeep: "#A51F08",
    flameYellowLight: "#F4DB78",
    flameYellowDeep: "#E3BC3E",
    ash: ["#15100C", "#1F150E", "#2C1D10", "#3B2714", "#4B3218"],

    // BURY
    buryTop: "#3B2E84",
    buryBottom: "#2E2269",
    soilTop: "#6E4822",
    soilDeep: "#3E2811",
    soilBack: "#4B3015",

    // SINK
    sinkTop: "#EAE2D9",
    sinkBottom: "#DDD1C4",
    waterTop: "#5F5CAC",
    waterDeep: "#281D62",
    azulDeep: "#1F1650",

    // 봉투 속 쓰레기
    redLight: "#D2462A",
    yellowDeep: "#D6B03A",
    brownLight: "#8A6238",
    blueSoft: "#8C8FCB",
    blueMid: "#4E4AA6",
    blueCap: "#3A37A6",
    green: "#5C8A3C",
  },

  bag: { scale: 1.1 },

  grain: {
    tile: 320, // 반복 타일 크기 (px)
    overlayAlpha: 0.055, // 세 패널 전체
    objectAlpha: 0.075, // 봉투/흙/물/불 형태 안쪽
  },

  burn: {
    homeY: 0.52, // 봉투 몸통 중심 (패널 높이 비율) — 귀까지 포함하면 거의 정가운데
    duration: 1.9, // burnProgress 0 → 1 (초)
    ashRate: 70, // 연소 중 초당 재
    flameRate: 42, // 연소 중 그을림 경계에서 올라오는 불꽃 (초당)
    ashAfter: 3.5, // 완료 후에도 계속 떠다니는 재 (초당)
    maxAsh: 260,
    maxFlames: 90,
    maxSmoke: 12,
    // 라이터 (포인터 = 노즐 끝)
    lighter: {
      scale: 1.1,
      tilt: -0.35, // 몸통이 오른쪽 아래로 기운다
      flick: 0.35, // 헛클릭 때 불꽃이 켜져 있는 시간
      hold: 0.7, // 점화 후 불꽃을 대고 있는 시간
      leave: 0.7, // 그 뒤 빠지며 사라지는 시간
    },
  },

  bury: {
    homeY: 0.52, // 봉투 시작 위치. 흙 표면은 봉투 바닥에 맞춰진다
    camPad: 60, // 묻을수록 화면이 아래로 내려가 흙을 더 보여준다. 다 묻었을 때 봉투 바닥이 화면 아래에서 이만큼 위
    coverMargin: 22, // 매듭 끝이 표면 아래로 이만큼 내려가야 완전 매립
    columns: 31, // 흙 표면 높이맵 열 개수
    particles: 48, // Matter.js 흙 입자 수
    steps: 5, // 꾹 눌러 파고 → 떼서 덮기를 이만큼 반복하면 완전히 묻힌다 (누르는 시간은 Shovel.js 의 digTime)
    scoop: 9, // 한 삽에 떨어지는 흙 입자 수
    maxParticles: 140, // 흙 입자 총 상한
    maxSpeed: 420, // 봉투가 흙 속으로 들어가는 최대 속도 (px/s)
    dentRatio: 0.32, // 봉투 침투 깊이 대비 표면이 파이는 비율
    dentMax: 70,
    moundHeight: 12,
    settleTime: 0.9,
  },

  sink: {
    homeY: 0.52,
    levelY: 0.8, // 처음 수면
    levelMin: 0.33, // 수면이 올라올 수 있는 한계
    coupling: 0.6, // bag Y ↓ 1px 당 수면 ↑ 0.6px
    depthRatio: 0.25, // 봉투 중심이 수면 아래로 봉투 높이 × 이 비율 이상
    returnRatio: 0.25, // 조건 미충족 release 시 원위치 쪽으로 되돌아가는 비율
    floatTime: 1.25, // 손을 놓은 뒤 둥실거리는 시간
    fillTime: 3.2, // 봉투가 내려가며 물이 화면 끝까지 차오르는 시간
    fillLevel: -60, // 차오른 수면 (화면 위 바깥)
    feedY: 0.6, // 물고기가 뜯어 먹는 동안 봉투 높이
    fishCount: 4,
    fishSpeed: 125, // px/s
    bites: 12, // 이만큼 뜯기면 물고기와 봉투가 가라앉는다
    feedMax: 9, // 뜯어 먹는 최대 시간 (초)
    v0: 8, // 가라앉기 시작 속도 (px/s)
    accel: 20, // 가속 (px/s²)
    vMax: 120,
    splashAmp: 11,
    maxBubbles: 170,
    trailRate: 3, // 지나간 경로에서 초당 기포
    deepRate: 2.6, // 봉투가 사라진 뒤 바닥 너머에서 초당 기포
  },

  hint: {
    x: 26,
    y: 42,
    size: 11,
    tracking: 2.4,
    alpha: 0.6,
    delay: 0.7,
    fadeIn: 1.4,
    fadeOut: 0.7,
  },

  veil: { alpha: 0.1, fade: 0.9 }, // 아직 활성화되지 않은 패널

  // 지금 조작 중인 패널만 컬러, 나머지 두 패널은 흑백 (모션은 그대로)
  gray: { fade: 1.1 }, // 컬러 ↔ 흑백 전환 시간 (초)

  ending: {
    hold: 1.8, // 세 작업 완료 후 정적
    fade: 2.2, // 암전 시간
    overlay: 0.4, // 화면 전체 암전 목표 opacity (1 = 단색 검정)
    text: "DELETED?",
    textStart: 0.75, // 암전 진행도 75% 시점부터 타이핑
    typeMin: 0.11, // 글자 간격 (초)
    typeMax: 0.26,
    typePauseBefore: 0.45, // "?" 앞에서 잠깐 멈춤
    textSize: 34, // 논리 px (캔버스 배율을 따라간다)
    restartDelay: 1.2, // 타이핑이 끝나고 RESTART 가 나타나기까지
  },
};
