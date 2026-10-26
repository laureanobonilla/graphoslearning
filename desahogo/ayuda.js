/* ayuda.js — líneas de ayuda por país para Desahogo (Latinoamérica y España). Solo se incluyen números contrastados con fuentes oficiales o
 * de medios confiables; para el resto de países se muestra el directorio findahelpline.com. Revisa estos datos cada cierto tiempo (REVISADO). */
(function () {
  'use strict';
  var REVISADO = 'octubre de 2026';
  var D = {
    CR: { n: 'Costa Rica', l: [['Emergencias (con psicólogo/a de apoyo, 24 h)', '911', '911'], ['Aquí Estoy – Colegio de Psicólogos (horario limitado)', '800-2737869 (800-AQESTOY)', '8002737869']] },
    MX: { n: 'México', l: [['Emergencias', '911', '911'], ['Línea de la Vida', '800 911 2000', '8009112000']] },
    AR: { n: 'Argentina', l: [['Línea Nacional de Salud Mental, 24 h', '0800-999-0091', '08009990091'], ['Centro de Asistencia al Suicida (Buenos Aires y GBA)', '135', '135']] },
    CO: { n: 'Colombia', l: [['Línea 106 – salud mental', '106', '106'], ['Emergencias', '123', '123']] },
    CL: { n: 'Chile', l: [['Línea de prevención del suicidio (Minsal)', '*4141', '*4141']] },
    PE: { n: 'Perú', l: [['Línea 113 (Minsa), opción 5 – salud mental', '113 + opción 5', '113']] },
    EC: { n: 'Ecuador', l: [['Línea 171 (Ministerio de Salud), opción 6', '171 + opción 6', '171'], ['Emergencias', '911', '911']] },
    UY: { n: 'Uruguay', l: [['Línea de prevención del suicidio', '0800 0767', '08000767'], ['Emergencias', '911', '911']] },
    ES: { n: 'España', l: [['Línea 024 – conducta suicida', '024', '024'], ['Emergencias', '112', '112']] },
    PR: { n: 'Puerto Rico', l: [['Línea 988', '988', '988'], ['Línea PAS', '1-800-981-0023', '18009810023']] },
    US: { n: 'Estados Unidos', l: [['Línea 988 (oprime 2 para español)', '988', '988']] }
  };
  var OTROS = 'Tu país no está en esta lista. Llama al número de emergencias local o busca una línea de ayuda en tu país:';
  var TZ = [[/^America\/Costa_Rica/, 'CR'], [/^America\/(Mexico_City|Monterrey|Merida|Cancun|Tijuana|Hermosillo|Chihuahua|Mazatlan|Matamoros|Bahia_Banderas|Ojinaga)/, 'MX'], [/^America\/Argentina\//, 'AR'], [/^America\/Buenos_Aires/, 'AR'], [/^America\/Bogota/, 'CO'], [/^America\/(Santiago|Punta_Arenas)/, 'CL'], [/^America\/Lima/, 'PE'], [/^America\/Guayaquil/, 'EC'], [/^America\/Montevideo/, 'UY'], [/^(Europe\/Madrid|Africa\/Ceuta|Atlantic\/Canary)/, 'ES'], [/^America\/Puerto_Rico/, 'PR'], [/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise)|Pacific\/Honolulu)/, 'US']];
  var KEY = 'acp_country';
  function detect() {
    try { var s = localStorage.getItem(KEY); if (s && (D[s] || s === 'OT')) return s; } catch (e) {}
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    for (var i = 0; i < TZ.length; i++) if (TZ[i][0].test(tz)) return TZ[i][1];
    return 'OT';
  }
  function fill(box, code) {
    box.textContent = '';
    var ul = document.createElement('ul'); ul.style.cssText = 'margin:8px 0;padding:0;list-style:none';
    if (D[code]) D[code].l.forEach(function (x) { var li = document.createElement('li'); li.style.margin = '6px 0'; li.appendChild(document.createTextNode(x[0] + ': ')); var a = document.createElement('a'); a.href = 'tel:' + x[2]; a.textContent = x[1]; a.style.cssText = 'font-weight:700;color:inherit'; li.appendChild(a); ul.appendChild(li); });
    else { var p = document.createElement('p'); p.style.margin = '8px 0'; p.textContent = OTROS; box.appendChild(p); }
    box.appendChild(ul);
    var f = document.createElement('p'); f.style.cssText = 'margin:6px 0 0;font-size:.85em'; f.appendChild(document.createTextNode('Directorio de líneas de ayuda de más países: '));
    var a2 = document.createElement('a'); a2.href = 'https://findahelpline.com'; a2.target = '_blank'; a2.rel = 'noopener'; a2.textContent = 'findahelpline.com'; a2.style.color = 'inherit'; f.appendChild(a2); box.appendChild(f);
    var n = document.createElement('p'); n.style.cssText = 'margin:6px 0 0;font-size:.78em;opacity:.7'; n.textContent = 'Datos revisados en ' + REVISADO + '. Si hay peligro inmediato, llama a emergencias.'; box.appendChild(n);
  }
  function picker(box, onChange) {
    var s = document.createElement('select'); s.setAttribute('aria-label', 'País'); s.style.cssText = 'margin:6px 0;padding:8px;border-radius:10px;background:#0f2128;color:inherit;border:1px solid #24424a;font:inherit;max-width:100%';
    var cur = detect();
    Object.keys(D).map(function (k) { return [k, D[k].n]; }).sort(function (a, b) { return a[1].localeCompare(b[1], 'es'); }).concat([['OT', 'Otro país']]).forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; if (x[0] === cur) o.selected = true; s.appendChild(o); });
    s.onchange = function () { try { localStorage.setItem(KEY, s.value); } catch (e) {} onChange(s.value); };
    box.appendChild(s);
  }
  window.ACP_HELP = { detect: detect, fill: fill, picker: picker };
})();
