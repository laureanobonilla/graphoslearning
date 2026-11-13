import * as THREE from './vendor/three.module.min.js';
import { createEngine } from './audio.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BIOMES = [
  { n: 'Bosque nuboso · Monteverde', sky: 0xbfe6e0, fog: 0xcfeee6, ground: 0x2f7a4a, light: 0xffffff },
  { n: 'Volcán Arenal', sky: 0x5a2a2a, fog: 0x7a3a2c, ground: 0x2a1f1c, light: 0xffb27a },
  { n: 'Costa del Pacífico', sky: 0x7fd3ff, fog: 0xbfeaff, ground: 0x1d7ea8, light: 0xfff2cf },
  { n: 'Tortuguero · Caribe', sky: 0x6c8f93, fog: 0x8fb0b0, ground: 0x1f5d4e, light: 0xdfeee8 }
];
const BIOME_LEN = 700;   // metros por paisaje

// ---------- escena ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe6e0, 25, 150);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
camera.position.set(0, 4.5, 8);
const hemi = new THREE.HemisphereLight(0xffffff, 0x335544, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(-20, 40, 10); scene.add(sun);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 72 : 62; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), new THREE.MeshLambertMaterial({ color: BIOMES[0].ground }));
ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.5, -60); scene.add(ground);
// franjas que pasan para dar sensación de velocidad
const stripes = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })); m.rotation.x = -Math.PI / 2; m.position.set((i % 2 ? 1 : -1) * rnd(3, 12), -0.45, -i * 12); scene.add(m); stripes.push(m); }

// ---------- el quetzal ----------
const bird = new THREE.Group();
const M = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 });
const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), M(0x1fb26b)); body.scale.set(1, 0.9, 1.7); bird.add(body);
const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), M(0xd8252b)); chest.position.set(0, -0.16, -0.3); chest.scale.set(1, 0.8, 1.2); bird.add(chest);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), M(0x16a05d)); head.position.set(0, 0.15, -0.8); bird.add(head);
const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), M(0xf2c230)); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.1, -1.12); bird.add(beak);
const crest = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M(0x38d68a)); crest.position.set(0, 0.38, -0.78); crest.scale.set(0.8, 0.9, 1); bird.add(crest);
const wings = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.3, 0.1, -0.1); const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.8), M(0x0f8f6a)); w.position.x = s * 0.75; p.add(w); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.5), M(0x1d5dbf)); tip.position.set(s * 1.6, 0, 0.05); p.add(tip); bird.add(p); return { p, s }; });
const tails = []; for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 3.4), M(0x19b8a6, 0x063a34)); t.position.set((i ? 1 : -1) * 0.12, 0, 2.5); bird.add(t); tails.push(t); }
scene.add(bird);

