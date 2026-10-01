// ==========================================
// EXTRACCIÓN DE SUBTÍTULOS DE YOUTUBE (gratuito, sin API key)
// ==========================================
// Se usa desde el Modo Lector: en vez de pedirle a Gemini que "transcriba" un
// video (imposible sin audio, y caro si se usara Whisper), este endpoint lee
// los subtítulos públicos que YouTube ya expone en la página del video y los
// devuelve como texto plano. Ese texto es el que luego se "agota" con Gemini,
// igual que si el usuario hubiera pegado un artículo.
//
// No usa ninguna librería de terceros: solo fetch nativo (Node 18+) contra la
// página pública del video y el endpoint de subtítulos (timedtext), ambos sin
// autenticación. Si YouTube cambia el formato de su página, esto puede
// romperse — es scraping de una estructura no documentada, no una API oficial.

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

function extractTitle(html) {
    const m = html.match(/<meta name="title" content="([^"]*)"/);
    return m ? decodeEntities(m[1]) : null;
}

async function fetchCaptionTracks(videoId) {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'es,es-419;q=0.9,en;q=0.8'
        }
    });
    if (!res.ok) throw new Error('No se pudo abrir la página del video.');
    const html = await res.text();

    const match = html.match(/"captionTracks":(\[[^\]]*\])/);
    if (!match) return { tracks: [], title: extractTitle(html) };

    let tracks = [];
    try { tracks = JSON.parse(match[1]); } catch { tracks = []; }
    return { tracks, title: extractTitle(html) };
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
