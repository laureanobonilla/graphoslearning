const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

  try {
        const { action, topic, contextPath, maxNodes = 3 } = JSON.parse(event.body);

        if (action === 'expand') {
            // Aquí está el schema restaurado
            const schema = {
                type: 'OBJECT',
                properties: {
                    concepts: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING' },
                                relationship: { type: 'STRING' }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["concepts"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Tema central a expandir: "${topic}".
                Contexto jerárquico de origen: "${contextPath}".
                
                INSTRUCCIONES:
                1. Genera EXACTAMENTE ${maxNodes} subconceptos clave.
                2. Evalúa si "${topic}" requiere contexto o es universal. 
                3. No repitas términos que ya existan en la jerarquía.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2
                }
            });
            return { statusCode: 200, body: response.text };
        } 
        if (action === 'examples') {
            const schema = {
                type: 'OBJECT',
                properties: {
                    examples: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING', description: 'Nombre corto del ejemplo práctico' },
                                relationship: { type: 'STRING', description: 'Ej: "ejemplo de", "aplicado en"' }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["examples"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Concepto del que se requieren ejemplos: "${topic}".
                Contexto jerárquico: "${contextPath}".
                
                INSTRUCCIONES:
                1. Genera EXACTAMENTE ${maxNodes} ejemplos prácticos, reales o casos de uso del concepto.
                2. El "label" debe ser muy conciso (máximo 5 palabras).
                3. No repitas ejemplos.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.4 // Un poco más alto para fomentar creatividad en los ejemplos
                }
            });
            return { statusCode: 200, body: response.text };
        }
        if (action === 'define') {
            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Concepto a definir: "${topic}".
                Ruta contextual en el mapa conceptual: "${contextPath}".
                
                INSTRUCCIONES CRÍTICAS:
                1. Redacta la definición en máximo 2 párrafos cortos.
                2. Usa ÚNICAMENTE TEXTO PLANO. Está ESTRICTAMENTE PROHIBIDO usar formato Markdown.
                3. Determina si requiere su contexto teórico o si es universal.`,
                config: { temperature: 0.2 }
            });
            return { statusCode: 200, body: JSON.stringify({ definition: response.text }) };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción no válida' }) };

    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
