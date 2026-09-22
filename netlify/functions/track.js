// Mapa en memoria para recordar qué BinId le pertenece a qué SessionId
// Nota: Este mapa sobrevive mientras la instancia de la función Netlify esté viva ("warm").
const sessionToBinMap = new Map();

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = process.env.JSONBIN_KEY;
    const collectionId = process.env.JSONBIN_COLLECTION_ID;

    if (!apiKey || !collectionId) {
        console.error("Faltan variables en Netlify: JSONBIN_KEY o JSONBIN_COLLECTION_ID");
        return { statusCode: 500, body: JSON.stringify({ error: "Configuración incompleta" }) };
    }

    try {
        const { topic, sessionId } = JSON.parse(event.body);
        let userBinId = sessionToBinMap.get(sessionId);

        // ==========================================
        // FASE 1: Crear Bin si no existe
        // ==========================================
        if (!userBinId) {
            // Estructura inicial del nuevo Bin del usuario
            const initialPayload = {
                session: sessionId,
                created_at: new Date().toISOString(),
                nodos: []
            };

            const createRes = await fetch(`https://api.jsonbin.io/v3/b`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': apiKey,
                    'X-Collection-Id': collectionId,
                    'X-Bin-Name': `Session_${sessionId.substring(0,6)}` // Nombre fácil de leer
                },
                body: JSON.stringify(initialPayload)
            });

            if (!createRes.ok) {
                const errText = await createRes.text();
                console.error("Error creando el Bin del usuario:", createRes.status, errText);
                return { statusCode: createRes.status, body: errText };
            }

            const createData = await createRes.json();
            userBinId = createData.metadata.id; // Extraemos el ID del nuevo Bin
            sessionToBinMap.set(sessionId, userBinId); // Lo recordamos para el próximo nodo
            console.log(`[+] Nuevo Bin creado para la sesión ${sessionId} -> BinId: ${userBinId}`);
        }

        // ==========================================
        // FASE 2: Obtener el estado actual del Bin
        // ==========================================
        const getRes = await fetch(`https://api.jsonbin.io/v3/b/${userBinId}/latest`, {
            headers: { 'X-Master-Key': apiKey }
        });

        if (!getRes.ok) {
            const errText = await getRes.text();
            console.error("Error al leer el Bin del usuario:", getRes.status, errText);
            return { statusCode: getRes.status, body: errText };
        }

        const data = await getRes.json();
        const payload = data.record;
        
        // ==========================================
        // FASE 3: Actualizar el array "nodos"
        // ==========================================
        if (!Array.isArray(payload.nodos)) {
            payload.nodos = [];
        }

        payload.nodos.push({
            topic: topic,
            timestamp: new Date().toISOString()
        });

        // ==========================================
        // FASE 4: Guardar los cambios en el Bin del usuario
        // ==========================================
        const putRes = await fetch(`https://api.jsonbin.io/v3/b/${userBinId}`, {
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

        return { statusCode: 200, body: JSON.stringify({ status: 'ok', binId: userBinId, nodesCount: payload.nodos.length }) };

    } catch (err) {
        console.error("Error general en track.js:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};