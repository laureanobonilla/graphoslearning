// «¿De qué tienes cara?»: piezas compartidas de las funciones cara-*.
// Flujo: la foto llega reducida (base64) a cara-analizar → la IA devuelve veredicto + informe → la FOTO NO SE GUARDA en ningún lado;
// solo se guarda el texto en la tabla cara_jobs (supabase/cara.sql). Gratis: el veredicto. Pagado (PayPal): el informe forense completo.
const { json, UUID_RE, countryOf, ipOf, hashIp } = require('./tc-core');

// >>> EDITA AQUÍ el precio (o pon CARA_PRICE_USD en Netlify). <<<
const PRICE_USD = process.env.CARA_PRICE_USD || '2.99';
const MAX_PER_DAY = Number(process.env.CARA_MAX_PER_DAY || 25);   // análisis gratis por IP cada 24 h (frena abusos, no a la gente normal)
const MAX_IMG_CHARS = 1_400_000;                                  // ~1 MB en base64; el navegador manda ~900 px

// ---------- Supabase (tabla cara_jobs) ----------
function sb() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
async function saveJob(row) {
    const { url, key } = sb();
    const res = await fetch(`${url}/rest/v1/cara_jobs?on_conflict=id`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) });
    if (!res.ok) throw new Error(`cara_jobs HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}
async function getJob(id) {
    const { url, key } = sb();
    const res = await fetch(`${url}/rest/v1/cara_jobs?id=eq.${encodeURIComponent(id)}&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`cara_jobs HTTP ${res.status}`);
    const rows = await res.json(); return rows[0] || null;
}
async function countToday(ipHash) {
    const { url, key } = sb();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await fetch(`${url}/rest/v1/cara_jobs?ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${since}&select=id`, { method: 'HEAD', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } });
    const range = res.headers.get('content-range') || '';   // "0-4/5" o "*/0"
    const n = Number(range.split('/')[1]); return isFinite(n) ? n : 0;
}

// ---------- IA ----------
const SCHEMA = {
    type: 'OBJECT',
    properties: {
        safety: {
            type: 'OBJECT',
            properties: {
                appearsUnder18: { type: 'BOOLEAN', description: 'true si la persona principal parece menor de 18 años.' },
                notAPerson: { type: 'BOOLEAN', description: 'true si no hay ningún rostro humano visible (objeto, animal, paisaje, dibujo, captura de pantalla de texto).' },
                explicit: { type: 'BOOLEAN', description: 'true si hay desnudez, contenido sexual, violencia o sangre.' }
            },
            required: ['appearsUnder18', 'notAPerson', 'explicit']
        },
        veredicto: { type: 'STRING', description: 'Lo que va después de «Tienes cara de». 2 a 8 palabras, sin punto final, sin repetir «cara de».' },
        certeza: { type: 'INTEGER', description: 'Porcentaje de certeza científica del veredicto, entre 71 y 99.' },
        informe: {
            type: 'OBJECT',
            properties: {
                titulo: { type: 'STRING', description: 'Título del informe, estilo expediente forense absurdo.' },
                hallazgos: {
                    type: 'ARRAY', description: 'Exactamente 4 hallazgos sobre zonas o detalles VISIBLES en la foto.',
                    items: { type: 'OBJECT', properties: { zona: { type: 'STRING', description: '2 a 4 palabras: la zona o detalle (ej. «Ceja izquierda», «La pared de atrás»).' }, observacion: { type: 'STRING', description: '1 o 2 frases, tono clínico y serio, contenido absurdo.' } }, required: ['zona', 'observacion'] }
                },
                diagnostico: { type: 'STRING', description: '2 o 3 frases que remachan el veredicto.' },
                pronostico: { type: 'STRING', description: 'Qué le espera a esta cara en los próximos días. 1 o 2 frases.' },
                recomendacion: { type: 'STRING', description: 'Tratamiento recomendado, absurdo. 1 o 2 frases.' },
                otrasCaras: { type: 'ARRAY', description: '3 «caras» secundarias detectadas, cada una de 2 a 7 palabras, sin «cara de».', items: { type: 'STRING' } }
            },
            required: ['titulo', 'hallazgos', 'diagnostico', 'pronostico', 'recomendacion', 'otrasCaras']
        }
    },
    required: ['safety', 'veredicto', 'certeza', 'informe']
};

