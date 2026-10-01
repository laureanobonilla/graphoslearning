// ==========================================
// EXTRACCIÓN DE SUBTÍTULOS DE YOUTUBE (gratuito, sin API key)
// ==========================================
// Se usa desde el Modo Lector (y desde el campo pequeño de la cabecera): en vez
// de pedirle a Gemini que "transcriba" un video (imposible sin audio, y caro si
// se usara Whisper), este endpoint lee los subtítulos públicos que YouTube ya
// expone y los devuelve como texto plano. Ese texto es el que luego se "agota"
// con Gemini, igual que si el usuario hubiera pegado un artículo.
//
// No usa ninguna librería de terceros: solo fetch nativo (Node 18+). YouTube no
// ofrece una API pública oficial para esto, así que se intentan varias formas
// de pedirle la misma información que le pide su propio reproductor, en orden,
// hasta que una funcione:
//   1) El endpoint interno "innertube" (youtubei/v1/player) simulando el cliente
//      de la app de Android — en la práctica es el que menos bloqueos tiene
//      desde un servidor (sin navegador real detrás), a diferencia del cliente
//      "WEB" que cada vez exige más verificaciones anti-bot.
//   2) El mismo endpoint pero simulando el cliente web, por si el de Android
//      falla para ese video en particular.
//   3) Como último recurso, leer el HTML de la página del video y extraer el
//      bloque `ytInitialPlayerResponse` (la misma información, pero haciendo
//      scraping en vez de pedirla directamente).
// La INNERTUBE_API_KEY de abajo es una clave pública que usa cualquier
// navegador/app al cargar YouTube, no una credencial nuestra ni un secreto.
// Nada de esto es una API oficial documentada — si YouTube cambia estos
// mecanismos internos, esto puede romperse y habría que ajustarlo de nuevo.
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ANDROID_UA = 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip';

