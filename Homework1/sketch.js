// =====================================================================
// Dynamic Balance — 태양계 모빌
// p5.js (전역 모드) + Matter.js 0.19
//
// 구조
//   1) CONFIG      : 모든 튜닝 상수
//   2) 유틸/수학    : 투영, 타원적분, 보간
//   3) 휠 빌더/보정 : x축 회전용 편심 무게추 휠 + 헤드리스 킥 보정
//   4) Orbit 클래스 : 궤도 1개 = 진자형 행성 + 보이지 않는 휠
//   4-b) SpringChain: 천장-태양-궤도들을 잇는 스프링 사슬 (모빌의 또잉~ 파동)
//   * 공전 별     : 행성이 한 바퀴 돌 때마다 배경에 같은 색 별이 하나씩 반짝이며 생긴다
//   5) Scheduler   : 이벤트 기반 타임라인 (스텝 단위)
//   6) 시뮬레이션   : 고정 스텝 누적기
//   7) 렌더        : 2.5D 투영, 깊이 정렬, 행성별 디테일
//   8) p5 진입점    : setup / draw / windowResized
// =====================================================================

// ---------------------------------------------------------------------
// 1) CONFIG
// ---------------------------------------------------------------------
const CONFIG = {
  // 물리 좌표계는 창 크기와 무관한 고정 유닛. 렌더 때만 scale 로 맵핑한다.
  outerRadius: 460,
  // scale = min(w,h) * viewFill / outerRadius
  // 0.486: 해왕성 궤도가 정면(원)을 향할 때도 궤도 + 행성(460 + 8.5)이 짧은 변의 99% 안에 들어오는 최대값
  viewFill: 0.486,

  step: {
    ms: 1000 / 60, // 고정 타임스텝 (어떤 기기에서도 같은 타임라인)
    maxFrameMs: 100, // 탭 복귀 등으로 프레임이 길어질 때 따라잡기 상한
  },

  // rigid constraint 오차를 줄이기 위해 기본값(6/4/2)보다 높임
  iterations: { position: 12, velocity: 10, constraint: 10 },

  colors: {
    bg: "#000000",
    warm: "#EFE6D2",
    blue: "#293379", // Blue Crate
    red: "#B81817", // Tomato Red
    yellow: "#E5A300", // Citrus Yellow
    lettuce: "#A6AF32", // Lettuce Green
    beans: "#607829", // Green Beans
    orange: "#EE7302", // Orange
  },

  sun: {
    radius: 34,
    rings: [
      { offset: 8, alpha: 0.55 },
      { offset: 16, alpha: 0.3 },
    ],
  },

  // 안쪽 → 바깥. radius = 행성 반경, orbit = 궤도 반경, period = 목표 공전주기(초)
  // 반경은 명세 초기값(5/9/10/7/24/20/14/13)에서 줄였다: 처음/마지막 장면에서 매달린 행성들이
  // 서로 겹치지 않고 한 줄로 떨어져 보이도록.
  // 행성은 테두리 없는 단색. 고리는 토성만. 같은 색은 바로 이웃한 궤도끼리만 피한다.
  planets: [
    { name: "mercury", orbit: 90, radius: 4.5, period: 5, fill: "warm" },
    { name: "venus", orbit: 145, radius: 8, period: 7, fill: "yellow" },
    { name: "earth", orbit: 200, radius: 9, period: 9, fill: "blue" },
    { name: "mars", orbit: 255, radius: 6.5, period: 11.5, fill: "orange" },
    { name: "jupiter", orbit: 310, radius: 14, period: 15, fill: "lettuce" },
    {
      name: "saturn",
      orbit: 365,
      radius: 10,
      period: 19,
      fill: "yellow",
      ring: true,
    },
    { name: "uranus", orbit: 415, radius: 9, period: 24, fill: "beans" },
    { name: "neptune", orbit: 460, radius: 8.5, period: 30, fill: "blue" },
  ],

  // 배경 별: 화면 좌표(0~1)에 흩뿌린 아주 작은 점. 일부만 가끔 짧게 반짝인다
  stars: {
    seed: 7, // 고정 시드 → 매번 같은 하늘
    density: 1 / 5500, // 화면 px² 당 개수 (1920×1080 ≈ 380개)
    maxCount: 900,
    radiusMin: 0.4, // px
    radiusMax: 0.95,
    alphaMin: 0.15, // 평소 밝기
    alphaMax: 0.55,
    twinkleRatio: 0.3, // 반짝이는 별의 비율
    periodMin: 5, // 반짝임 간격 (초)
    periodMax: 13,
    sharpness: 40, // 클수록 반짝임이 짧고 날카롭다
    flashAlpha: 0.95, // 반짝일 때 최대 밝기
    flashGrow: 0.8, // 반짝일 때 반경 증가율
    fadeSeconds: 10, // 마지막 장면 시작 후 반짝임이 잦아드는 시간
    twinkleAfterEnd: false, // true 면 모빌이 멈춘 뒤에도 별은 계속 반짝인다 (완전 정지 조건과 충돌)
  },

  orbit: {
    // 기본 기울기 alpha_i = tiltBase + tiltAmp * sin(i * tiltFreq)
    // 명세값(0.36, 0.06, 1.7)은 토성·해왕성의 바닥 높이가 거의 같아 매달린 상태에서 겹친다.
    // 주파수를 낮춰 바깥으로 갈수록 조금씩 더 기울게(17.8° → 26.8°) → 행성이 위에서 아래로 차례로 매달린다.
    tiltBase: 0.31,
    tiltAmp: 0.16,
    tiltFreq: 0.2,
    samples: 180, // 궤도 폴리라인 샘플 수
    alphaBack: 0.22, // z < 0 (뒤쪽 호)
    alphaFront: 0.6, // z >= 0 (앞쪽 호)
    depthBlend: 0.05, // 앞/뒤 알파 전환 폭(z/r). 0이면 경계에서 딱 끊긴다
    sizeDepth: 0.1, // 행성 크기 배율 s = 1 + sizeDepth * (z / r)
    lineRef: 900, // 이 min(w,h)에서 선 굵기 1
    lineMin: 0.75,
    lineMax: 1.25,
  },

  planetPhysics: {
    speedRatio: 1.55, // 궤도 바닥/꼭대기 속도비 (1.4~1.7). 클수록 위에서 더 멈칫한다
    massPerArea: 0.01, // mass = massPerArea * R^2 (무게 속성)
    governorMax: 0.002, // 에너지 거버너: 1스텝당 접선속도 보정 한도 (0.2%)
  },

  wheel: {
    pinX: 6000, // 화면과 무관한 먼 좌표
    pinSpacing: 400, // 궤도별 x 오프셋 (휠끼리 겹치지 않게)
    radius: 40,
    weightOffset: 30, // 무게추: 중심에서 +y 로 30
    weightRadius: 7,
    wheelDensity: 0.001,
    weightDensity: 0.03, // 무게추를 휠보다 훨씬 무겁게 → 편심
    variation: 0.1, // 궤도별 무게추 질량/오프셋 ±10%
    turnSeconds: 3.0, // 킥 후 한 바퀴(2π) 목표 시간 — 헤드리스 보정으로 맞춤
    speedRatio: 2.0, // 휠 바닥/꼭대기 각속도비 → 회전 속도 불균일 (뒤집힌 순간이 잠시 머문다)
    completeMargin: 0.15, // theta >= 2π - 0.15 에서 '회전 완료'
    // 완료 후 감쇠: 처음엔 강하게(넘어가는 폭을 줄임) → blend 초에 걸쳐 약하게(몇 번 출렁이게)
    settleFrictionAir: 0.06,
    settleFrictionEnd: 0.012,
    settleBlend: 1.2,
    stopOmega: 0.0006, // 정지 판정 |각속도| (rad/step)
    stopAngle: 0.003, // 정지 판정 |theta - 2π| (rad). 작을수록 스냅이 안 보인다
  },

  // 모빌: 천장 → 태양 → 궤도0 → … → 궤도7 을 잇는 보이지 않는 스프링 사슬.
  // 주기적으로 태양을 아래로 튕기면 충격이 스프링을 타고 안쪽 궤도부터 바깥 궤도로 전해진다(또잉~).
  // 각 궤도는 행성과 함께 자기 마디의 세로 변위만큼 위아래로 출렁인다.
  mobile: {
    x: -6000, // 화면과 무관한 먼 좌표 (휠과 겹치지 않게)
    spacing: 60, // 사슬 마디 간격 (보이지 않음, 유닛)
    // 태양은 무겁고 바깥 마디일수록 가볍게: 파동이 퍼지며 약해지는 것을 채찍처럼 보상해
    // 바깥 궤도까지 출렁임이 또렷하게 전해진다 (폭 ≈ 태양 15 → 중간 6 → 해왕성 8 유닛)
    sunMass: 6,
    ringMass: 1, // 궤도 i 마디 질량 = ringMass * (1 + ringMassGrow * i)
    ringMassGrow: -0.1,
    // Matter 는 한 스텝에 제약을 (반복 10회 × 2패스) 풀기 때문에 체감 강성이 커서 아주 작은 값을 쓴다
    stringStiffness: 0.0006, // 천장-태양 스프링의 탄성 (보이지 않음)
    linkStiffness: 0.0008, // 궤도 사이 스프링 탄성. 작을수록 파동이 느리게 퍼진다 (현재 안→밖 ≈ 1.1초)
    linkDamping: 0.01,
    frictionAir: 0.012, // 다음 파동 전까지 잦아들게 (≈ 8초면 거의 정지)
    kick: 300, // 태양을 아래로 튕기는 속도 (units/s). 출렁임 폭에 비례
    firstAt: 6.0, // 첫 파동 (초)
    interval: 15.0, // 파동 간격 (초). 마지막 장면이 시작되면 더 이상 튕기지 않는다
    stopSpeed: 0.2, // 정지 판정 (units/s)
    stopOffset: 0.05, // 정지 판정 (units)
  },

  // 공전 별: 행성이 한 바퀴 돌 때마다 배경에 같은 색 별이 하나씩 생긴다.
  // 생길 때 한 번 반짝(코어가 커졌다 돌아오고 얇은 링이 퍼져 사라짐) → 이후 은은하게 숨 쉬듯 빛난다.
  // 빛 번짐도 블러/그라데이션 없이 플랫한 반투명 원 3겹으로 표현.
  lapStars: {
    seed: 23, // 고정 시드 → 매번 같은 위치
    sizeRatio: 0.35, // 별 코어 반경 = 행성 반경 × 0.35 (행성 크기 차이에 비례)
    // 위치: 후보 candidates 개 중 기존 별들과 가장 멀리 떨어진 곳 (best-candidate 샘플링)
    candidates: 24,
    minGap: 0.09, // 이보다 가까우면(짧은 변 대비) 후보를 더 뽑는다
    edgeMargin: 0.04, // 화면 가장자리 여백 (짧은 변 대비)
    avoidMobile: true, // 정지 상태의 궤도 타원 안쪽은 피한다 (공전 중인 행성과 헷갈리지 않게)
    halo: [
      // 코어 반경 대비 크기와 밝기 — 바깥으로 갈수록 옅게
      { size: 1.7, alpha: 0.2 },
      { size: 2.6, alpha: 0.09 },
      { size: 3.8, alpha: 0.04 },
    ],
    breathe: 0.35, // 은은한 밝기 변화 폭 (0~1)
    breathePeriod: [4, 9], // 숨 쉬는 주기 범위 (초)
    flashSeconds: 1.4, // 생길 때 반짝임 지속 시간
    flashGrow: 0.9, // 반짝일 때 코어가 커지는 비율
    flashHalo: 3.0, // 반짝일 때 빛 번짐이 밝아지는 배수
    ringReach: 7, // 퍼지는 링의 최종 반경 (코어 대비)
    ringAlpha: 0.7,
  },

  timeline: {
    hangSeconds: 2.0, // 처음 상태: 매달린 채 정지
    firstTurnAt: 10.0, // 수성 궤도 회전 시작
    turnGap: 5.0, // 이전 궤도 회전 완료 → 다음 궤도 시작까지
    finaleDelay: 5.0, // 마지막 회전 완료 → 마지막 장면 시작까지
    finaleStagger: 0.4, // 궤도별 감쇠 시작 간격 (안쪽부터)
    finaleRamp: 7.0, // 중력/감쇠를 서서히 올리는 시간
  },

  finale: {
    // 공전용 중력은 궤도가 한 바퀴 돌 만큼 약해서 그대로는 흔들림 주기가 수십 초가 된다.
    // 마지막 장면에서는 모든 행성에 같은 '실제 모빌' 중력을 걸어 몇 초 안에 흔들리다 서게 한다.
    // (진자 주기 ∝ √r 이라 안쪽 행성이 먼저 멈춘다)
    gravity: 1150,
    frictionAir: 0.035,
    stopSpeed: 0.6, // units/s
    stopAngle: 0.0015, // 바닥에서의 각도 오차 (rad)
  },
};

