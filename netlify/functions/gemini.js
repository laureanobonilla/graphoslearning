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
        // 5. SINTETIZAR ESQUEMA INICIAL (3 NIVELES, SIN EJEMPLOS)
        // ==========================================
        if (action === 'parse_text') {
            const isShortTopic = text.trim().split(/\s+/).length < 25;
            
            const inputContext = isShortTopic 
                ? `Construye un esquema conceptual exhaustivo de 3 niveles sobre el tema: "${text}".
                   REGLA DE EXHAUSTIVIDAD: Si el concepto o sus sub-ramas tienen fases, partes, clasificaciones o elementos canónicos definidos (ej. "Fases de la división celular", "Poderes del Estado"), DEBES incluir TODOS los elementos reales que componen cada nivel sin omitir ninguno. Si es un tema abierto (ej. "Política Exterior de Colombia"), despliega un abanico completo con todas las dimensiones y sub-elementos clave.`
                : `Analiza minuciosamente el siguiente documento y estructura un mapa conceptual de 3 niveles estrictamente fiel a su contenido:\n"""${text}"""\n
                   REGLA DE FIDELIDAD AL TEXTO: Descompón el esquema únicamente en las fases, categorías y sub-elementos que mencione o desarrolle la lectura.`;

            const schema = {
                type: 'OBJECT',
                properties: {
                    root: {
                        type: 'OBJECT',
                        description: 'Nivel 1: Nodo central o título general.',
                        properties: {
                            id: { type: 'STRING' },
                            label: { type: 'STRING' },
                            definition: { type: 'STRING', nullable: true }
                        },
                        required: ["id", "label"]
                    },
                    branches: {
                        type: 'ARRAY',
                        description: 'Nivel 2: Categorías principales, fases o pilares que se desprenden de la raíz.',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING' },
                                relationship: { type: 'STRING', description: 'Conector de 1 a 3 palabras desde la raíz.' },
                                definition: { type: 'STRING', nullable: true }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    },
                    subBranches: {
                        type: 'ARRAY',
                        description: 'Nivel 3: Sub-conceptos, etapas específicas o componentes que se desprenden de cada nodo del Nivel 2.',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING' },
                                parentId: { type: 'STRING', description: 'ID exacto del nodo en "branches" (Nivel 2) al que pertenece.' },
                                relationship: { type: 'STRING', description: 'Conector de 1 a 3 palabras desde su nodo padre.' },
                                definition: { type: 'STRING', nullable: true }
                            },
                            required: ["id", "label", "parentId", "relationship"]
                        }
                    }
                },
                required: ["root", "branches", "subBranches"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `${inputContext}

                REGLAS ESTRICTAS DE ESTRUCTURA:
                1. ESTRUCTURA DE 3 NIVELES: Genera el nodo raíz (Nivel 1), todas sus ramas principales correspondientes (Nivel 2) y desglosa cada rama principal en sus sub-nodos correspondientes (Nivel 3).
                2. CERO NODOS DE EJEMPLO: Está PROHIBIDO incluir nodos de "Ejemplo:" en este esquema inicial. Todos los nodos deben ser conceptos, fases, componentes o categorías teóricas/fácticas del tema.
                3. PROHIBICIÓN DE PLACEHOLDERS: Nunca uses textos genéricos como "Subconcepto 1" o "Fase A". Usa los nombres reales.
                4. "relationship": Usa conectores precisos de 1 a 3 palabras.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.15
                }
            });
            return { statusCode: 200, body: response.text };
        }

        // ==========================================
        // 6. PETICIÓN ABIERTA / PERSONALIZADA A UN NODO
        // ==========================================
        if (action === 'custom_prompt') {
            const { customRequest } = JSON.parse(event.body);

            const docPrompt = documentContext 
                ? `DOCUMENTO DE BASE:\n"""${documentContext.slice(0, 12000)}"""\n\nTen en cuenta el documento si es relevante para responder a la petición, o usa conocimiento experto riguroso si el usuario pide una perspectiva externa.`
                : 'Usa conocimiento experto, riguroso y profundo.';

            const schema = {
                type: 'OBJECT',
                properties: {
                    nodes: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                title: { type: 'STRING', description: 'Título corto del nodo o concepto.' },
                                content: { type: 'STRING', nullable: true, description: 'Si el usuario pidió una explicación amplia o desarrollo detallado, pon aquí el párrafo explicativo. Si solo pidió conceptos o ejemplos puntuales, déjalo null.' },
                                relationship: { type: 'STRING', description: 'Conector lógico de 1 a 3 palabras desde el nodo origen.' }
                            },
                            required: ["id", "title", "relationship"]
                        }
                    }
                },
                required: ["nodes"]
            };

            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Nodo seleccionado: "${topic}".
                Contexto en el esquema: "${contextPath}".
                PETICIÓN DEL USUARIO: "${customRequest}".
                ${docPrompt}

                INSTRUCCIONES:
                1. Cumple exactamente lo que pide el usuario respecto al nodo "${topic}".
                2. Si pide una explicación más amplia, análisis profundo o síntesis (ej. "haz una explicación más amplia"), genera 1 nodo (o los necesarios) incluyendo un "title" claro y desarrolla el texto completo dentro de "content".
                3. Si pide una lista de elementos, ejemplos bajo un autor o causas (ej. "dame ejemplos desde la perspectiva de Max Weber"), genera todos los nodos correspondientes que respondan a la solicitud.
                4. "relationship" debe tener de 1 a 3 palabras conectando el nodo origen con cada resultado.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.25
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
