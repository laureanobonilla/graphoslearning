/* Profundiza — pila de preguntas de completar guiada por lo que la persona no sabe (es, en, de, fr).
 * Cada palabra fallada se vuelve una pregunta nueva que la define; las demás quedan pendientes en la pila.
 * Solo cuando una pregunta sale bien se vuelve a la anterior. Nada queda suelto.
 * En inglés, alemán y francés hay pronunciación (voz del dispositivo) del texto completo y del concepto. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/profundiza';
  var LANG = (document.documentElement.lang || 'es').slice(0, 2); if (['es', 'en', 'de', 'fr'].indexOf(LANG) < 0) LANG = 'es';
  var MAX_DEPTH = 6, MAX_TAUGHT = 2;   // profundidad máxima y veces que se baja a una misma palabra antes de solo explicarla
  var TTS = LANG !== 'es' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var LOC = { es: 'es-ES', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };

  var I = {
    es: { name: 'Profundiza', lv: { beginner: ['Principiante', '1–2 espacios'], intermediate: ['Intermedio', '3 espacios'], advanced: ['Avanzado', '4–5 espacios'] },
      intro: 'Escribe un tema. Te doy una definición con espacios en blanco. Cada palabra que no sepas se vuelve la siguiente pregunta, y solo cuando la aciertas regresas a la anterior.', ph: 'Por ejemplo: fotosíntesis', topicAria: 'Tema que quieres estudiar', levelAria: 'Nivel', go: 'Empezar', resume: function (t) { return 'Seguir con «' + t + '»'; },
      map: 'Mapa de tu recorrido', depth: function (d, m) { return 'Profundidad ' + d + ' de ' + m; }, up: function (d) { return ' · hay que subir ' + (d - 1) + (d === 2 ? ' nivel' : ' niveles') + ' para volver al tema'; }, atTopic: ' · estás en el tema', stat: function (a, b) { return a + ' resueltos · ' + b + ' por resolver (sin contar el tema)'; },
      learned: function (n) { return 'Lo que ya aprendiste (' + n + ')'; }, loadQ: function (t) { return 'Preparando la pregunta sobre «' + t + '»…'; }, loadV: function (t) { return 'Preparando otra versión de «' + t + '»…'; },
      failT: 'No pude preparar la pregunta', failB: 'Pasa a veces. Intenta de nuevo; tu avance está guardado.', retry: 'Reintentar',
      why: function (w, p) { return 'No pudiste poner «' + w + '» en la pregunta sobre «' + p + '». Primero esta.'; }, blankAria: function (n) { return 'Espacio ' + n; }, check: 'Comprobar',
      almost: 'Casi: veamos qué falta', missed: function (n) { return 'Te faltaron ' + n + (n === 1 ? ' palabra' : ' palabras'); },
      nowAbout: function (w, more) { return 'Ahora una pregunta sobre «' + w + '»' + (more > 0 ? '. Después seguirás con ' + more + ' más y volverás a esta.' : ', y luego volverás a esta.'); }, seen: 'Seguimos: ya viste esas palabras.', understand: function (w) { return 'Entender «' + w + '»'; }, tryAgain: 'Volver a intentarlo',
      win: '¡Lo lograste!', okBack: 'Bien. Ya puedes volver', seeLearned: 'Ver lo que aprendiste', backTo: function (t) { return 'Volver a «' + t + '»'; },
      explainNote: 'Ya pasaste por esta palabra antes (o el recorrido ya es muy profundo), así que aquí la explico y seguimos.', cont: 'Seguir',
      doneT: function (t) { return 'Completaste «' + t + '»'; }, doneS: function (r, d, c) { return r + ' intentos · hasta ' + d + ' niveles de profundidad · ' + c + ' conceptos'; }, recap: 'Lo que repasaste en el camino:', again: 'Estudiar otro tema', harder: 'Mismo tema, más difícil', blankWord: 'espacio' },
    en: { name: 'Dive Deeper', lv: { beginner: ['Beginner', '1–2 blanks'], intermediate: ['Intermediate', '3 blanks'], advanced: ['Advanced', '4–5 blanks'] },
      intro: 'Type a topic. You get a definition with blanks. Every word you miss becomes the next question, and only when you get it right do you go back to the previous one.', ph: 'For example: photosynthesis', topicAria: 'Topic you want to study', levelAria: 'Level', go: 'Start', resume: function (t) { return 'Continue with “' + t + '”'; },
      map: 'Your path', depth: function (d, m) { return 'Depth ' + d + ' of ' + m; }, up: function (d) { return ' · climb ' + (d - 1) + (d === 2 ? ' level' : ' levels') + ' to get back to the topic'; }, atTopic: ' · you are at the topic', stat: function (a, b) { return a + ' solved · ' + b + ' to go (not counting the topic)'; },
      learned: function (n) { return 'What you have learned (' + n + ')'; }, loadQ: function (t) { return 'Preparing the question about “' + t + '”…'; }, loadV: function (t) { return 'Preparing another version of “' + t + '”…'; },
      failT: 'Could not prepare the question', failB: 'It happens. Try again; your progress is saved.', retry: 'Try again',
      why: function (w, p) { return 'You could not fill in “' + w + '” in the question about “' + p + '”. This one comes first.'; }, blankAria: function (n) { return 'Blank ' + n; }, check: 'Check',
      almost: 'Almost: let’s see what is missing', missed: function (n) { return 'You missed ' + n + (n === 1 ? ' word' : ' words'); },
      nowAbout: function (w, more) { return 'Now a question about “' + w + '”' + (more > 0 ? '. Then ' + more + ' more, and you will come back to this one.' : ', and then you will come back to this one.'); }, seen: 'Moving on: you have already seen those words.', understand: function (w) { return 'Understand “' + w + '”'; }, tryAgain: 'Try again',
      win: 'You did it!', okBack: 'Good. You can go back now', seeLearned: 'See what you learned', backTo: function (t) { return 'Back to “' + t + '”'; },
      explainNote: 'You have been through this word before (or the path is already very deep), so here is the explanation and we move on.', cont: 'Continue',
      doneT: function (t) { return 'You completed “' + t + '”'; }, doneS: function (r, d, c) { return r + ' attempts · up to ' + d + ' levels deep · ' + c + ' concepts'; }, recap: 'What you reviewed along the way:', again: 'Study another topic', harder: 'Same topic, harder', blankWord: 'blank', listen: 'Listen', listenText: 'Listen to the text', listenWord: 'Listen to the word', slow: 'Slow', noVoice: 'No voice available in this browser.' },
    de: { name: 'Tiefer lernen', lv: { beginner: ['Anfänger', '1–2 Lücken'], intermediate: ['Mittel', '3 Lücken'], advanced: ['Fortgeschritten', '4–5 Lücken'] },
      intro: 'Gib ein Thema ein. Du bekommst eine Definition mit Lücken. Jedes Wort, das du nicht weißt, wird zur nächsten Frage – erst wenn du es richtig hast, geht es zur vorherigen zurück.', ph: 'Zum Beispiel: Photosynthese', topicAria: 'Thema, das du lernen möchtest', levelAria: 'Niveau', go: 'Los', resume: function (t) { return 'Weiter mit „' + t + '“'; },
      map: 'Dein Weg', depth: function (d, m) { return 'Tiefe ' + d + ' von ' + m; }, up: function (d) { return ' · ' + (d - 1) + (d === 2 ? ' Ebene' : ' Ebenen') + ' nach oben, um zum Thema zurückzukehren'; }, atTopic: ' · du bist beim Thema', stat: function (a, b) { return a + ' gelöst · ' + b + ' offen (ohne das Thema)'; },
      learned: function (n) { return 'Das hast du gelernt (' + n + ')'; }, loadQ: function (t) { return 'Frage zu „' + t + '“ wird vorbereitet …'; }, loadV: function (t) { return 'Andere Version von „' + t + '“ wird vorbereitet …'; },
      failT: 'Die Frage konnte nicht erstellt werden', failB: 'Das passiert. Versuch es noch einmal; dein Fortschritt ist gespeichert.', retry: 'Noch einmal',
      why: function (w, p) { return '„' + w + '“ fehlte dir in der Frage zu „' + p + '“. Diese kommt zuerst.'; }, blankAria: function (n) { return 'Lücke ' + n; }, check: 'Prüfen',
      almost: 'Fast: sehen wir, was fehlt', missed: function (n) { return n + (n === 1 ? ' Wort fehlte' : ' Wörter fehlten'); },
      nowAbout: function (w, more) { return 'Jetzt eine Frage zu „' + w + '“' + (more > 0 ? '. Danach noch ' + more + ' weitere, dann kommst du hierher zurück.' : ', danach kommst du hierher zurück.'); }, seen: 'Weiter: diese Wörter hast du schon gesehen.', understand: function (w) { return '„' + w + '“ verstehen'; }, tryAgain: 'Noch einmal versuchen',
      win: 'Geschafft!', okBack: 'Gut. Du kannst zurück', seeLearned: 'Gelerntes ansehen', backTo: function (t) { return 'Zurück zu „' + t + '“'; },
      explainNote: 'Dieses Wort hattest du schon (oder der Weg ist schon sehr tief), deshalb erkläre ich es hier und wir machen weiter.', cont: 'Weiter',
      doneT: function (t) { return '„' + t + '“ abgeschlossen'; }, doneS: function (r, d, c) { return r + ' Versuche · bis zu ' + d + ' Ebenen tief · ' + c + ' Begriffe'; }, recap: 'Das hast du unterwegs wiederholt:', again: 'Anderes Thema lernen', harder: 'Gleiches Thema, schwerer', blankWord: 'Lücke', listen: 'Anhören', listenText: 'Text anhören', listenWord: 'Wort anhören', slow: 'Langsam', noVoice: 'In diesem Browser ist keine Stimme verfügbar.' },
    fr: { name: 'Approfondis', lv: { beginner: ['Débutant', '1–2 blancs'], intermediate: ['Intermédiaire', '3 blancs'], advanced: ['Avancé', '4–5 blancs'] },
      intro: 'Écris un sujet. Tu reçois une définition à trous. Chaque mot que tu rates devient la question suivante, et ce n’est qu’en le réussissant que tu reviens à la précédente.', ph: 'Par exemple : photosynthèse', topicAria: 'Sujet que tu veux étudier', levelAria: 'Niveau', go: 'Commencer', resume: function (t) { return 'Continuer avec « ' + t + ' »'; },
      map: 'Ton parcours', depth: function (d, m) { return 'Profondeur ' + d + ' sur ' + m; }, up: function (d) { return ' · il faut remonter de ' + (d - 1) + (d === 2 ? ' niveau' : ' niveaux') + ' pour revenir au sujet'; }, atTopic: ' · tu es au sujet', stat: function (a, b) { return a + ' résolus · ' + b + ' à résoudre (sans compter le sujet)'; },
      learned: function (n) { return 'Ce que tu as appris (' + n + ')'; }, loadQ: function (t) { return 'Préparation de la question sur « ' + t + ' »…'; }, loadV: function (t) { return 'Préparation d’une autre version de « ' + t + ' »…'; },
      failT: 'Impossible de préparer la question', failB: 'Ça arrive. Réessaie ; ta progression est enregistrée.', retry: 'Réessayer',
      why: function (w, p) { return 'Tu n’as pas pu placer « ' + w + ' » dans la question sur « ' + p + ' ». Celle-ci d’abord.'; }, blankAria: function (n) { return 'Blanc ' + n; }, check: 'Vérifier',
      almost: 'Presque : voyons ce qui manque', missed: function (n) { return 'Il te manquait ' + n + (n === 1 ? ' mot' : ' mots'); },
      nowAbout: function (w, more) { return 'Maintenant une question sur « ' + w + ' »' + (more > 0 ? '. Ensuite ' + more + ' de plus, puis tu reviendras à celle-ci.' : ', puis tu reviendras à celle-ci.'); }, seen: 'On continue : tu as déjà vu ces mots.', understand: function (w) { return 'Comprendre « ' + w + ' »'; }, tryAgain: 'Réessayer',
      win: 'Bravo !', okBack: 'Bien. Tu peux revenir', seeLearned: 'Voir ce que tu as appris', backTo: function (t) { return 'Retour à « ' + t + ' »'; },
      explainNote: 'Tu es déjà passé par ce mot (ou le parcours est déjà très profond), je l’explique donc ici et on continue.', cont: 'Continuer',
      doneT: function (t) { return '« ' + t + ' » terminé'; }, doneS: function (r, d, c) { return r + ' essais · jusqu’à ' + d + ' niveaux de profondeur · ' + c + ' notions'; }, recap: 'Ce que tu as revu en chemin :', again: 'Étudier un autre sujet', harder: 'Même sujet, plus difficile', blankWord: 'blanc', listen: 'Écouter', listenText: 'Écouter le texte', listenWord: 'Écouter le mot', slow: 'Lent', noVoice: 'Aucune voix disponible dans ce navigateur.' }
  };
  var T = I[LANG];
  var KEY = 'prf_state_v2_' + LANG, ANON = (function () { try { var a = localStorage.getItem('prf_anon'); if (!a) { a = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('prf_anon', a); } return a; } catch (e) { return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); } })();
  var $ = function (id) { return document.getElementById(id); };
  var main = $('main'), pile = $('pile'), learnEl = $('learn');
  var S = null, cache = {}, busy = false, slow = false; try { slow = localStorage.getItem('prf_slow') === '1'; } catch (e) {}
  document.title = T.name;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function lev(a, b) { var m = a.length, n = b.length, d = [], i, j; for (i = 0; i <= m; i++) d[i] = [i]; for (j = 1; j <= n; j++) d[0][j] = j; for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function isRight(given, answers) {
    var g = norm(given); if (!g) return false;
    return answers.some(function (a) { var x = norm(a); if (g === x) return true; var tol = x.length >= 9 ? 2 : x.length >= 5 ? 1 : 0; return tol > 0 && lev(g, x) <= tol; });
  }
  function track(ev, md) { try { md = md || {}; md.lang = LANG; fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'track', anonId: ANON, event: ev, metadata: md }) }).catch(function () {}); } catch (e) {} }
  function save() { try { if (S) localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- pronunciación (voz del dispositivo) ---------- */
  var curBtn = null;
  function voice() { var vs = speechSynthesis.getVoices() || [], pre = LOC[LANG].toLowerCase(); return vs.filter(function (v) { return v.lang && v.lang.toLowerCase().replace('_', '-') === pre; })[0] || vs.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(LANG) === 0; })[0] || null; }
  function stopSpeech() { if (!TTS) return; try { speechSynthesis.cancel(); } catch (e) {} if (curBtn) curBtn.classList.remove('on'); curBtn = null; }
  function speak(text, btn) {
    if (!TTS) return; var was = curBtn === btn; stopSpeech(); if (was) return;
    var u = new SpeechSynthesisUtterance(text); u.lang = LOC[LANG]; var v = voice(); if (v) u.voice = v; u.rate = slow ? 0.65 : 0.95;
    curBtn = btn; if (btn) btn.classList.add('on'); var end = function () { if (curBtn === btn) { if (btn) btn.classList.remove('on'); curBtn = null; } }; u.onend = end; u.onerror = end;
    try { speechSynthesis.speak(u); } catch (e) { end(); }
    if (!v && !speechSynthesis.getVoices().length) { /* las voces cargan tarde: se avisa solo si de verdad no hay */ }
  }
  function spk(getText, label) { var b = el('button', 'spk', '🔊'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.onclick = function (e) { e.preventDefault(); speak(typeof getText === 'function' ? getText() : getText, b); }; return b; }
  function plain(f, res) { return f.cloze.text.replace(/\[\[(\d+)\]\]/g, function (m, n) { if (res) { var r = res.filter(function (x) { return x.b.n === Number(n); })[0]; return r ? r.b.answers[0] : ''; } return ', ' + T.blankWord + ', '; }); }
  function ttsBar(getText) {
    if (!TTS) return null; var bar = el('div', 'ttsbar'), b = el('button', 'spk', '🔊 ' + T.listenText); b.type = 'button'; b.onclick = function () { speak(getText(), b); }; bar.appendChild(b);
    var sl = el('button', 'spk' + (slow ? ' on' : ''), '🐢 ' + T.slow); sl.type = 'button'; sl.setAttribute('aria-pressed', slow ? 'true' : 'false'); sl.onclick = function () { slow = !slow; try { localStorage.setItem('prf_slow', slow ? '1' : '0'); } catch (e) {} sl.classList.toggle('on', slow); sl.setAttribute('aria-pressed', slow ? 'true' : 'false'); }; bar.appendChild(sl); return bar;
  }

  function getCloze(term, parent, variant, avoid) {
    var key = norm(term) + '|' + S.level + '|' + (variant || 0);
    if (cache[key]) return cache[key];
    var p = fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cloze', anonId: ANON, lang: LANG, term: term, topic: S.topic, parent: parent || '', level: S.level, variant: variant || 0, avoid: avoid || [] }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'http'); return j; }); })
      .catch(function (e) { delete cache[key]; throw e; });
    cache[key] = p; return p;
  }

  /* ---------- pantallas ---------- */
  function node(term, parentId) { var n = { id: S.nodes.length, term: term, parentId: parentId, status: 'pending' }; S.nodes.push(n); return n; }
  function setStatus(id, st) { if (S.nodes[id]) S.nodes[id].status = st; }
  function renderPile() {
    pile.textContent = '';
    document.body.classList.toggle('start', !S || !S.nodes.length); if (!S || !S.nodes.length) { pile.classList.remove('on'); learnEl.classList.remove('on'); return; }
    pile.classList.add('on'); pile.appendChild(el('h3', null, T.map));
    var depth = S.stack.length, g = el('div', 'gauge'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', T.depth(depth, MAX_DEPTH));
    for (var i = 1; i <= MAX_DEPTH; i++) g.appendChild(el('i', i <= depth ? 'on' : ''));
    pile.appendChild(g); pile.appendChild(el('div', 'gl', T.depth(depth, MAX_DEPTH) + (depth > 1 ? T.up(depth) : T.atTopic)));
    var tree = el('div', 'tree'); (function walk(pid, lvl) { S.nodes.forEach(function (n) { if (n.parentId !== pid) return; var st = n.status === 'active' && S.stack.length && S.stack[S.stack.length - 1].nodeId !== n.id ? 'wait' : n.status, r = el('div', 'tn ' + st); r.style.paddingLeft = (lvl * 14) + 'px'; r.appendChild(el('span', 'mk', st === 'done' ? '✓' : st === 'active' ? '●' : st === 'wait' ? '◐' : '○')); r.appendChild(document.createTextNode(n.term)); tree.appendChild(r); walk(n.id, lvl + 1); }); })(null, 0);
    pile.appendChild(tree);
    var done = S.nodes.filter(function (n) { return n.status === 'done'; }).length, pend = S.nodes.filter(function (n) { return n.status !== 'done'; }).length - 1;
    renderLearn();
    pile.appendChild(el('div', 'stat', T.stat(done, Math.max(0, pend))));
  }
  function renderLearn() {
    learnEl.textContent = ''; var L = (S && S.learned || []).filter(function (x) { return x.meaning; });
    if (!L.length) { learnEl.classList.remove('on'); return; }
    learnEl.classList.add('on'); learnEl.appendChild(el('h3', null, T.learned(L.length)));
    L.slice().reverse().forEach(function (x) { var d = el('div', 'lrn'); var b = el('b', null, x.term); if (TTS) b.appendChild(spk(x.term, T.listenWord)); d.appendChild(b); d.appendChild(el('span', null, x.meaning)); learnEl.appendChild(d); });
  }
  function crumb(parent) {
    var c = el('p', 'crumb'); S.stack.forEach(function (f, i) { if (i) c.appendChild(document.createTextNode(' › ')); var last = i === S.stack.length - 1, b = last ? el('b', null, f.term) : document.createTextNode(f.term); c.appendChild(b); if (last && TTS) c.appendChild(spk(f.term, T.listenWord)); }); parent.appendChild(c);
  }
  function loading(msg) { stopSpeech(); main.textContent = ''; var p = el('p', 'muted'); p.appendChild(el('span', 'spin')); p.appendChild(document.createTextNode(msg)); main.appendChild(p); }
  function fail(retry) {
    main.textContent = ''; main.appendChild(el('h2', null, T.failT)); main.appendChild(el('p', 'muted', T.failB));
    var b = el('button', 'btn', T.retry); b.onclick = retry; main.appendChild(b); track('prf_error', {});
  }
  function langs() {
    var d = el('p', 'langs'), L = [['es', 'Español', '/profundiza/'], ['en', 'English', '/profundiza/en/'], ['de', 'Deutsch', '/profundiza/de/'], ['fr', 'Français', '/profundiza/fr/']];
    L.forEach(function (x) { var a = el('a', null, x[1]); a.href = x[2]; if (x[0] === LANG) a.setAttribute('aria-current', 'page'); d.appendChild(a); }); return d;
  }

  function start() {
    stopSpeech(); S = null; document.body.classList.remove('fin'); renderPile(); main.textContent = '';
    var hero = el('div', 'hero'), form = el('div', 'formcard'); hero.appendChild(el('h1', null, T.name));
    hero.appendChild(el('p', null, T.intro)); hero.appendChild(langs());
    var inp = el('input', 'field'); inp.type = 'text'; inp.placeholder = T.ph; inp.maxLength = 80; inp.setAttribute('aria-label', T.topicAria); form.appendChild(inp);
    var lvl = 'beginner', box = el('div', 'lvs'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', T.levelAria);
    Object.keys(T.lv).forEach(function (k) { var b = el('button', 'lv'); b.type = 'button'; b.setAttribute('aria-pressed', k === lvl ? 'true' : 'false'); b.appendChild(el('b', null, T.lv[k][0])); b.appendChild(el('span', null, T.lv[k][1])); b.onclick = function () { lvl = k; [].forEach.call(box.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }; box.appendChild(b); });
    form.appendChild(box);
    var go = el('button', 'btn', T.go); go.type = 'button'; form.appendChild(go); main.appendChild(hero); main.appendChild(form);
    var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (saved && saved.stack && saved.stack.length) { var r = el('button', 'btn ghost', T.resume(saved.topic)); r.style.marginLeft = '10px'; r.onclick = function () { S = saved; track('prf_resumed', {}); next(); }; form.appendChild(r); }
    var run = function () { var t = inp.value.trim(); if (t.length < 2) { inp.focus(); return; } S = { topic: t, level: lvl, stack: [], nodes: [], taught: {}, learned: [], rounds: 0, maxDepth: 1 }; track('prf_start', { level: lvl }); pushFrame(t, '', null); };
    go.onclick = run; inp.onkeydown = function (e) { if (e.key === 'Enter') run(); }; inp.focus();
  }

  function pushFrame(term, parent, why, nodeId) {
    loading(T.loadQ(term));
    getCloze(term, parent, 0, []).then(function (c) {
      if (nodeId == null) nodeId = node(term, null).id; setStatus(nodeId, 'active'); S.stack.push({ term: term, parent: parent || '', nodeId: nodeId, cloze: c, pending: [], tries: 0, why: why || '', seen: [c.text] });
      S.maxDepth = Math.max(S.maxDepth, S.stack.length); save(); ask();
    }).catch(function () { fail(function () { pushFrame(term, parent, why, nodeId); }); });
  }

  function ask() {
    var f = S.stack[S.stack.length - 1]; stopSpeech(); renderPile(); main.textContent = '';
    crumb(main); if (f.why && f.tries === 0) main.appendChild(el('div', 'why', f.why));
    track('prf_cloze_shown', { depth: S.stack.length, tries: f.tries });
    var bar = ttsBar(function () { return f.term + '. ' + plain(f); }); if (bar) main.appendChild(bar);
    var p = el('p', 'cloze'), inputs = [];
    f.cloze.text.split(/(\[\[\d+\]\])/).forEach(function (part) {
      var m = part.match(/^\[\[(\d+)\]\]$/); if (!m) { p.appendChild(document.createTextNode(part)); return; }
      var b = f.cloze.blanks.filter(function (x) { return x.n === Number(m[1]); })[0], i = el('input'); i.type = 'text'; i.autocomplete = 'off'; i.autocapitalize = 'none'; i.spellcheck = false; i.setAttribute('aria-label', T.blankAria(m[1]));
      i.style.width = Math.max(5, (b ? b.answers[0].length : 6) + 2) + 'ch'; i.dataset.n = m[1]; inputs.push(i); p.appendChild(i);
    });
    main.appendChild(p);
    var row = el('div', 'row'), ok = el('button', 'btn', T.check); ok.type = 'button'; row.appendChild(ok); main.appendChild(row);
    inputs.forEach(function (i, k) { i.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (inputs[k + 1]) inputs[k + 1].focus(); else ok.click(); } }; });
    ok.onclick = function () { submit(f, inputs); };
    if (inputs[0]) inputs[0].focus();
  }

  function submit(f, inputs) {
    var res = f.cloze.blanks.map(function (b) { var inp = inputs.filter(function (i) { return Number(i.dataset.n) === b.n; })[0], given = inp ? inp.value : ''; return { b: b, given: given, right: isRight(given, b.answers) }; });
    S.rounds++; var wrong = res.filter(function (r) { return !r.right; });
    if (!wrong.length) { track('prf_cloze_ok', { depth: S.stack.length, tries: f.tries }); res.forEach(function (r) { learn(r.b.answers[0], r.b.meaning); }); learn(f.term, ''); success(f, res); return; }
    f.tries++; f.pending = wrong.map(function (r) { var k = norm(r.b.answers[0]), n = S.nodes.filter(function (x) { return x.parentId === f.nodeId && norm(x.term) === k; })[0] || node(r.b.answers[0], f.nodeId); n.status = 'pending'; return { answer: r.b.answers[0], meaning: r.b.meaning, nodeId: n.id }; }); save(); track('prf_cloze_fail', { depth: S.stack.length, wrong: wrong.length, of: res.length });
    res.filter(function (r) { return r.right; }).forEach(function (r) { learn(r.b.answers[0], r.b.meaning); });
    feedback(f, res); prefetch(f);
  }
  function learn(term, meaning) { var k = norm(term); if (!k) return; if (!S.learned.some(function (x) { return norm(x.term) === k; })) S.learned.push({ term: term, meaning: meaning || '' }); else if (meaning) S.learned.forEach(function (x) { if (norm(x.term) === k && !x.meaning) x.meaning = meaning; }); }
  function canDescend(f, w) {
    var k = norm(w.answer); if (S.stack.length >= MAX_DEPTH) return false; if ((S.taught[k] || 0) >= MAX_TAUGHT) return false;
    return !S.stack.some(function (x) { return norm(x.term) === k; });
  }
  function prefetch(f) { if (f.pending[0] && canDescend(f, f.pending[0])) getCloze(f.pending[0].answer, f.term, 0, []).catch(function () {}); }

  function filled(f, res) {
    var p = el('p', 'cloze'); f.cloze.text.split(/(\[\[\d+\]\])/).forEach(function (part) {
      var m = part.match(/^\[\[(\d+)\]\]$/); if (!m) { p.appendChild(document.createTextNode(part)); return; }
      var r = res.filter(function (x) { return x.b.n === Number(m[1]); })[0]; if (!r) return;
      var s = el('span', r.right ? 'ok' : 'bad', r.b.answers[0]); p.appendChild(s);
      if (!r.right && r.given.trim()) p.appendChild(el('s', null, r.given.trim()));
    }); return p;
  }
  function feedback(f, res) {
    stopSpeech(); renderPile(); main.textContent = ''; crumb(main);
    var wrong = res.filter(function (r) { return !r.right; });
    main.appendChild(el('h2', null, wrong.length === res.length ? T.almost : T.missed(wrong.length)));
    var bar = ttsBar(function () { return plain(f, res); }); if (bar) main.appendChild(bar);
    main.appendChild(filled(f, res));
    wrong.forEach(function (r) { var d = el('p', 'mean'); d.appendChild(el('b', null, r.b.answers[0])); if (TTS) d.appendChild(spk(r.b.answers[0], T.listenWord)); d.appendChild(document.createTextNode(': ' + r.b.meaning)); main.appendChild(d); });
    var first = f.pending[0], desc = canDescend(f, first);
    main.appendChild(el('p', 'muted small', desc ? T.nowAbout(first.answer, f.pending.length - 1) : T.seen));
    var b = el('button', 'btn', desc ? T.understand(first.answer) : T.tryAgain); b.onclick = next; main.appendChild(b); b.focus();
  }
  function success(f, res) {
    stopSpeech(); main.textContent = ''; crumb(main);
    var isRoot = S.stack.length === 1;
    main.appendChild(el('h2', null, isRoot ? T.win : T.okBack));
    var bar = ttsBar(function () { return plain(f, res); }); if (bar) main.appendChild(bar);
    main.appendChild(filled(f, res));
    var b = el('button', 'btn', isRoot ? T.seeLearned : T.backTo(S.stack[S.stack.length - 2].term));
    b.onclick = function () { setStatus(f.nodeId, 'done'); S.stack.pop(); track('prf_return', { depth: S.stack.length }); save(); if (isRoot) done(); else next(); }; main.appendChild(b); b.focus();
  }

  /* ---------- motor de la pila ---------- */
  function next() {
    if (busy) return; var f = S.stack[S.stack.length - 1]; if (!f) { done(); return; }
    if (f.pending.length) {
      var w = f.pending[0];
      if (!canDescend(f, w)) { f.pending.shift(); setStatus(w.nodeId, 'done'); save(); explain(f, w); return; }
      f.pending.shift(); var k = norm(w.answer); S.taught[k] = (S.taught[k] || 0) + 1; save(); track('prf_descend', { depth: S.stack.length + 1 });
      pushFrame(w.answer, f.term, T.why(w.answer, f.term), w.nodeId); return;
    }
    // sin pendientes: se vuelve a presentar la pregunta (después de dos fallos seguidos, con otra redacción)
    if (f.tries >= 2 && f.tries % 2 === 0) {
      loading(T.loadV(f.term));
      getCloze(f.term, f.parent, f.tries / 2, f.seen.slice(-2)).then(function (c) { f.cloze = c; f.seen.push(c.text); save(); ask(); }).catch(function () { ask(); });
    } else ask();
  }
  function explain(f, w) {
    stopSpeech(); renderPile(); main.textContent = ''; crumb(main);
    var h = el('h2', null, w.answer); if (TTS) h.appendChild(spk(w.answer, T.listenWord)); main.appendChild(h); main.appendChild(el('p', null, w.meaning));
    main.appendChild(el('p', 'muted small', T.explainNote));
    var b = el('button', 'btn', T.cont); b.onclick = next; main.appendChild(b); b.focus();
  }
  function done() {
    stopSpeech(); track('prf_done', { rounds: S.rounds, depth: S.maxDepth, learned: S.learned.length }); clear(); renderPile(); learnEl.classList.remove('on'); pile.classList.remove('on'); document.body.classList.add('fin'); main.textContent = '';
    main.appendChild(el('h2', null, T.doneT(S.topic)));
    main.appendChild(el('p', 'muted', T.doneS(S.rounds, S.maxDepth, S.learned.length)));
    var withM = S.learned.filter(function (x) { return x.meaning; });
    if (withM.length) { main.appendChild(el('p', null, T.recap)); var ul = el('ul', 'recap'); withM.forEach(function (x) { var li = el('li'); li.appendChild(el('b', null, x.term)); if (TTS) li.appendChild(spk(x.term, T.listenWord)); li.appendChild(document.createTextNode(': ' + x.meaning)); ul.appendChild(li); }); main.appendChild(ul); }
    var row = el('div', 'row'), again = el('button', 'btn', T.again); again.onclick = start; row.appendChild(again);
    var up = el('button', 'btn ghost', T.harder); up.onclick = function () { var t = S.topic, nl = S.level === 'beginner' ? 'intermediate' : 'advanced'; S = { topic: t, level: nl, stack: [], nodes: [], taught: {}, learned: [], rounds: 0, maxDepth: 1 }; document.body.classList.remove('fin'); pushFrame(t, '', null); }; if (S.level !== 'advanced') row.appendChild(up);
    main.appendChild(row);
  }

  if (TTS) { try { speechSynthesis.getVoices(); } catch (e) {} }
  track('prf_landing', {}); start();
})();