// Matter 별칭 (Matter 로드 후 bindMatter 에서 채움 — 편집기에 sketch.js만 붙여도 동작하도록)
let Engine, Bodies, Body, Composite, Constraint;
const MATTER_CDN =
  "https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js";

// ---------------------------------------------------------------------
// 2) 유틸 / 수학
// ---------------------------------------------------------------------
const TURN = Math.PI * 2;
const STEP_SEC = CONFIG.step.ms / 1000;
// Matter 0.19: Δv(스텝당) = F/m * Δt_ms^2  →  가속도 a(units/s^2)를 주려면 F = m * a * FORCE_UNIT
const FORCE_UNIT = (STEP_SEC * STEP_SEC) / (CONFIG.step.ms * CONFIG.step.ms);

const secToSteps = (s) => Math.round(s / STEP_SEC);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

// 제1종 완전타원적분 K(m) (AGM). 진자의 '돌아가는' 운동 주기를 해석적으로 구하는 데 쓴다.
function ellipticK(m) {
  let a = 1;
  let b = Math.sqrt(1 - m);
  for (let i = 0; i < 12; i++) {
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
  }
  return Math.PI / (2 * a);
}

// 바닥/꼭대기 속도비 k 와 주기 T 로부터 강체 진자 파라미터를 역산
//   v^2(φ) = V^2 - 2 g r (1 - cos φ),  v_top^2 = V^2 - 4 g r,  k = V / v_top
//   → T = (r / V) * 4 K(m),  m = 1 - 1/k^2,  g = V^2 m / (4 r)
function rotorParams(radius, period, ratio) {
  const m = 1 - 1 / (ratio * ratio);
  const V = (radius * 4 * ellipticK(m)) / period;
  const g = (V * V * m) / (4 * radius);
  return { V, g };
}

