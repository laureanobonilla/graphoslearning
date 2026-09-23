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
        // SINERGIA (FUSIÓN DE DOS NODOS)
        // ==========================================
        if (action === 'synergy') {
            let densityGuideline = '';
            if (density === 'low') {
                densityGuideline = 'DENSIDAD BAJA: 1 concepto intermedio desde el Tema A y 1 desde el Tema B.';
            } else if (density === 'high') {
                densityGuideline = 'DENSIDAD ALTA: 3 conceptos intermedios desde el Tema A y 3 desde el Tema B.';
            } else {
                densityGuideline = 'DENSIDAD MEDIA o AUTO: 2 conceptos intermedios desde el Tema A y 2 desde el Tema B.';
            }

            const schema = {
                type: 'OBJECT',
                properties: {
                    synergy: {
                        type: 'OBJECT',
                        properties: {
                            id: { type: 'STRING' },
                            label: { type: 'STRING', description: 'El concepto cumbre o innovación que nace de cruzar A y B.' }
                        },
                        required: ["id", "label"]
                    },
                    pathsFromA: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING', description: 'Concepto puente que nace de A' },
                                relFromA: { type: 'STRING', description: 'Conector (1-3 palabras) desde Tema A' },
                                relToSynergy: { type: 'STRING', description: 'Conector (1-3 palabras) hacia la Sinergia' }
                            },
                            required: ["id", "label", "relFromA", "relToSynergy"]
                        }
                    },
                    pathsFromB: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING', description: 'Concepto puente que nace de B' },
                                relFromB: { type: 'STRING', description: 'Conector (1-3 palabras) desde Tema B' },
                                relToSynergy: { type: 'STRING', description: 'Conector (1-3 palabras) hacia la Sinergia' }
                            },
                            required: ["id", "label", "relFromB", "relToSynergy"]
                        }
                    }
                },
                required: ["synergy", "pathsFromA", "pathsFromB"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Descubre la sinergia profunda entre Tema A: "${topic}" y Tema B: "${topicB}".
                
                INSTRUCCIONES:
                1. "synergy": Define el concepto definitivo, la intersección más importante o el resultado innovador de unir ambos campos.
                2. "pathsFromA" y "pathsFromB": Crea los nodos intermedios que explican cómo se llega desde cada extremo hasta esa sinergia central.
                3. ${densityGuideline}
                4. Conectores estrictamente de 1 a 3 palabras. Cero descripciones largas.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.3
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
        // ==========================================
        // 5. SINTETIZAR ESQUEMA (TEXTO LARGO O TEMA CORTO)
        // ==========================================
        if (action === 'parse_text') {
            let densityGuideline = '';
            
            if (density === 'low') {
                densityGuideline = 'DENSIDAD BAJA: Genera 2-3 ramas principales y 1 ejemplo global. Máximo 5 nodos en total.';
            } else if (density === 'high') {
                densityGuideline = 'DENSIDAD ALTA: Genera 4-6 ramas detalladas y 3-4 ejemplos específicos. Máximo 10 nodos en total.';
            } else if (density === 'medium') {
                densityGuideline = 'DENSIDAD MEDIA: Genera 3-4 ramas centrales y 2-3 ejemplos. Máximo 8 nodos en total.';
            } else {
                densityGuideline = 'DENSIDAD INTELIGENTE (AUTO): Evalúa la complejidad del tema. Si es simple, usa densidad baja. Si es un tema amplio o científico, despliega ramas y ejemplos exhaustivos sin superar JAMÁS los 10 nodos generados (ramas + ejemplos).';
            }

            // Detectar si es un documento largo o solo el nombre de un tema
            const isShortTopic = text.trim().split(/\s+/).length < 20;
            const inputContext = isShortTopic 
                ? `Construye un esquema conceptual experto sobre este tema: "${text}"`
                : `Analiza minuciosamente el siguiente documento y estructura un mapa conceptual fiel a su contenido:\n"""${text}"""`;

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
                                relationship: { type: 'STRING' },
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
                contents: `${inputContext}

                PAUTAS DE DENSIDAD:
                ${densityGuideline}

                PROHIBICIÓN ESTRICTA DE PLACEHOLDERS:
                - Queda terminantemente PROHIBIDO inventar textos comodín como: "Ejemplo Específico A", "Caso de Uso B", "Concepto 1".
                - Los "label" DEBEN ser términos, teorías, datos o situaciones reales (ej. en lugar de "Ejemplo 1", usa "El colapso de Wall Street de 1929").
                - Si analizas un texto largo, extrae los datos del texto. Si es un tema corto, extrae de tu conocimiento experto.
                - "relationship" usa únicamente 1 a 3 palabras.`,
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