// ---------- escenario ----------
const geo = { cone: new THREE.ConeGeometry(1, 2, 7), cyl: new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), sph: new THREE.SphereGeometry(1, 8, 6), vol: new THREE.ConeGeometry(1, 1, 9), box: new THREE.BoxGeometry(1, 1, 1), dod: new THREE.DodecahedronGeometry(1, 0), ring: new THREE.TorusGeometry(1, 0.12, 6, 14) };
const mats = { leaf: M(0x2e8b4f), leaf2: M(0x1f6b3f), trunk: M(0x6b4a2a), cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), lava: M(0x3a2a26, 0x000000), lavaGlow: M(0xff5a1e, 0xff4a10), sand: M(0xe6d6a0), rock: M(0x6c6560), wood: M(0x7a5230), hawk: M(0x6a3f22), gold: new THREE.MeshPhongMaterial({ color: 0xf5c542, emissive: 0x7a5a00, shininess: 90, specular: 0xffffff }) };
const scenery = [];
function makeScenery() {
  const g = new THREE.Group();
  g.userData = { kind: -1 };
  scene.add(g); scenery.push(g); return g;
}
function fillScenery(g, biome) {
  while (g.children.length) g.remove(g.children[0]);
  const side = Math.random() < 0.5 ? -1 : 1, x = side * rnd(11, 55), s = rnd(0.8, 1.6);
  let h = 0;
  if (biome === 0) {   // árboles altos y nubes
    if (Math.random() < 0.28) { const c = new THREE.Group(); for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(geo.sph, mats.cloud); m.scale.set(rnd(3, 5), rnd(1.5, 2.5), rnd(2, 3.5)); m.position.set(rnd(-4, 4), rnd(-0.5, 0.5), rnd(-2, 2)); c.add(m); } g.add(c); h = rnd(14, 26); }
    else { const t = new THREE.Mesh(geo.cyl, mats.trunk); t.scale.set(1.6 * s, 5 * s, 1.6 * s); t.position.y = 4 * s; g.add(t); for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(geo.cone, i % 2 ? mats.leaf : mats.leaf2); l.scale.set(3.2 * s - i * 0.5, 2.4 * s, 3.2 * s - i * 0.5); l.position.y = (7 + i * 2) * s; g.add(l); } }
  } else if (biome === 1) {   // conos de volcán, algunos con lava
    const big = Math.random() < 0.35, v = new THREE.Mesh(geo.vol, mats.lava); const sc = big ? rnd(14, 24) : rnd(3, 8); v.scale.set(sc, sc * 1.2, sc); v.position.y = sc * 0.6 - 0.5; g.add(v);
    if (Math.random() < 0.7) { const gl = new THREE.Mesh(geo.sph, mats.lavaGlow); gl.scale.set(sc * 0.12, sc * 0.08, sc * 0.12); gl.position.y = sc * 1.2 - 0.5; g.add(gl); }
  } else if (biome === 2) {   // palmeras y rocas costeras
    if (Math.random() < 0.7) { const t = new THREE.Mesh(geo.cyl, mats.trunk); t.scale.set(1.4, 4.5, 1.4); t.position.y = 3.6; t.rotation.z = rnd(-0.2, 0.2); g.add(t); for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(geo.box, mats.leaf); l.scale.set(3.4, 0.08, 0.7); l.position.set(0, 7.2, 0); l.rotation.y = i * 1.05; l.rotation.z = 0.35; g.add(l); } }
    else { const r = new THREE.Mesh(geo.dod, mats.rock); r.scale.set(rnd(2, 5), rnd(2, 6), rnd(2, 5)); r.position.y = 1; g.add(r); }
  } else {   // selva caribeña: árboles densos y bajos
    const t = new THREE.Mesh(geo.cyl, mats.trunk); t.scale.set(1.8 * s, 4 * s, 1.8 * s); t.position.y = 3.2 * s; g.add(t); const l = new THREE.Mesh(geo.sph, mats.leaf2); l.scale.set(4.2 * s, 2.6 * s, 4.2 * s); l.position.y = 7.4 * s; g.add(l);
  }
  g.position.set(x, h, -rnd(110, 175));
}
for (let i = 0; i < 46; i++) { const g = makeScenery(); fillScenery(g, 0); g.position.z = -rnd(0, 170); }