// 궤도 평면 (u, v) → 화면 (x, y) + 깊이 z.  x축 회전각 = tilt + theta
function project(u, v, ang) {
  return { x: u, y: v * Math.sin(ang), z: v * Math.cos(ang) };
}

function readParams() {
  const q = new URLSearchParams(
    (typeof window !== "undefined" &&
      window.location &&
      window.location.search) ||
      "",
  );
  const speed = parseFloat(q.get("speed"));
  return {
    speed: isFinite(speed) && speed > 0 ? speed : 1,
    debug: q.get("debug") === "1",
  };
}

function bindMatter() {
  ({ Engine, Bodies, Body, Composite, Constraint } = Matter);
}

function createEngine() {
  const engine = Engine.create();
  // 중력은 궤도/휠마다 달라야 하므로 전역 중력은 끄고 applyForce 로 직접 건다
  engine.gravity.x = 0;
  engine.gravity.y = 0;
  engine.gravity.scale = 0;
  engine.positionIterations = CONFIG.iterations.position;
  engine.velocityIterations = CONFIG.iterations.velocity;
  engine.constraintIterations = CONFIG.iterations.constraint;
  return engine;
}

// 서로 충돌하지 않게: 상호작용은 constraint 와 중력뿐
const NO_COLLIDE = { group: 0, category: 0x0001, mask: 0 };

// ---------------------------------------------------------------------
// 3) 편심 무게추 휠
// ---------------------------------------------------------------------
// 궤도 i 의 무게추 편차 (결정적: 매번 같은 값)
function wheelVariant(i) {
  const v = CONFIG.wheel.variation;
  return {
    mass: 1 + v * Math.sin(i * 2.3 + 0.7),
    offset: 1 + v * Math.cos(i * 1.9 + 0.3),
  };
}

// 휠 1개 생성: static pin + compound body(원판 + 무게추) + length 0 핀 조인트
function buildWheel(i, world) {
  const W = CONFIG.wheel;
  const vr = wheelVariant(i);
  const px = W.pinX + i * W.pinSpacing;
  const py = 0;

  const pin = Bodies.circle(px, py, 2, {
    isStatic: true,
    collisionFilter: NO_COLLIDE,
  });
  const disc = Bodies.circle(px, py, W.radius, {
    density: W.wheelDensity,
    collisionFilter: NO_COLLIDE,
  });
  const weight = Bodies.circle(
    px,
    py + W.weightOffset * vr.offset,
    W.weightRadius,
    {
      density: W.weightDensity * vr.mass,
      collisionFilter: NO_COLLIDE,
    },
  );
  const wheel = Body.create({
    parts: [disc, weight],
    frictionAir: 0,
    collisionFilter: NO_COLLIDE,
  });

  // compound 의 position 은 질량중심. 핀은 원판 중심에 걸어야 하므로 pointB 로 오프셋
  const joint = Constraint.create({
    bodyA: pin,
    pointA: { x: 0, y: 0 },
    bodyB: wheel,
    pointB: { x: px - wheel.position.x, y: py - wheel.position.y },
    length: 0,
    stiffness: 1,
    damping: 0,
  });

  Composite.add(world, [pin, wheel, joint]);

  const d = Math.hypot(wheel.position.x - px, wheel.position.y - py); // 핀 → 질량중심
  const inertiaPin = wheel.inertia + wheel.mass * d * d;
  return { pin, wheel, joint, pinPos: { x: px, y: py }, d, inertiaPin };
}

// 킥: 각속도와 함께 질량중심의 접선 속도도 맞춰 준다 (핀 조인트가 첫 스텝에 에너지를 먹지 않게)
function kickWheel(w, omegaPerStep) {
  const dx = w.wheel.position.x - w.pinPos.x;
  const dy = w.wheel.position.y - w.pinPos.y;
  Body.setAngularVelocity(w.wheel, omegaPerStep);
  Body.setVelocity(w.wheel, { x: -omegaPerStep * dy, y: omegaPerStep * dx });
}

function applyWheelGravity(w, g) {
  Body.applyForce(w.wheel, w.wheel.position, {
    x: 0,
    y: w.wheel.mass * g * FORCE_UNIT,
  });
}

// 헤드리스: 킥 후 theta 가 2π 에 도달하는 시간(초, 스텝 사이 보간)
function measureWheelTurn(i, g, omegaPerSec) {
  const engine = createEngine();
  const w = buildWheel(i, engine.world);
  kickWheel(w, omegaPerSec * STEP_SEC);
  let prev = w.wheel.angle;
  const limit = secToSteps(12);
  for (let s = 1; s <= limit; s++) {
    applyWheelGravity(w, g);
    Engine.update(engine, CONFIG.step.ms);
    const a = w.wheel.angle;
    if (a >= TURN) return (s - 1 + (TURN - prev) / (a - prev)) * STEP_SEC;
    if (a < prev) return Infinity; // 꼭대기를 못 넘고 되돌아옴
    prev = a;
  }
  return Infinity;
}

// 헤드리스: 킥 후 꼭대기(θ=π)에서의 각속도 (rad/s)
function measureWheelTop(i, g, omegaPerSec) {
  const engine = createEngine();
  const w = buildWheel(i, engine.world);
  kickWheel(w, omegaPerSec * STEP_SEC);
  for (let s = 0; s < secToSteps(12); s++) {
    applyWheelGravity(w, g);
    Engine.update(engine, CONFIG.step.ms);
    if (w.wheel.angle >= Math.PI)
      return Body.getAngularVelocity(w.wheel) / STEP_SEC;
  }
  return 0;
}

