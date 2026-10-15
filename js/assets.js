"use strict";

// =========================================================================
// 4. GENERATORE PROCEDURALE ARCADE + SUPPORTO ASSET 3D ESTERNI (60 FPS)
// =========================================================================
const ProceduralAssets = {
  geoCache: {},
  sharedMaterials: null,
  contactShadowTexture: null,

  getGeo(key, factoryFn) {
    if (!this.geoCache[key]) {
      this.geoCache[key] = factoryFn();
    }
    return this.geoCache[key];
  },

  createContactShadowTexture() {
    if (this.contactShadowTexture) return this.contactShadowTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, 512, 256);

    // Gradiente morbido di occlusione ambientale sotto la scocca centrale
    const grad = ctx.createRadialGradient(256, 128, 30, 256, 128, 220);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.78)");
    grad.addColorStop(0.45, "rgba(0, 0, 0, 0.48)");
    grad.addColorStop(0.8, "rgba(0, 0, 0, 0.16)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // 4 toppe di contatto scure ad alta densità sotto l'impronta di ciascun pneumatico
    const drawTireFootprint = (cx, cy) => {
      const pGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 36);
      pGrad.addColorStop(0, "rgba(0, 0, 0, 0.95)");
      pGrad.addColorStop(0.55, "rgba(0, 0, 0, 0.65)");
      pGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 34, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    drawTireFootprint(115, 68);
    drawTireFootprint(397, 68);
    drawTireFootprint(115, 188);
    drawTireFootprint(397, 188);

    const tex = new THREE.CanvasTexture(canvas);
    this.contactShadowTexture = tex;
    return tex;
  },

  initSharedMaterials() {
    if (this.sharedMaterials) return;
    const tireNorm =
      typeof GraphicsEngine !== "undefined" && GraphicsEngine.proceduralTextures
        ? GraphicsEngine.proceduralTextures.tireNormal
        : null;

    const shadowTex = this.createContactShadowTexture();

    this.sharedMaterials = {
      glass:
        typeof GraphicsEngine !== "undefined"
          ? GraphicsEngine.createGlassMaterial()
          : new THREE.MeshPhysicalMaterial({
              color: 0x07111e,
              metalness: 0.88,
              roughness: 0.04,
              clearcoat: 1.0,
              clearcoatRoughness: 0.02,
              transparent: true,
              opacity: 0.9,
            }),
      carbon: new THREE.MeshPhysicalMaterial({
        color: 0x121418,
        metalness: 0.65,
        roughness: 0.28,
        clearcoat: 0.6,
        clearcoatRoughness: 0.08,
      }),
      headlightLens: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.05,
        transparent: true,
        opacity: 0.45,
        clearcoat: 1.0,
      }),
      headlightProjector: new THREE.MeshBasicMaterial({ color: 0xecfeff }),
      headlightBezel: new THREE.MeshStandardMaterial({
        color: 0x0a0c10,
        metalness: 0.8,
        roughness: 0.4,
      }),
      drlStrip: new THREE.MeshBasicMaterial({ color: 0xe0f7ff }),
      taillightLens: new THREE.MeshStandardMaterial({
        color: 0x5a040b,
        emissive: 0xff0028,
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.25,
      }),
      tire: new THREE.MeshStandardMaterial({
        color: 0x151618,
        roughness: 0.88,
        metalness: 0.05,
        ...(tireNorm ? { normalMap: tireNorm, normalScale: new THREE.Vector2(0.6, 0.6) } : {}),
      }),
      rimSilver: new THREE.MeshPhysicalMaterial({
        color: 0xf1f5f9,
        metalness: 0.94,
        roughness: 0.12,
        clearcoat: 0.6,
      }),
      rimGunmetal: new THREE.MeshPhysicalMaterial({
        color: 0x334155,
        metalness: 0.92,
        roughness: 0.15,
        clearcoat: 0.55,
      }),
      rimGold: new THREE.MeshPhysicalMaterial({
        color: 0xd4af37,
        metalness: 0.92,
        roughness: 0.14,
        clearcoat: 0.6,
      }),
      shadow: new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.5,
        polygonOffsetUnits: -1.5,
      }),
      brakeDisc: new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.94,
        roughness: 0.24,
        emissive: new THREE.Color(0xff3300),
        emissiveIntensity: 0.0,
      }),
      caliperRed: new THREE.MeshPhysicalMaterial({
        color: 0xd91b24,
        metalness: 0.5,
        roughness: 0.18,
        clearcoat: 0.8,
      }),
      caliperYellow: new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        metalness: 0.5,
        roughness: 0.18,
        clearcoat: 0.8,
      }),
      caliperGold: new THREE.MeshPhysicalMaterial({
        color: 0xd97706,
        metalness: 0.6,
        roughness: 0.2,
        clearcoat: 0.8,
      }),
      exhaustMetal: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.96,
        roughness: 0.14,
      }),
      exhaustTitanium: new THREE.MeshPhysicalMaterial({
        color: 0x64748b,
        metalness: 0.95,
        roughness: 0.12,
        clearcoat: 0.5,
      }),
      grilleMesh: new THREE.MeshStandardMaterial({
        color: 0x0a0c10,
        roughness: 0.88,
        metalness: 0.2,
      }),
      interiorMat: new THREE.MeshStandardMaterial({
        color: 0x0e1014,
        roughness: 0.94,
        metalness: 0.08,
      }),
      mirrorGlass: new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        metalness: 0.98,
        roughness: 0.02,
      }),
    };
  },

  createAsphaltTexture(baseColor, curbA, curbB) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    // Fondo asfalto scuro ad alto contrasto Arcade
    ctx.fillStyle = baseColor || "#161922";
    ctx.fillRect(0, 0, 1024, 1024);

    // Micro-grana asfalto + pattern corsia
    for (let i = 0; i < 18000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const v = Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgba(${170 + v}, ${185 + v}, ${220 + v}, 0.045)`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Corsia centrale con Chevron direzionali Arcade semitrasparenti
    ctx.save();
    ctx.strokeStyle = "rgba(0, 240, 255, 0.14)";
    ctx.lineWidth = 10;
    for (let y = 64; y < 1024; y += 256) {
      ctx.beginPath();
      ctx.moveTo(430, y + 70);
      ctx.lineTo(512, y);
      ctx.lineTo(594, y + 70);
      ctx.stroke();
    }
    ctx.restore();

    // Cordoli Arcade Bicolore vivaci con bisellatura
    const stripeH = 96;
    for (let y = 0; y < 1024; y += stripeH) {
      const isEven = Math.floor(y / stripeH) % 2 === 0;
      ctx.fillStyle = isEven ? curbA : curbB;
      ctx.fillRect(0, y, 54, stripeH);
      ctx.fillRect(1024 - 54, y, 54, stripeH);

      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(0, y + stripeH - 6, 54, 6);
      ctx.fillRect(1024 - 54, y + stripeH - 6, 54, 6);
    }

    // Doppie strisce laterali Neon Arcade (Bianco + Ciano Elettrico)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(58, 0, 10, 1024);
    ctx.fillRect(1024 - 68, 0, 10, 1024);

    ctx.fillStyle = "rgba(0, 240, 255, 0.65)";
    ctx.fillRect(72, 0, 5, 1024);
    ctx.fillRect(1024 - 77, 0, 5, 1024);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 95);
    tex.anisotropy = 8;
    return tex;
  },

  buildCarMesh(carConfig, customPaintHex = null) {
    this.initSharedMaterials();
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const primaryColor =
      customPaintHex !== null ? customPaintHex : carConfig.colorHex;
    const neonAccentHex = carConfig.accentHex || 0x00f0ff;
    const sm = this.sharedMaterials;

    // Vernice automobilistica con clearcoat realistico
    const paintMat =
      typeof GraphicsEngine !== "undefined"
        ? GraphicsEngine.createCarPaintMaterial(primaryColor, true)
        : new THREE.MeshPhysicalMaterial({
            color: primaryColor,
            metalness: 0.82,
            roughness: 0.16,
            clearcoat: 1.0,
            clearcoatRoughness: 0.04,
            reflectivity: 0.95,
          });

    const secondaryMat =
      typeof GraphicsEngine !== "undefined"
        ? GraphicsEngine.createCarPaintMaterial(carConfig.secondaryHex, false)
        : new THREE.MeshPhysicalMaterial({
            color: carConfig.secondaryHex,
            metalness: 0.65,
            roughness: 0.22,
            clearcoat: 0.8,
          });

    const accentMat = new THREE.MeshStandardMaterial({
      color: neonAccentHex,
      emissive: neonAccentHex,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.5,
    });

    const brakelightMat = new THREE.MeshStandardMaterial({
      color: 0x5a040b,
      emissive: 0xff0028,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.25,
    });

    // Ombra di contatto realistica (occlusione ambientale + 4 impronte pneumatici)
    const shadowPlane = new THREE.Mesh(
      this.getGeo("contact_shadow_plane", () => new THREE.PlaneGeometry(2.5, 5.1)),
      sm.shadow,
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.02;
    root.add(shadowPlane);

    // Selezione cerchi e pinze freno in base alla categoria
    const isHyper = carConfig.id === "hypercar";
    const isGT = carConfig.id === "gt_comp";
    const isMuscle = carConfig.id === "muscle";
    const isHatch = carConfig.id === "hatchback";

    const rimMat = isHyper
      ? sm.rimGold
      : isGT
        ? sm.rimGunmetal
        : sm.rimSilver;

    const caliperMat = isHyper
      ? sm.caliperGold
      : isGT
        ? sm.caliperRed
        : isMuscle
          ? sm.caliperYellow
          : sm.caliperRed;

    // =========================================================================
    // MODELLAZIONE CARROZZERIE SPECIFICHE REALISTICHE
    // =========================================================================
    let exhaustZ = -2.15;
    let exhaustPoints = [];
    let fiaRainLight = null;

    if (
      typeof GraphicsEngine !== "undefined" &&
      GraphicsEngine.loadedModelsCache &&
      GraphicsEngine.loadedModelsCache[carConfig.id]
    ) {
      const extModel = GraphicsEngine.loadedModelsCache[carConfig.id].clone();
      bodyGroup.add(extModel);
    } else if (isHatch) {
      // -----------------------------------------------------------------------
      // 1. CIVIC TYPE-GT TCR (Touring Car da competizione)
      // -----------------------------------------------------------------------
      exhaustZ = -2.18;

      // Scocca inferiore principale
      const lowerBody = new THREE.Mesh(
        this.getGeo("hb_lower", () => new THREE.BoxGeometry(1.88, 0.38, 4.15)),
        paintMat,
      );
      lowerBody.position.set(0, 0.44, 0);

      // Splitter aerodinamico anteriore in fibra di carbonio con tiranti
      const splitter = new THREE.Mesh(
        this.getGeo("hb_split", () => new THREE.BoxGeometry(1.94, 0.05, 0.54)),
        sm.carbon,
      );
      splitter.position.set(0, 0.2, 2.14);

      const tieRodGeo = this.getGeo(
        "hb_tierod",
        () => new THREE.CylinderGeometry(0.007, 0.007, 0.22),
      );
      const tieRodL = new THREE.Mesh(tieRodGeo, sm.exhaustMetal);
      tieRodL.position.set(-0.48, 0.29, 2.19);
      tieRodL.rotation.x = 0.22;
      const tieRodR = tieRodL.clone();
      tieRodR.position.x = 0.48;

      // Minigonne laterali sagomate con canale aerodinamico
      const sideSkirt = new THREE.Mesh(
        this.getGeo("hb_skirt", () => new THREE.BoxGeometry(1.94, 0.06, 2.3)),
        sm.carbon,
      );
      sideSkirt.position.set(0, 0.22, 0);

      // Fascia anteriore con griglia a nido d'ape e prese d'aria radiatore
      const frontBumper = new THREE.Mesh(
        this.getGeo("hb_fbumper", () => new THREE.BoxGeometry(1.82, 0.28, 0.38)),
        paintMat,
      );
      frontBumper.position.set(0, 0.42, 2.0);

      const grilleLow = new THREE.Mesh(
        this.getGeo("hb_grille_low", () => new THREE.BoxGeometry(1.24, 0.16, 0.06)),
        sm.grilleMesh,
      );
      grilleLow.position.set(0, 0.3, 2.18);

      const grilleHigh = new THREE.Mesh(
        this.getGeo("hb_grille_hi", () => new THREE.BoxGeometry(1.12, 0.09, 0.06)),
        sm.grilleMesh,
      );
      grilleHigh.position.set(0, 0.52, 2.14);

      // Cofano aerodinamico spiovente con sfogo d'aria centrale
      const hood = new THREE.Mesh(
        this.getGeo("hb_hood", () => new THREE.BoxGeometry(1.68, 0.14, 1.34)),
        paintMat,
      );
      hood.position.set(0, 0.66, 1.32);
      hood.rotation.x = -0.09;

      const hoodVent = new THREE.Mesh(
        this.getGeo("hb_hood_vent", () => new THREE.BoxGeometry(0.58, 0.03, 0.38)),
        sm.carbon,
      );
      hoodVent.position.set(0, 0.74, 1.3);
      hoodVent.rotation.x = -0.09;

      // Parafanghi allargati Widebody TCR
      const fenderGeo = this.getGeo(
        "hb_fender",
        () => new THREE.BoxGeometry(0.14, 0.38, 0.88),
      );
      const fenderFL = new THREE.Mesh(fenderGeo, paintMat);
      fenderFL.position.set(-0.95, 0.48, 1.35);
      const fenderFR = fenderFL.clone();
      fenderFR.position.x = 0.95;
      const fenderRL = new THREE.Mesh(fenderGeo, paintMat);
      fenderRL.position.set(-0.95, 0.5, -1.32);
      const fenderRR = fenderRL.clone();
      fenderRR.position.x = 0.95;

      // Abitacolo sagomato: parabrezza inclinato, montanti neri e tetto
      const windshield = new THREE.Mesh(
        this.getGeo("hb_windshield", () => new THREE.BoxGeometry(1.54, 0.46, 0.05)),
        sm.glass,
      );
      windshield.position.set(0, 0.92, 0.52);
      windshield.rotation.x = -0.62;

      const pillarGeo = this.getGeo(
        "hb_pillar",
        () => new THREE.BoxGeometry(0.06, 0.48, 0.05),
      );
      const pillarAL = new THREE.Mesh(pillarGeo, sm.grilleMesh);
      pillarAL.position.set(-0.76, 0.92, 0.52);
      pillarAL.rotation.x = -0.62;
      const pillarAR = pillarAL.clone();
      pillarAR.position.x = 0.76;

      const cabinWindows = new THREE.Mesh(
        this.getGeo("hb_cabin_win", () => new THREE.BoxGeometry(1.5, 0.38, 1.8)),
        sm.glass,
      );
      cabinWindows.position.set(0, 1.0, -0.28);

      const bPillar = new THREE.Mesh(
        this.getGeo("hb_bpillar", () => new THREE.BoxGeometry(1.52, 0.38, 0.08)),
        sm.grilleMesh,
      );
      bPillar.position.set(0, 1.0, -0.28);

      const roof = new THREE.Mesh(
        this.getGeo("hb_roof", () => new THREE.BoxGeometry(1.48, 0.07, 1.84)),
        paintMat,
      );
      roof.position.set(0, 1.22, -0.28);

      const sharkAntenna = new THREE.Mesh(
        this.getGeo("hb_antenna", () => new THREE.BoxGeometry(0.04, 0.1, 0.22)),
        sm.carbon,
      );
      sharkAntenna.position.set(0, 1.28, -0.92);

      const rearWindow = new THREE.Mesh(
        this.getGeo("hb_rear_win", () => new THREE.BoxGeometry(1.42, 0.44, 0.05)),
        sm.glass,
      );
      rearWindow.position.set(0, 1.02, -1.28);
      rearWindow.rotation.x = 0.58;

      // Silhouette Interni da corsa (cruscotto, volante, sedili a guscio, rollbar)
      const dash = new THREE.Mesh(
        this.getGeo("dash_generic", () => new THREE.BoxGeometry(1.36, 0.12, 0.44)),
        sm.interiorMat,
      );
      dash.position.set(0, 0.76, 0.44);

      const steeringWheel = new THREE.Mesh(
        this.getGeo("wheel_steer", () => {
          const g = new THREE.TorusGeometry(0.12, 0.016, 6, 16);
          g.rotateX(0.35);
          return g;
        }),
        sm.interiorMat,
      );
      steeringWheel.position.set(0.34, 0.84, 0.22);

      const seatGeo = this.getGeo(
        "bucket_seat",
        () => new THREE.BoxGeometry(0.3, 0.32, 0.24),
      );
      const seatL = new THREE.Mesh(seatGeo, sm.interiorMat);
      seatL.position.set(-0.34, 0.86, -0.25);
      const seatR = new THREE.Mesh(seatGeo, sm.interiorMat);
      seatR.position.set(0.34, 0.86, -0.25);

      const rollBar = new THREE.Mesh(
        this.getGeo("rollbar_hatch", () => {
          const g = new THREE.CylinderGeometry(0.022, 0.022, 1.34);
          g.rotateZ(Math.PI / 2);
          return g;
        }),
        accentMat,
      );
      rollBar.position.set(0, 0.94, -0.7);

      // Specchietti retrovisori aerodinamici con specchio riflettente
      const mirrorGeo = this.getGeo(
        "mirror_hb",
        () => new THREE.BoxGeometry(0.18, 0.1, 0.12),
      );
      const mirrorGlassGeo = this.getGeo(
        "mirror_glass_hb",
        () => new THREE.BoxGeometry(0.01, 0.08, 0.1),
      );
      const mirrorL = new THREE.Mesh(mirrorGeo, sm.carbon);
      mirrorL.position.set(-0.88, 0.88, 0.42);
      const mGlassL = new THREE.Mesh(mirrorGlassGeo, sm.mirrorGlass);
      mGlassL.position.set(-0.88, 0.88, 0.38);
      const mirrorR = mirrorL.clone();
      mirrorR.position.x = 0.88;
      const mGlassR = mGlassL.clone();
      mGlassR.position.x = 0.88;

      // Paraurti posteriore con estrattore a 3 pinne e triplo scarico TCR
      const rearBumper = new THREE.Mesh(
        this.getGeo("hb_rbumper", () => new THREE.BoxGeometry(1.86, 0.34, 0.38)),
        paintMat,
      );
      rearBumper.position.set(0, 0.48, -2.0);

      const diffuser = new THREE.Mesh(
        this.getGeo("hb_diffuser", () => new THREE.BoxGeometry(1.84, 0.1, 0.52)),
        sm.carbon,
      );
      diffuser.position.set(0, 0.22, -2.02);

      const finGeo = this.getGeo(
        "hb_fin",
        () => new THREE.BoxGeometry(0.03, 0.12, 0.44),
      );
      const fin1 = new THREE.Mesh(finGeo, sm.carbon);
      fin1.position.set(-0.38, 0.22, -2.02);
      const fin2 = new THREE.Mesh(finGeo, sm.carbon);
      fin2.position.set(0, 0.22, -2.02);
      const fin3 = new THREE.Mesh(finGeo, sm.carbon);
      fin3.position.set(0.38, 0.22, -2.02);

      // Triplo scarico posteriore in acciaio inox lucidato
      const exhaustGeo = this.getGeo("pipe_triple", () => {
        const g = new THREE.CylinderGeometry(0.036, 0.036, 0.22, 12);
        g.rotateX(Math.PI / 2);
        return g;
      });
      const p1 = new THREE.Mesh(exhaustGeo, sm.exhaustMetal);
      p1.position.set(-0.09, 0.28, -2.18);
      const p2 = new THREE.Mesh(exhaustGeo, sm.exhaustMetal);
      p2.position.set(0, 0.28, -2.18);
      const p3 = new THREE.Mesh(exhaustGeo, sm.exhaustMetal);
      p3.position.set(0.09, 0.28, -2.18);
      exhaustPoints.push(new THREE.Vector3(-0.09, 0.28, -2.25));
      exhaustPoints.push(new THREE.Vector3(0.09, 0.28, -2.25));

      // Alettone TCR bi-plano sul portellone posteriore
      const postGeo = this.getGeo(
        "hb_wingpost",
        () => new THREE.BoxGeometry(0.06, 0.36, 0.16),
      );
      const postL = new THREE.Mesh(postGeo, sm.carbon);
      postL.position.set(-0.52, 1.28, -1.82);
      postL.rotation.x = -0.22;
      const postR = postL.clone();
      postR.position.x = 0.52;

      const wingBlade = new THREE.Mesh(
        this.getGeo("hb_wingblade", () => new THREE.BoxGeometry(1.78, 0.05, 0.38)),
        sm.carbon,
      );
      wingBlade.position.set(0, 1.44, -1.9);
      wingBlade.rotation.x = 0.16;

      const endplateGeo = this.getGeo(
        "hb_endplate",
        () => new THREE.BoxGeometry(0.03, 0.2, 0.42),
      );
      const endplateL = new THREE.Mesh(endplateGeo, accentMat);
      endplateL.position.set(-0.9, 1.44, -1.9);
      const endplateR = endplateL.clone();
      endplateR.position.x = 0.9;

      bodyGroup.add(
        lowerBody,
        splitter,
        tieRodL,
        tieRodR,
        sideSkirt,
        frontBumper,
        grilleLow,
        grilleHigh,
        hood,
        hoodVent,
        fenderFL,
        fenderFR,
        fenderRL,
        fenderRR,
        windshield,
        pillarAL,
        pillarAR,
        cabinWindows,
        bPillar,
        roof,
        sharkAntenna,
        rearWindow,
        dash,
        steeringWheel,
        seatL,
        seatR,
        rollBar,
        mirrorL,
        mGlassL,
        mirrorR,
        mGlassR,
        rearBumper,
        diffuser,
        fin1,
        fin2,
        fin3,
        p1,
        p2,
        p3,
        postL,
        postR,
        wingBlade,
        endplateL,
        endplateR,
      );
    } else if (isMuscle) {
      // -----------------------------------------------------------------------
      // 2. STALLION V8 500 (Muscle Car / V8 Supercars)
      // -----------------------------------------------------------------------
      exhaustZ = -2.34;

      // Scocca allargata con linea di cintura aggressiva
      const lowerBody = new THREE.Mesh(
        this.getGeo("ms_lower", () => new THREE.BoxGeometry(2.04, 0.44, 4.64)),
        paintMat,
      );
      lowerBody.position.set(0, 0.48, 0);

      // Splitter anteriore racing con tiranti
      const chinSplitter = new THREE.Mesh(
        this.getGeo("ms_splitter", () => new THREE.BoxGeometry(2.06, 0.06, 0.54)),
        sm.carbon,
      );
      chinSplitter.position.set(0, 0.22, 2.34);

      // Mascherina anteriore a nido d'ape minacciosa
      const frontGrille = new THREE.Mesh(
        this.getGeo("ms_grille", () => new THREE.BoxGeometry(1.72, 0.28, 0.08)),
        sm.grilleMesh,
      );
      frontGrille.position.set(0, 0.52, 2.33);

      // Lungo cofano muscoloso con presa d'aria Cowl-Induction rialzata
      const hood = new THREE.Mesh(
        this.getGeo("ms_hood", () => new THREE.BoxGeometry(1.82, 0.16, 1.72)),
        paintMat,
      );
      hood.position.set(0, 0.72, 1.36);

      const scoop = new THREE.Mesh(
        this.getGeo("ms_scoop", () => new THREE.BoxGeometry(0.68, 0.14, 1.15)),
        accentMat,
      );
      scoop.position.set(0, 0.86, 1.2);

      const scoopMouth = new THREE.Mesh(
        this.getGeo("ms_scoop_mouth", () => new THREE.BoxGeometry(0.6, 0.08, 0.05)),
        sm.grilleMesh,
      );
      scoopMouth.position.set(0, 0.86, 1.78);

      // Doppia striscia da corsa longitudinale
      const stripeL = new THREE.Mesh(
        this.getGeo("ms_stripe_l", () => new THREE.BoxGeometry(0.18, 0.46, 4.66)),
        secondaryMat,
      );
      stripeL.position.set(-0.24, 0.48, 0);
      const stripeR = stripeL.clone();
      stripeR.position.x = 0.24;

      // Fiancate muscolose con bombatura marcata sui passaruota posteriori
      const rearHaunchGeo = this.getGeo(
        "ms_haunch",
        () => new THREE.BoxGeometry(0.12, 0.42, 1.18),
      );
      const haunchL = new THREE.Mesh(rearHaunchGeo, paintMat);
      haunchL.position.set(-1.05, 0.54, -1.4);
      const haunchR = haunchL.clone();
      haunchR.position.x = 1.05;

      // Minigonne laterali da corsa
      const skirts = new THREE.Mesh(
        this.getGeo("ms_skirts", () => new THREE.BoxGeometry(2.08, 0.06, 2.7)),
        sm.carbon,
      );
      skirts.position.set(0, 0.23, 0);

      // Abitacolo Fastback coupé con lunotto posteriore molto inclinato
      const windshield = new THREE.Mesh(
        this.getGeo("ms_windshield", () => new THREE.BoxGeometry(1.65, 0.46, 0.05)),
        sm.glass,
      );
      windshield.position.set(0, 0.98, 0.38);
      windshield.rotation.x = -0.66;

      const fastbackRoof = new THREE.Mesh(
        this.getGeo("ms_roof", () => new THREE.BoxGeometry(1.58, 0.07, 1.74)),
        paintMat,
      );
      fastbackRoof.position.set(0, 1.22, -0.42);

      const sideGlass = new THREE.Mesh(
        this.getGeo("ms_sideglass", () => new THREE.BoxGeometry(1.62, 0.38, 1.7)),
        sm.glass,
      );
      sideGlass.position.set(0, 0.98, -0.42);

      const rearFastbackGlass = new THREE.Mesh(
        this.getGeo("ms_rear_glass", () => new THREE.BoxGeometry(1.52, 0.58, 0.05)),
        sm.glass,
      );
      rearFastbackGlass.position.set(0, 1.0, -1.42);
      rearFastbackGlass.rotation.x = 0.68;

      // Interni sportivi Muscle
      const dash = new THREE.Mesh(
        this.getGeo("dash_generic", () => new THREE.BoxGeometry(1.36, 0.12, 0.44)),
        sm.interiorMat,
      );
      dash.position.set(0, 0.78, 0.32);

      const seatGeo = this.getGeo(
        "bucket_seat",
        () => new THREE.BoxGeometry(0.3, 0.32, 0.24),
      );
      const seatL = new THREE.Mesh(seatGeo, sm.interiorMat);
      seatL.position.set(-0.36, 0.88, -0.32);
      const seatR = new THREE.Mesh(seatGeo, sm.interiorMat);
      seatR.position.set(0.36, 0.88, -0.32);

      // Specchietti aerodinamici muscle
      const mirrorGeo = this.getGeo(
        "mirror_ms",
        () => new THREE.BoxGeometry(0.18, 0.1, 0.14),
      );
      const mirrorL = new THREE.Mesh(mirrorGeo, paintMat);
      mirrorL.position.set(-0.95, 0.92, 0.32);
      const mirrorR = mirrorL.clone();
      mirrorR.position.x = 0.95;

      // Spoiler Ducktail + Alettone GT posteriore
      const ducktail = new THREE.Mesh(
        this.getGeo("ms_ducktail", () => new THREE.BoxGeometry(1.78, 0.12, 0.28)),
        paintMat,
      );
      ducktail.position.set(0, 0.88, -2.28);

      const wingBlade = new THREE.Mesh(
        this.getGeo("ms_wing", () => new THREE.BoxGeometry(1.92, 0.06, 0.38)),
        sm.carbon,
      );
      wingBlade.position.set(0, 1.14, -2.26);

      const postGeo = this.getGeo(
        "ms_wingpost",
        () => new THREE.BoxGeometry(0.06, 0.3, 0.12),
      );
      const postL = new THREE.Mesh(postGeo, sm.carbon);
      postL.position.set(-0.64, 0.98, -2.26);
      const postR = postL.clone();
      postR.position.x = 0.64;

      // Scarichi quadrupli in acciaio inox (doppie uscite a sinistra e destra)
      const exhaustGeo = this.getGeo("pipe_single", () => {
        const g = new THREE.CylinderGeometry(0.04, 0.04, 0.26, 12);
        g.rotateX(Math.PI / 2);
        return g;
      });
      const q1 = new THREE.Mesh(exhaustGeo, sm.exhaustMetal);
      q1.position.set(-0.62, 0.32, -2.33);
      const q2 = new THREE.Mesh(exhaustGeo, sm.exhaustMetal);
      q2.position.set(-0.74, 0.32, -2.33);
      const q3 = new THREE.Mesh(exhaustGeo, sm.exhaustMetal);
      q3.position.set(0.62, 0.32, -2.33);
      const q4 = new THREE.Mesh(exhaustGeo, sm.exhaustMetal);
      q4.position.set(0.74, 0.32, -2.33);

      exhaustPoints.push(new THREE.Vector3(-0.68, 0.32, -2.38));
      exhaustPoints.push(new THREE.Vector3(0.68, 0.32, -2.38));

      bodyGroup.add(
        lowerBody,
        chinSplitter,
        frontGrille,
        hood,
        scoop,
        scoopMouth,
        stripeL,
        stripeR,
        haunchL,
        haunchR,
        skirts,
        windshield,
        fastbackRoof,
        sideGlass,
        rearFastbackGlass,
        dash,
        seatL,
        seatR,
        mirrorL,
        mirrorR,
        ducktail,
        wingBlade,
        postL,
        postR,
        q1,
        q2,
        q3,
        q4,
      );
    } else if (isGT) {
      // -----------------------------------------------------------------------
      // 3. APEX GT3 RS (Porsche 911 GT3 R Competizione)
      // -----------------------------------------------------------------------
      exhaustZ = -2.32;

      // Scocca ribassata GT da competizione
      const lowerBody = new THREE.Mesh(
        this.getGeo("gt_lower", () => new THREE.BoxGeometry(2.14, 0.38, 4.62)),
        paintMat,
      );
      lowerBody.position.set(0, 0.44, 0);

      // Splitter aerodinamico anteriore pronunciato con canards (dive planes)
      const splitter = new THREE.Mesh(
        this.getGeo("gt_split", () => new THREE.BoxGeometry(2.18, 0.06, 0.62)),
        sm.carbon,
      );
      splitter.position.set(0, 0.2, 2.26);

      const canardGeo = this.getGeo("gt_canard", () => {
        const g = new THREE.BoxGeometry(0.24, 0.04, 0.3);
        g.rotateZ(0.22);
        return g;
      });
      const canardL = new THREE.Mesh(canardGeo, sm.carbon);
      canardL.position.set(-1.02, 0.42, 2.18);
      const canardR = new THREE.Mesh(canardGeo, sm.carbon);
      canardR.position.set(1.02, 0.42, 2.18);
      canardR.rotation.z = -0.22;

      // Muso spiovente con prese d'aria radiatori e sfoghi d'aria sul cofano
      const frontIntake = new THREE.Mesh(
        this.getGeo("gt_intake", () => new THREE.BoxGeometry(1.64, 0.22, 0.1)),
        sm.grilleMesh,
      );
      frontIntake.position.set(0, 0.34, 2.29);

      const hood = new THREE.Mesh(
        this.getGeo("gt_hood", () => new THREE.BoxGeometry(1.74, 0.14, 1.5)),
        paintMat,
      );
      hood.position.set(0, 0.66, 1.4);
      hood.rotation.x = -0.12;

      // Doppi sfoghi d'aria del radiatore centrale sul cofano (Nostrils GT3)
      const nostrilGeo = this.getGeo(
        "gt_nostril",
        () => new THREE.BoxGeometry(0.26, 0.03, 0.42),
      );
      const nostrilL = new THREE.Mesh(nostrilGeo, sm.carbon);
      nostrilL.position.set(-0.36, 0.72, 1.45);
      nostrilL.rotation.x = -0.12;
      const nostrilR = nostrilL.clone();
      nostrilR.position.x = 0.36;

      // Feritoie di sfogo pressione passaruota anteriori (Fender Louvers)
      const louverGeo = this.getGeo(
        "gt_louver",
        () => new THREE.BoxGeometry(0.18, 0.03, 0.48),
      );
      const louverL = new THREE.Mesh(louverGeo, sm.carbon);
      louverL.position.set(-0.88, 0.72, 1.45);
      const louverR = louverL.clone();
      louverR.position.x = 0.88;

      // Minigonne in carbonio con presa d'aria freni posteriori
      const skirts = new THREE.Mesh(
        this.getGeo("gt_skirts", () => new THREE.BoxGeometry(2.18, 0.07, 2.8)),
        sm.carbon,
      );
      skirts.position.set(0, 0.22, 0);

      // Abitacolo aerodinamico a goccia GT con roll cage a vista
      const windshield = new THREE.Mesh(
        this.getGeo("gt_windshield", () => new THREE.BoxGeometry(1.6, 0.48, 0.05)),
        sm.glass,
      );
      windshield.position.set(0, 0.94, 0.45);
      windshield.rotation.x = -0.64;

      const cabin = new THREE.Mesh(
        this.getGeo("gt_cabin", () => new THREE.BoxGeometry(1.54, 0.38, 1.9)),
        sm.glass,
      );
      cabin.position.set(0, 0.96, -0.35);

      const roof = new THREE.Mesh(
        this.getGeo("gt_roof", () => new THREE.BoxGeometry(1.48, 0.07, 1.76)),
        paintMat,
      );
      roof.position.set(0, 1.18, -0.32);

      const engineDeck = new THREE.Mesh(
        this.getGeo("gt_deck", () => new THREE.BoxGeometry(1.68, 0.16, 1.25)),
        paintMat,
      );
      engineDeck.position.set(0, 0.76, -1.65);
      engineDeck.rotation.x = 0.12;

      // Roll cage FIA GT3 completo visibile dai finestrini
      const cageGeo = this.getGeo("gt_cage", () => {
        const g = new THREE.CylinderGeometry(0.02, 0.02, 1.36);
        g.rotateZ(Math.PI / 2);
        return g;
      });
      const cageBar1 = new THREE.Mesh(cageGeo, accentMat);
      cageBar1.position.set(0, 0.96, -0.5);
      const cageBar2 = new THREE.Mesh(cageGeo, accentMat);
      cageBar2.position.set(0, 0.88, -0.9);

      const dash = new THREE.Mesh(
        this.getGeo("dash_generic", () => new THREE.BoxGeometry(1.36, 0.12, 0.44)),
        sm.interiorMat,
      );
      dash.position.set(0, 0.76, 0.38);

      const seat = new THREE.Mesh(
        this.getGeo("bucket_seat", () => new THREE.BoxGeometry(0.32, 0.34, 0.26)),
        sm.interiorMat,
      );
      seat.position.set(0.36, 0.86, -0.28);

      // Specchietti aerodinamici GT3
      const mirrorGeo = this.getGeo(
        "mirror_gt",
        () => new THREE.BoxGeometry(0.18, 0.09, 0.14),
      );
      const mirrorL = new THREE.Mesh(mirrorGeo, sm.carbon);
      mirrorL.position.set(-0.96, 0.88, 0.36);
      const mirrorR = mirrorL.clone();
      mirrorR.position.x = 0.96;

      // Grande alettone Swan-Neck (collo d'oca) montato dall'alto con bandelle
      const swanPostGeo = this.getGeo("gt_swanpost", () => {
        const g = new THREE.BoxGeometry(0.06, 0.52, 0.22);
        g.rotateX(-0.16);
        return g;
      });
      const swanL = new THREE.Mesh(swanPostGeo, sm.carbon);
      swanL.position.set(-0.58, 1.15, -2.06);
      const swanR = swanL.clone();
      swanR.position.x = 0.58;

      const wingBlade = new THREE.Mesh(
        this.getGeo("gt_wingblade", () => new THREE.BoxGeometry(2.18, 0.06, 0.44)),
        sm.carbon,
      );
      wingBlade.position.set(0, 1.34, -2.14);
      wingBlade.rotation.x = 0.18;

      const endplateGeo = this.getGeo(
        "gt_endplate",
        () => new THREE.BoxGeometry(0.04, 0.28, 0.48),
      );
      const endplateL = new THREE.Mesh(endplateGeo, accentMat);
      endplateL.position.set(-1.1, 1.34, -2.14);
      const endplateR = endplateL.clone();
      endplateR.position.x = 1.1;

      // Diffusore posteriore con 4 paratie verticali in carbonio
      const diffuser = new THREE.Mesh(
        this.getGeo("gt_diffuser", () => new THREE.BoxGeometry(2.04, 0.12, 0.62)),
        sm.carbon,
      );
      diffuser.position.set(0, 0.22, -2.1);

      const strakeGeo = this.getGeo(
        "gt_strake",
        () => new THREE.BoxGeometry(0.03, 0.16, 0.54),
      );
      const s1 = new THREE.Mesh(strakeGeo, sm.carbon);
      s1.position.set(-0.52, 0.22, -2.1);
      const s2 = new THREE.Mesh(strakeGeo, sm.carbon);
      s2.position.set(-0.18, 0.22, -2.1);
      const s3 = new THREE.Mesh(strakeGeo, sm.carbon);
      s3.position.set(0.18, 0.22, -2.1);
      const s4 = new THREE.Mesh(strakeGeo, sm.carbon);
      s4.position.set(0.52, 0.22, -2.1);

      // Doppio scarico centrale in titanio con finitura termica
      const exhaustGeo = this.getGeo("pipe_titanium", () => {
        const g = new THREE.CylinderGeometry(0.045, 0.045, 0.24, 14);
        g.rotateX(Math.PI / 2);
        return g;
      });
      const p1 = new THREE.Mesh(exhaustGeo, sm.exhaustTitanium);
      p1.position.set(-0.09, 0.32, -2.31);
      const p2 = new THREE.Mesh(exhaustGeo, sm.exhaustTitanium);
      p2.position.set(0.09, 0.32, -2.31);

      exhaustPoints.push(new THREE.Vector3(-0.09, 0.32, -2.36));
      exhaustPoints.push(new THREE.Vector3(0.09, 0.32, -2.36));

      bodyGroup.add(
        lowerBody,
        splitter,
        canardL,
        canardR,
        frontIntake,
        hood,
        nostrilL,
        nostrilR,
        louverL,
        louverR,
        skirts,
        windshield,
        cabin,
        roof,
        engineDeck,
        cageBar1,
        cageBar2,
        dash,
        seat,
        mirrorL,
        mirrorR,
        swanL,
        swanR,
        wingBlade,
        endplateL,
        endplateR,
        diffuser,
        s1,
        s2,
        s3,
        s4,
        p1,
        p2,
      );
    } else {
      // -----------------------------------------------------------------------
      // 4. VALKYRIE X-PROTO (Hypercar Le Mans Prototype / F1 LMH)
      // -----------------------------------------------------------------------
      exhaustZ = -1.65; // Scarichi alti sul ponte motore posteriore

      // Monoscocca centrale stretta a goccia in fibra di carbonio
      const centralTub = new THREE.Mesh(
        this.getGeo("hy_tub", () => new THREE.BoxGeometry(1.12, 0.42, 4.74)),
        paintMat,
      );
      centralTub.position.set(0, 0.4, 0);

      // Canali Venturi passanti attraverso la scocca (Through-body Aero Tunnels)
      const pontoonGeo = this.getGeo(
        "hy_pontoon",
        () => new THREE.BoxGeometry(0.5, 0.38, 3.82),
      );
      const pontoonL = new THREE.Mesh(pontoonGeo, paintMat);
      pontoonL.position.set(-0.92, 0.38, 0.08);
      const pontoonR = pontoonL.clone();
      pontoonR.position.x = 0.92;

      // Fondo piatto aerodinamico a effetto suolo integrale
      const aeroFloor = new THREE.Mesh(
        this.getGeo("hy_floor", () => new THREE.BoxGeometry(2.28, 0.06, 4.88)),
        sm.carbon,
      );
      aeroFloor.position.set(0, 0.19, 0);

      // Muso aerodinamico ad ago Formula 1 & Ala anteriore bi-plana
      const noseNeedle = new THREE.Mesh(
        this.getGeo("hy_nose", () => new THREE.BoxGeometry(0.44, 0.16, 1.28)),
        paintMat,
      );
      noseNeedle.position.set(0, 0.38, 2.15);
      noseNeedle.rotation.x = -0.06;

      const frontWing = new THREE.Mesh(
        this.getGeo("hy_fwing", () => new THREE.BoxGeometry(2.22, 0.05, 0.52)),
        sm.carbon,
      );
      frontWing.position.set(0, 0.2, 2.26);

      const fEndplateGeo = this.getGeo(
        "hy_fendplate",
        () => new THREE.BoxGeometry(0.04, 0.22, 0.54),
      );
      const fEndL = new THREE.Mesh(fEndplateGeo, accentMat);
      fEndL.position.set(-1.12, 0.26, 2.26);
      const fEndR = fEndL.clone();
      fEndR.position.x = 1.12;

      // Braccetti sospensioni a triangoli sovrapposti esposti (A-Arms)
      const armGeo = this.getGeo("hy_aarm", () => {
        const g = new THREE.CylinderGeometry(0.016, 0.016, 0.58);
        g.rotateZ(Math.PI / 2);
        return g;
      });
      const armFL = new THREE.Mesh(armGeo, sm.carbon);
      armFL.position.set(-0.76, 0.38, 1.55);
      const armFR = armFL.clone();
      armFR.position.x = 0.76;

      // Canopy a bolla da caccia militare in vetro oscurato polarizzato
      const canopy = new THREE.Mesh(
        this.getGeo("hy_canopy", () => new THREE.BoxGeometry(0.98, 0.42, 1.98)),
        sm.glass,
      );
      canopy.position.set(0, 0.82, 0.05);

      // Air-Scoop superiore sul tetto (Snorkel aspirazione V12)
      const roofSnorkel = new THREE.Mesh(
        this.getGeo("hy_snorkel", () => new THREE.BoxGeometry(0.26, 0.14, 0.68)),
        sm.carbon,
      );
      roofSnorkel.position.set(0, 1.08, -0.32);

      // Pinna di squalo dorsale FIA LMP1/Hypercar
      const sharkFin = new THREE.Mesh(
        this.getGeo("hy_fin", () => new THREE.BoxGeometry(0.04, 0.48, 1.96)),
        accentMat,
      );
      sharkFin.position.set(0, 0.98, -1.28);

      // Gigantesco alettone posteriore bi-plano con bandelle aerodinamiche
      const rearWing = new THREE.Mesh(
        this.getGeo("hy_rwing", () => new THREE.BoxGeometry(2.32, 0.06, 0.48)),
        sm.carbon,
      );
      rearWing.position.set(0, 1.16, -2.32);
      rearWing.rotation.x = 0.2;

      const rEndplateGeo = this.getGeo(
        "hy_rendplate",
        () => new THREE.BoxGeometry(0.04, 0.42, 0.56),
      );
      const rEndL = new THREE.Mesh(rEndplateGeo, secondaryMat);
      rEndL.position.set(-1.16, 1.14, -2.32);
      const rEndR = rEndL.clone();
      rEndR.position.x = 1.16;

      // Diffusore posteriore estremo con tunnel Venturi aperti
      const diffuser = new THREE.Mesh(
        this.getGeo("hy_diffuser", () => new THREE.BoxGeometry(2.14, 0.16, 0.72)),
        sm.carbon,
      );
      diffuser.position.set(0, 0.24, -2.18);
      diffuser.rotation.x = -0.12;

      // Scarichi alti con uscita superiore stile F1/Valkyrie AMR Pro
      const topExhaustGeo = this.getGeo("hy_topexhaust", () => {
        const g = new THREE.CylinderGeometry(0.042, 0.042, 0.22, 12);
        g.rotateX(-0.35);
        return g;
      });
      const tp1 = new THREE.Mesh(topExhaustGeo, sm.exhaustTitanium);
      tp1.position.set(-0.24, 0.65, -1.55);
      const tp2 = new THREE.Mesh(topExhaustGeo, sm.exhaustTitanium);
      tp2.position.set(0.24, 0.65, -1.55);

      exhaustPoints.push(new THREE.Vector3(-0.24, 0.65, -1.65));
      exhaustPoints.push(new THREE.Vector3(0.24, 0.65, -1.65));

      // Luce pioggia/FIA a LED centrale lampeggiante sul diffusore posteriore
      const fiaRainMat = new THREE.MeshStandardMaterial({
        color: 0x880000,
        emissive: 0xff0018,
        emissiveIntensity: 0.8,
      });
      fiaRainLight = new THREE.Mesh(
        this.getGeo("fia_rain", () => new THREE.BoxGeometry(0.12, 0.1, 0.06)),
        fiaRainMat,
      );
      fiaRainLight.position.set(0, 0.25, -2.36);

      bodyGroup.add(
        centralTub,
        pontoonL,
        pontoonR,
        aeroFloor,
        noseNeedle,
        frontWing,
        fEndL,
        fEndR,
        armFL,
        armFR,
        canopy,
        roofSnorkel,
        sharkFin,
        rearWing,
        rEndL,
        rEndR,
        diffuser,
        tp1,
        tp2,
        fiaRainLight,
      );
    }

    // =========================================================================
    // GRUPPI OTTICI ANTERIORI E POSTERIORI DETTAGLIATI (LED/PROIETTORI)
    // =========================================================================
    const halfZ = isHatch ? 2.08 : isHyper ? 2.44 : 2.34;

    // Fari Anteriori con Lenti in Policarbonato Trasparente + Proiettori LED interni
    const headHousingGeo = this.getGeo(
      "head_housing",
      () => new THREE.BoxGeometry(0.42, 0.12, 0.14),
    );
    const headLensGeo = this.getGeo(
      "head_lens",
      () => new THREE.BoxGeometry(0.43, 0.13, 0.04),
    );
    const projectorGeo = this.getGeo("head_proj", () => {
      const g = new THREE.SphereGeometry(0.042, 12, 8);
      g.rotateX(Math.PI / 2);
      return g;
    });

    const createHeadlightAssembly = (isLeft) => {
      const g = new THREE.Group();
      const housing = new THREE.Mesh(headHousingGeo, sm.headlightBezel);
      const lens = new THREE.Mesh(headLensGeo, sm.headlightLens);
      lens.position.z = 0.06;

      const p1 = new THREE.Mesh(projectorGeo, sm.headlightProjector);
      p1.position.set(isLeft ? -0.1 : 0.1, 0, 0.03);
      const p2 = new THREE.Mesh(projectorGeo, sm.headlightProjector);
      p2.position.set(isLeft ? 0.1 : -0.1, 0, 0.03);

      const drl = new THREE.Mesh(
        this.getGeo("head_drl", () => new THREE.BoxGeometry(0.4, 0.02, 0.02)),
        sm.drlStrip,
      );
      drl.position.set(0, 0.05, 0.05);

      g.add(housing, lens, p1, p2, drl);
      return g;
    };

    const headL = createHeadlightAssembly(true);
    headL.position.set(-0.72, 0.54, halfZ);
    const headR = createHeadlightAssembly(false);
    headR.position.set(0.72, 0.54, halfZ);
    bodyGroup.add(headL, headR);

    // Barra Freno Posteriore LED Full-Width con lenti acriliche rosse
    const tailBar = new THREE.Mesh(
      this.getGeo("car_tailbar", () => new THREE.BoxGeometry(1.82, 0.12, 0.08)),
      brakelightMat,
    );
    tailBar.position.set(0, 0.56, -halfZ);
    bodyGroup.add(tailBar);

    // Fiammate Afterburner Nitro Arcade dagli scarichi reali
    const flameGeo = this.getGeo("nitro_flame_cone", () => {
      const g = new THREE.ConeGeometry(0.12, 0.9, 8);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, -0.45);
      return g;
    });
    const flameMatL = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameMatR = flameMatL.clone();

    const exP1 = exhaustPoints[0] || new THREE.Vector3(-0.42, 0.32, -halfZ - 0.05);
    const exP2 = exhaustPoints[1] || new THREE.Vector3(0.42, 0.32, -halfZ - 0.05);

    const flameL = new THREE.Mesh(flameGeo, flameMatL);
    flameL.position.copy(exP1);
    flameL.visible = false;
    flameL.userData.ignoreDepthPass = true;

    const flameR = new THREE.Mesh(flameGeo, flameMatR);
    flameR.position.copy(exP2);
    flameR.visible = false;
    flameR.userData.ignoreDepthPass = true;
    bodyGroup.add(flameL, flameR);

    // =========================================================================
    // 4 RUOTE REALISTICHE CON PINZE FRENO FISSE E ROTORI FORATI
    // =========================================================================
    const wheelX = isHatch ? 0.98 : 1.1;
    const wheelZFront = isHatch ? 1.34 : 1.48;
    const wheelZRear = isHatch ? -1.32 : -1.46;

    const frontRightPivot = new THREE.Group();
    const frontLeftPivot = new THREE.Group();
    frontRightPivot.position.set(-wheelX, 0.37, wheelZFront);
    frontLeftPivot.position.set(wheelX, 0.37, wheelZFront);

    // Campanatura negativa statica da corsa (-1.5° = 0.026 rad)
    frontRightPivot.rotation.z = 0.026;
    frontLeftPivot.rotation.z = -0.026;
    root.add(frontRightPivot, frontLeftPivot);

    const wheelMeshes = [];

    // Geometrie ruote realistiche con spalla arrotondata e cerchio a razze
    const tireCylGeo = this.getGeo("tire_cyl", () => {
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 24);
      g.rotateZ(Math.PI / 2);
      return g;
    });
    const tireEdgeGeo = this.getGeo("tire_edge", () => {
      const g = new THREE.TorusGeometry(0.33, 0.03, 8, 24);
      g.rotateY(Math.PI / 2);
      return g;
    });

    const rimBarrelGeo = this.getGeo("rim_barrel", () => {
      const g = new THREE.CylinderGeometry(0.23, 0.23, 0.26, 24);
      g.rotateZ(Math.PI / 2);
      return g;
    });
    const rimLipGeo = this.getGeo("rim_lip", () => {
      const g = new THREE.TorusGeometry(0.225, 0.012, 8, 24);
      g.rotateY(Math.PI / 2);
      return g;
    });
    const rimCenterGeo = this.getGeo("rim_hub", () => {
      const g = new THREE.CylinderGeometry(0.065, 0.065, 0.27, 16);
      g.rotateZ(Math.PI / 2);
      return g;
    });

    const spokePairGeo = this.getGeo(
      "wheel_spoke_pair",
      () => new THREE.BoxGeometry(0.025, 0.17, 0.028),
    );

    const discGeo = this.getGeo("brake_rotor_drilled", () => {
      const g = new THREE.CylinderGeometry(0.19, 0.19, 0.024, 24);
      g.rotateZ(Math.PI / 2);
      return g;
    });
    const discHatGeo = this.getGeo("brake_rotor_hat", () => {
      const g = new THREE.CylinderGeometry(0.082, 0.082, 0.034, 16);
      g.rotateZ(Math.PI / 2);
      return g;
    });

    const caliperGeo = this.getGeo(
      "brake_caliper_brembo",
      () => new THREE.BoxGeometry(0.08, 0.15, 0.07),
    );

    const createWheelAssembly = (isLeft) => {
      const assemblyPivot = new THREE.Group();

      // Pinza freno fissa (NON gira con la ruota, montata sul fusello)
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(isLeft ? -0.05 : 0.05, 0.13, 0.05);
      caliper.rotation.z = isLeft ? 0.25 : -0.25;
      assemblyPivot.add(caliper);

      // Gruppo ruota rotante
      const spinGroup = new THREE.Group();

      // Pneumatico con spalla radiale smussata
      const tireMesh = new THREE.Mesh(tireCylGeo, sm.tire);
      const tireEdgeOut = new THREE.Mesh(tireEdgeGeo, sm.tire);
      tireEdgeOut.position.x = isLeft ? 0.125 : -0.125;
      const tireEdgeIn = new THREE.Mesh(tireEdgeGeo, sm.tire);
      tireEdgeIn.position.x = isLeft ? -0.125 : 0.125;
      spinGroup.add(tireMesh, tireEdgeOut, tireEdgeIn);

      // Cerchio in lega forgiata
      const rimBarrel = new THREE.Mesh(rimBarrelGeo, rimMat);
      const rimLip = new THREE.Mesh(rimLipGeo, rimMat);
      rimLip.position.x = isLeft ? 0.13 : -0.13;
      const rimCenter = new THREE.Mesh(rimCenterGeo, rimMat);
      spinGroup.add(rimBarrel, rimLip, rimCenter);

      // 10 Razze sportive a V (5 coppie con spazio negativo)
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5;
        const sp1 = new THREE.Mesh(spokePairGeo, rimMat);
        sp1.rotation.x = angle + 0.08;
        sp1.position.set(isLeft ? 0.12 : -0.12, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12);

        const sp2 = new THREE.Mesh(spokePairGeo, rimMat);
        sp2.rotation.x = angle - 0.08;
        sp2.position.set(isLeft ? 0.12 : -0.12, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12);

        spinGroup.add(sp1, sp2);
      }

      // Disco freno autoventilato forato
      const discMat = sm.brakeDisc.clone();
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.x = isLeft ? -0.04 : 0.04;
      const discHat = new THREE.Mesh(discHatGeo, sm.carbon);
      discHat.position.x = isLeft ? -0.04 : 0.04;
      spinGroup.add(discMesh, discHat);

      if (typeof GraphicsEngine !== "undefined") {
        GraphicsEngine.registerBrakeDisc(discMesh);
      }

      assemblyPivot.add(spinGroup);
      wheelMeshes.push(spinGroup);

      return { assemblyPivot, spinGroup };
    };

    const frontRightAssembly = createWheelAssembly(false);
    frontRightPivot.add(frontRightAssembly.assemblyPivot);

    const frontLeftAssembly = createWheelAssembly(true);
    frontLeftPivot.add(frontLeftAssembly.assemblyPivot);

    const rearRightAssembly = createWheelAssembly(false);
    rearRightAssembly.assemblyPivot.position.set(-wheelX, 0.37, wheelZRear);
    rearRightAssembly.assemblyPivot.rotation.z = 0.026; // campanatura statica

    const rearLeftAssembly = createWheelAssembly(true);
    rearLeftAssembly.assemblyPivot.position.set(wheelX, 0.37, wheelZRear);
    rearLeftAssembly.assemblyPivot.rotation.z = -0.026;

    root.add(rearRightAssembly.assemblyPivot, rearLeftAssembly.assemblyPivot);

    root.userData = {
      bodyGroup,
      frontRightPivot,
      frontLeftPivot,
      wheelMeshes,
      brakelightMat,
      fiaRainLight,
      exhaustFlames: [flameL, flameR],
      speedTrails: [],
      underglowPlane: shadowPlane,
    };

    bodyGroup.traverse((child) => {
      if (child.isMesh && child !== shadowPlane) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    wheelMeshes.forEach((w) => {
      w.traverse((c) => {
        if (c.isMesh) c.castShadow = true;
      });
    });

    return root;
  },
};
