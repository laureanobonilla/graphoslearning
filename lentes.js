// Lentes: un mismo tema visto de formas distintas. Se abre desde «Lentes» (cabecera) o desde el menú de un nodo, en una vista
// aparte con «Volver» (el mapa de abajo no se toca). El servidor devuelve datos estructurados (acción `lens` de gemini.js) y aquí
// se dibujan: «genio» como mapa radial con vis-network; «claridad» como escalera de pasos + atajo mental.
// Usa lo que ya expone app.js (nodes, selectedNodeId, getCanvasRootIds, getContextPath, apiFetch, requireAuth, checkBalance,
// applyServerBalance, appAlert/appConfirm, track). Los resultados se guardan en este navegador para no cobrar dos veces.
(function () {
'use strict';
const EN = () => !!(window.I18N && window.I18N.lang === 'en');
const L = (es, en) => (EN() ? en : es);
const COST = 6;                                   // debe coincidir con LENS_COST de billing.js
const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trk = (e, m) => { try { if (typeof track === 'function') track(e, m || {}); } catch (_e) { /* nunca debe notarse */ } };

const LENSES = {
  genio: { icon: '🧠', name: () => L('Entender como un genio', 'Understand it like a genius'), desc: () => L('Analogías, aplicaciones, contraejemplos, perspectivas y preguntas de experto', 'Analogies, applications, counterexamples, perspectives and expert questions') },
  claridad: { icon: '💡', name: () => L('De la confusión a la claridad', 'From confusion to clarity'), desc: () => L('Paso a paso, con metáforas, imágenes, ejemplos y un atajo mental', 'Step by step, with metaphors, images, examples and a mental shortcut') }
};
const CATS = [
  { k: 'analogies', col: '#4fd1c5', name: () => L('Analogías', 'Analogies') },
  { k: 'applications', col: '#8b7cf6', name: () => L('Aplicaciones', 'Applications') },
  { k: 'counterexamples', col: '#f43f5e', name: () => L('Contraejemplos', 'Counterexamples') },
  { k: 'perspectives', col: '#f5b94a', name: () => L('Perspectivas', 'Perspectives') },
  { k: 'expert_questions', col: '#60a5fa', name: () => L('Preguntas de experto', 'Expert questions') }
];

/* ---------- guardado local (no se cobra dos veces el mismo tema) ---------- */
const CK = 'gk_lens_v1';
const cacheAll = () => { try { return JSON.parse(localStorage.getItem(CK) || '{}') || {}; } catch (_e) { return {}; } };
const cacheKey = (lens, name) => lens + '|' + (EN() ? 'en' : 'es') + '|' + String(name).toLowerCase().replace(/\s+/g, ' ').slice(0, 100);
function cachePut(k, v) {
  try {
    const all = cacheAll(); all[k] = v;
    const ks = Object.keys(all);
    if (ks.length > 30) ks.sort((a, b) => (all[a].t || 0) - (all[b].t || 0)).slice(0, ks.length - 30).forEach((x) => delete all[x]);
    localStorage.setItem(CK, JSON.stringify(all));
  } catch (_e) { /* sin almacenamiento: se muestra igual */ }
}

/* ---------- qué tema se mira ---------- */
function target() {
  try {
    if (typeof nodes === 'undefined' || !nodes.length) return null;
    let id = (typeof selectedNodeId !== 'undefined' && selectedNodeId && nodes.get(selectedNodeId)) ? selectedNodeId : null;
    const sel = !!id;
    if (!id) { const r = getCanvasRootIds(); id = r && r[0]; }
    const nd = id && nodes.get(id); if (!nd) return null;
    const clean = (t) => String(t || '').replace(/[*_`#]/g, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
    const name = clean(nd.baseTitle || nd.label).slice(0, 120); if (!name) return null;
    let ctx = ''; try { ctx = getContextPath(id) || ''; } catch (_e) { /* sin contexto */ }
    return { id, name, sel, ctx: String(ctx).slice(0, 400) };
  } catch (_e) { return null; }
}

/* ---------- estilos ---------- */
const CSS = `
#gkLensBtnWrap{position:relative;display:flex;align-items:center}
#gkLensBtn{background:#0f1428;border:1px solid #2c3458;border-radius:6px;padding:4px 9px;font:600 12px Inter,system-ui,sans-serif;color:#eef1fb;cursor:pointer;white-space:nowrap}
#gkLensBtn:hover,#gkLensBtn[aria-expanded="true"]{border-color:#4fd1c5;color:#4fd1c5}
#gkLensMenu{position:fixed;z-index:135;width:min(330px,calc(100vw - 20px));background:#11162b;border:1px solid #2c3458;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);padding:6px;font-family:Inter,system-ui,sans-serif;color:#eef1fb}
#gkLensMenu[hidden]{display:none}
#gkLensMenu .lm-t{padding:8px 10px 6px;font-size:12px;color:#8a92b2;line-height:1.35}
#gkLensMenu .lm-t b{color:#eef1fb;font-weight:600}
#gkLensMenu button{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;border-radius:10px;padding:9px 10px;color:inherit;cursor:pointer}
#gkLensMenu button:hover,#gkLensMenu button:focus-visible{background:#1d2442;outline:none}
#gkLensMenu .lm-i{font-size:20px;line-height:1.2}
#gkLensMenu .lm-n{font-weight:600;font-size:14px}
#gkLensMenu .lm-d{font-size:12px;color:#8a92b2;margin-top:2px;line-height:1.35}
#gkLensMenu .lm-c{margin-left:auto;font-size:11px;color:#8a92b2;white-space:nowrap;padding-top:3px}
#gkLens{position:fixed;inset:0;z-index:140;background:#0a0e1a;color:#eef1fb;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column}
#gkLens[hidden]{display:none}
#gkLens .gl-bar{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #1d2442;flex-wrap:wrap}
#gkLens .gl-back{display:inline-flex;align-items:center;gap:6px;background:#161c35;border:1px solid #2c3458;color:#eef1fb;border-radius:999px;padding:7px 14px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}
#gkLens .gl-back:hover{border-color:#4fd1c5;color:#4fd1c5}
#gkLens .gl-ttl{font:700 16px Sora,Inter,sans-serif;min-width:0}
#gkLens .gl-sub{color:#8a92b2;font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw}
#gkLens .gl-sp{flex:1}
#gkLens .gl-ghost{background:none;border:1px solid #2c3458;color:#aab2d0;border-radius:10px;padding:6px 11px;font:500 12.5px Inter,system-ui,sans-serif;cursor:pointer}
#gkLens .gl-ghost:hover{color:#eef1fb;border-color:#4fd1c5}
#gkLens .gl-body{flex:1;min-height:0;display:flex}
#gkLens .gl-state{margin:auto;max-width:420px;text-align:center;padding:24px;color:#aab2d0;line-height:1.5}
#gkLens .gl-state b{display:block;color:#eef1fb;font:700 17px Sora,Inter,sans-serif;margin-bottom:6px}
#gkLens .gl-spin{width:34px;height:34px;border-radius:50%;border:3px solid #2c3458;border-top-color:#4fd1c5;margin:0 auto 14px;animation:glSpin 1s linear infinite}
@keyframes glSpin{to{transform:rotate(360deg)}}
#gkLens .gl-prim{background:#4fd1c5;color:#0a0e1a;border:0;border-radius:10px;padding:10px 16px;font:700 13.5px Inter,system-ui,sans-serif;cursor:pointer}
#gkLens .gl-prim:hover{background:#6fe0d6}
#gkLens .gl-map{flex:1;min-width:0;position:relative}
#gkLens .gl-map>div{position:absolute;inset:0}
#gkLens .gl-side{width:360px;max-width:42vw;border-left:1px solid #1d2442;overflow:auto;padding:18px 18px 28px;background:#0d1226}
#gkLens .gl-ess{font:600 18px/1.4 Sora,Inter,sans-serif;margin:0 0 14px}
#gkLens .gl-chip{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;color:#0a0e1a;margin-bottom:10px}
#gkLens .gl-h{font:700 15px Sora,Inter,sans-serif;margin:0 0 8px}
#gkLens .gl-p{margin:0 0 12px;color:#cdd3ea;line-height:1.55;font-size:14.5px}
#gkLens .gl-caut{border:1px solid #5a4a1e;background:#1d1a0e;color:#e4cf96;border-radius:10px;padding:9px 12px;font-size:13px;line-height:1.45;margin:14px 0}
#gkLens .gl-hint{color:#8a92b2;font-size:13px;line-height:1.5;margin:0 0 14px}
#gkLens .gl-legend{display:flex;flex-direction:column;gap:6px;margin:0 0 18px;padding:0;list-style:none;font-size:13px;color:#aab2d0}
#gkLens .gl-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}
#gkLens .gl-acts{display:flex;flex-direction:column;gap:8px;margin-top:18px}
#gkLens .gl-scroll{flex:1;overflow:auto;padding:22px 16px 60px}
#gkLens .gl-col{max-width:720px;margin:0 auto}
#gkLens .gl-core{border:1px solid #2c3458;background:#11162b;border-radius:16px;padding:18px 20px;margin-bottom:22px}
#gkLens .gl-core small{color:#8a92b2;font-size:13px}
#gkLens .gl-prog{display:flex;align-items:center;gap:10px;color:#8a92b2;font-size:13px;margin:0 2px 14px}
#gkLens .gl-prog i{flex:1;height:5px;border-radius:9px;background:#1d2442;overflow:hidden;position:relative}
#gkLens .gl-prog i b{position:absolute;left:0;top:0;bottom:0;background:#4fd1c5;border-radius:9px;transition:width .35s}
#gkLens .gl-step{position:relative;display:flex;gap:14px;margin-bottom:6px}
#gkLens .gl-rail{display:flex;flex-direction:column;align-items:center;flex:none;width:44px}
#gkLens .gl-num{width:44px;height:44px;border-radius:50%;background:#161c35;border:2px solid #4fd1c5;display:flex;align-items:center;justify-content:center;font-size:21px}
#gkLens .gl-step.done .gl-num{background:#4fd1c5;border-color:#4fd1c5}
#gkLens .gl-line{flex:1;width:2px;background:#2c3458;margin:4px 0}
#gkLens .gl-step:last-child .gl-line{display:none}
#gkLens .gl-card{flex:1;min-width:0;border:1px solid #2c3458;background:#11162b;border-radius:16px;padding:16px 18px;margin-bottom:12px}
#gkLens .gl-card h3{font:700 16px Sora,Inter,sans-serif;margin:0 0 6px}
#gkLens .gl-card p{margin:0 0 10px;color:#cdd3ea;line-height:1.55;font-size:14.5px}
#gkLens .gl-row{display:flex;gap:10px;align-items:flex-start;margin:0 0 8px;font-size:14px;line-height:1.5;color:#cdd3ea}
#gkLens .gl-row b{flex:none;font-weight:600;color:#4fd1c5;min-width:84px}
#gkLens .gl-row.img b{color:#8b7cf6}
#gkLens .gl-row.ex b{color:#f5b94a}
#gkLens .gl-ok{margin-top:6px;background:none;border:1px solid #2c3458;color:#aab2d0;border-radius:9px;padding:6px 12px;font:500 12.5px Inter,system-ui,sans-serif;cursor:pointer}
#gkLens .gl-ok:hover{border-color:#4fd1c5;color:#4fd1c5}
#gkLens .gl-step.done .gl-ok{background:#12302c;border-color:#4fd1c5;color:#4fd1c5}
#gkLens .gl-short{border:2px solid #8b7cf6;background:#14122b;border-radius:18px;padding:20px 20px 18px;margin-top:10px}
#gkLens .gl-short.glow{animation:glGlow 1.6s ease-out 1}
@keyframes glGlow{0%{box-shadow:0 0 0 0 rgba(139,124,246,.7)}100%{box-shadow:0 0 0 22px rgba(139,124,246,0)}}
#gkLens .gl-short h2{font:700 22px Sora,Inter,sans-serif;margin:0 0 4px}
#gkLens .gl-parts{display:flex;flex-direction:column;gap:8px;margin:14px 0}
#gkLens .gl-part{display:flex;gap:12px;align-items:center}
#gkLens .gl-key{flex:none;min-width:44px;max-width:44%;padding:8px 10px;border-radius:10px;background:#8b7cf6;color:#0a0e1a;font:700 16px Sora,Inter,sans-serif;text-align:center}
#gkLens .gl-meaning{color:#cdd3ea;font-size:14.5px;line-height:1.4}
@media (max-width:860px){
  #gkLens .gl-body.split{flex-direction:column}
  #gkLens .gl-side{width:auto;max-width:none;border-left:0;border-top:1px solid #1d2442;max-height:44vh}
  #gkLens .gl-sub{max-width:100%;order:5;flex-basis:100%}
  #gkLens .gl-rail{width:34px}#gkLens .gl-num{width:34px;height:34px;font-size:17px}
  #gkLens .gl-row{flex-direction:column;gap:2px}
}
@media (prefers-reduced-motion:reduce){#gkLens .gl-spin{animation:none}#gkLens .gl-short.glow{animation:none}#gkLens .gl-prog i b{transition:none}}
`;
function injectCss() { if (document.getElementById('gkLensCss')) return; const s = document.createElement('style'); s.id = 'gkLensCss'; s.textContent = CSS; document.head.appendChild(s); }

/* ---------- vista ---------- */
let S = null;             // { lens, tg, key, data, done, network }
let root = null, busy = false;

function ensureRoot() {
  if (root) return root;
  injectCss();
  root = document.createElement('div');
  root.id = 'gkLens'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  document.body.appendChild(root);
  return root;
}
function destroyNetwork() { try { if (S && S.network) S.network.destroy(); } catch (_e) { /* nada */ } if (S) S.network = null; }
function close() {
  destroyNetwork();
  if (root) { root.hidden = true; root.innerHTML = ''; }
  document.removeEventListener('keydown', onKey, true);
  S = null; busy = false;
}
function onKey(e) { if (e.key === 'Escape' && root && !root.hidden) { e.stopPropagation(); close(); } }

function barHtml(extra) {
  const l = LENSES[S.lens];
  return '<div class="gl-bar"><button type="button" class="gl-back" id="glBack">‹ ' + esc(L('Volver al mapa', 'Back to the map')) + '</button>' +
    '<span class="gl-ttl">' + l.icon + ' ' + esc(l.name()) + '</span><span class="gl-sub">' + esc(S.tg.name) + '</span><span class="gl-sp"></span>' + (extra || '') + '</div>';
}
function setBody(html, cls) {
  root.innerHTML = barHtml(S.data ? '<button type="button" class="gl-ghost" id="glRegen">' + esc(L('Generar de nuevo', 'Regenerate')) + ' · ' + COST + '</button>' : '') + '<div class="gl-body ' + (cls || '') + '" id="glBody">' + html + '</div>';
  $('#glBack', root).addEventListener('click', close);
  const rg = $('#glRegen', root); if (rg) rg.addEventListener('click', regenerate);
}
function showLoading() {
  destroyNetwork();
  setBody('<div class="gl-state"><div class="gl-spin"></div><b>' + esc(L('Armando la lente…', 'Building the lens…')) + '</b>' + esc(L('Suele tardar entre 10 y 25 segundos.', 'It usually takes 10 to 25 seconds.')) + '</div>');
}
function showError(msg) {
  destroyNetwork();
  setBody('<div class="gl-state"><b>' + esc(L('No se pudo armar la lente', 'Could not build the lens')) + '</b>' + esc(msg || L('Intenta de nuevo en un momento. No se cobró nada.', 'Try again in a moment. You were not charged.')) + '<div style="margin-top:16px"><button type="button" class="gl-prim" id="glRetry">' + esc(L('Reintentar', 'Retry')) + '</button></div></div>');
  $('#glRetry', root).addEventListener('click', () => generate());
}

/* ---------- lente 1: genio (mapa radial) ---------- */
function wrapLabel(t, n) {
  const w = String(t).split(/\s+/); const out = []; let line = '';
  w.forEach((x) => { if ((line + ' ' + x).trim().length > n && line) { out.push(line); line = x; } else line = (line + ' ' + x).trim(); });
  if (line) out.push(line); return out.slice(0, 3).join('\n');
}
function buildGenio() {
  const d = S.data, active = CATS.filter((c) => (d[c.k] || []).length);
  const ns = [], es = [], meta = {};
  ns.push({ id: 'c', label: wrapLabel(S.tg.name, 18), x: 0, y: 0, shape: 'box', color: { background: '#4fd1c5', border: '#6fe0d6' }, font: { color: '#0a0e1a', size: 21, face: 'Sora, Inter, sans-serif' }, margin: 14, shapeProperties: { borderRadius: 14 }, fixed: true });
  meta.c = { root: true };
  const R1 = 190, R2 = 400, gap = 27;
  active.forEach((c, i) => {
    const ang = (-90 + i * (360 / active.length)) * Math.PI / 180, bid = 'b_' + c.k;
    ns.push({ id: bid, label: c.name(), x: Math.cos(ang) * R1, y: Math.sin(ang) * R1, shape: 'box', color: { background: c.col, border: c.col }, font: { color: '#0a0e1a', size: 16, face: 'Inter, sans-serif' }, margin: 10, shapeProperties: { borderRadius: 10 }, fixed: true });
    meta[bid] = { cat: c, branch: true };
    es.push({ from: 'c', to: bid, color: { color: c.col, opacity: 0.7 }, width: 3 });
    const items = d[c.k]; const n = items.length;
    items.forEach((it, j) => {
      const isQ = c.k === 'expert_questions', title = isQ ? it : it.title, text = isQ ? null : it.text;
      const a = ang + ((j - (n - 1) / 2) * gap) * Math.PI / 180, r = R2 + (j % 2 ? 70 : 0), lid = 'l_' + c.k + '_' + j;
      const short = isQ ? (title.length > 46 ? title.slice(0, 44).trim() + '…' : title) : title;
      ns.push({ id: lid, label: wrapLabel(short, 20), x: Math.cos(a) * r, y: Math.sin(a) * r, shape: 'box', color: { background: '#161c35', border: c.col, highlight: { background: '#1d2442', border: c.col } }, borderWidth: 2, font: { color: '#eef1fb', size: 13, face: 'Inter, sans-serif' }, margin: 9, shapeProperties: { borderRadius: 9 }, fixed: true });
      meta[lid] = { cat: c, title, text, q: isQ };
      es.push({ from: bid, to: lid, color: { color: c.col, opacity: 0.5 }, width: 2 });
    });
  });
  return { ns, es, meta, active };
}
function sideDefault(active) {
  const d = S.data;
  return '<p class="gl-ess">' + esc(d.essence) + '</p>' +
    (d.caution ? '<div class="gl-caut">' + esc(d.caution) + '</div>' : '') +
    '<p class="gl-hint">' + esc(L('Toca una rama o una tarjeta del mapa para leerla aquí. Arrastra para moverte y usa la rueda para acercar.', 'Tap a branch or card on the map to read it here. Drag to move and scroll to zoom.')) + '</p>' +
    '<ul class="gl-legend">' + active.map((c) => '<li><i style="background:' + c.col + '"></i>' + esc(c.name()) + ' (' + (d[c.k] || []).length + ')</li>').join('') + '</ul>' + actsHtml();
}
function actsHtml() {
  return '<div class="gl-acts"><button type="button" class="gl-prim" id="glPractice">' + esc(L('Practicar este tema en nivel avanzado', 'Practise this topic at an advanced level')) + '</button>' +
    (S.lens === 'genio' ? '<button type="button" class="gl-ghost" id="glClarity">' + esc(L('No lo termino de entender: verlo paso a paso', 'Still unclear: see it step by step')) + '</button>' : '') + '</div>';
}
function wireActs() {
  const p = $('#glPractice', root); if (p) p.addEventListener('click', () => { trk('lens_practice_click', { lens: S.lens }); window.open('/escribir/?practicar=' + encodeURIComponent(S.tg.name.slice(0, 160)) + '&nivel=3', '_blank', 'noopener'); });
  const c = $('#glClarity', root); if (c) c.addEventListener('click', () => { const tg = S.tg; close(); openLens('claridad', { target: tg }); });
}
function renderGenio() {
  const g = buildGenio();
  setBody('<div class="gl-map"><div id="glNet"></div></div><aside class="gl-side" id="glSide" aria-live="polite"></aside>', 'split');
  const side = $('#glSide', root);
  const showDef = () => { side.innerHTML = sideDefault(g.active); wireActs(); };
  showDef();
  if (typeof vis === 'undefined' || !vis.Network) { $('#glNet', root).innerHTML = '<div class="gl-state">' + esc(L('No se pudo cargar el mapa. Revisa tu conexión.', 'The map could not load. Check your connection.')) + '</div>'; return; }
  const net = new vis.Network($('#glNet', root), { nodes: new vis.DataSet(g.ns), edges: new vis.DataSet(g.es) }, {
    physics: false, interaction: { hover: true, zoomView: true, dragView: true, selectConnectedEdges: false, tooltipDelay: 250 },
    nodes: { borderWidth: 2, shadow: false }, edges: { smooth: false, arrows: { to: false } }
  });
  S.network = net;
  requestAnimationFrame(() => { try { net.fit({ animation: false }); } catch (_e) { /* nada */ } });
  net.on('click', (p) => {
    const id = p.nodes && p.nodes[0], m = id && g.meta[id];
    if (!m || m.root) { showDef(); return; }
    if (m.branch) { const items = S.data[m.cat.k] || []; side.innerHTML = '<span class="gl-chip" style="background:' + m.cat.col + '">' + esc(m.cat.name()) + '</span>' + items.map((it) => '<div style="margin-bottom:14px"><p class="gl-h">' + esc(typeof it === 'string' ? it : it.title) + '</p>' + (typeof it === 'string' ? '' : '<p class="gl-p">' + esc(it.text) + '</p>') + '</div>').join('') + actsHtml(); wireActs(); trk('lens_branch_open', { cat: m.cat.k }); return; }
    side.innerHTML = '<span class="gl-chip" style="background:' + m.cat.col + '">' + esc(m.cat.name()) + '</span><p class="gl-h">' + esc(m.title) + '</p>' + (m.text ? '<p class="gl-p">' + esc(m.text) + '</p>' : '<p class="gl-hint">' + esc(L('Intenta responderla con tus palabras antes de buscar. En Practicar puedes escribir tu respuesta y recibir retroalimentación.', 'Try answering it in your own words first. In Practice you can write your answer and get feedback.')) + '</p>') + actsHtml();
    wireActs(); trk('lens_card_open', { cat: m.cat.k });
  });
}

/* ---------- lente 2: claridad (escalera + atajo) ---------- */
function saveDone() { if (S && S.key) cachePut(S.key, { t: Date.now(), data: S.data, done: S.done }); }
function renderClaridad() {
  const d = S.data, steps = d.steps || [], sc = d.shortcut || {};
  const doneN = () => Object.keys(S.done || {}).filter((k) => S.done[k]).length;
  const html = '<div class="gl-scroll"><div class="gl-col">' +
    '<div class="gl-core"><p class="gl-ess" style="margin:0 0 4px">' + esc(d.essence) + '</p><small>' + esc(L('La idea en una frase. Ahora, paso a paso.', 'The idea in one sentence. Now, step by step.')) + '</small></div>' +
    (d.caution ? '<div class="gl-caut" style="margin-top:0">' + esc(d.caution) + '</div>' : '') +
    '<div class="gl-prog"><span id="glProgTxt"></span><i><b id="glProgBar"></b></i></div>' +
    steps.map((s, i) => '<div class="gl-step" data-i="' + i + '" style="margin-left:' + Math.min(i, 4) * 10 + 'px"><div class="gl-rail"><div class="gl-num">' + esc(s.emoji || String(i + 1)) + '</div><div class="gl-line"></div></div>' +
      '<div class="gl-card"><h3>' + (i + 1) + '. ' + esc(s.title) + '</h3><p>' + esc(s.explanation) + '</p>' +
      (s.metaphor ? '<div class="gl-row"><b>' + esc(L('Metáfora', 'Metaphor')) + '</b><span>' + esc(s.metaphor) + '</span></div>' : '') +
      (s.image ? '<div class="gl-row img"><b>' + esc(L('Imagínalo', 'Picture it')) + '</b><span>' + esc(s.image) + '</span></div>' : '') +
      (s.example ? '<div class="gl-row ex"><b>' + esc(L('En la vida real', 'In real life')) + '</b><span>' + esc(s.example) + '</span></div>' : '') +
      '<button type="button" class="gl-ok" data-ok="' + i + '"></button></div></div>').join('') +
    '<div class="gl-short" id="glShort"><h2>' + esc(sc.name || L('Tu atajo mental', 'Your mental shortcut')) + '</h2><small style="color:#8a92b2">' + esc(L('Para recordarlo siempre', 'To remember it for good')) + '</small>' +
    '<div class="gl-parts">' + (sc.parts || []).map((p) => '<div class="gl-part"><span class="gl-key">' + esc(p.key) + '</span><span class="gl-meaning">' + esc(p.meaning) + '</span></div>').join('') + '</div>' +
    (sc.how_to_use ? '<p class="gl-p" style="margin:0">' + esc(sc.how_to_use) + '</p>' : '') +
    '<div class="gl-acts" style="flex-direction:row;flex-wrap:wrap"><button type="button" class="gl-ghost" id="glCopy">' + esc(L('Copiar el atajo', 'Copy the shortcut')) + '</button><button type="button" class="gl-prim" id="glPractice">' + esc(L('Ponerme a prueba', 'Test myself')) + '</button></div></div>' +
    '</div></div>';
  setBody(html);
  const refresh = (glow) => {
    root.querySelectorAll('.gl-step').forEach((el) => { const i = el.dataset.i, on = !!S.done[i]; el.classList.toggle('done', on); const b = el.querySelector('.gl-ok'); b.textContent = on ? L('✓ Entendido', '✓ Got it') : L('Lo entendí', 'Got it'); b.setAttribute('aria-pressed', on); });
    const n = doneN(), tot = steps.length;
    $('#glProgTxt', root).textContent = L(n + ' de ' + tot + ' pasos entendidos', n + ' of ' + tot + ' steps understood');
    $('#glProgBar', root).style.width = (tot ? n / tot * 100 : 0) + '%';
    if (glow && n === tot && tot) { const sh = $('#glShort', root); sh.classList.remove('glow'); void sh.offsetWidth; sh.classList.add('glow'); sh.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); }
  };
  refresh(false);
  root.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => { const i = b.dataset.ok; S.done[i] = !S.done[i]; saveDone(); trk('lens_step_done', { i: Number(i), on: !!S.done[i] }); refresh(true); }));
  $('#glCopy', root).addEventListener('click', () => {
    const t = (sc.name || '') + '\n' + (sc.parts || []).map((p) => p.key + ' — ' + p.meaning).join('\n') + (sc.how_to_use ? '\n' + sc.how_to_use : '');
    try { navigator.clipboard.writeText(t).then(() => { $('#glCopy', root).textContent = L('Copiado', 'Copied'); }, () => {}); } catch (_e) { /* nada */ }
    trk('lens_copy', {});
  });
  wireActs();
}

function render() {
  if (!S || !S.data) return;
  if (S.lens === 'genio') renderGenio(); else renderClaridad();
  const b = $('#glBack', root); if (b) b.focus({ preventScroll: true });
}

/* ---------- abrir / generar ---------- */
async function generate() {
  if (!S || busy) return;
  busy = true; const mine = S;
  showLoading();
  trk('lens_generate', { lens: S.lens });
  try {
    const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', { method: 'POST', body: JSON.stringify({ action: 'lens', lens: S.lens, topic: S.tg.name, contextPath: S.tg.ctx }) });
    if (S !== mine) return;
    if (!ok) { busy = false; trk('lens_error', { status }); showError(status >= 500 ? null : (data && data.error) || null); return; }
    if (typeof applyServerBalance === 'function') applyServerBalance(data);
    S.data = data; S.done = {};
    cachePut(S.key, { t: Date.now(), data, done: {} });
    trk('lens_result', { lens: S.lens });
    busy = false; render();
  } catch (e) {
    busy = false;
    if (e && e.message === 'billing_blocked') { if (S === mine) close(); return; }   // app.js ya mostró el muro de cuenta o la tienda
    if (S === mine) { trk('lens_error', { status: 0 }); showError(L('Sin conexión o el servidor tardó demasiado. No se cobró nada.', 'No connection, or the server took too long. You were not charged.')); }
  }
}
async function regenerate() {
  if (!S || busy) return;
  let go = true;
  try { if (typeof appConfirm === 'function') go = await appConfirm(L('Armar la lente de nuevo cuesta ' + COST + ' nodos y reemplaza la actual. ¿Seguimos?', 'Rebuilding the lens costs ' + COST + ' nodes and replaces the current one. Continue?')); } catch (_e) { go = true; }
  if (!go) return;
  if (typeof checkBalance === 'function' && !checkBalance(COST)) return;
  generate();
}
function openLens(lens, opts) {
  if (!LENSES[lens]) return;
  const tg = (opts && opts.target) || target();
  if (!tg) { try { appAlert(L('Primero crea un esquema para verlo con una lente.', 'Create a map first to view it through a lens.')); } catch (_e) { /* nada */ } return; }
  closeMenu();
  const key = cacheKey(lens, tg.name), c = cacheAll()[key];
  if (!c) {
    if (typeof requireAuth === 'function' && !requireAuth(L('ver este tema con una lente', 'view this topic through a lens'))) return;
    if (typeof checkBalance === 'function' && !checkBalance(COST)) return;
  }
  ensureRoot(); root.hidden = false;
  S = { lens, tg, key, data: c ? c.data : null, done: (c && c.done) || {}, network: null };
  document.addEventListener('keydown', onKey, true);
  trk('lens_open', { lens, cached: !!c, from: (opts && opts.from) || 'menu' });
  if (c) render(); else generate();
}

/* ---------- menú «Lentes» de la cabecera ---------- */
let menu = null, btn = null;
function closeMenu() { if (menu) menu.hidden = true; if (btn) btn.setAttribute('aria-expanded', 'false'); }
function openMenu() {
  const tg = target();
  menu.innerHTML = '<div class="lm-t">' + (tg ? esc(L(tg.sel ? 'Sobre el nodo seleccionado:' : 'Sobre el tema del mapa:', tg.sel ? 'On the selected node:' : 'On the map topic:')) + ' <b>' + esc(tg.name) + '</b>' : esc(L('Crea un esquema para usar las lentes.', 'Create a map to use the lenses.'))) + '</div>' +
    Object.keys(LENSES).map((k) => { const l = LENSES[k], cached = tg && cacheAll()[cacheKey(k, tg.name)]; return '<button type="button" data-lens="' + k + '"><span class="lm-i">' + l.icon + '</span><span><div class="lm-n">' + esc(l.name()) + '</div><div class="lm-d">' + esc(l.desc()) + '</div></span><span class="lm-c">' + esc(cached ? L('guardada', 'saved') : COST + ' ' + L('nodos', 'nodes')) + '</span></button>'; }).join('');
  const r = btn.getBoundingClientRect();
  menu.hidden = false;
  menu.style.top = Math.round(r.bottom + 6) + 'px';
  menu.style.left = Math.max(10, Math.min(innerWidth - menu.offsetWidth - 10, r.left)) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  menu.querySelectorAll('[data-lens]').forEach((b) => b.addEventListener('click', () => openLens(b.dataset.lens, { target: tg, from: 'header' })));
  const f = menu.querySelector('[data-lens]'); if (f) f.focus({ preventScroll: true });
}
function installHeader() {
  const vm = document.getElementById('viewMode'); if (!vm || document.getElementById('gkLensBtn')) return;
  injectCss();
  const wrap = document.createElement('div'); wrap.id = 'gkLensBtnWrap';
  wrap.innerHTML = '<button type="button" id="gkLensBtn" aria-haspopup="true" aria-expanded="false" title="' + esc(L('Ver el tema con otras lentes: genio, claridad…', 'View the topic through other lenses')) + '">🔭 ' + esc(L('Lentes', 'Lenses')) + ' ▾</button>';
  const host = vm.closest('div'); (host && host.parentNode ? host : vm).insertAdjacentElement('afterend', wrap);
  btn = $('#gkLensBtn', wrap);
  menu = document.createElement('div'); menu.id = 'gkLensMenu'; menu.hidden = true; menu.setAttribute('role', 'menu'); document.body.appendChild(menu);
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(); });
  document.addEventListener('click', (e) => { if (menu && !menu.hidden && !menu.contains(e.target) && e.target !== btn) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
}
function installNodeMenu() {
  const b = document.getElementById('btnMenuLensClarity'); if (!b) return;
  b.textContent = L('💡 Explícamelo paso a paso', '💡 Explain it step by step');
  b.addEventListener('click', () => {
    try { const m = document.getElementById('actionMenu'); if (m) { m.style.visibility = 'hidden'; m.classList.add('hidden'); } } catch (_e) { /* nada */ }
    openLens('claridad', { from: 'node_menu' });
  });
}
function init() { installHeader(); installNodeMenu(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
window.GK_LENSES = { open: openLens };
})();
