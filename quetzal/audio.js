// Quetzal · motor de sonido. Todo se SINTETIZA con Web Audio (sin archivos): marimba en compás de 6/8, selva, volcán, mar y lluvia.
// Funciona con un AudioContext normal o con un OfflineAudioContext (así se puede medir el sonido sin oírlo).
export const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// Cada paisaje tiene su tono: armonías (bajo + 3 notas de acorde) y escala pentatónica para la melodía.
export const BIOME_MUSIC = [
  { name: 'nubes',      chords: [[48, 60, 64, 67], [45, 57, 60, 64], [41, 60, 65, 69], [43, 59, 62, 67]], scale: [0, 2, 4, 7, 9], root: 60 },   // do mayor, luminoso
  { name: 'arenal',     chords: [[45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62], [40, 55, 59, 64]], scale: [0, 3, 5, 7, 10], root: 57 },  // la menor, grave y con fuego
  { name: 'pacifico',   chords: [[43, 59, 62, 67], [38, 62, 66, 69], [40, 59, 62, 67], [48, 64, 67, 72]], scale: [0, 2, 4, 7, 9], root: 67 },  // sol mayor, brillante
  { name: 'tortuguero', chords: [[38, 57, 62, 65], [45, 57, 60, 64], [48, 60, 64, 67], [43, 59, 62, 67]], scale: [0, 3, 5, 7, 10], root: 62 }   // re menor, suave y húmedo
];

function noiseBuffer(ctx, kind) {
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }   // marrón (graves)
  }
  return buf;
}
function impulse(ctx, secs, decay) {
  const len = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return buf;
}

