"use strict";

// =============================================================================
// TILE TRACK BUILDER — Sistema Modulare Stile Trackmania / LEGO
// =============================================================================
// Ogni circuito è definito come sequenza di TILES (blocchi prefabbricati 20×20).
// Il generatore assembla i blocchi concatenando automaticamente le coordinate
// di uscita del blocco precedente con l'ingresso del successivo.
//
// TILE TYPES:
//   straight      → rettilineo standard (N unità lunghi)
//   turbo         → rettilineo con turbo pad centrali
//   turn90        → curva 90° (direction: 'left'|'right')
//   banked        → curva parabolica con banking 45° (direction: 'left'|'right')
//   ramp          → rampa di lancio con atterraggio ammortizzato
//   looping       → anello verticale completo (360°)
//   chicane       → chicane sinistra-destra in sequenza rapida
// =============================================================================

const TileTrackBuilder = {

  // ── Dimensioni standard blocco ──────────────────────────────────────────────
  TILE_W: 20,          // larghezza corsia (m)
  SAMPLE_STEP: 0.5,    // campionamento curva ogni 0.5m per fisica/AI

  // ── Geometrie riutilizzabili (create una volta) ──────────────────────────────
  _geoCache: {},
  _matCache: {},

  // ---------------------------------------------------------------------------
  // ENTRY POINT: costruisce l'intero ambiente pista dal layout tile
  // ---------------------------------------------------------------------------
  buildTileEnvironment(scene, tileTrackConfig, refCarPhysics) {
    const trackGroup = new THREE.Group();
    scene.add(trackGroup);

    scene.background = new THREE.Color(tileTrackConfig.skyBottom || "#1a2a4a");
    scene.fog = null;

    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.buildAtmosphericSkyAndIBL(scene, tileTrackConfig);
    }

    // Terreno base infinito
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({
        color: tileTrackConfig.groundColor || 0x1a3020,
        roughness: 0.88,
        metalness: 0.04,
      })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.4;
    groundMesh.receiveShadow = true;
    trackGroup.add(groundMesh);

    // ── Genera la catena di tile ───────────────────────────────────────────────
    const { samples, totalLength } = this._buildTileChain(
      tileTrackConfig.layout,
      trackGroup,
      tileTrackConfig,
      refCarPhysics
    );

    // ── Post-process samples: racing line + speed profile ────────────────────
    this._computeRacingLine(samples, this.TILE_W / 2, refCarPhysics, totalLength);

    // ── Arredo pista: portali, tribune, luci stadio ──────────────────────────
    const animatedObjects = {};
    const halfWidth = this.TILE_W / 2;

    this._buildStadiumDecorations(trackGroup, samples, halfWidth, tileTrackConfig);
    const turboPads = this._buildTurboPads(trackGroup, samples);
    animatedObjects.turboPads = turboPads;

    const lightPods3D = this._buildStartGantry(trackGroup, samples, halfWidth, tileTrackConfig);

    // ── Asset GLTF esterni con fallback geometrico ───────────────────────────
    this._loadExternalAssetsWithFallback(trackGroup, samples, halfWidth, tileTrackConfig);

    // ── Fog atmosferica ───────────────────────────────────────────────────────
    if (typeof GraphicsEngine !== "undefined") {
      GraphicsEngine.configureAtmosphericFog(scene, tileTrackConfig.fogColor || 0x89c2ff, 0.00009);
    }

    return {
      trackGroup,
      samples,
      totalLength,
      halfWidth,
      lightPods3D,
      animatedObjects,
      curve: null, // compatibilità con RaceEngine (usa samples direttamente)
    };
  },

  // ---------------------------------------------------------------------------
  // TILE CHAIN BUILDER — Assembla i blocchi sequenzialmente
  // ---------------------------------------------------------------------------
  _buildTileChain(layout, trackGroup, config, refCarPhysics) {
    const allSamples = [];
    let totalLength = 0;

    // Stato del cursore: dove ci troviamo e in che direzione guardiamo
    let cursorPos  = new THREE.Vector3(0, 0, 0);
    let cursorYaw  = 0; // angolo in radianti (0 = asse +Z)

    const roadMeshes = [];

    for (let ti = 0; ti < layout.length; ti++) {
      const tile = layout[ti];
      const repeat = tile.repeat || tile.length || 1;

      for (let r = 0; r < repeat; r++) {
        const result = this._buildSingleTile(tile, cursorPos, cursorYaw, trackGroup, config, ti);

        // Merge samples
        for (const s of result.samples) {
          s.u = (totalLength + s.localDist) / 1; // sarà normalizzato dopo
          allSamples.push(s);
        }
        totalLength += result.length;

        // Aggiorna cursore
        cursorPos = result.exitPos.clone();
        cursorYaw = result.exitYaw;

        if (result.roadMesh) roadMeshes.push(result.roadMesh);
      }
    }

    // Chiusura loop: aggiunge samples di chiusura che puntano all'inizio
    const closeCount = 12;
    const lastS = allSamples[allSamples.length - 1];
    const firstS = allSamples[0];
    for (let c = 0; c < closeCount; c++) {
      const t = (c + 1) / closeCount;
      const pos = lastS.point.clone().lerp(firstS.point, t);
      const tang = firstS.point.clone().sub(lastS.point).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(tang, up).normalize();
      allSamples.push({
        point: pos,
        tangent: tang.clone(),
        right: right.clone(),
        normal: up.clone(),
        u: 0,
        localDist: 0,
        isTurbo: false,
        isDRS: false,
        curvature: 0,
        signedCurvature: 0,
        racingOffset: 0,
        idealPoint: pos.clone(),
        targetSpeed: refCarPhysics.maxSpeed,
        tileType: "close",
        hasTurboTrigger: false,
        rampHeight: 0,
      });
    }

    // Normalizza u (0..1)
    for (let i = 0; i < allSamples.length; i++) {
      allSamples[i].u = i / allSamples.length;
    }

    return { samples: allSamples, totalLength };
  },

  // ---------------------------------------------------------------------------
  // SINGOLO TILE: genera geometria + samples per un blocco
  // ---------------------------------------------------------------------------
  _buildSingleTile(tile, startPos, startYaw, trackGroup, config, tileIndex) {
    const type = tile.type;
    switch (type) {
      case "straight": return this._tileStraight(tile, startPos, startYaw, trackGroup, config, false);
      case "turbo":    return this._tileStraight(tile, startPos, startYaw, trackGroup, config, true);
      case "turn90":   return this._tileTurn90(tile, startPos, startYaw, trackGroup, config);
      case "banked":   return this._tileBanked(tile, startPos, startYaw, trackGroup, config);
      case "ramp":     return this._tileRamp(tile, startPos, startYaw, trackGroup, config);
      case "looping":  return this._tileLooping(tile, startPos, startYaw, trackGroup, config);
      case "chicane":  return this._tileChicane(tile, startPos, startYaw, trackGroup, config);
      default:         return this._tileStraight(tile, startPos, startYaw, trackGroup, config, false);
    }
  },

  // ── RETTILINEO ──────────────────────────────────────────────────────────────
  _tileStraight(tile, startPos, startYaw, trackGroup, config, isTurbo) {
    const len = (tile.length || 1) * this.TILE_W;
    const W   = this.TILE_W;
    const hw  = W / 2;

    const dir = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);

    // ── Mesh asfalto ──
    const positions = [], normals = [], uvs = [], indices = [];
    const wallPos = [], wallIdx = [];
    const sampleCount = Math.max(4, Math.round(len / this.SAMPLE_STEP));
    const samples = [];

    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const d = t * len;
      const pt = startPos.clone().addScaledVector(dir, d);

      const l = pt.clone().addScaledVector(right, -hw);
      const r = pt.clone().addScaledVector(right,  hw);
      positions.push(l.x, l.y + 0.03, l.z, r.x, r.y + 0.03, r.z);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, t * (len / W), 1, t * (len / W));

      const bL = pt.clone().addScaledVector(right, -(hw + 3.0));
      const bR = pt.clone().addScaledVector(right,   hw + 3.0);
      wallPos.push(bL.x, bL.y, bL.z, bL.x, bL.y + 1.2, bL.z);
      wallPos.push(bR.x, bR.y, bR.z, bR.x, bR.y + 1.2, bR.z);

      if (i < sampleCount) {
        const b = i * 2;
        indices.push(b, b+1, b+2, b+1, b+3, b+2);
        const wb = i * 4;
        wallIdx.push(wb, wb+1, wb+4, wb+1, wb+5, wb+4);
        wallIdx.push(wb+2, wb+6, wb+3, wb+3, wb+6, wb+7);
      }

      if (i < sampleCount) {
        samples.push({
          point: pt.clone(),
          tangent: dir.clone(),
          right: right.clone(),
          normal: new THREE.Vector3(0, 1, 0),
          localDist: d,
          isTurbo: isTurbo,
          isDRS: false,
          curvature: 0,
          signedCurvature: 0,
          racingOffset: 0,
          idealPoint: pt.clone(),
          targetSpeed: 0,
          tileType: isTurbo ? "turbo" : "straight",
          hasTurboTrigger: isTurbo,
          rampHeight: 0,
        });
      }
    }

    this._commitRoadMesh(positions, normals, uvs, indices, wallPos, wallIdx, trackGroup, config);

    // Guardrail metallici
    this._addGuardrails(trackGroup, startPos, dir, right, hw, len, config);

    // Cartelloni pubblicitari ogni ~40m
    this._addBillboards(trackGroup, startPos, dir, right, hw, len, config);

    const exitPos = startPos.clone().addScaledVector(dir, len);
    return { samples, length: len, exitPos, exitYaw: startYaw };
  },

  // ── CURVA 90° ───────────────────────────────────────────────────────────────
  _tileTurn90(tile, startPos, startYaw, trackGroup, config) {
    const isLeft = tile.direction === "left";
    const sign   = isLeft ? 1 : -1;
    const R      = this.TILE_W * 1.25; // raggio centro pista
    const hw     = this.TILE_W / 2;
    const STEPS  = 32;
    const totalAngle = Math.PI / 2;

    const dir   = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);

    // centro dell'arco
    const center = startPos.clone().addScaledVector(right, sign * R);

    const positions = [], normals = [], uvs = [], indices = [];
    const wallPos = [], wallIdx = [];
    const samples = [];
    let arcLen = 0;

    for (let i = 0; i <= STEPS; i++) {
      const angle = (i / STEPS) * totalAngle * sign;
      const localDir = new THREE.Vector3(
        dir.x * Math.cos(-angle) - dir.z * Math.sin(-angle),
        0,
        dir.x * Math.sin(-angle) + dir.z * Math.cos(-angle)
      );
      const localRight = new THREE.Vector3(localDir.z, 0, -localDir.x);
      const pt = center.clone()
        .sub(new THREE.Vector3(localRight.x, 0, localRight.z).multiplyScalar(sign * R));

      const l = pt.clone().addScaledVector(localRight, -hw);
      const r = pt.clone().addScaledVector(localRight,  hw);
      positions.push(l.x, l.y + 0.03, l.z, r.x, r.y + 0.03, r.z);
      normals.push(0, 1, 0, 0, 1, 0);
      const u = i / STEPS;
      uvs.push(0, u * 2.5, 1, u * 2.5);

      const bL = pt.clone().addScaledVector(localRight, -(hw + 3.0));
      const bR = pt.clone().addScaledVector(localRight,   hw + 3.0);
      wallPos.push(bL.x, bL.y, bL.z, bL.x, bL.y + 1.2, bL.z);
      wallPos.push(bR.x, bR.y, bR.z, bR.x, bR.y + 1.2, bR.z);

      if (i < STEPS) {
        const b = i * 2;
        indices.push(b, b+1, b+2, b+1, b+3, b+2);
        const wb = i * 4;
        wallIdx.push(wb, wb+1, wb+4, wb+1, wb+5, wb+4);
        wallIdx.push(wb+2, wb+6, wb+3, wb+3, wb+6, wb+7);
        arcLen += (R * totalAngle) / STEPS;
      }

      if (i < STEPS) {
        samples.push({
          point: pt.clone(),
          tangent: localDir.clone(),
          right: localRight.clone(),
          normal: new THREE.Vector3(0, 1, 0),
          localDist: (i / STEPS) * R * totalAngle,
          isTurbo: false,
          isDRS: false,
          curvature: 1 / R,
          signedCurvature: sign / R,
          racingOffset: 0,
          idealPoint: pt.clone(),
          targetSpeed: 0,
          tileType: "turn90",
          hasTurboTrigger: false,
          rampHeight: 0,
        });
      }
    }

    this._commitRoadMesh(positions, normals, uvs, indices, wallPos, wallIdx, trackGroup, config);

    // Kerb colorato sul bordo interno della curva
    this._addKerbs(trackGroup, samples, hw, config);

    // calcola yaw uscita
    const exitYaw = startYaw - sign * totalAngle;
    const lastS = samples[samples.length - 1];
    const exitPos = lastS ? lastS.point.clone() : startPos.clone();

    return { samples, length: arcLen, exitPos, exitYaw };
  },

  // ── CURVA PARABOLICA BANKED ─────────────────────────────────────────────────
  _tileBanked(tile, startPos, startYaw, trackGroup, config) {
    const isLeft  = tile.direction === "left";
    const sign    = isLeft ? 1 : -1;
    const R       = this.TILE_W * 1.5;
    const hw      = this.TILE_W / 2;
    const banking = Math.PI / 4; // 45°
    const STEPS   = 40;
    const totalAngle = Math.PI / 2;

    const dir   = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);
    const center = startPos.clone().addScaledVector(right, sign * R);

    const positions = [], normals = [], uvs = [], indices = [];
    const wallPos = [], wallIdx = [];
    const samples = [];

    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * totalAngle * sign;
      const localDir = new THREE.Vector3(
        dir.x * Math.cos(-a) - dir.z * Math.sin(-a),
        0,
        dir.x * Math.sin(-a) + dir.z * Math.cos(-a)
      );
      const localRight = new THREE.Vector3(localDir.z, 0, -localDir.x);
      const pt = center.clone()
        .sub(new THREE.Vector3(localRight.x, 0, localRight.z).multiplyScalar(sign * R));

      // banking: inclina right verso il centro
      const bankRoll  = sign > 0 ? banking : -banking;
      const bankRight = new THREE.Vector3(
        localRight.x,
        Math.sin(bankRoll),
        localRight.z * Math.cos(bankRoll)
      ).normalize().multiplyScalar(hw);

      const l = pt.clone().sub(bankRight);
      const r = pt.clone().add(bankRight);
      l.y += 0.03;
      r.y += 0.03;

      positions.push(l.x, l.y, l.z, r.x, r.y, r.z);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, (i / STEPS) * 3, 1, (i / STEPS) * 3);

      const bL = pt.clone().addScaledVector(localRight, -(hw + 2.5));
      const bR = pt.clone().addScaledVector(localRight,   hw + 2.5);
      wallPos.push(bL.x, bL.y, bL.z, bL.x, bL.y + 2.5, bL.z);
      wallPos.push(bR.x, bR.y, bR.z, bR.x, bR.y + 2.5, bR.z);

      if (i < STEPS) {
        const b = i * 2;
        indices.push(b, b+1, b+2, b+1, b+3, b+2);
        const wb = i * 4;
        wallIdx.push(wb, wb+1, wb+4, wb+1, wb+5, wb+4);
        wallIdx.push(wb+2, wb+6, wb+3, wb+3, wb+6, wb+7);
      }

      if (i < STEPS) {
        samples.push({
          point: pt.clone(),
          tangent: localDir.clone(),
          right: localRight.clone(),
          normal: new THREE.Vector3(0, 1, 0),
          localDist: (i / STEPS) * R * totalAngle,
          isTurbo: false,
          isDRS: false,
          curvature: 1 / R,
          signedCurvature: sign / R,
          racingOffset: 0,
          idealPoint: pt.clone(),
          targetSpeed: 0,
          tileType: "banked",
          hasTurboTrigger: false,
          rampHeight: 0,
        });
      }
    }

    this._commitRoadMesh(positions, normals, uvs, indices, wallPos, wallIdx, trackGroup, config);

    const exitYaw = startYaw - sign * totalAngle;
    const lastS = samples[samples.length - 1];
    return { samples, length: R * totalAngle, exitPos: lastS ? lastS.point.clone() : startPos.clone(), exitYaw };
  },

  // ── RAMPA DI LANCIO ─────────────────────────────────────────────────────────
  _tileRamp(tile, startPos, startYaw, trackGroup, config) {
    const len     = this.TILE_W * (tile.length || 1.5);
    const hw      = this.TILE_W / 2;
    const maxH    = tile.height || 8.0;   // altezza picco rampa
    const STEPS   = 24;

    const dir   = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);

    const positions = [], normals = [], uvs = [], indices = [];
    const wallPos = [], wallIdx = [];
    const samples = [];

    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const d = t * len;
      // profilo: salita parabolica poi discesa
      const heightFactor = Math.sin(t * Math.PI);
      const y = heightFactor * maxH;

      const pt = startPos.clone().addScaledVector(dir, d);
      pt.y += y;

      const l = pt.clone().addScaledVector(right, -hw);
      const r = pt.clone().addScaledVector(right,  hw);
      positions.push(l.x, l.y + 0.03, l.z, r.x, r.y + 0.03, r.z);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, t * 3, 1, t * 3);

      const bL = pt.clone().addScaledVector(right, -(hw + 2.0));
      const bR = pt.clone().addScaledVector(right,   hw + 2.0);
      wallPos.push(bL.x, bL.y, bL.z, bL.x, bL.y + 1.5, bL.z);
      wallPos.push(bR.x, bR.y, bR.z, bR.x, bR.y + 1.5, bR.z);

      if (i < STEPS) {
        const b = i * 2;
        indices.push(b, b+1, b+2, b+1, b+3, b+2);
        const wb = i * 4;
        wallIdx.push(wb, wb+1, wb+4, wb+1, wb+5, wb+4);
        wallIdx.push(wb+2, wb+6, wb+3, wb+3, wb+6, wb+7);
      }

      if (i < STEPS) {
        // tangente corretta per la rampa (include inclinazione Y)
        const nextT = Math.min((i + 1) / STEPS, 1);
        const nextY = Math.sin(nextT * Math.PI) * maxH;
        const nextPt = startPos.clone().addScaledVector(dir, nextT * len);
        nextPt.y += nextY;
        const tang = nextPt.clone().sub(pt).normalize();

        samples.push({
          point: pt.clone(),
          tangent: tang,
          right: right.clone(),
          normal: new THREE.Vector3(0, 1, 0),
          localDist: d,
          isTurbo: false,
          isDRS: false,
          curvature: 0,
          signedCurvature: 0,
          racingOffset: 0,
          idealPoint: pt.clone(),
          targetSpeed: 0,
          tileType: "ramp",
          hasTurboTrigger: false,
          rampHeight: y,
        });
      }
    }

    this._commitRoadMesh(positions, normals, uvs, indices, wallPos, wallIdx, trackGroup, config);

    // Pilastri di supporto sotto la rampa
    this._addRampSupports(trackGroup, startPos, dir, right, hw, len, maxH);

    const exitPos = startPos.clone().addScaledVector(dir, len);
    exitPos.y = 0; // l'atterraggio riporta a quota 0
    return { samples, length: len, exitPos, exitYaw: startYaw };
  },

  // ── LOOPING VERTICALE ───────────────────────────────────────────────────────
  _tileLooping(tile, startPos, startYaw, trackGroup, config) {
    const R    = tile.radius || 14;
    const hw   = this.TILE_W / 2;
    const STEPS = 48;
    const totalAngle = Math.PI * 2;

    const dir   = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);

    // Il centro del loop è sollevato di R rispetto al suolo
    const loopCenter = startPos.clone().addScaledVector(dir, R);
    loopCenter.y += R;

    const positions = [], normals = [], uvs = [], indices = [];
    const samples = [];

    for (let i = 0; i <= STEPS; i++) {
      const angle = (i / STEPS) * totalAngle - Math.PI / 2;
      // punto sul cerchio nel piano dir-Y
      const pt = loopCenter.clone()
        .addScaledVector(dir, Math.cos(angle) * R)
        .add(new THREE.Vector3(0, Math.sin(angle) * R, 0));

      // tangente: perpendicolare al raggio
      const tang = new THREE.Vector3(
        -Math.sin(angle) * dir.x,
        Math.cos(angle),
        -Math.sin(angle) * dir.z
      ).normalize();

      // normale centripeta (punta verso il centro del loop)
      const centripetal = loopCenter.clone().sub(pt).normalize();

      const l = pt.clone().addScaledVector(right, -hw * 0.7);
      const r = pt.clone().addScaledVector(right,  hw * 0.7);
      positions.push(l.x, l.y, l.z, r.x, r.y, r.z);
      normals.push(centripetal.x, centripetal.y, centripetal.z,
                   centripetal.x, centripetal.y, centripetal.z);
      uvs.push(0, i / STEPS * 6, 1, i / STEPS * 6);

      if (i < STEPS) {
        const b = i * 2;
        indices.push(b, b+1, b+2, b+1, b+3, b+2);
      }

      if (i < STEPS) {
        samples.push({
          point: pt.clone(),
          tangent: tang.clone(),
          right: right.clone(),
          normal: centripetal.clone(),
          localDist: (i / STEPS) * totalAngle * R,
          isTurbo: false,
          isDRS: false,
          curvature: 1 / R,
          signedCurvature: -1 / R,
          racingOffset: 0,
          idealPoint: pt.clone(),
          targetSpeed: 0,
          tileType: "looping",
          hasTurboTrigger: false,
          rampHeight: pt.y,
        });
      }
    }

    // Commit mesh looping
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal",   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv",       new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mat = this._getRoadMaterial(config);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    const trackGroup2 = new THREE.Group();
    trackGroup2.add(mesh);

    // Struttura traliccio del looping (visiva)
    this._addLoopingStructure(trackGroup2, loopCenter, R, dir, right);
    trackGroup.add(trackGroup2);

    const arcLen = totalAngle * R;
    const exitPos = startPos.clone().addScaledVector(dir, R * 2);
    return { samples, length: arcLen, exitPos, exitYaw: startYaw };
  },

  // ── CHICANE ─────────────────────────────────────────────────────────────────
  _tileChicane(tile, startPos, startYaw, trackGroup, config) {
    // Una chicane è: leggera sinistra + leggera destra (o viceversa)
    const hw     = this.TILE_W / 2;
    const len    = this.TILE_W * (tile.length || 2);
    const offset = hw * 0.7;
    const STEPS  = 24;

    const dir   = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);

    const positions = [], normals = [], uvs = [], indices = [];
    const samples = [];

    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const d = t * len;
      // spostamento laterale: sinistra nella prima metà, destra nella seconda
      const lateralShift = Math.sin(t * Math.PI * 2) * offset;
      const pt = startPos.clone()
        .addScaledVector(dir, d)
        .addScaledVector(right, lateralShift);

      const l = pt.clone().addScaledVector(right, -hw);
      const r = pt.clone().addScaledVector(right,  hw);
      positions.push(l.x, l.y + 0.03, l.z, r.x, r.y + 0.03, r.z);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, t * 4, 1, t * 4);

      if (i < STEPS) {
        const b = i * 2;
        indices.push(b, b+1, b+2, b+1, b+3, b+2);
      }

      if (i < STEPS) {
        const nextT = Math.min((i + 1) / STEPS, 1);
        const nextLat = Math.sin(nextT * Math.PI * 2) * offset;
        const nextPt = startPos.clone()
          .addScaledVector(dir, nextT * len)
          .addScaledVector(right, nextLat);
        const tang = nextPt.clone().sub(pt).normalize();
        const localRight = new THREE.Vector3(tang.z, 0, -tang.x);

        samples.push({
          point: pt.clone(),
          tangent: tang.clone(),
          right: localRight.clone(),
          normal: new THREE.Vector3(0, 1, 0),
          localDist: d,
          isTurbo: false,
          isDRS: false,
          curvature: Math.abs(Math.cos(t * Math.PI * 2)) * 0.06,
          signedCurvature: Math.cos(t * Math.PI * 2) * 0.06,
          racingOffset: 0,
          idealPoint: pt.clone(),
          targetSpeed: 0,
          tileType: "chicane",
          hasTurboTrigger: false,
          rampHeight: 0,
        });
      }
    }

    // Aggiungi barriere laterali chicane colorate
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal",   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv",       new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, this._getRoadMaterial(config));
    mesh.receiveShadow = true;
    trackGroup.add(mesh);

    // Coni / delimitatori chicane
    this._addChicaneCones(trackGroup, samples, hw, config);

    const exitPos = startPos.clone().addScaledVector(dir, len);
    return { samples, length: len, exitPos, exitYaw: startYaw };
  },

  // ---------------------------------------------------------------------------
  // HELPERS — Geometria e materiali
  // ---------------------------------------------------------------------------
  _getRoadMaterial(config) {
    const accentColor = config.themeColor || "#00f0ff";
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.asphaltColor || "#222731"),
      roughness: 0.52,
      metalness: 0.18,
      envMapIntensity: 0.8,
    });
  },

  _commitRoadMesh(positions, normals, uvs, indices, wallPos, wallIdx, trackGroup, config) {
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute("normal",   new THREE.Float32BufferAttribute(normals, 3));
    roadGeo.setAttribute("uv",       new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);

    const roadMesh = new THREE.Mesh(roadGeo, this._getRoadMaterial(config));
    roadMesh.receiveShadow = true;
    trackGroup.add(roadMesh);

    // Muri laterali
    if (wallPos.length > 0 && wallIdx.length > 0) {
      const wallGeo = new THREE.BufferGeometry();
      wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
      wallGeo.setIndex(wallIdx);
      wallGeo.computeVertexNormals();
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.55,
        roughness: 0.38,
      });
      trackGroup.add(new THREE.Mesh(wallGeo, wallMat));
    }
  },

  _addGuardrails(trackGroup, startPos, dir, right, hw, len, config) {
    const POSTS = Math.max(2, Math.floor(len / 8));
    const postGeo = new THREE.BoxGeometry(0.18, 1.1, 0.18);
    const railGeo = new THREE.BoxGeometry(8.2, 0.12, 0.08);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.25 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.8, roughness: 0.15 });

    for (let i = 0; i <= POSTS; i++) {
      const t = i / POSTS;
      const pt = startPos.clone().addScaledVector(dir, t * len);
      for (const side of [-1, 1]) {
        const pos = pt.clone().addScaledVector(right, side * (hw + 3.2));
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(pos.x, pos.y + 0.55, pos.z);
        trackGroup.add(post);

        if (i < POSTS) {
          const nextT = (i + 1) / POSTS;
          const nextPt = startPos.clone().addScaledVector(dir, nextT * len);
          const mid = pt.clone().lerp(nextPt, 0.5);
          const midPos = mid.clone().addScaledVector(right, side * (hw + 3.2));
          const rail = new THREE.Mesh(railGeo, railMat);
          rail.position.set(midPos.x, midPos.y + 0.9, midPos.z);
          rail.rotation.y = Math.atan2(dir.x, dir.z);
          trackGroup.add(rail);
        }
      }
    }
  },

  _addBillboards(trackGroup, startPos, dir, right, hw, len, config) {
    const spacing = 40;
    const count   = Math.max(1, Math.floor(len / spacing));
    const accent  = new THREE.Color(config.themeColor || 0x00f0ff);
    const screenMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 });
    const poleGeo  = new THREE.CylinderGeometry(0.12, 0.18, 6.5, 6);
    const boardGeo = new THREE.BoxGeometry(5.5, 2.2, 0.22);

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const pt = startPos.clone().addScaledVector(dir, t * len);

      for (const side of [-1, 1]) {
        const dist = hw + 9;
        const pos  = pt.clone().addScaledVector(right, side * dist);
        const yaw  = Math.atan2(dir.x, dir.z) + (side < 0 ? 0 : Math.PI);

        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(pos.x, pos.y + 3.25, pos.z);
        trackGroup.add(pole);

        const board = new THREE.Mesh(boardGeo, screenMat);
        board.position.set(pos.x, pos.y + 7.2, pos.z);
        board.rotation.y = yaw;
        trackGroup.add(board);
      }
    }
  },

  _addKerbs(trackGroup, samples, hw, config) {
    if (samples.length === 0) return;
    const kGeo = new THREE.BoxGeometry(1.0, 0.14, 1.6);
    const kMatA = new THREE.MeshStandardMaterial({ color: config.curbColorA || 0xff1111, roughness: 0.4 });
    const kMatB = new THREE.MeshStandardMaterial({ color: config.curbColorB || 0xffffff, roughness: 0.4 });

    const instA = new THREE.InstancedMesh(kGeo, kMatA, Math.ceil(samples.length / 2));
    const instB = new THREE.InstancedMesh(kGeo, kMatB, Math.ceil(samples.length / 2));
    const dummy = new THREE.Object3D();
    let ia = 0, ib = 0;

    samples.forEach((s, idx) => {
      if (idx % 3 !== 0) return;
      const side = Math.sign(s.signedCurvature) || 1;
      const pos = s.point.clone().addScaledVector(s.right, -side * (hw - 0.5));
      dummy.position.set(pos.x, pos.y + 0.07, pos.z);
      dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      if (idx % 6 === 0 && ia < instA.count) instA.setMatrixAt(ia++, dummy.matrix);
      else if (ib < instB.count)              instB.setMatrixAt(ib++, dummy.matrix);
    });
    instA.count = ia;
    instB.count = ib;
    trackGroup.add(instA, instB);
  },

  _addChicaneCones(trackGroup, samples, hw, config) {
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0xff6a00,
      emissive: 0xff3300,
      emissiveIntensity: 0.7,
    });
    const coneGeo = new THREE.ConeGeometry(0.28, 0.85, 6);
    const dummy = new THREE.Object3D();
    const count = Math.floor(samples.length / 4);
    const instCone = new THREE.InstancedMesh(coneGeo, coneMat, count * 2);
    let idx = 0;
    for (let i = 0; i < samples.length && idx < count * 2; i += 4) {
      const s = samples[i];
      for (const side of [-1, 1]) {
        const pos = s.point.clone().addScaledVector(s.right, side * (hw - 1.2));
        dummy.position.set(pos.x, pos.y + 0.42, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        if (idx < instCone.count) instCone.setMatrixAt(idx++, dummy.matrix);
      }
    }
    instCone.count = Math.min(idx, instCone.count);
    trackGroup.add(instCone);
  },

  _addRampSupports(trackGroup, startPos, dir, right, hw, len, maxH) {
    const PILLARS = 4;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.4 });
    for (let p = 1; p < PILLARS; p++) {
      const t = p / PILLARS;
      const h = Math.sin(t * Math.PI) * maxH;
      if (h < 1.0) continue;
      const pt = startPos.clone().addScaledVector(dir, t * len);
      for (const side of [-1, 1]) {
        const pos = pt.clone().addScaledVector(right, side * (hw - 1));
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.55, h, 8),
          pillarMat
        );
        pillar.position.set(pos.x, h / 2, pos.z);
        trackGroup.add(pillar);
      }
    }
  },

  _addLoopingStructure(group, center, R, dir, right) {
    const structMat = new THREE.MeshStandardMaterial({
      color: 0xff2a85,
      emissive: 0xff1060,
      emissiveIntensity: 0.6,
      metalness: 0.5,
    });
    // Cerchio esterno (arco strutturale)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(R + 1.0, 0.45, 8, 32),
      structMat
    );
    rim.position.copy(center);
    rim.rotation.y = Math.atan2(dir.x, dir.z);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    // Gambe di supporto
    const legMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.6, R, 8),
        legMat
      );
      const legPos = center.clone().addScaledVector(right, side * (R + 2));
      legPos.y -= R / 2;
      leg.position.copy(legPos);
      group.add(leg);
    }
  },

  // ---------------------------------------------------------------------------
  // TURBO PADS — Rettangoli emissivi sui tile turbo
  // ---------------------------------------------------------------------------
  _buildTurboPads(trackGroup, samples) {
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0xff2a85,
      emissiveIntensity: 3.2,
      roughness: 0.12,
      metalness: 0.18,
    });
    const padGeo = new THREE.BoxGeometry(1.4, 0.05, 0.9);
    const dummy  = new THREE.Object3D();

    const turboSamples = samples.filter(s => s.hasTurboTrigger);
    if (turboSamples.length === 0) return new THREE.Group();

    const transforms = [];
    turboSamples.forEach(s => {
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      for (let lane = -1; lane <= 1; lane++) {
        const pos = s.point.clone().addScaledVector(s.right, lane * 1.65);
        pos.y += 0.08;
        transforms.push({ pos, yaw });
      }
    });

    const instMesh = new THREE.InstancedMesh(padGeo, padMat, transforms.length);
    transforms.forEach((t, idx) => {
      dummy.position.copy(t.pos);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.updateMatrix();
      instMesh.setMatrixAt(idx, dummy.matrix);
    });
    const g = new THREE.Group();
    g.add(instMesh);
    g.userData.padMeshes = [instMesh];
    trackGroup.add(g);
    return g;
  },

  // ---------------------------------------------------------------------------
  // ARCO DI PARTENZA / FINISH (portale neon)
  // ---------------------------------------------------------------------------
  _buildStartGantry(trackGroup, samples, hw, config) {
    if (samples.length === 0) return [];
    const s = samples[0];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const accent = new THREE.Color(config.themeColor || "#00f0ff");

    const gantry = new THREE.Group();
    gantry.position.copy(s.point);
    gantry.rotation.y = yaw;

    // Linea start/finish bianca
    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(this.TILE_W - 1.5, 3.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.y = 0.065;
    gantry.add(startLine);

    // Pilastri
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
    [-hw - 1, hw + 1].forEach(x => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.9), pillarMat);
      pillar.position.set(x, 4.5, 0);
      gantry.add(pillar);
    });

    // Banner overhead
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry((hw + 1.5) * 2, 1.6, 1.0),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: accent,
        emissiveIntensity: 1.4,
      })
    );
    banner.position.set(0, 8.4, 0);
    gantry.add(banner);

    // 5 Luci di partenza F1
    const lightPods3D = [];
    for (let l = 0; l < 5; l++) {
      const podMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), podMat);
      pod.position.set((l - 2) * 1.45, 7.0, -0.65);
      gantry.add(pod);
      lightPods3D.push(podMat);
    }

    trackGroup.add(gantry);
    return lightPods3D;
  },

  // ---------------------------------------------------------------------------
  // DECORAZIONI STADIO — Tribune, tralicci, portali neon
  // ---------------------------------------------------------------------------
  _buildStadiumDecorations(trackGroup, samples, hw, config) {
    const stadiumGroup = new THREE.Group();
    const accent = new THREE.Color(config.themeColor || "#00f0ff");

    // Portali Neon ogni ~15 samples
    const archGeo = new THREE.TorusGeometry(hw + 2.5, 0.32, 8, 24, Math.PI);
    const archMat = new THREE.MeshBasicMaterial({ color: accent });

    for (let i = 60; i < samples.length; i += 150) {
      const s   = samples[i];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.copy(s.point);
      arch.rotation.y = yaw;
      stadiumGroup.add(arch);
    }

    // Torri faro stadio ai lati
    const poleGeo   = new THREE.CylinderGeometry(0.15, 0.24, 14, 8);
    const screenGeo = new THREE.BoxGeometry(9, 3.8, 0.28);
    const poleMat   = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.72, roughness: 0.22 });
    const screenMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.85,
      roughness: 0.2,
    });

    for (let i = 0; i < samples.length; i += 80) {
      const s   = samples[i];
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);

      for (const side of [-1, 1]) {
        const base = s.point.clone().addScaledVector(s.right, side * (hw + 18));

        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.copy(base).add(new THREE.Vector3(0, 7, 0));
        stadiumGroup.add(pole);

        if (i % 240 === 0) {
          const screen = new THREE.Mesh(screenGeo, screenMat);
          screen.position.copy(base).add(new THREE.Vector3(0, 10.2, 0));
          screen.rotation.y = yaw + (side < 0 ? Math.PI : 0);
          stadiumGroup.add(screen);
        }
      }
    }

    // Gradinate low-poly
    const standGeo = new THREE.BoxGeometry(10, 7, 32);
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: accent,
      emissiveIntensity: 0.25,
      roughness: 0.5,
    });
    const dummy = new THREE.Object3D();
    const standCount = Math.floor(samples.length / 100);
    if (standCount > 0) {
      const standInst = new THREE.InstancedMesh(standGeo, standMat, standCount * 2);
      let si = 0;
      for (let i = 0; i < samples.length && si < standCount * 2; i += 100) {
        const s   = samples[i];
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        for (const side of [-1, 1]) {
          const pos = s.point.clone().addScaledVector(s.right, side * (hw + 22));
          dummy.position.set(pos.x, pos.y + 3.5, pos.z);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          standInst.setMatrixAt(si++, dummy.matrix);
        }
      }
      stadiumGroup.add(standInst);
    }

    trackGroup.add(stadiumGroup);
  },

  // ---------------------------------------------------------------------------
  // GLTF LOADER — Caricamento asset esterni con fallback geometrico
  // ---------------------------------------------------------------------------
  _loadExternalAssetsWithFallback(trackGroup, samples, hw, config) {
    if (typeof THREE.GLTFLoader === "undefined") {
      this._placeFallbackBarriers(trackGroup, samples, hw, config);
      return;
    }

    const loader = new THREE.GLTFLoader();

    // Definiamo gli asset da caricare + il loro fallback geometrico
    const assetDefs = (config.externalAssets || []);

    if (assetDefs.length === 0) {
      // Nessun asset esterno: usa sempre fallback procedurali
      this._placeFallbackBarriers(trackGroup, samples, hw, config);
      return;
    }

    assetDefs.forEach(def => {
      loader.load(
        def.url,
        (gltf) => {
          // SUCCESS: clone e posiziona lungo la pista
          this._placeGLTFAlongTrack(gltf.scene, trackGroup, samples, hw, def);
        },
        undefined, // progress
        (_err) => {
          // FALLBACK: risoluzione geometrica procedurale
          console.warn(`[TileTrack] GLB fallback per: ${def.url}`);
          this._placeFallbackForAsset(trackGroup, samples, hw, def, config);
        }
      );
    });
  },

  _placeGLTFAlongTrack(gltfScene, trackGroup, samples, hw, def) {
    const step   = def.spacing || 60;
    const side   = def.side   || 1;
    const dist   = def.dist   || (hw + 5);
    const scale  = def.scale  || 1;

    for (let i = 0; i < samples.length; i += step) {
      const s   = samples[i];
      const clone = gltfScene.clone(true);
      const pos = s.point.clone().addScaledVector(s.right, side * dist);
      clone.position.copy(pos);
      clone.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
      clone.scale.setScalar(scale);
      trackGroup.add(clone);
    }
  },

  _placeFallbackForAsset(trackGroup, samples, hw, def, config) {
    // Geometria primitiva colorata in sostituzione del GLB non disponibile
    const color  = def.fallbackColor || 0x888888;
    const geo    = new THREE.BoxGeometry(1.2, 1.6, 2.4);
    const mat    = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const step   = def.spacing || 60;
    const side   = def.side   || 1;
    const dist   = def.dist   || (hw + 5);
    const dummy  = new THREE.Object3D();
    const count  = Math.floor(samples.length / step);
    if (count === 0) return;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    let idx = 0;
    for (let i = 0; i < samples.length && idx < count; i += step) {
      const s = samples[i];
      const pos = s.point.clone().addScaledVector(s.right, side * dist);
      dummy.position.set(pos.x, pos.y + 0.8, pos.z);
      dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(idx++, dummy.matrix);
    }
    trackGroup.add(inst);
  },

  _placeFallbackBarriers(trackGroup, samples, hw, config) {
    // Barriere di pneumatici impilati (stacked tyres) — fallback procedurale
    const tyreMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c1e,
      roughness: 0.7,
      metalness: 0.05,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.themeColor || 0xff2a85),
      emissive: new THREE.Color(config.themeColor || 0xff2a85),
      emissiveIntensity: 0.5,
    });
    const tyreGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.28, 12);
    const step    = 10;
    const dummy   = new THREE.Object3D();
    const curveSamples = samples.filter((s, i) => i % step === 0 && s.curvature > 0.04);

    const maxBarriers = Math.min(curveSamples.length * 2, 600);
    if (maxBarriers === 0) return;

    const tyreInst  = new THREE.InstancedMesh(tyreGeo, tyreMat,   maxBarriers);
    const stackInst = new THREE.InstancedMesh(tyreGeo, accentMat, Math.floor(maxBarriers / 2));
    let ti = 0, si = 0;

    curveSamples.forEach(s => {
      const insideSide = -Math.sign(s.signedCurvature) || 1;
      for (const side of [-1, 1]) {
        if (ti >= maxBarriers) return;
        const pos = s.point.clone().addScaledVector(s.right, side * (hw + 3.5));
        // 3 pneumatici impilati
        for (let row = 0; row < 3; row++) {
          dummy.position.set(pos.x, pos.y + 0.14 + row * 0.28, pos.z);
          dummy.rotation.set(Math.PI / 2, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          if (ti < tyreInst.count) tyreInst.setMatrixAt(ti++, dummy.matrix);
          if (row === 1 && side === insideSide && si < stackInst.count) {
            stackInst.setMatrixAt(si++, dummy.matrix);
          }
        }
      }
    });
    tyreInst.count  = Math.min(ti, maxBarriers);
    stackInst.count = Math.min(si, Math.floor(maxBarriers / 2));
    if (tyreInst.count  > 0) trackGroup.add(tyreInst);
    if (stackInst.count > 0) trackGroup.add(stackInst);
  },

  // ---------------------------------------------------------------------------
  // RACING LINE + SPEED PROFILE (riutilizza logica di TrackBuilder classico)
  // ---------------------------------------------------------------------------
  _computeRacingLine(samples, halfWidth, phys, totalLength) {
    const N  = samples.length;
    const ds = totalLength / N;

    for (let i = 0; i < N; i++) {
      const prev = samples[(i - 9 + N) % N];
      const next = samples[(i + 9) % N];
      const crossY = prev.tangent.z * next.tangent.x - prev.tangent.x * next.tangent.z;
      const angle  = prev.tangent.angleTo(next.tangent);
      const kappa  = Math.sign(crossY) * angle;
      samples[i].signedCurvature = kappa;
      samples[i].curvature = Math.abs(kappa);
    }

    const maxOff = halfWidth * 0.65;
    for (let i = 0; i < N; i++) {
      const c = samples[i].signedCurvature;
      let off = THREE.MathUtils.clamp(c * 18, -maxOff, maxOff);
      let sum = 0;
      const win = 14;
      for (let k = -win; k <= win; k++) sum += samples[(i + k + N) % N].signedCurvature;
      off = THREE.MathUtils.clamp((sum / (win * 2 + 1)) * 18, -maxOff, maxOff);
      samples[i].racingOffset = off;
      samples[i].idealPoint   = samples[i].point.clone().addScaledVector(samples[i].right, off);
    }

    for (let i = 0; i < N; i++) {
      const kpm = samples[i].curvature / (9 * ds + 0.0001);
      if (kpm < 0.0015) {
        samples[i].targetSpeed = phys.maxSpeed;
      } else {
        samples[i].targetSpeed = THREE.MathUtils.clamp(
          Math.sqrt((phys.gripLateral * 1.44) / kpm), 15, phys.maxSpeed
        );
      }
    }

    // Backward pass frenata
    const maxDecel = (phys.brakeForce / phys.mass) * 0.92;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const next = samples[(i + 1) % N];
        const vMax = Math.sqrt(next.targetSpeed ** 2 + 2 * maxDecel * ds);
        if (vMax < samples[i].targetSpeed) samples[i].targetSpeed = vMax;
      }
    }
  },
};

