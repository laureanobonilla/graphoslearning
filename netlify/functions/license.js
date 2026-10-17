// RETIRADO (2026-10-17): el sistema de licencias en JSONBin quedó reemplazado por los saldos en Supabase (ver _lib/billing.js).
// Ninguna página de la app lo llama; se deja cerrado para que no pueda crear ni leer nada en JSONBin.
exports.handler = async function () {
    return { statusCode: 410, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'retired' }) };
};
