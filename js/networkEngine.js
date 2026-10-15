"use strict";

/**
 * =============================================================================
 * NETWORK ENGINE — CLIENT NETCODE & LERP INTERPOLATION (LAN MULTIPLAYER)
 * =============================================================================
 * Gestisce:
 * - Mappa globale `remotePlayers = {}` con mesh Three.js, targetPos e targetRotY
 * - Invio telemetria locale a 30Hz fisso (disaccoppiato dagli input tastiera)
 * - Ricezione eventi 'init', 'update', 'playerJoined', 'playerLeft'
 * - Creazione dinamica delle auto 3D clonate con targhette Nickname
 * - Interpolazione fluida a 60 FPS nel render loop (`lerp` e wrap-around angolare)
 * - Diagnostica HUD a schermo in tempo reale (Stato, Giocatori in pista, TX/RX pkt/s, Ping)
 * =============================================================================
 */

// Mappa globale dei giocatori remoti (ID -> { mesh, targetPos, targetRotY, targetSpeed, ... })
const remotePlayers = {};

const NetworkEngine = {
  socket: null,
  isConnected: false,
  myPlayerId: null,
  hostId: null,
  isHost: false,
  lobbyPlayers: {},
  selectedTrackId: "monza",
  selectedLaps: 3,
  nickname: "Pilota LAN",
  selectedColor: "#00f0ff",
  selectedCarId: "hatchback",

  // Debug metriche di rete
  txCount: 0,
  rxCount: 0,
  txRate: 0,
  rxRate: 0,
  ping: 0,
  statsTimer: null,
  sendTimer: null,
  pingTimer: null,

  // ---------------------------------------------------------------------------
  // 1. CONNESSIONE AL SERVER WEBSOCKET
  // ---------------------------------------------------------------------------
  connect(hostUrl, nickname, color, carId, onSuccess, onError) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    this.nickname = nickname || this.nickname;
    this.selectedColor = color || this.selectedColor;
    this.selectedCarId = carId || this.selectedCarId;
    this.hostId = null;
    this.isHost = false;
    this.lobbyPlayers = {};

    let wsUrl = (hostUrl || "").trim();
    if (!wsUrl) {
      wsUrl = window.location.hostname ? `${window.location.hostname}:3000` : "localhost:3000";
    }
    if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
      wsUrl = "ws://" + wsUrl;
    }

    try {
      this.socket = new WebSocket(wsUrl);
    } catch (err) {
      if (onError) onError(err);
      return;
    }

    this.socket.onopen = () => {
      this.isConnected = true;
      console.log(`[NetEngine] Connesso a ${wsUrl}`);

      // Calcola posizione iniziale dell'auto locale
      let startX = 0, startY = 0, startZ = 0, startRotY = 0;
      if (typeof RaceEngine !== "undefined" && RaceEngine.player) {
        startX = RaceEngine.player.position.x;
        startY = RaceEngine.player.position.y;
        startZ = RaceEngine.player.position.z;
        startRotY = RaceEngine.player.heading || 0;
      }

      // 1. Invio registrazione iniziale ('init') al server
      this.send({
        type: "init",
        name: this.nickname,
        color: this.selectedColor,
        carId: this.selectedCarId,
        x: startX,
        y: startY,
        z: startZ,
        rotY: startRotY,
      });

      // Avvia invio dati fisso a 30 Hz e contatori diagnostici
      this.startTickLoop();
      this.startPingLoop();
      this.startMetricsTimer();

      this.updateDiagHUD();
      if (onSuccess) onSuccess();
    };

    this.socket.onmessage = (event) => {
      this.rxCount++;
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.warn("[NetEngine] Errore parsing pacchetto:", e);
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      this.myPlayerId = null;
      this.hostId = null;
      this.isHost = false;
      this.lobbyPlayers = {};
      this.stopTickLoop();
      this.stopPingLoop();
      this.stopMetricsTimer();
      this.clearAllRemotePlayers();
      this.updateDiagHUD();
      console.log("[NetEngine] Disconnesso dal server LAN");
      if (typeof UI !== "undefined") UI.onLanDisconnected();
    };

    this.socket.onerror = (err) => {
      console.error("[NetEngine] Errore WebSocket:", err);
      if (onError) onError(err);
    };
  },

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.myPlayerId = null;
    this.hostId = null;
    this.isHost = false;
    this.lobbyPlayers = {};
    this.stopTickLoop();
    this.stopPingLoop();
    this.stopMetricsTimer();
    this.clearAllRemotePlayers();
    this.updateDiagHUD();
  },

  get myId() {
    return this.myPlayerId;
  },
  set myId(v) {
    this.myPlayerId = v;
  },

  clearRemoteCars() {
    this.clearAllRemotePlayers();
  },

  spawnRemoteCar(data) {
    return this.spawnPlayer(data);
  },

  sendCheckpointPass(lap, sampleIndex, totalProgress) {
    this.send({
      type: "checkpoint_pass",
      id: this.myPlayerId,
      lap: lap,
      sampleIndex: sampleIndex,
      totalProgress: totalProgress,
    });
  },

  sendFinishRace(finishTime, bestLapTime) {
    this.send({
      type: "finish_race",
      id: this.myPlayerId,
      finishTime: finishTime,
      bestLapTime: bestLapTime,
    });
  },

  sendProfileUpdate(data) {
    if (!this.isConnected || !this.myPlayerId) return;
    if (data.name) this.nickname = data.name;
    if (data.color) this.selectedColor = data.color;
    if (data.carId) this.selectedCarId = data.carId;
    if (this.lobbyPlayers[this.myPlayerId]) {
      Object.assign(this.lobbyPlayers[this.myPlayerId], data);
    }
    this.send("update_profile", Object.assign({ id: this.myPlayerId }, data));
  },

  sendRoomUpdate(data) {
    if (!this.isConnected || !this.isHost) return;
    if (data.trackId) this.selectedTrackId = data.trackId;
    if (typeof data.laps === "number") this.selectedLaps = data.laps;
    this.send("update_room", data);
  },

  send(typeOrData, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    let packet;
    if (typeof typeOrData === "string") {
      packet = Object.assign({ type: typeOrData }, payload || {});
    } else {
      packet = typeOrData;
    }
    this.socket.send(JSON.stringify(packet));
    this.txCount++;
  },

  // ---------------------------------------------------------------------------
  // 2. GESTIONE DEI MESSAGGI DEL PROTOCOLLO
  // ---------------------------------------------------------------------------
  handleMessage(msg) {
    switch (msg.type) {
      // --- EVENTO 1: 'init' dal server (ricezione ID, host e lista di tutte le altre auto) ---
      case "init": {
        this.myPlayerId = msg.id;
        this.hostId = msg.hostId || msg.id;
        this.isHost = (this.myPlayerId === this.hostId);
        this.lobbyPlayers = msg.players || {};
        this.lobbyPlayers[this.myPlayerId] = {
          id: this.myPlayerId,
          name: this.nickname,
          color: this.selectedColor,
          carId: this.selectedCarId,
          ping: this.ping || 0,
        };

        if (msg.roomSettings) {
          if (msg.roomSettings.trackId) this.selectedTrackId = msg.roomSettings.trackId;
          if (typeof msg.roomSettings.laps === "number") this.selectedLaps = msg.roomSettings.laps;
        }

        console.log(`[NetEngine] Registrato con ID locale: ${this.myPlayerId}. Host ID: ${this.hostId} (isHost: ${this.isHost})`);

        // Spawna tutte le auto già presenti nella stanza
        if (msg.players) {
          for (const id in msg.players) {
            if (id !== this.myPlayerId) {
              this.spawnPlayer(msg.players[id]);
            }
          }
        }
        this.updateDiagHUD();
        if (typeof UI !== "undefined") UI.updateLanLobbyUI();
        break;
      }

      // --- EVENTO 2: 'playerJoined' (nuovo client entrato nella stanza) ---
      case "playerJoined": {
        if (msg.player && msg.player.id !== this.myPlayerId) {
          console.log(`[NetEngine] Nuovo giocatore rilevato: ${msg.player.name} (${msg.player.id})`);
          this.lobbyPlayers[msg.player.id] = msg.player;
          if (msg.hostId) {
            this.hostId = msg.hostId;
            this.isHost = (this.myPlayerId === this.hostId);
          }
          this.spawnPlayer(msg.player);
          this.updateDiagHUD();
          if (typeof UI !== "undefined") {
            UI.updateLanLobbyUI();
            UI.showToast(`${msg.player.name} è entrato nella stanza LAN!`, "fa-user-plus");
          }
        }
        break;
      }

      // --- EVENTO 3: 'playerUpdated' (cambio nickname, colore, auto o settings da un partecipante) ---
      case "playerUpdated": {
        if (msg.player) {
          this.lobbyPlayers[msg.player.id] = msg.player;
          if (msg.player.id !== this.myPlayerId) {
            const rem = remotePlayers[msg.player.id];
            if (rem) {
              rem.name = msg.player.name;
              rem.color = msg.player.color;
              rem.carId = msg.player.carId;
              if (rem.nameSprite && rem.mesh) {
                rem.mesh.remove(rem.nameSprite);
                const newSprite = this.createNameplateSprite(rem.name, rem.color);
                newSprite.position.set(0, 1.85, 0);
                rem.mesh.add(newSprite);
                rem.nameSprite = newSprite;
              }
            }
          }
        }
        if (msg.hostId) {
          this.hostId = msg.hostId;
          this.isHost = (this.myPlayerId === this.hostId);
        }
        if (msg.roomSettings) {
          if (msg.roomSettings.trackId) this.selectedTrackId = msg.roomSettings.trackId;
          if (typeof msg.roomSettings.laps === "number") this.selectedLaps = msg.roomSettings.laps;
        }
        if (typeof UI !== "undefined") UI.updateLanLobbyUI();
        break;
      }

      // --- EVENTO 4: 'roomUpdated' (l'host ha cambiato circuito o numero di giri) ---
      case "roomUpdated": {
        if (msg.roomSettings) {
          if (msg.roomSettings.trackId) this.selectedTrackId = msg.roomSettings.trackId;
          if (typeof msg.roomSettings.laps === "number") this.selectedLaps = msg.roomSettings.laps;
        }
        if (msg.hostId) {
          this.hostId = msg.hostId;
          this.isHost = (this.myPlayerId === this.hostId);
        }
        if (typeof UI !== "undefined") {
          UI.updateLanLobbyUI();
          UI.showToast("L'Host ha aggiornato le impostazioni del circuito", "fa-sliders");
        }
        break;
      }

      // --- EVENTO 5: 'update' (trasformazioni fisiche ricevute in broadcast selettivo) ---
      case "update": {
        if (msg.id === this.myPlayerId) return; // ignora noi stessi

        let p = remotePlayers[msg.id];
        if (!p) {
          // Se non esiste ancora la mesh (es. update arrivato prima di join), creala subito
          this.spawnPlayer(msg);
          p = remotePlayers[msg.id];
        }

        if (p) {
          // Aggiorna le coordinate target per l'interpolazione a 60 FPS
          p.targetPos.set(msg.x, msg.y, msg.z);
          p.targetRotY = msg.rotY;
          p.targetSpeed = msg.speed || 0;
          p.isDrifting = Boolean(msg.isDrifting);
        }
        break;
      }

      // --- EVENTO 6: 'playerLeft' (giocatore disconnesso, distruggi mesh) ---
      case "playerLeft": {
        console.log(`[NetEngine] Giocatore uscito: ${msg.id}`);
        delete this.lobbyPlayers[msg.id];
        this.removePlayer(msg.id);
        if (msg.hostId) {
          const becameHost = (this.hostId !== msg.hostId && msg.hostId === this.myPlayerId);
          this.hostId = msg.hostId;
          this.isHost = (this.myPlayerId === this.hostId);
          if (becameHost && typeof UI !== "undefined") {
            UI.showToast("L'Host precedente si è disconnesso. Ora SEI TU l'Host della stanza!", "fa-crown");
          }
        }
        this.updateDiagHUD();
        if (typeof UI !== "undefined") UI.updateLanLobbyUI();
        break;
      }

      // --- PONG: calcolo latenza in millisecondi ---
      case "pong": {
        const now = performance.now();
        this.ping = Math.round(now - msg.clientTime);
        if (this.lobbyPlayers[this.myPlayerId]) {
          this.lobbyPlayers[this.myPlayerId].ping = this.ping;
        }
        this.updateDiagHUD();
        if (typeof UI !== "undefined") UI.updateLanPingDisplay(this.ping);
        break;
      }

      // --- START_RACE: semaforo sincronizzato per tutti i client ---
      case "start_race": {
        if (typeof RaceEngine !== "undefined") {
          let playersList = [];
          if (Array.isArray(msg.players) && msg.players.length > 0) {
            playersList = msg.players;
          } else {
            playersList = Object.values(remotePlayers).map(r => ({
              id: r.id,
              name: r.name,
              color: r.color,
              carId: r.carId,
            }));
            // Aggiungi anche noi stessi
            playersList.push({
              id: this.myPlayerId,
              name: this.nickname,
              color: this.selectedColor,
              carId: this.selectedCarId,
            });
          }

          RaceEngine.startLanSession(
            msg.trackId || "monza",
            playersList,
            msg.laps || 3,
            msg.countdownDuration || 4.5
          );
        }
        break;
      }

      // --- CHECKPOINT_PASS: sincronizzazione classifica ---
      case "checkpoint_pass": {
        if (typeof RaceEngine !== "undefined" && RaceEngine.isActive && RaceEngine.allRacers) {
          const racer = RaceEngine.allRacers.find(r => r.id === msg.id);
          if (racer) {
            racer.lap = msg.lap;
            racer.sampleIndex = msg.sampleIndex;
            racer.totalProgress = msg.totalProgress;
          }
        }
        break;
      }

      // --- FINISH_RACE: traguardo avversario ---
      case "finish_race": {
        if (typeof RaceEngine !== "undefined" && RaceEngine.isActive && RaceEngine.allRacers) {
          const racer = RaceEngine.allRacers.find(r => r.id === msg.id);
          if (racer) {
            racer.finished = true;
            racer.finishTime = msg.finishTime;
            if (msg.bestLapTime) racer.bestLapTime = msg.bestLapTime;
          }
        }
        break;
      }
    }
  },

  // ---------------------------------------------------------------------------
  // 3. CREAZIONE & RIMOZIONE DINAMICA DELLE MESH 3D
  // ---------------------------------------------------------------------------
  spawnPlayer(data) {
    if (!data || !data.id || data.id === this.myPlayerId) return;

    // Se esiste già, riposiziona
    if (remotePlayers[data.id]) {
      const p = remotePlayers[data.id];
      p.targetPos.set(data.x || 0, data.y || 0, data.z || 0);
      p.targetRotY = data.rotY || 0;
      if (p.mesh && GameApp.scene && p.mesh.parent !== GameApp.scene) {
        GameApp.scene.add(p.mesh);
      }
      return;
    }

    const carConfig =
      CAR_CATALOG.find((c) => c.id === data.carId) || CAR_CATALOG[0];
    const colorHex = data.color
      ? parseInt(String(data.color).replace("#", "0x"), 16)
      : carConfig.colorHex;

    // Crea mesh 3D completa e distinta con il colore dell'avversario
    const carMesh = ProceduralAssets.buildCarMesh(carConfig, colorHex);

    const initX = typeof data.x === "number" ? data.x : 0;
    const initY = typeof data.y === "number" ? data.y : 0;
    const initZ = typeof data.z === "number" ? data.z : 0;
    const initRotY = typeof data.rotY === "number" ? data.rotY : 0;

    carMesh.position.set(initX, initY, initZ);
    carMesh.rotation.y = initRotY;

    // Aggiungi targhetta con il Nickname 3D (Billboard Canvas Sprite)
    const nameSprite = this.createNameplateSprite(data.name || data.id, data.color || "#00f0ff");
    nameSprite.position.set(0, 1.85, 0);
    carMesh.add(nameSprite);

    // Aggiungi alla scena principale di Three.js
    if (GameApp.scene) {
      GameApp.scene.add(carMesh);
    }

    remotePlayers[data.id] = {
      id: data.id,
      name: data.name || data.id,
      color: data.color || "#00f0ff",
      carId: data.carId || "hatchback",
      mesh: carMesh,
      nameSprite: nameSprite,
      targetPos: new THREE.Vector3(initX, initY, initZ),
      targetRotY: initRotY,
      targetSpeed: 0,
      isDrifting: false,
    };

    console.log(`[NetEngine] Mesh 3D istanziata in scena per: ${data.name || data.id}`);
  },

  createNameplateSprite(nickname, accentColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(10, 15, 29, 0.85)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 48, 12);
    ctx.fill();

    ctx.strokeStyle = accentColor || "#00f0ff";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = "bold 24px 'Orbitron', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(nickname).toUpperCase().slice(0, 14), 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.2, 0.8, 1.0);
    return sprite;
  },

  removePlayer(id) {
    const p = remotePlayers[id];
    if (p) {
      if (p.mesh && GameApp.scene) {
        GameApp.scene.remove(p.mesh);
        p.mesh.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      }
      delete remotePlayers[id];
    }
  },

  clearAllRemotePlayers() {
    for (const id in remotePlayers) {
      this.removePlayer(id);
    }
  },

  // ---------------------------------------------------------------------------
  // 4. INVIO DATI LOCALE A 30 HZ (TICK LOOP DISACCOPPIATO DAI TASTI)
  // ---------------------------------------------------------------------------
  startTickLoop() {
    this.stopTickLoop();

    // 33 ms = circa 30 Hz
    this.sendTimer = setInterval(() => {
      if (!this.isConnected || !this.myPlayerId) return;

      // Recupera la vettura locale attiva
      let localX = 0, localY = 0, localZ = 0, localRotY = 0, localSpeed = 0, localDrift = false;

      if (typeof RaceEngine !== "undefined" && RaceEngine.isActive && RaceEngine.player) {
        const p = RaceEngine.player;
        localX = p.position.x;
        localY = p.position.y;
        localZ = p.position.z;
        localRotY = p.heading + (p.driftAngle || 0) * 0.62;
        localSpeed = p.speed || 0;
        localDrift = Math.abs(p.driftAngle || 0) > 0.15;
      } else if (typeof GameApp !== "undefined" && GameApp.showroomCarMesh) {
        const m = GameApp.showroomCarMesh;
        localX = m.position.x;
        localY = m.position.y;
        localZ = m.position.z;
        localRotY = m.rotation.y;
      } else {
        return;
      }

      // Invia pacchetto 'update' di trasformazione fisica
      this.send({
        type: "update",
        id: this.myPlayerId,
        x: Number(localX.toFixed(2)),
        y: Number(localY.toFixed(2)),
        z: Number(localZ.toFixed(2)),
        rotY: Number(localRotY.toFixed(3)),
        speed: Number(localSpeed.toFixed(2)),
        isDrifting: localDrift,
      });
    }, 33);
  },

  stopTickLoop() {
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
  },

  startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping", clientTime: performance.now() });
    }, 1500);
  },

  stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  },

  startMetricsTimer() {
    this.stopMetricsTimer();
    this.statsTimer = setInterval(() => {
      this.txRate = this.txCount;
      this.rxRate = this.rxCount;
      this.txCount = 0;
      this.rxCount = 0;
      this.updateDiagHUD();
    }, 1000);
  },

  stopMetricsTimer() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  },

  // ---------------------------------------------------------------------------
  // 5. INTERPOLAZIONE NEL RENDER LOOP (CHIAMATA OGNI FRAME DA GameApp.animate)
  // ---------------------------------------------------------------------------
  update(dt) {
    for (const id in remotePlayers) {
      const p = remotePlayers[id];
      if (p && p.mesh) {
        // Se la scena è stata azzerata (es. cambio circuito), ri-aggiungi la mesh
        if (GameApp.scene && p.mesh.parent !== GameApp.scene) {
          GameApp.scene.add(p.mesh);
        }

        p.mesh.position.lerp(p.targetPos, 0.2);

        // 2. Allineamento rotazione con smoothing e wrap-around [-PI, +PI]
        let diff = p.targetRotY - p.mesh.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.mesh.rotation.y += diff * 0.2;

        if (typeof RaceEngine !== "undefined" && RaceEngine.getTrackElevationAndNormal && RaceEngine.trackData) {
          p.mesh.rotation.order = "YXZ";
          const sinH = Math.sin(p.mesh.rotation.y);
          const cosH = Math.cos(p.mesh.rotation.y);
          const fSurf = RaceEngine.getTrackElevationAndNormal(p.mesh.position.x + sinH * 1.46, p.mesh.position.z + cosH * 1.46, p.sampleIndex || 0);
          const rSurf = RaceEngine.getTrackElevationAndNormal(p.mesh.position.x - sinH * 1.46, p.mesh.position.z - cosH * 1.46, p.sampleIndex || 0);
          const tPitch = -Math.atan2(fSurf.y - rSurf.y, 2.92);

          const rSide = RaceEngine.getTrackElevationAndNormal(p.mesh.position.x + cosH * 0.95, p.mesh.position.z - sinH * 0.95, p.sampleIndex || 0);
          const lSide = RaceEngine.getTrackElevationAndNormal(p.mesh.position.x - cosH * 0.95, p.mesh.position.z + sinH * 0.95, p.sampleIndex || 0);
          const tRoll = Math.atan2(rSide.y - lSide.y, 1.90);

          p.trackPitch = THREE.MathUtils.lerp(p.trackPitch || 0, tPitch, 0.2);
          p.trackRoll = THREE.MathUtils.lerp(p.trackRoll || 0, tRoll, 0.2);
          p.mesh.rotation.x = p.trackPitch;
          p.mesh.rotation.z = p.trackRoll;
        }

        // 3. Animazione visiva ruote ed effetti
        const ud = p.mesh.userData;
        if (ud) {
          if (ud.wheelMeshes) {
            const wDelta = (p.targetSpeed / 0.37) * 0.016;
            ud.wheelMeshes.forEach((w) => {
              w.rotation.x += wDelta;
            });
          }
          if (ud.exhaustFlames) {
            ud.exhaustFlames.forEach((f) => {
              f.visible = p.isDrifting;
            });
          }
        }
      }
    }
  },

  // ---------------------------------------------------------------------------
  // 6. DIAGNOSTICA A SCHERMO IN SOVRIMPRESSIONE (HUD OVERLAY)
  // ---------------------------------------------------------------------------
  updateDiagHUD() {
    let hud = document.getElementById("net-diag-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "net-diag-hud";
      document.body.appendChild(hud);
    }

    hud.className =
      "fixed top-[32vh] left-4 z-40 pointer-events-none glass-panel px-3.5 py-2.5 rounded-2xl border border-white/15 text-[11px] font-racing space-y-1.5 shadow-2xl backdrop-blur-md bg-slate-950/80 transition-all duration-300";

    const playersCount = Object.keys(remotePlayers).length + (this.isConnected ? 1 : 0);
    const connClass = this.isConnected ? "text-emerald-400" : "text-rose-400";
    const connDot = this.isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500";
    const connText = this.isConnected ? "CONNESSO (LAN)" : "DISCONNESSO";

    hud.innerHTML = `
      <div class="flex items-center justify-between gap-3 pb-1 border-b border-white/10">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full ${connDot}"></span>
          <span class="font-bold tracking-wider ${connClass}">${connText}</span>
        </div>
        <span class="text-slate-300 font-mono text-xs font-bold">${this.ping} ms</span>
      </div>
      <div class="flex items-center justify-between gap-3 text-slate-300 text-[10px]">
        <span>Giocatori in pista:</span>
        <span class="font-bold text-cyan-300">${playersCount}</span>
      </div>
      <div class="flex items-center justify-between gap-3 text-slate-400 text-[10px] font-mono">
        <span>Traffico Net:</span>
        <span class="text-amber-300">TX: ${this.txRate}/s | RX: ${this.rxRate}/s</span>
      </div>
      ${this.myPlayerId ? `<div class="text-[9px] text-slate-500 font-mono">ID: ${this.myPlayerId}</div>` : ""}
    `;
  },
};

// Esponi per compatibilità globale con window e test
remotePlayers.get = function (id) {
  return this[id];
};
NetworkEngine.remotePlayers = remotePlayers;
window.remotePlayers = remotePlayers;
window.NetworkEngine = NetworkEngine;
