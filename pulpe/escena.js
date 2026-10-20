/* La Pulpe · escena: dibuja la pulpería en un <canvas> (todo con código, sin imágenes). Resolución lógica 960×540. */
'use strict';

const W = 960, H = 540, PISO = 360, MOSTRADOR = 372;
let cv, cx, dpr = 1, tiempo = 0, gotas = [], estrellas = [];

function iniciarEscena(canvas) {
    cv = canvas; cx = cv.getContext('2d');
    const fit = () => {
        dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const r = cv.getBoundingClientRect();
        cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.width * H / W * dpr);
    };
    fit(); window.addEventListener('resize', fit);
    for (let i = 0; i < 60; i++) gotas.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6 });
    for (let i = 0; i < 26; i++) estrellas.push({ x: Math.random(), y: Math.random() * 0.8, t: Math.random() * 6 });
    return { fit };
}
// Pasa un clic de la pantalla a coordenadas lógicas.
function aLogico(ev) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H }; }

// ---------- utilidades de dibujo ----------
function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
function sombra(c, b, ox = 0, oy = 3) { cx.shadowColor = c; cx.shadowBlur = b; cx.shadowOffsetX = ox; cx.shadowOffsetY = oy; }
const sinSombra = () => { cx.shadowColor = 'transparent'; cx.shadowBlur = 0; cx.shadowOffsetX = 0; cx.shadowOffsetY = 0; };
function aclarar(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k); return `rgb(${r},${g},${b})`; }
function oscurecer(hex, k) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round((n >> 16) * (1 - k))},${Math.round((n >> 8 & 255) * (1 - k))},${Math.round((n & 255) * (1 - k))})`; }

// ---------- luz según la hora ----------
function cieloColores(h, lluvia) {
    let a, b;
    if (h < 6.5) { a = '#2b2f5e'; b = '#e98b6d'; } else if (h < 8) { a = '#7fb3e6'; b = '#f6c38b'; } else if (h < 16.5) { a = '#5fb0ef'; b = '#cdeefd'; }
    else if (h < 18) { a = '#6c7fd8'; b = '#f39c6b'; } else if (h < 18.7) { a = '#3b3f86'; b = '#e17055'; } else { a = '#0b1026'; b = '#1e2a5a'; }
    if (lluvia) { a = h < 18.5 ? '#6b7a8a' : '#1c2230'; b = h < 18.5 ? '#a4b0be' : '#2f3542'; }
    return [a, b];
}
const oscuridad = (h) => (h < 6.6 ? 0.25 : h < 17.5 ? 0 : h < 19 ? (h - 17.5) / 1.5 * 0.42 : 0.42);

// ---------- fondo: pared, ventana, puerta, estantes ----------
function dibujarFondo(h) {
    const B = BARRIOS[G.barrio];
    // pared con media pared de otro color (típica de pulpe)
    cx.fillStyle = B.pared; cx.fillRect(0, 0, W, PISO);
    cx.fillStyle = B.pared2; cx.fillRect(0, PISO - 110, W, 110);
    cx.fillStyle = 'rgba(255,255,255,.35)'; cx.fillRect(0, PISO - 112, W, 4);
    if (G.mejoras.fachada) { cx.fillStyle = 'rgba(255,255,255,.18)'; for (let x = 10; x < W; x += 46) { cx.beginPath(); cx.arc(x, 18, 9, 0, Math.PI); cx.fill(); } }
    // piso de mosaico
    for (let y = PISO; y < H; y += 30) for (let x = 0; x < W; x += 30) { cx.fillStyle = ((x + y) / 30) % 2 ? B.piso : aclarar(B.piso, 0.18); cx.fillRect(x, y, 30, 30); }
    const g = cx.createLinearGradient(0, PISO, 0, H); g.addColorStop(0, 'rgba(0,0,0,.18)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); cx.fillStyle = g; cx.fillRect(0, PISO, W, H - PISO);
    // ventana
    const [c1, c2] = cieloColores(h, enLluvia());
    const wx = 588, wy = 76, ww = 150, wh = 128;
    cx.fillStyle = '#6b4226'; rr(wx - 8, wy - 8, ww + 16, wh + 16, 6); cx.fill();
    const cg = cx.createLinearGradient(0, wy, 0, wy + wh); cg.addColorStop(0, c1); cg.addColorStop(1, c2); cx.fillStyle = cg; cx.fillRect(wx, wy, ww, wh);
    if (h >= 18.5 || h < 6.4) estrellas.forEach(s => { cx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(tiempo * 2 + s.t)})`; cx.fillRect(wx + s.x * ww, wy + s.y * wh * 0.6, 1.6, 1.6); });
    if (!enLluvia()) {   // sol o luna que recorre la ventana
        const t = clamp((h - 6) / 14, 0, 1), sx = wx + 15 + t * (ww - 30), sy = wy + 70 - Math.sin(t * Math.PI) * 55;
        cx.fillStyle = h >= 18.4 ? '#f5f6fa' : '#ffd86b'; sombra(h >= 18.4 ? '#fff' : '#ffb142', 18, 0, 0); cx.beginPath(); cx.arc(sx, sy, h >= 18.4 ? 9 : 12, 0, 6.29); cx.fill(); sinSombra();
    }
    // montañas y techos (el Valle Central siempre tiene montañas)
    cx.fillStyle = h >= 18.5 ? '#1b2340' : '#5d8a6b'; cx.beginPath(); cx.moveTo(wx, wy + wh - 30); cx.quadraticCurveTo(wx + 40, wy + wh - 62, wx + 80, wy + wh - 38); cx.quadraticCurveTo(wx + 115, wy + wh - 70, wx + ww, wy + wh - 40); cx.lineTo(wx + ww, wy + wh); cx.lineTo(wx, wy + wh); cx.fill();
    cx.fillStyle = h >= 18.5 ? '#2a1f2e' : '#b5523b'; [[wx + 12, 22], [wx + 60, 30], [wx + 105, 24]].forEach(([x, w]) => { cx.beginPath(); cx.moveTo(x, wy + wh - 14); cx.lineTo(x + w / 2, wy + wh - 28); cx.lineTo(x + w, wy + wh - 14); cx.fill(); cx.fillStyle = h >= 18.5 ? '#ffd86b' : '#ecf0f1'; cx.fillRect(x + 3, wy + wh - 14, w - 6, 14); cx.fillStyle = h >= 18.5 ? '#2a1f2e' : '#b5523b'; });
    if (enLluvia()) { cx.strokeStyle = 'rgba(220,235,255,.65)'; cx.lineWidth = 1.2; gotas.forEach(d => { const x = wx + d.x * ww, y = wy + ((d.y + tiempo * d.v) % 1) * wh; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - 3, y + 9); cx.stroke(); }); }
    cx.fillStyle = 'rgba(255,255,255,.12)'; cx.beginPath(); cx.moveTo(wx, wy); cx.lineTo(wx + 50, wy); cx.lineTo(wx, wy + 60); cx.fill();
    cx.strokeStyle = '#6b4226'; cx.lineWidth = 5; cx.beginPath(); cx.moveTo(wx + ww / 2, wy); cx.lineTo(wx + ww / 2, wy + wh); cx.moveTo(wx, wy + wh / 2); cx.lineTo(wx + ww, wy + wh / 2); cx.stroke();
    if (G.mejoras.rejas) { cx.strokeStyle = '#2d3436'; cx.lineWidth = 3; for (let x = wx + 12; x < wx + ww; x += 16) { cx.beginPath(); cx.moveTo(x, wy - 4); cx.lineTo(x, wy + wh + 4); cx.stroke(); } }
    // puerta
    const dx = 790, dy = 108, dw = 120, dh = PISO - dy + 4;
    cx.fillStyle = '#5a3825'; rr(dx - 8, dy - 8, dw + 16, dh + 8, 4); cx.fill();
    const dg = cx.createLinearGradient(0, dy, 0, dy + dh); dg.addColorStop(0, c1); dg.addColorStop(1, aclarar(c2.length === 7 ? c2 : '#888888', 0.1)); cx.fillStyle = dg; cx.fillRect(dx, dy, dw, dh);
    cx.fillStyle = h >= 18.5 ? '#2c2c34' : '#8a8f98'; cx.fillRect(dx, dy + dh - 50, dw, 50);   // la calle
    cx.fillStyle = h >= 18.5 ? '#3d3d48' : '#a3a9b3'; cx.fillRect(dx, dy + dh - 54, dw, 6);
    if (enLluvia()) { cx.strokeStyle = 'rgba(220,235,255,.5)'; cx.lineWidth = 1.2; gotas.forEach((d, i) => { if (i % 2) return; const x = dx + d.x * dw, y = dy + ((d.y + tiempo * d.v * 1.1) % 1) * dh; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - 3, y + 10); cx.stroke(); }); }
    if (G.mejoras.rejas) { cx.strokeStyle = 'rgba(45,52,54,.85)'; cx.lineWidth = 3; for (let x = dx + 10; x < dx + dw; x += 18) { cx.beginPath(); cx.moveTo(x, dy); cx.lineTo(x, dy + dh); cx.stroke(); } }
    // planta eléctrica afuera
    if (G.mejoras.planta) { cx.fillStyle = '#27ae60'; rr(dx + dw + 14, PISO - 34, 34, 30, 4); cx.fill(); cx.fillStyle = '#1e8449'; cx.fillRect(dx + dw + 18, PISO - 28, 26, 4); }
    // rótulo
    dibujarRotulo(h);
    dibujarEstantes();
    // refri y congelador
    if (G.mejoras.refri) dibujarRefri(596, 214);
    if (G.mejoras.congelador) dibujarCongelador(680, 292);
    // calendario y reloj
    cx.fillStyle = '#fff'; rr(22, 22, 46, 52, 4); cx.fill(); cx.fillStyle = '#e74c3c'; cx.fillRect(22, 22, 46, 14); cx.fillStyle = '#2d3436'; cx.font = '700 22px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.fillText(String(G.dia), 45, 64);
    cx.font = '700 9px Fredoka, sans-serif'; cx.fillStyle = '#fff'; cx.fillText('DÍA', 45, 33);
}
function dibujarRotulo(h) {
    const x = 160, y = 14, w = 380, hh = 44, luz = G.mejoras.rotulo && h >= 17;
    cx.fillStyle = '#2d3436'; rr(x, y, w, hh, 8); cx.fill();
    cx.fillStyle = G.mejoras.rotulo ? '#fdcb6e' : '#f1c40f'; rr(x + 4, y + 4, w - 8, hh - 8, 6); cx.fill();
    if (luz) { sombra('#ffeaa7', 30, 0, 0); }
    cx.fillStyle = '#c0392b'; cx.font = '700 22px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(G.nombre.length > 30 ? G.nombre.slice(0, 29) + '…' : G.nombre, x + w / 2, y + hh / 2 + 1); sinSombra(); cx.textBaseline = 'alphabetic';
    if (G.mejoras.rotulo) for (let i = 0; i < 12; i++) { const on = luz ? (Math.floor(tiempo * 4) + i) % 3 !== 0 : false; cx.fillStyle = on ? '#fff7d6' : '#b8a35a'; cx.beginPath(); cx.arc(x + 14 + i * ((w - 28) / 11), y + hh + 6, 3, 0, 6.29); cx.fill(); }
}
// Estantes: cada producto tiene su espacio y se ve lleno o vacío según el inventario.
const ESTANTES = (() => { const out = []; PRODUCTOS.forEach((p, i) => { const row = Math.floor(i / 6), colI = i % 6; out.push({ id: p.id, x: 30 + colI * 90, y: 92 + row * 88 }); }); return out; })();
function dibujarEstantes() {
    cx.fillStyle = '#7b4a2b'; cx.fillRect(22, 80, 556, 270);
    cx.fillStyle = '#5a3420'; cx.fillRect(22, 80, 556, 6);
    for (let r = 0; r < 3; r++) { const y = 92 + r * 88 + 70; cx.fillStyle = '#a0643d'; cx.fillRect(26, y, 548, 8); cx.fillStyle = '#4e2c18'; cx.fillRect(26, y + 8, 548, 3); }
    cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fillRect(26, 86, 548, 6);
    ESTANTES.forEach(e => {
        const p = PROD[e.id], q = cantidad(e.id), cap = capacidad(), ok = disponible(e.id);
        const n = q <= 0 ? 0 : Math.max(1, Math.round(Math.min(q, cap) / cap * 8));
        for (let i = 0; i < n; i++) { const ix = e.x + 8 + (i % 4) * 19, iy = e.y + 46 - Math.floor(i / 4) * 24; dibujarProducto(p, ix, iy); }
        cx.fillStyle = ok ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.45)'; cx.font = '600 10px Fredoka, sans-serif'; cx.textAlign = 'center';
        cx.fillText(p.n.length > 13 ? p.n.slice(0, 12) + '.' : p.n, e.x + 42, e.y + 86);
        if (!ok) { cx.font = '16px sans-serif'; cx.fillText('🔒', e.x + 42, e.y + 44); }
        else if (q === 0) { cx.fillStyle = 'rgba(231,76,60,.85)'; cx.font = '700 10px Fredoka, sans-serif'; cx.fillText('AGOTADO', e.x + 42, e.y + 40); }
    });
}
function dibujarProducto(p, x, y) {
    const c = p.col;
    cx.fillStyle = c; cx.strokeStyle = 'rgba(0,0,0,.25)'; cx.lineWidth = 1;
    switch (p.forma) {
        case 'botella': cx.fillRect(x + 5, y - 2, 6, 6); rr(x + 2, y + 3, 12, 19, 3); cx.fill(); cx.fillStyle = 'rgba(255,255,255,.7)'; cx.fillRect(x + 3, y + 10, 10, 5); break;
        case 'lata': rr(x + 2, y + 6, 12, 16, 2); cx.fill(); cx.fillStyle = '#ecf0f1'; cx.fillRect(x + 2, y + 6, 12, 2); cx.fillStyle = '#c0392b'; cx.fillRect(x + 2, y + 13, 12, 3); break;
        case 'caja': rr(x, y + 2, 16, 20, 2); cx.fill(); cx.stroke(); cx.fillStyle = 'rgba(0,0,0,.12)'; cx.fillRect(x + 2, y + 8, 12, 5); break;
        case 'bolsa': cx.beginPath(); cx.moveTo(x + 2, y + 22); cx.lineTo(x, y + 6); cx.quadraticCurveTo(x + 8, y + 1, x + 16, y + 6); cx.lineTo(x + 14, y + 22); cx.closePath(); cx.fill(); cx.stroke(); cx.fillStyle = 'rgba(255,255,255,.35)'; cx.fillRect(x + 4, y + 11, 8, 4); break;
        case 'pan': cx.beginPath(); cx.ellipse(x + 8, y + 17, 9, 5.5, 0, 0, 6.29); cx.fill(); cx.strokeStyle = '#a66a2c'; cx.beginPath(); cx.moveTo(x + 4, y + 15); cx.lineTo(x + 6, y + 19); cx.moveTo(x + 9, y + 14); cx.lineTo(x + 11, y + 19); cx.stroke(); break;
        case 'carton': rr(x - 1, y + 10, 18, 12, 2); cx.fill(); cx.fillStyle = '#fff8ee'; for (let i = 0; i < 3; i++) { cx.beginPath(); cx.arc(x + 3 + i * 5.5, y + 11, 2.5, 0, 6.29); cx.fill(); } break;
        case 'rollo': cx.beginPath(); cx.ellipse(x + 8, y + 14, 7, 9, 0, 0, 6.29); cx.fill(); cx.stroke(); cx.fillStyle = '#ddd'; cx.beginPath(); cx.arc(x + 8, y + 14, 2.5, 0, 6.29); cx.fill(); break;
        case 'vaso': cx.beginPath(); cx.moveTo(x + 2, y + 8); cx.lineTo(x + 14, y + 8); cx.lineTo(x + 12, y + 22); cx.lineTo(x + 4, y + 22); cx.closePath(); cx.fill(); cx.stroke(); cx.fillStyle = '#e17055'; cx.fillRect(x + 3, y + 8, 10, 3); break;
        case 'confite': for (let i = 0; i < 3; i++) { cx.fillStyle = ['#e84393', '#00b894', '#fdcb6e'][i]; cx.beginPath(); cx.arc(x + 4 + i * 4, y + 18 - (i % 2) * 4, 3.4, 0, 6.29); cx.fill(); } break;
        default: rr(x, y + 4, 16, 18, 3); cx.fill();
    }
}
function dibujarRefri(x, y) {
    sombra('rgba(0,0,0,.25)', 8); cx.fillStyle = '#ecf0f1'; rr(x, y, 72, 146, 6); cx.fill(); sinSombra();
    cx.fillStyle = 'rgba(160,220,255,.55)'; rr(x + 7, y + 10, 58, 92, 4); cx.fill();
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { const id = ['gaseosa', 'birra', 'leche'][r]; if (cantidad(id) > i * 3) { cx.fillStyle = PROD[id].col; rr(x + 11 + i * 13, y + 16 + r * 29, 9, 22, 2); cx.fill(); } }
    cx.fillStyle = '#bdc3c7'; cx.fillRect(x + 60, y + 108, 4, 26);
    cx.fillStyle = apagonAhora() && !G.mejoras.planta ? '#636e72' : '#00b894'; cx.beginPath(); cx.arc(x + 12, y + 120, 3, 0, 6.29); cx.fill();
}
function dibujarCongelador(x, y) {
    sombra('rgba(0,0,0,.25)', 8); cx.fillStyle = '#dfe6e9'; rr(x, y, 96, 68, 6); cx.fill(); sinSombra();
    cx.fillStyle = 'rgba(180,230,255,.7)'; rr(x + 6, y + 6, 84, 22, 4); cx.fill();
    for (let i = 0; i < 6; i++) if (cantidad('helado') > i * 2) { cx.fillStyle = ['#fd79a8', '#ffeaa7', '#a29bfe'][i % 3]; cx.beginPath(); cx.arc(x + 14 + i * 13, y + 18, 5, 0, 6.29); cx.fill(); }
    cx.fillStyle = '#e17055'; cx.font = '700 11px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.fillText('HELADOS', x + 48, y + 50);
}