// ---------- objetos de juego ----------
const objs = [];   // {mesh, type, r}
function addObj(mesh, type, r) { scene.add(mesh); objs.push({ mesh, type, r, t: Math.random() * 6 }); return mesh; }
function spawnSpheres(z, n) {   // arco o línea de esferas doradas
  const x0 = rnd(-5, 5), y0 = rnd(2, 6), dx = rnd(-0.7, 0.7), dy = rnd(-0.4, 0.4), arc = Math.random() < 0.5;
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo.sph, mats.gold); m.scale.setScalar(0.5); m.position.set(clamp(x0 + dx * i, -6.2, 6.2), clamp(y0 + dy * i + (arc ? Math.sin(i / (n - 1) * Math.PI) * 1.6 : 0), 1, 7.2), z - i * 3); addObj(m, 'gold', 0.9); }
}
function spawnRock(z, biome) {
  const m = new THREE.Mesh(geo.dod, biome === 1 ? mats.lava : mats.rock); const s = rnd(1.1, 1.8); m.scale.set(s, s * 1.2, s); m.position.set(rnd(-6, 6), rnd(1.2, 6.5), z);
  if (biome === 1) { const g = new THREE.Mesh(geo.ring, mats.lavaGlow); g.scale.setScalar(1.15); m.add(g); }
  addObj(m, 'rock', s * 0.95);
}
function spawnBranch(z) {
  const g = new THREE.Group(); const b = new THREE.Mesh(geo.box, mats.wood); b.scale.set(rnd(5, 8), 0.5, 0.5); g.add(b);
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(geo.sph, mats.leaf); l.scale.set(0.9, 0.35, 0.7); l.position.set((i - 1.5) * 1.4, 0.35, 0); g.add(l); }
  g.position.set(rnd(-4.5, 4.5), rnd(1.5, 6.5), z); const o = addObj(g, 'branch', 0); objs[objs.length - 1].w = b.scale.x / 2 + 0.2; objs[objs.length - 1].h = 0.6;
}
function spawnHawk(z) {
  const g = new THREE.Group(); const b = new THREE.Mesh(geo.sph, mats.hawk); b.scale.set(0.35, 0.3, 0.7); g.add(b);
  const ws = [-1, 1].map((s) => { const p = new THREE.Mesh(geo.box, mats.hawk); p.scale.set(1.3, 0.05, 0.5); p.position.x = s * 0.75; g.add(p); return p; });
  g.userData.ws = ws; const side = Math.random() < 0.5 ? -1 : 1; g.position.set(side * 7.5, rnd(2, 6.5), z); g.rotation.y = side * 0.6;
  addObj(g, 'hawk', 0.95); objs[objs.length - 1].vx = -side * rnd(3.5, 5.5);
}

// ---------- estado ----------
let ctx = null, eng = null, muted = false;
const st = { run: false, dist: 0, speed: 24, score: 0, gold: 0, lives: 3, inv: 0, nextSpawn: 0, biome: 0, bmix: 1, from: BIOMES[0], toast: 0, tx: 0, ty: 4, x: 0, y: 4, vx: 0, tilt: false, t: 0, hawkWarn: 0 };
const bestKey = 'quetzal_best'; let best = 0; try { best = +localStorage.getItem(bestKey) || 0; } catch (e) {}
const showBest = () => { $('best').textContent = best ? `Tu mejor vuelo: ${best} puntos` : ''; };
showBest();
const col = new THREE.Color(), colB = new THREE.Color();
function applyBiomeVisual(dt) {
  const B = BIOMES[st.biome]; st.bmix = Math.min(1, st.bmix + dt / 3);
  const lerp = (a, b, tgt) => { col.setHex(a); colB.setHex(b); tgt.copy(col).lerp(colB, st.bmix); };
  lerp(st.from.sky, B.sky, scene.background || (scene.background = new THREE.Color())); lerp(st.from.fog, B.fog, scene.fog.color); lerp(st.from.ground, B.ground, ground.material.color); lerp(st.from.light, B.light, sun.color);
  hemi.groundColor.copy(ground.material.color);
  scene.fog.near = st.biome === 1 ? 18 : 25; scene.fog.far = st.biome === 3 ? 110 : 150;
}
function toast(txt, ms = 1400) { const t = $('toast'); t.textContent = txt; t.classList.add('on'); clearTimeout(st.toast); st.toast = setTimeout(() => t.classList.remove('on'), ms); }
function hearts() { $('lives').textContent = '♥'.repeat(st.lives) + '♡'.repeat(3 - st.lives); }
function reset() {
  objs.splice(0).forEach((o) => scene.remove(o.mesh));
  Object.assign(st, { dist: 0, speed: 24, score: 0, gold: 0, lives: 3, inv: 0, nextSpawn: -40, biome: 0, bmix: 1, from: BIOMES[0], x: 0, y: 4, tx: 0, ty: 4, vx: 0, hawkWarn: 0 });
  scenery.forEach((g) => { fillScenery(g, 0); g.position.z = -rnd(0, 170); });
  hearts(); $('score').textContent = '0'; $('zone').textContent = BIOMES[0].n;
}