// 휠 중력 + 킥 각속도 결정.
//   ω_top² = ω0² - c·g 인 물리 진자. Matter 의 compound 관성/핀 조인트 처리 때문에 c 를 식으로
//   구하면 어긋나므로 헤드리스 프로브로 유효 c 를 잰다.
//   1) 속도비 k 와 시간 T 로 ω0, g 초기값 역산 (T = 4K(m)/ω0, c·g = ω0² m)
//   2) ω0 를 헤드리스 시뮬레이션으로 보정 (T ∝ 1/ω 가정한 반복)
//   3) 실측 속도비가 목표와 다르면 g 를 고쳐 1)~2) 반복
function calibrateWheel(i) {
  const W = CONFIG.wheel;
  const m = 1 - 1 / (W.speedRatio * W.speedRatio);
  let omega = (4 * ellipticK(m)) / W.turnSeconds;

  const gProbe = 50;
  const wProbe = 2 * omega;
  const top = measureWheelTop(i, gProbe, wProbe);
  const c = (wProbe * wProbe - top * top) / gProbe;
  let g = (omega * omega * m) / c;

  let t = Infinity;
  let ratio = 1;
  for (let outer = 0; outer < 4; outer++) {
    t = measureWheelTurn(i, g, omega);
    for (let k = 0; k < 8 && !(Math.abs(t - W.turnSeconds) < 0.002); k++) {
      omega *= isFinite(t) ? t / W.turnSeconds : 1.1;
      t = measureWheelTurn(i, g, omega);
    }
    ratio = omega / measureWheelTop(i, g, omega);
    if (outer === 3 || Math.abs(ratio - W.speedRatio) < 0.06) break;
    const mMeas = 1 - 1 / (ratio * ratio);
    g *= Math.min(1.6, m / mMeas);
  }
  return { g, omega, turn: t, ratio };
}

// ---------------------------------------------------------------------
// 4) Orbit
// ---------------------------------------------------------------------
// 휠 상태: WAITING → ROTATING → SETTLING → DONE
// 행성 상태: HANGING → ORBITING → DAMPING → RESTING
class Orbit {
  constructor(i, def) {
    this.i = i;
    this.def = def;
    this.r = def.orbit;
    this.R = def.radius;
    this.tilt =
      CONFIG.orbit.tiltBase +
      CONFIG.orbit.tiltAmp * Math.sin(i * CONFIG.orbit.tiltFreq);

    // 목표 주기와 속도비로 진자 파라미터 역산
    const p = rotorParams(this.r, def.period, CONFIG.planetPhysics.speedRatio);
    this.V = p.V; // 바닥 속도 (units/s)
    this.g0 = p.g; // 공전용 궤도 중력 (units/s^2)
    this.g = 0; // 현재 적용 중력
    this.energy = 0.5 * this.V * this.V - this.g0 * this.r; // 단위질량 기계적 에너지 목표

    this.state = "WAITING";
    this.phase = "HANGING";
    this.theta = 0;
    this.prevTheta = 0;
    this.phi = Math.PI / 2; // 행성 각도 (u = r cos φ, v = r sin φ), 누적
    this.prevPhi = this.phi;

    // 기록용
    this.lapStartStep = -1;
    this.lapStartPhi = 0;
    this.laps = [];
    this.turnStartStep = -1;
    this.dampStartStep = -1;
  }

  build(world, wheelCal) {
    // 태양 위치의 static anchor + 길이 r 의 강체 막대
    this.anchor = Bodies.circle(0, 0, 2, {
      isStatic: true,
      collisionFilter: NO_COLLIDE,
    });
    this.planet = Bodies.circle(0, this.r, this.R, {
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      restitution: 0,
      collisionFilter: NO_COLLIDE,
    });
    Body.setMass(
      this.planet,
      CONFIG.planetPhysics.massPerArea * this.R * this.R,
    );
    this.rod = Constraint.create({
      bodyA: this.anchor,
      bodyB: this.planet,
      length: this.r,
      stiffness: 1,
      damping: 0,
    });
    Composite.add(world, [this.anchor, this.planet, this.rod]);
    // 처음 상태: 바닥에 매달린 채 고정
    Body.setStatic(this.planet, true);

    this.w = buildWheel(this.i, world);
    this.wheelG = wheelCal.g;
    this.wheelOmega = wheelCal.omega;
    this.wheelTurnPredicted = wheelCal.turn;
    this.wheelRatio = wheelCal.ratio;
  }

  // --- 이벤트 ---
  release(step) {
    Body.setStatic(this.planet, false);
    Body.setPosition(this.planet, { x: 0, y: this.r });
    // 앞쪽(바닥) 호에서 왼쪽 → 오른쪽 (+u)
    Body.setVelocity(this.planet, { x: this.V * STEP_SEC, y: 0 });
    this.g = this.g0;
    this.phase = "ORBITING";
    this.lapStartStep = step;
    this.lapStartPhi = this.phi;
  }

  startTurn(step) {
    this.state = "ROTATING";
    this.turnStartStep = step;
    kickWheel(this.w, this.wheelOmega * STEP_SEC);
  }

  startDamping(step) {
    this.phase = "DAMPING";
    this.dampStartStep = step;
  }

  // --- 매 스텝: Engine.update 전 ---
  applyForces(step) {
    if (this.phase === "DAMPING") {
      // 마지막 장면: 거버너 OFF, 중력과 공기저항을 서서히 올린다
      const e = smooth01(
        (step - this.dampStartStep) / secToSteps(CONFIG.timeline.finaleRamp),
      );
      this.g = mix(this.g0, CONFIG.finale.gravity, e * e);
      this.planet.frictionAir = CONFIG.finale.frictionAir * e;
    }
    if (this.phase === "ORBITING" || this.phase === "DAMPING") {
      Body.applyForce(this.planet, this.planet.position, {
        x: 0,
        y: this.planet.mass * this.g * FORCE_UNIT,
      });
    }
    if (this.state === "ROTATING" || this.state === "SETTLING")
      applyWheelGravity(this.w, this.wheelG);
  }

  // --- 매 스텝: Engine.update 후. 반환값: 발생한 이벤트 이름 배열 ---
  afterStep(step) {
    const events = [];
    this.prevPhi = this.phi;
    this.prevTheta = this.theta;

    if (this.phase === "ORBITING" || this.phase === "DAMPING")
      this.correctPlanet(step, events);
    if (this.state === "ROTATING" || this.state === "SETTLING")
      this.updateWheel(step, events);
    return events;
  }