const PROMPT = `Eres el «Laboratorio Nacional de Caras», un instituto de pura broma. Miras la foto y dices de qué tiene cara la persona.
Es humor para compartir entre amigos: la gente lo usa para reírse de sí misma y de sus amigos.

VEREDICTO (lo único que la persona ve gratis, tiene que dar risa sola, sin explicación):
- Frase corta (2 a 8 palabras) que completa «Tienes cara de…». Ejemplos del tono: «culo», «que te tiraste un pedo en el ascensor», «que debes plata», «que dices "ya voy saliendo" y no te has bañado», «que te comiste el almuerzo ajeno de la refri», «que dejas en visto a tu mamá», «que pides hablar con el gerente», «que pones audios de 7 minutos», «que te ríes de tus propios chistes antes de terminarlos».
- Puede ser un poco vulgar y coloquial latinoamericano («culo», «pedo», «chancletudo»), nada más fuerte que eso.
- Usa «culo» tal cual solo cuando la expresión sea seria, malhumorada o de fastidio; si no, inventa otra. Varía siempre.
- Bása el veredicto en la EXPRESIÓN, el gesto, la pose, la mirada, la ropa, los accesorios y lo que se ve en el fondo.

PROHIBIDO (en el veredicto y en el informe): hablar del peso o la forma del cuerpo, el color de piel, la etnia, el pelo como rasgo étnico, discapacidades, enfermedades, la edad, el género o la orientación, si la persona es fea o bonita, y cualquier cosa sexual. Nada que humille de verdad: es una burla cariñosa, como entre amigos.

INFORME FORENSE (lo que se paga): tono de expediente científico MUY serio con contenido absurdo. Cada hallazgo debe mencionar algo que de verdad se ve en esta foto (una ceja, la mirada, la boca, la camisa, la lámpara del fondo, el ángulo de la selfie), para que la persona sienta que es SOBRE ELLA. Inventa medidas ridículas con números («inclinación de 14 grados», «índice de indignación: 87%»). Que el diagnóstico remache el veredicto.

Escribe en español neutro latinoamericano, tuteando. Si la foto tiene varias personas, analiza la cara más grande. Si no hay rostro humano, si parece menor de 18 años o si hay desnudez o violencia, marca safety y llena el resto con textos mínimos.`;

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function normalizar(d) {
    const inf = d.informe || {};
    let ver = clean(d.veredicto, 90).replace(/^(tienes\s+)?cara\s+de\s+/i, '').replace(/[.。]+$/, '');
    return {
        veredicto: ver,
        certeza: Math.max(71, Math.min(99, Math.round(Number(d.certeza) || 87))),
        informe: {
            titulo: clean(inf.titulo, 120),
            hallazgos: (Array.isArray(inf.hallazgos) ? inf.hallazgos : []).slice(0, 5).map(h => ({ zona: clean(h && h.zona, 40), observacion: clean(h && h.observacion, 320) })).filter(h => h.zona && h.observacion),
            diagnostico: clean(inf.diagnostico, 500),
            pronostico: clean(inf.pronostico, 300),
            recomendacion: clean(inf.recomendacion, 300),
            otrasCaras: (Array.isArray(inf.otrasCaras) ? inf.otrasCaras : []).slice(0, 3).map(s => clean(s, 70).replace(/^cara\s+de\s+/i, '')).filter(Boolean)
        }
    };
}
const valido = (d) => d && d.safety && typeof d.veredicto === 'string' && d.veredicto.trim().length > 1 && d.informe && Array.isArray(d.informe.hallazgos) && d.informe.hallazgos.length >= 3 && d.informe.diagnostico;

// Lo que la persona ve SIN pagar: veredicto, certeza y solo los nombres de las zonas (el gancho), nunca el texto del informe.
const vistaGratis = (job) => ({ jobId: job.id, veredicto: job.veredicto, certeza: job.certeza, zonas: ((job.informe && job.informe.hallazgos) || []).map(h => h.zona), paid: !!job.paid });

function aviso(asunto, texto) {
    if (!process.env.RESEND_API_KEY) return;
    fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || 'bonillapretiz@gmail.com'], subject: asunto, text: texto }) }).catch(() => {});
}

module.exports = { PRICE_USD, MAX_PER_DAY, MAX_IMG_CHARS, SCHEMA, PROMPT, normalizar, valido, vistaGratis, saveJob, getJob, countToday, aviso, json, UUID_RE, countryOf, ipOf, hashIp };
