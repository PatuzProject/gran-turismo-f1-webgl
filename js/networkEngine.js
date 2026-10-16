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
  roomGameMode: "single_race", // 'single_race' | 'championship'
  championshipData: null,

  // Debug metriche di rete
  txCount: 0,
  rxCount: 0,
  txRate: 0,
  rxRate: 0,
  ping: 0,
  statsTimer: null,
  sendTimer: null,
  pingTimer: null,

  // Stato riconnessione automatica e guardie anti-race sulla connessione
  manualDisconnect: false, // true se la disconnessione è stata richiesta dall'utente
  _connecting: false, // true mentre un socket è in fase di apertura (CONNECTING)
  _isReconnecting: false, // true durante l'apertura avviata dal retry automatico
  _reconnectAttempts: 0, // contatore tentativi di riconnessione (max 5)
  _reconnectTimer: null, // handle del timer di retry (timeout)
  _wsUrl: null, // ultimo URL WebSocket usato, per i tentativi automatici

  // Sincronizzazione orologio al millisecondo (NTP Clock Sync)
  clockOffset: null, // Millisecondi di offset tra orologio locale e server
  bestRtt: null, // RTT minimo registrato per pesatura campioni NTP
  getServerTime() {
    if (this.clockOffset === null) return Date.now();
    return Date.now() + this.clockOffset;
  },

  // ---------------------------------------------------------------------------
  // 1. CONNESSIONE AL SERVER WEBSOCKET
  // ---------------------------------------------------------------------------
  connect(hostUrl, nickname, color, carId, onSuccess, onError) {
    // Guardia anti doppia connessione: ignora chiamate duplicate mentre un
    // socket è già in fase di apertura.
    if (this._connecting) return;

    const isReconnect = this._isReconnecting === true;
    this._isReconnecting = false;

    // Stacca e chiudi in sicurezza qualsiasi socket precedente, anche se è
    // ancora in CONNECTING/CLOSING: senza il "detach" dei suoi handler, un
    // vecchio onopen avvierebbe i timer e un vecchio onclose ucciderebbe la
    // NUOVA connessione (race di connessione / leak di timer).
    this._detachSocket();

    // Ferma SEMPRE i timer esistenti e annulla eventuali retry pendenti.
    this.stopTickLoop();
    this.stopPingLoop();
    this.stopMetricsTimer();
    this._clearReconnectTimer();
    if (!isReconnect) this._reconnectAttempts = 0;
    this.manualDisconnect = false;

    this.nickname = nickname || this.nickname;
    this.selectedColor = color || this.selectedColor;
    this.selectedCarId = carId || this.selectedCarId;
    this.hostId = null;
    this.isHost = false;
    this.lobbyPlayers = {};
    this.clockOffset = null;
    this.bestRtt = null;

    let wsUrl = (hostUrl || "").trim();
    if (!wsUrl) {
      wsUrl = window.location.hostname
        ? `${window.location.hostname}:3000`
        : "localhost:3000";
    }
    if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
      wsUrl = "ws://" + wsUrl;
    }
    this._wsUrl = wsUrl;

    try {
      this.socket = new WebSocket(wsUrl);
    } catch (err) {
      this._connecting = false;
      if (onError) onError(err);
      return;
    }
    this._connecting = true;

    this.socket.onopen = () => {
      this._connecting = false;
      this._reconnectAttempts = 0;
      this._clearReconnectTimer();
      this.isConnected = true;
      console.log(`[NetEngine] Connesso a ${wsUrl}`);

      // Calcola posizione iniziale dell'auto locale
      let startX = 0,
        startY = 0,
        startZ = 0,
        startRotY = 0;
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
      this._connecting = false;
      this.isConnected = false;
      this.myPlayerId = null;
      this.hostId = null;
      this.isHost = false;
      this.lobbyPlayers = {};
      this.clockOffset = null;
      this.bestRtt = null;
      this.stopTickLoop();
      this.stopPingLoop();
      this.stopMetricsTimer();
      this.clearAllRemotePlayers();
      this.updateDiagHUD();
      console.log("[NetEngine] Disconnesso dal server LAN");
      if (typeof UI !== "undefined") UI.onLanDisconnected();

      // Riconnessione automatica con backoff esponenziale, solo se la
      // disconnessione NON è stata richiesta dall'utente.
      this._scheduleReconnect();
    };

    this.socket.onerror = (err) => {
      console.error("[NetEngine] Errore WebSocket:", err);
      if (onError) onError(err);
    };
  },

  disconnect() {
    // Disconnessione voluta dall'utente: disabilita la riconnessione automatica.
    this.manualDisconnect = true;
    this._clearReconnectTimer();
    this._reconnectAttempts = 0;
    // Stacca gli handler PRIMA di chiudere: evita che un onclose tardivo
    // azzeri lo stato di una eventuale NUOVA connessione avviata subito dopo.
    this._detachSocket();
    this.isConnected = false;
    this.myPlayerId = null;
    this.hostId = null;
    this.isHost = false;
    this.lobbyPlayers = {};
    this.clockOffset = null;
    this.bestRtt = null;
    this.stopTickLoop();
    this.stopPingLoop();
    this.stopMetricsTimer();
    this.clearAllRemotePlayers();
    this.updateDiagHUD();
  },

  // Stacca tutti gli handler del socket corrente e lo chiude in sicurezza.
  _detachSocket() {
    const s = this.socket;
    if (s) {
      s.onopen = null;
      s.onclose = null;
      s.onmessage = null;
      s.onerror = null;
      try {
        s.close();
      } catch (e) {
        // Socket già chiuso o non più valido: ignora.
      }
    }
    this.socket = null;
    this._connecting = false;
  },

  // Annulla il timer di riconnessione automatica pendente.
  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  },

  // Pianifica un tentativo di riconnessione con backoff esponenziale
  // (1s, 2s, 4s, 8s) per un massimo di 5 tentativi. Attivo solo se la
  // disconnessione non è stata richiesta dall'utente.
  _scheduleReconnect() {
    if (this.manualDisconnect || !this._wsUrl) return;
    if (this._reconnectAttempts >= 5) {
      console.warn(
        "[NetEngine] Riconnessione automatica esaurita (5 tentativi).",
      );
      return;
    }
    const delay = Math.min(8000, 1000 * Math.pow(2, this._reconnectAttempts));
    this._reconnectAttempts++;
    this._clearReconnectTimer();
    console.log(
      `[NetEngine] Riconnessione automatica tra ${delay}ms (tentativo ${this._reconnectAttempts}/5)`,
    );
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this.manualDisconnect) return;
      // Riapre il socket verso lo stesso URL: onopen ripete la registrazione
      // 'init' e riavvia i timer. `_isReconnecting` impedisce che il contatore
      // dei tentativi venga azzerato ad ogni retry.
      this._isReconnecting = true;
      this.connect(this._wsUrl);
    }, delay);
  },

  // Converte un valore in numero finito; in caso contrario restituisce il
  // fallback. Protegge da pacchetti corrotti o malevoli (NaN, Infinity,
  // stringhe) che altrimenti corromperebbero in modo permanente i piloti remoti.
  toFinite(v, fallback) {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  },

  // Copia le impostazioni della stanza ricevute dal server nello stato locale.
  _applyRoomSettings(settings) {
    if (!settings) return;
    if (settings.trackId) this.selectedTrackId = settings.trackId;
    if (typeof settings.laps === "number") this.selectedLaps = settings.laps;
    if (settings.gameMode) this.roomGameMode = settings.gameMode;
    if (settings.championship) this.championshipData = settings.championship;
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
    if (data.gameMode) this.roomGameMode = data.gameMode;
    if (data.championship) this.championshipData = data.championship;
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
        this.isHost = this.myPlayerId === this.hostId;
        this.lobbyPlayers = msg.players || {};
        this.lobbyPlayers[this.myPlayerId] = {
          id: this.myPlayerId,
          name: this.nickname,
          color: this.selectedColor,
          carId: this.selectedCarId,
          ping: this.ping || 0,
        };

        this._applyRoomSettings(msg.roomSettings);

        console.log(
          `[NetEngine] Registrato con ID locale: ${this.myPlayerId}. Host ID: ${this.hostId} (isHost: ${this.isHost})`,
        );

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
          console.log(
            `[NetEngine] Nuovo giocatore rilevato: ${msg.player.name} (${msg.player.id})`,
          );
          this.lobbyPlayers[msg.player.id] = msg.player;
          if (msg.hostId) {
            this.hostId = msg.hostId;
            this.isHost = this.myPlayerId === this.hostId;
          }
          this.spawnPlayer(msg.player);
          this.updateDiagHUD();
          if (typeof UI !== "undefined") {
            UI.updateLanLobbyUI();
            UI.showToast(
              `${msg.player.name} è entrato nella stanza LAN!`,
              "fa-user-plus",
            );
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
              const carChanged = Boolean(
                msg.player.carId && rem.carId !== msg.player.carId,
              );
              const colorChanged = Boolean(
                msg.player.color && rem.color !== msg.player.color,
              );
              const nameChanged = Boolean(
                msg.player.name && rem.name !== msg.player.name,
              );

              if (carChanged || colorChanged || nameChanged || !rem.mesh) {
                this.rebuildRemoteMesh(
                  msg.player.id,
                  msg.player.carId || rem.carId,
                  msg.player.color || rem.color,
                  msg.player.name || rem.name,
                );
              }
            } else {
              this.spawnPlayer(msg.player);
            }
          }
        }
        if (msg.hostId) {
          this.hostId = msg.hostId;
          this.isHost = this.myPlayerId === this.hostId;
        }
        this._applyRoomSettings(msg.roomSettings);
        if (typeof UI !== "undefined") UI.updateLanLobbyUI();
        break;
      }

      // --- EVENTO 4: 'roomUpdated' (l'host ha cambiato circuito o numero di giri o modalità torneo) ---
      case "roomUpdated": {
        this._applyRoomSettings(msg.roomSettings);
        if (msg.hostId) {
          this.hostId = msg.hostId;
          this.isHost = this.myPlayerId === this.hostId;
        }
        if (typeof UI !== "undefined") {
          UI.updateLanLobbyUI();
          UI.showToast(
            "L'Host ha aggiornato le impostazioni della stanza",
            "fa-sliders",
          );
        }
        break;
      }

      // --- EVENTO 5: 'update' (trasformazioni fisiche & telemetria ricevute in broadcast selettivo) ---
      case "update": {
        if (msg.id === this.myPlayerId) return; // ignora noi stessi

        // Se siamo un guest client in Gran Premio LAN e l'Host ci ha inviato la telemetria delle CPU
        if (
          Array.isArray(msg.aiList) &&
          typeof RaceEngine !== "undefined" &&
          RaceEngine.isActive &&
          (RaceEngine.isLanChampionship ||
            RaceEngine.mode === "lan_championship") &&
          !this.isHost
        ) {
          RaceEngine.applyLanAITelemetry(msg.aiList);
        }

        let p = remotePlayers[msg.id];
        if (!p) {
          // Se non esiste ancora la mesh (es. update arrivato prima di join), creala subito
          this.spawnPlayer(msg);
          p = remotePlayers[msg.id];
        }

        if (p) {
          const nowLocal = performance.now();
          p.lastPacketLocalTime = nowLocal;
          p.lastPacketServerTime =
            typeof msg.t === "number" ? msg.t : this.getServerTime();

          // Coordinate target ricevute (bonificate: valori non finiti/stringhe
          // vengono scartati mantenendo l'ultimo target valido).
          p.targetPos.set(
            this.toFinite(msg.x, p.targetPos.x),
            this.toFinite(msg.y, p.targetPos.y),
            this.toFinite(msg.z, p.targetPos.z),
          );
          p.targetRotY = this.toFinite(msg.rotY, p.targetRotY);
          p.targetSpeed = this.toFinite(msg.speed, p.targetSpeed || 0);
          p.isDrifting = Boolean(msg.isDrifting);

          // Vettori di velocità lineare e angolare per Dead Reckoning
          if (Number.isFinite(msg.vx) && Number.isFinite(msg.vz)) {
            p.velocity.set(
              this.toFinite(msg.vx, 0),
              this.toFinite(msg.vy, 0),
              this.toFinite(msg.vz, 0),
            );
          } else {
            const heading = this.toFinite(msg.rotY, p.targetRotY);
            const spd = this.toFinite(msg.speed, 0);
            p.velocity.set(Math.sin(heading) * spd, 0, Math.cos(heading) * spd);
          }

          p.yawRate = this.toFinite(msg.yawRate, 0);
          if (typeof msg.lap === "number") p.lap = msg.lap;
          if (typeof msg.sampleIndex === "number")
            p.sampleIndex = msg.sampleIndex;
          if (typeof msg.totalProgress === "number")
            p.totalProgress = msg.totalProgress;
          if (typeof msg.curTime === "number") p.curTime = msg.curTime;
          if (msg.bestTime) p.bestTime = msg.bestTime;
          if (typeof msg.finished === "boolean") p.finished = msg.finished;
          if (typeof msg.finishTime === "number") p.finishTime = msg.finishTime;
        }

        // Sincronizza lo stato in tempo reale della vettura avversaria in RaceEngine
        if (
          typeof RaceEngine !== "undefined" &&
          RaceEngine.isActive &&
          RaceEngine.allRacers
        ) {
          const racer = RaceEngine.allRacers.find((r) => r.id === msg.id);
          if (racer) {
            if (typeof msg.totalProgress === "number")
              racer.totalProgress = msg.totalProgress;
            if (typeof msg.lap === "number") racer.lap = msg.lap;
            if (typeof msg.sampleIndex === "number")
              racer.sampleIndex = msg.sampleIndex;
            if (typeof msg.curTime === "number")
              racer.currentLapTime = msg.curTime;
            if (msg.bestTime) racer.bestLapTime = msg.bestTime;
            if (msg.finished) racer.finished = true;
            if (msg.finishTime) racer.finishTime = msg.finishTime;
            racer.speed = this.toFinite(msg.speed, 0);
          }
        }
        break;
      }

      // --- EVENTO 6: 'playerLeft' (giocatore disconnesso, distruggi mesh) ---
      case "playerLeft": {
        console.log(`[NetEngine] Giocatore uscito: ${msg.id}`);
        const leftPlayerName =
          (this.lobbyPlayers[msg.id] && this.lobbyPlayers[msg.id].name) ||
          `Pilota ${msg.id}`;
        delete this.lobbyPlayers[msg.id];
        this.removePlayer(msg.id);

        if (
          typeof RaceEngine !== "undefined" &&
          RaceEngine.isActive &&
          RaceEngine.allRacers
        ) {
          RaceEngine.allRacers = RaceEngine.allRacers.filter(
            (r) => r.id !== msg.id,
          );
          const posTotal = document.getElementById("hud-pos-total");
          if (posTotal)
            posTotal.textContent = `/ ${RaceEngine.allRacers.length}`;
          if (typeof UI !== "undefined") {
            UI.showToast(
              `${leftPlayerName} ha abbandonato la gara`,
              "fa-user-minus",
            );
          }
        }

        if (msg.hostId) {
          const becameHost =
            this.hostId !== msg.hostId && msg.hostId === this.myPlayerId;
          this.hostId = msg.hostId;
          this.isHost = this.myPlayerId === this.hostId;
          if (becameHost && typeof UI !== "undefined") {
            UI.showToast(
              "L'Host precedente si è disconnesso. Ora SEI TU l'Host della stanza!",
              "fa-crown",
            );
          }
        }
        this.updateDiagHUD();
        if (typeof UI !== "undefined") UI.updateLanLobbyUI();
        break;
      }

      // --- PONG: calcolo latenza & sincronizzazione orologio NTP al millisecondo ---
      case "pong": {
        const nowLocal = Date.now();
        const nowPerf = performance.now();
        const rtt = Math.max(
          0,
          msg.perf0
            ? nowPerf - msg.perf0
            : msg.t0
              ? nowLocal - msg.t0
              : nowPerf - (msg.clientTime || 0),
        );
        this.ping = Math.round(rtt);

        // Algoritmo NTP per sincronizzazione orologio al millisecondo
        if (typeof msg.serverTime === "number") {
          // Stima dell'ora del server al momento della ricezione su questo client
          const estimatedServerNow = msg.serverTime + rtt / 2;
          const sampleOffset = estimatedServerNow - nowLocal;

          if (this.clockOffset === null) {
            this.clockOffset = sampleOffset;
            this.bestRtt = rtt;
          } else {
            // Campioni con RTT più basso hanno meno jitter e asimmetria: diamo maggior peso
            const weight = rtt <= (this.bestRtt || rtt) ? 0.35 : 0.15;
            if (rtt < (this.bestRtt || Infinity)) this.bestRtt = rtt;
            this.clockOffset =
              this.clockOffset * (1 - weight) + sampleOffset * weight;
          }
        }

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
            playersList = Object.values(remotePlayers).map((r) => ({
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
            msg.countdownDuration || 4.5,
            msg.raceStartTime,
            msg.serverTime,
            {
              gameMode: msg.gameMode || "single_race",
              championship: msg.championship || null,
              gridSlots: msg.gridSlots || null,
              enableBots: msg.enableBots !== false,
            },
          );
        }
        break;
      }

      // --- CHECKPOINT_PASS: sincronizzazione classifica ---
      case "checkpoint_pass": {
        if (
          typeof RaceEngine !== "undefined" &&
          RaceEngine.isActive &&
          RaceEngine.allRacers
        ) {
          const racer = RaceEngine.allRacers.find((r) => r.id === msg.id);
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
        if (
          typeof RaceEngine !== "undefined" &&
          RaceEngine.isActive &&
          RaceEngine.allRacers
        ) {
          const racer = RaceEngine.allRacers.find((r) => r.id === msg.id);
          if (racer) {
            if (msg.bestLapTime) racer.bestLapTime = msg.bestLapTime;
            if (typeof RaceEngine.recordCarFinish === "function") {
              RaceEngine.recordCarFinish(racer, msg.finishTime);
            } else {
              racer.finished = true;
              racer.finishTime = msg.finishTime;
            }
          }
          if (typeof UI !== "undefined") {
            const driverName =
              (racer && racer.driverName) || `Pilota ${msg.id}`;
            UI.showToast(
              `🏁 ${driverName} ha tagliato il traguardo!`,
              "fa-flag-checkered",
            );
          }
        }
        break;
      }
    }
  },

  // ---------------------------------------------------------------------------
  // 3. CREAZIONE & RIMOZIONE DINAMICA DELLE MESH 3D
  // ---------------------------------------------------------------------------
  rebuildRemoteMesh(playerId, carId, color, name) {
    const p = remotePlayers[playerId];
    if (!p) return;

    const carConfig = CAR_CATALOG.find((c) => c.id === carId) || CAR_CATALOG[0];
    const colorHex = color
      ? parseInt(String(color).replace("#", "0x"), 16)
      : carConfig.colorHex;

    // Rimuovi la vecchia mesh Three.js dalla scena e rilascia le risorse grafiche
    if (p.mesh) {
      if (GameApp.scene) {
        GameApp.scene.remove(p.mesh);
      }
      p.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    // Costruisci la nuova mesh 3D specifica del modello d'auto selezionato
    const newMesh = ProceduralAssets.buildCarMesh(carConfig, colorHex);
    const curPos =
      p.targetPos || (p.mesh ? p.mesh.position : new THREE.Vector3());
    const curRotY =
      typeof p.targetRotY === "number"
        ? p.targetRotY
        : p.mesh
          ? p.mesh.rotation.y
          : 0;

    newMesh.position.copy(curPos);
    newMesh.rotation.y = curRotY;

    // Aggiungi targhetta con il Nickname 3D
    const newSprite = this.createNameplateSprite(
      name || p.name || playerId,
      color || p.color || "#00f0ff",
    );
    newSprite.position.set(0, 1.85, 0);
    newMesh.add(newSprite);

    if (GameApp.scene) {
      GameApp.scene.add(newMesh);
    }

    p.mesh = newMesh;
    p.nameSprite = newSprite;
    p.carId = carId;
    p.color = color || p.color;
    p.name = name || p.name;

    // Se una gara è attiva, aggiorna anche la referenza in RaceEngine.allRacers
    if (
      typeof RaceEngine !== "undefined" &&
      RaceEngine.isActive &&
      RaceEngine.allRacers
    ) {
      const racer = RaceEngine.allRacers.find((r) => r.id === playerId);
      if (racer) {
        racer.mesh = newMesh;
        racer.carConfig = carConfig;
        racer.teamColorHex = colorHex;
        const rId = carConfig.id;
        racer.halfLength =
          rId === "hypercar"
            ? 2.4
            : rId === "muscle"
              ? 2.35
              : rId === "hatchback"
                ? 2.15
                : 2.3;
        racer.halfWidth =
          rId === "hypercar" ? 1.05 : rId === "hatchback" ? 0.98 : 1.02;
        const rMass = (carConfig.physics && carConfig.physics.mass) || 1200;
        racer.mass = rMass;
        racer.inertia =
          (1 / 12) *
          rMass *
          ((2 * racer.halfWidth) ** 2 + (2 * racer.halfLength) ** 2);
      }
    }

    console.log(
      `[NetEngine] Mesh 3D aggiornata con successo per ${playerId}: ${carConfig.name} (${color})`,
    );
  },

  spawnPlayer(data) {
    if (!data || !data.id || data.id === this.myPlayerId) return;

    const initX = this.toFinite(data.x, 0);
    const initY = this.toFinite(data.y, 0);
    const initZ = this.toFinite(data.z, 0);
    const initRotY = this.toFinite(data.rotY, 0);
    const initSpeed = this.toFinite(data.speed, 0);
    const initVx = this.toFinite(data.vx, Math.sin(initRotY) * initSpeed);
    const initVy = this.toFinite(data.vy, 0);
    const initVz = this.toFinite(data.vz, Math.cos(initRotY) * initSpeed);
    const initYawRate = this.toFinite(data.yawRate, 0);

    // Se esiste già, aggiorna posizione e verifica se la mesh d'auto necessita di essere ricostruita
    if (remotePlayers[data.id]) {
      const p = remotePlayers[data.id];
      p.targetPos.set(initX, initY, initZ);
      p.velocity.set(initVx, initVy, initVz);
      p.targetRotY = initRotY;
      p.yawRate = initYawRate;
      p.targetSpeed = initSpeed;
      p.lastPacketLocalTime = performance.now();

      const carChanged = Boolean(data.carId && p.carId !== data.carId);
      const colorChanged = Boolean(data.color && p.color !== data.color);
      const nameChanged = Boolean(data.name && p.name !== data.name);

      if (carChanged || colorChanged || nameChanged || !p.mesh) {
        this.rebuildRemoteMesh(
          data.id,
          data.carId || p.carId || "hatchback",
          data.color || p.color || "#00f0ff",
          data.name || p.name,
        );
      } else if (p.mesh && GameApp.scene && p.mesh.parent !== GameApp.scene) {
        GameApp.scene.add(p.mesh);
      }
      return;
    }

    const carConfig =
      CAR_CATALOG.find((c) => c.id === data.carId) || CAR_CATALOG[0];
    const colorHex = data.color
      ? parseInt(String(data.color).replace("#", "0x"), 16)
      : carConfig.colorHex;

    // Crea mesh 3D completa e distinta con il modello e colore dell'avversario
    const carMesh = ProceduralAssets.buildCarMesh(carConfig, colorHex);

    carMesh.position.set(initX, initY, initZ);
    carMesh.rotation.y = initRotY;

    // Aggiungi targhetta con il Nickname 3D (Billboard Canvas Sprite)
    const nameSprite = this.createNameplateSprite(
      data.name || data.id,
      data.color || "#00f0ff",
    );
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
      // Target ricevuti dall'ultimo pacchetto
      targetPos: new THREE.Vector3(initX, initY, initZ),
      velocity: new THREE.Vector3(initVx, initVy, initVz),
      targetRotY: initRotY,
      yawRate: initYawRate,
      targetSpeed: initSpeed,
      isDrifting: false,
      // Dead reckoning & smoothing a delta-time indipendente
      extrapolatedPos: new THREE.Vector3(initX, initY, initZ),
      lastPacketLocalTime: performance.now(),
      lastPacketServerTime:
        typeof data.t === "number" ? data.t : this.getServerTime(),
      trackPitch: 0,
      trackRoll: 0,
      sampleIndex: data.sampleIndex || 0,
      lap: data.lap || 1,
      totalProgress: data.totalProgress || 0,
    };

    console.log(
      `[NetEngine] Mesh 3D istanziata in scena per: ${data.name || data.id} [${carConfig.name}]`,
    );
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
            if (Array.isArray(obj.material))
              obj.material.forEach((m) => m.dispose());
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
    this._tickCount = 0;
    this._lastSentState = null;
    this._applyNetworkTick();
  },

  // Frequenza di invio adattiva: con più piloti inviamo meno pacchetti al secondo.
  // Il ricevente interpola con dead-reckoning, quindi non si notano differenze.
  getDesiredTickMs() {
    const remotes =
      typeof remotePlayers !== "undefined" && remotePlayers
        ? Object.keys(remotePlayers).length
        : 0;
    const players = 1 + remotes;
    if (players >= 6) return 50; // 20 Hz
    if (players >= 4) return 42; // ~24 Hz
    return 33; // 30 Hz
  },

  _applyNetworkTick() {
    const desired = this.getDesiredTickMs();
    if (this.sendTimer && this._tickMs === desired) return;
    if (this.sendTimer) clearInterval(this.sendTimer);
    this._tickMs = desired;
    this.sendTimer = setInterval(() => this.sendNetworkTick(), desired);
  },

  sendNetworkTick() {
    if (!this.isConnected || !this.myPlayerId) return;

    this._tickCount = (this._tickCount || 0) + 1;
    // Riadatta la frequenza se cambia il numero di piloti (ogni ~20 tick)
    if (this._tickCount % 20 === 0) this._applyNetworkTick();

    // Recupera la vettura locale attiva
    let localX = 0,
      localY = 0,
      localZ = 0,
      localRotY = 0,
      localSpeed = 0,
      localDrift = false;
    let localVx = 0,
      localVy = 0,
      localVz = 0,
      localYawRate = 0;
    let localLap = 1,
      localSampleIndex = 0,
      localProgress = 0,
      localCurTime = 0,
      localBestTime = null,
      localFinished = false,
      localFinishTime = 0;

    if (
      typeof RaceEngine !== "undefined" &&
      RaceEngine.isActive &&
      RaceEngine.player
    ) {
      const p = RaceEngine.player;
      localX = p.position.x;
      localY = p.position.y;
      localZ = p.position.z;
      localRotY = p.heading + (p.driftAngle || 0) * 0.62;
      localSpeed = p.speed || 0;
      localDrift = Math.abs(p.driftAngle || 0) > 0.15;
      localVx =
        typeof p.vx === "number" ? p.vx : Math.sin(p.heading) * localSpeed;
      localVy = typeof p.vy === "number" ? p.vy : 0;
      localVz =
        typeof p.vz === "number" ? p.vz : Math.cos(p.heading) * localSpeed;
      localYawRate = typeof p.yawRate === "number" ? p.yawRate : 0;
      localLap = p.lap || 1;
      localSampleIndex = p.sampleIndex || 0;
      localProgress =
        typeof p.totalProgress === "number" ? p.totalProgress : 0;
      localCurTime = p.currentLapTime || 0;
      localBestTime = p.bestLapTime || null;
      localFinished = Boolean(p.finished);
      localFinishTime = p.finishTime || 0;
    } else if (typeof GameApp !== "undefined" && GameApp.showroomCarMesh) {
      const m = GameApp.showroomCarMesh;
      localX = m.position.x;
      localY = m.position.y;
      localZ = m.position.z;
      localRotY = m.rotation.y;
    } else {
      return;
    }

    // Telemetria piloti IA ufficiali: l'Host la trasmette ogni 3° tick (~10 Hz),
    // sufficiente agli ospiti per interpolarla. Inviarla a 30 Hz era inutile e
    // appesantiva pacchetti, JSON e banda (soprattutto su WiFi).
    const sendAi = this.isHost && this._tickCount % 3 === 0;
    let aiTelemetry = null;
    if (
      sendAi &&
      typeof RaceEngine !== "undefined" &&
      RaceEngine.isActive &&
      (RaceEngine.isLanChampionship ||
        RaceEngine.mode === "lan_championship") &&
      Array.isArray(RaceEngine.aiCars) &&
      RaceEngine.aiCars.length > 0
    ) {
      aiTelemetry = RaceEngine.aiCars.map((ai) => ({
        id: ai.id,
        x: Number(ai.position.x.toFixed(2)),
        y: Number(ai.position.y.toFixed(2)),
        z: Number(ai.position.z.toFixed(2)),
        rotY: Number(ai.heading.toFixed(3)),
        speed: Number((ai.speed || 0).toFixed(2)),
        lap: ai.lap || 1,
        sampleIndex: ai.sampleIndex || 0,
        totalProgress: Number((ai.totalProgress || 0).toFixed(4)),
        curTime: Math.round(ai.currentLapTime || 0),
        bestTime: ai.bestLapTime || null,
        finished: Boolean(ai.finished),
        finishTime: ai.finishTime || 0,
        aiStatusTag: ai.aiStatusTag || null,
      }));
    }

    // Skip dei pacchetti "fermi" (countdown, parcheggio, post-gara da fermo):
    // se nulla è cambiato e non c'è telemetria IA da spedire, non occupiamo banda.
    const prev = this._lastSentState;
    let changed = !prev;
    if (prev) {
      changed =
        Math.abs(localX - prev.x) > 0.005 ||
        Math.abs(localY - prev.y) > 0.005 ||
        Math.abs(localZ - prev.z) > 0.005 ||
        Math.abs(localRotY - prev.rotY) > 0.002 ||
        localLap !== prev.lap ||
        localSampleIndex !== prev.sampleIndex ||
        localFinished !== prev.finished ||
        localDrift !== prev.drift ||
        localBestTime !== prev.bestTime;
    }
    if (!changed && !aiTelemetry) return;

    this._lastSentState = {
      x: localX,
      y: localY,
      z: localZ,
      rotY: localRotY,
      lap: localLap,
      sampleIndex: localSampleIndex,
      finished: localFinished,
      drift: localDrift,
      bestTime: localBestTime,
    };

    // Invia pacchetto 'update' di trasformazione fisica, vettori velocità e telemetria con timestamp NTP
    this.send({
      type: "update",
      id: this.myPlayerId,
      t: this.getServerTime(),
      x: Number(localX.toFixed(2)),
      y: Number(localY.toFixed(2)),
      z: Number(localZ.toFixed(2)),
      vx: Number(localVx.toFixed(2)),
      vy: Number(localVy.toFixed(2)),
      vz: Number(localVz.toFixed(2)),
      rotY: Number(localRotY.toFixed(3)),
      yawRate: Number(localYawRate.toFixed(3)),
      speed: Number(localSpeed.toFixed(2)),
      isDrifting: localDrift,
      lap: localLap,
      sampleIndex: localSampleIndex,
      totalProgress: Number(localProgress.toFixed(4)),
      curTime: Math.round(localCurTime),
      bestTime: localBestTime,
      finished: localFinished,
      finishTime: localFinishTime,
      aiList: aiTelemetry,
    });
  },

  stopTickLoop() {
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
  },

  startPingLoop() {
    this.stopPingLoop();
    const sendPing = () => {
      if (!this.isConnected) return;
      this.send({
        type: "ping",
        t0: Date.now(),
        perf0: performance.now(),
        clientTime: performance.now(),
      });
    };
    sendPing();
    this.pingTimer = setInterval(sendPing, 1000);
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
  // 5. INTERPOLAZIONE NEL RENDER LOOP CON DEAD RECKONING & DELTA-TIME
  // ---------------------------------------------------------------------------
  update(dt) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.1);
    const nowLocal = performance.now();
    // L'allineamento alla superficie (pitch/roll) dei giocatori remoti viene
    // aggiornato a frame alterni: differenza impercettibile, metà delle query.
    this._remoteSurfaceFrame = (this._remoteSurfaceFrame || 0) + 1;
    const doSurface = (this._remoteSurfaceFrame & 1) === 0;

    for (const id in remotePlayers) {
      const p = remotePlayers[id];
      if (p && p.mesh) {
        // Se la scena è stata azzerata (es. cambio circuito), ri-aggiungi la mesh
        if (GameApp.scene && p.mesh.parent !== GameApp.scene) {
          GameApp.scene.add(p.mesh);
        }

        // 1. DEAD RECKONING EXTRAPOLATION
        // Tempo trascorso dall'ultimo pacchetto ricevuto (in secondi)
        const timeSincePacket = Math.max(
          0,
          (nowLocal - (p.lastPacketLocalTime || nowLocal)) / 1000,
        );
        // Limita l'estrapolazione a max 180ms per evitare proiezioni aberranti in caso di freeze/disconnessione
        const extrapolateTime = Math.min(timeSincePacket, 0.18);

        // Posizione prevista = Posizione ricevuta + Velocità * tempo_trascorso
        const extrapX = p.targetPos.x + p.velocity.x * extrapolateTime;
        const extrapY = p.targetPos.y + p.velocity.y * extrapolateTime;
        const extrapZ = p.targetPos.z + p.velocity.z * extrapolateTime;
        p.extrapolatedPos.set(extrapX, extrapY, extrapZ);

        // Rotazione prevista = Angolo ricevuto + yawRate * tempo_trascorso
        const extrapRotY = p.targetRotY + p.yawRate * extrapolateTime;

        // 2. BLENDING INDIPENDENTE DAL FRAMERATE (EXPONENTIAL DECAY CON DELTA-TIME)
        // alpha = 1 - exp(-lambda * dt) garantisce la stessa velocità di convergenza a 30, 60 o 144 FPS
        const posBlend = 1.0 - Math.exp(-14.0 * safeDt);
        const rotBlend = 1.0 - Math.exp(-16.0 * safeDt);

        // Snap immediato se l'errore di posizione supera 12 metri (es. respawn, salto tracciato)
        const distSq = p.mesh.position.distanceToSquared(p.extrapolatedPos);
        if (distSq > 144) {
          p.mesh.position.copy(p.extrapolatedPos);
        } else {
          p.mesh.position.lerp(p.extrapolatedPos, posBlend);
        }

        // Allineamento rotazione con smoothing e wrap-around [-PI, +PI]
        let diff = extrapRotY - p.mesh.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.mesh.rotation.y += diff * rotBlend;

        // 3. Allineamento rollio e beccheggio alla superficie del tracciato 3D.
        // A frame alterni e con la variante senza allocazioni getTrackSurfaceY,
        // per ridurre CPU e pressione sul Garbage Collector.
        if (
          doSurface &&
          typeof RaceEngine !== "undefined" &&
          RaceEngine.getTrackSurfaceY &&
          RaceEngine.trackData
        ) {
          p.mesh.rotation.order = "YXZ";
          const sinH = Math.sin(p.mesh.rotation.y);
          const cosH = Math.cos(p.mesh.rotation.y);
          const fY = RaceEngine.getTrackSurfaceY(
            p.mesh.position.x + sinH * 1.46,
            p.mesh.position.z + cosH * 1.46,
            p.sampleIndex || 0,
          );
          const rY = RaceEngine.getTrackSurfaceY(
            p.mesh.position.x - sinH * 1.46,
            p.mesh.position.z - cosH * 1.46,
            p.sampleIndex || 0,
          );
          const tPitch = -Math.atan2(fY - rY, 2.92);

          const rSideY = RaceEngine.getTrackSurfaceY(
            p.mesh.position.x + cosH * 0.95,
            p.mesh.position.z - sinH * 0.95,
            p.sampleIndex || 0,
          );
          const lSideY = RaceEngine.getTrackSurfaceY(
            p.mesh.position.x - cosH * 0.95,
            p.mesh.position.z + sinH * 0.95,
            p.sampleIndex || 0,
          );
          const tRoll = Math.atan2(rSideY - lSideY, 1.9);

          const surfaceBlend = 1.0 - Math.exp(-10.0 * safeDt);
          p.trackPitch = THREE.MathUtils.lerp(
            p.trackPitch || 0,
            tPitch,
            surfaceBlend,
          );
          p.trackRoll = THREE.MathUtils.lerp(
            p.trackRoll || 0,
            tRoll,
            surfaceBlend,
          );
          p.mesh.rotation.x = p.trackPitch;
          p.mesh.rotation.z = p.trackRoll;
        }

        // 4. Animazione visiva ruote ed effetti
        const ud = p.mesh.userData;
        if (ud) {
          if (ud.wheelMeshes) {
            const wheels = ud.wheelMeshes;
            const wDelta = (p.targetSpeed / 0.37) * safeDt;
            for (let i = 0; i < wheels.length; i++) {
              wheels[i].rotation.x += wDelta;
            }
          }
          if (ud.exhaustFlames) {
            const flames = ud.exhaustFlames;
            const drifting = p.isDrifting;
            for (let i = 0; i < flames.length; i++) {
              flames[i].visible = drifting;
            }
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
      "fixed top-[32vh] left-4 z-40 pointer-events-none glass-panel px-3.5 py-2.5 rounded-2xl border border-white/15 text-[11px] font-racing space-y-1.5 shadow-2xl bg-slate-950/80 transition-all duration-300";

    const playersCount =
      Object.keys(remotePlayers).length + (this.isConnected ? 1 : 0);
    const connClass = this.isConnected ? "text-emerald-400" : "text-rose-400";
    const connDot = this.isConnected
      ? "bg-emerald-400 animate-pulse"
      : "bg-rose-500";
    const connText = this.isConnected ? "CONNESSO (LAN)" : "DISCONNESSO";
    const clockSyncStr =
      this.clockOffset !== null
        ? `${this.clockOffset >= 0 ? "+" : ""}${Math.round(this.clockOffset)} ms`
        : "--";

    hud.innerHTML = `
      <div class="flex items-center justify-between gap-3 pb-1 border-b border-white/10">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full ${connDot}"></span>
          <span class="font-bold tracking-wider ${connClass}">${connText}</span>
        </div>
        <span class="text-slate-300 font-mono text-xs font-bold">${this.ping} ms</span>
      </div>
      <div class="flex items-center justify-between gap-3 text-slate-300 text-[10px]">
        <span>Sincro Orologio:</span>
        <span class="font-bold text-emerald-400 font-mono">${clockSyncStr}</span>
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

// Espone l'API globale usata dagli altri moduli (UI, RaceEngine).
// NB: `remotePlayers` resta disponibile come binding globale lessicale
// (const in cima al file) ed è ciò che raceEngine.js già utilizza.
window.NetworkEngine = NetworkEngine;
