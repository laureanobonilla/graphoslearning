exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = process.env.JSONBIN_KEY;
    const binId = process.env.JSONBIN_MASTER_BIN_ID;

    // Diagnóstico en consola de Netlify
    if (!apiKey) {
        console.error("FALTA VARIABLE: JSONBIN_KEY no está definida en Netlify");
        return { statusCode: 500, body: JSON.stringify({ error: "Falta JSONBIN_KEY" }) };
    }
    if (!binId) {
        console.error("FALTA VARIABLE: JSONBIN_MASTER_BIN_ID no está definida en Netlify");
        return { statusCode: 500, body: JSON.stringify({ error: "Falta JSONBIN_MASTER_BIN_ID" }) };
    }

    try {
        const { topic, sessionId } = JSON.parse(event.body);

        // 1. Obtener el estado actual del bin
        const getRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: { 
                'X-Master-Key': apiKey 
            }
        });

        if (!getRes.ok) {
            const errText = await getRes.text();
            console.error("Error al leer JSONBin:", getRes.status, errText);
            return { statusCode: getRes.status, body: errText };
        }

        const data = await getRes.json();
        const records = Array.isArray(data.record) ? data.record : [];

        // 2. Insertar el nuevo registro
        records.push({
            session: sessionId,
            topic: topic,
            timestamp: new Date().toISOString()
        });

        // 3. Sobrescribir el bin actualizado
        const putRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': apiKey
            },
            body: JSON.stringify(records)
        });

        if (!putRes.ok) {
            const putErr = await putRes.text();
            console.error("Error al escribir en JSONBin:", putRes.status, putErr);
            return { statusCode: putRes.status, body: putErr };
        }

        console.log(`Nodo "${topic}" registrado exitosamente para la sesión ${sessionId}`);
        return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };

    } catch (err) {
        console.error("Error general en track.js:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};