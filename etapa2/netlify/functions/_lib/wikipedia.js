// ==========================================
// DEFINICIONES GRATUITAS Y FACTUALMENTE PRECISAS VÍA WIKIPEDIA
// ==========================================
// Antes de gastar una llamada a Gemini para "definir" un nodo, se intenta
// primero traer el resumen de Wikipedia: si el nodo es una entidad reconocida
// (persona, lugar, evento, obra...), esto es gratis, más rápido y con menor
// riesgo de alucinación que pedírselo a un LLM. Solo aplica cuando NO hay un
// documento de base del que "agotar" la definición (ver gemini.js) — si el
// usuario ya pegó un texto o un video, ese texto manda, Wikipedia no aplica.

const UA = 'Graphikosmos-ConceptMapper/1.0 (app educativa de mapas conceptuales; sin fines de scraping masivo)';

async function fetchSummary(lang, title) {
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    });
    if (!res.ok) return null; // 404 = no existe ese título exacto en este idioma
    const data = await res.json();
    if (data.type === 'disambiguation') return { disambiguation: true };
    if (!data.extract || data.extract.length < 40) return null;
    return {
        title: data.title,
        extract: data.extract,
        image: (data.thumbnail && data.thumbnail.source) || (data.originalimage && data.originalimage.source) || null,
        url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || null
    };
}

async function searchBestTitle(lang, query) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data && data.query && data.query.search && data.query.search[0];
    return hit ? hit.title : null;
}

/**
 * Busca un resumen de Wikipedia para `topic`, desambiguando con `contextHint`
 * (por ejemplo, el nodo raíz del esquema) cuando el título exacto no existe o
 * es ambiguo (ej. "Mercurio" → planeta vs. elemento vs. dios romano).
 * Prueba español primero y luego inglés. Devuelve null si no encuentra nada
 * razonable (el llamador debe entonces recurrir a Gemini).
 */
async function lookupWikipedia(topic, contextHint) {
    for (const lang of ['es', 'en']) {
        try {
            let result = await fetchSummary(lang, topic);
            if (result && result.disambiguation) result = null;

            if (!result && contextHint) {
                const bestTitle = await searchBestTitle(lang, `${topic} ${contextHint}`);
                if (bestTitle) {
                    const bySearch = await fetchSummary(lang, bestTitle);
                    if (bySearch && !bySearch.disambiguation) result = bySearch;
                }
            }
            if (result) return { ...result, language: lang };
        } catch (_err) {
            // Falla de red o de parseo con este idioma: se intenta el siguiente.
        }
    }
    return null;
}

module.exports = { lookupWikipedia };
