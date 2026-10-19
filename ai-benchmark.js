"use strict";

// =========================================================================
// AI BENCHMARK - Headless simulation of the CPU drivers only.
//
// Runs js/raceEngine.js (the real AI physics/steering code) inside a Node
// `vm` context, with minimal browser mocks, and prints aggregated metrics:
// lap times, wall contacts, cumulative wall time, respawns and track-width
// usage. Purely visual methods are monkey-patched to no-ops so no WebGL /
// DOM / audio dependency is required.
//
// Usage:
//   node ai-benchmark.js [trackId] [difficulty] [gridSize] [simSeconds]
// Defaults:
//   monza hard 10 600
//
// NOTE: the benchmark only produces meaningful lap times if at least one
// full lap is covered within `simSeconds`. With the default 600s most
// tracks complete several laps.
// =========================================================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const THREE = require("./three-lib.js");
global.THREE = THREE;

const noop = () => {};

// ── Fake, deterministic clock ────────────────────────────────────────────
// The engine measures lap times with performance.now(); driving that from
// the simulated dt keeps lap timing perfectly coherent with the physics.
let simMs = 0;
const performanceMock = { now: () => simMs };

// ── Minimal DOM stub ─────────────────────────────────────────────────────
function makeElementStub() {
  return {
    classList: {
      add: noop,
      remove: noop,
      toggle: noop,
      contains: () => false,
    },
    style: {},
    textContent: "",
    innerHTML: "",
    className: "",
    children: [],
    appendChild: noop,
    removeChild: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute: noop,
    getAttribute: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    getContext: () => null,
  };
}

const documentMock = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "getElementById" || prop === "createElement") {
        return () => makeElementStub();
      }
      if (prop === "querySelector") return () => makeElementStub();
      if (prop === "querySelectorAll") return () => [];
      if (prop === "body") return makeElementStub();
      if (prop === "addEventListener" || prop === "removeEventListener") {
        return noop;
      }
      return undefined;
    },
  },
);

const windowMock = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: noop,
  removeEventListener: noop,
  requestAnimationFrame: noop,
};

// ── Engine / framework mocks ─────────────────────────────────────────────
const GameApp = {
  profile: { equippedCar: "hypercar", records: {} },
  scene: { add: noop, remove: noop },
  clearScene: noop,
  camera: { position: new THREE.Vector3(), lookAt: noop },
};

const ProceduralAssets = {
  buildCarMesh: () => new THREE.Object3D(),
  getGeo: (_key, factory) =>
    typeof factory === "function" ? factory() : new THREE.BufferGeometry(),
  createAsphaltTexture: () => ({ repeat: { set: noop } }),
};

// Any unknown method resolves to a no-op; proceduralTextures is a real object
// (with null maps so Three.js does not warn about undefined material params).
const GraphicsEngine = new Proxy(
  { proceduralTextures: { asphaltNormal: null, asphaltRoughness: null } },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    },
  },
);

const AudioEngine = new Proxy({}, { get: () => noop });

const UI = {
  showToast: noop,
  switchTab: noop,
  formatLapTime: (ms) => String(ms),
};

const StorageManager = { save: noop };

const NetworkEngine = { isConnected: false, isHost: true };

const ChampionshipEngine = {
  state: { drivers: [] },
  getGridSlots: () => ({}),
  recordStageResults: noop,
};

// ── Load the game sources into a single vm context ───────────────────────
function readSrc(relative) {
  return fs.readFileSync(path.join(__dirname, relative), "utf8");
}

const contextGlobals = {
  THREE,
  performance: performanceMock,
  console,
  document: documentMock,
  window: windowMock,
  GameApp,
  ProceduralAssets,
  GraphicsEngine,
  AudioEngine,
  UI,
  StorageManager,
  NetworkEngine,
  ChampionshipEngine,
  setTimeout: noop,
  clearTimeout: noop,
  setInterval: noop,
  clearInterval: noop,
  requestAnimationFrame: noop,
  cancelAnimationFrame: noop,
};

const ctx = vm.createContext(contextGlobals);

// data.js must be evaluated first so that its top-level `const` bindings
// (CAR_CATALOG, TRACK_CATALOG, AI_DRIVER_ROSTER) live in the realm's global
// lexical scope and are visible to trackBuilder.js / raceEngine.js.
const dataExports = vm.runInContext(
  readSrc("js/data.js") +
    "\n;({CAR_CATALOG, TRACK_CATALOG, AI_DRIVER_ROSTER});",
  ctx,
);
const CAR_CATALOG = dataExports.CAR_CATALOG;
const TRACK_CATALOG = dataExports.TRACK_CATALOG;
const AI_DRIVER_ROSTER = dataExports.AI_DRIVER_ROSTER || [];

