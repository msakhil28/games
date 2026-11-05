// Tiny synthesized sound effects (Web Audio) — no audio files needed.
const Sfx = (() => {
  let ctx = null, noiseBuf = null;
  const enabled = () => Store.s.sound !== false;
  function ac() {
    if (!ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      ctx = new A();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // browsers only allow audio after a user gesture
  addEventListener('pointerdown', () => { if (enabled()) ac(); }, { passive: true });

  function ready() { return enabled() && ctx && ctx.state === 'running' && document.visibilityState === 'visible'; }
  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noise(t, dur, freq, q, peak) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, peak, dur);
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function tone(t, freq, dur, type, peak, slideTo) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); env(g, t, peak, dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const at = ms => ctx.currentTime + Math.max(0, ms || 0) / 1000;

  return {
    deal(ms) { if (!ready()) return; const t = at(ms); noise(t, 0.09, 2600, 0.9, 0.35); noise(t + 0.03, 0.05, 5200, 1.2, 0.12); },
    flip(ms) { if (!ready()) return; const t = at(ms); noise(t, 0.06, 1700, 1.4, 0.3); },
    chip(ms) {
      if (!ready()) return; const t = at(ms);
      tone(t, 3100, 0.07, 'triangle', 0.12); tone(t + 0.045, 2500, 0.08, 'triangle', 0.1); noise(t, 0.04, 7000, 2, 0.08);
    },
    chips() { for (let i = 0; i < 4; i++) this.chip(i * 55 + Math.random() * 20); },
    win() { if (!ready()) return; const t = at(0); [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, f, 0.32, 'triangle', 0.14)); },
    big() { if (!ready()) return; const t = at(0); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(t + i * 0.08, f, 0.4, 'triangle', 0.13)); this.chips(); },
    lose() { if (!ready()) return; const t = at(0); tone(t, 330, 0.25, 'sine', 0.12, 260); tone(t + 0.18, 262, 0.35, 'sine', 0.1, 196); },
    turn() { if (!ready()) return; const t = at(0); tone(t, 880, 0.12, 'sine', 0.12); tone(t + 0.1, 1320, 0.2, 'sine', 0.1); },
    fold() { if (!ready()) return; noise(at(0), 0.12, 900, 0.7, 0.2); },
    toggle() { Store.s.sound = !enabled(); Store.changed(); if (enabled()) { ac(); setTimeout(() => this.chip(), 30); } return enabled(); },
    enabled,
  };
})();
