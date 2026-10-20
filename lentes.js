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
  camino: { icon: '🧭', name: () => L('Cómo llegar ahí', 'How to get there'), desc: () => L('Ingeniería inversa: qué dominar antes, en qué orden y por qué, con definiciones', 'Reverse engineering: what to master first, in what order and why, with definitions') },
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
const LEVELS = ['principiante', 'intermedio', 'avanzado'];
const LVNAME = { principiante: () => L('Principiante', 'Beginner'), intermedio: () => L('Intermedio', 'Intermediate'), avanzado: () => L('Avanzado', 'Advanced') };
let level = 'intermedio';
try { const v = localStorage.getItem('gk_lens_level'); if (LEVELS.includes(v)) level = v; } catch (_e) { /* nada */ }
const setLevel = (v) => { level = v; try { localStorage.setItem('gk_lens_level', v); } catch (_e) { /* nada */ } };
const cacheKey = (lens, name, lv) => lens + '|' + (lv || level) + '|' + (EN() ? 'en' : 'es') + '|' + String(name).toLowerCase().replace(/\s+/g, ' ').slice(0, 100);
function cachePut(k, v) {
  try {
    const all = cacheAll(); all[k] = v;
    const ks = Object.keys(all);
    if (ks.length > 30) ks.sort((a, b) => (all[a].t || 0) - (all[b].t || 0)).slice(0, ks.length - 30).forEach((x) => delete all[x]);
    localStorage.setItem(CK, JSON.stringify(all));
  } catch (_e) { /* sin almacenamiento: se muestra igual */ }
}

/* ---------- qué tema se mira ---------- */
// Lo que el mapa ya dice alrededor del nodo (subtemas y vecinos), para que la lente use el mismo vocabulario y no lo repita.
function mapContext(id, clean) {
  try {
    if (typeof edges === 'undefined') return '';
    const lab = (i) => { const n = nodes.get(i); return n && !n.isSubscheme ? clean(n.baseTitle || n.label).slice(0, 60) : ''; };
    const kids = edges.get({ filter: (e) => e.from === id }).map((e) => lab(e.to)).filter(Boolean).slice(0, 8);
    const par = edges.get({ filter: (e) => e.to === id }).map((e) => e.from)[0];
    const sibs = par ? edges.get({ filter: (e) => e.from === par && e.to !== id }).map((e) => lab(e.to)).filter(Boolean).slice(0, 6) : [];
    return (kids.length ? 'subtemas: ' + kids.join(', ') + '. ' : '') + (sibs.length ? 'temas vecinos: ' + sibs.join(', ') + '.' : '');
  } catch (_e) { return ''; }
}
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
    return { id, name, sel, ctx: String(ctx).slice(0, 400), map: mapContext(id, clean) };
  } catch (_e) { return null; }
}

