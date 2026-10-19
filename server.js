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

// Rete di sicurezza (NON percorso principale): logga sempre lo stack completo
process.on("uncaughtException", (err) => {
  console.warn("[LAN SERVER] Errore non gestito:", err && err.stack ? err.stack : err);
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

// Radice assoluta dei file statici serviti dal gioco
const STATIC_ROOT = path.resolve(__dirname);

// Controllo di sicurezza sul percorso richiesto: rifiuta traversal, byte nulli,
// unità disco (C:) e percorsi UNC/assoluti.
function isSafeStaticPath(reqPath) {
  if (!reqPath || typeof reqPath !== "string") return false;
  if (reqPath.indexOf("\0") !== -1) return false; // byte nullo
  if (/^[a-zA-Z]:/.test(reqPath)) return false; // "C:" / "C:\..."
  if (/^[\\/]{2}/.test(reqPath)) return false; // UNC "\\server\share" o "//server"
  // Nessun segmento ".." (dopo la separazione su / e \)
  if (reqPath.split(/[\\/]+/).some((seg) => seg === "..")) return false;
  return true;
}

// -----------------------------------------------------------------------------
// 1. SERVER HTTP STATICO
// -----------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  // Solo GET e HEAD: nessun altro metodo è ammesso sui file statici
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=UTF-8", "Allow": "GET, HEAD" });
    res.end("405 Metodo Non Consentito");
    return;
  }

  let reqPath = (req.url || "").split("?")[0];

  // Decodifica le sequenze percent-encoded (es. %2e%2e -> ..) prima dei controlli
  try {
    reqPath = decodeURIComponent(reqPath);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("400 Richiesta Non Valida");
    return;
  }

  if (reqPath === "/" || reqPath === "") reqPath = "/index.html";

  if (!isSafeStaticPath(reqPath)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("403 Accesso Negato");
    return;
  }

  const root = STATIC_ROOT;
  const filePath = path.resolve(root, "." + (reqPath.startsWith("/") ? reqPath : "/" + reqPath));

  // Il file risolto DEVE restare dentro la radice del progetto
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("403 Accesso Negato");
    return;
  }

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
    });

    const stream = fs.createReadStream(filePath);
    // Gestione esplicita degli errori di lettura: evita eccezioni non gestite
    stream.on("error", (streamErr) => {
      console.warn("[LAN SERVER] Errore lettura file statico:", streamErr.message);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=UTF-8" });
      }
      res.end();
    });
    stream.pipe(res);
  });
});

// -----------------------------------------------------------------------------
// 1b. VALIDAZIONE ORIGIN + CREAZIONE SERVER WEBSOCKET
// -----------------------------------------------------------------------------
// Host consentiti nell'header Origin: localhost e indirizzi LAN privati
const PRIVATE_HOST_RE = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})$/;

// Validazione permissiva dell'Origin: se l'header è assente (client non-browser,
// es. test/strumenti) o vale "null" (pagina aperta da file://), la connessione è
// consentita. Se presente, l'host deve essere localhost, un IP privato, un nome
// macchina LAN (senza dominio pubblico) o mDNS.
function isAllowedOrigin(origin) {
  if (!origin || origin === "null" || typeof origin !== "string") return true;
  let host;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // rimuove le [] degli IPv6
  } catch (err) {
    return false;
  }
  if (PRIVATE_HOST_RE.test(host)) return true;
  if (host === "::1") return true; // IPv6 loopback
  if (/^fe80:/i.test(host) || /^f[cd][0-9a-f]{2}:/i.test(host)) return true; // IPv6 link-local/ULA
  if (/\.local$/i.test(host)) return true; // mDNS
  if (/^[a-z0-9][a-z0-9-]*$/.test(host)) return true; // nome macchina LAN (nessun punto => non pubblico)
  return false;
}

// maxPayload limita la dimensione dei frame in ingresso (protezione DoS): 64 KB
// sono ampiamente sufficienti per i messaggi 'update' legittimi.
// verifyClient valida l'header Origin PRIMA dell'handshake: una pagina web esterna
// non riesce nemmeno ad aprire la connessione (risposta 401).
const wss = new WebSocket.Server({
  server,
  maxPayload: 64 * 1024,
  verifyClient: (info) => {
    const origin = info && info.req && info.req.headers ? info.req.headers.origin : undefined;
    if (isAllowedOrigin(origin)) return true;
    console.warn(`[LAN] Handshake rifiutato: Origin non consentita (${origin})`);
    return false;
  },
});

