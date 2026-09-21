/* ============================================================
   08-audio.js — All audio is synthesized with the Web Audio API;
   no external audio files. Covers SFX (machine hum, cash, clicks,
   upgrades) and a generative chiptune background loop.
   ============================================================ */
(function (G) {
  "use strict";

  let ctx = null;
  let masterGain, sfxGain, musicGain;
  let unlocked = false;
  let musicEnabled = true, sfxEnabled = true;
  let musicTimer = null;
  let humNodes = new Map(); // key -> {osc, gain}

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(masterGain);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.35;
    musicGain.connect(masterGain);
    return ctx;
  }

  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    unlocked = true;
  }

  function setSfxEnabled(v) { sfxEnabled = v; }
  function setMusicEnabled(v) {
    musicEnabled = v;
    if (!v) stopMusic(); else startMusic();
  }
  function setSfxVolume(v) { if (sfxGain) sfxGain.gain.value = v; }
  function setMusicVolume(v) { if (musicGain) musicGain.gain.value = v; }

  // ---- Generic tone helper -------------------------------------------------
  function tone({ freq = 440, type = "sine", dur = 0.15, gain = 0.3, slideTo = null, delay = 0, attack = 0.005, decay = null }) {
    if (!sfxEnabled) return;
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay || dur));
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + (decay || dur) + 0.05);
  }

  function noiseBurst({ dur = 0.12, gain = 0.2, delay = 0, filterFreq = 2000 }) {
    if (!sfxEnabled) return;
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const bufferSize = c.sampleRate * dur;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filt = c.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- Specific SFX ---------------------------------------------------------
  function sfxClick() { tone({ freq: 700, type: "square", dur: 0.06, gain: 0.15 }); }
  function sfxCollect(amountFactor) {
    // amountFactor 0..1 roughly maps to pitch/brightness of the "cash" chime
    const base = 520 + Math.min(1, amountFactor) * 300;
    tone({ freq: base, type: "triangle", dur: 0.12, gain: 0.22, slideTo: base * 1.6 });
    tone({ freq: base * 1.5, type: "sine", dur: 0.18, gain: 0.12, delay: 0.03, slideTo: base * 2 });
  }
  function sfxCrit() {
    tone({ freq: 660, type: "sawtooth", dur: 0.08, gain: 0.2 });
    tone({ freq: 990, type: "sawtooth", dur: 0.12, gain: 0.18, delay: 0.06 });
    tone({ freq: 1320, type: "sine", dur: 0.2, gain: 0.15, delay: 0.12 });
  }
  function sfxPlaceMachine() {
    noiseBurst({ dur: 0.1, gain: 0.25, filterFreq: 1200 });
    tone({ freq: 220, type: "square", dur: 0.1, gain: 0.15, delay: 0.03, slideTo: 440 });
  }
  function sfxUpgrade() {
    [0, 0.07, 0.14].forEach((d, i) => tone({ freq: 440 + i * 160, type: "square", dur: 0.09, gain: 0.16, delay: d }));
  }
  function sfxUnlock() {
    [0, 0.09, 0.18, 0.27].forEach((d, i) => tone({ freq: 392 * Math.pow(2, i / 12) * 2, type: "triangle", dur: 0.15, gain: 0.18, delay: d }));
  }
  function sfxError() {
    tone({ freq: 180, type: "sawtooth", dur: 0.18, gain: 0.18, slideTo: 90 });
  }
  function sfxPrestige() {
    const notes = [261, 329, 392, 523, 659, 784];
    notes.forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.35, gain: 0.15, delay: i * 0.08, slideTo: f * 2 }));
    noiseBurst({ dur: 0.6, gain: 0.15, filterFreq: 4000, delay: 0.1 });
  }
  function sfxTechUnlock() {
    tone({ freq: 300, type: "sine", dur: 0.25, gain: 0.16, slideTo: 900 });
  }
  function sfxBonus() {
    [0, 0.05, 0.1].forEach((d, i) => tone({ freq: 880 + i * 220, type: "sine", dur: 0.12, gain: 0.16, delay: d }));
  }

  // ---- Machine hum loop (per-machine ambient drone, subtle) -----------------
  function startHum(key, tierOrder) {
    const c = ensureCtx();
    if (!c || humNodes.has(key)) return;
    if (humNodes.size > 24) return; // cap concurrent hums for perf
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 70 + tierOrder * 12;
    g.gain.value = 0;
    osc.connect(g);
    g.connect(sfxGain);
    osc.start();
    g.gain.linearRampToValueAtTime(0.015 + tierOrder * 0.004, c.currentTime + 0.4);
    humNodes.set(key, { osc, gain: g });
  }
  function stopHum(key) {
    const n = humNodes.get(key);
    if (!n) return;
    const c = ctx;
    try {
      n.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);
      n.osc.stop(c.currentTime + 0.35);
    } catch (e) { /* ignore */ }
    humNodes.delete(key);
  }
  function stopAllHums() { Array.from(humNodes.keys()).forEach(stopHum); }

  // ---- Generative chiptune background music ---------------------------------
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic-ish, extended
  let musicStep = 0;
  function scheduleMusicStep() {
    if (!musicEnabled || !sfxEnabled === undefined) {}
    if (!musicEnabled) return;
    const c = ensureCtx();
    if (!c) return;
    const root = 220;
    const degree = SCALE[musicStep % SCALE.length];
    const freq = root * Math.pow(2, degree / 12);
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = musicStep % 4 === 0 ? "square" : "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(t0);
    osc.stop(t0 + 0.25);

    if (musicStep % 8 === 0) {
      const bass = c.createOscillator();
      const bg = c.createGain();
      bass.type = "sine";
      bass.frequency.value = root / 2;
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      bass.connect(bg);
      bg.connect(musicGain);
      bass.start(t0);
      bass.stop(t0 + 0.55);
    }
    musicStep++;
  }
  function startMusic() {
    if (musicTimer || !musicEnabled) return;
    const c = ensureCtx();
    if (!c) return;
    musicTimer = setInterval(scheduleMusicStep, 260);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  G.Audio = {
    unlock, setSfxEnabled, setMusicEnabled, setSfxVolume, setMusicVolume,
    sfxClick, sfxCollect, sfxCrit, sfxPlaceMachine, sfxUpgrade, sfxUnlock,
    sfxError, sfxPrestige, sfxTechUnlock, sfxBonus,
    startHum, stopHum, stopAllHums,
    startMusic, stopMusic,
    get isUnlocked() { return unlocked; },
  };
})(window.Game = window.Game || {});
