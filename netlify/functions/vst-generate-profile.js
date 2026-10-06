// Paso 1 de 3 de "Vestirte": las 5 fotos YA están guardadas (privadas, en Cloudinary) porque se
// subieron una a una con vst-upload-photo. Aquí se leen del almacén, se le pasan a Gemini junto con
// las respuestas para obtener el perfil de estilo y se hace la revisión de seguridad. Si marca algo
// (menor de edad, desnudez, no es una persona) se borran las fotos y la sesión queda cerrada.
const { saveReading } = require('./_lib/qer-readings-store');
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');
const cld = require('./_lib/vst-cloudinary');
const { getSession, updateSession } = require('./_lib/vst-store');
const { SLOTS, PROFILE_SCHEMA, profilePrompt, cleanColors, json, UUID_RE, TIME_BUDGET_MS, transcriptOf } = require('./_lib/vst-core');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const answers = sanitizeAnswers(body.answers);
    if (!answers) return json(400, { error: 'Faltan las respuestas.' });
    if (body.consent !== true || body.adult !== true) return json(400, { error: 'Hace falta confirmar que tienes 18 años o más y aceptar el uso de tus fotos.' });
    const readingId = String(body.sessionId || '');
    if (!UUID_RE.test(readingId)) return json(400, { error: 'Falta la sesión de las fotos.' });

    const t0 = Date.now();
    const transcript = transcriptOf(answers);
    try {
        const session = await getSession(readingId);
        const stored = session && Array.isArray(session.photos) ? session.photos : [];
        if (!session || session.deleted_reason === 'blocked') return json(404, { error: 'Esa sesión ya no está disponible. Empieza de nuevo.', blocked: true });
        const missingSlots = SLOTS.filter(s => !stored.find(x => x.slot === s));
        if (missingSlots.length) return json(409, { error: 'Faltan fotos por subir.', missingSlots });

        const bufs = await Promise.all(SLOTS.map(s => cld.fetchPrivate(stored.find(x => x.slot === s).public_id)));
        const parts = [
            ...bufs.map(b => ({ inlineData: { mimeType: 'image/jpeg', data: b.toString('base64') } })),
            { text: profilePrompt(transcript, SLOTS) }
        ];
        const profile = await generateWithRetries([{ role: 'user', parts }], PROFILE_SCHEMA,
            d => d && d.safety && d.styleName && d.hookLine && d.summary && Array.isArray(d.bestColors) && d.bestColors.length >= 3 && d.closingLine,
            { tag: 'vst-profile', maxOutputTokens: 2048, deadline: t0 + TIME_BUDGET_MS });

        const sf = profile.safety || {};
        const unusable = (Array.isArray(sf.unusableSlots) ? sf.unusableSlots : []).filter(s => SLOTS.includes(s));
        if (sf.appearsUnder18 || sf.explicit || sf.notAPerson || unusable.length >= 3) {
            await cld.deleteMany(stored.map(p => p.public_id)).catch(e => console.error('[vst-profile] limpieza falló', e.message));
            const reason = sf.appearsUnder18 || sf.explicit || sf.notAPerson ? 'blocked' : 'unusable';
            await updateSession(readingId, { photos: [], photos_deleted_at: new Date().toISOString(), deleted_reason: reason, flags: { under18: !!sf.appearsUnder18, explicit: !!sf.explicit, notAPerson: !!sf.notAPerson, unusable } });
            console.warn('[vst-profile] bloqueado por revisión', { reason, unusable: unusable.length });
            const error = sf.appearsUnder18 ? 'Este servicio es solo para mayores de 18 años. Tus fotos fueron descartadas.'
                : sf.explicit ? 'Alguna foto no es adecuada para este servicio (debe verse con ropa normal). Tus fotos fueron descartadas; puedes intentarlo de nuevo con ropa puesta.'
                : sf.notAPerson ? 'Las fotos deben ser tuyas, de una persona real y siempre la misma. Tus fotos fueron descartadas.'
                : 'Varias fotos no se ven bien (oscuras, borrosas o sin mostrar lo que se pide). Tus fotos fueron descartadas; vuelve a tomarlas con buena luz.';
            return json(422, { error, blocked: true, unusableSlots: unusable });
        }

        const best = cleanColors(profile.bestColors, 6), avoid = cleanColors(profile.avoidColors, 3);
        await saveReading(readingId, {
            stage: 'axis', format: 'vestirte', transcript,
            archetypeName: String(profile.styleName).slice(0, 60), hookLine: String(profile.hookLine), closingLine: String(profile.closingLine),
            axis: String(profile.summary), styleName: String(profile.styleName).slice(0, 60),
            profile: { styleName: String(profile.styleName).slice(0, 60), summary: String(profile.summary), bestColors: best, avoidColors: avoid },
            full: []
        });
        await updateSession(readingId, {
            answers, profile: { styleName: profile.styleName, hookLine: profile.hookLine, summary: profile.summary, bestColors: best, avoidColors: avoid },
            flags: { unusableSlots: unusable }
        });
        console.log(`[vst-profile] listo en ${Date.now() - t0} ms`);
        return json(200, { readingId, styleName: profile.styleName, hookLine: profile.hookLine, bestColors: best, unusableSlots: unusable });
    } catch (err) {
        console.error(`[vst-profile] falló tras ${Date.now() - t0} ms:`, err.message);
        return json(502, { error: `No se pudo armar tu perfil (paso 1). Tus fotos siguen guardadas; inténtalo de nuevo. Detalle técnico: ${String(err.message || err).slice(0, 250)}` });
    }
};
