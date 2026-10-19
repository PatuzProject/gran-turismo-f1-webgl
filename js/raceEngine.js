"use strict";

// =========================================================================
// 6. MOTORE FISICO, DRS SYSTEM, CPU RACING AGENTS & MINIMAPPA 3 SETTORI FIA
// =========================================================================
const RaceEngine = {
  isActive: false,
  isPaused: false,
  isFinished: false,
  chequeredFlagActive: false,
  chequeredFlagTimer: 0,
  officialFinishOrder: [],
  postRaceCooldownTimer: 0,
  raceSessionClosing: false,
  mode: "race",
  gridSize: 10, // 8, 10, or 12 total cars on track
  totalLaps: 3, // 2 or 3 laps
  difficulty: "medium", // 'easy', 'medium', 'hard', 'legend'
  DIFFICULTY_LEVELS: {
    easy: {
      id: "easy",
      name: "Facile",
      multiplier: 1.0,
      skillMult: 0.94,
      brakeMarginMult: 0.94,
      aggressionMult: 0.85,
      errorMult: 1.2,
      topSpeedMult: 0.98,
      accelMult: 0.98,
      cornerGripMult: 0.96,
      reactionDelay: 0.2,
      colorClass: "text-emerald-400",
      badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    medium: {
      id: "medium",
      name: "Medio",
      multiplier: 1.5,
      skillMult: 1.08,
      brakeMarginMult: 1.08,
      aggressionMult: 1.2,
      errorMult: 0.5,
      topSpeedMult: 1.05,
      accelMult: 1.08,
      cornerGripMult: 1.08,
      reactionDelay: 0.07,
      colorClass: "text-amber-400",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    },
    hard: {
      id: "hard",
      name: "Difficile",
      multiplier: 2.2,
      skillMult: 1.22,
      brakeMarginMult: 1.18,
      aggressionMult: 1.5,
      errorMult: 0.15,
      topSpeedMult: 1.14,
      accelMult: 1.18,
      cornerGripMult: 1.18,
      reactionDelay: 0.02,
      colorClass: "text-rose-400",
      badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    },
    legend: {
      id: "legend",
      name: "Leggenda",
      multiplier: 3.0,
      skillMult: 1.38,
      brakeMarginMult: 1.28,
      aggressionMult: 1.85,
      errorMult: 0.02,
      topSpeedMult: 1,
      accelMult: 1,
      cornerGripMult: 1.28,
      reactionDelay: 0.0,
      colorClass: "text-purple-400",
      badgeBg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    },
  },

  getDifficultyConfig() {
    return (
      this.DIFFICULTY_LEVELS[this.difficulty] || this.DIFFICULTY_LEVELS.medium
    );
  },
  trackConfig: null,
  trackData: null,

  // F1 5-Light Start Sequence
  countdownTimer: 0,
  lastLightLit: 0,
  raceElapsedSeconds: 0,
  frameCounter: 0,
  lastHudLeaderboardUpdate: 0,

  // Cache HUD: riferimenti DOM, stato scritture e soglie di aggiornamento
  _hudEls: {},
  _hudTextLast: 0,
  _timingSig: null,

  // Cache minimappa statica pre-renderizzata per circuito { key, canvas, transform }
  _minimapStatic: null,

  // Buffer riutilizzabili per lo smoke dei pneumatici (evita allocazioni per-frame)
  _scratchSmokePos: null,
  _scratchSmokeDir: null,
  _scratchSmokeRight: null,
  _scratchSmokeUp: null,

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
      // I toggle non devono riattivarsi sull'auto-repeat del sistema operativo
      if (code === "KeyM" && !e.repeat) {
        this.toggleTransmissionMode();
      }
      if (code === "KeyC" && !e.repeat) this.cycleCamera();
      if ((code === "KeyR" || code === "Backspace") && !e.repeat) {
        this.resetPlayerToTrack();
        e.preventDefault();
      }
      if (code === "Escape" && !e.repeat) this.togglePause();
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
      "fixed top-2.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none hidden lg:flex items-center gap-2 glass-panel px-3 py-1 rounded-full border border-white/15 shadow-xl backdrop-blur-md";
    bar.innerHTML = `
            <span id="hud-sector-badge" class="px-2 py-0.5 rounded-full text-[9px] font-racing font-bold bg-rose-500/30 text-rose-300 border border-rose-400/40">SETTORE 1</span>
            <span id="hud-corner-name" class="font-racing text-[11px] font-bold text-white tracking-wider max-w-[210px] truncate">RETTIFILO PRINCIPALE</span>
            <span id="hud-drs-badge" class="px-2 py-0.5 rounded-full text-[9px] font-racing font-black bg-slate-800 text-slate-500 border border-white/10">DRS</span>
            <span id="hud-draft-badge" class="hidden px-2 py-0.5 rounded-full text-[9px] font-racing font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 uppercase transition-all">SCIA</span>
        `;
    hud.appendChild(bar);
  },

  // ── Helper griglia di partenza metrica unificata FIA ───────────────────────
  getGridSlot(slot) {
    const poleSide = (this.trackConfig && this.trackConfig.poleSide) || "left";
    if (
      typeof TrackBuilder !== "undefined" &&
      TrackBuilder.getGridSlotTransform &&
      this.trackData
    ) {
      return TrackBuilder.getGridSlotTransform(
        this.trackData.samples,
        this.trackData.totalLength,
        this.trackData.halfWidth * 2,
        slot,
        poleSide,
      );
    }
    const samples = (this.trackData && this.trackData.samples) || [];
    const N = samples.length || 1500;
    const len = (this.trackData && this.trackData.totalLength) || N * 3.5;
    const ds = len / N;
    const slotDist = 10.0 + slot * 8.0;
    const stepBack = Math.max(1, Math.round(slotDist / ds));
    const sampleIndex = (N - stepBack + N) % N;
    const poleSign = poleSide === "right" ? 1 : -1;
    const colSign = slot % 2 === 0 ? poleSign : -poleSign;
    const lateralOffset = colSign * 2.4;
    const sample = samples[sampleIndex] || {
      point: new THREE.Vector3(),
      right: new THREE.Vector3(1, 0, 0),
      tangent: new THREE.Vector3(0, 0, 1),
      u: 0,
    };
    return {
      sampleIndex,
      lateralOffset,
      point: sample.point.clone().addScaledVector(sample.right, lateralOffset),
      heading: Math.atan2(sample.tangent.x, sample.tangent.z),
      u: sample.u,
      sample,
    };
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
    // Invalida la cache DOM: i banner di telemetria possono essere stati (ri)creati
    this._hudEls = {};
    this.mode = mode;
    this.trackConfig =
      TRACK_CATALOG.find((t) => t.id === trackId) || TRACK_CATALOG[0];
    const playerCarConfig =
      CAR_CATALOG.find((c) => c.id === equippedId) || CAR_CATALOG[0];

    GameApp.clearScene();
    this.trackData = TrackBuilder.buildTrackEnvironment(
      GameApp.scene,
      this.trackConfig,
      playerCarConfig.physics,
    );

    this.isActive = true;
    this.isPaused = false;
    this.isFinished = false;
    this.chequeredFlagActive = false;
    this.chequeredFlagTimer = 0;
    this.officialFinishOrder = [];
    this.postRaceCooldownTimer = 0;
    this.raceSessionClosing = false;
    this.raceElapsedSeconds = 0;
    this.raceStartEpoch = 0;
    this.fastestLapTime = Infinity;
    this.fastestLapRacer = null;
    this.frameCounter = 0;

    const finishBanner = document.getElementById("hud-finish-banner");
    if (finishBanner) finishBanner.classList.add("hidden");
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

    if (mode === "race" || mode === "championship") {
      if (
        mode === "championship" &&
        typeof ChampionshipEngine !== "undefined" &&
        ChampionshipEngine.state
      ) {
        const cState = ChampionshipEngine.state;
        const slots = ChampionshipEngine.getGridSlots();
        this.gridSize = cState.gridSize || 10;
        this.totalLaps = cState.lapsPerRace || 3;
        if (cState.difficulty) this.difficulty = cState.difficulty;

        // Itera sui piloti registrati per posizionarli secondo le regole del campionato
        cState.drivers.forEach((driver) => {
          const slot =
            slots[driver.id] !== undefined
              ? slots[driver.id]
              : driver.isPlayer
                ? 4
                : driver.id;
          const slotTrans = this.getGridSlot(slot);

          if (driver.isPlayer) {
            this.player = this.createRacerEntity({
              id: 0,
              carConfig: playerCarConfig,
              driverCode: driver.code || "TU",
              driverName: driver.name || "TU (Pilota GT)",
              isPlayer: true,
              sampleIndex: slotTrans.sampleIndex,
              lateralOffset: slotTrans.lateralOffset,
              customPaint: null,
              aiProfile: null,
            });
            this.allRacers.push(this.player);
          } else {
            const aiRacer = this.createRacerEntity({
              id: driver.id,
              carConfig: playerCarConfig,
              driverCode: driver.code,
              driverName: driver.name,
              isPlayer: false,
              sampleIndex: slotTrans.sampleIndex,
              lateralOffset: slotTrans.lateralOffset,
              customPaint: driver.paint,
              aiProfile: driver.aiProfile,
            });
            this.aiCars.push(aiRacer);
            this.allRacers.push(aiRacer);
          }
        });

        this.countdownTimer = 5.4;
        this.lastLightLit = 0;
      } else {
        // Griglia di partenza metrica FIA F1 unificata (Gara Singola)
        const aiCount = this.gridSize - 1;
        for (let i = 0; i < aiCount; i++) {
          const profile = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
          const slotTrans = this.getGridSlot(i);

          const aiRacer = this.createRacerEntity({
            id: i + 1,
            carConfig: playerCarConfig,
            driverCode: profile.code,
            driverName: profile.name,
            isPlayer: false,
            sampleIndex: slotTrans.sampleIndex,
            lateralOffset: slotTrans.lateralOffset,
            customPaint: profile.paint,
            aiProfile: profile,
          });
          this.aiCars.push(aiRacer);
          this.allRacers.push(aiRacer);
        }

        const playerRow = aiCount;
        const playerSlotTrans = this.getGridSlot(playerRow);

        this.player = this.createRacerEntity({
          id: 0,
          carConfig: playerCarConfig,
          driverCode: "TU",
          driverName: "TU (Pilota GT)",
          isPlayer: true,
          sampleIndex: playerSlotTrans.sampleIndex,
          lateralOffset: playerSlotTrans.lateralOffset,
          customPaint: null,
          aiProfile: null,
        });
        this.allRacers.push(this.player);

        this.countdownTimer = 5.4;
        this.lastLightLit = 0;
      }
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

    // Inizializza telecamera GT dinamica
    this.camHeading = this.player.heading;
    const forward = new THREE.Vector3(
      Math.sin(this.camHeading),
      0,
      Math.cos(this.camHeading),
    );
    this.camPos
      .copy(this.player.position)
      .addScaledVector(forward, -8.4)
      .add(new THREE.Vector3(0, 2.75, 0));
    this.camLook
      .copy(this.player.position)
      .addScaledVector(forward, 16.5)
      .add(new THREE.Vector3(0, 1.45, 0));
    GameApp.camera.position.copy(this.camPos);
    GameApp.camera.lookAt(this.camLook);

    // Configure HUD visibility
    document.getElementById("menu-header").classList.add("hidden");
    document.getElementById("menu-main").classList.add("hidden");
    document.getElementById("race-hud").classList.remove("hidden");
    document.getElementById("race-hud").classList.add("flex");
    document.getElementById("modal-pause").classList.add("hidden");
    document.getElementById("modal-results").classList.add("hidden");
    this.hideChampionshipModals();

    document.getElementById("hud-track-name").textContent =
      this.trackConfig.name;
    const isCompetitive = mode === "race" || mode === "championship";
    document.getElementById("hud-pos-card").style.display = isCompetitive
      ? "flex"
      : "none";
    document.getElementById("hud-gap-row").style.display = isCompetitive
      ? "flex"
      : "none";
    document.getElementById("hud-leaderboard-panel").style.display =
      isCompetitive ? "flex" : "none";
    document.getElementById("hud-pos-total").textContent = `/ ${this.gridSize}`;
    document.getElementById("hud-lap-total").textContent = isCompetitive
      ? `/ ${this.totalLaps}`
      : "/ ∞";

    const savedRec = GameApp.profile.records[this.trackConfig.id];
    document.getElementById("hud-best-time").textContent =
      savedRec && savedRec.bestLap
        ? UI.formatLapTime(savedRec.bestLap)
        : "--:--.---";

    AudioEngine.setDrivingAudioActive(true);
  },

  startLanSession(
    trackId,
    players,
    laps,
    countdownDuration,
    raceStartTime,
    serverTime,
    extraOptions,
  ) {
    this.ensureTelemetryBannerExists();
    // Invalida la cache DOM: i banner di telemetria possono essere stati (ri)creati
    this._hudEls = {};
    extraOptions = extraOptions || {};
    const isChamp =
      extraOptions.gameMode === "championship" ||
      (typeof NetworkEngine !== "undefined" &&
        NetworkEngine.roomGameMode === "championship");
    this.isLanChampionship = isChamp;
    this.mode = isChamp ? "lan_championship" : "lan_race";
    this.networkRaceId = extraOptions.raceId || null;
    this.totalLaps = laps || 3;
    this.raceStartTimeEpoch = raceStartTime || null;
    this.countdownDuration = countdownDuration || 4.5;

    this.trackConfig =
      TRACK_CATALOG.find((t) => t.id === trackId) || TRACK_CATALOG[0];

    const myId =
      (typeof NetworkEngine !== "undefined" &&
        (NetworkEngine.myPlayerId || NetworkEngine.myId)) ||
      "local";

    if (this.isLanChampionship && typeof ChampionshipEngine !== "undefined") {
      // Propaga sempre la scelta Bot ON/OFF dell'Host alla generazione della griglia
      const lanChampConfig = Object.assign(
        { enableBots: extraOptions.enableBots !== false },
        extraOptions.championship || {},
      );
      if (
        !ChampionshipEngine.state ||
        !ChampionshipEngine.state.isLan ||
        (extraOptions.championship &&
          extraOptions.championship.currentStageIndex === 0)
      ) {
        ChampionshipEngine.initLanSeason(lanChampConfig, players, myId);
      } else if (extraOptions.championship) {
        ChampionshipEngine.syncLanSeason(extraOptions.championship);
      }
    }
    const myProfile = (players && players.find((p) => p.id === myId)) || {
      id: myId,
      name:
        (typeof NetworkEngine !== "undefined" && NetworkEngine.nickname) ||
        "Pilota LAN",
      color:
        (typeof NetworkEngine !== "undefined" && NetworkEngine.selectedColor) ||
        "#00f0ff",
      carId:
        (typeof NetworkEngine !== "undefined" && NetworkEngine.selectedCarId) ||
        "hatchback",
      gridSlot: 0,
    };
    if (typeof NetworkEngine !== "undefined" && NetworkEngine.selectedCarId) {
      myProfile.carId = NetworkEngine.selectedCarId;
    }
    if (typeof NetworkEngine !== "undefined" && NetworkEngine.selectedColor) {
      myProfile.color = NetworkEngine.selectedColor;
    }

    const playerCarConfig =
      CAR_CATALOG.find((c) => c.id === myProfile.carId) || CAR_CATALOG[0];

    GameApp.clearScene();
    this.trackData = TrackBuilder.buildTrackEnvironment(
      GameApp.scene,
      this.trackConfig,
      playerCarConfig.physics,
    );

    this.isActive = true;
    this.isPaused = false;
    this.isFinished = false;
    this.chequeredFlagActive = false;
    this.chequeredFlagTimer = 0;
    this.officialFinishOrder = [];
    this.postRaceCooldownTimer = 0;
    this.raceSessionClosing = false;
    this.raceElapsedSeconds = 0;
    this.raceStartEpoch = 0;
    this.fastestLapTime = Infinity;
    this.fastestLapRacer = null;
    this.frameCounter = 0;

    const finishBanner = document.getElementById("hud-finish-banner");
    if (finishBanner) finishBanner.classList.add("hidden");
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
    const hostPlayerId =
      (typeof NetworkEngine !== "undefined" && NetworkEngine.hostId) || null;
    const playerList =
      Array.isArray(players) && players.length > 0
        ? [...players].sort((a, b) => {
            if (hostPlayerId) {
              if (a.id === hostPlayerId) return -1;
              if (b.id === hostPlayerId) return 1;
            }
            return String(a.id).localeCompare(String(b.id));
          })
        : [myProfile];

    const gridSlots =
      (extraOptions && extraOptions.gridSlots) ||
      (this.isLanChampionship && typeof ChampionshipEngine !== "undefined"
        ? ChampionshipEngine.getGridSlots()
        : null);

    let mySlot =
      gridSlots && gridSlots[myId] !== undefined
        ? gridSlots[myId]
        : playerList.findIndex((p) => p.id === myId);
    if (mySlot < 0) mySlot = 0;

    const mySlotTrans = this.getGridSlot(mySlot);
    const playerSampleIdx = mySlotTrans.sampleIndex;
    const playerColOffset = mySlotTrans.lateralOffset;
    const initialPos = mySlotTrans.point;
    const initialHeading = mySlotTrans.heading;

    const myPaint = myProfile.color
      ? parseInt(myProfile.color.replace("#", "0x"), 16)
      : null;
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
      let rem =
        typeof remotePlayers !== "undefined" ? remotePlayers[otherP.id] : null;

      // Se la mesh non esiste o è di un modello/colore vecchio, forza la ricostruzione Three.js
      if (
        rem &&
        (!rem.mesh || rem.carId !== otherP.carId || rem.color !== otherP.color)
      ) {
        if (typeof NetworkEngine !== "undefined") {
          NetworkEngine.rebuildRemoteMesh(
            otherP.id,
            otherP.carId,
            otherP.color,
            otherP.name,
          );
          rem = remotePlayers[otherP.id];
        }
      }

      const slot =
        gridSlots && gridSlots[otherP.id] !== undefined
          ? gridSlots[otherP.id]
          : idx;
      const slotTrans = this.getGridSlot(slot);
      const sIdx = slotTrans.sampleIndex;
      const colOff = slotTrans.lateralOffset;
      const pos = slotTrans.point;
      const heading = slotTrans.heading;

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

      const remCarConfig =
        CAR_CATALOG.find((c) => c.id === otherP.carId) || CAR_CATALOG[0];
      const remColorHex = otherP.color
        ? parseInt(otherP.color.replace("#", "0x"), 16)
        : remCarConfig.colorHex;

      const remCarId = remCarConfig.id;
      const remHL =
        remCarId === "hypercar"
          ? 2.4
          : remCarId === "muscle"
            ? 2.35
            : remCarId === "hatchback"
              ? 2.15
              : 2.3;
      const remHW =
        remCarId === "hypercar" ? 1.05 : remCarId === "hatchback" ? 0.98 : 1.02;
      const remMass =
        (remCarConfig.physics && remCarConfig.physics.mass) || 1200;
      const remInertia =
        (1 / 12) * remMass * ((2 * remHW) ** 2 + (2 * remHL) ** 2);

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

    // Spawna e posiziona i piloti IA ufficiali F1 per completare la griglia nel Gran Premio LAN
    if (
      this.isLanChampionship &&
      typeof ChampionshipEngine !== "undefined" &&
      ChampionshipEngine.state
    ) {
      const aiDrivers = ChampionshipEngine.state.drivers.filter((d) => d.isAi);
      aiDrivers.forEach((aiDrv) => {
        const fallbackSlot =
          playerList.length +
          parseInt(String(aiDrv.id).replace("ai_", "") || "1", 10) -
          1;
        const aiSlot =
          gridSlots && gridSlots[aiDrv.id] !== undefined
            ? gridSlots[aiDrv.id]
            : fallbackSlot;
        const slotTrans = this.getGridSlot(aiSlot);

        const aiRacer = this.createRacerEntity({
          id: aiDrv.id,
          carConfig: playerCarConfig,
          driverCode: aiDrv.code,
          driverName: aiDrv.name,
          isPlayer: false,
          sampleIndex: slotTrans.sampleIndex,
          lateralOffset: slotTrans.lateralOffset,
          customPaint: aiDrv.paint,
          aiProfile: aiDrv.aiProfile,
        });
        aiRacer.isAi = true;
        this.aiCars.push(aiRacer);
        this.allRacers.push(aiRacer);
      });
    }

    // Inizializza telecamera GT dinamica
    this.camHeading = this.player.heading;
    const forward = new THREE.Vector3(
      Math.sin(this.camHeading),
      0,
      Math.cos(this.camHeading),
    );
    this.camPos
      .copy(this.player.position)
      .addScaledVector(forward, -8.4)
      .add(new THREE.Vector3(0, 2.75, 0));
    this.camLook
      .copy(this.player.position)
      .addScaledVector(forward, 16.5)
      .add(new THREE.Vector3(0, 1.45, 0));
    GameApp.camera.position.copy(this.camPos);
    GameApp.camera.lookAt(this.camLook);

    // Countdown sincronizzato al millisecondo tramite orologio NTP del server
    if (
      this.raceStartTimeEpoch &&
      typeof NetworkEngine !== "undefined" &&
      NetworkEngine.isConnected
    ) {
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
    this.hideChampionshipModals();

    if (raceHud) {
      raceHud.classList.remove("hidden");
      raceHud.classList.add("flex");
    }

    const trackNameEl = document.getElementById("hud-track-name");
    if (trackNameEl) {
      trackNameEl.textContent =
        this.isLanChampionship &&
        typeof ChampionshipEngine !== "undefined" &&
        ChampionshipEngine.state
          ? `${this.trackConfig.name} [TAPPA ${ChampionshipEngine.getCurrentStageNumber()}/${ChampionshipEngine.state.totalStages} • LAN GP]`
          : this.trackConfig.name + " [LAN MULTIPLAYER]";
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
    const toastMsg = this.isLanChampionship
      ? `Tappa ${ChampionshipEngine.getCurrentStageNumber()} Avviata! ${this.allRacers.length} vetture sulla griglia!`
      : `Gara LAN Avviata! ${this.allRacers.length} piloti in pista!`;
    UI.showToast(toastMsg, "fa-users");
  },

  resolveAIRacePersona(aiProfile) {
    if (!aiProfile) return null;
    const weights = aiProfile.archetypeWeights || {
      attacker: 0.35,
      tactician: 0.35,
      prudent: 0.3,
    };
    const pAttacker = weights.attacker ?? 0.35;
    const pTactician = pAttacker + (weights.tactician ?? 0.35);
    const rand = Math.random();

    let archetype = "tactician";
    if (rand < pAttacker) {
      archetype = "attacker";
    } else if (rand < pTactician) {
      archetype = "tactician";
    } else {
      archetype = "prudent";
    }

    // Daily race-day form factor (-0.035 to +0.035)
    const raceDayForm = (Math.random() - 0.5) * 0.07;

    let cfg = {};
    if (archetype === "attacker") {
      cfg = {
        name: "Attaccante",
        badgeTag: "ATTACCO",
        brakeMarginMult: 1.08,
        aggressionMult: 1.2,
        skillMult: 1.03,
        slingshotDist: 26.0,
        minPassingGap: 2.6,
        lateralSafetyMargin: 2.6,
        defensiveBias: 0.9,
        preferredOffsetBias: (Math.random() - 0.5) * 0.5 - 0.2,
      };
    } else if (archetype === "tactician") {
      cfg = {
        name: "Tattico",
        badgeTag: "TATTICA",
        brakeMarginMult: 1.03,
        aggressionMult: 1.05,
        skillMult: 1.01,
        slingshotDist: 22.0,
        minPassingGap: 2.9,
        lateralSafetyMargin: 2.9,
        defensiveBias: 1.4,
        preferredOffsetBias: (Math.random() - 0.5) * 0.4,
      };
    } else {
      cfg = {
        name: "Prudente",
        badgeTag: "GESTIONE",
        brakeMarginMult: 0.98,
        aggressionMult: 0.9,
        skillMult: 0.99,
        slingshotDist: 19.0,
        minPassingGap: 3.2,
        lateralSafetyMargin: 3.5,
        defensiveBias: 0.7,
        preferredOffsetBias: (Math.random() - 0.5) * 0.4 + 0.25,
      };
    }

    return {
      archetype,
      raceDayForm,
      lineWaveSeed: Math.random() * 50.0,
      lineWaveFreq: 0.08 + Math.random() * 0.06,
      ...cfg,
    };
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
    const hLength =
      carId === "hypercar"
        ? 2.4
        : carId === "muscle"
          ? 2.35
          : carId === "hatchback"
            ? 2.15
            : 2.3;
    const hWidth =
      carId === "hypercar" ? 1.05 : carId === "hatchback" ? 0.98 : 1.02;
    const carMass =
      (opts.carConfig.physics && opts.carConfig.physics.mass) || 1200;
    const carInertia =
      (1 / 12) * carMass * ((2 * hWidth) ** 2 + (2 * hLength) ** 2);

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
      finishRank: 0,
      startLaneOffset: opts.lateralOffset,
      currentAimOffset: opts.lateralOffset,
      overtakeBias: 0,
      errorWideTimer: 0,
      aiStatusTag: "",
      sensorBlockedFront: false,
      sensorFrontDist: 99,
      sensorFrontSpeed: 0,
      inDraft: false,
      draftIntensity: 0,
      draftTargetName: null,
      draftChargeTimer: 0,
      draftChargePct: 0,
      slingshotBoostTimer: 0,
      slingshotCooldownTimer: 0,
      isSlingshotBoosting: false,
      launchDelay: opts.aiProfile
        ? Math.random() * 0.12 + (this.getDifficultyConfig().reactionDelay || 0)
        : 0,
      aiProfile: opts.aiProfile,
      aiPersona: opts.aiProfile
        ? this.resolveAIRacePersona(opts.aiProfile)
        : null,
      wheelToWheelOverlap: false,
      wheelToWheelSideOffset: 0,
      personalLineOffset: 0,
      stuckTimer: 0,
      unstickTimer: 0,
      wallManeuverElapsed: 0,
      wallRecoveryCooldown: 0,
      isUnsticking: false,
      touchingBarrier: false,
      barrierContactSide: 0,
      collisionCooldownTimer: 0,
      barrierAvoidOffset: 0,
      wallRecoveryPhase: 0,
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
        240,
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
      if (
        (this.mode === "lan_race" ||
          this.mode === "lan_championship" ||
          this.isLanChampionship) &&
        this.raceStartTimeEpoch &&
        typeof NetworkEngine !== "undefined" &&
        NetworkEngine.isConnected
      ) {
        const sNow = NetworkEngine.getServerTime();
        this.countdownTimer = Math.max(
          0,
          (this.raceStartTimeEpoch - sNow) / 1000,
        );
      } else {
        this.countdownTimer -= dt;
      }
      if (gantryEl) {
        gantryEl.classList.remove("hidden");
        gantryEl.classList.add("flex");
      }

      const totCount = this.totalCountdown || 5.4;
      const elapsedStart = totCount - this.countdownTimer;
      const lightsToLight = Math.min(
        5,
        Math.floor((elapsedStart / (totCount - 0.7)) * 5) + 1,
      );

      if (this.countdownTimer > 0.55) {
        for (let l = 1; l <= 5; l++) {
          const el = document.getElementById(`f1-light-${l}`);
          const isLit = l <= lightsToLight;
          if (el) el.className = isLit ? "f1-light lit" : "f1-light";
          if (
            this.trackData &&
            this.trackData.lightPods3D &&
            this.trackData.lightPods3D[l - 1]
          ) {
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
          if (
            this.trackData &&
            this.trackData.lightPods3D &&
            this.trackData.lightPods3D[l - 1]
          ) {
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

    if (
      (this.mode === "lan_race" ||
        this.mode === "lan_championship" ||
        this.isLanChampionship) &&
      this.raceStartTimeEpoch &&
      typeof NetworkEngine !== "undefined" &&
      NetworkEngine.isConnected
    ) {
      this.raceElapsedSeconds = Math.max(
        0,
        (NetworkEngine.getServerTime() - this.raceStartTimeEpoch) / 1000,
      );
    } else {
      this.raceElapsedSeconds += dt;
    }

    // Update Player Physics
    // Anche dopo aver tagliato il traguardo il pilota mantiene il CONTROLLO MANUALE
    // in regime di "crociera libera" fino al transito di tutti gli avversari reali.
    this.updatePlayerPhysics(this.player, dt);

    // Update AI CPU Racing Agents (Autorità Host nel Gran Premio LAN)
    const isGuestInLanChamp =
      (this.isLanChampionship || this.mode === "lan_championship") &&
      typeof NetworkEngine !== "undefined" &&
      NetworkEngine.isConnected &&
      !NetworkEngine.isHost;

    if (!isGuestInLanChamp) {
      for (let ai of this.aiCars) {
        this.updateCPUAgentPhysics(ai, dt, Boolean(ai.finished));
      }
    } else {
      this.updateGuestLanAICars(dt);
    }

    // 3D Oriented Bounding Sphere Collision Resolution
    this.resolveCarCollisions();

    // Update Smoke Particles
    this.updateSmokeParticles(dt);

    // Aggiorna posizione e progresso dei giocatori remoti per classifica e minimap
    if (
      (this.mode === "lan_race" ||
        this.mode === "lan_championship" ||
        this.isLanChampionship) &&
      typeof remotePlayers !== "undefined" &&
      this.trackData
    ) {
      const N = this.trackData.samples.length;
      for (let racer of this.allRacers) {
        if (racer.isRemotePlayer) {
          const rem = remotePlayers[racer.id];
          if (rem && rem.mesh) {
            racer.position.copy(rem.mesh.position);
            racer.speed = rem.targetSpeed || 0;
            racer.heading = rem.mesh.rotation.y;

            if (typeof rem.totalProgress === "number") {
              racer.totalProgress = rem.totalProgress;
              racer.lap = rem.lap || 1;
              racer.sampleIndex = rem.sampleIndex || 0;
              racer.currentLapTime = rem.curTime || 0;
              racer.bestLapTime = rem.bestTime || null;
              racer.finished = Boolean(rem.finished);
              racer.finishTime = rem.finishTime || 0;
              if (
                racer.finished &&
                !this.officialFinishOrder.some((r) => r.id === racer.id)
              ) {
                this.recordCarFinish(racer, racer.finishTime);
              }
            } else {
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
              racer.totalProgress =
                (racer.hasStartedFirstLap ? racer.lap - 1 : -1) +
                closestIdx / N;
            }
          }
        }
      }
    }

    // Aggiorna timer globale bandiera a scacchi
    if (this.chequeredFlagActive) {
      this.chequeredFlagTimer = (this.chequeredFlagTimer || 0) + dt;
    }

    // Valutazione arrivo multi-vettura e chiusura naturale della sessione
    const isCompetitive =
      this.mode === "race" ||
      this.mode === "lan_race" ||
      this.mode === "championship" ||
      this.mode === "lan_championship" ||
      this.isLanChampionship;
    if (isCompetitive && !this.raceSessionClosing && !this.isFinished) {
      const isLanSession =
        (this.mode === "lan_race" ||
          this.mode === "lan_championship" ||
          this.isLanChampionship) &&
        typeof NetworkEngine !== "undefined" &&
        NetworkEngine.isConnected;
      const allCarsDone =
        this.allRacers.length > 0 && this.allRacers.every((r) => r.finished);

      let allHumansDone = Boolean(this.player && this.player.finished);
      if (isLanSession) {
        for (let racer of this.allRacers) {
          if ((racer.isPlayer || racer.isRemotePlayer) && !racer.finished) {
            allHumansDone = false;
            break;
          }
        }
      }

      if (this.player && this.player.finished) {
        if (this.postRaceCooldownTimer > 0) {
          this.postRaceCooldownTimer -= dt;
        }

        // Il pilota resta in crociera libera (controllo manuale). Solo quando TUTTI i
        // piloti reali (TU + eventuali ospiti umani in LAN) hanno tagliato il traguardo
        // il cooldown viene ridotto a un breve margine di 2.5s prima della chiusura.
        if (isLanSession && allHumansDone && this.postRaceCooldownTimer > 2.5) {
          this.postRaceCooldownTimer = 2.5;
        }

        const cooldownExpired = this.postRaceCooldownTimer <= 0;

        // Chiusura: tutte le vetture hanno tagliato il traguardo, oppure è scaduto il
        // budget di attesa dei piloti reali (7s offline, 30s LAN) -> estrapola i ritardatari.
        if (allCarsDone || cooldownExpired) {
          this.raceSessionClosing = true;
          setTimeout(() => {
            if (!this.isFinished) {
              this.completeRaceSession();
            }
          }, 350);
        }
      } else if (this.chequeredFlagActive && this.chequeredFlagTimer > 45.0) {
        // Safety timeout dopo bandiera a scacchi se il giocatore non riesce a tagliare la linea
        this.raceSessionClosing = true;
        this.completeRaceSession();
      }
    }

    // Update Camera, HUD & Minimap
    this.updateCamera(dt);
    this.updateHUD(nowMs);
    this.drawMinimap();
  },

  computePlayerSlipstream(car, dt) {
    if (!this.allRacers || this.allRacers.length <= 1) {
      car.draftIntensity = THREE.MathUtils.lerp(
        car.draftIntensity || 0,
        0,
        dt * 5.0,
      );
      car.draftChargeTimer = 0;
      car.draftChargePct = 0;
      car.inDraft = false;
      car.draftTargetName = null;
      return;
    }

    // Cooldown post-boost
    if (car.slingshotCooldownTimer > 0) {
      car.slingshotCooldownTimer = Math.max(0, car.slingshotCooldownTimer - dt);
    }

    // GESTIONE ATTIVA DELLO SLINGSHOT BOOST (DURATA 2.6 SECONDI STILE MARIO KART)
    if (car.slingshotBoostTimer > 0) {
      car.slingshotBoostTimer = Math.max(0, car.slingshotBoostTimer - dt);
      car.isSlingshotBoosting = car.slingshotBoostTimer > 0;
      car.draftChargeTimer = 0;
      car.draftChargePct = 0;

      // Durante lo slingshot boost l'intensità resta massima con leggero fade negli ultimi 0.5s
      const boostTaper = Math.min(1.0, car.slingshotBoostTimer / 0.45);
      car.draftIntensity = THREE.MathUtils.lerp(
        car.draftIntensity || 0,
        boostTaper,
        dt * 8.0,
      );
      car.inDraft = true;
      return;
    } else {
      car.isSlingshotBoosting = false;
    }

    const minSpeedForDraft = 18.0; // ~65 km/h velocità minima
    if (car.speed < minSpeedForDraft || car.slingshotCooldownTimer > 0) {
      car.draftChargeTimer = Math.max(
        0,
        (car.draftChargeTimer || 0) - dt * 2.2,
      );
      car.draftChargePct = Math.min(1.0, (car.draftChargeTimer || 0) / 1.3);
      car.draftIntensity = THREE.MathUtils.lerp(
        car.draftIntensity || 0,
        0,
        dt * 5.0,
      );
      car.inDraft = false;
      car.draftTargetName = null;
      return;
    }

    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    const rightX = forwardZ;
    const rightZ = -forwardX;

    let inWakeCone = false;
    let closestTarget = null;
    let closestTargetDistSq = Infinity;
    let wakeQuality = 0;

    for (let i = 0; i < this.allRacers.length; i++) {
      const other = this.allRacers[i];
      if (other === car) continue;
      if (Math.abs(other.position.y - car.position.y) > 3.2) continue;

      const dx = other.position.x - car.position.x;
      const dz = other.position.z - car.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 1156) continue; // Raggio max ~34m

      const fwdProj = dx * forwardX + dz * forwardZ;
      const latProj = dx * rightX + dz * rightZ;

      // Cono di scia: tra 5.5m e 27.0m in avanti, e entro 2.3m laterali dalla scia
      if (fwdProj >= 5.5 && fwdProj <= 27.0 && Math.abs(latProj) <= 2.3) {
        if (other.speed > 13.5) {
          inWakeCone = true;
          // Traccia il rivale EFFETTIVAMENTE più vicino, non l'ultimo trovato nel cono
          if (distSq < closestTargetDistSq) {
            closestTargetDistSq = distSq;
            closestTarget = other;
          }

          const distFactor =
            fwdProj <= 14.0
              ? 1.0
              : Math.max(0.2, 1.0 - (fwdProj - 14.0) / 13.0);
          const latFactor = Math.max(0.2, 1.0 - Math.abs(latProj) / 2.3);
          const quality = distFactor * latFactor;
          if (quality > wakeQuality) {
            wakeQuality = quality;
          }
        }
      }
    }

    const REQUIRED_CHARGE_TIME = 1.3; // 1.30s di inseguimento per sbloccare il boost

    if (inWakeCone) {
      car.draftTargetName = closestTarget
        ? closestTarget.driverCode || closestTarget.driverName || "VETTURA"
        : null;

      // Il caricamento cresce progressivamente
      car.draftChargeTimer =
        (car.draftChargeTimer || 0) + dt * (0.8 + wakeQuality * 0.5);
      car.draftChargePct = Math.min(
        1.0,
        car.draftChargeTimer / REQUIRED_CHARGE_TIME,
      );

      // Risucchio iniziale moderato durante il caricamento (fino a 0.35)
      const chargeDraftIntensity = car.draftChargePct * 0.35;
      car.draftIntensity = THREE.MathUtils.lerp(
        car.draftIntensity || 0,
        chargeDraftIntensity,
        dt * 4.0,
      );
      car.inDraft = true;

      // SBLOCCO SLINGSHOT BOOST! (Carica completata stile Mario Kart)
      if (car.draftChargeTimer >= REQUIRED_CHARGE_TIME) {
        car.slingshotBoostTimer = 2.6; // Dura 2.6 secondi pieni per completare il sorpasso!
        car.isSlingshotBoosting = true;
        car.slingshotCooldownTimer = 3.6; // Cooldown per evitare boost a catena immediati
        car.draftChargeTimer = 0;
        car.draftChargePct = 0;
        car.draftIntensity = 1.0;

        // Effetti sonori e visivi di scatto boost
        if (
          typeof AudioEngine !== "undefined" &&
          AudioEngine.playSlingshotBoost
        ) {
          AudioEngine.playSlingshotBoost();
        } else if (
          typeof AudioEngine !== "undefined" &&
          AudioEngine.playTurboBoost
        ) {
          AudioEngine.playTurboBoost();
        }

        // Camera impact shake
        this.triggerCameraShake(0.35);

        UI.showToast("🚀 SLINGSHOT BOOST ATTIVO! VAI COL SORPASSO!", "fa-wind");
      }
    } else {
      // Se si esce temporaneamente dalla sagoma, la carica decresce dolcemente senza azzerarsi subito
      car.draftChargeTimer = Math.max(
        0,
        (car.draftChargeTimer || 0) - dt * 1.5,
      );
      car.draftChargePct = Math.min(
        1.0,
        car.draftChargeTimer / REQUIRED_CHARGE_TIME,
      );
      car.draftIntensity = THREE.MathUtils.lerp(
        car.draftIntensity || 0,
        0,
        dt * 4.5,
      );
      car.inDraft = car.draftChargePct > 0.08;
      if (!car.inDraft) {
        car.draftTargetName = null;
      }
    }
  },

  updatePlayerPhysics(car, dt) {
    const phys = car.carConfig.physics;
    const throttle = this.keys.up ? 1 : 0;
    const brake = this.keys.down ? 1 : 0;
    const handbrake = this.keys.space;

    // 1. Calcolo scia aerodinamica e Slingshot Boost
    this.computePlayerSlipstream(car, dt);
    const draftIntensity = car.draftIntensity || 0;
    const isSlingshot = car.isSlingshotBoosting;

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

    // Aerodinamica combinata:
    // Se Slingshot Boost attivo: -38% drag fisso per 2.6s (anche fuori scia per passare l'auto)
    // Altrimenti: fino a -18% drag proporzionale durante il caricamento
    const dragReduction = isSlingshot ? 0.38 : draftIntensity * 0.18;
    const baseDrag = car.drsActive ? phys.dragCoeff * 0.72 : phys.dragCoeff;
    const effectiveDrag = baseDrag * (1.0 - dragReduction);

    // Velocità di punta effettiva:
    // DRS (+14.4 km/h) + Slingshot Boost (+23.8 km/h duraturo) o pre-carica (+6.5 km/h)
    const slingshotSpeedBonus = isSlingshot ? 6.6 : draftIntensity * 1.8;
    const effectiveMaxSpeed =
      phys.maxSpeed + (car.drsActive ? 4.0 : 0.0) + slingshotSpeedBonus;

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

      // Spinta motrice con bonus DRS, Turbo Pad e Slingshot Boost duraturo (+32% spinta!)
      const slingshotDriveMult = isSlingshot
        ? 1.32
        : 1.0 + draftIntensity * 0.1;
      driveForce =
        tractiveForce *
        (car.drsActive ? 1.08 : 1.0) *
        (turboActive ? 2.35 : 1.0) *
        slingshotDriveMult;

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
      car.angularVelocity = THREE.MathUtils.damp(
        car.angularVelocity,
        0,
        7.8,
        dt,
      );
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
    const slipAngle = Math.atan2(
      car.lateralVel || 0,
      Math.max(5, Math.abs(car.speed)),
    );
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
      car.draftIntensity || 0,
    );
  },

  applyLanAITelemetry(aiList) {
    if (!Array.isArray(aiList) || !this.aiCars) return;
    for (let i = 0; i < aiList.length; i++) {
      const data = aiList[i];
      if (!data || typeof data.id !== "string") continue;
      const ai = this.aiCars.find((c) => c.id === data.id);
      if (ai) {
        const finite = (value, fallback) =>
          typeof value === "number" && Number.isFinite(value)
            ? value
            : fallback;
        const x = finite(data.x, ai.position.x);
        const y = finite(data.y, ai.position.y);
        const z = finite(data.z, ai.position.z);
        if (!ai.targetPos) {
          ai.targetPos = new THREE.Vector3(x, y, z);
        } else {
          ai.targetPos.set(x, y, z);
        }
        ai.targetHeading = finite(data.rotY, ai.heading);
        ai.targetSpeed = Math.max(0, finite(data.speed, ai.speed || 0));
        ai.speed = ai.targetSpeed;
        ai.lap = Number.isInteger(data.lap) ? data.lap : ai.lap;
        ai.sampleIndex = Number.isInteger(data.sampleIndex)
          ? data.sampleIndex
          : ai.sampleIndex;
        ai.totalProgress = finite(data.totalProgress, ai.totalProgress || 0);
        ai.currentLapTime = Math.max(
          0,
          finite(data.curTime, ai.currentLapTime || 0),
        );
        ai.bestLapTime =
          typeof data.bestTime === "number" && Number.isFinite(data.bestTime)
            ? data.bestTime
            : null;
        ai.finished = Boolean(data.finished);
        ai.finishTime = Math.max(0, finite(data.finishTime, 0));
        ai.aiStatusTag =
          typeof data.aiStatusTag === "string"
            ? data.aiStatusTag.slice(0, 32)
            : null;
      }
    }
  },

  updateGuestLanAICars(dt) {
    if (!this.aiCars || !this.trackData) return;
    const safeDt = Math.min(0.1, dt);
    this._guestAiFrame = (this._guestAiFrame || 0) + 1;
    const doPitch = (this._guestAiFrame & 1) === 0;
    const posBlend = 1.0 - Math.exp(-14.0 * safeDt);
    const rotBlend = 1.0 - Math.exp(-16.0 * safeDt);

    for (const ai of this.aiCars) {
      if (ai.targetPos) {
        const distSq = ai.position.distanceToSquared(ai.targetPos);
        if (distSq > 144) {
          ai.position.copy(ai.targetPos);
        } else {
          ai.position.lerp(ai.targetPos, posBlend);
        }
      }

      if (typeof ai.targetHeading === "number") {
        let diff = (ai.targetHeading - ai.heading) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        ai.heading += diff * rotBlend;
      }

      if (ai.mesh) {
        ai.mesh.position.copy(ai.position);
        ai.mesh.rotation.y = ai.heading;

        // Beccheggio aggiornato a frame alterni (impercettibile) per alleggerire le query di superficie
        if (doPitch && this.getTrackSurfaceY) {
          ai.mesh.rotation.order = "YXZ";
          const sinH = Math.sin(ai.heading);
          const cosH = Math.cos(ai.heading);
          const fY = this.getTrackSurfaceY(
            ai.position.x + sinH * 1.4,
            ai.position.z + cosH * 1.4,
            ai.sampleIndex || 0,
          );
          const rY = this.getTrackSurfaceY(
            ai.position.x - sinH * 1.4,
            ai.position.z - cosH * 1.4,
            ai.sampleIndex || 0,
          );
          ai.mesh.rotation.x = -Math.atan2(fY - rY, 2.8);
        }

        const ud = ai.mesh.userData;
        if (ud && ud.wheelMeshes) {
          const wDelta = ((ai.speed || 0) / 0.37) * safeDt;
          ud.wheelMeshes.forEach((w) => {
            w.rotation.x += wDelta;
          });
        }
      }
    }
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
    const persona = ai.aiPersona || {
      archetype: "tactician",
      brakeMarginMult: 1.0,
      aggressionMult: 1.0,
      skillMult: 1.0,
      slingshotDist: 21.0,
      minPassingGap: 3.1,
      lateralSafetyMargin: 3.1,
      defensiveBias: 1.0,
      preferredOffsetBias: 0,
      lineWaveSeed: 0,
      lineWaveFreq: 0.1,
      raceDayForm: 0,
    };
    const halfWidth = this.trackData.halfWidth;
    const diffConfig = this.getDifficultyConfig();
    ai.wallRecoveryCooldown = Math.max(0, (ai.wallRecoveryCooldown || 0) - dt);

    if (!isCooldownAutopilot && (this.frameCounter + ai.id) % 2 === 0) {
      this.evaluateAISensorsAndOvertaking(ai, prof, persona, halfWidth);
    }

    // 0. Stuck Detection & Fail-Safe Auto-Recovery
    if (ai.touchingBarrier) {
      ai.stuckTimer = (ai.stuckTimer || 0) + dt * 2.5;
      ai.wallManeuverElapsed = (ai.wallManeuverElapsed || 0) + dt;
    } else if (this.raceElapsedSeconds > 4.0 && Math.abs(ai.speed) < 1.8) {
      ai.stuckTimer = (ai.stuckTimer || 0) + dt;
      ai.wallManeuverElapsed = (ai.wallManeuverElapsed || 0) + dt;
    } else if (!ai.isUnsticking) {
      ai.stuckTimer = Math.max(0, (ai.stuckTimer || 0) - dt * 2.0);
      ai.wallManeuverElapsed = Math.max(
        0,
        (ai.wallManeuverElapsed || 0) - dt * 3.0,
      );
    }

    // Unsticking trigger: only engage the reverse maneuver when the car is
    // genuinely pinned against the wall (not on a simple glancing rub).
    const shouldUnstickNow =
      ai.wallRecoveryCooldown <= 0 &&
      ai.touchingBarrier &&
      Math.abs(ai.speed) < 1.0 &&
      (ai.stuckTimer || 0) > 1.8;

    // Safety Respawn Fail-Safe: last resort only, if the car cannot recover at
    // all (the predictive anti-wall logic should make this rare).
    if (
      ai.wallManeuverElapsed > 12.0 ||
      (ai.stuckTimer > 8.0 && !ai.isUnsticking)
    ) {
      const safeSample = samples[ai.sampleIndex];
      ai.position.copy(safeSample.point);
      ai.position.y = safeSample.point.y;
      ai.heading = Math.atan2(safeSample.tangent.x, safeSample.tangent.z);
      ai.lateralDist = 0;
      ai.currentAimOffset = 0;
      ai.speed = Math.max(16.0, (phys.maxSpeed || 80) * 0.35);
      ai.gear = 2;
      ai.angularVelocity = 0;
      ai.lateralVel = 0;
      ai.steerAngle = 0;
      ai.stuckTimer = 0;
      ai.unstickTimer = 0;
      ai.wallManeuverElapsed = 0;
      ai.isUnsticking = false;
      ai.touchingBarrier = false;
      ai.barrierContactSide = 0;
      ai.wallRecoveryPhase = 0;
      ai.barrierAvoidOffset = 0;
      ai.wallRecoveryCooldown = 2.0;
      ai.aiStatusTag = "RIENTRO!";
      if (ai.mesh) {
        ai.mesh.position.copy(ai.position);
        ai.mesh.rotation.y = ai.heading;
      }
      return;
    }
    // Trigger unsticking reverse maneuver only when actually pinned
    else if (
      ai.wallRecoveryCooldown <= 0 &&
      shouldUnstickNow &&
      !ai.isUnsticking
    ) {
      ai.isUnsticking = true;
      ai.unstickTimer = 1.4;
    }

    // ACTIVE UNSTICKING ROUTINE (Reverse Gear & Steer Away)
    if (ai.isUnsticking) {
      ai.unstickTimer -= dt;
      ai.wallManeuverElapsed = (ai.wallManeuverElapsed || 0) + dt;
      ai.aiStatusTag = "MANOVRA!";

      const safeSample = samples[ai.sampleIndex];
      const trackYaw = Math.atan2(safeSample.tangent.x, safeSample.tangent.z);
      let headingError = trackYaw - ai.heading;
      while (headingError > Math.PI) headingError -= Math.PI * 2;
      while (headingError < -Math.PI) headingError += Math.PI * 2;

      // Reverse only when car is facing away or truly motionless
      const canEscapeForward =
        Math.abs(headingError) < 0.9 && ai.speed > 1.2 && ai.stuckTimer < 0.8;
      ai.wallRecoveryPhase = canEscapeForward ? 1 : 2;
      ai.gear = canEscapeForward ? 1 : "R";

      // Steer toward open track using contact side
      const contactSide =
        ai.barrierContactSide || Math.sign(ai.lateralDist) || 1;
      const steerAwaySign = contactSide >= 0 ? -1 : 1;
      const unstickSteer =
        steerAwaySign * phys.steerRate * (canEscapeForward ? 0.75 : 0.9);
      ai.steerAngle = THREE.MathUtils.damp(
        ai.steerAngle,
        unstickSteer,
        12.0,
        dt,
      );

      // Orient car towards open track
      const targetUnstickHeading = trackYaw + (contactSide >= 0 ? -0.25 : 0.25);
      let headDiff = targetUnstickHeading - ai.heading;
      while (headDiff > Math.PI) headDiff -= Math.PI * 2;
      while (headDiff < -Math.PI) headDiff += Math.PI * 2;
      ai.heading += THREE.MathUtils.clamp(headDiff * 4.0, -3.0, 3.0) * dt;

      const targetRecoverySpeed = canEscapeForward ? 10.0 : -6.5;
      const speedDelta = targetRecoverySpeed - ai.speed;
      const accel = THREE.MathUtils.clamp(speedDelta * 3.5, -10.0, 6.0);
      ai.speed = THREE.MathUtils.clamp(ai.speed + accel * dt, -8.0, 14.0);

      ai.lateralVel =
        contactSide >= 0
          ? canEscapeForward
            ? -3.5
            : -2.2
          : canEscapeForward
            ? 3.5
            : 2.2;

      if (ai.angularVelocity) {
        ai.angularVelocity = THREE.MathUtils.damp(
          ai.angularVelocity,
          0,
          8.5,
          dt,
        );
      }

      const aiFwdX = Math.sin(ai.heading);
      const aiFwdZ = Math.cos(ai.heading);
      const aiRightX = aiFwdZ;
      const aiRightZ = -aiFwdX;

      ai.position.x +=
        (aiFwdX * ai.speed + aiRightX * (ai.lateralVel || 0)) * dt;
      ai.position.z +=
        (aiFwdZ * ai.speed + aiRightZ * (ai.lateralVel || 0)) * dt;

      this.updateSplineProgressAndWalls(ai, dt);
      this.updateGearAndRPM(ai, -1, dt);
      this.applyVisualDynamics(ai, accel, ai.steerAngle, false, dt);

      // Early completion if the car has separated cleanly from the barrier
      const hasClearedBarrier =
        Math.abs(ai.lateralDist || 0) < halfWidth * 0.7 && !ai.touchingBarrier;
      if (hasClearedBarrier || ai.unstickTimer <= 0) {
        ai.isUnsticking = false;
        ai.stuckTimer = 0;
        ai.gear = 1;
        ai.speed = Math.max(5.0, Math.abs(ai.speed) * 0.65);
        ai.touchingBarrier = false;
        ai.barrierContactSide = 0;
        ai.lateralVel = 0;
        ai.wallRecoveryPhase = 0;
        ai.wallManeuverElapsed = 0;
        ai.wallRecoveryCooldown = 1.5;
      }
      return;
    }

    // 0B. Virtual Barrier Radar: predictive (feed-forward) wall avoidance.
    // Instead of reacting only AFTER the car is already scraping the Armco, we
    // estimate the lateral stopping distance needed to kill the current
    // lateral velocity and raise a "danger" level before it is too late.
    const curSample = samples[ai.sampleIndex];

    // Real collision limit (must match `maxAllowedLateral` in
    // updateSplineProgressAndWalls) and the car body half-width.
    const wallLimit = this.trackData.barrierOffset
      ? this.trackData.barrierOffset - 1.1
      : halfWidth + 4.1;
    const carHalfW = ai.halfWidth || 1.02;

    const aiSin = Math.sin(ai.heading);
    const aiCos = Math.cos(ai.heading);
    const vWorldX = aiSin * ai.speed + aiCos * (ai.lateralVel || 0);
    const vWorldZ = aiCos * ai.speed - aiSin * (ai.lateralVel || 0);

    // Lateral velocity along the track normal (positive = drifting toward +R)
    const vLatTowardsRight =
      vWorldX * curSample.right.x + vWorldZ * curSample.right.z;

    // Free room between the car body and each barrier, along the track normal
    const roomPosR = wallLimit - carHalfW - (ai.lateralDist || 0);
    const roomNegR = (ai.lateralDist || 0) - carHalfW - -wallLimit;

    const bodyClearance = Math.max(
      0.45,
      Math.abs(
        Math.sin(
          ai.heading - Math.atan2(curSample.tangent.x, curSample.tangent.z),
        ),
      ) * (ai.halfLength || 2.3),
    );

    // Lateral deceleration the tires can produce when steering away from a wall
    const aLatMax = Math.max(6.0, (phys.gripLateral || 15.0) * 0.85);
    const wallSafety = 0.8 + bodyClearance * 0.6;

    // barrierDanger: 0 = safe, 1 = about to hit. barrierPushDir: -1 => push
    // toward -R, +1 => push toward +R.
    let barrierDanger = 0;
    let barrierPushDir = 0;
    if (vLatTowardsRight > 0.25 && roomPosR < 12.0) {
      const stopDist = (vLatTowardsRight * vLatTowardsRight) / (2 * aLatMax);
      const ratio = (stopDist + wallSafety) / Math.max(0.4, roomPosR);
      if (ratio > 0.55) {
        barrierDanger = THREE.MathUtils.clamp((ratio - 0.55) / 0.7, 0, 1);
        barrierPushDir = -1;
      }
    } else if (vLatTowardsRight < -0.25 && roomNegR < 12.0) {
      const stopDist = (vLatTowardsRight * vLatTowardsRight) / (2 * aLatMax);
      const ratio = (stopDist + wallSafety) / Math.max(0.4, roomNegR);
      if (ratio > 0.55) {
        barrierDanger = THREE.MathUtils.clamp((ratio - 0.55) / 0.7, 0, 1);
        barrierPushDir = 1;
      }
    }

    // Smoothly damped inward push (no per-frame decay hacks)
    const targetBarrierOffset =
      barrierDanger > 0 ? barrierPushDir * (1.5 + barrierDanger * 6.5) : 0;
    ai.barrierAvoidOffset = THREE.MathUtils.damp(
      ai.barrierAvoidOffset || 0,
      targetBarrierOffset,
      barrierDanger > 0 ? 16.0 : 5.0,
      dt,
    );
    if (Math.abs(ai.barrierAvoidOffset) < 0.05) ai.barrierAvoidOffset = 0;

    const emergencyWallBrake = barrierDanger > 0.8;

    // 1. Curvature-Adaptive Dynamic Lookahead
    // Shorter, speed-scaled lookahead (~30-75m) so Pure Pursuit tracks the
    // racing line tightly and rejoins it quickly instead of running wide.
    let maxUpcomingCurv = 0;
    for (let k = 1; k <= 14; k++) {
      const cVal = samples[(ai.sampleIndex + k) % N].curvature || 0;
      if (cVal > maxUpcomingCurv) maxUpcomingCurv = cVal;
    }

    const speedRatio = THREE.MathUtils.clamp(
      ai.speed / (phys.maxSpeed || 80),
      0,
      1,
    );
    const baseLookDist = THREE.MathUtils.lerp(10, 22, speedRatio);
    const curvFactor = THREE.MathUtils.clamp(maxUpcomingCurv / 0.24, 0, 1);
    const lookDistSamples = Math.round(
      THREE.MathUtils.lerp(baseLookDist, 9, curvFactor * 0.6),
    );
    const lookAheadIdx = (ai.sampleIndex + lookDistSamples) % N;
    const lookSample = samples[lookAheadIdx];

    // 2. Desired trajectory offset with Apex Damping (Anti-Trenino on straights, Precision on Apex)
    const apexTightness = THREE.MathUtils.clamp(maxUpcomingCurv / 0.16, 0, 1);
    const wave =
      Math.sin(
        ai.sampleIndex * (persona.lineWaveFreq || 0.1) +
          (persona.lineWaveSeed || 0),
      ) * 0.35;
    // Smorzamento (morbido) dell'offset personale all'apice: evita uscite larghe
    // senza però eliminare la personalità di guida dell'avversario.
    const personalOffset =
      ((persona.preferredOffsetBias || 0) + wave) * (1.0 - apexTightness * 0.5);
    ai.personalLineOffset = THREE.MathUtils.lerp(
      ai.personalLineOffset || 0,
      personalOffset,
      dt * 1.8,
    );

    let desiredOffset =
      (lookSample.racingOffset || 0) +
      ai.personalLineOffset +
      (ai.overtakeBias || 0);

    // After a wall recovery, rebuild speed and heading before allowing the
    // aggressive racing line to move the car back toward the edge.
    if (ai.wallRecoveryCooldown > 0) {
      const recoveryBlend = THREE.MathUtils.clamp(
        ai.wallRecoveryCooldown / 2.5,
        0,
        1,
      );
      desiredOffset = THREE.MathUtils.lerp(desiredOffset, 0, recoveryBlend);
      ai.overtakeBias = THREE.MathUtils.lerp(ai.overtakeBias || 0, 0, dt * 6.0);
    }

    // Apply the predictive barrier repulsion (already smoothly damped above)
    if (ai.barrierAvoidOffset) {
      desiredOffset += ai.barrierAvoidOffset;
    }

    // Side-by-side wheel-to-wheel evasive offset (leaves space for alongside rivals)
    if (ai.wheelToWheelSideOffset) {
      desiredOffset += ai.wheelToWheelSideOffset;
    }

    // Staggered grid start lane blend: smoother transition over 4.5 seconds
    if (this.raceElapsedSeconds < 4.5) {
      const blend = THREE.MathUtils.clamp(this.raceElapsedSeconds / 4.5, 0, 1);
      const easeBlend = blend * blend * (3 - 2 * blend);
      desiredOffset = THREE.MathUtils.lerp(
        ai.startLaneOffset,
        desiredOffset,
        easeBlend,
      );
    }

    // Human error wide line
    if (ai.errorWideTimer > 0) {
      ai.errorWideTimer -= dt;
      // L'esterno della curva ha lo STESSO segno della curvatura (l'interno è
      // opposto), quindi l'errore "lungo" spinge dal lato corretto.
      const outsideDir = Math.sign(lookSample.signedCurvature || 1);
      desiredOffset = THREE.MathUtils.lerp(
        desiredOffset,
        outsideDir * (halfWidth * 0.72),
        0.75,
      );
      ai.aiStatusTag = "LUNGO!";
    }

    // Dynamic track safety envelope:
    // Centrifugal inertia pushes car outwards; keep enough outside buffer for
    // the corner but allow the AI to actually use the full track width.
    const turnSign = Math.sign(lookSample.signedCurvature || 0);
    const absCurv = Math.abs(lookSample.curvature || 0);
    const outsideBuffer = absCurv > 0.04 ? 1.6 : 1.2;
    const insideBuffer = 1.1;

    const maxRightOffset =
      halfWidth - (turnSign < 0 ? outsideBuffer : insideBuffer);
    const maxLeftOffset = -(
      halfWidth - (turnSign > 0 ? outsideBuffer : insideBuffer)
    );

    desiredOffset = THREE.MathUtils.clamp(
      desiredOffset,
      maxLeftOffset,
      maxRightOffset,
    );
    ai.currentAimOffset = THREE.MathUtils.lerp(
      ai.currentAimOffset,
      desiredOffset,
      dt * (Math.abs(ai.steerAngle) > 0.22 ? 6.5 : 5.0),
    );

    // 3. Target Position & Robust Pure Pursuit Steering Controller
    const targetPos = lookSample.point
      .clone()
      .addScaledVector(lookSample.right, ai.currentAimOffset);
    const toTargetX = targetPos.x - ai.position.x;
    const toTargetZ = targetPos.z - ai.position.z;
    const desiredHeading = Math.atan2(toTargetX, toTargetZ);

    let diff = desiredHeading - ai.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Raw pure-pursuit error, used later for spin/slide detection
    const pursuitDiff = diff;

    // Cross-track error correction: the aim point is far ahead, so a pure
    // look-ahead controller rejoins the line very slowly at speed (wide exits).
    // Steer additionally toward where the line actually is AT the car's own
    // position (includes the barrier push, so it never fights wall avoidance).
    const lineOffsetNow =
      (curSample.racingOffset || 0) +
      ai.personalLineOffset +
      (ai.overtakeBias || 0) +
      (ai.barrierAvoidOffset || 0);
    const laneError = lineOffsetNow - (ai.lateralDist || 0);
    diff -= THREE.MathUtils.clamp(laneError * 0.02, -0.25, 0.25);

    // Direct wall-avoid steering bias: rotate toward the open track before contact
    if (barrierDanger > 0) {
      diff += -barrierPushDir * barrierDanger * 0.18;
    }

    // Direct, stable Pure Pursuit steering: responsive without overshooting or fishtailing
    const targetSteerAngle = THREE.MathUtils.clamp(
      diff * 1.15,
      -phys.steerRate,
      phys.steerRate,
    );
    ai.steerAngle = THREE.MathUtils.damp(
      ai.steerAngle,
      targetSteerAngle,
      12.0,
      dt,
    );

    // Speed-sensitive yaw turning authority: turn authority scales smoothly with speed
    const minAuthority = ai.touchingBarrier ? 0.75 : 0.25;
    const turnAuthority = THREE.MathUtils.clamp(
      Math.abs(ai.speed) / 4.2,
      minAuthority,
      1.0,
    );
    const steeringAngularVel = ai.steerAngle * turnAuthority * 1.15;
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

    // 4. DRS System + Turbo pads (the AI uses both, exactly like the player)
    ai.drsActive = Boolean(
      curSample && curSample.isDRS && Math.abs(ai.steerAngle) < 0.22,
    );
    ai.turboActive = Boolean(curSample && curSample.isTurbo);

    // 5. Predictive Braking Horizon Scanning (Precision Step=1 for the first 10 samples)
    const effectiveSkill =
      (prof.skill || 1.0) *
      (diffConfig.skillMult || 1.0) *
      (persona.skillMult || 1.0);
    const speedBoostMult = diffConfig.topSpeedMult || 1.0;
    const accelBoostMult = diffConfig.accelMult || 1.0;
    const cornerGripBoost =
      (diffConfig.cornerGripMult || 1.0) *
      THREE.MathUtils.clamp(effectiveSkill, 0.92, 1.4);
    // Top speed must come from THIS car's physics, not from the track profile
    // (generated from the player's car). Before, every AI was capped on the
    // straights by the player's top speed -> never competitive in a fast car.
    const ownTopSpeed = (phys.maxSpeed || 80) * speedBoostMult;

    const brakeSeverityCap = 0.94;
    // Decelerazione che l'auto riesce REALMENTE a produrre: il codice di frenata
    // più sotto satura brakeSeverity a 0.94 e non usa affatto il margine di
    // difficoltà. Pianificare l'orizzonte con un valore più alto e ottimistico
    // faceva arrivare OGNI IA troppo veloce in curva, larga nel gravel/muro.
    const appliedBrakeDecel =
      (phys.brakeForce / phys.mass) *
      brakeSeverityCap *
      (persona.brakeMarginMult || 1.0);
    const maxDecel = appliedBrakeDecel * 0.92;
    const segLength =
      this.trackData.totalLength && N ? this.trackData.totalLength / N : 3.8;

    // The braking horizon MUST be computed in METERS: sample spacing varies a
    // lot between circuits (roughly 1.7m..3.7m), so a fixed number of samples
    // gave a far too short horizon on tightly-sampled tracks and the AI could
    // not brake for fast corners, running wide into the gravel/barriers.
    const brakeHorizonMeters = THREE.MathUtils.clamp(
      (ai.speed * ai.speed) / (2 * maxDecel) + 25,
      40,
      segLength * 260,
    );
    const brakeHorizonSamples = Math.round(
      THREE.MathUtils.clamp(brakeHorizonMeters / segLength, 16, 260),
    );

    const latGripBase = (phys.gripLateral || 15.0) * 1.35 * cornerGripBoost;

    let horizonTargetSpeed = Infinity;
    // Step 1: scan next 10 samples individually for millimeter-accurate braking point
    const fineSteps = Math.min(10, brakeHorizonSamples);
    for (let step = 1; step <= fineSteps; step++) {
      const scanIdx = (ai.sampleIndex + step) % N;
      const scanSample = samples[scanIdx];
      const distToScan = step * segLength;
      const scanCurv = scanSample.curvature || 0;
      let scanMaxCornerSpeed = Infinity;
      if (scanCurv > 0.004) {
        const kappa =
          scanSample.kappaPerMeter != null
            ? scanSample.kappaPerMeter
            : scanCurv / (18 * segLength);
        if (kappa > 0.001) {
          scanMaxCornerSpeed = Math.sqrt(latGripBase / kappa);
        }
      }
      const rawTargetSpeed = Math.min(ownTopSpeed, scanMaxCornerSpeed);
      const allowedSpeed = Math.sqrt(
        rawTargetSpeed * rawTargetSpeed + 2 * maxDecel * distToScan,
      );
      if (allowedSpeed < horizonTargetSpeed) {
        horizonTargetSpeed = allowedSpeed;
      }
    }
    // Step 2: scan remaining horizon in strides of 3
    for (let step = 12; step <= brakeHorizonSamples; step += 3) {
      const scanIdx = (ai.sampleIndex + step) % N;
      const scanSample = samples[scanIdx];
      const distToScan = step * segLength;
      const scanCurv = scanSample.curvature || 0;
      let scanMaxCornerSpeed = Infinity;
      if (scanCurv > 0.004) {
        const kappa =
          scanSample.kappaPerMeter != null
            ? scanSample.kappaPerMeter
            : scanCurv / (18 * segLength);
        if (kappa > 0.001) {
          scanMaxCornerSpeed = Math.sqrt(latGripBase / kappa);
        }
      }
      const rawTargetSpeed = Math.min(ownTopSpeed, scanMaxCornerSpeed);
      const allowedSpeed = Math.sqrt(
        rawTargetSpeed * rawTargetSpeed + 2 * maxDecel * distToScan,
      );
      if (allowedSpeed < horizonTargetSpeed) {
        horizonTargetSpeed = allowedSpeed;
      }
    }

    // Physics Lateral Grip Limit in current turn with difficulty boost
    const curCurv = curSample.curvature || 0;
    let gripSpeedLimit = Infinity;
    if (curCurv > 0.005) {
      const latGrip = (phys.gripLateral || 15.0) * 1.35 * cornerGripBoost;
      const kappaPerMeter =
        curSample.kappaPerMeter != null
          ? curSample.kappaPerMeter
          : curCurv / (18 * segLength);
      if (kappaPerMeter > 0.001) {
        gripSpeedLimit = Math.sqrt(latGrip / kappaPerMeter);
      }
    }

    let targetSpeed = Math.min(ownTopSpeed, horizonTargetSpeed, gripSpeedLimit);

    // Debug hook (used by ai-benchmark.js tracing)
    ai._dbg = {
      tv: targetSpeed,
      hz: horizonTargetSpeed === Infinity ? -1 : horizonTargetSpeed,
      gl: gripSpeedLimit === Infinity ? -1 : gripSpeedLimit,
      md: maxDecel,
      bh: brakeHorizonSamples,
      seg: segLength,
      lg: latGripBase,
    };

    // DRS, Turbo pads and Slipstream speed boosts
    if (ai.drsActive) targetSpeed += 4.5 * speedBoostMult;
    if (ai.inDraft) targetSpeed += 3.6 * accelBoostMult;
    if (ai.turboActive) targetSpeed += 8.0 * accelBoostMult;

    // Cooldown autopilot at race end
    if (isCooldownAutopilot) targetSpeed *= 0.65;

    // 6. Collision Avoidance Speed Modulation (Anti-Accordion)
    if (ai.sensorBlockedFront && ai.sensorFrontDist < 26) {
      const frontSpeed = ai.sensorFrontSpeed || ai.speed;
      const desiredFollowGap = Math.max(4.0, ai.speed * 0.16);
      const gapError = ai.sensorFrontDist - desiredFollowGap;

      if (gapError < 0) {
        // Too close! Smoothly drop speed proportional to deficit
        const deficitRatio = THREE.MathUtils.clamp(
          -gapError / desiredFollowGap,
          0,
          1,
        );
        const safeFollowSpeed = frontSpeed * (1.0 - deficitRatio * 0.06);
        targetSpeed = Math.min(targetSpeed, safeFollowSpeed);
      } else {
        // Approaching from behind: smoothly blend target speed towards frontSpeed
        const blend = THREE.MathUtils.clamp(gapError / 16.0, 0, 1);
        const safeApproachSpeed = THREE.MathUtils.lerp(
          frontSpeed * 1.04,
          targetSpeed,
          blend,
        );
        targetSpeed = Math.min(targetSpeed, safeApproachSpeed);
      }
    }

    // 7. Spin / Slide / Off-Track Recovery
    const isSpunOrSliding =
      Math.abs(pursuitDiff) > 0.62 ||
      Math.abs(ai.angularVelocity || 0) > 0.52 ||
      Math.abs(ai.lateralVel || 0) > 2.8;

    const isOffTrack = Math.abs(ai.lateralDist || 0) > halfWidth * 0.95;

    if (isSpunOrSliding || isOffTrack) {
      targetSpeed = Math.min(targetSpeed, Math.max(14, ai.speed * 0.7));
      ai.aiStatusTag = isOffTrack ? "RIENTRO!" : "RECUPERO!";
      if (Math.abs(ai.speed) > 12) {
        this.spawnTireSmoke(ai);
      }
    }

    // 8. Acceleration / Braking Forces with Real Exit Traction Control & Proportional Braking
    let accel = 0;
    const speedDelta = targetSpeed - ai.speed;
    const effectiveEngineForce = phys.engineForce * accelBoostMult;

    // Instant Throttle Cut & Active Braking:
    // If in direct crash, brake to absorb impact. If in a glancing rub, keep forward
    // propulsion active so the car glances and separates from the barrier!
    if (ai.touchingBarrier) {
      const trackHeading = Math.atan2(curSample.tangent.x, curSample.tangent.z);
      let headingAngleDiff = Math.abs(ai.heading - trackHeading);
      while (headingAngleDiff > Math.PI)
        headingAngleDiff = Math.abs(headingAngleDiff - Math.PI * 2);

      if (headingAngleDiff < 0.52) {
        // Glancing rub: keep engine drive active to slide smoothly off the Armco
        accel = (effectiveEngineForce / phys.mass) * 0.42;
        ai.aiStatusTag = "SPONDA!";
      } else {
        // Direct head-on impact: brake to regain control
        accel = -(phys.brakeForce / phys.mass) * 0.45;
        ai.aiStatusTag = "MURO!";
      }
    } else if (emergencyWallBrake) {
      // Soft lift-off to enable sharp steering away from barrier
      accel = -(phys.brakeForce / phys.mass) * 0.15;
      ai.aiStatusTag = "ATTENZIONE!";
    } else if ((ai.collisionCooldownTimer || 0) > 0) {
      accel = -(phys.brakeForce / phys.mass) * 0.18;
      ai.aiStatusTag = "ATTENZIONE!";
    } else if (speedDelta > 0.3) {
      // Exit Traction Control: limit drive force when steering angle is large to prevent understeer push
      const steerRatio = THREE.MathUtils.clamp(
        Math.abs(ai.steerAngle) / (phys.steerRate || 0.75),
        0,
        1,
      );
      const minTraction = THREE.MathUtils.lerp(
        0.4,
        0.75,
        THREE.MathUtils.clamp((effectiveSkill - 0.9) / 0.4, 0, 1),
      );
      const tractionFactor = THREE.MathUtils.lerp(
        1.0,
        minTraction,
        steerRatio * steerRatio,
      );

      const launchGrip =
        this.raceElapsedSeconds < 2.5
          ? 0.86 + 0.14 * THREE.MathUtils.clamp(effectiveSkill, 0.9, 1.35)
          : 0.98;
      accel = (effectiveEngineForce / phys.mass) * launchGrip * tractionFactor;
      if (ai.inDraft) accel *= 1.15;
      if (ai.turboActive) accel *= 1.6;
    } else if (speedDelta >= -1.6) {
      // Lift & Coast / Gentle Engine Braking
      accel = -(phys.brakeForce / phys.mass) * 0.08 - ai.speed * 0.1;
    } else {
      // Progressive Braking proportional to urgency (reaches full braking
      // much sooner, so the car can actually follow its braking plan)
      const brakeSeverity = THREE.MathUtils.clamp(
        (-speedDelta - 1.0) / 5.0,
        0.25,
        brakeSeverityCap,
      );
      accel =
        -(phys.brakeForce / phys.mass) *
        brakeSeverity *
        (persona.brakeMarginMult || 1.0);
    }

    if (ai.collisionCooldownTimer > 0) {
      ai.collisionCooldownTimer = Math.max(0, ai.collisionCooldownTimer - dt);
    }

    const effectiveMaxSpeed = phys.maxSpeed * speedBoostMult;
    const speedCapMult = ai.turboActive ? 1.2 : ai.drsActive ? 1.07 : 1.03;
    ai.speed = THREE.MathUtils.clamp(
      ai.speed + accel * dt,
      0,
      effectiveMaxSpeed * speedCapMult,
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

  evaluateAISensorsAndOvertaking(ai, prof, persona, halfWidth) {
    // IMPORTANTE: tutta la logica di sorpasso/evitamento deve lavorare nello
    // STESSO frame laterale usato da `ai.lateralDist` e dagli offset applicati
    // al punto di mira, ovvero la normale laterale del campione di pista
    // (`sample.right`). In precedenza qui si usava il "right" locale della
    // vettura (opposto a quello della pista), invertendo ogni decisione:
    // l'IA sterzava verso l'avversario e verso il muro invece che via.
    const samples = this.trackData.samples;
    const refSample = samples[ai.sampleIndex] || samples[0];
    const forwardX = refSample.tangent.x;
    const forwardZ = refSample.tangent.z;
    const rightX = refSample.right.x;
    const rightZ = refSample.right.z;

    let minCenterDist = 99;
    let frontCarSpeed = ai.speed;
    let frontCarLat = 0;
    let leftBlocked = false;
    let rightBlocked = false;
    let sideAvoidOffset = 0;
    let pressuredFromBehind = false;
    let inDraft = false;
    let wheelToWheelActive = false;

    const lateralSafety = (persona && persona.lateralSafetyMargin) || 3.1;
    const minPassingGap = (persona && persona.minPassingGap) || 3.0;
    const slingshotDist = (persona && persona.slingshotDist) || 21.0;

    for (let other of this.allRacers) {
      if (other === ai) continue;
      if (Math.abs(other.position.y - ai.position.y) > 3.2) continue;

      const dx = other.position.x - ai.position.x;
      const dz = other.position.z - ai.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 1024) continue; // ~32m radius

      const fwdProj = dx * forwardX + dz * forwardZ;
      const latProj = dx * rightX + dz * rightZ;

      // Front quadrant (ahead)
      if (fwdProj > 0 && fwdProj < 34) {
        if (Math.abs(latProj) < 2.3 && fwdProj < minCenterDist) {
          minCenterDist = fwdProj;
          frontCarSpeed = other.speed;
          frontCarLat = latProj;
        }

        // Slipstream drafting detection between 7m and 30m
        if (
          fwdProj > 7 &&
          fwdProj < 30 &&
          Math.abs(latProj) < 2.5 &&
          ai.speed > 24
        ) {
          inDraft = true;
        }

        if (latProj < -1.1 && latProj > -5.2 && fwdProj < 24) {
          leftBlocked = true;
        }
        if (latProj > 1.1 && latProj < 5.2 && fwdProj < 24) {
          rightBlocked = true;
        }
      }
      // Side quadrant (wheel-to-wheel alongside - leave space)
      else if (
        Math.abs(fwdProj) <= 6.2 &&
        Math.abs(latProj) < lateralSafety + 0.8
      ) {
        wheelToWheelActive = true;
        const pushMag = Math.max(
          1.8,
          THREE.MathUtils.lerp(
            3.2,
            1.8,
            Math.abs(latProj) / (lateralSafety + 0.8),
          ),
        );
        const trackMargin = halfWidth - 1.8;
        if (latProj > 0) {
          // Rival on the +R side: shift toward -R to leave space, but never so
          // far that we get pushed into the -R barrier.
          const pushRoomNegR = Math.max(0, (ai.lateralDist || 0) + trackMargin);
          sideAvoidOffset -= Math.min(pushMag, pushRoomNegR);
        } else {
          // Rival on the -R side: shift toward +R to leave space.
          const pushRoomPosR = Math.max(0, trackMargin - (ai.lateralDist || 0));
          sideAvoidOffset += Math.min(pushMag, pushRoomPosR);
        }
      }
      // Rear quadrant (pressure from behind)
      else if (fwdProj < 0 && fwdProj > -12.0 && Math.abs(latProj) < 2.8) {
        pressuredFromBehind = true;
      }
    }

    ai.sensorFrontDist = minCenterDist;
    ai.sensorBlockedFront = minCenterDist < 24;
    ai.sensorFrontSpeed = frontCarSpeed;
    ai.inDraft = inDraft;
    ai.wheelToWheelOverlap = wheelToWheelActive;
    ai.wheelToWheelSideOffset = THREE.MathUtils.lerp(
      ai.wheelToWheelSideOffset || 0,
      sideAvoidOffset,
      0.35,
    );

    const diff = this.getDifficultyConfig();
    const effectiveAggression =
      prof.aggression *
      diff.aggressionMult *
      ((persona && persona.aggressionMult) || 1.0);
    const trackMargin = halfWidth - 1.8;

    // NOTA frame: +R = direzione del vettore `sample.right` di pista, cioè lo
    // stesso segno di `ai.lateralDist`. Con latProj espresso in questo frame,
    // `leftBlocked`/`rightBlocked` e `canGoLeft`/`canGoRight` sono coerenti tra
    // loro (i nomi "left"/"right" sono invertiti rispetto a +R/-R ma la logica
    // è consistente: canGoLeft = spazio verso -R, canGoRight = spazio verso +R).
    const canGoLeft =
      !leftBlocked && ai.lateralDist - minPassingGap > -trackMargin;
    const canGoRight =
      !rightBlocked && ai.lateralDist + minPassingGap < trackMargin;

    // Overtaking & Slingshot logic
    const isClosingFast = inDraft && ai.speed > frontCarSpeed + 0.8;
    const shouldSlingshot =
      isClosingFast &&
      minCenterDist < slingshotDist &&
      (canGoLeft || canGoRight);

    if (
      shouldSlingshot ||
      (ai.sensorBlockedFront && minCenterDist < 16 && (canGoLeft || canGoRight))
    ) {
      let passRight = canGoRight;
      if (frontCarLat < -0.3 && canGoRight) {
        passRight = true;
      } else if (frontCarLat > 0.3 && canGoLeft) {
        passRight = false;
      } else if (canGoLeft && canGoRight) {
        passRight = ai.lateralDist < 0;
      }

      const passOffset =
        (passRight ? 4.2 : -4.2) * Math.min(1.25, effectiveAggression);
      ai.overtakeBias = THREE.MathUtils.lerp(ai.overtakeBias, passOffset, 0.28);
      ai.aiStatusTag = shouldSlingshot ? "SLINGSHOT" : "SORPASSO";
    } else if (inDraft && !ai.sensorBlockedFront) {
      ai.overtakeBias = THREE.MathUtils.lerp(
        ai.overtakeBias,
        frontCarLat * 0.5,
        0.15,
      );
      ai.aiStatusTag = "SCIA";
    } else if (ai.sensorBlockedFront) {
      ai.overtakeBias = THREE.MathUtils.lerp(
        ai.overtakeBias,
        sideAvoidOffset,
        0.22,
      );
      ai.aiStatusTag = "SEGUI";
    } else {
      // Natural return to personal line
      ai.overtakeBias *= 0.86;
      if (Math.abs(ai.overtakeBias) < 0.15) {
        ai.overtakeBias = 0;
        ai.aiStatusTag = ai.drsActive
          ? "DRS"
          : (persona && persona.badgeTag) || "";
      }
    }

    // Defend inside apex when pressured from behind (Tattico/Attaccante)
    if (
      pressuredFromBehind &&
      diff.aggressionMult >= 0.95 &&
      ai.errorWideTimer <= 0
    ) {
      const defBias = (persona && persona.defensiveBias) || 1.0;
      const upcomingIdx = (ai.sampleIndex + 20) % this.trackData.samples.length;
      const curv = this.trackData.samples[upcomingIdx].curvature;
      if (curv > 0.1) {
        // Difesa all'apice: l'interno ha segno opposto alla curvatura.
        const insideDir = -Math.sign(
          this.trackData.samples[upcomingIdx].signedCurvature || 1,
        );
        ai.overtakeBias = THREE.MathUtils.lerp(
          ai.overtakeBias,
          insideDir * 2.3 * defBias,
          0.2,
        );
        ai.aiStatusTag = "DIFESA";
      }
    }

    // Pressure mistake chance (scaled by difficulty errorMult and driver errorRate)
    const upcomingCurv =
      this.trackData.samples[
        (ai.sampleIndex + 22) % this.trackData.samples.length
      ].curvature;
    if (pressuredFromBehind && upcomingCurv > 0.14 && ai.errorWideTimer <= 0) {
      const mistakeChance = prof.errorRate * diff.errorMult * 0.05;
      if (Math.random() < mistakeChance) {
        ai.errorWideTimer = 1.35;
        this.spawnTireSmoke(ai);
      }
    }
  },

  // Calcolo condiviso della superficie pista. Se `normalOut` (THREE.Vector3) è
  // fornito vi scrive la normale riutilizzandolo; ritorna la quota Y e salva
  // l'indice del campione in `this._lastSurfaceBestIdx` (nessuna allocazione).
  _computeTrackSurface(x, z, refIdx = 0, normalOut = null) {
    if (
      !this.trackData ||
      !this.trackData.samples ||
      !this.trackData.samples.length
    ) {
      if (normalOut) normalOut.set(0, 1, 0);
      this._lastSurfaceBestIdx = 0;
      return 0;
    }
    const samples = this.trackData.samples;
    const N = samples.length;
    const start = refIdx !== undefined && refIdx >= 0 ? refIdx % N : 0;

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

    let sA = s0,
      sB = sNext,
      t = 0;
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
        const dotPrev =
          (x - sPrev.point.x) * vPrevX + (z - sPrev.point.z) * vPrevZ;
        t = Math.max(0, Math.min(1, dotPrev / lenPrevSq));
        sA = sPrev;
        sB = s0;
      }
    }

    const pX = THREE.MathUtils.lerp(sA.point.x, sB.point.x, t);
    const pY = THREE.MathUtils.lerp(sA.point.y, sB.point.y, t);
    const pZ = THREE.MathUtils.lerp(sA.point.z, sB.point.z, t);

    const nA = sA.normal || { x: 0, y: 1, z: 0 };
    const nB = sB.normal || { x: 0, y: 1, z: 0 };
    const normX = THREE.MathUtils.lerp(nA.x, nB.x, t);
    const normY = THREE.MathUtils.lerp(nA.y, nB.y, t);
    const normZ = THREE.MathUtils.lerp(nA.z, nB.z, t);
    const nLen = Math.hypot(normX, normY, normZ) || 1;
    const nx = normX / nLen;
    const ny = Math.max(0.05, normY / nLen);
    const nz = normZ / nLen;

    if (normalOut) normalOut.set(nx, ny, nz);

    // Track road mesh surface sits at center line + 0.03
    const baseY = pY + 0.03;
    const surfaceY = baseY - ((x - pX) * nx + (z - pZ) * nz) / ny;

    this._lastSurfaceBestIdx = bestIdx;
    return surfaceY;
  },

  // Variante "leggera": ritorna solo la quota Y della superficie pista, senza
  // allocare vettori. Usata dalle interpolazioni per-frame di auto remote e IA.
  getTrackSurfaceY(x, z, refIdx = 0) {
    return this._computeTrackSurface(x, z, refIdx, null);
  },

  // Ritorna un oggetto { y, normal, bestIdx }. Se `normalOut` è fornito la
  // normale viene scritta lì (e l'oggetto risultato è un buffer riutilizzato),
  // evitando allocazioni per-frame nel ciclo di aggiornamento delle auto.
  getTrackElevationAndNormal(x, z, refIdx = 0, normalOut = null) {
    if (normalOut) {
      const out =
        this._surfaceScratch ||
        (this._surfaceScratch = {
          y: 0,
          normal: new THREE.Vector3(0, 1, 0),
          bestIdx: 0,
        });
      out.normal = normalOut;
      out.y = this._computeTrackSurface(x, z, refIdx, normalOut);
      out.bestIdx = this._lastSurfaceBestIdx;
      return out;
    }
    const normal = new THREE.Vector3(0, 1, 0);
    const y = this._computeTrackSurface(x, z, refIdx, normal);
    return { y, normal, bestIdx: this._lastSurfaceBestIdx };
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

    // Normale e quota pista scritti in buffer riutilizzati (nessuna allocazione per-frame)
    if (!car.trackNormal) car.trackNormal = new THREE.Vector3(0, 1, 0);
    const surfaceY = this.getTrackElevationAndNormal(
      car.position.x,
      car.position.z,
      bestIdx,
      car.trackNormal,
    ).y;
    car.trackSurfaceY = surfaceY;

    car.position.y = THREE.MathUtils.lerp(
      car.position.y,
      surfaceY,
      Math.min(1, dt * 25),
    );

    // Lap Crossing Detection: il margine scala col numero di campioni del tracciato
    const wrapMargin = Math.max(40, Math.round(N * 0.08));
    if (
      !car.hasStartedFirstLap &&
      bestIdx < wrapMargin &&
      prevIdx > N - wrapMargin
    ) {
      car.hasStartedFirstLap = true;
      car.lapStartTime = performance.now();
    } else if (
      car.hasStartedFirstLap &&
      bestIdx < wrapMargin &&
      prevIdx > N - wrapMargin
    ) {
      const now = performance.now();
      const lapTimeMs = now - car.lapStartTime;
      car.lapStartTime = now;

      if (lapTimeMs > 4000 && !car.finished) {
        if (!car.bestLapTime || lapTimeMs < car.bestLapTime) {
          car.bestLapTime = lapTimeMs;
        }

        if (car.isPlayer) {
          if (!GameApp.profile.records[this.trackConfig.id]) {
            GameApp.profile.records[this.trackConfig.id] = {
              bestLap: null,
              bestPos: null,
              trophies: 0,
            };
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
      if (
        car.isPlayer &&
        typeof NetworkEngine !== "undefined" &&
        NetworkEngine.isConnected
      ) {
        NetworkEngine.sendCheckpointPass(
          car.lap,
          car.sampleIndex,
          car.totalProgress,
        );
      }

      if (
        (this.mode === "race" ||
          this.mode === "lan_race" ||
          this.mode === "championship" ||
          this.mode === "lan_championship" ||
          this.isLanChampionship) &&
        car.lap > this.totalLaps &&
        !car.finished
      ) {
        this.recordCarFinish(car);
      }
    }

    if (car.hasStartedFirstLap && !car.finished) {
      car.currentLapTime = performance.now() - car.lapStartTime;
    }

    const normU = bestIdx / N;
    car.totalProgress = (car.hasStartedFirstLap ? car.lap - 1 : -1) + normU;

    // Distanza laterale dal centro pista (prodotto scalare senza allocare vettori)
    const lateralDist =
      (car.position.x - closestSample.point.x) * closestSample.right.x +
      (car.position.z - closestSample.point.z) * closestSample.right.z;
    car.lateralDist = lateralDist;
    const maxAllowedLateral = this.trackData.barrierOffset
      ? this.trackData.barrierOffset - 1.1
      : this.trackData.halfWidth + 4.1;

    // Progressive gravel trap / grass slowdown outside track asphalt
    const offTrackDist =
      Math.abs(lateralDist) - (this.trackData.halfWidth + 0.25);
    if (offTrackDist > 0 && this.trackConfig.id !== "monaco") {
      const gravelDrag = THREE.MathUtils.clamp(
        0.42 + offTrackDist * 0.16,
        0.42,
        0.72,
      );
      car.speed *= 1 - gravelDrag * dt;
      car.tireDirtyTimer = Math.min(1.0, (car.tireDirtyTimer || 0) + dt * 1.5);
    }

    // 4-Corner Oriented Bounding Box vs Track Barriers
    const hFwd = car.halfLength || 2.3;
    const hSide = car.halfWidth || 1.02;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    const fwdX = sinH,
      fwdZ = cosH;
    const rightX = cosH,
      rightZ = -sinH;

    // World-space coordinates of the 4 vehicle corners (buffer riutilizzato)
    const corners =
      this._cornerScratch ||
      (this._cornerScratch = [
        { x: 0, z: 0, isFront: true, isRight: true },
        { x: 0, z: 0, isFront: true, isRight: false },
        { x: 0, z: 0, isFront: false, isRight: true },
        { x: 0, z: 0, isFront: false, isRight: false },
      ]);
    corners[0].x = car.position.x + fwdX * hFwd + rightX * hSide;
    corners[0].z = car.position.z + fwdZ * hFwd + rightZ * hSide;
    corners[1].x = car.position.x + fwdX * hFwd - rightX * hSide;
    corners[1].z = car.position.z + fwdZ * hFwd - rightZ * hSide;
    corners[2].x = car.position.x - fwdX * hFwd + rightX * hSide;
    corners[2].z = car.position.z - fwdZ * hFwd + rightZ * hSide;
    corners[3].x = car.position.x - fwdX * hFwd - rightX * hSide;
    corners[3].z = car.position.z - fwdZ * hFwd - rightZ * hSide;

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
      car.touchingBarrier = true;
      const side = hitRight ? 1 : -1;
      car.barrierContactSide = side;
      const penetration = hitRight
        ? maxRightLat - maxAllowedLateral
        : -maxAllowedLateral - minLeftLat;
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
      const I = car.inertia || m * 2.2;
      const crossN = rz * nWallX - rx * nWallZ;
      const kn = 1 / m + (crossN * crossN) / I;

      if (vn > 0.05 && kn > 0.0001) {
        // Impact restitution (realistic armco / tecpro barrier damping)
        const eWall = 0.22;
        const Jn = ((1 + eWall) * vn) / kn;

        // Tangential friction impulse (barrier scrape resistance)
        const crossT = rz * tWallX - rx * tWallZ;
        const kt = 1 / m + (crossT * crossT) / I;
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
          const crumpleLoss = THREE.MathUtils.clamp(
            impactKmh / 260,
            0.06,
            0.32,
          );
          car.speed *= 1.0 - crumpleLoss;
          car.tireDirtyTimer = Math.min(
            1.2,
            (car.tireDirtyTimer || 0) + impactKmh / 90,
          );
        }

        // Project velocity change back to car local frame
        car.speed += dVx * fwdX + dVz * fwdZ;
        car.lateralVel = (car.lateralVel || 0) + (dVx * rightX + dVz * rightZ);
        car.angularVelocity = omega + dOmega;

        // Give CPU cars a controlled inward velocity after contact. Without
        // this small separation impulse, a shallow scrape can keep the car
        // parallel to the barrier for several frames.
        if (!car.isPlayer && !car.isRemotePlayer) {
          const inwardKick = Math.min(4.8, 1.6 + impactKmh * 0.08);
          car.lateralVel -= side * inwardKick;
          car.angularVelocity *= 0.55;
        }

        // Visual suspension impact jolt
        car.impactRoll = THREE.MathUtils.clamp(
          (car.impactRoll || 0) + -side * 0.14,
          -0.22,
          0.22,
        );
        car.impactPitch = THREE.MathUtils.clamp(
          (car.impactPitch || 0) + (contactCorner.isFront ? -0.14 : 0.09),
          -0.18,
          0.18,
        );

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
        if (
          typeof GraphicsEngine !== "undefined" &&
          GraphicsEngine.spawnCollisionSparks
        ) {
          const sparkY = closestSample.point.y + 0.38;
          GraphicsEngine.spawnCollisionSparks(
            { x: contactCorner.x, y: sparkY, z: contactCorner.z },
            { x: nWallX, z: nWallZ },
            impactKmh > 35 ? 12 : 7,
            Math.min(1.6, impactKmh / 30),
          );
        }
      }

      // Positional separation (prevent clipping outside wall) with push buffer
      const pushDist = penetration + 0.12;
      car.position.x += nWallX * pushDist;
      car.position.z += nWallZ * pushDist;
      car.lateralDist -= side * pushDist;

      // Barrier alignment torque: deflects car back towards track rather than sticking nose-in or scraping parallel
      const trackYaw = Math.atan2(
        closestSample.tangent.x,
        closestSample.tangent.z,
      );
      const inwardDeflect = car.isPlayer ? -side * 0.1 : -side * 0.28;
      let angleErr = trackYaw + inwardDeflect - car.heading;
      while (angleErr > Math.PI) angleErr -= Math.PI * 2;
      while (angleErr < -Math.PI) angleErr += Math.PI * 2;
      const alignRate =
        Math.abs(car.speed) > 7.0 ? (car.isPlayer ? 4.5 : 9.5) : 12.0;
      car.heading += angleErr * dt * alignRate;

      // High-speed grinding / scraping along the barrier (penalizes wall riding)
      if (Math.abs(car.speed) > 7.0) {
        const scrapeFriction = car.isPlayer ? 0.52 : 0.14;
        car.speed *= 1 - scrapeFriction * dt;

        if (car.isPlayer) {
          const now = performance.now();
          if (now - (car.lastScrapeTime || 0) > 80) {
            car.lastScrapeTime = now;
            AudioEngine.playScrapeSound(
              Math.min(1.0, Math.abs(car.speed) / 50),
            );
          }
          if (
            typeof GraphicsEngine !== "undefined" &&
            GraphicsEngine.spawnCollisionSparks &&
            Math.random() < 0.6
          ) {
            const sparkY = closestSample.point.y + 0.38;
            GraphicsEngine.spawnCollisionSparks(
              { x: contactCorner.x, y: sparkY, z: contactCorner.z },
              { x: nWallX, z: nWallZ },
              4,
              0.8,
            );
          }
        }
      }
    } else {
      car.touchingBarrier = false;
      car.barrierContactSide = 0;
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

    // Buffer riutilizzati: le collisioni girano ogni frame per molte coppie,
    // quindi evitiamo di allocare centinaia di oggetti al secondo (GC/stutter).
    const sc =
      this._obbScratch ||
      (this._obbScratch = {
        result: { normal: { x: 0, z: 0 }, overlap: 0, contact: { x: 0, z: 0 } },
        axes: [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 0, z: 0 },
        ],
        ca: [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 0, z: 0 },
        ],
        cb: [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 0, z: 0 },
          { x: 0, z: 0 },
        ],
      });

    // Car A axes and extents
    const sinA = Math.sin(a.heading);
    const cosA = Math.cos(a.heading);
    const aFwdX = sinA,
      aFwdZ = cosA;
    const aRightX = cosA,
      aRightZ = -sinA;
    const aHfwd = a.halfLength || 2.3;
    const aHside = a.halfWidth || 1.02;

    // Car B axes and extents
    const sinB = Math.sin(b.heading);
    const cosB = Math.cos(b.heading);
    const bFwdX = sinB,
      bFwdZ = cosB;
    const bRightX = cosB,
      bRightZ = -sinB;
    const bHfwd = b.halfLength || 2.3;
    const bHside = b.halfWidth || 1.02;

    // Candidate separation axes (4 axes in 2D SAT)
    const axes = sc.axes;
    axes[0].x = aFwdX;
    axes[0].z = aFwdZ;
    axes[1].x = aRightX;
    axes[1].z = aRightZ;
    axes[2].x = bFwdX;
    axes[2].z = bFwdZ;
    axes[3].x = bRightX;
    axes[3].z = bRightZ;

    let minOverlap = Infinity;
    const colNormal = sc.result.normal;

    for (let i = 0; i < 4; i++) {
      const ax = axes[i].x;
      const az = axes[i].z;

      // Project Box A radius
      const rA =
        aHfwd * Math.abs(aFwdX * ax + aFwdZ * az) +
        aHside * Math.abs(aRightX * ax + aRightZ * az);

      // Project Box B radius
      const rB =
        bHfwd * Math.abs(bFwdX * ax + bFwdZ * az) +
        bHside * Math.abs(bRightX * ax + bRightZ * az);

      // Project distance vector D = B - A
      const distProj = dx * ax + dz * az;
      const overlap = rA + rB - Math.abs(distProj);

      if (overlap <= 0) {
        // Separating axis found -> No intersection
        return null;
      }

      if (overlap < minOverlap) {
        minOverlap = overlap;
        const sign = distProj >= 0 ? 1 : -1;
        colNormal.x = ax * sign;
        colNormal.z = az * sign;
      }
    }

    // Boxes intersect! Compute contact centroid
    const cornersA = sc.ca;
    cornersA[0].x = a.position.x + aFwdX * aHfwd + aRightX * aHside;
    cornersA[0].z = a.position.z + aFwdZ * aHfwd + aRightZ * aHside;
    cornersA[1].x = a.position.x + aFwdX * aHfwd - aRightX * aHside;
    cornersA[1].z = a.position.z + aFwdZ * aHfwd - aRightZ * aHside;
    cornersA[2].x = a.position.x - aFwdX * aHfwd + aRightX * aHside;
    cornersA[2].z = a.position.z - aFwdZ * aHfwd + aRightZ * aHside;
    cornersA[3].x = a.position.x - aFwdX * aHfwd - aRightX * aHside;
    cornersA[3].z = a.position.z - aFwdZ * aHfwd - aRightZ * aHside;

    const cornersB = sc.cb;
    cornersB[0].x = b.position.x + bFwdX * bHfwd + bRightX * bHside;
    cornersB[0].z = b.position.z + bFwdZ * bHfwd + bRightZ * bHside;
    cornersB[1].x = b.position.x + bFwdX * bHfwd - bRightX * bHside;
    cornersB[1].z = b.position.z + bFwdZ * bHfwd - bRightZ * bHside;
    cornersB[2].x = b.position.x - bFwdX * bHfwd + bRightX * bHside;
    cornersB[2].z = b.position.z - bFwdZ * bHfwd + bRightZ * bHside;
    cornersB[3].x = b.position.x - bFwdX * bHfwd - bRightX * bHside;
    cornersB[3].z = b.position.z - bFwdZ * bHfwd - bRightZ * bHside;

    let contactX = 0;
    let contactZ = 0;
    let contactCount = 0;

    for (let k = 0; k < 4; k++) {
      const c = cornersA[k];
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

    for (let k = 0; k < 4; k++) {
      const c = cornersB[k];
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

    const result = sc.result;
    result.overlap = minOverlap;
    result.contact.x = contactX;
    result.contact.z = contactZ;
    return result;
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

    // Squeeze protection near outer barriers: the car on the outside is not shoved into the Armco
    const trackHalfW = (this.trackData && this.trackData.halfWidth) || 10.0;
    const aNearBarrier = Math.abs(a.lateralDist || 0) > trackHalfW - 1.8;
    const bNearBarrier = Math.abs(b.lateralDist || 0) > trackHalfW - 1.8;
    let shareA = invMassA * posPercent;
    let shareB = invMassB * posPercent;
    if (aNearBarrier && !bNearBarrier) {
      shareA *= 0.25;
      shareB *= 1.75;
    } else if (bNearBarrier && !aNearBarrier) {
      shareB *= 0.25;
      shareA *= 1.75;
    }

    a.position.x -= normal.x * (sepMag * shareA);
    a.position.z -= normal.z * (sepMag * shareA);
    b.position.x += normal.x * (sepMag * shareB);
    b.position.z += normal.z * (sepMag * shareB);

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

    // Anti-ramming throttle cut cooldown: only apply when rear-ending, NOT on side-by-side door bangs
    const dxAB = b.position.x - a.position.x;
    const dzAB = b.position.z - a.position.z;
    const aIsBehind = dxAB * aSin + dzAB * aCos > 0.65;
    const bIsBehind = -dxAB * bSin - dzAB * bCos > 0.65;

    if (!a.isPlayer && !a.isRemotePlayer && aIsBehind) {
      a.collisionCooldownTimer = Math.max(a.collisionCooldownTimer || 0, 0.45);
      if (a.speed > 2.0) a.speed *= 0.94;
    }
    if (!b.isPlayer && !b.isRemotePlayer && bIsBehind) {
      b.collisionCooldownTimer = Math.max(b.collisionCooldownTimer || 0, 0.45);
      if (b.speed > 2.0) b.speed *= 0.94;
    }

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

    const IA = a.inertia || mA * 2.2;
    const IB = b.inertia || mB * 2.2;
    const invIA = a.isRemotePlayer ? 0 : 1 / IA;
    const invIB = b.isRemotePlayer ? 0 : 1 / IB;

    // 2D rotational moment arm: rZ * Nx - rX * Nz
    const crossA = rAz * normal.x - rAx * normal.z;
    const crossB = rBz * normal.x - rBx * normal.z;

    const kn = invMassSum + crossA * crossA * invIA + crossB * crossB * invIB;

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
      const kt =
        invMassSum + crossAt * crossAt * invIA + crossBt * crossBt * invIB;

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
        a.impactRoll = THREE.MathUtils.clamp(
          (a.impactRoll || 0) - (normal.x * aCos - normal.z * aSin) * 0.08,
          -0.15,
          0.15,
        );
        a.impactPitch = THREE.MathUtils.clamp(
          (a.impactPitch || 0) - (normal.x * aSin + normal.z * aCos) * 0.08,
          -0.12,
          0.12,
        );
      }

      // Apply to Car B
      if (!b.isRemotePlayer) {
        const dVBx = Jx * invMassB;
        const dVBz = Jz * invMassB;
        b.speed += dVBx * bSin + dVBz * bCos;
        b.lateralVel = (b.lateralVel || 0) + (dVBx * bCos - dVBz * bSin);
        b.angularVelocity = bOmega + (rBz * Jx - rBx * Jz) * invIB;

        // Visual suspension jolt
        b.impactRoll = THREE.MathUtils.clamp(
          (b.impactRoll || 0) + (normal.x * bCos - normal.z * bSin) * 0.08,
          -0.15,
          0.15,
        );
        b.impactPitch = THREE.MathUtils.clamp(
          (b.impactPitch || 0) + (normal.x * bSin + normal.z * bCos) * 0.08,
          -0.12,
          0.12,
        );
      }

      // Inelastic collision penalty for high-speed divebombing / rear-ending
      const relKmhInit = impactSpeed * 3.6;
      if (relKmhInit > 18) {
        const divebombPenalty = THREE.MathUtils.clamp(
          (relKmhInit - 18) / 200,
          0.04,
          0.18,
        );
        const aRamming = vAx * normal.x + vAz * normal.z > 1.2;
        const bRamming = vBx * -normal.x + vBz * -normal.z > 1.2;
        if (!a.isRemotePlayer && aRamming) {
          a.speed *= 1.0 - divebombPenalty;
          a.tireDirtyTimer = Math.min(0.8, (a.tireDirtyTimer || 0) + 0.35);
        }
        if (!b.isRemotePlayer && bRamming) {
          b.speed *= 1.0 - divebombPenalty;
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
      if (
        typeof GraphicsEngine !== "undefined" &&
        GraphicsEngine.spawnCollisionSparks
      ) {
        const sparkY = (a.position.y + b.position.y) * 0.5 + 0.35;
        GraphicsEngine.spawnCollisionSparks(
          { x: contact.x, y: sparkY, z: contact.z },
          normal,
          relKmh > 20 ? 10 : 5,
          Math.min(1.5, relKmh / 25),
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
    if (!this.player) return;
    const phys = this.player.carConfig.physics;
    const maxGears = (phys.gearRatios && phys.gearRatios.length) || 6;

    this.player.isManualMode = true;

    if (
      direction < 0 &&
      (this.player.gear === 1 || this.player.manualGear === 1)
    ) {
      this.player.gear = "R";
      this.player.manualGear = "R";
      AudioEngine.playUIClick();
      return;
    }
    if (
      direction > 0 &&
      (this.player.gear === "R" || this.player.manualGear === "R")
    ) {
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
      this.player.manualGear =
        typeof this.player.gear === "number" ? this.player.gear : 1;
    }
    AudioEngine.playUIClick();
    if (typeof UI !== "undefined" && UI.showToast) {
      UI.showToast(
        this.player.isManualMode
          ? "CAMBIO MANUALE ATTIVATO (K/L)"
          : "CAMBIO AUTOMATICO ATTIVATO (DRIVE)",
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
      // Input per-car: il giocatore frena col tasto giù, l'IA segnala freno/retromarcia con throttle < 0
      const isReversingThrottle = car.isPlayer
        ? Boolean(this.keys && this.keys.down)
        : throttle < 0;
      const targetRPM =
        idleRPM +
        (isReversingThrottle
          ? revPct * (redlineRPM - idleRPM) * 0.7 + 1200
          : 0);
      car.rpm = Math.round(
        THREE.MathUtils.clamp(targetRPM, idleRPM, redlineRPM),
      );
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

    if (
      car.isPlayer &&
      car.isManualMode &&
      typeof car.manualGear === "number"
    ) {
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
        const currentMechRPM =
          wheelRPS * gearRatios[prevGearIdx] * finalDrive * 60;

        // Se l'auto è rallentata bruscamente per una curva e si trova in marce alte,
        // annulla il cooldown per scalare tempestivamente!
        if (gearIdx >= 4 && speedAbs < 32.0) car.shiftCooldown = 0;
        if (gearIdx >= 2 && speedAbs < 14.0) car.shiftCooldown = 0;

        if (car.shiftCooldown <= 0) {
          // A. LOGICA SALITA MARCE (UPSHIFT)
          if (gearIdx < maxGears - 1 && currentMechRPM >= shiftRPM) {
            const nextGearRPM =
              wheelRPS * gearRatios[gearIdx + 1] * finalDrive * 60;
            if (nextGearRPM >= idleRPM * 1.5) {
              gearIdx++;
              car.shiftCooldown = 0.22;
              if (car.isPlayer && car.rpm > 4500) {
                AudioEngine.playGearShiftBang(
                  car.carConfig ? car.carConfig.id : "gt_comp",
                );
              }
            }
          }
          // B. LOGICA SCALATA MARCE (DOWNSHIFT) - Risolve il blocco in 6a marcia!
          else if (gearIdx > 0) {
            const lowerGearRPM =
              wheelRPS * gearRatios[gearIdx - 1] * finalDrive * 60;
            const overrevSafetyLimit = redlineRPM * 0.94;

            // Scala marcia solo se non provoca fuori-giri
            if (lowerGearRPM < overrevSafetyLimit) {
              // 1. Caduta di regime sotto la fascia di coppia utile (motore soffocato)
              const powerBandFloor = shiftRPM * 0.58;
              const isBelowPowerBand = currentMechRPM < powerBandFloor;

              // 2. Freno / Decelerazione in ingresso curva (richiesta di freno motore da gara)
              // Il giocatore usa il tasto freno; l'IA segnala la frenata con throttle < 0.
              const brakePedal = car.isPlayer
                ? Boolean(this.keys && this.keys.down)
                : throttle < 0;
              const isDecelerating = throttle === 0 || brakePedal;
              const wantsEngineBraking =
                isDecelerating && lowerGearRPM < redlineRPM * 0.82;

              // 3. Kickdown: acceleratore a fondo a medio regime per sorpasso
              const wantsKickdown =
                throttle > 0.7 &&
                lowerGearRPM < redlineRPM * 0.85 &&
                currentMechRPM < shiftRPM * 0.72;

              // 4. Soglie fisiche di velocità minima per ciascuna marcia:
              // Impedisce perentoriamente all'auto di restare in 6a, 5a o 4a a velocità da curva
              const minSpeedForGear =
                gearIdx >= 5
                  ? 32.0
                  : gearIdx === 4
                    ? 23.5
                    : gearIdx === 3
                      ? 16.5
                      : gearIdx === 2
                        ? 10.5
                        : 5.0;
              const isTooSlowForGear = speedAbs < minSpeedForGear;

              if (
                isBelowPowerBand ||
                wantsEngineBraking ||
                wantsKickdown ||
                isTooSlowForGear
              ) {
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
      effectiveRPM =
        throttle > 0 ? idleRPM + throttle * (shiftRPM * 0.35) : idleRPM;
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

    const frontY = this.getTrackSurfaceY(frontX, frontZ, car.sampleIndex);
    const rearY = this.getTrackSurfaceY(rearX, rearZ, car.sampleIndex);

    // Inclinazione longitudinale (pitch): salita muso in su (rotazione X negativa), discesa muso in giù
    const deltaY_pitch = frontY - rearY;
    const targetTrackPitch = -Math.atan2(deltaY_pitch, wheelbaseHalf * 2);

    // Inclinazione trasversale (banking / roll): lato destro più alto = roll verso sinistra
    const rightX_pos = car.position.x + cosH * trackWidthHalf;
    const rightZ_pos = car.position.z - sinH * trackWidthHalf;
    const leftX_pos = car.position.x - cosH * trackWidthHalf;
    const leftZ_pos = car.position.z + sinH * trackWidthHalf;

    const rightY = this.getTrackSurfaceY(
      rightX_pos,
      rightZ_pos,
      car.sampleIndex,
    );
    const leftY = this.getTrackSurfaceY(leftX_pos, leftZ_pos, car.sampleIndex);

    const deltaY_roll = rightY - leftY;
    const targetTrackRoll = Math.atan2(deltaY_roll, trackWidthHalf * 2);

    // Smoothing dell'inclinazione pista per evitare scatti poligonali
    if (typeof car.trackPitch === "undefined")
      car.trackPitch = targetTrackPitch;
    if (typeof car.trackRoll === "undefined") car.trackRoll = targetTrackRoll;
    car.trackPitch = THREE.MathUtils.lerp(
      car.trackPitch,
      targetTrackPitch,
      Math.min(1, dt * 14),
    );
    car.trackRoll = THREE.MathUtils.lerp(
      car.trackRoll,
      targetTrackRoll,
      Math.min(1, dt * 14),
    );

    // L'intero car.mesh (ruote e contact shadow compresi) segue fedelmente il piano inclinato della pista
    car.mesh.rotation.order = "YXZ";
    car.mesh.rotation.y = visualYaw;
    car.mesh.rotation.x = car.trackPitch;
    car.mesh.rotation.z = car.trackRoll;

    const ud = car.mesh.userData;
    if (!ud) return;

    // Dinamica interna delle sospensioni della carrozzeria (beccheggio in frenata/accelerazione e rollio centrifugo)
    const suspensionPitch =
      THREE.MathUtils.clamp(-accel * 0.0026, -0.065, 0.065) +
      (car.impactPitch || 0);
    const suspensionRoll =
      THREE.MathUtils.clamp(
        angularVel * (car.speed / 32) * 0.065,
        -0.09,
        0.09,
      ) + (car.impactRoll || 0);

    car.pitch = THREE.MathUtils.lerp(car.pitch || 0, suspensionPitch, dt * 11);
    car.roll = THREE.MathUtils.lerp(car.roll || 0, suspensionRoll, dt * 11);

    if (car.impactRoll)
      car.impactRoll = THREE.MathUtils.damp(car.impactRoll, 0, 9.0, dt);
    if (car.impactPitch)
      car.impactPitch = THREE.MathUtils.damp(car.impactPitch, 0, 9.0, dt);

    ud.bodyGroup.rotation.x = car.pitch;
    ud.bodyGroup.rotation.z = car.roll;

    // Escursione realistica sospensioni (affondamento muso in frenata e squat in accelerazione)
    const targetSuspensionY = THREE.MathUtils.clamp(
      -accel * 0.0016,
      -0.04,
      0.025,
    );
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
    // Buffer riutilizzati: nessuna allocazione di vettori per-frame
    const localTire =
      this._scratchSmokePos || (this._scratchSmokePos = new THREE.Vector3());
    localTire.set(side, 0.16, -1.5);
    if (car && car.mesh) {
      p.mesh.position.copy(car.mesh.localToWorld(localTire));
    } else {
      const backDir =
        this._scratchSmokeDir || (this._scratchSmokeDir = new THREE.Vector3());
      const rightDir =
        this._scratchSmokeRight ||
        (this._scratchSmokeRight = new THREE.Vector3());
      backDir.set(Math.sin(car.heading), 0, Math.cos(car.heading));
      rightDir.set(backDir.z, 0, -backDir.x);
      p.mesh.position
        .copy(car.position)
        .addScaledVector(backDir, -1.5)
        .addScaledVector(rightDir, side);
      p.mesh.position.y += 0.2;
    }

    p.mesh.scale.setScalar(0.55);
    p.mesh.material.opacity = 0.45;
    p.mesh.visible = true;
    p.life = 0.5;

    const upDir =
      (car && car.trackNormal) ||
      this._scratchSmokeUp ||
      (this._scratchSmokeUp = new THREE.Vector3(0, 1, 0));
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
    if (!this.player || !GameApp.camera) return;
    const car = this.player;

    // Inizializza e smorza la rotazione orizzontale della telecamera (Smooth Yaw Lag stile Gran Turismo)
    if (typeof this.camHeading !== "number" || isNaN(this.camHeading)) {
      this.camHeading = car.heading;
    }
    let headingDiff = car.heading - this.camHeading;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;

    // Asseconda dolcemente il drift in curva (anticipa l'uscita di curva)
    const driftBias = (car.driftAngle || 0) * 0.28;
    this.camHeading += (headingDiff + driftBias) * Math.min(1, dt * 8.5);

    const forward =
      this._camForward || (this._camForward = new THREE.Vector3());
    forward.set(Math.sin(this.camHeading), 0, Math.cos(this.camHeading));

    const speedKmh = Math.abs(car.speed || 0) * 3.6;
    const speedRatio = Math.min(1, speedKmh / 220);

    if (this.cameraMode === 1) {
      // 1. VISUALE COFANO / INTERNA (HOOD / COCKPIT CAM)
      const carId = (car.carConfig && car.carConfig.id) || "hatchback";
      const hoodY =
        carId === "hypercar" ? 0.95 : carId === "muscle" ? 1.15 : 1.25;
      const hoodZ = carId === "hypercar" ? 0.85 : 0.7;

      const hoodPos =
        this._camHoodPos || (this._camHoodPos = new THREE.Vector3());
      const hoodLook =
        this._camHoodLook || (this._camHoodLook = new THREE.Vector3());
      hoodPos.set(0, hoodY, hoodZ);
      car.mesh.localToWorld(hoodPos);
      hoodLook.set(0, hoodY * 0.85, 26);
      car.mesh.localToWorld(hoodLook);

      GameApp.camera.position.copy(hoodPos);
      GameApp.camera.lookAt(hoodLook);

      const targetFov = 62 + speedRatio * 18;
      GameApp.camera.fov = THREE.MathUtils.lerp(
        GameApp.camera.fov,
        targetFov,
        Math.min(1, dt * 7),
      );
      GameApp.camera.updateProjectionMatrix();
    } else {
      // 2. VISUALE TERZA PERSONA (GT DINAMICA) & VISUALE LONTANA
      const isFar = this.cameraMode === 2;

      // Calcolo distanze e altezze dinamiche basate sulla velocità
      const baseDist = isFar ? 11.6 : 8.4;
      const distBack = baseDist + speedRatio * (isFar ? 0.8 : 0.6);

      const baseHeight = isFar ? 3.9 : 2.75;
      const heightUp = baseHeight - speedRatio * 0.2; // Si abbassa lievemente alle alte velocità per accentuare la scia

      const lookAheadDist = isFar ? 20.0 : 16.5;
      const lookHeight = isFar ? 1.6 : 1.45;

      const pitch = car.trackPitch || 0;
      const slopeDeltaY = -distBack * Math.sin(-pitch);
      const lookDeltaY = lookAheadDist * Math.sin(-pitch);

      // Posizione desiderata camera
      const desiredPos =
        this._camDesiredPos || (this._camDesiredPos = new THREE.Vector3());
      desiredPos.copy(car.position).addScaledVector(forward, -distBack);
      desiredPos.y += heightUp + slopeDeltaY;

      // Target verso cui guarda: punto in avanti lungo la traiettoria ad altezza occhi
      const desiredLook =
        this._camDesiredLook || (this._camDesiredLook = new THREE.Vector3());
      desiredLook.copy(car.position).addScaledVector(forward, lookAheadDist);
      desiredLook.y += lookHeight + lookDeltaY;

      // Interpolazione fluida della posizione e del punto di mira
      this.camPos.lerp(desiredPos, Math.min(1, dt * 9.5));
      this.camLook.lerp(desiredLook, Math.min(1, dt * 12.0));

      GameApp.camera.position.copy(this.camPos);
      GameApp.camera.lookAt(this.camLook);

      // FOV dinamico che si apre all'aumentare della velocità e durante lo Slingshot Boost
      const boostFov = car.isSlingshotBoosting
        ? 5.2
        : (car.draftIntensity || 0) * 2.0;
      const targetFov = (isFar ? 58 : 60) + speedRatio * 16 + boostFov;
      GameApp.camera.fov = THREE.MathUtils.lerp(
        GameApp.camera.fov,
        targetFov,
        Math.min(1, dt * 6.0),
      );
      GameApp.camera.updateProjectionMatrix();
    }

    // Camera Impact Trauma & Visceral Crash Shake
    if (this.cameraTrauma > 0.001) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.8);
      const shakePower = Math.pow(this.cameraTrauma, 2);
      const t = performance.now() * 0.001;
      const shakeX =
        (Math.sin(t * 43) * 0.7 + Math.sin(t * 89) * 0.3) * shakePower * 0.38;
      const shakeY =
        (Math.cos(t * 51) * 0.7 + Math.cos(t * 97) * 0.3) * shakePower * 0.28;
      const shakeZ = Math.sin(t * 61) * shakePower * 0.22;

      GameApp.camera.position.x += shakeX;
      GameApp.camera.position.y += shakeY;
      GameApp.camera.position.z += shakeZ;
      GameApp.camera.rotation.z += shakeX * 0.04;
    }
  },

  cycleCamera() {
    this.cameraMode = (this.cameraMode + 1) % 3;
    const labels = [
      "TERZA PERSONA (GT)",
      "COFANO / INTERNA",
      "VISUALE LONTANA",
    ];
    const modeEl = document.getElementById("hud-cam-mode");
    if (modeEl) modeEl.textContent = labels[this.cameraMode];
    AudioEngine.playUIClick();
    UI.showToast(`Visuale: ${labels[this.cameraMode]}`, "fa-video");
  },

  resetPlayerToTrack() {
    if (!this.player || !this.trackData) return;
    const s = this.trackData.samples[this.player.sampleIndex];
    this.player.position.copy(s.point);
    this.player.heading = Math.atan2(s.tangent.x, s.tangent.z);
    this.camHeading = this.player.heading;
    this.player.speed = 0;
    this.player.driftAngle = 0;
    AudioEngine.playUIClick();
    UI.showToast("Vettura riposizionata al centro della pista", "fa-rotate");
  },

  // Classifica completa (allocazione + sort). Memorizzata in cache per qualche
  // frame così l'HUD non la ricalcola ad ogni frame; `force = true` la ricalcola
  // sempre (es. a fine gara per un ordine d'arrivo definitivo).
  getStandings(force = false) {
    if (
      !force &&
      this._standingsCache &&
      this._standingsCacheRacers === this.allRacers &&
      this.frameCounter - (this._standingsCacheFrame || 0) < 6
    ) {
      return this._standingsCache;
    }
    const sorted = [...this.allRacers].sort((a, b) => {
      if (a.finished && b.finished) {
        if (a.finishTime && b.finishTime && a.finishTime !== b.finishTime) {
          return a.finishTime - b.finishTime;
        }
        const idxA = this.officialFinishOrder
          ? this.officialFinishOrder.indexOf(a)
          : -1;
        const idxB = this.officialFinishOrder
          ? this.officialFinishOrder.indexOf(b)
          : -1;
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      }
      if (a.finished) return -1;
      if (b.finished) return 1;
      const progA =
        typeof a.totalProgress === "number" && !isNaN(a.totalProgress)
          ? a.totalProgress
          : 0;
      const progB =
        typeof b.totalProgress === "number" && !isNaN(b.totalProgress)
          ? b.totalProgress
          : 0;
      return progB - progA;
    });
    this._standingsCache = sorted;
    this._standingsCacheRacers = this.allRacers;
    this._standingsCacheFrame = this.frameCounter;
    return sorted;
  },

  // ── Cache riferimenti DOM: evita getElementById per-frame ─────────────────
  _el(id) {
    const cached = this._hudEls[id];
    if (cached) return cached;
    const el = document.getElementById(id);
    // Non cachare i null: elementi creati in seguito vengono risolti al volo
    if (el) this._hudEls[id] = el;
    return el;
  },

  _setText(el, value) {
    if (!el) return;
    const str = String(value);
    if (el.textContent !== str) el.textContent = str;
  },

  _setHTML(el, html) {
    if (el && el.innerHTML !== html) el.innerHTML = html;
  },

  _setClass(el, className) {
    if (!el || el.dataset.gtClass === className) return;
    el.className = className;
    el.dataset.gtClass = className;
  },

  // Aggiunge/rimuove una singola classe preservando le altre già presenti
  _setClassFlag(el, className, on) {
    if (!el) return;
    if (el.classList.contains(className) !== on) {
      if (on) el.classList.add(className);
      else el.classList.remove(className);
      // La className è variata: invalida la cache del className completo
      delete el.dataset.gtClass;
    }
  },

  _setStyle(el, prop, value) {
    if (!el || el.style[prop] === value) return;
    el.style[prop] = value;
  },

  updateHUD(nowMs) {
    if (!this.player) return;
    const car = this.player;
    const kmh = Math.round(Math.abs(car.speed) * 3.6);

    // ── Barre fluide (ogni frame) con scritture differite ───────────────────
    const redline =
      (car.carConfig &&
        car.carConfig.physics &&
        car.carConfig.physics.redlineRPM) ||
      8500;
    const rpmPct = Math.min(
      100,
      Math.max(8, (car.rpm / (redline * 1.05)) * 100),
    );
    this._setStyle(this._el("hud-rpm-bar"), "width", `${rpmPct}%`);

    this._setClassFlag(
      this._el("hud-gear-box"),
      "redline-flash",
      car.rpm >= redline * 0.94,
    );

    this._setStyle(
      this._el("hud-throttle-bar"),
      "height",
      this.keys.up ? "100%" : "0%",
    );
    this._setStyle(
      this._el("hud-brake-bar"),
      "height",
      this.keys.down ? "100%" : "0%",
    );

    // Banner centrale dinamico di scia aerodinamica e Slingshot Boost
    const draftBanner = this._el("hud-draft-banner");
    const draftText = this._el("hud-draft-text");
    if (draftBanner) {
      if (car.isSlingshotBoosting) {
        this._setClass(
          draftBanner,
          "mt-2 px-5 py-1.5 rounded-full bg-gradient-to-r from-amber-400 via-cyan-400 to-blue-500 text-slate-950 font-racing font-black text-xs sm:text-sm tracking-widest uppercase shadow-xl shadow-cyan-400/50 flex items-center justify-center gap-1.5 transition-all animate-pulse",
        );
        const timeLeft = (car.slingshotBoostTimer || 0).toFixed(1);
        this._setText(draftText, `🚀 SLINGSHOT BOOST! (+24 KM/H • ${timeLeft}s)`);
      } else if (car.inDraft && (car.draftChargePct || 0) >= 0.2 && kmh > 60) {
        this._setClass(
          draftBanner,
          "mt-2 px-4 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 font-racing font-bold text-xs tracking-widest uppercase shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-1.5 transition-all",
        );
        const pct = Math.round((car.draftChargePct || 0) * 100);
        const targetStr = car.draftTargetName
          ? `DIETRO A ${car.draftTargetName} `
          : "";
        this._setText(draftText, `CARICAMENTO SCIA ${targetStr}(${pct}%)`);
      } else {
        this._setClassFlag(draftBanner, "hidden", true);
      }
    }

    // Banner centrale Bandiera a Scacchi e Arrivo al Traguardo
    const finishBanner = this._el("hud-finish-banner");
    const finishBannerText = this._el("hud-finish-banner-text");
    if (finishBanner && finishBannerText) {
      if (car.finished) {
        this._setClassFlag(finishBanner, "hidden", false);
        const isLan =
          this.mode === "lan_race" ||
          this.mode === "lan_championship" ||
          this.isLanChampionship;
        const myRank =
          car.finishRank || this.officialFinishOrder.indexOf(car) + 1 || 1;
        const myTimeStr = UI.formatLapTime(car.finishTime);
        const hasUnfinishedHumans =
          isLan && this.allRacers.some((r) => r.isRemotePlayer && !r.finished);
        if (hasUnfinishedHumans) {
          this._setHTML(
            finishBannerText,
            `P${myRank} (${myTimeStr}) <span class="text-amber-400 text-xs ml-2 animate-pulse">IN ATTESA DELL'AVVERSARIO LAN...</span>`,
          );
        } else if (!this.allRacers.every((r) => r.finished)) {
          this._setHTML(
            finishBannerText,
            `HAI TAGLIATO IN P${myRank}! (${myTimeStr}) <span class="text-slate-400 text-xs ml-2">ARRIVO CONCORRENTI...</span>`,
          );
        } else {
          this._setText(
            finishBannerText,
            `GARA CONCLUSA! P${myRank} (${myTimeStr})`,
          );
        }
      } else if (this.chequeredFlagActive) {
        this._setClassFlag(finishBanner, "hidden", false);
        const winner = this.officialFinishOrder[0];
        const winnerName = winner
          ? winner.isPlayer
            ? "TU"
            : winner.driverName || "LEADER"
          : "LEADER";
        this._setText(
          finishBannerText,
          `🏁 BANDIERA A SCACCHI • P1: ${winnerName}!`,
        );
      } else {
        this._setClassFlag(finishBanner, "hidden", true);
      }
    }

    // Update Live FIA Sector, Corner Name & DRS Status Banner
    const curU = car.sampleIndex / this.trackData.samples.length;
    const sectorBadge = this._el("hud-sector-badge");
    const cornerEl = this._el("hud-corner-name");
    const drsBadge = this._el("hud-drs-badge");
    const draftBadge = this._el("hud-draft-badge");

    if (sectorBadge && cornerEl && drsBadge) {
      if (curU < 0.333) {
        this._setText(sectorBadge, "SETTORE 1");
        this._setClass(
          sectorBadge,
          "px-2 py-0.5 rounded-full text-[10px] font-racing font-bold bg-rose-500/30 text-rose-300 border border-rose-400/40",
        );
      } else if (curU < 0.666) {
        this._setText(sectorBadge, "SETTORE 2");
        this._setClass(
          sectorBadge,
          "px-2 py-0.5 rounded-full text-[10px] font-racing font-bold bg-cyan-500/30 text-cyan-300 border border-cyan-400/40",
        );
      } else {
        this._setText(sectorBadge, "SETTORE 3");
        this._setClass(
          sectorBadge,
          "px-2 py-0.5 rounded-full text-[10px] font-racing font-bold bg-amber-500/30 text-amber-300 border border-amber-400/40",
        );
      }

      const corners = this.trackConfig.corners || [];
      let activeCorner = corners[0] ? corners[0].name : this.trackConfig.name;
      for (let c of corners) {
        if (curU >= c.u) activeCorner = c.name;
      }
      this._setText(cornerEl, activeCorner.toUpperCase());

      const curSample = this.trackData.samples[car.sampleIndex];
      if (car.drsActive) {
        this._setText(drsBadge, "DRS OPEN");
        this._setClass(
          drsBadge,
          "px-2.5 py-0.5 rounded-full text-[10px] font-racing font-black bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/40",
        );
      } else if (curSample && curSample.isDRS) {
        this._setText(drsBadge, "DRS ZONE");
        this._setClass(
          drsBadge,
          "px-2.5 py-0.5 rounded-full text-[10px] font-racing font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40",
        );
      } else {
        this._setText(drsBadge, "DRS OFF");
        this._setClass(
          drsBadge,
          "px-2.5 py-0.5 rounded-full text-[10px] font-racing font-bold bg-slate-800 text-slate-500 border border-white/10",
        );
      }

      if (draftBadge) {
        if (car.isSlingshotBoosting) {
          this._setClassFlag(draftBadge, "hidden", false);
          const timeLeft = (car.slingshotBoostTimer || 0).toFixed(1);
          this._setText(draftBadge, `🚀 SUPER SCIA (${timeLeft}s)`);
          this._setClass(
            draftBadge,
            "px-2.5 py-0.5 rounded-full text-[10px] font-racing font-black bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 shadow-lg shadow-amber-400/60 animate-pulse",
          );
        } else if (car.inDraft && (car.draftChargePct || 0) > 0.08) {
          this._setClassFlag(draftBadge, "hidden", false);
          const pct = Math.round((car.draftChargePct || 0) * 100);
          this._setText(draftBadge, `CARICA SCIA ${pct}%`);
          this._setClass(
            draftBadge,
            "px-2 py-0.5 rounded-full text-[9px] font-racing font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40",
          );
        } else {
          this._setClassFlag(draftBadge, "hidden", true);
        }
      }
    }

    const isCompetitive =
      this.mode === "race" ||
      this.mode === "lan_race" ||
      this.mode === "championship" ||
      this.mode === "lan_championship" ||
      this.isLanChampionship;

    // ── Testi a variazione lenta: aggiornati a ~15 Hz (66 ms) ───────────────
    if (nowMs - (this._hudTextLast || 0) >= 66) {
      this._hudTextLast = nowMs;

      this._setText(this._el("hud-speed"), kmh);
      this._setText(this._el("hud-gear"), car.gear);
      this._setText(
        this._el("hud-rpm-text"),
        `${car.rpm.toLocaleString("it-IT")} RPM`,
      );

      const driftDeg = Math.round(Math.abs(car.driftAngle) * (180 / Math.PI));
      this._setText(this._el("hud-drift-angle"), `${driftDeg}°`);
      this._setClassFlag(
        this._el("hud-drift-banner"),
        "hidden",
        !(driftDeg >= 10 && kmh > 40),
      );

      const displayLap = isCompetitive
        ? Math.min(this.totalLaps, Math.max(1, car.lap))
        : Math.max(1, car.lap);
      this._setText(this._el("hud-lap"), displayLap);
      this._setText(
        this._el("hud-cur-time"),
        UI.formatLapTime(car.currentLapTime),
      );

      if (car.bestLapTime) {
        this._setText(
          this._el("hud-best-time"),
          UI.formatLapTime(car.bestLapTime),
        );
      }

      if (isCompetitive) {
        const standings = this.getStandings();
        const myId =
          (typeof NetworkEngine !== "undefined" &&
            (NetworkEngine.myPlayerId || NetworkEngine.myId)) ||
          null;
        const myIndex = standings.findIndex(
          (r) => r.isPlayer || (myId && r.id === myId),
        );
        const pos = myIndex >= 0 ? myIndex + 1 : 1;
        const posEl = this._el("hud-position");
        if (posEl) this._setText(posEl, pos);

        const leader = standings[0] || car;
        const gapEl = this._el("hud-gap");
        if (gapEl) {
          if (car.finished) {
            const myRank =
              car.finishRank ||
              this.officialFinishOrder.indexOf(car) + 1 ||
              pos;
            this._setText(gapEl, `P${myRank} FIN`);
            this._setClass(gapEl, "font-racing font-bold text-emerald-400");
          } else if (pos === 1) {
            this._setText(gapEl, "LEADER");
            this._setClass(gapEl, "font-racing font-bold text-emerald-400");
          } else {
            if (this.countdownTimer > 0) {
              this._setText(gapEl, `P${pos}`);
              this._setClass(gapEl, "font-racing font-bold text-amber-300");
            } else {
              const progressDiff = Math.max(
                0,
                (leader.totalProgress || 0) - (car.totalProgress || 0),
              );
              if (progressDiff >= 1.0) {
                const lapsBehind = Math.floor(progressDiff);
                this._setText(
                  gapEl,
                  `+${lapsBehind} ${lapsBehind === 1 ? "GIRO" : "GIRI"}`,
                );
                this._setClass(gapEl, "font-racing font-bold text-rose-400");
              } else {
                const speedRef = Math.max(
                  20,
                  Math.abs(car.speed),
                  Math.abs(leader.speed || 0),
                );
                const trackLen =
                  (this.trackData && this.trackData.totalLength) || 1200;
                const approxSeconds = (progressDiff * trackLen) / speedRef;
                this._setText(gapEl, `+${approxSeconds.toFixed(2)}s`);
                this._setClass(gapEl, "font-racing font-bold text-amber-300");
              }
            }
          }
        }

        if (nowMs - this.lastHudLeaderboardUpdate > 250) {
          this.lastHudLeaderboardUpdate = nowMs;
          this.renderLiveTimingTower(standings, leader);
        }
      }
    }
  },

  renderLiveTimingTower(standings, leader) {
    const container = this._el("hud-leaderboard-rows");
    if (!container) return;

    const statusEl = this._el("hud-ai-status");
    if (this.raceElapsedSeconds < 3.5 && this.countdownTimer <= 0) {
      this._setText(statusEl, "TURN 1 FORMATION");
    } else {
      this._setText(
        statusEl,
        `GIRO ${Math.min(this.totalLaps, Math.max(1, (leader && leader.lap) || 1))}/${this.totalLaps}`,
      );
    }

    const diffTagEl = this._el("hud-diff-tag");
    if (diffTagEl) {
      if (this.mode === "lan_race") {
        this._setText(diffTagEl, `LAN ONLINE (${this.allRacers.length}P)`);
        this._setClass(
          diffTagEl,
          "px-1.5 py-0.2 rounded text-[8px] font-racing font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/30",
        );
      } else if (
        (this.mode === "championship" ||
          this.mode === "lan_championship" ||
          this.isLanChampionship) &&
        typeof ChampionshipEngine !== "undefined" &&
        ChampionshipEngine.state
      ) {
        const stageNum = ChampionshipEngine.state.currentStageIndex + 1;
        const totalS = ChampionshipEngine.state.totalStages;
        const isLan =
          this.isLanChampionship || this.mode === "lan_championship";
        this._setText(
          diffTagEl,
          `${isLan ? "GP LAN" : "GP"} TAPPA ${stageNum}/${totalS}`,
        );
        this._setClass(
          diffTagEl,
          "px-1.5 py-0.2 rounded text-[8px] font-racing font-bold bg-amber-400 text-slate-950 shadow-sm",
        );
      } else {
        const diffConfig = this.getDifficultyConfig();
        this._setText(
          diffTagEl,
          `${diffConfig.name.toUpperCase()} (x${diffConfig.multiplier.toFixed(1)})`,
        );
        this._setClass(
          diffTagEl,
          `px-1.5 py-0.2 rounded text-[8px] font-racing font-bold ${diffConfig.badgeBg}`,
        );
      }
    }

    const myId =
      (typeof NetworkEngine !== "undefined" &&
        (NetworkEngine.myPlayerId || NetworkEngine.myId)) ||
      null;

    // Firma dello stato classifica: se invariata evitiamo di ricostruire l'HTML
    const sigParts = [];
    const rowsHtml = standings
      .slice(0, 10)
      .map((r, idx) => {
        const rank = idx + 1;
        let gapStr = "LEADER";
        if (idx === 0) {
          gapStr = r.finished ? "VINCITORE" : "LEADER";
        } else if (leader) {
          if (r.finished && leader.finished) {
            const sec = Math.max(0, (r.finishTime - leader.finishTime) / 1000);
            gapStr = `+${sec.toFixed(1)}s`;
          } else {
            const pDiff = Math.max(
              0,
              (leader.totalProgress || 0) - (r.totalProgress || 0),
            );
            if (pDiff >= 1.0) {
              const laps = Math.floor(pDiff);
              gapStr = `+${laps}L`;
            } else {
              const speedRef = Math.max(
                22,
                Math.abs(r.speed || 0),
                Math.abs(leader.speed || 0),
              );
              const trackLen =
                (this.trackData && this.trackData.totalLength) || 1200;
              const sec = (pDiff * trackLen) / speedRef;
              gapStr = `+${sec.toFixed(1)}s`;
            }
          }
        }

        let hexColor = "#00f0ff";
        if (r.teamColorHex) {
          hexColor =
            typeof r.teamColorHex === "number"
              ? "#" + r.teamColorHex.toString(16).padStart(6, "0")
              : String(r.teamColorHex);
        }

        const isMe = r.isPlayer || (myId && r.id === myId);
        const rowClass = isMe
          ? "bg-amber-400/25 border border-amber-400/60 text-white font-bold shadow-sm"
          : "bg-slate-900/75 text-slate-300";

        let badgeTag = "";
        if (r.finished) {
          badgeTag =
            '<span class="px-1 rounded text-[8px] bg-emerald-500/30 text-emerald-300 font-bold border border-emerald-400/40">FIN</span>';
        } else if (
          this.mode === "lan_race" ||
          this.mode === "lan_championship" ||
          this.isLanChampionship
        ) {
          const isHost =
            typeof NetworkEngine !== "undefined" &&
            NetworkEngine.hostId &&
            r.id === NetworkEngine.hostId;
          if (isMe) {
            badgeTag =
              '<span class="px-1 rounded text-[8px] bg-cyan-500/30 text-cyan-200">TU</span>';
          } else if (isHost) {
            badgeTag =
              '<span class="px-1 rounded text-[8px] bg-amber-400/30 text-amber-200 font-bold">HOST</span>';
          } else if (r.isAi) {
            const aiTag = r.aiStatusTag || "IA";
            badgeTag = `<span class="px-1 rounded text-[8px] bg-slate-800 text-slate-300 border border-white/10">${aiTag}</span>`;
          }
        } else {
          let badgeStyle = "bg-cyan-500/30 text-cyan-200";
          if (r.aiStatusTag === "LUNGO!")
            badgeStyle = "bg-rose-500/40 text-rose-200";
          else if (r.aiStatusTag === "DRS")
            badgeStyle = "bg-emerald-500/30 text-emerald-200 font-bold";
          else if (r.aiStatusTag === "SCIA")
            badgeStyle = "bg-amber-400/30 text-amber-200 font-bold";
          else if (r.aiStatusTag === "SLINGSHOT")
            badgeStyle =
              "bg-fuchsia-500/40 text-fuchsia-200 font-bold animate-pulse";
          else if (r.aiStatusTag === "SORPASSO")
            badgeStyle =
              "bg-purple-500/40 text-purple-200 font-bold animate-pulse";
          else if (r.aiStatusTag === "DIFESA")
            badgeStyle = "bg-blue-500/40 text-blue-200 font-bold";
          else if (r.aiStatusTag === "ATTACCO")
            badgeStyle = "bg-red-500/30 text-red-200 font-bold";
          else if (r.aiStatusTag === "TATTICA")
            badgeStyle = "bg-sky-500/30 text-sky-200 font-bold";
          else if (r.aiStatusTag === "GESTIONE")
            badgeStyle = "bg-teal-500/30 text-teal-200 font-bold";
          else if (r.aiStatusTag === "RECUPERO!")
            badgeStyle = "bg-orange-500/40 text-orange-200";
          else if (r.aiStatusTag === "RIENTRO!")
            badgeStyle = "bg-amber-500/40 text-amber-200";
          else if (r.aiStatusTag === "MANOVRA!")
            badgeStyle =
              "bg-amber-500/40 text-amber-200 font-bold animate-pulse";

          badgeTag =
            !r.isPlayer && r.aiStatusTag
              ? `<span class="px-1 rounded text-[8px] ${badgeStyle}">${r.aiStatusTag}</span>`
              : "";
        }

        const driverCode =
          r.driverCode ||
          (r.driverName ? r.driverName.slice(0, 3).toUpperCase() : "DRV");

        sigParts.push(
          `${rank}:${r.id}:${gapStr}:${r.aiStatusTag || ""}:${r.finished ? 1 : 0}:${driverCode}`,
        );

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

    const timingSig = sigParts.join("|");
    if (timingSig !== this._timingSig) {
      this._timingSig = timingSig;
      container.innerHTML = rowsHtml;
    }
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

    // Layer statico pre-renderizzato: ricostruito solo se cambia circuito o risoluzione
    const staticKey = this.trackConfig.id + "|" + w + "x" + h;
    if (!this._minimapStatic || this._minimapStatic.key !== staticKey) {
      this._minimapStatic = this._buildMinimapStatic(w, h, staticKey);
    }
    const staticLayer = this._minimapStatic;

    ctx.clearRect(0, 0, w, h);
    if (staticLayer && staticLayer.canvas) {
      ctx.drawImage(staticLayer.canvas, 0, 0);
    }

    const transform = staticLayer.transform;
    const toMapX = (x) => w / 2 + (x - transform.centerX) * transform.scale;
    const toMapY = (z) => h / 2 + (z - transform.centerZ) * transform.scale;

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

  // Pre-renderizza su canvas offscreen la parte statica della minimappa
  // (contorno pista, settori, zone DRS, speed trap e linea del traguardo).
  _buildMinimapStatic(w, h, key) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

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

    return { key, canvas, transform: { scale, centerX, centerZ } };
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
    // Le gare LAN non possono essere riavviate localmente: la partenza è
    // orchestrata dal server (semaforo sincronizzato / stanza). Riportiamo
    // quindi il giocatore alla lobby multiplayer invece di avviare per errore
    // una gara singola fuori sincrono (comportamento coerente col rematch LAN).
    if (
      this.mode === "lan_race" ||
      this.mode === "lan_championship" ||
      this.isLanChampionship
    ) {
      this.quitToMenu();
      UI.switchTab("multiplayer");
      return;
    }
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
    const mStage = document.getElementById("modal-championship-stage");
    if (mStage) {
      mStage.classList.add("hidden");
      mStage.classList.remove("flex");
    }
    const mFinale = document.getElementById("modal-championship-finale");
    if (mFinale) {
      mFinale.classList.add("hidden");
      mFinale.classList.remove("flex");
    }

    document.getElementById("menu-header").classList.remove("hidden");
    document.getElementById("menu-main").classList.remove("hidden");

    UI.updateHeaderStats();
    UI.switchTab(UI.currentTab || "race");
  },

  // Nasconde le modali di tappa/finale campionato quando una nuova gara viene avviata
  // (es. l'Host avvia la tappa successiva mentre gli ospiti sono sulla schermata di riepilogo).
  hideChampionshipModals() {
    ["modal-championship-stage", "modal-championship-finale"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add("hidden");
        el.classList.remove("flex");
      }
    });
  },

  recordCarFinish(car, explicitFinishTime = null) {
    if (!car || car.finished) return;
    car.finished = true;

    let elapsed;
    if (explicitFinishTime && explicitFinishTime > 0) {
      elapsed = explicitFinishTime;
    } else if (
      (this.mode === "lan_race" ||
        this.mode === "lan_championship" ||
        this.isLanChampionship) &&
      this.raceStartTimeEpoch &&
      typeof NetworkEngine !== "undefined" &&
      NetworkEngine.isConnected
    ) {
      elapsed = Math.max(
        1000,
        Math.round(NetworkEngine.getServerTime() - this.raceStartTimeEpoch),
      );
    } else {
      const nowMs = performance.now();
      elapsed = this.raceStartEpoch
        ? nowMs - this.raceStartEpoch
        : this.raceElapsedSeconds * 1000;
    }
    car.finishTime = Math.max(1000, Math.round(elapsed));

    if (!this.officialFinishOrder.some((r) => r.id === car.id)) {
      this.officialFinishOrder.push(car);
    }
    car.finishRank = this.officialFinishOrder.length;

    // Se è la prima vettura assoluta, attiva la bandiera a scacchi ufficiale
    if (!this.chequeredFlagActive) {
      this.chequeredFlagActive = true;
      this.chequeredFlagTimer = 0;
      const winnerName = car.isPlayer ? "TU" : car.driverName || "Leader";
      if (typeof UI !== "undefined" && UI.showToast) {
        UI.showToast(
          `🏁 BANDIERA A SCACCHI! P1: ${winnerName}`,
          "fa-flag-checkered",
        );
      }
      if (typeof AudioEngine !== "undefined" && AudioEngine.playTone) {
        AudioEngine.playTone(660, 0.22, "sine", 0.35);
        setTimeout(() => {
          if (typeof AudioEngine !== "undefined" && AudioEngine.playTone) {
            AudioEngine.playTone(880, 0.4, "triangle", 0.4);
          }
        }, 180);
      }
    }

    if (car.isPlayer) {
      if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
        NetworkEngine.sendFinishRace(car.finishTime, car.bestLapTime);
      }
      if (typeof UI !== "undefined" && UI.showToast) {
        UI.showToast(
          `🏁 HAI TAGLIATO IL TRAGUARDO IN P${car.finishRank}! (${UI.formatLapTime(car.finishTime)})`,
          "fa-flag-checkered",
        );
      }
      if (typeof AudioEngine !== "undefined" && AudioEngine.playTone) {
        AudioEngine.playTone(523.25, 0.15, "triangle", 0.3);
      }
      // In LAN concedi fino a 30 secondi agli avversari umani (timeout ritardatari),
      // in single player 7.0 secondi di crociera libera prima della chiusura.
      const isLan =
        this.mode === "lan_race" ||
        this.mode === "lan_championship" ||
        this.isLanChampionship;
      this.postRaceCooldownTimer = isLan ? 30.0 : 7.0;
    }
  },

  extrapolateUnfinishedRacers() {
    if (!this.allRacers || this.allRacers.length === 0) return;
    const trackLen = (this.trackData && this.trackData.totalLength) || 1200;
    const baseTime =
      this.officialFinishOrder.length > 0
        ? this.officialFinishOrder[this.officialFinishOrder.length - 1]
            .finishTime
        : this.raceElapsedSeconds * 1000;

    // Identifica tutte le vetture che non hanno ancora tagliato la linea
    const unfinished = this.allRacers.filter((r) => !r.finished);
    // Ordina per progresso decrescente sul circuito (chi è più avanti conclude prima)
    unfinished.sort((a, b) => (b.totalProgress || 0) - (a.totalProgress || 0));

    let progressiveTime = Math.max(1000, baseTime);
    for (let r of unfinished) {
      const remainingProgress = Math.max(
        0.02,
        this.totalLaps - (r.totalProgress || 0),
      );
      const estSpeed = Math.max(22, Math.abs(r.speed || 30));
      const estSeconds = (remainingProgress * trackLen) / estSpeed;
      progressiveTime += Math.max(500, Math.round(estSeconds * 1000));

      r.finished = true;
      r.finishTime = progressiveTime;
      if (!this.officialFinishOrder.some((x) => x.id === r.id)) {
        this.officialFinishOrder.push(r);
      }
      r.finishRank = this.officialFinishOrder.length;
    }
  },

  completeRaceSession() {
    this.isFinished = true;
    this.raceSessionClosing = true;
    AudioEngine.setDrivingAudioActive(false);
    AudioEngine.playCashPurchase();

    // Assicura che tutte le vetture abbiano registrato o estrapolato tempo e traguardo
    this.extrapolateUnfinishedRacers();

    const standings = this.getStandings(true);
    const playerPos = standings.findIndex((r) => r.isPlayer) + 1;

    // Calcolo crediti e record profilo con moltiplicatore di difficoltà
    const basePrize =
      this.trackConfig && typeof this.trackConfig.prizeFirst === "number"
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
      GameApp.profile.records[this.trackConfig.id] = {
        bestLap: null,
        bestPos: null,
        trophies: 0,
      };
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
      titleEl.textContent =
        titles[playerPos] || `BANDIERA A SCACCHI • ${playerPos}° POSTO`;
    }

    const trophyIcon = document.getElementById("res-trophy-icon");
    if (trophyIcon) {
      if (playerPos === 1) {
        trophyIcon.className =
          "w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-2xl text-amber-400 shadow-lg shadow-amber-500/30";
        trophyIcon.innerHTML = '<i class="fa-solid fa-trophy"></i>';
      } else if (playerPos <= 3) {
        trophyIcon.className =
          "w-12 h-12 rounded-2xl bg-slate-200/20 border border-slate-300/40 flex items-center justify-center text-2xl text-slate-200 shadow-md";
        trophyIcon.innerHTML = '<i class="fa-solid fa-medal"></i>';
      } else {
        trophyIcon.className =
          "w-12 h-12 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center text-2xl text-slate-400";
        trophyIcon.innerHTML = '<i class="fa-solid fa-flag-checkered"></i>';
      }
    }

    const modeBadge = document.getElementById("res-mode-badge");
    if (modeBadge) {
      modeBadge.textContent =
        this.mode === "lan_race" ? "LAN MULTIPLAYER" : "GP WORLD SERIES";
    }

    const diffBadge = document.getElementById("res-diff-badge");
    if (diffBadge) {
      diffBadge.textContent = `${diffConfig.name.toUpperCase()} (x${diffMult.toFixed(1)})`;
      diffBadge.className = `px-2 py-0.5 rounded text-[9px] font-racing font-bold uppercase ${diffConfig.badgeBg}`;
    }

    // Ricerca del giro più veloce assoluto in gara
    let sessionFastestLap = Infinity;
    let sessionFastestDriver = null;
    let sessionFastestDriverId = null;
    standings.forEach((r) => {
      if (
        r.bestLapTime &&
        r.bestLapTime > 4000 &&
        r.bestLapTime < sessionFastestLap
      ) {
        sessionFastestLap = r.bestLapTime;
        sessionFastestDriver = r.driverName;
        sessionFastestDriverId = r.id;
      }
    });

    // Se la sessione è in modalità CAMPIONATO (singolo o LAN), registra i punti FIA e apri la schermata di tappa
    if (
      (this.mode === "championship" ||
        this.mode === "lan_championship" ||
        this.isLanChampionship) &&
      typeof ChampionshipEngine !== "undefined"
    ) {
      const stageSummary = ChampionshipEngine.recordStageResults(
        standings,
        sessionFastestDriverId,
      );
      if (stageSummary && typeof UI !== "undefined") {
        UI.showChampionshipStageModal(stageSummary);
        return;
      }
    }

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
      const winnerTime =
        winner && winner.finishTime
          ? winner.finishTime
          : this.raceElapsedSeconds * 1000;
      totalTimeEl.textContent = UI.formatLapTime(winnerTime);
    }

    const bestLapEl = document.getElementById("res-best-lap");
    if (bestLapEl) {
      bestLapEl.textContent = this.player.bestLapTime
        ? UI.formatLapTime(this.player.bestLapTime)
        : "--:--.---";
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
          const isHost =
            typeof NetworkEngine !== "undefined" &&
            NetworkEngine.hostId &&
            r.id === NetworkEngine.hostId;

          const highlight = isMe
            ? "bg-amber-400/20 border-amber-400/60 shadow-md shadow-amber-500/10"
            : isHost
              ? "bg-amber-500/10 border-amber-400/30"
              : "bg-slate-900/80 border-white/10";

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
            const finishMs = r.finishTime || this.raceElapsedSeconds * 1000;
            timeGapStr = `<span class="font-black text-emerald-400 font-racing">${UI.formatLapTime(finishMs)}</span>`;
          } else if (r.finished && winner && winner.finishTime) {
            const gapSec = ((r.finishTime - winner.finishTime) / 1000).toFixed(
              3,
            );
            timeGapStr = `<span class="font-bold text-amber-300 font-racing">+${Number(gapSec) > 0 ? gapSec : "0.000"}s</span>`;
          } else {
            if (r.lap && r.lap < this.totalLaps) {
              const lapsDown = this.totalLaps - Math.min(this.totalLaps, r.lap);
              timeGapStr = `<span class="font-bold text-slate-400 font-racing">+${lapsDown} ${lapsDown === 1 ? "GIRO" : "GIRI"}</span>`;
            } else {
              const pDiff = Math.max(
                0,
                (winner ? winner.totalProgress : 0) - (r.totalProgress || 0),
              );
              const secEst = (
                (pDiff * (this.trackData ? this.trackData.totalLength : 1000)) /
                Math.max(22, r.speed || 30)
              ).toFixed(1);
              timeGapStr = `<span class="text-slate-400 font-racing">+${secEst}s (In pista)</span>`;
            }
          }

          // Badge Tipologia Pilota
          let typePill = "";
          if (isMe) {
            typePill =
              '<span class="px-2 py-0.5 rounded text-[9px] font-racing font-black bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">TU (PILOTA)</span>';
          } else if (isRemote) {
            if (isHost) {
              typePill =
                '<span class="px-2 py-0.5 rounded text-[9px] font-racing font-black bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1"><i class="fa-solid fa-crown text-[8px]"></i>HOST LAN</span>';
            } else {
              typePill =
                '<span class="px-2 py-0.5 rounded text-[9px] font-racing font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">LAN PILOTA</span>';
            }
          } else {
            typePill =
              '<span class="px-1.5 py-0.5 rounded text-[9px] font-racing font-bold bg-slate-800 text-slate-400 border border-white/10">CPU F1</span>';
          }

          // Giro veloce badge
          const bestLapStr = r.bestLapTime
            ? UI.formatLapTime(r.bestLapTime)
            : "--:--.---";
          const isFastestHolder =
            sessionFastestDriver && r.bestLapTime === sessionFastestLap;
          const fastestBadge = isFastestHolder
            ? '<span class="px-1.5 py-0.2 rounded text-[8px] font-racing font-black bg-purple-500/30 text-purple-300 border border-purple-400/40 flex items-center gap-1 animate-pulse"><i class="fa-solid fa-bolt text-[7px]"></i>RECORD</span>'
            : "";

          const hexColor = r.teamColorHex
            ? "#" + Number(r.teamColorHex).toString(16).padStart(6, "0")
            : "#00f0ff";
          const carName = r.carConfig ? r.carConfig.name : "Vettura da gara";

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
        btnRematch.innerHTML =
          '<i class="fa-solid fa-users mr-1.5"></i><span>TORNA ALLA LOBBY LAN</span>';
        btnRematch.onclick = () => {
          RaceEngine.quitToMenu();
          UI.switchTab("multiplayer");
        };
      } else {
        btnRematch.innerHTML =
          '<i class="fa-solid fa-rotate-right mr-1.5"></i><span>RIVINCITA GP</span>';
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
