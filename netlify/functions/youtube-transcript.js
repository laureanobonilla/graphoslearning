// ==========================================
// EXTRACCIÓN DE SUBTÍTULOS DE YOUTUBE (gratuito, sin API key)
// ==========================================
// Se usa desde el Modo Lector: en vez de pedirle a Gemini que "transcriba" un
// video (imposible sin audio, y caro si se usara Whisper), este endpoint lee
// los subtítulos públicos que YouTube ya expone en la página del video y los
// devuelve como texto plano. Ese texto es el que luego se "agota" con Gemini,
// igual que si el usuario hubiera pegado un artículo.
//
// No usa ninguna librería de terceros: solo fetch nativo (Node 18+). Para
// encontrar los subtítulos se usa el endpoint interno "innertube" que el
// propio reproductor web de YouTube usa (youtubei/v1/player) en vez de leer
// el HTML de la página — escarbar el HTML (regex sobre "captionTracks") dejó
// de ser confiable porque YouTube ya no siempre embebe esos datos ahí. La
// INNERTUBE_API_KEY de abajo es la clave pública que usa cualquier navegador
// al cargar youtube.com, no una credencial nuestra ni un secreto.
// Si YouTube cambia este endpoint interno, esto puede romperse — sigue sin
// ser una API oficial documentada, solo una más estable que la anterior.
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractVideoId(input) {
    const trimmed = String(input || '').trim();
    if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
    const patterns = [
        /(?:youtube\.com\/watch\?[^#]*\bv=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/
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

async function fetchCaptionTracks(videoId) {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': BROWSER_UA,
            'Accept-Language': 'es,es-419;q=0.9,en;q=0.8'
        },
        body: JSON.stringify({
            videoId,
            context: {
                client: {
                    clientName: 'WEB',
                    clientVersion: '2.20240826.01.00',
                    hl: 'es'
                }
            }
        })
    });
    if (!res.ok) throw new Error('YouTube no respondió correctamente para ese video.');
    const data = await res.json();

    const playability = data?.playabilityStatus?.status;
    if (playability && playability !== 'OK') {
        throw new Error('Ese video no está disponible (puede ser privado, restringido por edad o haber sido eliminado).');
    }

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const title = data?.videoDetails?.title ? decodeEntities(data.videoDetails.title) : null;
    return { tracks, title };
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
    const res = await fetch(track.baseUrl);
    if (!res.ok) throw new Error('No se pudo descargar los subtítulos.');
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
        return { statusCode: 400, body: JSON.stringify({ error: 'No reconozco ese enlace como un video de YouTube válido.' }) };
    }

    try {
        const { tracks, title } = await fetchCaptionTracks(videoId);
        if (!tracks.length) {
            return {
                statusCode: 422,
                body: JSON.stringify({ error: 'Ese video no tiene subtítulos disponibles (ni automáticos). Prueba con otro, o pega el texto directamente.' })
            };
        }

        const track = pickTrack(tracks, ['es', 'en']);
        const text = await fetchTranscriptText(track);
        if (!text) {
            return { statusCode: 422, body: JSON.stringify({ error: 'No se pudo extraer texto de los subtítulos de ese video.' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ videoId, title, language: track.languageCode || null, text })
        };
    } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo procesar ese video: ' + err.message }) };
    }
};
