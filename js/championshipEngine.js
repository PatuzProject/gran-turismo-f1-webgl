"use strict";

/**
 * =============================================================================
 * CHAMPIONSHIP ENGINE — GRAND PRIX SEASON & TORNEO A TAPPE
 * =============================================================================
 * Gestisce:
 * - Calendario a tappe (4 o 5 gare consecutive) con presets o personalizzato
 * - Giri personalizzabili per gara
 * - Classifica generale piloti a punti FIA Formula 1 (25, 18, 15, 12, 10, 8, 6, 4, 2, 1 + 1 pt giro veloce)
 * - Calcolo dinamico della griglia di partenza per la tappa successiva (Griglia Invertita Top 8 o Ordine d'Arrivo)
 * - Controllo esclusivo dell'Host / Giocatore per avanzare alla tappa successiva
 * - Cerimonia finale modulare con podio, trofeo e super montepremi (intercambiabile con classifica tabellare classica)
 * - Persistenza dello stato su localStorage
 * =============================================================================
 */

const ChampionshipEngine = {
  // Punteggio ufficiale FIA Formula 1 per i primi 10
  FIA_POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],

  // Preset Tornei Predefiniti
  PRESETS: {
    euro_tour: {
      id: "euro_tour",
      name: "Tour Europeo GP (4 Tappe)",
      description: "La classica tournée europea sui circuiti più leggendari ed esigenti del motorsport.",
      badge: "EURO TOUR • 4 TAPPE",
      tracks: ["monza", "spielberg", "silverstone", "spa"],
    },
    world_tour: {
      id: "world_tour",
      name: "Campionato Mondiale F1 (5 Tappe)",
      description: "Il giro del mondo attraverso 4 continenti, dalla terra dei canguri al tempio della velocità.",
      badge: "WORLD TOUR • 5 TAPPE",
      tracks: ["melbourne", "suzuka", "austin", "sao_paulo", "monza"],
    },
    custom: {
      id: "custom",
      name: "Campionato Personalizzato",
      description: "Componi il tuo torneo selezionando 4 o 5 piste a tua scelta dal catalogo ufficiale.",
      badge: "PERSONALIZZATO",
      tracks: ["monza", "catalunya", "spielberg", "spa"],
    },
  },

  // Stato corrente del campionato attivo
  state: null,
  showFullCeremony: true, // Flag modulare: cerimonia completa con coppa vs semplice tabella

  // ---------------------------------------------------------------------------
  // 1. INIZIALIZZAZIONE & PERSISTENZA
  // ---------------------------------------------------------------------------
  init() {
    this.loadState();
  },

  loadState() {
    try {
      const raw = localStorage.getItem("gt_f1_championship_state");
      if (raw) {
        this.state = JSON.parse(raw);
      }
    } catch (e) {
      console.warn("[ChampionshipEngine] Errore caricamento stato:", e);
      this.state = null;
    }
  },

  saveState() {
    if (!this.state) {
      localStorage.removeItem("gt_f1_championship_state");
      return;
    }
    try {
      localStorage.setItem("gt_f1_championship_state", JSON.stringify(this.state));
    } catch (e) {
      console.warn("[ChampionshipEngine] Errore salvataggio stato:", e);
    }
  },

  hasActiveSeason() {
    return Boolean(this.state && !this.state.completed);
  },

  hasCompletedSeason() {
    return Boolean(this.state && this.state.completed);
  },

  resetChampionship() {
    this.state = null;
    this.saveState();
  },

  // ---------------------------------------------------------------------------
  // 2. CREAZIONE NUOVO CAMPIONATO
  // ---------------------------------------------------------------------------
  createSeason(options) {
    const presetId = options.presetId || "euro_tour";
    const preset = this.PRESETS[presetId] || this.PRESETS.euro_tour;
    const tracks = (options.tracks && options.tracks.length >= 2) ? options.tracks : [...preset.tracks];
    const lapsPerRace = Math.max(1, Number(options.laps) || 3);
    const gridRule = options.gridRule === "results" ? "results" : "reverse_8"; // default top 8 invertiti
    const difficulty = options.difficulty || "medium";
    const gridSize = Math.min(12, Math.max(8, Number(options.gridSize) || 10));

    // Genera roster piloti unificato per l'intera stagione
    const drivers = [];

    // Pilota giocatore
    const playerName = (typeof GameApp !== "undefined" && GameApp.profile && GameApp.profile.nickname) || "Tu";
    drivers.push({
      id: 0,
      isPlayer: true,
      name: `${playerName} (TU)`,
      code: playerName.slice(0, 3).toUpperCase(),
      paint: null, // usa vernice auto attiva
      points: 0,
      wins: 0,
      podiums: 0,
      fastestLaps: 0,
      rank: 1,
      previousRank: 1,
      resultsHistory: [],
    });

    // Piloti IA costanti per tutto il campionato
    const aiCount = gridSize - 1;
    for (let i = 0; i < aiCount; i++) {
      const aiProf = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
      drivers.push({
        id: i + 1,
        isPlayer: false,
        name: aiProf.name,
        code: aiProf.code,
        paint: aiProf.paint,
        aiProfile: aiProf,
        points: 0,
        wins: 0,
        podiums: 0,
        fastestLaps: 0,
        rank: i + 2,
        previousRank: i + 2,
        resultsHistory: [],
      });
    }

    // Griglia iniziale equilibrata per Tappa 1: il giocatore parte a metà schieramento
    const playerStartSlot = Math.floor(gridSize / 2); // es. 4° o 5° posto
    const initialGridSlots = {};
    initialGridSlots[0] = playerStartSlot;
    let nextSlot = 0;
    for (let i = 0; i < aiCount; i++) {
      if (nextSlot === playerStartSlot) nextSlot++;
      initialGridSlots[i + 1] = nextSlot;
      nextSlot++;
    }

    this.state = {
      id: `season_${Date.now()}`,
      presetId: presetId,
      name: options.name || preset.name,
      badge: preset.badge,
      tracks: tracks,
      totalStages: tracks.length,
      currentStageIndex: 0,
      lapsPerRace: lapsPerRace,
      gridRule: gridRule,
      difficulty: difficulty,
      gridSize: gridSize,
      completed: false,
      drivers: drivers,
      currentGridSlots: initialGridSlots,
      stageHistory: [],
    };

    this.saveState();
    return this.state;
  },

  // ---------------------------------------------------------------------------
  // 2b. CREAZIONE & SINCRONIZZAZIONE CAMPIONATO LAN MULTIPLAYER
  // ---------------------------------------------------------------------------
  initLanSeason(champConfig, lanPlayers, myId) {
    champConfig = champConfig || {};
    const presetId = champConfig.presetId || "euro_tour";
    const preset = this.PRESETS[presetId] || this.PRESETS.euro_tour;
    const tracks = (Array.isArray(champConfig.tracks) && champConfig.tracks.length >= 2)
      ? champConfig.tracks
      : [...preset.tracks];
    const lapsPerRace = Math.max(1, Number(champConfig.laps) || 3);
    const gridRule = champConfig.gridRule === "results" ? "results" : "reverse_8";
    const difficulty = champConfig.difficulty || "medium";
    const enableBots = champConfig.enableBots !== false;
    const gridSize = Math.min(12, Math.max(8, Number(champConfig.gridSize) || 10));
    // Con gli avversari IA disattivati la griglia coincide con i soli piloti reali
    let resolvedGridSize = gridSize;

    let drivers = [];
    let initialGridSlots = {};

    // Se l'Host ha già generato e trasmesso il roster ufficiale dei piloti e la griglia
    if (Array.isArray(champConfig.drivers) && champConfig.drivers.length > 0) {
      drivers = champConfig.drivers.map((d) => {
        const isMe = (d.id === myId);
        return {
          ...d,
          isPlayer: isMe,
          isRemotePlayer: !isMe && !d.isAi,
        };
      });
      initialGridSlots = champConfig.gridSlots || {};
      if (!enableBots) {
        resolvedGridSize = Math.max(1, drivers.length);
      }
    } else {
      // Ordina i partecipanti umani in modo deterministico su tutti i client
      const hostPlayerId = (typeof NetworkEngine !== "undefined" && NetworkEngine.hostId) || null;
      const sortedHumans = Array.isArray(lanPlayers)
        ? [...lanPlayers].sort((a, b) => {
            if (hostPlayerId) {
              if (a.id === hostPlayerId) return -1;
              if (b.id === hostPlayerId) return 1;
            }
            return String(a.id).localeCompare(String(b.id));
          })
        : [];

      // Se gli avversari IA sono disattivati, la griglia si riduce ai soli piloti reali
      if (!enableBots) {
        resolvedGridSize = Math.max(1, sortedHumans.length);
      }

      // 1. Piloti umani connessi
      sortedHumans.forEach((p, idx) => {
        const isMe = (p.id === myId);
        const drv = {
          id: p.id,
          isPlayer: isMe,
          isRemotePlayer: !isMe,
          name: isMe ? `${p.name || "Tu"} (TU)` : (p.name || `Pilota ${p.id}`),
          code: (p.name || "LAN").slice(0, 3).toUpperCase(),
          paint: p.color || null,
          carId: p.carId || "hatchback",
          points: 0,
          wins: 0,
          podiums: 0,
          fastestLaps: 0,
          rank: idx + 1,
          previousRank: idx + 1,
          resultsHistory: [],
        };
        drivers.push(drv);
        initialGridSlots[p.id] = idx;
      });

      // 2. Piloti IA ufficiali F1 per completare la griglia (solo se abilitati dall'Host)
      const aiNeeded = enableBots ? Math.max(0, resolvedGridSize - sortedHumans.length) : 0;
      for (let i = 0; i < aiNeeded; i++) {
        const aiProf = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
        const aiId = `ai_${i + 1}`;
        const slot = sortedHumans.length + i;
        drivers.push({
          id: aiId,
          isPlayer: false,
          isAi: true,
          name: aiProf.name,
          code: aiProf.code,
          paint: aiProf.paint,
          aiProfile: aiProf,
          points: 0,
          wins: 0,
          podiums: 0,
          fastestLaps: 0,
          rank: slot + 1,
          previousRank: slot + 1,
          resultsHistory: [],
        });
        initialGridSlots[aiId] = slot;
      }
    }

    this.state = {
      id: champConfig.seasonId || `lan_season_${Date.now()}`,
      isLan: true,
      presetId: presetId,
      name: champConfig.name || preset.name,
      badge: champConfig.badge || preset.badge || "GRAN PREMIO LAN",
      tracks: tracks,
      totalStages: tracks.length,
      currentStageIndex: champConfig.currentStageIndex || 0,
      lapsPerRace: lapsPerRace,
      gridRule: gridRule,
      difficulty: difficulty,
      gridSize: resolvedGridSize,
      enableBots: enableBots,
      completed: false,
      drivers: drivers,
      currentGridSlots: champConfig.gridSlots || initialGridSlots,
      stageHistory: [],
    };

    this.saveState();
    return this.state;
  },

  syncLanSeason(champConfig) {
    if (!champConfig) return;
    if (this.state && this.state.isLan) {
      if (typeof champConfig.currentStageIndex === "number") {
        this.state.currentStageIndex = champConfig.currentStageIndex;
      }
      if (champConfig.gridSlots) {
        this.state.currentGridSlots = champConfig.gridSlots;
      }
      if (Array.isArray(champConfig.drivers) && champConfig.drivers.length > 0) {
        const myId = (typeof NetworkEngine !== "undefined" && (NetworkEngine.myPlayerId || NetworkEngine.myId)) || "local";
        this.state.drivers = champConfig.drivers.map((d) => {
          const isMe = (d.id === myId);
          return {
            ...d,
            isPlayer: isMe,
            isRemotePlayer: !isMe && !d.isAi,
          };
        });
      }
      this.saveState();
    }
  },

  // ---------------------------------------------------------------------------
  // 3. CALCOLO GRIGLIA & AVANZAMENTO TAPPE
  // ---------------------------------------------------------------------------
  getCurrentTrackId() {
    if (!this.state) return "monza";
    return this.state.tracks[this.state.currentStageIndex] || "monza";
  },

  isFinalStage() {
    if (!this.state) return false;
    return this.state.currentStageIndex >= this.state.totalStages - 1;
  },

  getCurrentStageNumber() {
    if (!this.state) return 1;
    return this.state.currentStageIndex + 1;
  },

  // Restituisce la griglia di partenza per la gara corrente
  getGridSlots() {
    if (!this.state || !this.state.currentGridSlots) return {};
    return this.state.currentGridSlots;
  },

  // Registra i risultati di una tappa appena conclusa
  recordStageResults(standings, fastestLapDriverId) {
    if (!this.state || !Array.isArray(standings)) return null;

    const currentTrackId = this.getCurrentTrackId();
    const stageIdx = this.state.currentStageIndex;

    // Assegna punti FIA ai primi 10 classificati
    const stageAwards = [];
    standings.forEach((racer, finishIdx) => {
      const finishPos = finishIdx + 1;
      let fiaPts = 0;
      if (finishIdx < this.FIA_POINTS.length) {
        fiaPts = this.FIA_POINTS[finishIdx];
      }

      // Bonus +1 punto giro record se nei primi 10
      const isFastestLap = (racer.id === fastestLapDriverId);
      if (isFastestLap && finishPos <= 10) {
        fiaPts += 1;
      }

      const driver = this.state.drivers.find((d) => d.id === racer.id);
      if (driver) {
        driver.points += fiaPts;
        if (finishPos === 1) driver.wins += 1;
        if (finishPos <= 3) driver.podiums += 1;
        if (isFastestLap) driver.fastestLaps += 1;
        driver.resultsHistory.push({
          stageIndex: stageIdx,
          trackId: currentTrackId,
          finishPos: finishPos,
          points: fiaPts,
          isFastestLap: isFastestLap,
        });
      }

      stageAwards.push({
        id: racer.id,
        driverName: racer.driverName || (driver ? driver.name : `Pilota ${racer.id}`),
        driverCode: racer.driverCode || (driver ? driver.code : "PIL"),
        isPlayer: racer.isPlayer,
        finishPos: finishPos,
        pointsAwarded: fiaPts,
        isFastestLap: isFastestLap,
        finishTime: racer.finishTime,
        bestLapTime: racer.bestLapTime,
      });
    });

    // Salva posizioni precedenti prima di aggiornare i ranghi
    this.state.drivers.forEach((d) => {
      d.previousRank = d.rank || 1;
    });

    // Ricalcola classifica generale del campionato (ordinata per punti, vittorie, podi)
    this.state.drivers.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.podiums !== a.podiums) return b.podiums - a.podiums;
      return a.name.localeCompare(b.name);
    });

    this.state.drivers.forEach((d, idx) => {
      d.rank = idx + 1;
    });

    // Salva nello storico tappe
    this.state.stageHistory.push({
      stageIndex: stageIdx,
      trackId: currentTrackId,
      awards: stageAwards,
      fastestLapDriverId: fastestLapDriverId,
    });

    // Verifica se era l'ultima tappa del torneo
    const wasFinal = this.isFinalStage();
    if (wasFinal) {
      this.state.completed = true;
    } else {
      // Calcola griglia per la prossima tappa
      this.calculateNextGridSlots(standings);
    }

    this.saveState();

    return {
      stageAwards: stageAwards,
      overallStandings: this.state.drivers,
      isFinalStage: wasFinal,
      currentStageNumber: stageIdx + 1,
      totalStages: this.state.totalStages,
      nextTrackId: wasFinal ? null : this.state.tracks[stageIdx + 1],
    };
  },

  // Calcola le posizioni in griglia della tappa successiva in base alla regola scelta
  calculateNextGridSlots(standings) {
    if (!this.state || !Array.isArray(standings)) return;

    const newSlots = {};
    const finishOrder = standings.map((r) => r.id);

    if (this.state.gridRule === "reverse_8") {
      // =======================================================================
      // GRIGLIA INVERTITA SUI PRIMI 8 (REVERSE GRID TOP 8)
      // I primi 8 arrivati scattano in ordine opposto:
      // P8 -> 1° (Pole), P7 -> 2°, P6 -> 3°, ..., P1 -> 8°
      // Dal 9° in poi posizioni invariate
      // =======================================================================
      const topCount = Math.min(8, finishOrder.length);
      for (let i = 0; i < topCount; i++) {
        const racerId = finishOrder[i];
        const invertedSlot = (topCount - 1) - i;
        newSlots[racerId] = invertedSlot;
      }
      for (let i = topCount; i < finishOrder.length; i++) {
        const racerId = finishOrder[i];
        newSlots[racerId] = i;
      }
    } else {
      // =======================================================================
      // GRIGLIA BASATA SULL'ORDINE D'ARRIVO (RISULTATI PRECEDENTI)
      // P1 -> Slot 0 (Pole), P2 -> Slot 1, P3 -> Slot 2, ecc.
      // =======================================================================
      finishOrder.forEach((racerId, slotIdx) => {
        newSlots[racerId] = slotIdx;
      });
    }

    this.state.currentGridSlots = newSlots;
  },

  // Passaggio effettivo alla tappa successiva
  advanceToNextStage() {
    if (!this.state || this.state.completed) return false;
    if (this.state.currentStageIndex < this.state.totalStages - 1) {
      this.state.currentStageIndex += 1;
      this.saveState();
      return true;
    }
    return false;
  },

  // ---------------------------------------------------------------------------
  // 4. CALCOLO PREMI FINALI CAMPIONATO
  // ---------------------------------------------------------------------------
  calculateSeasonRewards() {
    if (!this.state) return { prize: 0, position: 10, title: "PARTECIPAZIONE" };

    const player = this.state.drivers.find((d) => d.isPlayer);
    const pos = player ? player.rank : 10;

    let basePrize = 25000;
    if (pos === 1) basePrize = 150000;
    else if (pos === 2) basePrize = 90000;
    else if (pos === 3) basePrize = 60000;
    else if (pos <= 5) basePrize = 40000;

    const diffMult = this.getDifficultyMultiplier(this.state.difficulty);
    const finalPrize = Math.round(basePrize * diffMult);

    const titles = {
      1: "CAMPIONE DEL MONDO F1 🏆",
      2: "VICE-CAMPIONE DEL MONDO 🥈",
      3: "PODIO MONDIALE CONQUISTATO 🥉",
      4: "TOP 5 MONDIALE",
      5: "TOP 5 MONDIALE",
    };

    return {
      position: pos,
      prize: finalPrize,
      title: titles[pos] || `${pos}° POSTO IN CAMPIONATO`,
      trophyType: pos === 1 ? "gold" : pos === 2 ? "silver" : pos === 3 ? "bronze" : "finisher",
      wins: player ? player.wins : 0,
      podiums: player ? player.podiums : 0,
      points: player ? player.points : 0,
    };
  },

  getDifficultyMultiplier(diff) {
    switch (diff) {
      case "easy": return 1.0;
      case "medium": return 1.5;
      case "hard": return 2.2;
      case "legend": return 3.0;
      default: return 1.5;
    }
  },
};

// Inizializza automaticamente al caricamento
ChampionshipEngine.init();
window.ChampionshipEngine = ChampionshipEngine;