// ---------- mostrador, pulpero, ayudante ----------
function dibujarMostrador() {
    // personas detrás del mostrador
    dibujarPulpero(212, MOSTRADOR + 6, VIVO.sirviendo > 0);
    if (G.ayudante) dibujarPersona({ x: 372, y: MOSTRADOR + 6, piel: '#e0ac69', ropa: '#0984e3', pantalon: '#2d3436', pelo: '#1a1a1a', peinado: 1, alto: 0.9, fase: tiempo * 2, sombrero: 'gorra' }, 0, true);
    // mostrador de madera
    sombra('rgba(0,0,0,.3)', 14, 0, 6); cx.fillStyle = '#8e5a35'; cx.fillRect(14, MOSTRADOR, 760, 70); sinSombra();
    cx.fillStyle = '#b07446'; cx.fillRect(10, MOSTRADOR - 10, 768, 14);
    cx.fillStyle = '#d4955f'; cx.fillRect(10, MOSTRADOR - 10, 768, 3);
    for (let x = 30; x < 770; x += 62) { cx.fillStyle = 'rgba(0,0,0,.12)'; cx.fillRect(x, MOSTRADOR + 6, 3, 62); }
    // caja registradora
    const kx = 120, ky = MOSTRADOR - 44;
    cx.fillStyle = '#636e72'; rr(kx, ky, 64, 36, 5); cx.fill(); cx.fillStyle = '#2d3436'; rr(kx + 6, ky - 14, 40, 18, 3); cx.fill();
    cx.fillStyle = '#55efc4'; cx.font = '700 10px monospace'; cx.textAlign = 'center'; cx.fillText(col(G.dinero).slice(0, 9), kx + 26, ky - 1);
    for (let i = 0; i < 6; i++) { cx.fillStyle = '#dfe6e9'; cx.fillRect(kx + 8 + (i % 3) * 16, ky + 8 + Math.floor(i / 3) * 12, 12, 8); }
    // balanza
    cx.fillStyle = '#b2bec3'; cx.fillRect(470, MOSTRADOR - 24, 50, 16); cx.fillStyle = '#dfe6e9'; cx.beginPath(); cx.ellipse(495, MOSTRADOR - 28, 30, 6, 0, 0, 6.29); cx.fill();
    // datáfono
    if (G.mejoras.datafono) { cx.fillStyle = '#2d3436'; rr(196, MOSTRADOR - 26, 22, 18, 3); cx.fill(); cx.fillStyle = '#74b9ff'; cx.fillRect(199, MOSTRADOR - 23, 16, 6); }
    // vitrina de confites
    if (G.mejoras.vitrina) {
        cx.fillStyle = 'rgba(200,240,255,.45)'; rr(560, MOSTRADOR - 64, 120, 56, 6); cx.fill(); cx.strokeStyle = 'rgba(255,255,255,.8)'; cx.lineWidth = 2; cx.stroke();
        for (let i = 0; i < 14; i++) { cx.fillStyle = ['#e84393', '#00b894', '#fdcb6e', '#6c5ce7', '#e17055'][i % 5]; cx.beginPath(); cx.arc(574 + (i % 7) * 15, MOSTRADOR - 22 - Math.floor(i / 7) * 13, 5, 0, 6.29); cx.fill(); }
    }
    // sodita
    if (G.mejoras.soda) { cx.fillStyle = '#2d3436'; rr(300, MOSTRADOR - 22, 60, 14, 4); cx.fill(); if (G.min < 10 * 60) for (let i = 0; i < 3; i++) { cx.strokeStyle = `rgba(255,255,255,${0.5 - i * 0.12})`; cx.beginPath(); cx.moveTo(318 + i * 12, MOSTRADOR - 26); cx.bezierCurveTo(312 + i * 12, MOSTRADOR - 40, 326 + i * 12, MOSTRADOR - 46, 318 + i * 12, MOSTRADOR - 60 - Math.sin(tiempo * 3 + i) * 4); cx.stroke(); } }
    // servicios
    if (G.mejoras.servicios) { cx.fillStyle = '#fdcb6e'; rr(712, MOSTRADOR - 40, 54, 30, 4); cx.fill(); cx.fillStyle = '#2d3436'; cx.font = '700 9px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.fillText('RECARGAS', 739, MOSTRADOR - 21); }
}
function dibujarPulpero(x, y, ocupado) {
    dibujarPersona({ x, y, piel: '#d29b6c', ropa: '#ffffff', pantalon: '#2d3436', pelo: '#2d1b0e', peinado: 2, alto: 1.02, fase: 0, delantal: true }, ocupado ? Math.sin(tiempo * 18) : 0, true);
}

// ---------- personas ----------
// p: { x, y (pies), piel, ropa, pantalon, pelo, peinado, sombrero, alto, fase }. brazo: −1..1 (animación). detras: solo de la cintura para arriba.
function dibujarPersona(p, brazo = 0, detras = false, andar = 0) {
    const s = p.alto || 1, y = p.y, x = p.x;
    const piernaH = 34 * s, cuerpoH = 40 * s, cab = 15 * s;
    const yCad = y - piernaH, yHom = yCad - cuerpoH;
    cx.save();
    if (!detras) {
        cx.fillStyle = 'rgba(0,0,0,.18)'; cx.beginPath(); cx.ellipse(x, y + 2, 20 * s, 5, 0, 0, 6.29); cx.fill();
        const sw = Math.sin(andar) * 7 * s;
        cx.strokeStyle = p.pantalon; cx.lineWidth = 10 * s; cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(x - 6 * s, yCad); cx.lineTo(x - 6 * s + sw, y - 4); cx.moveTo(x + 6 * s, yCad); cx.lineTo(x + 6 * s - sw, y - 4); cx.stroke();
        cx.fillStyle = '#2d3436'; cx.beginPath(); cx.ellipse(x - 6 * s + sw, y - 2, 7 * s, 4, 0, 0, 6.29); cx.ellipse(x + 6 * s - sw, y - 2, 7 * s, 4, 0, 0, 6.29); cx.fill();
    }
    // cuerpo
    cx.fillStyle = p.ropa; rr(x - 17 * s, yHom, 34 * s, cuerpoH + 4, 12 * s); cx.fill();
    cx.fillStyle = 'rgba(0,0,0,.08)'; rr(x + 4 * s, yHom + 4, 12 * s, cuerpoH - 4, 8 * s); cx.fill();
    if (p.delantal) { cx.fillStyle = '#e17055'; rr(x - 12 * s, yHom + 12 * s, 24 * s, cuerpoH - 6 * s, 5); cx.fill(); cx.fillStyle = '#fab1a0'; cx.fillRect(x - 6 * s, yHom + 18 * s, 12 * s, 6 * s); }
    // brazos
    cx.strokeStyle = p.ropa; cx.lineWidth = 9 * s; cx.lineCap = 'round';
    const bz = brazo * 10 * s;
    cx.beginPath(); cx.moveTo(x - 15 * s, yHom + 8 * s); cx.lineTo(x - 21 * s, yHom + 30 * s + (detras ? -bz : Math.sin(andar) * 4)); cx.moveTo(x + 15 * s, yHom + 8 * s); cx.lineTo(x + 21 * s + (detras ? bz * 0.6 : 0), yHom + 30 * s + (detras ? bz : -Math.sin(andar) * 4)); cx.stroke();
    cx.fillStyle = p.piel; cx.beginPath(); cx.arc(x - 21 * s, yHom + 31 * s + (detras ? -bz : Math.sin(andar) * 4), 4.5 * s, 0, 6.29); cx.arc(x + 21 * s + (detras ? bz * 0.6 : 0), yHom + 31 * s + (detras ? bz : -Math.sin(andar) * 4), 4.5 * s, 0, 6.29); cx.fill();
    // bolsa de compras
    if (p.bolsa) { cx.fillStyle = '#f5f6fa'; rr(x + 16 * s, yHom + 30 * s, 16 * s, 18 * s, 3); cx.fill(); cx.strokeStyle = '#b2bec3'; cx.lineWidth = 1.5; cx.stroke(); }
    // cabeza
    const hy = yHom - cab + 2;
    cx.fillStyle = p.piel; cx.beginPath(); cx.arc(x, hy, cab, 0, 6.29); cx.fill();
    cx.fillStyle = p.pelo;
    if (p.peinado === 0) { cx.beginPath(); cx.arc(x, hy - 2, cab, Math.PI, 0); cx.fill(); }
    else if (p.peinado === 1) { cx.beginPath(); cx.arc(x, hy - 3, cab + 1, Math.PI * 1.05, -0.05); cx.fill(); cx.fillRect(x - cab, hy - 4, 5, 9); }
    else if (p.peinado === 2) { cx.beginPath(); cx.ellipse(x, hy - cab * 0.55, cab * 0.95, cab * 0.55, 0, Math.PI, 0); cx.fill(); }
    else { cx.beginPath(); cx.arc(x, hy - 2, cab + 2, Math.PI * 0.9, Math.PI * 2.1); cx.fill(); cx.beginPath(); cx.arc(x, hy - cab - 2, 6 * s, 0, 6.29); cx.fill(); }
    if (p.sombrero === 'gorra') { cx.fillStyle = oscurecer(p.ropa.length === 7 ? p.ropa : '#2c3e50', 0.25); cx.beginPath(); cx.arc(x, hy - 4, cab, Math.PI, 0); cx.fill(); cx.fillRect(x - 2, hy - 6, cab + 9, 4); }
    if (p.sombrero === 'sombrero') { cx.fillStyle = '#e8d29b'; cx.beginPath(); cx.ellipse(x, hy - 7, cab + 9, 4, 0, 0, 6.29); cx.fill(); cx.fillRect(x - cab * 0.7, hy - 18, cab * 1.4, 11); cx.fillStyle = '#6d4c41'; cx.fillRect(x - cab * 0.7, hy - 10, cab * 1.4, 3); }
    // cara
    cx.fillStyle = '#2d3436'; cx.beginPath(); cx.arc(x - 5 * s, hy + 1, 1.8, 0, 6.29); cx.arc(x + 5 * s, hy + 1, 1.8, 0, 6.29); cx.fill();
    cx.strokeStyle = '#2d3436'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(x, hy + 4, 5 * s, 0.2 * Math.PI, 0.8 * Math.PI); cx.stroke();
    cx.fillStyle = 'rgba(231,76,60,.25)'; cx.beginPath(); cx.arc(x - 9 * s, hy + 5, 3, 0, 6.29); cx.arc(x + 9 * s, hy + 5, 3, 0, 6.29); cx.fill();
    // paraguas al entrar con lluvia
    if (p.paraguasArriba) { cx.strokeStyle = '#2d3436'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(x + 20, yHom + 26); cx.lineTo(x + 20, hy - 30); cx.stroke(); cx.fillStyle = p.ropa; cx.beginPath(); cx.arc(x + 20, hy - 26, 30, Math.PI, 0); cx.fill(); }
    cx.restore();
}

// ---------- clientes, burbujas y efectos ----------
function moverClientes(dt) {
    VIVO.clientes.forEach(c => {
        const sp = 260 * dt;
        if (c.estado === 'entra') { if (c.y < 527) c.y = Math.min(528, c.y + sp); c.tx = FILA_X[Math.min(enFila().length, filaMax() - 1)]; c.x -= sp; if (c.x <= c.tx + 2) { c.x = c.tx; c.estado = 'fila'; c.pos = 99; reordenarFila(); decir(c, (c.especial === 'inspector' ? 'Ministerio de Salud. Inspección.' : c.especial === 'chismosa' ? 'Buenas, soy Doña Chusa… ¿qué hay de nuevo?' : pick(FRASES.saludo) + ' ' + c.items.map(id => PROD[id].e).join(' ')), 3.2); } }
        else if (c.estado === 'fila' || c.estado === 'atendiendo' || c.estado === 'decide') { if (Math.abs(c.x - c.tx) > 1) c.x += Math.sign(c.tx - c.x) * Math.min(Math.abs(c.tx - c.x), sp); }
        else if (c.estado === 'sale') { c.x += sp; if (c.x > 870) c.y -= sp * 0.6; }
        c.andando = c.estado === 'entra' || c.estado === 'sale' || Math.abs(c.x - c.tx) > 1;
        if (c.andando) c.fase += dt * 11;
        if (c.burbuja) { c.burbuja.t += dt; if (c.burbuja.t > c.burbuja.ttl) c.burbuja = null; }
    });
    VIVO.clientes = VIVO.clientes.filter(c => !(c.estado === 'sale' && c.x > 960));
}
function dibujarClientes() {
    const orden = VIVO.clientes.slice().sort((a, b) => b.x - a.x);
    orden.forEach(c => {
        const sale = c.estado === 'sale';
        dibujarPersona(Object.assign({}, c, { y: c.y, bolsa: c.bolsa && sale, paraguasArriba: c.paraguas && (c.estado === 'entra' || sale) && c.x > 760 }), 0, false, c.andando ? c.fase : 0);
        if (c.vec && c.estado !== 'sale') { cx.fillStyle = 'rgba(0,0,0,.55)'; cx.font = '600 10px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.fillText(c.vec.n, c.x, c.y + 14 > 540 ? 538 : c.y + 12); }
        if (c.especial) { cx.font = '14px sans-serif'; cx.textAlign = 'center'; cx.fillText(c.especial === 'inspector' ? '🩺' : '🗣️', c.x + 18, c.y - 100); }
        // paciencia
        if (c.estado === 'fila') { const f = clamp(c.paciencia / c.pacMax, 0, 1); cx.fillStyle = 'rgba(0,0,0,.25)'; rr(c.x - 18, c.y - 108 * (c.alto || 1) - 8, 36, 5, 2); cx.fill(); cx.fillStyle = f > 0.5 ? '#2ecc71' : f > 0.25 ? '#f39c12' : '#e74c3c'; rr(c.x - 18, c.y - 108 * (c.alto || 1) - 8, 36 * f, 5, 2); cx.fill(); }
    });
    // primero en la fila: marca de «atender»
    const f = enFila()[0];
    if (f && f.estado === 'fila' && Math.abs(f.x - FILA_X[0]) < 4 && !VIVO.decision) { const a = 0.55 + 0.45 * Math.sin(tiempo * 6); cx.strokeStyle = `rgba(255,234,167,${a})`; cx.lineWidth = 3; cx.beginPath(); cx.ellipse(f.x, f.y + 2, 26, 8, 0, 0, 6.29); cx.stroke(); }
    orden.forEach(c => { if (c.burbuja) dibujarBurbuja(c); });
}
function dibujarBurbuja(c) {
    const b = c.burbuja, a = Math.min(1, b.t * 6, (b.ttl - b.t) * 3);
    if (a <= 0) return;
    cx.save(); cx.globalAlpha = a; cx.font = '600 13px Fredoka, sans-serif';
    const lines = partir(b.txt, 22), w = Math.max(...lines.map(l => cx.measureText(l).width)) + 20, hh = lines.length * 17 + 12;
    const x = clamp(c.x - w / 2, 6, W - w - 6), y = c.y - 118 * (c.alto || 1) - hh - 10;
    sombra('rgba(0,0,0,.25)', 8, 0, 3); cx.fillStyle = '#fff'; rr(x, y, w, hh, 10); cx.fill(); sinSombra();
    cx.beginPath(); cx.moveTo(c.x - 6, y + hh); cx.lineTo(c.x, y + hh + 9); cx.lineTo(c.x + 6, y + hh); cx.fill();
    cx.fillStyle = '#2d3436'; cx.textAlign = 'left'; lines.forEach((l, i) => cx.fillText(l, x + 10, y + 20 + i * 17));
    cx.restore();
}
function partir(t, n) { const w = String(t).split(' '), out = []; let l = ''; w.forEach(x => { if ((l + ' ' + x).trim().length > n && l) { out.push(l); l = x; } else l = (l + ' ' + x).trim(); }); if (l) out.push(l); return out.slice(0, 4); }
function dibujarEfectos(dt) {
    VIVO.fx.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; });
    VIVO.fx = VIVO.fx.filter(p => p.t < 0.8);
    VIVO.fx.forEach(p => { cx.fillStyle = '#f1c40f'; cx.strokeStyle = '#d4a017'; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(p.x, p.y, 6, 6 * Math.abs(Math.cos(p.t * 14)) + 1, 0, 0, 6.29); cx.fill(); cx.stroke(); });
    VIVO.textos.forEach(t => { t.t += dt; });
    VIVO.textos = VIVO.textos.filter(t => t.t < 1.6);
    VIVO.textos.forEach(t => { cx.save(); cx.globalAlpha = Math.min(1, (1.6 - t.t) * 2); cx.font = '700 17px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.45)'; cx.strokeText(t.txt, t.x, t.y - t.t * 40); cx.fillStyle = t.color; cx.fillText(t.txt, t.x, t.y - t.t * 40); cx.restore(); });
}

