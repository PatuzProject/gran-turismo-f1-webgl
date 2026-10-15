"use strict";

// =========================================================================
// 2. GESTIONE SALVATAGGIO LOCALSTORAGE (GRAN TURISMO PROGRESSION)
// =========================================================================
const StorageManager = {
    STORAGE_KEY: 'gt_webgl_f1_sim_save_v2',

    getDefaultProfile() {
        const records = {};
        TRACK_CATALOG.forEach(t => {
            records[t.id] = { bestLap: null, bestPos: null, trophies: 0 };
        });
        return {
            credits: 15000000,
            ownedCars: [],
            equippedCar: null,
            difficulty: 'medium',
            records: records
        };
    },

    load() {
        try {
            // Check v2 or migrate from v1 if present
            const raw = localStorage.getItem(this.STORAGE_KEY) || localStorage.getItem('gt_webgl_sim_save_v1');
            if (!raw) return this.getDefaultProfile();
            const parsed = JSON.parse(raw);
            const def = this.getDefaultProfile();
            return {
                credits: typeof parsed.credits === 'number' ? parsed.credits : def.credits,
                ownedCars: Array.isArray(parsed.ownedCars) ? parsed.ownedCars : def.ownedCars,
                equippedCar: parsed.equippedCar || null,
                difficulty: typeof parsed.difficulty === 'string' ? parsed.difficulty : def.difficulty,
                records: { ...def.records, ...(parsed.records || {}) }
            };
        } catch (e) {
            return this.getDefaultProfile();
        }
    },

    save(profile) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));
        } catch (e) {
            console.warn('Impossibile salvare in localStorage:', e);
        }
    },

    reset() {
        const fresh = this.getDefaultProfile();
        this.save(fresh);
        return fresh;
    }
};