// ==========================================
// LECTURA DE UNA PÁGINA WEB (artículo/noticia) → texto plano
// ==========================================
// Reemplaza el intento anterior de leer videos de YouTube (ver
// youtube-transcript.js, que se deja sin usar — YouTube bloquea pedidos desde
// servidores en la nube, así que nunca funcionó de forma confiable). Esto es
// más simple y más robusto: la inmensa mayoría de páginas de artículos/noticias
// SÍ permiten que un servidor las lea (no tienen el mismo nivel de
// anti-bot que YouTube), así que extraemos el texto principal con la misma
// librería que usa el "Modo lectura" de Firefox (@mozilla/readability) y se lo
// pasamos tal cual a generar el esquema — igual que si el usuario hubiera
// pegado ese texto a mano.
//
// No pasa por billing.js: leer la página no le pide nada a Gemini, así que no
// tiene costo en nodos (el costo real llega después, cuando ESE texto se usa
// para generar el esquema, por la función gemini.js de siempre).
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

const MAX_HTML_BYTES = 3 * 1024 * 1024; // 3 MB de HTML es más que suficiente para un artículo
const MAX_TEXT_CHARS = 60000;           // mismo tope que LIMITS.text en _lib/billing.js
const MAX_CONTENT_HTML_CHARS = 200000;  // el HTML con formato pesa más que el texto plano equivalente
const FETCH_TIMEOUT_MS = 12000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const json = (statusCode, obj) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
});

// Dominios de video/redes sociales: casi nunca tienen el texto en el HTML (lo
// cargan con JavaScript después), así que leerlos como "artículo" solo
// produciría basura. Mejor avisar claro en vez de devolver un resultado vacío
// o sin sentido.
const UNSUPPORTED_HOSTS = [
    'youtube.com', 'youtu.be', 'm.youtube.com',
    'vimeo.com', 'tiktok.com', 'instagram.com', 'facebook.com', 'fb.watch',
    'twitter.com', 'x.com', 'spotify.com', 'netflix.com'
];

function isPrivateOrLocalHost(hostname) {
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local')) return true;
    // IPv4 privadas/loopback/link-local básicas — guarda simple contra SSRF,
    // no exhaustiva, pero cubre los casos obvios de alguien pegando una URL
    // interna por error o con mala intención.
    if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.0\.0\.0$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
    return false;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const rawUrl = String(body.url || '').trim();
    if (!rawUrl) return json(400, { error: 'Falta la URL.' });

    let target;
    try { target = new URL(rawUrl); } catch { return json(400, { error: 'Ese enlace no parece válido.' }); }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return json(400, { error: 'Solo se admiten enlaces http:// o https://.' });
    }
    if (isPrivateOrLocalHost(target.hostname)) {
        return json(400, { error: 'Ese enlace no se puede leer.' });
    }
    const hostLower = target.hostname.toLowerCase().replace(/^www\./, '');
    if (UNSUPPORTED_HOSTS.some(h => hostLower === h || hostLower.endsWith(`.${h}`))) {
        return json(422, { error: 'Ese tipo de enlace (video o red social) no se puede leer como artículo. Pega el texto directamente, o un enlace a una página de artículo/noticia.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(target.toString(), {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
            }
        });

        if (!res.ok) {
            return json(502, { error: `La página respondió con un error (${res.status}). Puede que bloquee el acceso automático, o que el enlace esté roto.` });
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return json(422, { error: 'Ese enlace no apunta a una página web legible (no es HTML). Si es un PDF u otro archivo, pega el texto directamente.' });
        }

        // Cortamos la descarga si el HTML es enorme — no hace falta leer un
        // sitio entero para sacar el artículo, y evita gastar tiempo/memoria.
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.length;
            if (received > MAX_HTML_BYTES) { controller.abort(); break; }
            chunks.push(value);
        }
        const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8');

        const dom = new JSDOM(html, { url: target.toString() });
        const article = new Readability(dom.window.document).parse();

        if (!article || !article.textContent || article.textContent.trim().length < 200) {
            return json(422, { error: 'No se pudo extraer un artículo legible de esa página (puede que el contenido se cargue con JavaScript, o que esté detrás de un muro de pago/login).' });
        }

        const text = article.textContent.trim().slice(0, MAX_TEXT_CHARS);
        // article.content es el HTML del cuerpo del artículo ya "limpiado" por
        // Readability (sin menús/sidebars/ads, pero CONSERVANDO párrafos,
        // encabezados, negrita/cursiva, listas, etc.) — se manda además del
        // texto plano para poder traerlo al editor del lector con un formato
        // parecido al de la página original. El cliente es quien decide si lo
        // usa (y lo sanitiza de nuevo antes de insertarlo) o se queda con el
        // texto plano de siempre; igual se recorta aquí por las dudas, para
        // no mandar una respuesta enorme si un artículo viene con HTML inusual.
        const contentHtml = typeof article.content === 'string'
            ? article.content.slice(0, MAX_CONTENT_HTML_CHARS)
            : null;
        return json(200, {
            text,
            contentHtml,
            title: article.title || null,
            sourceUrl: target.toString()
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            return json(504, { error: 'La página tardó demasiado en responder.' });
        }
        console.error('[read-webpage]', err.message);
        return json(502, { error: 'No se pudo leer esa página.' });
    } finally {
        clearTimeout(timeout);
    }
};
