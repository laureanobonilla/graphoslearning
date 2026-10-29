// Genera y guarda el retrato de «¿Quién eres? — sesión». Lo usan la función síncrona (ses.js) y la de fondo (ses-portrait-background.js).
const crypto = require('crypto');
const { generateWithRetries } = require('./qer-gemini');
const { saveReading } = require('./qer-readings-store');
const S = require('./ses-core');

const valid = (x) => x && x.patternName && x.finding && Array.isArray(x.paragraphs) && x.paragraphs.filter((p) => String(p).trim().length > 40).length >= 3 && Array.isArray(x.steps) && x.steps.length >= 3 && typeof x.closing === 'string';

async function makePortrait(items, lang, opts) {
    opts = opts || {}; const t0 = Date.now(), id = opts.id || 'ses_' + crypto.randomUUID();
    const d = await generateWithRetries(S.portraitPrompt(items, lang), S.PORTRAIT_SCHEMA, valid, { tag: 'ses-portrait', maxOutputTokens: 3000, deadline: t0 + (opts.budgetMs || 24000), attemptMs: opts.attemptMs || 15000 });
    const crisis = d.crisis === true || S.hasCrisis(items);
    const r = { ses: true, id, lang, free: crisis, patternName: String(d.patternName).trim().slice(0, 120), finding: String(d.finding).trim().slice(0, 500), paragraphs: d.paragraphs.map((p) => String(p).trim()).filter(Boolean).slice(0, 6), steps: d.steps.slice(0, 3).map((x) => String(x).trim().slice(0, 300)), closing: String(d.closing).trim().slice(0, 240), answers: items.length, created: Date.now() };
    await saveReading(id, r);
    return { r, crisis, ms: Date.now() - t0 };
}
module.exports = { makePortrait };
