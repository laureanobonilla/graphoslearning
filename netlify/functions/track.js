exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = process.env.JSONBIN_KEY;
    const binId = process.env.JSONBIN_MASTER_BIN_ID;

    if (!apiKey || !binId) {
        console.error("Faltan variables en Netlify: JSONBIN_KEY o JSONBIN_MASTER_BIN_ID");
        return { statusCode: 500, body: JSON.stringify({ error: "Configuración incompleta" }) };
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
        
        // Soportar tanto { proyectos: [...] } como arreglos directos
        let payload = {};
        let lista = [];

        if (data.record && Array.isArray(data.record.proyectos)) {
            lista = data.record.proyectos;
            payload = data.record;
        } else if (Array.isArray(data.record)) {
            lista = data.record;
            payload = { proyectos: lista };
        } else {
            payload = { proyectos: [] };
            lista = payload.proyectos;
        }

        // 2. Agregar el nodo rastreado
        lista.push({
            session: sessionId,
            topic: topic,
            timestamp: new Date().toISOString()
        });

        payload.proyectos = lista;

        // 3. Guardar en JSONBin
        const putRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!putRes.ok) {
            const putErr = await putRes.text();
            console.error("Error al escribir en JSONBin:", putRes.status, putErr);
            return { statusCode: putRes.status, body: putErr };
        }

        return { statusCode: 200, body: JSON.stringify({ status: 'ok', count: lista.length }) };

    } catch (err) {
        console.error("Error general en track.js:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};