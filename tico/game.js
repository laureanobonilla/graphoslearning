import { createEngine } from '/quetzal/audio.js';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
let D = null, TX = {};
const t = (k, v) => String(TX[k] == null ? '' : TX[k]).replace(/\{(\w+)\}/g, (m, n) => (v && v[n] != null ? v[n] : m));

// ================= mapa =================
const OUT = [[-85.72,11.07],[-85.65,11.21],[-85.40,11.05],[-85.05,11.0],[-84.70,11.05],[-84.35,10.93],[-84.0,10.78],[-83.75,10.78],[-83.66,10.93],[-83.55,10.70],[-83.45,10.45],[-83.25,10.25],[-83.03,10.0],[-82.80,9.72],[-82.56,9.57],[-82.70,9.52],[-82.93,9.48],[-82.95,9.25],[-82.95,9.0],[-82.82,8.75],[-82.88,8.55],[-82.86,8.30],[-82.87,8.04],[-83.00,8.30],[-83.18,8.62],[-83.20,8.70],[-83.33,8.80],[-83.35,8.55],[-83.28,8.38],[-83.45,8.42],[-83.62,8.45],[-83.70,8.62],[-83.72,8.75],[-83.85,9.20],[-84.15,9.42],[-84.50,9.55],[-84.70,9.70],[-84.83,9.97],[-84.95,10.05],[-85.00,10.12],[-85.30,10.17],[-85.28,9.98],[-85.10,9.83],[-84.97,9.80],[-85.08,9.60],[-85.30,9.72],[-85.60,9.93],[-85.70,10.0],[-85.84,10.32],[-85.82,10.50],[-85.70,10.82],[-85.78,10.95]];
const MB = { w0: -86.05, w1: -82.45, s: 7.95, n: 11.3 };
const KMX = 111.3 * Math.cos(10 * Math.PI / 180), KMY = 110.6;
function mapper(w, h, pad = 6) { const sx = (w - pad * 2) / (MB.w1 - MB.w0), sy = (h - pad * 2) / (MB.n - MB.s), s = Math.min(sx / KMX, sy / KMY) * 1; const ox = (w - (MB.w1 - MB.w0) * KMX * s) / 2, oy = (h - (MB.n - MB.s) * KMY * s) / 2; return { p: (lon, lat) => [ox + (lon - MB.w0) * KMX * s, oy + (MB.n - lat) * KMY * s], inv: (x, y) => [MB.w0 + (x - ox) / (KMX * s), MB.n - (y - oy) / (KMY * s)] }; }
const km = (a, b, c, d) => Math.hypot((c - a) * KMX, (d - b) * KMY);
function drawMap(cv, o = {}) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height, m = mapper(w, h, o.pad || 8); c.clearRect(0, 0, w, h);
  c.fillStyle = o.sea || 'rgba(0,0,0,0)'; c.fillRect(0, 0, w, h);
  c.beginPath(); OUT.forEach(([lo, la], i) => { const [x, y] = m.p(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
  c.fillStyle = o.land || '#2f7a57'; c.fill(); c.lineWidth = Math.max(1.5, w / 120); c.strokeStyle = o.edge || '#bfe9cf'; c.lineJoin = 'round'; c.stroke();
  if (o.route) { c.setLineDash([w / 50, w / 60]); c.strokeStyle = '#ffd98a'; c.lineWidth = Math.max(1.5, w / 110); c.beginPath(); o.route.forEach(([lo, la], i) => { const [x, y] = m.p(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]); }
  if (o.dots) o.dots.forEach(([lo, la, on]) => { const [x, y] = m.p(lo, la); c.beginPath(); c.arc(x, y, w / 55, 0, 7); c.fillStyle = on ? '#f4b63a' : '#ffffff66'; c.fill(); });
  return m;
}
function dot(c, x, y, r, col, glow) { c.save(); c.shadowColor = glow || col; c.shadowBlur = r * 2.2; c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = col; c.fill(); c.restore(); }

// ================= escena =================
const sc = $('scene'), cx = sc.getContext('2d');
let W = 0, H = 0, DPR = 1, U = 1;
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; sc.width = W * DPR; sc.height = H * DPR; cx.setTransform(DPR, 0, 0, DPR, 0, 0); U = Math.min(W / 360, H / 700); }
addEventListener('resize', resize); resize();
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const rgb = (a, k = 1) => `rgb(${(a[0] * k) | 0},${(a[1] * k) | 0},${(a[2] * k) | 0})`;
// paleta por provincia: el viaje va del amanecer en Guanacaste a la noche en Limón
const PAL = {
  gua: { skyT: '#e8743c', skyB: '#ffd48a', far: '#a66a5a', mid: '#c8a050', gnd: '#b8923a', road: '#8a6a3a', sun: .06, night: 0, haze: '#ffd9a0' },
  pun: { skyT: '#2a8fd8', skyB: '#bfe8ff', far: '#4f8fb0', mid: '#2a7aa8', gnd: '#2f9a62', road: '#c9a96a', sun: .22, night: 0, haze: '#d8f2ff' },
  ala: { skyT: '#3a8fe0', skyB: '#cfeaff', far: '#6a9a8a', mid: '#3f8f55', gnd: '#2f8a45', road: '#9a7a4a', sun: .42, night: 0, haze: '#e8f6ff' },
  her: { skyT: '#5a9ae0', skyB: '#ffe9b0', far: '#7a9a80', mid: '#4a9a52', gnd: '#3a9448', road: '#9a7a50', sun: .58, night: 0, haze: '#fff0c0' },
  sj:  { skyT: '#6a4aa8', skyB: '#ff9a7a', far: '#6a5a8a', mid: '#4a4a78', gnd: '#3a5a4a', road: '#6a5a58', sun: .74, night: .1, haze: '#ffb090' },
  car: { skyT: '#2a2468', skyB: '#a8508a', far: '#40386a', mid: '#2e3260', gnd: '#244a44', road: '#5a4a4a', sun: .88, night: .45, haze: '#c070a0' },
  lim: { skyT: '#0a1030', skyB: '#1e3a5a', far: '#14243e', mid: '#12303a', gnd: '#10382e', road: '#3a3a40', sun: 1.0, night: 1, haze: '#2a5a6a' }
};
const NUM = ['sun', 'night']; const COL = ['skyT', 'skyB', 'far', 'mid', 'gnd', 'road', 'haze'];
const toP = (k) => { const p = PAL[k], o = {}; COL.forEach((c) => (o[c] = hex(p[c]))); NUM.forEach((n) => (o[n] = p[n])); return o; };
let pCur = toP('gua'), pFrom = pCur, pTo = pCur, pT = 1;
function setPal(k, instant) { pTo = toP(k); pFrom = instant ? pTo : JSON.parse(JSON.stringify(pCur)); pT = instant ? 1 : 0; }
function palStep(dt) { pT = Math.min(1, pT + dt / 2.5); const e = pT * pT * (3 - 2 * pT), L = (a, b) => a + (b - a) * e; const o = {}; COL.forEach((c) => (o[c] = pFrom[c].map((v, i) => L(v, pTo[c][i])))); NUM.forEach((n) => (o[n] = L(pFrom[n], pTo[n]))); pCur = o; }
const hash = (n) => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const noise = (x, s) => { const i = Math.floor(x), f = x - i, a = hash(i + s * 91), b = hash(i + 1 + s * 91), u = f * f * (3 - 2 * f); return a + (b - a) * u; };
const st = { scroll: 0, speed: 40, boost: 0, tired: 0, t: 0, stage: 'gua', stageIdx: 0 };
const parts = [];   // partículas: polvo, luciérnagas, lluvia, aves
function spawn(p) { if (parts.length < 160) parts.push(p); }

function ridge(c, base, amp, scale, f, seed, col, peaks) {
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W + 6; x += 6) { const wx = (x + st.scroll * f) / scale; let y = base - (noise(wx, seed) * 0.7 + noise(wx * 2.3, seed + 3) * 0.3) * amp; if (peaks) y -= peaks(x + st.scroll * f); c.lineTo(x, y); }
  c.lineTo(W, H); c.closePath(); c.fillStyle = col; c.fill();
}
function volcano(wx, f) { const d = Math.abs(((wx % 1400) + 1400) % 1400 - 700); return Math.max(0, 1 - d / 280) * 130 * U; }
function tree(c, x, y, s, kind) {
  if (kind === 'palm') { c.strokeStyle = '#5a3a1c'; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6 * s, y - 28 * s, x + 2 * s, y - 52 * s); c.stroke(); c.strokeStyle = '#2f8a3f'; c.lineWidth = 3 * s; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.5 + Math.sin(st.t * 1.5 + x) * 0.04; c.beginPath(); c.moveTo(x + 2 * s, y - 52 * s); c.quadraticCurveTo(x + 2 * s + Math.cos(a) * 18 * s, y - 52 * s + Math.sin(a) * 16 * s - 4 * s, x + 2 * s + Math.cos(a) * 30 * s, y - 52 * s + Math.sin(a) * 18 * s + 12 * s); c.stroke(); } return; }
  c.fillStyle = '#4a3220'; c.fillRect(x - 2 * s, y - 22 * s, 4 * s, 22 * s);
  if (kind === 'acacia') { c.fillStyle = rgb([60, 120, 50]); c.beginPath(); c.ellipse(x, y - 28 * s, 26 * s, 9 * s, 0, 0, 7); c.fill(); c.fillStyle = rgb([80, 150, 60]); c.beginPath(); c.ellipse(x - 3 * s, y - 31 * s, 18 * s, 6 * s, 0, 0, 7); c.fill(); }
  else { c.fillStyle = rgb([30, 100, 56]); c.beginPath(); c.ellipse(x, y - 30 * s, 17 * s, 17 * s, 0, 0, 7); c.fill(); c.fillStyle = rgb([50, 130, 66]); c.beginPath(); c.ellipse(x - 5 * s, y - 34 * s, 10 * s, 10 * s, 0, 0, 7); c.fill(); }
}
function shade(a, k) { return rgb(a, k); }
const winLit = (i, night) => hash(i * 7.1) < 0.35 + night * 0.5;
function buildings(c, x, y, s, i, night) { const w = (22 + hash(i) * 20) * s, h = (30 + hash(i + 4) * 60) * s; c.fillStyle = shade(pCur.mid, .55); c.fillRect(x, y - h, w, h); for (let r = 0; r < h / (9 * s) - 1; r++) for (let q = 0; q < w / (7 * s) - 1; q++) { if (winLit(i * 31 + r * 5 + q, night)) { c.fillStyle = '#ffd97a'; c.fillRect(x + 4 * s + q * 7 * s, y - h + 5 * s + r * 9 * s, 3 * s, 4 * s); } } }
function teatro(c, x, y, s) { c.fillStyle = shade(pCur.mid, .8); c.fillRect(x, y - 30 * s, 70 * s, 30 * s); c.fillStyle = shade(pCur.mid, 1.1); c.beginPath(); c.moveTo(x - 4 * s, y - 30 * s); c.lineTo(x + 35 * s, y - 48 * s); c.lineTo(x + 74 * s, y - 30 * s); c.fill(); for (let k = 0; k < 6; k++) { c.fillStyle = '#e8d8b8'; c.fillRect(x + 6 * s + k * 11 * s, y - 28 * s, 4 * s, 28 * s); } c.fillStyle = '#d8a040'; c.beginPath(); c.arc(x + 35 * s, y - 50 * s, 9 * s, Math.PI, 0); c.fill(); }
function basilica(c, x, y, s) { c.fillStyle = '#d8d0c8'; c.fillRect(x, y - 36 * s, 60 * s, 36 * s); [8, 44].forEach((o) => { c.fillRect(x + o * s, y - 64 * s, 8 * s, 28 * s); c.beginPath(); c.moveTo(x + (o - 2) * s, y - 64 * s); c.lineTo(x + (o + 4) * s, y - 82 * s); c.lineTo(x + (o + 10) * s, y - 64 * s); c.fill(); }); c.fillStyle = '#6a8ab0'; c.beginPath(); c.arc(x + 30 * s, y - 40 * s, 14 * s, Math.PI, 0); c.fill(); c.fillStyle = '#ffd97a'; c.fillRect(x + 26 * s, y - 18 * s, 8 * s, 18 * s); }
function bush(c, x, y, s, red) { c.fillStyle = shade(pCur.gnd, .8); c.beginPath(); c.ellipse(x, y - 6 * s, 13 * s, 8 * s, 0, 0, 7); c.fill(); if (red) { c.fillStyle = '#d83a2a'; for (let k = 0; k < 4; k++) c.fillRect(x - 8 * s + k * 5 * s, y - 9 * s - (k % 2) * 3 * s, 2.4 * s, 2.4 * s); } }