  // 수치 드리프트 보정: (a) 반경 사영 (b) 반경 속도 제거 (c) 에너지 거버너
  correctPlanet(step, events) {
    const b = this.planet;
    const px = b.position.x;
    const py = b.position.y;
    const len = Math.hypot(px, py) || 1;
    const nx = px / len;
    const ny = py / len;
    const tx = -ny;
    const ty = nx;

    const vel = Body.getVelocity(b); // units/step
    let vt = vel.x * tx + vel.y * ty; // 접선 성분만 남김

    if (this.phase === "ORBITING") {
      // 목표 에너지에서의 속력: ½v² - g y = E0  (y 는 +v 방향 = 궤도 평면의 아래)
      const y = this.r * ny;
      const target =
        Math.sqrt(Math.max(0, 2 * (this.energy + this.g0 * y))) * STEP_SEC;
      const cur = Math.abs(vt);
      if (cur > 1e-9) {
        const lim = CONFIG.planetPhysics.governorMax;
        const s = Math.min(1 + lim, Math.max(1 - lim, target / cur));
        vt *= s;
      }
    }

    Body.setPosition(b, { x: this.r * nx, y: this.r * ny }, false);
    Body.setVelocity(b, { x: tx * vt, y: ty * vt });

    // 누적 각도 (렌더 보간 + 주기 측정)
    const a = Math.atan2(ny, nx);
    let d = a - wrapAngle(this.phi);
    if (d > Math.PI) d -= TURN;
    if (d < -Math.PI) d += TURN;
    this.phi += d;

    if (
      this.phase === "ORBITING" &&
      Math.abs(this.phi - this.lapStartPhi) >= TURN
    ) {
      const secs = (step - this.lapStartStep) * STEP_SEC;
      this.laps.push(secs);
      this.lapStartStep = step;
      this.lapStartPhi += Math.sign(this.phi - this.lapStartPhi) * TURN;
      events.push("lap");
    }

    if (this.phase === "DAMPING") {
      const speed = Math.abs(vt) / STEP_SEC;
      const off = Math.abs(wrapAngle(this.phi - Math.PI / 2));
      const e =
        (step - this.dampStartStep) / secToSteps(CONFIG.timeline.finaleRamp);
      if (
        e > 0.5 &&
        speed < CONFIG.finale.stopSpeed &&
        off < CONFIG.finale.stopAngle
      ) {
        // 궤도 바닥으로 스냅하고 고정
        Body.setPosition(b, { x: 0, y: this.r }, false);
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setStatic(b, true);
        this.phi =
          Math.PI / 2 + Math.round((this.phi - Math.PI / 2) / TURN) * TURN;
        this.prevPhi = this.phi;
        this.phase = "RESTING";
        events.push("rest");
      }
    }
  }

  updateWheel(step, events) {
    const W = CONFIG.wheel;
    const wb = this.w.wheel;
    this.theta = wb.angle; // Matter 의 angle 은 연속 누적 → unwrap 불필요

    if (this.state === "ROTATING" && this.theta >= TURN - W.completeMargin) {
      // 회전 완료: 다음 궤도 예약의 기준. 감쇠를 걸어 평형(2π)을 지나 출렁이다 서게 한다
      this.state = "SETTLING";
      this.settleStartStep = step;
      wb.frictionAir = W.settleFrictionAir;
      events.push("turnComplete");
    } else if (this.state === "SETTLING") {
      const e = smooth01(
        (step - this.settleStartStep) / secToSteps(W.settleBlend),
      );
      wb.frictionAir = mix(W.settleFrictionAir, W.settleFrictionEnd, e);
    }
    if (
      this.state === "SETTLING" &&
      Math.abs(Body.getAngularVelocity(wb)) < W.stopOmega &&
      Math.abs(this.theta - TURN) < W.stopAngle
    ) {
      Body.setStatic(wb, true);
      this.theta = 0; // 2π ≡ 0 : 원래 기울기로 스냅
      this.prevTheta = 0;
      this.state = "DONE";
      events.push("wheelDone");
    }
  }
}

function wrapAngle(a) {
  return a - TURN * Math.floor((a + Math.PI) / TURN);
}

// ---------------------------------------------------------------------
// 4-b) SpringChain — 모빌의 세로 출렁임 (또잉~ 파동)
// ---------------------------------------------------------------------
// 마디 0 = 태양, 마디 i+1 = 궤도 i. 중력 없이 스프링 길이 = 초기 간격이므로 정지 상태가 곧 평형이다.
class SpringChain {
  build(world) {
    const M = CONFIG.mobile;
    this.ceiling = Bodies.circle(M.x, 0, 2, {
      isStatic: true,
      collisionFilter: NO_COLLIDE,
    });
    Composite.add(world, this.ceiling);
    this.nodes = [];
    this.rest = [];
    let prev = this.ceiling;
    for (let k = 0; k <= CONFIG.planets.length; k++) {
      const y = (k + 1) * M.spacing;
      const b = Bodies.circle(M.x, y, 4, {
        frictionAir: M.frictionAir,
        collisionFilter: NO_COLLIDE,
      });
      Body.setMass(
        b,
        k === 0 ? M.sunMass : M.ringMass * (1 + M.ringMassGrow * (k - 1)),
      );
      const spring = Constraint.create({
        bodyA: prev,
        bodyB: b,
        length: M.spacing,
        stiffness: k === 0 ? M.stringStiffness : M.linkStiffness,
        damping: M.linkDamping,
      });
      Composite.add(world, [b, spring]);
      this.nodes.push(b);
      this.rest.push(y);
      prev = b;
    }
    this.offset = this.rest.map(() => 0);
    this.prevOffset = this.offset.slice();
    this.done = false;
    this.waves = 0;
  }

  // 태양을 아래로 튕긴다
  kick() {
    Body.setVelocity(this.nodes[0], { x: 0, y: CONFIG.mobile.kick * STEP_SEC });
    this.waves++;
  }

  afterStep(finaleStarted) {
    this.prevOffset = this.offset.slice();
    if (this.done) return false;
    const M = CONFIG.mobile;
    let maxV = 0;
    let maxD = 0;
    this.nodes.forEach((b, k) => {
      // 세로로만 움직이게: 수치 오차로 생기는 옆 흔들림 제거
      const vy = Body.getVelocity(b).y;
      Body.setPosition(b, { x: M.x, y: b.position.y }, false);
      Body.setVelocity(b, { x: 0, y: vy });
      this.offset[k] = b.position.y - this.rest[k];
      maxV = Math.max(maxV, Math.abs(vy) / STEP_SEC);
      maxD = Math.max(maxD, Math.abs(this.offset[k]));
    });
    // 마지막 장면에서 완전히 잦아들면 평형으로 스냅하고 고정
    if (finaleStarted && maxV < M.stopSpeed && maxD < M.stopOffset) {
      this.nodes.forEach((b, k) => {
        Body.setPosition(b, { x: M.x, y: this.rest[k] }, false);
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setStatic(b, true);
        this.offset[k] = 0;
      });
      this.prevOffset = this.offset.slice();
      this.done = true;
      return true;
    }
    return false;
  }

  // 렌더용 보간 변위 (유닛)
  at(k, alpha) {
    return mix(this.prevOffset[k], this.offset[k], alpha);
  }
}

// ---------------------------------------------------------------------
// 5) Scheduler — 시간은 전부 스텝 수. 하드코딩된 절대 시각 대신 이벤트에서 예약한다
// ---------------------------------------------------------------------
class Scheduler {
  constructor() {
    this.queue = [];
  }
  at(step, label, fn) {
    this.queue.push({ step, label, fn });
    this.queue.sort((a, b) => a.step - b.step);
  }
  after(now, seconds, label, fn) {
    this.at(now + secToSteps(seconds), label, fn);
  }
  run(step) {
    while (this.queue.length && this.queue[0].step <= step)
      this.queue.shift().fn(step);
  }
}

// ---------------------------------------------------------------------
// 6) 시뮬레이션
// ---------------------------------------------------------------------
let sim = null;
let params = { speed: 1, debug: false };

