exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { topic, sessionId } = JSON.parse(event.body);
        const apiKey = process.env.JSONBIN_KEY;
        const binId = process.env.JSONBIN_MASTER_BIN_ID;

        if (!apiKey || !binId) {
            return { statusCode: 200, body: JSON.stringify({ status: 'tracking_unconfigured' }) };
        }

        // Obtener el registro actual del bin
        const getRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: { 
                'X-Master-Key': apiKey 
            }
        });

        if (!getRes.ok) {
            return { statusCode: getRes.status, body: JSON.stringify({ error: 'Error leyendo JSONBin' }) };
        }

        const data = await getRes.json();
        const records = Array.isArray(data.record) ? data.record : [];

        // Agregar el nuevo nodo rastreado
        records.push({
            session: sessionId,
            topic: topic,
            timestamp: new Date().toISOString()
        });

        // Actualizar el bin con la lista acumulada
        await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': apiKey
            },
            body: JSON.stringify(records)
        });

        return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};