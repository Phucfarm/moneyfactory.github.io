/* ============================================================
   02-state.js — Single source of truth for all game state.
   Every system (economy, factory, prestige, save, ui) reads and
   mutates THIS object. No system keeps its own duplicated copy.
   ============================================================ */
(function (G) {
  "use strict";
  const D = G.DATA;

  const SAVE_VERSION = 1;

  function makeEmptyGrid() {
    const slots = [];
    for (let r = 0; r < D.GRID_ROWS; r++) {
      for (let c = 0; c < D.GRID_COLS; c++) {
        slots.push({
          r, c,
          machine: null, // { typeId, tierId, levels: {speed,output,ink,auto}, progress: 0..1, lastCollectAmount }
        });
      }
    }
    return slots;
  }

  function makeFloor(floorDef) {
    return {
      id: floorDef.id,
      unlocked: !floorDef.unlock,
      grid: makeEmptyGrid(),
      systems: {
        conveyor: 0,
        collector: 0,
      },
    };
  }

  function makeZone(zoneDef) {
    return {
      id: zoneDef.id,
      unlocked: !zoneDef.unlock,
      floors: zoneDef.floors.map(makeFloor),
    };
  }

  function defaultState() {
    return {
      saveVersion: SAVE_VERSION,
      createdAt: Date.now(),
      lastSaveTime: Date.now(),
      lastActiveTime: Date.now(),

      money: 50,
      totalEarned: 0,       // this prestige run (resets on rebirth)
      lifetimeEarned: 0,    // total cash ever granted; used for lifetime unlocks/stats only
      maxMoney: 50,         // highest cash balance ever reached in the current run

      research: 0,          // research points from R&D room; spent on Tech Tree purchases
      offlinePending: null, // persisted offline reward waiting for player claim

      currentZoneId: D.ZONES[0].id,
      currentFloorId: D.ZONES[0].floors[0].id,
      zones: D.ZONES.map(makeZone),

      rooms: {
        rnd: { level: 0 },
        vault: { level: 0 },
        power: { level: 0 },
      },

      prestige: {
        count: 0,
        perkPoints: 0,
        tech: {}, // techId -> true
      },

      settings: {
        lang: "en",
        music: true,
        sfx: true,
        musicVolume: 0.35,
        sfxVolume: 0.7,
      },

      camera: { x: 0, y: 0, zoom: 1 },

      selectedTierId: "common",

      stats: {
        totalClicks: 0,
        totalMachinesPlaced: 0,
        totalUpgradesBought: 0,
        playTimeSeconds: 0,
      },
    };
  }

  // ---- Defensive merge: fills in any missing/invalid fields from a
  // loaded save with sensible defaults so corrupt/partial saves never
  // crash the game (spec section 23).
  function sanitizeState(loaded) {
    const base = defaultState();
    if (!loaded || typeof loaded !== "object") return base;

    const out = base;
    try {
      if (typeof loaded.money === "number" && isFinite(loaded.money) && loaded.money >= 0) out.money = loaded.money;
      if (typeof loaded.totalEarned === "number" && isFinite(loaded.totalEarned)) out.totalEarned = Math.max(0, loaded.totalEarned);
      if (typeof loaded.lifetimeEarned === "number" && isFinite(loaded.lifetimeEarned)) out.lifetimeEarned = Math.max(0, loaded.lifetimeEarned);
      if (typeof loaded.maxMoney === "number" && isFinite(loaded.maxMoney)) out.maxMoney = Math.max(0, loaded.maxMoney);
      out.maxMoney = Math.max(out.maxMoney, out.money);
      if (typeof loaded.research === "number" && isFinite(loaded.research)) out.research = Math.max(0, loaded.research);
      if (loaded.offlinePending && typeof loaded.offlinePending === "object") {
        const p = loaded.offlinePending;
        const finite = (v) => typeof v === "number" && isFinite(v);
        if (finite(p.amount) && p.amount >= 0 && finite(p.production) && p.production >= 0 && finite(p.interestGained) && p.interestGained >= 0 && finite(p.researchGained) && p.researchGained >= 0 && finite(p.cappedSeconds) && p.cappedSeconds >= 0 && finite(p.capHours) && p.capHours >= 0 && finite(p.elapsedSeconds) && p.elapsedSeconds >= 0) {
          out.offlinePending = {
            amount: p.amount,
            production: p.production,
            interestGained: p.interestGained,
            researchGained: p.researchGained,
            cappedSeconds: p.cappedSeconds,
            capHours: p.capHours,
            wasCapped: !!p.wasCapped,
            elapsedSeconds: p.elapsedSeconds,
          };
        }
      }
      if (typeof loaded.lastSaveTime === "number" && isFinite(loaded.lastSaveTime) && loaded.lastSaveTime >= 0) out.lastSaveTime = loaded.lastSaveTime;
      if (typeof loaded.lastActiveTime === "number" && isFinite(loaded.lastActiveTime) && loaded.lastActiveTime >= 0) out.lastActiveTime = loaded.lastActiveTime;
      if (typeof loaded.createdAt === "number" && isFinite(loaded.createdAt) && loaded.createdAt >= 0) out.createdAt = loaded.createdAt;

      if (loaded.settings && typeof loaded.settings === "object") {
        if (loaded.settings.lang === "en" || loaded.settings.lang === "vi") out.settings.lang = loaded.settings.lang;
        if (typeof loaded.settings.music === "boolean") out.settings.music = loaded.settings.music;
        if (typeof loaded.settings.sfx === "boolean") out.settings.sfx = loaded.settings.sfx;
        if (typeof loaded.settings.musicVolume === "number") out.settings.musicVolume = clamp01(loaded.settings.musicVolume);
        if (typeof loaded.settings.sfxVolume === "number") out.settings.sfxVolume = clamp01(loaded.settings.sfxVolume);
      }

      if (loaded.prestige && typeof loaded.prestige === "object") {
        if (typeof loaded.prestige.count === "number") out.prestige.count = Math.max(0, Math.floor(loaded.prestige.count));
        if (typeof loaded.prestige.perkPoints === "number") out.prestige.perkPoints = Math.max(0, Math.floor(loaded.prestige.perkPoints));
        if (loaded.prestige.tech && typeof loaded.prestige.tech === "object") {
          D.TECH_TREE.forEach((t) => {
            if (loaded.prestige.tech[t.id] && t.requires.every((req) => !!out.prestige.tech[req])) out.prestige.tech[t.id] = true;
          });
        }
      }

      if (loaded.rooms && typeof loaded.rooms === "object") {
        ["rnd", "vault", "power"].forEach((k) => {
          const def = D.ROOMS[k];
          const lvl = loaded.rooms[k] && loaded.rooms[k].level;
          if (typeof lvl === "number" && isFinite(lvl)) {
            out.rooms[k].level = Math.max(0, Math.min(def.maxLevel, Math.floor(lvl)));
          }
        });
      }

      if (typeof loaded.selectedTierId === "string" && D.tierById(loaded.selectedTierId)) {
        out.selectedTierId = loaded.selectedTierId;
      }

      if (loaded.camera && typeof loaded.camera === "object") {
        if (typeof loaded.camera.x === "number") out.camera.x = loaded.camera.x;
        if (typeof loaded.camera.y === "number") out.camera.y = loaded.camera.y;
        if (typeof loaded.camera.zoom === "number" && loaded.camera.zoom > 0) out.camera.zoom = clamp(loaded.camera.zoom, 0.5, 2.5);
      }

      if (typeof loaded.currentZoneId === "string" && D.zoneById(loaded.currentZoneId)) out.currentZoneId = loaded.currentZoneId;

      // Zones/floors/grid — merge by id, ignore anything unrecognized/corrupt.
      if (Array.isArray(loaded.zones)) {
        out.zones.forEach((zone) => {
          const lz = loaded.zones.find((z) => z && z.id === zone.id);
          if (!lz) return;
          if (typeof lz.unlocked === "boolean") zone.unlocked = lz.unlocked || zone.unlocked;
          if (Array.isArray(lz.floors)) {
            zone.floors.forEach((floor) => {
              const lf = lz.floors.find((f) => f && f.id === floor.id);
              if (!lf) return;
              if (typeof lf.unlocked === "boolean") floor.unlocked = lf.unlocked || floor.unlocked;
              if (lf.systems && typeof lf.systems === "object") {
                ["conveyor", "collector"].forEach((k) => {
                  const v = lf.systems[k];
                  if (typeof v === "number" && isFinite(v)) {
                    floor.systems[k] = Math.max(0, Math.floor(v));
                  }
                });
              }
              if (Array.isArray(lf.grid)) {
                floor.grid.forEach((slot) => {
                  const ls = lf.grid.find((s) => s && s.r === slot.r && s.c === slot.c);
                  if (!ls || !ls.machine) return;
                  const m = ls.machine;
                  if (typeof m.typeId === "string" && D.machineTypeById(m.typeId)) {
                    slot.machine = {
                      typeId: m.typeId,
                      // tierId is derived from the validated machine type so a corrupt/mismatched
                      // tier cannot enter the runtime state.
                      tierId: D.machineTypeById(m.typeId).tierId,
                      levels: {
                        speed: safeLevel(m.levels && m.levels.speed, D.UPGRADES.speed.maxLevel),
                        output: safeLevel(m.levels && m.levels.output, D.UPGRADES.output.maxLevel),
                        ink: safeLevel(m.levels && m.levels.ink, D.UPGRADES.ink.maxLevel),
                      },
                      progress: typeof m.progress === "number" && isFinite(m.progress) ? clamp01(m.progress) : 0,
                      banked: typeof m.banked === "number" && isFinite(m.banked) ? Math.max(0, m.banked) : 0,
                    };
                  }
                });
              }
              if (typeof lf.id === "string" && loaded.currentFloorId === lf.id) {
                // handled below
              }
            });
          }
        });
      }
      // Keep the active location valid and accessible.
      const activeZone = D.zoneById(out.currentZoneId);
      if (!activeZone) out.currentZoneId = D.ZONES[0].id;
      else if (!out.zones.find((z) => z.id === out.currentZoneId && z.unlocked)) {
        const fallback = out.zones.find((z) => z.unlocked);
        out.currentZoneId = fallback ? fallback.id : D.ZONES[0].id;
      }
      const activeZoneState = out.zones.find((z) => z.id === out.currentZoneId);
      const requestedFloor = typeof loaded.currentFloorId === "string" ? loaded.currentFloorId : null;
      if (activeZoneState) {
        const wanted = activeZoneState.floors.find((f) => f.id === requestedFloor && f.unlocked);
        const fallbackFloor = activeZoneState.floors.find((f) => f.unlocked);
        out.currentFloorId = wanted ? wanted.id : (fallbackFloor ? fallbackFloor.id : D.ZONES.find((z) => z.id === out.currentZoneId).floors[0].id);
      }

      out.lifetimeEarned = Math.max(out.lifetimeEarned, out.totalEarned);
      out.maxMoney = Math.max(out.maxMoney, out.money);

      if (loaded.stats && typeof loaded.stats === "object") {
        Object.keys(out.stats).forEach((k) => {
          if (typeof loaded.stats[k] === "number" && isFinite(loaded.stats[k])) out.stats[k] = Math.max(0, loaded.stats[k]);
        });
      }
    } catch (e) {
      console.error("Save sanitize error, falling back to safe defaults for affected fields:", e);
    }
    return out;
  }

  function safeLevel(v, max) {
    if (typeof v !== "number" || !isFinite(v) || v < 0) return 0;
    return Math.min(max, Math.floor(v));
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function clamp01(v) { return clamp(v, 0, 1); }

  G.State = {
    SAVE_VERSION,
    defaultState,
    sanitizeState,
    clamp,
    clamp01,
  };
})(window.Game = window.Game || {});
