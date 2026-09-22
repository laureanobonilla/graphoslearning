const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, topic, contextPath, maxNodes = 3, topicB, text, density = 'medium', documentContext } = JSON.parse(event.body);

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
                                    description: 'Verbo o enlace ultracorto (1 a 3 palabras).' 
                                }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["concepts"]
            };

            const docPrompt = documentContext 
                ? `DOCUMENTO DE BASE:\n"""${documentContext.slice(0, 12000)}"""\n\nREGLA DE PRIORIDAD: Extrae las derivaciones a partir de los hechos y argumentos presentes en el documento. Si el documento no contiene suficiente detalle específico para este nodo, complementa con conocimiento riguroso del tema.`
                : 'Usa conocimiento riguroso del tema.';

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Tema a expandir: "${topic}".
                Contexto jerárquico: "${contextPath}".
                ${docPrompt}
                
                REGLAS CRÍTICAS:
                1. Genera entre 1 y ${maxNodes} conceptos reales y sustanciales. PROHIBIDO usar etiquetas genéricas o placeholders como "Concepto A", "Paso 1", "Elemento clave". Nombra el concepto explícito.
                2. "relationship": Estrictamente de 1 a 3 palabras (ej: "deriva en", "regulado por", "incluye").`,
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
                                label: { type: 'STRING', description: 'Nombre concreto del caso real o aplicación práctica' },
                                relationship: { type: 'STRING', description: 'Conector de 1 a 2 palabras.' }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    }
                },
                required: ["examples"]
            };

            const docPrompt = documentContext 
                ? `DOCUMENTO DE BASE:\n"""${documentContext.slice(0, 12000)}"""\n\nREGLA DE PRIORIDAD: Busca casos, experimentos, aplicaciones o situaciones mencionadas en el documento para "${topic}". Solo si el documento carece de ejemplos concretos, genera ejemplos reales del mundo exterior.`
                : 'Genera ejemplos reales y específicos del mundo exterior.';

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Concepto: "${topic}".
                Contexto jerárquico: "${contextPath}".
                ${docPrompt}
                
                REGLAS CRÍTICAS ANTI-PLACEHOLDER:
                1. PROHIBIDO GENERAR textos como "Ejemplo Específico A", "Caso de Estudio 1", "Resultado B". Nombra el caso o la aplicación concreta (ej: "Cifrado RSA", "Fiebre del oro de 1848", "Vacuna de ARN mensajero").
                2. Genera entre 1 y ${maxNodes} ejemplos reales. Si solo hay 1 o 2 válidos, devuelve solo esos.
                3. "relationship": Conector de 1 o 2 palabras (ej: "ejemplo de", "aplicado en").`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2
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
                            label: { type: 'STRING' },
                            relFromA: { type: 'STRING' },
                            relToB: { type: 'STRING' }
                        },
                        required: ["id", "label", "relFromA", "relToB"]
                    }
                },
                required: ["bridge"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Conecta lógicamente Tema A: "${topic}" con Tema B: "${topicB}".
                Genera un concepto puente intermedio concreto (no genérico). Conectores de 1 a 3 palabras.`,
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
            const docPrompt = documentContext 
                ? `DOCUMENTO DE BASE:\n"""${documentContext.slice(0, 12000)}"""\n\nSi el documento explica o describe "${topic}", extrae y sintetiza esa explicación explícita. Si no se menciona con profundidad en el texto, proporciona una definición rigurosa y directa.`
                : `Proporciona una definición conceptual clara y directa.`;

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Define el concepto: "${topic}".
                Ruta contextual: "${contextPath}".
                ${docPrompt}
                
                INSTRUCCIONES:
                1. Redacta 1 o 2 párrafos concisos, precisos y sustanciales.
                2. PROHIBIDO redactar definiciones vacías o genéricas ("Este es un concepto que representa un elemento en el sistema"). Explica qué es exactamente.
                3. Solo texto plano, sin asteriscos ni markdown decorativo.`,
                config: { temperature: 0.2 }
            });
            return { statusCode: 200, body: JSON.stringify({ definition: response.text }) };
        }

        // ==========================================
        // 5. PARSEAR TEXTO A ESQUEMA JERÁRQUICO
        // ==========================================
        if (action === 'parse_text') {
            let densityGuideline = '';
            if (density === 'low') {
                densityGuideline = 'DENSIDAD BAJA: 2 a 3 ramas principales y 1 a 2 ejemplos concretos sólo si el texto los menciona.';
            } else if (density === 'high') {
                densityGuideline = 'DENSIDAD ALTA: 6 a 9 ramas temáticas detalladas y los ejemplos o casos que el texto cite.';
            } else {
                densityGuideline = 'DENSIDAD MEDIA: 3 a 5 ramas temáticas y 2 a 3 ejemplos relevantes presentes en la lectura.';
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
                                targetId: { type: 'STRING' },
                                relationship: { type: 'STRING' },
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
                contents: `Analiza minuciosamente el siguiente texto y estructura un mapa conceptual fiel a su contenido:
                """${text}"""

                PAUTAS DE DENSIDAD:
                ${densityGuideline}

                PROHIBICIÓN ESTRICTA DE PLACEHOLDERS Y RELLENO:
                - Queda terminantemente PROHIBIDO inventar o usar textos comodín como: "Ejemplo Específico A", "Caso de Uso B", "Resultado C", "Concepto 1", "Factor X".
                - Todos los "label" de ramas y ejemplos DEBEN ser términos, nombres de teorías, datos, entidades o situaciones reales extraídas directamente de la lectura.
                - Si el texto no menciona ejemplos concretos para una rama, NO inventes nada: deja el arreglo "examples" vacío o con menos elementos.
                - En "definition", si el texto explica qué es el término, extráelo con precisión. Si no lo explica, pon null.
                - En "relationship", usa únicamente 1 a 3 palabras (ej: "origina", "consiste en", "clasificado en").`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.15
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