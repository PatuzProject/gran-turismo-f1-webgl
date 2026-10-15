"use strict";

// =========================================================================
// 6. MOTORE FISICO, DRS SYSTEM, CPU RACING AGENTS & MINIMAPPA 3 SETTORI FIA
// =========================================================================
const RaceEngine = {
  isActive: false,
  isPaused: false,
  isFinished: false,
  mode: "race",
  gridSize: 10, // 8, 10, or 12 total cars on track
  totalLaps: 3, // 2 or 3 laps
  difficulty: "medium", // 'easy', 'medium', 'hard', 'legend'
  DIFFICULTY_LEVELS: {
    easy: {
      id: "easy",
      name: "Facile",
      multiplier: 1.0,
      skillMult: 0.84,
      brakeMarginMult: 0.88,
      aggressionMult: 0.70,
      errorMult: 2.0,
      topSpeedMult: 0.90,
      accelMult: 0.88,
      reactionDelay: 0.30,
      colorClass: "text-emerald-400",
      badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    medium: {
      id: "medium",
      name: "Medio",
      multiplier: 1.5,
      skillMult: 0.98,
      brakeMarginMult: 1.0,
      aggressionMult: 1.0,
      errorMult: 1.0,
      topSpeedMult: 1.0,
      accelMult: 1.0,
      reactionDelay: 0.14,
      colorClass: "text-amber-400",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    },
    hard: {
      id: "hard",
      name: "Difficile",
      multiplier: 2.2,
      skillMult: 1.08,
      brakeMarginMult: 1.06,
      aggressionMult: 1.25,
      errorMult: 0.40,
      topSpeedMult: 1.04,
      accelMult: 1.08,
      reactionDelay: 0.05,
      colorClass: "text-rose-400",
      badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    },
    legend: {
      id: "legend",
      name: "Leggenda",
      multiplier: 3.0,
      skillMult: 1.16,
      brakeMarginMult: 1.12,
      aggressionMult: 1.40,
      errorMult: 0.15,
      topSpeedMult: 1.08,
      accelMult: 1.14,
      reactionDelay: 0.0,
      colorClass: "text-purple-400",
      badgeBg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    },
  },

  getDifficultyConfig() {
    return this.DIFFICULTY_LEVELS[this.difficulty] || this.DIFFICULTY_LEVELS.medium;
  },

  getDifficultyMultiplier() {
    return this.getDifficultyConfig().multiplier || 1.0;
  },
  trackConfig: null,
  trackData: null,

  // F1 5-Light Start Sequence
  countdownTimer: 0,
  lastLightLit: 0,
  raceElapsedSeconds: 0,
  frameCounter: 0,
  lastHudLeaderboardUpdate: 0,

  // FPS Counter
  fpsFrames: 0,
  fpsLastTime: 0,
  currentFps: 60,

  // Vehicles
  player: null,
  aiCars: [],
  allRacers: [],
  smokeParticles: [],

  // Camera state
  cameraMode: 0,
  camPos: new THREE.Vector3(),
  camLook: new THREE.Vector3(),
  cameraTrauma: 0,

  triggerCameraShake(amount) {
    this.cameraTrauma = Math.min(1.0, (this.cameraTrauma || 0) + amount);
  },

  triggerImpactVignette() {
    const el = document.getElementById("hud-impact-vignette");
    if (!el) return;
    el.style.opacity = "1";
    setTimeout(() => {
      el.style.opacity = "0";
    }, 240);
  },

  keys: {
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
    shiftUp: false,
    shiftDown: false,
  },

  initControls() {
    window.addEventListener("keydown", (e) => {
      if (!this.isActive) return;
      const code = e.code;
      if (code === "KeyW" || code === "ArrowUp") this.keys.up = true;
      if (code === "KeyS" || code === "ArrowDown") this.keys.down = true;
      if (code === "KeyA" || code === "ArrowLeft") this.keys.left = true;
      if (code === "KeyD" || code === "ArrowRight") this.keys.right = true;
      if (code === "Space") {
        this.keys.space = true;
        e.preventDefault();
      }
      if (code === "KeyL" && !this.keys.shiftUp) {
        this.keys.shiftUp = true;
        this.manualGearShift(1);
      }
      if (code === "KeyK" && !this.keys.shiftDown) {
        this.keys.shiftDown = true;
        this.manualGearShift(-1);
      }
      if (code === "KeyM") {
        this.toggleTransmissionMode();
      }
      if (code === "KeyC") this.cycleCamera();
      if (code === "KeyR" || code === "Backspace") {
        this.resetPlayerToTrack();
        e.preventDefault();
      }
      if (code === "Escape") this.togglePause();
    });

    window.addEventListener("keyup", (e) => {
      const code = e.code;
      if (code === "KeyW" || code === "ArrowUp") this.keys.up = false;
      if (code === "KeyS" || code === "ArrowDown") this.keys.down = false;
      if (code === "KeyA" || code === "ArrowLeft") this.keys.left = false;
      if (code === "KeyD" || code === "ArrowRight") this.keys.right = false;
      if (code === "Space") this.keys.space = false;
      if (code === "KeyL") this.keys.shiftUp = false;
      if (code === "KeyK") this.keys.shiftDown = false;
    });

    const bindTouch = (id, keyProp) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (ev) => {
        ev.preventDefault();
        this.keys[keyProp] = true;
      };
      const end = (ev) => {
        ev.preventDefault();
        this.keys[keyProp] = false;
      };
      el.addEventListener("touchstart", start, { passive: false });
      el.addEventListener("touchend", end, { passive: false });
      el.addEventListener("mousedown", start);
      el.addEventListener("mouseup", end);
      el.addEventListener("mouseleave", end);
    };
    bindTouch("touch-left", "left");
    bindTouch("touch-right", "right");
    bindTouch("touch-gas", "up");
    bindTouch("touch-brake", "down");
    bindTouch("touch-drift", "space");
  },

  ensureTelemetryBannerExists() {
    if (document.getElementById("hud-f1-corner-bar")) return;
    const hud = document.getElementById("race-hud");
    if (!hud) return;

    const bar = document.createElement("div");
    bar.id = "hud-f1-corner-bar";
    bar.className =
      "fixed top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none hidden md:flex items-center gap-3 glass-panel px-4 py-1.5 rounded-full border border-white/15";
    bar.innerHTML = `
            <span id="hud-sector-badge" class="px-2 py-0.5 rounded-full text-[10px] font-racing font-bold bg-rose-500/30 text-rose-300 border border-rose-400/40">SETTORE 1</span>
            <span id="hud-corner-name" class="font-racing text-xs font-bold text-white tracking-wider">RETTIFILO PRINCIPALE</span>
            <span id="hud-drs-badge" class="px-2.5 py-0.5 rounded-full text-[10px] font-racing font-black bg-slate-800 text-slate-500 border border-white/10">DRS</span>
        `;
    hud.appendChild(bar);
  },

  startSession(trackId, mode) {
    const equippedId = GameApp.profile.equippedCar;
    if (!equippedId) {
      UI.showToast(
        "Acquista ed equipaggia prima una vettura nel Concessionario!",
        "fa-car",
      );
      UI.switchTab("dealership");
      return;
    }

    this.ensureTelemetryBannerExists();
    this.mode = mode;
    const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
      ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
      : TRACK_CATALOG;
    this.trackConfig =
      allTracks.find((t) => t.id === trackId) || allTracks[0];
    const playerCarConfig =
      CAR_CATALOG.find((c) => c.id === equippedId) || CAR_CATALOG[0];

    GameApp.clearScene();
    if (this.trackConfig.isTileTrack && typeof TileTrackBuilder !== "undefined") {
      this.trackData = TileTrackBuilder.buildTileEnvironment(
        GameApp.scene,
        this.trackConfig,
        playerCarConfig.physics,
      );
    } else {
      this.trackData = TrackBuilder.buildTrackEnvironment(
        GameApp.scene,
        this.trackConfig,
        playerCarConfig.physics,
      );
    }

    this.isActive = true;
    this.isPaused = false;
    this.isFinished = false;
    this.raceElapsedSeconds = 0;
    this.raceStartEpoch = 0;
    this.fastestLapTime = Infinity;
    this.fastestLapRacer = null;
    this.frameCounter = 0;
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false,
      shiftUp: false,
      shiftDown: false,
    };
    this.aiCars = [];
    this.allRacers = [];
    this.smokeParticles = [];

    // Smoke Particle Pool
    const smokeGeo = ProceduralAssets.getGeo(
      "smoke_sphere",
      () => new THREE.SphereGeometry(0.42, 7, 7),
    );
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(smokeGeo, mat);
      mesh.visible = false;
      GameApp.scene.add(mesh);
      this.smokeParticles.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }

    const totalSamples = this.trackData.samples.length;

    if (mode === "race") {
      // Staggered 2-Column F1 Starting Grid matching the painted grid boxes
      const aiCount = this.gridSize - 1;
      for (let i = 0; i < aiCount; i++) {
        const profile = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
        const gridRow = i;
        const sampleIdx =
          (totalSamples - 18 - gridRow * 12 + totalSamples) % totalSamples;
        const colOffset = i % 2 === 0 ? -3.8 : 3.8;

        const aiRacer = this.createRacerEntity({
          id: i + 1,
          carConfig: playerCarConfig,
          driverCode: profile.code,
          driverName: profile.name,
          isPlayer: false,
          sampleIndex: sampleIdx,
          lateralOffset: colOffset,
          customPaint: profile.paint,
          aiProfile: profile,
        });
        this.aiCars.push(aiRacer);
        this.allRacers.push(aiRacer);
      }

      const playerRow = aiCount;
      const playerSampleIdx =
        (totalSamples - 18 - playerRow * 12 + totalSamples) % totalSamples;
      const playerColOffset = playerRow % 2 === 0 ? -3.8 : 3.8;

      this.player = this.createRacerEntity({
        id: 0,
        carConfig: playerCarConfig,
        driverCode: "TU",
        driverName: "TU (Pilota GT)",
        isPlayer: true,
        sampleIndex: playerSampleIdx,
        lateralOffset: playerColOffset,
        customPaint: null,
        aiProfile: null,
      });
      this.allRacers.push(this.player);

      this.countdownTimer = 5.4;
      this.lastLightLit = 0;
    } else {
      this.player = this.createRacerEntity({
        id: 0,
        carConfig: playerCarConfig,
        driverCode: "TU",
        driverName: "TU (Pilota GT)",
        isPlayer: true,
        sampleIndex: totalSamples - 18,
        lateralOffset: 0,
        customPaint: null,
        aiProfile: null,
      });
      this.allRacers.push(this.player);
      this.countdownTimer = 0;
    }

    // Snap camera behind player
    const forward = new THREE.Vector3(
      Math.sin(this.player.heading),
      0,
      Math.cos(this.player.heading),
    );
    this.camPos
      .copy(this.player.position)
      .addScaledVector(forward, -8.5)
      .add(new THREE.Vector3(0, 3.5, 0));
    this.camLook.copy(this.player.position).addScaledVector(forward, 6);

    // Configure HUD visibility
    document.getElementById("menu-header").classList.add("hidden");
    document.getElementById("menu-main").classList.add("hidden");
    document.getElementById("race-hud").classList.remove("hidden");
    document.getElementById("race-hud").classList.add("flex");
    document.getElementById("modal-pause").classList.add("hidden");
    document.getElementById("modal-results").classList.add("hidden");

    document.getElementById("hud-track-name").textContent =
      this.trackConfig.name;
    document.getElementById("hud-pos-card").style.display =
      mode === "race" ? "flex" : "none";
    document.getElementById("hud-gap-row").style.display =
      mode === "race" ? "flex" : "none";
    document.getElementById("hud-leaderboard-panel").style.display =
      mode === "race" ? "flex" : "none";
    document.getElementById("hud-pos-total").textContent = `/ ${this.gridSize}`;
    document.getElementById("hud-lap-total").textContent =
      mode === "race" ? `/ ${this.totalLaps}` : "/ ∞";

    const savedRec = GameApp.profile.records[this.trackConfig.id];
    document.getElementById("hud-best-time").textContent =
      savedRec && savedRec.bestLap
        ? UI.formatLapTime(savedRec.bestLap)
        : "--:--.---";

    AudioEngine.setDrivingAudioActive(true);
  },

  startLanSession(trackId, players, laps, countdownDuration, raceStartTime, serverTime) {
    this.ensureTelemetryBannerExists();
    this.mode = "lan_race";
    this.totalLaps = laps || 3;
    this.raceStartTimeEpoch = raceStartTime || null;
    this.countdownDuration = countdownDuration || 4.5;

    const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
      ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
      : TRACK_CATALOG;
    this.trackConfig = allTracks.find((t) => t.id === trackId) || allTracks[0];

    const myId = (typeof NetworkEngine !== "undefined" && (NetworkEngine.myPlayerId || NetworkEngine.myId)) || "local";
    const myProfile = (players && players.find((p) => p.id === myId)) || {
      id: myId,
      name: (typeof NetworkEngine !== "undefined" && NetworkEngine.nickname) || "Pilota LAN",
      color: (typeof NetworkEngine !== "undefined" && NetworkEngine.selectedColor) || "#00f0ff",
      carId: (typeof NetworkEngine !== "undefined" && NetworkEngine.selectedCarId) || "hatchback",
      gridSlot: 0,
    };

    const playerCarConfig =
      CAR_CATALOG.find((c) => c.id === myProfile.carId) || CAR_CATALOG[0];

    GameApp.clearScene();
    if (this.trackConfig.isTileTrack && typeof TileTrackBuilder !== "undefined") {
      this.trackData = TileTrackBuilder.buildTileEnvironment(
        GameApp.scene,
        this.trackConfig,
        playerCarConfig.physics,
      );
    } else {
      this.trackData = TrackBuilder.buildTrackEnvironment(
        GameApp.scene,
        this.trackConfig,
        playerCarConfig.physics,
      );
    }

    this.isActive = true;
    this.isPaused = false;
    this.isFinished = false;
    this.raceElapsedSeconds = 0;
    this.raceStartEpoch = 0;
    this.fastestLapTime = Infinity;
    this.fastestLapRacer = null;
    this.frameCounter = 0;
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false,
      shiftUp: false,
      shiftDown: false,
    };
    this.aiCars = [];
    this.allRacers = [];
    this.smokeParticles = [];

    // Smoke Particle Pool
    const smokeGeo = ProceduralAssets.getGeo(
      "smoke_sphere",
      () => new THREE.SphereGeometry(0.42, 7, 7),
    );
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(smokeGeo, mat);
      mesh.visible = false;
      GameApp.scene.add(mesh);
      this.smokeParticles.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }

    const totalSamples = this.trackData.samples.length;

    // Lista piloti ordinata in modo deterministico su tutti i client (Host in pole, poi ID)
    const hostPlayerId = (typeof NetworkEngine !== "undefined" && NetworkEngine.hostId) || null;
    const playerList = Array.isArray(players) && players.length > 0
      ? [...players].sort((a, b) => {
          if (hostPlayerId) {
            if (a.id === hostPlayerId) return -1;
            if (b.id === hostPlayerId) return 1;
          }
          return String(a.id).localeCompare(String(b.id));
        })
      : [myProfile];

    let mySlot = playerList.findIndex((p) => p.id === myId);
    if (mySlot < 0) mySlot = 0;

    const playerSampleIdx = (totalSamples - 18 - mySlot * 12 + totalSamples) % totalSamples;
    const playerColOffset = mySlot % 2 === 0 ? -3.8 : 3.8;
    const playerSample = this.trackData.samples[playerSampleIdx];
    const initialPos = playerSample.point.clone().addScaledVector(playerSample.right, playerColOffset);
    const initialHeading = Math.atan2(playerSample.tangent.x, playerSample.tangent.z);

    const myPaint = myProfile.color ? parseInt(myProfile.color.replace("#", "0x"), 16) : null;
    this.player = this.createRacerEntity({
      id: myId,
      carConfig: playerCarConfig,
      driverCode: (myProfile.name || "TU").slice(0, 3).toUpperCase(),
      driverName: (myProfile.name || "TU") + " (TU)",
      isPlayer: true,
      sampleIndex: playerSampleIdx,
      lateralOffset: playerColOffset,
      customPaint: myPaint,
      aiProfile: null,
    });
    this.player.position.copy(initialPos);
    this.player.heading = initialHeading;
    this.player.mesh.position.copy(initialPos);
    this.player.mesh.rotation.y = initialHeading;
    this.allRacers.push(this.player);

    // Spawna e posiziona le auto dei giocatori remoti sulla griglia
    playerList.forEach((otherP, idx) => {
      if (otherP.id === myId) return;

      if (typeof NetworkEngine !== "undefined") {
        NetworkEngine.spawnPlayer(otherP);
      }
      const rem = typeof remotePlayers !== "undefined" ? remotePlayers[otherP.id] : null;

      const slot = idx;
      const sIdx = (totalSamples - 18 - slot * 12 + totalSamples) % totalSamples;
      const colOff = slot % 2 === 0 ? -3.8 : 3.8;
      const s = this.trackData.samples[sIdx];
      const pos = s.point.clone().addScaledVector(s.right, colOff);
      const heading = Math.atan2(s.tangent.x, s.tangent.z);

      const initProgress = -((totalSamples - sIdx) / totalSamples);

      if (rem) {
        rem.lap = 1;
        rem.sampleIndex = sIdx;
        rem.totalProgress = initProgress;
        rem.curTime = 0;
        rem.bestTime = null;
        rem.finished = false;
        rem.finishTime = 0;
        if (rem.mesh) {
          if (GameApp.scene && rem.mesh.parent !== GameApp.scene) {
            GameApp.scene.add(rem.mesh);
          }
          rem.mesh.position.copy(pos);
          rem.mesh.rotation.y = heading;
          rem.targetPos.copy(pos);
          rem.targetRotY = heading;
        }
      }

      const remCarConfig = CAR_CATALOG.find((c) => c.id === otherP.carId) || CAR_CATALOG[0];
      const remColorHex = otherP.color ? parseInt(otherP.color.replace("#", "0x"), 16) : remCarConfig.colorHex;

      const remCarId = remCarConfig.id;
      const remHL = remCarId === "hypercar" ? 2.40 : remCarId === "muscle" ? 2.35 : remCarId === "hatchback" ? 2.15 : 2.30;
      const remHW = remCarId === "hypercar" ? 1.05 : remCarId === "hatchback" ? 0.98 : 1.02;
      const remMass = (remCarConfig.physics && remCarConfig.physics.mass) || 1200;
      const remInertia = (1 / 12) * remMass * ((2 * remHW) ** 2 + (2 * remHL) ** 2);

      this.allRacers.push({
        id: otherP.id,
        isPlayer: false,
        isRemotePlayer: true,
        driverCode: (otherP.name || "REM").slice(0, 3).toUpperCase(),
        driverName: otherP.name || `Pilota ${otherP.id}`,
        teamColorHex: remColorHex,
        carConfig: remCarConfig,
        mesh: rem ? rem.mesh : null,
        position: pos.clone(),
        speed: 0,
        heading: heading,
        lateralVel: 0,
        angularVelocity: 0,
        halfLength: remHL,
        halfWidth: remHW,
        mass: remMass,
        inertia: remInertia,
        impactRoll: 0,
        impactPitch: 0,
        tireDirtyTimer: 0,
        lastScrapeTime: 0,
        sampleIndex: sIdx,
        lap: 1,
        hasStartedFirstLap: false,
        totalProgress: initProgress,
        currentLapTime: 0,
        bestLapTime: null,
        finished: false,
        finishTime: 0,
      });
    });

    // Snap camera dietro il player locale
    const forward = new THREE.Vector3(
      Math.sin(this.player.heading),
      0,
      Math.cos(this.player.heading),
    );
    this.camPos
      .copy(this.player.position)
      .addScaledVector(forward, -8.5)
      .add(new THREE.Vector3(0, 3.5, 0));
    this.camLook.copy(this.player.position).addScaledVector(forward, 6);
    GameApp.camera.position.copy(this.camPos);
    GameApp.camera.lookAt(this.camLook);

    // Countdown sincronizzato al millisecondo tramite orologio NTP del server
    if (this.raceStartTimeEpoch && typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
      const serverNow = NetworkEngine.getServerTime();
      const remainingSeconds = (this.raceStartTimeEpoch - serverNow) / 1000;
      this.countdownTimer = Math.max(0, remainingSeconds);
      this.totalCountdown = this.countdownDuration || countdownDuration || 4.5;
    } else {
      this.countdownTimer = countdownDuration || 4.5;
      this.totalCountdown = this.countdownTimer;
    }
    this.lastLightLit = 0;

    // NASCONDI TUTTI I MENU E MOSTRA L'HUD DI GARA
    const menuHeader = document.getElementById("menu-header");
    const menuMain = document.getElementById("menu-main");
    const raceHud = document.getElementById("race-hud");
    const modalPause = document.getElementById("modal-pause");
    const modalResults = document.getElementById("modal-results");
    const screenMultiplayer = document.getElementById("screen-multiplayer");
    const screenTracks = document.getElementById("screen-tracks");
    const screenShowroom = document.getElementById("screen-showroom");

    if (menuHeader) {
      menuHeader.classList.add("hidden");
      menuHeader.classList.remove("flex");
    }
    if (menuMain) {
      menuMain.classList.add("hidden");
      menuMain.classList.remove("flex");
    }
    if (screenMultiplayer) {
      screenMultiplayer.classList.add("hidden");
      screenMultiplayer.classList.remove("flex");
    }
    if (screenTracks) {
      screenTracks.classList.add("hidden");
      screenTracks.classList.remove("flex");
    }
    if (screenShowroom) {
      screenShowroom.classList.add("hidden");
      screenShowroom.classList.remove("flex");
    }
    if (modalPause) modalPause.classList.add("hidden");
    if (modalResults) modalResults.classList.add("hidden");

    if (raceHud) {
      raceHud.classList.remove("hidden");
      raceHud.classList.add("flex");
    }

    const trackNameEl = document.getElementById("hud-track-name");
    if (trackNameEl) {
      trackNameEl.textContent = this.trackConfig.name + " [LAN MULTIPLAYER]";
    }
    const posCard = document.getElementById("hud-pos-card");
    if (posCard) posCard.style.display = "flex";
    const gapRow = document.getElementById("hud-gap-row");
    if (gapRow) gapRow.style.display = "flex";
    const lbPanel = document.getElementById("hud-leaderboard-panel");
    if (lbPanel) lbPanel.style.display = "flex";
    const posTotal = document.getElementById("hud-pos-total");
    if (posTotal) posTotal.textContent = `/ ${this.allRacers.length}`;
    const lapTotal = document.getElementById("hud-lap-total");
    if (lapTotal) lapTotal.textContent = `/ ${this.totalLaps}`;

    this.updateHUD(performance.now());

    AudioEngine.setDrivingAudioActive(true);
    UI.showToast(`Gara LAN Avviata! ${this.allRacers.length} piloti in pista!`, "fa-users");
  },

  applyRemoteLeaderboard(standings) {
    if (!standings || !Array.isArray(standings)) return;
    const panel = document.getElementById("hud-leaderboard-rows");
    if (!panel) return;

    const myId = (typeof NetworkEngine !== "undefined" && (NetworkEngine.myPlayerId || NetworkEngine.myId)) || "local";
    const myIdx = standings.findIndex((s) => s.id === myId);
    if (myIdx !== -1) {
      const posEl = document.getElementById("hud-position");
      if (posEl) posEl.textContent = myIdx + 1;
    }

    panel.innerHTML = standings
      .slice(0, 8)
      .map((s, idx) => {
        const isMe = s.id === myId;
        const color = s.color || "#00f0ff";
        return `
          <div class="flex items-center justify-between px-2 py-1 rounded ${
            isMe ? "bg-amber-400/20 border border-amber-400/40" : "bg-slate-900/60"
          }">
            <div class="flex items-center gap-1.5">
              <span class="w-4 text-center font-bold text-slate-400">${idx + 1}</span>
              <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${color}"></span>
              <span class="font-bold text-xs ${isMe ? "text-amber-300" : "text-white"} truncate max-w-[90px]">${s.name}</span>
            </div>
            <div class="flex items-center gap-1 text-[10px] text-cyan-300 font-bold">
              <span>L${s.lap || 1}</span>
              <span class="text-slate-400 font-normal">${s.speedKmh || 0} km/h</span>
            </div>
          </div>
        `;
      })
      .join("");
  },

  createRacerEntity(opts) {
    const samples = this.trackData.samples;
    const sIdx = (opts.sampleIndex + samples.length) % samples.length;
    const sample = samples[sIdx];

    const mesh = ProceduralAssets.buildCarMesh(
      opts.carConfig,
      opts.customPaint,
    );
    const pos = sample.point
      .clone()
      .addScaledVector(sample.right, opts.lateralOffset);
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

    mesh.rotation.order = "YXZ";
    mesh.position.copy(pos);
    mesh.rotation.y = heading;
    GameApp.scene.add(mesh);

    const carId = opts.carConfig.id;
    const hLength = carId === "hypercar" ? 2.40 : carId === "muscle" ? 2.35 : carId === "hatchback" ? 2.15 : 2.30;
    const hWidth = carId === "hypercar" ? 1.05 : carId === "hatchback" ? 0.98 : 1.02;
    const carMass = (opts.carConfig.physics && opts.carConfig.physics.mass) || 1200;
    const carInertia = (1 / 12) * carMass * ((2 * hWidth) ** 2 + (2 * hLength) ** 2);

    return {
      id: opts.id,
      isPlayer: opts.isPlayer,
      driverCode: opts.driverCode,
      driverName: opts.driverName,
      teamColorHex: opts.customPaint || opts.carConfig.colorHex,
      carConfig: opts.carConfig,
      mesh,
      position: pos.clone(),
      speed: 0,
      heading: heading,
      trackPitch: 0,
      trackRoll: 0,
      lateralVel: 0,
      angularVelocity: 0,
      halfLength: hLength,
      halfWidth: hWidth,
      mass: carMass,
      inertia: carInertia,
      impactRoll: 0,
      impactPitch: 0,
      tireDirtyTimer: 0,
      lastScrapeTime: 0,
      driftAngle: 0,
      steerAngle: 0,
      rpm: 1000,
      gear: 1,
      manualGear: null,
      isManualMode: false,
      shiftCooldown: 0,
      drsActive: false,
      sampleIndex: sIdx,
      lateralDist: opts.lateralOffset,
      lap: 1,
      hasStartedFirstLap: false,
      totalProgress: -((samples.length - sIdx) / samples.length),
      lapStartTime: 0,
      currentLapTime: 0,
      bestLapTime: null,
      finished: false,
      finishTime: 0,
      startLaneOffset: opts.lateralOffset,
      currentAimOffset: opts.lateralOffset,
      overtakeBias: 0,
      errorWideTimer: 0,
      aiStatusTag: "",
      sensorBlockedFront: false,
      sensorFrontDist: 99,
      sensorFrontSpeed: 0,
      inDraft: false,
      launchDelay: opts.aiProfile ? (Math.random() * 0.12 + (this.getDifficultyConfig().reactionDelay || 0)) : 0,
      aiProfile: opts.aiProfile,
      pitch: 0,
      roll: 0,
    };
  },

  update(dt) {
    if (!this.isActive || this.isPaused) return;
    this.frameCounter++;

    // Animate Suzuka Ferris Wheel if present
    if (
      this.trackData &&
      this.trackData.animatedObjects &&
      this.trackData.animatedObjects.ferrisWheel
    ) {
      this.trackData.animatedObjects.ferrisWheel.rotation.x += dt * 0.18;
    }
    const turboGroup =
      this.trackData &&
      this.trackData.animatedObjects &&
      this.trackData.animatedObjects.turboPads;
    if (turboGroup && turboGroup.userData.padMeshes) {
      const pulse = 2.8 + Math.sin(performance.now() * 0.012) * 1.1;
      turboGroup.userData.padMeshes.forEach((mesh) => {
        mesh.material.emissiveIntensity = pulse;
      });
    }

    // Track live FPS
    this.fpsFrames++;
    const nowMs = performance.now();
    if (nowMs - this.fpsLastTime >= 500) {
      this.currentFps = Math.min(
        60,
        Math.round((this.fpsFrames * 1000) / (nowMs - this.fpsLastTime)),
      );
      this.fpsFrames = 0;
      this.fpsLastTime = nowMs;
      const fpsEl = document.getElementById("hud-fps");
      if (fpsEl) fpsEl.textContent = `${this.currentFps} FPS`;
    }

    // F1 5-Light Start Sequence
    const gantryEl = document.getElementById("hud-f1-gantry");
    if (this.countdownTimer > 0) {
      if (this.mode === "lan_race" && this.raceStartTimeEpoch && typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
        const sNow = NetworkEngine.getServerTime();
        this.countdownTimer = Math.max(0, (this.raceStartTimeEpoch - sNow) / 1000);
      } else {
        this.countdownTimer -= dt;
      }
      if (gantryEl) {
        gantryEl.classList.remove("hidden");
        gantryEl.classList.add("flex");
      }

      const totCount = this.totalCountdown || 5.4;
      const elapsedStart = totCount - this.countdownTimer;
      const lightsToLight = Math.min(5, Math.floor((elapsedStart / (totCount - 0.7)) * 5) + 1);

      if (this.countdownTimer > 0.55) {
        for (let l = 1; l <= 5; l++) {
          const el = document.getElementById(`f1-light-${l}`);
          const isLit = l <= lightsToLight;
          if (el) el.className = isLit ? "f1-light lit" : "f1-light";
          if (this.trackData && this.trackData.lightPods3D && this.trackData.lightPods3D[l - 1]) {
            this.trackData.lightPods3D[l - 1].color.setHex(
              isLit ? 0xff1e38 : 0x1e293b,
            );
          }
        }
        if (lightsToLight > this.lastLightLit) {
          this.lastLightLit = lightsToLight;
          AudioEngine.playTone(440, 0.14, "square", 0.24);
        }
        const countTxt = document.getElementById("hud-countdown-text");
        if (countTxt) {
          countTxt.textContent =
            lightsToLight < 5
              ? `SEMAFORO ROSSO (${lightsToLight}/5)`
              : "PRONTI ALLO SCATTO...";
        }
      } else {
        for (let l = 1; l <= 5; l++) {
          const el = document.getElementById(`f1-light-${l}`);
          if (el) el.className = "f1-light green";
          if (this.trackData && this.trackData.lightPods3D && this.trackData.lightPods3D[l - 1]) {
            this.trackData.lightPods3D[l - 1].color.setHex(0x10b981);
          }
        }
        if (this.lastLightLit !== 99) {
          this.lastLightLit = 99;
          AudioEngine.playTone(880, 0.35, "sawtooth", 0.32);
        }
        const countTxt = document.getElementById("hud-countdown-text");
        if (countTxt) countTxt.textContent = "LIGHTS OUT! PARTENZA!";
      }

      if (this.player && this.player.carConfig) {
        const pPhys = this.player.carConfig.physics;
        const pRedline = (pPhys && pPhys.redlineRPM) || 8200;
        const pIdle = (pPhys && pPhys.idleRPM) || 900;
        this.player.rpm = this.keys.up
          ? Math.min(pRedline - 200, this.player.rpm + 9500 * dt)
          : Math.max(pIdle, this.player.rpm - 6000 * dt);
        const carIdx = CAR_CATALOG.findIndex(
          (c) => c.id === this.player.carConfig.id,
        );
        AudioEngine.updateTelemetryAudio(
          this.player.rpm,
          this.keys.up ? 0.65 : 0,
          0,
          this.player.carConfig.id,
          0,
          1,
          dt,
        );
      }

      this.updateCamera(dt);
      this.updateHUD(nowMs);
      this.drawMinimap();
      return;
    } else {
      if (gantryEl) {
        gantryEl.classList.add("hidden");
        gantryEl.classList.remove("flex");
      }
      if (!this.raceStartEpoch) {
        this.raceStartEpoch = performance.now();
      }
    }

    if (this.mode === "lan_race" && this.raceStartTimeEpoch && typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
      this.raceElapsedSeconds = Math.max(0, (NetworkEngine.getServerTime() - this.raceStartTimeEpoch) / 1000);
    } else {
      this.raceElapsedSeconds += dt;
    }

    // Update Player Physics
    if (!this.player.finished) {
      this.updatePlayerPhysics(this.player, dt);
    } else {
      this.updateCPUAgentPhysics(this.player, dt, true);
    }

    // Update AI CPU Racing Agents
    for (let ai of this.aiCars) {
      this.updateCPUAgentPhysics(ai, dt, false);
    }

    // 3D Oriented Bounding Sphere Collision Resolution
    this.resolveCarCollisions();

    // Update Smoke Particles
    this.updateSmokeParticles(dt);

    // Aggiorna posizione e progresso dei giocatori remoti per classifica e minimap
    if (this.mode === "lan_race" && typeof remotePlayers !== "undefined" && this.trackData) {
      const N = this.trackData.samples.length;
      for (let racer of this.allRacers) {
        if (racer.isRemotePlayer) {
          const rem = remotePlayers[racer.id];
          if (rem && rem.mesh) {
            racer.position.copy(rem.mesh.position);
            racer.speed = rem.targetSpeed || 0;
            racer.heading = rem.mesh.rotation.y;

            let closestIdx = racer.sampleIndex;
            let minDistSq = Infinity;
            for (let offset = -25; offset <= 25; offset++) {
              const testIdx = (racer.sampleIndex + offset + N) % N;
              const sp = this.trackData.samples[testIdx].point;
              const dx = sp.x - racer.position.x;
              const dz = sp.z - racer.position.z;
              const distSq = dx * dx + dz * dz;
              if (distSq < minDistSq) {
                minDistSq = distSq;
                closestIdx = testIdx;
              }
            }
            if (racer.sampleIndex > N - 160 && closestIdx < 160) {
              racer.lap += 1;
              racer.hasStartedFirstLap = true;
            }
            racer.sampleIndex = closestIdx;
            if (typeof rem.totalProgress !== "number") {
              racer.totalProgress = (racer.hasStartedFirstLap ? racer.lap - 1 : -1) + (closestIdx / N);
            }
          }
        }
      }
    }

    // Update Camera, HUD & Minimap
    this.updateCamera(dt);
    this.updateHUD(nowMs);
    this.drawMinimap();
  },

  updatePlayerPhysics(car, dt) {
    const phys = car.carConfig.physics;
    const throttle = this.keys.up ? 1 : 0;
    const brake = this.keys.down ? 1 : 0;
    const handbrake = this.keys.space;

    const curSample = this.trackData.samples[car.sampleIndex];
    // FIA DRS Activation: inside DRS Zone + full throttle + no braking + minimal steering angle
    car.drsActive = Boolean(
      curSample &&
      curSample.isDRS &&
      throttle > 0 &&
      brake === 0 &&
      !handbrake &&
      Math.abs(car.steerAngle) < 0.32,
    );

    const turboActive =
      curSample && curSample.isTurbo && throttle > 0 && !brake;
    const effectiveMaxSpeed = car.drsActive
      ? phys.maxSpeed + 4.0
      : phys.maxSpeed;
    const effectiveDrag = car.drsActive
      ? phys.dragCoeff * 0.72
      : phys.dragCoeff;

    const steerInput = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0);
    const speedRatio = Math.min(1, Math.abs(car.speed) / effectiveMaxSpeed);
    const highSpeedDamping = 1.0 - speedRatio * 0.46;
    const targetSteer = steerInput * phys.steerRate * highSpeedDamping * 1.18;
    car.steerAngle = THREE.MathUtils.lerp(car.steerAngle, targetSteer, dt * 18);

    // 1. Inserimento automatico della prima marcia se si è in retro e si preme W (throttle)
    if (throttle > 0 && (car.gear === "R" || car.speed < -0.2)) {
      car.gear = 1;
      car.manualGear = car.isManualMode ? 1 : null;
      if (car.speed < 0) {
        car.speed = 0; // stop immediato del moto all'indietro per scattare subito in 1a
      }
    }

    let driveForce = 0;
    if (throttle > 0 && typeof car.gear === "number" && car.gear >= 1) {
      const gearIdx = car.gear - 1;
      const gearRatio = (phys.gearRatios && phys.gearRatios[gearIdx]) || 1.0;
      const finalDrive = phys.finalDrive || 3.8;
      const tireRadius = phys.tireRadius || 0.33;

      let engineTorque = phys.engineForce * 0.025;
      if (phys.torqueCurve && phys.torqueCurve.length > 0) {
        engineTorque = this.sampleTorqueCurve(phys.torqueCurve, car.rpm);
      }

      const wheelTorque = engineTorque * gearRatio * finalDrive;
      let tractiveForce = wheelTorque / tireRadius;

      // Realistic tire grip saturation limit in low gears (traction limit)
      const maxTraction = phys.mass * 9.81 * (phys.gripLateral * 0.08);
      tractiveForce = Math.min(tractiveForce, maxTraction);

      driveForce =
        tractiveForce *
        (car.drsActive ? 1.08 : 1.0) *
        (turboActive ? 2.35 : 1.0);

      // Rev limiter: hard power cut above redline
      if (car.rpm >= phys.redlineRPM) {
        driveForce *= 0.12;
      }
    }

    // Realistic engine braking when releasing throttle in gear
    if (
      throttle === 0 &&
      typeof car.gear === "number" &&
      car.gear >= 1 &&
      car.speed > 1.5
    ) {
      const gearIdx = car.gear - 1;
      const gearRatio = (phys.gearRatios && phys.gearRatios[gearIdx]) || 1.0;
      const finalDrive = phys.finalDrive || 3.8;
      const engineBrake = gearRatio * finalDrive * 24.0;
      driveForce -= engineBrake;
    }

    // Gestione frenata e retromarcia senza inserimento automatico
    if (brake === 0) {
      car.brakeHoldFromDrive = false; // Rilasciato il pedale del freno
    }

    if (brake > 0) {
      if (car.gear === "R") {
        // In retromarcia attiva, il tasto S/down funge da acceleratore indietro
        driveForce -= phys.engineForce * 0.48;
      } else {
        // In marcia avanti o folle
        if (car.speed > 0.35) {
          driveForce -= phys.brakeForce;
          car.brakeHoldFromDrive = true; // Stava frenando dalla marcia avanti
        } else if (car.speed < -0.35) {
          // Se la vettura stava scivolando indietro ma non in R, il freno la arresta a 0
          driveForce += phys.brakeForce;
        } else {
          // Arresto completo a 0 km/h: l'auto rimane ferma e NON va in retro automaticamente
          car.speed = 0;
          driveForce = 0;

          // Se il giocatore preme S da fermo (senza tenerlo premuto dalla frenata precedente),
          // inserisce la retromarcia intenzionalmente!
          if (!car.brakeHoldFromDrive && throttle === 0) {
            car.gear = "R";
            car.manualGear = car.isManualMode ? "R" : null;
            driveForce -= phys.engineForce * 0.48;
          }
        }
      }
    }
    if (handbrake) {
      driveForce -= phys.brakeForce * 0.42;
    }

    const dragForce =
      0.5 * effectiveDrag * car.speed * Math.abs(car.speed) * 4.1;
    const rollingRes = car.speed * 20;

    const accel = (driveForce - dragForce - rollingRes) / phys.mass;
    car.speed += accel * dt;
    car.speed = THREE.MathUtils.clamp(
      car.speed,
      -16,
      turboActive ? effectiveMaxSpeed + 55 : effectiveMaxSpeed,
    );
    if (throttle === 0 && brake === 0 && Math.abs(car.speed) < 0.35) {
      car.speed = 0;
    }

    const turnAuthority = Math.min(1, Math.abs(car.speed) / 4.5);
    const directionSign = car.speed >= 0 ? 1 : -1;
    const steeringAngularVel = car.steerAngle * turnAuthority * directionSign;

    // Combine driver steering with collision-induced yaw torque
    const totalYawRate = steeringAngularVel + (car.angularVelocity || 0);
    car.heading += totalYawRate * dt;
    car.yawRate = totalYawRate;
    if (car.angularVelocity) {
      car.angularVelocity = THREE.MathUtils.damp(car.angularVelocity, 0, 7.8, dt);
      if (Math.abs(car.angularVelocity) < 0.005) car.angularVelocity = 0;
    }

    // Dirty tire recovery decay (temporary grip loss after collision/gravel)
    if (car.tireDirtyTimer > 0) {
      car.tireDirtyTimer = Math.max(0, car.tireDirtyTimer - dt);
    }
    const tireGripMult = car.tireDirtyTimer > 0 ? 0.82 : 1.0;

    // Tire grip scrubs lateral slide velocity from collisions
    if (car.lateralVel) {
      const tireGrip = (phys.gripLateral || 15.0) * tireGripMult;
      const lateralScrub = tireGrip * 14.5 * dt;
      if (Math.abs(car.lateralVel) <= lateralScrub) {
        car.lateralVel = 0;
      } else {
        car.lateralVel -= Math.sign(car.lateralVel) * lateralScrub;
      }
    }

    let targetDrift = 0;
    if (handbrake && Math.abs(car.speed) > 10) {
      targetDrift = car.steerAngle * 0.58 * phys.driftFactor;
      car.speed *= 1 - 0.13 * dt;
    } else if (Math.abs(car.steerAngle) > 0.35 && speedRatio > 0.55) {
      targetDrift =
        car.steerAngle * 0.24 * phys.driftFactor * (throttle ? 1.25 : 0.8);
    }

    // Collision-induced lateral slip contributes to visual chassis drift
    const slipAngle = Math.atan2(car.lateralVel || 0, Math.max(5, Math.abs(car.speed)));
    car.driftAngle = THREE.MathUtils.lerp(
      car.driftAngle,
      targetDrift + slipAngle * 0.85,
      dt * 7.5,
    );

    const travelAngle = car.heading - car.driftAngle * 0.42;
    const fwdX = Math.sin(travelAngle);
    const fwdZ = Math.cos(travelAngle);
    const rightX = fwdZ;
    const rightZ = -fwdX;

    const vx = fwdX * car.speed + rightX * (car.lateralVel || 0);
    const vz = fwdZ * car.speed + rightZ * (car.lateralVel || 0);
    car.position.x += vx * dt;
    car.position.z += vz * dt;
    car.vx = vx;
    car.vz = vz;
    car.vy = 0;

    this.updateSplineProgressAndWalls(car, dt);
    this.updateGearAndRPM(car, throttle, dt);
    if (turboActive && !car.turboWasActive) AudioEngine.playTurboBoost();
    car.turboWasActive = turboActive;
    this.applyVisualDynamics(
      car,
      accel,
      steeringAngularVel + (car.angularVelocity || 0),
      brake > 0 || handbrake,
      dt,
    );

    const isDrifting =
      (Math.abs(car.driftAngle) > 0.16 && Math.abs(car.speed) > 12) ||
      Math.abs(car.lateralVel || 0) > 2.2;
    const isHardBraking = brake > 0 && car.speed > 20;
    if (isDrifting || isHardBraking) {
      this.spawnTireSmoke(car);
    }

    const screechLevel = isDrifting
      ? Math.min(1, Math.abs(car.driftAngle) * 1.8)
      : isHardBraking
        ? 0.55
        : 0;

    AudioEngine.updateTelemetryAudio(
      car.rpm,
      throttle,
      screechLevel,
      car.carConfig ? car.carConfig.id : "gt_comp",
      car.speed,
      car.gear,
      dt,
    );
  },

  updateCPUAgentPhysics(ai, dt, isCooldownAutopilot) {
    if (this.raceElapsedSeconds < (ai.launchDelay || 0)) {
      this.updateGearAndRPM(ai, 0, dt);
      return;
    }

    const samples = this.trackData.samples;
    const N = samples.length;
    const phys = ai.carConfig.physics;
    const prof = ai.aiProfile || {
      aggression: 0.85,
      skill: 0.85,
      brakeMargin: 1.0,
      errorRate: 0.0,
    };
    const halfWidth = this.trackData.halfWidth;
    const diffConfig = this.getDifficultyConfig();

    if (!isCooldownAutopilot && (this.frameCounter + ai.id) % 2 === 0) {
      this.evaluateAISensorsAndOvertaking(ai, prof, halfWidth);
    }

    // 1. Dynamic speed-adaptive lookahead
    // Low speed (e.g. 15 m/s) -> look 11 samples (~40m) ahead to nail tight corners & chicanes
    // High speed (e.g. 75 m/s) -> look 28 samples (~105m) ahead for high-speed stability
    const speedRatio = THREE.MathUtils.clamp(ai.speed / (phys.maxSpeed || 80), 0, 1);
    const lookDistSamples = Math.round(THREE.MathUtils.lerp(11, 28, speedRatio));
    const lookAheadIdx = (ai.sampleIndex + lookDistSamples) % N;
    const lookSample = samples[lookAheadIdx];

    // 2. Desired trajectory offset
    let desiredOffset = (lookSample.racingOffset || 0) + (ai.overtakeBias || 0);

    // Staggered grid start lane blend
    if (this.raceElapsedSeconds < 3.2) {
      const blend = this.raceElapsedSeconds / 3.2;
      desiredOffset = THREE.MathUtils.lerp(
        ai.startLaneOffset,
        desiredOffset,
        blend,
      );
    }

    // Human error wide line
    if (ai.errorWideTimer > 0) {
      ai.errorWideTimer -= dt;
      const outsideDir = -Math.sign(lookSample.signedCurvature || 1);
      desiredOffset = outsideDir * (halfWidth * 0.78);
      ai.aiStatusTag = "LUNGO!";
    }

    // Keep within safe track bounds
    const safeTrackLimit = halfWidth - 1.5;
    desiredOffset = THREE.MathUtils.clamp(
      desiredOffset,
      -safeTrackLimit,
      safeTrackLimit,
    );
    ai.currentAimOffset = THREE.MathUtils.lerp(
      ai.currentAimOffset,
      desiredOffset,
      dt * (Math.abs(ai.steerAngle) > 0.22 ? 5.2 : 3.8),
    );

    // 3. Target Position & Smooth Steering Calculation
    const targetPos = lookSample.point
      .clone()
      .addScaledVector(lookSample.right, ai.currentAimOffset);
    const toTargetX = targetPos.x - ai.position.x;
    const toTargetZ = targetPos.z - ai.position.z;
    const desiredHeading = Math.atan2(toTargetX, toTargetZ);

    let diff = desiredHeading - ai.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Smooth PD steering control
    const targetSteerAngle = THREE.MathUtils.clamp(
      diff * 2.2,
      -phys.steerRate,
      phys.steerRate,
    );
    ai.steerAngle = THREE.MathUtils.damp(ai.steerAngle, targetSteerAngle, 12.0, dt);

    // Speed-sensitive yaw turning authority
    const turnAuthority = THREE.MathUtils.clamp(Math.abs(ai.speed) / 4.8, 0.12, 1.0);
    const steeringAngularVel = ai.steerAngle * turnAuthority * 2.15;
    ai.heading += (steeringAngularVel + (ai.angularVelocity || 0)) * dt;

    if (ai.angularVelocity) {
      ai.angularVelocity = THREE.MathUtils.damp(ai.angularVelocity, 0, 8.5, dt);
      if (Math.abs(ai.angularVelocity) < 0.005) ai.angularVelocity = 0;
    }

    // Tire grip scrubs lateral slide velocity from impacts
    if (ai.lateralVel) {
      const tireGrip = phys.gripLateral || 15.0;
      const lateralScrub = tireGrip * 15.0 * dt;
      if (Math.abs(ai.lateralVel) <= lateralScrub) {
        ai.lateralVel = 0;
      } else {
        ai.lateralVel -= Math.sign(ai.lateralVel) * lateralScrub;
      }
    }

    // 4. DRS System
    const curSample = samples[ai.sampleIndex];
    ai.drsActive = Boolean(
      curSample && curSample.isDRS && Math.abs(ai.steerAngle) < 0.22,
    );

    // 5. Predictive Braking Horizon Scanning
    // Scan ahead across the braking horizon using kinematic deceleration
    const brakeHorizonSamples = Math.round(THREE.MathUtils.clamp(ai.speed * 0.38 + 8, 12, 42));
    const effectiveBrakeMargin = prof.brakeMargin * diffConfig.brakeMarginMult;
    const maxDecel = (phys.brakeForce / phys.mass) * 0.90 * effectiveBrakeMargin;
    const segLength = (this.trackData.totalLength && N) ? (this.trackData.totalLength / N) : 3.8;

    let horizonTargetSpeed = Infinity;
    for (let step = 4; step <= brakeHorizonSamples; step += 4) {
      const scanIdx = (ai.sampleIndex + step) % N;
      const scanSample = samples[scanIdx];
      const distToScan = step * segLength;
      const allowedSpeed = Math.sqrt(
        scanSample.targetSpeed * scanSample.targetSpeed + 2 * maxDecel * distToScan,
      );
      if (allowedSpeed < horizonTargetSpeed) {
        horizonTargetSpeed = allowedSpeed;
      }
    }

    const effectiveSkill = prof.skill * diffConfig.skillMult;
    let targetSpeed = Math.min(curSample.targetSpeed, horizonTargetSpeed) * effectiveSkill;

    // DRS and Slipstream speed boosts
    if (ai.drsActive) targetSpeed += 3.8;
    if (ai.inDraft) targetSpeed += 3.2;

    // Cooldown autopilot at race end
    if (isCooldownAutopilot) targetSpeed *= 0.65;

    // 6. Collision Avoidance Speed Modulation
    if (ai.sensorBlockedFront && ai.sensorFrontDist < 16) {
      const frontSpeed = ai.sensorFrontSpeed || ai.speed;
      const distCushion = Math.max(0.1, (ai.sensorFrontDist - 3.5) / 12.5);
      const safeFollowSpeed = THREE.MathUtils.lerp(frontSpeed * 0.95, frontSpeed * 1.02, distCushion);
      targetSpeed = Math.min(targetSpeed, safeFollowSpeed);
    }

    // 7. Spin / Slide / Off-Track Recovery
    const isSpunOrSliding =
      Math.abs(diff) > 0.62 ||
      Math.abs(ai.angularVelocity || 0) > 0.52 ||
      Math.abs(ai.lateralVel || 0) > 2.8;

    const isOffTrack = Math.abs(ai.lateralDist || 0) > halfWidth * 0.95;

    if (isSpunOrSliding || isOffTrack) {
      targetSpeed = Math.min(targetSpeed, Math.max(14, ai.speed * 0.70));
      ai.aiStatusTag = isOffTrack ? "RIENTRO!" : "RECUPERO!";
      if (Math.abs(ai.speed) > 12) {
        this.spawnTireSmoke(ai);
      }
    }

    // 8. Acceleration / Braking Forces with Traction Control
    let accel = 0;
    const speedDelta = targetSpeed - ai.speed;
    const effectiveEngineForce = phys.engineForce * diffConfig.accelMult;

    if (speedDelta > 0.4) {
      const steerFactor = THREE.MathUtils.clamp(
        1.0 - (Math.abs(ai.steerAngle) / phys.steerRate) * 0.40,
        0.60,
        1.0,
      );
      const launchGrip = this.raceElapsedSeconds < 2.5
        ? 0.85 + effectiveSkill * 0.15
        : 0.96;
      accel = (effectiveEngineForce / phys.mass) * launchGrip * steerFactor;
      if (ai.inDraft) accel *= 1.10;
    } else if (speedDelta < -0.6) {
      accel = -(phys.brakeForce / phys.mass) * 0.92;
    }

    const effectiveMaxSpeed = phys.maxSpeed * diffConfig.topSpeedMult;
    ai.speed = THREE.MathUtils.clamp(
      ai.speed + accel * dt,
      6,
      effectiveMaxSpeed * (ai.drsActive ? 1.05 : 1.02),
    );

    // 9. World Position Integration
    const aiFwdX = Math.sin(ai.heading);
    const aiFwdZ = Math.cos(ai.heading);
    const aiRightX = aiFwdZ;
    const aiRightZ = -aiFwdX;

    ai.position.x += (aiFwdX * ai.speed + aiRightX * (ai.lateralVel || 0)) * dt;
    ai.position.z += (aiFwdZ * ai.speed + aiRightZ * (ai.lateralVel || 0)) * dt;

    this.updateSplineProgressAndWalls(ai, dt);
    this.updateGearAndRPM(ai, accel > 0 ? 1 : 0, dt);
    this.applyVisualDynamics(
      ai,
      accel,
      ai.steerAngle + (ai.angularVelocity || 0) * 0.5,
      accel < -3.0,
      dt,
    );
  },

  evaluateAISensorsAndOvertaking(ai, prof, halfWidth) {
    const forwardX = Math.sin(ai.heading);
    const forwardZ = Math.cos(ai.heading);
    const rightX = forwardZ;
    const rightZ = -forwardX;

    let minCenterDist = 99;
    let frontCarSpeed = ai.speed;
    let frontCarLat = 0;
    let leftBlocked = false;
    let rightBlocked = false;
    let sideAvoidOffset = 0;
    let pressuredFromBehind = false;
    let inDraft = false;

    for (let other of this.allRacers) {
      if (other === ai) continue;
      if (Math.abs(other.position.y - ai.position.y) > 3.2) continue;

      const dx = other.position.x - ai.position.x;
      const dz = other.position.z - ai.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 900) continue; // 30m detection radius

      const fwdProj = dx * forwardX + dz * forwardZ;
      const latProj = dx * rightX + dz * rightZ;

      if (fwdProj > 0 && fwdProj < 32) {
        if (Math.abs(latProj) < 2.3 && fwdProj < minCenterDist) {
          minCenterDist = fwdProj;
          frontCarSpeed = other.speed;
          frontCarLat = latProj;
        }

        // Slipstream drafting detection between 8m and 28m
        if (fwdProj > 8 && fwdProj < 28 && Math.abs(latProj) < 2.4 && ai.speed > 24) {
          inDraft = true;
        }

        if (latProj < -1.2 && latProj > -5.2 && fwdProj < 22) {
          leftBlocked = true;
        }
        if (latProj > 1.2 && latProj < 5.2 && fwdProj < 22) {
          rightBlocked = true;
        }
      } else if (Math.abs(fwdProj) < 5.8 && Math.abs(latProj) < 3.2) {
        if (latProj > 0) {
          sideAvoidOffset -= 1.2;
        } else {
          sideAvoidOffset += 1.2;
        }
      } else if (fwdProj < 0 && fwdProj > -10.0 && Math.abs(latProj) < 2.8) {
        pressuredFromBehind = true;
      }
    }

    ai.sensorFrontDist = minCenterDist;
    ai.sensorBlockedFront = minCenterDist < 20;
    ai.sensorFrontSpeed = frontCarSpeed;
    ai.inDraft = inDraft;

    const diff = this.getDifficultyConfig();
    const aggression = prof.aggression * diff.aggressionMult;
    const trackMargin = halfWidth - 1.8;

    if (ai.sensorBlockedFront) {
      const canGoLeft = !leftBlocked && (ai.lateralDist - 3.8 > -trackMargin);
      const canGoRight = !rightBlocked && (ai.lateralDist + 3.8 < trackMargin);

      if (minCenterDist < 14 && (canGoLeft || canGoRight)) {
        let passRight = canGoRight;
        if (frontCarLat < -0.3 && canGoRight) {
          passRight = true;
        } else if (frontCarLat > 0.3 && canGoLeft) {
          passRight = false;
        } else if (canGoLeft && canGoRight) {
          passRight = ai.lateralDist < 0;
        }

        const targetBias = (passRight ? 4.2 : -4.2) * Math.min(1.25, aggression);
        ai.overtakeBias = THREE.MathUtils.lerp(ai.overtakeBias, targetBias, 0.25);
        ai.aiStatusTag = "SORPASSO";
      } else if (inDraft) {
        ai.overtakeBias = THREE.MathUtils.lerp(ai.overtakeBias, frontCarLat * 0.6, 0.15);
        ai.aiStatusTag = "SCIA";
      } else {
        ai.overtakeBias = THREE.MathUtils.lerp(ai.overtakeBias, sideAvoidOffset, 0.2);
        ai.aiStatusTag = "SEGUI";
      }
    } else {
      if (Math.abs(sideAvoidOffset) > 0.1) {
        ai.overtakeBias = THREE.MathUtils.lerp(ai.overtakeBias, sideAvoidOffset, 0.2);
      } else {
        ai.overtakeBias *= 0.82;
        if (Math.abs(ai.overtakeBias) < 0.2) {
          ai.overtakeBias = 0;
          ai.aiStatusTag = ai.drsActive ? "DRS" : "";
        }
      }
    }

    // Defend inside apex on hard/legend when pressured from behind
    if (pressuredFromBehind && diff.aggressionMult >= 1.0 && ai.errorWideTimer <= 0) {
      const upcomingIdx = (ai.sampleIndex + 20) % this.trackData.samples.length;
      const curv = this.trackData.samples[upcomingIdx].curvature;
      if (curv > 0.12) {
        const insideDir = Math.sign(this.trackData.samples[upcomingIdx].signedCurvature || 1);
        ai.overtakeBias = THREE.MathUtils.lerp(ai.overtakeBias, insideDir * 2.2, 0.15);
        ai.aiStatusTag = "DIFESA";
      }
    }

    // Pressure mistake chance (scaled by difficulty errorMult)
    const upcomingCurv = this.trackData.samples[(ai.sampleIndex + 22) % this.trackData.samples.length].curvature;
    if (pressuredFromBehind && upcomingCurv > 0.14 && ai.errorWideTimer <= 0) {
      const mistakeChance = prof.errorRate * diff.errorMult * 0.06;
      if (Math.random() < mistakeChance) {
        ai.errorWideTimer = 1.35;
        this.spawnTireSmoke(ai);
      }
    }
  },

  getTrackElevationAndNormal(x, z, refIdx = 0) {
    if (!this.trackData || !this.trackData.samples || !this.trackData.samples.length) {
      return { y: 0, normal: new THREE.Vector3(0, 1, 0), bestIdx: 0 };
    }
    const samples = this.trackData.samples;
    const N = samples.length;
    const start = (refIdx !== undefined && refIdx >= 0) ? (refIdx % N) : 0;

    let bestIdx = start;
    let bestDistSq = Infinity;
    const searchWin = 14;

    for (let offset = -searchWin; offset <= searchWin; offset++) {
      const idx = (start + offset + N) % N;
      const pt = samples[idx].point;
      const dx = x - pt.x;
      const dz = z - pt.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }

    const nextIdx = (bestIdx + 1) % N;
    const prevIdx = (bestIdx - 1 + N) % N;
    const s0 = samples[bestIdx];
    const sNext = samples[nextIdx];
    const sPrev = samples[prevIdx];

    // Check segment [s0 -> sNext]
    const vNextX = sNext.point.x - s0.point.x;
    const vNextZ = sNext.point.z - s0.point.z;
    const lenNextSq = vNextX * vNextX + vNextZ * vNextZ;
    const dotNext = (x - s0.point.x) * vNextX + (z - s0.point.z) * vNextZ;

    let sA = s0, sB = sNext, t = 0;
    if (dotNext >= 0 && lenNextSq > 0.0001) {
      t = Math.max(0, Math.min(1, dotNext / lenNextSq));
      sA = s0;
      sB = sNext;
    } else {
      // Check segment [sPrev -> s0]
      const vPrevX = s0.point.x - sPrev.point.x;
      const vPrevZ = s0.point.z - sPrev.point.z;
      const lenPrevSq = vPrevX * vPrevX + vPrevZ * vPrevZ;
      if (lenPrevSq > 0.0001) {
        const dotPrev = (x - sPrev.point.x) * vPrevX + (z - sPrev.point.z) * vPrevZ;
        t = Math.max(0, Math.min(1, dotPrev / lenPrevSq));
        sA = sPrev;
        sB = s0;
      }
    }

    const pX = THREE.MathUtils.lerp(sA.point.x, sB.point.x, t);
    const pY = THREE.MathUtils.lerp(sA.point.y, sB.point.y, t);
    const pZ = THREE.MathUtils.lerp(sA.point.z, sB.point.z, t);

    const nA = sA.normal || new THREE.Vector3(0, 1, 0);
    const nB = sB.normal || new THREE.Vector3(0, 1, 0);
    const normX = THREE.MathUtils.lerp(nA.x, nB.x, t);
    const normY = THREE.MathUtils.lerp(nA.y, nB.y, t);
    const normZ = THREE.MathUtils.lerp(nA.z, nB.z, t);
    const nLen = Math.hypot(normX, normY, normZ) || 1;
    const nx = normX / nLen;
    const ny = Math.max(0.05, normY / nLen);
    const nz = normZ / nLen;

    // Track road mesh surface sits at center line + 0.03
    const baseY = pY + 0.03;
    const surfaceY = baseY - ((x - pX) * nx + (z - pZ) * nz) / ny;

    return {
      y: surfaceY,
      normal: new THREE.Vector3(nx, ny, nz),
      bestIdx,
    };
  },

  updateSplineProgressAndWalls(car, dt) {
    const samples = this.trackData.samples;
    const N = samples.length;

    let bestIdx = car.sampleIndex;
    let bestDistSq = Infinity;
    const searchRadius = 55;

    for (let offset = -searchRadius; offset <= searchRadius; offset++) {
      const idx = (car.sampleIndex + offset + N) % N;
      const pt = samples[idx].point;
      const dx = car.position.x - pt.x;
      const dz = car.position.z - pt.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }

    const prevIdx = car.sampleIndex;
    car.sampleIndex = bestIdx;
    const closestSample = samples[bestIdx];

    const surfaceInfo = this.getTrackElevationAndNormal(
      car.position.x,
      car.position.z,
      bestIdx,
    );
    car.trackSurfaceY = surfaceInfo.y;
    car.trackNormal = surfaceInfo.normal;

    car.position.y = THREE.MathUtils.lerp(
      car.position.y,
      surfaceInfo.y,
      Math.min(1, dt * 25),
    );

    // Lap Crossing Detection (scaled for SAMPLE_COUNT = 1500)
    if (!car.hasStartedFirstLap && bestIdx < 160 && prevIdx > N - 160) {
      car.hasStartedFirstLap = true;
      car.lapStartTime = performance.now();
    } else if (car.hasStartedFirstLap && bestIdx < 120 && prevIdx > N - 120) {
      const now = performance.now();
      const lapTimeMs = now - car.lapStartTime;
      car.lapStartTime = now;

      if (lapTimeMs > 4000) {
        if (!car.bestLapTime || lapTimeMs < car.bestLapTime) {
          car.bestLapTime = lapTimeMs;
        }

        if (car.isPlayer) {
          if (!GameApp.profile.records[this.trackConfig.id]) {
            GameApp.profile.records[this.trackConfig.id] = { bestLap: null, bestPos: null, trophies: 0 };
          }
          const rec = GameApp.profile.records[this.trackConfig.id];
          if (!rec.bestLap || lapTimeMs < rec.bestLap) {
            rec.bestLap = lapTimeMs;
            StorageManager.save(GameApp.profile);
            UI.showToast(
              `Nuovo Record sul Giro: ${UI.formatLapTime(lapTimeMs)}!`,
              "fa-stopwatch",
            );
          }
        }
      }

      car.lap += 1;
      if (car.isPlayer && typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
        NetworkEngine.sendCheckpointPass(car.lap, car.sampleIndex, car.totalProgress);
      }

      if ((this.mode === "race" || this.mode === "lan_race") && car.lap > this.totalLaps && !car.finished) {
        car.finished = true;
        let elapsed;
        if (this.mode === "lan_race" && this.raceStartTimeEpoch && typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
          elapsed = Math.max(1000, Math.round(NetworkEngine.getServerTime() - this.raceStartTimeEpoch));
        } else {
          const nowMs = performance.now();
          elapsed = this.raceStartEpoch ? (nowMs - this.raceStartEpoch) : (this.raceElapsedSeconds * 1000);
        }
        car.finishTime = Math.max(1000, Math.round(elapsed));

        if (car.isPlayer) {
          if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
            NetworkEngine.sendFinishRace(car.finishTime, car.bestLapTime);
          }
          this.completeRaceSession();
        }
      }
    }

    if (car.hasStartedFirstLap && !car.finished) {
      car.currentLapTime = performance.now() - car.lapStartTime;
    }

    const normU = bestIdx / N;
    car.totalProgress = (car.hasStartedFirstLap ? car.lap - 1 : -1) + normU;

    const relVec = new THREE.Vector3(
      car.position.x - closestSample.point.x,
      0,
      car.position.z - closestSample.point.z,
    );
    const lateralDist = relVec.dot(closestSample.right);
    car.lateralDist = lateralDist;
    const maxAllowedLateral = this.trackData.barrierOffset
      ? this.trackData.barrierOffset - 1.1
      : this.trackData.halfWidth + 4.1;

    // Progressive gravel trap / grass slowdown outside track asphalt
    const offTrackDist = Math.abs(lateralDist) - (this.trackData.halfWidth + 0.25);
    if (offTrackDist > 0 && this.trackConfig.id !== "monaco") {
      const gravelDrag = THREE.MathUtils.clamp(0.42 + offTrackDist * 0.16, 0.42, 0.72);
      car.speed *= 1 - gravelDrag * dt;
      car.tireDirtyTimer = Math.min(1.0, (car.tireDirtyTimer || 0) + dt * 1.5);
    }

    // 4-Corner Oriented Bounding Box vs Track Barriers
    const hFwd = car.halfLength || 2.30;
    const hSide = car.halfWidth || 1.02;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    const fwdX = sinH, fwdZ = cosH;
    const rightX = cosH, rightZ = -sinH;

    // World-space coordinates of the 4 vehicle corners
    const corners = [
      { x: car.position.x + fwdX * hFwd + rightX * hSide, z: car.position.z + fwdZ * hFwd + rightZ * hSide, isFront: true, isRight: true },
      { x: car.position.x + fwdX * hFwd - rightX * hSide, z: car.position.z + fwdZ * hFwd - rightZ * hSide, isFront: true, isRight: false },
      { x: car.position.x - fwdX * hFwd + rightX * hSide, z: car.position.z - fwdZ * hFwd + rightZ * hSide, isFront: false, isRight: true },
      { x: car.position.x - fwdX * hFwd - rightX * hSide, z: car.position.z - fwdZ * hFwd - rightZ * hSide, isFront: false, isRight: false }
    ];

    let maxRightLat = -Infinity;
    let minLeftLat = Infinity;
    let maxRightCorner = corners[0];
    let minLeftCorner = corners[1];

    for (let c of corners) {
      const cdx = c.x - closestSample.point.x;
      const cdz = c.z - closestSample.point.z;
      const cLat = cdx * closestSample.right.x + cdz * closestSample.right.z;
      if (cLat > maxRightLat) {
        maxRightLat = cLat;
        maxRightCorner = c;
      }
      if (cLat < minLeftLat) {
        minLeftLat = cLat;
        minLeftCorner = c;
      }
    }

    const hitRight = maxRightLat > maxAllowedLateral;
    const hitLeft = minLeftLat < -maxAllowedLateral;

    if (hitRight || hitLeft) {
      const side = hitRight ? 1 : -1;
      const penetration = hitRight ? (maxRightLat - maxAllowedLateral) : (-maxAllowedLateral - minLeftLat);
      const contactCorner = hitRight ? maxRightCorner : minLeftCorner;

      // Inward barrier normal (points towards center of track)
      const nWallX = -side * closestSample.right.x;
      const nWallZ = -side * closestSample.right.z;
      const tWallX = closestSample.tangent.x;
      const tWallZ = closestSample.tangent.z;

      // Contact lever arm from car center of mass
      const rx = contactCorner.x - car.position.x;
      const rz = contactCorner.z - car.position.z;

      // Linear velocity in world space
      const vLinX = fwdX * car.speed + rightX * (car.lateralVel || 0);
      const vLinZ = fwdZ * car.speed + rightZ * (car.lateralVel || 0);

      // Contact point velocity: v_contact = v_lin + (omega * rZ, -omega * rX)
      const omega = car.angularVelocity || 0;
      const vContX = vLinX + omega * rz;
      const vContZ = vLinZ - omega * rx;

      // Normal velocity into the wall (positive = moving towards wall)
      const vn = -(vContX * nWallX + vContZ * nWallZ);
      const vt = vContX * tWallX + vContZ * tWallZ;

      const m = car.mass || 1200;
      const I = car.inertia || (m * 2.2);
      const crossN = rz * nWallX - rx * nWallZ;
      const kn = (1 / m) + (crossN * crossN) / I;

      if (vn > 0.05 && kn > 0.0001) {
        // Impact restitution (realistic armco / tecpro barrier damping)
        const eWall = 0.22;
        const Jn = ((1 + eWall) * vn) / kn;

        // Tangential friction impulse (barrier scrape resistance)
        const crossT = rz * tWallX - rx * tWallZ;
        const kt = (1 / m) + (crossT * crossT) / I;
        const muWall = 0.52;
        let Jt = 0;
        if (kt > 0.0001) {
          Jt = THREE.MathUtils.clamp(-vt / kt, -muWall * Jn, muWall * Jn);
        }

        const totalJx = Jn * nWallX + Jt * tWallX;
        const totalJz = Jn * nWallZ + Jt * tWallZ;

        const dVx = totalJx / m;
        const dVz = totalJz / m;
        const dOmega = (rz * totalJx - rx * totalJz) / I;

        const impactKmh = vn * 3.6;

        // Inelastic chassis crumple penalty (calibrated to penalize mistakes without dead-stopping)
        if (impactKmh > 10) {
          const crumpleLoss = THREE.MathUtils.clamp(impactKmh / 260, 0.06, 0.32);
          car.speed *= (1.0 - crumpleLoss);
          car.tireDirtyTimer = Math.min(1.2, (car.tireDirtyTimer || 0) + (impactKmh / 90));
        }

        // Project velocity change back to car local frame
        car.speed += dVx * fwdX + dVz * fwdZ;
        car.lateralVel = (car.lateralVel || 0) + (dVx * rightX + dVz * rightZ);
        car.angularVelocity = omega + dOmega;

        // Visual suspension impact jolt
        car.impactRoll = THREE.MathUtils.clamp((car.impactRoll || 0) + (-side * 0.14), -0.22, 0.22);
        car.impactPitch = THREE.MathUtils.clamp((car.impactPitch || 0) + (contactCorner.isFront ? -0.14 : 0.09), -0.18, 0.18);

        // Feedback for player
        if (car.isPlayer) {
          if (impactKmh > 3.0) {
            AudioEngine.playCollisionImpact(impactKmh, true);
            this.triggerCameraShake(Math.min(1.0, impactKmh / 32));
            if (impactKmh > 24) {
              this.triggerImpactVignette();
            }
          }
        }

        // Spawn bright titanium/steel barrier sparks
        if (typeof GraphicsEngine !== "undefined" && GraphicsEngine.spawnCollisionSparks) {
          const sparkY = closestSample.point.y + 0.38;
          GraphicsEngine.spawnCollisionSparks(
            { x: contactCorner.x, y: sparkY, z: contactCorner.z },
            { x: nWallX, z: nWallZ },
            impactKmh > 35 ? 12 : 7,
            Math.min(1.6, impactKmh / 30)
          );
        }
      }

      // Positional separation (prevent clipping outside wall)
      const pushDist = penetration + 0.02;
      car.position.x += nWallX * pushDist;
      car.position.z += nWallZ * pushDist;
      car.lateralDist -= side * pushDist;

      // High-speed grinding / scraping along the barrier (penalizes wall riding)
      if (Math.abs(car.speed) > 7.0) {
        car.speed *= (1 - 0.52 * dt);

        const trackYaw = Math.atan2(closestSample.tangent.x, closestSample.tangent.z);
        let angleErr = trackYaw - car.heading;
        while (angleErr > Math.PI) angleErr -= Math.PI * 2;
        while (angleErr < -Math.PI) angleErr += Math.PI * 2;
        car.heading += angleErr * dt * 4.2;

        if (car.isPlayer) {
          const now = performance.now();
          if (now - (car.lastScrapeTime || 0) > 80) {
            car.lastScrapeTime = now;
            AudioEngine.playScrapeSound(Math.min(1.0, Math.abs(car.speed) / 50));
          }
          if (typeof GraphicsEngine !== "undefined" && GraphicsEngine.spawnCollisionSparks && Math.random() < 0.6) {
            const sparkY = closestSample.point.y + 0.38;
            GraphicsEngine.spawnCollisionSparks(
              { x: contactCorner.x, y: sparkY, z: contactCorner.z },
              { x: nWallX, z: nWallZ },
              4,
              0.8
            );
          }
        }
      }
    }
  },

  checkCarOBBCollision(a, b) {
    if (Math.abs(a.position.y - b.position.y) > 2.5) return null;

    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const maxDiagA = Math.hypot(a.halfLength || 2.3, a.halfWidth || 1.02);
    const maxDiagB = Math.hypot(b.halfLength || 2.3, b.halfWidth || 1.02);
    const broadphaseDist = maxDiagA + maxDiagB;
    if (dx * dx + dz * dz > broadphaseDist * broadphaseDist) {
      return null;
    }

    // Car A axes and extents
    const sinA = Math.sin(a.heading);
    const cosA = Math.cos(a.heading);
    const aFwdX = sinA, aFwdZ = cosA;
    const aRightX = cosA, aRightZ = -sinA;
    const aHfwd = a.halfLength || 2.3;
    const aHside = a.halfWidth || 1.02;

    // Car B axes and extents
    const sinB = Math.sin(b.heading);
    const cosB = Math.cos(b.heading);
    const bFwdX = sinB, bFwdZ = cosB;
    const bRightX = cosB, bRightZ = -sinB;
    const bHfwd = b.halfLength || 2.3;
    const bHside = b.halfWidth || 1.02;

    // Candidate separation axes (4 axes in 2D SAT)
    const axes = [
      { x: aFwdX, z: aFwdZ },
      { x: aRightX, z: aRightZ },
      { x: bFwdX, z: bFwdZ },
      { x: bRightX, z: bRightZ }
    ];

    let minOverlap = Infinity;
    let collisionNormal = null;

    for (let i = 0; i < 4; i++) {
      const ax = axes[i].x;
      const az = axes[i].z;

      // Project Box A radius
      const rA = aHfwd * Math.abs(aFwdX * ax + aFwdZ * az) +
                 aHside * Math.abs(aRightX * ax + aRightZ * az);

      // Project Box B radius
      const rB = bHfwd * Math.abs(bFwdX * ax + bFwdZ * az) +
                 bHside * Math.abs(bRightX * ax + bRightZ * az);

      // Project distance vector D = B - A
      const distProj = dx * ax + dz * az;
      const overlap = (rA + rB) - Math.abs(distProj);

      if (overlap <= 0) {
        // Separating axis found -> No intersection
        return null;
      }

      if (overlap < minOverlap) {
        minOverlap = overlap;
        const sign = distProj >= 0 ? 1 : -1;
        collisionNormal = { x: ax * sign, z: az * sign };
      }
    }

    // Boxes intersect! Compute contact centroid
    const cornersA = [
      { x: a.position.x + aFwdX * aHfwd + aRightX * aHside, z: a.position.z + aFwdZ * aHfwd + aRightZ * aHside },
      { x: a.position.x + aFwdX * aHfwd - aRightX * aHside, z: a.position.z + aFwdZ * aHfwd - aRightZ * aHside },
      { x: a.position.x - aFwdX * aHfwd + aRightX * aHside, z: a.position.z - aFwdZ * aHfwd + aRightZ * aHside },
      { x: a.position.x - aFwdX * aHfwd - aRightX * aHside, z: a.position.z - aFwdZ * aHfwd - aRightZ * aHside }
    ];

    const cornersB = [
      { x: b.position.x + bFwdX * bHfwd + bRightX * bHside, z: b.position.z + bFwdZ * bHfwd + bRightZ * bHside },
      { x: b.position.x + bFwdX * bHfwd - bRightX * bHside, z: b.position.z + bFwdZ * bHfwd - bRightZ * bHside },
      { x: b.position.x - bFwdX * bHfwd + bRightX * bHside, z: b.position.z - bFwdZ * bHfwd + bRightZ * bHside },
      { x: b.position.x - bFwdX * bHfwd - bRightX * bHside, z: b.position.z - bFwdZ * bHfwd - bRightZ * bHside }
    ];

    let contactX = 0;
    let contactZ = 0;
    let contactCount = 0;

    for (let c of cornersA) {
      const vX = c.x - b.position.x;
      const vZ = c.z - b.position.z;
      const pFwd = vX * bFwdX + vZ * bFwdZ;
      const pSide = vX * bRightX + vZ * bRightZ;
      if (Math.abs(pFwd) <= bHfwd + 0.1 && Math.abs(pSide) <= bHside + 0.1) {
        contactX += c.x;
        contactZ += c.z;
        contactCount++;
      }
    }

    for (let c of cornersB) {
      const vX = c.x - a.position.x;
      const vZ = c.z - a.position.z;
      const pFwd = vX * aFwdX + vZ * aFwdZ;
      const pSide = vX * aRightX + vZ * aRightZ;
      if (Math.abs(pFwd) <= aHfwd + 0.1 && Math.abs(pSide) <= aHside + 0.1) {
        contactX += c.x;
        contactZ += c.z;
        contactCount++;
      }
    }

    if (contactCount > 0) {
      contactX /= contactCount;
      contactZ /= contactCount;
    } else {
      contactX = (a.position.x + b.position.x) * 0.5;
      contactZ = (a.position.z + b.position.z) * 0.5;
    }

    return {
      normal: collisionNormal,
      overlap: minOverlap,
      contact: { x: contactX, z: contactZ }
    };
  },

  resolveCarCollisionPair(a, b, col) {
    const normal = col.normal;
    const overlap = col.overlap;
    const contact = col.contact;

    const mA = a.mass || 1200;
    const mB = b.mass || 1200;
    const invMassA = a.isRemotePlayer ? 0 : 1 / mA;
    const invMassB = b.isRemotePlayer ? 0 : 1 / mB;
    const invMassSum = invMassA + invMassB;
    if (invMassSum === 0) return;

    // Positional separation (smooth Baumgarte penetration resolution)
    const slop = 0.015;
    const sepMag = Math.max(0, overlap - slop) / invMassSum;
    const posPercent = 0.85;

    a.position.x -= normal.x * (sepMag * invMassA) * posPercent;
    a.position.z -= normal.z * (sepMag * invMassA) * posPercent;
    b.position.x += normal.x * (sepMag * invMassB) * posPercent;
    b.position.z += normal.z * (sepMag * invMassB) * posPercent;

    // Contact radii (lever arms from center of mass)
    const rAx = contact.x - a.position.x;
    const rAz = contact.z - a.position.z;
    const rBx = contact.x - b.position.x;
    const rBz = contact.z - b.position.z;

    // Linear world velocities
    const aSin = Math.sin(a.heading);
    const aCos = Math.cos(a.heading);
    const vAx = aSin * a.speed + aCos * (a.lateralVel || 0);
    const vAz = aCos * a.speed - aSin * (a.lateralVel || 0);

    const bSin = Math.sin(b.heading);
    const bCos = Math.cos(b.heading);
    const vBx = bSin * b.speed + bCos * (b.lateralVel || 0);
    const vBz = bCos * b.speed - bSin * (b.lateralVel || 0);

    // Rotational velocities at contact point: (omega * rZ, -omega * rX)
    const aOmega = a.angularVelocity || 0;
    const bOmega = b.angularVelocity || 0;
    const vA_contX = vAx + aOmega * rAz;
    const vA_contZ = vAz - aOmega * rAx;
    const vB_contX = vBx + bOmega * rBz;
    const vB_contZ = vBz - bOmega * rBx;

    // Relative contact velocity (B relative to A)
    const vRelX = vB_contX - vA_contX;
    const vRelZ = vB_contZ - vA_contZ;

    // Normal velocity along collision normal (positive = separating)
    const vn = vRelX * normal.x + vRelZ * normal.z;

    const IA = a.inertia || (mA * 2.2);
    const IB = b.inertia || (mB * 2.2);
    const invIA = a.isRemotePlayer ? 0 : 1 / IA;
    const invIB = b.isRemotePlayer ? 0 : 1 / IB;

    // 2D rotational moment arm: rZ * Nx - rX * Nz
    const crossA = rAz * normal.x - rAx * normal.z;
    const crossB = rBz * normal.x - rBx * normal.z;

    const kn = invMassSum + (crossA * crossA) * invIA + (crossB * crossB) * invIB;

    const isApproaching = vn < 0;
    const impactSpeed = Math.abs(vn);

    if (isApproaching && kn > 0.0001) {
      // Restitution: 0.28 for firm, realistic automotive body contact
      const restitution = 0.28;
      const Jn = (-(1 + restitution) * vn) / kn;

      // Friction impulse along contact tangent
      const tx = -normal.z;
      const tz = normal.x;
      const vt = vRelX * tx + vRelZ * tz;

      const crossAt = rAz * tx - rAx * tz;
      const crossBt = rBz * tx - rBx * tz;
      const kt = invMassSum + (crossAt * crossAt) * invIA + (crossBt * crossBt) * invIB;

      const mu = 0.38; // Rubber/composite bodywork kinetic friction
      let Jt = 0;
      if (kt > 0.0001) {
        Jt = THREE.MathUtils.clamp(-vt / kt, -mu * Jn, mu * Jn);
      }

      // Total impulse vector J = Jn * normal + Jt * tangent
      const Jx = Jn * normal.x + Jt * tx;
      const Jz = Jn * normal.z + Jt * tz;

      // Apply to Car A
      if (!a.isRemotePlayer) {
        const dVAx = -Jx * invMassA;
        const dVAz = -Jz * invMassA;
        a.speed += dVAx * aSin + dVAz * aCos;
        a.lateralVel = (a.lateralVel || 0) + (dVAx * aCos - dVAz * aSin);
        a.angularVelocity = aOmega - (rAz * Jx - rAx * Jz) * invIA;

        // Visual suspension jolt
        a.impactRoll = THREE.MathUtils.clamp((a.impactRoll || 0) - (normal.x * aCos - normal.z * aSin) * 0.08, -0.15, 0.15);
        a.impactPitch = THREE.MathUtils.clamp((a.impactPitch || 0) - (normal.x * aSin + normal.z * aCos) * 0.08, -0.12, 0.12);
      }

      // Apply to Car B
      if (!b.isRemotePlayer) {
        const dVBx = Jx * invMassB;
        const dVBz = Jz * invMassB;
        b.speed += dVBx * bSin + dVBz * bCos;
        b.lateralVel = (b.lateralVel || 0) + (dVBx * bCos - dVBz * bSin);
        b.angularVelocity = bOmega + (rBz * Jx - rBx * Jz) * invIB;

        // Visual suspension jolt
        b.impactRoll = THREE.MathUtils.clamp((b.impactRoll || 0) + (normal.x * bCos - normal.z * bSin) * 0.08, -0.15, 0.15);
        b.impactPitch = THREE.MathUtils.clamp((b.impactPitch || 0) + (normal.x * bSin + normal.z * bCos) * 0.08, -0.12, 0.12);
      }

      // Inelastic collision penalty for high-speed divebombing / rear-ending
      const relKmhInit = impactSpeed * 3.6;
      if (relKmhInit > 18) {
        const divebombPenalty = THREE.MathUtils.clamp((relKmhInit - 18) / 200, 0.04, 0.18);
        const aRamming = (vAx * normal.x + vAz * normal.z) > 1.2;
        const bRamming = (vBx * (-normal.x) + vBz * (-normal.z)) > 1.2;
        if (!a.isRemotePlayer && aRamming) {
          a.speed *= (1.0 - divebombPenalty);
          a.tireDirtyTimer = Math.min(0.8, (a.tireDirtyTimer || 0) + 0.35);
        }
        if (!b.isRemotePlayer && bRamming) {
          b.speed *= (1.0 - divebombPenalty);
          b.tireDirtyTimer = Math.min(0.8, (b.tireDirtyTimer || 0) + 0.35);
        }
      }
    }

    // Audio & Feedback Effects
    const relKmh = impactSpeed * 3.6;
    const isPlayerInvolved = a.isPlayer || b.isPlayer;

    if (isPlayerInvolved) {
      if (relKmh > 3.0) {
        AudioEngine.playCollisionImpact(relKmh, false);
        this.triggerCameraShake(Math.min(1.0, relKmh / 36));
        if (relKmh > 24) {
          this.triggerImpactVignette();
        }
      } else if (Math.abs(a.speed) > 10 || Math.abs(b.speed) > 10) {
        const now = performance.now();
        if (now - (a.lastScrapeTime || 0) > 110) {
          a.lastScrapeTime = now;
          AudioEngine.playScrapeSound(0.35);
        }
      }

      // Spawn collision sparks and tire smoke at contact point
      if (typeof GraphicsEngine !== "undefined" && GraphicsEngine.spawnCollisionSparks) {
        const sparkY = ((a.position.y + b.position.y) * 0.5) + 0.35;
        GraphicsEngine.spawnCollisionSparks(
          { x: contact.x, y: sparkY, z: contact.z },
          normal,
          relKmh > 20 ? 10 : 5,
          Math.min(1.5, relKmh / 25)
        );
      }
      if (relKmh > 18) {
        this.spawnTireSmoke(a);
        this.spawnTireSmoke(b);
      }
    }
  },

  resolveCarCollisions() {
    for (let i = 0; i < this.allRacers.length; i++) {
      for (let j = i + 1; j < this.allRacers.length; j++) {
        const a = this.allRacers[i];
        const b = this.allRacers[j];
        const col = this.checkCarOBBCollision(a, b);
        if (col) {
          this.resolveCarCollisionPair(a, b, col);
        }
      }
    }
  },

  sampleTorqueCurve(torqueCurve, rpm) {
    if (!torqueCurve || torqueCurve.length === 0) return 300;
    if (rpm <= torqueCurve[0][0]) return torqueCurve[0][1];
    if (rpm >= torqueCurve[torqueCurve.length - 1][0])
      return torqueCurve[torqueCurve.length - 1][1];
    for (let i = 0; i < torqueCurve.length - 1; i++) {
      if (rpm >= torqueCurve[i][0] && rpm <= torqueCurve[i + 1][0]) {
        const t =
          (rpm - torqueCurve[i][0]) /
          (torqueCurve[i + 1][0] - torqueCurve[i][0]);
        return (
          torqueCurve[i][1] + t * (torqueCurve[i + 1][1] - torqueCurve[i][1])
        );
      }
    }
    return torqueCurve[0][1];
  },

  manualGearShift(direction) {
    if (!this.player || this.player.finished) return;
    const phys = this.player.carConfig.physics;
    const maxGears = (phys.gearRatios && phys.gearRatios.length) || 6;

    this.player.isManualMode = true;

    if (direction < 0 && (this.player.gear === 1 || this.player.manualGear === 1)) {
      this.player.gear = "R";
      this.player.manualGear = "R";
      AudioEngine.playUIClick();
      return;
    }
    if (direction > 0 && (this.player.gear === "R" || this.player.manualGear === "R")) {
      this.player.gear = 1;
      this.player.manualGear = 1;
      if (this.player.speed < 0) this.player.speed = 0;
      AudioEngine.playUIClick();
      return;
    }

    const cur = this.player.manualGear;
    const currentGear =
      typeof cur === "number"
        ? cur
        : typeof this.player.gear === "number"
          ? this.player.gear
          : 1;
    const newGear = THREE.MathUtils.clamp(currentGear + direction, 1, maxGears);
    if (newGear > currentGear && this.player.rpm > 4500) {
      AudioEngine.playGearShiftBang(
        this.player.carConfig ? this.player.carConfig.id : "gt_comp",
      );
    } else if (newGear < currentGear && this.player.rpm > 3800) {
      AudioEngine.playPopSound(null, 0.42);
    }
    this.player.manualGear = newGear;
    this.player.gear = newGear;
    AudioEngine.playUIClick();
  },

  toggleTransmissionMode() {
    if (!this.player) return;
    this.player.isManualMode = !this.player.isManualMode;
    if (!this.player.isManualMode) {
      this.player.manualGear = null;
    } else {
      this.player.manualGear = typeof this.player.gear === "number" ? this.player.gear : 1;
    }
    AudioEngine.playUIClick();
    if (typeof UI !== "undefined" && UI.showToast) {
      UI.showToast(
        this.player.isManualMode ? "CAMBIO MANUALE ATTIVATO (K/L)" : "CAMBIO AUTOMATICO ATTIVATO (DRIVE)",
        "fa-gear",
      );
    }
  },

  updateGearAndRPM(car, throttle, dt = 0.016) {
    const phys = car.carConfig.physics;
    const gearRatios = phys.gearRatios || [3.28, 2.13, 1.52, 1.15, 0.92, 0.74];
    const maxGears = gearRatios.length;
    const finalDrive = phys.finalDrive || 3.8;
    const tireRadius = phys.tireRadius || 0.33;
    const idleRPM = phys.idleRPM || 850;
    const redlineRPM = phys.redlineRPM || 8200;
    const shiftRPM = phys.shiftRPM || redlineRPM * 0.92;

    if (typeof car.shiftCooldown !== "number") car.shiftCooldown = 0;
    car.shiftCooldown = Math.max(0, car.shiftCooldown - dt);

    const speedAbs = Math.abs(car.speed);
    const wheelRPS = speedAbs / (2 * Math.PI * tireRadius);

    // 1. Retromarcia
    if (car.gear === "R") {
      const revPct = Math.min(1, speedAbs / 16);
      const isReversingThrottle = this.keys && this.keys.down;
      const targetRPM = idleRPM + (isReversingThrottle ? revPct * (redlineRPM - idleRPM) * 0.7 + 1200 : 0);
      car.rpm = Math.round(THREE.MathUtils.clamp(targetRPM, idleRPM, redlineRPM));
      return;
    }

    // 2. Se la velocità è negativa ma non è in R e c'è acceleratore, torna subito in prima marcia
    if (car.speed < -0.2 && throttle > 0) {
      car.gear = 1;
      car.manualGear = car.isManualMode ? 1 : null;
      if (car.speed < 0) car.speed = 0;
    }

    // 3. Neutral da fermi se non si accelera
    if (speedAbs < 0.35 && throttle === 0) {
      car.gear = "N";
      car.rpm = Math.round(idleRPM);
      return;
    }

    // 4. Determinazione Marcia: Manuale vs Cambio Automatico Sportivo
    const prevGearIdx = typeof car.gear === "number" ? car.gear - 1 : 0;
    let gearIdx = prevGearIdx;

    if (car.isPlayer && car.isManualMode && typeof car.manualGear === "number") {
      gearIdx = THREE.MathUtils.clamp(car.manualGear - 1, 0, maxGears - 1);
    } else {
      // =======================================================================
      // CAMBIO AUTOMATICO RACING CON DOWNSHIFT INTELLIGENTE A TUTTE LE ANDATURE
      // =======================================================================
      if (speedAbs < 2.5) {
        // Da fermi o a passo d'uomo (< 9 km/h): SEMPRE 1a marcia
        gearIdx = 0;
        car.shiftCooldown = 0;
      } else {
        const currentMechRPM = wheelRPS * gearRatios[prevGearIdx] * finalDrive * 60;

        // Se l'auto è rallentata bruscamente per una curva e si trova in marce alte,
        // annulla il cooldown per scalare tempestivamente!
        if (gearIdx >= 4 && speedAbs < 32.0) car.shiftCooldown = 0;
        if (gearIdx >= 2 && speedAbs < 14.0) car.shiftCooldown = 0;

        if (car.shiftCooldown <= 0) {
          // A. LOGICA SALITA MARCE (UPSHIFT)
          if (gearIdx < maxGears - 1 && currentMechRPM >= shiftRPM) {
            const nextGearRPM = wheelRPS * gearRatios[gearIdx + 1] * finalDrive * 60;
            if (nextGearRPM >= idleRPM * 1.5) {
              gearIdx++;
              car.shiftCooldown = 0.22;
              if (car.isPlayer && car.rpm > 4500) {
                AudioEngine.playGearShiftBang(car.carConfig ? car.carConfig.id : "gt_comp");
              }
            }
          }
          // B. LOGICA SCALATA MARCE (DOWNSHIFT) - Risolve il blocco in 6a marcia!
          else if (gearIdx > 0) {
            const lowerGearRPM = wheelRPS * gearRatios[gearIdx - 1] * finalDrive * 60;
            const overrevSafetyLimit = redlineRPM * 0.94;

            // Scala marcia solo se non provoca fuori-giri
            if (lowerGearRPM < overrevSafetyLimit) {
              // 1. Caduta di regime sotto la fascia di coppia utile (motore soffocato)
              const powerBandFloor = shiftRPM * 0.58;
              const isBelowPowerBand = currentMechRPM < powerBandFloor;

              // 2. Freno / Decelerazione in ingresso curva (richiesta di freno motore da gara)
              const isDecelerating = throttle === 0 || (this.keys && this.keys.down);
              const wantsEngineBraking = isDecelerating && lowerGearRPM < redlineRPM * 0.82;

              // 3. Kickdown: acceleratore a fondo a medio regime per sorpasso
              const wantsKickdown = throttle > 0.70 && lowerGearRPM < redlineRPM * 0.85 && currentMechRPM < shiftRPM * 0.72;

              // 4. Soglie fisiche di velocità minima per ciascuna marcia:
              // Impedisce perentoriamente all'auto di restare in 6a, 5a o 4a a velocità da curva
              const minSpeedForGear = (gearIdx >= 5) ? 32.0 : (gearIdx === 4) ? 23.5 : (gearIdx === 3) ? 16.5 : (gearIdx === 2) ? 10.5 : 5.0;
              const isTooSlowForGear = speedAbs < minSpeedForGear;

              if (isBelowPowerBand || wantsEngineBraking || wantsKickdown || isTooSlowForGear) {
                gearIdx--;
                car.shiftCooldown = 0.18;
                if (car.isPlayer && car.rpm > 4000) {
                  AudioEngine.playPopSound(null, 0.42);
                }
              }
            }
          }
        }
      }
    }

    car.gear = gearIdx + 1;

    // Calcolo RPM motore finale con simulazione convertitore/frizione in prima marcia
    const mechanicalRPM = wheelRPS * gearRatios[gearIdx] * finalDrive * 60;
    let effectiveRPM = mechanicalRPM;

    if (gearIdx === 0 && mechanicalRPM < idleRPM) {
      effectiveRPM = throttle > 0 ? idleRPM + throttle * (shiftRPM * 0.35) : idleRPM;
    } else if (effectiveRPM < idleRPM) {
      effectiveRPM = idleRPM;
    }

    car.rpm = Math.round(
      THREE.MathUtils.clamp(effectiveRPM, idleRPM, redlineRPM + 250),
    );
  },

  applyVisualDynamics(car, accel, angularVel, isBraking, dt) {
    car.mesh.position.copy(car.position);

    const visualYaw = car.heading + (car.driftAngle || 0) * 0.62;
    const sinH = Math.sin(visualYaw);
    const cosH = Math.cos(visualYaw);

    // Calcolo dinamico dell'inclinazione della pista (Pitch e Roll) basato sui 4 punti di appoggio ruote
    const wheelbaseHalf = 1.46;
    const trackWidthHalf = 0.95;

    // Punti di contatto assi anteriore e posteriore
    const frontX = car.position.x + sinH * wheelbaseHalf;
    const frontZ = car.position.z + cosH * wheelbaseHalf;
    const rearX = car.position.x - sinH * wheelbaseHalf;
    const rearZ = car.position.z - cosH * wheelbaseHalf;

    const frontSurf = this.getTrackElevationAndNormal(frontX, frontZ, car.sampleIndex);
    const rearSurf = this.getTrackElevationAndNormal(rearX, rearZ, car.sampleIndex);

    // Inclinazione longitudinale (pitch): salita muso in su (rotazione X negativa), discesa muso in giù
    const deltaY_pitch = frontSurf.y - rearSurf.y;
    const targetTrackPitch = -Math.atan2(deltaY_pitch, wheelbaseHalf * 2);

    // Inclinazione trasversale (banking / roll): lato destro più alto = roll verso sinistra
    const rightX_pos = car.position.x + cosH * trackWidthHalf;
    const rightZ_pos = car.position.z - sinH * trackWidthHalf;
    const leftX_pos = car.position.x - cosH * trackWidthHalf;
    const leftZ_pos = car.position.z + sinH * trackWidthHalf;

    const rightSurf = this.getTrackElevationAndNormal(rightX_pos, rightZ_pos, car.sampleIndex);
    const leftSurf = this.getTrackElevationAndNormal(leftX_pos, leftZ_pos, car.sampleIndex);

    const deltaY_roll = rightSurf.y - leftSurf.y;
    const targetTrackRoll = Math.atan2(deltaY_roll, trackWidthHalf * 2);

    // Smoothing dell'inclinazione pista per evitare scatti poligonali
    if (typeof car.trackPitch === "undefined") car.trackPitch = targetTrackPitch;
    if (typeof car.trackRoll === "undefined") car.trackRoll = targetTrackRoll;
    car.trackPitch = THREE.MathUtils.lerp(car.trackPitch, targetTrackPitch, Math.min(1, dt * 14));
    car.trackRoll = THREE.MathUtils.lerp(car.trackRoll, targetTrackRoll, Math.min(1, dt * 14));

    // L'intero car.mesh (ruote e contact shadow compresi) segue fedelmente il piano inclinato della pista
    car.mesh.rotation.order = "YXZ";
    car.mesh.rotation.y = visualYaw;
    car.mesh.rotation.x = car.trackPitch;
    car.mesh.rotation.z = car.trackRoll;

    const ud = car.mesh.userData;
    if (!ud) return;

    // Dinamica interna delle sospensioni della carrozzeria (beccheggio in frenata/accelerazione e rollio centrifugo)
    const suspensionPitch =
      THREE.MathUtils.clamp(-accel * 0.0026, -0.065, 0.065) + (car.impactPitch || 0);
    const suspensionRoll =
      THREE.MathUtils.clamp(
        angularVel * (car.speed / 32) * 0.065,
        -0.09,
        0.09,
      ) + (car.impactRoll || 0);

    car.pitch = THREE.MathUtils.lerp(car.pitch || 0, suspensionPitch, dt * 11);
    car.roll = THREE.MathUtils.lerp(car.roll || 0, suspensionRoll, dt * 11);

    if (car.impactRoll) car.impactRoll = THREE.MathUtils.damp(car.impactRoll, 0, 9.0, dt);
    if (car.impactPitch) car.impactPitch = THREE.MathUtils.damp(car.impactPitch, 0, 9.0, dt);

    ud.bodyGroup.rotation.x = car.pitch;
    ud.bodyGroup.rotation.z = car.roll;

    // Escursione realistica sospensioni (affondamento muso in frenata e squat in accelerazione)
    const targetSuspensionY = THREE.MathUtils.clamp(-accel * 0.0016, -0.04, 0.025);
    ud.bodyGroup.position.y = THREE.MathUtils.lerp(
      ud.bodyGroup.position.y || 0,
      targetSuspensionY,
      dt * 10,
    );

    const visualSteer = THREE.MathUtils.clamp(
      car.steerAngle * 0.24,
      -0.48,
      0.48,
    );
    ud.frontLeftPivot.rotation.y = visualSteer;
    ud.frontRightPivot.rotation.y = visualSteer;

    // Angolo di camber dinamico delle ruote sterzanti (Ackermann caster/camber)
    ud.frontLeftPivot.rotation.z = -visualSteer * 0.08;
    ud.frontRightPivot.rotation.z = -visualSteer * 0.08;

    const wheelAngularDelta = (car.speed / 0.37) * dt;
    ud.wheelMeshes.forEach((w) => {
      w.rotation.x += wheelAngularDelta;
    });

    if (ud.brakelightMat) {
      ud.brakelightMat.emissiveIntensity = isBraking ? 4.2 : 0.65;
    }

    // Luce pioggia/FIA lampeggiante (prototipi Le Mans / Formula 1)
    if (ud.fiaRainLight) {
      const isSlowOrDecel = car.speed < 20 || isBraking;
      const pulse = Math.sin(performance.now() * 0.025) > 0 ? 3.8 : 0.0;
      ud.fiaRainLight.material.emissiveIntensity = isSlowOrDecel ? pulse : 0.5;
    }

    // Fiammate Afterburner / Nitro dagli scarichi
    if (ud.exhaustFlames) {
      const isBoosting = Boolean(car.drsActive || car.turboWasActive);
      const highRpm = car.rpm > 6200 && accel > 0.5;
      const flameTarget = isBoosting ? 0.95 : highRpm ? 0.55 : 0.0;
      const flicker = 0.82 + Math.sin(performance.now() * 0.06) * 0.25;

      ud.exhaustFlames.forEach((flame) => {
        flame.visible = flameTarget > 0.05;
        flame.material.opacity = flameTarget * flicker;
        flame.material.color.setHex(isBoosting ? 0x00f0ff : 0xff6a00);
        flame.scale.set(1.0, 1.0, (isBoosting ? 1.85 : 0.95) * flicker);
      });
    }
  },

  spawnTireSmoke(car) {
    const p = this.smokeParticles.find((s) => s.life <= 0);
    if (!p) return;

    const side = Math.random() > 0.5 ? 0.95 : -0.95;
    const localTire = new THREE.Vector3(side, 0.16, -1.50);
    if (car && car.mesh) {
      p.mesh.position.copy(car.mesh.localToWorld(localTire));
    } else {
      const backDir = new THREE.Vector3(
        Math.sin(car.heading),
        0,
        Math.cos(car.heading),
      );
      const rightDir = new THREE.Vector3(backDir.z, 0, -backDir.x);
      p.mesh.position
        .copy(car.position)
        .addScaledVector(backDir, -1.50)
        .addScaledVector(rightDir, side);
      p.mesh.position.y += 0.20;
    }

    p.mesh.scale.setScalar(0.55);
    p.mesh.material.opacity = 0.45;
    p.mesh.visible = true;
    p.life = 0.5;

    const upDir = (car && car.trackNormal) || new THREE.Vector3(0, 1, 0);
    p.vel.set(
      upDir.x * 1.5 + (Math.random() - 0.5) * 2,
      upDir.y * 1.5 + Math.random(),
      upDir.z * 1.5 + (Math.random() - 0.5) * 2,
    );
  },

  updateSmokeParticles(dt) {
    for (let p of this.smokeParticles) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.addScalar(dt * 2.2);
        p.mesh.material.opacity = Math.max(0, p.life * 0.85);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  },

  updateCamera(dt) {
    if (!this.player) return;
    const car = this.player;
    const forward = new THREE.Vector3(
      Math.sin(car.heading),
      0,
      Math.cos(car.heading),
    );

    if (this.cameraMode === 1) {
      // Hood camera ancorata all'orientamento 3D del muso
      const hoodPos = car.mesh.localToWorld(new THREE.Vector3(0, 1.15, 0.65));
      const hoodLook = car.mesh.localToWorld(new THREE.Vector3(0, 0.85, 24));

      GameApp.camera.position.copy(hoodPos);
      GameApp.camera.lookAt(hoodLook);
      const hoodSpeed = Math.min(1, Math.abs(car.speed) / 115);
      GameApp.camera.fov = THREE.MathUtils.lerp(
        GameApp.camera.fov,
        60 + hoodSpeed * 25,
        dt * 8,
      );
      GameApp.camera.updateProjectionMatrix();
    } else {
      const distBack = this.cameraMode === 2 ? 10.5 : 7.4;
      const heightUp = this.cameraMode === 2 ? 4.2 : 2.95;

      const pitch = car.trackPitch || 0;
      const slopeDeltaY = -distBack * Math.sin(-pitch);
      const lookDeltaY = 5.5 * Math.sin(-pitch);

      const desiredPos = car.position
        .clone()
        .addScaledVector(forward, -distBack);
      desiredPos.y += heightUp + slopeDeltaY;

      const desiredLook = car.position
        .clone()
        .addScaledVector(forward, 5.5);
      desiredLook.y += 1.0 + lookDeltaY;

      this.camPos.lerp(desiredPos, Math.min(1, dt * 8.5));
      this.camLook.lerp(desiredLook, Math.min(1, dt * 12));

      GameApp.camera.position.copy(this.camPos);
      GameApp.camera.lookAt(this.camLook);

      const speedRatio = Math.min(1, Math.abs(car.speed) / 115);
      GameApp.camera.fov = THREE.MathUtils.lerp(
        GameApp.camera.fov,
        60 + speedRatio * 25,
        dt * 5,
      );
      GameApp.camera.updateProjectionMatrix();
    }

    // Camera Impact Trauma & Visceral Crash Shake
    if (this.cameraTrauma > 0.001) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.8);
      const shakePower = Math.pow(this.cameraTrauma, 2);
      const t = performance.now() * 0.001;
      const shakeX = (Math.sin(t * 43) * 0.7 + Math.sin(t * 89) * 0.3) * shakePower * 0.42;
      const shakeY = (Math.cos(t * 51) * 0.7 + Math.cos(t * 97) * 0.3) * shakePower * 0.32;
      const shakeZ = Math.sin(t * 61) * shakePower * 0.25;

      GameApp.camera.position.x += shakeX;
      GameApp.camera.position.y += shakeY;
      GameApp.camera.position.z += shakeZ;
      GameApp.camera.rotation.z += shakeX * 0.05;
    }
  },

  cycleCamera() {
    this.cameraMode = (this.cameraMode + 1) % 3;
    const labels = ["TERZA PERSONA", "COFANO / INTERNA", "VISUALE LONTANA"];
    document.getElementById("hud-cam-mode").textContent =
      labels[this.cameraMode];
    AudioEngine.playUIClick();
  },

  resetPlayerToTrack() {
    if (!this.player || !this.trackData) return;
    const s = this.trackData.samples[this.player.sampleIndex];
    this.player.position.copy(s.point);
    this.player.heading = Math.atan2(s.tangent.x, s.tangent.z);
    this.player.speed = 0;
    this.player.driftAngle = 0;
    AudioEngine.playUIClick();
    UI.showToast("Vettura riposizionata al centro della pista", "fa-rotate");
  },

  getStandings() {
    return [...this.allRacers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      const progA = typeof a.totalProgress === "number" && !isNaN(a.totalProgress) ? a.totalProgress : 0;
      const progB = typeof b.totalProgress === "number" && !isNaN(b.totalProgress) ? b.totalProgress : 0;
      return progB - progA;
    });
  },

  updateHUD(nowMs) {
    if (!this.player) return;
    const car = this.player;
    const kmh = Math.round(Math.abs(car.speed) * 3.6);

    document.getElementById("hud-speed").textContent = kmh;
    document.getElementById("hud-gear").textContent = car.gear;
    document.getElementById("hud-rpm-text").textContent =
      `${car.rpm.toLocaleString("it-IT")} RPM`;

    const redline =
      (car.carConfig &&
        car.carConfig.physics &&
        car.carConfig.physics.redlineRPM) ||
      8500;
    const rpmPct = Math.min(
      100,
      Math.max(8, (car.rpm / (redline * 1.05)) * 100),
    );
    document.getElementById("hud-rpm-bar").style.width = `${rpmPct}%`;

    const gearBox = document.getElementById("hud-gear-box");
    if (car.rpm >= redline * 0.94) gearBox.classList.add("redline-flash");
    else gearBox.classList.remove("redline-flash");

    document.getElementById("hud-throttle-bar").style.height = this.keys.up
      ? "100%"
      : "0%";
    document.getElementById("hud-brake-bar").style.height = this.keys.down
      ? "100%"
      : "0%";

    const driftDeg = Math.round(Math.abs(car.driftAngle) * (180 / Math.PI));
    document.getElementById("hud-drift-angle").textContent = `${driftDeg}°`;
    const driftBanner = document.getElementById("hud-drift-banner");
    if (driftDeg >= 10 && kmh > 40) driftBanner.classList.remove("hidden");
    else driftBanner.classList.add("hidden");

    // Update Live FIA Sector, Corner Name & DRS Status Banner
    const curU = car.sampleIndex / this.trackData.samples.length;
    const sectorBadge = document.getElementById("hud-sector-badge");
    const cornerEl = document.getElementById("hud-corner-name");
    const drsBadge = document.getElementById("hud-drs-badge");

    if (sectorBadge && cornerEl && drsBadge) {
      if (curU < 0.333) {
        sectorBadge.textContent = "SETTORE 1";
        sectorBadge.className =
          "px-2 py-0.5 rounded-full text-[10px] font-racing font-bold bg-rose-500/30 text-rose-300 border border-rose-400/40";
      } else if (curU < 0.666) {
        sectorBadge.textContent = "SETTORE 2";
        sectorBadge.className =
          "px-2 py-0.5 rounded-full text-[10px] font-racing font-bold bg-cyan-500/30 text-cyan-300 border border-cyan-400/40";
      } else {
        sectorBadge.textContent = "SETTORE 3";
        sectorBadge.className =
          "px-2 py-0.5 rounded-full text-[10px] font-racing font-bold bg-amber-500/30 text-amber-300 border border-amber-400/40";
      }

      const corners = this.trackConfig.corners || [];
      let activeCorner = corners[0] ? corners[0].name : this.trackConfig.name;
      for (let c of corners) {
        if (curU >= c.u) activeCorner = c.name;
      }
      cornerEl.textContent = activeCorner.toUpperCase();

      const curSample = this.trackData.samples[car.sampleIndex];
      if (car.drsActive) {
        drsBadge.textContent = "DRS OPEN";
        drsBadge.className =
          "px-2.5 py-0.5 rounded-full text-[10px] font-racing font-black bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/40";
      } else if (curSample && curSample.isDRS) {
        drsBadge.textContent = "DRS ZONE";
        drsBadge.className =
          "px-2.5 py-0.5 rounded-full text-[10px] font-racing font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40";
      } else {
        drsBadge.textContent = "DRS OFF";
        drsBadge.className =
          "px-2.5 py-0.5 rounded-full text-[10px] font-racing font-bold bg-slate-800 text-slate-500 border border-white/10";
      }
    }

    const displayLap =
      (this.mode === "race" || this.mode === "lan_race")
        ? Math.min(this.totalLaps, Math.max(1, car.lap))
        : Math.max(1, car.lap);
    document.getElementById("hud-lap").textContent = displayLap;
    document.getElementById("hud-cur-time").textContent = UI.formatLapTime(
      car.currentLapTime,
    );

    if (car.bestLapTime) {
      document.getElementById("hud-best-time").textContent = UI.formatLapTime(
        car.bestLapTime,
      );
    }

    if (this.mode === "race" || this.mode === "lan_race") {
      const standings = this.getStandings();
      const myId = (typeof NetworkEngine !== "undefined" && (NetworkEngine.myPlayerId || NetworkEngine.myId)) || null;
      const myIndex = standings.findIndex((r) => r.isPlayer || (myId && r.id === myId));
      const pos = myIndex >= 0 ? myIndex + 1 : 1;
      const posEl = document.getElementById("hud-position");
      if (posEl) posEl.textContent = pos;

      const leader = standings[0] || car;
      const gapEl = document.getElementById("hud-gap");
      if (gapEl) {
        if (pos === 1) {
          gapEl.textContent = "LEADER";
          gapEl.className = "font-racing font-bold text-emerald-400";
        } else {
          if (this.countdownTimer > 0) {
            gapEl.textContent = `P${pos}`;
            gapEl.className = "font-racing font-bold text-amber-300";
          } else {
            const progressDiff = Math.max(
              0,
              (leader.totalProgress || 0) - (car.totalProgress || 0),
            );
            if (progressDiff >= 1.0) {
              const lapsBehind = Math.floor(progressDiff);
              gapEl.textContent = `+${lapsBehind} ${lapsBehind === 1 ? "GIRO" : "GIRI"}`;
              gapEl.className = "font-racing font-bold text-rose-400";
            } else {
              const speedRef = Math.max(20, Math.abs(car.speed), Math.abs(leader.speed || 0));
              const trackLen = (this.trackData && this.trackData.totalLength) || 1200;
              const approxSeconds = (progressDiff * trackLen) / speedRef;
              gapEl.textContent = `+${approxSeconds.toFixed(2)}s`;
              gapEl.className = "font-racing font-bold text-amber-300";
            }
          }
        }
      }

      if (nowMs - this.lastHudLeaderboardUpdate > 160) {
        this.lastHudLeaderboardUpdate = nowMs;
        this.renderLiveTimingTower(standings, leader);
      }
    }
  },

  renderLiveTimingTower(standings, leader) {
    const container = document.getElementById("hud-leaderboard-rows");
    if (!container) return;

    const statusEl = document.getElementById("hud-ai-status");
    if (this.raceElapsedSeconds < 3.5 && this.countdownTimer <= 0) {
      statusEl.textContent = "TURN 1 FORMATION";
    } else {
      statusEl.textContent = `GIRO ${Math.min(this.totalLaps, Math.max(1, (leader && leader.lap) || 1))}/${this.totalLaps}`;
    }

    const diffTagEl = document.getElementById("hud-diff-tag");
    if (diffTagEl) {
      if (this.mode === "lan_race") {
        diffTagEl.textContent = `LAN ONLINE (${this.allRacers.length}P)`;
        diffTagEl.className = "px-1.5 py-0.2 rounded text-[8px] font-racing font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/30";
      } else {
        const diffConfig = this.getDifficultyConfig();
        diffTagEl.textContent = `${diffConfig.name.toUpperCase()} (x${diffConfig.multiplier.toFixed(1)})`;
        diffTagEl.className = `px-1.5 py-0.2 rounded text-[8px] font-racing font-bold ${diffConfig.badgeBg}`;
      }
    }

    const myId = (typeof NetworkEngine !== "undefined" && (NetworkEngine.myPlayerId || NetworkEngine.myId)) || null;

    container.innerHTML = standings
      .slice(0, 10)
      .map((r, idx) => {
        const rank = idx + 1;
        let gapStr = "LEADER";
        if (idx > 0 && leader) {
          if (r.finished && leader.finished) {
            const sec = Math.max(0, (r.finishTime - leader.finishTime) / 1000);
            gapStr = `+${sec.toFixed(1)}s`;
          } else {
            const pDiff = Math.max(0, (leader.totalProgress || 0) - (r.totalProgress || 0));
            if (pDiff >= 1.0) {
              const laps = Math.floor(pDiff);
              gapStr = `+${laps}L`;
            } else {
              const speedRef = Math.max(22, Math.abs(r.speed || 0), Math.abs(leader.speed || 0));
              const trackLen = (this.trackData && this.trackData.totalLength) || 1200;
              const sec = (pDiff * trackLen) / speedRef;
              gapStr = `+${sec.toFixed(1)}s`;
            }
          }
        }

        let hexColor = "#00f0ff";
        if (r.teamColorHex) {
          hexColor = typeof r.teamColorHex === "number"
            ? "#" + r.teamColorHex.toString(16).padStart(6, "0")
            : String(r.teamColorHex);
        }

        const isMe = r.isPlayer || (myId && r.id === myId);
        const rowClass = isMe
          ? "bg-amber-400/25 border border-amber-400/60 text-white font-bold shadow-sm"
          : "bg-slate-900/75 text-slate-300";

        let badgeTag = "";
        if (this.mode === "lan_race") {
          const isHost = (typeof NetworkEngine !== "undefined" && NetworkEngine.hostId && r.id === NetworkEngine.hostId);
          if (isMe) {
            badgeTag = '<span class="px-1 rounded text-[8px] bg-cyan-500/30 text-cyan-200">TU</span>';
          } else if (isHost) {
            badgeTag = '<span class="px-1 rounded text-[8px] bg-amber-400/30 text-amber-200 font-bold">HOST</span>';
          }
        } else {
          let badgeStyle = "bg-cyan-500/30 text-cyan-200";
          if (r.aiStatusTag === "LUNGO!") badgeStyle = "bg-rose-500/40 text-rose-200";
          else if (r.aiStatusTag === "DRS") badgeStyle = "bg-emerald-500/30 text-emerald-200 font-bold";
          else if (r.aiStatusTag === "SCIA") badgeStyle = "bg-amber-400/30 text-amber-200 font-bold";
          else if (r.aiStatusTag === "SORPASSO") badgeStyle = "bg-purple-500/40 text-purple-200 font-bold animate-pulse";
          else if (r.aiStatusTag === "DIFESA") badgeStyle = "bg-blue-500/40 text-blue-200 font-bold";
          else if (r.aiStatusTag === "RECUPERO!") badgeStyle = "bg-orange-500/40 text-orange-200";
          else if (r.aiStatusTag === "RIENTRO!") badgeStyle = "bg-amber-500/40 text-amber-200";

          badgeTag =
            !r.isPlayer && r.aiStatusTag
              ? `<span class="px-1 rounded text-[8px] ${badgeStyle}">${r.aiStatusTag}</span>`
              : "";
        }

        const driverCode = r.driverCode || (r.driverName ? r.driverName.slice(0, 3).toUpperCase() : "DRV");

        return `
                <div class="flex items-center justify-between px-2 py-1 rounded-lg ${rowClass}">
                    <div class="flex items-center gap-2">
                        <span class="w-4 text-right text-[10px] ${rank <= 3 ? "text-amber-400 font-black" : "text-slate-400"}">${rank}</span>
                        <span class="w-1 h-3.5 rounded-full" style="background:${hexColor}"></span>
                        <span class="tracking-wider ${isMe ? "text-amber-300 font-bold" : ""}">${driverCode}</span>
                        ${badgeTag}
                    </div>
                    <span class="text-[10px] ${idx === 0 ? "text-emerald-400 font-bold" : "text-slate-400 font-mono"}">${gapStr}</span>
                </div>
            `;
      })
      .join("");
  },

  /**
   * Multi-Sector FIA Vector Minimap (S1 Red, S2 Cyan, S3 Yellow + Green DRS Zones)
   */
  drawMinimap() {
    const canvas = document.getElementById("minimap-canvas");
    if (!canvas || !this.trackData) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const samples = this.trackData.samples;
    const N = samples.length;

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < N; i += 8) {
      const p = samples[i].point;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const pad = 16;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const toMapX = (x) => w / 2 + (x - centerX) * scale;
    const toMapY = (z) => h / 2 + (z - centerZ) * scale;

    // Usa i punti di divisione Settori FIA specifici del circuito (es. [0.27, 0.62] su Monza)
    const splits = this.trackConfig.sectorSplits || [0.333, 0.666];
    const s1End = Math.floor(splits[0] * N);
    const s2End = Math.floor(splits[1] * N);

    const sectors = [
      { start: 0, end: s1End, color: "#ef4444" }, // Settore 1: Rosso FIA
      { start: s1End, end: s2End, color: "#00d2ff" }, // Settore 2: Azzurro FIA
      { start: s2End, end: N, color: "#eab308" }, // Settore 3: Giallo FIA
    ];

    // Contorno nero pista
    ctx.beginPath();
    for (let i = 0; i < N; i += 4) {
      const pt = samples[i].point;
      if (i === 0) ctx.moveTo(toMapX(pt.x), toMapY(pt.z));
      else ctx.lineTo(toMapX(pt.x), toMapY(pt.z));
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.lineWidth = 7.5;
    ctx.stroke();

    // Disegna i 3 Settori colorati
    sectors.forEach((sec) => {
      ctx.beginPath();
      for (let i = sec.start; i <= sec.end; i += 3) {
        const pt = samples[i % N].point;
        if (i === sec.start) ctx.moveTo(toMapX(pt.x), toMapY(pt.z));
        else ctx.lineTo(toMapX(pt.x), toMapY(pt.z));
      }
      ctx.strokeStyle = sec.color;
      ctx.lineWidth = 4.2;
      ctx.stroke();
    });

    // Evidenzia le Zone DRS in verde brillante
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < N; i += 4) {
      if (samples[i].isDRS) {
        const p1 = samples[i].point;
        const p2 = samples[(i + 4) % N].point;
        ctx.beginPath();
        ctx.moveTo(toMapX(p1.x), toMapY(p1.z));
        ctx.lineTo(toMapX(p2.x), toMapY(p2.z));
        ctx.stroke();
      }
    }

    // Punto fucsia SPEED TRAP (se presente sul circuito)
    if (typeof this.trackConfig.speedTrapU === "number") {
      const stPt = samples[Math.floor(this.trackConfig.speedTrapU * N)].point;
      ctx.beginPath();
      ctx.arc(toMapX(stPt.x), toMapY(stPt.z), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ec4899";
      ctx.fill();
    }

    // Linea del Traguardo (Bandiera a scacchi)
    const s0 = samples[0].point;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(toMapX(s0.x) - 3.5, toMapY(s0.z) - 3.5, 7, 7);

    // Avversari CPU (Pallini Rossi)
    for (let ai of this.aiCars) {
      ctx.beginPath();
      ctx.arc(
        toMapX(ai.position.x),
        toMapY(ai.position.z),
        3.4,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    }

    // Giocatori Remoti LAN (Pallini con il rispettivo colore)
    if (typeof remotePlayers !== "undefined") {
      for (const id in remotePlayers) {
        const rem = remotePlayers[id];
        if (rem && rem.mesh) {
          ctx.beginPath();
          ctx.arc(
            toMapX(rem.mesh.position.x),
            toMapY(rem.mesh.position.z),
            4.2,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = rem.color || "#00f0ff";
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    // Giocatore (Pallino Giallo con bordo bianco)
    if (this.player) {
      ctx.beginPath();
      ctx.arc(
        toMapX(this.player.position.x),
        toMapY(this.player.position.z),
        5.0,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  },

  togglePause() {
    if (!this.isActive || this.isFinished) return;
    this.isPaused = !this.isPaused;
    const modal = document.getElementById("modal-pause");
    if (this.isPaused) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      AudioEngine.setDrivingAudioActive(false);
    } else {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      AudioEngine.setDrivingAudioActive(true);
    }
  },

  restartSession() {
    AudioEngine.playUIClick();
    this.startSession(this.trackConfig.id, this.mode);
  },

  quitToMenu() {
    this.isActive = false;
    this.isPaused = false;
    AudioEngine.setDrivingAudioActive(false);
    AudioEngine.playUIClick();

    document.getElementById("race-hud").classList.add("hidden");
    document.getElementById("race-hud").classList.remove("flex");
    document.getElementById("modal-pause").classList.add("hidden");
    document.getElementById("modal-results").classList.add("hidden");

    document.getElementById("menu-header").classList.remove("hidden");
    document.getElementById("menu-main").classList.remove("hidden");

    UI.updateHeaderStats();
    UI.switchTab(UI.currentTab);
  },

  completeRaceSession() {
    this.isFinished = true;
    AudioEngine.setDrivingAudioActive(false);
    AudioEngine.playCashPurchase();

    const standings = this.getStandings();
    const playerPos = standings.findIndex((r) => r.isPlayer) + 1;

    // Calcolo crediti e record profilo con moltiplicatore di difficoltà
    const basePrize = (this.trackConfig && typeof this.trackConfig.prizeFirst === "number")
      ? this.trackConfig.prizeFirst
      : 20000;

    let multiplier = 0;
    if (playerPos === 1) multiplier = 1.0;
    else if (playerPos === 2) multiplier = 0.6;
    else if (playerPos === 3) multiplier = 0.3;

    const diffConfig = this.getDifficultyConfig();
    const diffMult = diffConfig.multiplier || 1.0;
    const prizeWon = Math.round(basePrize * multiplier * diffMult);
    GameApp.profile.credits += prizeWon;

    if (!GameApp.profile.records) GameApp.profile.records = {};
    if (!GameApp.profile.records[this.trackConfig.id]) {
      GameApp.profile.records[this.trackConfig.id] = { bestLap: null, bestPos: null, trophies: 0 };
    }
    const rec = GameApp.profile.records[this.trackConfig.id];
    if (playerPos <= 3) {
      rec.trophies = (rec.trophies || 0) + 1;
    }
    if (!rec.bestPos || playerPos < rec.bestPos) {
      rec.bestPos = playerPos;
    }
    StorageManager.save(GameApp.profile);
    UI.updateHeaderStats();

    // Titoli podio
    const titles = {
      1: "VITTORIA! 1° POSTO ASSOLUTO",
      2: "GRANDE PODIO! 2° POSTO",
      3: "PODIO CONQUISTATO! 3° POSTO",
    };
    const titleEl = document.getElementById("res-title");
    if (titleEl) {
      titleEl.textContent = titles[playerPos] || `BANDIERA A SCACCHI • ${playerPos}° POSTO`;
    }

    const trophyIcon = document.getElementById("res-trophy-icon");
    if (trophyIcon) {
      if (playerPos === 1) {
        trophyIcon.className = "w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-2xl text-amber-400 shadow-lg shadow-amber-500/30";
        trophyIcon.innerHTML = '<i class="fa-solid fa-trophy"></i>';
      } else if (playerPos <= 3) {
        trophyIcon.className = "w-12 h-12 rounded-2xl bg-slate-200/20 border border-slate-300/40 flex items-center justify-center text-2xl text-slate-200 shadow-md";
        trophyIcon.innerHTML = '<i class="fa-solid fa-medal"></i>';
      } else {
        trophyIcon.className = "w-12 h-12 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center text-2xl text-slate-400";
        trophyIcon.innerHTML = '<i class="fa-solid fa-flag-checkered"></i>';
      }
    }

    const modeBadge = document.getElementById("res-mode-badge");
    if (modeBadge) {
      modeBadge.textContent = this.mode === "lan_race" ? "LAN MULTIPLAYER" : "GP WORLD SERIES";
    }

    const diffBadge = document.getElementById("res-diff-badge");
    if (diffBadge) {
      diffBadge.textContent = `${diffConfig.name.toUpperCase()} (x${diffMult.toFixed(1)})`;
      diffBadge.className = `px-2 py-0.5 rounded text-[9px] font-racing font-bold uppercase ${diffConfig.badgeBg}`;
    }

    // Ricerca del giro più veloce assoluto in gara
    let sessionFastestLap = Infinity;
    let sessionFastestDriver = null;
    standings.forEach((r) => {
      if (r.bestLapTime && r.bestLapTime > 4000 && r.bestLapTime < sessionFastestLap) {
        sessionFastestLap = r.bestLapTime;
        sessionFastestDriver = r.driverName;
      }
    });

    // 4 Schede riassuntive
    const prizeEl = document.getElementById("res-prize");
    if (prizeEl) {
      prizeEl.textContent = `+ Cr. ${prizeWon.toLocaleString("it-IT")}`;
    }
    const diffBonusTag = document.getElementById("res-diff-mult-tag");
    if (diffBonusTag) {
      diffBonusTag.textContent = `x${diffMult.toFixed(1)} ${diffConfig.name.toUpperCase()}`;
    }

    const winner = standings[0];
    const totalTimeEl = document.getElementById("res-total-time");
    if (totalTimeEl) {
      const winnerTime = (winner && winner.finishTime) ? winner.finishTime : (this.raceElapsedSeconds * 1000);
      totalTimeEl.textContent = UI.formatLapTime(winnerTime);
    }

    const bestLapEl = document.getElementById("res-best-lap");
    if (bestLapEl) {
      bestLapEl.textContent = this.player.bestLapTime ? UI.formatLapTime(this.player.bestLapTime) : "--:--.---";
    }

    const fastestLapEl = document.getElementById("res-fastest-lap");
    if (fastestLapEl) {
      fastestLapEl.textContent = sessionFastestDriver
        ? `${UI.formatLapTime(sessionFastestLap)} [${sessionFastestDriver}]`
        : "--:--.---";
    }

    // Tabella dettagliata della classifica
    const standingsContainer = document.getElementById("res-standings");
    if (standingsContainer) {
      standingsContainer.innerHTML = standings
        .map((r, idx) => {
          const rank = idx + 1;
          const isMe = r.isPlayer;
          const isRemote = r.isRemotePlayer;
          const isHost = (typeof NetworkEngine !== "undefined" && NetworkEngine.hostId && r.id === NetworkEngine.hostId);

          const highlight = isMe
            ? "bg-amber-400/20 border-amber-400/60 shadow-md shadow-amber-500/10"
            : (isHost ? "bg-amber-500/10 border-amber-400/30" : "bg-slate-900/80 border-white/10");

          const badgeColor =
            rank === 1
              ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black shadow-md shadow-amber-500/20"
              : rank === 2
                ? "bg-gradient-to-r from-slate-200 to-slate-400 text-slate-950 font-black shadow-sm"
                : rank === 3
                  ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white font-black shadow-sm"
                  : "bg-slate-800 text-slate-400 font-bold border border-white/5";

          // Formattazione Distacco / Tempo
          let timeGapStr = "";
          if (rank === 1) {
            const finishMs = r.finishTime || (this.raceElapsedSeconds * 1000);
            timeGapStr = `<span class="font-black text-emerald-400 font-racing">${UI.formatLapTime(finishMs)}</span>`;
          } else if (r.finished && winner && winner.finishTime) {
            const gapSec = ((r.finishTime - winner.finishTime) / 1000).toFixed(3);
            timeGapStr = `<span class="font-bold text-amber-300 font-racing">+${Number(gapSec) > 0 ? gapSec : "0.000"}s</span>`;
          } else {
            if (r.lap && r.lap < this.totalLaps) {
              const lapsDown = this.totalLaps - Math.min(this.totalLaps, r.lap);
              timeGapStr = `<span class="font-bold text-slate-400 font-racing">+${lapsDown} ${lapsDown === 1 ? "GIRO" : "GIRI"}</span>`;
            } else {
              const pDiff = Math.max(0, (winner ? winner.totalProgress : 0) - (r.totalProgress || 0));
              const secEst = ((pDiff * (this.trackData ? this.trackData.totalLength : 1000)) / Math.max(22, r.speed || 30)).toFixed(1);
              timeGapStr = `<span class="text-slate-400 font-racing">+${secEst}s (In pista)</span>`;
            }
          }

          // Badge Tipologia Pilota
          let typePill = "";
          if (isMe) {
            typePill = '<span class="px-2 py-0.5 rounded text-[9px] font-racing font-black bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">TU (PILOTA)</span>';
          } else if (isRemote) {
            if (isHost) {
              typePill = '<span class="px-2 py-0.5 rounded text-[9px] font-racing font-black bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1"><i class="fa-solid fa-crown text-[8px]"></i>HOST LAN</span>';
            } else {
              typePill = '<span class="px-2 py-0.5 rounded text-[9px] font-racing font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">LAN PILOTA</span>';
            }
          } else {
            typePill = '<span class="px-1.5 py-0.5 rounded text-[9px] font-racing font-bold bg-slate-800 text-slate-400 border border-white/10">CPU F1</span>';
          }

          // Giro veloce badge
          const bestLapStr = r.bestLapTime ? UI.formatLapTime(r.bestLapTime) : "--:--.---";
          const isFastestHolder = sessionFastestDriver && (r.bestLapTime === sessionFastestLap);
          const fastestBadge = isFastestHolder
            ? '<span class="px-1.5 py-0.2 rounded text-[8px] font-racing font-black bg-purple-500/30 text-purple-300 border border-purple-400/40 flex items-center gap-1 animate-pulse"><i class="fa-solid fa-bolt text-[7px]"></i>RECORD</span>'
            : '';

          const hexColor = r.teamColorHex ? '#' + Number(r.teamColorHex).toString(16).padStart(6, '0') : '#00f0ff';
          const carName = r.carConfig ? r.carConfig.name : 'Vettura da gara';

          return `
            <div class="flex items-center justify-between px-3 sm:px-4 py-2.5 rounded-2xl border ${highlight} transition hover:bg-slate-800/80">
              <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-xl font-racing text-xs flex items-center justify-center shrink-0 ${badgeColor}">${rank}°</span>
                <span class="w-1.5 h-8 rounded-full shrink-0" style="background-color: ${hexColor}"></span>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-racing font-bold text-xs sm:text-sm text-white">${r.driverName}</span>
                    <span class="text-[10px] text-cyan-400 font-racing">[${r.driverCode}]</span>
                    ${typePill}
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5 font-medium">${carName}</div>
                </div>
              </div>
              <div class="flex items-center gap-5 sm:gap-7 text-right">
                <div class="hidden sm:flex flex-col items-end">
                  <span class="text-[9px] uppercase font-racing text-slate-400">Best Lap</span>
                  <div class="flex items-center gap-1 font-racing text-xs font-bold text-cyan-300">
                    <span>${bestLapStr}</span>
                    ${fastestBadge}
                  </div>
                </div>
                <div class="w-24 text-right">
                  <span class="text-[9px] uppercase font-racing text-slate-400 block sm:hidden">Tempo</span>
                  ${timeGapStr}
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // Configura bottoni in base alla modalità
    const btnRematch = document.getElementById("btn-results-rematch");
    if (btnRematch) {
      if (this.mode === "lan_race") {
        btnRematch.innerHTML = '<i class="fa-solid fa-users mr-1.5"></i><span>TORNA ALLA LOBBY LAN</span>';
        btnRematch.onclick = () => {
          RaceEngine.quitToMenu();
          UI.switchTab('multiplayer');
        };
      } else {
        btnRematch.innerHTML = '<i class="fa-solid fa-rotate-right mr-1.5"></i><span>RIVINCITA GP</span>';
        btnRematch.onclick = () => {
          RaceEngine.restartSession();
        };
      }
    }

    const modal = document.getElementById("modal-results");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
  },
};
