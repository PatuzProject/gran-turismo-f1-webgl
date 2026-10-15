"use strict";

/**
 * =============================================================================
 * GRAN TURISMO & TRACKMANIA — LAN MULTIPLAYER SERVER (Node.js + WebSockets)
 * =============================================================================
 * Protocollo di Sincronizzazione Real-Time:
 * 1. 'init'         -> Client si connette, riceve il proprio ID e la lista di tutte
 *                      le auto già presenti. Gli altri ricevono 'playerJoined'.
 * 2. 'update'       -> Client invia { id, x, y, z, rotY, speed, isDrifting }.
 *                      Il server aggiorna lo stato e fa broadcast immediato
 *                      a TUTTI gli altri client eccetto il mittente.
 * 3. 'playerLeft'   -> Quando un client si disconnette, notifica a tutti l'ID da distruggere.
 * 4. 'ping'/'pong'  -> Heartbeat per misurare la latenza (ms) in tempo reale.
 *
 * Include server HTTP statico sulla porta 3000 per servire il gioco in LAN.
 * =============================================================================
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

let WebSocket;
try {
  WebSocket = require("ws");
} catch (err) {
  console.error("\n[ERRORE] Il modulo 'ws' non è installato. Esegui: npm install ws\n");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

process.on("uncaughtException", (err) => {
  console.warn("[LAN SERVER] Errore non gestito:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.warn("[LAN SERVER] Rejection non gestita:", reason);
});

// MIME types per servire i file statici
const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// -----------------------------------------------------------------------------
// 1. SERVER HTTP STATICO
// -----------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/" || reqPath === "") reqPath = "/index.html";

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
      res.end("404 Non Trovato: " + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

// -----------------------------------------------------------------------------
// 2. REGISTRO CONDIVISO DEI GIOCATORI
// -----------------------------------------------------------------------------
const wss = new WebSocket.Server({ server });

// Mappa: playerId -> { id, name, color, carId, x, y, z, rotY, speed, isDrifting, ping }
const players = {};
// Mappa di correlazione socket -> playerId
const socketToId = new Map();

// Gestione Host della sessione LAN e impostazioni stanza condivisa
let hostId = null;
let roomSettings = {
  trackId: "monza",
  laps: 3,
};

let idSequence = 1;
function generateId() {
  return `p_${Date.now().toString(36)}_${idSequence++}`;
}

// Invia JSON a un socket specifico
function sendJSON(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// Broadcast selettivo: invia a tutti i client TRANNE il socket specificato (mittente)
function broadcastExcept(senderWs, obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Broadcast a tutti indistintamente
function broadcastAll(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// -----------------------------------------------------------------------------
// 3. GESTIONE EVENTI WEBSOCKET
// -----------------------------------------------------------------------------
wss.on("connection", (ws, req) => {
  const assignedId = generateId();
  socketToId.set(ws, assignedId);

  console.log(`[LAN] Client connesso (socket ID: ${assignedId})`);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (!msg || !msg.type) return;

      switch (msg.type) {
        // =====================================================================
        // 1. NUOVA CONNESSIONE / REGISTRAZIONE GIOCATORE ('init')
        // =====================================================================
        case "init": {
          const playerId = msg.id || assignedId;
          socketToId.set(ws, playerId);

          const playerData = {
            id: playerId,
            name: (msg.name && String(msg.name).trim().slice(0, 20)) || `Pilota ${playerId.slice(-4)}`,
            color: msg.color || "#00f0ff",
            carId: msg.carId || "hatchback",
            x: typeof msg.x === "number" ? msg.x : 0,
            y: typeof msg.y === "number" ? msg.y : 0,
            z: typeof msg.z === "number" ? msg.z : 0,
            rotY: typeof msg.rotY === "number" ? msg.rotY : 0,
            speed: typeof msg.speed === "number" ? msg.speed : 0,
            isDrifting: Boolean(msg.isDrifting),
            ping: 0,
          };

          // Salva nel dizionario di stato
          players[playerId] = playerData;

          // Se non c'è ancora un host o l'host precedente si è disconnesso, questo client diventa Host
          if (!hostId || !players[hostId]) {
            hostId = playerId;
            console.log(`[LAN] Nuovo Host designato: ${playerData.name} (${hostId})`);
          }

          console.log(`[LAN] Giocatore registrato: ${playerData.name} (ID: ${playerId}, Colore: ${playerData.color}, Host: ${hostId === playerId})`);

          // Invia al nuovo client l'elenco di TUTTI i giocatori già connessi, l'ID dell'host e le impostazioni stanza
          sendJSON(ws, {
            type: "init",
            id: playerId,
            hostId: hostId,
            roomSettings: roomSettings,
            players: players, // Mappa completa di tutte le auto nella stanza
          });

          // Notifica a tutti gli ALTRI client che è entrato un nuovo giocatore con l'host attuale
          broadcastExcept(ws, {
            type: "playerJoined",
            player: playerData,
            hostId: hostId,
          });
          break;
        }

        // =====================================================================
        // 2. AGGIORNAMENTO PROFILO (NICKNAME, COLORE, AUTO O CONFIGURAZIONE HOST)
        // =====================================================================
        case "update_profile": {
          const pId = socketToId.get(ws);
          if (!pId || !players[pId]) return;

          if (msg.name && typeof msg.name === "string") {
            players[pId].name = msg.name.trim().slice(0, 20);
          }
          if (msg.color) {
            players[pId].color = msg.color;
          }
          if (msg.carId) {
            players[pId].carId = msg.carId;
          }

          // Se chi invia è l'host e ha cambiato pista o giri
          if (pId === hostId) {
            if (msg.trackId) roomSettings.trackId = msg.trackId;
            if (typeof msg.laps === "number") roomSettings.laps = msg.laps;
          }

          // Broadcast aggiornamento a TUTTI i client per sincronizzare la lobby in tempo reale
          broadcastAll({
            type: "playerUpdated",
            player: players[pId],
            hostId: hostId,
            roomSettings: roomSettings,
          });
          break;
        }

        // =====================================================================
        // 3. AGGIORNAMENTO STANZA DA PARTE DELL'HOST
        // =====================================================================
        case "update_room": {
          const pId = socketToId.get(ws);
          if (pId === hostId) {
            if (msg.trackId) roomSettings.trackId = msg.trackId;
            if (typeof msg.laps === "number") roomSettings.laps = msg.laps;
            broadcastAll({
              type: "roomUpdated",
              roomSettings: roomSettings,
              hostId: hostId,
            });
          }
          break;
        }

        // =====================================================================
        // 4. AGGIORNAMENTO TRASFORMAZIONI FISICHE ('update')
        // =====================================================================
        case "update": {
          const pId = msg.id || socketToId.get(ws);
          if (!pId) return;

          // Aggiorna lo stato in memoria inclusa la telemetria di gara ed estrapolazione
          if (players[pId]) {
            players[pId].x = msg.x;
            players[pId].y = msg.y;
            players[pId].z = msg.z;
            players[pId].vx = typeof msg.vx === "number" ? msg.vx : 0;
            players[pId].vy = typeof msg.vy === "number" ? msg.vy : 0;
            players[pId].vz = typeof msg.vz === "number" ? msg.vz : 0;
            players[pId].rotY = msg.rotY;
            players[pId].yawRate = typeof msg.yawRate === "number" ? msg.yawRate : 0;
            players[pId].speed = msg.speed || 0;
            players[pId].isDrifting = Boolean(msg.isDrifting);
            players[pId].t = typeof msg.t === "number" ? msg.t : Date.now();
            if (typeof msg.lap === "number") players[pId].lap = msg.lap;
            if (typeof msg.sampleIndex === "number") players[pId].sampleIndex = msg.sampleIndex;
            if (typeof msg.totalProgress === "number") players[pId].totalProgress = msg.totalProgress;
            if (typeof msg.curTime === "number") players[pId].curTime = msg.curTime;
            if (msg.bestTime) players[pId].bestTime = msg.bestTime;
            if (typeof msg.finished === "boolean") players[pId].finished = msg.finished;
            if (typeof msg.finishTime === "number") players[pId].finishTime = msg.finishTime;
          }

          // BROADCAST SELETTIVO IMMEDIATO a tutti gli ALTRI client eccetto il mittente
          broadcastExcept(ws, {
            type: "update",
            id: pId,
            t: typeof msg.t === "number" ? msg.t : Date.now(),
            x: msg.x,
            y: msg.y,
            z: msg.z,
            vx: typeof msg.vx === "number" ? msg.vx : 0,
            vy: typeof msg.vy === "number" ? msg.vy : 0,
            vz: typeof msg.vz === "number" ? msg.vz : 0,
            rotY: msg.rotY,
            yawRate: typeof msg.yawRate === "number" ? msg.yawRate : 0,
            speed: msg.speed || 0,
            isDrifting: Boolean(msg.isDrifting),
            lap: msg.lap || 1,
            sampleIndex: msg.sampleIndex || 0,
            totalProgress: typeof msg.totalProgress === "number" ? msg.totalProgress : 0,
            curTime: msg.curTime || 0,
            bestTime: msg.bestTime || null,
            finished: Boolean(msg.finished),
            finishTime: msg.finishTime || 0,
          });
          break;
        }

        // =====================================================================
        // 5. HEARTBEAT PING / PONG (Latenza RTT & Sincronizzazione Orologio NTP)
        // =====================================================================
        case "ping": {
          sendJSON(ws, {
            type: "pong",
            t0: msg.t0,
            perf0: msg.perf0,
            clientTime: msg.clientTime,
            serverTime: Date.now(),
          });
          break;
        }

        // =====================================================================
        // 6. AVVIO GARA SINCRONIZZATO (COUNTDOWN GLOBALE AL MILLISECONDO)
        // =====================================================================
        case "start_race": {
          const pId = socketToId.get(ws);
          // Solo l'host può avviare la gara (o se c'è un solo partecipante)
          if (hostId && pId !== hostId && Object.keys(players).length > 1) {
            console.log(`[LAN] Rifiutato avvio gara: client ${pId} non è l'host (${hostId})`);
            return;
          }

          const trackId = msg.trackId || roomSettings.trackId || "monza";
          const laps = msg.laps || roomSettings.laps || 3;
          const countdownDuration = msg.countdownDuration || 4.5;
          const nowServer = Date.now();
          const raceStartTime = nowServer + Math.round(countdownDuration * 1000);

          // Reset stato e telemetria gara per tutti i concorrenti
          for (const pid in players) {
            players[pid].lap = 1;
            players[pid].sampleIndex = 0;
            players[pid].totalProgress = 0;
            players[pid].finished = false;
            players[pid].finishTime = 0;
            players[pid].curTime = 0;
            players[pid].bestTime = null;
          }

          console.log(`[LAN] Segnale di partenza gara inviato dall'Host (${pId}) a tutti i ${Object.keys(players).length} giocatori`);
          broadcastAll({
            type: "start_race",
            trackId: trackId,
            countdownDuration: countdownDuration,
            laps: laps,
            players: Object.values(players),
            serverTime: nowServer,
            startTime: nowServer,
            raceStartTime: raceStartTime,
          });
          break;
        }

        // =====================================================================
        // 7. TRAGUARDO GARA (FINISH_RACE)
        // =====================================================================
        case "finish_race": {
          const pId = msg.id || socketToId.get(ws);
          if (pId && players[pId]) {
            players[pId].finished = true;
            players[pId].finishTime = msg.finishTime;
            if (msg.bestLapTime) players[pId].bestLapTime = msg.bestLapTime;
          }
          broadcastAll({
            type: "finish_race",
            id: pId,
            finishTime: msg.finishTime,
            bestLapTime: msg.bestLapTime,
          });
          break;
        }

        // =====================================================================
        // 8. ALTRI EVENTI DI GARA (checkpoint_pass, ecc.)
        // =====================================================================
        case "checkpoint_pass": {
          const pId = msg.id || socketToId.get(ws);
          if (pId && players[pId]) {
            players[pId].lap = msg.lap;
            players[pId].sampleIndex = msg.sampleIndex;
            players[pId].totalProgress = msg.totalProgress;
          }
          broadcastExcept(ws, msg);
          break;
        }

        default: {
          broadcastExcept(ws, msg);
          break;
        }
      }
    } catch (err) {
      console.warn("[LAN] Errore elaborazione messaggio JSON:", err.message);
    }
  });

  // ===========================================================================
  // 9. DISCONNESSIONE CLIENT ('playerLeft')
  // ===========================================================================
  ws.on("close", () => {
    const pId = socketToId.get(ws);
    socketToId.delete(ws);

    if (pId && players[pId]) {
      const leftPlayer = players[pId];
      delete players[pId];

      // Se chi si è disconnesso era l'host, eleggi il primo giocatore rimasto
      if (hostId === pId) {
        const remainingIds = Object.keys(players);
        hostId = remainingIds.length > 0 ? remainingIds[0] : null;
        if (hostId) {
          console.log(`[LAN] Passaggio di consegne Host a: ${players[hostId].name} (${hostId})`);
        }
      }

      console.log(`[LAN] Disconnessione: ${leftPlayer.name} (${pId}). Rimanenti: ${Object.keys(players).length}, Host attuale: ${hostId}`);

      // Notifica a tutti i client rimasti la rimozione del giocatore e il nuovo host
      broadcastAll({
        type: "playerLeft",
        id: pId,
        hostId: hostId,
        players: players,
      });
    }
  });

  ws.on("error", (err) => {
    console.warn(`[LAN] Errore socket:`, err.message);
  });
});

// -----------------------------------------------------------------------------
// 4. AVVIO SERVER CON RILEVAMENTO IP LOCALE
// -----------------------------------------------------------------------------
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n==================================================================`);
    console.error(`[ERRORE] La porta ${PORT} è già occupata da un'altra istanza o processo!`);
    console.error(`==================================================================`);
    console.error(`👉 Per terminare la vecchia istanza su Windows (PowerShell):`);
    console.error(`   Get-Process node | Stop-Process -Force`);
    console.error(`👉 Oppure avvia il server su un'altra porta:`);
    console.error(`   $env:PORT=3001; node server.js\n`);
    process.exit(1);
  } else {
    console.error("[ERRORE SERVER]", err);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLocalIps();
  console.log("\n==================================================================");
  console.log("   GRAN TURISMO & TRACKMANIA — SERVER MULTIPLAYER LAN ATTIVO!    ");
  console.log("==================================================================");
  console.log(` • Locale:        http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach((ip) => {
      console.log(` • Indirizzo LAN: http://${ip}:${PORT}`);
    });
    console.log("\n 👉 Apri questo link dal secondo PC o Smartphone connesso allo stesso Wi-Fi!");
  } else {
    console.log(" (Apri più schede su http://localhost:3000 per testare il multiplayer)");
  }
  console.log(" • Protocollo:    init | update (broadcast selettivo) | playerLeft");
  console.log(" • Premi CTRL+C per arrestare il server.");
  console.log("==================================================================\n");
});
