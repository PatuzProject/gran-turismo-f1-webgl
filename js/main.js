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

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
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

  clearScene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.clearBrakeDiscs();
      // Reinizializza il post-processing dopo aver svuotato la scena,
      // altrimenti il EffectComposer mantiene riferimenti stale e lo schermo
      // diventa nero durante la gara.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      if (GraphicsEngine.composer) {
        GraphicsEngine.composer.dispose ? GraphicsEngine.composer.dispose() : null;
        GraphicsEngine.composer = null;
      }
      GraphicsEngine.initPostProcessing(this.scene, this.camera, pixelRatio);
      GraphicsEngine.setupSunLight(this.scene, new THREE.Vector3(120, 220, 90));
    } else {
      const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x38422d, 0.65);
      const sun = new THREE.DirectionalLight(0xfff5e6, 1.25);
      sun.position.set(120, 220, 90);
      sun.castShadow = true;
      this.scene.add(hemiLight, sun);
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
      GraphicsEngine.configureAtmosphericFog(
        this.scene,
        0xb9e8f2,
        0.00008,
        0.5,
      );
      GraphicsEngine.applyHeightFog(this.scene);
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

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(0.04, this.clock.getDelta());

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
  },
};

window.onload = function () {
  GameApp.init();
};
