exports.handler = async function(event, context) {
    const JSONBIN_KEY = process.env.JSONBIN_KEY;
    const COLLECTION_ID = process.env.JSONBIN_COLLECTION_ID;
    const MASTER_BIN_ID = process.env.JSONBIN_MASTER_BIN_ID;

    const headers = {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY,
        'X-Collection-Id': COLLECTION_ID
    };

    // ==========================================
    // 1. CARGAR PROYECTO (MÉTODO GET)
    // ==========================================
    if (event.httpMethod === 'GET') {
        const projectId = event.queryStringParameters.projectId;
        
        if (!projectId) {
            return { statusCode: 400, body: JSON.stringify({ error: "Falta el ID del proyecto" }) };
        }

        try {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${projectId}`, {
                method: 'GET',
                headers: { 'X-Master-Key': JSONBIN_KEY }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                return { statusCode: response.status, body: JSON.stringify({ error: errorData.message || "Error al leer de JSONBin" }) };
            }
            
            const data = await response.json();
            
            // JSONBin V3 devuelve los datos reales dentro del objeto 'record'
            return { statusCode: 200, body: JSON.stringify({ data: data.record }) };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // ==========================================
    // 2. GUARDAR PROYECTO (MÉTODO POST)
    // ==========================================
    if (event.httpMethod === 'POST') {
        try {
            // Es vital hacer el parse AQUÍ adentro, porque las peticiones GET no tienen 'body'
            const { projectId, title, data, user } = JSON.parse(event.body);
            let binId = projectId;

            // 1. Crear o Actualizar el Bin del mapa conceptual
            if (binId) {
                // Actualizar Bin existente
                await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(data)
                });
            } else {
                // Crear nuevo Bin
                const createRes = await fetch('https://api.jsonbin.io/v3/b', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(data)
                });
                const createData = await createRes.json();
                binId = createData.metadata.id;

                // 2. Si es nuevo, agregarlo al Master Index
                const masterRes = await fetch(`https://api.jsonbin.io/v3/b/${MASTER_BIN_ID}/latest`, { headers });
                const masterData = await masterRes.json();
                
                let index = Array.isArray(masterData.record.proyectos) ? masterData.record.proyectos : [];
                const ownerName = data.owner || "Invitado";

                index.push({ 
                    id: binId, 
                    title, 
                    user, 
                    ownerName, 
                    date: new Date().toISOString() 
                });

                await fetch(`https://api.jsonbin.io/v3/b/${MASTER_BIN_ID}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ proyectos: index })
                });
            }

            return { statusCode: 200, body: JSON.stringify({ success: true, projectId: binId }) };
        } catch (error) {
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }
    }

    // Si llega una petición que no es ni GET ni POST
    return { statusCode: 405, body: 'Method Not Allowed' };
};