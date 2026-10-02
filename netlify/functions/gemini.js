const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ciclo de reintentos únicamente con los modelos Flash válidos y activos
const FALLBACK_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.6-flash'
];

async function generateWithFallback(payload) {
    let lastError = null;

    for (let i = 0; i < FALLBACK_MODELS.length; i++) {
        const modelName = FALLBACK_MODELS[i];
        try {
            return await ai.models.generateContent({
                ...payload,
                model: modelName
            });
        } catch (err) {
            lastError = err;
            const errMsg = (err.message || JSON.stringify(err)).toLowerCase();
            const isRetryable = 
                errMsg.includes('503') || 
                errMsg.includes('unavailable') || 
                errMsg.includes('429') || 
                errMsg.includes('high demand') || 
                errMsg.includes('overloaded') ||
                errMsg.includes('internal');

            console.warn(`[Intento ${i + 1}/${FALLBACK_MODELS.length}] Modelo ${modelName} ocupado (${err.status || '503'}). Reintentando...`);

            if (!isRetryable) {
                throw err;
            }

            // Pausa de 800ms antes del siguiente intento para dejar pasar el pico de demanda
            if (i < FALLBACK_MODELS.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }
    }
    throw lastError;
}

async function rawHandler(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, topic, contextPath, maxNodes = 3, topicB, text, density = 'medium', documentContext } = JSON.parse(event.body);

        // ==========================================
        // 1. EXPANDIR RAMAS (CONCEPTOS)
        // ==========================================
        // ==========================================
        // 1. EXPANDIR RAMAS (CONCEPTOS + BRECHA DE CURIOSIDAD OPCIONAL)
        // ==========================================
        if (action === 'expand') {
            const { includeCuriosity } = JSON.parse(event.body);

            const schemaProperties = {
                concepts: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            id: { type: 'STRING' },
                            label: { type: 'STRING' },
                            relationship: { type: 'STRING', description: 'Verbo o enlace ultracorto (1 a 3 palabras).' }
                        },
                        required: ["id", "label", "relationship"]
                    }
                }
            };

            const requiredFields = ["concepts"];

            if (includeCuriosity) {
                schemaProperties.curiosityHook = {
                    type: 'OBJECT',
                    description: 'Una pregunta fascinante, paradoja o misterio sin resolver derivado de este concepto que despierte curiosidad inmediata.',
                    properties: {
                        id: { type: 'STRING' },
                        question: { type: 'STRING', description: 'Pregunta corta e intrigante (máx 12 palabras).' }
                    },
                    required: ["id", "question"]
                };
                requiredFields.push("curiosityHook");
            }

            const docPrompt = documentContext 
                ? `DOCUMENTO DE BASE:\n"""${documentContext.slice(0, 12000)}"""\n\nExtrae las derivaciones a partir del documento o complementa con conocimiento riguroso.`
                : 'Usa conocimiento riguroso del tema.';

            const curiosityInstruction = includeCuriosity
                ? `3. "curiosityHook": Formula 1 pregunta provocadora o paradoja real sobre "${topic}" que invite a investigar más a fondo.`
                : '';

            const response = await generateWithFallback({
                contents: `Tema a expandir: "${topic}".
                Contexto jerárquico: "${contextPath}".
                ${docPrompt}
                
                REGLAS CRÍTICAS:
                1. Genera entre 1 y ${maxNodes} conceptos reales y sustanciales. PROHIBIDO usar etiquetas genéricas.
                2. "relationship": Estrictamente de 1 a 3 palabras.
                ${curiosityInstruction}`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: { type: 'OBJECT', properties: schemaProperties, required: requiredFields },
                    temperature: 0.25
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
                            label: { type: 'STRING', description: 'Título CORTO (2-5 palabras) del concepto cumbre o innovación que nace de cruzar A y B. Esto es lo único que se ve en el nodo del mapa, así que debe ser breve como un título.' },
                            explanation: { type: 'STRING', description: 'Explicación completa (2-4 oraciones) de esa sinergia: qué es y por qué surge de unir A y B. Esto se muestra aparte, en un panel, nunca en el nodo.' }
                        },
                        required: ["id", "label", "explanation"]
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

            const response = await generateWithFallback({
                contents: `Descubre la sinergia profunda entre Tema A: "${topic}" y Tema B: "${topicB}".
                
                INSTRUCCIONES:
                1. "synergy": Define el concepto definitivo, la intersección más importante o el resultado innovador de unir ambos campos.
                2. "pathsFromA" y "pathsFromB": Crea los nodos intermedios que explican cómo se llega desde cada extremo hasta esa sinergia central.
                3. ${densityGuideline}
                4. Conectores estrictamente de 1 a 3 palabras. Cero descripciones largas.
                5. "synergy.label" debe ser un TÍTULO corto (2-5 palabras): va solo en el nodo del mapa. "synergy.explanation" lleva la explicación completa aparte.`,
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

            const response = await generateWithFallback({
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

            const response = await generateWithFallback({
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
// ==========================================
        // 4. CARGAR DEFINICIÓN (CON PISTAS INTERACTIVAS OPCIONALES)
        // ==========================================
        if (action === 'define') {
            const { interactive } = JSON.parse(event.body);

            // Sin documento de base del que "agotar" la definición: antes de
            // gastar una llamada a Gemini, se intenta con Wikipedia (gratis y
            // factualmente confiable para entidades reconocidas). Si hay un
            // documento o un video transcrito, ESO manda y Wikipedia no aplica
            // — la prioridad sigue siendo siempre agotar el texto disponible.
            if (!documentContext) {
                try {
                    const { lookupWikipedia } = require('./_lib/wikipedia');
                    const rootHint = (contextPath || '').split('>').map(s => s.trim()).filter(Boolean)[0];
                    const wiki = await lookupWikipedia(topic, rootHint && rootHint !== topic ? rootHint : null);
                    if (wiki) {
                        return {
                            statusCode: 200,
                            body: JSON.stringify({
                                definition: wiki.extract,
                                source: 'wikipedia',
                                image: wiki.image,
                                sourceUrl: wiki.url
                            })
                        };
                    }
                } catch (err) {
                    console.error('[define] Wikipedia no disponible, se usa Gemini:', err.message);
                }
            }

            const docPrompt = documentContext
                ? `DOCUMENTO DE BASE:\n"""${documentContext.slice(0, 12000)}"""\n\nSintetiza la explicación del texto o proporciona una definición rigurosa.`
                : `Proporciona una definición conceptual clara y directa.`;

            const interactiveRule = interactive
                ? `3. PISTAS INTERACTIVAS: Dentro de tu explicación, encierra entre dobles corchetes exactamente de 3 a 4 términos técnicos, sub-conceptos o autores clave que merezcan ser explorados como nuevos nodos (ejemplo: [[Destrucción Creativa]], [[Contrato Social]]).`
                : `3. Solo texto plano, sin asteriscos ni markdown decorativo.`;

            const response = await generateWithFallback({
                contents: `Define el concepto: "${topic}".
                Ruta contextual: "${contextPath}".
                ${docPrompt}
                
                INSTRUCCIONES:
                1. Redacta 1 o 2 párrafos concisos, precisos y sustanciales.
                2. PROHIBIDO redactar definiciones vacías o genéricas. Explica qué es exactamente.
                ${interactiveRule}`,
                config: { temperature: 0.2 }
            });
            return { statusCode: 200, body: JSON.stringify({ definition: response.text, source: 'gemini' }) };
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
                            label: { type: 'STRING' }
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
                                relationship: { type: 'STRING', description: 'Conector de 1 a 3 palabras desde la raíz.' }
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
                                relationship: { type: 'STRING', description: 'Conector de 1 a 3 palabras desde su nodo padre.' }
                            },
                            required: ["id", "label", "parentId", "relationship"]
                        }
                    }
                },
                required: ["root", "branches", "subBranches"]
            };

            const response = await generateWithFallback({
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

            const response = await generateWithFallback({
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
// ==========================================
        // 7. ANTÍTESIS / CONTRADICCIÓN Y PENSAMIENTO CRÍTICO
        // ==========================================
        if (action === 'antithesis') {
            const schema = {
                type: 'OBJECT',
                properties: {
                    critiques: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING', description: 'Título CORTO (2-6 palabras): el nombre de la teoría, autor o fenómeno opuesto (ej: "Falsacionismo de Popper"). Esto es lo único que se ve en el nodo del mapa.' },
                                explanation: { type: 'STRING', description: 'La crítica completa (2-4 oraciones): en qué consiste y por qué contradice o limita el concepto original. Se muestra aparte, en un panel, nunca en el nodo.' },
                                relationship: { type: 'STRING', description: 'Conector de tensión (1-3 palabras, ej: "refutado por", "entra en tensión con", "limitado por").' }
                            },
                            required: ["id", "label", "explanation", "relationship"]
                        }
                    }
                },
                required: ["critiques"]
            };

            const response = await generateWithFallback({
                contents: `Analiza críticamente el concepto: "${topic}" (Contexto: "${contextPath}").
                Genera entre 2 y 3 antítesis reales: posturas filosóficas o científicas opuestas, críticas históricas, paradojas o límites donde este concepto falla.
                PROHIBIDO usar nombres genéricos como "Crítica 1". Nombra la teoría, autor o fenómeno real.
                "label" es solo el título corto de esa teoría/autor/fenómeno; "explanation" lleva el desarrollo completo de la crítica, aparte.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.25
                }
            });
            return { statusCode: 200, body: response.text };
        }

        // ==========================================
        // 8. RETO SOCRÁTICO (GENERAR Y EVALUAR)
        // ==========================================
        if (action === 'socratic_question') {
            const response = await generateWithFallback({
                contents: `Formula UNA pregunta socrática breve, desafiante y fascinante (máximo 2 oraciones) sobre "${topic}" (en el contexto de "${contextPath}") para poner a prueba la comprensión profunda del usuario. No hagas preguntas de memoria básica, sino de causa, implicación o aplicación.`,
                config: { temperature: 0.4 }
            });
            return { statusCode: 200, body: JSON.stringify({ question: response.text }) };
        }

        if (action === 'socratic_evaluate') {
            const { question, userAnswer } = JSON.parse(event.body);
            const schema = {
                type: 'OBJECT',
                properties: {
                    feedback: { type: 'STRING', description: 'Retroalimentación breve (2-3 oraciones), estimulante y constructiva sobre la respuesta del usuario.' },
                    masteryNodeTitle: { type: 'STRING', description: 'Título corto (2-5 palabras) que sintetiza el aprendizaje o conclusión alcanzada.' }
                },
                required: ["feedback", "masteryNodeTitle"]
            };

            const response = await generateWithFallback({
                contents: `Concepto: "${topic}".
                Pregunta planteada: "${question}".
                Respuesta del usuario: "${userAnswer}".
                Evalúa con rigor intelectual pero tono motivador la respuesta del usuario, señala qué acertó o qué matiz importante puede sumar, y otorga un título de síntesis para su nuevo Nodo de Dominio.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.3
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


module.exports.handler = require('./_lib/billing').withBilling(rawHandler);
