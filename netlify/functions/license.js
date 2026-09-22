exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = process.env.JSONBIN_KEY;
    const collectionId = process.env.JSONBIN_COLLECTION_ID;

    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Configuración faltante en el servidor' }) };
    }

    try {
        const { action, licenseKey, nodesToAdd } = JSON.parse(event.body);

        // CREAR NUEVA LICENCIA TRAS PAGO
        if (action === 'create') {
            const createRes = await fetch('https://api.jsonbin.io/v3/b', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': apiKey,
                    'X-Bin-Name': licenseKey,
                    ...(collectionId ? { 'X-Collection-Id': collectionId } : {})
                },
                body: JSON.stringify({
                    licenseKey: licenseKey,
                    balance: nodesToAdd,
                    createdAt: new Date().toISOString()
                })
            });

            const data = await createRes.json();
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, licenseKey, balance: nodesToAdd, binId: data.metadata?.id })
            };
        }

        // VERIFICAR Y SINCRONIZAR LICENCIA EXISTENTE
        if (action === 'verify') {
            // Consulta el bin por el ID guardado o busca el registro
            const searchRes = await fetch(`https://api.jsonbin.io/v3/c/${collectionId}/bins`, {
                headers: { 'X-Master-Key': apiKey }
            });

            if (!searchRes.ok) {
                return { statusCode: 404, body: JSON.stringify({ error: 'No se pudo consultar la colección' }) };
            }

            const binsList = await searchRes.json();
            const matchingBin = (binsList || []).find(b => b.record === licenseKey || b.snippet?.name === licenseKey);

            if (!matchingBin) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Licencia no encontrada' }) };
            }

            const binDetailRes = await fetch(`https://api.jsonbin.io/v3/b/${matchingBin.record}/latest`, {
                headers: { 'X-Master-Key': apiKey }
            });
            const binDetail = await binDetailRes.json();

            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    licenseKey: binDetail.record.licenseKey,
                    balance: binDetail.record.balance
                })
            };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción inválida' }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};