const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, topic, contextPath, maxNodes = 3, topicB } = JSON.parse(event.body);

        // ==========================================
        // 1. EXPANDIR RAMAS (CONCEPTOS)
        // ==========================================
        if (action === 'expand') {
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
                                relationship: { 
                                    type: 'STRING', 
                                    description: 'Verbo de enlace o conector extremadamente corto (máximo 1 a 3 palabras, ej: "produce", "incluye", "requiere").' 
                                }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["concepts"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Tema central: "${topic}".
                Contexto jerárquico: "${contextPath}".
                
                REGLAS CRÍTICAS:
                1. Genera EXACTAMENTE ${maxNodes} subconceptos clave en "label".
                2. El campo "relationship" DEBE SER UN CONECTOR ULTRACORTO (de 1 a 3 palabras como máximo). 
                   Ejemplos válidos: "produce", "incluye", "regulado por", "deriva en", "se divide en".
                   PROHIBIDO escribir oraciones explicativas o párrafos en "relationship".`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2
                }
            });
            return { statusCode: 200, body: response.text };
        } 

        // ==========================================
        // 2. DAR EJEMPLOS PRÁCTICOS
        // ==========================================
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
                                label: { type: 'STRING', description: 'Nombre conciso del caso práctico o ejemplo' },
                                relationship: { 
                                    type: 'STRING', 
                                    description: 'Conector de máximo 2 palabras (ej: "ejemplo de", "aplicado en", "caso de")' 
                                }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["examples"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Concepto: "${topic}".
                Contexto: "${contextPath}".
                
                REGLAS CRÍTICAS:
                1. Genera EXACTAMENTE ${maxNodes} ejemplos prácticos concisos.
                2. El campo "relationship" solo debe contener un enlace ultracorto de 1 o 2 palabras (ej: "ejemplo de", "caso en", "aplicación"). Nunca frases largas.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.3
                }
            });
            return { statusCode: 200, body: response.text };
        }

        // ==========================================
        // 3. CONECTAR DOS NODOS (PUENTE)
        // ==========================================
        if (action === 'connect') {
            const schema = {
                type: 'OBJECT',
                properties: {
                    bridge: {
                        type: 'OBJECT',
                        properties: {
                            id: { type: 'STRING' },
                            label: { type: 'STRING', description: 'Concepto puente intermedio' },
                            relFromA: { type: 'STRING', description: 'Conector de 1 a 3 palabras desde Tema A' },
                            relToB: { type: 'STRING', description: 'Conector de 1 a 3 palabras hacia Tema B' }
                        },
                        required: ["id", "label", "relFromA", "relToB"]
                    }
                },
                required: ["bridge"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Conecta lógicamente Tema A: "${topic}" con Tema B: "${topicB}".
                
                REGLAS CRÍTICAS:
                1. "label": Nombre corto del concepto intermedio.
                2. "relFromA" y "relToB": Verbos o conectores sintéticos de 1 a 3 palabras como máximo (ej: "influye en", "determina", "basado en"). No redactes párrafos.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2
                }
            });
            return { statusCode: 200, body: response.text };
        }

        // ==========================================
        // 4. CARGAR DEFINICIÓN
        // ==========================================
        if (action === 'define') {
            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Concepto a definir: "${topic}".
                Ruta contextual: "${contextPath}".
                
                INSTRUCCIONES:
                1. Redacta la definición en 1 o 2 párrafos concisos y claros.
                2. Solo texto plano, sin asteriscos ni markdown decorativo.`,
                config: { temperature: 0.2 }
            });
            return { statusCode: 200, body: JSON.stringify({ definition: response.text }) };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción no válida' }) };

    } catch (error) {
        console.error('Error en Gemini Function:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};