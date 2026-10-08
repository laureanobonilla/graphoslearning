#!/usr/bin/env python3
"""Genera index.html de las 4 apps de pago a partir de qer-shared/template.html y el título/idioma de cada config.js.
Uso: python3 tools/build_qer_apps.py   (desde la carpeta etapa2)"""
import json, re, html, os
APPS = ['quien-eres', 'who-are-you', 'quien-es-tu-pareja', 'who-is-your-partner']
tpl = open('qer-shared/template.html', encoding='utf8').read()
for a in APPS:
    js = open(f'{a}/config.js', encoding='utf8').read()
    cfg = json.loads(js[js.index('window.QER_CFG =') + len('window.QER_CFG ='):].strip().rstrip(';'))
    out = (tpl.replace('{{title}}', html.escape(cfg['t']['doc_title']))
              .replace('{{desc}}', html.escape(cfg['t']['doc_desc'], quote=True))
              .replace('{{lang}}', cfg['lang']))
    open(f'{a}/index.html', 'w', encoding='utf8').write(out)
    print('ok', a)