const TrackBuilder = vm.runInContext(
  readSrc("js/trackBuilder.js") + "\n;TrackBuilder;",
  ctx,
);

const RaceEngine = vm.runInContext(
  readSrc("js/raceEngine.js") + "\n;RaceEngine;",
  ctx,
);

// ── Stub out purely-visual methods (no meshes / particles needed) ────────
RaceEngine.applyVisualDynamics = noop;
RaceEngine.spawnTireSmoke = noop;

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const trackId = argv[0] || "monza";
const difficulty = argv[1] || "hard";
const gridSize = Math.max(1, parseInt(argv[2], 10) || 10);
const simSeconds = Math.max(1, parseFloat(argv[3]) || 600);

const VALID_DIFFICULTIES = ["easy", "medium", "hard", "legend"];
const diffId = VALID_DIFFICULTIES.includes(difficulty) ? difficulty : "medium";

const trackConfig = TRACK_CATALOG.find((t) => t.id === trackId);
if (!trackConfig) {
  console.error(
    `[ai-benchmark] Track '${trackId}' not found in TRACK_CATALOG.`,
  );
  console.error(
    `[ai-benchmark] Available: ${TRACK_CATALOG.map((t) => t.id).join(", ")}`,
  );
  process.exit(1);
}

// ── Scene / engine setup ─────────────────────────────────────────────────
const refPhysics = CAR_CATALOG[CAR_CATALOG.length - 1].physics;

RaceEngine.trackConfig = trackConfig;
RaceEngine.difficulty = diffId;
RaceEngine.trackData = TrackBuilder.buildTrackEnvironment(
  new THREE.Scene(),
  trackConfig,
  refPhysics,
);
RaceEngine.mode = "race";
RaceEngine.isActive = true;
RaceEngine.isPaused = false;
RaceEngine.isFinished = false;
RaceEngine.raceElapsedSeconds = 10; // skip launch delay + grid-blend phase
RaceEngine.frameCounter = 0;
RaceEngine.gridSize = gridSize;
RaceEngine.totalLaps = 99; // never finish, so lap timing keeps running
RaceEngine.aiCars = [];
RaceEngine.allRacers = [];

const N = RaceEngine.trackData.samples.length;
const halfWidth = RaceEngine.trackData.halfWidth || 0;
const totalLength = RaceEngine.trackData.totalLength || 0;

// ── Create the AI pool ───────────────────────────────────────────────────
for (let i = 0; i < gridSize; i++) {
  const profile = AI_DRIVER_ROSTER.length
    ? AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length]
    : null;
  const carConfig = CAR_CATALOG[i % CAR_CATALOG.length];

  const ai = RaceEngine.createRacerEntity({
    id: i,
    isPlayer: false,
    driverCode: profile ? profile.code : `AI${i}`,
    driverName: profile ? profile.name : `Bot ${i}`,
    carConfig,
    // Start spaced just after the start/finish line (index ~0), so a lap is
    // a clean full circuit from t = 0.
    sampleIndex: (3 + i * 6) % N,
    lateralOffset: i % 2 === 0 ? -3 : 3,
    launchDelay: 0,
    aiProfile: profile,
    customPaint: profile ? profile.paint : undefined,
  });

  // Time laps from the very beginning of the run (grid start) instead of
  // requiring an extra out-lap before the first crossing is recorded.
  ai.hasStartedFirstLap = true;
  ai.lapStartTime = 0;

  RaceEngine.aiCars.push(ai);
  RaceEngine.allRacers.push(ai);
}

// ── Per-AI metric trackers ───────────────────────────────────────────────
const stats = RaceEngine.aiCars.map((ai) => ({
  ai,
  wallContacts: 0,
  wallSeconds: 0,
  respawns: 0,
  minAbsLat: Math.abs(ai.lateralDist || 0),
  maxAbsLat: Math.abs(ai.lateralDist || 0),
  lapsCompleted: 0,
  bestLapMs: null,
  lapTimes: [],
  lastCurrentLapMs: 0,
  lapTracked: ai.lap || 1,
  lastLapStampMs: 0,
  prevTouching: ai.touchingBarrier === true,
  prevTag: ai.aiStatusTag,
}));

// ── Simulation loop ──────────────────────────────────────────────────────
const dt = 1 / 60;
const steps = Math.round(simSeconds / dt);

