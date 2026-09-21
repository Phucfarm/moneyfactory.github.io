/* ============================================================
   11-ui.js — All DOM/UI wiring. Reads from the shared game state
   and calls into Game.Factory to perform actions, then re-renders
   the affected DOM. Canvas rendering itself lives in 09-render.js.
   ============================================================ */
(function (G) {
  "use strict";
  const D = G.DATA;
  const E = G.Econ;
  const F = G.Factory;
  const T = () => G.i18n.t;

  let state = null;
  let els = {};
  let selectedSlotRef = null; // {r,c}
  let activePanel = null;
  let activeTechTab = "production";
  let onAfterAction = () => {};
  let onRequestPrestige = () => {};
  let onStateImported = () => {};

  function $(id) { return document.getElementById(id); }

  function init(initialState, opts) {
    state = initialState;
    onAfterAction = opts.onAfterAction || (() => {});
    onRequestPrestige = opts.onRequestPrestige || (() => {});
    onStateImported = opts.onStateImported || (() => {});

    els = {
      moneyVal: $("hud-money-val"),
      mpsVal: $("hud-mps-val"),
      researchVal: $("hud-research-val"),
      powerVal: $("hud-power-val"),
      powerWrap: $("hud-power-wrap"),
      zoneName: $("hud-zone-name"),
      floorName: $("hud-floor-name"),
      prestigeFlag: $("btn-prestige-flag"),
      zoneButtons: $("zone-buttons"),
      floorButtons: $("floor-buttons"),
      tierSelector: $("tier-selector"),
      machinePanel: $("machine-panel"),
      modalOverlay: $("modal-overlay"),
      modalContent: $("modal-content"),
      toastStack: $("toast-stack"),
      offlineModal: $("offline-modal"),
      drawer: $("mobile-drawer"),
      drawerToggle: $("drawer-toggle"),
      dotPrestige: $("dot-prestige"),
      dotTech: $("dot-tech"),
    };

    document.querySelectorAll(".menu-btn[data-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        G.Audio.unlock(); G.Audio.sfxClick();
        openPanel(btn.getAttribute("data-panel"));
      });
    });
    els.modalOverlay.addEventListener("click", (e) => { if (e.target === els.modalOverlay) closePanel(); });
    els.prestigeFlag.addEventListener("click", () => { G.Audio.sfxClick(); openPanel("prestige"); });
    els.drawerToggle.addEventListener("click", () => {
      els.drawer.classList.toggle("hidden");
      renderDrawer();
    });

    buildTierSelector();
    refreshAll();
  }

  function setState(newState) { state = newState; selectedSlotRef = null; refreshAll(); }

  // ---- Formatting helpers -----------------------------------------------------
  function money(n) { return "$" + E.formatMoney(n); }

  // ---- Toasts -------------------------------------------------------------------
  function toast(message, kind) {
    const el = document.createElement("div");
    el.className = "toast" + (kind === "warn" ? " warn" : "");
    el.textContent = message;
    els.toastStack.appendChild(el);
    setTimeout(() => el.remove(), 2800);
    while (els.toastStack.children.length > 4) els.toastStack.removeChild(els.toastStack.firstChild);
  }

  // ---- HUD ------------------------------------------------------------------------
  function computeMps() {
    let mps = 0;
    state.zones.forEach((z) => { if (!z.unlocked) return; z.floors.forEach((f) => {
      if (!f.unlocked) return;
      const outMult = E.floorOutputMult(f);
      f.grid.forEach((s) => {
        if (!s.machine) return;
        const cd = E.machineCooldown(s.machine, state);
        const avgYield = E.machineBaseYield(s.machine, outMult, state) * (1 + E.machineCritChance(s.machine, state) * (E.machineCritMult(s.machine) - 1));
        mps += avgYield / cd;
      });
    }); });
    return mps;
  }

  function refreshHUD() {
    els.moneyVal.textContent = money(state.money);
    const mps = computeMps();
    els.mpsVal.textContent = mps > 0 ? "+" + E.formatMoney(mps) + G.i18n.t("hud.perSec") : "";
    els.researchVal.textContent = E.formatMoney(state.research);
    const cap = E.powerCapacity(state);
    const demand = E.powerDemand(state);
    els.powerVal.textContent = Math.round(demand) + "/" + Math.round(cap);
    els.powerWrap.style.color = demand > cap ? "var(--accent-warn)" : "";
    const zoneDef = D.zoneById(state.currentZoneId);
    const floorDef = D.floorById(state.currentZoneId, state.currentFloorId);
    els.zoneName.textContent = G.i18n.t(zoneDef.nameKey);
    els.floorName.textContent = G.i18n.t(floorDef.nameKey);

    const unlocked = E.prestigeUnlocked(state);
    els.prestigeFlag.classList.toggle("hidden", !unlocked);
    els.dotPrestige.classList.toggle("show", unlocked);
    els.dotTech.classList.toggle("show", state.prestige.perkPoints > 0);
  }

  // ---- Location bar (zone/floor switching) ---------------------------------------
  function refreshLocationBar() {
    els.zoneButtons.innerHTML = "";
    D.ZONES.forEach((zoneDef) => {
      const zone = F.getZone(state, zoneDef.id);
      const btn = document.createElement("button");
      btn.className = "lb-btn" + (zone.id === state.currentZoneId ? " active" : "") + (!zone.unlocked ? " locked" : "");
      if (zone.unlocked) {
        btn.innerHTML = G.i18n.t(zoneDef.nameKey);
        btn.addEventListener("click", () => {
          state.currentZoneId = zone.id;
          state.currentFloorId = zoneDef.floors[0].id;
          selectedSlotRef = null;
          hideMachinePanel();
          refreshAll();
          onAfterAction();
        });
      } else {
        const costLabel = zoneDef.unlock.type === "money"
          ? G.i18n.t("zone.unlockFor", { amount: money(zoneDef.unlock.amount) })
          : G.i18n.t("zone.unlockPrestige", { amount: zoneDef.unlock.amount });
        btn.innerHTML = `🔒 ${G.i18n.t(zoneDef.nameKey)}<span class="lock-cost">${costLabel}</span>`;
        btn.addEventListener("click", () => {
          const res = F.unlockZone(state, zone.id);
          if (res.ok) {
            G.Audio.sfxUnlock();
            toast(G.i18n.t("notify.zoneUnlocked", { zone: G.i18n.t(zoneDef.nameKey) }));
            refreshAll(); onAfterAction();
          } else if (res.reason === "money") {
            G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughMoney"), "warn");
          }
        });
      }
      els.zoneButtons.appendChild(btn);
    });

    els.floorButtons.innerHTML = "";
    const curZoneDef = D.zoneById(state.currentZoneId);
    const curZone = F.getZone(state, state.currentZoneId);
    curZoneDef.floors.forEach((floorDef) => {
      const floor = curZone.floors.find((f) => f.id === floorDef.id);
      const btn = document.createElement("button");
      btn.className = "lb-btn" + (floor.id === state.currentFloorId ? " active" : "") + (!floor.unlocked ? " locked" : "");
      if (floor.unlocked) {
        btn.textContent = G.i18n.t(floorDef.nameKey);
        btn.addEventListener("click", () => {
          state.currentFloorId = floor.id;
          selectedSlotRef = null;
          hideMachinePanel();
          refreshAll(); onAfterAction();
        });
      } else {
        btn.innerHTML = `🔒 ${G.i18n.t(floorDef.nameKey)}<span class="lock-cost">${G.i18n.t("floor.unlockFor", { amount: money(floorDef.unlock.amount) })}</span>`;
        btn.addEventListener("click", () => {
          const res = F.unlockFloor(state, curZone.id, floor.id);
          if (res.ok) {
            G.Audio.sfxUnlock();
            toast(G.i18n.t("notify.floorUnlocked", { floor: G.i18n.t(floorDef.nameKey) }));
            refreshAll(); onAfterAction();
          } else if (res.reason === "money") {
            G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughMoney"), "warn");
          }
        });
      }
      els.floorButtons.appendChild(btn);
    });
  }

  // ---- Tier selector ---------------------------------------------------------------
  function buildTierSelector() {
    els.tierSelector.innerHTML = "";
    D.TIERS.forEach((tier, idx) => {
      const btn = document.createElement("button");
      btn.className = "tier-btn";
      btn.dataset.tier = tier.id;
      btn.innerHTML = `<div class="swatch" style="background:${tier.color}"></div><div class="tname"></div><div class="cost"></div><div class="lockicon">🔒</div>`;
      btn.addEventListener("click", () => {
        if (!E.tierUnlocked(state, tier.id)) { G.Audio.sfxError(); toast(G.i18n.t("tooltip.locked"), "warn"); return; }
        state.selectedTierId = tier.id;
        G.Audio.sfxClick();
        refreshTierSelector();
        onAfterAction(true);
      });
      els.tierSelector.appendChild(btn);
    });
    refreshTierSelector();
  }

  function refreshTierSelector() {
    D.TIERS.forEach((tier) => {
      const btn = els.tierSelector.querySelector(`.tier-btn[data-tier="${tier.id}"]`);
      if (!btn) return;
      const unlocked = E.tierUnlocked(state, tier.id);
      btn.classList.toggle("unlocked", unlocked);
      btn.classList.toggle("selected", state.selectedTierId === tier.id);
      btn.querySelector(".lockicon").style.display = unlocked ? "none" : "block";
      btn.querySelector(".tname").textContent = G.i18n.t("tier." + tier.id);
      btn.querySelector(".cost").textContent = unlocked ? "$" + E.formatMoney(E.machineCost(state, tier.id)) : "";
    });
  }

  // ---- Machine side panel --------------------------------------------------------
  function hideMachinePanel() {
    els.machinePanel.classList.add("hidden");
    selectedSlotRef = null;
    if (G.Render) G.Render.setSelected(null);
  }

  function selectSlot(slot) {
    selectedSlotRef = { r: slot.r, c: slot.c };
    if (G.Render) G.Render.setSelected(selectedSlotRef);
    renderMachinePanel();
  }

  function renderMachinePanel() {
    if (!selectedSlotRef) { els.machinePanel.classList.add("hidden"); return; }
    const floor = F.currentFloor(state);
    const slot = floor.grid.find((s) => s.r === selectedSlotRef.r && s.c === selectedSlotRef.c);
    if (!slot || !slot.machine) { hideMachinePanel(); return; }
    const m = slot.machine;
    const tier = D.tierById(m.tierId);
    els.machinePanel.classList.remove("hidden");

    const rows = ["speed", "output", "ink"].map((uid) => {
      const u = D.UPGRADES[uid];
      const lvl = m.levels[uid];
      const maxed = lvl >= u.maxLevel;
      const cost = maxed ? 0 : E.upgradeCost(uid, lvl, state);
      const afford = !maxed && state.money >= cost;
      return `<div class="upg-row">
        <div><div class="upg-name">${G.i18n.t(u.nameKey)}</div><div class="upg-level">${maxed ? G.i18n.t("action.max") : "Lv " + lvl + " → " + (lvl + 1)}</div></div>
        <button class="btn" data-upgrade="${uid}" ${maxed || !afford ? "disabled" : ""}>${maxed ? G.i18n.t("action.max") : money(cost)}</button>
      </div>`;
    }).join("");

    els.machinePanel.innerHTML = `
      <button class="panel-close" id="mp-close">✕</button>
      <h3 style="color:${tier.color}">${G.i18n.t("machine." + tier.id + ".name")}</h3>
      <div class="m-desc">${G.i18n.t("machine." + tier.id + ".desc")}</div>
      <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">
        ${G.i18n.t("tier." + tier.id)} · ${E.formatMoney(1 / E.machineCooldown(m, state))} cyc/s
      </div>
      ${rows}
    `;
    $("mp-close").addEventListener("click", hideMachinePanel);
    els.machinePanel.querySelectorAll("[data-upgrade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid = btn.getAttribute("data-upgrade");
        const res = F.upgradeMachine(state, state.currentZoneId, state.currentFloorId, slot.r, slot.c, uid);
        if (res.ok) {
          G.Audio.sfxUpgrade();
          toast(G.i18n.t("notify.upgradeBought", { upgrade: G.i18n.t(D.UPGRADES[uid].nameKey), level: res.newLevel }));
          renderMachinePanel();
          refreshHUD(); refreshTierSelector();
          onAfterAction();
        } else if (res.reason === "money") {
          G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughMoney"), "warn");
        }
      });
    });
  }

  // ---- Generic modal open/close ---------------------------------------------------
  function openPanel(name) {
    activePanel = name;
    els.modalOverlay.classList.remove("hidden");
    renderPanel();
  }
  function closePanel() {
    activePanel = null;
    els.modalOverlay.classList.add("hidden");
  }
  function renderPanel() {
    if (!activePanel) return;
    // Preserve scroll position across re-renders: this fires periodically
    // (see main.js loop) so a modal open with a scrolled list doesn't jump
    // back to the top every ~150ms while the player is reading it.
    const scrollTop = els.modalContent.scrollTop;
    if (activePanel === "rooms") renderRoomsPanel();
    else if (activePanel === "prestige") renderPrestigePanel();
    else if (activePanel === "tech") renderTechPanel();
    else if (activePanel === "settings") renderSettingsPanel();
    els.modalContent.scrollTop = scrollTop;
  }

  // ---- Rooms panel ------------------------------------------------------------------
  const ROOM_ICONS = { rnd: "🔬", vault: "🏦", power: "⚡" };
  function renderRoomsPanel() {
    const cards = ["rnd", "vault", "power"].map((rid) => {
      const def = D.ROOMS[rid];
      const lvl = state.rooms[rid].level;
      const maxed = lvl >= def.maxLevel;
      const cost = maxed ? 0 : E.roomCost(rid, lvl);
      const afford = !maxed && state.money >= cost;
      let statLine = "";
      if (rid === "rnd") statLine = `${E.formatMoney(E.rndRatePerSec(state))} 🔬${G.i18n.t("common.perSecShort")}`;
      if (rid === "vault") statLine = `${G.i18n.t("room.level", { level: lvl })} · cap ${E.vaultOfflineCapHours(state).toFixed(1)}h · +${(E.vaultInterestPerHour(state) * 100).toFixed(2)}%${G.i18n.t("common.perHour")}`;
      if (rid === "power") statLine = `${Math.round(E.powerDemand(state))}/${Math.round(E.powerCapacity(state))} used`;
      const pct = Math.min(100, (lvl / def.maxLevel) * 100);
      return `<div class="room-card">
        <div class="r-icon">${ROOM_ICONS[rid]}</div>
        <div class="r-body">
          <div class="r-title">${G.i18n.t("room." + rid + ".name")} <span style="color:var(--text-muted); font-size:12px;">${G.i18n.t("room.level", { level: lvl })}</span></div>
          <div class="r-desc">${G.i18n.t("room." + rid + ".desc")}</div>
          <div class="r-desc">${statLine}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
        <button class="btn brass" data-room="${rid}" ${maxed || !afford ? "disabled" : ""}>${maxed ? G.i18n.t("action.max") : money(cost)}</button>
      </div>`;
    }).join("");

    els.modalContent.innerHTML = `
      <button class="panel-close" id="modal-close">✕</button>
      <h2>${G.i18n.t("menu.rooms")}</h2>
      ${floorSystemsBlock()}
      <div class="m-sub" style="margin-top:14px;">${G.i18n.t("menu.rooms")}</div>
      ${cards}
    `;
    wireModalClose();
    els.modalContent.querySelectorAll("[data-room]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rid = btn.getAttribute("data-room");
        const res = F.upgradeRoom(state, rid);
        if (res.ok) { G.Audio.sfxUpgrade(); refreshHUD(); renderRoomsPanel(); onAfterAction(); }
        else if (res.reason === "money") { G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughMoney"), "warn"); }
      });
    });
    wireFloorSystemButtons();
  }

  function floorSystemsBlock() {
    const floor = F.currentFloor(state);
    const rows = ["conveyor", "collector"].map((sid) => {
      const def = D.FLOOR_SYSTEMS[sid];
      const lvl = floor.systems[sid];
      const maxed = lvl >= def.maxLevel;
      const cost = maxed ? 0 : E.floorSystemCost(sid, lvl, state);
      const afford = !maxed && state.money >= cost;
      const icon = sid === "conveyor" ? "🛞" : "🧲";
      return `<div class="room-card">
        <div class="r-icon">${icon}</div>
        <div class="r-body">
          <div class="r-title">${G.i18n.t("floorsys." + sid)} <span style="color:var(--text-muted); font-size:12px;">${G.i18n.t("room.level", { level: lvl })}</span></div>
          <div class="r-desc">${G.i18n.t("floorsys." + sid + ".desc")}</div>
        </div>
        <button class="btn" data-floorsys="${sid}" ${maxed || !afford ? "disabled" : ""}>${maxed ? G.i18n.t("action.max") : money(cost)}</button>
      </div>`;
    }).join("");
    return `<div class="m-sub">${G.i18n.t("menu.factory")} — ${G.i18n.t("hud.floor")}</div>${rows}`;
  }
  function wireFloorSystemButtons() {
    els.modalContent.querySelectorAll("[data-floorsys]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute("data-floorsys");
        const res = F.buyFloorSystem(state, state.currentZoneId, state.currentFloorId, sid);
        if (res.ok) {
          G.Audio.sfxUpgrade();
          refreshHUD(); renderRoomsPanel(); onAfterAction();
        } else if (res.reason === "money") { G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughMoney"), "warn"); }
        else if (res.reason === "power") { G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughPower"), "warn"); }
      });
    });
  }

  // ---- Prestige panel -----------------------------------------------------------------
  function renderPrestigePanel() {
    const unlocked = E.prestigeUnlocked(state);
    const gain = E.prestigeGain(state);
    const requirement = E.prestigeRequirement(state);
    els.modalContent.innerHTML = `
      <button class="panel-close" id="modal-close">✕</button>
      <h2>${G.i18n.t("prestige.title")}</h2>
      <div class="m-sub">${G.i18n.t("prestige.desc")}</div>
      <div class="prestige-big">
        ${unlocked
          ? `<div class="p-gain">+${gain}</div><div class="m-sub">${G.i18n.t("prestige.gain", { amount: gain })}</div>`
          : `<div class="m-sub">${G.i18n.t("prestige.locked", { amount: money(requirement) })}</div>
             <div class="bar-track" style="margin-top:10px;"><div class="bar-fill" style="width:${Math.min(100, (state.maxMoney / requirement) * 100)}%"></div></div>`
        }
      </div>
      <div class="m-sub" style="text-align:center; margin-bottom:14px;">${G.i18n.t("prestige.current", { count: state.prestige.count, points: state.prestige.perkPoints })}</div>
      <button class="btn brass" id="btn-do-prestige" style="width:100%; padding:12px; font-size:15px;" ${unlocked ? "" : "disabled"}>${G.i18n.t("action.rebirth")}</button>
    `;
    wireModalClose();
    const btn = $("btn-do-prestige");
    if (btn) btn.addEventListener("click", () => { onRequestPrestige(); });
  }

  // ---- Tech tree panel ----------------------------------------------------------------
  function renderTechPanel() {
    const branches = ["production", "automation", "economy"];
    const cols = branches.map((branch) => {
      const nodes = D.TECH_TREE.filter((t) => t.branch === branch).map((t) => {
        const owned = !!state.prestige.tech[t.id];
        const reqMet = E.techRequirementsMet(state, t);
        const locked = !owned && !reqMet;
        const costLabel = owned ? G.i18n.t("action.selected") : t.cost + " ⭐ · " + E.formatMoney(t.researchCost) + " 🔬";
        return `<div class="tech-node ${owned ? "owned" : locked ? "locked" : ""}" data-tech="${t.id}">
          <div class="t-name">${owned ? "✅ " : locked ? "🔒 " : ""}${G.i18n.t(t.nameKey)}</div>
          <div class="t-cost">${costLabel}</div>
        </div>`;
      }).join("");
      return `<div class="tech-branch"><h4>${G.i18n.t("tech.branch." + branch)}</h4>${nodes}</div>`;
    }).join("");

    els.modalContent.innerHTML = `
      <button class="panel-close" id="modal-close">✕</button>
      <h2>${G.i18n.t("tech.title")}</h2>
      <div class="m-sub">${G.i18n.t("tech.points", { points: state.prestige.perkPoints, research: E.formatMoney(state.research) })}</div>
      <div class="tech-grid">${cols}</div>
    `;
    wireModalClose();
    els.modalContent.querySelectorAll("[data-tech]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-tech");
        const tech = D.techById(id);
        const res = F.buyTech(state, id);
        if (res.ok) {
          G.Audio.sfxTechUnlock();
          toast(G.i18n.t("notify.techUnlocked", { tech: G.i18n.t(tech.nameKey) }));
          renderTechPanel(); refreshHUD(); refreshTierSelector();
          onAfterAction();
        } else if (res.reason === "points") { G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughPoints"), "warn"); }
        else if (res.reason === "research") { G.Audio.sfxError(); toast(G.i18n.t("notify.notEnoughResearch"), "warn"); }
        else if (res.reason === "requires") { G.Audio.sfxError(); }
      });
    });
  }

  // ---- Settings panel -------------------------------------------------------------------
  function renderSettingsPanel() {
    els.modalContent.innerHTML = `
      <button class="panel-close" id="modal-close">✕</button>
      <h2>${G.i18n.t("settings.title")}</h2>
      <div class="setting-row">
        <span>${G.i18n.t("settings.language")}</span>
        <div class="lang-toggle">
          <button data-lang="en" class="${state.settings.lang === "en" ? "active" : ""}">English</button>
          <button data-lang="vi" class="${state.settings.lang === "vi" ? "active" : ""}">Tiếng Việt</button>
        </div>
      </div>
      <div class="setting-row">
        <span>${G.i18n.t("settings.music")}</span>
        <label class="switch"><input type="checkbox" id="chk-music" ${state.settings.music ? "checked" : ""}><span class="track"></span><span class="knob"></span></label>
      </div>
      <div class="setting-row">
        <span>${G.i18n.t("settings.sfx")}</span>
        <label class="switch"><input type="checkbox" id="chk-sfx" ${state.settings.sfx ? "checked" : ""}><span class="track"></span><span class="knob"></span></label>
      </div>
      <div class="setting-row">
        <span style="font-size:12px; color:var(--text-muted);">${G.i18n.t("controls.title")}: ${G.Input.isTouchDevice() ? G.i18n.t("controls.mobile") : G.i18n.t("controls.pc")}</span>
      </div>
      <div class="setting-row" style="display:block;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span>${G.i18n.t("settings.export")}</span>
          <button class="btn" id="btn-export-save">${G.i18n.t("settings.export")}</button>
        </div>
        <textarea id="save-export-code" readonly style="width:100%; min-height:72px; resize:vertical; box-sizing:border-box; font:11px monospace; background:var(--bg-deep); color:var(--text-secondary); border:1px solid var(--line); border-radius:var(--radius-sm); padding:8px;"></textarea>
      </div>
      <div class="setting-row" style="display:block;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span>${G.i18n.t("settings.import")}</span>
          <button class="btn" id="btn-import-save">${G.i18n.t("settings.import")}</button>
        </div>
        <textarea id="save-import-code" placeholder="Paste save code here" style="width:100%; min-height:72px; resize:vertical; box-sizing:border-box; font:11px monospace; background:var(--bg-deep); color:var(--text-secondary); border:1px solid var(--line); border-radius:var(--radius-sm); padding:8px;"></textarea>
      </div>
      <div class="setting-row">
        <button class="btn warn" id="btn-hard-reset">${G.i18n.t("settings.hardReset")}</button>
      </div>
    `;
    wireModalClose();
    els.modalContent.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lang = btn.getAttribute("data-lang");
        state.settings.lang = lang;
        G.i18n.setLang(lang);
        refreshAll();
      });
    });
    $("chk-music").addEventListener("change", (e) => { state.settings.music = e.target.checked; G.Audio.setMusicEnabled(e.target.checked); onAfterAction(); });
    $("chk-sfx").addEventListener("change", (e) => { state.settings.sfx = e.target.checked; G.Audio.setSfxEnabled(e.target.checked); onAfterAction(); });
    $("btn-export-save").addEventListener("click", async () => {
      const code = G.Save.exportSave(state);
      const area = $("save-export-code");
      area.value = code || "";
      if (!code) return;
      area.focus(); area.select();
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(code);
        toast(G.i18n.t("notify.saveExported"));
      } catch (e) {
        toast(G.i18n.t("notify.saveExported"));
      }
    });
    $("btn-import-save").addEventListener("click", () => {
      const code = $("save-import-code").value.trim();
      if (!code) return;
      const imported = G.Save.importSave(code);
      if (!imported) { G.Audio.sfxError(); toast(G.i18n.t("notify.importFailed"), "warn"); return; }
      onStateImported(imported);
    });
    $("btn-hard-reset").addEventListener("click", () => {
      if (confirm(G.i18n.t("settings.hardResetConfirm"))) {
        window.dispatchEvent(new CustomEvent("mft:hardreset"));
      }
    });
  }

  function wireModalClose() {
    const btn = $("modal-close");
    if (btn) btn.addEventListener("click", closePanel);
  }

  // ---- Mobile drawer (controls help / quick info) -----------------------------------------
  function renderDrawer() {
    if (!els.drawer || els.drawer.classList.contains("hidden")) return;
    els.drawer.innerHTML = `
      <div style="font-family:var(--font-display); font-size:14px; margin-bottom:6px;">${G.i18n.t("controls.title")}</div>
      <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">${G.i18n.t("controls.mobile")}</div>
    `;
  }

  // ---- Offline earnings modal ----------------------------------------------------------------
  function showOfflineModal(result, elapsedSeconds, onClaim) {
    els.offlineModal.classList.remove("hidden");
    $("offline-body").textContent = G.i18n.t("offline.body", { time: E.formatTime(elapsedSeconds) });
    $("offline-amount").textContent = G.i18n.t("offline.earned", { amount: money(result.amount) });
    $("offline-capped-note").classList.toggle("hidden", !result.wasCapped);
    const btn = $("offline-claim-btn");
    const handler = () => {
      els.offlineModal.classList.add("hidden");
      btn.removeEventListener("click", handler);
      onClaim();
    };
    btn.addEventListener("click", handler);
  }

  // ---- Full refresh ----------------------------------------------------------------------------
  function refreshAll() {
    refreshHUD();
    refreshLocationBar();
    refreshTierSelector();
    renderMachinePanel();
    if (activePanel) renderPanel();
    G.i18n.applyToDom();
  }

  G.UI = {
    init, setState, refreshAll, refreshHUD, refreshLocationBar, refreshTierSelector,
    selectSlot, hideMachinePanel, renderMachinePanel,
    openPanel, closePanel, toast, showOfflineModal, renderDrawer,
    refreshOpenPanel: renderPanel,
    isInputBlocked() {
      return !!activePanel || !!els.offlineModal && !els.offlineModal.classList.contains("hidden");
    },
    get selectedSlot() { return selectedSlotRef; },
    get isPanelOpen() { return !!activePanel; },
  };
})(window.Game = window.Game || {});
