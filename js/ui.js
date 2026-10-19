"use strict";

// =========================================================================
// 8. INTERFACCIA UTENTE E ROUTING SCHERMATE (UI CONTROLLER)
// =========================================================================

// Utility di sicurezza: sanificano i dati di rete (nickname e colori dei peer)
// prima di interpolarli nell'innerHTML, prevenendo attacchi XSS memorizzati.
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeColor(str, fallback = '#00f0ff') {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(str ?? '')) ? str : fallback;
}

const UI = {
    currentTab: 'race',
    toastTimeout: null,

    init() {
        if (GameApp.profile && GameApp.profile.difficulty) {
            RaceEngine.difficulty = GameApp.profile.difficulty;
        }
        this.updateHeaderStats();
        this.updateDifficultyUI();
        // Applica la qualità grafica salvata nel profilo (se il motore grafico è disponibile)
        if (typeof GraphicsEngine !== "undefined" && GraphicsEngine.setQuality) {
            GraphicsEngine.setQuality((GameApp.profile && GameApp.profile.graphicsQuality) || "high", { persist: false });
        }
        this.updateGraphicsQualityUI();
        this.initPerfDebugToggle();
        this.switchTab('race');
    },

    setGridSize(size) {
        RaceEngine.gridSize = size;
        AudioEngine.playUIClick();
        [8, 10, 12].forEach(s => {
            const btn = document.getElementById(`grid-btn-${s}`);
            if (btn) {
                btn.className = s === size
                    ? 'px-2 py-1 rounded text-xs font-racing font-bold bg-amber-400 text-slate-950'
                    : 'px-2 py-1 rounded text-xs font-racing font-bold bg-slate-800 text-slate-300';
            }
        });
    },

    setRaceLaps(laps) {
        RaceEngine.totalLaps = laps;
        AudioEngine.playUIClick();
        [2, 3, 5].forEach(l => {
            const btn = document.getElementById(`laps-btn-${l}`);
            if (btn) {
                btn.className = l === laps
                    ? 'px-2 py-1 rounded text-xs font-racing font-bold bg-cyan-400 text-slate-950 transition'
                    : 'px-2 py-1 rounded text-xs font-racing font-bold bg-slate-800 text-slate-300 transition';
            }
        });
    },

    setDifficulty(diff) {
        if (!RaceEngine.DIFFICULTY_LEVELS || !RaceEngine.DIFFICULTY_LEVELS[diff]) return;
        RaceEngine.difficulty = diff;
        if (GameApp.profile) {
            GameApp.profile.difficulty = diff;
            StorageManager.save(GameApp.profile);
        }
        AudioEngine.playUIClick();
        this.updateDifficultyUI();
        if (this.currentTab === 'race' || this.currentTab === 'freeplay') {
            this.renderTracksScreen(this.currentTab);
        }
    },

    updateDifficultyUI() {
        const curDiff = RaceEngine.difficulty || 'medium';
        const diffConfig = RaceEngine.getDifficultyConfig();

        ['easy', 'medium', 'hard', 'legend'].forEach(d => {
            const btn = document.getElementById(`diff-btn-${d}`);
            if (btn) {
                if (d === curDiff) {
                    const activeColor = d === 'easy' ? 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                        : d === 'medium' ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                        : d === 'hard' ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                        : 'bg-purple-500 text-white shadow-md shadow-purple-500/30';
                    btn.className = `px-2 py-1 rounded text-xs font-racing font-bold ${activeColor} transition`;
                } else {
                    btn.className = 'px-2 py-1 rounded text-xs font-racing font-bold bg-slate-800 text-slate-300 transition hover:bg-slate-700';
                }
            }
        });

        const badge = document.getElementById('diff-payout-badge');
        if (badge) {
            badge.textContent = diffConfig.multiplier > 1.0
                ? `+${Math.round((diffConfig.multiplier - 1.0) * 100)}% PREMIO`
                : 'PREMIO STD';
            badge.className = `px-1.5 py-0.2 rounded text-[9px] font-racing font-bold ${diffConfig.badgeBg}`;
        }

        const hudDiffTag = document.getElementById('hud-diff-tag');
        if (hudDiffTag) {
            hudDiffTag.textContent = `${diffConfig.name.toUpperCase()} (x${diffConfig.multiplier.toFixed(1)})`;
            hudDiffTag.className = `px-1.5 py-0.2 rounded text-[8px] font-racing font-bold ${diffConfig.badgeBg}`;
        }
    },

    setGraphicsQuality(level) {
        if (!["high", "medium", "low"].includes(level)) return;
        // Scelta esplicita dell'utente: disattiva l'auto-adattamento per la sessione
        if (typeof GameApp !== "undefined" && GameApp) {
            GameApp._autoAdaptDisabled = true;
        }
        if (typeof GraphicsEngine !== "undefined" && GraphicsEngine.setQuality) {
            GraphicsEngine.setQuality(level);
        }
        if (GameApp.profile) {
            GameApp.profile.graphicsQuality = level;
            StorageManager.save(GameApp.profile);
        }
        AudioEngine.playUIClick();
        this.updateGraphicsQualityUI();
    },

    updateGraphicsQualityUI() {
        const cur = (typeof GraphicsEngine !== "undefined" && GraphicsEngine.getQuality && GraphicsEngine.getQuality())
            || (GameApp.profile && GameApp.profile.graphicsQuality) || "high";
        ["high", "medium", "low"].forEach(q => {
            const btn = document.getElementById(`quality-btn-${q}`);
            if (!btn) return;
            if (q === cur) {
                const activeColor = q === "high" ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                    : q === "medium" ? "bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20"
                    : "bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20";
                btn.className = `px-2 py-1 rounded text-xs font-racing font-bold ${activeColor} transition`;
            } else {
                btn.className = "px-2 py-1 rounded text-xs font-racing font-bold bg-slate-800 text-slate-300 transition hover:bg-slate-700";
            }
        });
    },

    initPerfDebugToggle() {
        // Tasto F8 alterna l'overlay di debug performance
        window.addEventListener("keydown", (e) => {
            if (e.code === "F8" && !e.repeat) {
                e.preventDefault();
                this.togglePerfDebug();
            }
        });
    },

    togglePerfDebug(force) {
        const el = document.getElementById("perf-debug");
        if (!el) return;
        const show = typeof force === "boolean" ? force : el.classList.contains("hidden");
        el.classList.toggle("hidden", !show);
    },

    updateHeaderStats() {
        const p = GameApp.profile;
        const creditsEl = document.getElementById('header-credits');
        if (creditsEl) creditsEl.textContent = p.credits.toLocaleString('it-IT');
        const garageCountEl = document.getElementById('header-garage-count');
        if (garageCountEl) garageCountEl.textContent = p.ownedCars.length;

        let totalTrophies = 0;
        Object.values(p.records || {}).forEach(r => {
            totalTrophies += (r.trophies || 0);
        });
        const trophiesEl = document.getElementById('header-trophies');
        if (trophiesEl) trophiesEl.textContent = totalTrophies;

        const activeCar = CAR_CATALOG.find(c => c.id === p.equippedCar);
        const activeCarEl = document.getElementById('header-active-car');
        if (activeCarEl) {
            activeCarEl.textContent = activeCar ? activeCar.name : 'Nessuna Vettura';
            activeCarEl.className = activeCar
                ? 'text-xs font-racing font-bold text-cyan-300 leading-tight mt-0.5'
                : 'text-xs font-bold text-rose-400 leading-tight mt-0.5';
        }

        const readyName = document.getElementById('race-ready-car-name');
        const readySpecs = document.getElementById('race-ready-car-specs');
        const btnQuick = document.getElementById('btn-quick-dealer');
        if (activeCar) {
            if (readyName) {
                readyName.textContent = activeCar.name;
                readyName.className = 'font-racing font-bold text-xs sm:text-sm text-emerald-400';
            }
            if (readySpecs) readySpecs.textContent = `${activeCar.drivetrain} • ${activeCar.topSpeedKmh} km/h`;
            if (btnQuick) btnQuick.textContent = 'CAMBIA AUTO';
        } else {
            if (readyName) {
                readyName.textContent = 'Garage Vuoto';
                readyName.className = 'font-racing font-bold text-xs sm:text-sm text-amber-400';
            }
            if (readySpecs) readySpecs.textContent = 'Budget iniziale: Cr. 15.000';
            if (btnQuick) btnQuick.textContent = 'COMPRA AUTO';
        }
    },

    switchTab(tab) {
        this.currentTab = tab;
        AudioEngine.playUIClick();

        ['championship', 'race', 'freeplay', 'dealership', 'garage', 'multiplayer'].forEach(t => {
            const el = document.getElementById(`tab-${t}`);
            if (el) el.classList.toggle('active', t === tab);
        });

        const screenChampionship = document.getElementById('screen-championship');
        const screenTracks = document.getElementById('screen-tracks');
        const screenShowroom = document.getElementById('screen-showroom');
        const screenMultiplayer = document.getElementById('screen-multiplayer');

        if (!RaceEngine.isActive) {
            GameApp.setupShowroomScene();
        }

        if (screenMultiplayer) {
            screenMultiplayer.classList.toggle('hidden', tab !== 'multiplayer');
            screenMultiplayer.classList.toggle('flex', tab === 'multiplayer');
        }

        if (screenChampionship) {
            screenChampionship.classList.toggle('hidden', tab !== 'championship');
            screenChampionship.classList.toggle('flex', tab === 'championship');
        }

        if (tab === 'championship') {
            if (screenTracks) {
                screenTracks.classList.add('hidden');
                screenTracks.classList.remove('flex');
            }
            if (screenShowroom) {
                screenShowroom.classList.add('hidden');
                screenShowroom.classList.remove('flex');
            }
            this.renderChampionshipHub();
        } else if (tab === 'race' || tab === 'freeplay') {
            if (screenTracks) {
                screenTracks.classList.remove('hidden');
                screenTracks.classList.add('flex');
            }
            if (screenShowroom) {
                screenShowroom.classList.add('hidden');
                screenShowroom.classList.remove('flex');
            }
            this.renderTracksScreen(tab);
        } else if (tab === 'multiplayer') {
            if (screenTracks) {
                screenTracks.classList.add('hidden');
                screenTracks.classList.remove('flex');
            }
            if (screenShowroom) {
                screenShowroom.classList.add('hidden');
                screenShowroom.classList.remove('flex');
            }
            const carSelect = document.getElementById('lan-car-select');
            if (carSelect) {
                if (typeof GameApp !== 'undefined' && GameApp.activeCarId && (!NetworkEngine.selectedCarId || NetworkEngine.selectedCarId === 'hatchback')) {
                    NetworkEngine.selectedCarId = GameApp.activeCarId;
                }
                carSelect.value = NetworkEngine.selectedCarId;
            }
            this.updateLanLobbyUI();
        } else {
            if (screenTracks) {
                screenTracks.classList.add('hidden');
                screenTracks.classList.remove('flex');
            }
            if (screenShowroom) {
                screenShowroom.classList.remove('hidden');
                screenShowroom.classList.add('flex');
            }
            this.renderShowroomUI();
        }
    },

    renderTracksScreen(mode) {
        const isRace = mode === 'race';
        const raceConfigEl = document.getElementById('race-config-controls');
        if (raceConfigEl) raceConfigEl.style.display = isRace ? 'flex' : 'none';
        const modeBadgeEl = document.getElementById('mode-badge');
        if (modeBadgeEl) {
            modeBadgeEl.textContent = isRace ? 'GARA SINGOLA GP' : 'CORSA LIBERA & TELEMETRIA';
            modeBadgeEl.className = isRace
                ? 'px-2.5 py-0.5 rounded text-xs font-racing font-bold uppercase bg-amber-400 text-slate-950'
                : 'px-2.5 py-0.5 rounded text-xs font-racing font-bold uppercase bg-cyan-400 text-slate-950';
        }
        const modeTitleEl = document.getElementById('mode-title');
        if (modeTitleEl) modeTitleEl.textContent = isRace ? 'GRAN PREMIO SINGOLO F1' : 'CORSA LIBERA & TIME ATTACK F1';

        const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
            ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
            : TRACK_CATALOG;
        const grid = document.getElementById('tracks-grid');
        if (!grid) return;
        grid.innerHTML = allTracks.map(track => {
            const rec = GameApp.profile.records[track.id] || {};
            const bestLapStr = rec.bestLap ? this.formatLapTime(rec.bestLap) : '--:--.---';
            const bestPosStr = rec.bestPos ? `${rec.bestPos}°` : '-';
            const diffConfig = RaceEngine.getDifficultyConfig();
            const diffMult = diffConfig.multiplier || 1.0;
            const p1 = Math.round(track.prizeFirst * diffMult);
            const p2 = Math.round(track.prizeFirst * 0.6 * diffMult);
            const p3 = Math.round(track.prizeFirst * 0.3 * diffMult);

            return `
                <div class="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between border border-white/10 hover:border-amber-400/50 transition group pointer-auto">
                    <div>
                        <div class="flex items-center justify-between text-[10px] font-racing uppercase tracking-wider">
                            <span class="px-2 py-0.5 rounded bg-white/10 text-amber-300 font-bold">${track.country}</span>
                            <span class="text-amber-400 font-bold"><i class="fa-solid fa-trophy mr-1"></i>${rec.trophies || 0}</span>
                        </div>

                        <h3 class="font-racing text-sm sm:text-base font-black text-white mt-2 group-hover:text-amber-400 transition truncate">${track.name}</h3>
                        <p class="text-[10px] sm:text-[11px] font-semibold text-cyan-400">${track.lengthKm} <span class="hidden sm:inline">• ${track.elevationInfo}</span></p>
                        <p class="text-[11px] text-slate-300 mt-1.5 leading-relaxed line-clamp-2 hidden md:block">${track.description}</p>

                        ${isRace ? `
                        <div class="mt-2.5 p-2 rounded-xl bg-slate-950/80 border border-white/5 space-y-1 text-[11px]">
                            <div class="flex items-center justify-between pb-1 mb-1 border-b border-white/5 text-[10px]">
                                <span class="text-slate-400">Diff: <strong class="${diffConfig.colorClass}">${diffConfig.name}</strong></span>
                                <span class="font-racing font-bold text-amber-300">x${diffMult.toFixed(1)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-amber-400 font-bold">1° Posto:</span>
                                <span class="font-racing font-bold text-white">Cr. ${p1.toLocaleString('it-IT')}</span>
                            </div>
                            <div class="hidden lg:flex justify-between text-slate-300">
                                <span>2° Posto:</span>
                                <span class="font-racing">Cr. ${p2.toLocaleString('it-IT')}</span>
                            </div>
                            <div class="hidden lg:flex justify-between text-slate-400">
                                <span>3° Posto:</span>
                                <span class="font-racing">Cr. ${p3.toLocaleString('it-IT')}</span>
                            </div>
                        </div>
                        ` : `
                        <div class="mt-2.5 p-2 rounded-xl bg-slate-950/80 border border-white/5 text-[11px]">
                            <span class="text-cyan-400 font-racing uppercase text-[10px] font-bold">Guida Libera</span>
                            <p class="text-slate-300 mt-0.5 text-[10px] hidden sm:block">Traiettoria ideale e telemetria.</p>
                        </div>
                        `}

                        <div class="mt-2 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 pt-1.5 border-t border-white/10">
                            <span>Best: <strong class="font-racing text-emerald-400">${bestLapStr}</strong></span>
                            <span>Piazz.: <strong class="font-racing text-white">${bestPosStr}</strong></span>
                        </div>
                    </div>

                    <button onclick="RaceEngine.startSession('${track.id}', '${mode}')" class="gt-btn gt-btn-gold mt-3 w-full py-2.5 rounded-xl font-racing font-bold text-xs uppercase tracking-wider ${isRace ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950' : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950'} flex items-center justify-center gap-1.5 shadow-lg cursor-pointer">
                        <i class="fa-solid ${isRace ? 'fa-flag-checkered' : 'fa-gauge-high'}"></i>
                        <span>${isRace ? 'AVVIA GP' : 'CORSA LIBERA'}</span>
                    </button>
                </div>
            `;
        }).join('');
    },

    renderShowroomUI() {
        const isGarage = this.currentTab === 'garage';
        const ownedList = GameApp.profile.ownedCars;

        const showroomSubtitleEl = document.getElementById('showroom-subtitle');
        if (showroomSubtitleEl) {
            showroomSubtitleEl.textContent = isGarage
                ? 'COLLEZIONE PERSONALE PILOTA'
                : 'AUTOSALONE UFFICIALE GT';
        }
        const showroomTitleEl = document.getElementById('showroom-title');
        if (showroomTitleEl) {
            showroomTitleEl.textContent = isGarage
                ? 'IL TUO GARAGE'
                : 'CONCESSIONARIO VETTURE';
        }

        const carsToDisplay = isGarage
            ? CAR_CATALOG.filter(c => ownedList.includes(c.id))
            : CAR_CATALOG;

        const listContainer = document.getElementById('showroom-car-list');

        if (isGarage && carsToDisplay.length === 0) {
            if (listContainer) listContainer.innerHTML = `
                <button onclick="UI.switchTab('dealership')" class="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-racing font-bold text-xs">
                    GARAGE VUOTO • VAI AL CONCESSIONARIO (Cr. 15.000 DISPONIBILI)
                </button>
            `;
        } else {
            if (isGarage && !ownedList.includes(GameApp.selectedCarId)) {
                GameApp.selectedCarId = carsToDisplay[0].id;
            }
            if (listContainer) listContainer.innerHTML = carsToDisplay.map(c => {
                const isSel = c.id === GameApp.selectedCarId;
                const isOwned = ownedList.includes(c.id);
                const isEquipped = GameApp.profile.equippedCar === c.id;
                return `
                    <button onclick="UI.selectShowroomCar('${c.id}')" class="px-3.5 py-2 rounded-xl font-racing text-xs font-bold border transition flex items-center gap-2 ${isSel ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg' : 'bg-slate-900/90 text-slate-200 border-white/10 hover:bg-slate-800'}">
                        <span>${c.name}</span>
                        ${isEquipped ? '<i class="fa-solid fa-circle-check text-emerald-600"></i>' : (isOwned ? '<i class="fa-solid fa-warehouse opacity-70"></i>' : '')}
                    </button>
                `;
            }).join('');
        }

        const car = CAR_CATALOG.find(c => c.id === GameApp.selectedCarId) || CAR_CATALOG[0];
        GameApp.spawnShowroomCar(car.id);

        const isOwned = ownedList.includes(car.id);
        const isEquipped = GameApp.profile.equippedCar === car.id;

        const tierBadgeEl = document.getElementById('car-tier-badge');
        if (tierBadgeEl) tierBadgeEl.textContent = car.tier;
        const ownedBadgeEl = document.getElementById('car-owned-badge');
        if (ownedBadgeEl) ownedBadgeEl.classList.toggle('hidden', !isOwned);
        const carNameEl = document.getElementById('car-name');
        if (carNameEl) carNameEl.textContent = car.name;
        const carCategoryEl = document.getElementById('car-category');
        if (carCategoryEl) carCategoryEl.textContent = car.category;
        const carDescEl = document.getElementById('car-desc');
        if (carDescEl) carDescEl.textContent = car.description;
        const carDrivetrainEl = document.getElementById('car-drivetrain');
        if (carDrivetrainEl) carDrivetrainEl.textContent = car.drivetrain;
        const carWeightEl = document.getElementById('car-weight');
        if (carWeightEl) carWeightEl.textContent = `${car.weight.toLocaleString('it-IT')} kg`;
        const carTopspeedEl = document.getElementById('car-topspeed');
        if (carTopspeedEl) carTopspeedEl.textContent = `${car.topSpeedKmh} km/h`;
        const carPowerEl = document.getElementById('car-power');
        if (carPowerEl) carPowerEl.textContent = `${car.powerHP} CV`;
        const carPriceEl = document.getElementById('car-price-display');
        if (carPriceEl) {
            carPriceEl.textContent = isOwned
                ? 'ACQUISTATA'
                : `Cr. ${car.price.toLocaleString('it-IT')}`;
        }

        const statValSpeedEl = document.getElementById('stat-val-speed');
        if (statValSpeedEl) statValSpeedEl.textContent = `${(car.stats.speed / 10).toFixed(1)} / 10`;
        const statBarSpeedEl = document.getElementById('stat-bar-speed');
        if (statBarSpeedEl) statBarSpeedEl.style.width = `${car.stats.speed}%`;

        const statValAccelEl = document.getElementById('stat-val-accel');
        if (statValAccelEl) statValAccelEl.textContent = `${(car.stats.accel / 10).toFixed(1)} / 10`;
        const statBarAccelEl = document.getElementById('stat-bar-accel');
        if (statBarAccelEl) statBarAccelEl.style.width = `${car.stats.accel}%`;

        const statValHandlingEl = document.getElementById('stat-val-handling');
        if (statValHandlingEl) statValHandlingEl.textContent = `${(car.stats.handling / 10).toFixed(1)} / 10`;
        const statBarHandlingEl = document.getElementById('stat-bar-handling');
        if (statBarHandlingEl) statBarHandlingEl.style.width = `${car.stats.handling}%`;

        const statValBrakingEl = document.getElementById('stat-val-braking');
        if (statValBrakingEl) statValBrakingEl.textContent = `${(car.stats.braking / 10).toFixed(1)} / 10`;
        const statBarBrakingEl = document.getElementById('stat-bar-braking');
        if (statBarBrakingEl) statBarBrakingEl.style.width = `${car.stats.braking}%`;

        const btnBuy = document.getElementById('btn-buy-car');
        const btnEquip = document.getElementById('btn-equip-car');
        if (!btnBuy || !btnEquip) return;

        if (isOwned) {
            btnBuy.classList.add('hidden');
            btnEquip.classList.remove('hidden');
            btnEquip.classList.add('flex');
            if (isEquipped) {
                btnEquip.disabled = true;
                btnEquip.className = 'w-full py-3 px-4 rounded-xl font-racing font-bold text-sm uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center justify-center gap-2 cursor-default';
                btnEquip.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>VETTURA ATTIVA IN PISTA</span>';
            } else {
                btnEquip.disabled = false;
                btnEquip.className = 'gt-btn w-full py-3 px-4 rounded-xl font-racing font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg flex items-center justify-center gap-2';
                btnEquip.innerHTML = '<i class="fa-solid fa-key"></i><span>GUIDA QUESTA VETTURA</span>';
            }
        } else {
            btnEquip.classList.add('hidden');
            btnEquip.classList.remove('flex');
            btnBuy.classList.remove('hidden');
            const canAfford = GameApp.profile.credits >= car.price;
            btnBuy.disabled = !canAfford;
            if (canAfford) {
                btnBuy.className = 'gt-btn gt-btn-gold w-full py-3 px-4 rounded-xl font-racing font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-lg flex items-center justify-center gap-2';
                btnBuy.innerHTML = `<i class="fa-solid fa-cart-shopping"></i><span>ACQUISTA (Cr. ${car.price.toLocaleString('it-IT')})</span>`;
            } else {
                btnBuy.className = 'w-full py-3 px-4 rounded-xl font-racing font-bold text-sm uppercase tracking-wider bg-slate-800 text-slate-500 border border-white/5 flex items-center justify-center gap-2 cursor-not-allowed';
                btnBuy.innerHTML = `<i class="fa-solid fa-lock"></i><span>CREDITI INSUFFICIENTI</span>`;
            }
        }
    },

    selectShowroomCar(carId) {
        GameApp.selectedCarId = carId;
        AudioEngine.playUIClick();
        this.renderShowroomUI();
    },

    openResetModal() {
        AudioEngine.playUIClick();
        const m = document.getElementById('modal-reset');
        if (m) {
            m.classList.remove('hidden');
            m.classList.add('flex');
        }
    },

    closeResetModal() {
        const m = document.getElementById('modal-reset');
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('flex');
        }
    },

    openYoutubeOnboardModal(carId) {
        AudioEngine.playUIClick();
        const targetId = carId || GameApp.selectedCarId || 'hatchback';
        const car = CAR_CATALOG.find(c => c.id === targetId) || CAR_CATALOG[0];

        const carNameEl = document.getElementById('yt-modal-car-name');
        const realNameEl = document.getElementById('yt-modal-real-name');
        const engineDescEl = document.getElementById('yt-modal-engine-desc');
        const sigEl = document.getElementById('yt-modal-sound-signature');
        const linkEl = document.getElementById('yt-modal-open-link');

        if (carNameEl) carNameEl.textContent = car.name;
        if (realNameEl) realNameEl.textContent = (car.youtubeOnboard && car.youtubeOnboard.carRealName) || car.name;
        if (engineDescEl) engineDescEl.textContent = (car.youtubeOnboard && car.youtubeOnboard.engineRealDesc) || car.description;

        if (sigEl) {
            if (targetId === 'hatchback') {
                sigEl.textContent = 'I4 TURBO • DENTI DRITTI • SFIATO WASTEGATE FLUTTER';
            } else if (targetId === 'muscle') {
                sigEl.textContent = 'V8 CROSSPLANE • ROMBO CUPA BANCATA • FIAMMATE';
            } else if (targetId === 'gt_comp') {
                sigEl.textContent = 'FLAT-6 GT3 • WHINE SEQUENZIALE • FLAT-SHIFT BANG';
            } else if (targetId === 'hypercar') {
                sigEl.textContent = 'V12 11.000 RPM • URLO COSWORTH F1 • SIBILO KERS';
            }
        }

        if (linkEl) {
            linkEl.href = (car.youtubeOnboard && car.youtubeOnboard.youtubeUrl)
                ? car.youtubeOnboard.youtubeUrl
                : `https://www.youtube.com/results?search_query=${encodeURIComponent(car.name + ' pure sound onboard')}`;
        }

        const m = document.getElementById('modal-youtube-onboard');
        if (m) {
            m.classList.remove('hidden');
            m.classList.add('flex');
        }
    },

    closeYoutubeOnboardModal() {
        AudioEngine.playUIClick();
        const m = document.getElementById('modal-youtube-onboard');
        if (m) {
            m.classList.add('hidden');
            m.classList.remove('flex');
        }
    },

    showToast(message, iconClass = 'fa-circle-info') {
        const box = document.getElementById('toast-box');
        const toastTextEl = document.getElementById('toast-text');
        if (toastTextEl) toastTextEl.textContent = message;
        const toastIconEl = document.getElementById('toast-icon');
        if (toastIconEl) toastIconEl.className = `fa-solid ${iconClass} text-amber-400`;

        if (!box) return;

        box.classList.remove('opacity-0', 'translate-y-4');
        box.classList.add('opacity-100', 'translate-y-0');

        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            box.classList.add('opacity-0', 'translate-y-4');
            box.classList.remove('opacity-100', 'translate-y-0');
        }, 3200);
    },

    formatLapTime(ms) {
        if (!ms || ms <= 0) return '00:00.000';
        const totalSec = Math.floor(ms / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const millis = Math.floor(ms % 1000);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    },

    connectToLan() {
        const ipInput = document.getElementById('lan-server-ip');
        const nickInput = document.getElementById('lan-nickname');
        const carSelect = document.getElementById('lan-car-select');
        const hostUrl = (ipInput && ipInput.value.trim()) || (window.location.hostname ? window.location.hostname + ':3000' : 'localhost:3000');
        const nickname = (nickInput && nickInput.value.trim()) || 'Pilota LAN';
        const carId = (carSelect && carSelect.value) || NetworkEngine.selectedCarId || (typeof GameApp !== 'undefined' && GameApp.activeCarId) || 'hatchback';
        NetworkEngine.selectedCarId = carId;

        AudioEngine.playUIClick();
        this.showToast('Connessione al server LAN in corso...', 'fa-spinner');

        NetworkEngine.connect(
            hostUrl,
            nickname,
            NetworkEngine.selectedColor,
            NetworkEngine.selectedCarId,
            () => {
                this.showToast('Connesso alla Lobby LAN!', 'fa-wifi');
                this.updateLanLobbyUI();
            },
            () => {
                this.showToast('Impossibile connettersi al server LAN. Verifica IP e porta.', 'fa-triangle-exclamation');
            }
        );
    },

    disconnectFromLan() {
        AudioEngine.playUIClick();
        NetworkEngine.disconnect();
        this.onLanDisconnected();
        this.showToast('Disconnesso dalla LAN', 'fa-arrow-right-from-bracket');
    },

    onLanDisconnected() {
        this.updateLanLobbyUI();
    },

    onLanNicknameInput(newName) {
        NetworkEngine.nickname = (newName && newName.trim()) || 'Pilota LAN';
        if (NetworkEngine.isConnected) {
            NetworkEngine.sendProfileUpdate({ name: NetworkEngine.nickname });
        }
        this.updateLanLobbyUI();
    },

    setLanColor(colorHex) {
        AudioEngine.playUIClick();
        NetworkEngine.selectedColor = colorHex;
        if (NetworkEngine.isConnected) {
            NetworkEngine.sendProfileUpdate({ color: colorHex });
            if (NetworkEngine.lobbyPlayers && NetworkEngine.lobbyPlayers[NetworkEngine.myPlayerId]) {
                NetworkEngine.lobbyPlayers[NetworkEngine.myPlayerId].color = colorHex;
            }
        }
        this.updateLanLobbyUI();
    },

    selectedLanGameMode: 'single_race', // 'single_race' | 'championship'
    selectedLanPreset: 'euro_tour', // 'euro_tour' | 'world_tour' | 'custom'
    selectedLanGridRule: 'reverse_8', // 'reverse_8' | 'results'
    selectedLanCustomTracks: ['monza', 'catalunya', 'spielberg', 'spa'],
    selectedLanEnableBots: true, // Avversari IA (Bot F1) nel Gran Premio LAN

    setLanGameMode(mode) {
        AudioEngine.playUIClick();
        this.selectedLanGameMode = mode;
        if (typeof NetworkEngine !== "undefined") {
            NetworkEngine.roomGameMode = mode;
            if (NetworkEngine.isConnected && NetworkEngine.isHost) {
                NetworkEngine.sendRoomUpdate({
                    gameMode: mode,
                    championship: this.getLanChampionshipConfig(),
                });
            }
        }
        this.updateLanLobbyUI();
    },

    setLanPreset(presetId) {
        AudioEngine.playUIClick();
        this.selectedLanPreset = presetId;
        if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected && NetworkEngine.isHost) {
            NetworkEngine.sendRoomUpdate({
                gameMode: this.selectedLanGameMode,
                championship: this.getLanChampionshipConfig(),
            });
        }
        this.updateLanLobbyUI();
    },

    setLanGridRule(rule) {
        AudioEngine.playUIClick();
        this.selectedLanGridRule = rule;
        if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected && NetworkEngine.isHost) {
            NetworkEngine.sendRoomUpdate({
                gameMode: this.selectedLanGameMode,
                championship: this.getLanChampionshipConfig(),
            });
        }
        this.updateLanLobbyUI();
    },

    setLanEnableBots(enabled) {
        AudioEngine.playUIClick();
        this.selectedLanEnableBots = enabled !== false;
        if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected && NetworkEngine.isHost) {
            NetworkEngine.sendRoomUpdate({
                gameMode: this.selectedLanGameMode,
                championship: this.getLanChampionshipConfig(),
                enableBots: this.selectedLanEnableBots,
            });
        }
        this.updateLanLobbyUI();
    },

    toggleLanCustomTrack(trackId) {
        AudioEngine.playUIClick();
        const idx = this.selectedLanCustomTracks.indexOf(trackId);
        if (idx >= 0) {
            if (this.selectedLanCustomTracks.length <= 2) {
                this.showToast("Un campionato richiede almeno 2 tappe!", "warning");
                return;
            }
            this.selectedLanCustomTracks.splice(idx, 1);
        } else {
            if (this.selectedLanCustomTracks.length >= 8) {
                this.showToast("Massimo 8 tappe consentite per torneo!", "warning");
                return;
            }
            this.selectedLanCustomTracks.push(trackId);
        }
        if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected && NetworkEngine.isHost) {
            NetworkEngine.sendRoomUpdate({
                gameMode: this.selectedLanGameMode,
                championship: this.getLanChampionshipConfig(),
            });
        }
        this.updateLanLobbyUI();
    },

    getLanChampionshipConfig() {
        const presets = typeof ChampionshipEngine !== "undefined" ? ChampionshipEngine.PRESETS : {
            euro_tour: { name: "Tour Europeo GP (4 Tappe)", tracks: ["monza", "spielberg", "silverstone", "spa"] },
            world_tour: { name: "Campionato Mondiale F1 (5 Tappe)", tracks: ["melbourne", "suzuka", "austin", "sao_paulo", "monza"] },
            custom: { name: "Campionato Personalizzato", tracks: ["monza", "catalunya", "spielberg", "spa"] },
        };
        const preset = presets[this.selectedLanPreset] || presets.euro_tour;
        const tracks = (this.selectedLanPreset === "custom")
            ? [...this.selectedLanCustomTracks]
            : [...preset.tracks];
        return {
            presetId: this.selectedLanPreset,
            name: (this.selectedLanPreset === "custom") ? "Campionato LAN Personalizzato" : preset.name,
            badge: preset.badge || "GRAN PREMIO LAN",
            tracks: tracks,
            totalStages: tracks.length,
            laps: (typeof NetworkEngine !== "undefined" && NetworkEngine.selectedLaps) || 3,
            gridRule: this.selectedLanGridRule || "reverse_8",
            difficulty: "medium",
            gridSize: 10,
            enableBots: this.selectedLanEnableBots !== false,
        };
    },

    setLanCar(carId) {
        AudioEngine.playUIClick();
        NetworkEngine.selectedCarId = carId;
        if (NetworkEngine.isConnected) {
            NetworkEngine.sendProfileUpdate({ carId: carId });
            if (NetworkEngine.lobbyPlayers && NetworkEngine.lobbyPlayers[NetworkEngine.myPlayerId]) {
                NetworkEngine.lobbyPlayers[NetworkEngine.myPlayerId].carId = carId;
            }
        }
        this.updateLanLobbyUI();
    },

    setLanTrack(trackId) {
        AudioEngine.playUIClick();
        NetworkEngine.selectedTrackId = trackId;
        if (NetworkEngine.isConnected && NetworkEngine.isHost) {
            NetworkEngine.sendRoomUpdate({ trackId: trackId });
        }
        this.updateLanLobbyUI();
    },

    setLanLaps(laps) {
        AudioEngine.playUIClick();
        NetworkEngine.selectedLaps = laps;
        if (NetworkEngine.isConnected && NetworkEngine.isHost) {
            NetworkEngine.sendRoomUpdate({
                laps: laps,
                championship: this.getLanChampionshipConfig(),
            });
        }
        this.updateLanLobbyUI();
    },

    startLanRace() {
        if (!NetworkEngine.isConnected) return;
        if (!NetworkEngine.isHost) {
            UI.showToast("Solo il Direttore di Gara (Host) può avviare la gara!", "warning");
            return;
        }
        AudioEngine.playUIClick();
        const mode = UI.selectedLanGameMode || NetworkEngine.roomGameMode || 'single_race';
        if (mode === 'championship') {
            const champConfig = UI.getLanChampionshipConfig();
            const firstTrack = (champConfig.tracks && champConfig.tracks[0]) || 'monza';
            const laps = champConfig.laps || 3;

            // Inizializza la stagione LAN sull'Host per generare l'elenco ufficiale deterministico di piloti e griglia
            const playersList = Object.values(NetworkEngine.lobbyPlayers || {});
            if (!playersList.some(p => p.id === NetworkEngine.myPlayerId)) {
                playersList.push({
                    id: NetworkEngine.myPlayerId,
                    name: NetworkEngine.nickname,
                    color: NetworkEngine.selectedColor,
                    carId: NetworkEngine.selectedCarId,
                });
            }

            if (typeof ChampionshipEngine !== "undefined") {
                ChampionshipEngine.initLanSeason(champConfig, playersList, NetworkEngine.myPlayerId);
            }

            const officialDrivers = (typeof ChampionshipEngine !== "undefined" && ChampionshipEngine.state && ChampionshipEngine.state.drivers)
                ? ChampionshipEngine.state.drivers
                : null;
            const officialGridSlots = (typeof ChampionshipEngine !== "undefined" && ChampionshipEngine.state)
                ? ChampionshipEngine.getGridSlots()
                : null;

            NetworkEngine.send({
                type: 'start_race',
                trackId: firstTrack,
                laps: laps,
                countdownDuration: 4.5,
                gameMode: 'championship',
                enableBots: champConfig.enableBots !== false,
                championship: {
                    seasonId: (ChampionshipEngine.state && ChampionshipEngine.state.id) || `lan_${Date.now()}`,
                    presetId: champConfig.presetId,
                    name: champConfig.name,
                    tracks: champConfig.tracks,
                    totalStages: champConfig.tracks.length,
                    currentStageIndex: 0,
                    laps: laps,
                    gridRule: champConfig.gridRule,
                    difficulty: champConfig.difficulty,
                    gridSize: (ChampionshipEngine.state && ChampionshipEngine.state.gridSize) || champConfig.gridSize || 10,
                    enableBots: champConfig.enableBots !== false,
                    gridSlots: officialGridSlots,
                    drivers: officialDrivers,
                },
                gridSlots: officialGridSlots,
            });
            UI.showToast("Avvio Torneo Grand Prix inviato a tutti i piloti!", "fa-trophy");
        } else {
            const trackSelect = document.getElementById('lan-track-select');
            const trackId = (trackSelect && trackSelect.value) || NetworkEngine.selectedTrackId || 'monza';
            const laps = NetworkEngine.selectedLaps || 3;
            NetworkEngine.send({
                type: 'start_race',
                trackId: trackId,
                laps: laps,
                countdownDuration: 4.5,
                gameMode: 'single_race',
                championship: null,
            });
            UI.showToast("Avvio gara singola inviato a tutti i piloti...", "fa-flag-checkered");
        }
    },

    updateLanPingDisplay(ping) {
        const pingEl = document.getElementById('lan-ping-val');
        if (!pingEl) return;
        pingEl.textContent = `${ping} ms`;
        if (ping < 35) {
            pingEl.className = 'font-racing font-bold text-emerald-400 text-sm';
        } else if (ping < 90) {
            pingEl.className = 'font-racing font-bold text-amber-400 text-sm';
        } else {
            pingEl.className = 'font-racing font-bold text-rose-400 text-sm';
        }
    },

    updateLanLobbyUI() {
        const isConn = NetworkEngine.isConnected;
        const isHost = NetworkEngine.isHost;
        const btnConn = document.getElementById('btn-lan-connect');
        const btnDisconn = document.getElementById('btn-lan-disconnect');
        const statusBox = document.getElementById('lan-status-box');
        const roomInfoBar = document.getElementById('lan-room-info-bar');
        const hostSingleControls = document.getElementById('lan-host-single-controls');
        const hostChampControls = document.getElementById('lan-host-champ-controls');
        const guestControls = document.getElementById('lan-guest-controls');
        const playersListEl = document.getElementById('lan-players-grid');

        // Sincronizza stato da NetworkEngine per i Guest
        if (!isHost && NetworkEngine.roomGameMode) {
            this.selectedLanGameMode = NetworkEngine.roomGameMode;
        }
        if (NetworkEngine.championshipData) {
            if (NetworkEngine.championshipData.presetId) this.selectedLanPreset = NetworkEngine.championshipData.presetId;
            if (NetworkEngine.championshipData.gridRule) this.selectedLanGridRule = NetworkEngine.championshipData.gridRule;
            if (Array.isArray(NetworkEngine.championshipData.tracks)) {
                this.selectedLanCustomTracks = [...NetworkEngine.championshipData.tracks];
            }
            if (typeof NetworkEngine.championshipData.enableBots === 'boolean') {
                this.selectedLanEnableBots = NetworkEngine.championshipData.enableBots;
            }
        }

        if (btnConn) btnConn.style.display = isConn ? 'none' : 'flex';
        if (btnDisconn) btnDisconn.style.display = isConn ? 'flex' : 'none';

        if (statusBox) {
            statusBox.innerHTML = isConn
                ? `<span class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-racing font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    ONLINE LAN ${isHost ? '• HOST' : '• OSPITE'}
                   </span>`
                : `<span class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-racing font-bold bg-slate-800 text-slate-400 border border-white/10">
                    <span class="w-2 h-2 rounded-full bg-slate-500"></span>
                    OFFLINE
                   </span>`;
        }

        // Aggiorna Tab Switcher (Gara Singola vs Gran Premio)
        const tabSingle = document.getElementById('lan-tab-single');
        const tabChamp = document.getElementById('lan-tab-champ');
        const isChampionship = (this.selectedLanGameMode === 'championship');

        if (tabSingle && tabChamp) {
            if (isChampionship) {
                tabChamp.className = 'px-3 py-1.5 rounded-lg font-racing font-black text-xs uppercase transition flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-md shadow-amber-400/20 cursor-pointer';
                tabSingle.className = 'px-3 py-1.5 rounded-lg font-racing font-bold text-xs uppercase transition flex items-center gap-1.5 bg-slate-900 text-slate-400 hover:text-white cursor-pointer';
            } else {
                tabSingle.className = 'px-3 py-1.5 rounded-lg font-racing font-black text-xs uppercase transition flex items-center gap-1.5 bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 cursor-pointer';
                tabChamp.className = 'px-3 py-1.5 rounded-lg font-racing font-bold text-xs uppercase transition flex items-center gap-1.5 bg-slate-900 text-slate-400 hover:text-white cursor-pointer';
            }
        }

        // Aggiorna Mini Car Specs Card
        const selCar = CAR_CATALOG.find(c => c.id === NetworkEngine.selectedCarId) || CAR_CATALOG[0];
        const carNameEl = document.getElementById('lan-spec-car-name');
        if (carNameEl) carNameEl.textContent = selCar.name;
        const driveBadgeEl = document.getElementById('lan-spec-drive-badge');
        if (driveBadgeEl) driveBadgeEl.textContent = selCar.driveCode || 'RWD';
        const hpEl = document.getElementById('lan-spec-hp');
        if (hpEl) hpEl.textContent = `${selCar.powerHP || 250} CV`;
        const speedEl = document.getElementById('lan-spec-speed');
        if (speedEl) speedEl.textContent = `${selCar.topSpeedKmh || 220} KM/H`;
        const weightEl = document.getElementById('lan-spec-weight');
        if (weightEl) weightEl.textContent = `${(selCar.weight || 1200).toLocaleString('it-IT')} KG`;

        const carSelect = document.getElementById('lan-car-select');
        if (carSelect && carSelect.value !== NetworkEngine.selectedCarId) {
            carSelect.value = NetworkEngine.selectedCarId;
        }

        // Palette metallizzata: outline attivo
        const colors = ['#ff1801', '#00f0ff', '#ffea00', '#005930', '#a855f7', '#ff7a00', '#7b858f', '#18181b'];
        colors.forEach(col => {
            const btn = document.getElementById(`lan-color-${col.replace('#', '')}`);
            if (btn) {
                btn.style.outline = (col.toLowerCase() === NetworkEngine.selectedColor.toLowerCase())
                    ? '3px solid white' : 'none';
            }
        });

        // Catalog Tracks
        const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
            ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
            : TRACK_CATALOG;
        const currentTrack = allTracks.find(t => t.id === NetworkEngine.selectedTrackId) || allTracks[0];
        const trackTitle = currentTrack ? currentTrack.name : NetworkEngine.selectedTrackId;

        // Recupera nome dell'Host
        let hostName = "In attesa...";
        if (NetworkEngine.hostId && NetworkEngine.lobbyPlayers[NetworkEngine.hostId]) {
            hostName = NetworkEngine.lobbyPlayers[NetworkEngine.hostId].name;
        } else if (isHost) {
            hostName = NetworkEngine.nickname;
        }

        // Barra informativa stanza
        if (roomInfoBar) {
            if (isConn) {
                roomInfoBar.classList.remove('hidden');
                roomInfoBar.classList.add('flex');
                const hostDisplay = document.getElementById('lan-room-host-display');
                if (hostDisplay) {
                    hostDisplay.innerHTML = `${escapeHtml(hostName)} ${isHost ? '<span class="text-xs text-amber-400 font-normal ml-1">(TU)</span>' : ''}`;
                }
                const modeLabel = document.getElementById('lan-room-mode-label');
                const trackDisplay = document.getElementById('lan-room-track-display');
                const lapsDisplay = document.getElementById('lan-room-laps-display');

                if (isChampionship) {
                    if (modeLabel) modeLabel.textContent = "TORNEO F1 ATTIVO";
                    const champConf = this.getLanChampionshipConfig();
                    if (trackDisplay) trackDisplay.textContent = champConf.name.toUpperCase();
                    if (lapsDisplay) lapsDisplay.textContent = `${champConf.totalStages} Tappe • ${NetworkEngine.selectedLaps} Giri`;
                } else {
                    if (modeLabel) modeLabel.textContent = "CIRCUITO STANZA";
                    if (trackDisplay) trackDisplay.textContent = trackTitle;
                    if (lapsDisplay) lapsDisplay.textContent = `${NetworkEngine.selectedLaps} Giri`;
                }
            } else {
                roomInfoBar.classList.add('hidden');
                roomInfoBar.classList.remove('flex');
            }
        }

        // Gestione pannelli controlli Host vs Guest
        if (isConn && isHost) {
            if (guestControls) guestControls.classList.add('hidden');

            if (isChampionship) {
                if (hostSingleControls) hostSingleControls.classList.add('hidden');
                if (hostChampControls) {
                    hostChampControls.classList.remove('hidden');

                    // Highlight Preset Buttons
                    ['euro_tour', 'world_tour', 'custom'].forEach(pId => {
                        const btn = document.getElementById(`lan-preset-${pId}`);
                        if (btn) {
                            if (pId === this.selectedLanPreset) {
                                btn.className = 'p-2.5 rounded-xl border border-amber-400 bg-amber-400/20 text-left cursor-pointer transition shadow-md shadow-amber-400/10';
                            } else {
                                btn.className = 'p-2.5 rounded-xl border border-white/10 bg-slate-900 text-left hover:border-amber-400/50 cursor-pointer transition';
                            }
                        }
                    });

                    // Highlight Laps Buttons
                    [2, 3, 5, 10].forEach(l => {
                        const btn = document.getElementById(`lan-champ-laps-${l}`);
                        if (btn) {
                            btn.className = (l === NetworkEngine.selectedLaps)
                                ? 'py-1.5 rounded-lg bg-amber-400 text-slate-950 font-racing font-bold text-xs cursor-pointer'
                                : 'py-1.5 rounded-lg bg-slate-800 text-slate-300 font-racing font-bold text-xs hover:bg-slate-700 cursor-pointer';
                        }
                    });

                    // Highlight Grid Rule Buttons
                    ['reverse_8', 'results'].forEach(rule => {
                        const btn = document.getElementById(`lan-gridrule-${rule}`);
                        if (btn) {
                            btn.className = (rule === this.selectedLanGridRule)
                                ? 'py-1.5 px-2 rounded-lg bg-amber-400 text-slate-950 font-racing font-bold text-[11px] truncate cursor-pointer shadow'
                                : 'py-1.5 px-2 rounded-lg bg-slate-800 text-slate-300 font-racing font-bold text-[11px] truncate cursor-pointer hover:bg-slate-700';
                        }
                    });

                    // Highlight Bot ON/OFF Buttons
                    const botsEnabled = this.selectedLanEnableBots !== false;
                    const btnBotsOn = document.getElementById('lan-bots-on');
                    if (btnBotsOn) {
                        btnBotsOn.className = botsEnabled
                            ? 'py-1.5 px-3 rounded-lg bg-amber-400 text-slate-950 font-racing font-black text-xs cursor-pointer shadow'
                            : 'py-1.5 px-3 rounded-lg bg-slate-800 text-slate-300 font-racing font-bold text-xs hover:bg-slate-700 cursor-pointer';
                    }
                    const btnBotsOff = document.getElementById('lan-bots-off');
                    if (btnBotsOff) {
                        btnBotsOff.className = !botsEnabled
                            ? 'py-1.5 px-3 rounded-lg bg-amber-400 text-slate-950 font-racing font-black text-xs cursor-pointer shadow'
                            : 'py-1.5 px-3 rounded-lg bg-slate-800 text-slate-300 font-racing font-bold text-xs hover:bg-slate-700 cursor-pointer';
                    }
                    const botsLabel = document.getElementById('lan-bots-state-label');
                    if (botsLabel) {
                        botsLabel.textContent = botsEnabled
                            ? 'Griglia completata a 10 vetture con piloti IA'
                            : 'Solo piloti reali • nessun pilota IA in griglia';
                    }

                    // Render Stage Calendar Sequencer
                    const champConf = this.getLanChampionshipConfig();
                    const stageCountEl = document.getElementById('lan-champ-stages-count');
                    if (stageCountEl) stageCountEl.textContent = `${champConf.tracks.length} TAPPE`;

                    const stagePillsEl = document.getElementById('lan-champ-stage-pills');
                    if (stagePillsEl) {
                        stagePillsEl.innerHTML = champConf.tracks.map((tId, idx) => {
                            const tObj = allTracks.find(t => t.id === tId) || { name: tId.toUpperCase() };
                            return `
                                <div class="flex items-center gap-1.5">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-racing font-bold ${idx === 0 ? 'bg-amber-400 text-slate-950 font-black shadow-sm' : 'bg-slate-800 text-slate-300 border border-white/10'}">
                                        T${idx + 1}: ${escapeHtml(tObj.name).split(' ')[0]}
                                    </span>
                                    ${idx < champConf.tracks.length - 1 ? '<i class="fa-solid fa-chevron-right text-[8px] text-slate-500"></i>' : ''}
                                </div>
                            `;
                        }).join('');
                    }

                    // Se custom, renderizza il selettore piste custom
                    const customBox = document.getElementById('lan-custom-track-selector-box');
                    if (customBox) {
                        if (this.selectedLanPreset === 'custom') {
                            customBox.classList.remove('hidden');
                            const selCountEl = document.getElementById('lan-custom-selected-count');
                            if (selCountEl) selCountEl.textContent = `${this.selectedLanCustomTracks.length} selezionate`;

                            const chipsEl = document.getElementById('lan-custom-track-chips');
                            if (chipsEl) {
                                chipsEl.innerHTML = allTracks.map(t => {
                                    const isSel = this.selectedLanCustomTracks.includes(t.id);
                                    return `
                                        <button
                                            onclick="UI.toggleLanCustomTrack('${t.id}')"
                                            class="py-1 px-2 rounded-lg text-left text-[11px] font-racing truncate transition cursor-pointer border ${isSel ? 'bg-amber-400/20 border-amber-400 text-amber-200 font-bold' : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'}"
                                        >
                                            <i class="fa-solid ${isSel ? 'fa-check text-amber-400' : 'fa-plus text-slate-600'} mr-1 text-[10px]"></i>
                                            <span>${t.name}</span>
                                        </button>
                                    `;
                                }).join('');
                            }
                        } else {
                            customBox.classList.add('hidden');
                        }
                    }

                    // Start Championship CTA Button
                    const btnStartChamp = document.getElementById('btn-lan-start-champ');
                    if (btnStartChamp) {
                        const firstTrackId = (champConf.tracks && champConf.tracks[0]) || 'monza';
                        const firstTrackObj = allTracks.find(t => t.id === firstTrackId) || { name: firstTrackId.toUpperCase() };
                        btnStartChamp.innerHTML = `
                            <i class="fa-solid fa-trophy text-base"></i>
                            <span>AVVIA TAPPA 1: ${escapeHtml(firstTrackObj.name.toUpperCase())} (CAMPIONATO F1)</span>
                        `;
                    }
                }
            } else {
                if (hostChampControls) hostChampControls.classList.add('hidden');
                if (hostSingleControls) {
                    hostSingleControls.classList.remove('hidden');
                    const trackSelect = document.getElementById('lan-track-select');
                    if (trackSelect && trackSelect.value !== NetworkEngine.selectedTrackId) {
                        trackSelect.value = NetworkEngine.selectedTrackId;
                    }
                    [2, 3, 5, 10].forEach(l => {
                        const btn = document.getElementById(`lan-laps-btn-${l}`);
                        if (btn) {
                            btn.className = (l === NetworkEngine.selectedLaps)
                                ? 'py-1.5 rounded-lg bg-cyan-400 text-slate-950 font-racing font-bold text-xs cursor-pointer'
                                : 'py-1.5 rounded-lg bg-slate-800 text-slate-300 font-racing font-bold text-xs hover:bg-slate-700 cursor-pointer';
                        }
                    });
                }
            }
        } else if (isConn && !isHost) {
            if (hostSingleControls) hostSingleControls.classList.add('hidden');
            if (hostChampControls) hostChampControls.classList.add('hidden');
            if (guestControls) {
                guestControls.classList.remove('hidden');
                const guestHostName = document.getElementById('lan-guest-host-name');
                if (guestHostName) guestHostName.textContent = hostName;
                const guestModeName = document.getElementById('lan-guest-mode-name');
                const guestTrackName = document.getElementById('lan-guest-track-name');
                const guestLapsCount = document.getElementById('lan-guest-laps-count');

                if (isChampionship) {
                    if (guestModeName) guestModeName.textContent = '🏆 CAMPIONATO GP A TAPPE';
                    const champConf = this.getLanChampionshipConfig();
                    if (guestTrackName) guestTrackName.textContent = champConf.name.toUpperCase();
                    if (guestLapsCount) guestLapsCount.textContent = `${champConf.totalStages} Tappe • ${NetworkEngine.selectedLaps} Giri`;
                } else {
                    if (guestModeName) guestModeName.textContent = 'GARA SINGOLA RAPIDA';
                    if (guestTrackName) guestTrackName.textContent = trackTitle;
                    if (guestLapsCount) guestLapsCount.textContent = `${NetworkEngine.selectedLaps} GIRI`;
                }
            }
        } else {
            if (hostSingleControls) hostSingleControls.classList.add('hidden');
            if (hostChampControls) hostChampControls.classList.add('hidden');
            if (guestControls) guestControls.classList.add('hidden');
        }

        // Render Pit Boxes Grid
        if (playersListEl) {
            if (!isConn) {
                const countEl = document.getElementById('lan-players-count');
                if (countEl) countEl.textContent = '0';
                playersListEl.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center py-8 text-center text-slate-500">
                      <i class="fa-solid fa-network-wired text-3xl mb-2 opacity-40"></i>
                      <p class="text-xs">Non sei ancora connesso alla rete LAN.</p>
                      <p class="text-[11px] mt-0.5 text-slate-600">Inserisci l'indirizzo IP a sinistra e premi "Connetti".</p>
                    </div>
                `;
                return;
            }

            // Costruisci lista unificata garantendo che 'TU' sia presente
            const map = { ...NetworkEngine.lobbyPlayers };
            if (NetworkEngine.myPlayerId) {
                map[NetworkEngine.myPlayerId] = {
                    id: NetworkEngine.myPlayerId,
                    name: NetworkEngine.nickname,
                    color: NetworkEngine.selectedColor,
                    carId: NetworkEngine.selectedCarId,
                    ping: NetworkEngine.ping || 0,
                };
            }

            const humanList = Object.values(map);
            humanList.sort((a, b) => {
                if (NetworkEngine.hostId) {
                    if (a.id === NetworkEngine.hostId) return -1;
                    if (b.id === NetworkEngine.hostId) return 1;
                }
                return String(a.id).localeCompare(String(b.id));
            });

            // In Gran Premio LAN, aggiungi piloti IA ufficiali per completare la griglia a 10 auto
            const gridCards = [];
            const countEl = document.getElementById('lan-players-count');

            humanList.forEach((p, idx) => {
                const car = CAR_CATALOG.find(c => c.id === p.carId) || CAR_CATALOG[0];
                const playerIsHost = (p.id === NetworkEngine.hostId);
                const playerIsMe = (p.id === NetworkEngine.myPlayerId);
                const slotLabel = idx === 0 ? "P01 [POLE]" : `P0${idx + 1}`;

                gridCards.push(`
                    <div class="glass-panel p-3 rounded-2xl border ${playerIsHost ? 'border-amber-400 bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-900 shadow-md shadow-amber-400/10' : (playerIsMe ? 'border-cyan-400 bg-cyan-950/20' : 'border-white/10 bg-slate-900/80')} flex items-center justify-between gap-2.5 transition">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center font-racing font-bold text-slate-950 text-base shadow shrink-0 relative" style="background-color: ${safeColor(p.color, '#00f0ff')}; border: 2px solid rgba(255,255,255,0.4)">
                                <i class="fa-solid fa-car-side"></i>
                                ${playerIsHost ? '<span class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[9px] shadow font-bold"><i class="fa-solid fa-crown"></i></span>' : ''}
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-[10px] font-racing font-black text-amber-400">${slotLabel}</span>
                                    <span class="font-racing font-black text-xs text-white truncate max-w-[110px] sm:max-w-[130px]">${escapeHtml(p.name)}</span>
                                    ${playerIsHost ? '<span class="px-1.5 py-0.2 rounded text-[8px] font-racing font-black bg-amber-400 text-slate-950">HOST</span>' : ''}
                                    ${playerIsMe ? '<span class="px-1 py-0.2 rounded text-[8px] font-racing font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">TU</span>' : ''}
                                </div>
                                <div class="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400 font-racing">
                                    <span class="text-slate-300 truncate">${car.name}</span>
                                    <span class="text-[9px] text-cyan-400">(${car.driveCode || 'RWD'})</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1 shrink-0">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-racing font-bold ${playerIsHost ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'} flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full ${playerIsHost ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse"></span>
                                ${playerIsHost ? 'HOST' : 'PRONTO'}
                            </span>
                            <span class="text-[10px] font-racing text-slate-400 font-mono">${playerIsMe ? (NetworkEngine.ping || 0) + ' ms' : '<i class="fa-solid fa-wifi text-[8px] text-emerald-400 mr-1"></i>LAN'}</span>
                        </div>
                    </div>
                `);
            });

            if (isChampionship) {
                const botsEnabled = this.selectedLanEnableBots !== false;
                const aiNeeded = botsEnabled ? Math.max(0, 10 - humanList.length) : 0;
                if (aiNeeded > 0 && typeof AI_DRIVER_ROSTER !== "undefined") {
                    for (let i = 0; i < aiNeeded; i++) {
                        const aiProf = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
                        const slot = humanList.length + i;
                        const slotLabel = `P${String(slot + 1).padStart(2, '0')}`;
                        gridCards.push(`
                            <div class="glass-panel p-3 rounded-2xl border border-white/5 bg-slate-950/60 opacity-80 flex items-center justify-between gap-2.5">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-10 h-10 rounded-xl flex items-center justify-center font-racing font-bold text-slate-950 text-base shadow shrink-0" style="background-color: ${safeColor(aiProf.paint, '#475569')}; border: 1px solid rgba(255,255,255,0.2)">
                                        <i class="fa-solid fa-robot text-slate-900"></i>
                                    </div>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-[10px] font-racing font-black text-slate-400">${slotLabel}</span>
                                            <span class="font-racing font-black text-xs text-slate-200 truncate">${escapeHtml(aiProf.name)}</span>
                                            <span class="px-1 py-0.2 rounded text-[8px] font-racing font-bold bg-slate-800 text-slate-400 border border-white/10">IA F1</span>
                                        </div>
                                        <div class="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500 font-racing">
                                            <span>SCUDERIA UFFICIALE • ${aiProf.code}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1 shrink-0">
                                    <span class="px-1.5 py-0.5 rounded text-[8px] font-racing font-bold bg-slate-800 text-slate-400 border border-white/10">
                                        IN GRIGLIA
                                    </span>
                                    <span class="text-[9px] font-racing text-slate-500">BOT F1</span>
                                </div>
                            </div>
                        `);
                    }
                }
                if (countEl) {
                    countEl.textContent = botsEnabled
                        ? `10 Vetture (${humanList.length} LAN + ${aiNeeded} IA)`
                        : `${humanList.length} Vetture (solo piloti reali)`;
                }
            } else {
                if (countEl) countEl.textContent = `${humanList.length} Piloti Connessi`;
            }

            playersListEl.innerHTML = gridCards.join('');
        }
    },

    // =========================================================================
    // CHAMPIONSHIP (TORNEO A TAPPE) UI HANDLERS
    // =========================================================================
    selectedChampPreset: 'euro_tour',
    selectedChampLaps: 3,
    selectedChampGridRule: 'reverse_8',
    selectedChampDiff: 'medium',
    selectedCustomTrackCount: 4,
    selectedCustomTracks: ['monza', 'catalunya', 'spielberg', 'spa'],
    confettiAnimId: null,

    setChampPreset(presetId) {
        this.selectedChampPreset = presetId;
        AudioEngine.playUIClick();
        this.renderChampionshipHub();
    },

    setChampLaps(laps) {
        this.selectedChampLaps = Math.max(1, parseInt(laps) || 3);
        AudioEngine.playUIClick();
        this.renderChampionshipHub();
    },

    setChampGridRule(rule) {
        this.selectedChampGridRule = rule;
        AudioEngine.playUIClick();
        this.renderChampionshipHub();
    },

    setChampDiff(diff) {
        this.selectedChampDiff = diff;
        AudioEngine.playUIClick();
        this.renderChampionshipHub();
    },

    setCustomTrackCount(count) {
        const c = Math.min(8, Math.max(3, parseInt(count) || 4));
        this.selectedCustomTrackCount = c;
        const allTracks = typeof TRACK_CATALOG !== "undefined" ? TRACK_CATALOG : [];
        if (this.selectedCustomTracks.length > c) {
            this.selectedCustomTracks = this.selectedCustomTracks.slice(0, c);
        } else {
            for (let t of allTracks) {
                if (this.selectedCustomTracks.length >= c) break;
                if (!this.selectedCustomTracks.includes(t.id)) {
                    this.selectedCustomTracks.push(t.id);
                }
            }
        }
        AudioEngine.playUIClick();
        this.renderChampionshipHub();
    },

    toggleCustomTrack(trackId) {
        const idx = this.selectedCustomTracks.indexOf(trackId);
        if (idx >= 0) {
            if (this.selectedCustomTracks.length <= 2) {
                this.showToast("Un campionato richiede almeno 2 tappe!", "warning");
                return;
            }
            this.selectedCustomTracks.splice(idx, 1);
            this.selectedCustomTrackCount = this.selectedCustomTracks.length;
        } else {
            if (this.selectedCustomTracks.length >= this.selectedCustomTrackCount) {
                if (this.selectedCustomTracks.length < 8) {
                    this.selectedCustomTracks.push(trackId);
                    this.selectedCustomTrackCount = this.selectedCustomTracks.length;
                } else {
                    this.showToast(`Hai già selezionato il massimo di 8 tappe!`, "info");
                    return;
                }
            } else {
                this.selectedCustomTracks.push(trackId);
            }
        }
        AudioEngine.playUIClick();
        this.renderChampionshipHub();
    },

    moveCustomTrack(trackId, direction) {
        const idx = this.selectedCustomTracks.indexOf(trackId);
        if (idx < 0) return;
        const newIdx = idx + direction;
        if (newIdx >= 0 && newIdx < this.selectedCustomTracks.length) {
            const temp = this.selectedCustomTracks[idx];
            this.selectedCustomTracks[idx] = this.selectedCustomTracks[newIdx];
            this.selectedCustomTracks[newIdx] = temp;
            AudioEngine.playUIClick();
            this.renderChampionshipHub();
        }
    },

    renderChampionshipHub() {
        const hub = document.getElementById('champ-hub-content');
        if (!hub) return;

        const profileNameEl = document.getElementById('champ-profile-name');
        if (profileNameEl && typeof GameApp !== "undefined" && GameApp.profile) {
            profileNameEl.textContent = GameApp.profile.nickname || 'TU';
        }

        const hasActive = typeof ChampionshipEngine !== "undefined" && ChampionshipEngine.hasActiveSeason();
        const state = typeof ChampionshipEngine !== "undefined" ? ChampionshipEngine.state : null;

        if (hasActive && state) {
            // Render active season hub
            const currentTrackId = ChampionshipEngine.getCurrentTrackId();
            const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
                ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
                : TRACK_CATALOG;
            const currentTrack = allTracks.find(t => t.id === currentTrackId) || { name: currentTrackId.toUpperCase(), country: "F1", lengthKm: "5.0 km" };
            const playerDriver = state.drivers.find(d => d.isPlayer) || { rank: 1, points: 0, wins: 0, podiums: 0 };
            const leaderDriver = state.drivers[0] || playerDriver;
            const ptsGap = playerDriver.rank === 1 ? 'LEADER' : `-${leaderDriver.points - playerDriver.points} PTS`;

            hub.innerHTML = `
                <div class="space-y-4 sm:space-y-6">
                    <!-- Season Progress & Highlights Strip (Adaptive 2x2 on Mobile, 4-Col on Desktop) -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                        <div class="glass-panel p-3 sm:p-4 rounded-2xl border-l-4 border-l-amber-400">
                            <span class="text-[9px] sm:text-[10px] uppercase font-racing text-slate-400">Torneo Attivo</span>
                            <div class="font-racing font-black text-xs sm:text-base text-white mt-0.5 truncate">${escapeHtml(state.name)}</div>
                            <span class="text-[10px] sm:text-xs text-amber-300 font-bold truncate block">${state.badge}</span>
                        </div>
                        <div class="glass-panel p-3 sm:p-4 rounded-2xl border-l-4 border-l-cyan-400">
                            <span class="text-[9px] sm:text-[10px] uppercase font-racing text-slate-400">Tappa Attuale</span>
                            <div class="font-racing font-black text-xs sm:text-base text-white mt-0.5">Tappa ${state.currentStageIndex + 1} / ${state.totalStages}</div>
                            <span class="text-[10px] sm:text-xs text-cyan-300 font-bold truncate block">${escapeHtml(currentTrack.name)}</span>
                        </div>
                        <div class="glass-panel p-3 sm:p-4 rounded-2xl border-l-4 border-l-emerald-400">
                            <span class="text-[9px] sm:text-[10px] uppercase font-racing text-slate-400">Tua Posizione</span>
                            <div class="font-racing font-black text-xs sm:text-base text-emerald-400 mt-0.5">${playerDriver.rank}° (${playerDriver.points} Pts)</div>
                            <span class="text-[10px] sm:text-xs text-slate-300 font-medium">${ptsGap}</span>
                        </div>
                        <div class="glass-panel p-3 sm:p-4 rounded-2xl border-l-4 border-l-purple-400">
                            <span class="text-[9px] sm:text-[10px] uppercase font-racing text-slate-400">Regolamento</span>
                            <div class="font-racing font-black text-xs sm:text-base text-purple-300 mt-0.5">${state.lapsPerRace} Giri • ${state.gridRule === 'reverse_8' ? 'Inv. 8' : 'Ordine'}</div>
                            <span class="text-[10px] sm:text-xs text-slate-400">${state.gridSize} Auto • ${state.difficulty.toUpperCase()}</span>
                        </div>
                    </div>

                    <!-- Stage Timeline Calendar (Adaptive Grid) -->
                    <div class="glass-panel p-3.5 sm:p-5 rounded-3xl border border-white/10 space-y-3">
                        <div class="flex items-center justify-between">
                            <h3 class="font-racing font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                                <i class="fa-solid fa-calendar-days text-amber-400"></i>
                                <span>CALENDARIO TAPPE GRAND PRIX</span>
                            </h3>
                            <span class="text-[10px] sm:text-xs text-slate-400 font-racing">FIA Official Calendar</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(5, state.totalStages)} gap-2.5 sm:gap-3">
                            ${state.tracks.map((trId, sIdx) => {
                                const trData = allTracks.find(t => t.id === trId) || { name: trId.toUpperCase(), country: "GP" };
                                const isDone = sIdx < state.currentStageIndex;
                                const isCurrent = sIdx === state.currentStageIndex;
                                const stageHistoryItem = state.stageHistory[sIdx];
                                const winnerName = stageHistoryItem && stageHistoryItem.awards && stageHistoryItem.awards[0] ? stageHistoryItem.awards[0].driverName : null;

                                return `
                                    <div class="p-3 sm:p-4 rounded-2xl border transition ${isCurrent ? 'bg-amber-950/40 border-amber-400/80 shadow-lg shadow-amber-500/10' : (isDone ? 'bg-slate-900/60 border-emerald-500/30' : 'bg-slate-950/40 border-white/5 opacity-60')}">
                                        <div class="flex items-center justify-between text-[10px] font-racing">
                                            <span class="px-2 py-0.5 rounded ${isCurrent ? 'bg-amber-400 text-slate-950 font-black' : (isDone ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'bg-white/5 text-slate-400')}">
                                                TAPPA ${sIdx + 1}
                                            </span>
                                            ${isDone ? '<i class="fa-solid fa-circle-check text-emerald-400 text-sm"></i>' : (isCurrent ? '<span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>' : '<i class="fa-solid fa-lock text-slate-600"></i>')}
                                        </div>
                                        <div class="font-racing font-bold text-xs sm:text-sm text-white mt-2 truncate">${escapeHtml(trData.name)}</div>
                                        <div class="text-[10px] sm:text-[11px] text-slate-400 font-semibold">${trData.country} • ${state.lapsPerRace} Giri</div>
                                        <div class="mt-1.5 text-[9px] sm:text-[10px] text-slate-300 truncate">
                                            ${isDone ? `<span class="text-emerald-400">Vinto da: <strong>${winnerName ? escapeHtml(winnerName) : 'Conclusa'}</strong></span>` : (isCurrent ? '<span class="text-amber-300 font-bold uppercase">Pronta al via</span>' : '<span class="text-slate-500">In attesa</span>')}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- General Standings Table (Progressively Drops Superficial Columns on Mobile) -->
                    <div class="glass-panel p-3.5 sm:p-5 rounded-3xl border border-white/10 space-y-3">
                        <div class="flex items-center justify-between">
                            <h3 class="font-racing font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                                <i class="fa-solid fa-ranking-star text-amber-400"></i>
                                <span>CLASSIFICA GENERALE PILOTI (PUNTI FIA)</span>
                            </h3>
                            <span class="text-[10px] sm:text-xs text-amber-300 font-racing font-bold hidden sm:inline">25 - 18 - 15 - 12 - 10 - 8 - 6 - 4 - 2 - 1</span>
                        </div>
                        <div class="overflow-x-auto max-h-56 sm:max-h-64 overflow-y-auto">
                            <table class="w-full text-left font-racing text-xs">
                                <thead>
                                    <tr class="border-b border-white/10 text-slate-400 text-[9px] sm:text-[10px] uppercase">
                                        <th class="py-2 px-2 sm:px-3">Pos</th>
                                        <th class="py-2 px-2 sm:px-3">Pilota</th>
                                        <th class="py-2 px-2 sm:px-3 text-center">Vittorie</th>
                                        <th class="py-2 px-2 sm:px-3 text-center hidden md:table-cell">Podi</th>
                                        <th class="py-2 px-2 sm:px-3 text-center hidden sm:table-cell">Giri Veloci</th>
                                        <th class="py-2 px-2 sm:px-3 text-right">Punti</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${state.drivers.map((d, idx) => `
                                        <tr class="border-b border-white/5 ${d.isPlayer ? 'bg-amber-400/15 text-amber-200 font-bold' : 'text-slate-300 hover:bg-white/5'}">
                                            <td class="py-2 px-2 sm:px-3 font-black ${idx === 0 ? 'text-amber-400' : (idx === 1 ? 'text-slate-200' : (idx === 2 ? 'text-amber-600' : 'text-slate-400'))}">${idx + 1}°</td>
                                            <td class="py-2 px-2 sm:px-3 flex items-center gap-1.5 truncate">
                                                ${d.isPlayer ? '<i class="fa-solid fa-user text-amber-400 text-[10px]"></i>' : '<i class="fa-solid fa-robot text-slate-500 text-[10px]"></i>'}
                                                <span class="truncate">${escapeHtml(d.name)}</span>
                                            </td>
                                            <td class="py-2 px-2 sm:px-3 text-center text-slate-400">${d.wins || 0}</td>
                                            <td class="py-2 px-2 sm:px-3 text-center text-slate-400 hidden md:table-cell">${d.podiums || 0}</td>
                                            <td class="py-2 px-2 sm:px-3 text-center text-slate-400 hidden sm:table-cell">${d.fastestLaps || 0}</td>
                                            <td class="py-2 px-2 sm:px-3 text-right font-black text-white">${d.points}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Action Bar -->
                    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                        <button
                            onclick="UI.confirmResetChampionship()"
                            class="w-full sm:w-auto px-4 py-2.5 sm:py-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-racing font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <i class="fa-solid fa-trash-can"></i>
                            <span>AZZERA CAMPIONATO</span>
                        </button>

                        <button
                            onclick="UI.launchCurrentChampionshipStage()"
                            class="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl font-racing font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-slate-950 shadow-xl shadow-amber-500/20 hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <i class="fa-solid fa-flag-checkered text-sm sm:text-base"></i>
                            <span>AVVIA TAPPA ${state.currentStageIndex + 1}: ${escapeHtml(currentTrack.name.toUpperCase())}</span>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Render new season setup hub
            const presets = ChampionshipEngine.PRESETS;
            const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
                ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
                : TRACK_CATALOG;

            hub.innerHTML = `
                <div class="space-y-4 sm:space-y-6">
                    <!-- Presets Selection Cards -->
                    <div>
                        <div class="text-xs uppercase font-racing text-slate-400 mb-2.5 flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-trophy text-amber-400"></i>
                                <span>1. SCEGLI IL TORNEO A TAPPE</span>
                            </div>
                            <span class="text-[10px] text-slate-500 hidden sm:inline">Tappe consecutive con punteggio F1</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                            ${Object.values(presets).map(p => {
                                const isSel = p.id === this.selectedChampPreset;
                                const isCustom = p.id === 'custom';
                                const trackList = isCustom ? this.selectedCustomTracks : p.tracks;
                                const badgeText = isCustom ? `${this.selectedCustomTracks.length} TAPPE PERSONALIZZATE` : p.badge;
                                return `
                                    <div
                                        onclick="UI.setChampPreset('${p.id}')"
                                        class="glass-panel p-4 sm:p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${isSel ? 'border-amber-400 shadow-xl shadow-amber-500/10 bg-amber-950/20' : 'border-white/10 hover:border-amber-400/40 bg-slate-900/60'}"
                                    >
                                        <div>
                                            <div class="flex items-center justify-between text-[10px] font-racing">
                                                <span class="px-2 py-0.5 rounded font-bold ${isSel ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-amber-300'}">${badgeText}</span>
                                                ${isSel ? '<i class="fa-solid fa-circle-check text-amber-400 text-sm sm:text-base"></i>' : ''}
                                            </div>
                                            <h3 class="font-racing font-black text-sm sm:text-base text-white mt-2">${escapeHtml(p.name)}</h3>
                                            <p class="text-xs text-slate-300 mt-1 leading-relaxed hidden sm:block">${p.description}</p>
                                        </div>
                                        <div class="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-1.5 text-[10px] sm:text-[11px] text-cyan-300 font-racing">
                                            <i class="fa-solid fa-route"></i>
                                            <span class="truncate">${trackList.length} Gare: ${trackList.map(t => t.toUpperCase()).join(' • ')}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- Custom Championship Track & Stage Selection (visible when Custom Preset is active) -->
                    ${this.selectedChampPreset === 'custom' ? `
                    <div class="glass-panel p-4 sm:p-6 rounded-3xl border border-amber-400/40 bg-amber-950/15 space-y-4">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-map-location-dot text-amber-400 text-base"></i>
                                <div>
                                    <div class="text-xs uppercase font-racing text-slate-200 font-bold">1.B CONFIGURA LE TAPPE DEL CAMPIONATO</div>
                                    <div class="text-[10px] text-slate-400">Seleziona quante e quali piste disputare in sequenza</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-white/10">
                                <span class="text-[10px] sm:text-[11px] font-racing text-slate-400 uppercase">Numero Tappe:</span>
                                <div class="flex items-center gap-1">
                                    ${[3, 4, 5, 6, 7, 8].map(count => `
                                        <button
                                            onclick="UI.setCustomTrackCount(${count})"
                                            class="w-7 h-7 rounded-lg text-[10px] font-racing font-bold transition flex items-center justify-center cursor-pointer ${this.selectedCustomTrackCount === count ? 'bg-amber-400 text-slate-950 font-black shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                                        >
                                            ${count}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Current Stage Order Strip -->
                        <div class="space-y-1.5">
                            <div class="flex items-center justify-between text-[11px] font-racing text-slate-400">
                                <span>CALENDARIO GARE (${this.selectedCustomTracks.length} di ${this.selectedCustomTrackCount} tappe selezionate)</span>
                                <span class="text-amber-400 text-[10px]">Usa le frecce per riordinare la sequenza</span>
                            </div>
                            <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                ${this.selectedCustomTracks.map((tId, idx) => {
                                    const trk = allTracks.find(t => t.id === tId) || { name: tId.toUpperCase(), country: "F1", lengthKm: "5.0 km" };
                                    return `
                                        <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-amber-400/50 shadow-md shrink-0">
                                            <span class="w-5 h-5 rounded-lg bg-amber-400 text-slate-950 font-racing font-black text-[10px] flex items-center justify-center shrink-0">${idx + 1}°</span>
                                            <div>
                                                <div class="font-racing font-bold text-xs text-white leading-tight">${escapeHtml(trk.name)}</div>
                                                <div class="text-[9px] text-cyan-300 font-racing">${trk.country} • ${trk.lengthKm || 'F1'}</div>
                                            </div>
                                            <div class="flex items-center gap-0.5 ml-1">
                                                ${idx > 0 ? `
                                                    <button onclick="event.stopPropagation(); UI.moveCustomTrack('${tId}', -1)" title="Anticipa tappa" class="text-slate-400 hover:text-white text-[10px] p-0.5 cursor-pointer">
                                                        <i class="fa-solid fa-chevron-left"></i>
                                                    </button>
                                                ` : ''}
                                                ${idx < this.selectedCustomTracks.length - 1 ? `
                                                    <button onclick="event.stopPropagation(); UI.moveCustomTrack('${tId}', 1)" title="Posticipa tappa" class="text-slate-400 hover:text-white text-[10px] p-0.5 cursor-pointer">
                                                        <i class="fa-solid fa-chevron-right"></i>
                                                    </button>
                                                ` : ''}
                                                <button onclick="event.stopPropagation(); UI.toggleCustomTrack('${tId}')" title="Rimuovi" class="text-slate-500 hover:text-rose-400 text-xs p-1 ml-0.5 cursor-pointer">
                                                    <i class="fa-solid fa-xmark"></i>
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- All Tracks Grid (25 Official Tracks) -->
                        <div class="space-y-1.5 pt-1">
                            <div class="flex items-center justify-between text-[11px] font-racing text-slate-400">
                                <span>Catalogo Tracciati Ufficiali F1 (Clicca per aggiungere/rimuovere):</span>
                                <span class="text-[10px] text-slate-500 hidden sm:inline">${allTracks.length} Circuiti disponibili</span>
                            </div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-60 overflow-y-auto p-1 rounded-2xl bg-slate-950/60 border border-white/5 scrollbar-thin">
                                ${allTracks.map(t => {
                                    const selIdx = this.selectedCustomTracks.indexOf(t.id);
                                    const isSel = selIdx >= 0;
                                    return `
                                        <div
                                            onclick="UI.toggleCustomTrack('${t.id}')"
                                            class="p-2 sm:p-2.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${isSel ? 'border-amber-400 bg-amber-400/15 shadow-sm' : 'border-white/5 bg-slate-900/70 hover:border-white/20 hover:bg-slate-800/80'}"
                                        >
                                            <div class="flex items-center justify-between">
                                                <span class="text-[9px] font-racing font-bold px-1.5 py-0.2 rounded ${isSel ? 'bg-amber-400 text-slate-950 font-black' : 'bg-white/10 text-slate-300'}">${t.country}</span>
                                                ${isSel ? `<span class="text-[9px] font-racing font-black text-amber-300">#${selIdx + 1} TAPPA</span>` : '<span class="text-[10px] text-slate-500"><i class="fa-solid fa-plus"></i></span>'}
                                            </div>
                                            <div class="mt-1.5">
                                                <div class="font-racing font-bold text-xs text-white truncate">${t.name}</div>
                                                <div class="text-[9px] text-slate-400 font-racing truncate">${t.lengthKm || 'F1 Circuit'}</div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Tournament Rules & Customization Panel (Adaptive on Small Screens) -->
                    <div class="glass-panel p-4 sm:p-6 rounded-3xl border border-white/10 space-y-4">
                        <div class="text-xs uppercase font-racing text-slate-400 flex items-center gap-2">
                            <i class="fa-solid fa-sliders text-cyan-400"></i>
                            <span>2. PERSONALIZZA REGOLAMENTO DELLA STAGIONE</span>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            <!-- Laps Customization -->
                            <div class="bg-slate-900/80 rounded-2xl p-3.5 sm:p-4 border border-white/10 space-y-2">
                                <div class="text-[11px] uppercase font-racing text-slate-300 flex items-center justify-between">
                                    <span>Giri per Gara</span>
                                    <span class="text-amber-400 font-bold">${this.selectedChampLaps} Giri</span>
                                </div>
                                <p class="text-[10px] text-slate-400 hidden sm:block">Personalizza la lunghezza di ogni singola tappa:</p>
                                <div class="flex items-center gap-1 pt-1">
                                    ${[2, 3, 5, 8].map(l => `
                                        <button
                                            id="champ-laps-btn-${l}"
                                            onclick="UI.setChampLaps(${l})"
                                            class="flex-1 py-1.5 rounded-lg text-xs font-racing font-bold transition cursor-pointer ${this.selectedChampLaps === l ? 'bg-amber-400 text-slate-950 font-black shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                                        >
                                            ${l}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- Starting Grid Rule Selection -->
                            <div class="bg-slate-900/80 rounded-2xl p-3.5 sm:p-4 border border-white/10 space-y-2">
                                <div class="text-[11px] uppercase font-racing text-slate-300 flex items-center justify-between">
                                    <span>Griglia di Partenza</span>
                                    <span class="text-cyan-400 font-bold text-[10px] sm:text-xs">${this.selectedChampGridRule === 'reverse_8' ? 'Top 8 Invertiti' : 'Risultati Gara'}</span>
                                </div>
                                <p class="text-[10px] text-slate-400 hidden sm:block">Come calcolare la griglia per le tappe successive:</p>
                                <div class="grid grid-cols-2 gap-1.5 pt-1">
                                    <button
                                        id="champ-grid-btn-reverse_8"
                                        onclick="UI.setChampGridRule('reverse_8')"
                                        class="py-2 px-1.5 rounded-xl text-[10px] sm:text-[11px] font-racing font-bold text-center transition cursor-pointer ${this.selectedChampGridRule === 'reverse_8' ? 'bg-cyan-400 text-slate-950 border border-cyan-300 shadow-md font-black' : 'bg-slate-900 text-slate-300 border border-white/10 hover:bg-slate-800'}"
                                    >
                                        TOP 8 INVERTITI
                                    </button>
                                    <button
                                        id="champ-grid-btn-results"
                                        onclick="UI.setChampGridRule('results')"
                                        class="py-2 px-1.5 rounded-xl text-[10px] sm:text-[11px] font-racing font-bold text-center transition cursor-pointer ${this.selectedChampGridRule === 'results' ? 'bg-cyan-400 text-slate-950 border border-cyan-300 shadow-md font-black' : 'bg-slate-900 text-slate-300 border border-white/10 hover:bg-slate-800'}"
                                    >
                                        ORDINE D'ARRIVO
                                    </button>
                                </div>
                            </div>

                            <!-- Difficulty & Rewards -->
                            <div class="bg-slate-900/80 rounded-2xl p-3.5 sm:p-4 border border-white/10 space-y-2 sm:col-span-2 lg:col-span-1">
                                <div class="text-[11px] uppercase font-racing text-slate-300 flex items-center justify-between">
                                    <span>Difficoltà Piloti CPU</span>
                                    <span class="text-amber-400 font-bold">${this.selectedChampDiff.toUpperCase()}</span>
                                </div>
                                <p class="text-[10px] text-slate-400 hidden sm:block">Maggiore difficoltà moltiplica il super premio finale:</p>
                                <div class="flex items-center gap-1 pt-1">
                                    ${['easy', 'medium', 'hard', 'legend'].map(d => {
                                        const labels = { easy: 'FAC', medium: 'MED', hard: 'DIF', legend: 'LEG' };
                                        return `
                                            <button
                                                id="champ-diff-btn-${d}"
                                                onclick="UI.setChampDiff('${d}')"
                                                class="flex-1 py-1.5 rounded-lg text-[10px] font-racing font-bold transition cursor-pointer ${this.selectedChampDiff === d ? 'bg-amber-400 text-slate-950 font-black shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                                            >
                                                ${labels[d]}
                                            </button>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Start Championship Button -->
                    <div class="flex justify-end pt-1">
                        <button
                            onclick="UI.startNewChampionship()"
                            class="w-full sm:w-auto px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl font-racing font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-slate-950 shadow-xl shadow-amber-500/20 hover:brightness-110 transition flex items-center justify-center gap-2.5 cursor-pointer"
                        >
                            <i class="fa-solid fa-trophy text-base sm:text-lg"></i>
                            <span>AVVIA CAMPIONATO F1 (TAPPA 1)</span>
                        </button>
                    </div>
                </div>
            `;
        }
    },

    startNewChampionship() {
        const isCustom = this.selectedChampPreset === 'custom';
        const tracks = (isCustom && this.selectedCustomTracks && this.selectedCustomTracks.length >= 2)
            ? this.selectedCustomTracks
            : undefined;

        const season = ChampionshipEngine.createSeason({
            presetId: this.selectedChampPreset,
            tracks: tracks,
            laps: this.selectedChampLaps,
            gridRule: this.selectedChampGridRule,
            difficulty: this.selectedChampDiff,
            gridSize: 10,
        });
        AudioEngine.playUIClick();
        this.showToast(`Campionato "${season.name}" (${season.tracks.length} tappe) avviato!`, 'success');
        this.launchCurrentChampionshipStage();
    },

    launchCurrentChampionshipStage() {
        const trackId = ChampionshipEngine.getCurrentTrackId();
        RaceEngine.startSession(trackId, 'championship');
    },

    confirmResetChampionship() {
        if (confirm("Vuoi davvero abbandonare il campionato corrente? I punti accumulati andranno persi.")) {
            ChampionshipEngine.resetChampionship();
            this.showToast("Campionato azzerato", "info");
            this.renderChampionshipHub();
        }
    },

    showChampionshipStageModal(stageSummary) {
        if (!stageSummary) return;

        // Hide In-Game HUD and Menu
        const hud = document.getElementById('race-hud');
        if (hud) hud.classList.add('hidden');

        const modal = document.getElementById('modal-championship-stage');
        if (!modal) return;

        const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
            ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
            : TRACK_CATALOG;
        const currentTrackId = ChampionshipEngine.getCurrentTrackId();
        const currentTrack = allTracks.find(t => t.id === currentTrackId) || { name: currentTrackId.toUpperCase() };

        // Badge & Title
        const badgeEl = document.getElementById('champ-stage-badge');
        if (badgeEl) badgeEl.textContent = `TAPPA ${stageSummary.currentStageNumber} DI ${stageSummary.totalStages}`;
        const titleEl = document.getElementById('champ-stage-title');
        if (titleEl) titleEl.textContent = `${currentTrack.name.toUpperCase()} - RISULTATI DI TAPPA`;

        // Stage Podium Cards (1°, 2°, 3°)
        const podiumContainer = document.getElementById('champ-stage-podium-cards');
        if (podiumContainer && Array.isArray(stageSummary.stageAwards)) {
            const top3 = stageSummary.stageAwards.slice(0, 3);
            const podiumTrophies = [
                { pos: '1°', color: 'from-amber-400 to-yellow-500', icon: 'fa-trophy', text: 'text-amber-400' },
                { pos: '2°', color: 'from-slate-300 to-slate-400', icon: 'fa-medal', text: 'text-slate-300' },
                { pos: '3°', color: 'from-amber-700 to-amber-800', icon: 'fa-medal', text: 'text-amber-600' }
            ];

            const winnerAward = top3[0];
            podiumContainer.innerHTML = top3.map((racer, idx) => {
                const conf = podiumTrophies[idx] || podiumTrophies[0];
                let timeStr = "";
                if (idx === 0) {
                    timeStr = racer.finishTime ? `<div class="text-[11px] text-emerald-400 font-mono font-bold">${this.formatLapTime(racer.finishTime)}</div>` : (racer.bestLapTime ? `<div class="text-[10px] text-slate-400 font-mono">${this.formatLapTime(racer.bestLapTime)}</div>` : '');
                } else if (racer.finishTime && winnerAward && winnerAward.finishTime) {
                    const diffSec = ((racer.finishTime - winnerAward.finishTime) / 1000).toFixed(3);
                    timeStr = `<div class="text-[11px] text-amber-300 font-mono font-bold">+${Number(diffSec) > 0 ? diffSec : '0.000'}s</div>`;
                } else {
                    timeStr = `<div class="text-[10px] text-slate-400 font-mono">${racer.bestLapTime ? this.formatLapTime(racer.bestLapTime) : '--:--.---'}</div>`;
                }

                return `
                    <div class="glass-panel p-4 rounded-2xl border ${racer.isPlayer ? 'border-amber-400 shadow-lg shadow-amber-500/10 bg-amber-950/20' : 'border-white/10'} text-center space-y-1.5">
                        <div class="flex items-center justify-between text-xs font-racing">
                            <span class="font-black ${conf.text}">${conf.pos} POSTO</span>
                            <span class="px-2 py-0.5 rounded text-[10px] bg-amber-400/20 text-amber-300 font-bold">+${racer.pointsAwarded} PTS</span>
                        </div>
                        <div class="text-2xl ${conf.text} py-1">
                            <i class="fa-solid ${conf.icon}"></i>
                        </div>
                        <div class="font-racing font-bold text-sm text-white truncate">${escapeHtml(racer.driverName)}</div>
                        ${timeStr}
                        ${racer.isFastestLap ? '<div class="text-[9px] font-racing font-bold text-purple-300 bg-purple-500/20 rounded py-0.5 mt-1"><i class="fa-solid fa-stopwatch mr-1"></i>GIRO RECORD (+1 PT)</div>' : ''}
                    </div>
                `;
            }).join('');
        }

        // Stage Order List
        const stageListEl = document.getElementById('champ-stage-order-list');
        if (stageListEl && Array.isArray(stageSummary.stageAwards)) {
            const winnerAward = stageSummary.stageAwards[0];
            stageListEl.innerHTML = stageSummary.stageAwards.map((r, idx) => {
                let timeGapStr = "";
                if (idx === 0) {
                    timeGapStr = r.finishTime ? `<span class="text-emerald-400 font-mono text-[10px] mr-2">${this.formatLapTime(r.finishTime)}</span>` : "";
                } else if (r.finishTime && winnerAward && winnerAward.finishTime) {
                    const diffSec = ((r.finishTime - winnerAward.finishTime) / 1000).toFixed(3);
                    timeGapStr = `<span class="text-amber-300 font-mono text-[10px] mr-2">+${Number(diffSec) > 0 ? diffSec : '0.000'}s</span>`;
                }

                return `
                <div class="flex items-center justify-between py-1 px-2 rounded-lg text-xs font-racing ${r.isPlayer ? 'bg-amber-400/20 text-amber-200 font-bold' : 'text-slate-300'}">
                    <div class="flex items-center gap-2">
                        <span class="font-black w-5 ${r.finishPos <= 3 ? 'text-amber-400' : 'text-slate-500'}">${r.finishPos}°</span>
                        <span class="truncate">${escapeHtml(r.driverName)}</span>
                        ${r.isFastestLap ? '<i class="fa-solid fa-stopwatch text-purple-400 text-[10px]" title="Giro più veloce"></i>' : ''}
                    </div>
                    <div class="flex items-center">
                        ${timeGapStr}
                        <span class="font-bold text-amber-300">+${r.pointsAwarded} pts</span>
                    </div>
                </div>
            `;}).join('');
        }

        // Overall Standings List
        const overallListEl = document.getElementById('champ-overall-order-list');
        if (overallListEl && Array.isArray(stageSummary.overallStandings)) {
            overallListEl.innerHTML = stageSummary.overallStandings.map((d, idx) => `
                <div class="flex items-center justify-between py-1 px-2 rounded-lg text-xs font-racing ${d.isPlayer ? 'bg-amber-400/20 text-amber-200 font-bold' : 'text-slate-300'}">
                    <div class="flex items-center gap-2">
                        <span class="font-black w-5 ${idx === 0 ? 'text-amber-400' : (idx < 3 ? 'text-slate-300' : 'text-slate-500')}">${idx + 1}°</span>
                        <span class="truncate">${escapeHtml(d.name)}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-[10px] text-slate-400">${d.wins || 0}W</span>
                        <span class="font-bold text-white">${d.points} pts</span>
                    </div>
                </div>
            `).join('');
        }

        // Next Stage Banner
        const nextBanner = document.getElementById('champ-next-stage-banner');
        const nextStageNameEl = document.getElementById('champ-next-stage-name');
        const nextGridRuleEl = document.getElementById('champ-next-grid-rule-info');
        const nextLapsEl = document.getElementById('champ-next-laps-badge');

        if (stageSummary.isFinalStage) {
            if (nextStageNameEl) nextStageNameEl.textContent = 'CAMPIONATO CONCLUSO!';
            if (nextGridRuleEl) nextGridRuleEl.textContent = 'Tutte le tappe completate. Scopri la classifica finale e il montepremi!';
            if (nextLapsEl) nextLapsEl.textContent = 'FINALE';
        } else {
            const nextTrack = allTracks.find(t => t.id === stageSummary.nextTrackId) || { name: (stageSummary.nextTrackId || '').toUpperCase() };
            if (nextStageNameEl) nextStageNameEl.textContent = `PROSSIMA TAPPA: ${nextTrack.name.toUpperCase()}`;
            if (nextGridRuleEl) {
                const cState = ChampionshipEngine.state;
                nextGridRuleEl.textContent = cState && cState.gridRule === 'reverse_8'
                    ? "Griglia Invertita per i primi 8 classificati (P1 scatterà in 8ª piazza, P8 in Pole Position!)"
                    : "Griglia basata sull'ordine d'arrivo di questa gara";
            }
            if (nextLapsEl && ChampionshipEngine.state) {
                nextLapsEl.textContent = `${ChampionshipEngine.state.lapsPerRace} GIRI`;
            }
        }

        // Host-Only Action Control Row
        const ctaContainer = document.getElementById('champ-stage-cta-container');
        if (ctaContainer) {
            if (stageSummary.isFinalStage) {
                ctaContainer.innerHTML = `
                    <button
                        onclick="UI.showChampionshipFinale()"
                        class="w-full py-3.5 px-6 rounded-xl font-racing font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-slate-950 shadow-xl shadow-amber-500/20 hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <i class="fa-solid fa-trophy text-base"></i>
                        <span>VAI AL GRAN FINALE DI STAGIONE 🏆</span>
                    </button>
                `;
            } else {
                // VERIFICA PERMESSO HOST:
                // Solo l'Host (o in single player) può cliccare il pulsante immediato per avviare la tappa successiva
                const isHost = (typeof NetworkEngine === "undefined" || !NetworkEngine.isConnected || NetworkEngine.isHost);
                const nextTrack = allTracks.find(t => t.id === stageSummary.nextTrackId) || { name: (stageSummary.nextTrackId || '').toUpperCase() };

                if (isHost) {
                    ctaContainer.innerHTML = `
                        <button
                            onclick="UI.advanceChampionshipStage()"
                            id="btn-champ-next-stage"
                            class="w-full py-3.5 px-6 rounded-xl font-racing font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-slate-950 shadow-xl shadow-amber-500/20 hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <i class="fa-solid fa-forward-step text-base"></i>
                            <span>AVVIA TAPPA SUCCESSIVA: ${escapeHtml(nextTrack.name.toUpperCase())}</span>
                        </button>
                    `;
                } else {
                    ctaContainer.innerHTML = `
                        <div class="w-full py-3 px-4 rounded-xl bg-slate-900 border border-amber-400/30 text-amber-300 font-racing font-bold text-xs sm:text-sm flex items-center justify-center gap-2">
                            <i class="fa-solid fa-hourglass-half animate-spin text-amber-400"></i>
                            <span>IN ATTESA CHE L'HOST AVVII LA TAPPA SUCCESSIVA...</span>
                        </div>
                    `;
                }
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    },

    advanceChampionshipStage() {
        // In modalità LAN multiplayer
        if (typeof NetworkEngine !== "undefined" && NetworkEngine.isConnected) {
            if (!NetworkEngine.isHost) {
                this.showToast("Solo il Direttore di Gara (Host) può avviare la tappa successiva!", "warning");
                return;
            }

            const modal = document.getElementById('modal-championship-stage');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }

            ChampionshipEngine.advanceToNextStage();
            const nextTrackId = ChampionshipEngine.getCurrentTrackId();
            const laps = ChampionshipEngine.state.lapsPerRace;
            const gridSlots = ChampionshipEngine.getGridSlots();

            NetworkEngine.send({
                type: 'start_race',
                trackId: nextTrackId,
                laps: laps,
                countdownDuration: 4.5,
                gameMode: 'championship',
                enableBots: ChampionshipEngine.state.enableBots !== false,
                championship: {
                    seasonId: ChampionshipEngine.state.id,
                    presetId: ChampionshipEngine.state.presetId,
                    name: ChampionshipEngine.state.name,
                    tracks: ChampionshipEngine.state.tracks,
                    totalStages: ChampionshipEngine.state.totalStages,
                    currentStageIndex: ChampionshipEngine.state.currentStageIndex,
                    laps: laps,
                    gridRule: ChampionshipEngine.state.gridRule,
                    difficulty: ChampionshipEngine.state.difficulty,
                    gridSize: ChampionshipEngine.state.gridSize,
                    enableBots: ChampionshipEngine.state.enableBots !== false,
                    gridSlots: gridSlots,
                    drivers: ChampionshipEngine.state.drivers,
                },
                gridSlots: gridSlots,
            });
            this.showToast(`Avvio Tappa ${ChampionshipEngine.getCurrentStageNumber()} inviato a tutti i concorrenti!`, "fa-flag-checkered");
            return;
        }

        const modal = document.getElementById('modal-championship-stage');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        ChampionshipEngine.advanceToNextStage();
        this.launchCurrentChampionshipStage();
    },

    showChampionshipFinale(rewards) {
        // Chiudi eventuale modale di tappa
        const stageModal = document.getElementById('modal-championship-stage');
        if (stageModal) {
            stageModal.classList.add('hidden');
            stageModal.classList.remove('flex');
        }

        const finaleModal = document.getElementById('modal-championship-finale');
        if (!finaleModal) return;

        const r = rewards || ChampionshipEngine.calculateSeasonRewards();

        // Accredita il super premio al profilo in modo sicuro
        if (typeof GameApp !== "undefined" && GameApp.profile) {
            GameApp.profile.credits += (r.prize || 0);
            if (r.position <= 3) {
                GameApp.profile.trophies = (GameApp.profile.trophies || 0) + 1;
            }
            if (typeof StorageManager !== "undefined") {
                StorageManager.save(GameApp.profile);
            }
            this.updateHeaderStats();
        }

        // Fanfara trionfale audio con risveglio garantito dell'AudioContext
        if (typeof AudioEngine !== "undefined") {
            try {
                AudioEngine.init();
                if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') {
                    AudioEngine.ctx.resume();
                }
                if (AudioEngine.playVictoryFanfare) {
                    AudioEngine.playVictoryFanfare();
                }
            } catch (err) {
                console.warn("[Audio] Errore riproduzione fanfara:", err);
            }
        }

        // Avvia animazione coriandoli trionfali su canvas
        this.startConfettiCelebration();

        // Popola la cerimonia
        const trophyIcon = document.getElementById('champ-finale-trophy-icon');
        const trophyGlow = document.getElementById('champ-finale-trophy-glow');
        if (trophyIcon && trophyGlow) {
            if (r.position === 1) {
                trophyIcon.className = 'fa-solid fa-trophy text-amber-300';
                trophyGlow.className = 'w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-full bg-amber-400/25 border-2 border-amber-400 flex items-center justify-center text-amber-300 text-5xl sm:text-6xl shadow-[0_0_60px_rgba(251,191,36,0.6)] animate-bounce';
            } else if (r.position === 2) {
                trophyIcon.className = 'fa-solid fa-medal text-slate-200';
                trophyGlow.className = 'w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-full bg-slate-400/25 border-2 border-slate-300 flex items-center justify-center text-slate-200 text-5xl sm:text-6xl shadow-[0_0_50px_rgba(226,232,240,0.5)]';
            } else if (r.position === 3) {
                trophyIcon.className = 'fa-solid fa-medal text-amber-600';
                trophyGlow.className = 'w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-full bg-amber-700/25 border-2 border-amber-600 flex items-center justify-center text-amber-600 text-5xl sm:text-6xl shadow-[0_0_50px_rgba(217,119,6,0.5)]';
            } else {
                trophyIcon.className = 'fa-solid fa-flag-checkered text-slate-400';
                trophyGlow.className = 'w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-400 text-5xl sm:text-6xl';
            }
        }

        const titleEl = document.getElementById('champ-finale-title');
        if (titleEl) titleEl.textContent = r.title;

        const prizeTextEl = document.getElementById('champ-finale-prize-text');
        if (prizeTextEl) prizeTextEl.textContent = `+ Cr. ${r.prize.toLocaleString('it-IT')}`;

        const rankStat = document.getElementById('champ-stat-rank');
        if (rankStat) rankStat.textContent = `${r.position}°`;
        const ptsStat = document.getElementById('champ-stat-points');
        if (ptsStat) ptsStat.textContent = r.points;
        const winsStat = document.getElementById('champ-stat-wins');
        if (winsStat) winsStat.textContent = r.wins;
        const podsStat = document.getElementById('champ-stat-podiums');
        if (podsStat) podsStat.textContent = r.podiums;

        // Popola la tabella classica (modular alternative view)
        const tableBody = document.getElementById('champ-finale-table-body');
        if (tableBody && ChampionshipEngine.state && Array.isArray(ChampionshipEngine.state.drivers)) {
            tableBody.innerHTML = ChampionshipEngine.state.drivers.map((d, idx) => `
                <tr class="border-b border-white/5 ${d.isPlayer ? 'bg-amber-400/20 text-amber-200 font-bold' : 'text-slate-300 hover:bg-white/5'}">
                    <td class="py-2.5 px-2 font-black ${idx === 0 ? 'text-amber-400' : (idx === 1 ? 'text-slate-200' : (idx === 2 ? 'text-amber-600' : 'text-slate-500'))}">${idx + 1}°</td>
                    <td class="py-2.5 px-2 flex items-center gap-1.5">
                        ${d.isPlayer ? '<i class="fa-solid fa-user text-amber-400 text-xs"></i>' : '<i class="fa-solid fa-robot text-slate-500 text-xs"></i>'}
                        <span>${escapeHtml(d.name)}</span>
                    </td>
                    <td class="py-2.5 px-2 text-center text-slate-400">${d.wins || 0}</td>
                    <td class="py-2.5 px-2 text-center text-slate-400">${d.podiums || 0}</td>
                    <td class="py-2.5 px-2 text-center text-slate-400">${d.fastestLaps || 0}</td>
                    <td class="py-2.5 px-2 text-right font-black text-white">${d.points}</td>
                </tr>
            `).join('');
        }

        // Mostra cerimonia per default
        this.setChampionshipFinaleView('ceremony');

        finaleModal.classList.remove('hidden');
        finaleModal.classList.add('flex');
    },

    startConfettiCelebration() {
        this.stopConfettiCelebration();
        const canvas = document.getElementById('champ-confetti-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width || 800;
        canvas.height = rect.height || 600;

        const colors = [
            '#fbbf24', '#f59e0b', '#fef08a', '#e2e8f0', '#94a3b8',
            '#06b6d4', '#22d3ee', '#10b981', '#ec4899', '#f43f5e'
        ];

        const count = 120;
        const particles = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * -canvas.height * 0.8,
                w: Math.random() * 8 + 4,
                h: Math.random() * 6 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                speedY: Math.random() * 2.5 + 1.8,
                speedX: (Math.random() - 0.5) * 2.2,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.12,
            });
        }

        const startTime = performance.now();
        const maxDuration = 7000;

        const loop = (now) => {
            const elapsed = now - startTime;
            if (elapsed > maxDuration) {
                this.stopConfettiCelebration();
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const fade = elapsed > 5000 ? Math.max(0, 1 - (elapsed - 5000) / 2000) : 1;

            particles.forEach((p) => {
                p.y += p.speedY;
                p.x += Math.sin(p.y * 0.02) * 1.2 + p.speedX;
                p.rot += p.rotSpeed;

                if (p.y > canvas.height + 10) {
                    p.y = -10;
                    p.x = Math.random() * canvas.width;
                }

                ctx.save();
                ctx.globalAlpha = fade;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });

            this.confettiAnimId = requestAnimationFrame(loop);
        };

        this.confettiAnimId = requestAnimationFrame(loop);
    },

    stopConfettiCelebration() {
        if (this.confettiAnimId) {
            cancelAnimationFrame(this.confettiAnimId);
            this.confettiAnimId = null;
        }
        const canvas = document.getElementById('champ-confetti-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    },

    setChampionshipFinaleView(viewType) {
        const ceremonyView = document.getElementById('champ-finale-ceremony-view');
        const tableView = document.getElementById('champ-finale-table-view');
        const btnCeremony = document.getElementById('btn-finale-view-ceremony');
        const btnTable = document.getElementById('btn-finale-view-table');

        if (!ceremonyView || !tableView) return;

        if (viewType === 'table') {
            ceremonyView.classList.add('hidden');
            tableView.classList.remove('hidden');
            if (btnCeremony) {
                btnCeremony.className = 'px-3 py-1.5 rounded-lg font-racing text-xs font-bold transition flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:text-white cursor-pointer';
            }
            if (btnTable) {
                btnTable.className = 'px-3 py-1.5 rounded-lg font-racing text-xs font-bold transition flex items-center gap-1.5 bg-amber-400 text-slate-950 cursor-pointer';
            }
        } else {
            ceremonyView.classList.remove('hidden');
            tableView.classList.add('hidden');
            if (btnCeremony) {
                btnCeremony.className = 'px-3 py-1.5 rounded-lg font-racing text-xs font-bold transition flex items-center gap-1.5 bg-amber-400 text-slate-950 cursor-pointer';
            }
            if (btnTable) {
                btnTable.className = 'px-3 py-1.5 rounded-lg font-racing text-xs font-bold transition flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:text-white cursor-pointer';
            }
        }
    },

    claimChampionshipRewardsAndExit() {
        this.stopConfettiCelebration();
        const modal = document.getElementById('modal-championship-finale');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        if (typeof ChampionshipEngine !== "undefined") {
            ChampionshipEngine.resetChampionship();
        }

        if (typeof RaceEngine !== "undefined") {
            RaceEngine.quitToMenu();
        }

        this.switchTab('championship');
        this.showToast("Campionato completato con successo!", "success");
    }
};