// Tour de primera vez ("coach marks"): no tapa la app ni la bloquea. Un anillo animado y un cursor que "toca" invitan a
// hacer clic en un elemento real; al hacerlo aparece la siguiente sugerencia. "Saltar tour" lo cierra y no vuelve a salir
// (la marca se guarda al empezar, así que ni cerrando la pestaña a la mitad reaparece). Solo en pantallas de escritorio.
// Lo llama app.js (maybeStartCoachTour) cuando termina el primer esquema del asistente de bienvenida o de /aprender/.
(function () {
'use strict';
const KEY = 'gk_coach_seen';
const T = (k, p) => (window.tr ? window.tr(k, p) : k);
const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const seen = () => { try { return !!localStorage.getItem(KEY); } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ok */ } };
const trk = (e, m) => { try { if (typeof track === 'function') track(e, m || {}); } catch { /* ok */ } };

const TIPS = [
  { id: 'scroll', kind: 'scroll', t: 'coach.t_scroll', b: 'coach.b_scroll' },
  { id: 'node', kind: 'node', t: 'coach.t_node', b: 'coach.b_node' },
  { id: 'explain', kind: 'menu', sel: '#btnMenuSimpleExplain', t: 'coach.t_explain', b: 'coach.b_explain' },
  { id: 'mark', kind: 'mark', t: 'coach.t_mark', b: 'coach.b_mark' },
  { id: 'def', kind: 'menu', sel: '#btnMenuOpenPanel', t: 'coach.t_def', b: 'coach.b_def', pre: 'coach.t_node2' },
  { id: 'grow', kind: 'menu', sel: '#btnMenuGenerateGroup', t: 'coach.t_grow', b: 'coach.b_grow' }
];

const CSS = `
#gkCoach{position:fixed;inset:0;z-index:390;pointer-events:none;font-family:Inter,system-ui,sans-serif}
#gkCoach .gkc-ring{position:fixed;border:2px solid #4fd1c5;border-radius:14px;box-shadow:0 0 22px rgba(79,209,197,.55),inset 0 0 14px rgba(79,209,197,.18);transition:opacity .3s}
#gkCoach .gkc-ring::before,#gkCoach .gkc-ring::after{content:"";position:absolute;inset:-2px;border:2px solid rgba(79,209,197,.7);border-radius:inherit;animation:gkcPulse 2.2s ease-out infinite}
#gkCoach .gkc-ring::after{animation-delay:1.1s}
@keyframes gkcPulse{0%{transform:scale(1);opacity:.85}100%{transform:scale(1.28);opacity:0}}
#gkCoach .gkc-cur{position:fixed;width:0;height:0}
#gkCoach .gkc-cur-in{position:absolute;left:0;top:0;width:30px;height:30px;margin:-4px 0 0 -6px;animation:gkcTap 3.2s cubic-bezier(.4,0,.2,1) infinite;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
#gkCoach .gkc-cur-in::after{content:"";position:absolute;left:-10px;top:-8px;width:26px;height:26px;border-radius:50%;border:2px solid #4fd1c5;opacity:0;animation:gkcRip 3.2s ease-out infinite}
@keyframes gkcTap{0%{transform:translate(70px,60px);opacity:0}15%{opacity:1}42%{transform:translate(0,0) scale(1)}50%{transform:translate(0,0) scale(.86)}58%{transform:translate(0,0) scale(1)}85%{opacity:1}100%{transform:translate(0,0);opacity:0}}
@keyframes gkcRip{0%,46%{transform:scale(.4);opacity:0}50%{opacity:.9}80%,100%{transform:scale(2.1);opacity:0}}
#gkCoach .gkc-card{position:fixed;width:min(320px,calc(100vw - 24px));background:#11162b;border:1px solid #2c3458;border-radius:16px;padding:16px 16px 12px;box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(79,209,197,.12);color:#eef1fb;pointer-events:auto;opacity:0;transform:translateY(6px);transition:opacity .35s,transform .35s}
#gkCoach .gkc-card.on{opacity:1;transform:none}
#gkCoach .gkc-t{font:700 15px/1.3 Sora,Inter,sans-serif;margin:0 0 6px}
#gkCoach .gkc-b{margin:0;color:#aab2d0;font-size:13.5px;line-height:1.5}
#gkCoach .gkc-foot{display:flex;align-items:center;gap:10px;margin-top:12px}
#gkCoach .gkc-dots{display:flex;gap:5px;flex:1}
#gkCoach .gkc-dots i{width:6px;height:6px;border-radius:50%;background:#2c3458;transition:background .3s}
#gkCoach .gkc-dots i.on{background:#4fd1c5}
#gkCoach button{font:inherit;cursor:pointer;border:none;background:none;color:#8a92b2;font-size:12.5px;padding:6px 4px}
#gkCoach button:hover{color:#eef1fb}
#gkCoach .gkc-next{color:#4fd1c5;font-weight:600}
#gkCoach .gkc-ok{background:#4fd1c5;color:#0a0e1a;font-weight:700;border-radius:10px;padding:8px 14px;font-size:13px}
#gkCoach .gkc-ok:hover{background:#6fe0d6;color:#0a0e1a}
@media (prefers-reduced-motion:reduce){#gkCoach .gkc-ring::before,#gkCoach .gkc-ring::after,#gkCoach .gkc-cur{display:none}#gkCoach .gkc-card{transition:none}}
`;

let S = null;
const menuVisible = () => { const m = document.getElementById('actionMenu'); return !!m && !m.classList.contains('hidden') && m.style.visibility !== 'hidden'; };
const vis = (r) => r && r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;

function pickNodeId() {
  try {
    if (S.nodeId && nodes.get(S.nodeId)) return S.nodeId;
    const roots = getCanvasRootIds(); const root = roots[0];
    const kids = edges.get({ filter: (e) => e.from === root }).map((e) => e.to).filter((id) => nodes.get(id) && !nodes.get(id).isSubscheme);
    S.nodeId = kids[0] || root; return S.nodeId;
  } catch { return null; }
}
function nodeRect() {
  const id = pickNodeId(); if (!id) return null;
  try {
    const bb = network.getBoundingBox(id), a = network.canvasToDOM({ x: bb.left, y: bb.top }), b = network.canvasToDOM({ x: bb.right, y: bb.bottom }), c = document.getElementById('network-container').getBoundingClientRect();
    const r = { left: c.left + a.x, top: c.top + a.y, right: c.left + b.x, bottom: c.top + b.y };
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    if (!S.focused && !(r.left > c.left && r.right < c.right && r.top > c.top && r.bottom < c.bottom)) { S.focused = true; try { network.focus(id, { scale: 1, animation: { duration: 500 } }); } catch { /* ok */ } }
    return r;
  } catch { return null; }
}
function elRect(sel) { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return vis(r) ? r : null; }
function markRect() { const ms = document.querySelectorAll('mark.gk-coverage-mark'); for (const m of ms) { const r = m.getBoundingClientRect(); if (vis(r) && r.top > 60 && r.bottom < innerHeight - 40) { S.markEl = m; return r; } } return null; }

function build() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'gkCoach';
  const ring = document.createElement('div'); ring.className = 'gkc-ring';
  const cur = document.createElement('div'); cur.className = 'gkc-cur'; cur.innerHTML = '<div class="gkc-cur-in"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 3l14 8-6 2-3 6z" fill="#fff" stroke="#0a0e1a" stroke-width="1.4" stroke-linejoin="round"/></svg></div>';
  const card = document.createElement('div'); card.className = 'gkc-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
  root.append(ring, cur, card); document.body.appendChild(root);
  S.el = { st, root, ring, cur, card };
}
function renderCard() {
  const tip = TIPS[S.i], c = S.el.card, pre = S.mode === 'pre';
  const title = S.done ? T('coach.t_done') : (pre ? T(tip.pre || 'coach.t_node2') : T(tip.t));
  const body = S.done ? T('coach.b_done') : (pre ? T('coach.b_node2') : T(tip.b));
  c.textContent = '';
  const t = document.createElement('p'); t.className = 'gkc-t'; t.textContent = title; const b = document.createElement('p'); b.className = 'gkc-b'; b.textContent = body; c.append(t, b);
  const foot = document.createElement('div'); foot.className = 'gkc-foot';
  if (S.done) { const ok = document.createElement('button'); ok.className = 'gkc-ok'; ok.textContent = T('coach.finish'); ok.addEventListener('click', () => end('completed')); foot.append(ok); }
  else {
    const dots = document.createElement('div'); dots.className = 'gkc-dots'; TIPS.forEach((_, k) => { const d = document.createElement('i'); if (k <= S.i) d.className = 'on'; dots.appendChild(d); });
    const skip = document.createElement('button'); skip.textContent = T('coach.skip'); skip.addEventListener('click', () => end('skipped'));
    const nx = document.createElement('button'); nx.className = 'gkc-next'; nx.textContent = T('coach.next'); nx.addEventListener('click', () => advance('next'));
    foot.append(dots, skip, nx);
  }
  c.appendChild(foot); S.shown = (S.done ? 'done' : tip.id) + (pre ? ':pre' : ''); c.classList.remove('on'); requestAnimationFrame(() => c.classList.add('on'));
}
function placeCard(r, avoid) {
  const c = S.el.card, w = c.offsetWidth || 320, h = c.offsetHeight || 150, M = 12;
  // `avoid`: rectángulo que la tarjeta NO debe tapar (el menú de acciones; en el paso
  // "Generar" también la franja donde se abre su submenú, a cualquiera de los dos lados).
  if (avoid) r = avoid;
  if (!r) { c.style.left = (innerWidth - w - 24) + 'px'; c.style.top = (innerHeight - h - 24) + 'px'; return; }
  const cands = [[r.right + 18, r.top + r.height / 2 - h / 2], [r.left - w - 18, r.top + r.height / 2 - h / 2], [r.left + r.width / 2 - w / 2, r.bottom + 18], [r.left + r.width / 2 - w / 2, r.top - h - 18]];
  let pos = cands.find(([x, y]) => x >= M && y >= M && x + w <= innerWidth - M && y + h <= innerHeight - M) || cands[0];
  c.style.left = Math.min(Math.max(M, pos[0]), innerWidth - w - M) + 'px'; c.style.top = Math.min(Math.max(M, pos[1]), innerHeight - h - M) + 'px';
}
function setRing(r) {
  const ring = S.el.ring, cur = S.el.cur;
  if (!r) { ring.style.opacity = '0'; cur.style.display = 'none'; return; }
  const p = 7; ring.style.opacity = '1'; ring.style.left = (r.left - p) + 'px'; ring.style.top = (r.top - p) + 'px'; ring.style.width = (r.width + p * 2) + 'px'; ring.style.height = (r.height + p * 2) + 'px';
  cur.style.display = (RM || (S.i < TIPS.length && TIPS[S.i].kind === 'scroll')) ? 'none' : 'block'; cur.style.left = (r.left + r.width * 0.55) + 'px'; cur.style.top = (r.top + r.height * 0.5) + 'px';
}
function advance(via) {
  if (!S || S.done) return; const tip = TIPS[S.i];
  trk('coach_step_done', { step: tip.id, via }); S.i++; S.mode = ''; S.sawMenu = false; S.skipDelay = 0;
  if (S.i >= TIPS.length) { S.done = true; renderCard(); trk('coach_step', { step: 'done' }); return; }
  trk('coach_step', { step: TIPS[S.i].id }); renderCard();
}
function end(how) {
  if (!S) return; const at = S.done ? 'done' : TIPS[S.i].id; cancelAnimationFrame(S.raf); document.removeEventListener('click', S.onClick, true);
  S.el.root.remove(); S.el.st.remove(); trk(how === 'completed' ? 'coach_completed' : 'coach_skipped', { at }); S = null;
}
let frame = 0;
function tick() {
  if (!S) return; S.raf = requestAnimationFrame(tick); if ((frame++ % 2) && !S.done) return;
  if (!nodes.length) { end('skipped'); return; }
  let r = null;
  if (S.done) { setRing(null); placeCard(null); return; }
  const tip = TIPS[S.i], mv = menuVisible();
  if (S.delayUntil && Date.now() < S.delayUntil) return;
  if (tip.kind === 'node') { if (mv) { advance('menu_open'); return; } r = nodeRect(); S.mode = ''; }
  else if (tip.kind === 'menu') {
    if (mv) { S.sawMenu = true; S.mode = ''; r = elRect(tip.sel); if (!r) { advance('missing'); return; } }
    else if (S.sawMenu) { advance('menu_closed'); return; }
    else { S.mode = 'pre'; r = nodeRect(); }
  } else if (tip.kind === 'scroll') {
    const rp = document.getElementById('readerPanel'), ct = document.getElementById('readerContentContainer');
    if (rp && rp.classList.contains('hidden') && typeof openReaderPanel === 'function') { try { openReaderPanel(); } catch (_e) { /* ok */ } }
    const cr = ct && ct.getBoundingClientRect();
    if (!ct || !vis(cr) || ct.scrollHeight < ct.clientHeight + 60 || !ct.querySelector('mark.gk-coverage-mark')) {
      S.noText = (S.noText || 0) + 1; if (S.noText > 60) { S.noText = 0; advance('no_text'); } return;
    }
    if (S.st0 == null) S.st0 = ct.scrollTop;
    if (Math.abs(ct.scrollTop - S.st0) > 160 && !S.scrollDone) { S.scrollDone = true; setTimeout(() => { if (S && !S.done && TIPS[S.i] === tip) advance('scroll'); }, 1400); }
    r = cr;
  } else if (tip.kind === 'mark') { r = markRect(); if (!r) { S.noMark = (S.noMark || 0) + 1; if (S.noMark > 90) { S.noMark = 0; advance('no_marks'); } return; } }
  const key = (S.done ? 'done' : tip.id) + (S.mode === 'pre' ? ':pre' : '');
  if (S.shown !== key) renderCard();
  let avoid = null;
  if (mv && tip.kind === 'menu') {
    const m = document.getElementById('actionMenu'), mr = m && m.getBoundingClientRect();
    if (mr && mr.width > 2) {
      const pad = tip.id === 'grow' ? 215 : 0;   // el submenú mide ~200px y se abre a un lado
      avoid = { left: mr.left - pad, right: mr.right + pad, top: mr.top, bottom: mr.bottom, width: mr.width + pad * 2, height: mr.height };
    }
  }
  setRing(r); placeCard(r, avoid);
}
function onClick(e) {
  if (!S || S.done) return; const tip = TIPS[S.i]; let hit = false;
  if (tip.kind === 'menu' && S.mode !== 'pre') hit = !!e.target.closest(tip.sel);
  else if (tip.kind === 'mark') hit = !!e.target.closest('mark.gk-coverage-mark');
  if (hit) { const via = 'click'; setTimeout(() => { if (S && !S.done && TIPS[S.i] === tip) advance(via); }, 700); S.delayUntil = Date.now() + 700; }
}
function startCoach(origin) {
  if (S || seen()) return; markSeen(); S = { i: 0, mode: '', origin }; build(); S.onClick = onClick; document.addEventListener('click', onClick, true);
  trk('coach_started', { from: origin }); trk('coach_step', { step: TIPS[0].id }); renderCard(); S.raf = requestAnimationFrame(tick);
}
window.maybeStartCoachTour = function (origin) {
  try {
    if (window.innerWidth < 900 || seen() || S) return;
    const first = typeof isFirstTimeUser !== 'undefined' && isFirstTimeUser;
    if (!(first || origin === 'aprende') || nodes.length < 2) return;
    const t0 = Date.now(); const note = document.getElementById('onbExampleNote');
    const wait = () => { if (seen() || S) return; const noteOpen = note && !note.classList.contains('hidden'); if ((noteOpen && Date.now() - t0 < 25000) || menuVisible()) { setTimeout(wait, 600); return; } startCoach(origin || 'onboarding'); };
    setTimeout(wait, 1500);
  } catch (_e) { /* el tour nunca debe romper la app */ }
};
window.__gkCoachState = () => S;   // solo para pruebas
})();
