exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const { projectId, title, data, user } = JSON.parse(event.body);
    const JSONBIN_KEY = process.env.JSONBIN_KEY;
    const COLLECTION_ID = process.env.JSONBIN_COLLECTION_ID;
    const MASTER_BIN_ID = process.env.JSONBIN_MASTER_BIN_ID;

    const headers = {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY,
        'X-Collection-Id': COLLECTION_ID
    };

    try {
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
            
            // Buscamos el arreglo dentro de 'proyectos' (JSONBin guarda los datos dentro de .record)
            // Dentro de la sección donde se agrega al Master Index en db.js:
            let index = Array.isArray(masterData.record.proyectos) ? masterData.record.proyectos : [];

            // Extraemos el nombre del usuario que viene en data, o ponemos "Invitado"
            const ownerName = data.owner || "Invitado";

            index.push({ 
                id: binId, 
                title, 
                user, 
                ownerName, // <-- Guardamos el nombre aquí también para tenerlo a la vista en el índice
                date: new Date().toISOString() 
            });

            // Enviamos el objeto con la misma estructura original
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
};