function drawScene(dt) {
  const n = pCur.night, hz = H * 0.22, k = st.stage;
  // cielo
  const g = cx.createLinearGradient(0, 0, 0, hz + 40); g.addColorStop(0, rgb(pCur.skyT)); g.addColorStop(1, rgb(pCur.skyB)); cx.fillStyle = g; cx.fillRect(0, 0, W, hz + 60);
  // estrellas
  if (n > 0.05) { cx.fillStyle = '#fff'; for (let i = 0; i < 70; i++) { const x = hash(i) * W, y = hash(i + 9) * hz * 0.9, tw = 0.5 + 0.5 * Math.sin(st.t * 2 + i); cx.globalAlpha = n * (0.3 + 0.7 * tw) * (1 - y / hz * 0.6); cx.fillRect(x, y, 1.6, 1.6); } cx.globalAlpha = 1; }
  // sol / luna siguiendo un arco a lo largo del viaje
  const a = pCur.sun, sx = W * (0.1 + 0.8 * a), sy = hz - Math.sin(Math.min(1, a) * Math.PI) * hz * 0.82 + (a > 0.94 ? -hz * .05 : 0), moon = n > 0.7;
  const rg = cx.createRadialGradient(sx, sy, 0, sx, sy, 90 * U); rg.addColorStop(0, moon ? 'rgba(200,220,255,.5)' : 'rgba(255,230,160,.8)'); rg.addColorStop(1, 'rgba(255,230,160,0)'); cx.fillStyle = rg; cx.fillRect(sx - 100 * U, sy - 100 * U, 200 * U, 200 * U);
  cx.beginPath(); cx.arc(sx, sy, 18 * U, 0, 7); cx.fillStyle = moon ? '#eef3ff' : '#fff3c4'; cx.fill();
  // nubes
  cx.fillStyle = `rgba(255,255,255,${0.55 - n * 0.4})`; for (let i = 0; i < 6; i++) { const x = ((hash(i) * 1400 - st.scroll * (0.02 + i * 0.004) - st.t * 4) % 1400 + 1400) % 1400 - 200, y = hz * (0.12 + hash(i + 2) * 0.45), r = (18 + hash(i + 5) * 22) * U; cx.beginPath(); cx.ellipse(x, y, r * 2.2, r * 0.7, 0, 0, 7); cx.ellipse(x + r, y - r * 0.3, r * 1.3, r * 0.7, 0, 0, 7); cx.fill(); }
  // montañas lejanas con volcán
  ridge(cx, hz + 6, 70 * U, 220 * U, 0.05, 1, rgb(pCur.far), (k === 'gua' || k === 'ala' || k === 'car' || k === 'her') ? (wx) => volcano(wx, 0) : null);
  if (k === 'ala' || k === 'gua') { /* humo del volcán */ const wx = 700 - ((st.scroll * 0.05) % 1400), vx = ((wx % 1400) + 1400) % 1400; cx.fillStyle = `rgba(255,255,255,${.25 - n * .15})`; for (let i = 0; i < 4; i++) { cx.beginPath(); cx.arc(vx + Math.sin(st.t + i) * 6, hz - 120 * U - i * 14 * U, (8 + i * 5) * U, 0, 7); cx.fill(); } }
  // mar en el horizonte (Pacífico y Caribe)
  const sea = k === 'pun' || k === 'lim';
  if (sea) { const sg = cx.createLinearGradient(0, hz - 20, 0, hz + 40); sg.addColorStop(0, rgb(pCur.mid, 1.15)); sg.addColorStop(1, rgb(pCur.mid, .8)); cx.fillStyle = sg; cx.fillRect(0, hz - 14 * U, W, 60 * U); cx.fillStyle = `rgba(255,255,255,${.12 + (1 - n) * .1})`; for (let i = 0; i < 26; i++) { const x = ((hash(i) * W * 1.2 - st.scroll * 0.2 - st.t * 12) % (W * 1.2) + W * 1.2) % (W * 1.2) - 20, y = hz - 8 * U + hash(i + 3) * 46 * U; cx.fillRect(x, y, (6 + hash(i + 8) * 14) * U, 1.6); } }
  else ridge(cx, hz + 28 * U, 38 * U, 120 * U, 0.14, 2, rgb(pCur.mid));
  // bruma
  const hg = cx.createLinearGradient(0, hz - 30, 0, hz + 30); hg.addColorStop(0, rgb(pCur.haze) .replace('rgb', 'rgba').replace(')', ',0)')); hg.addColorStop(.6, rgb(pCur.haze).replace('rgb', 'rgba').replace(')', ',.35)')); hg.addColorStop(1, rgb(pCur.haze).replace('rgb', 'rgba').replace(')', ',0)')); cx.fillStyle = hg; cx.fillRect(0, hz - 30, W, 60);
  // terreno
  const gy = hz + 30 * U, gg = cx.createLinearGradient(0, gy, 0, H); gg.addColorStop(0, rgb(pCur.gnd, 1.1)); gg.addColorStop(1, rgb(pCur.gnd, .55)); cx.fillStyle = gg; cx.fillRect(0, gy, W, H - gy);
  // decorado de la provincia (parallax 0.45), generado por índice: infinito y sin saltos
  const dy = gy + 16 * U, sp = 120 * U, f = 0.45, i0 = Math.floor(st.scroll * f / sp) - 1;
  for (let i = i0; i < i0 + W / sp + 3; i++) {
    const x = i * sp - st.scroll * f + hash(i) * 60 * U, s = (0.8 + hash(i + 1) * 0.5) * U, r = hash(i + 2);
    if (k === 'gua') tree(cx, x, dy, s, r < .7 ? 'acacia' : 'round');
    else if (k === 'pun') { if (r < .75) tree(cx, x, dy, s, 'palm'); }
    else if (k === 'ala') { if (r < .55) bush(cx, x, dy + 6 * U, s * 1.2, true); else tree(cx, x, dy, s, 'round'); }
    else if (k === 'her') { if (r < .6) bush(cx, x, dy + 6 * U, s * 1.2, true); else if (r < .75) { for (let q = 0; q < 5; q++) { cx.fillStyle = ['#e84a6a', '#f4b63a', '#b04ae0', '#fff'][q % 4]; cx.beginPath(); cx.arc(x + q * 8 * U, dy + 2 * U - (q % 2) * 4 * U, 3 * U, 0, 7); cx.fill(); } } else tree(cx, x, dy, s, 'round'); }
    else if (k === 'sj') { if (i % 7 === 0) teatro(cx, x, dy + 6 * U, s * 1.1); else buildings(cx, x, dy + 6 * U, s, i, n); }
    else if (k === 'car') { if (i % 8 === 0) basilica(cx, x, dy + 6 * U, s * 1.1); else if (r < .7) tree(cx, x, dy, s, 'round'); }
    else { if (r < .6) tree(cx, x, dy, s, 'palm'); else tree(cx, x, dy, s, 'round'); }
  }
  // camino
  const ry = H * 0.30, rh = H * 0.045; cx.fillStyle = rgb(pCur.road); cx.fillRect(0, ry, W, H - ry);
  const rg2 = cx.createLinearGradient(0, ry, 0, ry + rh * 2); rg2.addColorStop(0, 'rgba(0,0,0,.28)'); rg2.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = rg2; cx.fillRect(0, ry, W, rh * 2);
  cx.strokeStyle = 'rgba(0,0,0,.22)'; cx.lineWidth = 2; for (const o of [0.35, 0.8]) { cx.beginPath(); cx.moveTo(0, ry + rh * o); cx.lineTo(W, ry + rh * o); cx.stroke(); }
  // postes de cerca en primer plano (parallax 1.0)
  const ps = 90 * U, p0 = Math.floor(st.scroll / ps) - 1; cx.strokeStyle = 'rgba(40,24,10,.8)'; cx.lineWidth = 3 * U; for (let i = p0; i < p0 + W / ps + 3; i++) { const x = i * ps - st.scroll; cx.beginPath(); cx.moveTo(x, ry + 2 * U); cx.lineTo(x, ry - 22 * U); cx.stroke(); } cx.lineWidth = 1.5 * U; cx.beginPath(); cx.moveTo(0, ry - 16 * U); cx.lineTo(W, ry - 16 * U); cx.moveTo(0, ry - 8 * U); cx.lineTo(W, ry - 8 * U); cx.stroke();
  drawCart(ry + rh * 0.9, dt);
  // partículas
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.x += (p.vx - (p.fix ? 0 : st.speed * 0.0)) * dt; p.y += p.vy * dt; if (p.type === 'dust') { cx.fillStyle = `rgba(200,170,120,${p.life * .5})`; cx.beginPath(); cx.arc(p.x, p.y, p.r * (1.6 - p.life), 0, 7); cx.fill(); } else if (p.type === 'fly') { const a = Math.max(0, Math.sin(p.life * 5 + p.ph)) * .9; cx.fillStyle = `rgba(210,255,120,${a})`; cx.shadowColor = '#d6ff70'; cx.shadowBlur = 8; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); cx.shadowBlur = 0; } else if (p.type === 'rain') { cx.strokeStyle = 'rgba(190,220,255,.35)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - 3, p.y + 12); cx.stroke(); } else if (p.type === 'bird') { cx.strokeStyle = 'rgba(20,20,40,.7)'; cx.lineWidth = 1.6; const w = Math.sin(st.t * 10 + p.ph) * 4; cx.beginPath(); cx.moveTo(p.x - 7, p.y + w); cx.quadraticCurveTo(p.x, p.y - 4, p.x + 7, p.y + w); cx.stroke(); } }
  const fly = k === 'car' || k === 'lim' || k === 'sj'; if (fly && Math.random() < dt * 4) spawn({ type: 'fly', x: Math.random() * W, y: ry - Math.random() * 50 * U, vx: (Math.random() - .5) * 10 - st.speed * .05, vy: (Math.random() - .5) * 8, life: 4, r: 1.8, ph: Math.random() * 6 });
  if (k === 'lim') for (let i = 0; i < 3; i++) spawn({ type: 'rain', x: Math.random() * (W + 40), y: -10, vx: -40, vy: 520 + Math.random() * 120, life: H / 560, r: 1 });
  if ((k === 'gua' || k === 'pun' || k === 'ala') && Math.random() < dt * 0.4) spawn({ type: 'bird', x: -20, y: hz * (0.2 + Math.random() * 0.5), vx: 50 + Math.random() * 30, vy: -4, life: W / 60, r: 1, ph: Math.random() * 6 });
  // anochecer: viñeta
  if (n > 0.1) { const v = cx.createRadialGradient(W / 2, H * .3, W * .2, W / 2, H * .3, W * .9); v.addColorStop(0, 'rgba(0,0,20,0)'); v.addColorStop(1, `rgba(0,0,20,${n * .45})`); cx.fillStyle = v; cx.fillRect(0, 0, W, H); }
}
function wheel(c, x, y, r, a) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = '#4a2a14'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); const cols = ['#e0402f', '#f4b63a', '#2a6fc0', '#35a874']; for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % 4]; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * 0.86, i * Math.PI / 4, (i + 1) * Math.PI / 4); c.closePath(); c.fill(); c.strokeStyle = '#fff4dc'; c.lineWidth = r * .06; c.stroke(); } c.fillStyle = '#fff4dc'; c.beginPath(); c.arc(0, 0, r * .22, 0, 7); c.fill(); c.fillStyle = '#4a2a14'; c.beginPath(); c.arc(0, 0, r * .09, 0, 7); c.fill(); c.restore(); }
function ox(c, x, y, ph, s, col) { c.save(); c.translate(x, y); c.scale(s, s); c.strokeStyle = col; c.lineWidth = 5; c.lineCap = 'round'; for (const [lx, d] of [[-16, 0], [-8, Math.PI], [12, Math.PI], [20, 0]]) { const sw = Math.sin(ph + d) * 6 * Math.min(1, st.speed / 120); c.beginPath(); c.moveTo(lx, -14); c.lineTo(lx + sw, 0); c.stroke(); } c.fillStyle = col; c.beginPath(); c.ellipse(0, -22, 26, 13, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(26, -26, 8, 7, 0.3, 0, 7); c.fill(); c.strokeStyle = '#f4e8d0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(25, -32); c.quadraticCurveTo(27, -40, 32, -38); c.stroke(); c.fillStyle = '#2a1608'; c.fillRect(31, -26, 3, 3); c.restore(); }
function drawCart(gy, dt) {
  const bob = Math.sin(st.t * 9) * Math.min(1.6, st.speed / 100) * U, x = W * 0.34, s = U * 1.1, ph = st.scroll * 0.045;
  // sombra
  cx.fillStyle = 'rgba(0,0,0,.25)'; cx.beginPath(); cx.ellipse(x + 22 * s, gy + 3, 90 * s, 7 * s, 0, 0, 7); cx.fill();
  // yunta y bueyes
  const tired = st.tired > 0 ? 0.55 : 1;
  ox(cx, x + 118 * s, gy + bob * .5, ph, s * 1.0, '#5a3418'); ox(cx, x + 88 * s, gy + bob * .5 + 2, ph + 1, s * 1.0, '#7a4a24');
  cx.strokeStyle = '#3a2210'; cx.lineWidth = 3 * s; cx.beginPath(); cx.moveTo(x + 28 * s, gy - 18 * s + bob); cx.lineTo(x + 112 * s, gy - 32 * s + bob * .5); cx.stroke();
  // boyero
  const bx = x + 150 * s, wl = Math.sin(ph * 1.1) * 4 * s * Math.min(1, st.speed / 100); cx.strokeStyle = '#2a1a30'; cx.lineWidth = 3.2 * s; cx.beginPath(); cx.moveTo(bx, gy - 18 * s); cx.lineTo(bx + wl, gy); cx.moveTo(bx, gy - 18 * s); cx.lineTo(bx - wl, gy); cx.stroke(); cx.fillStyle = '#e8d8c0'; cx.fillRect(bx - 5 * s, gy - 38 * s, 10 * s, 20 * s); cx.fillStyle = '#c88a5a'; cx.beginPath(); cx.arc(bx, gy - 43 * s, 5 * s, 0, 7); cx.fill(); cx.fillStyle = '#e8d8a0'; cx.beginPath(); cx.ellipse(bx, gy - 47 * s, 10 * s, 2.5 * s, 0, 0, 7); cx.fill(); cx.fillRect(bx - 5 * s, gy - 52 * s, 10 * s, 5 * s);
  cx.strokeStyle = '#6a4a20'; cx.lineWidth = 2 * s; cx.beginPath(); cx.moveTo(bx + 4 * s, gy - 30 * s); cx.lineTo(bx - 40 * s, gy - 54 * s); cx.stroke();
  // carreta: caja de madera con barandas y toldo
  const by = gy - 22 * s + bob; cx.fillStyle = '#c0661e'; cx.fillRect(x - 38 * s, by - 20 * s, 76 * s, 20 * s); cx.fillStyle = '#e8b030'; cx.fillRect(x - 38 * s, by - 20 * s, 76 * s, 4 * s); cx.fillStyle = '#2a6fc0'; cx.fillRect(x - 38 * s, by - 6 * s, 76 * s, 3 * s);
  cx.strokeStyle = '#7a3a10'; cx.lineWidth = 2.5 * s; for (let i = 0; i < 6; i++) { cx.beginPath(); cx.moveTo(x - 36 * s + i * 14 * s, by - 20 * s); cx.lineTo(x - 36 * s + i * 14 * s, by - 46 * s); cx.stroke(); } cx.beginPath(); cx.moveTo(x - 36 * s, by - 46 * s); cx.lineTo(x + 36 * s, by - 46 * s); cx.stroke();
  cx.fillStyle = '#e0402f'; cx.beginPath(); cx.moveTo(x - 20 * s, by - 20 * s); cx.lineTo(x - 22 * s, by - 34 * s); cx.lineTo(x + 8 * s, by - 34 * s); cx.lineTo(x + 6 * s, by - 20 * s); cx.fill();   // saco de café
  cx.fillStyle = '#35a874'; cx.beginPath(); cx.ellipse(x + 22 * s, by - 24 * s, 10 * s, 6 * s, 0, 0, 7); cx.fill();   // bananos
  wheel(cx, x - 10 * s, gy - 18 * s + bob, 21 * s, st.scroll * 0.06); wheel(cx, x + 24 * s, gy - 18 * s + bob, 21 * s, st.scroll * 0.06 + 0.4);
  if (st.speed > 140 && Math.random() < dt * 22) spawn({ type: 'dust', x: x - 30 * s, y: gy - 2, vx: -50 - st.speed * .2, vy: -10 - Math.random() * 20, life: 1, r: (3 + Math.random() * 4) * s });
}

// ================= audio =================
let ctx = null, eng = null, muted = false;
const BIO = { gua: 1, pun: 2, ala: 0, her: 0, sj: 2, car: 0, lim: 3 };
function initAudio() { if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; } try { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); eng = createEngine(ctx); eng.setMuted(muted); } catch (e) { ctx = eng = null; } }
document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });

// ================= juego =================
const G = { score: 0, lives: 3, streak: 0, best: 0, ok: 0, steps: 0, c5050: 2, ctime: 2, stage: 0, step: 0, used: new Set(), usedL: new Set(), usedO: new Set(), state: 'menu', tl: 0, tmax: 1, cur: null, plan: [], routeFrom: null };
let bestStored = 0; try { bestStored = +localStorage.getItem('tico_best') || 0; } catch (e) {}
const STAGES = () => D.etapas;
function routeNodes() { const s = STAGES(); return [[-85.62, 10.86]].concat(s.map((e) => [e.lon, e.lat])); }
function markerPos() { const n = routeNodes(), i = G.stage, f = G.state === 'menu' ? 0 : G.step / 3, a = n[i], b = n[Math.min(i + 1, n.length - 1)]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
let mm = null;
function drawMini() { const cv = $('mini'); const e = STAGES(); const nodes = routeNodes(); const m = drawMap(cv, { pad: 10, route: nodes, dots: e.map((s, i) => [s.lon, s.lat, i < G.stage || (i === G.stage && G.step > 0 && false)]), land: '#2c6e57', edge: '#c8efd8' }); const c = cv.getContext('2d'); const [lo, la] = markerPos(), [x, y] = m.p(lo, la); dot(c, x, y, 8, '#e0402f', '#ff8a70'); }
function livesTxt() { $('lives').textContent = '♥'.repeat(G.lives) + '♡'.repeat(3 - G.lives); }
function hud() { $('score').textContent = G.score; livesTxt(); $('streak').textContent = G.streak > 1 ? t('racha', { n: Math.min(G.streak, 5) }) : ''; $('c5050').textContent = `${t('comodin_5050')} ×${G.c5050}`; $('c5050').disabled = G.c5050 <= 0 || G.state !== 'q'; $('ctime').textContent = `${t('comodin_tiempo')} ×${G.ctime}`; $('ctime').disabled = G.ctime <= 0 || !(G.state === 'q' || G.state === 'reto'); }
function pickQs(stage) {
  const key = stage.clave, tag = shuffle(D.preguntas.filter((q) => q.etapa === key && !G.used.has(q.id))), gen = shuffle(D.preguntas.filter((q) => !q.etapa && !G.used.has(q.id))), tgt = 1 + G.stage / 3;
  gen.sort((a, b) => Math.abs(a.dificultad - tgt) - Math.abs(b.dificultad - tgt) + (Math.random() - .5) * 1.4);
  const out = tag.slice(0, 2); while (out.length < 2 && gen.length) out.push(gen.shift()); out.forEach((q) => G.used.add(q.id)); return out;
}
function planStage(stage) {
  const qs = pickQs(stage), mapa = G.stage % 2 === 0; let reto = null;
  if (mapa) { let pool = D.lugares.filter((l) => l.etapa === stage.clave && !G.usedL.has(l.id)); if (!pool.length) pool = D.lugares.filter((l) => !G.usedL.has(l.id)); const l = shuffle(pool)[0]; G.usedL.add(l.id); reto = { type: 'mapa', l }; }
  else { const o = shuffle(D.ordenes.filter((o) => !G.usedO.has(o.id)))[0] || shuffle(D.ordenes)[0]; G.usedO.add(o.id); reto = { type: 'orden', o }; }
  G.plan = [{ type: 'q', q: qs[0] }, { type: 'q', q: qs[1] }, reto].filter((s) => s.q || s.l || s.o);
}
function show(id, on) { $(id).hidden = !on; }
function startGame() {
  initAudio(); Object.assign(G, { score: 0, lives: 3, streak: 0, ok: 0, steps: 0, c5050: 2, ctime: 2, stage: 0, step: 0, maxStreak: 0 }); G.used.clear(); G.usedL.clear(); G.usedO.clear();
  show('menu', false); show('end', false); show('hud', true); startStage(0); if (eng) { eng.startMusic(); }
}
function startStage(i) {
  G.stage = i; G.step = 0; const s = STAGES()[i]; st.stage = s.clave; setPal(s.clave); planStage(s); G.state = 'splash';
  $('s_n').textContent = t('etapa', { n: i + 1, total: STAGES().length }); $('s_name').textContent = s.nombre; $('s_nick').textContent = s.apodo; $('s_intro').textContent = s.intro; $('s_dato').textContent = s.dato; $('go').textContent = t('btn_seguir'); show('splash', true); show('card', false);
  $('zone').textContent = s.nombre; hud(); drawMini(); st.boost = 0.4;
  if (eng) { eng.setBiome(BIO[s.clave]); eng.sfx.biome(); }
}
function nextStep() {
  if (G.step >= G.plan.length) { if (G.stage + 1 >= STAGES().length) return finish(true); return startStage(G.stage + 1); }
  const p = G.plan[G.step]; show('card', true); $('fb').hidden = true; $('opts').innerHTML = ''; $('extra').innerHTML = ''; $('opts').hidden = false; drawMini();
  if (p.type === 'q') askQ(p.q); else if (p.type === 'mapa') askMap(p.l); else askOrder(p.o);
}
function setTimer(sec) { G.tl = sec; G.tmax = sec; G.lastTick = Math.ceil(sec); }
function askQ(q) {
  G.state = 'q'; G.cur = q; $('cat').textContent = q.categoria; $('q').textContent = q.pregunta; setTimer(20 + 3 * (q.dificultad - 1) + (q.pregunta.length > 90 ? 3 : 0));
  q.opciones.forEach((o, i) => { const b = document.createElement('button'); b.className = 'opt'; b.dataset.k = 'ABCD'[i]; b.textContent = o; b.onclick = () => answer(i); $('opts').appendChild(b); }); $('comodines').hidden = false; hud();
}
function floatPts(txt) { const e = document.createElement('div'); e.textContent = txt; e.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);font:800 36px Georgia,serif;color:#f4b63a;text-shadow:0 3px 12px #000a;pointer-events:none;transition:all 1s ease-out;opacity:1;z-index:9'; document.body.appendChild(e); requestAnimationFrame(() => { e.style.top = '12%'; e.style.opacity = '0'; }); setTimeout(() => e.remove(), 1100); }
function good(pts, label) { G.ok++; G.streak++; G.maxStreak = Math.max(G.maxStreak || 0, G.streak); G.score += pts; st.boost = 2.2; if (eng) eng.sfx.collect(0); floatPts('+' + pts); }
function bad() { G.lives--; G.streak = 0; st.tired = 1.6; if (eng) eng.sfx.hit(); const f = $('fx'); f.style.opacity = 1; setTimeout(() => (f.style.opacity = 0), 220); if (navigator.vibrate) navigator.vibrate(90); }
function answer(i) {
  if (G.state !== 'q') return; G.state = 'fb'; const q = G.cur, ok = i === q.correcta, bs = [...$('opts').children];
  bs.forEach((b, k) => { b.disabled = true; if (k === q.correcta) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); else b.classList.add('gone'); });
  let title;
  if (i >= 0 && ok) { const pts = Math.round((100 + Math.floor(G.tl) * 4) * (1 + 0.25 * Math.min(G.streak, 4))); good(pts); title = t('ok_' + (1 + ((Math.random() * 6) | 0))); }
  else { bad(); title = i < 0 ? t('tiempo_agotado') : t('mal_' + (1 + ((Math.random() * 4) | 0))); if (i < 0) bs.forEach((b, k) => { if (k === q.correcta) b.classList.remove('gone'); }); }
  endStep(title, (ok ? '' : t('respuesta_era', { r: q.opciones[q.correcta] }) + '\n') + (q.explicacion || ''), ok);
}
function endStep(title, text, ok) {
  G.steps++; $('fbt').textContent = title; $('fbx').textContent = text; $('fbx').style.whiteSpace = 'pre-line'; $('next').textContent = t('btn_seguir'); $('fb').hidden = false; $('comodines').hidden = true; hud();
  $('card').scrollTo({ top: 99999, behavior: 'smooth' });
  if (G.lives <= 0) { $('next').onclick = () => finish(false); } else $('next').onclick = () => { G.step++; nextStep(); };
}
$('c5050').onclick = () => { if (G.state !== 'q' || G.c5050 <= 0) return; G.c5050--; const q = G.cur, wrong = shuffle([0, 1, 2, 3].filter((k) => k !== q.correcta)).slice(0, 2); [...$('opts').children].forEach((b, k) => { if (wrong.includes(k)) b.classList.add('gone'); }); hud(); if (eng) eng.sfx.tick(); };
$('ctime').onclick = () => { if (!(G.state === 'q' || G.state === 'reto') || G.ctime <= 0) return; G.ctime--; G.tl = Math.min(G.tl + 10, 60); G.tmax = Math.max(G.tmax, G.tl); hud(); if (eng) eng.sfx.resume(); };
// ---- reto de mapa
function askMap(l) {
  G.state = 'reto'; $('cat').textContent = t('reto_mapa'); $('q').textContent = `${t('reto_mapa_instr')} ${l.nombre}`; setTimer(25); $('comodines').hidden = false; $('opts').hidden = true;
  const ex = $('extra'); ex.innerHTML = `<p style="margin:0 0 8px;opacity:.8;font-size:14px">${l.pista}</p>`; const cv = document.createElement('canvas'); const w = Math.min(420, innerWidth - 28); cv.width = w * 2; cv.height = Math.round(w * 0.92) * 2; cv.style.height = Math.round(w * 0.92) + 'px'; ex.appendChild(cv);
  const m = drawMap(cv, { sea: '#0a3a52', land: '#2f8a60', edge: '#d6f5e2', pad: 16 }); let pin = null; const c = cv.getContext('2d'); const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = t('btn_marcar'); btn.disabled = true; ex.appendChild(btn);
  const redraw = () => { drawMap(cv, { sea: '#0a3a52', land: '#2f8a60', edge: '#d6f5e2', pad: 16 }); if (pin) dot(c, pin[0], pin[1], 12, '#e0402f', '#ff8a70'); };
  const tap = (e) => { if (G.state !== 'reto' || btn.hidden) return; const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * cv.width, y = (e.clientY - r.top) / r.height * cv.height; pin = [x, y]; btn.disabled = false; redraw(); if (eng) eng.sfx.tick(); };
  cv.addEventListener('pointerdown', tap);
  const resolve = (timeout) => {
    if (G.state !== 'reto') return; G.state = 'fb'; btn.hidden = true; redraw(); const real = m.p(l.lon, l.lat); let title, text, d = null;
    if (pin && !timeout) { const [lo, la] = m.inv(pin[0], pin[1]); d = Math.round(km(lo, la, l.lon, l.lat)); c.strokeStyle = '#f4b63a'; c.lineWidth = 4; c.setLineDash([10, 8]); c.beginPath(); c.moveTo(pin[0], pin[1]); c.lineTo(real[0], real[1]); c.stroke(); c.setLineDash([]); }
    dot(c, real[0], real[1], 12, '#f4b63a', '#fff2a0'); c.fillStyle = '#fff'; c.font = '700 26px Trebuchet MS'; c.textAlign = 'center'; c.fillText(l.nombre, clamp(real[0], 100, cv.width - 100), real[1] - 22);
    if (d == null) { bad(); title = t('tiempo_agotado'); text = ''; }
    else if (d > 120) { bad(); title = t('mal_2'); text = t('distancia', { km: d }); }
    else { const pts = Math.round(250 * Math.exp(-d / 45)) + Math.floor(G.tl) * 3; good(pts); title = d < 12 ? t('distancia_exacto') : t('ok_' + (1 + ((Math.random() * 6) | 0))); text = t('distancia', { km: d }) + `  ·  +${pts}`; }
    endStep(title, text, d != null && d <= 120);
  };
  btn.onclick = () => resolve(false); G.onTimeout = () => resolve(true); hud();
}
// ---- reto de cronología
function askOrder(o) {
  G.state = 'reto'; $('cat').textContent = t('reto_orden'); $('q').textContent = `${o.titulo}. ${t('reto_orden_instr')}`; setTimer(45); $('comodines').hidden = false; $('opts').hidden = true;
  const sorted = o.items.slice().sort((a, b) => a.anio - b.anio), items = shuffle(o.items), ex = $('extra'), list = document.createElement('div'); list.className = 'ordl'; ex.appendChild(list); let nextI = 0, errs = 0;
  items.forEach((it) => { const b = document.createElement('button'); b.className = 'ob'; b.innerHTML = `<b></b><span>${it.texto}</span>`; b.onclick = () => {
    if (G.state !== 'reto' || b.classList.contains('done')) return;
    if (it === sorted[nextI] || it.anio === sorted[nextI].anio) { b.classList.add('done'); b.querySelector('b').textContent = ++nextI; b.insertAdjacentHTML('beforeend', `<i>${it.anio}</i>`); if (eng) eng.sfx.collect(0); G.score += 15; hud();
      if (nextI === sorted.length) { G.state = 'fb'; const pts = Math.max(60, 250 - errs * 50) + Math.floor(G.tl) * 3; good(pts); endStep(t('orden_listo'), `+${pts}`, true); } }
    else { errs++; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); G.tl = Math.max(0, G.tl - 4); if (eng) eng.sfx.tick(); if (navigator.vibrate) navigator.vibrate(40); } }; list.appendChild(b); });
  G.onTimeout = () => { if (G.state !== 'reto') return; G.state = 'fb'; bad(); [...list.children].forEach((b) => { b.classList.add('done'); }); list.innerHTML = ''; sorted.forEach((it, k) => { const b = document.createElement('div'); b.className = 'ob done'; b.innerHTML = `<b>${k + 1}</b><span>${it.texto}</span><i>${it.anio}</i>`; list.appendChild(b); }); endStep(t('tiempo_agotado'), t('orden_final'), false); }; hud();
}
function finish(won) {
  G.state = 'end'; show('card', false); show('hud', false); show('end', true); if (eng) { eng.stopMusic(); won ? (eng.sfx.puraVida(), setTimeout(() => eng && eng.sfx.resume(), 900)) : eng.sfx.over(); }
  const sc = G.score; if (sc > bestStored) { bestStored = sc; try { localStorage.setItem('tico_best', sc); } catch (e) {} }
  const ratio = G.ok / Math.max(1, G.steps), rk = ratio >= .9 ? 5 : ratio >= .75 ? 4 : ratio >= .6 ? 3 : ratio >= .4 ? 2 : 1;
  $('e_title').textContent = won ? t('fin_titulo') : t('gameover_titulo'); $('e_rank').textContent = won ? t('rango_' + rk) : ''; $('e_text').textContent = won ? t('fin_sub') : t('gameover_texto', { lugar: STAGES()[G.stage].nombre });
  $('e_res').textContent = [t('puntos', { n: sc }), t('resultado_aciertos', { n: G.ok, t: G.steps }), t('resultado_racha', { n: G.maxStreak || 0 }), t('mejor', { n: bestStored })].join('\n'); $('again').textContent = t('btn_otra'); st.stage = won ? 'lim' : st.stage;
}
$('go').onclick = () => { show('splash', false); nextStep(); }; $('again').onclick = startGame; $('play').onclick = startGame;
$('mute').onclick = () => { muted = !muted; $('mute').classList.toggle('off', muted); eng && eng.setMuted(muted); };

