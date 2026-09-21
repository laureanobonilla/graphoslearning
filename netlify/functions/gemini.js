const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, topic, contextPath } = JSON.parse(event.body);

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
                contents: `Tema central a expandir: "${topic}".
                Contexto jerárquico de origen: "${contextPath}".
                
                INSTRUCCIONES:
                1. Evalúa si "${topic}" tiene un significado universal o si requiere su contexto. 
                2. Si el tema depende de su jerarquía (ej. "Discurso" derivado de "Poder-Saber" y "Foucault"), genera subconceptos estrictamente limitados a ese contexto teórico.
                3. Si es un concepto independiente y universal, ignora el contexto y expándelo de forma general.
                4. Genera de 3 a 5 subconceptos clave. No repitas términos que ya existan en la jerarquía.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2
                }
            });
            
            return { statusCode: 200, body: response.text };
        } 
        
        if (action === 'define') {
            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Concepto a definir: "${topic}".
                Ruta contextual en el mapa conceptual: "${contextPath}".
                
                INSTRUCCIONES:
                1. Determina si "${topic}" requiere el contexto proporcionado para ser definido correctamente.
                2. Si el concepto es dependiente (ej. "Discurso" en el contexto de Foucault), defínelo explícitamente dentro de ese marco teórico.
                3. Si es un concepto universal independiente, defínelo de forma general.
                4. Redacta la definición en máximo 2 párrafos concisos.`,
                config: {
                    temperature: 0.2
                }
            });
            
            return { 
                statusCode: 200, 
                body: JSON.stringify({ definition: response.text }) 
            };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción no válida' }) };

    // Aquí estaba el error, este catch debe cerrar el try
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
