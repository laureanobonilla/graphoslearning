/* view-legends.js — leyendas (qué significa cada forma/color) para las vistas artísticas. Se carga después de todas las vistas. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T._impl || !K || !K.legend) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var ORDER = ['root', 'category', 'process', 'question', 'example', 'benefit', 'risk', 'date', 'list', 'formula', 'definition', 'concept'];
  function css(c) { return typeof c === 'string' ? c : 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function box(c) { return function (ctx, x, y, w, h) { ctx.beginPath(); ctx.rect(x + 4, y, w - 8, h); ctx.fillStyle = css(c); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(150,150,160,0.85)'; ctx.stroke(); }; }
  function dot(c) { return function (ctx, x, y, w, h) { ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h / 2 - 1, 0, 6.2832); ctx.fillStyle = css(c); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(150,150,160,0.85)'; ctx.stroke(); }; }
  function star(cls) {
    return function (ctx, x, y, w, h) {
      var cx = x + w / 2, cy = y + h / 2, r = 6.5; ctx.strokeStyle = ctx.fillStyle = 'rgb(226,222,205)'; ctx.lineWidth = 1.2; ctx.beginPath();
      if (cls === 'ring') { ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 1.4, 0, 6.2832); ctx.fill(); }
      else if (cls === 'cross') { ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 6.2832); ctx.fill(); }
      else if (cls === 'diamond') { ctx.moveTo(cx, cy - r * 1.1); ctx.lineTo(cx + r * 0.75, cy); ctx.lineTo(cx, cy + r * 1.1); ctx.lineTo(cx - r * 0.75, cy); ctx.closePath(); ctx.fill(); }
      else if (cls === 'tick') { ctx.arc(cx, cy, 2.6, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy, r, 0.5, 3.5); ctx.stroke(); }
      else if (cls === 'double') { ctx.arc(cx - 3, cy, 3.4, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 4, cy + 1, 2, 0, 6.2832); ctx.stroke(); }
      else { ctx.arc(cx, cy, 4.2, 0, 6.2832); ctx.fill(); }
    };
  }
  // construye filas: tabla {rol: [nombreEs, nombreEn]} y función de swatch por rol
  function rows(names, sw) {
    return ORDER.filter(function (r) { return names[r]; }).map(function (r) { return { role: r, name: names[r], swatch: sw(r) }; });
  }
  function wrap(mode, makeCfg) {
    var impl = T._impl[mode]; if (!impl) return; var prev = impl.after;
    impl.after = function (ctx, F, V, pr, t) { if (prev) prev.apply(this, arguments); try { K.legend(ctx, F, V, makeCfg()); } catch (e) { } };
  }
  var TITLE = function (es, en) { return [es, en]; };

  // Herramientas: cada rol es una familia de objetos
  wrap('tools', function () {
    var N = { root: ['Brújula / corona', 'Compass / crown'], category: ['Caja de herramientas / libros', 'Toolbox / books'], process: ['Engranaje / llave', 'Gear / wrench'], question: ['Lupa / cerradura', 'Magnifier / keyhole'], example: ['Bombilla / bandera', 'Bulb / flag'], benefit: ['Trofeo / medalla', 'Trophy / medal'], risk: ['Candado / advertencia', 'Lock / warning'], date: ['Reloj / calendario', 'Clock / calendar'], list: ['Balanza / regla', 'Scales / ruler'], formula: ['Regla / matraz', 'Ruler / flask'], definition: ['Libro / pergamino', 'Book / scroll'], concept: ['Objetos variados', 'Assorted objects'] };
    return { title: TITLE('Herramientas · objeto según función', 'Tools · object by function'), cw: 300, rows: rows(N, function () { return box('rgb(180,83,9)'); }), note: ['El material (color) del objeto es decorativo', 'The object material (colour) is decorative'] };
  });
  // Naturaleza: la forma real de la primera familia de cada función (el color de cada pieza varía)
  wrap('nature', function () {
    var SHp = window.__gkShapes, FIRST = { root: 'sun', category: 'leaf', process: 'dune', question: 'cloud', example: 'flower', benefit: 'fruit', risk: 'burst', date: 'pebble', list: 'hex', formula: 'crystal', definition: 'shell', concept: 'leaf' };
    function sil(r) {
      return function (ctx, x, y, w, h) {
        var S; try { S = SHp.prep(FIRST[r], 0); } catch (e) { S = null; } if (!S || !S.pts) { dot('#4ade80')(ctx, x, y, w, h); return; }
        var cx = x + w / 2, cy = y + h / 2, a = w / 2 - 2, b = h / 2, P = S.pts.map(function (q) { return [cx + q[0] * a, cy + q[1] * b]; }), n = P.length;
        ctx.beginPath();
        if (S.F && S.F.smooth) { ctx.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2); for (var j = 0; j < n; j++) { var p0 = P[j], p1 = P[(j + 1) % n]; ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); } }
        else { ctx.moveTo(P[0][0], P[0][1]); for (var i = 1; i < n; i++) ctx.lineTo(P[i][0], P[i][1]); }
        ctx.closePath(); var col = S.F && S.F.cols && S.F.cols[0] ? S.F.cols[0] : '#4ade80'; ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(230,240,230,0.8)'; ctx.stroke();
      };
    }
    var N = { root: ['Sol / flor', 'Sun / flower'], category: ['Hoja / pluma', 'Leaf / feather'], process: ['Duna / gota / vaina', 'Dune / drop / pod'], question: ['Nube / hongo', 'Cloud / mushroom'], example: ['Flor / mariposa / fruto', 'Flower / butterfly / fruit'], benefit: ['Fruto / flor / huevo', 'Fruit / flower / egg'], risk: ['Estallido / escarcha / estrella', 'Burst / frost / star'], date: ['Guijarro / huevo', 'Pebble / egg'], list: ['Panal / concha / vaina', 'Hive / shell / pod'], formula: ['Cristal / escarcha', 'Crystal / frost'], definition: ['Concha / huevo / hongo', 'Shell / egg / mushroom'], concept: ['Formas naturales variadas', 'Assorted natural forms'] };
    return { title: TITLE('Naturaleza · forma según función', 'Nature · form by function'), cw: 320, rows: rows(N, sil), note: ['La forma indica la función; el color de cada pieza varía', 'Form shows the function; each piece\'s colour varies'] };
  });
  // Organismo
  wrap('organism', function () {
    var C = { root: [79, 209, 197], category: [139, 124, 246], process: [96, 165, 250], example: [242, 179, 102], question: [192, 132, 252], benefit: [74, 222, 128], risk: [248, 113, 113], date: [34, 211, 238], list: [244, 114, 182], formula: [250, 204, 21], definition: [251, 146, 60], concept: [148, 163, 184] };
    var N = { root: ['Célula madre con flagelos', 'Mother cell with flagella'], category: ['Célula violeta', 'Violet cell'], process: ['Célula con cilios', 'Ciliated cell'], question: ['Neurona con dendritas', 'Neuron with dendrites'], example: ['Brote', 'Bud'], benefit: ['Célula con brillo de flor', 'Flower-glow cell'], risk: ['Célula roja', 'Red cell'], date: ['Membrana punteada', 'Dashed membrane'], list: ['Célula con vesículas', 'Cell with vesicles'], formula: ['Célula amarilla', 'Yellow cell'], definition: ['Concha en espiral', 'Spiral shell'], concept: ['Célula gris', 'Grey cell'] };
    return { title: TITLE('Organismo · tipo de célula según función', 'Organism · cell type by function'), cw: 300, rows: rows(N, function (r) { return dot(C[r]); }), note: ['Más conexiones = más orgánulos', 'More connections = more organelles'] };
  });
  // Arquitectura imposible
  wrap('impossible', function () {
    var C = { root: [46, 48, 56], category: [40, 52, 92], process: [128, 56, 40], example: [122, 100, 68], question: [44, 40, 84], benefit: [60, 88, 72], risk: [24, 24, 28], date: [58, 76, 96], list: [86, 86, 84], formula: [110, 84, 40], definition: [96, 58, 52], concept: [58, 60, 66] };
    var N = { root: ['Piedra carbón', 'Charcoal stone'], category: ['Azul de Prusia', 'Prussian blue'], process: ['Ladrillo rojo', 'Red brick'], question: ['Índigo oscuro', 'Dark indigo'], example: ['Arenisca', 'Sandstone'], benefit: ['Verde musgo', 'Moss green'], risk: ['Negro', 'Black'], date: ['Azul pizarra', 'Slate blue'], list: ['Gris', 'Grey'], formula: ['Ocre', 'Ochre'], definition: ['Terracota', 'Terracotta'], concept: ['Gris neutro', 'Neutral grey'] };
    return { title: TITLE('Arquitectura · material según función', 'Architecture · material by function'), cw: 270, rows: rows(N, function (r) { return box(C[r]); }), note: ['Altura del edificio = nº de conexiones · escaleras/puentes = relaciones', 'Building height = number of connections · stairs/bridges = relations'] };
  });
  // Constelación
  wrap('constellation', function () {
    var CL = { root: 'ring', category: 'cross', process: 'diamond', example: 'dot', question: 'tick', benefit: 'dot', risk: 'double', date: 'tick', list: 'cross', formula: 'diamond', definition: 'ring', concept: 'dot' };
    var CN = { ring: ['Anillo', 'Ring'], cross: ['Cruz', 'Cross'], diamond: ['Rombo', 'Diamond'], dot: ['Punto', 'Dot'], tick: ['Punto con arco', 'Dot with arc'], double: ['Estrella doble', 'Double star'] };
    var N = {}; ORDER.forEach(function (r) { N[r] = CN[CL[r]]; });
    return { title: TITLE('Constelación · tipo de estrella según función', 'Constellation · star type by function'), cw: 250, rows: rows(N, function (r) { return star(CL[r]); }), note: ['Más brillo y cruz de rayos = más conexiones', 'Brighter, with rays = more connections'] };
  });
  // Textil
  wrap('textile', function () {
    var TH = { indigo: [38, 58, 104], madder: [150, 52, 56], saffron: [196, 142, 38], moss: [70, 100, 70], coal: [38, 36, 40] };
    var RC = { root: 'coal', category: 'indigo', process: 'madder', example: 'saffron', question: 'madder', benefit: 'moss', risk: 'coal', date: 'indigo', list: 'moss', formula: 'saffron', definition: 'indigo', concept: 'coal' };
    var HN = { coal: ['Hilo carbón', 'Coal thread'], indigo: ['Hilo índigo', 'Indigo thread'], madder: ['Hilo rubia (rojo)', 'Madder thread (red)'], saffron: ['Hilo azafrán', 'Saffron thread'], moss: ['Hilo musgo', 'Moss thread'] };
    var N = {}; ORDER.forEach(function (r) { N[r] = HN[RC[r]]; });
    return { title: TITLE('Textil · color del hilo según función', 'Textile · thread colour by function'), cw: 270, rows: rows(N, function (r) { return box(TH[RC[r]]); }), note: ['La relación toma el color del hilo del concepto hijo', 'A relation takes the thread colour of its child'] };
  });
  // Acuarela
  wrap('watercolor', function () {
    var PG = { indigo: [46, 58, 140], madder: [170, 40, 60], viridian: [24, 130, 108], ochre: [200, 140, 30], violet: [110, 60, 150], umber: [92, 62, 48], payne: [30, 44, 66] };
    var RC = { root: 'payne', category: 'indigo', process: 'madder', example: 'ochre', question: 'violet', benefit: 'viridian', risk: 'madder', date: 'indigo', list: 'viridian', formula: 'ochre', definition: 'umber', concept: 'payne' };
    var HN = { payne: ['Gris de Payne', "Payne's grey"], indigo: ['Índigo', 'Indigo'], madder: ['Granza (rojo)', 'Madder (red)'], ochre: ['Ocre', 'Ochre'], violet: ['Violeta', 'Violet'], viridian: ['Verde viridian', 'Viridian'], umber: ['Sombra tostada', 'Umber'] };
    var N = {}; ORDER.forEach(function (r) { N[r] = HN[RC[r]]; });
    return { title: TITLE('Acuarela · pigmento según función', 'Watercolour · pigment by function'), cw: 260, rows: rows(N, function (r) { return dot(PG[RC[r]]); }) };
  });
  // Sedimento
  wrap('sediment', function () {
    var ST = { root: [92, 62, 110], category: [60, 66, 112], process: [70, 56, 34], example: [96, 84, 64], question: [20, 18, 24], benefit: [30, 76, 64], risk: [18, 16, 20], date: [86, 72, 60], list: [74, 64, 58], formula: [86, 74, 30], definition: [128, 64, 18], concept: [74, 78, 84] };
    var N = { root: ['Geoda grande', 'Large geode'], category: ['Geoda', 'Geode'], process: ['Veta lenticular', 'Lenticular vein'], question: ['Cavidad con cristales', 'Crystal cavity'], example: ['Fósil', 'Fossil'], benefit: ['Racimo de cristales', 'Crystal cluster'], risk: ['Obsidiana', 'Obsidian'], date: ['Nódulo bandeado', 'Banded nodule'], list: ['Conglomerado', 'Conglomerate'], formula: ['Pirita (cubo)', 'Pyrite (cube)'], definition: ['Ámbar', 'Amber'], concept: ['Canto rodado', 'Pebble'] };
    return { title: TITLE('Sedimento · mineral según función', 'Sediment · mineral by function'), cw: 270, rows: rows(N, function (r) { return box(ST[r]); }) };
  });
  // Collage
  wrap('art', function () {
    var INK = { char: [34, 31, 40], blue: [34, 52, 118], oxblood: [112, 30, 38], ochre: [138, 100, 24], forest: [22, 70, 58], verm: [176, 52, 32] };
    var RI = { root: 'char', category: 'blue', process: 'verm', example: 'ochre', question: 'oxblood', benefit: 'forest', risk: 'verm', date: 'blue', list: 'forest', formula: 'ochre', definition: 'oxblood', concept: 'char' };
    var IN = { char: ['Papel carbón', 'Charcoal paper'], blue: ['Papel azul', 'Blue paper'], oxblood: ['Papel granate', 'Oxblood paper'], ochre: ['Papel ocre', 'Ochre paper'], forest: ['Papel verde', 'Green paper'], verm: ['Papel bermellón', 'Vermilion paper'] };
    var N = {}; ORDER.forEach(function (r) { N[r] = IN[RI[r]]; });
    return { title: TITLE('Collage · papel según función', 'Collage · paper by function'), cw: 250, rows: rows(N, function (r) { return box(INK[RI[r]]); }), note: ['Las tiras de papel son las relaciones', 'Paper strips are the relations'] };
  });
  // Topografía (no codifica el rol: codifica conexiones)
  wrap('topo', function () {
    function tri(ctx, x, y, w, h) { ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w - 5, y + h); ctx.lineTo(x + 5, y + h); ctx.closePath(); ctx.strokeStyle = 'rgb(226,222,205)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    function ring(ctx, x, y, w, h) { ctx.strokeStyle = 'rgb(226,222,205)'; ctx.lineWidth = 1; for (var i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, 3 + i * 3, 2 + i * 1.5, 0, 0, 6.2832); ctx.stroke(); } }
    function path(ctx, x, y, w, h) { ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgb(235,120,80)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 2, y + h); ctx.lineTo(x + w - 2, y); ctx.stroke(); ctx.setLineDash([]); }
    return { title: TITLE('Topografía · cómo leerla', 'Topography · how to read it'), cw: 330, rows: [
      { name: ['Curvas cerradas = cumbre: zona con más conexiones', 'Closed contours = summit: most connected area'], swatch: ring },
      { name: ['Triángulo = concepto (vértice geodésico)', 'Triangle = concept (survey marker)'], swatch: tri },
      { name: ['Sendero = relación entre conceptos', 'Trail = relation between concepts'], swatch: path }] };
  });
  // Radiografía
  wrap('xray', function () {
    var N = { root: ['Pelvis', 'Pelvis'], category: ['Vértebra', 'Vertebra'], process: ['Articulación', 'Joint'], question: ['Anillo con retícula', 'Ring with grid'], example: ['Tornillo de implante', 'Implant screw'], benefit: ['Malla (stent)', 'Mesh (stent)'], risk: ['Fractura', 'Fracture'], date: ['Regla graduada', 'Graduated ruler'], list: ['Costillas', 'Ribs'], formula: ['Grapa', 'Staple'], definition: ['Nódulo denso', 'Dense nodule'], concept: ['Hueso largo', 'Long bone'] };
    return { title: TITLE('Radiografía · estructura según función', 'X-ray · structure by function'), cw: 250, rows: rows(N, function (r) { return r === 'risk' ? box([255, 150, 120]) : box([176, 216, 236]); }), note: ['Naranja = elemento seleccionado o de riesgo', 'Orange = selected or risk element'] };
  });
})();