function debugLog(...args) {
  if (params.debug) console.log(...args);
}

function createSimulation() {
  const engine = createEngine();
  const orbits = CONFIG.planets.map((def, i) => new Orbit(i, def));
  orbits.forEach((o) => o.build(engine.world, calibrateWheel(o.i)));
  const chain = new SpringChain();
  chain.build(engine.world);

  const s = {
    engine,
    orbits,
    chain,
    lapStars: [], // 한 바퀴마다 생기는 행성 색 별 { def, x, y (0~1), born, phase }
    lapRand: seededRandom(CONFIG.lapStars.seed),
    scheduler: new Scheduler(),
    step: 0,
    acc: 0,
    finished: false,
    finaleStarted: false,
  };
  const T = CONFIG.timeline;
  const sc = s.scheduler;

  // 1) 처음 상태 → 2) 동시 해제
  sc.at(secToSteps(T.hangSeconds), "release", (step) => {
    orbits.forEach((o) => o.release(step));
    debugLog(`[${fmt(step)}] release`);
  });
  // 3) 첫 x축 회전
  sc.at(secToSteps(T.firstTurnAt), "turn 0", (step) => beginTurn(s, 0, step));
  // 또잉~ 파동: 한 번 튕길 때마다 다음 파동을 예약. 마지막 장면부터는 멈춘다
  const wave = (step) => {
    if (s.finaleStarted) return;
    chain.kick();
    debugLog(`[${fmt(step)}] wave ${chain.waves}`);
    sc.after(step, CONFIG.mobile.interval, "wave", wave);
  };
  sc.at(secToSteps(CONFIG.mobile.firstAt), "wave", wave);

  orbits.forEach((o) => {
    debugLog(
      `orbit ${o.i} ${o.def.name}: V=${o.V.toFixed(2)} u/s, g=${o.g0.toFixed(3)} u/s², ` +
        `wheel g=${o.wheelG.toFixed(2)}, ω0=${o.wheelOmega.toFixed(3)} rad/s (headless turn ${o.wheelTurnPredicted.toFixed(3)}s, bottom/top ${o.wheelRatio.toFixed(2)})`,
    );
  });
  return s;
}

function beginTurn(s, i, step) {
  s.orbits[i].startTurn(step);
  debugLog(`[${fmt(step)}] orbit ${i} turn start`);
}

// 궤도 이벤트 → 다음 일정 예약
function handleEvent(s, o, ev, step) {
  const T = CONFIG.timeline;
  if (ev === "lap") {
    const n = o.laps.length;
    const avg = o.laps.reduce((a, b) => a + b, 0) / n;
    debugLog(
      `[${fmt(step)}] orbit ${o.i} lap ${n}: ${o.laps[n - 1].toFixed(3)}s (avg ${avg.toFixed(3)}s, target ${o.def.period}s)`,
    );
    // 한 바퀴 → 배경에 같은 색 별 하나
    addLapStar(s, o.def, step);
  } else if (ev === "turnComplete") {
    const dur = (step - o.turnStartStep) * STEP_SEC;
    debugLog(`[${fmt(step)}] orbit ${o.i} turn complete — ${dur.toFixed(3)}s`);
    const next = o.i + 1;
    if (next < s.orbits.length) {
      s.scheduler.after(step, T.turnGap, `turn ${next}`, (st) =>
        beginTurn(s, next, st),
      );
    } else {
      s.scheduler.after(step, T.finaleDelay, "finale", (st) =>
        beginFinale(s, st),
      );
    }
  } else if (ev === "wheelDone") {
    debugLog(
      `[${fmt(step)}] orbit ${o.i} wheel settled (${((step - o.turnStartStep) * STEP_SEC).toFixed(3)}s after kick)`,
    );
  } else if (ev === "rest") {
    debugLog(`[${fmt(step)}] orbit ${o.i} planet at rest`);
  }
}

// 마지막 장면: 안쪽부터 0.4초 간격으로 감쇠 시작
function beginFinale(s, step) {
  s.finaleStarted = true;
  s.finaleStep = step;
  debugLog(`[${fmt(step)}] finale`);
  s.orbits.forEach((o) => {
    s.scheduler.after(
      step,
      CONFIG.timeline.finaleStagger * o.i,
      `damp ${o.i}`,
      (st) => o.startDamping(st),
    );
  });
}

function stepSimulation(s) {
  if (s.finished) return;
  s.step++;
  s.scheduler.run(s.step);
  for (const o of s.orbits) o.applyForces(s.step);
  Engine.update(s.engine, CONFIG.step.ms);
  for (const o of s.orbits) {
    for (const ev of o.afterStep(s.step)) handleEvent(s, o, ev, s.step);
  }
  if (s.chain.afterStep(s.finaleStarted))
    debugLog(`[${fmt(s.step)}] mobile springs at rest`);
  if (
    s.finaleStarted &&
    s.chain.done &&
    s.orbits.every((o) => o.phase === "RESTING" && o.state === "DONE")
  ) {
    s.finished = true;
    debugLog(`[${fmt(s.step)}] finished — simulation stopped`);
  }
}

function fmt(step) {
  return (step * STEP_SEC).toFixed(2) + "s";
}

// ---------------------------------------------------------------------
// 7) 렌더
// ---------------------------------------------------------------------
let rgb = {}; // 팔레트 → [r,g,b]
let view = { scale: 1, cx: 0, cy: 0, lw: 1 };
let ringUnit = []; // 궤도 샘플용 단위원

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function setStroke(name, a) {
  const c = rgb[name];
  stroke(c[0], c[1], c[2], a * 255);
}

function setFill(name, a = 1) {
  const c = rgb[name];
  fill(c[0], c[1], c[2], a * 255);
}

function updateView() {
  const m = Math.min(width, height);
  view.scale = (m * CONFIG.viewFill) / CONFIG.outerRadius;
  view.cx = width / 2;
  view.cy = height / 2;
  view.lw = Math.min(
    CONFIG.orbit.lineMax,
    Math.max(CONFIG.orbit.lineMin, m / CONFIG.orbit.lineRef),
  );
}

function depthAlpha(zn) {
  const O = CONFIG.orbit;
  if (O.depthBlend <= 0) return zn < 0 ? O.alphaBack : O.alphaFront;
  return mix(
    O.alphaBack,
    O.alphaFront,
    smooth01((zn + O.depthBlend) / (2 * O.depthBlend)),
  );
}

// 궤도 원을 N 점으로 샘플링해 투영 (ellipse() 대신 — theta 로 납작해지고 뒤집히는 모습을 그대로)
// cy: 이 궤도의 화면 중심 y (모빌 스프링의 출렁임만큼 내려가 있다)
function projectOrbit(o, ang, cy) {
  const pts = new Array(ringUnit.length);
  for (let k = 0; k < ringUnit.length; k++) {
    const p = project(o.r * ringUnit[k][0], o.r * ringUnit[k][1], ang);
    pts[k] = {
      x: view.cx + p.x * view.scale,
      y: cy + p.y * view.scale,
      z: p.z / o.r,
    };
  }
  return pts;
}