// ---------- controles ----------
let touchId = null, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => { touchId = e.pointerId; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== touchId || st.tilt) return; const k = 14 / Math.min(innerWidth, 500); st.tx = clamp(st.tx + (e.clientX - lx) * k, -6.2, 6.2); st.ty = clamp(st.ty - (e.clientY - ly) * k * 0.9, 1, 7.2); lx = e.clientX; ly = e.clientY; });
const up = (e) => { if (e.pointerId === touchId) touchId = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
const keys = {}; addEventListener('keydown', (e) => { keys[e.key] = true; }); addEventListener('keyup', (e) => { keys[e.key] = false; });
addEventListener('deviceorientation', (e) => { if (!st.tilt || e.gamma == null) return; const land = innerWidth > innerHeight; const g = land ? e.beta : e.gamma, b = land ? -e.gamma : e.beta; st.tx = clamp(g / 25 * 6.2, -6.2, 6.2); st.ty = clamp(4 - ((b || 0) - 50) / 25 * 3.2, 1, 7.2); });

// ---------- bucle ----------
function hit() {
  if (st.inv > 0) return;
  st.lives--; st.inv = 1.8; hearts(); eng && eng.sfx.hit();
  const f = $('flash'); f.style.opacity = 0.55; setTimeout(() => (f.style.opacity = 0), 90);
  if (navigator.vibrate) navigator.vibrate(80);
  if (st.lives <= 0) over();
}
function over() {
  st.run = false; eng && (eng.sfx.over(), eng.stopMusic());
  const sc = Math.floor(st.score); if (sc > best) { best = sc; try { localStorage.setItem(bestKey, best); } catch (e) {} }
  $('res').innerHTML = `${sc} puntos<br>${st.gold} esferas de oro<br>${Math.floor(st.dist)} m volados`;
  setTimeout(() => { $('end').hidden = false; $('hud').hidden = true; showBest(); }, 900);
}
function update(dt) {
  st.t += dt;
  // controles de teclado
  if (keys.ArrowLeft || keys.a) st.tx = clamp(st.tx - 9 * dt, -6.2, 6.2); if (keys.ArrowRight || keys.d) st.tx = clamp(st.tx + 9 * dt, -6.2, 6.2);
  if (keys.ArrowUp || keys.w) st.ty = clamp(st.ty + 7 * dt, 1, 7.2); if (keys.ArrowDown || keys.s) st.ty = clamp(st.ty - 7 * dt, 1, 7.2);
  if (st.run) {
    st.speed = Math.min(52, 24 + st.dist / 90); st.dist += st.speed * dt; st.score += st.speed * dt * 0.12; st.inv = Math.max(0, st.inv - dt);
    const b = Math.floor(st.dist / BIOME_LEN) % 4;
    if (b !== st.biome) { st.from = BIOMES[st.biome]; st.biome = b; st.bmix = 0; $('zone').textContent = BIOMES[b].n; toast(BIOMES[b].n, 2200); eng && (eng.setBiome(b), eng.sfx.biome()); }
    eng && (eng.setIntensity(0.2 + (st.speed - 24) / 40 + (st.inv > 0 ? 0.15 : 0)), eng.setSpeed(st.speed));
    // aparición
    while (st.nextSpawn > -150 + 0) { /* nada */ break; }
    st.nextSpawn += st.speed * dt;
    if (st.nextSpawn > 0) {
      const gap = rnd(16, 28) - Math.min(8, st.dist / 400); st.nextSpawn -= gap; const z = -150, r = Math.random(), bi = st.biome;
      if (r < 0.45) spawnSpheres(z, 4 + ((Math.random() * 5) | 0));
      else if (r < 0.72) spawnRock(z, bi);
      else if (r < 0.88) spawnBranch(z);
      else { spawnHawk(z); eng && eng.sfx.hawk(rnd(-0.8, 0.8)); }
      if (Math.random() < 0.35) spawnRock(z - 6, bi);
    }
  }
  // movimiento del pájaro
  const px = st.x; st.x += (st.tx - st.x) * Math.min(1, dt * 7); st.y += (st.ty - st.y) * Math.min(1, dt * 7); st.vx = (st.x - px) / Math.max(dt, 0.001);
  bird.position.set(st.x, st.y + Math.sin(st.t * 3) * 0.06, 0); bird.rotation.z = clamp(-st.vx * 0.05, -0.6, 0.6); bird.rotation.x = clamp((st.ty - st.y) * 0.08, -0.35, 0.35);
  const fl = Math.sin(st.t * 9) * 0.6; wings.forEach((w) => (w.p.rotation.z = w.s * fl)); tails.forEach((t, i) => { t.rotation.y = Math.sin(st.t * 3 + i) * 0.08; });
  bird.visible = st.inv <= 0 || Math.floor(st.t * 14) % 2 === 0;
  // cámara
  camera.position.x += (st.x * 0.55 - camera.position.x) * Math.min(1, dt * 4); camera.position.y += (st.y * 0.5 + 2.6 - camera.position.y) * Math.min(1, dt * 4); camera.lookAt(st.x * 0.35, st.y * 0.7 + 0.5, -20);
  // mundo
  const dz = st.speed * dt;
  scenery.forEach((g) => { g.position.z += dz; if (g.position.z > 14) fillScenery(g, st.biome); });
  stripes.forEach((s) => { s.position.z += dz; if (s.position.z > 10) s.position.z -= 168; });
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i], m = o.mesh; m.position.z += dz; o.t += dt;
    if (o.type === 'gold') { m.rotation.y += dt * 3; m.position.y += Math.sin(o.t * 4) * 0.004; }
    else if (o.type === 'rock') { m.rotation.x += dt * 0.5; m.rotation.y += dt * 0.7; }
    else if (o.type === 'hawk') { m.position.x += o.vx * dt; m.userData.ws.forEach((w, k) => (w.rotation.z = (k ? 1 : -1) * Math.sin(o.t * 12) * 0.5)); }
    if (st.run && Math.abs(m.position.z) < 1.6) {
      const dx = Math.abs(m.position.x - st.x), dy = Math.abs(m.position.y - st.y);
      if (o.type === 'gold') { if (dx < 1.1 && dy < 1.1) { st.gold++; st.score += 10; $('score').textContent = Math.floor(st.score); eng && eng.sfx.collect(clamp(m.position.x / 7, -1, 1)); scene.remove(m); objs.splice(i, 1); if (st.gold % 25 === 0) { st.score += 100; toast('¡Pura vida! +100'); eng && eng.sfx.puraVida(); } continue; } }
      else if (o.type === 'branch') { if (dx < o.w + 0.4 && dy < o.h + 0.5) hit(); }
      else if (dx < o.r + 0.5 && dy < o.r + 0.5) hit();
    }
    if (m.position.z > 8 || Math.abs(m.position.x) > 14) { scene.remove(m); objs.splice(i, 1); }
  }
  if (st.run) $('score').textContent = Math.floor(st.score);
  applyBiomeVisual(dt);
  // sonido: el motor programa las notas con ~0.5 s de anticipación
  if (eng) eng.pump(ctx.currentTime + 0.5);
}

let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); renderer.render(scene, camera); requestAnimationFrame(loop); }
st.biome = 0; applyBiomeVisual(1); reset(); requestAnimationFrame(loop);

// ---------- menú ----------
async function start() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; try { ctx = new AC(); eng = createEngine(ctx); } catch (e) { ctx = null; eng = null; } }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if ($('tilt').checked && typeof DeviceOrientationEvent !== 'undefined') {
    try { if (DeviceOrientationEvent.requestPermission) { st.tilt = (await DeviceOrientationEvent.requestPermission()) === 'granted'; } else st.tilt = true; } catch (e) { st.tilt = false; }
  } else st.tilt = false;
  reset(); $('menu').hidden = true; $('end').hidden = true; $('hud').hidden = false; st.run = true;
  if (eng) { eng.setBiome(0); eng.setMuted(muted); eng.startMusic(); }
  toast('¡Vuela, quetzal!', 1500);
}
$('play').onclick = start; $('again').onclick = start;
$('mute').onclick = () => { muted = !muted; $('mute').classList.toggle('off', muted); eng && eng.setMuted(muted); };
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
window.__q = { st, objs, start, get eng() { return eng; }, get ctx() { return ctx; }, renderer };
