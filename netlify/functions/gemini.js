const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!process.env.GEMINI_API_KEY) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'GEMINI_API_KEY no está configurada en las variables de entorno de Netlify' }) 
        };
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const { action, topic } = JSON.parse(event.body);

    try {
        if (action === 'expand') {
            const schema = {
                type: SchemaType.OBJECT,
                properties: {
                    concepts: {
                        type: SchemaType.ARRAY,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                id: { type: SchemaType.STRING, description: "Identificador único corto en minúsculas" },
                                label: { type: SchemaType.STRING, description: "Nombre del concepto" },
                                relationship: { type: SchemaType.STRING, description: "Verbo de enlace corto" }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["concepts"]
            };

            // Usar gemini-1.5-flash-latest o gemini-2.0-flash
            const model = genAI.getGenerativeModel({
                model: 'gemini-1.5-flash',
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            });

            const result = await model.generateContent(`Genera de 3 a 5 conceptos clave directamente relacionados con: ${topic}.`);
            return { statusCode: 200, body: result.response.text() };
        } 
        
        if (action === 'define') {
            // Usar gemini-1.5-flash-latest o gemini-2.0-flash
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
            const result = await model.generateContent(`Escribe una definición concisa (máximo 2 párrafos) sobre el concepto: ${topic}.`);
            return { 
                statusCode: 200, 
                body: JSON.stringify({ definition: result.response.text() }) 
            };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción no válida' }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