// front=false: z<0 인 호만, front=true: z>=0 인 호만. 같은 알파끼리 한 폴리라인으로 묶는다
function drawArcs(pts, front, color, weight, alphaMul = 1) {
  const n = pts.length;
  let run = null;
  let runA = -1;
  const flush = () => {
    if (run && run.length > 1) {
      setStroke(color, runA * alphaMul);
      beginShape();
      for (const p of run) vertex(p.x, p.y);
      endShape();
    }
    run = null;
  };
  strokeWeight(weight);
  noFill();
  for (let k = 0; k < n; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    const zm = (a.z + b.z) / 2;
    if (zm >= 0 !== front) {
      flush();
      continue;
    }
    const al = Math.round(depthAlpha(zm) * 64) / 64;
    if (run && al === runA) run.push(b);
    else {
      flush();
      run = [a, b];
      runA = al;
    }
  }
  flush();
}

// ---- 배경 별 ----
let stars = []; // { x, y (0~1), r, a, bucket, tw, period, phase }
let starBuckets = []; // 평소 밝기별로 묶어 한 번에 채운다 (프레임당 fill 호출 최소화)
let starClock = 0; // 반짝임용 시계 (초). 물리 타임라인과 무관한 순수 장식이라 실제 시간으로 흐른다

// 고정 시드 난수 (mulberry32) — 새로고침해도 같은 하늘
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStars() {
  const S = CONFIG.stars;
  const rand = seededRandom(S.seed);
  const levels = 6;
  stars = [];
  starBuckets = Array.from({ length: levels }, () => []);
  for (let k = 0; k < S.maxCount; k++) {
    const a = mix(S.alphaMin, S.alphaMax, rand() * rand()); // 어두운 별이 더 많게
    const bucket = Math.min(
      levels - 1,
      Math.floor(((a - S.alphaMin) / (S.alphaMax - S.alphaMin)) * levels),
    );
    const star = {
      x: rand(),
      y: rand(),
      r: mix(S.radiusMin, S.radiusMax, rand() * rand()),
      a: S.alphaMin + ((bucket + 0.5) / levels) * (S.alphaMax - S.alphaMin),
      tw: rand() < S.twinkleRatio,
      period: mix(S.periodMin, S.periodMax, rand()),
      phase: rand(),
      index: k,
    };
    stars.push(star);
    starBuckets[bucket].push(star);
  }
}

// 반짝임 세기 0~1: 모빌이 잦아드는 마지막 장면에서 함께 사라진다
function twinkleGain(s) {
  const S = CONFIG.stars;
  if (S.twinkleAfterEnd) return 1;
  if (!s || !s.finaleStarted) return 1;
  if (s.finished) return 0;
  return 1 - smooth01((s.step - s.finaleStep) / secToSteps(S.fadeSeconds));
}

