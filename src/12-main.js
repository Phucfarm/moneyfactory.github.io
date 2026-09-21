/* ============================================================
   12-main.js — Bootstraps the game: loads save, wires up input/
   render/UI/audio, and runs the main requestAnimationFrame loop.
   ============================================================ */
(function (G) {
  "use strict";
  const D = G.DATA;
  const E = G.Econ;
  const F = G.Factory;

  let state = null;
  let canvas;
  let bonusSlot = null;    // {zoneId, floorId, r, c, expiresAt}
  let lastFrameTime = 0;
  let audioUnlocked = false;
  let critFlashThrottle = 0;
  let hudAccum = 0;
  let dirty = false; // true if state changed since last save eligibility check

  function boot() {
    const loaded = G.Save.load();
    state = loaded.state;
    F.resetRuntime();

    G.i18n.setLang(state.settings.lang);

    canvas = document.getElementById("gameCanvas");

    G.Render.init(canvas);
    G.Render.setCamera(state.camera);

    G.Audio.setMusicEnabled(state.settings.music);
    G.Audio.setSfxEnabled(state.settings.sfx);
    G.Audio.setMusicVolume(state.settings.musicVolume);
    G.Audio.setSfxVolume(state.settings.sfxVolume);

    G.Input.init({
      canvas, camera: state.camera,
      callbacks: {
        onCameraChanged: () => { dirty = true; },
        onTapScreen: handleTapScreen,
        onHoverScreen: handleHoverScreen,
        onSelectTierIndex: handleSelectTierIndex,
        onCollectNearest: handleCollectNearest,
        isInputBlocked: () => G.UI.isInputBlocked(),
      },
    });

    G.UI.init(state, {
      onAfterAction: () => { dirty = true; },
      onRequestPrestige: handlePrestigeRequest,
      onStateImported: handleImportedState,
    });

    wireGlobalUi();
    setupOrientationGuard();
    window.addEventListener("resize", () => G.Render.resize());

    // Unlock WebAudio on first user gesture (required by browser autoplay policy).
    const unlock = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      G.Audio.unlock();
      if (state.settings.music) G.Audio.startMusic();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: false });
    window.addEventListener("keydown", unlock, { once: false });
    window.addEventListener("touchstart", unlock, { once: false });

    maybeShowOfflineModal(loaded);

    // Autosave loop. lastActiveTime is refreshed on every autosave (not just
    // on tab-hide/unload) so a hard crash or force-quit doesn't leave a stale
    // timestamp that would make the next offline-earnings calculation count
    // this entire play session as "away" time.
    setInterval(() => {
      if (!state.offlinePending) state.lastActiveTime = Date.now();
      G.Save.save(state);
    }, G.Save.AUTOSAVE_INTERVAL_SEC * 1000);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", () => {
      if (!state.offlinePending) state.lastActiveTime = Date.now();
      G.Save.save(state);
    });

    requestAnimationFrame(loop);
  }

  // ---- Offline earnings ------------------------------------------------------------
  function createOfflinePending(elapsedSeconds) {
    const result = F.simulateOfflineEarnings(state, elapsedSeconds);
    state.offlinePending = { ...result, elapsedSeconds };
    // The transaction is now persisted so reloads cannot lose or duplicate it.
    G.Save.save(state);
    return result;
  }

  function claimOfflineReward(result) {
    F.applyOfflineEarnings(state, result);
    state.offlinePending = null;
    state.lastActiveTime = Date.now();
    G.Save.save(state);
    G.UI.refreshAll();
    dirty = true;
  }

  function showPendingOfflineReward() {
    if (!state.offlinePending) return false;
    const pending = state.offlinePending;
    G.UI.showOfflineModal(pending, pending.elapsedSeconds, () => claimOfflineReward(pending));
    return true;
  }

  function maybeShowOfflineModal(loaded) {
    if (state.offlinePending) {
      showPendingOfflineReward();
      return;
    }
    if (loaded.isNewGame || loaded.offlineElapsedSeconds < 60) return;
    const result = createOfflinePending(loaded.offlineElapsedSeconds);
    G.UI.showOfflineModal(result, loaded.offlineElapsedSeconds, () => claimOfflineReward(result));
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") {
      if (!state.offlinePending) state.lastActiveTime = Date.now();
      G.Save.save(state);
      return;
    }

    // Avoid a large frame delta after returning from a backgrounded tab.
    lastFrameTime = performance.now();
    if (state.offlinePending) return;

    const elapsed = Math.max(0, (Date.now() - state.lastActiveTime) / 1000);
    if (elapsed < 0.25) return;

    const result = F.simulateOfflineEarnings(state, elapsed);
    if (elapsed >= 60) {
      state.offlinePending = { ...result, elapsedSeconds: elapsed };
      G.Save.save(state);
      G.UI.showOfflineModal(result, elapsed, () => claimOfflineReward(result));
    } else {
      F.applyOfflineEarnings(state, result);
      state.lastActiveTime = Date.now();
      G.Save.save(state);
      G.UI.refreshAll();
      dirty = true;
    }
  }

  // ---- Input -> game action handlers --------------------------------------------------
  function handleHoverScreen(sx, sy) {
    const slot = G.Render.slotAtScreen(sx, sy);
    G.Render.setHover(slot);
  }

  function handleSelectTierIndex(idx) {
    const tier = D.TIERS[idx];
    if (!tier) return;
    if (!E.tierUnlocked(state, tier.id)) { G.Audio.sfxError(); G.UI.toast(G.i18n.t("tooltip.locked"), "warn"); return; }
    state.selectedTierId = tier.id;
    G.UI.refreshTierSelector();
    dirty = true;
  }

  function handleTapScreen(sx, sy) {
    const slot = G.Render.slotAtScreen(sx, sy);
    if (!slot) return;
    const floor = F.currentFloor(state);
    const gridSlot = floor.grid.find((s) => s.r === slot.r && s.c === slot.c);
    if (!gridSlot) return;

    if (gridSlot.machine) {
      collectSlot(gridSlot, true);
    } else {
      const res = F.placeMachine(state, state.currentZoneId, state.currentFloorId, slot.r, slot.c, state.selectedTierId);
      if (res.ok) {
        G.Audio.sfxPlaceMachine();
        const tierName = G.i18n.t("tier." + res.tierId);
        G.UI.toast(G.i18n.t("notify.machinePlaced", { tier: tierName }));
        G.UI.refreshHUD(); G.UI.refreshTierSelector();
        dirty = true;
      } else if (res.reason === "money") {
        G.Audio.sfxError(); G.UI.toast(G.i18n.t("notify.notEnoughMoney"), "warn");
      } else if (res.reason === "tierLocked") {
        G.Audio.sfxError(); G.UI.toast(G.i18n.t("tooltip.locked"), "warn");
      }
    }
  }

  function collectSlot(gridSlot, selectAfter) {
    const isBonus = bonusSlot && bonusSlot.zoneId === state.currentZoneId && bonusSlot.floorId === state.currentFloorId
      && bonusSlot.r === gridSlot.r && bonusSlot.c === gridSlot.c;
    const had = gridSlot.machine.banked;
    const res = F.collectMachine(state, state.currentZoneId, state.currentFloorId, gridSlot.r, gridSlot.c);
    if (res.amount > 0) {
      const p = G.Render.slotWorldPos(gridSlot.r, gridSlot.c);
      G.Render.spawnCollectFloater(p.x, p.y - 30, res.amount, false);
      G.Audio.sfxCollect(Math.min(1, res.amount / 1000));
    }
    if (isBonus) {
      const bonusAmount = (had > 0 ? had : E.machineBaseYield(gridSlot.machine, 1, state)) * (1.5 + Math.random() * 2);
      F.grantMoney(state, bonusAmount);
      const p = G.Render.slotWorldPos(gridSlot.r, gridSlot.c);
      G.Render.spawnBonusIcon(p.x, p.y - 30);
      G.Audio.sfxBonus();
      bonusSlot = null;
    }
    if (selectAfter) G.UI.selectSlot(gridSlot);
    G.UI.refreshHUD();
    dirty = true;
  }

  function handleCollectNearest() {
    const floor = F.currentFloor(state);
    if (!floor) return;
    let best = null;
    let bestDistSq = Infinity;
    floor.grid.forEach((s) => {
      if (!s.machine || s.machine.banked <= 0) return;
      const p = G.Render.slotWorldPos(s.r, s.c);
      const dx = p.x - state.camera.x;
      const dy = p.y - state.camera.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        best = s;
        bestDistSq = distSq;
      }
    });
    if (best) collectSlot(best, false);
  }

  // ---- Prestige / reset ----------------------------------------------------------------
  function handlePrestigeRequest() {
    if (!E.prestigeUnlocked(state)) return;
    const gain = E.prestigeGain(state);
    const ok = window.confirm(
      G.i18n.t("prestige.confirmTitle") + "\n\n" + G.i18n.t("prestige.confirmBody") + "\n\n" + G.i18n.t("prestige.gain", { amount: gain })
    );
    if (!ok) return;
    const res = F.doPrestige(state);
    if (!res.ok) return;
    state = res.newState;
    bonusSlot = null;
    F.resetRuntime();
    G.Render.setCamera(state.camera);
    G.Input.setCameraRef(state.camera);
    G.UI.setState(state);
    G.UI.closePanel();
    G.Audio.sfxPrestige();
    G.UI.toast(G.i18n.t("notify.prestige", { points: res.gain }));
    G.Save.save(state);
  }

  function handleImportedState(newState) {
    state = newState;
    bonusSlot = null;
    F.resetRuntime();
    G.i18n.setLang(state.settings.lang);
    G.Audio.setMusicEnabled(state.settings.music);
    G.Audio.setSfxEnabled(state.settings.sfx);
    G.Audio.setMusicVolume(state.settings.musicVolume);
    G.Audio.setSfxVolume(state.settings.sfxVolume);
    G.Render.setCamera(state.camera);
    G.Input.setCameraRef(state.camera);
    G.UI.setState(state);
    G.UI.closePanel();
    G.Save.save(state);
    G.UI.toast(G.i18n.t("notify.saved"));
  }

  function handleHardReset() {
    state = G.Save.hardReset();
    bonusSlot = null;
    F.resetRuntime();
    G.i18n.setLang(state.settings.lang);
    G.Audio.setMusicEnabled(state.settings.music);
    G.Audio.setSfxEnabled(state.settings.sfx);
    G.Audio.setMusicVolume(state.settings.musicVolume);
    G.Audio.setSfxVolume(state.settings.sfxVolume);
    G.Render.setCamera(state.camera);
    G.Input.setCameraRef(state.camera);
    G.UI.setState(state);
    G.UI.closePanel();
  }

  function wireGlobalUi() {
    window.addEventListener("mft:hardreset", handleHardReset);
  }

  // ---- Orientation guard (mobile portrait -> ask to rotate) -----------------------------
  function setupOrientationGuard() {
    const notice = document.getElementById("rotate-notice");
    function check() {
      const touch = G.Input.isTouchDevice();
      const portrait = window.innerHeight > window.innerWidth;
      notice.classList.toggle("hidden", !(touch && portrait));
    }
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    check();
  }

  // ---- Event processing from factory tick -------------------------------------------------
  function processEvents(events) {
    const now = performance.now();
    events.forEach((ev) => {
      if (ev.type === "cycle" && ev.crit) {
        if (now - critFlashThrottle > 220) {
          critFlashThrottle = now;
          if (ev.zoneId === state.currentZoneId && ev.floorId === state.currentFloorId) {
            const p = G.Render.slotWorldPos(ev.r, ev.c);
            G.Render.spawnParticle({ kind: "spark", x: p.x, y: p.y, vx: 0, vy: -30, life: 0.5, size: 10, color: "rgba(255,210,90,0.9)" });
            G.Audio.sfxCrit();
          }
        }
      } else if (ev.type === "autocollect") {
        if (ev.zoneId === state.currentZoneId && ev.floorId === state.currentFloorId && ev.amount > 0) {
          G.Audio.sfxCollect(Math.min(1, ev.amount / 2000));
        }
      } else if (ev.type === "bonusReady") {
        if (ev.zoneId === state.currentZoneId && ev.floorId === state.currentFloorId) {
          bonusSlot = { zoneId: ev.zoneId, floorId: ev.floorId, r: ev.r, c: ev.c, expiresAt: Date.now() + 30000 };
        }
      }
    });
    if (bonusSlot && Date.now() > bonusSlot.expiresAt) bonusSlot = null;
  }

  // ---- Main loop -----------------------------------------------------------------------------
  function loop(ts) {
    if (!lastFrameTime) lastFrameTime = ts;
    let dt = (ts - lastFrameTime) / 1000;
    lastFrameTime = ts;
    dt = Math.max(0, Math.min(0.25, dt)); // clamp to avoid huge jumps (tab backgrounded)

    G.Input.update(dt);
    const events = F.tick(state, dt);
    processEvents(events);

    const floor = F.currentFloor(state);
    let bonusKey = null;
    if (bonusSlot && bonusSlot.zoneId === state.currentZoneId && bonusSlot.floorId === state.currentFloorId) {
      bonusKey = bonusSlot.r + "_" + bonusSlot.c;
    }
    G.Render.render(state, floor, dt, bonusKey);

    hudAccum += dt;
    if (hudAccum >= 0.15) {
      hudAccum = 0;
      G.UI.refreshHUD();
      if (G.UI.selectedSlot) G.UI.renderMachinePanel();
      if (G.UI.isPanelOpen) G.UI.refreshOpenPanel();
    }

    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.Game = window.Game || {});