function extractVideoId(input) {
    const trimmed = String(input || '').trim().replace(/^["']|["']$/g, '');
    if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
    const patterns = [
        /(?:youtube\.com\/watch\?[^#]*\bv=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/|m\.youtube\.com\/watch\?[^#]*\bv=)([\w-]{11})/
    ];
    for (const re of patterns) {
        const m = trimmed.match(re);
        if (m) return m[1];
    }
    return null;
}

function decodeEntities(str) {
    return String(str || '')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

// --- Estrategia 1 y 2: endpoint interno "innertube", con distintos clientes ---
async function fetchViaInnertube(videoId, client) {
    const isAndroid = client === 'ANDROID';
    const context = isAndroid
        ? { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'es', gl: 'US' } }
        : { client: { clientName: 'WEB', clientVersion: '2.20240826.01.00', hl: 'es', gl: 'US' } };

    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': isAndroid ? ANDROID_UA : WEB_UA,
            'Accept-Language': 'es,es-419;q=0.9,en;q=0.8',
            ...(isAndroid ? { 'X-YouTube-Client-Name': '3', 'X-YouTube-Client-Version': '19.09.37' } : {})
        },
        body: JSON.stringify({ videoId, context })
    });
    if (!res.ok) throw new Error(`YouTube respondió ${res.status} al pedir datos del video (cliente ${client}).`);
    const data = await res.json();

    const playability = data?.playabilityStatus?.status;
    if (playability && playability !== 'OK') {
        const reason = data?.playabilityStatus?.reason || '';
        throw new Error(`Ese video no está disponible (${playability}${reason ? ': ' + reason : ''}).`);
    }

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const title = data?.videoDetails?.title ? decodeEntities(data.videoDetails.title) : null;
    return { tracks, title };
}

// --- Estrategia 3: scraping del HTML de la página como último recurso ---
async function fetchViaWatchPageHtml(videoId) {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=es`, {
        headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'es,es-419;q=0.9,en;q=0.8' }
    });
    if (!res.ok) throw new Error(`YouTube respondió ${res.status} al pedir la página del video.`);
    const html = await res.text();

    const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;\s*(?:var |<\/script>)/s);
    if (!m) throw new Error('No se encontró información del reproductor en la página del video.');

    let data;
    try { data = JSON.parse(m[1]); } catch { throw new Error('No se pudo interpretar la información del reproductor.'); }

    const playability = data?.playabilityStatus?.status;
    if (playability && playability !== 'OK') {
        throw new Error(`Ese video no está disponible (${playability}).`);
    }

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const titleMatch = html.match(/<meta name="title" content="([^"]*)">/);
    const title = titleMatch ? decodeEntities(titleMatch[1]) : (data?.videoDetails?.title ? decodeEntities(data.videoDetails.title) : null);
    return { tracks, title };
}

// Prueba las tres estrategias en orden y se queda con la primera que devuelva
// al menos una pista de subtítulos (o la última información obtenida, si
// ninguna tuvo pistas pero tampoco lanzó error, para poder reportar bien).
async function fetchCaptionTracks(videoId) {
    const strategies = [
        () => fetchViaInnertube(videoId, 'ANDROID'),
        () => fetchViaInnertube(videoId, 'WEB'),
        () => fetchViaWatchPageHtml(videoId)
    ];
    let lastResult = null;
    let lastError = null;
    let allBlockedByLogin = true;
    for (const strategy of strategies) {
        try {
            const result = await strategy();
            lastResult = result;
            allBlockedByLogin = false;
            if (result.tracks && result.tracks.length) return result;
        } catch (err) {
            lastError = err;
            if (!/LOGIN_REQUIRED/.test(err.message)) allBlockedByLogin = false;
        }
    }
    if (lastResult) return lastResult; // sin pistas, pero al menos sabemos el título / que el video existe

    // Las tres estrategias fallaron, y TODAS con "LOGIN_REQUIRED": no es que el
    // video sea privado (un visitante normal sin iniciar sesión lo ve bien) —
    // es que YouTube está tratando esta petición como la de un bot/servidor
    // (algo que hace cada vez más con tráfico que no viene de un navegador real
    // con su propia IP) y por eso exige "iniciar sesión" para cualquier video,
    // sin importar cuál sea. No hay una forma confiable de evitar esto desde
    // aquí sin iniciar sesión con una cuenta real (lo que no es seguro ni
    // sostenible para una función de servidor pública).
    if (allBlockedByLogin) {
        throw new Error('YouTube está bloqueando estas peticiones automáticas por venir de un servidor (pide "iniciar sesión" aunque el video sea público) — no es un problema de ESTE video en particular. Por ahora, la alternativa es copiar la transcripción tú mismo: en YouTube, bajo el video → "⋯ Más" → "Mostrar transcripción" → cópiala y pégala directo en el Modo Lector.');
    }
    throw lastError || new Error('No se pudo obtener información de ese video por ningún medio disponible.');
}

function pickTrack(tracks, preferredLangs) {
    for (const lang of preferredLangs) {
        const found = tracks.find(t => (t.languageCode || '').toLowerCase().startsWith(lang));
        if (found) return found;
    }
    // Prioriza una pista "manual" (no generada automáticamente) si hay alguna.
    const manual = tracks.find(t => t.kind !== 'asr');
    return manual || tracks[0] || null;
}

async function fetchTranscriptText(track) {
    const res = await fetch(track.baseUrl, {
        headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'es,es-419;q=0.9,en;q=0.8' }
    });
    if (!res.ok) throw new Error('No se pudo descargar los subtítulos (HTTP ' + res.status + ').');
    const xml = await res.text();
    const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
        .map(m => decodeEntities(m[1]).replace(/\n/g, ' ').replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
    return lines.join(' ').replace(/\s+/g, ' ').trim();
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
    }

    let payload;
    try { payload = JSON.parse(event.body || '{}'); } catch { payload = {}; }

    const videoId = extractVideoId(payload.url);
    if (!videoId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No reconozco ese enlace como un video de YouTube válido. Pega el enlace completo (youtube.com/watch?v=... o youtu.be/...).' }) };
    }

    try {
        const { tracks, title } = await fetchCaptionTracks(videoId);
        if (!tracks.length) {
            return {
                statusCode: 422,
                body: JSON.stringify({ error: 'Ese video no tiene subtítulos disponibles (ni automáticos) según lo que YouTube reportó. Prueba con otro video, o pega el texto directamente.' })
            };
        }

        const track = pickTrack(tracks, ['es', 'en']);
        const text = await fetchTranscriptText(track);
        if (!text) {
            return { statusCode: 422, body: JSON.stringify({ error: 'YouTube reportó subtítulos para ese video, pero no se pudo extraer el texto (puede ser temporal: intenta de nuevo).' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ videoId, title, language: track.languageCode || null, text })
        };
    } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo procesar ese video: ' + err.message }) };
    }
};
