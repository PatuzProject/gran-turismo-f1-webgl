"use strict";

/**
 * =============================================================================
 * MOTOR AUDIO PROCEDURALE AD ALTA FEDELTÀ (PHYSICAL DSP RACING ENGINE)
 * =============================================================================
 * Ispirato fedelmente ai video On-Board e Pure Engine Sound delle auto da
 * competizione su YouTube (TCR Touring, V8 Supercar, GT3 Cup, F1/V12 Prototype).
 *
 * Include:
 * 1. Sintesi armonica di combustione calcolata sui cilindri reali (I4, V8, F6, V12)
 * 2. Fischio del cambio sequenziale a denti dritti (Straight-Cut Dog-Ring Gearbox)
 * 3. Fischio turbo e sfiato wastegate ("stu-tu-tu-tu" compressor surge flutter)
 * 4. Botti di cambiata per taglio accensione (Flat-Shift Ignition Cut BANG)
 * 5. Scoppi e scoppiettii in rilascio (Exhaust Overrun Crackles)
 * 6. Limitatore di giri a rimbalzo (Spark-Cut Rev Limiter Bouncing)
 * 7. Saturazione e compressione acustica non lineare (WaveShaper Soft-Clipping)
 * 8. Doppio strato sonoro pneumatici (Grip Scrub a bassa freq + Skid Squeal)
 * =============================================================================
 */

const CAR_SOUND_PROFILES = {
  hatchback: {
    name: "CIVIC TYPE-GT (TCR 2.0L Turbo I4)",
    cylinders: 4,
    firingMult: 4 / 2, // 2 scoppi per giro albero: RPM / 30
    idleFreq: 28.3,
    subGain: 0.22,
    harm2Gain: 0.65,
    harm3Gain: 0.42,
    harm4Gain: 0.25,
    resonanceFreq: 1950,
    filterQ: 2.5,
    saturationDrive: 4.5,
    gearWhineFactor: 0.22, // Fischio denti dritti TCR
    hasTurbo: true,
    turboSpoolMax: 3400,
    bovFlutter: true,
    shiftPopVol: 0.55,
    overrunPops: true,
    backfireProbability: 0.35, // Scoppiettii in rilascio moderati (turbo I4)
    realInspiration: "Honda Civic Type R FL5 TCR • Campionato TCR World Tour",
  },
  muscle: {
    name: "STALLION V8 500 (5.0L Crossplane V8)",
    cylinders: 8,
    firingMult: 8 / 2, // 4 scoppi per giro: RPM / 15
    idleFreq: 45.3,
    subGain: 0.75, // Battito irregolare crossplane a bassa frequenza (sub-bass rumble)
    harm2Gain: 0.78,
    harm3Gain: 0.52,
    harm4Gain: 0.35,
    resonanceFreq: 1150,
    filterQ: 3.5,
    saturationDrive: 7.2, // Ruggito baritonale profondo e cupo
    gearWhineFactor: 0.12,
    hasTurbo: false,
    bovFlutter: false,
    shiftPopVol: 0.75,
    overrunPops: true,
    backfireProbability: 0.6, // V8 crossplane: scoppi profondi e frequenti in rilascio
    realInspiration: "Ford Mustang GT3 / Supercars V8 • Bathurst 1000 & Daytona",
  },
  gt_comp: {
    name: "APEX GT3 RS (4.2L Flat-6 GT3)",
    cylinders: 6,
    firingMult: 6 / 2, // 3 scoppi per giro: RPM / 20
    idleFreq: 45.0,
    subGain: 0.25,
    harm2Gain: 0.92, // Urlo metallico Flat-6
    harm3Gain: 0.75,
    harm4Gain: 0.50,
    resonanceFreq: 2800,
    filterQ: 4.8,
    saturationDrive: 5.8,
    gearWhineFactor: 0.48, // L'iconico fischio stridente a denti dritti da onboard Porsche GT3 Cup
    hasTurbo: false,
    bovFlutter: false,
    shiftPopVol: 0.90, // Esplosione secca da taglio accensione "CRACK"
    overrunPops: true,
    backfireProbability: 0.45, // Flat-6 GT3: crackle secco e ritmico
    realInspiration: "Porsche 911 GT3 R (992) • 24 Ore di Spa & Nürburgring Nordschleife",
  },
  hypercar: {
    name: "VALKYRIE X-PROTO (6.5L V12 Cosworth F1 Prototype)",
    cylinders: 12,
    firingMult: 12 / 2, // 6 scoppi per giro: RPM / 10
    idleFreq: 100.0, // A 11.000 RPM genera 1.100 Hz di frequenza fondamentale urlante!
    subGain: 0.18,
    harm2Gain: 0.98,
    harm3Gain: 0.88,
    harm4Gain: 0.72,
    resonanceFreq: 3600,
    filterQ: 6.0,
    saturationDrive: 6.5,
    gearWhineFactor: 0.52, // Fischio ipersonico cambio sequenziale + sibilo KERS elettrico
    hasTurbo: true,
    turboSpoolMax: 4800,
    bovFlutter: false,
    shiftPopVol: 1.0, // Schioppo sonico impressionante
    overrunPops: true,
    backfireProbability: 0.22, // V12 aspirato ad alto regime: pop più rari ma secchi
    realInspiration: "Aston Martin Valkyrie AMR Pro • Cosworth V12 11.000 RPM Silverstone",
  },
};

