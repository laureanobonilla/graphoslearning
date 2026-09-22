const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, topic, contextPath, maxNodes = 3, topicB, text, density = 'medium' } = JSON.parse(event.body);

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
                                    description: 'Verbo de enlace o conector ultracorto (máximo 1 a 3 palabras, ej: "produce", "incluye", "requiere").' 
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
                2. El campo "relationship" solo debe contener un enlace ultracorto de 1 o 2 palabras. Nunca frases largas.`,
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
                2. "relFromA" y "relToB": Verbos o conectores sintéticos de 1 a 3 palabras como máximo.`,
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

        // ==========================================
        // 5. PARSEAR TEXTO COMPLETO A ESQUEMA JERÁRQUICO
        // ==========================================
        if (action === 'parse_text') {
            let densityGuideline = '';
            if (density === 'low') {
                densityGuideline = 'DENSIDAD BAJA (Esencial): Genera solo 2-3 ramas temáticas principales y 1-2 ejemplos globales. Enfócate exclusivamente en las ideas nucleares.';
            } else if (density === 'high') {
                densityGuideline = 'DENSIDAD ALTA (Exhaustiva): Genera entre 6-9 ramas temáticas detalladas y 4-6 ejemplos específicos, capturando matices y elementos secundarios del texto.';
            } else {
                densityGuideline = 'DENSIDAD MEDIA (Equilibrada): Genera 3-5 ramas temáticas centrales y 2-4 ejemplos ilustrativos.';
            }

            const schema = {
                type: 'OBJECT',
                properties: {
                    root: {
                        type: 'OBJECT',
                        properties: {
                            id: { type: 'STRING' },
                            label: { type: 'STRING' },
                            definition: { type: 'STRING', nullable: true }
                        },
                        required: ["id", "label"]
                    },
                    branches: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING' },
                                relationship: { type: 'STRING', description: 'Conector de 1 a 3 palabras.' },
                                definition: { type: 'STRING', nullable: true }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    },
                    examples: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING' },
                                targetId: { type: 'STRING', description: 'ID de la rama a la que ejemplifica' },
                                relationship: { type: 'STRING', description: 'Conector de 1 a 2 palabras.' },
                                definition: { type: 'STRING', nullable: true }
                            },
                            required: ["id", "label", "targetId", "relationship"]
                        }
                    }
                },
                required: ["root", "branches", "examples"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Analiza este documento y organízalo en un esquema jerárquico:
                """${text}"""

                INSTRUCCIONES DE DENSIDAD:
                ${densityGuideline}

                REGLAS ESTRUCTURALES ESTRICTAS:
                1. "root": El concepto rector central.
                2. "branches": Las divisiones conceptuales principales que se derivan de la raíz.
                3. "examples": Casos de uso o aplicaciones vinculadas con "targetId" a su rama teórica.
                4. "relationship": Estrictamente de 1 a 3 palabras como máximo.
                5. "definition": Si el texto provee una definición explícita del concepto, extráela. Si el texto no lo define directamente, coloca null.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2
                }
            });
            return { statusCode: 200, body: response.text };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción no válida' }) };

    } catch (error) {
        console.error('Error en Gemini Function:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};