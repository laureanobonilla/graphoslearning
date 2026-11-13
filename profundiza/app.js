/* Profundiza — pila de preguntas de completar guiada por lo que la persona no sabe (es, en, de, fr).
 * Cada palabra fallada se vuelve una pregunta nueva que la define; las demás quedan pendientes en la pila.
 * Solo cuando una pregunta sale bien se vuelve a la anterior. Nada queda suelto.
 * Cada tema se estudia por partes (10 / 25 / 65 según el nivel). Solo se profundiza en palabras CRUCIALES para el tema central;
 * las demás se explican y se sigue. Todos los temas quedan guardados en este dispositivo y se pueden retomar.
 * En inglés, alemán y francés hay pronunciación (voz del dispositivo) del texto completo y del concepto. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/profundiza';
  var LEARN = document.documentElement.getAttribute('data-mode') === 'learn';   // modo idiomas: interfaz en español, texto en el idioma elegido
  var LANG = (document.documentElement.lang || 'es').slice(0, 2); if (['es', 'en', 'de', 'fr'].indexOf(LANG) < 0) LANG = 'es';
  if (LEARN) { try { LANG = localStorage.getItem('prf_target') || 'de'; } catch (e) { LANG = 'de'; } if (['en', 'de', 'fr'].indexOf(LANG) < 0) LANG = 'de'; }
  var MAX_DEPTH = 4, MAX_TAUGHT = 2, PARTS = { beginner: 10, intermediate: 25, advanced: 65 };   // profundidad máxima y veces que se baja a una misma palabra antes de solo explicarla
  var TTS = LANG !== 'es' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var LOC = { es: 'es-ES', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };

  var I = {
    es: { name: 'Profundiza', lv: { beginner: ['Principiante', '10 partes · 1–2 espacios'], intermediate: ['Intermedio', '25 partes · 3 espacios'], advanced: ['Avanzado', '65 partes · 4–5 espacios'] },
      intro: 'Escribe un tema o trae tu propio texto (link, PDF o texto pegado). Te doy fragmentos con espacios en blanco, sacados de tu texto cuando lo hay. Cada palabra que no sepas se vuelve la siguiente pregunta, y solo cuando la aciertas regresas a la anterior. Entre las preguntas se cuelan curiosidades e historias poco contadas del tema, cuando las hay.', ph: 'Por ejemplo: fotosíntesis', topicAria: 'Tema que quieres estudiar', levelAria: 'Nivel', go: 'Empezar', resume: function (t) { return 'Seguir con «' + t + '»'; },
      map: 'Mapa de tu recorrido', depth: function (d, m) { return 'Profundidad ' + d + ' de ' + m; }, up: function (d) { return ' · hay que subir ' + (d - 1) + (d === 2 ? ' nivel' : ' niveles') + ' para volver al tema'; }, atTopic: ' · estás en el tema', stat: function (a, b) { return a + ' resueltos · ' + b + ' por resolver (sin contar el tema)'; },
      learned: function (n) { return 'Lo que ya aprendiste (' + n + ')'; }, loadQ: function (t) { return 'Preparando la pregunta sobre «' + t + '»…'; }, loadV: function (t) { return 'Preparando otra versión de «' + t + '»…'; },
      failT: 'No pude preparar la pregunta', failB: 'Pasa a veces. Intenta de nuevo; tu avance está guardado.', retry: 'Reintentar',
      why: function (w, p) { return 'No pudiste poner «' + w + '» en la pregunta sobre «' + p + '». Primero esta.'; }, blankAria: function (n) { return 'Espacio ' + n; }, check: 'Comprobar',
      almost: 'Casi: veamos qué falta', missed: function (n) { return 'Te faltaron ' + n + (n === 1 ? ' palabra' : ' palabras'); },
      nowAbout: function (w, more) { return 'Ahora una pregunta sobre «' + w + '»' + (more > 0 ? '. Después seguirás con ' + more + ' más y volverás a esta.' : ', y luego volverás a esta.'); }, seen: 'Seguimos: ya viste esas palabras.', understand: function (w) { return 'Entender «' + w + '»'; }, tryAgain: 'Volver a intentarlo',
      win: '¡Lo lograste!', okBack: 'Bien. Ya puedes volver', seeLearned: 'Ver lo que aprendiste', backTo: function (t) { return 'Volver a «' + t + '»'; },
      explainNote: 'Ya pasaste por esta palabra antes (o el recorrido ya es muy profundo), así que aquí la explico y seguimos.', cont: 'Seguir',
      doneT: function (t) { return 'Completaste «' + t + '»'; }, doneS: function (r, d, c) { return r + ' intentos · hasta ' + d + ' niveles de profundidad · ' + c + ' conceptos'; }, recap: 'Lo que repasaste en el camino:', again: 'Estudiar otro tema', harder: 'Mismo tema, más difícil', partOf: function (k, n) { return 'Parte ' + k + ' de ' + n; }, partWin: function (k, n) { return '¡Parte ' + k + ' de ' + n + ' lista!'; }, nextPart: function (k, n) { return 'Seguir con la parte ' + k + ' de ' + n; }, lastPart: function (n) { return 'Parte final (' + n + ' de ' + n + ')'; }, loadO: function (t) { return 'Armando el temario de «' + t + '»…'; },
      myTopics: 'Tus temas', contT: 'Continuar', viewT: 'Ver lo aprendido', delT: 'Quitar', sureT: '¿Quitar?', doneTag: 'Completado', progT: function (k, n) { return 'Parte ' + k + ' de ' + n; },
      minorNote: function (t) { return 'Esta palabra no es clave para «' + t + '», así que solo te la explico y seguimos.'; }, minorSeen: 'Seguimos: esas palabras no son clave para el tema, ya viste qué significan.', blankWord: 'espacio', curK: 'Curiosidad', untK: 'Historia poco contada' },
    en: { name: 'Dive Deeper', lv: { beginner: ['Beginner', '10 parts · 1–2 blanks'], intermediate: ['Intermediate', '25 parts · 3 blanks'], advanced: ['Advanced', '65 parts · 4–5 blanks'] },
      intro: 'Type a topic or bring your own text (link, PDF or pasted text). You get fragments with blanks, taken from your text when you have one. Every word you miss becomes the next question, and only when you get it right do you go back to the previous one. Curious facts and little-told stories about the topic are mixed in among the questions, when there are any.', ph: 'For example: photosynthesis', topicAria: 'Topic you want to study', levelAria: 'Level', go: 'Start', resume: function (t) { return 'Continue with “' + t + '”'; },
      map: 'Your path', depth: function (d, m) { return 'Depth ' + d + ' of ' + m; }, up: function (d) { return ' · climb ' + (d - 1) + (d === 2 ? ' level' : ' levels') + ' to get back to the topic'; }, atTopic: ' · you are at the topic', stat: function (a, b) { return a + ' solved · ' + b + ' to go (not counting the topic)'; },
      learned: function (n) { return 'What you have learned (' + n + ')'; }, loadQ: function (t) { return 'Preparing the question about “' + t + '”…'; }, loadV: function (t) { return 'Preparing another version of “' + t + '”…'; },
      failT: 'Could not prepare the question', failB: 'It happens. Try again; your progress is saved.', retry: 'Try again',
      why: function (w, p) { return 'You could not fill in “' + w + '” in the question about “' + p + '”. This one comes first.'; }, blankAria: function (n) { return 'Blank ' + n; }, check: 'Check',
      almost: 'Almost: let’s see what is missing', missed: function (n) { return 'You missed ' + n + (n === 1 ? ' word' : ' words'); },
      nowAbout: function (w, more) { return 'Now a question about “' + w + '”' + (more > 0 ? '. Then ' + more + ' more, and you will come back to this one.' : ', and then you will come back to this one.'); }, seen: 'Moving on: you have already seen those words.', understand: function (w) { return 'Understand “' + w + '”'; }, tryAgain: 'Try again',
      win: 'You did it!', okBack: 'Good. You can go back now', seeLearned: 'See what you learned', backTo: function (t) { return 'Back to “' + t + '”'; },
      explainNote: 'You have been through this word before (or the path is already very deep), so here is the explanation and we move on.', cont: 'Continue',
      doneT: function (t) { return 'You completed “' + t + '”'; }, doneS: function (r, d, c) { return r + ' attempts · up to ' + d + ' levels deep · ' + c + ' concepts'; }, recap: 'What you reviewed along the way:', again: 'Study another topic', harder: 'Same topic, harder', partOf: function (k, n) { return 'Part ' + k + ' of ' + n; }, partWin: function (k, n) { return 'Part ' + k + ' of ' + n + ' done!'; }, nextPart: function (k, n) { return 'Go on to part ' + k + ' of ' + n; }, lastPart: function (n) { return 'Final part (' + n + ' of ' + n + ')'; }, loadO: function (t) { return 'Building the outline for “' + t + '”…'; },
      myTopics: 'Your topics', contT: 'Continue', viewT: 'See what you learned', delT: 'Remove', sureT: 'Remove?', doneTag: 'Completed', progT: function (k, n) { return 'Part ' + k + ' of ' + n; },
      minorNote: function (t) { return 'This word is not key to “' + t + '”, so I just explain it and we move on.'; }, minorSeen: 'Moving on: those words are not key to the topic, and you have seen what they mean.', blankWord: 'blank', listen: 'Listen', listenText: 'Listen to the text', listenWord: 'Listen to the word', slow: 'Slow', noVoice: 'No voice available in this browser.', curK: 'Curious fact', untK: 'Little-told story' },
    de: { name: 'Tiefer lernen', lv: { beginner: ['Anfänger', '10 Teile · 1–2 Lücken'], intermediate: ['Mittel', '25 Teile · 3 Lücken'], advanced: ['Fortgeschritten', '65 Teile · 4–5 Lücken'] },
      intro: 'Gib ein Thema ein oder bring deinen eigenen Text mit (Link, PDF oder eingefügter Text). Du bekommst Ausschnitte mit Lücken, aus deinem Text, wenn du einen hast. Jedes Wort, das du nicht weißt, wird zur nächsten Frage – erst wenn du es richtig hast, geht es zur vorherigen zurück. Zwischen den Fragen tauchen Kuriositäten und wenig erzählte Geschichten zum Thema auf, wenn es welche gibt.', ph: 'Zum Beispiel: Photosynthese', topicAria: 'Thema, das du lernen möchtest', levelAria: 'Niveau', go: 'Los', resume: function (t) { return 'Weiter mit „' + t + '“'; },
      map: 'Dein Weg', depth: function (d, m) { return 'Tiefe ' + d + ' von ' + m; }, up: function (d) { return ' · ' + (d - 1) + (d === 2 ? ' Ebene' : ' Ebenen') + ' nach oben, um zum Thema zurückzukehren'; }, atTopic: ' · du bist beim Thema', stat: function (a, b) { return a + ' gelöst · ' + b + ' offen (ohne das Thema)'; },
      learned: function (n) { return 'Das hast du gelernt (' + n + ')'; }, loadQ: function (t) { return 'Frage zu „' + t + '“ wird vorbereitet …'; }, loadV: function (t) { return 'Andere Version von „' + t + '“ wird vorbereitet …'; },
      failT: 'Die Frage konnte nicht erstellt werden', failB: 'Das passiert. Versuch es noch einmal; dein Fortschritt ist gespeichert.', retry: 'Noch einmal',
      why: function (w, p) { return '„' + w + '“ fehlte dir in der Frage zu „' + p + '“. Diese kommt zuerst.'; }, blankAria: function (n) { return 'Lücke ' + n; }, check: 'Prüfen',
      almost: 'Fast: sehen wir, was fehlt', missed: function (n) { return n + (n === 1 ? ' Wort fehlte' : ' Wörter fehlten'); },
      nowAbout: function (w, more) { return 'Jetzt eine Frage zu „' + w + '“' + (more > 0 ? '. Danach noch ' + more + ' weitere, dann kommst du hierher zurück.' : ', danach kommst du hierher zurück.'); }, seen: 'Weiter: diese Wörter hast du schon gesehen.', understand: function (w) { return '„' + w + '“ verstehen'; }, tryAgain: 'Noch einmal versuchen',
      win: 'Geschafft!', okBack: 'Gut. Du kannst zurück', seeLearned: 'Gelerntes ansehen', backTo: function (t) { return 'Zurück zu „' + t + '“'; },
      explainNote: 'Dieses Wort hattest du schon (oder der Weg ist schon sehr tief), deshalb erkläre ich es hier und wir machen weiter.', cont: 'Weiter',
      doneT: function (t) { return '„' + t + '“ abgeschlossen'; }, doneS: function (r, d, c) { return r + ' Versuche · bis zu ' + d + ' Ebenen tief · ' + c + ' Begriffe'; }, recap: 'Das hast du unterwegs wiederholt:', again: 'Anderes Thema lernen', harder: 'Gleiches Thema, schwerer', partOf: function (k, n) { return 'Teil ' + k + ' von ' + n; }, partWin: function (k, n) { return 'Teil ' + k + ' von ' + n + ' geschafft!'; }, nextPart: function (k, n) { return 'Weiter mit Teil ' + k + ' von ' + n; }, lastPart: function (n) { return 'Letzter Teil (' + n + ' von ' + n + ')'; }, loadO: function (t) { return 'Gliederung für „' + t + '“ wird erstellt …'; },
      myTopics: 'Deine Themen', contT: 'Weiter', viewT: 'Gelerntes ansehen', delT: 'Entfernen', sureT: 'Entfernen?', doneTag: 'Abgeschlossen', progT: function (k, n) { return 'Teil ' + k + ' von ' + n; },
      minorNote: function (t) { return 'Dieses Wort ist für „' + t + '“ nicht wichtig, deshalb erkläre ich es nur und wir machen weiter.'; }, minorSeen: 'Weiter: diese Wörter sind für das Thema nicht wichtig, ihre Bedeutung hast du gesehen.', blankWord: 'Lücke', listen: 'Anhören', listenText: 'Text anhören', listenWord: 'Wort anhören', slow: 'Langsam', noVoice: 'In diesem Browser ist keine Stimme verfügbar.', curK: 'Kuriosität', untK: 'Wenig erzählte Geschichte' },
    fr: { name: 'Approfondis', lv: { beginner: ['Débutant', '10 parties · 1–2 blancs'], intermediate: ['Intermédiaire', '25 parties · 3 blancs'], advanced: ['Avancé', '65 parties · 4–5 blancs'] },
      intro: 'Écris un sujet ou apporte ton propre texte (lien, PDF ou texte collé). Tu reçois des extraits à trous, tirés de ton texte quand tu en as un. Chaque mot que tu rates devient la question suivante, et ce n’est qu’en le réussissant que tu reviens à la précédente. Entre les questions se glissent des curiosités et des histoires peu racontées sur le sujet, quand il y en a.', ph: 'Par exemple : photosynthèse', topicAria: 'Sujet que tu veux étudier', levelAria: 'Niveau', go: 'Commencer', resume: function (t) { return 'Continuer avec « ' + t + ' »'; },
      map: 'Ton parcours', depth: function (d, m) { return 'Profondeur ' + d + ' sur ' + m; }, up: function (d) { return ' · il faut remonter de ' + (d - 1) + (d === 2 ? ' niveau' : ' niveaux') + ' pour revenir au sujet'; }, atTopic: ' · tu es au sujet', stat: function (a, b) { return a + ' résolus · ' + b + ' à résoudre (sans compter le sujet)'; },
      learned: function (n) { return 'Ce que tu as appris (' + n + ')'; }, loadQ: function (t) { return 'Préparation de la question sur « ' + t + ' »…'; }, loadV: function (t) { return 'Préparation d’une autre version de « ' + t + ' »…'; },
      failT: 'Impossible de préparer la question', failB: 'Ça arrive. Réessaie ; ta progression est enregistrée.', retry: 'Réessayer',
      why: function (w, p) { return 'Tu n’as pas pu placer « ' + w + ' » dans la question sur « ' + p + ' ». Celle-ci d’abord.'; }, blankAria: function (n) { return 'Blanc ' + n; }, check: 'Vérifier',
      almost: 'Presque : voyons ce qui manque', missed: function (n) { return 'Il te manquait ' + n + (n === 1 ? ' mot' : ' mots'); },
      nowAbout: function (w, more) { return 'Maintenant une question sur « ' + w + ' »' + (more > 0 ? '. Ensuite ' + more + ' de plus, puis tu reviendras à celle-ci.' : ', puis tu reviendras à celle-ci.'); }, seen: 'On continue : tu as déjà vu ces mots.', understand: function (w) { return 'Comprendre « ' + w + ' »'; }, tryAgain: 'Réessayer',
      win: 'Bravo !', okBack: 'Bien. Tu peux revenir', seeLearned: 'Voir ce que tu as appris', backTo: function (t) { return 'Retour à « ' + t + ' »'; },
      explainNote: 'Tu es déjà passé par ce mot (ou le parcours est déjà très profond), je l’explique donc ici et on continue.', cont: 'Continuer',
      doneT: function (t) { return '« ' + t + ' » terminé'; }, doneS: function (r, d, c) { return r + ' essais · jusqu’à ' + d + ' niveaux de profondeur · ' + c + ' notions'; }, recap: 'Ce que tu as revu en chemin :', again: 'Étudier un autre sujet', harder: 'Même sujet, plus difficile', partOf: function (k, n) { return 'Partie ' + k + ' sur ' + n; }, partWin: function (k, n) { return 'Partie ' + k + ' sur ' + n + ' terminée !'; }, nextPart: function (k, n) { return 'Passer à la partie ' + k + ' sur ' + n; }, lastPart: function (n) { return 'Partie finale (' + n + ' sur ' + n + ')'; }, loadO: function (t) { return 'Préparation du plan de « ' + t + ' »…'; },
      myTopics: 'Tes sujets', contT: 'Continuer', viewT: 'Voir ce que tu as appris', delT: 'Retirer', sureT: 'Retirer ?', doneTag: 'Terminé', progT: function (k, n) { return 'Partie ' + k + ' sur ' + n; },
      minorNote: function (t) { return 'Ce mot n’est pas essentiel pour « ' + t + ' », je l’explique donc et on continue.'; }, minorSeen: 'On continue : ces mots ne sont pas essentiels pour le sujet, tu as vu ce qu’ils veulent dire.', blankWord: 'blanc', listen: 'Écouter', listenText: 'Écouter le texte', listenWord: 'Écouter le mot', slow: 'Lent', noVoice: 'Aucune voix disponible dans ce navigateur.', curK: 'Curiosité', untK: 'Histoire peu racontée' }
  };

  var IX = {
    es: { tabTopic: 'Tema', tabLink: 'Link', tabFile: 'PDF o archivo', tabText: 'Texto', phLink: 'Pega el link de un artículo o de un PDF', phText: 'Pega aquí tu texto: un capítulo, tus apuntes, un artículo…', pickFile: 'Elegir PDF o archivo de texto', fileHint: 'PDF, TXT o MD. Se lee en tu dispositivo: a la IA solo viajan los fragmentos de cada pregunta.', textHint: 'Las primeras preguntas salen de tu texto, con sus mismas palabras. Las palabras que falles se explican con preguntas nuevas, pensadas desde el contexto de tu texto.', readingP: function (p, n) { return 'Leyendo la página ' + p + ' de ' + n + '…'; }, fetching: 'Leyendo el link…', preparing: 'Preparando tu texto…', errNoText: 'No encontré texto suficiente. Si el PDF es escaneado (solo imágenes) no se puede leer: prueba con otro archivo o pega el texto.', errUrl: 'Ese link no es válido o no se pudo abrir.', errPoco: 'Esa página casi no tiene texto (puede cargarlo con JavaScript o pedir inicio de sesión). Pega el texto o sube el archivo.', errPdfBig: 'Ese PDF es demasiado grande para abrirlo desde el link. Descárgalo y súbelo como archivo.', errPdfLib: 'No pude cargar el lector de PDF. Revisa tu conexión e intenta de nuevo.', errLen: 'Ese texto es muy corto para estudiarlo (unos 300 caracteres como mínimo). Pega más texto o escribe un tema.', fromText: 'Fragmento de tu texto', fromAI: 'Explicación creada por la IA (no estaba en tu texto)', fromCtx: 'Explicación creada por la IA a partir de tu texto', srcName: { link: 'Link', file: 'Archivo', text: 'Texto' }, ok2: 'Aceptar', chosen: function (n) { return n; } },
    en: { tabTopic: 'Topic', tabLink: 'Link', tabFile: 'PDF or file', tabText: 'Text', phLink: 'Paste the link to an article or a PDF', phText: 'Paste your text here: a chapter, your notes, an article…', pickFile: 'Choose a PDF or text file', fileHint: 'PDF, TXT or MD. It is read on your device: only the fragments of each question go to the AI.', textHint: 'The first questions come from your text, in its own words. Words you miss are explained with new questions, written from your text’s context.', readingP: function (p, n) { return 'Reading page ' + p + ' of ' + n + '…'; }, fetching: 'Reading the link…', preparing: 'Preparing your text…', errNoText: 'I could not find enough text. A scanned PDF (images only) cannot be read: try another file or paste the text.', errUrl: 'That link is not valid or could not be opened.', errPoco: 'That page has almost no text (it may load it with JavaScript or require a login). Paste the text or upload the file.', errPdfBig: 'That PDF is too large to open from the link. Download it and upload it as a file.', errPdfLib: 'I could not load the PDF reader. Check your connection and try again.', errLen: 'That text is too short to study (about 300 characters minimum). Paste more text or type a topic.', fromText: 'Fragment from your text', fromAI: 'Explanation written by the AI (it was not in your text)', fromCtx: 'Explanation written by the AI based on your text', srcName: { link: 'Link', file: 'File', text: 'Text' } },
    de: { tabTopic: 'Thema', tabLink: 'Link', tabFile: 'PDF oder Datei', tabText: 'Text', phLink: 'Link zu einem Artikel oder PDF einfügen', phText: 'Füge hier deinen Text ein: ein Kapitel, deine Notizen, einen Artikel …', pickFile: 'PDF oder Textdatei wählen', fileHint: 'PDF, TXT oder MD. Wird auf deinem Gerät gelesen: Nur die Ausschnitte jeder Frage gehen an die KI.', textHint: 'Die ersten Fragen stammen aus deinem Text, mit seinen eigenen Worten. Wörter, die du verfehlst, werden mit neuen Fragen erklärt, aus dem Kontext deines Textes.', readingP: function (p, n) { return 'Seite ' + p + ' von ' + n + ' wird gelesen …'; }, fetching: 'Link wird gelesen …', preparing: 'Dein Text wird vorbereitet …', errNoText: 'Ich habe nicht genug Text gefunden. Ein gescanntes PDF (nur Bilder) kann nicht gelesen werden: Versuche eine andere Datei oder füge den Text ein.', errUrl: 'Dieser Link ist ungültig oder konnte nicht geöffnet werden.', errPoco: 'Diese Seite hat fast keinen Text (er wird evtl. per JavaScript geladen oder erfordert eine Anmeldung). Füge den Text ein oder lade die Datei hoch.', errPdfBig: 'Dieses PDF ist zu groß, um es über den Link zu öffnen. Lade es herunter und als Datei hoch.', errPdfLib: 'Der PDF-Leser konnte nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.', errLen: 'Dieser Text ist zu kurz zum Lernen (mindestens etwa 300 Zeichen). Füge mehr Text ein oder gib ein Thema ein.', fromText: 'Ausschnitt aus deinem Text', fromAI: 'Von der KI geschriebene Erklärung (stand nicht in deinem Text)', fromCtx: 'Von der KI auf Basis deines Textes geschriebene Erklärung', srcName: { link: 'Link', file: 'Datei', text: 'Text' } },
    fr: { tabTopic: 'Sujet', tabLink: 'Lien', tabFile: 'PDF ou fichier', tabText: 'Texte', phLink: 'Colle le lien d’un article ou d’un PDF', phText: 'Colle ici ton texte : un chapitre, tes notes, un article…', pickFile: 'Choisir un PDF ou un fichier texte', fileHint: 'PDF, TXT ou MD. Lu sur ton appareil : seuls les extraits de chaque question vont à l’IA.', textHint: 'Les premières questions viennent de ton texte, avec ses propres mots. Les mots ratés sont expliqués par de nouvelles questions, écrites à partir du contexte de ton texte.', readingP: function (p, n) { return 'Lecture de la page ' + p + ' sur ' + n + '…'; }, fetching: 'Lecture du lien…', preparing: 'Préparation de ton texte…', errNoText: 'Je n’ai pas trouvé assez de texte. Un PDF scanné (images seulement) ne peut pas être lu : essaie un autre fichier ou colle le texte.', errUrl: 'Ce lien n’est pas valide ou n’a pas pu être ouvert.', errPoco: 'Cette page contient presque pas de texte (elle le charge peut-être en JavaScript ou demande une connexion). Colle le texte ou téléverse le fichier.', errPdfBig: 'Ce PDF est trop gros pour être ouvert depuis le lien. Télécharge-le et téléverse-le comme fichier.', errPdfLib: 'Impossible de charger le lecteur PDF. Vérifie ta connexion et réessaie.', errLen: 'Ce texte est trop court pour être étudié (environ 300 caractères minimum). Colle plus de texte ou écris un sujet.', fromText: 'Extrait de ton texte', fromAI: 'Explication écrite par l’IA (elle ne figurait pas dans ton texte)', fromCtx: 'Explication écrite par l’IA à partir de ton texte', srcName: { link: 'Lien', file: 'Fichier', text: 'Texte' } }
  };
  var T;
  if (LEARN) {
    T = {}; Object.keys(I.es).forEach(function (k) { T[k] = I.es[k]; }); Object.keys(IX.es).forEach(function (k) { T[k] = IX.es[k]; });
    var TN = { en: 'inglés', de: 'alemán', fr: 'francés' }[LANG];
    T.name = 'Profundiza idiomas'; T.langName = TN;
    T.lv = { beginner: ['Principiante', 'A1–A2 · 10 partes · 1–2 espacios'], intermediate: ['Intermedio', 'B1 · 25 partes · 3 espacios'], advanced: ['Avanzado', 'B2–C1 · 65 partes · 4–5 espacios'] };
    T.intro = 'Aprende ' + TN + ' con textos reales sobre cualquier tema. Escribe un tema (en español está bien): el texto con espacios en blanco sale en ' + TN + ', y debajo siempre lo tienes completo en español para ver qué palabra va con cuál. Cada palabra que falles se vuelve una pregunta nueva, también en ' + TN + ', con su traducción. Todo se puede escuchar y trae guía de pronunciación.';
    T.ph = 'Por ejemplo: la Revolución Francesa'; T.topicAria = 'Tema que quieres practicar'; T.go = 'Empezar';
    T.listen = 'Escuchar'; T.listenText = 'Escuchar el texto'; T.listenWord = 'Escuchar la palabra'; T.slow = 'Lento'; T.noVoice = 'No hay voz disponible en este navegador.';
    T.inEs = 'En español'; T.pronT = 'Cómo se pronuncia'; T.pickLang = 'Idioma que quieres aprender';
  } else { T = I[LANG]; Object.keys(IX[LANG]).forEach(function (k) { T[k] = IX[LANG][k]; }); }
  var KEY = 'prf_state_v2_' + (LEARN ? 'i_' : '') + LANG, ANON = (function () { try { var a = localStorage.getItem('prf_anon'); if (!a) { a = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('prf_anon', a); } return a; } catch (e) { return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); } })();
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
  function track(ev, md) { try { md = md || {}; md.lang = LANG; if (LEARN) md.learn = 1; fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'track', anonId: ANON, event: ev, metadata: md }) }).catch(function () {}); } catch (e) {} }
  /* ---------- biblioteca: TODOS los temas de la persona quedan guardados en este dispositivo ---------- */
  var LIB = 'prf_lib_v3_' + (LEARN ? 'i_' : '') + LANG;
  function libAll() { var a = []; try { a = JSON.parse(localStorage.getItem(LIB) || '[]'); } catch (e) {} return Array.isArray(a) ? a.filter(function (x) { return x && x.id && x.topic; }) : []; }
  function libPut(list) { try { localStorage.setItem(LIB, JSON.stringify(list)); return true; } catch (e) { return false; } }
  function save() {
    if (!S) return; S.updated = Date.now(); var list = libAll().filter(function (x) { return x.id !== S.id; }); list.unshift(S);
    if (!libPut(list)) { list.forEach(function (x) { if (x.status === 'done') { x.stack = []; x.nodes = []; } }); libPut(list); }   // sin espacio: se aligeran los temas terminados (se conserva lo aprendido)
  }
  function libDel(id) { var all = libAll(), it = all.filter(function (x) { return x.id === id; })[0], rest = all.filter(function (x) { return x.id !== id; }); libPut(rest); if (it && it.src && window.PRF_SRC && !rest.some(function (x) { return x.src && x.src.id === it.src.id; })) window.PRF_SRC.del(it.src.id); }
  function newId() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  (function migrate() {   // el tema que estaba a medias en la versión anterior pasa a la biblioteca
    try { var old = JSON.parse(localStorage.getItem(KEY) || 'null'); if (old && old.stack && old.stack.length) { old.id = newId(); old.parts = old.parts || [old.topic]; old.part = old.part || 0; old.status = 'active'; var list = libAll(); list.unshift(old); libPut(list); } localStorage.removeItem(KEY); } catch (e) {}
  })();

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
  function trans(f, res) {   // el texto COMPLETO en español, sin espacios; las palabras de cada hueco van marcadas con su número
    if (!LEARN || !f.cloze.translation) return null;
    var box = el('div', 'trans'); box.appendChild(el('b', 'tl', T.inEs)); var p = el('p');
    f.cloze.translation.split(/(\{\{\d+:[^{}]*\}\})/).forEach(function (part) {
      var m = part.match(/^\{\{(\d+):([^{}]*)\}\}$/); if (!m) { p.appendChild(document.createTextNode(part)); return; }
      var r = res && res.filter(function (x) { return x.b.n === Number(m[1]); })[0], k = el('mark', r ? (r.right ? 'ok' : 'bad') : '', m[2]); k.appendChild(el('sup', null, m[1])); p.appendChild(k);
    }); box.appendChild(p); return box;
  }
  function pronBox(f, withText) {
    if (!LEARN || !f.cloze.termPron) return null;
    var d = el('details', 'pron'), sm = el('summary', null, '🗣 ' + T.pronT); d.appendChild(sm);
    d.appendChild(el('p', null, f.term + ' → ' + f.cloze.termPron + (f.cloze.termEs ? '  (' + f.cloze.termEs + ')' : '')));
    if (withText && f.cloze.textPron) d.appendChild(el('p', null, f.cloze.textPron)); return d;
  }
  function tx(t) { if (!LEARN || !S || !S.es) return t; var e = S.es[norm(t)]; return e && norm(e) !== norm(t) ? t + ' (' + e + ')' : t; }   // el título va con su traducción al español
  function setEs(t, e) { if (!LEARN || !S || !t || !e) return; S.es = S.es || {}; if (!S.es[norm(t)]) S.es[norm(t)] = e; }
  function pronOf(b) { return b && b.pron ? ' /' + b.pron + '/' : ''; }
  function ttsBar(getText) {
    if (!TTS) return null; var bar = el('div', 'ttsbar'), b = el('button', 'spk', '🔊 ' + T.listenText); b.type = 'button'; b.onclick = function () { speak(getText(), b); }; bar.appendChild(b);
    var sl = el('button', 'spk' + (slow ? ' on' : ''), '🐢 ' + T.slow); sl.type = 'button'; sl.setAttribute('aria-pressed', slow ? 'true' : 'false'); sl.onclick = function () { slow = !slow; try { localStorage.setItem('prf_slow', slow ? '1' : '0'); } catch (e) {} sl.classList.toggle('on', slow); sl.setAttribute('aria-pressed', slow ? 'true' : 'false'); }; bar.appendChild(sl); return bar;
  }

  function kindOf(k) { var v = (S.kinds || [])[k == null ? S.part : k]; return v === 'untold' || v === 'curiosity' ? v : ''; }
  function aiCloze(term, parent, variant, avoid, k0, ctx) {
    return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cloze', anonId: ANON, lang: LANG, term: term, topic: S.topic, parent: parent || '', level: S.level, variant: variant || 0, avoid: avoid || [], partK: parent ? 0 : k0 + 1, partN: parent ? 0 : S.parts.length, kind: parent ? '' : kindOf(k0), context: ctx || '', learn: LEARN }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'http'); return j; }); });
  }
  function getCloze(term, parent, variant, avoid) {
    var k0 = S.part, key = norm(term) + '|' + S.level + '|' + (variant || 0) + '|' + (parent ? '' : 'p' + k0) + (S.src ? '|' + S.id : '');
    if (cache[key]) return cache[key];
    var ai = function () { return aiCloze(term, parent, variant, avoid, k0); }, p;
    if (S.src && !parent) p = srcPart(k0, variant).then(function (r) { return r === 'nosrc' ? ai() : r; });
    else if (S.src && parent) p = ctxFor(term).then(function (ctx) { return aiCloze(term, parent, variant, avoid, k0, ctx).then(function (c) { if (ctx) c.from = 'ctx'; return c; }); });
    else p = ai();
    p = p.then(function (c) { if (c && !c.skip && !c.from) c.from = 'ai'; return c; }, function (e) { delete cache[key]; throw e; });
    cache[key] = p; return p;
  }

  /* ---------- pantallas ---------- */
  function node(term, parentId) { var n = { id: S.nodes.length, term: term, parentId: parentId, status: 'pending', part: S.part }; S.nodes.push(n); return n; }
  function setStatus(id, st) { if (S.nodes[id]) S.nodes[id].status = st; }
  function renderPile() {
    pile.textContent = '';
    document.body.classList.toggle('start', !S || !S.nodes.length); if (!S || !S.nodes.length) { pile.classList.remove('on'); learnEl.classList.remove('on'); return; }
    pile.classList.add('on'); pile.appendChild(el('h3', null, T.map));
    if (S.parts && S.parts.length > 1) { var pg = el('div', 'parts'), pb = el('div', 'pbar'), pi = el('i'); pi.style.width = Math.round(S.part / S.parts.length * 100) + '%'; pb.appendChild(pi); pg.appendChild(el('b', null, S.part === S.parts.length - 1 ? T.lastPart(S.parts.length) : T.partOf(S.part + 1, S.parts.length))); pg.appendChild(pb); pile.appendChild(pg); }
    var depth = S.stack.length, top = Math.max(MAX_DEPTH, depth), g = el('div', 'gauge'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', T.depth(depth, top));   // top: recorridos guardados antes del límite de 4 pueden ir más hondo
    for (var i = 1; i <= top; i++) g.appendChild(el('i', i <= depth ? 'on' : ''));
    pile.appendChild(g); pile.appendChild(el('div', 'gl', T.depth(depth, top) + (depth > 1 ? T.up(depth) : T.atTopic)));
    var tree = el('div', 'tree'); (function walk(pid, lvl) { S.nodes.forEach(function (n) { if (n.parentId !== pid || (n.part || 0) !== S.part) return; var st = n.status === 'active' && S.stack.length && S.stack[S.stack.length - 1].nodeId !== n.id ? 'wait' : n.status, r = el('div', 'tn ' + st); r.style.paddingLeft = (lvl * 14) + 'px'; r.appendChild(el('span', 'mk', st === 'done' ? '✓' : st === 'active' ? '●' : st === 'wait' ? '◐' : '○')); r.appendChild(document.createTextNode(tx(n.term))); tree.appendChild(r); walk(n.id, lvl + 1); }); })(null, 0);
    pile.appendChild(tree);
    var cur = S.nodes.filter(function (n) { return (n.part || 0) === S.part; }), done = cur.filter(function (n) { return n.status === 'done'; }).length, pend = cur.filter(function (n) { return n.status !== 'done'; }).length - 1;
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
    if (S.parts && S.parts.length > 1) parent.appendChild(el('p', 'ptag', (S.part === S.parts.length - 1 ? T.lastPart(S.parts.length) : T.partOf(S.part + 1, S.parts.length)) + ' · ' + tx(S.topic)));
    if (S.stack.length === 1 && kindOf()) parent.appendChild(el('p', 'ktag ' + kindOf(), kindOf() === 'untold' ? '📜 ' + T.untK : '💡 ' + T.curK));
    var c = el('p', 'crumb'); S.stack.forEach(function (f, i) { if (i) c.appendChild(document.createTextNode(' › ')); var last = i === S.stack.length - 1, b = last ? el('b', null, tx(f.term)) : document.createTextNode(tx(f.term)); c.appendChild(b); if (last && TTS) c.appendChild(spk(f.term, T.listenWord)); }); parent.appendChild(c);
  }
  function loading(msg) { stopSpeech(); main.textContent = ''; var p = el('p', 'muted'); p.appendChild(el('span', 'spin')); p.appendChild(document.createTextNode(msg)); main.appendChild(p); }
  function fail(retry) {
    main.textContent = ''; main.appendChild(el('h2', null, T.failT)); main.appendChild(el('p', 'muted', T.failB));
    var b = el('button', 'btn', T.retry); b.onclick = retry; main.appendChild(b); track('prf_error', {});
  }
  function langs() {
    if (LEARN) {
      var w = el('div', 'tpick'); w.setAttribute('role', 'group'); w.setAttribute('aria-label', T.pickLang); w.appendChild(el('span', null, T.pickLang + ':'));
      [['de', 'Deutsch · Alemán'], ['en', 'English · Inglés'], ['fr', 'Français · Francés']].forEach(function (x) {
        var b = el('button', 'tp', x[1]); b.type = 'button'; b.setAttribute('aria-pressed', x[0] === LANG ? 'true' : 'false');
        b.onclick = function () { if (x[0] === LANG) return; try { localStorage.setItem('prf_target', x[0]); } catch (e) {} location.reload(); }; w.appendChild(b);
      }); return w;
    }
    var d = el('p', 'langs'), L = [['es', 'Español', '/profundiza/'], ['en', 'English', '/profundiza/en/'], ['de', 'Deutsch', '/profundiza/de/'], ['fr', 'Français', '/profundiza/fr/'], ['', 'Aprender idiomas', '/profundiza/idiomas/']];
    L.forEach(function (x) { var a = el('a', null, x[1]); a.href = x[2]; if (x[0] === LANG) a.setAttribute('aria-current', 'page'); d.appendChild(a); }); return d;
  }

  function start(opt) {
    opt = opt || {}; stopSpeech(); S = null; document.body.classList.remove('fin'); renderPile(); main.textContent = '';
    var hero = el('div', 'hero'), form = el('div', 'formcard'); hero.appendChild(el('h1', null, T.name));
    hero.appendChild(el('p', null, T.intro)); hero.appendChild(langs());
    var mode = opt.mode || 'topic', file = null, tabs = el('div', 'tabs'), panels = {};
    tabs.setAttribute('role', 'tablist');
    [['topic', T.tabTopic], ['link', T.tabLink], ['file', T.tabFile], ['text', T.tabText]].filter(function (m) { return !LEARN || m[0] === 'topic'; }).forEach(function (m) { var b = el('button', 'tab', m[1]); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.m = m[0]; b.onclick = function () { setMode(m[0]); }; tabs.appendChild(b); });
    if (!LEARN) form.appendChild(tabs);
    var inp = el('input', 'field'); inp.type = 'text'; inp.placeholder = T.ph; inp.maxLength = 80; inp.setAttribute('aria-label', T.topicAria);
    var url = el('input', 'field'); url.type = 'url'; url.placeholder = T.phLink; url.maxLength = 600; url.setAttribute('aria-label', T.tabLink); url.autocomplete = 'off';
    var fbox = el('div', 'filebox'), pick = el('button', 'btn ghost', '📄 ' + T.pickFile), fname = el('span', 'fname'), fin = el('input'); pick.type = 'button'; fin.type = 'file'; fin.accept = '.pdf,.txt,.md,application/pdf,text/plain'; fin.className = 'hide';
    var setFile = function (f) { file = f || null; fname.textContent = file ? file.name + ' · ' + Math.max(1, Math.round(file.size / 1024)) + ' KB' : ''; fbox.classList.toggle('has', !!file); };
    pick.onclick = function () { fin.click(); }; fin.onchange = function () { setFile(fin.files[0]); };
    ['dragover', 'dragenter'].forEach(function (ev) { fbox.addEventListener(ev, function (e) { e.preventDefault(); fbox.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { fbox.addEventListener(ev, function (e) { e.preventDefault(); fbox.classList.remove('drag'); }); });
    fbox.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setFile(f); });
    fbox.appendChild(pick); fbox.appendChild(fname); fbox.appendChild(fin);
    var ta = el('textarea', 'field area'); ta.placeholder = T.phText; ta.setAttribute('aria-label', T.tabText); ta.rows = 7;
    var hint = el('p', 'muted small hint');
    panels.topic = [inp]; panels.link = [url]; panels.file = [fbox]; panels.text = [ta];
    var holder = el('div', 'panel'); form.appendChild(holder); form.appendChild(hint);
    var err = el('p', 'err hide'); form.appendChild(err);
    var lvl = 'beginner', box = el('div', 'lvs'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', T.levelAria);
    Object.keys(T.lv).forEach(function (k) { var b = el('button', 'lv'); b.type = 'button'; b.setAttribute('aria-pressed', k === lvl ? 'true' : 'false'); b.appendChild(el('b', null, T.lv[k][0])); b.appendChild(el('span', null, T.lv[k][1])); b.onclick = function () { lvl = k; [].forEach.call(box.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }; box.appendChild(b); });
    form.appendChild(box);
    var go = el('button', 'btn', T.go); go.type = 'button'; form.appendChild(go); main.appendChild(hero); main.appendChild(form);
    function showErr(m) { err.textContent = m || ''; err.classList.toggle('hide', !m); }
    function setMode(m) {
      mode = m; showErr(''); holder.textContent = ''; panels[m].forEach(function (n) { holder.appendChild(n); });
      [].forEach.call(tabs.children, function (t) { var on = t.dataset.m === m; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.classList.toggle('on', on); });
      hint.textContent = m === 'file' ? T.fileHint : m === 'text' || m === 'link' ? T.textHint : '';
      var f = panels[m][0]; if (f.focus && m !== 'file') f.focus();
    }
    setMode(mode); if (opt.err) showErr(opt.err);
    library();
    var run = function () {
      showErr('');
      if (mode === 'topic') { var t = inp.value.trim(); if (t.length < 2) { inp.focus(); return; } track('prf_start', { level: lvl }); begin(t, lvl); return; }
      if (mode === 'link') { var u = url.value.trim(); if (u && !/^https?:\/\//i.test(u) && u.indexOf('.') > 0) u = 'https://' + u; if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(u)) { showErr(T.errUrl); url.focus(); return; } track('prf_start', { level: lvl, src: 'link' }); fromLink(u, lvl); return; }
      if (mode === 'file') { if (!file) { fin.click(); return; } track('prf_start', { level: lvl, src: 'file' }); fromFile(file, lvl); return; }
      var tx = ta.value.trim(); if (tx.length < 300) { showErr(T.errLen); ta.focus(); return; } track('prf_start', { level: lvl, src: 'text' }); beginSource({ title: '', text: tx, kind: 'text' }, lvl);
    };
    go.onclick = run; inp.onkeydown = function (e) { if (e.key === 'Enter') run(); }; url.onkeydown = function (e) { if (e.key === 'Enter') run(); };
  }

  function library() {
    var list = libAll(); if (!list.length) return;
    var box = el('div', 'lib'); box.appendChild(el('h3', null, T.myTopics));
    list.forEach(function (x) {
      var row = el('div', 'libitem'), info = el('div', 'li-info'), n = (x.parts || [x.topic]).length;
      info.appendChild(el('b', null, (x.src ? '📄 ' : '') + x.topic));
      info.appendChild(el('span', null, (T.lv[x.level] ? T.lv[x.level][0] : '') + ' · ' + (x.status === 'done' ? T.doneTag : T.progT((x.part || 0) + 1, n))));
      if (x.status !== 'done' && n > 1) { var pb = el('div', 'pbar'), pi = el('i'); pi.style.width = Math.round((x.part || 0) / n * 100) + '%'; pb.appendChild(pi); info.appendChild(pb); }
      row.appendChild(info);
      var act = el('div', 'li-act'), go = el('button', 'btn small', x.status === 'done' ? T.viewT : T.contT); go.type = 'button';
      go.onclick = function () { S = x; S.parts = S.parts || [S.topic]; S.part = S.part || 0; track('prf_resumed', { done: x.status === 'done' }); if (x.status === 'done') done(true); else if (S.stack.length) next(); else pushFrame(S.parts[S.part], '', null); };
      var del = el('button', 'btn ghost small', T.delT); del.type = 'button';
      del.onclick = function () { if (del.dataset.sure) { libDel(x.id); start(); return; } del.dataset.sure = '1'; del.textContent = T.sureT; setTimeout(function () { delete del.dataset.sure; del.textContent = T.delT; }, 3000); };
      act.appendChild(go); act.appendChild(del); row.appendChild(act); box.appendChild(row);
    });
    main.appendChild(box);
  }
  function begin(t, lvl) {
    loading(T.loadO(t));
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'outline', anonId: ANON, lang: LANG, topic: t, level: lvl, learn: LEARN }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.parts || !j.parts.length) throw new Error(j.error || 'http'); return j; }); })
      .then(function (o) {
        S = { id: newId(), topic: o.topic || t, level: lvl, parts: o.parts, kinds: o.kinds || [], part: 0, status: 'active', created: Date.now(), stack: [], nodes: [], taught: {}, learned: [], rounds: 0, maxDepth: 1 };
        if (LEARN) { setEs(S.topic, o.topicEs); (o.partsEs || []).forEach(function (e, i) { setEs(S.parts[i], e); }); } track('prf_outline', { level: lvl, parts: o.parts.length }); save(); pushFrame(S.parts[0], '', null);
      }).catch(function () { fail(function () { begin(t, lvl); }); });
  }


  /* ---------- fuentes propias (link, PDF, archivo, texto) ---------- */
  var SRC = null;
  function srcErr(code) { return code === 'url' ? T.errUrl : code === 'poco_texto' ? T.errPoco : code === 'pdf_grande' ? T.errPdfBig : code === 'pdflib' ? T.errPdfLib : T.errNoText; }
  function fromLink(u, lvl) {
    loading(T.fetching);
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetchurl', anonId: ANON, url: u }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'http'); throw e; } return j; }); })
      .then(function (j) {
        if (j.pdf) return window.PRF_SRC.readBase64Pdf(j.pdf, function (p, n) { loading(T.readingP(p, n)); }, j.title).then(function (r) { return { title: r.title || j.title, text: r.text, kind: 'link' }; });
        return { title: j.title, text: j.text, kind: 'link' };
      })
      .then(function (info) { if (!info.text || info.text.length < 300) throw new Error('no_text'); beginSource(info, lvl); })
      .catch(function (e) { track('prf_error', { where: 'link' }); start({ mode: 'link', err: srcErr(e.message) }); });
  }
  function fromFile(f, lvl) {
    loading(T.preparing);
    window.PRF_SRC.readFile(f, function (p, n) { loading(T.readingP(p, n)); })
      .then(function (r) { if (!r.text || r.text.length < 300) throw new Error('no_text'); beginSource({ title: r.title, text: r.text, kind: 'file' }, lvl); })
      .catch(function (e) { track('prf_error', { where: 'file' }); start({ mode: 'file', err: srcErr(e.message) }); });
  }
  function beginSource(info, lvl) {
    loading(T.preparing);
    setTimeout(function () {   // deja pintar la pantalla antes del trabajo pesado
      var chunks = window.PRF_SRC.chunk(info.text);
      if (!chunks.length) { start({ mode: info.kind === 'text' ? 'text' : 'topic', err: T.errNoText }); return; }
      var sid = 's' + newId(); window.PRF_SRC.save(sid, chunks);
      startFromChunks(chunks, (info.title || '').slice(0, 80), info.kind, lvl, sid, info.text.length);
    }, 30);
  }
  function startFromChunks(chunks, title, kind, lvl, sid, chars) {
    var P = PARTS[lvl], pl = window.PRF_SRC.plan(chunks, P);
    if (!pl.length) { start({ err: T.errNoText }); return; }
    SRC = { id: sid, chunks: chunks, idx: window.PRF_SRC.makeIndex(chunks) };
    var base = { id: newId(), topic: title || window.PRF_SRC.title(chunks[0]), level: lvl, parts: pl.map(function (x) { return x.label; }), kinds: [], plan: pl, src: { auto: !title || kind === 'file', id: sid, kind: kind, chars: chars || chunks.join(' ').length, chunks: chunks.length }, part: 0, status: 'active', created: Date.now(), stack: [], nodes: [], taught: {}, learned: [], rounds: 0, maxDepth: 1, usedSrc: {} };
    var go = function () { S = base; track('prf_src_start', { kind: kind, level: lvl, chunks: chunks.length, parts: S.parts.length }); save(); pushFrame(S.parts[0], '', null); };
    if (pl.length < P && lvl === 'advanced') {   // texto corto en nivel avanzado: la IA amplía con partes complementarias (marcadas como suyas)
      loading(T.loadO(base.topic));
      fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'outline', anonId: ANON, lang: LANG, topic: base.topic, level: lvl, count: P - pl.length, context: chunks.slice(0, 2).join(' ').slice(0, 600) }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.parts || !j.parts.length) throw new Error('x'); return j; }); })
        .then(function (o) { base.parts = base.parts.concat(o.parts); base.kinds = base.parts.map(function (_, i) { return i < pl.length ? '' : (o.kinds || [])[i - pl.length] || ''; }); }).catch(function () {}).then(go);
    } else go();
  }
  function ensureSrc() {
    if (!S || !S.src) return Promise.resolve(null);
    if (SRC && SRC.id === S.src.id) return Promise.resolve(SRC);
    var id = S.src.id;
    return window.PRF_SRC.load(id).then(function (ch) { if (!ch) return null; SRC = { id: id, chunks: ch, idx: window.PRF_SRC.makeIndex(ch) }; return SRC; });
  }
  function postSrc(body) {
    body.action = 'srccloze'; body.anonId = ANON; body.lang = LANG; body.topic = S.topic; body.level = S.level;
    return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'http'); return j; }); });
  }
  function srcPart(k, variant) {   // una parte del documento: la IA elige un pasaje de los fragmentos candidatos (el pasaje sale tal cual del texto)
    return ensureSrc().then(function (src) {
      var pl = S.plan && S.plan[k]; if (!src || !pl) return 'nosrc';
      var cands = pl.c.slice(variant || 0).map(function (i) { return { i: i, text: src.chunks[i] }; }); if (!cands.length) return 'nosrc';
      var batches = [cands.slice(0, 3), cands.slice(3, 6)].filter(function (b) { return b.length; }), errs = 0;
      function tryB(n) { if (n >= batches.length) return Promise.resolve(null); return postSrc({ mode: 'part', chunks: batches[n] }).then(function (r) { return r && r.text ? r : tryB(n + 1); }, function () { errs++; return tryB(n + 1); }); }
      return tryB(0).then(function (r) { if (r) { track('prf_src_ok', {}); if (S.src.auto && r.topic) { S.topic = r.topic; S.src.auto = false; } return r; } if (errs === batches.length) throw new Error('src'); track('prf_src_fail', {}); return { skip: true }; });
    });
  }
  function around(text, term, n) {   // recorte del fragmento alrededor de donde aparece el término
    var f = norm(text), at = f.indexOf(norm(term)), t = text; if (text.length <= n) return text;
    var pos = at >= 0 ? Math.min(text.length - 1, Math.round(at / Math.max(1, f.length) * text.length)) : 0, from = Math.max(0, pos - Math.round(n / 2));
    t = text.slice(from, from + n); return (from > 0 ? '…' : '') + t.trim() + (from + n < text.length ? '…' : '');
  }
  function ctxFor(term) {   // contexto para que la IA explique la palabra fallada: el pasaje donde apareció + lo que el texto dice de ella (la pregunta se CREA, no se copia)
    var top = S.stack[S.stack.length - 1], f = top && S.stack.length > 1 && norm(top.term) === norm(term) ? S.stack[S.stack.length - 2] : top;
    var passage = f && f.cloze ? f.cloze.text.replace(/\[\[(\d+)\]\]/g, function (m, n) { var b = f.cloze.blanks.filter(function (x) { return x.n === Number(n); })[0]; return b ? b.answers[0] : ''; }) : '';
    return ensureSrc().then(function (src) {
      var sn = [];
      if (src) { var ex = S.stack.map(function (x) { return x.cloze && x.cloze.src; }).filter(function (x) { return x != null; }); sn = window.PRF_SRC.find(src.idx, term, ex, 2).map(function (c) { return around(c.text, term, 520); }); track(sn.length ? 'prf_src_define' : 'prf_src_define_none', {}); }
      var out = (passage ? 'Pasaje donde apareció la palabra: «' + passage.slice(0, 700) + '». ' : '') + (sn.length ? 'Lo que el texto dice en otros lugares sobre «' + term + '»: ' + sn.map(function (x) { return '«' + x + '»'; }).join(' ') : '');
      return out.trim().slice(0, 2100);
    });
  }

  function pushFrame(term, parent, why, nodeId) {
    loading(T.loadQ(term));
    getCloze(term, parent, 0, []).then(function (c) {
      if (c && c.skip) { if (S.part < S.parts.length - 1) { S.part++; save(); pushFrame(S.parts[S.part], '', null); } else done(); return; }   // esa parte del documento no tenía un pasaje útil
      var shown = (c.term && String(c.term).trim()) || term; if (!parent && S.src && S.plan && S.plan[S.part]) S.parts[S.part] = shown; if (nodeId == null) { nodeId = node(shown, null).id; } else if (S.nodes[nodeId]) S.nodes[nodeId].term = shown;
      setEs(shown, c.termEs); (c.blanks || []).forEach(function (b) { setEs(b.answers[0], b.es); }); setStatus(nodeId, 'active'); S.stack.push({ term: shown, parent: parent || '', nodeId: nodeId, cloze: c, pending: [], tries: 0, why: why || '', seen: [c.text] });
      S.maxDepth = Math.max(S.maxDepth, S.stack.length); save(); ask();
    }).catch(function () { fail(function () { pushFrame(term, parent, why, nodeId); }); });
  }

  function ask() {
    var f = S.stack[S.stack.length - 1]; stopSpeech(); renderPile(); main.textContent = '';
    crumb(main); if (S.src) { var fr = f.cloze.from === 'source' ? 'source' : 'ai'; main.appendChild(el('p', 'srctag ' + fr, fr === 'source' ? '📄 ' + T.fromText : '✨ ' + (f.cloze.from === 'ctx' ? T.fromCtx : T.fromAI))); }
    if (f.why && f.tries === 0) main.appendChild(el('div', 'why', f.why));
    track('prf_cloze_shown', { depth: S.stack.length, tries: f.tries });
    var bar = ttsBar(function () { return f.term + '. ' + plain(f); }); if (bar) main.appendChild(bar);
    var p = el('p', 'cloze'), inputs = [];
    f.cloze.text.split(/(\[\[\d+\]\])/).forEach(function (part) {
      var m = part.match(/^\[\[(\d+)\]\]$/); if (!m) { p.appendChild(document.createTextNode(part)); return; }
      var b = f.cloze.blanks.filter(function (x) { return x.n === Number(m[1]); })[0], i = el('input'); i.type = 'text'; i.autocomplete = 'off'; i.autocapitalize = 'none'; i.spellcheck = false; i.setAttribute('aria-label', T.blankAria(m[1]));
      i.style.width = Math.max(5, (b ? b.answers[0].length : 6) + 2) + 'ch'; i.dataset.n = m[1]; if (LEARN) i.placeholder = m[1]; inputs.push(i); p.appendChild(i);
    });
    main.appendChild(p); var tb = trans(f); if (tb) main.appendChild(tb); var pb0 = pronBox(f, false); if (pb0) main.appendChild(pb0);
    var row = el('div', 'row'), ok = el('button', 'btn', T.check); ok.type = 'button'; row.appendChild(ok); main.appendChild(row);
    inputs.forEach(function (i, k) { i.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (inputs[k + 1]) inputs[k + 1].focus(); else ok.click(); } }; });
    ok.onclick = function () { submit(f, inputs); };
    if (inputs[0]) inputs[0].focus();
  }

  function submit(f, inputs) {
    var res = f.cloze.blanks.map(function (b) { var inp = inputs.filter(function (i) { return Number(i.dataset.n) === b.n; })[0], given = inp ? inp.value : ''; return { b: b, given: given, right: isRight(given, b.answers) }; });
    S.rounds++; var wrong = res.filter(function (r) { return !r.right; });
    if (!wrong.length) { track('prf_cloze_ok', { depth: S.stack.length, tries: f.tries }); res.forEach(function (r) { learn(r.b.answers[0], r.b.meaning, r.b.pron); }); learn(f.term, ''); success(f, res); return; }
    f.tries++; f.pending = wrong.map(function (r) { var k = norm(r.b.answers[0]), n = S.nodes.filter(function (x) { return x.parentId === f.nodeId && norm(x.term) === k; })[0] || node(r.b.answers[0], f.nodeId); n.status = 'pending'; return { answer: r.b.answers[0], meaning: r.b.meaning, pron: r.b.pron || '', nodeId: n.id, crucial: r.b.crucial !== false }; }); save(); track('prf_cloze_fail', { depth: S.stack.length, wrong: wrong.length, of: res.length });
    res.filter(function (r) { return r.right; }).forEach(function (r) { learn(r.b.answers[0], r.b.meaning, r.b.pron); });
    feedback(f, res); prefetch(f);
  }
  function learn(term, meaning, pron) { var k = norm(term); if (!k) return; if (!S.learned.some(function (x) { return norm(x.term) === k; })) S.learned.push({ term: term, meaning: meaning || '', pron: pron || '' }); else if (meaning) S.learned.forEach(function (x) { if (norm(x.term) === k && !x.meaning) x.meaning = meaning; }); }
  function canDescend(f, w) {
    var k = norm(w.answer); if (w.crucial === false) return false;   // palabra no clave para el tema central: se explica, no se profundiza
    if (S.stack.length >= MAX_DEPTH) return false; if ((S.taught[k] || 0) >= MAX_TAUGHT) return false;
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
    main.appendChild(filled(f, res)); var tb = trans(f, res); if (tb) main.appendChild(tb); var pb1 = pronBox(f, true); if (pb1) { pb1.open = true; main.appendChild(pb1); }
    wrong.forEach(function (r) { var d = el('p', 'mean'); d.appendChild(el('b', null, r.b.answers[0])); if (r.b.pron) d.appendChild(el('i', 'pr', pronOf(r.b))); if (TTS) d.appendChild(spk(r.b.answers[0], T.listenWord)); d.appendChild(document.createTextNode(': ' + r.b.meaning)); main.appendChild(d); });
    f.pending.sort(function (a, b) { return (b.crucial !== false) - (a.crucial !== false); });   // primero las palabras clave
    var allMinor = f.pending.every(function (w) { return w.crucial === false; });
    if (allMinor) { f.pending.forEach(function (w) { setStatus(w.nodeId, 'done'); }); f.pending = []; track('prf_minor', {}); }   // su significado ya se ve arriba: se reintenta sin bajar
    save(); var first = f.pending[0], desc = !!first && canDescend(f, first);
    main.appendChild(el('p', 'muted small', desc ? T.nowAbout(first.answer, f.pending.length - 1) : allMinor ? T.minorSeen : T.seen));
    var b = el('button', 'btn', desc ? T.understand(first.answer) : T.tryAgain); b.onclick = next; main.appendChild(b); b.focus();
  }
  function success(f, res) {
    stopSpeech(); renderPile(); main.textContent = ''; crumb(main);
    var isRoot = S.stack.length === 1, more = isRoot && S.part < S.parts.length - 1;
    main.appendChild(el('h2', null, more ? T.partWin(S.part + 1, S.parts.length) : isRoot ? T.win : T.okBack));
    var bar = ttsBar(function () { return plain(f, res); }); if (bar) main.appendChild(bar);
    main.appendChild(filled(f, res)); var tb2 = trans(f, res); if (tb2) main.appendChild(tb2); var pb2 = pronBox(f, true); if (pb2) main.appendChild(pb2);
    var b = el('button', 'btn', more ? T.nextPart(S.part + 2, S.parts.length) : isRoot ? T.seeLearned : T.backTo(tx(S.stack[S.stack.length - 2].term)));
    if (more) { S.part++; getCloze(S.parts[S.part], '', 0, []).catch(function () {}); S.part--; }   // la siguiente parte se prepara mientras lee
    b.onclick = function () {
      setStatus(f.nodeId, 'done'); S.stack.pop(); track('prf_return', { depth: S.stack.length }); save();
      if (more) { S.part++; S.taught = {}; track('prf_part_done', { part: S.part, of: S.parts.length }); save(); pushFrame(S.parts[S.part], '', null); }
      else if (isRoot) done(); else next();
    }; main.appendChild(b); b.focus();
  }

  /* ---------- motor de la pila ---------- */
  function next() {
    if (busy) return; var f = S.stack[S.stack.length - 1]; if (!f) { done(); return; }
    if (f.pending.length) {
      var w = f.pending[0];
      if (!canDescend(f, w)) { f.pending.shift(); setStatus(w.nodeId, 'done'); save(); explain(f, w); return; }
      f.pending.shift(); var k = norm(w.answer); S.taught[k] = (S.taught[k] || 0) + 1; save(); track('prf_descend', { depth: S.stack.length + 1 });
      pushFrame(w.answer, f.term, T.why(tx(w.answer), tx(f.term)), w.nodeId); return;
    }
    // sin pendientes: se vuelve a presentar la pregunta (después de dos fallos seguidos, con otra redacción)
    if (f.tries >= 2 && f.tries % 2 === 0) {
      loading(T.loadV(f.term));
      getCloze(f.term, f.parent, f.tries / 2, f.seen.slice(-2)).then(function (c) { f.cloze = c; f.seen.push(c.text); save(); ask(); }).catch(function () { ask(); });
    } else ask();
  }
  function explain(f, w) {
    stopSpeech(); renderPile(); main.textContent = ''; crumb(main);
    var h = el('h2', null, tx(w.answer)); if (w.pron) h.appendChild(el('i', 'pr', pronOf(w))); if (TTS) h.appendChild(spk(w.answer, T.listenWord)); main.appendChild(h); main.appendChild(el('p', null, w.meaning));
    main.appendChild(el('p', 'muted small', w.crucial === false ? T.minorNote(S.topic) : T.explainNote));
    var b = el('button', 'btn', T.cont); b.onclick = next; main.appendChild(b); b.focus();
  }
  function done(review) {
    stopSpeech(); if (!review) { track('prf_done', { rounds: S.rounds, depth: S.maxDepth, learned: S.learned.length, parts: S.parts.length }); S.status = 'done'; S.stack = []; S.nodes = []; save(); } renderPile(); learnEl.classList.remove('on'); pile.classList.remove('on'); document.body.classList.add('fin'); main.textContent = '';
    main.appendChild(el('h2', null, T.doneT(tx(S.topic))));
    main.appendChild(el('p', 'muted', T.doneS(S.rounds, S.maxDepth, S.learned.length)));
    var withM = S.learned.filter(function (x) { return x.meaning; });
    if (withM.length) { main.appendChild(el('p', null, T.recap)); var ul = el('ul', 'recap'); withM.forEach(function (x) { var li = el('li'); li.appendChild(el('b', null, x.term)); if (x.pron) li.appendChild(el('i', 'pr', ' /' + x.pron + '/')); if (TTS) li.appendChild(spk(x.term, T.listenWord)); li.appendChild(document.createTextNode(': ' + x.meaning)); ul.appendChild(li); }); main.appendChild(ul); }
    var row = el('div', 'row'), again = el('button', 'btn', T.again); again.onclick = function () { document.body.classList.remove('fin'); start(); }; row.appendChild(again);
    var up = el('button', 'btn ghost', T.harder); up.onclick = function () { var t = S.topic, nl = S.level === 'beginner' ? 'intermediate' : 'advanced'; document.body.classList.remove('fin'); track('prf_start', { level: nl, harder: true }); if (S.src) { var sr = S.src, ttl = S.topic; loading(T.preparing); window.PRF_SRC.load(sr.id).then(function (ch) { if (!ch) start({ err: T.errNoText }); else startFromChunks(ch, ttl, sr.kind, nl, sr.id, sr.chars); }); } else begin(t, nl); }; if (S.level !== 'advanced') row.appendChild(up);
    main.appendChild(row);
  }

  if (TTS) { try { speechSynthesis.getVoices(); } catch (e) {} }
  track('prf_landing', {}); start();
})();
