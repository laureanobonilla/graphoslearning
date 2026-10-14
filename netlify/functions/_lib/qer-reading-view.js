// Vista COMPLETA de una lectura ya pagada: lo único que se manda al navegador (y al correo) cuando el servidor sabe
// que se pagó. Un solo lugar para que pago de PayPal, desbloqueo por SINPE, recuperar la lectura y el correo
// entreguen exactamente lo mismo.
function fullView(reading) {
    if (!reading) return null;
    const nodes = reading.map && Array.isArray(reading.map.nodes) ? reading.map.nodes : [];
    return {
        paid: true,
        archetypeName: reading.archetypeName || '',
        hookLine: reading.hookLine || '',
        closingLine: reading.closingLine || '',
        profile: reading.profile || null,
        nodes: nodes.map(n => ({ id: n.id, label: n.label, text: n.text })),
        mapTexts: nodes.map(n => ({ id: n.id, text: n.text })) // compatibilidad con el cliente anterior
    };
}
module.exports = { fullView };
