// Correo con la lectura completa (Resend). Dos destinatarios posibles:
//  · la persona que pagó (o que pide una copia): remitente QER_FROM_EMAIL. Con el remitente de pruebas de Resend
//    (onboarding@resend.dev, el que se usa si QER_FROM_EMAIL no está) Resend SOLO entrega a la cuenta dueña; para
//    escribirle a clientes hay que verificar un dominio en Resend y poner p. ej. QER_FROM_EMAIL="Quién eres <hola@tudominio.com>".
//  · el dueño (FEEDBACK_TO_EMAIL, por defecto bonillapretiz@gmail.com): copia con todo, para no perder nunca una entrega.
const OWNER = () => process.env.FEEDBACK_TO_EMAIL || 'bonillapretiz@gmail.com';
const FROM_CUSTOMER = () => process.env.QER_FROM_EMAIL || 'Graphikosmos <onboarding@resend.dev>';
const FROM_OWNER = () => 'Graphikosmos <onboarding@resend.dev>';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const isEmail = (s) => typeof s === 'string' && s.length <= 160 && EMAIL_RE.test(s.trim());

const LANG_OF = (format) => (String(format || '').endsWith('-en') ? 'en' : 'es');
const TXT = {
    es: { subject: (a) => `Tu lectura completa${a ? ': ' + a : ''}`, intro: 'Aquí está tu lectura completa. Es tuya para siempre: guarda este correo.', profile: 'Tu perfil', word: 'Tu palabra', phrase: 'La frase que te define', open: 'Volver a abrirla en la página', foot: 'Es una interpretación simbólica con fines de autoconocimiento y entretenimiento; no es un diagnóstico.' },
    en: { subject: (a) => `Your full reading${a ? ': ' + a : ''}`, intro: 'Here is your full reading. It is yours for good: keep this email.', profile: 'Your profile', word: 'Your word', phrase: 'The sentence that defines you', open: 'Open it again on the page', foot: 'This is a symbolic interpretation for self-knowledge and entertainment; it is not a diagnosis.' }
};

// Examen de aptitudes (/aptitud/): otro vocabulario («informe», no «lectura») y otro color de títulos.
TXT.apt = { subject: (a) => `Tu informe de aptitudes${a ? ': ' + a : ''}`, intro: 'Aquí está tu informe completo. Guarda este correo para volver a él cuando lo necesites.', profile: 'Tus aptitudes', word: 'Tu palabra profesional', phrase: 'La frase que te define', open: 'Abrir tu informe en la página', foot: 'Este informe es una orientación basada en tus respuestas; no es una prueba psicométrica oficial ni garantiza ingresos.', color: '#0f766e' };
function render(view, format, link) {
    if (view && view.designed) return require('./qer-report').renderReport(view, link, { contribUrl: process.env.QER_CONTRIB_URL || '' });
    const t = format === 'paid-aptitud-es' ? TXT.apt : TXT[LANG_OF(format)];
    const accent = t.color || '#7c2d37';
    const p = view.profile;
    const paras = (txt) => String(txt || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    const htmlParts = [`<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#222;line-height:1.65">`,
        `<h1 style="font-size:26px;margin:0 0 6px">${esc(view.archetypeName)}</h1>`,
        view.hookLine ? `<p style="color:#666;font-style:italic;margin:0 0 18px">${esc(view.hookLine)}</p>` : '',
        `<p style="color:#555">${esc(t.intro)}</p>`];
    const textParts = [view.archetypeName, view.hookLine, '', t.intro, ''];
    if (p) {
        htmlParts.push(`<h2 style="font-size:18px;margin:26px 0 8px">${esc(t.profile)}</h2><table style="width:100%;border-collapse:collapse">` +
            p.traits.map(x => `<tr><td style="padding:3px 0;width:38%">${esc(x.name)}</td><td><div style="background:#e9e2d0;height:8px;border-radius:4px"><div style="background:#a8873e;height:8px;border-radius:4px;width:${Math.max(4, Math.min(100, x.score))}%"></div></div></td><td style="padding-left:8px;width:36px;text-align:right">${x.score}</td></tr>`).join('') + '</table>');
        textParts.push(t.profile + ':', ...p.traits.map(x => `- ${x.name}: ${x.score}/100`));
        if (p.keyword) { htmlParts.push(`<p><b>${esc(t.word)}:</b> ${esc(p.keyword)}</p>`); textParts.push(`${t.word}: ${p.keyword}`); }
        if (p.quote) { htmlParts.push(`<p><b>${esc(t.phrase)}:</b> <i>${esc(p.quote)}</i></p>`); textParts.push(`${t.phrase}: ${p.quote}`); }
        textParts.push('');
    }
    view.nodes.forEach((n, i) => {
        htmlParts.push(`<h2 style="font-size:20px;margin:30px 0 8px;color:${accent}">${i + 1}. ${esc(n.label)}</h2>` + paras(n.text).map(x => `<p>${esc(x)}</p>`).join(''));
        textParts.push(`${i + 1}. ${n.label}`, '', ...paras(n.text).flatMap(x => [x, '']));
    });
    if (view.closingLine) { htmlParts.push(`<p style="font-size:19px;font-style:italic;text-align:center;margin:34px 0;color:${accent}">${esc(view.closingLine)}</p>`); textParts.push(view.closingLine, ''); }
    if (link) { htmlParts.push(`<p style="text-align:center"><a href="${esc(link)}" style="color:${accent}">${esc(t.open)}</a></p>`); textParts.push(`${t.open}: ${link}`); }
    htmlParts.push(`<p style="color:#999;font-size:12px;margin-top:28px">${esc(t.foot)}</p></div>`);
    textParts.push('', t.foot);
    return { subject: t.subject(view.archetypeName), html: htmlParts.join(''), text: textParts.join('\n') };
}

async function send({ from, to, subject, html, text, replyTo }) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, reason: 'no_resend_key' };
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) })
        });
        if (!res.ok) return { ok: false, reason: `resend_${res.status}`, detail: (await res.text().catch(() => '')).slice(0, 200) };
        return { ok: true };
    } catch (err) { return { ok: false, reason: 'network', detail: String(err.message || err).slice(0, 120) }; }
}

// Manda la lectura a `to` (si hay) y una copia al dueño. Nunca lanza: devuelve el resultado de cada envío.
async function deliverReading({ view, format, to, link, ownerNote, skipOwner }) {
    const m = render(view, format, link);
    const out = { customer: null, owner: null };
    if (to && isEmail(to)) out.customer = await send({ from: FROM_CUSTOMER(), to: to.trim(), subject: m.subject, html: m.html, text: m.text, replyTo: OWNER() });
    const status = to ? `Destinatario: ${to} · entrega al cliente: ${out.customer && out.customer.ok ? 'OK' : 'NO SE PUDO (' + (out.customer ? out.customer.reason : 'correo no válido') + ') — reenvíale este correo'}` : 'Sin correo de cliente (solo copia para ti)';
    const note = [ownerNote, status].filter(Boolean).join(' · ');
    const noteHtml = note ? `<p style="background:#fff7e0;border:1px solid #e6cf8a;padding:8px 10px;font:13px sans-serif">${esc(note)}</p>` : '';
    if (skipOwner) return out;
    out.owner = await send({ from: FROM_OWNER(), to: OWNER(), subject: `[copia] ${m.subject}`, html: noteHtml + m.html, text: (note ? note + '\n\n' : '') + m.text });
    return out;
}

module.exports = { deliverReading, render, isEmail, OWNER, LANG_OF, send, esc, FROM_OWNER, FROM_CUSTOMER };
