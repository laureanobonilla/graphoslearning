#!/usr/bin/env python3
"""Genera la versión de PAGO del examen de aptitudes a partir de la plantilla de «¿Quién eres?»:
  · aptitud/index.html          (la app real, con su propio estilo: azul noche y verde, sin máscara ni rojo)
  · aptitud/prueba/index.html   (página de PRUEBA del dueño: respuestas de ejemplo ya cargadas, sin eventos, y en
                                 vez de cobrar manda el informe a bonillapretiz@gmail.com; noindex)
La versión GRATIS (/aptitud-gratis/) no usa la plantilla: es su propia página y comparte aptitud/config.js.
Uso (desde la raíz del repo): python3 tools/build_aptitud.py
No toca las otras apps de qer-shared (esas se siguen generando con tools/build_qer_apps.py)."""
import json, html, os

APP = 'aptitud'
tpl = open('qer-shared/template.html', encoding='utf8').read()
js = open(f'{APP}/config.js', encoding='utf8').read()
cfg = json.loads(js[js.index('window.QER_CFG =') + len('window.QER_CFG ='):].strip().rstrip(';'))

MASK = 'M50 8C27 8 14 26 14 48c0 19 11 33 17 40 4 4.5 9.5 1 11-2 1.5 3 4 6 8 6s6.5-3 8-6c1.5 3 7 6.5 11 2 6-7 17-21 17-40C86 26 73 8 50 8Z'
CRACK = 'M50 10 L46 34 L54 42 L44 58 L56 70 L48 92'
RING = 'M50 8a42 42 0 1 1 -0.01 0Z'               # aro
RISE = 'M24 72 L40 56 L52 64 L76 36 M63 36 L76 36 L76 49'   # línea que sube con flecha (se dibuja sola en la portada)
EYES = ['<circle cx="34" cy="42" r="2.4" fill="#c6a358"/>', '<circle cx="66" cy="42" r="2.4" fill="#c6a358"/>']

THEME = """
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&display=swap" rel="stylesheet">
<style id="tema-aptitud">
  /* Estilo propio del examen de aptitudes: azul noche, verde de crecimiento y un panel de pago azul sereno (nada de rojo). */
  :root{
    --ink:#0b1220; --ink-2:#111a2e; --ink-3:#17223b; --parchment:#eef2f7; --muted:#94a3b8;
    --brass:#34d399; --brass-dim:#2f8f74; --rosewood:#14324c; --rosewood-bright:#1b4463; --line:rgba(238,242,247,.12);
  }
  .display, .paywall-label, .closing-line, .sheet h3, .profile-word, .profile-quote{ font-family:'Sora', 'Work Sans', sans-serif !important; letter-spacing:-.01em; }
  #screen-cover h1{ font-weight:600; font-size:2.05rem; max-width:340px; }
  .q-prompt{ font-weight:600; font-size:1.35rem; }
  .btn-primary, .song-go{ color:#05261b; }
  .btn-primary:hover{ background:#4ee0ad; }
  .btn-primary:disabled, .song-go:disabled{ background:#263247; color:#6b7a90; }
  .short-input::placeholder{ color:#5b6b85; }
  .disclaimer{ color:#5b6b85; }
  .profile-box{ background:rgba(52,211,153,.06); }
  .radar-shape{ fill:rgba(52,211,153,.26); }
  .redact{ background:rgba(238,242,247,.14); }
  .unlock-cta{ background:linear-gradient(to bottom, rgba(11,18,32,0), var(--ink) 38%); }
  .prepay-soft{ color:#c4cfdd; }
  .paywall{ clip-path:none; border-radius:20px; border:1px solid rgba(255,255,255,.12); box-shadow:0 10px 40px rgba(0,0,0,.35); }
  .paywall-commitment{ color:#9fc7e0; }
  .paywall-price{ color:#cfe3f1; }
  .pay-note, .classic-pay-note{ color:#a9c6da; }
  .pay-help{ color:#cfe3f1; }
  .pay-help a{ color:#fff; }
  .pay-msg{ color:#d9f2ff; }
  .card-or{ color:#d9ecf7; }
  .skipped-text, #btnRestartFromSkip{ color:#e2eef7; }
  .ask-email{ text-align:left; margin:0 0 16px; padding:14px; border-radius:14px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.28); }
  .ask-email-label{ display:block; font-weight:600; color:#fff; margin:0 0 8px; font-size:.95rem; }
  .ask-email input{ width:100%; border:1px solid rgba(255,255,255,.45); background:rgba(0,0,0,.25); color:#fff; border-radius:12px; padding:13px 12px; font:1rem 'Work Sans',sans-serif; }
  .ask-email input:focus{ outline:2px solid var(--brass); outline-offset:1px; }
  .ask-email-note{ margin:8px 0 0; font-size:.78rem; color:#cfe3f1; line-height:1.4; }
  .chapter p{ white-space:pre-line; }
  /* Portada con la pregunta 1 (CFG.coverQuestion) y un ejemplo del resultado */
  #screen-cover.has-cover-q{ justify-content:flex-start; padding-top:28px; }
  #screen-cover.has-cover-q .mask-wrap{ width:64px; height:64px; margin-bottom:12px; }
  #screen-cover.has-cover-q h1{ font-size:1.7rem; margin-bottom:10px; }
  #screen-cover.has-cover-q .sub{ margin-bottom:8px; max-width:330px; }
  #screen-cover.has-cover-q .meta-line{ margin-bottom:18px; }
  .cover-q{ width:100%; max-width:420px; text-align:left; background:var(--ink-2); border:1px solid rgba(52,211,153,.35); border-radius:18px; padding:16px 14px 14px; }
  .cover-q-label{ margin:0 0 4px; font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--brass); }
  .cover-q-prompt{ margin:0 0 12px; font-size:1.15rem; line-height:1.3; font-weight:600; color:var(--parchment); }
  .cover-q-options{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .cover-q-opt{ appearance:none; text-align:left; min-height:52px; padding:10px 12px; border-radius:12px; border:1px solid rgba(238,242,247,.18); background:rgba(255,255,255,.04); color:var(--parchment); font:500 .9rem/1.25 'Work Sans',sans-serif; cursor:pointer; transition:background .15s ease, border-color .15s ease; }
  .cover-q-opt:hover{ border-color:var(--brass); }
  .cover-q-opt:active, .cover-q-opt.is-selected{ background:var(--brass); border-color:var(--brass); color:#05261b; }
  .cover-example{ width:100%; max-width:420px; text-align:left; margin-top:22px; padding:14px; border-radius:16px; border:1px dashed rgba(238,242,247,.22); }
  .cover-example-label{ margin:0; font-size:.72rem; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
  .cover-example-name{ margin:4px 0 10px; font-size:1.05rem; font-weight:600; color:var(--parchment); }
  .cover-example-row{ display:grid; grid-template-columns:1fr auto; gap:2px 8px; font-size:.82rem; color:#c4cfdd; margin-top:8px; }
  .cover-example-row b{ color:var(--brass); font-variant-numeric:tabular-nums; }
  .cover-example-row > i{ grid-column:1 / -1; height:6px; border-radius:99px; background:rgba(238,242,247,.1); overflow:hidden; display:block; }
  .cover-example-row > i > i{ display:block; height:100%; border-radius:99px; background:var(--brass); }
  @media (max-width:360px){ .cover-q-options{ grid-template-columns:1fr; } }
</style>
"""