// -----------------------------------------------------------------------------
// 2b. HEARTBEAT WEBSOCKET NATIVO (rimozione delle auto fantasma)
// -----------------------------------------------------------------------------
// Usa i ping/pong NATIVI di 'ws': distinti dai messaggi JSON { type: "ping" } del
// protocollo applicativo, quindi non interferisce con la latenza RTT dei client.
const HEARTBEAT_INTERVAL_MS = 30000;
const heartbeatTimer = setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (now - (ws.lastAppSeen || now) > 90000) {
      console.warn("[LAN] Client inattivo oltre il timeout applicativo: terminazione.");
      ws.terminate();
      continue;
    }
    if (ws.isAlive === false) {
      console.warn("[LAN] Socket non reattiva: terminazione (auto fantasma rimossa).");
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      ws.terminate();
    }
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => clearInterval(heartbeatTimer));

// -----------------------------------------------------------------------------
// 2. REGISTRO CONDIVISO DEI GIOCATORI
// -----------------------------------------------------------------------------
// Mappa: playerId -> { id, name, color, carId, x, y, z, rotY, speed, isDrifting, ping }
const players = {};
// Mappa di correlazione socket -> playerId
const socketToId = new Map();
let raceSequence = 1;
let activeRace = null;

// Gestione Host della sessione LAN e impostazioni stanza condivisa
let hostId = null;
let roomSettings = {
  trackId: "monza",
  laps: 3,
  gameMode: "single_race", // 'single_race' | 'championship'
  enableBots: true,
  championship: {
    presetId: "euro_tour",
    name: "Tour Europeo GP (4 Tappe)",
    tracks: ["monza", "spielberg", "silverstone", "spa"],
    currentStageIndex: 0,
    totalStages: 4,
    gridRule: "reverse_8",
    lapsPerRace: 3,
    enableBots: true,
  },
};

let idSequence = 1;
function generateId() {
  return `p_${Date.now().toString(36)}_${idSequence++}`;
}

// -----------------------------------------------------------------------------
// 2c. UTILITÀ DI VALIDAZIONE INPUT (anti spoofing / anti "NaN poisoning")
// -----------------------------------------------------------------------------
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const CAR_ID_RE = /^[a-z0-9_\-]{1,32}$/;
const GAME_MODES = ["single_race", "championship"];

// Intero troncato e vincolato tra min e max; fallback se non è un numero finito
function clampInt(v, min, max, fallback) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// Numero finito garantito: evita di propagare NaN/Infinity (es. 1e400 nel JSON)
function finiteNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Numero finito oppure null (per i campi opzionali come bestTime/bestLapTime)
function finiteOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Rimuove i caratteri di controllo e limita la lunghezza di una stringa
function sanitizeText(v, maxLen) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLen);
}

// Colore esadecimale valido, altrimenti default
function safeColor(v) {
  return typeof v === "string" && COLOR_RE.test(v) ? v : "#00f0ff";
}

// Identificativo auto breve e valido, altrimenti default
function safeCarId(v) {
  return typeof v === "string" && CAR_ID_RE.test(v) ? v : "hatchback";
}

// Modalità di gioco da allowlist, altrimenti fallback
function safeGameMode(v, fallback) {
  return GAME_MODES.indexOf(v) !== -1 ? v : fallback;
}

function safeGridSlots(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [id, slot] of Object.entries(value)) {
    if (
      typeof id === "string" &&
      id.length <= 64 &&
      Number.isInteger(slot) &&
      slot >= 0 &&
      slot < 100
    ) {
      result[id] = slot;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeAiTelemetry(value) {
  if (!Array.isArray(value)) return null;
  const result = [];
  for (const item of value.slice(0, 32)) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !/^ai_[a-z0-9_-]{1,32}$/i.test(item.id)
    ) {
      continue;
    }
    result.push({
      id: item.id,
      x: finiteNumber(item.x, 0),
      y: finiteNumber(item.y, 0),
      z: finiteNumber(item.z, 0),
      rotY: finiteNumber(item.rotY, 0),
      speed: Math.max(0, finiteNumber(item.speed, 0)),
      lap: clampInt(item.lap, 1, 99, 1),
      sampleIndex: clampInt(item.sampleIndex, 0, 1e9, 0),
      totalProgress: finiteNumber(item.totalProgress, 0),
      curTime: Math.max(0, finiteNumber(item.curTime, 0)),
      bestTime: finiteOrNull(item.bestTime),
      finished: Boolean(item.finished),
      finishTime: Math.max(0, finiteNumber(item.finishTime, 0)),
      aiStatusTag: sanitizeText(item.aiStatusTag, 32) || null,
    });
  }
  return result;
}