// ---------- luz ambiente, apagón, lluvia sobre la escena ----------
function dibujarAmbiente(h) {
    const dark = oscuridad(h) + (apagonAhora() && !G.mejoras.planta ? 0.38 : 0) + (enLluvia() ? 0.08 : 0);
    if (dark > 0) {
        cx.fillStyle = `rgba(12,16,44,${Math.min(0.7, dark)})`; cx.fillRect(0, 0, W, H);
        if (!(apagonAhora() && !G.mejoras.planta)) {   // bombillo encendido
            cx.save(); cx.globalCompositeOperation = 'lighter';
            const g = cx.createRadialGradient(572, 40, 10, 420, 220, 460); g.addColorStop(0, `rgba(255,214,140,${0.35 * dark / 0.42})`); g.addColorStop(1, 'rgba(255,214,140,0)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H); cx.restore();
            cx.strokeStyle = '#2d3436'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(572, 0); cx.lineTo(572, 56); cx.stroke(); cx.fillStyle = '#ffeaa7'; sombra('#ffeaa7', 25, 0, 0); cx.beginPath(); cx.arc(572, 64, 9, 0, 6.29); cx.fill(); sinSombra();
        } else { cx.fillStyle = 'rgba(255,255,255,.85)'; cx.font = '700 15px Fredoka, sans-serif'; cx.textAlign = 'center'; cx.fillText('⚡ Apagón', 480, 300); }
    } else { cx.strokeStyle = '#2d3436'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(572, 0); cx.lineTo(572, 56); cx.stroke(); cx.fillStyle = '#fff3c4'; cx.beginPath(); cx.arc(572, 64, 8, 0, 6.29); cx.fill(); }
}

// ---------- cuadro principal ----------
function dibujar(dt) {
    tiempo += dt;
    const h = G.min / 60;
    cx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    dibujarFondo(h);
    dibujarMostrador();
    if (G.fase === 'dia') moverClientes(dt);
    dibujarClientes();
    dibujarAmbiente(h);
    dibujarEfectos(dt);
    if (VIVO.sirviendo > 0) VIVO.sirviendo -= dt * (VIVO.vel || 1);
}