def fill(t, test=''):
    out = (t.replace('{{title}}', html.escape(cfg['t']['doc_title']))
            .replace('{{desc}}', html.escape(cfg['t']['doc_desc'], quote=True))
            .replace('{{lang}}', cfg['lang']).replace('{{testscript}}', test))
    out = out.replace(MASK, RING).replace(CRACK, RISE)
    for e in EYES: out = out.replace(e, '')
    out = out.replace('#c6a358', '#34d399')
    out = out.replace('</head>', THEME + '</head>', 1)
    return out

open(f'{APP}/index.html', 'w', encoding='utf8').write(fill(tpl))

# --- prueba del dueño (respuestas de ejemplo; en vez de cobrar, manda el informe al correo del dueño) ---
OPEN = ['Administración de empresas; trabajo en una ferretería atendiendo clientes.', 'Organicé la mudanza de la tienda en un fin de semana y no se perdió nada.',
        'Me piden ayuda con Excel y con las cuentas de la casa.', 'Excel avanzado y cómo vender por internet.', 'Enseñar a mis sobrinos matemáticas.',
        'Hablar en público y el inglés.', 'Tener mi propio negocio de asesoría a pequeñas tiendas, con horario flexible.', '¿Vale la pena estudiar algo nuevo a mi edad o mejor emprender?']
answers, k = [], 0
for q in cfg['questions']:
    if q['type'] == 'choice': answers.append(q['options'][min(1, len(q['options']) - 1)])
    else: answers.append(OPEN[k % len(OPEN)]); k += 1
test = ('<script>window.QER_TEST = { ownerEmail: "bonillapretiz@gmail.com", key: (function(){try{var k=new URLSearchParams(location.search).get("k");if(k){localStorage.setItem("qer_test_key",k);return k;}return localStorage.getItem("qer_test_key")||"";}catch(e){return "";}})(), answers: '
        + json.dumps(answers, ensure_ascii=False) + ' };</script>')
out = fill(tpl, test).replace('<title>', '<meta name="robots" content="noindex, nofollow">\n<title>Prueba · ', 1)
out = out.replace('<script src="config.js"></script>', f'<script src="/{APP}/config.js"></script>')
os.makedirs(f'{APP}/prueba', exist_ok=True)
open(f'{APP}/prueba/index.html', 'w', encoding='utf8').write(out)
print('ok', APP)
