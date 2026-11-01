// «¿De qué tienes cara?»: piezas compartidas de las funciones cara-*.
// Flujo: la foto llega reducida (base64) a cara-analizar → la IA devuelve veredicto + informe → la FOTO NO SE GUARDA en ningún lado;
// solo se guarda el texto en la tabla cara_jobs (supabase/cara.sql). Gratis: la respuesta (sí o no, al azar). Pagado (PayPal): el porqué, en un informe forense.
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
// La respuesta (sí / no) la decide el SERVIDOR al azar ANTES de llamar a la IA; la IA solo escribe el porqué.
const PROB_SI = Math.max(0, Math.min(1, Number(process.env.CARA_PROB_SI || 0.5)));
const sortear = () => require('crypto').randomInt(1000) < PROB_SI * 1000;

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
        certeza: { type: 'INTEGER', description: 'Porcentaje de certeza científica del veredicto, entre 71 y 99.' },
        informe: {
            type: 'OBJECT',
            properties: {
                titulo: { type: 'STRING', description: 'Título del informe, estilo expediente forense absurdo.' },
                hallazgos: {
                    type: 'ARRAY', description: 'Exactamente 4 hallazgos sobre zonas o detalles VISIBLES en la foto que prueban el veredicto.',
                    items: { type: 'OBJECT', properties: { zona: { type: 'STRING', description: '2 a 4 palabras: la zona o detalle (ej. «Ceja izquierda», «La pared de atrás»).' }, observacion: { type: 'STRING', description: '1 o 2 frases, tono clínico y serio, contenido absurdo.' } }, required: ['zona', 'observacion'] }
                },
                diagnostico: { type: 'STRING', description: '2 o 3 frases que remachan el veredicto.' },
                pronostico: { type: 'STRING', description: 'Qué le espera a esta cara en los próximos días. 1 o 2 frases.' },
                recomendacion: { type: 'STRING', description: 'Tratamiento recomendado, absurdo. 1 o 2 frases.' },
                otrasCaras: { type: 'ARRAY', description: '3 «caras» que esta persona SÍ tiene además (o en lugar) de la del veredicto, cada una de 2 a 7 palabras, sin «cara de».', items: { type: 'STRING' } }
            },
            required: ['titulo', 'hallazgos', 'diagnostico', 'pronostico', 'recomendacion', 'otrasCaras']
        }
    },
    required: ['safety', 'certeza', 'informe']
};

const PROMPT = (si) => `Eres el «Laboratorio Nacional de Caras», un instituto de pura broma. La app hace UNA sola pregunta: «¿Tienes cara de culo?» (en el sentido coloquial: cara de fastidio, de mal humor, de pocos amigos).
El comité ya decidió el veredicto y NO se discute: ${si ? 'SÍ, esta persona TIENE cara de culo.' : 'NO, esta persona NO tiene cara de culo.'}
Tu trabajo es escribir el INFORME FORENSE que lo justifica. Es lo que la persona paga por leer, así que tiene que dar mucha risa y sentirse hecho para ELLA.

- Tono de expediente científico MUY serio, contenido absurdo. Inventa medidas ridículas con números («inclinación de 14 grados», «índice de fastidio: 87%»).
- Cada hallazgo menciona algo que de verdad se ve en ESTA foto: la mirada, una ceja, la boca, la ropa, la lámpara del fondo, el ángulo de la selfie. ${si ? 'Aunque la persona esté sonriendo, encuentra la prueba escondida (una sonrisa «sospechosamente forzada», etc.).' : 'Aunque la persona se vea seria, encuentra por qué en el fondo no lo es.'}
- ${si ? 'Puedes ser un poco vulgar y coloquial latinoamericano («culo», «pedo»), nada más fuerte que eso.' : 'En «otrasCaras» di de qué SÍ tiene cara en cambio (ej. «que debes plata», «que pones audios de 7 minutos»).'}
- PROHIBIDO: hablar del peso o la forma del cuerpo, el color de piel, la etnia, el pelo como rasgo étnico, discapacidades, enfermedades, la edad, el género o la orientación, si es fea o bonita, y cualquier cosa sexual. Es una burla cariñosa, como entre amigos.
- Español neutro latinoamericano, tuteando al lector («tu ceja», «tu mirada»). Si hay varias personas, analiza la cara más grande.
- Si no hay rostro humano, si parece menor de 18 años o si hay desnudez o violencia, marca safety y llena el resto con textos mínimos.`;

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function normalizar(d) {
    const inf = d.informe || {};
    return {
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
const valido = (d) => d && d.safety && d.informe && Array.isArray(d.informe.hallazgos) && d.informe.hallazgos.length >= 3 && d.informe.diagnostico;

// Lo que la persona ve SIN pagar: la respuesta, la certeza y CUÁNTOS hallazgos hay. Ni una palabra del porqué.
const vistaGratis = (job) => ({ jobId: job.id, si: job.veredicto === 'si', certeza: job.certeza, zonas: ((job.informe && job.informe.hallazgos) || []).length, paid: !!job.paid });

function aviso(asunto, texto) {
    if (!process.env.RESEND_API_KEY) return;
    fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || 'bonillapretiz@gmail.com'], subject: asunto, text: texto }) }).catch(() => {});
}

module.exports = { sortear, PRICE_USD, MAX_PER_DAY, MAX_IMG_CHARS, SCHEMA, PROMPT, normalizar, valido, vistaGratis, saveJob, getJob, countToday, aviso, json, UUID_RE, countryOf, ipOf, hashIp };
