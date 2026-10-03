// Guarda cada lectura generada (el resultado del cuestionario, ya interpretado
// por Gemini) el tiempo suficiente para que, si la persona paga, el servidor
// pueda entregarle el texto completo sin tener que volver a llamar a la IA
// (que además podría generar algo distinto la segunda vez).
//
// Se usa Netlify Blobs (@netlify/blobs) en vez de una base de datos aparte
// (como el Supabase de la otra app) a propósito: funciona solo con desplegar
// en Netlify, sin crear ni configurar nada adicional — justo lo que pidió el
// usuario ("sin tener que pasar por el proceso tedioso de hacer otra"). El
// costo es que es un almacén más simple (clave → valor, sin SQL ni
// consultas) — de sobra para lo que hace falta aquí: guardar una lectura por
// id y marcarla pagada una vez.
const { getStore } = require('@netlify/blobs');

// Un día es más que suficiente: nadie debería tardar más de eso entre
// terminar el cuestionario y decidir si paga o no. Pasado ese tiempo, el
// registro se puede borrar sin perder nada que de verdad importe (si la
// persona vuelve después de eso, simplemente hace el cuestionario de nuevo).
const TTL_MS = 24 * 60 * 60 * 1000;

function store() {
    return getStore('readings');
}

async function saveReading(id, reading) {
    await store().setJSON(id, { ...reading, createdAt: Date.now(), paid: false });
}

async function getReading(id) {
    const data = await store().get(id, { type: 'json' });
    if (!data) return null;
    if (Date.now() - (data.createdAt || 0) > TTL_MS) return null;
    return data;
}

// Asocia una orden de PayPal con la lectura que se supone que esa orden
// desbloquea — así, al capturar el pago, no basta con que la orden esté
// COMPLETED: también tiene que ser la orden que de verdad se creó PARA esa
// lectura (y no, por ejemplo, el id de la orden de la lectura de otra
// persona, copiado a mano en una llamada directa a la función).
async function linkOrderToReading(orderId, readingId) {
    await store().setJSON(`order:${orderId}`, { readingId, createdAt: Date.now() });
}

async function getReadingIdForOrder(orderId) {
    const data = await store().get(`order:${orderId}`, { type: 'json' });
    if (!data) return null;
    if (Date.now() - (data.createdAt || 0) > TTL_MS) return null;
    return data.readingId;
}

async function markPaid(id) {
    const data = await getReading(id);
    if (!data) return null;
    const updated = { ...data, paid: true };
    await store().setJSON(id, updated);
    return updated;
}

module.exports = { saveReading, getReading, linkOrderToReading, getReadingIdForOrder, markPaid };