// p5 의 fill 캐시와 어긋나지 않도록 drawingContext 직접 그리기는 save/restore 안에서만 한다
function drawStars(gain) {
  const S = CONFIG.stars;
  const count = Math.min(S.maxCount, Math.round(width * height * S.density));
  const [cr, cg, cb] = rgb.warm;
  const ctx = drawingContext;
  ctx.save();
  for (const bucket of starBuckets) {
    if (!bucket.length) continue;
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${bucket[0].a})`;
    ctx.beginPath();
    for (const st of bucket) {
      if (st.index >= count) continue;
      const x = st.x * width;
      const y = st.y * height;
      ctx.moveTo(x + st.r, y);
      ctx.arc(x, y, st.r, 0, TURN);
    }
    ctx.fill();
  }
  if (gain > 0) {
    for (let k = 0; k < count; k++) {
      const st = stars[k];
      if (!st.tw) continue;
      // sin 의 양의 봉우리를 높은 거듭제곱으로 뾰족하게 → 주기마다 짧게 한 번 반짝
      const w = Math.sin(TURN * (starClock / st.period + st.phase));
      if (w <= 0) continue;
      const p = Math.pow(w, S.sharpness) * gain;
      if (p < 0.01) continue;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${(S.flashAlpha - st.a) * p})`;
      ctx.beginPath();
      ctx.arc(
        st.x * width,
        st.y * height,
        st.r * (1 + S.flashGrow * p),
        0,
        TURN,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- 공전 별: 행성이 한 바퀴 돌 때마다 하나씩 ----
// 위치는 화면 비율(0~1)로 저장 → 창 크기가 바뀌어도 같은 자리
function addLapStar(s, def, step) {
  const L = CONFIG.lapStars;
  const rand = s.lapRand;
  const m = Math.min(width, height);
  const R = def.radius * L.sizeRatio * view.scale;
  const pad = L.edgeMargin * m + R * 2;
  // 정지 상태의 가장 바깥 궤도 타원(+여유): 이 안은 피한다
  const maxTilt = Math.max(...sim.orbits.map((o) => o.tilt));
  const ex = (CONFIG.outerRadius + 30) * view.scale;
  const ey = (CONFIG.outerRadius * Math.sin(maxTilt) + 40) * view.scale;
  const score = (x, y) => {
    const e = ((x - view.cx) / ex) ** 2 + ((y - view.cy) / ey) ** 2;
    if (L.avoidMobile && e < 1) return -1;
    let d = Infinity;
    for (const st of s.lapStars)
      d = Math.min(d, Math.hypot(st.x * width - x, st.y * height - y));
    return d;
  };
  // best-candidate: 기존 별들과의 최소 거리가 가장 큰 후보를 고른다
  let best = null;
  let bestScore = -Infinity;
  for (let k = 0; k < L.candidates * 3; k++) {
    const x = mix(pad, width - pad, rand());
    const y = mix(pad, height - pad, rand());
    const sc = score(x, y);
    if (sc > bestScore) {
      best = { x, y };
      bestScore = sc;
    }
    if (k >= L.candidates - 1 && bestScore >= L.minGap * m) break;
  }
  s.lapStars.push({
    def,
    x: best.x / width,
    y: best.y / height,
    born: step,
    phase: rand(),
    period: mix(L.breathePeriod[0], L.breathePeriod[1], rand()),
  });
}

function drawLapStars(s, alpha) {
  if (!s.lapStars.length) return;
  const L = CONFIG.lapStars;
  const now = s.step + alpha;
  const gain = twinkleGain(s); // 마지막 장면에서 은은한 변화도 잦아든다
  for (const st of s.lapStars) {
    const name = st.def.fill;
    const x = st.x * width;
    const y = st.y * height;
    const R0 = st.def.radius * L.sizeRatio * view.scale;
    const age = (now - st.born) * STEP_SEC;
    const t = clamp01(age / L.flashSeconds);
    const flash = (1 - t) * (1 - t); // 생길 때 1 → 0
    const appear = smooth01(age / 0.15); // 0.15초 만에 켜짐
    // 은은하게 숨 쉬기: 1(가장 밝음) ~ 1 - breathe
    const wave = 0.5 * (1 - Math.cos(TURN * (starClock / st.period + st.phase)));
    const glow = 1 - L.breathe * gain * wave;

    noStroke();
    for (const h of L.halo) {
      setFill(name, Math.min(1, h.alpha * glow * (1 + L.flashHalo * flash)) * appear);
      circle(x, y, 2 * R0 * h.size * (1 + 0.3 * flash));
    }
    setFill(name, appear);
    circle(x, y, 2 * R0 * (1 + L.flashGrow * flash) * appear);

    // 반짝: 얇은 링이 퍼지며 사라진다
    if (t < 1) {
      const reach = 1 - (1 - t) ** 3;
      noFill();
      setStroke(name, L.ringAlpha * (1 - t) * appear);
      strokeWeight(view.lw);
      circle(x, y, 2 * R0 * mix(1.3, L.ringReach, reach));
      noStroke();
    }
  }
}

function renderScene(s, alpha) {
  background(rgb.bg[0], rgb.bg[1], rgb.bg[2]);
  drawStars(twinkleGain(s));
  if (!s) return;
  // 공전 별은 배경 (모빌보다 뒤)
  drawLapStars(s, alpha);

  // 모빌 스프링 사슬의 세로 변위: 마디 0 = 태양, 마디 i+1 = 궤도 i
  const sunY = view.cy + s.chain.at(0, alpha) * view.scale;
  const frames = s.orbits.map((o) => {
    const theta = mix(o.prevTheta, o.theta, alpha);
    const ang = o.tilt + theta;
    const phi = mix(o.prevPhi, o.phi, alpha);
    const p = project(o.r * Math.cos(phi), o.r * Math.sin(phi), ang);
    const cy = view.cy + s.chain.at(o.i + 1, alpha) * view.scale;
    return {
      o,
      ang,
      pts: projectOrbit(o, ang, cy),
      x: view.cx + p.x * view.scale,
      y: cy + p.y * view.scale,
      z: p.z,
      zn: p.z / o.r,
    };
  });

  strokeJoin(ROUND);
  strokeCap(SQUARE);

  // (1) 뒤쪽 호
  for (const f of frames) drawArcs(f.pts, false, "warm", view.lw);
  // (2) 뒤쪽 행성 (먼 것부터)
  const back = frames.filter((f) => f.z < 0).sort((a, b) => a.z - b.z);
  const front = frames.filter((f) => f.z >= 0).sort((a, b) => a.z - b.z);
  for (const f of back) drawPlanet(f);
  // (3) 태양
  drawSun(sunY);
  // (4) 앞쪽 호
  for (const f of frames) drawArcs(f.pts, true, "warm", view.lw);
  // (5) 앞쪽 행성
  for (const f of front) drawPlanet(f);

  if (params.debug) drawDebug(s);
}

function drawSun(cy) {
  const S = CONFIG.sun;
  const r = S.radius * view.scale;
  noStroke();
  setFill("red");
  circle(view.cx, cy, r * 2);
  noFill();
  strokeWeight(view.lw);
  for (const ring of S.rings) {
    setStroke("orange", ring.alpha);
    circle(view.cx, cy, (S.radius + ring.offset) * view.scale * 2);
  }
}

function drawPlanet(f) {
  const def = f.o.def;
  const s = 1 + CONFIG.orbit.sizeDepth * f.zn;
  const R = def.radius * s * view.scale;
  const { x, y } = f;

  // 토성 고리: 뒤쪽 호 → 행성 → 앞쪽 호
  let ringPts = null;
  if (def.ring) {
    ringPts = ringUnit
      .filter((_, k) => k % 3 === 0)
      .map(([c, sn]) => {
        const p = project(2.05 * R * c, 2.05 * R * sn, f.ang);
        return { x: x + p.x, y: y + p.y, z: sn * Math.cos(f.ang) };
      });
    drawArcs(
      ringPts,
      false,
      "warm",
      view.lw * 1.2,
      1 / CONFIG.orbit.alphaFront,
    );
  }

  noStroke();
  setFill(def.fill);
  circle(x, y, R * 2);

  if (ringPts)
    drawArcs(ringPts, true, "warm", view.lw * 1.2, 1 / CONFIG.orbit.alphaFront);
}

function drawDebug(s) {
  noStroke();
  setFill("warm", 0.8);
  textFont("monospace");
  textSize(11);
  textAlign(LEFT, TOP);
  const lines = [
    `t ${fmt(s.step)}  x${params.speed}${s.finished ? "  FINISHED" : ""}`,
  ];
  for (const o of s.orbits) {
    const avg = o.laps.length
      ? (o.laps.reduce((a, b) => a + b, 0) / o.laps.length).toFixed(2)
      : "-";
    lines.push(
      `${o.i} ${o.def.name.padEnd(8)} ${o.state.padEnd(9)} ${o.phase.padEnd(9)} lap ${avg}/${o.def.period}`,
    );
  }
  lines.forEach((l, k) => text(l, 12, 12 + k * 15));
}

// ---------------------------------------------------------------------
// 8) p5 진입점
// ---------------------------------------------------------------------
function initSimulation() {
  bindMatter();
  sim = createSimulation();
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  smooth();

  params = readParams();
  for (const k in CONFIG.colors) rgb[k] = hexToRgb(CONFIG.colors[k]);
  const N = CONFIG.orbit.samples;
  ringUnit = Array.from({ length: N }, (_, k) => [
    Math.cos((k / N) * TURN),
    Math.sin((k / N) * TURN),
  ]);
  updateView();
  buildStars();

  if (typeof Matter !== "undefined") initSimulation();
  else {
    // p5 웹 에디터에 sketch.js 만 붙여넣은 경우: Matter 를 직접 불러온 뒤 시작
    const tag = document.createElement("script");
    tag.src = MATTER_CDN;
    tag.onload = initSimulation;
    document.head.appendChild(tag);
  }
}

function draw() {
  const frameMs = Math.min(deltaTime, CONFIG.step.maxFrameMs);
  starClock += (frameMs * params.speed) / 1000;
  if (!sim) {
    renderScene(null, 0);
    return;
  }
  // 고정 스텝 누적기: 실제 프레임 시간과 무관하게 1/60초 스텝으로만 진행
  sim.acc += frameMs * params.speed;
  while (sim.acc >= CONFIG.step.ms && !sim.finished) {
    stepSimulation(sim);
    sim.acc -= CONFIG.step.ms;
  }
  // 스텝 사이 보간 (120Hz 화면에서도 매끈하게)
  const alpha = sim.finished ? 1 : sim.acc / CONFIG.step.ms;
  renderScene(sim, alpha);
  if (sim.finished && CONFIG.stars.twinkleAfterEnd) noLoop(); // 마지막 장면: 완전 정지
}

function windowResized() {
  // 물리는 고정 유닛이므로 재시작 없이 렌더 scale 만 갱신
  resizeCanvas(windowWidth, windowHeight);
  updateView();
  if (sim && sim.finished) redraw();
}
