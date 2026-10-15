/* Exportar un esquema (con sus definiciones) a PowerPoint (.pptx), sin librerías de terceros salvo JSZip para empaquetar.
 *
 *   GKPptx.build(model)            -> { files: { 'ruta/dentro/del/zip': 'xml' }, slides: n }
 *   GKPptx.toBlob(model)           -> Promise<Blob>  (requiere JSZip en window)
 *
 * model = { title, lang: 'es'|'en', date: 'AAAA-MM-DD', root: Nodo }
 * Nodo  = { label, def, simple, example, children: [Nodo] }
 *
 * Orden de la presentación: portada → panorama de ramas → por cada rama: su lista de ideas y, a continuación,
 * una diapositiva por cada concepto que tenga definición (con la explicación sencilla y el ejemplo en las notas del orador).
 */
(function (root) {
    'use strict';
    const EMU = 914400, W = 12192000, H = 6858000;
    const e = (n) => Math.round(n * EMU);
    const C = { ink: '1D2330', ink2: '3A4254', mute: '5F6879', rule: 'DCD9CE', bg: 'F7F6F1', card: 'FFFFFF', teal: '0E857C', night: '0F1730', soft: '9FB0D0' };
    const BRANCH = ['0E857C', 'D9822B', '6B5BD2', 'C2410C', '2B7DE9', 'B83280', '4D7C0F', '0891B2'];
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

    const esc = (t) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const clip = (t, n) => { const s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

    // Tamaño de letra que cabe: se estima el ancho medio de un carácter (≈ 0,5 del cuerpo) y el alto de línea (1,2).
    function fit(text, wIn, hIn, maxPt, minPt) {
        const paras = String(text).split('\n');
        for (let pt = maxPt; pt >= minPt; pt -= 1) {
            const cpl = Math.max(4, Math.floor((wIn - 0.2) * 72 / (pt * 0.5)));
            const lines = paras.reduce((t, p) => t + Math.max(1, Math.ceil(p.length / cpl)), 0);
            if (lines * pt * 1.22 / 72 <= hIn - 0.1) return pt;
        }
        return minPt;
    }

    const rPr = (o) => `<a:rPr lang="${o.lang || 'es-ES'}" sz="${Math.round((o.sz || 18) * 100)}"${o.b ? ' b="1"' : ''}${o.i ? ' i="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${o.color || C.ink}"/></a:solidFill><a:latin typeface="${o.font || 'Calibri'}"/><a:cs typeface="${o.font || 'Calibri'}"/></a:rPr>`;
    const para = (text, o) => {
        o = o || {};
        const bu = o.bullet ? `<a:buClr><a:srgbClr val="${o.buColor || C.teal}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${o.bullet}"/>` : '<a:buNone/>';
        const ind = o.bullet ? ` marL="${e(o.marL || 0.3)}" indent="${-e(0.26)}"` : '';
        const sp = `<a:lnSpc><a:spcPct val="${o.ln || 100000}"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.round((o.before || 0) * 100)}"/></a:spcBef>`;
        const field = o.slideNum ? `<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="es-ES" sz="${Math.round((o.sz || 10) * 100)}"><a:solidFill><a:srgbClr val="${o.color || C.mute}"/></a:solidFill></a:rPr><a:t>‹#›</a:t></a:fld>` : '';
        const run = o.slideNum ? field : `<a:r>${rPr(o)}<a:t>${esc(text)}</a:t></a:r>`;
        return `<a:p><a:pPr algn="${o.algn || 'l'}"${ind}>${sp}${bu}</a:pPr>${run}</a:p>`;
    };
    const textParas = (text, o) => String(text).split('\n').map((t, i) => para(t, Object.assign({}, o, { before: i ? (o.gap || 6) : 0 }))).join('');

    let _id;
    // Forma: rectángulo (o rectángulo redondeado) con relleno/borde opcional y texto.
    function shape(x, y, w, h, o) {
        o = o || {}; const id = ++_id;
        const fill = o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>` : '<a:noFill/>';
        const ln = o.line ? `<a:ln w="${o.lineW || 12700}"><a:solidFill><a:srgbClr val="${o.line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
        const geom = o.round ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${o.round}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
        const ins = o.ins == null ? 0.1 : o.ins;
        const body = `<p:txBody><a:bodyPr wrap="square" lIns="${e(ins)}" tIns="${e(o.tIns == null ? 0.05 : o.tIns)}" rIns="${e(ins)}" bIns="${e(0.05)}" anchor="${o.anchor || 't'}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${o.paras || '<a:p><a:endParaRPr lang="es-ES"/></a:p>'}</p:txBody>`;
        return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Forma ' + id)}"/><p:cNvSpPr${o.paras ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(x)}" y="${e(y)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm>${geom}${fill}${ln}</p:spPr>${body}</p:sp>`;
    }
    // Título real (marcador de posición «title») para que el esquema de la presentación y los lectores de pantalla lo reconozcan.
    function titleShape(text, x, y, w, h, o) {
        o = o || {}; const id = ++_id;
        const sz = o.sz || fit(text, w, h, o.max || 36, o.min || 22);
        return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Título ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(x)}" y="${e(y)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${e(0.1)}" tIns="0" rIns="${e(0.1)}" bIns="0" anchor="${o.anchor || 'b'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${para(text, { sz, b: true, color: o.color || C.ink, lang: o.lang })}</p:txBody></p:sp>`;
    }
    const slideXml = (shapes, bg) => `${HDR}<p:sld ${NS}><p:cSld>${bg ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` : ''}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

    // ---------- contenido ----------
    const T = (lang) => lang === 'en'
        ? { overview: 'Overview', def: 'Definition', simple: 'In simple words', ex: 'Example', cont: 'cont.', concepts: (n) => `${n} concept${n === 1 ? '' : 's'}`, subtitle: (n, d) => `Concept map · ${n} concepts · ${d}`, brand: 'Graphikosmos', notesSimple: 'In simple words', notesEx: 'Example', more: 'more' }
        : { overview: 'Panorama', def: 'Definición', simple: 'En palabras simples', ex: 'Ejemplo', cont: 'cont.', concepts: (n) => `${n} concepto${n === 1 ? '' : 's'}`, subtitle: (n, d) => `Esquema conceptual · ${n} conceptos · ${d}`, brand: 'Graphikosmos', notesSimple: 'Explicación sencilla', notesEx: 'Ejemplo', more: 'más' };
    const countAll = (n) => 1 + (n.children || []).reduce((t, c) => t + countAll(c), 0);
    const hasContent = (n) => !!(String(n.def || '').trim() || String(n.simple || '').trim());

    function footer(model, tx) {
        return [
            shape(0.6, 7.02, 9, 0.3, { name: 'Pie', ins: 0, paras: para(`${tx.brand} · ${clip(model.title, 70)}`, { sz: 10, color: C.mute }) }),
            shape(11.7, 7.02, 1.0, 0.3, { name: 'Número', ins: 0, paras: para('', { sz: 10, algn: 'r', slideNum: true }) })
        ];
    }

    function coverSlide(model, tx) {
        _id = 1; const total = countAll(model.root);
        return { xml: slideXml([
            shape(0, 0, 13.333, 7.5, { name: 'Fondo', fill: C.night }),
            shape(0.9, 2.05, 0.9, 0.09, { name: 'Acento', fill: '4FD1C5' }),
            titleShape(clip(model.title, 90), 0.8, 2.3, 11.6, 2.0, { max: 54, min: 30, color: 'FFFFFF', anchor: 't', lang: model.lang === 'en' ? 'en-US' : 'es-ES' }),
            shape(0.8, 4.5, 11.6, 0.5, { name: 'Subtítulo', paras: para(tx.subtitle(total, model.date), { sz: 20, color: C.soft }) }),
            shape(0.8, 6.8, 6, 0.35, { name: 'Marca', paras: para(tx.brand, { sz: 12, color: C.soft, b: true }) })
        ]), notes: '' };
    }

    function overviewSlides(model, branches, tx) {
        const out = []; const per = 8;
        for (let s = 0; s < branches.length; s += per) {
            _id = 1; const chunk = branches.slice(s, s + per); const shapes = [];
            const t = tx.overview + (s ? ` (${Math.floor(s / per) + 1})` : '');
            shapes.push(titleShape(t, 0.66, 0.55, 12, 0.9, { max: 36 }));
            chunk.forEach((b, i) => {
                const col = i % 4, row = Math.floor(i / 4), x = 0.66 + col * 3.05, y = 1.75 + row * 2.6, color = BRANCH[(s + i) % BRANCH.length];
                const kids = (b.children || []).slice(0, 4).map(k => clip(k.label, 34));
                const more = (b.children || []).length - kids.length;
                shapes.push(shape(x, y, 2.85, 2.4, { name: 'Rama ' + (s + i + 1), fill: C.card, line: C.rule, round: 6000 }));
                shapes.push(shape(x, y, 2.85, 0.12, { name: 'Color de rama', fill: color }));
                shapes.push(shape(x + 0.05, y + 0.2, 2.75, 0.75, { name: 'Nombre de rama', anchor: 't', paras: para(clip(b.label, 60), { sz: fit(b.label, 2.75, 0.75, 20, 14), b: true, color: C.ink }) }));
                shapes.push(shape(x + 0.05, y + 0.95, 2.75, 1.4, { name: 'Ideas', paras: kids.map(k => para(k, { sz: 12, color: C.ink2, bullet: '•', buColor: color, marL: 0.22, before: 2 })).join('') + (more > 0 ? para(`+ ${more} ${tx.more}`, { sz: 11, color: C.mute, before: 3 }) : '') }));
            });
            shapes.push(...footer(model, tx));
            out.push({ xml: slideXml(shapes), notes: '' });
        }
        return out;
    }

    // Líneas de una rama (hasta 4 niveles) para repartirlas en diapositivas.
    function branchLines(b) {
        const lines = []; const walk = (n, lvl) => { lines.push({ t: clip(n.label, 90), lvl }); if (lvl < 3) (n.children || []).forEach(c => walk(c, lvl + 1)); };
        (b.children || []).forEach(c => walk(c, 0)); return lines;
    }
    const LINE = [{ sz: 22, cost: 0.5, b: true }, { sz: 18, cost: 0.4 }, { sz: 16, cost: 0.35 }, { sz: 14, cost: 0.32 }];
    function branchSlides(model, b, color, tx) {
        const lines = branchLines(b); if (!lines.length) return [];
        const pages = []; let cur = [], used = 0; const budget = 4.9;
        lines.forEach(l => { const c = LINE[l.lvl].cost; if (used + c > budget && cur.length) { pages.push(cur); cur = []; used = 0; } cur.push(l); used += c; });
        if (cur.length) pages.push(cur);
        return pages.map((pg, i) => {
            _id = 1; const title = clip(b.label, 80) + (i ? ` (${tx.cont})` : '');
            const paras = pg.map(l => { const st = LINE[l.lvl]; return para(l.t, { sz: st.sz, b: st.b, color: l.lvl ? C.ink2 : C.ink, bullet: l.lvl ? '–' : '•', buColor: color, marL: 0.3 + l.lvl * 0.4, before: l.lvl ? 3 : 9 }); }).join('');
            return { xml: slideXml([
                shape(0, 0, 0.18, 7.5, { name: 'Color de rama', fill: color }),
                titleShape(title, 0.7, 0.45, 12, 1.0, { max: 38, min: 24 }),
                shape(0.7, 1.7, 11.9, 5.1, { name: 'Ideas', paras }),
                ...footer(model, tx)
            ]), notes: '' };
        });
    }

    function conceptSlide(model, n, path, color, tx) {
        _id = 1; const def = String(n.def || '').trim(), simple = String(n.simple || '').trim(), ex = String(n.example || '').trim();
        const shapes = [shape(0, 0, 0.18, 7.5, { name: 'Color de rama', fill: color }), titleShape(clip(n.label, 90), 0.7, 0.4, 12, 0.85, { max: 38, min: 24 })];
        if (path.length) shapes.push(shape(0.7, 1.3, 11.9, 0.4, { name: 'Ruta', paras: para(clip(path.join(' › '), 140), { sz: 14, color: C.mute }) }));
        const second = [];
        if (simple) second.push({ label: tx.simple, text: simple });
        if (ex) second.push({ label: tx.ex, text: ex });
        const defH = second.length ? 2.35 : 4.7;
        if (def) {
            shapes.push(shape(0.7, 1.85, 11.9, 0.35, { name: 'Etiqueta definición', paras: para(tx.def, { sz: 13, b: true, color }) }));
            shapes.push(shape(0.7, 2.2, 11.9, defH, { name: 'Definición', paras: textParas(def, { sz: fit(def, 11.9, defH, second.length ? 30 : 34, 16), color: C.ink, ln: 105000 }) }));
        }
        if (second.length) {
            const y = def ? 4.75 : 2.0, h = def ? 2.1 : 4.7, w = second.length === 1 ? 11.9 : 5.85;
            second.forEach((s, i) => {
                const x = 0.7 + i * 6.05;
                shapes.push(shape(x, y, w, h, { name: s.label, fill: C.card, line: C.rule, round: 5000, ins: 0.2, tIns: 0.15, paras: para(s.label, { sz: 13, b: true, color }) + textParas(s.text, { sz: fit(s.text, w - 0.2, h - 0.6, def ? 22 : 28, 13), color: C.ink2, before: 4 }) }));
            });
        }
        shapes.push(...footer(model, tx));
        const notes = [simple && `${tx.notesSimple}: ${simple}`, ex && `${tx.notesEx}: ${ex}`].filter(Boolean).join('\n\n');
        return { xml: slideXml(shapes), notes };
    }

    function planSlides(model) {
        const tx = T(model.lang); const slides = [coverSlide(model, tx)];
        const root = model.root, branches = root.children || [];
        if (hasContent(root)) slides.push(conceptSlide(model, root, [], BRANCH[0], tx));
        if (branches.length) overviewSlides(model, branches, tx).forEach(s => slides.push(s));
        branches.forEach((b, bi) => {
            const color = BRANCH[bi % BRANCH.length];
            branchSlides(model, b, color, tx).forEach(s => slides.push(s));
            const walk = (n, path) => { if (hasContent(n)) slides.push(conceptSlide(model, n, path, color, tx)); (n.children || []).forEach(c => walk(c, path.concat(clip(n.label, 40)))); };
            walk(b, [clip(root.label, 40)]);
        });
        return slides;
    }

    // ---------- partes fijas del paquete ----------
    const SPTREE_HEAD = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    const theme = (name) => `${HDR}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${name}"><a:themeElements><a:clrScheme name="Graphikosmos"><a:dk1><a:srgbClr val="1D2330"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0F1730"/></a:dk2><a:lt2><a:srgbClr val="F7F6F1"/></a:lt2><a:accent1><a:srgbClr val="0E857C"/></a:accent1><a:accent2><a:srgbClr val="D9822B"/></a:accent2><a:accent3><a:srgbClr val="6B5BD2"/></a:accent3><a:accent4><a:srgbClr val="C2410C"/></a:accent4><a:accent5><a:srgbClr val="2B7DE9"/></a:accent5><a:accent6><a:srgbClr val="B83280"/></a:accent6><a:hlink><a:srgbClr val="0E857C"/></a:hlink><a:folHlink><a:srgbClr val="6B5BD2"/></a:folHlink></a:clrScheme><a:fontScheme name="Graphikosmos"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
    const CLRMAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
    const master = () => `${HDR}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${C.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${SPTREE_HEAD}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Título"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(0.7)}" y="${e(0.45)}"/><a:ext cx="${e(12)}" cy="${e(1)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr anchor="b"/><a:lstStyle/><a:p><a:r><a:rPr lang="es-ES"/><a:t>Título</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>${CLRMAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3600" b="1"><a:solidFill><a:srgbClr val="${C.ink}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="2000"><a:solidFill><a:srgbClr val="${C.ink}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="es-ES"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`;
    const layout = () => `${HDR}<p:sldLayout ${NS} type="titleOnly" preserve="1"><p:cSld name="Solo título"><p:spTree>${SPTREE_HEAD}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Título"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-ES"/><a:t>Título</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    const notesMaster = () => `${HDR}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${SPTREE_HEAD}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Imagen de diapositiva"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notas"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-ES"/><a:t>Notas</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>${CLRMAP}<p:notesStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
    const notesSlide = (text) => `${HDR}<p:notes ${NS}><p:cSld><p:spTree>${SPTREE_HEAD}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Imagen de diapositiva"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notas"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${String(text).split('\n').map(l => `<a:p><a:r><a:rPr lang="es-ES"/><a:t>${esc(l)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
    const rels = (list) => `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(r => `<Relationship Id="${r[0]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${r[1]}" Target="${r[2]}"/>`).join('')}</Relationships>`;

    function build(model) {
        const slides = planSlides(model);
        const files = {};
        const ov = [['/ppt/presentation.xml', 'presentationml.presentation.main'], ['/ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster'], ['/ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout'], ['/ppt/notesMasters/notesMaster1.xml', 'presentationml.notesMaster']];
        const presRels = [['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'notesMaster', 'notesMasters/notesMaster1.xml'], ['rId3', 'theme', 'theme/theme1.xml']];
        slides.forEach((s, i) => {
            const n = i + 1; files[`ppt/slides/slide${n}.xml`] = s.xml;
            const r = [['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
            if (s.notes) { r.push(['rId2', 'notesSlide', `../notesSlides/notesSlide${n}.xml`]); files[`ppt/notesSlides/notesSlide${n}.xml`] = notesSlide(s.notes); files[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = rels([['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'], ['rId2', 'slide', `../slides/slide${n}.xml`]]); ov.push([`/ppt/notesSlides/notesSlide${n}.xml`, 'presentationml.notesSlide']); }
            files[`ppt/slides/_rels/slide${n}.xml.rels`] = rels(r);
            presRels.push([`rId${n + 3}`, 'slide', `slides/slide${n}.xml`]); ov.push([`/ppt/slides/slide${n}.xml`, 'presentationml.slide']);
        });
        files['ppt/presentation.xml'] = `${HDR}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${slides.map((_s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 4}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
        files['ppt/_rels/presentation.xml.rels'] = rels(presRels);
        files['ppt/slideMasters/slideMaster1.xml'] = master();
        files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]);
        files['ppt/slideLayouts/slideLayout1.xml'] = layout();
        files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]);
        files['ppt/notesMasters/notesMaster1.xml'] = notesMaster();
        files['ppt/notesMasters/_rels/notesMaster1.xml.rels'] = rels([['rId1', 'theme', '../theme/theme2.xml']]);
        files['ppt/theme/theme1.xml'] = theme('Graphikosmos'); files['ppt/theme/theme2.xml'] = theme('Graphikosmos notas');
        ov.push(['/ppt/theme/theme1.xml', 'theme+xml'], ['/ppt/theme/theme2.xml', 'theme+xml']);
        files['docProps/core.xml'] = `${HDR}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(model.title)}</dc:title><dc:creator>Graphikosmos</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${esc(model.date)}T00:00:00Z</dcterms:created></cp:coreProperties>`;
        files['_rels/.rels'] = rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]).replace('</Relationships>', '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
        const ct = (p, t) => `<Override PartName="${p}" ContentType="application/vnd.openxmlformats-officedocument.${t.includes('theme') ? 'theme+xml' : t}+xml"/>`;
        files['[Content_Types].xml'] = `${HDR}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ov.map(o => o[1] === 'theme+xml' ? `<Override PartName="${o[0]}" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` : ct(o[0], o[1])).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
        return { files, slides: slides.length };
    }

    async function toBlob(model) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip no disponible');
        const b = build(model), zip = new JSZip();
        zip.file('[Content_Types].xml', b.files['[Content_Types].xml']);   // va primero, como pide el formato
        Object.keys(b.files).filter(k => k !== '[Content_Types].xml').forEach(k => zip.file(k, b.files[k]));
        return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
    }

    const api = { build, toBlob, _plan: planSlides, _fit: fit };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GKPptx = api;
})(typeof window !== 'undefined' ? window : globalThis);
