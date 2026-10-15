"use strict";

// =========================================================================
// 8. INTERFACCIA UTENTE E ROUTING SCHERMATE (UI CONTROLLER)
// =========================================================================
const UI = {
    currentTab: 'race',
    toastTimeout: null,

    init() {
        if (GameApp.profile && GameApp.profile.difficulty) {
            RaceEngine.difficulty = GameApp.profile.difficulty;
        }
        this.updateHeaderStats();
        this.updateDifficultyUI();
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
        [2, 3].forEach(l => {
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

    updateHeaderStats() {
        const p = GameApp.profile;
        document.getElementById('header-credits').textContent = p.credits.toLocaleString('it-IT');
        document.getElementById('header-garage-count').textContent = p.ownedCars.length;

        let totalTrophies = 0;
        Object.values(p.records || {}).forEach(r => {
            totalTrophies += (r.trophies || 0);
        });
        document.getElementById('header-trophies').textContent = totalTrophies;

        const activeCar = CAR_CATALOG.find(c => c.id === p.equippedCar);
        document.getElementById('header-active-car').textContent = activeCar ? activeCar.name : 'Nessuna Vettura';
        document.getElementById('header-active-car').className = activeCar
            ? 'text-xs font-racing font-bold text-cyan-300 leading-tight mt-0.5'
            : 'text-xs font-bold text-rose-400 leading-tight mt-0.5';

        const readyName = document.getElementById('race-ready-car-name');
        const readySpecs = document.getElementById('race-ready-car-specs');
        const btnQuick = document.getElementById('btn-quick-dealer');
        if (activeCar) {
            readyName.textContent = activeCar.name;
            readyName.className = 'font-racing font-bold text-xs sm:text-sm text-emerald-400';
            readySpecs.textContent = `${activeCar.drivetrain} • ${activeCar.topSpeedKmh} km/h`;
            btnQuick.textContent = 'CAMBIA AUTO';
        } else {
            readyName.textContent = 'Garage Vuoto';
            readyName.className = 'font-racing font-bold text-xs sm:text-sm text-amber-400';
            readySpecs.textContent = 'Budget iniziale: Cr. 15.000';
            btnQuick.textContent = 'COMPRA AUTO';
        }
    },

    switchTab(tab) {
        this.currentTab = tab;
        AudioEngine.playUIClick();

        ['race', 'freeplay', 'dealership', 'garage', 'multiplayer'].forEach(t => {
            const el = document.getElementById(`tab-${t}`);
            if (el) el.classList.toggle('active', t === tab);
        });

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

        if (tab === 'race' || tab === 'freeplay') {
            screenTracks.classList.remove('hidden');
            screenTracks.classList.add('flex');
            screenShowroom.classList.add('hidden');
            screenShowroom.classList.remove('flex');
            this.renderTracksScreen(tab);
        } else if (tab === 'multiplayer') {
            screenTracks.classList.add('hidden');
            screenTracks.classList.remove('flex');
            screenShowroom.classList.add('hidden');
            screenShowroom.classList.remove('flex');
            this.updateLanLobbyUI();
        } else {
            screenTracks.classList.add('hidden');
            screenTracks.classList.remove('flex');
            screenShowroom.classList.remove('hidden');
            screenShowroom.classList.add('flex');
            this.renderShowroomUI();
        }
    },

    renderTracksScreen(mode) {
        const isRace = mode === 'race';
        document.getElementById('race-config-controls').style.display = isRace ? 'flex' : 'none';
        document.getElementById('mode-badge').textContent = isRace ? 'CAMPIONATO F1 / GT' : 'FREE ROAM & TELEMETRIA';
        document.getElementById('mode-badge').className = isRace
            ? 'px-2.5 py-0.5 rounded text-xs font-racing font-bold uppercase bg-amber-400 text-slate-950'
            : 'px-2.5 py-0.5 rounded text-xs font-racing font-bold uppercase bg-cyan-400 text-slate-950';
        document.getElementById('mode-title').textContent = isRace ? 'GRAN TURISMO GP WORLD SERIES' : 'FREE PLAY & TIME ATTACK F1';

        const allTracks = typeof TILE_TRACK_CATALOG !== "undefined"
            ? [...TRACK_CATALOG, ...TILE_TRACK_CATALOG]
            : TRACK_CATALOG;
        const grid = document.getElementById('tracks-grid');
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
                <div class="glass-panel rounded-2xl p-4 flex flex-col justify-between border border-white/10 hover:border-amber-400/50 transition group">
                    <div>
                        <div class="flex items-center justify-between text-[10px] font-racing uppercase tracking-wider">
                            <span class="px-2 py-0.5 rounded bg-white/10 text-amber-300 font-bold">${track.country}</span>
                            <span class="text-amber-400 font-bold"><i class="fa-solid fa-trophy mr-1"></i>${rec.trophies || 0}</span>
                        </div>

                        <h3 class="font-racing text-base sm:text-lg font-black text-white mt-2.5 group-hover:text-amber-400 transition">${track.name}</h3>
                        <p class="text-[11px] font-semibold text-cyan-400">${track.lengthKm} • ${track.elevationInfo}</p>
                        <p class="text-[11px] text-slate-300 mt-2 leading-relaxed line-clamp-3">${track.description}</p>

                        ${isRace ? `
                        <div class="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-white/5 space-y-1 text-[11px]">
                            <div class="flex items-center justify-between pb-1 mb-1 border-b border-white/5 text-[10px]">
                                <span class="text-slate-400">Difficoltà: <strong class="${diffConfig.colorClass}">${diffConfig.name}</strong></span>
                                <span class="font-racing font-bold text-amber-300">x${diffMult.toFixed(1)} Payout</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-amber-400 font-bold">1° Posto:</span>
                                <span class="font-racing font-bold text-white">Cr. ${p1.toLocaleString('it-IT')}</span>
                            </div>
                            <div class="flex justify-between text-slate-300">
                                <span>2° Posto:</span>
                                <span class="font-racing">Cr. ${p2.toLocaleString('it-IT')}</span>
                            </div>
                            <div class="flex justify-between text-slate-400">
                                <span>3° Posto:</span>
                                <span class="font-racing">Cr. ${p3.toLocaleString('it-IT')}</span>
                            </div>
                        </div>
                        ` : `
                        <div class="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-white/5 text-[11px]">
                            <span class="text-cyan-400 font-racing uppercase text-[10px]">Guida Libera</span>
                            <p class="text-slate-300 mt-0.5">Impara la traiettoria ideale e segna il giro record.</p>
                        </div>
                        `}

                        <div class="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/10">
                            <span>Best: <strong class="font-racing text-emerald-400">${bestLapStr}</strong></span>
                            <span>Piazz.: <strong class="font-racing text-white">${bestPosStr}</strong></span>
                        </div>
                    </div>

                    <button onclick="RaceEngine.startSession('${track.id}', '${mode}')" class="gt-btn gt-btn-gold mt-3.5 w-full py-2.5 rounded-xl font-racing font-bold text-xs uppercase tracking-wider ${isRace ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950' : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950'} flex items-center justify-center gap-1.5 shadow-lg">
                        <i class="fa-solid ${isRace ? 'fa-flag-checkered' : 'fa-gauge-high'}"></i>
                        <span>${isRace ? 'AVVIA GP' : 'FREE ROAM'}</span>
                    </button>
                </div>
            `;
        }).join('');
    },

    renderShowroomUI() {
        const isGarage = this.currentTab === 'garage';
        const ownedList = GameApp.profile.ownedCars;

        document.getElementById('showroom-subtitle').textContent = isGarage
            ? 'COLLEZIONE PERSONALE PILOTA'
            : 'AUTOSALONE UFFICIALE GT';
        document.getElementById('showroom-title').textContent = isGarage
            ? 'IL TUO GARAGE'
            : 'CONCESSIONARIO VETTURE';

        const carsToDisplay = isGarage
            ? CAR_CATALOG.filter(c => ownedList.includes(c.id))
            : CAR_CATALOG;

        const listContainer = document.getElementById('showroom-car-list');

        if (isGarage && carsToDisplay.length === 0) {
            listContainer.innerHTML = `
                <button onclick="UI.switchTab('dealership')" class="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-racing font-bold text-xs">
                    GARAGE VUOTO • VAI AL CONCESSIONARIO (Cr. 15.000 DISPONIBILI)
                </button>
            `;
        } else {
            if (isGarage && !ownedList.includes(GameApp.selectedCarId)) {
                GameApp.selectedCarId = carsToDisplay[0].id;
            }
            listContainer.innerHTML = carsToDisplay.map(c => {
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

        document.getElementById('car-tier-badge').textContent = car.tier;
        document.getElementById('car-owned-badge').classList.toggle('hidden', !isOwned);
        document.getElementById('car-name').textContent = car.name;
        document.getElementById('car-category').textContent = car.category;
        document.getElementById('car-desc').textContent = car.description;
        document.getElementById('car-drivetrain').textContent = car.drivetrain;
        document.getElementById('car-weight').textContent = `${car.weight.toLocaleString('it-IT')} kg`;
        document.getElementById('car-topspeed').textContent = `${car.topSpeedKmh} km/h`;
        document.getElementById('car-power').textContent = `${car.powerHP} CV`;
        document.getElementById('car-price-display').textContent = isOwned
            ? 'ACQUISTATA'
            : `Cr. ${car.price.toLocaleString('it-IT')}`;

        document.getElementById('stat-val-speed').textContent = `${(car.stats.speed / 10).toFixed(1)} / 10`;
        document.getElementById('stat-bar-speed').style.width = `${car.stats.speed}%`;

        document.getElementById('stat-val-accel').textContent = `${(car.stats.accel / 10).toFixed(1)} / 10`;
        document.getElementById('stat-bar-accel').style.width = `${car.stats.accel}%`;

        document.getElementById('stat-val-handling').textContent = `${(car.stats.handling / 10).toFixed(1)} / 10`;
        document.getElementById('stat-bar-handling').style.width = `${car.stats.handling}%`;

        document.getElementById('stat-val-braking').textContent = `${(car.stats.braking / 10).toFixed(1)} / 10`;
        document.getElementById('stat-bar-braking').style.width = `${car.stats.braking}%`;

        const btnBuy = document.getElementById('btn-buy-car');
        const btnEquip = document.getElementById('btn-equip-car');

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
        m.classList.remove('hidden');
        m.classList.add('flex');
    },

    closeResetModal() {
        const m = document.getElementById('modal-reset');
        m.classList.add('hidden');
        m.classList.remove('flex');
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
        document.getElementById('toast-text').textContent = message;
        document.getElementById('toast-icon').className = `fa-solid ${iconClass} text-amber-400`;

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
        const hostUrl = (ipInput && ipInput.value.trim()) || (window.location.hostname ? window.location.hostname + ':3000' : 'localhost:3000');
        const nickname = (nickInput && nickInput.value.trim()) || 'Pilota LAN';

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
        }
        this.updateLanLobbyUI();
    },

    setLanCar(carId) {
        AudioEngine.playUIClick();
        NetworkEngine.selectedCarId = carId;
        if (NetworkEngine.isConnected) {
            NetworkEngine.sendProfileUpdate({ carId: carId });
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
            NetworkEngine.sendRoomUpdate({ laps: laps });
        }
        this.updateLanLobbyUI();
    },

    startLanRace() {
        if (!NetworkEngine.isConnected) return;
        AudioEngine.playUIClick();
        const trackSelect = document.getElementById('lan-track-select');
        const trackId = (trackSelect && trackSelect.value) || NetworkEngine.selectedTrackId || 'monza';
        const laps = NetworkEngine.selectedLaps || 3;
        NetworkEngine.send({
            type: 'start_race',
            trackId: trackId,
            laps: laps,
            countdownDuration: 4.5,
        });
        UI.showToast("Avvio gara inviato a tutti i piloti...", "fa-flag-checkered");
    },

    updateLanPingDisplay(ping) {
        const pingEl = document.getElementById('lan-ping-val');
        if (!pingEl) return;
        pingEl.textContent = `${ping} ms`;
        if (ping < 35) {
            pingEl.className = 'font-racing font-bold text-emerald-400';
        } else if (ping < 90) {
            pingEl.className = 'font-racing font-bold text-amber-400';
        } else {
            pingEl.className = 'font-racing font-bold text-rose-400';
        }
    },

    updateLanLobbyUI() {
        const isConn = NetworkEngine.isConnected;
        const isHost = NetworkEngine.isHost;
        const btnConn = document.getElementById('btn-lan-connect');
        const btnDisconn = document.getElementById('btn-lan-disconnect');
        const statusBox = document.getElementById('lan-status-box');
        const roomInfoBar = document.getElementById('lan-room-info-bar');
        const hostControls = document.getElementById('lan-host-controls');
        const guestControls = document.getElementById('lan-guest-controls');
        const playersListEl = document.getElementById('lan-players-grid');

        if (btnConn) btnConn.style.display = isConn ? 'none' : 'flex';
        if (btnDisconn) btnDisconn.style.display = isConn ? 'flex' : 'none';

        if (statusBox) {
            statusBox.innerHTML = isConn
                ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-racing font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    ONLINE LAN ${isHost ? '• HOST' : '• OSPITE'}
                   </span>`
                : `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-racing font-bold bg-slate-800 text-slate-400 border border-white/10">
                    <span class="w-2 h-2 rounded-full bg-slate-500"></span>
                    OFFLINE
                   </span>`;
        }

        // Recupera nome del circuito scelto
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

        // Barra informativa stanza in alto
        if (roomInfoBar) {
            if (isConn) {
                roomInfoBar.classList.remove('hidden');
                roomInfoBar.classList.add('flex');
                const hostDisplay = document.getElementById('lan-room-host-display');
                if (hostDisplay) {
                    hostDisplay.innerHTML = `${hostName} ${isHost ? '<span class="text-xs text-amber-400 font-normal ml-1">(TU)</span>' : ''}`;
                }
                const trackDisplay = document.getElementById('lan-room-track-display');
                if (trackDisplay) trackDisplay.textContent = trackTitle;
                const lapsDisplay = document.getElementById('lan-room-laps-display');
                if (lapsDisplay) lapsDisplay.textContent = `${NetworkEngine.selectedLaps} Giri`;
            } else {
                roomInfoBar.classList.add('hidden');
                roomInfoBar.classList.remove('flex');
            }
        }

        // Mostra controlli Host solo all'Host, altrimenti mostra Guest panel
        if (hostControls) {
            hostControls.style.display = (isConn && isHost) ? 'block' : 'none';
            if (isConn && isHost) {
                const trackSelect = document.getElementById('lan-track-select');
                if (trackSelect && trackSelect.value !== NetworkEngine.selectedTrackId) {
                    trackSelect.value = NetworkEngine.selectedTrackId;
                }
                [2, 3, 5].forEach(l => {
                    const btn = document.getElementById(`lan-laps-btn-${l}`);
                    if (btn) {
                        btn.className = (l === NetworkEngine.selectedLaps)
                            ? 'flex-1 py-1 rounded bg-amber-400 text-slate-950 font-racing font-bold text-xs'
                            : 'flex-1 py-1 rounded bg-slate-800 text-slate-300 font-racing font-bold text-xs';
                    }
                });
            }
        }

        if (guestControls) {
            guestControls.style.display = (isConn && !isHost) ? 'block' : 'none';
            if (isConn && !isHost) {
                const guestHostName = document.getElementById('lan-guest-host-name');
                if (guestHostName) guestHostName.textContent = hostName;
                const guestTrackName = document.getElementById('lan-guest-track-name');
                if (guestTrackName) guestTrackName.textContent = trackTitle;
                const guestLapsCount = document.getElementById('lan-guest-laps-count');
                if (guestLapsCount) guestLapsCount.textContent = `${NetworkEngine.selectedLaps} GIRI`;
            }
        }

        // Aggiorna indicatore colore selezionato
        const colors = ['#00f0ff', '#ff3b1f', '#facc15', '#10b981', '#a855f7', '#f97316'];
        colors.forEach(col => {
            const btn = document.getElementById(`lan-color-${col.replace('#', '')}`);
            if (btn) {
                btn.style.outline = (col.toLowerCase() === NetworkEngine.selectedColor.toLowerCase())
                    ? '3px solid white' : 'none';
            }
        });

        // Aggiorna lista dei piloti connessi
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

            // Costruisci lista unificata garantendo che 'TU' sia presente con i dati attuali
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

            const allList = Object.values(map);
            const countEl = document.getElementById('lan-players-count');
            if (countEl) countEl.textContent = allList.length;

            // Ordina: prima l'Host, poi 'TU', poi gli altri piloti
            allList.sort((a, b) => {
                if (a.id === NetworkEngine.hostId) return -1;
                if (b.id === NetworkEngine.hostId) return 1;
                if (a.id === NetworkEngine.myPlayerId) return -1;
                if (b.id === NetworkEngine.myPlayerId) return 1;
                return a.name.localeCompare(b.name);
            });

            playersListEl.innerHTML = allList.map(p => {
                const car = CAR_CATALOG.find(c => c.id === p.carId) || CAR_CATALOG[0];
                const playerIsHost = (p.id === NetworkEngine.hostId);
                const playerIsMe = (p.id === NetworkEngine.myPlayerId);

                const cardBorder = playerIsHost
                    ? 'border-amber-400/80 bg-gradient-to-r from-amber-500/15 via-slate-900/90 to-slate-900/90 shadow-lg shadow-amber-500/10'
                    : (playerIsMe ? 'border-cyan-400/60 bg-cyan-950/20' : 'border-white/10 bg-slate-900/70');

                return `
                    <div class="glass-panel p-3 sm:p-3.5 rounded-2xl border ${cardBorder} flex items-center justify-between gap-3 transition">
                        <div class="flex items-center gap-3">
                            <div class="w-11 h-11 rounded-xl flex items-center justify-center font-racing font-bold text-slate-950 text-base shadow-md shrink-0 relative" style="background-color: ${p.color || '#00f0ff'}; border: 2px solid rgba(255,255,255,0.4)">
                                <i class="fa-solid fa-car-side"></i>
                                ${playerIsHost ? '<span class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] shadow"><i class="fa-solid fa-crown"></i></span>' : ''}
                            </div>
                            <div>
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="font-racing font-black text-xs sm:text-sm text-white">${p.name}</span>
                                    ${playerIsHost ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-racing font-black bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 flex items-center gap-1 shadow-sm"><i class="fa-solid fa-crown text-[8px]"></i>HOST</span>' : ''}
                                    ${playerIsMe ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-racing font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">TU</span>' : ''}
                                    ${!playerIsHost && !playerIsMe ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-racing font-bold bg-slate-800 text-slate-400 border border-white/10">PILOTA</span>' : ''}
                                </div>
                                <div class="flex items-center gap-2 mt-0.5">
                                    <span class="text-xs font-semibold text-slate-300">${car.name}</span>
                                    <span class="text-[10px] text-slate-400 font-racing">(${car.driveCode || 'RWD'})</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1 shrink-0">
                            <div class="flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full ${playerIsHost ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse"></span>
                                <span class="text-[10px] font-racing font-bold ${playerIsHost ? 'text-amber-300' : 'text-emerald-400'}">${playerIsHost ? 'HOST' : 'PRONTO'}</span>
                            </div>
                            <span class="text-[10px] font-racing text-slate-400 font-mono">${playerIsMe ? (NetworkEngine.ping || 0) + ' ms' : '<i class="fa-solid fa-wifi text-[9px] text-emerald-400 mr-1"></i>LAN'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
};