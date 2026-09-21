const { GoogleGenAI, Type, Schema } = require('@google/genai');

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const { action, topic } = JSON.parse(event.body);

    try {
        if (action === 'expand') {
            const schema = {
                type: Type.OBJECT,
                properties: {
                    concepts: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING, description: "Identificador único corto en minúsculas" },
                                label: { type: Type.STRING, description: "Nombre del concepto" },
                                relationship: { type: Type.STRING, description: "Verbo de enlace corto (ej: 'requiere', 'es parte de')" }
                            }
                        }
                    }
                }
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Genera de 3 a 5 conceptos clave directamente relacionados con: ${topic}.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                }
            });
            return { statusCode: 200, body: response.text };
        } 
        
        if (action === 'define') {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Escribe una definición concisa (máximo 2 párrafos) sobre el concepto: ${topic}.`
            });
            return { statusCode: 200, body: JSON.stringify({ definition: response.text }) };
        }

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};