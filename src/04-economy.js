/* ============================================================
   04-economy.js — All numeric formulas in one place.
   Pure functions operating on (state, DATA) -> numbers.
   Keeping formulas centralized avoids drift/duplication bugs.
   ============================================================ */
(function (G) {
  "use strict";
  const D = G.DATA;

  // ---- Tech tree effect aggregation -----------------------------------
  function techEffects(state) {
    const eff = {
      globalOutputMult: 0,
      globalSpeedMult: 0,
      critChanceAdd: 0,
      powerDiscount: 0,
      collectorSpeedMult: 0,
      rndRateMult: 0,
      upgradeDiscount: 0,
      offlineCapAdd: 0,
      machineCostDiscount: 0,
      startingMoneyMult: 0,
      prestigeGainMult: 0,
    };
    Object.keys(state.prestige.tech).forEach((id) => {
      if (!state.prestige.tech[id]) return;
      const t = D.techById(id);
      if (!t) return;
      const e = t.effect;
      if (eff[e.type] !== undefined) eff[e.type] += e.value;
    });
    return eff;
  }

  // ---- Machine placement cost: scales with how many of that tier are
  // already placed anywhere in the factory (global count per tier). ----
  function tierPlacedCount(state, tierId) {
    let n = 0;
    state.zones.forEach((z) => z.floors.forEach((f) => f.grid.forEach((s) => {
      if (s.machine && s.machine.tierId === tierId) n++;
    })));
    return n;
  }

  function machineCost(state, tierId) {
    const tier = D.tierById(tierId);
    const n = tierPlacedCount(state, tierId);
    const eff = techEffects(state);
    const raw = tier.baseCost * Math.pow(tier.costGrowth, n);
    return Math.ceil(raw * (1 - Math.min(0.6, eff.machineCostDiscount)));
  }

  function tierUnlocked(state, tierId) {
    const tier = D.tierById(tierId);
    if (!tier.unlockRequirement) return true;
    const req = tier.unlockRequirement;
    if (req.type === "money") return state.lifetimeEarned >= req.amount;
    if (req.type === "prestige") return state.prestige.count >= req.amount;
    return false;
  }

  // ---- Per-machine-instance upgrade costs/effects ----------------------
  function upgradeCost(upgradeId, currentLevel, state) {
    const u = D.UPGRADES[upgradeId];
    const eff = techEffects(state);
    const raw = u.baseCost * Math.pow(u.costGrowth, currentLevel);
    return Math.ceil(raw * (1 - Math.min(0.5, eff.upgradeDiscount)));
  }

  function machineCooldown(machine, state) {
    const tier = D.tierById(machine.tierId);
    const eff = techEffects(state);
    const speedLvl = machine.levels.speed;
    const reduction = 1 - Math.min(0.75, D.UPGRADES.speed.effectPerLevel * speedLvl + eff.globalSpeedMult);
    return Math.max(0.15, tier.baseCooldown * reduction);
  }

  function machineBaseYield(machine, floorMult, state) {
    const tier = D.tierById(machine.tierId);
    const eff = techEffects(state);
    const outputLvl = machine.levels.output;
    const outputMult = 1 + D.UPGRADES.output.effectPerLevel * outputLvl + eff.globalOutputMult;
    return tier.baseYield * outputMult * floorMult;
  }

  function machineCritChance(machine, state) {
    const tier = D.tierById(machine.tierId);
    const eff = techEffects(state);
    const inkLvl = machine.levels.ink;
    return Math.min(0.6, tier.critChance + D.UPGRADES.ink.effectPerLevel * inkLvl + eff.critChanceAdd);
  }

  function machineCritMult(machine) {
    const tier = D.tierById(machine.tierId);
    const inkLvl = machine.levels.ink;
    return tier.critMult + 0.15 * inkLvl;
  }

  // ---- Floor-level systems ----------------------------------------------
  function floorOutputMult(floor) {
    const lvl = floor.systems.conveyor;
    return 1 + D.FLOOR_SYSTEMS.conveyor.effectPerLevel * lvl;
  }

  function floorSystemCost(systemId, currentLevel, state) {
    const def = D.FLOOR_SYSTEMS[systemId];
    const eff = techEffects(state);
    let raw = def.baseCost * Math.pow(def.costGrowth, currentLevel);
    return Math.ceil(raw);
  }

  function collectorTickSeconds(floor, state) {
    // higher collector level -> faster sweep interval
    const lvl = floor.systems.collector;
    const eff = techEffects(state);
    if (lvl <= 0) return null; // no auto collection
    const base = Math.max(0.4, 3.0 - 0.4 * lvl);
    return base * (1 - Math.min(0.5, eff.collectorSpeedMult));
  }

  // ---- Rooms --------------------------------------------------------------
  function roomCost(roomId, currentLevel) {
    const def = D.ROOMS[roomId];
    return Math.ceil(def.baseCost * Math.pow(def.costGrowth, currentLevel));
  }

  function rndRatePerSec(state) {
    const lvl = state.rooms.rnd.level;
    if (lvl <= 0) return 0;
    const def = D.ROOMS.rnd;
    const eff = techEffects(state);
    return (def.baseRatePerSec + def.ratePerLevel * (lvl - 1)) * (1 + eff.rndRateMult);
  }

  function vaultOfflineCapHours(state) {
    const lvl = state.rooms.vault.level;
    const def = D.ROOMS.vault;
    const eff = techEffects(state);
    const base = lvl <= 0 ? 1 : def.baseOfflineCapHours + def.offlineCapPerLevel * (lvl - 1);
    return base + eff.offlineCapAdd;
  }

  function vaultInterestPerHour(state) {
    const lvl = state.rooms.vault.level;
    if (lvl <= 0) return 0;
    const def = D.ROOMS.vault;
    return def.baseInterestPerHour + def.interestPerLevel * lvl;
  }

  function powerCapacity(state) {
    const lvl = state.rooms.power.level;
    const def = D.ROOMS.power;
    if (lvl <= 0) return 0;
    return def.basePower + def.powerPerLevel * (lvl - 1);
  }

  function powerDemand(state) {
    const eff = techEffects(state);
    const discount = 1 - Math.min(0.4, eff.powerDiscount);
    let demand = 0;
    state.zones.forEach((z) => z.floors.forEach((f) => {
      if (f.systems.collector > 0) demand += D.POWER_COST_COLLECTOR * discount;
    }));
    return demand;
  }

  function powerOk(state) {
    return powerDemand(state) <= powerCapacity(state) + 1e-9;
  }

  // ---- Prestige ------------------------------------------------------------
  // First rebirth requires 2M max cash held in the current run. Each later rebirth
  // requires 2.5x the previous peak-cash threshold.
  function prestigeRequirement(state) {
    return D.PRESTIGE.minMaxMoneyToUnlock * Math.pow(2.5, state.prestige.count);
  }

  function prestigeUnlocked(state) {
    return state.maxMoney >= prestigeRequirement(state);
  }

  function prestigeGain(state) {
    const eff = techEffects(state);
    const base = Math.floor(Math.sqrt(state.maxMoney / D.PRESTIGE.divisor));
    return Math.max(0, Math.floor(base * (1 + eff.prestigeGainMult)));
  }

  function techCostAffordable(state, tech) {
    return state.prestige.perkPoints >= tech.cost && state.research >= tech.researchCost;
  }
  function techPurchaseReason(state, tech) {
    if (state.prestige.perkPoints < tech.cost) return "points";
    if (state.research < tech.researchCost) return "research";
    return null;
  }

  function techRequirementsMet(state, tech) {
    return tech.requires.every((r) => !!state.prestige.tech[r]);
  }

  // ---- Formatting -----------------------------------------------------------
  const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  function formatMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return "0";
    const sign = n < 0 ? "-" : "";
    n = Math.abs(n);
    if (n < 1000) return sign + (Math.floor(n * 100) / 100).toString();
    let tier = 0;
    while (n >= 1000 && tier < SUFFIXES.length - 1) { n /= 1000; tier++; }
    if (tier === SUFFIXES.length - 1 && n >= 1000) return sign + n.toExponential(2).replace("e+", "e");
    const decimals = n < 10 ? 2 : n < 100 ? 1 : 0;
    const fixed = parseFloat(n.toFixed(decimals)); // trims trailing zeros (1.50 -> 1.5, 2.00 -> 2)
    return sign + fixed + SUFFIXES[tier];
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  G.Econ = {
    techEffects, tierPlacedCount, machineCost, tierUnlocked,
    upgradeCost, machineCooldown, machineBaseYield, machineCritChance, machineCritMult,
    floorOutputMult, floorSystemCost, collectorTickSeconds,
    roomCost, rndRatePerSec, vaultOfflineCapHours, vaultInterestPerHour,
    powerCapacity, powerDemand, powerOk,
    prestigeRequirement, prestigeUnlocked, prestigeGain, techCostAffordable, techPurchaseReason, techRequirementsMet,
    formatMoney, formatTime,
  };
})(window.Game = window.Game || {});
