"use strict";

// =========================================================================
// 5. COSTRUTTORE PROCEDURALE CIRCUITI ARCADE, PORTALI NEON & LANDMARK F1
// =========================================================================
const TrackBuilder = {
  SAMPLE_COUNT: 1500,

  // ── Calcolo Metrico Unificato Griglia di Partenza FIA F1 ─────────────────────
  getGridSlotTransform(samples, totalLength, roadWidth, slotIndex, poleSide = "left") {
    const N = samples.length;
    const ds = totalLength / N;
    // Distanza metrica FIA: Pole a 10.0m prima del traguardo, passo costante di 8.0m tra le righe
    const slotDist = 10.0 + slotIndex * 8.0;
    const stepBackSamples = Math.max(1, Math.round(slotDist / ds));
    const sampleIndex = (N - stepBackSamples + N) % N;
    const sample = samples[sampleIndex];

    // Lato ufficiale FIA della Pole Position ('left' o 'right')
    const poleSign = poleSide === "right" ? 1 : -1;
    const colSign = (slotIndex % 2 === 0) ? poleSign : -poleSign;
    // Offset laterale: 2.4m dalla mezzeria (interasse colonne 4.8m, luce centrale 2.8m)
    const lateralOffset = colSign * 2.4;

    const point = sample.point.clone().addScaledVector(sample.right, lateralOffset);
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

    return {
      sampleIndex,
      lateralOffset,
      point,
      heading,
      u: sample.u,
      sample,
    };
  },

  buildTrackEnvironment(scene, trackConfig, refCarPhysics) {
    const trackGroup = new THREE.Group();
    scene.add(trackGroup);

    scene.background = new THREE.Color(trackConfig.skyBottom);
    scene.fog = null;

    if (typeof GraphicsEngine !== "undefined") {
      // buildAtmosphericSkyAndIBL aggiunge già skyMesh direttamente a scene.
      // NON usare trackGroup.add(): Three.js reparenterebbe il mesh togliendo-
      // lo dalla scene root e rompendo il rendering del cielo/IBL.
      GraphicsEngine.buildAtmosphericSkyAndIBL(scene, trackConfig);
    }

    // Terreno con finitura più vivace
    let minTrackY = 0;
    if (trackConfig.points && trackConfig.points.length > 0) {
      trackConfig.points.forEach((p) => {
        if (p[1] < minTrackY) minTrackY = p[1];
      });
    }

    const groundMat = new THREE.MeshStandardMaterial({
      color: trackConfig.groundColor,
      roughness: 0.82,
      metalness: 0.08,
    });
    const groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4200),
      groundMat,
    );
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = Math.min(-0.35, minTrackY - 0.45);
    groundPlane.receiveShadow = true;
    trackGroup.add(groundPlane);

    const rawPts = trackConfig.points.map(
      (p) => new THREE.Vector3(p[0], p[1], p[2]),
    );
    const curve = new THREE.CatmullRomCurve3(rawPts, true, "catmullrom", 0.28);

    const samples = [];
    const totalLength = curve.getLength();
    const halfWidth = trackConfig.roadWidth / 2;

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const wallPositions = [];
    const wallIndices = [];

    const deckPositions = [];
    const deckIndices = [];

    const gravelPositions = [];
    const gravelIndices = [];

    for (let i = 0; i <= this.SAMPLE_COUNT; i++) {
      const u = i / this.SAMPLE_COUNT;
      const pt = curve.getPointAt(u % 1);
      const tangent = curve.getTangentAt(u % 1).normalize();
      const worldUp = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3()
        .crossVectors(tangent, worldUp)
        .normalize();
      const normal = new THREE.Vector3()
        .crossVectors(right, tangent)
        .normalize();

      const isDRS = this.isUInDRSZones(u % 1, trackConfig.drsZones || []);

      if (i < this.SAMPLE_COUNT) {
        samples.push({
          u,
          point: pt.clone(),
          tangent: tangent.clone(),
          right: right.clone(),
          normal: normal.clone(),
          signedCurvature: 0,
          curvature: 0,
          racingOffset: 0,
          idealPoint: pt.clone(),
          targetSpeed: refCarPhysics.maxSpeed,
          isDRS: isDRS,
          isTurbo: i > 20 && (i % 160) < 16,
        });
      }

      const leftEdge = pt.clone().addScaledVector(right, -halfWidth);
      const rightEdge = pt.clone().addScaledVector(right, halfWidth);

      positions.push(leftEdge.x, leftEdge.y + 0.03, leftEdge.z);
      positions.push(rightEdge.x, rightEdge.y + 0.03, rightEdge.z);
      normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
      uvs.push(0, u, 1, u);

      // OffRoad (sterrato / via di fuga in ghiaia): allargato di ~2m per lato (+2.0m)
      const barrierOffset = halfWidth + 5.2;
      const bLeft = pt.clone().addScaledVector(right, -barrierOffset);
      const bRight = pt.clone().addScaledVector(right, barrierOffset);

      gravelPositions.push(bLeft.x, bLeft.y + 0.01, bLeft.z);
      gravelPositions.push(leftEdge.x, leftEdge.y + 0.01, leftEdge.z);
      gravelPositions.push(rightEdge.x, rightEdge.y + 0.01, rightEdge.z);
      gravelPositions.push(bRight.x, bRight.y + 0.01, bRight.z);

      wallPositions.push(
        bLeft.x,
        bLeft.y,
        bLeft.z,
        bLeft.x,
        bLeft.y + 1.15,
        bLeft.z,
      );
      wallPositions.push(
        bRight.x,
        bRight.y,
        bRight.z,
        bRight.x,
        bRight.y + 1.15,
        bRight.z,
      );

      deckPositions.push(bLeft.x, bLeft.y - 0.68, bLeft.z);
      deckPositions.push(bRight.x, bRight.y - 0.68, bRight.z);

      if (i < this.SAMPLE_COUNT) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        deckIndices.push(
          base,
          base + 2,
          base + 1,
          base + 1,
          base + 2,
          base + 3,
        );

        const wBase = i * 4;
        wallIndices.push(
          wBase,
          wBase + 1,
          wBase + 4,
          wBase + 1,
          wBase + 5,
          wBase + 4,
        );
        wallIndices.push(
          wBase + 2,
          wBase + 6,
          wBase + 3,
          wBase + 3,
          wBase + 6,
          wBase + 7,
        );

        const gBase = i * 4;
        gravelIndices.push(
          gBase,
          gBase + 1,
          gBase + 4,
          gBase + 1,
          gBase + 5,
          gBase + 4,
        );
        gravelIndices.push(
          gBase + 2,
          gBase + 3,
          gBase + 6,
          gBase + 3,
          gBase + 7,
          gBase + 6,
        );
      }
    }

    this.computeRacingLineAndSpeedProfile(
      samples,
      halfWidth,
      refCarPhysics,
      totalLength,
    );

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    roadGeo.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);

    const asphaltTex = ProceduralAssets.createAsphaltTexture(
      trackConfig.asphaltColor,
      trackConfig.curbColorA,
      trackConfig.curbColorB,
    );
    asphaltTex.repeat.set(1, 130);

    const normalMap =
      typeof GraphicsEngine !== "undefined" && GraphicsEngine.proceduralTextures
        ? GraphicsEngine.proceduralTextures.asphaltNormal
        : null;
    const roughnessMap =
      typeof GraphicsEngine !== "undefined" && GraphicsEngine.proceduralTextures
        ? GraphicsEngine.proceduralTextures.asphaltRoughness
        : null;

    const roadMat = new THREE.MeshPhysicalMaterial({
      map: asphaltTex,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: roughnessMap,
      roughness: 0.48,
      metalness: 0.22,
      envMapIntensity: 1.35,
      clearcoat: 0.22,
      clearcoatRoughness: 0.1,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.userData.isReflectiveRoad = true;
    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.setupPlanarReflection(scene);
      GraphicsEngine.bindReflectiveRoad(roadMesh);
    }
    trackGroup.add(roadMesh);

    const turboPads = this.buildTurboPads(trackGroup, samples);

    const gravelGeo = new THREE.BufferGeometry();
    gravelGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(gravelPositions, 3),
    );
    gravelGeo.setIndex(gravelIndices);
    gravelGeo.computeVertexNormals();
    const vergeColor =
      trackConfig.id === "silverstone" ? 0x334155 : 0xc2a878;
    trackGroup.add(
      new THREE.Mesh(
        gravelGeo,
        new THREE.MeshStandardMaterial({ color: vergeColor, roughness: 0.9 }),
      ),
    );

    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(deckPositions, 3),
    );
    deckGeo.setIndex(deckIndices);
    deckGeo.computeVertexNormals();
    trackGroup.add(
      new THREE.Mesh(
        deckGeo,
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }),
      ),
    );

    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(wallPositions, 3),
    );
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0x475569,
      metalness: 0.55,
      roughness: 0.35,
      clearcoat: 0.3,
      side: THREE.DoubleSide,
    });
    trackGroup.add(new THREE.Mesh(wallGeo, wallMat));

    // Racing Line Neon Strip (Ciano / Smeraldo su DRS)
    const rlPositions = [];
    const rlColors = [];
    const rlIndices = [];
    const colNormal = new THREE.Color(0x00f0ff);
    const colDRS = new THREE.Color(0x00ff88);

    for (let i = 0; i <= this.SAMPLE_COUNT; i++) {
      const s = samples[i % this.SAMPLE_COUNT];
      const pL = s.idealPoint.clone().addScaledVector(s.right, -1.1);
      const pR = s.idealPoint.clone().addScaledVector(s.right, 1.1);
      rlPositions.push(pL.x, pL.y + 0.06, pL.z, pR.x, pR.y + 0.06, pR.z);
      const c = s.isDRS ? colDRS : colNormal;
      rlColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < this.SAMPLE_COUNT) {
        const b = i * 2;
        rlIndices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const rlGeo = new THREE.BufferGeometry();
    rlGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(rlPositions, 3),
    );
    rlGeo.setAttribute("color", new THREE.Float32BufferAttribute(rlColors, 3));
    rlGeo.setIndex(rlIndices);
    trackGroup.add(
      new THREE.Mesh(
        rlGeo,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.32,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );

    const lightPods3D = this.buildStartFinishAndPitComplex(
      trackGroup,
      samples,
      trackConfig,
      halfWidth,
      totalLength,
    );

    this.buildDRSGatesAndBrakingBoards(
      trackGroup,
      samples,
      trackConfig,
      halfWidth,
      totalLength,
    );

    const animatedObjects = this.populateInstancedSceneryAndLandmarks(
      trackGroup,
      samples,
      trackConfig,
      halfWidth,
    );
    animatedObjects.turboPads = turboPads;

    this.buildStadiumBackdrop(trackGroup, samples, halfWidth, trackConfig);

    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.configureAtmosphericFog(
        scene,
        trackConfig.fogColor || 0x89c2ff,
        0.00008,
        0.8,
      );
      GraphicsEngine.applyHeightFog(scene);
    }

    return {
      trackGroup,
      curve,
      samples,
      totalLength,
      halfWidth,
      barrierOffset: halfWidth + 5.2,
      gravelWidth: 5.2,
      lightPods3D,
      animatedObjects,
    };
  },

  buildTurboPads(trackGroup, samples) {
    const group = new THREE.Group();
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0xff2a85,
      emissiveIntensity: 3.0,
      roughness: 0.15,
      metalness: 0.2,
    });
    const padGeo = new THREE.BoxGeometry(1.4, 0.045, 0.9);

    const transforms = [];
    const dummy = new THREE.Object3D();

    samples.forEach((sample) => {
      if (!sample.isTurbo) return;
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      for (let lane = -1; lane <= 1; lane++) {
        const pos = sample.point
          .clone()
          .addScaledVector(sample.right, lane * 1.65);
        pos.y += 0.08;
        transforms.push({ pos, yaw });
      }
    });

    if (transforms.length > 0) {
      const instMesh = new THREE.InstancedMesh(
        padGeo,
        padMaterial,
        transforms.length,
      );
      transforms.forEach((t, idx) => {
        dummy.position.copy(t.pos);
        dummy.rotation.set(0, t.yaw, 0);
        dummy.updateMatrix();
        instMesh.setMatrixAt(idx, dummy.matrix);
      });
      group.add(instMesh);
      // Passiamo un solo elemento in padMeshes così RaceEngine aggiorna il materiale condiviso 1 sola volta a frame!
      group.userData.padMeshes = [instMesh];
    } else {
      group.userData.padMeshes = [];
    }

    trackGroup.add(group);
    return group;
  },
  buildStadiumBackdrop(trackGroup, samples, halfWidth, trackConfig) {
    const stadiumGroup = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.26, 14, 8);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.75,
      roughness: 0.2,
    });
    const screenGeo = new THREE.BoxGeometry(9.5, 4.2, 0.3);
    const accentColor = new THREE.Color(
      (trackConfig && trackConfig.themeColor) || 0x00f0ff,
    );
    const screenMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.85,
      roughness: 0.2,
    });

    // Portali Neon Arcade lungo il circuito (campata oltre le vie di fuga)
    const archGeo = new THREE.TorusGeometry(
      halfWidth + 5.6,
      0.38,
      8,
      28,
      Math.PI,
    );
    const archMat = new THREE.MeshBasicMaterial({ color: accentColor });

    for (let i = 0; i < samples.length; i += 100) {
      const sample = samples[i];
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);

      if (i > 60 && i % 300 === 0) {
        const portal = new THREE.Mesh(archGeo, archMat);
        portal.position.copy(sample.point);
        portal.rotation.y = yaw;
        stadiumGroup.add(portal);
      }

      for (const side of [-1, 1]) {
        const base = sample.point
          .clone()
          .addScaledVector(sample.right, side * (halfWidth + 18));
        // Evita compenetrazioni con altri tratti di pista vicini
        if (this.isTooCloseToTrack(base, samples, halfWidth + 6.0)) continue;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.copy(base).add(new THREE.Vector3(0, 7, 0));
        stadiumGroup.add(pole);
        if (i % 200 === 0) {
          if (this.isTooCloseToTrack(base, samples, halfWidth + 8.5)) continue;
          const screen = new THREE.Mesh(screenGeo, screenMat);
          screen.position.copy(base).add(new THREE.Vector3(0, 10.5, 0));
          screen.rotation.y = yaw + (side < 0 ? Math.PI : 0);
          stadiumGroup.add(screen);
        }
      }
    }
    trackGroup.add(stadiumGroup);
  },

  isUInDRSZones(u, zones) {
    for (let z of zones) {
      if (z.startU <= z.endU) {
        if (u >= z.startU && u <= z.endU) return true;
      } else {
        if (u >= z.startU || u <= z.endU) return true;
      }
    }
    return false;
  },

  buildStartFinishAndPitComplex(trackGroup, samples, trackConfig, halfWidth, totalLength) {
    const startSample = samples[0];
    const gantryGroup = new THREE.Group();
    gantryGroup.position.copy(startSample.point);
    gantryGroup.rotation.y = Math.atan2(
      startSample.tangent.x,
      startSample.tangent.z,
    );

    const startPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(trackConfig.roadWidth - 1.2, 3.8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    startPlane.rotation.x = -Math.PI / 2;
    startPlane.position.y = 0.065;
    gantryGroup.add(startPlane);

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.25,
    });
    const pLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 9.2, 0.95),
      pillarMat,
    );
    const gantrySpan = halfWidth + 5.7;
    pLeft.position.set(-gantrySpan, 4.6, 0);
    const pRight = pLeft.clone();
    pRight.position.x = gantrySpan;

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry((gantrySpan + 0.5) * 2, 1.8, 1.3),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: new THREE.Color(trackConfig.themeColor),
        emissiveIntensity: 1.2,
      }),
    );
    banner.position.set(0, 8.3, 0);
    gantryGroup.add(pLeft, pRight, banner);

    const lightPods3D = [];
    for (let l = 0; l < 5; l++) {
      const podMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
      const pod = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 12),
        podMat,
      );
      pod.position.set((l - 2) * 1.45, 7.0, -0.7);
      gantryGroup.add(pod);
      lightPods3D.push(podMat);
    }
    trackGroup.add(gantryGroup);

    const N = samples.length;
    const effLength = totalLength || (N * 3.5);
    const ds = effLength / N;
    const poleSide = trackConfig.poleSide || "left";

    // Piazzole di Partenza FIA F1: box regolamentare 2.4m x 5.0m con linea frontale bianca di stop
    const boxGeo = new THREE.PlaneGeometry(2.4, 5.0);
    boxGeo.rotateX(-Math.PI / 2);

    const stopLineGeo = new THREE.PlaneGeometry(2.4, 0.42);
    stopLineGeo.rotateX(-Math.PI / 2);

    for (let slot = 0; slot < 12; slot++) {
      const trans = this.getGridSlotTransform(samples, effLength, trackConfig.roadWidth, slot, poleSide);
      const slotGroup = new THREE.Group();
      slotGroup.position.set(trans.point.x, trans.point.y + 0.045, trans.point.z);
      slotGroup.rotation.y = trans.heading;

      // Linea di arresto frontale bianca (stop line FIA)
      const stopLineMesh = new THREE.Mesh(
        stopLineGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      stopLineMesh.position.set(0, 0.005, 2.3);
      slotGroup.add(stopLineMesh);

      // Box piazzola (Pole dorata 0xffbe0b, altre ciano 0x00f0ff)
      const boxMesh = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({
          color: slot === 0 ? 0xffbe0b : 0x00f0ff,
          wireframe: true,
        }),
      );
      slotGroup.add(boxMesh);

      trackGroup.add(slotGroup);
    }

    // Allineamento realistico: il centro dei box si trova a metà griglia (~54m prima del traguardo)
    const pitDist = 54.0;
    const pitStepBack = Math.max(1, Math.round(pitDist / ds));
    const pitSampleIdx = (N - pitStepBack + N) % N;
    const pitSample = samples[pitSampleIdx];
    const pitPos = pitSample.point
      .clone()
      .addScaledVector(pitSample.right, halfWidth + 11.5);
    const pitFront = pitPos.clone().addScaledVector(pitSample.tangent, 45);
    const pitBack = pitPos.clone().addScaledVector(pitSample.tangent, -45);

    const safe =
      !this.isTooCloseToTrack(pitPos, samples, halfWidth + 6.0, pitSampleIdx, 80) &&
      !this.isTooCloseToTrack(pitFront, samples, halfWidth + 6.0, pitSampleIdx, 80) &&
      !this.isTooCloseToTrack(pitBack, samples, halfWidth + 6.0, pitSampleIdx, 80);

    if (safe) {
      const pitGroup = new THREE.Group();
      pitGroup.position.copy(pitPos);
      pitGroup.rotation.y = Math.atan2(pitSample.tangent.x, pitSample.tangent.z);

      const pitBuilding = new THREE.Mesh(
        new THREE.BoxGeometry(10, 9.5, 95),
        new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.5,
          roughness: 0.3,
        }),
      );
      pitBuilding.position.set(0, 4.75, 0);

      const pitRoof = new THREE.Mesh(
        new THREE.BoxGeometry(14, 1.2, 102),
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: new THREE.Color(trackConfig.themeColor),
          emissiveIntensity: 0.85,
        }),
      );
      pitRoof.position.set(-1.5, 9.8, 0);
      if (trackConfig.id === "silverstone") {
        pitRoof.rotation.x = -0.08;
        pitRoof.rotation.z = 0.14;
      }

      const pitGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 3.8, 92),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x00f0ff,
          emissiveIntensity: 0.85,
        }),
      );
      pitGlass.position.set(-5.05, 6.2, 0);

      pitGroup.add(pitBuilding, pitRoof, pitGlass);
      trackGroup.add(pitGroup);
    }

    return lightPods3D;
  },

  buildDRSGatesAndBrakingBoards(
    trackGroup,
    samples,
    trackConfig,
    halfWidth,
    totalLength,
  ) {
    const N = samples.length;

    (trackConfig.drsZones || []).forEach((zone) => {
      const idx = Math.floor((zone.startU % 1) * N);
      const s = samples[idx];
      const archSpan = halfWidth + 5.7;
      const pLPos = s.point.clone().addScaledVector(s.right, -archSpan);
      const pRPos = s.point.clone().addScaledVector(s.right, archSpan);

      if (
        this.isPointOnRoad(pLPos, samples, halfWidth, 4.0, 0.2) ||
        this.isPointOnRoad(pRPos, samples, halfWidth, 4.0, 0.2)
      ) {
        return;
      }

      const archGroup = new THREE.Group();
      archGroup.position.copy(s.point);
      archGroup.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);

      const postGeo = new THREE.BoxGeometry(0.55, 7.0, 0.55);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x064e3b });
      const pL = new THREE.Mesh(postGeo, postMat);
      pL.position.set(-archSpan, 3.5, 0);
      const pR = pL.clone();
      pR.position.x = archSpan;

      const topBeam = new THREE.Mesh(
        new THREE.BoxGeometry((archSpan + 0.3) * 2, 1.0, 0.8),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 }),
      );
      topBeam.position.set(0, 7.0, 0);
      archGroup.add(pL, pR, topBeam);
      trackGroup.add(archGroup);
    });

    const ds = totalLength / N;
    const boardColors = [0xff1e56, 0xffbe0b, 0x00f0ff];
    const boardGeo = new THREE.BoxGeometry(1.6, 1.25, 0.2);

    let cooldown = 0;
    for (let i = 0; i < N; i++) {
      if (cooldown > 0) {
        cooldown--;
        continue;
      }
      const sNow = samples[i];
      const sAhead = samples[(i + 25) % N];
      if (
        sNow.targetSpeed - sAhead.targetSpeed > 14 &&
        sAhead.curvature > 0.08
      ) {
        const outsideSign = -Math.sign(sAhead.signedCurvature || 1);
        [50, 100, 150].forEach((distMeters, bIdx) => {
          const stepBack = Math.round(distMeters / ds);
          const bSampleIdx = (i - stepBack + N) % N;
          const bSample = samples[bSampleIdx];
          const bPos = bSample.point
            .clone()
            .addScaledVector(bSample.right, outsideSign * (halfWidth + 4.8));
          if (this.isPointOnRoad(bPos, samples, halfWidth, 3.5, 0.4)) {
            return;
          }
          const board = new THREE.Mesh(
            boardGeo,
            new THREE.MeshBasicMaterial({ color: boardColors[bIdx] }),
          );
          board.position.set(bPos.x, bPos.y + 0.8, bPos.z);
          board.rotation.y = Math.atan2(bSample.tangent.x, bSample.tangent.z);
          trackGroup.add(board);
        });
        cooldown = 65;
      }
    }
  },

  computeRacingLineAndSpeedProfile(samples, halfWidth, phys, totalLength) {
    const N = samples.length;
    const ds = totalLength / N;

    // Baseline di curvatura ~costante in METRI (non in campioni!): il passo dei
    // campioni varia da ~1.7 m (Monza) a ~4.7 m (Spa). Con una base fissa di 18
    // campioni (= 30 m a Monza ma 84 m a Spa) i tornanti dei circuiti lunghi
    // venivano "mediati via": l'IA li credeva molto più larghi del reale,
    // entrava troppo veloce e finiva largo nel gravel/muro.
    const halfBase = THREE.MathUtils.clamp(Math.round(15 / ds), 3, 9);
    const curvatureBaseMeters = halfBase * 2 * ds;
    // Distanza (~60 m) usata per il posizionamento largo in ingresso/uscita.
    const aheadStep = THREE.MathUtils.clamp(Math.round(60 / ds), 8, 48);
    const rawCurv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const prev = samples[(i - halfBase + N) % N];
      const next = samples[(i + halfBase) % N];
      const crossY =
        prev.tangent.z * next.tangent.x - prev.tangent.x * next.tangent.z;
      const angle = prev.tangent.angleTo(next.tangent);
      rawCurv[i] = Math.sign(crossY) * angle;
    }

    // Use most of the track width so the ideal line really goes wide on entry,
    // clips the apex and opens up on exit (previously only 66% -> slow corners).
    const maxLineOffset = halfWidth * 0.88;
    const rawOffset = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const cHere = rawCurv[i];
      const cAhead = rawCurv[(i + aheadStep) % N];
      const cBehind = rawCurv[(i - aheadStep + N) % N];

      samples[i].signedCurvature = cHere;
      samples[i].curvature = Math.abs(cHere);
      // Curvatura per metro (kappa): precalcolata con la base corretta, così il
      // motore di gara non deve più assumere la base di 18 campioni.
      samples[i].kappaPerMeter = Math.abs(cHere) / curvatureBaseMeters;

      // NB: signedCurvature > 0 è una curva a DESTRA, < 0 a SINISTRA, mentre
      // `right` è il vettore laterale del campione. La traiettoria ideale deve
      // stare ALL'INTERNO all'apice (quindi con segno OPPOSTO alla curvatura)
      // e ALL'ESTERNO in ingresso/uscita (stesso segno della curvatura).
      let targetLat = THREE.MathUtils.clamp(
        -cHere * 18.0,
        -maxLineOffset,
        maxLineOffset,
      );
      if (Math.abs(cHere) < 0.08 && Math.abs(cAhead) > 0.14) {
        targetLat = THREE.MathUtils.clamp(
          cAhead * 10.5,
          -maxLineOffset * 0.75,
          maxLineOffset * 0.75,
        );
      } else if (Math.abs(cHere) < 0.08 && Math.abs(cBehind) > 0.14) {
        targetLat = THREE.MathUtils.clamp(
          cBehind * 10.5,
          -maxLineOffset * 0.75,
          maxLineOffset * 0.75,
        );
      }
      rawOffset[i] = targetLat;
    }

    // Finestra di smoothing ~costante in METRI (~±25 m). Con una finestra fissa
    // di ±10 campioni (= ±17 m a Monza ma ±47 m a Spa) i tornanti dei circuiti
    // lunghi venivano spianati fino a quasi azzerare l'escursione della linea.
    const smoothWin = THREE.MathUtils.clamp(Math.round(25 / ds), 4, 14);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = -smoothWin; k <= smoothWin; k++) {
        sum += rawOffset[(i + k + N) % N];
      }
      const smoothOff = sum / (smoothWin * 2 + 1);
      samples[i].racingOffset = smoothOff;
      samples[i].idealPoint = samples[i].point
        .clone()
        .addScaledVector(samples[i].right, smoothOff);
    }

    for (let i = 0; i < N; i++) {
      const kappaPerMeter = samples[i].kappaPerMeter;
      if (kappaPerMeter < 0.0014) {
        samples[i].targetSpeed = phys.maxSpeed;
      } else {
        const vCorner = Math.sqrt((phys.gripLateral * 1.44) / kappaPerMeter);
        samples[i].targetSpeed = THREE.MathUtils.clamp(
          vCorner,
          16.0,
          phys.maxSpeed,
        );
      }
    }

    const maxBrakeDecel = (phys.brakeForce / phys.mass) * 0.92;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const next = samples[(i + 1) % N];
        const vAllowed = Math.sqrt(
          next.targetSpeed * next.targetSpeed + 2 * maxBrakeDecel * ds,
        );
        if (vAllowed < samples[i].targetSpeed) {
          samples[i].targetSpeed = vAllowed;
        }
      }
    }
  },

  // ── PRNG deterministico (mulberry32) per scenery identico su ogni client LAN ─
  createSeededRandom(seedString) {
    let h = 1779033703 ^ seedString.length;
    for (let i = 0; i < seedString.length; i++) {
      h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  populateInstancedSceneryAndLandmarks(
    trackGroup,
    samples,
    trackConfig,
    halfWidth,
  ) {
    const dummy = new THREE.Object3D();
    const animatedObjects = {};
    // Seed dal track id: stessa pista → stessa decorazione su ogni client
    const rng = this.createSeededRandom(String(trackConfig.id || "track"));

    const kerbLocations = [];
    const tireLocations = [];
    for (let i = 0; i < samples.length; i += 2) {
      if (samples[i].curvature > 0.08) {
        const side = Math.sign(samples[i].signedCurvature) || 1;
        kerbLocations.push({ sample: samples[i], side });
        if (i % 4 === 0) {
          tireLocations.push({ sample: samples[i], side: -side, sampleIdx: i });
        }
      }
    }

    if (kerbLocations.length > 0) {
      const kerbGeo = new THREE.BoxGeometry(1.2, 0.18, 1.85);
      const kerbMatA = new THREE.MeshStandardMaterial({
        color: trackConfig.curbColorA,
        roughness: 0.4,
      });
      const kerbMatB = new THREE.MeshStandardMaterial({
        color: trackConfig.curbColorB,
        roughness: 0.4,
      });

      const countA = Math.ceil(kerbLocations.length / 2);
      const countB = Math.floor(kerbLocations.length / 2);
      const meshA = new THREE.InstancedMesh(kerbGeo, kerbMatA, countA);
      const meshB =
        countB > 0 ? new THREE.InstancedMesh(kerbGeo, kerbMatB, countB) : null;

      let ia = 0,
        ib = 0;
      kerbLocations.forEach((k, idx) => {
        const pos = k.sample.point
          .clone()
          .addScaledVector(k.sample.right, k.side * (halfWidth - 0.35));
        dummy.position.set(pos.x, pos.y + 0.08, pos.z);
        dummy.rotation.set(
          0,
          Math.atan2(k.sample.tangent.x, k.sample.tangent.z),
          0,
        );
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        if (idx % 2 === 0) meshA.setMatrixAt(ia++, dummy.matrix);
        else if (meshB) meshB.setMatrixAt(ib++, dummy.matrix);
      });
      trackGroup.add(meshA);
      if (meshB) trackGroup.add(meshB);
    }

    // Barriere esterne Curve con bagliore Neon Arcade (con controllo anticollisione)
    const validTireLocations = [];
    tireLocations.forEach((t) => {
      const pos = t.sample.point
        .clone()
        .addScaledVector(t.sample.right, t.side * (halfWidth + 4.65));
      if (!this.isPointOnRoad(pos, samples, halfWidth, 3.5, 0.4)) {
        validTireLocations.push({ ...t, pos });
      }
    });

    if (validTireLocations.length > 0) {
      const tireGeo = new THREE.BoxGeometry(1.1, 1.35, 2.2);
      const tireMat = new THREE.MeshStandardMaterial({
        color: 0xff1e56,
        emissive: 0xff0044,
        emissiveIntensity: 0.65,
        roughness: 0.35,
      });
      const tireInst = new THREE.InstancedMesh(
        tireGeo,
        tireMat,
        validTireLocations.length,
      );
      validTireLocations.forEach((t, idx) => {
        dummy.position.set(t.pos.x, t.pos.y + 0.68, t.pos.z);
        dummy.rotation.set(
          0,
          Math.atan2(t.sample.tangent.x, t.sample.tangent.z),
          0,
        );
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        tireInst.setMatrixAt(idx, dummy.matrix);
      });
      trackGroup.add(tireInst);
    }

    if (trackConfig.id === "suzuka") {
      animatedObjects.ferrisWheel =
        this.buildSuzukaFerrisWheelAndBridge(trackGroup);
    } else if (trackConfig.id === "monza") {
      this.buildMonzaSopraelevataBanking(trackGroup);
    }

    if (trackConfig.sceneryType === "city") {
      const buildingTransforms = [];
      for (let i = 0; i < samples.length; i += 20) {
        const s = samples[i];
        for (let side of [-1, 1]) {
          const dist = halfWidth + 18 + rng() * 26;
          const pos = s.point.clone().addScaledVector(s.right, side * dist);
          if (this.isTooCloseToTrack(pos, samples, halfWidth + 18, i, 30)) continue;
          buildingTransforms.push({
            x: pos.x,
            z: pos.z,
            h: 28 + rng() * 56,
            w: 12 + rng() * 10,
          });
        }
      }

      if (buildingTransforms.length > 0) {
        const bGeo = new THREE.BoxGeometry(1, 1, 1);
        const bMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: 0x00f0ff,
          emissiveIntensity: 0.38,
          roughness: 0.3,
        });
        const bInst = new THREE.InstancedMesh(
          bGeo,
          bMat,
          buildingTransforms.length,
        );
        buildingTransforms.forEach((b, idx) => {
          dummy.position.set(b.x, b.h / 2, b.z);
          dummy.scale.set(b.w, b.h, b.w);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          bInst.setMatrixAt(idx, dummy.matrix);
        });
        trackGroup.add(bInst);
      }
    } else {
      let minTrackY = 0;
      if (trackConfig.points && trackConfig.points.length > 0) {
        trackConfig.points.forEach((p) => {
          if (p[1] < minTrackY) minTrackY = p[1];
        });
      }
      const groundY = Math.min(-0.35, minTrackY - 0.45);

      const treePositions = [];
      const standTransforms = [];

      for (let i = 0; i < samples.length; i += 18) {
        const s = samples[i];
        for (let side of [-1, 1]) {
          const dist = halfWidth + 18 + rng() * 44;
          const pos = s.point.clone().addScaledVector(s.right, side * dist);
          if (this.isTooCloseToTrack(pos, samples, halfWidth + 14, i, 8)) continue;
          treePositions.push({
            x: pos.x,
            y: groundY,
            z: pos.z,
            scale: 0.85 + rng() * 0.55,
          });
        }

        if (i % 150 === 36) {
          const pos = s.point
            .clone()
            .addScaledVector(s.right, -(halfWidth + 18));
          if (!this.isTooCloseToTrack(pos, samples, halfWidth + 16, i, 45)) {
            standTransforms.push({
              pos,
              yaw: Math.atan2(s.tangent.x, s.tangent.z),
            });
          }
        }
      }

      if (treePositions.length > 0) {
        const trunkGeo = new THREE.CylinderGeometry(0.45, 0.65, 4, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
          color: 0x4a2f1d,
          roughness: 0.9,
        });
        const crownGeo = new THREE.ConeGeometry(4.0, 11, 7);
        const crownMat = new THREE.MeshStandardMaterial({
          color: trackConfig.id === "spa" ? 0x107c41 : 0x16a34a,
          roughness: 0.68,
        });

        const trunkInst = new THREE.InstancedMesh(
          trunkGeo,
          trunkMat,
          treePositions.length,
        );
        const crownInst = new THREE.InstancedMesh(
          crownGeo,
          crownMat,
          treePositions.length,
        );

        treePositions.forEach((t, idx) => {
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(t.scale);
          dummy.position.set(t.x, t.y + 2 * t.scale, t.z);
          dummy.updateMatrix();
          trunkInst.setMatrixAt(idx, dummy.matrix);

          dummy.position.set(t.x, t.y + 8.2 * t.scale, t.z);
          dummy.updateMatrix();
          crownInst.setMatrixAt(idx, dummy.matrix);
        });
        trackGroup.add(trunkInst, crownInst);
      }

      if (standTransforms.length > 0) {
        const standGeo = new THREE.BoxGeometry(9, 7.0, 36);
        const standMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: new THREE.Color(trackConfig.themeColor),
          emissiveIntensity: 0.28,
          roughness: 0.45,
        });
        const standInst = new THREE.InstancedMesh(
          standGeo,
          standMat,
          standTransforms.length,
        );
        standTransforms.forEach((st, idx) => {
          dummy.position.set(st.pos.x, st.pos.y + 3.5, st.pos.z);
          dummy.rotation.set(0, st.yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          standInst.setMatrixAt(idx, dummy.matrix);
        });
        trackGroup.add(standInst);
      }
    }

    return animatedObjects;
  },

  buildSuzukaFerrisWheelAndBridge(trackGroup) {
    // Ruota Panoramica di Suzuka posizionata nell'infield a distanza di sicurezza (>50m da ogni tratto di pista)
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(-130, 0, 130);
    wheelGroup.rotation.y = 0.45;

    const legMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.6,
    });
    const legL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.4, 52, 8),
      legMat,
    );
    legL.position.set(-6, 24, 0);
    legL.rotation.z = -0.14;
    const legR = legL.clone();
    legR.position.x = 6;
    legR.rotation.z = 0.14;
    wheelGroup.add(legL, legR);

    const rotor = new THREE.Group();
    rotor.position.set(0, 48, 0);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(32, 1.0, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
    );
    rim.rotation.y = Math.PI / 2;
    rotor.add(rim);

    const spokeMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
    for (let s = 0; s < 12; s++) {
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 64, 6),
        spokeMat,
      );
      spoke.rotation.x = (s / 12) * Math.PI;
      rotor.add(spoke);
    }

    wheelGroup.add(rotor);
    trackGroup.add(wheelGroup);

    // Traliccio metallico sul punto esatto di incrocio del Cavalcavia (x=78, y=9.8, z=-138)
    const trussGroup = new THREE.Group();
    trussGroup.position.set(78, 9.8, -138);
    trussGroup.rotation.y = -0.36;
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0xff1e56,
      emissive: 0xff0044,
      emissiveIntensity: 0.5,
      metalness: 0.5,
      roughness: 0.3,
    });
    const archL = new THREE.Mesh(new THREE.BoxGeometry(36, 1.2, 0.9), trussMat);
    archL.position.set(0, 6.5, -11.5);
    const archR = archL.clone();
    archR.position.z = 11.5;
    trussGroup.add(archL, archR);
    trackGroup.add(trussGroup);

    return rotor;
  },

  buildMonzaSopraelevataBanking(trackGroup) {
    const bankGeo = new THREE.BoxGeometry(340, 1.2, 14);
    const bankMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
    });
    const banking = new THREE.Mesh(bankGeo, bankMat);
    banking.position.set(210, 4.2, 168);
    banking.rotation.x = 0.45;
    trackGroup.add(banking);
  },

  isPointOnRoad(pos, samples, halfWidth, maxDy = 3.5, buffer = 0.4) {
    const N = samples.length;
    const maxLat = halfWidth + buffer;
    const maxDistSq = (maxLat + 2.5) * (maxLat + 2.5);
    for (let j = 0; j < N; j++) {
      const s = samples[j];
      const dx = pos.x - s.point.x;
      const dz = pos.z - s.point.z;
      if (dx * dx + dz * dz > maxDistSq) continue;
      const dy = Math.abs(pos.y - s.point.y);
      if (dy > maxDy) continue;
      const relX = pos.x - s.point.x;
      const relY = pos.y - s.point.y;
      const relZ = pos.z - s.point.z;
      const along = Math.abs(
        relX * s.tangent.x + relY * s.tangent.y + relZ * s.tangent.z,
      );
      if (along <= 1.25) {
        const lat = Math.abs(
          relX * s.right.x + relY * s.right.y + relZ * s.right.z,
        );
        if (lat < maxLat) return true;
      }
    }
    return false;
  },

  isTooCloseToTrack(pos, samples, minAllowedDist, excludeSampleIdx = -1, excludeRadius = 45) {
    const minSq = minAllowedDist * minAllowedDist;
    const N = samples.length;
    for (let i = 0; i < N; i++) {
      if (excludeSampleIdx >= 0) {
        const diff = Math.abs(i - excludeSampleIdx);
        const wrapDiff = Math.min(diff, N - diff);
        if (wrapDiff < excludeRadius) continue;
      }
      const dx = pos.x - samples[i].point.x;
      const dz = pos.z - samples[i].point.z;
      if (dx * dx + dz * dz < minSq) return true;
    }
    return false;
  },
};