function createRaceId() {
  return `race_${Date.now().toString(36)}_${raceSequence++}`;
}

function getActiveRaceSnapshot() {
  if (!activeRace) return null;
  return {
    ...activeRace,
    players: Object.values(players),
  };
}

// Token bucket per-socket sui frame 'update': ~120 msg/s con piccolo burst.
// Il tick legittimo (20-30 Hz) resta ampiamente sotto la soglia.
const RATE_LIMIT_PER_SEC = 120;
const RATE_LIMIT_BURST = 60;
const socketBuckets = new WeakMap();

function consumeToken(ws) {
  const now = Date.now();
  let bucket = socketBuckets.get(ws);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_BURST, last: now };
    socketBuckets.set(ws, bucket);
  }
  // Ricarica proporzionale al tempo trascorso dal token precedente
  const elapsed = (now - bucket.last) / 1000;
  bucket.last = now;
  bucket.tokens = Math.min(RATE_LIMIT_BURST, bucket.tokens + elapsed * RATE_LIMIT_PER_SEC);
  if (bucket.tokens < 1) return false; // Limite superato: messaggio scartato
  bucket.tokens -= 1;
  return true;
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

  // Stato per l'heartbeat nativo (ping/pong WS), non per i messaggi JSON 'ping'
  ws.isAlive = true;
  ws.lastAppSeen = Date.now();
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  console.log(`[LAN] Client connesso (socket ID: ${assignedId})`);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (!msg || !msg.type) return;
      ws.lastAppSeen = Date.now();

      switch (msg.type) {
        // =====================================================================
        // 1. NUOVA CONNESSIONE / REGISTRAZIONE GIOCATORE ('init')
        // =====================================================================
        case "init": {
          // L'identità è SEMPRE quella assegnata dal server a questa socket:
          // l'eventuale msg.id inviato dal client viene completamente ignorato.
          const playerId = socketToId.get(ws) || assignedId;
          const oldId = socketToId.get(ws);

          // Re-init della stessa socket: elimina il vecchio giocatore orfano
          // (altrimenti la mappa 'players' si riempirebbe di entry non più usate).
          if (oldId && oldId !== playerId && players[oldId]) {
            delete players[oldId];
            // Se il vecchio giocatore era l'Host, rielegge il primo rimasto
            if (hostId === oldId) {
              const remainingIds = Object.keys(players);
              hostId = remainingIds.length > 0 ? remainingIds[0] : null;
            }
          }
          socketToId.set(ws, playerId);

          const playerData = {
            id: playerId,
            name: sanitizeText(msg.name, 20) || `Pilota ${playerId.slice(-4)}`,
            color: safeColor(msg.color),
            carId: safeCarId(msg.carId),
            x: finiteNumber(msg.x, 0),
            y: finiteNumber(msg.y, 0),
            z: finiteNumber(msg.z, 0),
            rotY: finiteNumber(msg.rotY, 0),
            speed: finiteNumber(msg.speed, 0),
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
            activeRace: getActiveRaceSnapshot(),
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

          if (typeof msg.name === "string") {
            const cleanName = sanitizeText(msg.name, 20);
            if (cleanName) players[pId].name = cleanName;
          }
          if (typeof msg.color === "string" && COLOR_RE.test(msg.color)) {
            players[pId].color = msg.color;
          }
          if (typeof msg.carId === "string" && CAR_ID_RE.test(msg.carId)) {
            players[pId].carId = msg.carId;
          }

          // Se chi invia è l'host e ha cambiato pista o giri
          if (pId === hostId) {
            if (typeof msg.trackId === "string") {
              const cleanTrack = sanitizeText(msg.trackId, 40);
              if (cleanTrack) roomSettings.trackId = cleanTrack;
            }
            if (typeof msg.laps === "number") {
              roomSettings.laps = clampInt(msg.laps, 1, 99, roomSettings.laps);
            }
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
            if (typeof msg.trackId === "string") {
              const cleanTrack = sanitizeText(msg.trackId, 40);
              if (cleanTrack) roomSettings.trackId = cleanTrack;
            }
            if (typeof msg.laps === "number") {
              roomSettings.laps = clampInt(msg.laps, 1, 99, roomSettings.laps);
            }
            if (msg.gameMode) {
              roomSettings.gameMode = safeGameMode(msg.gameMode, roomSettings.gameMode);
            }
            if (msg.championship && typeof msg.championship === "object" && !Array.isArray(msg.championship)) {
              roomSettings.championship = {
                ...msg.championship,
                gridSlots: safeGridSlots(msg.championship.gridSlots),
              };
            }
            if (typeof msg.enableBots === "boolean") {
              roomSettings.enableBots = msg.enableBots;
              if (roomSettings.championship) roomSettings.championship.enableBots = msg.enableBots;
            }
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
          // Identità dal server: 'msg.id' è ignorato (previene lo spoofing)
          const pId = socketToId.get(ws);
          if (!pId || !players[pId]) return;
          if (
            activeRace &&
            typeof msg.raceId === "string" &&
            msg.raceId !== activeRace.raceId
          ) {
            return;
          }

          // Rate limiting per-socket: i frame in eccesso vengono scartati (no broadcast)
          if (!consumeToken(ws)) return;

          // Sanificazione numerica: JSON può contenere 1e400 (=> Infinity) o campi
          // errati. I valori non finiti vengono sostituiti con un default sicuro per
          // evitare il "NaN poisoning" dello stato condiviso e dei client remoti.
          const x = finiteNumber(msg.x, 0);
          const y = finiteNumber(msg.y, 0);
          const z = finiteNumber(msg.z, 0);
          const vx = finiteNumber(msg.vx, 0);
          const vy = finiteNumber(msg.vy, 0);
          const vz = finiteNumber(msg.vz, 0);
          const rotY = finiteNumber(msg.rotY, 0);
          const yawRate = finiteNumber(msg.yawRate, 0);
          const speed = finiteNumber(msg.speed, 0);
          const t = finiteNumber(msg.t, Date.now());
          const curTime = finiteNumber(msg.curTime, 0);
          const totalProgress = finiteNumber(msg.totalProgress, 0);
          const sampleIndex = clampInt(msg.sampleIndex, 0, 1e9, 0);
          const finishTime = finiteNumber(msg.finishTime, 0);
          const lap = clampInt(msg.lap, 1, 99, players[pId].lap || 1);
          const bestTime = finiteOrNull(msg.bestTime);
          const isDrifting = Boolean(msg.isDrifting);
          const finished = Boolean(msg.finished);

          // Aggiorna lo stato in memoria inclusa la telemetria di gara ed estrapolazione
          players[pId].x = x;
          players[pId].y = y;
          players[pId].z = z;
          players[pId].vx = vx;
          players[pId].vy = vy;
          players[pId].vz = vz;
          players[pId].rotY = rotY;
          players[pId].yawRate = yawRate;
          players[pId].speed = speed;
          players[pId].isDrifting = isDrifting;
          players[pId].t = t;
          players[pId].lap = lap;
          players[pId].sampleIndex = sampleIndex;
          players[pId].totalProgress = totalProgress;
          players[pId].curTime = curTime;
          players[pId].bestTime = bestTime;
          players[pId].finished = finished;
          players[pId].finishTime = finishTime;
          players[pId].raceId = activeRace ? activeRace.raceId : null;
          if (activeRace && activeRace.status !== "finished") {
            activeRace.status = "active";
          }

          // BROADCAST SELETTIVO IMMEDIATO a tutti gli ALTRI client eccetto il mittente
          broadcastExcept(ws, {
            type: "update",
            id: pId,
            t: t,
            x: x,
            y: y,
            z: z,
            vx: vx,
            vy: vy,
            vz: vz,
            rotY: rotY,
            yawRate: yawRate,
            speed: speed,
            isDrifting: isDrifting,
            lap: lap,
            sampleIndex: sampleIndex,
            totalProgress: totalProgress,
            curTime: curTime,
            bestTime: bestTime,
            finished: finished,
            finishTime: finishTime,
            aiList: sanitizeAiTelemetry(msg.aiList),
            raceId: activeRace ? activeRace.raceId : null,
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
          if (activeRace && activeRace.status !== "finished") {
            console.log(`[LAN] Avvio gara duplicato ignorato (${activeRace.raceId})`);
            return;
          }

          const trackId = (typeof msg.trackId === "string" && sanitizeText(msg.trackId, 40)) || roomSettings.trackId || "monza";
          const laps = clampInt(msg.laps, 1, 99, roomSettings.laps || 3);
          const gameMode = safeGameMode(msg.gameMode, roomSettings.gameMode || "single_race");
          const rawChampionship =
            msg.championship &&
            typeof msg.championship === "object" &&
            !Array.isArray(msg.championship)
              ? msg.championship
              : roomSettings.championship || null;
          const championship = rawChampionship
            ? {
                ...rawChampionship,
                gridSlots: safeGridSlots(rawChampionship.gridSlots),
              }
            : null;
          const enableBots = (typeof msg.enableBots === "boolean") ? msg.enableBots : (roomSettings.enableBots !== false);
          // Durata countdown finita e vincolata: un valore NaN propagherebbe
          // 'raceStartTime' non valido a tutti i client.
          const countdownDuration = Math.min(30, Math.max(0.5, finiteNumber(msg.countdownDuration, 4.5)));
          const nowServer = Date.now();
          const raceStartTime = nowServer + Math.round(countdownDuration * 1000);
          const raceId = createRaceId();
          const gridSlots = safeGridSlots(msg.gridSlots);
          activeRace = {
            raceId,
            status: "starting",
            trackId,
            laps,
            gameMode,
            championship,
            enableBots,
            countdownDuration,
            raceStartTime,
            gridSlots,
            startedBy: pId,
          };

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

          console.log(`[LAN] Segnale di partenza gara inviato dall'Host (${pId}) a tutti i ${Object.keys(players).length} giocatori [Modo: ${gameMode}, Bot: ${enableBots}]`);
          broadcastAll({
            type: "start_race",
            trackId: trackId,
            countdownDuration: countdownDuration,
            laps: laps,
            gameMode: gameMode,
            championship: championship,
            enableBots: enableBots,
            gridSlots,
            players: Object.values(players),
            serverTime: nowServer,
            startTime: nowServer,
            raceStartTime: raceStartTime,
            raceId,
          });
          break;
        }

        // =====================================================================
        // 7. TRAGUARDO GARA (FINISH_RACE)
        // =====================================================================
        case "finish_race": {
          // Identità dal server: 'msg.id' è ignorato (previene lo spoofing)
          const pId = socketToId.get(ws);
          if (!pId || !players[pId]) return;

          const finishTime = finiteNumber(msg.finishTime, 0);
          const bestLapTime = finiteOrNull(msg.bestLapTime);
          if (
            activeRace &&
            typeof msg.raceId === "string" &&
            msg.raceId !== activeRace.raceId
          ) {
            return;
          }

          players[pId].finished = true;
          players[pId].finishTime = finishTime;
          if (bestLapTime !== null) players[pId].bestLapTime = bestLapTime;
          if (activeRace) {
            players[pId].raceId = activeRace.raceId;
            const activeIds = Object.keys(players);
            const allFinished = activeIds.length > 0 && activeIds.every(
              (id) => players[id].finished,
            );
            if (allFinished) activeRace.status = "finished";
          }

          broadcastAll({
            type: "finish_race",
            id: pId,
            finishTime: finishTime,
            bestLapTime: bestLapTime,
            raceId: activeRace ? activeRace.raceId : null,
          });
          break;
        }

        // =====================================================================
        // 8. ALTRI EVENTI DI GARA (checkpoint_pass, ecc.)
        // =====================================================================
        case "checkpoint_pass": {
          // Identità dal server: 'msg.id' è ignorato (previene lo spoofing)
          const pId = socketToId.get(ws);
          if (!pId || !players[pId]) return;

          const lap = clampInt(msg.lap, 1, 99, players[pId].lap || 1);
          const sampleIndex = clampInt(msg.sampleIndex, 0, 1e9, 0);
          const totalProgress = finiteNumber(msg.totalProgress, players[pId].totalProgress || 0);
          const raceId = typeof msg.raceId === "string" ? msg.raceId : null;
          if (activeRace && raceId && raceId !== activeRace.raceId) return;

          players[pId].lap = lap;
          players[pId].sampleIndex = sampleIndex;
          players[pId].totalProgress = totalProgress;
          players[pId].raceId = raceId;

          // Inoltra un payload sanificato con l'ID assegnato dal server
          broadcastExcept(ws, {
            type: "checkpoint_pass",
            id: pId,
            lap: lap,
            sampleIndex: sampleIndex,
            totalProgress: totalProgress,
            raceId: activeRace ? activeRace.raceId : null,
          });
          break;
        }

        default:
          console.warn(`[LAN] Tipo messaggio sconosciuto ignorato: ${msg.type}`);
          break;
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
      if (Object.keys(players).length === 0) {
        activeRace = null;
      } else if (
        activeRace &&
        activeRace.status !== "finished" &&
        Object.values(players).every((player) => player.finished)
      ) {
        activeRace.status = "finished";
      }

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
