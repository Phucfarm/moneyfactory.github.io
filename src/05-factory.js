/* ============================================================
   05-factory.js — Factory simulation: machines, conveyors,
   auto-collectors, zones/floors, rooms tick, and the
   offline-earnings simulation. This is the beating heart of the
   idle/active production loop.
   ============================================================ */
(function (G) {
  "use strict";
  const D = G.DATA;
  const E = G.Econ;

  // Runtime-only (non-persisted-critical) per-floor timers, keyed by floor id.
  const floorRuntime = {}; // { [floorId]: { collectorTimer, bonusTimer } }
  function rt(floorId) {
    if (!floorRuntime[floorId]) floorRuntime[floorId] = { collectorTimer: 0, bonusTimer: 3 + Math.random() * 6 };
    return floorRuntime[floorId];
  }

  function getZone(state, zoneId) { return state.zones.find((z) => z.id === zoneId); }
  function getFloor(state, zoneId, floorId) {
    const z = getZone(state, zoneId);
    return z ? z.floors.find((f) => f.id === floorId) : null;
  }
  function currentZone(state) { return getZone(state, state.currentZoneId); }
  function currentFloor(state) { return getFloor(state, state.currentZoneId, state.currentFloorId); }

  // ---- Placement / upgrades ---------------------------------------------
  function canPlaceMachine(state, slot) {
    return !slot.machine;
  }

  function placeMachine(state, zoneId, floorId, r, c, tierId) {
    const floor = getFloor(state, zoneId, floorId);
    if (!floor || !floor.unlocked) return { ok: false, reason: "floorLocked" };
    if (!E.tierUnlocked(state, tierId)) return { ok: false, reason: "tierLocked" };
    const slot = floor.grid.find((s) => s.r === r && s.c === c);
    if (!slot || slot.machine) return { ok: false, reason: "occupied" };
    const cost = E.machineCost(state, tierId);
    if (state.money < cost) return { ok: false, reason: "money", cost };
    state.money -= cost;
    const type = D.MACHINE_TYPES.find((m) => m.tierId === tierId);
    slot.machine = {
      typeId: type.id,
      tierId,
      levels: { speed: 0, output: 0, ink: 0 },
      progress: 0,
      banked: 0,
    };
    state.stats.totalMachinesPlaced++;
    return { ok: true, cost, tierId };
  }

  function upgradeMachine(state, zoneId, floorId, r, c, upgradeId) {
    const floor = getFloor(state, zoneId, floorId);
    if (!floor) return { ok: false };
    const slot = floor.grid.find((s) => s.r === r && s.c === c);
    if (!slot || !slot.machine) return { ok: false };
    const u = D.UPGRADES[upgradeId];
    if (!u) return { ok: false, reason: "invalid" };
    const cur = slot.machine.levels[upgradeId];
    if (cur >= u.maxLevel) return { ok: false, reason: "max" };
    const cost = E.upgradeCost(upgradeId, cur, state);
    if (state.money < cost) return { ok: false, reason: "money", cost };
    state.money -= cost;
    slot.machine.levels[upgradeId] = cur + 1;
    state.stats.totalUpgradesBought++;
    return { ok: true, cost, newLevel: cur + 1 };
  }

  // ---- Floor systems (conveyor / collector) ---------------------
  function buyFloorSystem(state, zoneId, floorId, systemId) {
    const floor = getFloor(state, zoneId, floorId);
    if (!floor) return { ok: false };
    const def = D.FLOOR_SYSTEMS[systemId];
    if (!def) return { ok: false, reason: "invalid" };
    const cur = floor.systems[systemId];
    if (cur >= def.maxLevel) return { ok: false, reason: "max" };
    const cost = E.floorSystemCost(systemId, cur, state);
    if (state.money < cost) return { ok: false, reason: "money", cost };
    // Power check for turning ON the collector (level 0 -> 1)
    if (systemId === "collector" && cur === 0) {
      const eff = E.techEffects(state);
      const discount = 1 - Math.min(0.4, eff.powerDiscount);
      const addedDemand = D.POWER_COST_COLLECTOR * discount;
      const demandAfter = E.powerDemand(state) + addedDemand;
      if (demandAfter > E.powerCapacity(state) + 1e-9) {
        return { ok: false, reason: "power" };
      }
    }
    state.money -= cost;
    floor.systems[systemId] = cur + 1;
    return { ok: true, cost, newLevel: cur + 1 };
  }

  // ---- Zones / floors unlocking -------------------------------------------
  function unlockZone(state, zoneId) {
    const zone = getZone(state, zoneId);
    const def = D.zoneById(zoneId);
    if (!zone || zone.unlocked) return { ok: false };
    if (!def.unlock) { zone.unlocked = true; return { ok: true }; }
    if (def.unlock.type === "money") {
      if (state.money < def.unlock.amount) return { ok: false, reason: "money", cost: def.unlock.amount };
      state.money -= def.unlock.amount;
      zone.unlocked = true;
      return { ok: true };
    }
    if (def.unlock.type === "prestige") {
      if (state.prestige.count < def.unlock.amount) return { ok: false, reason: "prestige" };
      zone.unlocked = true;
      return { ok: true };
    }
    return { ok: false };
  }

  function unlockFloor(state, zoneId, floorId) {
    const floor = getFloor(state, zoneId, floorId);
    const def = D.floorById(zoneId, floorId);
    if (!floor || floor.unlocked) return { ok: false };
    if (!def.unlock) { floor.unlocked = true; return { ok: true }; }
    if (def.unlock.type === "money") {
      if (state.money < def.unlock.amount) return { ok: false, reason: "money", cost: def.unlock.amount };
      state.money -= def.unlock.amount;
      floor.unlocked = true;
      return { ok: true };
    }
    return { ok: false };
  }

  // ---- Rooms -----------------------------------------------------------------
  function upgradeRoom(state, roomId) {
    const def = D.ROOMS[roomId];
    if (!def) return { ok: false, reason: "invalid" };
    const cur = state.rooms[roomId].level;
    if (cur >= def.maxLevel) return { ok: false, reason: "max" };
    const cost = E.roomCost(roomId, cur);
    if (state.money < cost) return { ok: false, reason: "money", cost };
    state.money -= cost;
    state.rooms[roomId].level = cur + 1;
    return { ok: true, cost, newLevel: cur + 1 };
  }

  // ---- Collection ---------------------------------------------------------
  function grantMoney(state, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    state.money += amount;
    state.maxMoney = Math.max(state.maxMoney, state.money);
    state.totalEarned += amount;
    state.lifetimeEarned += amount;
  }

  function collectMachine(state, zoneId, floorId, r, c) {
    const floor = getFloor(state, zoneId, floorId);
    if (!floor) return { amount: 0 };
    const slot = floor.grid.find((s) => s.r === r && s.c === c);
    if (!slot || !slot.machine || slot.machine.banked <= 0) return { amount: 0 };
    const amount = slot.machine.banked;
    slot.machine.banked = 0;
    grantMoney(state, amount);
    state.stats.totalClicks++;
    return { amount };
  }

  function collectFloor(state, zoneId, floorId) {
    const floor = getFloor(state, zoneId, floorId);
    if (!floor) return 0;
    let total = 0;
    floor.grid.forEach((s) => {
      if (s.machine && s.machine.banked > 0) { total += s.machine.banked; s.machine.banked = 0; }
    });
    grantMoney(state, total);
    return total;
  }

  function collectAllUnlocked(state) {
    let total = 0;
    state.zones.forEach((z) => { if (z.unlocked) z.floors.forEach((f) => { if (f.unlocked) total += collectFloor(state, z.id, f.id); }); });
    return total;
  }

  // ---- Core production tick (used by live loop, called every frame) --------
  // events: array the caller can push {type,...} onto for render/audio hooks.
  function tickFloor(state, zone, floor, dt, events) {
    const outMult = E.floorOutputMult(floor);
    const hasCollector = floor.systems.collector > 0;
    const r = rt(floor.id);

    floor.grid.forEach((slot) => {
      const m = slot.machine;
      if (!m) return;
      const cooldown = E.machineCooldown(m, state);
      m.progress += dt / cooldown;
      while (m.progress >= 1) {
        m.progress -= 1;
        let yieldAmt = E.machineBaseYield(m, outMult, state);
        let isCrit = Math.random() < E.machineCritChance(m, state);
        if (isCrit) yieldAmt *= E.machineCritMult(m);
        m.banked += yieldAmt;
        if (events) events.push({ type: "cycle", zoneId: zone.id, floorId: floor.id, r: slot.r, c: slot.c, amount: yieldAmt, crit: isCrit });
      }
    });

    if (hasCollector) {
      const tickSec = E.collectorTickSeconds(floor, state);
      r.collectorTimer += dt;
      if (tickSec && r.collectorTimer >= tickSec) {
        r.collectorTimer = 0;
        const total = collectFloor(state, zone.id, floor.id);
        if (total > 0 && events) events.push({ type: "autocollect", zoneId: zone.id, floorId: floor.id, amount: total });
      }
    }

    // Random bonus drop timer (only meaningful on the currently viewed floor,
    // but we run it for all unlocked floors so it's consistent with idle sim).
    r.bonusTimer -= dt;
    if (r.bonusTimer <= 0) {
      r.bonusTimer = 12 + Math.random() * 18;
      const occupied = floor.grid.filter((s) => s.machine);
      if (occupied.length > 0 && events) {
        const pick = occupied[Math.floor(Math.random() * occupied.length)];
        events.push({ type: "bonusReady", zoneId: zone.id, floorId: floor.id, r: pick.r, c: pick.c });
      }
    }
  }

  function tick(state, dt) {
    const events = [];
    state.zones.forEach((zone) => {
      if (!zone.unlocked) return;
      zone.floors.forEach((floor) => {
        if (!floor.unlocked) return;
        tickFloor(state, zone, floor, dt, events);
      });
    });
    // R&D research accrual
    const rndRate = E.rndRatePerSec(state);
    if (rndRate > 0) state.research += rndRate * dt;
    // Vault passive interest, applied continuously (per-hour rate -> per-second)
    const interestPerHour = E.vaultInterestPerHour(state);
    if (interestPerHour > 0 && state.money > 0) {
      grantMoney(state, state.money * (interestPerHour / 3600) * dt);
    }
    state.stats.playTimeSeconds += dt;
    return events;
  }

  // ---- Offline simulation ----------------------------------------------------
  // Deterministic closed-form estimate (not stepped) for performance & to
  // avoid needing to replay potentially many real-world hours tick by tick.
  function computeFloorMps(state, zone, floor) {
    const outMult = E.floorOutputMult(floor);
    let mps = 0;
    floor.grid.forEach((slot) => {
      const m = slot.machine;
      if (!m) return;
      const cooldown = E.machineCooldown(m, state);
      const avgYield = E.machineBaseYield(m, outMult, state) * (1 + E.machineCritChance(m, state) * (E.machineCritMult(m) - 1));
      mps += avgYield / cooldown;
    });
    // Offline mode is an abstract idle estimate: collectors improve cash conversion,
    // while manual floors still retain a reduced passive efficiency.
    const efficiency = floor.systems.collector > 0 ? 0.75 : 0.35;
    return mps * efficiency;
  }

  function simulateOfflineEarnings(state, elapsedSeconds) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return { amount: 0, production: 0, cappedSeconds: 0, capHours: E.vaultOfflineCapHours(state), researchGained: 0, interestGained: 0, wasCapped: false };
    const capHours = E.vaultOfflineCapHours(state);
    const cappedSeconds = Math.min(elapsedSeconds, capHours * 3600);

    let totalMps = 0;
    state.zones.forEach((zone) => {
      if (!zone.unlocked) return;
      zone.floors.forEach((floor) => {
        if (!floor.unlocked) return;
        totalMps += computeFloorMps(state, zone, floor);
      });
    });

    const production = totalMps * cappedSeconds;
    const interestPerHour = E.vaultInterestPerHour(state);
    const ratePerSecond = interestPerHour / 3600;
    const interestGained = interestPerHour > 0
      ? (state.money + totalMps / ratePerSecond) * Math.exp(ratePerSecond * cappedSeconds) - state.money - totalMps / ratePerSecond
      : 0;
    const researchGained = E.rndRatePerSec(state) * cappedSeconds;

    return {
      amount: production + interestGained,
      production,
      interestGained,
      researchGained,
      cappedSeconds,
      capHours,
      wasCapped: elapsedSeconds > cappedSeconds,
    };
  }

  function applyOfflineEarnings(state, result) {
    if (result.amount > 0) grantMoney(state, result.amount);
    if (result.researchGained > 0) state.research += result.researchGained;
  }

  // ---- Prestige (rebirth) -----------------------------------------------------
  function doPrestige(state) {
    if (!E.prestigeUnlocked(state)) return { ok: false };
    const gain = E.prestigeGain(state);
    const techKeep = state.prestige.tech;
    const eff = E.techEffects(state);

    const fresh = G.State.defaultState();
    fresh.settings = state.settings;
    fresh.prestige.count = state.prestige.count + 1;
    fresh.prestige.perkPoints = state.prestige.perkPoints + gain;
    fresh.prestige.tech = techKeep;
    fresh.money = 50 * (1 + eff.startingMoneyMult);
    fresh.maxMoney = fresh.money;
    fresh.lifetimeEarned = state.lifetimeEarned;
    fresh.research = state.research;
    fresh.selectedTierId = "common";
    fresh.stats = state.stats; // keep lifetime stats

    Object.keys(floorRuntime).forEach((k) => delete floorRuntime[k]);

    return { ok: true, gain, newState: fresh };
  }

  // ---- Tech tree purchase ---------------------------------------------------
  function buyTech(state, techId) {
    const tech = D.techById(techId);
    if (!tech) return { ok: false };
    if (state.prestige.tech[techId]) return { ok: false, reason: "owned" };
    if (!E.techRequirementsMet(state, tech)) return { ok: false, reason: "requires" };
    const purchaseReason = E.techPurchaseReason(state, tech);
    if (purchaseReason) return { ok: false, reason: purchaseReason };
    state.prestige.perkPoints -= tech.cost;
    state.research -= tech.researchCost;
    state.prestige.tech[techId] = true;
    return { ok: true };
  }

  G.Factory = {
    getZone, getFloor, currentZone, currentFloor,
    canPlaceMachine, placeMachine, upgradeMachine,
    buyFloorSystem, unlockZone, unlockFloor, upgradeRoom,
    collectMachine, collectFloor, collectAllUnlocked, grantMoney,
    tick, tickFloor,
    simulateOfflineEarnings, applyOfflineEarnings,
    doPrestige, buyTech,
    resetRuntime() { Object.keys(floorRuntime).forEach((k) => delete floorRuntime[k]); },
  };
})(window.Game = window.Game || {});
