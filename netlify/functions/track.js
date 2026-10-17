// RETIRADO (2026-10-17): esta función escribía cada nodo creado en JSONBin (una lectura y una escritura por nodo).
// Ya no se usa JSONBin: el tema de cada esquema se registra en Supabase (evento schema_generate_success, ver track-event.js).
// Se deja respondiendo 200 sin hacer nada para que las pestañas abiertas con la versión anterior de la app no den error.
exports.handler = async function () {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'retired' }) };
};