const AudioEngine = {
  ctx: null,
  isMuted: false,
  masterGain: null,

  // 1. Gruppo Combustione Motore
  engineGain: null,
  engineBangGain: null, // Nodo volume dedicato al "bang" di cambiata (isola il duck dall'automazione per-frame)
  distortionNode: null,
  exhaustFilter: null,
  combustionOsc1: null, // Fondamentale f0
  combustionOsc2: null, // 2a armonica (f0 * 2)
  combustionOsc3: null, // 3a/4a armonica metallica
  subRumbleOsc: null,   // Sub-ottava (f0 / 2)
  gainOsc1: null,
  gainOsc2: null,
  gainOsc3: null,
  gainSub: null,

  // 2. Cambio Sequenziale a Denti Dritti (Straight-Cut Transmission Whine)
  gearWhineOsc: null,
  gearWhineFilter: null,
  gearWhineGain: null,

  // 3. Gruppo Turbo & Wastegate Flutter
  turboSpoolOsc: null,
  turboSpoolFilter: null,
  turboSpoolGain: null,
  noiseBuffer: null,

  // 4. Pneumatici (Scrubbing + Skid Squeal)
  screechNode: null,
  screechFilter: null,
  screechGain: null,
  tireRumbleNode: null,
  tireRumbleFilter: null,
  tireRumbleGain: null,

  // 5. Scia Aerodinamica & Vuoto d'Aria (Slipstream Wake & Buffeting)
  draftNode: null,
  draftFilter: null,
  draftGain: null,

  // Telemetria stato interno
  activeProfileKey: "hatchback",
  prevThrottle: 0,
  prevRPM: 1000,
  prevGear: 1,
  lastShiftBangTime: 0,
  revLimiterPhase: 0,
  previewTimer: null,

  // Cache di scheduling: evita di ri-schedulare ogni frame parametri costanti
  // (es. Q del filtro scarico legato al profilo) accumulando eventi sulla timeline.
  _lastScheduledProfileKey: null,
  _paramCache: null,

  // ---------------------------------------------------------------------------
  // INIZIALIZZAZIONE GRAPH AUDIO WEB AUDIO API
  // ---------------------------------------------------------------------------
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();

    // Master Output Bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);

    // Buffer di rumore bianco per sfiati turbo, scoppi e gomme
    this.initNoiseBuffer();

    // Saturatore Analogico (WaveShaper Soft-Clipping Saturation)
    this.distortionNode = this.ctx.createWaveShaper();
    this.distortionNode.curve = this.makeDistortionCurve(35);
    this.distortionNode.oversample = "4x";

    // Filtro Risonante dello Scarico
    this.exhaustFilter = this.ctx.createBiquadFilter();
    this.exhaustFilter.type = "lowpass";
    this.exhaustFilter.frequency.value = 450;
    this.exhaustFilter.Q.value = 3.2;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    // Nodo dedicato al taglio di accensione in cambiata ("spark cut bang").
    // È separato da engineGain così il duck momentaneo non entra in conflitto con
    // l'automazione del volume motore ri-schedulata ad ogni frame da updateTelemetryAudio.
    this.engineBangGain = this.ctx.createGain();
    this.engineBangGain.gain.value = 1.0;

    // Bus di miscelazione oscillatori di combustione
    const combustionBus = this.ctx.createGain();
    combustionBus.gain.value = 1.0;

    // 1. Oscillatore Fondamentale (Sawtooth con dentellatura ad alta compressione)
    this.combustionOsc1 = this.ctx.createOscillator();
    this.combustionOsc1.type = "sawtooth";
    this.gainOsc1 = this.ctx.createGain();
    this.combustionOsc1.connect(this.gainOsc1);
    this.gainOsc1.connect(combustionBus);

    // 2. Seconda Armonica (Triangle / Sawtooth detuned per naturale effetto coro dei cilindri)
    this.combustionOsc2 = this.ctx.createOscillator();
    this.combustionOsc2.type = "sawtooth";
    this.gainOsc2 = this.ctx.createGain();
    this.combustionOsc2.connect(this.gainOsc2);
    this.gainOsc2.connect(combustionBus);

    // 3. Armonica Metallica Superiore (Cilindri e valvole ad alto regime)
    this.combustionOsc3 = this.ctx.createOscillator();
    this.combustionOsc3.type = "triangle";
    this.gainOsc3 = this.ctx.createGain();
    this.combustionOsc3.connect(this.gainOsc3);
    this.gainOsc3.connect(combustionBus);

    // 4. Sub-Bass Rumble (Battito della bancata a V e vibrazione telaio)
    this.subRumbleOsc = this.ctx.createOscillator();
    this.subRumbleOsc.type = "sine";
    this.gainSub = this.ctx.createGain();
    this.subRumbleOsc.connect(this.gainSub);
    this.gainSub.connect(combustionBus);

    // Connessione catena motore: Bus -> WaveShaper -> Filtro Scarico -> Volume Motore -> Master
    combustionBus.connect(this.distortionNode);
    this.distortionNode.connect(this.exhaustFilter);
    this.exhaustFilter.connect(this.engineGain);
    this.engineGain.connect(this.engineBangGain);
    this.engineBangGain.connect(this.masterGain);

    this.combustionOsc1.start();
    this.combustionOsc2.start();
    this.combustionOsc3.start();
    this.subRumbleOsc.start();

    // -------------------------------------------------------------------------
    // Fischi del Cambio Sequenziale a Denti Dritti (Dog-Ring Gearbox)
    // -------------------------------------------------------------------------
    this.gearWhineOsc = this.ctx.createOscillator();
    this.gearWhineOsc.type = "triangle";

    this.gearWhineFilter = this.ctx.createBiquadFilter();
    this.gearWhineFilter.type = "bandpass";
    this.gearWhineFilter.frequency.value = 1200;
    this.gearWhineFilter.Q.value = 6.0;

    this.gearWhineGain = this.ctx.createGain();
    this.gearWhineGain.gain.value = 0.0;

    this.gearWhineOsc.connect(this.gearWhineFilter);
    this.gearWhineFilter.connect(this.gearWhineGain);
    this.gearWhineGain.connect(this.masterGain);
    this.gearWhineOsc.start();

    // -------------------------------------------------------------------------
    // Fischio Turbo Compressore
    // -------------------------------------------------------------------------
    this.turboSpoolOsc = this.ctx.createOscillator();
    this.turboSpoolOsc.type = "sine";

    this.turboSpoolFilter = this.ctx.createBiquadFilter();
    this.turboSpoolFilter.type = "bandpass";
    this.turboSpoolFilter.frequency.value = 2400;
    this.turboSpoolFilter.Q.value = 4.2;

    this.turboSpoolGain = this.ctx.createGain();
    this.turboSpoolGain.gain.value = 0.0;

    this.turboSpoolOsc.connect(this.turboSpoolFilter);
    this.turboSpoolFilter.connect(this.turboSpoolGain);
    this.turboSpoolGain.connect(this.masterGain);
    this.turboSpoolOsc.start();

    // -------------------------------------------------------------------------
    // Audio Pneumatici (Squeal ad alta frequenza + Scrub asfalto)
    // -------------------------------------------------------------------------
    this.initTireAudio();

    // -------------------------------------------------------------------------
    // Audio Scia Aerodinamica (Turbolenza e Risucchio di Bassa Pressione)
    // -------------------------------------------------------------------------
    this.initSlipstreamAudio();
  },

  initNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2.5;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  },

  initTireAudio() {
    // 1. Skid Squeal (Stridio acuto da derapata/bloccaggio)
    this.screechNode = this.ctx.createBufferSource();
    this.screechNode.buffer = this.noiseBuffer;
    this.screechNode.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = "bandpass";
    this.screechFilter.frequency.value = 1250;
    this.screechFilter.Q.value = 5.2;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    this.screechNode.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.masterGain);
    this.screechNode.start();

    // 2. Texture Scrubbing (Vibrazione sorda del battistrada sull'asfalto)
    this.tireRumbleNode = this.ctx.createBufferSource();
    this.tireRumbleNode.buffer = this.noiseBuffer;
    this.tireRumbleNode.loop = true;

    this.tireRumbleFilter = this.ctx.createBiquadFilter();
    this.tireRumbleFilter.type = "lowpass";
    this.tireRumbleFilter.frequency.value = 280;
    this.tireRumbleFilter.Q.value = 1.8;

    this.tireRumbleGain = this.ctx.createGain();
    this.tireRumbleGain.gain.value = 0.0;

    this.tireRumbleNode.connect(this.tireRumbleFilter);
    this.tireRumbleFilter.connect(this.tireRumbleGain);
    this.tireRumbleGain.connect(this.masterGain);
    this.tireRumbleNode.start();
  },

  initSlipstreamAudio() {
    if (!this.noiseBuffer) return;
    this.draftNode = this.ctx.createBufferSource();
    this.draftNode.buffer = this.noiseBuffer;
    this.draftNode.loop = true;

    this.draftFilter = this.ctx.createBiquadFilter();
    this.draftFilter.type = "bandpass";
    this.draftFilter.frequency.value = 420;
    this.draftFilter.Q.value = 2.4;

    this.draftGain = this.ctx.createGain();
    this.draftGain.gain.value = 0.0;

    this.draftNode.connect(this.draftFilter);
    this.draftFilter.connect(this.draftGain);
    this.draftGain.connect(this.masterGain);
    this.draftNode.start();
  },

  makeDistortionCurve(k = 30) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      // Soft-clipping sigmoidale asimmetrico: esalta le armoniche pari dello scarico da corsa
      curve[i] = Math.tanh(x * (1 + k * 0.12)) * 0.88 + (x > 0 ? x * x * 0.12 : 0);
    }
    return curve;
  },

  setDrivingAudioActive(active) {
    this.init();
    if (!this.ctx || !this.engineGain) return;
    const now = this.ctx.currentTime;
    if (active) {
      this.engineGain.gain.setTargetAtTime(0.32, now, 0.08);
      // Riallinea il nodo bang: nessun duck residuo all'avvio dell'audio di guida.
      if (this.engineBangGain) this.engineBangGain.gain.setValueAtTime(1.0, now);
    } else {
      this.engineGain.gain.setTargetAtTime(0.0, now, 0.06);
      if (this.gearWhineGain) this.gearWhineGain.gain.setTargetAtTime(0.0, now, 0.04);
      if (this.turboSpoolGain) this.turboSpoolGain.gain.setTargetAtTime(0.0, now, 0.04);
      if (this.screechGain) this.screechGain.gain.setTargetAtTime(0.0, now, 0.04);
      if (this.tireRumbleGain) this.tireRumbleGain.gain.setTargetAtTime(0.0, now, 0.04);
      if (this.draftGain) this.draftGain.gain.setTargetAtTime(0.0, now, 0.04);
    }
  },

  // Limite di giri (RPM) per vettura: unica fonte di verità (telemetria + anteprima).
  // Nota: i valori sono RPM, non Hz; il nome riflette il dato reale.
  _getRedlineRPM(carId) {
    return carId === "hypercar" ? 11000 : carId === "gt_comp" ? 8800 : carId === "muscle" ? 7000 : 8200;
  },

  // Schedula un AudioParam solo se il target è realmente cambiato rispetto all'ultimo
  // invio: evita di accumulare sulla timeline eventi identici ad ogni frame.
  // Il risultato udibile è invariato (stesso target, stesso time constant).
  _scheduleIfChanged(id, param, value, now, timeConstant) {
    if (!this._paramCache) this._paramCache = {};
    const prev = this._paramCache[id];
    if (prev !== undefined && Math.abs(prev - value) < 1e-4) return;
    this._paramCache[id] = value;
    param.setTargetAtTime(value, now, timeConstant);
  },

  // DSP condiviso della scia aerodinamica (usato sia dal percorso telemetria che da updateSlipstream).
  _applySlipstreamDSP(draftIntensity, speedAbs, now) {
    if (!this.draftGain || !this.draftFilter) return;
    const clampedDraft = Math.min(1.0, Math.max(0.0, draftIntensity || 0));
    const targetDraftGain = clampedDraft > 0.05
      ? Math.min(0.40, clampedDraft * 0.36 * Math.min(1.0, speedAbs / 28))
      : 0.0;
    this.draftGain.gain.setTargetAtTime(targetDraftGain, now, 0.035);
    const targetFilterFreq = 360 + clampedDraft * 520 + (speedAbs / 70) * 160;
    this.draftFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.045);
  },

  // ---------------------------------------------------------------------------
  // AGGIORNAMENTO DINAMICO TELEMETRIA IN PISTA (CHIAMATO 60 VOLTE AL SECONDO)
  // ---------------------------------------------------------------------------
  updateTelemetryAudio(rpm, throttle, screechIntensity, carIdentifier = "hatchback", speed = 0, gear = 1, dt = 0.016, draftIntensity = 0) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Risoluzione profilo vettura
    let profileKey = "hatchback";
    if (typeof carIdentifier === "string" && CAR_SOUND_PROFILES[carIdentifier]) {
      profileKey = carIdentifier;
    } else if (typeof carIdentifier === "number") {
      const keys = ["hatchback", "muscle", "gt_comp", "hypercar"];
      profileKey = keys[carIdentifier] || "hatchback";
    }
    this.activeProfileKey = profileKey;
    const prof = CAR_SOUND_PROFILES[profileKey];

    // Limiti RPM della vettura
    const idleRPM = 800;
    const redlineRPM = this._getRedlineRPM(profileKey);
    const rpmClamped = Math.max(idleRPM, Math.min(redlineRPM + 200, rpm || idleRPM));
    const rpmNorm = (rpmClamped - idleRPM) / (redlineRPM - idleRPM);
    const speedAbs = Math.abs(speed || 0);

    // =========================================================================
    // 1. FISICA DELLA COMBUSTIONE (CALCOLO FREQUENZE DAI CILINDRI)
    // =========================================================================
    // Frequenza fondamentale di accensione: (RPM / 60) * (cilindri / 2)
    const baseFreq = Math.max(20, (rpmClamped / 60) * prof.firingMult);

    this._scheduleIfChanged("comb1Hz", this.combustionOsc1.frequency, baseFreq, now, 0.022);
    // 2a armonica con micro-detuning per battimento naturale dei gas di scarico
    this._scheduleIfChanged("comb2Hz", this.combustionOsc2.frequency, baseFreq * 2.004, now, 0.022);
    // 3a armonica (o 4a per i V8) per raspacustico
    const harm3Mult = prof.cylinders === 8 ? 4.01 : 3.01;
    this._scheduleIfChanged("comb3Hz", this.combustionOsc3.frequency, baseFreq * harm3Mult, now, 0.022);
    // Sub-ottava profonda per il baritono V8 e bassi
    this._scheduleIfChanged("subHz", this.subRumbleOsc.frequency, baseFreq * 0.5, now, 0.022);

    // Bilanciamento volumi armoniche
    this._scheduleIfChanged("gainOsc1", this.gainOsc1.gain, 0.55 + throttle * 0.25, now, 0.03);
    this._scheduleIfChanged("gainOsc2", this.gainOsc2.gain, prof.harm2Gain * (0.6 + throttle * 0.4), now, 0.03);
    this._scheduleIfChanged("gainOsc3", this.gainOsc3.gain, prof.harm3Gain * (0.4 + rpmNorm * 0.6), now, 0.03);
    this._scheduleIfChanged("gainSub", this.gainSub.gain, prof.subGain * (0.7 + (1 - rpmNorm) * 0.3), now, 0.03);

    // =========================================================================
    // 2. FILTRO SCARICO & SATURAZIONE NON LINEARE
    // =========================================================================
    // A basso regime lo scarico è cupo; aprendo il gas e salendo di giri si apre fino a 4-6 kHz
    const filterCutoff = prof.resonanceFreq * (0.35 + rpmNorm * 1.45 + throttle * 0.7);
    this._scheduleIfChanged("exhCutoff", this.exhaustFilter.frequency, Math.min(18000, filterCutoff), now, 0.025);
    // Q del filtro: costante di profilo, schedulata solo al cambio vettura (non ogni frame).
    if (this._lastScheduledProfileKey !== profileKey) {
      this._lastScheduledProfileKey = profileKey;
      this.exhaustFilter.Q.setTargetAtTime(prof.filterQ, now, 0.03);
    }

    // Limitatore di giri a rimbalzo (Spark-Cut Rev Limiter Bouncing)
    const isAtLimiter = rpmClamped >= redlineRPM - 40;
    let masterEngineVol = 0.22 + throttle * 0.18 + rpmNorm * 0.12;

    if (isAtLimiter && throttle > 0.4) {
      this.revLimiterPhase += (dt || 0.016) * 26.0; // 26 Hz stutter
      const stutter = Math.sin(this.revLimiterPhase * Math.PI * 2) > 0 ? 1.0 : 0.22;
      masterEngineVol *= stutter;
      if (Math.random() < 0.25) {
        this.playPopSound(now, 0.45);
      }
    }
    this.engineGain.gain.setTargetAtTime(masterEngineVol, now, 0.035);

    // =========================================================================
    // 3. CAMBIO SEQUENZIALE A DENTI DRITTI (STRAIGHT-CUT GEARBOX WHINE)
    // =========================================================================
    if (this.gearWhineGain) {
      // Frequenza proporzionale a velocità e marcia
      const currentGearNum = typeof gear === "number" && gear >= 1 ? gear : 1;
      const whineFreq = Math.max(180, speedAbs * 32.5 + currentGearNum * 42.0);
      this._scheduleIfChanged("gearWhineOscHz", this.gearWhineOsc.frequency, whineFreq, now, 0.02);
      this._scheduleIfChanged("gearWhineFilterHz", this.gearWhineFilter.frequency, whineFreq, now, 0.02);

      const whineVol = prof.gearWhineFactor * Math.min(1.0, speedAbs / 55.0) * (0.35 + throttle * 0.65);
      this.gearWhineGain.gain.setTargetAtTime(whineVol, now, 0.04);
    }

    // =========================================================================
    // 4. FISCHIO TURBO & SFIATO WASTEGATE FLUTTER ("STU-TU-TU-TU")
    // =========================================================================
    if (prof.hasTurbo && this.turboSpoolGain) {
      const turboBoost = Math.max(0, throttle * 0.8 + rpmNorm * 0.5);
      const spoolFreq = 1600 + turboBoost * (prof.turboSpoolMax - 1600);
      this._scheduleIfChanged("turboOscHz", this.turboSpoolOsc.frequency, spoolFreq, now, 0.06);
      this._scheduleIfChanged("turboFilterHz", this.turboSpoolFilter.frequency, spoolFreq, now, 0.06);
      this.turboSpoolGain.gain.setTargetAtTime(turboBoost * 0.18, now, 0.05);

      // Rileva rilascio rapido del gas ad alto regime: innesca il celebre sfiato wastegate!
      if (prof.bovFlutter && this.prevThrottle > 0.65 && throttle < 0.15 && this.prevRPM > 4200) {
        this.playTurboBlowOffFlutter(0.9);
      }
    }

    // =========================================================================
    // 5. SCOPPIETTI IN RILASCIO (EXHAUST OVERRUN CRACKLES)
    // =========================================================================
    if (prof.overrunPops && this.prevThrottle > 0.4 && throttle === 0 && rpmNorm > 0.45) {
      // Robustezza: se il profilo non definisce backfireProbability, fallback a 0.35
      const backfireProb = (typeof prof.backfireProbability === "number" ? prof.backfireProbability : 0.35) * 0.35;
      if (Math.random() < backfireProb) {
        this.playPopSound(now, 0.38);
      }
    }

    // =========================================================================
    // 6. AUDIO PNEUMATICI (GRIP SCRUB + SKID SQUEAL)
    // =========================================================================
    const clampedScreech = Math.min(1.0, Math.max(0.0, screechIntensity || 0));
    if (this.screechGain && this.tireRumbleGain) {
      // 1. Squeal stridente acuto
      this.screechGain.gain.setTargetAtTime(clampedScreech * 0.28, now, 0.035);
      this._scheduleIfChanged("screechFilterHz", this.screechFilter.frequency, 1100 + clampedScreech * 750, now, 0.04);

      // 2. Scrub sordo del battistrada sull'asfalto
      const scrubLevel = clampedScreech > 0.15 ? Math.min(1.0, clampedScreech * 1.4) : 0;
      this.tireRumbleGain.gain.setTargetAtTime(scrubLevel * 0.22, now, 0.035);
      this._scheduleIfChanged("tireRumbleFilterHz", this.tireRumbleFilter.frequency, 220 + scrubLevel * 140, now, 0.04);
    }

    // =========================================================================
    // 7. FRUSCIO AERODINAMICO & RISUCCHIO SCIA (SLIPSTREAM DSP)
    // =========================================================================
    this._applySlipstreamDSP(draftIntensity, speedAbs, now);

    this.prevThrottle = throttle;
    this.prevRPM = rpmClamped;
    this.prevGear = gear;
  },

  updateSlipstream(draftIntensity, speed = 0) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Riusa la stessa DSP del percorso telemetria (nessuna duplicazione).
    this._applySlipstreamDSP(draftIntensity, Math.abs(speed || 0), now);
  },

  // ---------------------------------------------------------------------------
  // BOTTO DI CAMBIATA CON TAGLIO ACCENSIONE (FLAT-SHIFT IGNITION CUT BANG)
  // ---------------------------------------------------------------------------
  playGearShiftBang(carIdentifier) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShiftBangTime < 0.22) return;
    this.lastShiftBangTime = now;

    let profileKey = typeof carIdentifier === "string" ? carIdentifier : this.activeProfileKey;
    const prof = CAR_SOUND_PROFILES[profileKey] || CAR_SOUND_PROFILES.gt_comp;
    const vol = prof.shiftPopVol || 0.65;

    // 1. Scoppio secco transient ad alta frequenza (unburnt fuel explosion)
    this.playNoiseBurst(now, 0.075, 2400, vol * 0.45);

    // 2. Thump sordo nei collettori (85 Hz)
    this.playTone(82, 0.08, "sawtooth", vol * 0.55);

    // 3. Micro-taglio di accensione da 60ms (spark cut) sul volume motore.
    //    Applichiamo il duck su engineBangGain, un nodo gain dedicato inserito tra
    //    engineGain e masterGain: così NON tocchiamo engineGain.gain, il cui valore è
    //    ri-schedulato ad ogni frame da updateTelemetryAudio (evitando cancelScheduledValues
    //    che azzererebbe l'automazione fluida del volume motore causando glitch).
    if (this.engineBangGain) {
      const bg = this.engineBangGain.gain;
      bg.cancelScheduledValues(now);
      bg.setValueAtTime(0.12, now);
      bg.setTargetAtTime(1.0, now + 0.06, 0.02);
    }
  },

  // ---------------------------------------------------------------------------
  // SFIATO WASTEGATE A FARFALLA ("STU-TU-TU-TU" COMPRESSOR SURGE)
  // ---------------------------------------------------------------------------
  playTurboBlowOffFlutter(intensity = 1.0) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const flutterCount = 5;
    const burstInterval = 0.048; // ~20 Hz flutter

    for (let i = 0; i < flutterCount; i++) {
      const decay = Math.pow(0.66, i) * intensity;
      const t = now + i * burstInterval;
      this.playNoiseBurst(t, 0.042, 1600 + i * 180, decay * 0.32);
    }
  },

  // ---------------------------------------------------------------------------
  // MINI-POP IN RILASCIO (EXHAUST BURBLE)
  // ---------------------------------------------------------------------------
  playPopSound(time, vol = 0.35) {
    if (!this.ctx || this.isMuted) return;
    const t = time || this.ctx.currentTime;
    this.playNoiseBurst(t, 0.038, 1400 + Math.random() * 800, vol * 0.28);
    this.playTone(95 + Math.random() * 35, 0.045, "triangle", vol * 0.35);
  },

  playNoiseBurst(startTime, duration, centerFreq, volume) {
    if (!this.noiseBuffer || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.offset = Math.random() * 1.5;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.setValueAtTime(centerFreq, startTime);
    bpf.Q.setValueAtTime(4.5, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(bpf);
    bpf.connect(gain);
    gain.connect(this.masterGain);

    src.start(startTime);
    src.stop(startTime + duration);
  },

  // ---------------------------------------------------------------------------
  // ANTEPRIMA MOTORE NEL CONCESSIONARIO (TEST SOUND & REV-LIMITER)
  // ---------------------------------------------------------------------------
  previewCarRev(carId, onComplete) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }

    this.setDrivingAudioActive(true);
    const prof = CAR_SOUND_PROFILES[carId] || CAR_SOUND_PROFILES.hatchback;
    const redline = this._getRedlineRPM(carId);
    const idle = 850;

    let simRPM = idle;
    let simThrottle = 0;
    let stage = 0; // 0: idle -> 1: rev up -> 2: limiter bounce -> 3: let-off -> 4: idle
    let elapsed = 0;
    const stepMs = 30;

    this.previewTimer = setInterval(() => {
      elapsed += stepMs / 1000;

      if (elapsed < 0.4) {
        // Idle
        simRPM = idle;
        simThrottle = 0.1;
      } else if (elapsed < 2.0) {
        // Rev up progressivo con gas a fondo
        simThrottle = 1.0;
        const p = (elapsed - 0.4) / 1.6;
        simRPM = idle + Math.pow(p, 1.4) * (redline - idle);
      } else if (elapsed < 3.0) {
        // Limitatore di giri a martello ("BRAP-BRAP-BRAP")
        simThrottle = 1.0;
        simRPM = redline + Math.sin(elapsed * 45) * 120;
      } else if (elapsed < 4.2) {
        // Rilascio gas: scoppi in rilascio e sfiato turbo wastegate
        if (simThrottle > 0.5) {
          if (prof.bovFlutter) this.playTurboBlowOffFlutter(1.0);
          else this.playGearShiftBang(carId);
        }
        simThrottle = 0.0;
        simRPM = Math.max(idle, simRPM - 3800 * (stepMs / 1000));
      } else {
        // Conclusione test
        clearInterval(this.previewTimer);
        this.previewTimer = null;
        this.setDrivingAudioActive(false);
        if (onComplete) onComplete();
        return;
      }

      this.updateTelemetryAudio(simRPM, simThrottle, 0, carId, 0, 1, stepMs / 1000);
    }, stepMs);
  },

  // ---------------------------------------------------------------------------
  // EFFETTI SONORI SECONDARI (UI, IMPATTO, ACQUISTO)
  // ---------------------------------------------------------------------------
  playTone(freq = 600, duration = 0.12, type = "sine", vol = 0.25) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  playUIClick() {
    this.playTone(740, 0.05, "triangle", 0.16);
  },

  playCashPurchase() {
    this.playTone(587.33, 0.08, "sine", 0.24);
    setTimeout(() => this.playTone(880, 0.22, "triangle", 0.32), 75);
  },

  playVictoryFanfare() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.35, "triangle", 0.3);
      }, idx * 150);
    });
  },

  playCollisionImpact(impactSpeedKmh = 30, isBarrier = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastCrashSoundTime || 0) < 0.075) return;
    this.lastCrashSoundTime = now;

    const speedRatio = Math.min(1.0, Math.max(0.05, impactSpeedKmh / 85));
    const intensity = Math.pow(speedRatio, 0.75);

    // 1. Heavy low-frequency thump (sub-bass structural chassis transient: 55-80 Hz)
    const thumpFreq = isBarrier ? 62 : 74;
    const thumpVol = Math.max(0.01, 0.22 + intensity * 0.65);
    this.playTone(thumpFreq, 0.14 + intensity * 0.16, "triangle", thumpVol);

    // 2. Mid-frequency crunch / composite fracture (filtered noise burst)
    const crunchCenter = isBarrier ? 2200 : 1650;
    const crunchVol = Math.max(0.01, 0.25 + intensity * 0.68);
    this.playNoiseBurst(now, 0.08 + intensity * 0.14, crunchCenter, crunchVol);

    // 3. High-velocity shockwave & metallic ringing snap if violent impact (> 40 km/h)
    if (impactSpeedKmh > 38) {
      this.playNoiseBurst(now + 0.012, 0.07, 3400, Math.max(0.01, intensity * 0.45));
      this.playTone(135 + Math.random() * 40, 0.08, "sawtooth", Math.max(0.01, intensity * 0.38));
    }
  },

  playScrapeSound(intensity = 0.5) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastScrapeSoundTime || 0) < 0.065) return;
    this.lastScrapeSoundTime = now;

    const clIntensity = Math.min(1.0, Math.max(0.1, intensity));
    this.playNoiseBurst(now, 0.06, 2800 + Math.random() * 800, Math.max(0.01, clIntensity * 0.28));
    this.playTone(210 + Math.random() * 75, 0.045, "sawtooth", Math.max(0.01, clIntensity * 0.15));
  },

  playCollisionBump() {
    this.playCollisionImpact(30, false);
  },

  playTurboBoost() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.32);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 0.32);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  },

  playSlingshotBoost() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(1850, now + 0.42);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(750, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + 0.42);
    filter.Q.setValueAtTime(3.5, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.46);

    this.playNoiseBurst(now, 0.52, 600, 0.26);
  },

  toggleMute() {
    this.init();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.ctx.currentTime);
    }
    const icon = document.getElementById("icon-audio");
    if (icon) {
      icon.className = this.isMuted
        ? "fa-solid fa-volume-xmark text-sm text-rose-400"
        : "fa-solid fa-volume-high text-sm text-slate-300";
    }
  },
};

window.AudioEngine = AudioEngine;
window.CAR_SOUND_PROFILES = CAR_SOUND_PROFILES;