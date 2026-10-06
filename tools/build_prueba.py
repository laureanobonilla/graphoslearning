#!/usr/bin/env python3
"""Regenera quien-eres/prueba/ a partir de la versión ACTUAL de quien-eres/ (app.js + index.html).
Modo prueba: respuestas de ejemplo ya cargadas, generación directa al abrir, sin eventos, sin indexar."""
import re, sys, pathlib
root = pathlib.Path(sys.argv[1])               # carpeta quien-eres/
old = pathlib.Path(sys.argv[2]).read_text()    # app.js viejo de prueba (de ahí salen las respuestas de ejemplo)
m = re.search(r"const DEFAULT_ANSWERS = \[.*?\n\];", old, re.S)
assert m, 'no se encontró DEFAULT_ANSWERS'
answers_block = m.group(0)

app = (root / 'app.js').read_text()
def sub1(pat, rep, s):
    assert pat in s, f'no se encontró: {pat[:50]}'
    return s.replace(pat, rep, 1)
app = sub1("function track(eventName, metadata) {\n", "function track(eventName, metadata) {\n  if (TEST_MODE) { console.log('[prueba] evento no enviado:', eventName); return; }\n", app)
app = sub1("    navigator.sendBeacon(", "    if (!TEST_MODE) navigator.sendBeacon(", app)
app = sub1("\nresumePendingReadingIfAny();", "\nif (!TEST_MODE) resumePendingReadingIfAny();", app)
header = ("// MODO PRUEBA (generado desde quien-eres/app.js con tools/build_prueba.py — no editar a mano):\n"
          "// respuestas de ejemplo ya cargadas; al abrir la página se genera directo, como lo vería una persona\n"
          "// al terminar el cuestionario. No registra eventos. La solicitud de canción SÍ se envía de verdad (correo real).\n"
          "const TEST_MODE = true;\n")
footer = "\n" + answers_block + "\nDEFAULT_ANSWERS.forEach((a, i) => { answers[i] = a; });\nsubmitQuiz();\n"
(root / 'prueba' / 'app.js').write_text(header + app + footer)

html = (root / 'index.html').read_text()
html = sub1("<title>¿Quién eres en realidad?</title>", "<title>Prueba — ¿Quién eres en realidad?</title>\n<meta name=\"robots\" content=\"noindex, nofollow\">", html)
banner = '<div style="position:fixed;left:0;right:0;top:0;text-align:center;font-size:.7rem;color:#8a7343;background:rgba(22,17,31,.92);padding:5px 8px;z-index:50;">Modo prueba · respuestas de ejemplo · no se registran eventos · la canción sí se envía de verdad · <a href="" style="color:#c6a358;">generar de nuevo</a></div>\n'
html = sub1('<script src="app.js"></script>', banner + '<script src="app.js"></script>', html)
(root / 'prueba' / 'index.html').write_text(html)
print('ok')
