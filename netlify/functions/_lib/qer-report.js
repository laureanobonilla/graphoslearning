// «Tu informe» de ¿Quién eres?: el correo con el resultado, pensado como un informe bonito (colores por capítulo, citas
// destacadas, carta final) y con un cierre que invita —sin presionar— a una contribución voluntaria.
// HTML de correo: tablas y estilos en línea (Gmail/Outlook no leen CSS externo), con colores sólidos de respaldo.
//
// Enlace de contribución: variable QER_CONTRIB_URL en Netlify.
//  · Si es de PayPal.me (https://paypal.me/usuario) salen tres botones ($5, $10, $20) que abren PayPal con el monto puesto.
//  · Cualquier otro enlace sale como un solo botón «Contribuir».
//  · Si no hay enlace, el bloque se muestra sin botón (y se invita a responder el correo).
const { esc } = require('./qer-email');

const SUGGESTED = 20;
const AMOUNTS = [5, 10, 20];
const PALETTE = [
    { bg: '#fdf0e7', bar: '#e07a5f', ink: '#8a3b25', icon: '🎭' },
    { bg: '#eaf3f0', bar: '#3d8b7d', ink: '#1f5148', icon: '🌿' },
    { bg: '#f1ecfa', bar: '#7c5cc4', ink: '#47307f', icon: '🌙' },
    { bg: '#fdf6dc', bar: '#d9a521', ink: '#7a5a07', icon: '☀️' },
    { bg: '#fbe9ee', bar: '#d6577b', ink: '#7e2740', icon: '💗' },
    { bg: '#e8f1fb', bar: '#3f7fc4', ink: '#1f4b7a', icon: '🌊' },
    { bg: '#eef5e4', bar: '#76a33f', ink: '#44601d', icon: '🍃' },
    { bg: '#fdeedd', bar: '#e08b35', ink: '#7d4510', icon: '🔥' },
    { bg: '#efeaf6', bar: '#9068b3', ink: '#53357a', icon: '✨' },
    { bg: '#e6f4f4', bar: '#3a9aa0', ink: '#1c5a5f', icon: '🧭' }
];