console.log("============================================================");
console.log(" AI BENCHMARK - headless CPU-only simulation");
console.log("============================================================");
console.log(` Track:        ${trackConfig.name} (${trackConfig.id})`);
console.log(
  ` Length:       ${totalLength.toFixed(1)} m  | halfWidth: ${halfWidth.toFixed(2)} m`,
);
console.log(` Difficulty:   ${diffId}`);
console.log(` Grid (AI):    ${gridSize}`);
console.log(
  ` Sim time:     ${simSeconds}s (${steps} steps @ 60Hz, dt=${dt.toFixed(5)}s)`,
);
console.log("------------------------------------------------------------");

let simError = null;
try {
  for (let step = 0; step < steps; step++) {
    simMs += dt * 1000;
    RaceEngine.frameCounter++;
    RaceEngine.raceElapsedSeconds += dt;

    for (let k = 0; k < RaceEngine.aiCars.length; k++) {
      RaceEngine.updateCPUAgentPhysics(RaceEngine.aiCars[k], dt, false);
    }
    RaceEngine.resolveCarCollisions();

    for (let k = 0; k < stats.length; k++) {
      const s = stats[k];
      const ai = s.ai;

      // Wall contact transitions (false -> true) and cumulative wall time.
      const touching = ai.touchingBarrier === true;
      if (touching && !s.prevTouching) {
        s.wallContacts++;
        if (process.env.AI_BENCH_DIAG && s.wallContacts <= 500) {
          console.log(
            `HIT t=${Math.round(simMs)}ms ai=${ai.id} sample=${ai.sampleIndex} u=${(ai.sampleIndex / N).toFixed(3)} speed=${ai.speed.toFixed(1)} lat=${(ai.lateralDist || 0).toFixed(2)} tag=${ai.aiStatusTag}`,
          );
        }
      }
      if (touching) s.wallSeconds += dt;
      s.prevTouching = touching;

      // "RIENTRO!" respawn / fail-safe teleport events (rising edge only).
      const tag = ai.aiStatusTag;
      if (tag === "RIENTRO!" && s.prevTag !== "RIENTRO!") s.respawns++;
      s.prevTag = tag;

      // Track-width usage.
      const lat = Math.abs(ai.lateralDist || 0);
      if (lat > s.maxAbsLat) s.maxAbsLat = lat;
      if (lat < s.minAbsLat) s.minAbsLat = lat;

      // Optional per-frame telemetry for one AI (env AI_BENCH_TRACE = car id,
      // optional AI_BENCH_TRACE_T0 / AI_BENCH_TRACE_T1 = ms window).
      if (process.env.AI_BENCH_TRACE && ai.id === Number(process.env.AI_BENCH_TRACE)) {
        const t0Raw = process.env.AI_BENCH_TRACE_T0;
        const hasWindow = t0Raw !== undefined && t0Raw !== "";
        const t0 = Number(t0Raw || 0);
        const t1 = Number(process.env.AI_BENCH_TRACE_T1 || 0);
        const offTrack = halfWidth > 0 && lat > halfWidth;
        const show = hasWindow
          ? simMs >= t0 && (t1 <= 0 || simMs <= t1)
          : offTrack;
        if (show) {
          const d = ai._dbg || {};
          console.log(
            `TRACE t=${Math.round(simMs)} s=${ai.sampleIndex} u=${(ai.sampleIndex / N).toFixed(3)} lat=${(ai.lateralDist || 0).toFixed(2)} aim=${(ai.currentAimOffset || 0).toFixed(2)} spd=${ai.speed.toFixed(1)} steer=${(ai.steerAngle || 0).toFixed(3)} tgt=${(d.tv ?? -1).toFixed(1)} hz=${(d.hz ?? -1).toFixed(1)} gl=${(d.gl ?? -1).toFixed(1)} md=${(d.md ?? -1).toFixed(1)} bh=${d.bh ?? -1} tag=${ai.aiStatusTag}`,
          );
        }
      }

      // Completed-lap bookkeeping (independent of the engine's best-lap).
      const curLap = ai.lap || 1;
      if (curLap > s.lapTracked) {
        const completed = curLap - s.lapTracked;
        for (let c = 0; c < completed; c++) {
          const lapMs = simMs - s.lastLapStampMs;
          if (lapMs > 4000) s.lapTimes.push(lapMs);
          s.lastLapStampMs = simMs;
        }
        s.lapTracked = curLap;
        s.lapsCompleted = curLap - 1;
      }

      s.lastCurrentLapMs = ai.currentLapTime || 0;
      if (ai.bestLapTime && (!s.bestLapMs || ai.bestLapTime < s.bestLapMs)) {
        s.bestLapMs = ai.bestLapTime;
      }
    }
  }
} catch (err) {
  simError = err;
  console.error("\n[ai-benchmark] Simulation error:");
  console.error(err && err.stack ? err.stack : err);
}

