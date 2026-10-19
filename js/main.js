"use strict";

// =========================================================================
// 7. SHOWROOM 3D & ORCHESTRATORE PRINCIPALE DELL'APPLICAZIONE
// =========================================================================
const GameApp = {
  scene: null,
  camera: null,
  renderer: null,
  clock: null,
  profile: null,

  showroomGroup: null,
  showroomCarMesh: null,
  showroomTurntableAngle: 0.55,
  isDraggingShowroom: false,
  lastPointerX: 0,
  selectedCarId: "hatchback",

  init() {
    this.profile = StorageManager.load();
    if (this.profile.equippedCar) {
      this.selectedCarId = this.profile.equippedCar;
    }
    GraphicsEngine.loadExternalCarModel(
      "hatchback",
      "assets/models/hatchback.glb",
    );
    GraphicsEngine.loadExternalCarModel(
      "hypercar",
      "assets/models/hypercar.glb",
    );
    const container = document.getElementById("webgl-container");
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      2200,
    );

    // Nota: con EffectComposer (Three.js r128) il render avviene sempre su
    // WebGLRenderTarget interni senza MSAA, quindi `antialias: true` non
    // smussa nulla ma alloca un framebuffer multisample del default framebuffer:
    // costo GPU/memoria a resa invariata. Disattivato insieme a stencil/alpha
    // inutilizzati per alleggerire il contesto WebGL.
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      stencil: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    // Nota: tone mapping, esposizione, outputEncoding, shadow map e pixel
    // ratio sono configurati da GraphicsEngine.init (unico proprietario),
    // che viene invocato subito dopo e sovrascriveva questi valori duplicati.
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    // Inizializza GraphicsEngine (PBR Shading, IBL, EffectComposer, Post-Processing)
    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.init(this.renderer, this.scene, this.camera);
    }

    window.addEventListener("resize", () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (typeof GraphicsEngine !== "undefined") {
        GraphicsEngine.resize(w, h);
      }
    });

    const domElem = document.body;
    domElem.addEventListener("pointerdown", (e) => {
      if (RaceEngine.isActive) return;
      if (
        e.target.closest("button") ||
        e.target.closest("nav") ||
        e.target.closest("header")
      )
        return;
      this.isDraggingShowroom = true;
      this.lastPointerX = e.clientX;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.isDraggingShowroom || RaceEngine.isActive) return;
      const dx = e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
      this.showroomTurntableAngle += dx * 0.008;
    });
    window.addEventListener("pointerup", () => {
      this.isDraggingShowroom = false;
    });

    RaceEngine.initControls();
    this.setupShowroomScene();
    UI.init();

    this.animate();
  },

  clearScene(preserve) {
    // Libera la memoria GPU di tutta la scena prima di rimuoverla: la sola
    // scene.remove() lasciava geometrie, materiali e texture allocati nel
    // renderer, causando un leak ad ogni transizione showroom ↔ gara.
    const scene = this.scene;
    const keep = typeof preserve === "function" ? preserve : () => false;
    const mapSlots = [
      "map",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "emissiveMap",
      "envMap",
      "alphaMap",
      "aoMap",
      "lightMap",
      "bumpMap",
      "displacementMap",
    ];

    // Risorse globali condivise e riutilizzate tra scene diverse: non vanno
    // mai liberate qui, perché i cache che le possiedono (ProceduralAssets,
    // loadedModelsCache, proceduralTextures) non le ricreano. Sono invece
    // liberate dai rispettivi proprietari quando vengono sostituite
    // (es. buildAtmosphericSkyAndIBL / initDriftSparkPool).
    const persistent = new Set();
    const collectSlots = (material) => {
      if (!material) return;
      mapSlots.forEach((slot) => {
        if (material[slot]) persistent.add(material[slot]);
      });
    };
    const registerResources = (root) => {
      if (!root || typeof root.traverse !== "function") return;
      root.traverse((node) => {
        if (node.geometry) persistent.add(node.geometry);
        if (Array.isArray(node.material)) {
          node.material.forEach((material) => {
            persistent.add(material);
            collectSlots(material);
          });
        } else if (node.material) {
          persistent.add(node.material);
          collectSlots(node.material);
        }
      });
    };

    if (typeof GraphicsEngine !== "undefined") {
      registerResources(GraphicsEngine.skyMesh);
      registerResources(GraphicsEngine.sparkGroup);
      Object.keys(GraphicsEngine.loadedModelsCache || {}).forEach((key) =>
        registerResources(GraphicsEngine.loadedModelsCache[key]),
      );
      Object.keys(GraphicsEngine.proceduralTextures || {}).forEach((key) => {
        if (GraphicsEngine.proceduralTextures[key]) {
          persistent.add(GraphicsEngine.proceduralTextures[key]);
        }
      });
      if (GraphicsEngine.currentEnvMap) {
        persistent.add(GraphicsEngine.currentEnvMap);
      }
    }
    if (typeof ProceduralAssets !== "undefined") {
      Object.keys(ProceduralAssets.geoCache || {}).forEach((key) =>
        persistent.add(ProceduralAssets.geoCache[key]),
      );
      if (ProceduralAssets.sharedMaterials) {
        Object.keys(ProceduralAssets.sharedMaterials).forEach((key) => {
          const material = ProceduralAssets.sharedMaterials[key];
          persistent.add(material);
          collectSlots(material);
        });
      }
      if (ProceduralAssets.contactShadowTexture) {
        persistent.add(ProceduralAssets.contactShadowTexture);
      }
    }
    // scene.environment è l'IBL PMREM: viene ricreato da
    // buildAtmosphericSkyAndIBL, quindi non lo liberiamo da qui.
    if (scene.environment) persistent.add(scene.environment);

    const isShared = (resource) =>
      Boolean(resource) && (persistent.has(resource) || keep(resource));

    const remoteMeshes = new Set();
    if (typeof remotePlayers !== "undefined") {
      Object.keys(remotePlayers).forEach((id) => {
        const mesh = remotePlayers[id] && remotePlayers[id].mesh;
        if (mesh) remoteMeshes.add(mesh);
      });
    }

    const disposeMaterial = (material) => {
      if (!material) return;
      mapSlots.forEach((slot) => {
        const texture = material[slot];
        if (texture && !isShared(texture) && texture.dispose) {
          texture.dispose();
        }
      });
      if (!isShared(material) && material.dispose) material.dispose();
    };

    const disposeObject = (object) => {
      if (!object) return;
      // Ricorsione sui figli (inclusi i THREE.Group) prima del nodo stesso.
      while (object.children && object.children.length > 0) {
        disposeObject(object.children[0]);
        object.remove(object.children[0]);
      }
      if (object.geometry && !isShared(object.geometry) && object.geometry.dispose) {
        object.geometry.dispose();
      }
      if (Array.isArray(object.material)) {
        object.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(object.material);
      }
    };

    while (scene.children.length > 0) {
      const child = scene.children[0];
      // Le mesh remote vengono riutilizzate quando la gara ricrea la scena.
      // Disporle qui lascerebbe la rete con riferimenti a materiali/geometrie
      // inutilizzabili e manterrebbe attive solo le collisioni.
      if (remoteMeshes.has(child)) {
        scene.remove(child);
        continue;
      }
      disposeObject(child);
      scene.remove(child);
    }

    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.clearBrakeDiscs();
      // Riusa il composer esistente invece di distruggerlo e ricrearlo: la
      // ricreazione dei pass/FBO (RenderPass, UnrealBloomPass, ShaderPass) ad
      // ogni transizione showroom ↔ gara causava un hitch visibile all'avvio
      // della sessione. Ora si aggiornano solo scena/camera e dimensioni.
      if (typeof GraphicsEngine.ensurePostProcessing === "function") {
        GraphicsEngine.ensurePostProcessing(this.scene, this.camera);
      } else {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        GraphicsEngine.disposePostProcessing();
        GraphicsEngine.initPostProcessing(this.scene, this.camera, pixelRatio);
      }
      GraphicsEngine.setupSunLight(this.scene, new THREE.Vector3(120, 220, 90));
    } else {
      const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x38422d, 0.65);
      const sun = new THREE.DirectionalLight(0xfff5e6, 1.25);
      sun.position.set(120, 220, 90);
      sun.castShadow = true;
      this.scene.add(hemiLight, sun, sun.target);
    }
  },

  setupShowroomScene() {
    this.clearScene();
    this.scene.background = new THREE.Color(0x070a10);
    this.scene.fog = null;
    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.buildAtmosphericSkyAndIBL(this.scene, {
        skyTop: "#070a10",
        skyBottom: "#27364a",
        groundColor: 0x111722,
      });
    }

    this.showroomGroup = new THREE.Group();
    this.scene.add(this.showroomGroup);

    const spot1 = new THREE.PointLight(0x00f0ff, 1.1, 25);
    spot1.position.set(5, 6, 5);
    const spot2 = new THREE.PointLight(0xe5b842, 1.1, 25);
    spot2.position.set(-5, 6, -4);

    const studioKeyLight = new THREE.DirectionalLight(0xfffbf0, 1.3);
    studioKeyLight.position.set(4, 7, 5);
    studioKeyLight.castShadow = true;
    studioKeyLight.shadow.mapSize.set(1024, 1024);
    studioKeyLight.shadow.bias = -0.0005;

    const studioRimLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
    studioRimLight.position.set(-4, 5, -5);

    this.showroomGroup.add(spot1, spot2, studioKeyLight, studioRimLight);

    const pedestalGeo = new THREE.CylinderGeometry(3.5, 3.8, 0.26, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x111622,
      metalness: 0.7,
      roughness: 0.2,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.13;
    this.showroomGroup.add(pedestal);

    const ringGeo = new THREE.RingGeometry(3.55, 3.72, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.01;
    this.showroomGroup.add(ring);

    const grid = new THREE.GridHelper(60, 60, 0x1e293b, 0x0f172a);
    grid.position.y = -0.25;
    this.showroomGroup.add(grid);

    this.spawnShowroomCar(this.selectedCarId);
    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.configureAtmosphericFog(this.scene, 0xb9e8f2, 0.00008);
    }

    this.camera.fov = 45;
    this.camera.position.set(4.8, 2.25, 6.2);
    this.camera.lookAt(0, 0.65, 0);
    this.camera.updateProjectionMatrix();
  },

  spawnShowroomCar(carId) {
    if (!this.showroomGroup) return;
    if (this.showroomCarMesh) {
      this.showroomGroup.remove(this.showroomCarMesh);
    }
    const carConfig = CAR_CATALOG.find((c) => c.id === carId) || CAR_CATALOG[0];
    this.showroomCarMesh = ProceduralAssets.buildCarMesh(carConfig);
    this.showroomCarMesh.rotation.y = this.showroomTurntableAngle;
    this.showroomGroup.add(this.showroomCarMesh);
  },

  buySelectedCar() {
    const car = CAR_CATALOG.find((c) => c.id === this.selectedCarId);
    if (!car) return;

    if (this.profile.ownedCars.includes(car.id)) {
      UI.showToast("Possiedi già questa vettura nel tuo Garage!", "fa-check");
      return;
    }

    if (this.profile.credits < car.price) {
      UI.showToast(
        "Crediti insufficienti! Vinci gare nel Campionato GP.",
        "fa-coins",
      );
      return;
    }

    this.profile.credits -= car.price;
    this.profile.ownedCars.push(car.id);
    this.profile.equippedCar = car.id;
    StorageManager.save(this.profile);

    AudioEngine.playCashPurchase();
    UI.updateHeaderStats();
    UI.renderShowroomUI();
    UI.showToast(`Hai acquistato ed equipaggiato: ${car.name}!`, "fa-trophy");
  },

  equipSelectedCar() {
    const car = CAR_CATALOG.find((c) => c.id === this.selectedCarId);
    if (!car || !this.profile.ownedCars.includes(car.id)) return;

    this.profile.equippedCar = car.id;
    StorageManager.save(this.profile);
    AudioEngine.playUIClick();
    UI.updateHeaderStats();
    UI.renderShowroomUI();
    UI.showToast(`${car.name} impostata come vettura attiva!`, "fa-car-side");
  },

  confirmResetProfile() {
    this.profile = StorageManager.reset();
    this.selectedCarId = "hatchback";
    UI.closeResetModal();
    AudioEngine.playUIClick();
    UI.updateHeaderStats();
    UI.switchTab("dealership");
    UI.showToast(
      "Profilo resettato: Budget riportato a Cr. 15.000",
      "fa-rotate-left",
    );
  },

  /**
   * Overlay di debug performance (tasto F8). Calcola un FPS interno
   * indipendente dalla gara/showroom e lo mostra insieme ai tempi di
   * update/render e alle draw call fornite da GraphicsEngine.perf.
   */
  updatePerfOverlay(dt, cpuMs) {
    // Clamp del campione: se la tab è stata in background il primo dt può essere
    // enorme e falserebbe la stima FPS (innescando un declassamento spurio).
    const sampleDt = Math.min(dt, 0.1);
    this._perfFrames = (this._perfFrames || 0) + 1;
    this._perfAccum = (this._perfAccum || 0) + sampleDt;
    if (this._perfAccum >= 0.5) {
      this._perfFps = Math.round(this._perfFrames / this._perfAccum);
      this._perfFrames = 0;
      this._perfAccum = 0;
      this.autoAdaptQuality(this._perfFps);
    }

    const el = document.getElementById("perf-debug");
    if (!el || el.classList.contains("hidden")) return;
    const perf =
      (typeof GraphicsEngine !== "undefined" && GraphicsEngine.perf) || {};
    const set = (id, value) => {
      const target = document.getElementById(id);
      const text = String(value);
      if (target && target.textContent !== text) target.textContent = text;
    };
    set("perf-fps", this._perfFps || 0);
    set("perf-update", (typeof cpuMs === "number" ? cpuMs : 0).toFixed(2));
    set("perf-render", (perf.renderMs || 0).toFixed(2));
    set("perf-draw", perf.drawCalls || 0);
    set("perf-tri", perf.triangles || 0);
  },

  /**
   * Auto-adattamento conservativo della qualità: abbassa il livello se gli FPS
   * restano bassi, con cooldown per evitare oscillazioni. Non forza mai il
   * rialzo automatico e non persiste la scelta, così l'impostazione esplicita
   * dell'utente nel profilo resta intatta.
   */
  autoAdaptQuality(fps) {
    // Se l'utente ha scelto manualmente la qualità, l'auto-adattamento tace.
    if (this._autoAdaptDisabled) return;
    if (
      typeof GraphicsEngine === "undefined" ||
      typeof GraphicsEngine.setQuality !== "function" ||
      typeof GraphicsEngine.getQuality !== "function"
    ) {
      return;
    }
    this._adaptCooldown = Math.max(0, (this._adaptCooldown || 0) - 0.5);
    if (this._adaptCooldown > 0) return;

    const order = ["low", "medium", "high"];
    const cur = GraphicsEngine.getQuality() || "high";
    let idx = order.indexOf(cur);
    if (idx < 0) idx = order.length - 1;
    if (fps < 34 && idx > 0) {
      const level = order[idx - 1];
      GraphicsEngine.setQuality(level, { persist: false });
      this._adaptCooldown = 8.0;
      if (typeof UI !== "undefined" && UI.updateGraphicsQualityUI) {
        UI.updateGraphicsQualityUI();
      }
      if (typeof UI !== "undefined" && UI.showToast) {
        UI.showToast(`Qualità ridotta automaticamente a ${level.toUpperCase()}`, "fa-gauge-high");
      }
    }
  },

  animate() {
    requestAnimationFrame(() => this.animate());
    const frameStart = performance.now();
    // `rawDt` (non limitato) serve solo alla stima FPS dell'overlay di debug:
    // il passo di simulazione resta limitato a 40ms per stabilità fisica.
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.04, rawDt);

    // Modalità gara: disattiva i backdrop-filter dei pannelli HUD (guadagno FPS
    // a resa grafica praticamente invariata). Cambia classe solo alla transizione.
    if (this._isRacingClass !== RaceEngine.isActive) {
      this._isRacingClass = RaceEngine.isActive;
      document.documentElement.classList.toggle("racing", RaceEngine.isActive);
    }

    if (RaceEngine.isActive) {
      RaceEngine.update(dt);
    } else if (this.showroomCarMesh) {
      if (!this.isDraggingShowroom) {
        this.showroomTurntableAngle += dt * 0.42;
      }
      this.showroomCarMesh.rotation.y = this.showroomTurntableAngle;
    }

    // Aggiorna interpolazione fluida delle vetture remote multiplayer
    if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
      NetworkEngine.update(dt);
    }

    // Aggiorna stato fotorealistico (CubeCamera riflessioni, disc glow, speed blur)
    if (typeof GraphicsEngine !== "undefined") {
      const player = RaceEngine.isActive ? RaceEngine.player : null;
      const speedKmh = player ? Math.round(Math.abs(player.speed) * 3.6) : 0;
      GraphicsEngine.update(dt, player, speedKmh);
      GraphicsEngine.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Overlay di debug performance (F8) + auto-adattamento qualità
    this.updatePerfOverlay(rawDt, performance.now() - frameStart);
  },
};

window.onload = function () {
  GameApp.init();
};
