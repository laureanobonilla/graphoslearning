#!/usr/bin/env python3
"""Genera, desde qer-shared/template.html y el config.js de cada app:
  · <app>/index.html            (la app real)
  · <app>/prueba/index.html     (página de PRUEBA del dueño: respuestas de ejemplo ya cargadas, genera sola, sin eventos,
                                 y en vez de cobrar manda la lectura a bonillapretiz@gmail.com; noindex)
Uso (desde la raíz del repo): python3 tools/build_qer_apps.py"""
import json, html, os
APPS = ['quien-eres', 'who-are-you', 'quien-es-tu-pareja', 'who-is-your-partner']
OPEN_SAMPLES = {
    ('es', 'self'): ['Que todo está bien y que yo puedo con todo.', 'Dije que sí a ayudar con algo cuando lo único que quería era dormir.', 'Que mi familia me pide demasiado y no sé decir que no.', 'El cansancio que traigo; me ven siempre sonriendo y a punto.', 'Que me gustaría que alguien me preguntara dos veces cómo estoy.'],
    ('es', 'partner'): ['Que es muy cariñosa/o con todos menos conmigo cuando está cansada/o.', 'Lo escondió para no preocuparme, pero yo ya lo sabía.', 'Que a veces calla cosas importantes y espera que yo las adivine.', 'Cuando se enoja se vuelve distante y yo me quedo esperando.', 'Que me diga lo que siente sin que yo tenga que preguntarle.'],
    ('en', 'self'): ['That everything is fine and I can handle all of it.', 'I said yes to helping when all I wanted was to sleep.', 'That my family asks too much and I never learned to say no.', 'The tiredness I carry; people see me smiling and ready.', 'I wish someone would ask me twice how I really am.'],
    ('en', 'partner'): ['That they are warm with everyone except me when they are tired.', 'They hid it so I would not worry, but I already knew.', 'That they sometimes stay quiet about important things and expect me to guess.', 'When they get upset they go distant and I wait.', 'I wish they would tell me how they feel without me having to ask.'],
}
tpl = open('qer-shared/template.html', encoding='utf8').read()
for a in APPS:
    if not os.path.exists(f'{a}/config.js'):
        print('omitida (sin config.js):', a); continue
    js = open(f'{a}/config.js', encoding='utf8').read()
    cfg = json.loads(js[js.index('window.QER_CFG =') + len('window.QER_CFG ='):].strip().rstrip(';'))
    def fill(t, test=''):
        return (t.replace('{{title}}', html.escape(cfg['t']['doc_title']))
                 .replace('{{desc}}', html.escape(cfg['t']['doc_desc'], quote=True))
                 .replace('{{lang}}', cfg['lang']).replace('{{testscript}}', test))
    open(f'{a}/index.html', 'w', encoding='utf8').write(fill(tpl))
    # --- prueba ---
    opens = OPEN_SAMPLES.get((cfg['lang'], cfg.get('kind', 'self')), OPEN_SAMPLES[('es', 'self')])
    answers, k = [], 0
    for q in cfg['questions']:
        if q['type'] == 'choice': answers.append(q['options'][min(1, len(q['options']) - 1)])
        else: answers.append(opens[k % len(opens)]); k += 1
    test = ('<script>window.QER_TEST = { ownerEmail: "bonillapretiz@gmail.com", key: (function(){try{var k=new URLSearchParams(location.search).get("k");if(k){localStorage.setItem("qer_test_key",k);return k;}return localStorage.getItem("qer_test_key")||"";}catch(e){return "";}})(), answers: '
            + json.dumps(answers, ensure_ascii=False) + ' };</script>')
    out = fill(tpl, test).replace('<title>', '<meta name="robots" content="noindex, nofollow">\n<title>Prueba · ', 1)
    # ruta absoluta al config.js de la app: la misma página sirve en /<app>/prueba/ y en /prueba/
    out = out.replace('<script src="config.js"></script>', f'<script src="/{a}/config.js"></script>')
    if a == 'quien-eres':
        os.makedirs('prueba', exist_ok=True)
        open('prueba/index.html', 'w', encoding='utf8').write(out.replace('<title>Prueba · ' + html.escape(cfg['t']['doc_title']) + '</title>', '<title>Prueba</title>'))
    os.makedirs(f'{a}/prueba', exist_ok=True)
    for stale in ('app.js',):
        p = f'{a}/prueba/{stale}'
        if os.path.exists(p): os.remove(p)
    open(f'{a}/prueba/index.html', 'w', encoding='utf8').write(out)
    print('ok', a)
