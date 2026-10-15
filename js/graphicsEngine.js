"use strict";

/*
 * ARCADE GRAPHICS ENGINE - 60 FPS HIGH-PERFORMANCE EDITION (Three.js r128)
 * - Singolo pass geometrico: usa direttamente la depthTexture del RenderPass
 * - Rimozione di scene.overrideMaterial (dimezza le Draw Call e il carico CPU/GPU)
 * - Post-Processing combinato ad alte prestazioni
 */
const GraphicsEngine = {
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  renderPass: null,
  bloomPass: null,
  speedPass: null,
  sunLight: null,
  fogMaterials: [],
  pmremGenerator: null,
  currentEnvMap: null,
  skyTexture: null,
  skyMesh: null,
  brakeDiscMeshes: [],
  proceduralTextures: {},

  sparkPool: [],
  sparkGroup: null,
  gltfLoader: null,
  loadedModelsCache: {},

  init(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // PixelRatio limitato a max 1.5 per evitare il crollo di FPS su display 4K/HiDPI
    const optimalPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(optimalPixelRatio);

    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();

    this.initAssetLoaders();
    this.generateProceduralMaps();
    this.initPostProcessing(scene, camera, optimalPixelRatio);
  },

  initAssetLoaders() {
    if (typeof THREE.GLTFLoader !== "undefined") {
      this.gltfLoader = new THREE.GLTFLoader();
      if (typeof THREE.DRACOLoader !== "undefined") {
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
        this.gltfLoader.setDRACOLoader(draco);
      }
    }
  },

  loadExternalCarModel(carId, url, onLoaded) {
    if (!this.gltfLoader) return;
    this.gltfLoader.load(
      url,
      (gltf) => {
        this.loadedModelsCache[carId] = gltf.scene;
        if (onLoaded) onLoaded(gltf.scene.clone());
      },
      undefined,
      () => {}
    );
  },

  initPostProcessing(scene, camera, pixelRatio) {
    if (typeof THREE.EffectComposer === "undefined") return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Composer con buffer di default: NO depth texture custom.
    // In Three.js r128 il custom RenderTarget + depthTexture causa un errore
    // WebGL silenzioso nel GTAO ShaderPass (il buffer viene swappato prima
    // che GTAO possa leggerlo) → schermo completamente nero.
    this.composer = new THREE.EffectComposer(this.renderer);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);

    this.renderPass = new THREE.RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Bloom leggero (risoluzione 0.5x per risparmiare GPU)
    if (typeof THREE.UnrealBloomPass !== "undefined") {
      this.bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(Math.floor(width * 0.5), Math.floor(height * 0.5)),
        0.24,
        0.25,
        0.92
      );
      this.composer.addPass(this.bloomPass);
    }

    // Shader unificato: Speed-Lines + Nitro Warp + Arcade Color Grading
    this.speedPass = new THREE.ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uSpeed: { value: 0 },
        uBoost: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uSpeed;
        uniform float uBoost;
        uniform float uTime;
        varying vec2 vUv;

        float hash(float n) { return fract(sin(n) * 43758.5453123); }

        void main() {
          vec2 center = vec2(0.5);
          vec2 ray = center - vUv;
          float dist = length(ray);
          float edge = smoothstep(0.22, 0.78, dist);

          float activeWarp = clamp(uSpeed + uBoost * 0.35, 0.0, 1.2);
          float blur = smoothstep(0.55, 0.98, activeWarp) * edge * 0.015;
          float chroma = smoothstep(0.65, 1.0, activeWarp) * edge * (0.0028 + uBoost * 0.003);

          vec4 c0 = texture2D(tDiffuse, vUv);
          vec4 c1 = texture2D(tDiffuse, vUv + ray * blur * 0.5);
          vec4 c2 = texture2D(tDiffuse, vUv + ray * blur);
          vec3 color = (c0.rgb * 0.5 + c1.rgb * 0.3 + c2.rgb * 0.2);

          if (chroma > 0.0001) {
            color.r = texture2D(tDiffuse, vUv + ray * chroma).r;
            color.b = texture2D(tDiffuse, vUv - ray * chroma).b;
          }

          // Speed-lines radiali Arcade
          float angle = atan(ray.y, ray.x);
          float radialCell = floor((angle + 3.14159265) * 26.0);
          float lineNoise = hash(radialCell + floor(uTime * 22.0));
          float speedLineMask = smoothstep(0.93, 0.995, lineNoise)
                              * smoothstep(0.40, 0.75, dist)
                              * smoothstep(0.72, 1.0, activeWarp);

          vec3 speedLineCol = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.3, 0.8), uBoost);
          color += speedLineCol * speedLineMask * 0.32;

          // Arcade Contrast & Vibrance
          color = clamp(color, 0.0, 1.0);
          color = mix(color, smoothstep(0.02, 0.98, color), 0.35);
          float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(luma), color, 1.30);

          float vignette = 1.0 - smoothstep(0.42, 0.88, dist) * 0.20;
          color *= vignette;

          gl_FragColor = vec4(clamp(color, 0.0, 1.0), c0.a);
        }
      `,
    });
    this.composer.addPass(this.speedPass);
  },


  buildAtmosphericSkyAndIBL(scene, trackConfig) {
    if (this.skyMesh) scene.remove(this.skyMesh);

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    const topCol = (trackConfig && trackConfig.skyTop) ? trackConfig.skyTop : "#061539";
    const botCol = (trackConfig && trackConfig.skyBottom) ? trackConfig.skyBottom : "#1e5799";

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0.0, topCol);
    gradient.addColorStop(0.48, botCol);
    gradient.addColorStop(0.55, "#1a2639");
    gradient.addColorStop(1.0, "#090d16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.encoding = THREE.sRGBEncoding;
    this.skyTexture = texture;

    if (this.pmremGenerator) {
      if (this.currentEnvMap) this.currentEnvMap.dispose();
      this.currentEnvMap = this.pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = this.currentEnvMap;
    }

    this.skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1900, 32, 16),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    scene.add(this.skyMesh);

    this.initDriftSparkPool(scene);
    return this.skyMesh;
  },

  initDriftSparkPool(scene) {
    if (this.sparkGroup) scene.remove(this.sparkGroup);
    this.sparkGroup = new THREE.Group();
    scene.add(this.sparkGroup);
    this.sparkPool = [];

    const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.45);
    const colors = [0xffffff, 0xffea00, 0xff7700, 0x00f0ff, 0xff2a85];

    for (let i = 0; i < 80; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      this.sparkGroup.add(mesh);
      this.sparkPool.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }
  },

  spawnDriftSparks(car, isTurbo) {
    if (!this.sparkPool.length) return;
    const s = this.sparkPool.find((item) => item.life <= 0);
    if (!s) return;

    const side = Math.random() > 0.5 ? 0.95 : -0.95;
    const localTire = new THREE.Vector3(side, 0.08, -1.60);
    if (car && car.mesh) {
      s.mesh.position.copy(car.mesh.localToWorld(localTire));
    } else if (car && car.position) {
      const backDir = new THREE.Vector3(Math.sin(car.heading || 0), 0, Math.cos(car.heading || 0));
      const rightDir = new THREE.Vector3(backDir.z, 0, -backDir.x);
      s.mesh.position
        .copy(car.position)
        .addScaledVector(backDir, -1.60)
        .addScaledVector(rightDir, side);
      s.mesh.position.y += 0.16;
    }

    s.floorY = s.mesh.position.y - 0.04;

    const heading = (car && car.heading) || 0;
    const backX = Math.sin(heading);
    const backZ = Math.cos(heading);
    const speed = (car && car.speed) || 0;

    s.vel.set(
      -backX * (speed * 0.25) + (Math.random() - 0.5) * 6.5,
      2.0 + Math.random() * 4.0,
      -backZ * (speed * 0.25) + (Math.random() - 0.5) * 6.5
    );

    s.mesh.rotation.y = heading;
    s.mesh.material.color.setHex(isTurbo ? 0x00f0ff : 0xffb700);
    s.mesh.material.opacity = 1.0;
    s.mesh.visible = true;
    s.life = 0.25;
  },

  spawnCollisionSparks(pos, normal, count = 8, intensity = 1.0) {
    if (!this.sparkPool || !this.sparkPool.length) return;
    const nX = (normal && normal.x) || 0;
    const nZ = (normal && normal.z) || 0;
    const actualCount = Math.min(count, 14);

    for (let k = 0; k < actualCount; k++) {
      const s = this.sparkPool.find((item) => item.life <= 0);
      if (!s) break;

      s.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.18,
        (pos.y || 0.4) + (Math.random() - 0.5) * 0.14,
        pos.z + (Math.random() - 0.5) * 0.18
      );
      s.floorY = (pos && typeof pos.y === "number") ? pos.y - 0.35 : 0.05;

      const speed = 4.5 + Math.random() * 11.0 * intensity;
      s.vel.set(
        nX * speed + (Math.random() - 0.5) * 6.0,
        2.2 + Math.random() * 6.0 * intensity,
        nZ * speed + (Math.random() - 0.5) * 6.0
      );

      s.mesh.rotation.y = Math.atan2(s.vel.x, s.vel.z);
      // Incandescent titanium/barrier sparks: pure white, fiery gold, vivid orange
      const sparkColors = [0xffffff, 0xfff066, 0xffaa00, 0xff5500];
      s.mesh.material.color.setHex(sparkColors[Math.floor(Math.random() * sparkColors.length)]);
      s.mesh.material.opacity = 1.0;
      s.mesh.visible = true;
      s.life = 0.22 + Math.random() * 0.24;
    }
  },

  updateDriftSparks(dt) {
    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 15.5 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        const floor = typeof s.floorY === "number" ? s.floorY : 0.05;
        if (s.mesh.position.y < floor) {
          s.mesh.position.y = floor;
          s.vel.y *= -0.42;
          s.vel.x *= 0.75;
          s.vel.z *= 0.75;
        }
        s.mesh.material.opacity = Math.max(0, s.life * 3.8);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
  },

  configureAtmosphericFog(scene, color, density) {
    scene.fog = new THREE.FogExp2(new THREE.Color(color || 0x1e293b), Math.min(density || 0.00035, 0.00045));
  },

  applyHeightFog(scene) {
    if (!scene.fog) scene.fog = new THREE.FogExp2(0x1e293b, 0.00035);
  },

  setupPlanarReflection() {},
  bindReflectiveRoad() {},
  updatePlanarReflection() {},

  generateProceduralMaps() {
    const size = 256; // 256x256 si genera istantaneamente e usa 1/16 della VRAM rispetto a 1024
    const normalCanvas = document.createElement("canvas");
    const roughnessCanvas = document.createElement("canvas");
    normalCanvas.width = roughnessCanvas.width = size;
    normalCanvas.height = roughnessCanvas.height = size;
    const normalCtx = normalCanvas.getContext("2d");
    const roughCtx = roughnessCanvas.getContext("2d");
    const normalData = normalCtx.createImageData(size, size);
    const roughData = roughCtx.createImageData(size, size);

    const noise = (x, y) =>
      Math.sin(x * 0.12 + Math.sin(y * 0.04)) * 0.45 +
      Math.sin(y * 0.18 + x * 0.05) * 0.35;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = (noise(x - 1, y) - noise(x + 1, y)) * 0.7;
        const ny = (noise(x, y - 1) - noise(x, y + 1)) * 0.7;
        normalData.data[i] = (nx * 0.5 + 0.5) * 255;
        normalData.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        normalData.data[i + 2] = 255;
        normalData.data[i + 3] = 255;

        const r = Math.max(70, Math.min(220, 170 + noise(x * 2, y * 2) * 25));
        roughData.data[i] = roughData.data[i + 1] = roughData.data[i + 2] = r;
        roughData.data[i + 3] = 255;
      }
    }
    normalCtx.putImageData(normalData, 0, 0);
    roughCtx.putImageData(roughData, 0, 0);

    const normalMap = new THREE.CanvasTexture(normalCanvas);
    const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
    [normalMap, roughnessMap].forEach((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(6, 180);
    });

    this.proceduralTextures = {
      asphaltNormal: normalMap,
      asphaltRoughness: roughnessMap,
      tireNormal: null,
    };
  },

  createCarPaintMaterial(colorHex, isMetallic) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colorHex),
      metalness: isMetallic === false ? 0.35 : 0.82,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.35,
    });
  },

  /**
   * Vetri automobilistici oscurati realistici con clearcoat ad alta riflettività
   */
  createGlassMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x07111e,
      metalness: 0.88,
      roughness: 0.03,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.9,
      envMapIntensity: 1.6,
    });
  },

  setupSunLight(scene, sunPosition) {
    const position = sunPosition || new THREE.Vector3(120, 220, 90);
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.copy(position);
    sun.castShadow = true;
    // Shadow map 1024x1024 con PCFSoftShadowMap: identica resa visiva in corsa ma 4x più veloce di 2048x2048
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 240;
    sun.shadow.camera.left = -75;
    sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75;
    sun.shadow.camera.bottom = -75;
    sun.shadow.bias = -0.0005;
    this.sunLight = sun;

    const hemi = new THREE.HemisphereLight(0x60a5fa, 0x1e293b, 0.5);
    scene.add(sun, hemi);
    return { sun, hemi };
  },

  registerBrakeDisc(mesh) {
    if (this.brakeDiscMeshes.indexOf(mesh) === -1) this.brakeDiscMeshes.push(mesh);
  },

  clearBrakeDiscs() {
    this.brakeDiscMeshes.length = 0;
  },

  update(dt, playerCar, currentSpeedKmh) {
    const isBoost = Boolean(
      playerCar && (playerCar.drsActive || playerCar.turboWasActive)
    );

    if (this.speedPass) {
      this.speedPass.uniforms.uSpeed.value = Math.min(1.15, Math.abs(currentSpeedKmh) / 280);
      this.speedPass.uniforms.uBoost.value = THREE.MathUtils.lerp(
        this.speedPass.uniforms.uBoost.value || 0,
        isBoost ? 1.0 : 0.0,
        dt * 8
      );
      this.speedPass.uniforms.uTime.value += dt;
    }

    if (playerCar && typeof RaceEngine !== "undefined" && RaceEngine.isActive) {
      const isDrifting = Math.abs(playerCar.driftAngle) > 0.14 && currentSpeedKmh > 55;
      if (isDrifting || playerCar.turboWasActive) {
        this.spawnDriftSparks(playerCar, Boolean(playerCar.turboWasActive));
      }
    }
    this.updateDriftSparks(dt);

    if (this.sunLight && playerCar) {
      this.sunLight.target.position.copy(playerCar.position);
      this.sunLight.position.set(
        playerCar.position.x + 120,
        playerCar.position.y + 180,
        playerCar.position.z + 90
      );
    }

    const braking =
      typeof RaceEngine !== "undefined" &&
      RaceEngine.keys &&
      (RaceEngine.keys.down || RaceEngine.keys.space) &&
      currentSpeedKmh > 40;
    for (let i = 0; i < this.brakeDiscMeshes.length; i++) {
      const disc = this.brakeDiscMeshes[i];
      if (disc.material && disc.material.emissive) {
        if (!disc.userData) disc.userData = {};
        if (typeof disc.userData.thermalIntensity === "undefined") {
          disc.userData.thermalIntensity = 0;
        }
        if (braking) {
          disc.userData.thermalIntensity = Math.min(3.2, disc.userData.thermalIntensity + dt * 4.2);
        } else {
          disc.userData.thermalIntensity = Math.max(0, disc.userData.thermalIntensity - dt * 1.5);
        }
        disc.material.emissiveIntensity = disc.userData.thermalIntensity;
      }
    }
  },

  render(scene, camera) {
    if (this.skyMesh && camera) {
      this.skyMesh.position.copy(camera.position);
    }
    if (!this.composer) {
      this.renderer.render(scene, camera);
      return;
    }
    // Aggiorna sempre scene e camera nel renderPass per gestire
    // correttamente il cambio scena showroom → gara.
    if (this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
    }
    this.composer.render();
  },

  resize(width, height) {
    if (this.composer) this.composer.setSize(width, height);
  },
};