// ================= bucle =================
let last = performance.now(), tickAcc = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; st.t += dt; palStep(dt);
  st.boost = Math.max(0, st.boost - dt); st.tired = Math.max(0, st.tired - dt);
  const target = st.tired > 0 ? 8 : st.boost > 0 ? 330 : G.state === 'q' || G.state === 'reto' ? 48 : 70; st.speed += (target - st.speed) * Math.min(1, dt * 3); st.scroll += st.speed * dt;
  if (G.state === 'q' || G.state === 'reto') {
    G.tl -= dt; const bar = document.querySelector('#timer i'); bar.style.width = clamp(G.tl / G.tmax, 0, 1) * 100 + '%'; $('timer').classList.toggle('low', G.tl < 6);
    if (G.tl < 6 && Math.ceil(G.tl) < G.lastTick) { G.lastTick = Math.ceil(G.tl); if (eng && G.tl > 0) eng.sfx.tick(); }
    if (eng) eng.setIntensity(G.tl < 6 ? 0.7 : 0.3 + Math.min(0.25, G.streak * 0.06));
    if (G.tl <= 0) { if (G.state === 'q') answer(-1); else if (G.onTimeout) G.onTimeout(); }
  }
  drawScene(dt); if (eng) eng.pump(ctx.currentTime + 0.5); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ================= carga de datos (todo viene de la BD) =================
async function load() {
  $('m_title').textContent = '…';
  try {
    const r = await fetch('/.netlify/functions/tico'); if (!r.ok) throw new Error(r.status); D = await r.json(); TX = D.textos || {};
    $('m_title').textContent = t('titulo'); $('m_sub').textContent = t('subtitulo'); $('m_how').textContent = t('instrucciones'); $('play').textContent = t('btn_jugar'); $('play').disabled = false;
    $('best').textContent = bestStored ? t('mejor', { n: bestStored }) : ''; $('mute').setAttribute('aria-label', t('sonido'));
    setPal('gua', true);
  } catch (e) { $('m_title').textContent = 'Travesía Tica'; $('m_how').textContent = 'No se pudieron cargar las preguntas. Revisa tu conexión.'; $('play').textContent = 'Reintentar'; $('play').disabled = false; $('play').onclick = () => location.reload(); }
}
load();
window.__tico = { G, st, get D() { return D; }, startGame, nextStep, answer, finish, get eng() { return eng; } };
