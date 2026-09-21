const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, topic } = JSON.parse(event.body);

        if (action === 'expand') {
            const schema = {
                type: 'OBJECT',
                properties: {
                    concepts: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING', description: 'Identificador único corto en minúsculas' },
                                label: { type: 'STRING', description: 'Nombre del concepto' },
                                relationship: { type: 'STRING', description: 'Verbo de enlace corto' }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["concepts"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Genera de 3 a 5 conceptos clave directamente relacionados con: ${topic}.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.3
                }
            });
            
            return { statusCode: 200, body: response.text };
        } 
        
        if (action === 'define') {
            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Escribe una definición concisa (máximo 2 párrafos) sobre el concepto: ${topic}.`,
                config: {
                    temperature: 0.3
                }
            });
            
            return { 
                statusCode: 200, 
                body: JSON.stringify({ definition: response.text }) 
            };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción no válida' }) };

    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
