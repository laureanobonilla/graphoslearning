(function () {
    'use strict';
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var miles = function (t) { return t.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };   // 1234567 → 1.234.567 (como se escribe en Costa Rica)
    var money = function (n) { return '₡' + miles(String(Math.round(n))); };
    var dec = function (n) { var p = (Math.round(Number(n) * 100) / 100).toString().split('.'); return miles(p[0]) + (p[1] ? ',' + p[1] : ''); };
    var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
    var S = { cfg: null, code: '', est: null, tab: 'mezcla', rows: [], last: null };
    var root = $('#root'), chip = $('#chip'), salir = $('#salir');
    var UA = (navigator.userAgent || '').slice(0, 150);

    function api(name, body) {
        return fetch('/.netlify/functions/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); })
            .catch(function () { return { error: 'No hay conexión. Revise su internet e intente de nuevo.', __status: 0 }; });
    }
    // montos en colones: «1.500» es mil quinientos; cantidades: «1,5» y «1.5» son uno y medio
    var monto = function (v) { return String(v || '').replace(/[\s.]/g, '').replace(',', '.'); };
    var cant = function (v) { return String(v || '').trim().replace(',', '.'); };

    // ---------- vigencia y créditos ----------
    function venceTxt(iso) {
        if (!iso) return ''; var d = new Date(iso), ms = d - Date.now();
        if (ms <= 0) return 'venció';
        if (ms < 86400000) return 'vence hoy a las ' + d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });
        var dias = Math.ceil(ms / 86400000); return dias <= 30 ? 'vence en ' + dias + ' días' : 'vence el ' + d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function paintChip() {
        if (!S.est) { chip.classList.add('hide'); salir.classList.add('hide'); return; }
        var e = S.est, out = e.vencido || e.restantes <= 0;
        chip.className = 'chip' + (out ? ' out' : e.restantes <= 2 ? ' low' : '');
        chip.textContent = out ? (e.vencido ? 'Código vencido' : 'Sin créditos') : e.restantes + (e.restantes === 1 ? ' crédito' : ' créditos');
        salir.classList.remove('hide');
    }

    // ---------- pago ----------
    function packsHtml(sel) {
        return S.cfg.packs.map(function (p) {
            return '<label class="pack"><input type="radio" name="pack" value="' + h(p.id) + '"' + (p.id === sel ? ' checked' : '') + '><span><b>' + h(p.nombre) + '</b><small>' + p.creditos + ' créditos · ' + h(p.detalle) + '</small></span><span class="pr">' + money(p.crc) + '</span></label>';
        }).join('');
    }
    function payHtml(hot, intro) {
        var c = S.cfg, wa = c.whatsapp;
        return '<section class="card pay' + (hot ? ' hot' : '') + '" id="pagar"><h2>' + (hot ? 'Siga usándola' : 'Pagar o recargar') + '</h2>' +
            '<p>' + (intro || 'No tiene que esperar a que se acaben los créditos ni la prueba. <b>Si paga antes, los créditos que le sobren se suman a los nuevos</b> y no se pierden.') + '</p>' +
            '<div id="packs">' + packsHtml('finca') + '</div>' +
            '<ol class="steps"><li>Haga un SINPE Móvil por el monto del paquete al <b id="sinpeNum">' + h(c.sinpe.numero) + '</b> a nombre de ' + h(c.sinpe.nombre) + ' <button class="btn ghost sm" type="button" id="copiarSinpe">Copiar número</button></li>' +
            '<li>Mándeme el comprobante' + (wa ? ' por WhatsApp o llene el aviso de abajo' : ' con el aviso de abajo') + '.</li>' +
            '<li>Le recargo su mismo código y le aviso.</li></ol>' +
            '<form id="fPago" novalidate><label for="pn">Su nombre</label><input id="pn" autocomplete="name" maxlength="80">' +
            '<label for="pc">Su WhatsApp o correo</label><input id="pc" inputmode="email" autocomplete="tel" maxlength="120">' +
            '<label for="pk">Número del comprobante <span class="hint">Opcional, si ya hizo el SINPE.</span></label><input id="pk" maxlength="60" inputmode="numeric">' +
            '<p class="err hide" id="pe" role="alert"></p><p class="ok hide" id="po" role="status"></p>' +
            '<button class="btn' + (hot ? '' : ' sol') + '" type="submit" style="margin-top:14px;' + (hot ? 'background:#14261a;color:#fff' : '') + '">Avisar que pagué o quiero pagar</button>' +
            (wa ? '<a class="btn ghost" id="waPago" style="margin-top:10px" target="_blank" rel="noopener" href="#">Escribir por WhatsApp</a>' : '') + '</form></section>';
    }
    function wirePay() {
        var f = $('#fPago'); if (!f) return;
        var pack = function () { var r = $('input[name=pack]:checked'); return S.cfg.packs.filter(function (p) { return p.id === (r && r.value); })[0] || S.cfg.packs[1]; };
        var wa = $('#waPago');
        var upd = function () { if (wa) { var p = pack(); wa.href = 'https://wa.me/' + S.cfg.whatsapp + '?text=' + encodeURIComponent('Hola, quiero pagar el paquete ' + p.nombre + ' (' + money(p.crc) + ')' + (S.code ? '. Mi código es ' + S.code : '') + '.'); } };
        upd(); $('#packs').addEventListener('change', upd);
        $('#copiarSinpe').addEventListener('click', function () { var b = this, n = $('#sinpeNum').textContent; (navigator.clipboard ? navigator.clipboard.writeText(n) : Promise.reject()).then(function () { b.textContent = 'Copiado'; }, function () { b.textContent = n; }); });
        f.addEventListener('submit', function (ev) {
            ev.preventDefault(); var e = $('#pe'), o = $('#po'), btn = f.querySelector('button[type=submit]'); e.classList.add('hide'); o.classList.add('hide'); btn.disabled = true; var p = pack();
            api('agro-pedir', { tipo: 'pago', nombre: $('#pn').value, contacto: $('#pc').value, comprobante: $('#pk').value, codigo: S.code, paquete: p.nombre + ' · ' + money(p.crc), ua: UA }).then(function (j) {
                btn.disabled = false; if (j.ok) { o.textContent = 'Listo, recibí su aviso. Apenas vea el pago le recargo el código y le escribo.'; o.classList.remove('hide'); } else { e.textContent = j.error || 'No se pudo enviar.'; e.classList.remove('hide'); }
            });
        });
    }
    function goPay() { var el = $('#pagar'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }

    // ---------- pantalla de entrada ----------
    function gate(msg) {
        S.est = null; paintChip();
        var t = S.cfg.trial;
        root.innerHTML = '<section class="hero"><h1>Cuánto mezclar y a cuánto vender.</h1><p class="lead">Dos cuentas que en el campo se hacen mal o se hacen a ojo, resueltas en el celular.</p>' +
            '<div class="two"><div class="card mini"><span class="ic">1</span><div><h3>Mezcla de fumigación</h3><p class="sub">Cuántos mL o gramos echar en cada bomba y cuántas bombas necesita para su lote.</p></div></div>' +
            '<div class="card mini"><span class="ic">2</span><div><h3>Costos y precio mínimo</h3><p class="sub">A qué precio no pierde, a cuánto le conviene vender y qué pasa si el precio baja.</p></div></div></div></section>' +
            '<section class="card" id="tengo"><h2>Ya tengo mi código</h2><form id="fCod" novalidate><label for="cod" class="hide">Código</label><input id="cod" placeholder="AG-XXXX-XXXX" autocapitalize="characters" autocomplete="off" maxlength="20" style="text-transform:uppercase"><p class="err ' + (msg ? '' : 'hide') + '" id="ce" role="alert">' + h(msg || '') + '</p><button class="btn" type="submit" style="margin-top:12px">Entrar</button></form></section>' +
            '<section class="card"><h2>Pruébela gratis ' + (t.horas === 24 ? 'por 1 día' : 'por ' + t.horas + ' horas') + '</h2><p>Escríbame y le doy un código con ' + t.creditos + ' créditos. Cada cálculo gasta 1 crédito. Si le sirve, puede pagar antes de que se acaben.</p>' +
            '<form id="fPrueba" novalidate><label for="n1">Su nombre</label><input id="n1" autocomplete="name" maxlength="80"><label for="c1">Su WhatsApp o correo</label><input id="c1" inputmode="email" autocomplete="tel" maxlength="120"><label for="m1">¿Qué cultivo trabaja? <span class="hint">Opcional.</span></label><input id="m1" maxlength="120">' +
            '<p class="err hide" id="e1" role="alert"></p><p class="ok hide" id="o1" role="status"></p><button class="btn sol" type="submit" style="margin-top:14px">Pedir mi código de prueba</button>' + (S.cfg.whatsapp ? '<a class="btn ghost" style="margin-top:10px" target="_blank" rel="noopener" href="https://wa.me/' + S.cfg.whatsapp + '?text=' + encodeURIComponent('Hola, quiero probar las calculadoras de Cuentas de finca.') + '">Pedirla por WhatsApp</a>' : '') + '</form></section>' +
            '' + payHtml(false, 'Si ya la probó y quiere pagar, haga el SINPE y avíseme aquí. Si no tiene código todavía, pida la prueba primero.');
        $('#fCod').addEventListener('submit', function (ev) { ev.preventDefault(); entrar($('#cod').value); });
        $('#fPrueba').addEventListener('submit', function (ev) {
            ev.preventDefault(); var e = $('#e1'), o = $('#o1'), btn = ev.target.querySelector('button[type=submit]'); e.classList.add('hide'); o.classList.add('hide'); btn.disabled = true;
            api('agro-pedir', { tipo: 'prueba', nombre: $('#n1').value, contacto: $('#c1').value, mensaje: 'Cultivo: ' + ($('#m1').value || '—'), ua: UA }).then(function (j) {
                btn.disabled = false; if (j.ok) { o.textContent = 'Listo. Le escribo pronto con su código de prueba.'; o.classList.remove('hide'); } else { e.textContent = j.error || 'No se pudo enviar.'; e.classList.remove('hide'); }
            });
        });
        wirePay();
    }
    function entrar(raw) {
        var codigo = String(raw || '').trim(); if (!codigo) return gate('Escriba su código.');
        api('agro-estado', { codigo: codigo }).then(function (j) {
            if (j.__status === 200) { S.code = j.codigo; S.est = j; LS.set('agro_code', j.codigo); app(); } else { gate(j.error || 'No se pudo revisar el código.'); }
        });
    }

    // ---------- pantalla de trabajo ----------
    function nudge() {
        var e = S.est, out = e.vencido || e.restantes <= 0, low = e.restantes <= 2, prueba = e.tipo === 'prueba';
        if (out) return payHtml(true, e.vencido ? 'Su código venció. Pague y se lo recargo: los créditos que le sobraron se suman.' : 'Se le acabaron los créditos. Pague y se los recargo en su mismo código.');
        if (prueba || e.restantes <= 5) return '<section class="card flat"><p style="margin:0">' + (prueba ? '<b>Está en la prueba gratis</b> (' + h(venceTxt(e.vence)) + '). ' : '<b>Le quedan pocos créditos.</b> ') + 'No espere a que se acaben: si paga ahora, <b>lo que le sobre se suma</b> y sigue sin parar.</p><button class="btn' + (low ? ' sol' : ' ghost') + ' sm" style="margin-top:10px" type="button" id="verPaq">Ver paquetes y pagar</button></section>';
        return '';
    }
    function app() {
        paintChip();
        root.innerHTML = '<div class="tabs" role="tablist"><button role="tab" id="t-mezcla" aria-selected="' + (S.tab === 'mezcla') + '">Mezcla de fumigación</button><button role="tab" id="t-costos" aria-selected="' + (S.tab === 'costos') + '">Costos y precio</button></div>' +
            '<div id="tool"></div><div id="nudge">' + nudge() + '</div><div id="payslot">' + (S.est.vencido || S.est.restantes <= 0 ? '' : payHtml(false)) + '</div><p class="note">Los resultados son una ayuda de cálculo. En fumigación, la dosis, el equipo de protección y los días de espera antes de cosechar son los que dice la etiqueta del producto y su asistente técnico.</p>';
        $('#t-mezcla').onclick = function () { S.tab = 'mezcla'; S.last = null; app(); }; $('#t-costos').onclick = function () { S.tab = 'costos'; S.last = null; app(); };
        var vp = $('#verPaq'); if (vp) vp.onclick = function () { var slot = $('#payslot'); if (!$('#pagar')) { slot.innerHTML = payHtml(false); wirePay(); } goPay(); };
        if (S.tab === 'mezcla') formMezcla(); else formCostos();
        wirePay();
    }
    function done(j, onOk) {
        var btn = $('#go'); if (btn) btn.disabled = false; var e = $('#err');
        if (j.__status === 200) { S.est.restantes = j.restantes; if (j.vence) S.est.vence = j.vence; if (j.creditos != null) S.est.creditos = j.creditos; S.est.vencido = false; paintChip(); onOk(j.resultado); $('#nudge').innerHTML = nudge(); var vp = $('#verPaq'); if (vp) vp.onclick = function () { var slot = $('#payslot'); if (!$('#pagar')) { slot.innerHTML = payHtml(false); wirePay(); } goPay(); }; if (S.est.restantes <= 0) { $('#payslot').innerHTML = ''; $('#nudge').innerHTML = nudge(); wirePay(); } return; }
        e.textContent = j.error || 'No se pudo calcular.'; e.classList.remove('hide');
        if (j.motivo === 'vencido' || j.motivo === 'sin_creditos') { S.est.vencido = j.motivo === 'vencido'; if (j.motivo === 'sin_creditos') S.est.restantes = 0; paintChip(); $('#nudge').innerHTML = nudge(); $('#payslot').innerHTML = ''; wirePay(); setTimeout(goPay, 100); }
        if (j.motivo === 'no_existe') { LS.del('agro_code'); gate(j.error); }
    }
    function copyBtns(texto) {
        return '<div class="copy"><button class="btn ghost sm" type="button" id="cp">Copiar resultado</button><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto) + '">Enviar por WhatsApp</a></div>';
    }
    function wireCopy(texto) { var b = $('#cp'); if (b) b.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(function () { b.textContent = 'Copiado'; }, function () { b.textContent = 'No se pudo copiar'; }); }; }

    // ----- mezcla -----
    function formMezcla() {
        $('#tool').innerHTML = '<form class="card" id="fm" novalidate><h2>¿Cuánto echo en la bomba?</h2><p class="sub">Escriba lo que dice la etiqueta del producto.</p>' +
            '<label for="producto">Producto <span class="hint">Opcional, para el resumen.</span></label><input id="producto" maxlength="60">' +
            '<label for="modo">La etiqueta da la dosis…</label><select id="modo"><option value="por_100l">por cada 100 litros de agua</option><option value="por_ha">por hectárea</option><option value="por_bomba">por bomba</option></select>' +
            '<div class="row"><div><label for="dosis">Dosis</label><input id="dosis" inputmode="decimal" placeholder="250"></div><div class="fix"><label for="up">Unidad</label><select id="up"><option value="ml">mL</option><option value="l">litros</option><option value="g">gramos</option><option value="kg">kilos</option></select></div></div>' +
            '<label for="bomba">Capacidad de su bomba (litros)</label><input id="bomba" inputmode="decimal" value="20"><div class="chips" id="bchips">' + [16, 20, 25].map(function (n) { return '<button type="button" data-v="' + n + '">' + n + ' L</button>'; }).join('') + '</div>' +
            '<label for="gasto">Litros de mezcla que gasta por hectárea <span class="hint">Si no lo sabe: cuente cuántas bombas gasta en un lote que conozca y multiplíquelo por los litros de la bomba.</span></label><input id="gasto" inputmode="decimal" placeholder="400">' +
            '<div class="row"><div><label for="area">Tamaño del lote</label><input id="area" inputmode="decimal" placeholder="0,5"></div><div class="fix"><label for="au">Unidad</label><select id="au"><option value="ha">hectáreas</option><option value="mz">manzanas</option><option value="m2">m²</option></select></div></div>' +
            '<details><summary>¿Cuánto me cuesta? (opcional)</summary><div class="row"><div><label for="pe">Precio del envase (₡)</label><input id="pe" inputmode="numeric" placeholder="12.000"></div><div><label for="te">Trae</label><input id="te" inputmode="decimal" placeholder="1"></div><div class="fix"><label for="ue">Unidad</label><select id="ue"><option value="l">litros</option><option value="ml">mL</option><option value="kg">kilos</option><option value="g">gramos</option></select></div></div></details>' +
            '<p class="err hide" id="err" role="alert"></p><button class="btn" id="go" type="submit" style="margin-top:12px">Calcular · usa 1 crédito</button></form><div id="out" aria-live="polite"></div>';
        $('#bchips').onclick = function (ev) { var b = ev.target.closest('button'); if (b) $('#bomba').value = b.getAttribute('data-v'); };
        $('#fm').onsubmit = function (ev) {
            ev.preventDefault(); $('#err').classList.add('hide'); $('#go').disabled = true;
            api('agro-usar', { codigo: S.code, herramienta: 'mezcla', datos: { producto: $('#producto').value, modo: $('#modo').value, dosis: cant($('#dosis').value), unidad_producto: $('#up').value, bomba_l: cant($('#bomba').value), gasto_l_ha: cant($('#gasto').value), area: cant($('#area').value), area_unidad: $('#au').value, precio_envase: monto($('#pe').value), tamano_envase: cant($('#te').value), unidad_envase: $('#ue').value } })
                .then(function (j) { done(j, showMezcla); });
        };
        if (S.last && S.last.herramienta === 'mezcla') showMezcla(S.last);
    }
    function showMezcla(r) {
        S.last = r; var b = r.bombas, pb = r.por_bomba;
        var linea = b.llenas + (b.llenas === 1 ? ' bomba llena' : ' bombas llenas') + (r.ultima_bomba ? ' y una última de ' + dec(r.ultima_bomba.litros) + ' L (con ' + dec(r.ultima_bomba.cantidad) + ' ' + r.ultima_bomba.unidad + ')' : '');
        var texto = (r.producto ? r.producto + ': ' : 'Mezcla: ') + 'por bomba de ' + r.bomba_l + ' L echar ' + dec(pb.cantidad) + ' ' + pb.unidad + '. Lote de ' + dec(r.area_ha) + ' ha: ' + linea + '. Producto total: ' + dec(r.total.cantidad) + ' ' + r.total.unidad + (r.costo ? '. Costo aprox.: ' + money(r.costo.total) : '') + '. (Cuentas de finca)';
        $('#out').innerHTML = '<div class="res"><div class="big"><span class="lbl">' + h(r.producto ? r.producto + ' · ' : '') + 'por cada bomba de ' + dec(r.bomba_l) + ' L, eche</span><span class="num">' + dec(pb.cantidad) + ' <small>' + h(pb.unidad) + '</small></span></div><div class="body">' +
            '<div class="kv"><span>Bombas que necesita</span><b>' + h(linea) + '</b></div>' +
            '<div class="kv"><span>Mezcla total</span><b>' + dec(r.mezcla_total_l) + ' L</b></div>' +
            '<div class="kv"><span>Producto en todo el lote</span><b>' + dec(r.total.cantidad) + ' ' + h(r.total.unidad) + '</b></div>' +
            '<div class="kv"><span>Por cada litro de mezcla</span><b>' + dec(r.por_litro.cantidad) + ' ' + h(r.por_litro.unidad) + '</b></div>' +
            (r.costo ? '<div class="kv"><span>Costo del producto en el lote</span><b>' + money(r.costo.total) + '</b></div><div class="kv"><span>Costo por bomba · por hectárea</span><b>' + money(r.costo.por_bomba) + ' · ' + money(r.costo.por_ha) + '</b></div><div class="kv"><span>Envases que gasta</span><b>' + dec(r.costo.envases) + '</b></div>' : '') +
            r.avisos.map(function (a) { return '<div class="aviso">' + h(a) + '</div>'; }).join('') + copyBtns(texto) + '</div></div>';
        wireCopy(texto); $('#out').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ----- costos -----
    var CATS = { insumos: 'Insumos', mano_obra: 'Mano de obra', alquiler: 'Alquiler o tierra', transporte: 'Transporte y empaque', maquinaria: 'Maquinaria y combustible', otros: 'Otros' };
    var QUICK = [['Semilla', 'insumos'], ['Abono', 'insumos'], ['Agroquímicos', 'insumos'], ['Jornales', 'mano_obra'], ['Alquiler', 'alquiler'], ['Transporte', 'transporte'], ['Combustible', 'maquinaria']];
    function rowHtml(r, i) {
        return '<div class="costrow" data-i="' + i + '"><select aria-label="Tipo de costo">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (k === r.cat ? ' selected' : '') + '>' + CATS[k] + '</option>'; }).join('') + '</select><input class="cn" aria-label="Concepto" placeholder="Concepto" maxlength="60" value="' + h(r.concepto) + '"><input class="m cm" aria-label="Monto en colones" inputmode="numeric" placeholder="₡ monto" value="' + h(r.monto) + '"><button class="x" type="button" aria-label="Quitar este costo">×</button></div>';
    }
    function readRows() { S.rows = Array.prototype.map.call(document.querySelectorAll('.costrow'), function (el) { return { cat: el.querySelector('select').value, concepto: el.querySelector('.cn').value, monto: el.querySelector('.cm').value }; }); }
    function paintRows() { $('#rows').innerHTML = S.rows.map(rowHtml).join(''); }
    function formCostos() {
        if (!S.rows.length) S.rows = [{ cat: 'insumos', concepto: '', monto: '' }, { cat: 'mano_obra', concepto: '', monto: '' }];
        $('#tool').innerHTML = '<form class="card" id="fc" novalidate><h2>¿A qué precio no pierdo?</h2><p class="sub">Sume lo que gastó o va a gastar en un ciclo de cosecha.</p>' +
            '<label for="cultivo">Cultivo <span class="hint">Opcional.</span></label><input id="cultivo" maxlength="60">' +
            '<div class="row"><div><label for="area">Área <span class="hint">Opcional.</span></label><input id="area" inputmode="decimal" placeholder="1"></div><div class="fix"><label for="au">Unidad</label><select id="au"><option value="ha">hectáreas</option><option value="mz">manzanas</option><option value="m2">m²</option></select></div></div>' +
            '<div class="row"><div><label for="rend">Cosecha esperada</label><input id="rend" inputmode="decimal" placeholder="200"></div><div class="fix"><label for="uv">Unidad de venta</label><input id="uv" placeholder="quintal" maxlength="20"></div></div>' +
            '<label for="merma">Pérdida o merma (%) <span class="hint">Lo que se daña o no se vende.</span></label><input id="merma" inputmode="decimal" value="5">' +
            '<h3 style="margin-top:20px">Costos del ciclo</h3><div class="chips" id="quick">' + QUICK.map(function (q, i) { return '<button type="button" data-i="' + i + '">+ ' + q[0] + '</button>'; }).join('') + '</div><div id="rows"></div><button class="btn ghost sm" type="button" id="addRow" style="margin-top:10px">+ Otro costo</button>' +
            '<label for="precio" style="margin-top:20px">Precio al que vende hoy <span class="hint">Opcional. Con esto le digo cuánto gana o pierde.</span></label><input id="precio" inputmode="numeric" placeholder="₡ por unidad">' +
            '<label for="margen">Ganancia que quiere sobre el costo (%)</label><input id="margen" inputmode="decimal" value="25">' +
            '<p class="err hide" id="err" role="alert"></p><button class="btn" id="go" type="submit" style="margin-top:12px">Calcular · usa 1 crédito</button></form><div id="out" aria-live="polite"></div>';
        paintRows();
        $('#rows').addEventListener('click', function (ev) { if (ev.target.classList.contains('x')) { readRows(); S.rows.splice(Number(ev.target.closest('.costrow').getAttribute('data-i')), 1); paintRows(); } });
        $('#addRow').onclick = function () { readRows(); S.rows.push({ cat: 'otros', concepto: '', monto: '' }); paintRows(); };
        $('#quick').onclick = function (ev) { var b = ev.target.closest('button'); if (!b) return; readRows(); var q = QUICK[Number(b.getAttribute('data-i'))]; var vacio = S.rows.filter(function (r) { return !r.concepto && !r.monto; })[0]; if (vacio) { vacio.concepto = q[0]; vacio.cat = q[1]; } else S.rows.push({ cat: q[1], concepto: q[0], monto: '' }); paintRows(); var ins = document.querySelectorAll('.costrow .cm'); ins[ins.length - 1].focus(); };
        $('#fc').onsubmit = function (ev) {
            ev.preventDefault(); readRows(); $('#err').classList.add('hide'); $('#go').disabled = true;
            var costos = S.rows.filter(function (r) { return r.concepto || r.monto; }).map(function (r) { return { cat: r.cat, concepto: r.concepto, monto: monto(r.monto) }; });
            api('agro-usar', { codigo: S.code, herramienta: 'costos', datos: { cultivo: $('#cultivo').value, area: cant($('#area').value), area_unidad: $('#au').value, rendimiento: cant($('#rend').value), unidad_venta: $('#uv').value, merma_pct: cant($('#merma').value), costos: costos, precio_actual: monto($('#precio').value), margen_pct: cant($('#margen').value) } })
                .then(function (j) { done(j, showCostos); });
        };
        if (S.last && S.last.herramienta === 'costos') showCostos(S.last);
    }
    function showCostos(r) {
        S.last = r; var u = r.unidad, v = r.venta;
        var texto = (r.cultivo ? r.cultivo + ': ' : '') + 'costo total ' + money(r.costo_total) + '; costo por ' + u + ' ' + money(r.costo_unidad) + '. Precio mínimo para no perder: ' + money(r.precio_minimo) + ' por ' + u + '. Con ' + r.margen_pct + '% de ganancia: ' + money(r.precio_sugerido) + (v ? '. A ' + money(v.precio) + ' ' + (v.utilidad >= 0 ? 'gana ' : 'pierde ') + money(Math.abs(v.utilidad)) : '') + '. (Cuentas de finca)';
        $('#out').innerHTML = '<div class="res"><div class="big"><span class="lbl">' + h(r.cultivo ? r.cultivo + ' · ' : '') + 'para no perder, venda a más de</span><span class="num">' + money(r.precio_minimo) + ' <small>por ' + h(u) + '</small></span></div><div class="body">' +
            '<div class="kv"><span>Con ' + dec(r.margen_pct) + '% de ganancia</span><b>' + money(r.precio_sugerido) + ' por ' + h(u) + '</b></div>' +
            '<div class="kv"><span>Costo total del ciclo</span><b>' + money(r.costo_total) + '</b></div>' +
            '<div class="kv"><span>Cosecha que sí se vende</span><b>' + dec(r.vendible) + ' ' + h(u) + '</b></div>' +
            (r.costo_ha ? '<div class="kv"><span>Costo por hectárea</span><b>' + money(r.costo_ha) + '</b></div><div class="kv"><span>Cosecha por hectárea</span><b>' + dec(r.rendimiento_ha) + ' ' + h(u) + '</b></div>' : '') +
            '<h3 style="margin-top:14px">En qué se va la plata</h3>' + r.por_categoria.map(function (c) { return '<div class="kv" style="border:0;padding-bottom:0"><span>' + h(CATS[c.cat] || c.nombre) + '</span><b>' + money(c.total) + ' · ' + dec(c.pct) + '%</b></div><div class="bar"><i style="width:' + Math.max(2, c.pct) + '%"></i></div>'; }).join('') +
            (v ? '<h3 style="margin-top:14px">Si vende a ' + money(v.precio) + ' por ' + h(u) + '</h3><div class="kv"><span>' + (v.utilidad >= 0 ? 'Gana' : 'Pierde') + ' en el ciclo</span><b class="' + (v.utilidad < 0 ? 'neg' : '') + '">' + money(Math.abs(v.utilidad)) + '</b></div><div class="kv"><span>Por cada ' + h(u) + '</span><b class="' + (v.utilidad_unidad < 0 ? 'neg' : '') + '">' + (v.utilidad_unidad < 0 ? '−' : '') + money(Math.abs(v.utilidad_unidad)) + '</b></div><div class="kv"><span>Tiene que vender al menos</span><b>' + dec(v.equilibrio_unidades) + ' ' + h(u) + '</b></div>' +
                (v.caida_max_pct > 0 ? '<div class="kv"><span>El precio puede bajar hasta</span><b>' + dec(v.caida_max_pct) + '%</b></div>' : '') +
                '<table style="margin-top:8px"><tr><th>Si el precio cambia</th><th>Precio</th><th>Ganancia</th></tr>' + v.escenarios.map(function (s) { return '<tr><td>' + (s.cambio_pct > 0 ? '+' : '') + s.cambio_pct + '%</td><td>' + money(s.precio) + '</td><td class="' + (s.utilidad < 0 ? 'neg' : '') + '">' + (s.utilidad < 0 ? '−' : '') + money(Math.abs(s.utilidad)) + '</td></tr>'; }).join('') + '</table>' : '') +
            r.avisos.map(function (a) { return '<div class="aviso">' + h(a) + '</div>'; }).join('') + copyBtns(texto) + '</div></div>';
        wireCopy(texto); $('#out').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    salir.onclick = function () { LS.del('agro_code'); S.code = ''; S.est = null; S.last = null; S.rows = []; gate(); };
    // ---------- inicio ----------
    function start() {
        api('agro-config', {}).then(function (c) {
            if (!c.packs) { root.innerHTML = '<p class="err" style="padding-top:24px">No se pudo cargar. Revise su internet e intente de nuevo.</p>'; return; }
            S.cfg = c; var q = new URLSearchParams(location.search).get('c'), guardado = q || LS.get('agro_code');
            if (q) history.replaceState(null, '', location.pathname);
            if (guardado) { api('agro-estado', { codigo: guardado }).then(function (j) { if (j.__status === 200) { S.code = j.codigo; S.est = j; LS.set('agro_code', j.codigo); app(); } else { LS.del('agro_code'); gate(q ? j.error : ''); } }); } else gate();
        });
    }
    start();
})();