// ── Formatting helpers ───────────────────────────────────────────────────
function formatLapTime(ms) {
  if (!ms || !isFinite(ms) || ms <= 0) return "n/a";
  const total = Math.round(ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const mmm = total % 1000;
  return `${m}:${String(s).padStart(2, "0")}.${String(mmm).padStart(3, "0")}`;
}

function pad(str, len, right = false) {
  str = String(str);
  if (str.length >= len) return str;
  const fill = " ".repeat(len - str.length);
  return right ? fill + str : str + fill;
}

// ── Aggregate metrics over the AI pool ───────────────────────────────────
let maxLaps = 0;
let totalWallContacts = 0;
let totalWallSeconds = 0;
let totalRespawns = 0;
let maxObservedLat = 0;
let bestLapMs = Infinity;
const allLapTimes = [];

for (const s of stats) {
  if (s.lapsCompleted > maxLaps) maxLaps = s.lapsCompleted;
  totalWallContacts += s.wallContacts;
  totalWallSeconds += s.wallSeconds;
  totalRespawns += s.respawns;
  if (s.maxAbsLat > maxObservedLat) maxObservedLat = s.maxAbsLat;
  for (const lt of s.lapTimes) allLapTimes.push(lt);
  if (s.bestLapMs && s.bestLapMs < bestLapMs) bestLapMs = s.bestLapMs;
}
if (!isFinite(bestLapMs)) bestLapMs = 0;

const avgLapMs = allLapTimes.length
  ? allLapTimes.reduce((a, b) => a + b, 0) / allLapTimes.length
  : 0;

const widthUsage = halfWidth > 0 ? maxObservedLat / halfWidth : 0;

// ── Per-car table ────────────────────────────────────────────────────────
console.log(
  pad("AI", 4) +
    pad("CODE", 6) +
    pad("CAR", 10) +
    pad("LAPS", 5, true) +
    pad("BEST LAP", 12, true) +
    pad("CONTACTS", 9, true) +
    pad("WALL(s)", 9, true) +
    pad("RESPAWN", 8, true) +
    pad("MAX|LAT|", 10, true),
);
for (const s of stats) {
  console.log(
    pad(s.ai.id, 4) +
      pad(s.ai.driverCode || "-", 6) +
      pad(s.ai.carConfig ? s.ai.carConfig.id : "-", 10) +
      pad(s.lapsCompleted, 5, true) +
      pad(formatLapTime(s.bestLapMs), 12, true) +
      pad(s.wallContacts, 9, true) +
      pad(s.wallSeconds.toFixed(2), 9, true) +
      pad(s.respawns, 8, true) +
      pad(s.maxAbsLat.toFixed(2), 10, true),
  );
}

// ── Summary table ────────────────────────────────────────────────────────
console.log("------------------------------------------------------------");
console.log(" SUMMARY (AI pool)");
console.log(`   Track ................. ${trackConfig.id} (${trackConfig.name})`);
console.log(`   Difficulty ............ ${diffId}`);
console.log(`   Grid size ............. ${gridSize}`);
console.log(`   Laps completed (max) .. ${maxLaps}`);
console.log(
  `   Best lap .............. ${formatLapTime(bestLapMs)} (${Math.round(bestLapMs)} ms)`,
);
console.log(
  `   Average lap ........... ${formatLapTime(avgLapMs)} (${Math.round(avgLapMs)} ms)`,
);
console.log(`   Laps measured ......... ${allLapTimes.length}`);
console.log(`   Total wall contacts ... ${totalWallContacts}`);
console.log(`   Wall time (cum.) ...... ${totalWallSeconds.toFixed(2)} s`);
console.log(`   Respawns ('RIENTRO!') . ${totalRespawns}`);
console.log(
  `   Width usage ........... ${(widthUsage * 100).toFixed(1)}% (max |lateralDist| ${maxObservedLat.toFixed(2)} m / halfWidth ${halfWidth.toFixed(2)} m)`,
);
console.log("============================================================");
console.log(
  `BENCH_RESULT track=${trackId} diff=${diffId} grid=${gridSize} ` +
    `bestLapMs=${Math.round(bestLapMs)} avgLapMs=${Math.round(avgLapMs)} ` +
    `wallContacts=${totalWallContacts} wallSeconds=${totalWallSeconds.toFixed(2)} ` +
    `respawns=${totalRespawns} widthUsage=${widthUsage.toFixed(3)}`,
);

process.exit(simError ? 1 : 0);