export function createEngine(ctx) {
  const T = () => ctx.currentTime;
  const hasPan = typeof ctx.createStereoPanner === 'function';
  // --- cadena maestra: buses -> compresor (evita que se sature) ---
  const master = ctx.createGain(); master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
  master.connect(comp); comp.connect(ctx.destination);
  const bus = (v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(master); return g; };
  const musicBus = bus(0.62), ambBus = bus(0.75), sfxBus = bus(0.9);
  const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 2.6, 3.2); const revIn = ctx.createGain(); revIn.gain.value = 0.42; revIn.connect(rev); rev.connect(master);
  const noise = { white: noiseBuffer(ctx, 'white'), pink: noiseBuffer(ctx, 'pink'), brown: noiseBuffer(ctx, 'brown') };
  const out = (node, dest, pan, send) => {
    let n = node;
    if (hasPan && pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); n.connect(p); n = p; }
    n.connect(dest); if (send) { const s = ctx.createGain(); s.gain.value = send; n.connect(s); s.connect(revIn); }
  };
  const env = (g, t, a, peak, dur, floor = 0.0001) => { g.gain.setValueAtTime(floor, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(floor, t + a + dur); };
  const loopNoise = (kind) => { const s = ctx.createBufferSource(); s.buffer = noise[kind]; s.loop = true; s.start(T(), Math.random() * 2); return s; };

  // ---------------- voces ----------------
  // Marimba: fundamental + parcial a 4× (la "madera") + click de golpe. Los graves suenan más largos.
  function marimba(f, t, vel = 0.7, pan = 0, dest = musicBus, send = 0.3) {
    const dur = Math.max(0.22, Math.min(1.5, 190 / f)), g = ctx.createGain(); env(g, t, 0.003, 0.5 * vel, dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f * 14); lp.Q.value = 0.4;
    const o1 = ctx.createOscillator(); o1.frequency.value = f; const o2 = ctx.createOscillator(); o2.frequency.value = f * 3.97;
    const g2 = ctx.createGain(); env(g2, t, 0.002, 0.22 * vel, dur * 0.22); const o3 = ctx.createOscillator(); o3.frequency.value = f * 9.2;
    const g3 = ctx.createGain(); env(g3, t, 0.001, 0.07 * vel, 0.05);
    o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g); g.connect(lp);
    [o1, o2, o3].forEach((o) => { o.start(t); o.stop(t + dur + 0.1); });
    const n = ctx.createBufferSource(); n.buffer = noise.white; const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = Math.min(5000, f * 4); nb.Q.value = 1.2;
    const ng = ctx.createGain(); env(ng, t, 0.001, 0.12 * vel, 0.012); n.connect(nb); nb.connect(ng); ng.connect(lp); n.start(t, Math.random()); n.stop(t + 0.04);
    out(lp, dest, pan, send);
  }
  function shaker(t, vel, pan = 0.25) {
    const n = ctx.createBufferSource(); n.buffer = noise.white; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5500;
    const g = ctx.createGain(); env(g, t, 0.004, 0.16 * vel, 0.05); n.connect(hp); hp.connect(g); n.start(t, Math.random() * 2); n.stop(t + 0.08); out(g, musicBus, pan, 0.08);
  }
  function guiro(t, vel) {   // raspado de güiro: ruido con barrido
    const n = ctx.createBufferSource(); n.buffer = noise.white; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4; bp.frequency.setValueAtTime(2200, t); bp.frequency.linearRampToValueAtTime(3800, t + 0.16);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * vel, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp); bp.connect(g); n.start(t, Math.random() * 2); n.stop(t + 0.24); out(g, musicBus, -0.3, 0.1);
  }
  function bombo(t, vel) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    const g = ctx.createGain(); env(g, t, 0.004, 0.55 * vel, 0.26); o.connect(g); o.start(t); o.stop(t + 0.32); out(g, musicBus, 0, 0.04);
  }
  function claves(t, vel) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2350; const g = ctx.createGain(); env(g, t, 0.001, 0.16 * vel, 0.07);
    o.connect(g); o.start(t); o.stop(t + 0.1); out(g, musicBus, -0.15, 0.12);
  }

  // ---------------- música (6/8) ----------------
  const M = { biome: 0, intensity: 0.25, idx: 0, next: 0, pausedUntil: 0, lastMel: 0, on: false, motif: [] };
  const eighth = () => 0.205 - 0.06 * M.intensity;
  function scaleNote(b, deg) {   // grado de la pentatónica -> MIDI (admite grados fuera de rango = otras octavas)
    const s = BIOME_MUSIC[b].scale, o = Math.floor(deg / 5), i = ((deg % 5) + 5) % 5; return BIOME_MUSIC[b].root + s[i] + 12 * o;
  }
  function musicStep(t) {
    const b = M.biome, bar = Math.floor(M.idx / 6), step = M.idx % 6, ch = BIOME_MUSIC[b].chords[bar % 4], I = M.intensity;
    if (step === 0 && bar % 4 === 0) M.motif = [0, 1, 2, 3, 4, 5].map(() => ((Math.random() * 5) | 0));
    if (step === 0 || step === 3) marimba(midi(ch[0]), t, 0.9 - (step === 3 ? 0.15 : 0), -0.2, musicBus, 0.2);
    const arp = { 1: ch[2], 2: ch[3], 4: ch[1] + 12, 5: ch[3] };
    if (arp[step]) marimba(midi(arp[step]), t, 0.5 + 0.3 * I, step % 2 ? 0.3 : -0.1);
    // melodía: a veces, y en el 2.º y 4.º compás más
    if ((step === 0 || step === 2 || step === 3 || step === 5) && Math.random() < 0.35 + 0.45 * I && bar % 2 === 1 || (step === 0 && bar % 2 === 0)) {
      const base = 5 + (b === 1 ? 0 : 1); let d = M.motif[step] + base; if (Math.abs(d - M.lastMel) > 3) d = M.lastMel + Math.sign(d - M.lastMel) * 2; M.lastMel = d;
      marimba(midi(scaleNote(b, d)), t, 0.6 + 0.25 * I, 0.15, musicBus, 0.38);
    }
    const acc = [1, 0.4, 0.65, 0.9, 0.4, 0.65][step]; shaker(t, acc * (0.5 + 0.7 * I));
    if (I > 0.28 && (step === 0 || step === 3)) bombo(t, 0.5 + I * 0.5);
    if (I > 0.55 && (step === 2 || step === 5)) claves(t, 0.6 + 0.4 * I);
    if (I > 0.4 && step === 4 && bar % 2 === 0) guiro(t, 0.7);
  }

  // ---------------- ambientes ----------------
  const A = {};
  function layer(name, build) { const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus); A[name] = { g, ...build(g) }; }
  layer('wind', (g) => { const s = loopNoise('pink'), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 450; f.Q.value = 0.6; const l = ctx.createOscillator(); l.frequency.value = 0.09; const lg = ctx.createGain(); lg.gain.value = 160; l.connect(lg); lg.connect(f.frequency); l.start(); s.connect(f); f.connect(g); return { f }; });
  layer('insects', (g) => { const s = loopNoise('white'), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 9; const am = ctx.createGain(); am.gain.value = 0.5; const l = ctx.createOscillator(); l.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain); l.start(); s.connect(f); f.connect(am); am.connect(g); return {}; });
  layer('rumble', (g) => { const s = loopNoise('brown'), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 110; const l = ctx.createOscillator(); l.frequency.value = 0.2; const lg = ctx.createGain(); lg.gain.value = 40; l.connect(lg); lg.connect(f.frequency); l.start(); s.connect(f); f.connect(g); return {}; });
  layer('ocean', (g) => { const s = loopNoise('pink'), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const l = ctx.createOscillator(); l.frequency.value = 0.11; const lg = ctx.createGain(); lg.gain.value = 420; l.connect(lg); lg.connect(f.frequency); l.start(); const am = ctx.createGain(); am.gain.value = 0.6; const l2 = ctx.createOscillator(); l2.frequency.value = 0.11; const l2g = ctx.createGain(); l2g.gain.value = 0.4; l2.connect(l2g); l2g.connect(am.gain); l2.start(); s.connect(f); f.connect(am); am.connect(g); return {}; });
  layer('rain', (g) => { const s = loopNoise('white'), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400; const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 9000; s.connect(f); f.connect(f2); f2.connect(g); return {}; });
  const LEVEL = [   // volumen de cada capa por paisaje: [viento, insectos, rumor, mar, lluvia]
    [0.20, 0.10, 0, 0, 0], [0.30, 0.02, 0.55, 0, 0], [0.22, 0.03, 0, 0.42, 0], [0.14, 0.12, 0, 0, 0.30]];
  function applyBiome(now) {
    const L = LEVEL[M.biome], ks = ['wind', 'insects', 'rumble', 'ocean', 'rain']; ks.forEach((k, i) => A[k].g.gain.setTargetAtTime(L[i], now, 1.4));
  }
  applyBiome(0);

  // eventos de ambiente (se programan con anticipación)
  const E = { next: {} };
  function frog(t) { const f = rnd(1400, 2700), pan = rnd(-0.9, 0.9), n = 3 + ((Math.random() * 4) | 0); for (let i = 0; i < n; i++) { const o = ctx.createOscillator(); o.frequency.value = f * (1 + i * 0.01); const g = ctx.createGain(); env(g, t + i * 0.055, 0.004, 0.05, 0.035); o.connect(g); o.start(t + i * 0.055); o.stop(t + i * 0.055 + 0.06); out(g, ambBus, pan, 0.18); } }
  function chirp(t) { const o = ctx.createOscillator(); o.type = 'sine'; const f = rnd(2200, 4200), pan = rnd(-1, 1); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(0.7, 1.4), t + 0.09); const g = ctx.createGain(); env(g, t, 0.01, 0.06, 0.1); o.connect(g); o.start(t); o.stop(t + 0.14); out(g, ambBus, pan, 0.3); if (Math.random() < 0.6) chirp(t + 0.14 + Math.random() * 0.1); }
  function bellbird(t) {   // campana metálica del pájaro campana: golpe seco con parciales inarmónicos y eco largo
    const pan = rnd(-0.8, 0.8), f = 1850; [[1, 0.1, 1.5], [2.76, 0.06, 0.9], [5.4, 0.03, 0.4]].forEach(([m, v, d]) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(f * m * 1.06, t); o.frequency.exponentialRampToValueAtTime(f * m, t + 0.04); const g = ctx.createGain(); env(g, t, 0.002, v, d); o.connect(g); o.start(t); o.stop(t + d + 0.1); out(g, ambBus, pan, 0.55); });
  }
  function boom(t) { const n = ctx.createBufferSource(); n.buffer = noise.brown; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(280, t); f.frequency.exponentialRampToValueAtTime(40, t + 1.8); const g = ctx.createGain(); env(g, t, 0.02, 0.9, 1.8); n.connect(f); f.connect(g); n.start(t, Math.random() * 2); n.stop(t + 2); out(g, ambBus, rnd(-0.5, 0.5), 0.3); const o = ctx.createOscillator(); o.frequency.setValueAtTime(58, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2); const g2 = ctx.createGain(); env(g2, t, 0.02, 0.5, 1.3); o.connect(g2); o.start(t); o.stop(t + 1.5); out(g2, ambBus, 0, 0.2); }
  function crackle(t) { for (let i = 0; i < 4; i++) { const tt = t + i * rnd(0.02, 0.09), n = ctx.createBufferSource(); n.buffer = noise.white; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rnd(1200, 3500); const g = ctx.createGain(); env(g, tt, 0.001, 0.07, 0.015); n.connect(f); f.connect(g); n.start(tt, Math.random() * 2); n.stop(tt + 0.03); out(g, ambBus, rnd(-1, 1), 0.1); } }
  function gull(t) { const pan = rnd(-0.9, 0.9); for (let i = 0; i < 2; i++) { const tt = t + i * 0.32, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(2100, tt); o.frequency.exponentialRampToValueAtTime(1150, tt + 0.28); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 3; const g = ctx.createGain(); env(g, tt, 0.03, 0.05, 0.25); o.connect(f); f.connect(g); o.start(tt); o.stop(tt + 0.32); out(g, ambBus, pan, 0.3); } }
  function drip(t) { const o = ctx.createOscillator(); const f = rnd(700, 1500); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.05); const g = ctx.createGain(); env(g, t, 0.002, 0.04, 0.07); o.connect(g); o.start(t); o.stop(t + 0.1); out(g, ambBus, rnd(-1, 1), 0.25); }
  function thunder(t) { const n = ctx.createBufferSource(); n.buffer = noise.brown; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(60, t + 3); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4); n.connect(f); f.connect(g); n.start(t, Math.random() * 2); n.stop(t + 3.5); out(g, ambBus, 0, 0.3); }
  const EVENTS = [   // por paisaje: [función, intervalo mínimo, máximo]
    [[frog, 0.5, 2.2], [chirp, 1.2, 4], [bellbird, 5, 11]],
    [[boom, 5, 11], [crackle, 0.6, 2.2], [chirp, 6, 12]],
    [[gull, 3, 8], [chirp, 2, 6]],
    [[frog, 0.3, 1.2], [drip, 0.2, 0.9], [thunder, 9, 18], [chirp, 4, 9]]];

  // ---------------- planificador ----------------
  function pump(until) {
    if (M.on) {
      if (M.next < T() - 0.05) M.next = T() + 0.05;
      while (M.next < until) { if (M.next >= M.pausedUntil) { musicStep(M.next); M.idx++; } else if (Math.random() < 0.0) { /* silencio de la bomba */ } M.next += eighth(); }
    }
    const evs = EVENTS[M.biome];
    evs.forEach(([fn, a, b], i) => { const key = M.biome + ':' + i; if (E.next[key] === undefined || E.next[key] < T() - 1) E.next[key] = T() + rnd(0.2, a + 0.5); while (E.next[key] < until) { fn(E.next[key]); E.next[key] += rnd(a, b); } });
  }

  // ---------------- efectos de juego ----------------
  let streak = 0, lastCollect = -9;
  const sfx = {
    collect(pan) { const t = T(); streak = t - lastCollect < 1.6 ? Math.min(streak + 1, 12) : 0; lastCollect = t; const n = scaleNote(M.biome, 5 + streak); marimba(midi(n + 12), t, 0.8, pan, sfxBus, 0.35); const o = ctx.createOscillator(); o.frequency.value = midi(n + 24); const g = ctx.createGain(); env(g, t, 0.002, 0.05, 0.18); o.connect(g); o.start(t); o.stop(t + 0.22); out(g, sfxBus, pan, 0.4); },
    hit() { const t = T(); const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3); const g = ctx.createGain(); env(g, t, 0.003, 0.9, 0.4); o.connect(g); o.start(t); o.stop(t + 0.5); out(g, sfxBus, 0, 0.1);
      const n = ctx.createBufferSource(); n.buffer = noise.white; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; const g2 = ctx.createGain(); env(g2, t, 0.002, 0.5, 0.18); n.connect(f); f.connect(g2); n.start(t, Math.random()); n.stop(t + 0.25); out(g2, sfxBus, 0, 0.1);
      [0, 1, 6].forEach((d, i) => marimba(midi(48 + d + 12 * i), t + 0.01 * i, 0.5, 0, sfxBus, 0.2)); streak = 0; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(0.18, t); musicBus.gain.linearRampToValueAtTime(0.62, t + 0.9); },
    hawk(pan) { const t = T(); for (let i = 0; i < 2; i++) { const tt = t + i * 0.42, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(2600, tt); o.frequency.exponentialRampToValueAtTime(1500, tt + 0.4); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 2.5; const v = ctx.createOscillator(); v.frequency.value = 38; const vg = ctx.createGain(); vg.gain.value = 70; v.connect(vg); vg.connect(o.frequency); v.start(tt); v.stop(tt + 0.5); const g = ctx.createGain(); env(g, tt, 0.04, 0.16, 0.38); o.connect(f); f.connect(g); o.start(tt); o.stop(tt + 0.5); out(g, sfxBus, pan, 0.35); } },
    puraVida() { const t = T(); [0, 2, 4, 7, 9, 12, 14, 16].forEach((d, i) => marimba(midi(M_ROOT() + d * 1 + 12), t + i * 0.055, 0.8, (i % 2 ? 0.4 : -0.4), sfxBus, 0.4)); pad(t, 2.2); },
    bomba() { const t = T(); M.pausedUntil = t + 3.4; for (let i = 0; i < 3; i++) claves(t + i * 0.13, 1); setTimeout && 0; musicBus.gain.cancelScheduledValues(t); },
    resume() { const t = T(); [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => marimba(midi(M_ROOT() + d), t + i * 0.06, 0.85, i % 2 ? 0.5 : -0.5, sfxBus, 0.45)); },
    over() { const t = T(); [12, 10, 7, 3, 0].forEach((d, i) => marimba(midi(M_ROOT() - 12 + d), t + i * 0.22, 0.8, 0, sfxBus, 0.5)); const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 1.6); const g = ctx.createGain(); env(g, t, 0.01, 0.5, 1.7); o.connect(g); o.start(t); o.stop(t + 1.8); out(g, sfxBus, 0, 0.3); },
    tick() { const t = T(); claves(t, 0.8); },
    biome() { const t = T(); [0, 7, 12].forEach((d, i) => marimba(midi(M_ROOT() + d), t + i * 0.09, 0.55, 0, sfxBus, 0.5)); }
  };
  const M_ROOT = () => BIOME_MUSIC[M.biome].root;
  function pad(t, d) { [0, 7, 12].forEach((s, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(M_ROOT() - 12 + s) * (1 + (i - 1) * 0.004); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1800, t + d * 0.5); f.frequency.linearRampToValueAtTime(300, t + d); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + d * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); o.start(t); o.stop(t + d + 0.1); out(g, sfxBus, 0, 0.5); }); }

  return {
    ctx, pump, sfx, M, midi,
    startMusic() { M.on = true; M.next = T() + 0.1; },
    stopMusic() { M.on = false; },
    setBiome(b) { if (b === M.biome) return; M.biome = b; M.idx = Math.ceil(M.idx / 24) * 24; applyBiome(T()); },   // cambia de tono en un compás limpio
    setIntensity(x) { M.intensity = Math.max(0, Math.min(1, x)); },
    setSpeed(s) { A.wind.f.frequency.setTargetAtTime(350 + s * 14, T(), 0.3); },
    setMuted(m) { master.gain.setTargetAtTime(m ? 0 : 0.85, T(), 0.05); },
    duck(v) { musicBus.gain.setTargetAtTime(v, T(), 0.1); },
    stopAll() { Object.values(A).forEach((l) => l.g.gain.setTargetAtTime(0, T(), 0.5)); M.on = false; }
  };
}