const paras = (txt) => String(txt || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
const FONT = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

// Primera frase corta del capítulo, para destacarla como cita.
function pullQuote(text) {
    const first = paras(text)[0] || '';
    const m = first.match(/^(.{40,170}?[.!?…])(\s|$)/);
    return m ? m[1] : '';
}

// Costa Rica: solo SINPE Móvil (₡10 000 / ₡5 000 / ₡2 500). Resto del mundo: se muestra el monto en la moneda del país y,
// entre paréntesis, los USD exactos que debe escribir en PayPal (el enlace cobra en USD). Las tasas son aproximadas.
const SUGGESTED_CRC = 10000, AMOUNTS_CRC = [10000, 5000, 2500];
const LOCAL = { // país: [código de moneda, unidades locales por 1 USD, redondeo]
    MX: ['MXN', 18, 10], CO: ['COP', 4000, 1000], CL: ['CLP', 950, 100], PE: ['PEN', 3.7, 1], AR: ['ARS', 1200, 500],
    UY: ['UYU', 40, 10], BO: ['BOB', 6.9, 1], PY: ['PYG', 7500, 1000], GT: ['GTQ', 7.7, 1], HN: ['HNL', 25, 5],
    NI: ['NIO', 36.5, 5], DO: ['DOP', 60, 10], ES: ['EUR', 0.92, 1]
};
const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function localOptions(country) {
    const c = LOCAL[country];
    if (!c) return null;
    return AMOUNTS.map(usd => {
        const step = c[2];
        const local = Math.max(step, Math.round(usd * c[1] / step) * step);
        return { usd, label: `${c[0]} ${money(local)}`, main: usd === SUGGESTED };
    });
}

function contribLinks(url) {
    if (!url) return [];
    if (/paypal\.me\//i.test(url)) {
        const base = url.replace(/\/+$/, '').replace(/\/\d+(\.\d+)?[A-Za-z]{0,3}$/, '');
        return AMOUNTS.map(a => ({ amount: a, href: `${base}/${a}USD`, main: a === SUGGESTED }));
    }
    return [{ amount: null, href: url, main: true }];
}

function contributionHtml(url, country, sinpe) {
    const pill = (txt, main, href) => {
        const style = main ? 'background:#7c2d37;color:#ffffff;font-size:17px;padding:13px 26px;' : 'background:#ffffff;color:#7c2d37;border:2px solid #7c2d37;font-size:15px;padding:11px 20px;';
        const tag = href ? 'a' : 'span';
        return `<${tag}${href ? ` href="${esc(href)}"` : ''} style="display:inline-block;margin:5px 4px;border-radius:999px;font-family:${SANS};font-weight:700;text-decoration:none;${style}">${txt}</${tag}>`;
    };
    const intro = `<p style="font-size:16px;line-height:1.65;color:#4a3a36;margin:0 0 10px">Este informe lo escribimos solo para ti. Su valor real es de <b>${country === 'CR' ? '₡' + money(SUGGESTED_CRC) : '$' + SUGGESTED}</b>, pero no lo cobramos: <b>léelo primero</b>, y si sientes que te sirvió, puedes hacer una contribución del monto que prefieras.</p>
<p style="font-size:16px;line-height:1.65;color:#4a3a36;margin:0 0 14px">Lo que aportes también ayuda a que otras personas puedan recibir un informe como este. Y si hoy no te es posible o no te dijo nada útil, no hay ningún compromiso: el informe es tuyo igual.</p>`;
    let body;
    if (country === 'CR') {
        const num = sinpe && sinpe.number;
        body = `<div style="margin:6px 0 8px">${AMOUNTS_CRC.map(a => pill('₡' + money(a), a === SUGGESTED_CRC)).join('')}</div>
<p style="font-size:15.5px;line-height:1.6;color:#4a3a36;margin:0">${num ? `Por <b>SINPE Móvil</b> al <b>${esc(num)}</b>${sinpe.name ? ` (a nombre de ${esc(sinpe.name)})` : ''}. Si quieres, responde este correo con el comprobante para darte las gracias.` : 'Si quieres contribuir, responde este correo y te damos los datos del SINPE Móvil.'}</p>`;
    } else {
        const opts = localOptions(country);
        const links = contribLinks(url);
        if (opts && url) {
            body = `<p style="font-size:15px;line-height:1.6;color:#4a3a36;margin:0 0 6px">Elige un monto (el pago se hace en dólares; escribe la cifra en USD que ves entre paréntesis):</p>
<div style="margin:6px 0 8px">${opts.map(o => pill(`${esc(o.label)} <span style="font-weight:400">(US$${o.usd})</span>`, o.main)).join('')}</div>
<div style="margin:4px 0 6px">${pill('Contribuir con PayPal', true, links[0].href)}</div>`;
        } else {
            const btns = links.map(l => pill(l.amount ? '$' + l.amount : 'Contribuir', l.main, l.href)).join('');
            body = btns ? `<div style="margin:6px 0 4px">${btns}</div>` : `<p style="font-size:15px;color:#7c2d37;margin:6px 0 0">Si quieres contribuir, responde este correo y te decimos cómo.</p>`;
        }
    }
    return `<tr><td style="padding:8px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ef;border:1px solid #ecd9bd;border-radius:18px"><tr><td style="padding:26px 24px;text-align:center;font-family:${FONT}">
<div style="font-size:26px">🤍</div>
<h2 style="font-size:21px;margin:6px 0 10px;color:#5a2a2f;font-weight:normal">Si esto te ayudó, puedes devolver el abrazo</h2>
${intro}${body}
</td></tr></table></td></tr>`;
}

// Cierre pensado en cuatro pasos: una pregunta de un solo toque («¿qué tanto te sentiste visto/a?»). Cada carita abre una página
// de agradecimiento (quien-eres/gracias) que responde según lo que sintió y es donde está el aporte. Sin botones de pago aquí.
const FACES = [['😕', 'Nada', 1], ['😐', 'Poco', 2], ['🙂', 'Algo', 3], ['😊', 'Bastante', 4], ['🥹', 'Mucho', 5]];
function feedbackHtml(base, readingId, country) {
    const href = (n) => `${base}/quien-eres/gracias/?r=${encodeURIComponent(readingId)}${n ? '&s=' + n : ''}${country ? '&c=' + encodeURIComponent(country) : ''}`;
    const cells = FACES.map(([e, l, n]) => `<td align="center" style="padding:0 3px"><a href="${esc(href(n))}" style="display:block;text-decoration:none;background:#ffffff;border:1px solid #e8d3b3;border-radius:16px;padding:10px 0;width:100%"><span style="font-size:28px;line-height:34px;display:block">${e}</span><span style="font-family:${SANS};font-size:12px;color:#6b4a3f;display:block;padding-top:2px">${l}</span></a></td>`).join('');
    return `<tr><td style="padding:12px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ef;border:1px solid #ecd9bd;border-radius:18px"><tr><td style="padding:26px 18px;text-align:center;font-family:${FONT}">
<div style="font-size:24px">🤍</div>
<h2 style="font-size:21px;margin:6px 0 8px;color:#5a2a2f;font-weight:normal">¿Qué tanto te sentiste visto/a al leerlo?</h2>
<p style="font-size:15.5px;line-height:1.6;color:#6b5a55;margin:0 0 14px">Toca una carita. Es un solo toque y me ayuda a saber si esto de verdad sirve.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
<p style="font-size:14.5px;line-height:1.6;color:#6b5a55;margin:16px 0 0">Si lo que leíste te sirvió y quieres ayudar a que más personas reciban un informe así, <a href="${esc(href(0))}" style="color:#7c2d37">aquí puedes aportar lo que sientas justo</a>. No es un cobro: el informe es tuyo igual.</p>
</td></tr></table></td></tr>`;
}

function renderReport(view, link, opts) {
    const o = opts || {};
    const name = view.archetypeName || 'Tu informe';
    const letter = view.letter && Array.isArray(view.letter.paragraphs) && view.letter.paragraphs.length ? view.letter : null;
    const nodes = Array.isArray(view.nodes) ? view.nodes : [];
    const p = view.profile;
    const rows = [];

    // Portada
    rows.push(`<tr><td style="background:#3b1d2e;background-image:linear-gradient(135deg,#3b1d2e,#7c2d37 60%,#c0653f);padding:44px 28px 38px;text-align:center;font-family:${FONT}">
<div style="font-size:13px;letter-spacing:2px;color:#f3d9c4;font-family:${SANS}">TU INFORME PERSONAL</div>
<h1 style="font-size:34px;line-height:1.2;margin:14px 0 12px;color:#ffffff;font-weight:normal">${esc(name)}</h1>
${view.hookLine ? `<p style="font-size:18px;line-height:1.55;font-style:italic;color:#fbe6d6;margin:0 auto;max-width:440px">${esc(view.hookLine)}</p>` : ''}
</td></tr>`);

    // Bienvenida
    const greet = letter && letter.greeting ? letter.greeting : 'Gracias por dedicarte este rato.';
    rows.push(`<tr><td style="padding:30px 28px 6px;font-family:${FONT};font-size:17px;line-height:1.7;color:#3a2e2c">
<p style="margin:0 0 12px">${esc(greet)}</p>
<p style="margin:0;color:#6b5a55;font-size:15px">Aquí tienes lo que vimos en tus respuestas, en ${nodes.length || 'varios'} capítulos. Tómate tu tiempo: no hay prisa y no hay nada que aprobar.</p></td></tr>`);

    // Perfil (si existe)
    if (p && Array.isArray(p.traits) && p.traits.length) {
        rows.push(`<tr><td style="padding:18px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ec;border-radius:16px"><tr><td style="padding:20px 22px;font-family:${SANS}">
<div style="font-family:${FONT};font-size:19px;color:#5a2a2f;margin-bottom:10px">Tu mapa de rasgos</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${p.traits.map(x => `<tr><td style="padding:4px 0;width:36%;font-size:14px;color:#4a3a36">${esc(x.name)}</td><td style="padding:4px 0"><div style="background:#eadfc9;height:9px;border-radius:5px"><div style="background:#c0653f;height:9px;border-radius:5px;width:${Math.max(4, Math.min(100, x.score))}%"></div></div></td><td style="padding:4px 0 4px 8px;width:34px;text-align:right;font-size:13px;color:#7a6a64">${x.score}</td></tr>`).join('')}</table>
${p.keyword ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:16px;color:#4a3a36"><b>Tu palabra:</b> ${esc(p.keyword)}</p>` : ''}
${p.quote ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:16px;color:#4a3a36"><b>La frase que te define:</b> <i>${esc(p.quote)}</i></p>` : ''}
</td></tr></table></td></tr>`);
    }

    // Capítulos
    nodes.forEach((n, i) => {
        const c = PALETTE[i % PALETTE.length];
        const quote = pullQuote(n.text);
        rows.push(`<tr><td style="padding:14px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};border-radius:18px;border-left:6px solid ${c.bar}"><tr><td style="padding:22px 22px 20px;font-family:${FONT}">
<div style="font-family:${SANS};font-size:12px;letter-spacing:1.5px;color:${c.ink};opacity:.85">CAPÍTULO ${i + 1}</div>
<h2 style="font-size:23px;line-height:1.3;margin:6px 0 12px;color:${c.ink};font-weight:normal"><span style="font-size:22px">${c.icon}</span> ${esc(n.label)}</h2>
${quote ? `<p style="font-size:18px;line-height:1.55;font-style:italic;color:${c.ink};margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid ${c.bar}">“${esc(quote)}”</p>` : ''}
${paras(n.text).map(x => `<p style="font-size:16.5px;line-height:1.72;color:#352c2a;margin:0 0 12px">${esc(x)}</p>`).join('')}
</td></tr></table></td></tr>`);
    });

    // Carta final
    if (letter) {
        rows.push(`<tr><td style="padding:22px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf8;border:1px solid #e8dcc6;border-radius:18px"><tr><td style="padding:28px 24px;font-family:${FONT}">
<div style="text-align:center;font-size:24px">💌</div>
<h2 style="text-align:center;font-size:22px;margin:6px 0 16px;color:#5a2a2f;font-weight:normal">Una carta, para ti</h2>
${letter.paragraphs.map(x => `<p style="font-size:17px;line-height:1.75;color:#352c2a;margin:0 0 14px">${esc(x)}</p>`).join('')}
${letter.farewell ? `<p style="font-size:17px;line-height:1.7;color:#5a2a2f;font-style:italic;margin:18px 0 0;text-align:right">${esc(letter.farewell)}</p>` : ''}
</td></tr></table></td></tr>`);
    }
    if (view.closingLine) {
        rows.push(`<tr><td style="padding:26px 30px 8px;text-align:center;font-family:${FONT};font-size:21px;line-height:1.5;font-style:italic;color:#7c2d37">${esc(view.closingLine)}</td></tr>`);
    }

    // Contribución
    rows.push(o.feedbackBase && o.readingId ? feedbackHtml(o.feedbackBase, o.readingId, o.country) : contributionHtml(o.contribUrl, o.country, { number: o.sinpeNumber, name: o.sinpeName }));

    // Pie
    rows.push(`<tr><td style="padding:18px 28px 36px;text-align:center;font-family:${SANS};font-size:12px;line-height:1.6;color:#948680">${link ? `<a href="${esc(link)}" style="color:#7c2d37">Volver a abrir tu informe</a><br>` : ''}Es una interpretación simbólica hecha con IA a partir de tus respuestas, para autoconocimiento y reflexión; no es un diagnóstico ni reemplaza a un profesional de la salud mental.<br>Puedes responder este correo cuando quieras.</td></tr>`);

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title></head>
<body style="margin:0;padding:0;background:#f4ede4"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4ede4"><tr><td align="center" style="padding:18px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden">${rows.join('\n')}</table></td></tr></table></body></html>`;

    // Texto plano (respaldo)
    const t = [name, view.hookLine || '', '', letter && letter.greeting || '', ''];
    nodes.forEach((n, i) => { t.push(`${i + 1}. ${n.label}`, '', ...paras(n.text).flatMap(x => [x, ''])); });
    if (letter) { t.push('— Una carta, para ti —', '', ...letter.paragraphs.flatMap(x => [x, '']), letter.farewell || '', ''); }
    if (view.closingLine) t.push(view.closingLine, '');
    if (o.feedbackBase && o.readingId) {
        const h = (n) => `${o.feedbackBase}/quien-eres/gracias/?r=${o.readingId}${n ? '&s=' + n : ''}${o.country ? '&c=' + o.country : ''}`;
        t.push('¿Qué tanto te sentiste visto/a al leerlo? Un toque:', ...FACES.map(([e, l, n]) => `${e} ${l}: ${h(n)}`), '', `Si te sirvió y quieres aportar lo que sientas justo (no es un cobro): ${h(0)}`);
    } else {
    t.push(`Su valor real es de ${o.country === 'CR' ? '₡' + money(SUGGESTED_CRC) : '$' + SUGGESTED}, pero no lo cobramos: si te sirvió, puedes hacer una contribución del monto que prefieras, y eso ayuda a que otras personas reciban un informe como este. Si no, no hay compromiso.`);
        if (o.country === 'CR') t.push(`SINPE Móvil${o.sinpeNumber ? ' al ' + o.sinpeNumber : ''}: ${AMOUNTS_CRC.map(a => '₡' + money(a)).join(' / ')}`);
        else { const lo = localOptions(o.country); if (lo) t.push(lo.map(x => `${x.label} (US$${x.usd})`).join(' / ')); const cl = contribLinks(o.contribUrl); if (cl.length) t.push(...cl.slice(0, lo ? 1 : 3).map(l => `${l.amount && !lo ? '$' + l.amount : 'Contribuir'}: ${l.href}`)); }
    }
    if (link) t.push('', `Volver a abrir tu informe: ${link}`);
    return { subject: `${name}: tu informe, escrito para ti`, html, text: t.join('\n') };
}

module.exports = { renderReport, contribLinks, localOptions };