/* ---------- estilos ---------- */
const CSS = `
#gkLensBtnWrap{position:relative;display:flex;align-items:center}
#gkLensBtn{position:relative;overflow:hidden;background:linear-gradient(120deg,#4fd1c5 0%,#7c8cf8 62%,#a78bfa 100%);border:0;border-radius:999px;padding:7px 15px 7px 13px;font:700 13px Sora,Inter,system-ui,sans-serif;letter-spacing:.01em;color:#071018;cursor:pointer;white-space:nowrap;box-shadow:0 0 0 1px rgba(255,255,255,.18) inset,0 4px 18px rgba(124,140,248,.45);transition:transform .15s,box-shadow .2s}
#gkLensBtn::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-20deg);animation:gkSheen 6s 2s infinite}
@keyframes gkSheen{0%,70%{left:-60%}100%{left:130%}}
@media (prefers-reduced-motion:reduce){#gkLensBtn::after{animation:none}}
#gkLensBtn small{font:600 10.5px Inter,system-ui,sans-serif;opacity:.72;margin-left:7px}
#gkLensBtn:hover,#gkLensBtn[aria-expanded="true"]{transform:translateY(-1px);box-shadow:0 0 0 1px rgba(255,255,255,.3) inset,0 6px 24px rgba(79,209,197,.55)}
#gkLensBtn:focus-visible{outline:2px solid #fff;outline-offset:2px}
#gkCards{position:fixed;inset:0;z-index:139;background:radial-gradient(1200px 600px at 50% -10%,#141b3a 0%,#0a0e1a 60%);color:#eef1fb;font-family:Inter,system-ui,sans-serif;overflow-y:auto;padding:28px 20px 40px}
#gkCards[hidden]{display:none}
#gkCards .gc-w{max-width:980px;margin:0 auto}
#gkCards .gc-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px}
#gkCards .gc-x{background:none;border:1px solid #2c3458;color:#aab2d0;border-radius:999px;padding:6px 13px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}
#gkCards .gc-x:hover{color:#eef1fb;border-color:#4fd1c5}
#gkCards h2{font:700 clamp(22px,3.4vw,32px)/1.2 Sora,Inter,sans-serif;margin:14px 0 4px}
#gkCards .gc-sub{color:#8a92b2;font-size:14px;margin:0 0 20px}
#gkCards .gc-lv{display:inline-flex;gap:3px;background:#0a0e1a;border:1px solid #2c3458;border-radius:10px;padding:3px;margin-left:auto}
#gkCards .gc-lv button{border:0;background:none;color:#8a92b2;border-radius:8px;padding:5px 10px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer}
#gkCards .gc-lv button.on{background:#1d2442;color:#4fd1c5}
#gkCards .gc-h{font:600 12.5px Inter,system-ui,sans-serif;color:#8a92b2;margin:22px 0 10px}
#gkCards .gc-h b{color:#eef1fb;font-weight:700}
#gkCards .gc-g{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
#gkCards .gc-c{display:flex;flex-direction:column;gap:6px;text-align:left;background:#11162b;border:1px solid #2c3458;border-radius:16px;padding:16px 16px 14px;color:inherit;cursor:pointer;font-family:inherit;transition:transform .15s,border-color .15s,box-shadow .2s}
#gkCards .gc-c:hover,#gkCards .gc-c:focus-visible{transform:translateY(-2px);border-color:#4fd1c5;box-shadow:0 10px 30px rgba(79,209,197,.16);outline:none}
#gkCards .gc-i{font-size:26px;line-height:1}
#gkCards .gc-n{font:700 16px Sora,Inter,sans-serif}
#gkCards .gc-d{font-size:13px;line-height:1.45;color:#aab2d0;flex:1}
#gkCards .gc-m{font-size:11.5px;color:#8a92b2}
#gkCards .gc-m i{font-style:normal;color:#4ade80}
#gkCards .gc-len .gc-c{background:linear-gradient(#11162b,#11162b) padding-box,linear-gradient(130deg,#4fd1c5,#8b7cf6) border-box;border:1.5px solid transparent;padding:20px 18px 16px}
#gkCards .gc-len .gc-n{font-size:17px}
#gkCards .gc-len .gc-c:hover{box-shadow:0 10px 34px rgba(139,124,246,.28)}
#gkCards .gc-rec{display:inline-block;font:700 10.5px Inter,system-ui,sans-serif;color:#071018;background:linear-gradient(120deg,#4fd1c5,#a78bfa);border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:2px}
#gkCardsBtn{background:#0f1428;border:1px solid #2c3458;border-radius:999px;padding:6px 11px;font:600 12px Inter,system-ui,sans-serif;color:#c7d2e8;cursor:pointer;white-space:nowrap;margin-left:6px}
#gkCardsBtn:hover{border-color:#4fd1c5;color:#4fd1c5}
#gkLensTip{position:fixed;z-index:136;width:min(300px,calc(100vw - 20px));background:#11162b;border:1px solid #4fd1c5;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.6);padding:14px 15px 12px;font:400 13px/1.5 Inter,system-ui,sans-serif;color:#c7d2e8}
#gkLensTip::before{content:"";position:absolute;top:-7px;left:var(--ax,40px);width:12px;height:12px;background:#11162b;border-left:1px solid #4fd1c5;border-top:1px solid #4fd1c5;transform:rotate(45deg)}
#gkLensTip b{display:block;font:700 14px Sora,Inter,sans-serif;color:#eef1fb;margin-bottom:4px}
#gkLensTip .tp-a{display:flex;gap:8px;margin-top:10px}
#gkLensTip button{border:0;border-radius:9px;padding:7px 12px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}
#gkLensTip .go{background:#4fd1c5;color:#071018}
#gkLensTip .no{background:none;color:#8a92b2}
#gkLensMenu .lm-hero{padding:10px 10px 8px;border-bottom:1px solid #1d2442;margin-bottom:4px}
#gkLensMenu .lm-hero b{display:block;font:700 14.5px Sora,Inter,sans-serif;background:linear-gradient(100deg,#4fd1c5,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
#gkLensMenu .lm-hero span{display:block;font-size:12px;color:#8a92b2;line-height:1.4;margin-top:3px}
#gkLensMenu{position:fixed;z-index:135;width:min(330px,calc(100vw - 20px));background:#11162b;border:1px solid #2c3458;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);padding:6px;font-family:Inter,system-ui,sans-serif;color:#eef1fb}
#gkLensMenu[hidden]{display:none}
#gkLensMenu .lm-t{padding:8px 10px 6px;font-size:12px;color:#8a92b2;line-height:1.35}
#gkLensMenu .lm-t b{color:#eef1fb;font-weight:600}
#gkLensMenu .lm-lv{display:flex;gap:4px;margin:2px 4px 8px;background:#0a0e1a;border:1px solid #2c3458;border-radius:10px;padding:3px}
#gkLensMenu .lm-lv button{flex:1;display:block;text-align:center;padding:6px 4px;border-radius:8px;font:600 12.5px Inter,system-ui,sans-serif;color:#8a92b2}
#gkLensMenu .lm-lv button.on{background:#1d2442;color:#4fd1c5}
#gkLensMenu .lm-n2{font-size:11.5px;color:#8a92b2;padding:0 10px 2px}
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
#gkLens .gl-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
#gkLens .gl-ok{margin-top:0;background:none;border:1px solid #2c3458;color:#aab2d0;border-radius:9px;padding:6px 12px;font:500 12.5px Inter,system-ui,sans-serif;cursor:pointer}
#gkLens .gl-ok:hover{border-color:#4fd1c5;color:#4fd1c5}
#gkLens .gl-step.done [data-ok]{background:#12302c;border-color:#4fd1c5;color:#4fd1c5}
#gkLens .gl-short{border:2px solid #8b7cf6;background:#14122b;border-radius:18px;padding:20px 20px 18px;margin-top:10px}
#gkLens .gl-short.glow{animation:glGlow 1.6s ease-out 1}
@keyframes glGlow{0%{box-shadow:0 0 0 0 rgba(139,124,246,.7)}100%{box-shadow:0 0 0 22px rgba(139,124,246,0)}}
#gkLens .gl-short h2{font:700 22px Sora,Inter,sans-serif;margin:0 0 4px}
#gkLens .gl-parts{display:flex;flex-direction:column;gap:8px;margin:14px 0}
#gkLens .gl-part{display:flex;gap:12px;align-items:center}
#gkLens .gl-key{flex:none;min-width:44px;max-width:44%;padding:8px 10px;border-radius:10px;background:#8b7cf6;color:#0a0e1a;font:700 16px Sora,Inter,sans-serif;text-align:center}
#gkLens .gl-meaning{color:#cdd3ea;font-size:14.5px;line-height:1.4}
#gkLens .gl-prog2{display:flex;align-items:center;gap:10px;margin:0 0 14px;color:#aab2d0;font-size:13px}
#gkLens .gl-prog2 i{flex:1;height:5px;border-radius:9px;background:#1d2442;overflow:hidden;position:relative}
#gkLens .gl-prog2 i b{position:absolute;left:0;top:0;bottom:0;background:#4ade80;border-radius:9px;transition:width .35s}
#gkLens .gl-next{border:1px solid #f5b94a;background:#1d1a0e;border-radius:12px;padding:12px 14px;margin:0 0 16px}
#gkLens .gl-next small{display:block;color:#e4cf96;font-size:12.5px;margin-bottom:4px}
#gkLens .gl-next b{display:block;font:700 15px Sora,Inter,sans-serif;margin-bottom:8px}
#gkLens .gl-route{list-style:none;margin:0 0 6px;padding:0;display:flex;flex-direction:column;gap:4px}
#gkLens .gl-route button{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:1px solid transparent;border-radius:9px;padding:7px 8px;color:#cdd3ea;font:500 13.5px Inter,system-ui,sans-serif;cursor:pointer}
#gkLens .gl-route button:hover{background:#161c35;border-color:#2c3458}
#gkLens .gl-route i{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid #4a5380;display:flex;align-items:center;justify-content:center;font-size:11px;font-style:normal;color:#0a0e1a}
#gkLens .gl-route .dn i{background:#4ade80;border-color:#4ade80}
#gkLens .gl-route .dn span{color:#8a92b2;text-decoration:line-through}
#gkLens .gl-route .nx i{border-color:#f5b94a}
#gkLens .gl-sec{margin:0 0 14px}
#gkLens .gl-sec b{display:block;font:600 13px Inter,system-ui,sans-serif;color:#4fd1c5;margin-bottom:3px}
#gkLens .gl-sec p{margin:0;color:#cdd3ea;line-height:1.55;font-size:14.5px}
#gkLens .gl-sec.chk b{color:#f5b94a}
#gkLens .gl-sec.why b{color:#8b7cf6}
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
  return '<div class="gl-bar"><button type="button" class="gl-back" id="glBack">‹ ' + esc(S.tg.topicOnly ? L('Tarjetas', 'Cards') : L('Volver al mapa', 'Back to the map')) + '</button>' +
    '<span class="gl-ttl">' + l.icon + ' ' + esc(l.name()) + '</span><span class="gl-sub">' + esc(S.tg.name) + '</span><span class="gl-sp"></span><select class="gl-ghost" id="glLevel" aria-label="' + esc(L('Nivel de la explicación', 'Explanation level')) + '" title="' + esc(L('Cambiar el nivel arma otra versión (cuesta ' + COST + ' nodos si aún no la tienes guardada)', 'Changing the level builds another version (' + COST + ' nodes if you do not have it saved)')) + '">' + LEVELS.map((v) => '<option value="' + v + '"' + (v === S.level ? ' selected' : '') + '>' + esc(LVNAME[v]()) + '</option>').join('') + '</select>' + (extra || '') + '</div>';
}
function setBody(html, cls) {
  root.innerHTML = barHtml(S.data ? '<button type="button" class="gl-ghost" id="glRegen">' + esc(L('Generar de nuevo', 'Regenerate')) + ' · ' + COST + '</button>' : '') + '<div class="gl-body ' + (cls || '') + '" id="glBody">' + html + '</div>';
  $('#glBack', root).addEventListener('click', () => { const tg = S.tg; close(); if (tg.topicOnly) openCards(tg.name, { fromMap: false }); });
  if (cardsOn()) { const gb = document.createElement('button'); gb.type = 'button'; gb.className = 'gl-ghost'; gb.id = 'glCards'; gb.textContent = '🃏 ' + L('Otras tarjetas', 'Other cards'); const sp = $('.gl-sp', root); if (sp) sp.insertAdjacentElement('beforebegin', gb); gb.addEventListener('click', () => { const tg = S.tg; close(); openCards(tg.name, { fromMap: !tg.topicOnly }); }); }
  $('#glLevel', root).addEventListener('change', (e) => { const v = e.target.value, tg = S.tg, lens = S.lens; setLevel(v); close(); openLens(lens, { target: tg, level: v, from: 'level_switch' }); });
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
      meta[lid] = { cat: c, title, text, q: isQ, qi: j };
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
const nivelNum = () => Math.max(1, LEVELS.indexOf(S.level) + 1);
function actsHtml(qi) {
  const qn = S.lens === 'genio' ? (S.data.expert_questions || []).length : 0;
  return '<div class="gl-acts">' +
    (qn ? '<button type="button" class="gl-prim" id="glAnswer">' + esc(L('Responder las ' + qn + ' preguntas de experto', 'Answer the ' + qn + ' expert questions')) + '</button>' : '') +
    (typeof qi === 'number' ? '<button type="button" class="gl-ghost" id="glAnswerOne" data-q="' + qi + '">' + esc(L('Responder solo esta pregunta', 'Answer only this question')) + '</button>' : '') +
    '<button type="button" class="' + (qn ? 'gl-ghost' : 'gl-prim') + '" id="glPractice">' + esc(L('Practicar el tema con preguntas nuevas', 'Practise the topic with new questions')) + '</button>' +
    (S.lens === 'genio' ? '<button type="button" class="gl-ghost" id="glClarity">' + esc(L('No lo termino de entender: verlo paso a paso', 'Still unclear: see it step by step')) + '</button>' : '') + '</div>';
}
// Las preguntas de la lente pasan a Practicar YA HECHAS (misma entrega que el rizoma: gk_esc_set_<id>), con retroalimentación y «No lo sé».
function practiceQuestions(list) {
  const t = S.tg.name, id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const qs = list.filter(Boolean).slice(0, 8).map((q) => ({ q, level: 3, focus: 'Pregunta de nivel experto sobre «' + t + '». Valora si la persona razona y justifica, no solo si recuerda datos.', topic: t }));
  if (!qs.length) return;
  trk('lens_questions_practice', { n: qs.length });
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('gk_esc_set_')).forEach((k) => { try { const v = JSON.parse(localStorage.getItem(k)); if (!v || Date.now() - (v.t || 0) > 86400000) localStorage.removeItem(k); } catch (_e) { localStorage.removeItem(k); } });
    localStorage.setItem('gk_esc_set_' + id, JSON.stringify({ topic: t, kind: 'lens', level: 3, questions: qs, t: Date.now() }));
  } catch (_e) { window.open('/escribir/?from=gk&practicar=' + encodeURIComponent(qs[0].q.slice(0, 160)) + '&nivel=3', '_blank', 'noopener'); return; }
  window.open('/escribir/?from=gk&serie=' + id, '_blank', 'noopener');
}
function wireActs() {
  const p = $('#glPractice', root); if (p) p.addEventListener('click', () => { trk('lens_practice_click', { lens: S.lens }); window.open('/escribir/?from=gk&practicar=' + encodeURIComponent(S.tg.name.slice(0, 160)) + '&nivel=' + nivelNum(), '_blank', 'noopener'); });
  const a = $('#glAnswer', root); if (a) a.addEventListener('click', () => practiceQuestions(S.data.expert_questions || []));
  const o = $('#glAnswerOne', root); if (o) o.addEventListener('click', () => practiceQuestions([(S.data.expert_questions || [])[Number(o.dataset.q)]]));
  const c = $('#glClarity', root); if (c) c.addEventListener('click', () => { const tg = S.tg, lv = S.level; close(); openLens('claridad', { target: tg, level: lv }); });
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
    side.innerHTML = '<span class="gl-chip" style="background:' + m.cat.col + '">' + esc(m.cat.name()) + '</span><p class="gl-h">' + esc(m.title) + '</p>' + (m.text ? '<p class="gl-p">' + esc(m.text) + '</p>' : '<p class="gl-hint">' + esc(L('Intenta responderla con tus palabras antes de buscar. En Practicar puedes escribir tu respuesta y recibir retroalimentación.', 'Try answering it in your own words first. In Practice you can write your answer and get feedback.')) + '</p>') + actsHtml(m.q ? m.qi : undefined);
    wireActs(); trk('lens_card_open', { cat: m.cat.k });
  });
}

/* ---------- lente 2: claridad (escalera + atajo) ---------- */
function saveDone() { if (S && S.key) cachePut(S.key, { t: Date.now(), data: S.data, done: S.done }); }
function stepCard(s, i) {
  return '<h3>' + (i + 1) + '. ' + esc(s.title) + '</h3><p>' + esc(s.explanation) + '</p>' +
    (s.metaphor ? '<div class="gl-row"><b>' + esc(L('Metáfora', 'Metaphor')) + '</b><span>' + esc(s.metaphor) + '</span></div>' : '') +
    (s.image ? '<div class="gl-row img"><b>' + esc(L('Imagínalo', 'Picture it')) + '</b><span>' + esc(s.image) + '</span></div>' : '') +
    (s.example ? '<div class="gl-row ex"><b>' + esc(L('En la vida real', 'In real life')) + '</b><span>' + esc(s.example) + '</span></div>' : '') +
    '<div class="gl-btns"><button type="button" class="gl-ok" data-ok="' + i + '"></button><button type="button" class="gl-ok" data-alt="' + i + '" title="' + esc(L('Si esta metáfora no te ayudó: otra metáfora, imagen y ejemplo', 'If this metaphor did not help: another metaphor, image and example')) + '">' + esc(L('Otra metáfora · 1', 'Another metaphor · 1')) + '</button></div>';
}
let altBusy = false;
async function altStep(i) {
  if (!S || altBusy) return;
  const st = S.data.steps[i], el = root.querySelector('.gl-step[data-i="' + i + '"]'); if (!st || !el) return;
  if (typeof checkBalance === 'function' && !checkBalance(1)) return;
  const mine = S, btn = el.querySelector('[data-alt]'); altBusy = true; btn.disabled = true; btn.textContent = L('Buscando otra forma…', 'Finding another way…');
  const prev = (st.prev || []).concat([st.metaphor]).filter(Boolean).slice(-5);
  trk('lens_alt_metaphor', { i });
  try {
    const { ok, data } = await apiFetch('/.netlify/functions/gemini', { method: 'POST', body: JSON.stringify({ action: 'lens_step', topic: S.tg.name, stepTitle: st.title, explanation: st.explanation, previous: prev, level: S.level }) });
    if (S !== mine) return;
    if (!ok || !data || !data.metaphor) { btn.disabled = false; btn.textContent = L('No se pudo. Reintentar · 1', 'Could not. Retry · 1'); return; }
    if (typeof applyServerBalance === 'function') applyServerBalance(data);
    st.prev = prev; st.metaphor = data.metaphor; if (data.image) st.image = data.image; if (data.example) st.example = data.example;
    saveDone();
    el.querySelector('.gl-card').innerHTML = stepCard(st, i); refreshSteps();
  } catch (e) {
    if (S === mine) { btn.disabled = false; btn.textContent = (e && e.message === 'billing_blocked') ? L('Otra metáfora · 1', 'Another metaphor · 1') : L('Sin conexión. Reintentar · 1', 'No connection. Retry · 1'); }
  } finally { altBusy = false; }
}
let refreshSteps = () => {};
function renderClaridad() {
  const d = S.data, steps = d.steps || [], sc = d.shortcut || {};
  const doneN = () => Object.keys(S.done || {}).filter((k) => S.done[k]).length;
  const html = '<div class="gl-scroll"><div class="gl-col">' +
    '<div class="gl-core"><p class="gl-ess" style="margin:0 0 4px">' + esc(d.essence) + '</p><small>' + esc(L('La idea en una frase. Ahora, paso a paso.', 'The idea in one sentence. Now, step by step.')) + '</small></div>' +
    (d.caution ? '<div class="gl-caut" style="margin-top:0">' + esc(d.caution) + '</div>' : '') +
    '<div class="gl-prog"><span id="glProgTxt"></span><i><b id="glProgBar"></b></i></div>' +
    steps.map((s, i) => '<div class="gl-step" data-i="' + i + '" style="margin-left:' + Math.min(i, 4) * 10 + 'px"><div class="gl-rail"><div class="gl-num">' + esc(s.emoji || String(i + 1)) + '</div><div class="gl-line"></div></div>' +
      '<div class="gl-card">' + stepCard(s, i) + '</div></div>').join('') +
    '<div class="gl-short" id="glShort"><h2>' + esc(sc.name || L('Tu atajo mental', 'Your mental shortcut')) + '</h2><small style="color:#8a92b2">' + esc(L('Para recordarlo siempre', 'To remember it for good')) + '</small>' +
    '<div class="gl-parts">' + (sc.parts || []).map((p) => '<div class="gl-part"><span class="gl-key">' + esc(p.key) + '</span><span class="gl-meaning">' + esc(p.meaning) + '</span></div>').join('') + '</div>' +
    (sc.how_to_use ? '<p class="gl-p" style="margin:0">' + esc(sc.how_to_use) + '</p>' : '') +
    '<div class="gl-acts" style="flex-direction:row;flex-wrap:wrap"><button type="button" class="gl-ghost" id="glCopy">' + esc(L('Copiar el atajo', 'Copy the shortcut')) + '</button><button type="button" class="gl-prim" id="glPractice">' + esc(L('Ponerme a prueba', 'Test myself')) + '</button></div></div>' +
    '</div></div>';
  setBody(html);
  const refresh = (glow) => {
    root.querySelectorAll('.gl-step').forEach((el) => { const i = el.dataset.i, on = !!S.done[i]; el.classList.toggle('done', on); const b = el.querySelector('[data-ok]'); b.textContent = on ? L('✓ Entendido', '✓ Got it') : L('Lo entendí', 'Got it'); b.setAttribute('aria-pressed', on); });
    const n = doneN(), tot = steps.length;
    $('#glProgTxt', root).textContent = L(n + ' de ' + tot + ' pasos entendidos', n + ' of ' + tot + ' steps understood');
    $('#glProgBar', root).style.width = (tot ? n / tot * 100 : 0) + '%';
    if (glow && n === tot && tot) { const sh = $('#glShort', root); sh.classList.remove('glow'); void sh.offsetWidth; sh.classList.add('glow'); sh.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); }
  };
  refresh(false); refreshSteps = () => refresh(false);
  $('.gl-col', root).addEventListener('click', (e) => {
    const ok = e.target.closest('[data-ok]'), alt = e.target.closest('[data-alt]');
    if (ok) { const i = ok.dataset.ok; S.done[i] = !S.done[i]; saveDone(); trk('lens_step_done', { i: Number(i), on: !!S.done[i] }); refresh(true); }
    else if (alt) altStep(Number(alt.dataset.alt));
  });
  $('#glCopy', root).addEventListener('click', () => {
    const t = (sc.name || '') + '\n' + (sc.parts || []).map((p) => p.key + ' — ' + p.meaning).join('\n') + (sc.how_to_use ? '\n' + sc.how_to_use : '');
    try { navigator.clipboard.writeText(t).then(() => { $('#glCopy', root).textContent = L('Copiado', 'Copied'); }, () => {}); } catch (_e) { /* nada */ }
    trk('lens_copy', {});
  });
  wireActs();
}

/* ---------- lente 3: camino (ingeniería inversa: red de prerrequisitos con definiciones) ---------- */
function caminoLayout(d) {
  const maxL = Math.max(0, ...d.nodes.map((n) => n.layer)), cols = [], GX = 290, GY = 104, y = {};
  for (let l = 0; l <= maxL; l++) cols[l] = d.nodes.filter((n) => n.layer === l);
  const place = (col) => col.forEach((n, i) => { y[n.id] = (i - (col.length - 1) / 2) * GY; });
  place(cols[0]);
  for (let l = 1; l <= maxL; l++) {
    const bary = (n) => { const ps = d.links.filter((k) => k.to === n.id && y[k.from] !== undefined).map((k) => y[k.from]); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0; };
    cols[l].sort((a, b) => bary(a) - bary(b)); place(cols[l]);
  }
  return { maxL, pos: (n) => ({ x: n.layer * GX, y: y[n.id] || 0 }) };
}
const mix = (a, b, t) => { const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = h(a), B = h(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function renderCamino() {
  const d = S.data, byId = {}; d.nodes.forEach((n) => { byId[n.id] = n; });
  const lay = caminoLayout(d), inl = (id) => d.links.filter((k) => k.to === id).map((k) => k.from);
  const steps = d.nodes.filter((n) => n.id !== 'meta').sort((a, b) => a.layer - b.layer);
  const isDone = (id) => !!S.done[id];
  const nextNode = () => steps.find((n) => !isDone(n.id) && inl(n.id).every(isDone)) || null;
  const nodeStyle = (n, nx) => {
    const meta = n.id === 'meta', t = lay.maxL ? n.layer / lay.maxL : 0, col = meta ? '#f5b94a' : mix('#4fd1c5', '#8b7cf6', t), dn = isDone(n.id);
    return { id: n.id, label: (dn ? '✓ ' : meta ? '★ ' : '') + wrapLabel(n.title, 20), shape: 'box', margin: meta ? 14 : 10, shapeProperties: { borderRadius: 11 }, borderWidth: nx ? 4 : 2,
      color: meta ? { background: '#f5b94a', border: '#ffd27a' } : dn ? { background: '#12302c', border: '#4ade80' } : { background: '#161c35', border: nx ? '#f5b94a' : col, highlight: { background: '#1d2442', border: col } },
      font: { color: meta ? '#0a0e1a' : '#eef1fb', size: meta ? 16 : 13, face: 'Inter, sans-serif' }, shadow: nx ? { enabled: true, color: 'rgba(245,185,74,.55)', size: 18, x: 0, y: 0 } : { enabled: false }, fixed: true, ...lay.pos(n) };
  };
  const nx0 = nextNode();
  setBody('<div class="gl-map"><div id="glNet"></div></div><aside class="gl-side" id="glSide" aria-live="polite"></aside>', 'split');
  const side = $('#glSide', root);
  const dsN = new (typeof vis !== 'undefined' ? vis.DataSet : Array)(d.nodes.map((n) => nodeStyle(n, nx0 && nx0.id === n.id)));
  const dsE = new (typeof vis !== 'undefined' ? vis.DataSet : Array)(d.links.map((k, i) => ({ id: 'e' + i, from: k.from, to: k.to, arrows: { to: { enabled: true, scaleFactor: 0.7 } }, color: { color: '#4a5380', highlight: '#4fd1c5' }, width: 2, smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.5 } })));
  let net = null;
  const restyle = () => { const nx = nextNode(); try { dsN.update(d.nodes.map((n) => nodeStyle(n, nx && nx.id === n.id))); } catch (_e) { /* nada */ } };
  const select = (id) => { try { net.selectNodes([id]); net.focus(id, { scale: 0.95, animation: { duration: 400 } }); } catch (_e) { /* nada */ } showNode(id); };
  const prog = () => { const n = steps.filter((x) => isDone(x.id)).length, tot = steps.length; return '<div class="gl-prog2"><span>' + esc(L(n + ' de ' + tot + ' ya los dominas', n + ' of ' + tot + ' already mastered')) + '</span><i><b style="width:' + (tot ? n / tot * 100 : 0) + '%"></b></i></div>'; };
  function showDefault() {
    const nx = nextNode();
    side.innerHTML = '<p class="gl-hint" style="margin-bottom:4px">' + esc(L('Quien domina «' + S.tg.name + '» sabe:', 'Someone who masters “' + S.tg.name + '” can:')) + '</p><p class="gl-ess">' + esc(d.essence) + '</p>' +
      (d.caution ? '<div class="gl-caut">' + esc(d.caution) + '</div>' : '') + prog() +
      (nx ? '<div class="gl-next"><small>' + esc(L('Tu siguiente paso', 'Your next step')) + '</small><b>' + esc(nx.title) + '</b><button type="button" class="gl-ghost" data-go="' + esc(nx.id) + '">' + esc(L('Ver qué es y cómo saber que lo tienes', 'See what it is and how to know you have it')) + '</button></div>'
        : '<div class="gl-next"><small>' + esc(L('¡Ya tienes todo el camino!', 'You have the whole path!')) + '</small><b>' + esc(S.tg.name) + '</b><button type="button" class="gl-ghost" data-go="meta">' + esc(L('Ponerme a prueba en la meta', 'Test myself on the goal')) + '</button></div>') +
      '<p class="gl-h">' + esc(L('El camino, en orden', 'The path, in order')) + '</p><ul class="gl-route">' + steps.map((n) => '<li><button type="button" data-go="' + esc(n.id) + '" class="' + (isDone(n.id) ? 'dn' : (nx && nx.id === n.id ? 'nx' : '')) + '"><i>' + (isDone(n.id) ? '✓' : '') + '</i><span>' + esc(n.title) + '</span></button></li>').join('') + '</ul>';
    side.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => select(b.dataset.go)));
  }
  function showNode(id) {
    const n = byId[id]; if (!n) { showDefault(); return; }
    const meta = id === 'meta', ps = inl(id).map((x) => byId[x]).filter(Boolean);
    side.innerHTML = '<button type="button" class="gl-ghost" id="glAll" style="margin-bottom:12px">‹ ' + esc(L('Ver todo el camino', 'See the whole path')) + '</button>' +
      '<span class="gl-chip" style="background:' + (meta ? '#f5b94a' : mix('#4fd1c5', '#8b7cf6', lay.maxL ? n.layer / lay.maxL : 0)) + '">' + esc(meta ? L('La meta', 'The goal') : n.layer === 0 ? L('Fundamento', 'Foundation') : L('Nivel ' + (n.layer + 1), 'Level ' + (n.layer + 1))) + '</span>' +
      '<p class="gl-h" style="font-size:17px">' + esc(n.title) + '</p>' +
      '<div class="gl-sec"><b>' + esc(L('Qué es', 'What it is')) + '</b><p>' + esc(n.definition) + '</p></div>' +
      (n.why ? '<div class="gl-sec why"><b>' + esc(L('Por qué va antes', 'Why it comes first')) + '</b><p>' + esc(n.why) + '</p></div>' : '') +
      (n.check ? '<div class="gl-sec chk"><b>' + esc(L('Cómo sabes que ya lo tienes', 'How you know you have it')) + '</b><p>' + esc(n.check) + '</p></div>' : '') +
      (ps.length ? '<div class="gl-sec"><b>' + esc(L('Antes necesitas', 'You first need')) + '</b><p>' + ps.map((x) => '<button type="button" class="gl-ghost" style="margin:2px 4px 2px 0" data-go="' + esc(x.id) + '">' + esc(x.title) + '</button>').join('') + '</p></div>' : '') +
      '<div class="gl-acts">' + (meta ? '' : '<button type="button" class="' + (isDone(id) ? 'gl-ghost' : 'gl-prim') + '" id="glKnow">' + esc(isDone(id) ? L('✓ Ya lo domino (quitar)', '✓ Mastered (undo)') : L('Ya lo domino', 'I have mastered this')) + '</button>') +
      '<button type="button" class="' + (meta ? 'gl-prim' : 'gl-ghost') + '" id="glPractice">' + esc(meta ? L('Practicar el tema', 'Practise the topic') : L('Practicar esto', 'Practise this')) + '</button></div>';
    $('#glAll', side).addEventListener('click', () => { try { net.unselectAll(); } catch (_e) { /* nada */ } showDefault(); });
    side.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => select(b.dataset.go)));
    const kn = $('#glKnow', side); if (kn) kn.addEventListener('click', () => { S.done[id] = !S.done[id]; saveDone(); trk('lens_path_known', { on: !!S.done[id] }); restyle(); showNode(id); });
    $('#glPractice', side).addEventListener('click', () => { trk('lens_practice_click', { lens: 'camino' }); window.open('/escribir/?from=gk&practicar=' + encodeURIComponent((meta ? S.tg.name : n.title + ' — ' + S.tg.name).slice(0, 160)) + '&nivel=' + nivelNum(), '_blank', 'noopener'); });
    trk('lens_path_node', { layer: n.layer });
  }
  showDefault();
  if (typeof vis === 'undefined' || !vis.Network) { $('#glNet', root).innerHTML = '<div class="gl-state">' + esc(L('No se pudo cargar el mapa. Revisa tu conexión.', 'The map could not load. Check your connection.')) + '</div>'; return; }
  net = new vis.Network($('#glNet', root), { nodes: dsN, edges: dsE }, { physics: false, interaction: { hover: true, zoomView: true, dragView: true, selectConnectedEdges: false }, nodes: { borderWidth: 2 }, edges: { arrows: { to: true } } });
  S.network = net;
  requestAnimationFrame(() => { try { net.fit({ animation: false }); } catch (_e) { /* nada */ } });
  net.on('click', (p) => { const id = p.nodes && p.nodes[0]; if (id && byId[id]) showNode(id); else showDefault(); });
}

function render() {
  if (!S || !S.data) return;
  if (S.lens === 'genio') renderGenio(); else if (S.lens === 'camino') renderCamino(); else renderClaridad();
  const b = $('#glBack', root); if (b) b.focus({ preventScroll: true });
}

/* ---------- abrir / generar ---------- */
async function generate() {
  if (!S || busy) return;
  busy = true; const mine = S;
  showLoading();
  trk('lens_generate', { lens: S.lens });
  try {
    const body = JSON.stringify({ action: 'lens', lens: S.lens, topic: S.tg.name, contextPath: S.tg.ctx, level: S.level, mapContext: S.tg.map || '' });
    const call = () => apiFetch('/.netlify/functions/gemini', { method: 'POST', body });
    let r;
    try { r = await call(); } catch (e) { if (e && e.message === 'billing_blocked') throw e; r = { ok: false, status: 0 }; }
    if (!r.ok && (r.status === 0 || r.status >= 500) && S === mine) {   // un solo reintento automático; los fallos no cobran, así que no hay doble cobro
      trk('lens_autoretry', { status: r.status });
      r = await call();
    }
    const { ok, status, data } = r;
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
  const lv = (opts && opts.level) || level, key = cacheKey(lens, tg.name, lv), c = cacheAll()[key];
  if (!c) {
    if (typeof requireAuth === 'function' && !requireAuth(L('ver este tema con una lente', 'view this topic through a lens'))) return;
    if (typeof checkBalance === 'function' && !checkBalance(COST)) return;
  }
  ensureRoot(); root.hidden = false;
  S = { lens, tg, key, level: lv, data: c ? c.data : null, done: (c && c.done) || {}, network: null };
  document.addEventListener('keydown', onKey, true);
  trk('lens_open', { lens, cached: !!c, from: (opts && opts.from) || 'menu' });
  if (c) render(); else generate();
}


/* ---------- tarjetas del tema: elegir cómo explorarlo antes de armar nada ---------- */
function cardsOn() { try { if (/[?&]tarjetas=0/.test(location.search)) return false; return localStorage.getItem('gk_cards') !== '0'; } catch (_e) { return true; } }
let cardsEl = null, cardsSt = null;
function onCardsKey(e) { if (e.key === 'Escape' && cardsEl && !cardsEl.hidden) { e.stopPropagation(); closeCards(true); } }
function closeCards(restore) {
  const st = cardsSt; cardsSt = null;
  if (cardsEl) { cardsEl.hidden = true; cardsEl.innerHTML = ''; }
  document.removeEventListener('keydown', onCardsKey, true);
  if (restore && st && !st.fromMap) { const i = document.getElementById('startTopic'); if (i && !i.value) i.value = st.topic; }   // si no elige nada, el tema vuelve al campo
}
async function runMap(topic) {
  try { if (typeof dismissWelcomeScreen === 'function') dismissWelcomeScreen(); } catch (_e) { /* nada */ }
  await generateFullSchemaFromTopic(topic, {});
  try { return nodes.length > 0; } catch (_e) { return false; }
}
function cardsHtml() {
  const st = cardsSt, lvBtns = LEVELS.map((v) => '<button type="button" data-lv="' + v + '" class="' + (v === level ? 'on' : '') + '">' + esc(LVNAME[v]()) + '</button>').join('');
  const lensCard = (k) => { const x = LENSES[k], cached = !!cacheAll()[cacheKey(k, st.topic, level)];
    return '<button type="button" class="gc-c" data-k="' + k + '"><span class="gc-i">' + x.icon + '</span><span class="gc-n">' + esc(x.name()) + '</span><span class="gc-d">' + esc(x.desc()) + '</span><span class="gc-m">' + (cached ? '<i>✓ ' + esc(L('guardada, se abre al instante', 'saved, opens instantly')) + '</i>' : esc(COST + ' ' + L('nodos · sin armar el mapa', 'nodes · no map needed'))) + '</span></button>'; };
  const m = st.fromMap;
  return '<div class="gc-w"><div class="gc-top"><button type="button" class="gc-x" id="gcClose">' + esc(m ? L('‹ Volver al mapa', '‹ Back to the map') : L('‹ Cambiar el tema', '‹ Change the topic')) + '</button><div class="gc-lv" role="radiogroup" aria-label="' + esc(L('Nivel', 'Level')) + '">' + lvBtns + '</div></div>' +
    '<h2>' + esc(st.topic) + '</h2><p class="gc-sub">' + esc(L('¿Cómo quieres explorarlo? Puedes cambiar de tarjeta cuando quieras.', 'How do you want to explore it? You can switch cards any time.')) + '</p>' +
    '<p class="gc-h"><b>' + esc(L('Ver la estructura', 'See the structure')) + '</b></p><div class="gc-g">' +
    '<button type="button" class="gc-c" data-k="mapa"><span class="gc-i">🗺️</span><span class="gc-n">' + esc(L('Mapa mental', 'Mind map')) + '</span><span class="gc-d">' + esc(L('El esquema del tema con sus ramas y subtemas. El rizoma queda plegado abajo.', 'The topic as branches and sub-topics. The rhizome stays folded below.')) + '</span><span class="gc-m">' + esc(m ? L('Seguir en el mapa', 'Stay on the map') : '1 ' + L('nodo', 'node')) + '</span></button>' +
    '<button type="button" class="gc-c" data-k="rizoma"><span class="gc-i">🕸️</span><span class="gc-n">' + esc(L('Rizoma', 'Rhizome')) + '</span><span class="gc-d">' + esc(L('Cómo se conectan las ideas por su significado, no solo por jerarquía. El mapa mental queda en el resto de la pantalla.', 'How ideas connect by meaning, not just hierarchy. The mind map stays on the rest of the screen.')) + '</span><span class="gc-m">' + esc(m ? L('Abrir el rizoma', 'Open the rhizome') : '1 ' + L('nodo (arma el mapa primero)', 'node (builds the map first)')) + '</span></button></div>' +
    '<p class="gc-h"><b>' + esc(L('Entender a fondo', 'Understand in depth')) + '</b> · ' + esc(L('lentes', 'lenses')) + '<span class="gc-rec">' + esc(L('recomendado', 'recommended')) + '</span></p><div class="gc-g gc-len">' + Object.keys(LENSES).map(lensCard).join('') + '</div></div>';
}
function openCards(topic, opts) {
  topic = String(topic || '').trim().slice(0, 200); if (topic.length < 2) return;
  if (!cardsEl) { injectCss(); cardsEl = document.createElement('div'); cardsEl.id = 'gkCards'; cardsEl.hidden = true; cardsEl.setAttribute('role', 'dialog'); cardsEl.setAttribute('aria-modal', 'true'); document.body.appendChild(cardsEl); }
  const fromMap = !!(opts && opts.fromMap), tgm = fromMap ? target() : null;
  cardsSt = { topic, fromMap, tg: tgm };
  cardsEl.hidden = false; document.addEventListener('keydown', onCardsKey, true);
  trk('cards_open', { fromMap });
  const draw = () => {
    cardsEl.innerHTML = cardsHtml();
    cardsEl.querySelector('#gcClose').addEventListener('click', () => closeCards(true));
    cardsEl.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => { setLevel(b.dataset.lv); draw(); const f = cardsEl.querySelector('.gc-lv .on'); if (f) f.focus({ preventScroll: true }); }));
    cardsEl.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => pickCard(b.dataset.k)));
    const f = cardsEl.querySelector('.gc-len [data-k]'); if (f) f.focus({ preventScroll: true });
  };
  draw();
}
async function pickCard(k) {
  const st = cardsSt; if (!st) return;
  trk('cards_pick', { card: k, fromMap: st.fromMap });
  if (LENSES[k]) {
    const tg = st.fromMap && st.tg ? st.tg : { id: null, name: st.topic, sel: false, ctx: '', map: '', topicOnly: true };
    closeCards(false);
    openLens(k, { target: tg, level, from: 'cards' });
    return;
  }
  closeCards(false);
  if (k === 'mapa') { if (!st.fromMap) await runMap(st.topic); return; }
  if (k === 'rizoma') {
    if (!st.fromMap && !(await runMap(st.topic))) return;
    setTimeout(() => { try { if (window.__gkRhizomeOpen) window.__gkRhizomeOpen(); } catch (_e) { /* nada */ } }, 250);
  }
}
window.GK_CARDS = { enabled: cardsOn, open: (t, o) => openCards(t, o) };

/* ---------- menú «Lentes» de la cabecera ---------- */
let menu = null, btn = null;
function closeMenu() { if (menu) menu.hidden = true; if (btn) btn.setAttribute('aria-expanded', 'false'); }
function renderMenu(tg) {
  menu.innerHTML = '<div class="lm-hero"><b>' + esc(L('Aquí Graphikosmos deja de ordenar y empieza a enseñar', 'Here Graphikosmos stops organizing and starts teaching')) + '</b><span>' + esc(L('El mapa muestra la estructura; las lentes explican, ordenan lo que debes dominar y te guían a entenderlo de verdad.', 'The map shows structure; lenses explain, sequence what to master, and guide real understanding.')) + '</span></div><div class="lm-t">' + (tg ? esc(L(tg.sel ? 'Sobre el nodo seleccionado:' : 'Sobre el tema del mapa:', tg.sel ? 'On the selected node:' : 'On the map topic:')) + ' <b>' + esc(tg.name) + '</b>' : esc(L('Crea un esquema para usar las lentes.', 'Create a map to use the lenses.'))) + '</div>' +
    '<div class="lm-n2">' + esc(L('¿Para qué nivel lo explicamos?', 'What level should it be explained at?')) + '</div>' +
    '<div class="lm-lv" role="radiogroup" aria-label="' + esc(L('Nivel', 'Level')) + '">' + LEVELS.map((v) => '<button type="button" role="radio" aria-checked="' + (v === level) + '" data-lv="' + v + '" class="' + (v === level ? 'on' : '') + '">' + esc(LVNAME[v]()) + '</button>').join('') + '</div>' +
    Object.keys(LENSES).map((k) => { const l = LENSES[k], cached = tg && cacheAll()[cacheKey(k, tg.name, level)]; return '<button type="button" data-lens="' + k + '"><span class="lm-i">' + l.icon + '</span><span><div class="lm-n">' + esc(l.name()) + '</div><div class="lm-d">' + esc(l.desc()) + '</div></span><span class="lm-c">' + esc(cached ? L('guardada', 'saved') : COST + ' ' + L('nodos', 'nodes')) + '</span></button>'; }).join('');
  menu.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => { setLevel(b.dataset.lv); trk('lens_level', { level }); renderMenu(tg); const f = menu.querySelector('.lm-lv .on'); if (f) f.focus({ preventScroll: true }); }));
  menu.querySelectorAll('[data-lens]').forEach((b) => b.addEventListener('click', () => openLens(b.dataset.lens, { target: tg, from: 'header', level })));
}
function openMenu() {
  const tg = target(); const tip = document.getElementById('gkLensTip'); if (tip) { tip.remove(); try { localStorage.setItem('gk_lens_tip', '1'); } catch (_e) { /* nada */ } }
  menu.hidden = false;
  renderMenu(tg);
  const r = btn.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 6) + 'px'; menu.style.maxHeight = Math.max(240, innerHeight - Math.round(r.bottom) - 16) + 'px'; menu.style.overflowY = 'auto';
  menu.style.left = Math.max(10, Math.min(innerWidth - menu.offsetWidth - 10, r.left)) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  const f = menu.querySelector('[data-lens]'); if (f) f.focus({ preventScroll: true });
}
function installHeader() {
  const vm = document.getElementById('viewMode'); if (!vm || document.getElementById('gkLensBtn')) return;
  injectCss();
  const wrap = document.createElement('div'); wrap.id = 'gkLensBtnWrap';
  wrap.innerHTML = '<button type="button" id="gkLensBtn" aria-haspopup="true" aria-expanded="false" title="' + esc(L('Estudia el tema a fondo: ruta de prerrequisitos, mapa del genio, paso a paso', 'Study the topic in depth: prerequisite path, genius map, step by step')) + '">🔭 ' + esc(L('Lentes', 'Lenses')) + '<small>' + esc(L('estudio a fondo', 'deep study')) + '</small></button>';
  const host = vm.closest('div'); (host && host.parentNode ? host : vm).insertAdjacentElement('afterend', wrap);
  btn = $('#gkLensBtn', wrap);
  if (cardsOn()) { const cb = document.createElement('button'); cb.type = 'button'; cb.id = 'gkCardsBtn'; cb.textContent = '🃏 ' + L('Tarjetas', 'Cards'); cb.title = L('Elegir cómo explorar este tema: mapa, rizoma o lentes', 'Choose how to explore this topic: map, rhizome or lenses'); cb.addEventListener('click', () => { const tg = target(); if (!tg) { try { appAlert(L('Escribe un tema arriba para ver las tarjetas.', 'Type a topic above to see the cards.')); } catch (_e) { /* nada */ } return; } openCards(tg.name, { fromMap: true }); }); wrap.appendChild(cb); }
  menu = document.createElement('div'); menu.id = 'gkLensMenu'; menu.hidden = true; menu.setAttribute('role', 'menu'); document.body.appendChild(menu);
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(); });
  document.addEventListener('click', (e) => { if (!menu || menu.hidden) return; const path = e.composedPath ? e.composedPath() : []; if (path.includes(menu) || path.includes(btn)) return; closeMenu(); });   // composedPath: al cambiar el nivel el menú se redibuja y el botón pulsado ya no está dentro
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
  setTimeout(showTip, 4000);
}
function showTip() {
  try { if (localStorage.getItem('gk_lens_tip')) return; } catch (_e) { /* sigue */ }
  if (!btn || !target() || !btn.offsetParent) return;
  const done = () => { try { localStorage.setItem('gk_lens_tip', '1'); } catch (_e) { /* nada */ } t.remove(); };
  const t = document.createElement('div'); t.id = 'gkLensTip'; t.setAttribute('role', 'dialog');
  t.innerHTML = '<b>' + esc(L('Usa tu mapa con Lentes', 'Use your map with Lenses')) + '</b>' + esc(L('El mapa ordena las ideas. Las lentes te enseñan el tema: qué dominar antes, en qué orden y cómo saber que ya lo entiendes. Es la forma completa de usar Graphikosmos.', 'The map organizes ideas. Lenses teach the topic: what to master first, in what order, and how to know you got it. It is the full way to use Graphikosmos.')) + '<div class="tp-a"><button type="button" class="go">' + esc(L('Probar ahora', 'Try it now')) + '</button><button type="button" class="no">' + esc(L('Luego', 'Later')) + '</button></div>';
  document.body.appendChild(t);
  const r = btn.getBoundingClientRect(), left = Math.max(10, Math.min(innerWidth - t.offsetWidth - 10, r.left));
  t.style.top = Math.round(r.bottom + 12) + 'px'; t.style.left = left + 'px'; t.style.setProperty('--ax', Math.max(14, Math.round(r.left + r.width / 2 - left - 6)) + 'px');
  t.querySelector('.go').addEventListener('click', (e) => { e.stopPropagation(); done(); openMenu(); });
  t.querySelector('.no').addEventListener('click', done);
}
function installNodeMenu() {
  const c = document.getElementById('btnMenuLensPath');
  if (c) {
    c.textContent = L('🧭 ¿Qué necesito saber antes?', '🧭 What do I need to know first?');
    c.addEventListener('click', () => {
      try { const m = document.getElementById('actionMenu'); if (m) { m.style.visibility = 'hidden'; m.classList.add('hidden'); } } catch (_e) { /* nada */ }
      openLens('camino', { from: 'node_menu' });
    });
  }
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
