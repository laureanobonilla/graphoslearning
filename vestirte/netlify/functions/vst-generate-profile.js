// Paso 1 de 3 de "Vestirte": recibe las respuestas y las 5 fotos (ya reducidas en el navegador),
// pide el perfil de estilo a Gemini viendo las fotos y, EN PARALELO, las guarda privadas en
// Cloudinary. Si la revisión de seguridad marca algo (menor de edad, desnudez, no es una
// persona), se borran las fotos y no se guarda nada.
const crypto = require('crypto');
const { saveReading } = require('./_lib/qer-readings-store');
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');
const cld = require('./_lib/vst-cloudinary');
const { saveSession } = require('./_lib/vst-store');
const { SLOTS, MAX_PHOTO_B64, PROFILE_SCHEMA, profilePrompt, cleanColors, json, TIME_BUDGET_MS, transcriptOf } = require('./_lib/vst-core');

const JPEG_PREFIX = 'data:image/jpeg;base64,';
const validPhoto = (s) => typeof s === 'string' && s.startsWith(JPEG_PREFIX + '/9j/') && s.length - JPEG_PREFIX.length <= MAX_PHOTO_B64;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const answers = sanitizeAnswers(body.answers);
    if (!answers) return json(400, { error: 'Faltan las respuestas.' });
    if (body.consent !== true || body.adult !== true) return json(400, { error: 'Hace falta confirmar que tienes 18 años o más y aceptar el uso de tus fotos.' });
    const photos = body.photos || {};
    if (!SLOTS.every(s => validPhoto(photos[s]))) return json(400, { error: 'Alguna de las 5 fotos falta o no tiene un formato válido.' });
    if (!cld.isConfigured()) {
        console.error('[vst-profile] Cloudinary no configurado');
        return json(500, { error: 'El servicio de fotos aún no está configurado. Vuelve más tarde.' });
    }

    const readingId = crypto.randomUUID();
    const t0 = Date.now();
    const transcript = transcriptOf(answers);
    const parts = [
        ...SLOTS.map(s => ({ inlineData: { mimeType: 'image/jpeg', data: photos[s].slice(JPEG_PREFIX.length) } })),
        { text: profilePrompt(transcript, SLOTS) }
    ];
    const uploadAll = () => Promise.all(SLOTS.map(async (s) => {
        const publicId = `vestirte/${readingId}/${s}`;
        try { await cld.uploadPrivate(photos[s], publicId); }
        catch { await cld.uploadPrivate(photos[s], publicId); } // un reintento
        return { slot: s, public_id: publicId };
    }));

    const [genRes, upRes] = await Promise.allSettled([
        generateWithRetries([{ role: 'user', parts }], PROFILE_SCHEMA,
            d => d && d.safety && d.styleName && d.hookLine && d.summary && Array.isArray(d.bestColors) && d.bestColors.length >= 3 && d.closingLine,
            { tag: 'vst-profile', maxOutputTokens: 2048, temperature: 0.7, deadline: t0 + TIME_BUDGET_MS }),
        uploadAll()
    ]);
    const stored = upRes.status === 'fulfilled' ? upRes.value : [];
    const cleanup = () => cld.deleteMany(stored.map(p => p.public_id)).catch(e => console.error('[vst-profile] limpieza falló', e.message));

    if (genRes.status === 'rejected' || upRes.status === 'rejected') {
        await cleanup();
        const why = genRes.status === 'rejected' ? genRes.reason : upRes.reason;
        console.error(`[vst-profile] falló tras ${Date.now() - t0} ms:`, why && why.message);
        return json(502, { error: `No se pudo armar tu perfil (paso 1). Detalle técnico: ${String((why && why.message) || why).slice(0, 250)}` });
    }

    const profile = genRes.value;
    const sf = profile.safety || {};
    const unusable = (Array.isArray(sf.unusableSlots) ? sf.unusableSlots : []).filter(s => SLOTS.includes(s));
    if (sf.appearsUnder18 || sf.explicit || sf.notAPerson || unusable.length >= 3) {
        await cleanup();
        console.warn('[vst-profile] bloqueado por revisión', { under18: !!sf.appearsUnder18, explicit: !!sf.explicit, notAPerson: !!sf.notAPerson, unusable: unusable.length });
        const error = sf.appearsUnder18 ? 'Este servicio es solo para mayores de 18 años. Tus fotos fueron descartadas.'
            : sf.explicit ? 'Alguna foto no es adecuada para este servicio (debe verse con ropa normal). Tus fotos fueron descartadas; puedes intentarlo de nuevo con ropa puesta.'
            : sf.notAPerson ? 'Las fotos deben ser tuyas, de una persona real y siempre la misma. Tus fotos fueron descartadas.'
            : 'Varias fotos no se ven bien (oscuras, borrosas o sin mostrar lo que se pide). Tus fotos fueron descartadas; vuelve a tomarlas con buena luz.';
        return json(422, { error, blocked: true, unusableSlots: unusable });
    }

    try {
        const best = cleanColors(profile.bestColors, 6), avoid = cleanColors(profile.avoidColors, 3);
        await saveReading(readingId, {
            stage: 'axis', format: 'vestirte', transcript,
            archetypeName: String(profile.styleName).slice(0, 60), hookLine: String(profile.hookLine), closingLine: String(profile.closingLine),
            axis: String(profile.summary), styleName: String(profile.styleName).slice(0, 60),
            profile: { styleName: String(profile.styleName).slice(0, 60), summary: String(profile.summary), bestColors: best, avoidColors: avoid },
            full: []
        });
        await saveSession({
            id: readingId, anon_id: typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null,
            answers, profile: { styleName: profile.styleName, hookLine: profile.hookLine, summary: profile.summary, bestColors: best, avoidColors: avoid },
            photos: stored, flags: { unusableSlots: unusable }
        });
        console.log(`[vst-profile] listo en ${Date.now() - t0} ms`);
        return json(200, { readingId, styleName: profile.styleName, hookLine: profile.hookLine, bestColors: best, unusableSlots: unusable });
    } catch (err) {
        await cleanup();
        console.error('[vst-profile] guardado falló:', err.message);
        return json(502, { error: `No se pudo guardar tu perfil. Detalle técnico: ${String(err.message).slice(0, 200)}` });
    }
};
