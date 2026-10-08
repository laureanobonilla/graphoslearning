const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ciclo de reintentos únicamente con los modelos Flash válidos y activos
const FALLBACK_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.6-flash'
];

async function generateWithFallbackBase(payload) {
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


// Idioma de salida. Los prompts están escritos en español; para otros idiomas se antepone una
// instrucción única (en vez de duplicar cada prompt). Las claves JSON y los valores enum no cambian.
const LANG_DIRECTIVES = {
    en: 'OUTPUT LANGUAGE: Write EVERY user-facing text value (titles, labels, definitions, explanations, questions, examples, feedback) in natural English, even though the instructions below are in Spanish. If the source text or topic is in another language, still answer in English. Keep JSON keys, field names and enum values exactly as specified, and keep any literal marker in the instructions that is not human-readable text.\n\n'
};
function normalizeLang(l) { return Object.prototype.hasOwnProperty.call(LANG_DIRECTIVES, l) ? l : 'es'; }
function localizePayload(payload, lang) {
    const d = LANG_DIRECTIVES[lang];
    if (!d || typeof payload.contents !== 'string') return payload;
    return { ...payload, contents: d + payload.contents };
}

async function rawHandler(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { action, topic, contextPath, maxNodes = 3, topicB, text, density = 'medium', documentContext, lang: rawLang } = JSON.parse(event.body);
        const lang = normalizeLang(rawLang);
        // Todas las llamadas de abajo pasan por aquí: añade la instrucción de idioma.
        const generateWithFallback = (payload) => generateWithFallbackBase(localizePayload(payload, lang));

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
                    responseSchema: { type: 'OBJECT', properties: schemaProperties, required: requiredFields }
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
                    responseSchema: schema
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
                    responseSchema: schema
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
                    responseSchema: schema
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
                config: {}
            });
            return { statusCode: 200, body: JSON.stringify({ definition: response.text, source: 'gemini' }) };
        }

// ==========================================
        // 4b. EXPLICACIÓN SENCILLA (lenguaje simple + analogía + ejemplo)
        // ==========================================
        // Distinto de "define": esto NO es una versión más corta de la definición
        // técnica, es una explicación pensada para alguien que nunca ha oído el
        // concepto — sin jerga, con una comparación cotidiana y un ejemplo concreto.
        if (action === 'simple_explanation') {
            const schema = {
                type: 'OBJECT',
                properties: {
                    definition: { type: 'STRING', description: 'Explicación en 1-2 oraciones MUY simples, sin jerga técnica ni palabras especializadas. Como si se la explicaras a alguien inteligente pero que nunca ha oído el tema.' },
                    analogy: { type: 'STRING', description: 'Una analogía o comparación concreta y cotidiana (de la vida diaria, no de otro campo técnico) que ayude a entender la idea de un vistazo.' },
                    example: { type: 'STRING', description: 'Un ejemplo breve y concreto de esto en la vida real o en un caso reconocible — nunca un ejemplo abstracto o genérico.' }
                },
                required: ["definition", "analogy", "example"]
            };

            const docPrompt = documentContext
                ? `DOCUMENTO DE BASE:\n"""${documentContext.slice(0, 12000)}"""\n\nBasa la explicación en lo que dice el documento sobre este concepto, pero igual simplifícalo al máximo.`
                : '';

            const response = await generateWithFallback({
                contents: `Explica el concepto "${topic}" (contexto: "${contextPath}") de la forma MÁS SENCILLA posible, para alguien que no domina el tema en absoluto.
                ${docPrompt}

                REGLAS:
                1. Cero jerga técnica, cero palabras que a su vez necesiten explicación. Si usas un término especializado, no lo puedes evitar explicándolo en palabras de todos los días.
                2. La analogía debe ser de algo cotidiano y reconocible (cocinar, el tráfico, una fiesta, el cuerpo humano, deportes, etc.), NUNCA de otro concepto técnico.
                3. El ejemplo debe ser concreto y específico, nunca "por ejemplo, en muchos casos...".
                4. Tono cercano y claro, como explicándole a un amigo curioso, no como un libro de texto.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            });
            return { statusCode: 200, body: response.text };
        }

// ==========================================
        // 5. SINTETIZAR ESQUEMA INICIAL (3 NIVELES, SIN EJEMPLOS)
        // ==========================================
        // 'welcome_schema' = el primer esquema del asistente de bienvenida: se genera
        // EXACTAMENTE igual que parse_text; solo cambia que billing.js lo deja gratis
        // (una vez por persona).
        if (action === 'parse_text' || action === 'welcome_schema') {
            const isShortTopic = text.trim().split(/\s+/).length < 25;
            const { focusTerms } = JSON.parse(event.body);

            const inputContext = isShortTopic
                ? `Construye un esquema conceptual exhaustivo de 3 niveles sobre el tema: "${text}".
                   REGLA DE EXHAUSTIVIDAD: Si el concepto o sus sub-ramas tienen fases, partes, clasificaciones o elementos canónicos definidos (ej. "Fases de la división celular", "Poderes del Estado"), DEBES incluir TODOS los elementos reales que componen cada nivel sin omitir ninguno. Si es un tema abierto (ej. "Política Exterior de Colombia"), despliega un abanico completo con todas las dimensiones y sub-elementos clave.`
                : `Analiza minuciosamente el siguiente documento y estructura un mapa conceptual de 3 niveles estrictamente fiel a su contenido:\n"""${text}"""\n
                   REGLA DE FIDELIDAD AL TEXTO: Descompón el esquema únicamente en las fases, categorías y sub-elementos que mencione o desarrolle la lectura.`;

            const focusHint = (Array.isArray(focusTerms) && focusTerms.length > 0)
                ? `\n\nTÉRMINOS DE ENFOQUE PRIORITARIO: El usuario ha marcado estos términos/pasajes como especialmente importantes: ${focusTerms.map(t => `"${t}"`).join(', ')}. Asegúrate de que cada uno de ellos quede representado explícitamente como un nodo (en el nivel que corresponda), sin forzar la estructura si no calza naturalmente.`
                : '';

            const sourceQuoteNote = !isShortTopic
                ? ' Además, para cada nodo incluye "sourceQuote": una cita literal y breve (máx. 15 palabras), copiada EXACTAMENTE tal como aparece en el documento original, que sea la evidencia textual de ese nodo. Si el nodo resume varias partes del texto, cita el fragmento más representativo. Nunca inventes ni paraphrasees la cita; debe ser texto literal copiado del documento.'
                : ' El campo "sourceQuote" en este caso puede dejarse como cadena vacía ("") ya que no hay documento fuente, solo un tema.';

            const schema = {
                type: 'OBJECT',
                properties: {
                    root: {
                        type: 'OBJECT',
                        description: 'Nivel 1: Nodo central o título general.',
                        properties: {
                            id: { type: 'STRING' },
                            label: { type: 'STRING' },
                            sourceQuote: { type: 'STRING', description: 'Cita literal breve del documento origen, o cadena vacía si no aplica.' }
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
                                sourceQuote: { type: 'STRING', description: 'Cita literal breve del documento origen, o cadena vacía si no aplica.' }
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
                                sourceQuote: { type: 'STRING', description: 'Cita literal breve del documento origen, o cadena vacía si no aplica.' }
                            },
                            required: ["id", "label", "parentId", "relationship"]
                        }
                    },
                    gaps: {
                        type: 'ARRAY',
                        description: 'DETECCIÓN DE HUECOS: lista (máximo 5) de conceptos que el texto/tema MENCIONA de paso pero no desarrolla a fondo dentro de este esquema — cosas que quedaron fuera porque no alcanzaron a tener su propio nodo, pero que alguien que quiera entender el tema a fondo debería investigar después. Si no detectas ninguno genuino, devuelve un array vacío — nunca inventes huecos artificiales solo para llenar la lista.',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                term: { type: 'STRING', description: 'El concepto mencionado pero no desarrollado, en pocas palabras.' },
                                relatedNodeId: { type: 'STRING', description: 'El "id" exacto (de root, branches o subBranches de este mismo esquema) del nodo donde se menciona este hueco o con el que está más relacionado.' },
                                note: { type: 'STRING', description: 'Una sola oración breve explicando qué le falta cubrir a este concepto.' }
                            },
                            required: ["term", "relatedNodeId", "note"]
                        }
                    }
                },
                required: ["root", "branches", "subBranches", "gaps"]
            };

            const response = await generateWithFallback({
                contents: `${inputContext}

                REGLAS ESTRICTAS DE ESTRUCTURA:
                1. ESTRUCTURA DE 3 NIVELES: Genera el nodo raíz (Nivel 1), todas sus ramas principales correspondientes (Nivel 2) y desglosa cada rama principal en sus sub-nodos correspondientes (Nivel 3).
                2. CERO NODOS DE EJEMPLO: Está PROHIBIDO incluir nodos de "Ejemplo:" en este esquema inicial. Todos los nodos deben ser conceptos, fases, componentes o categorías teóricas/fácticas del tema.
                3. PROHIBICIÓN DE PLACEHOLDERS: Nunca uses textos genéricos como "Subconcepto 1" o "Fase A". Usa los nombres reales.
                4. "relationship": Usa conectores precisos de 1 a 3 palabras.
                5. "sourceQuote":${sourceQuoteNote}
                6. "gaps": revisa el texto/tema una vez armado el esquema y detecta qué conceptos se mencionan de paso (una referencia, un nombre, un término técnico) pero NO llegaron a tener su propio nodo — esos son los huecos. Máximo 5, y solo los genuinamente relevantes para entender el tema a fondo. Si no hay ninguno real, "gaps" debe ser un array vacío.${focusHint}`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            });
            return { statusCode: 200, body: response.text };
        }

        // ==========================================
        // 5b. ANALIZAR UN TEXTO (distinto de parse_text: no estructura lo que
        // el texto DICE, sino que lo analiza desde una lente específica —
        // argumentativa, académica, literaria, etc. Cada nodo es una
        // observación analítica, no un tema citado. Reutiliza el mismo
        // schema de 3 niveles que parse_text a propósito, para que el
        // frontend pueda renderizar el resultado con el mismo
        // renderThreeLevelTree sin ningún cambio.
        // ==========================================
        if (action === 'analyze_text') {
            const { analysisType, customType } = JSON.parse(event.body);

            const ANALYSIS_LENSES = {
                critico: `ANÁLISIS ARGUMENTATIVO/CRÍTICO: identifica la tesis central del texto, los argumentos principales que la sostienen, la evidencia o datos que usa el autor para respaldar cada argumento, los supuestos no declarados o posibles sesgos del autor, y las objeciones o puntos débiles que un lector crítico podría señalar. Usa estas categorías (o las que de verdad apliquen a este texto) como ramas de Nivel 2: Tesis, Argumentos clave, Evidencia, Supuestos/Sesgos, Objeciones o puntos débiles.`,
                academico: `ANÁLISIS ACADÉMICO/DE INVESTIGACIÓN: identifica la pregunta o problema de investigación que aborda el texto, la metodología que emplea (si aplica), los principales hallazgos o resultados, las limitaciones que el propio texto reconoce o que se puedan inferir razonablemente, y las conclusiones o implicaciones que plantea. Usa estas categorías (o las que de verdad apliquen) como ramas de Nivel 2: Pregunta/Problema, Metodología, Hallazgos, Limitaciones, Conclusiones.`,
                literario: `ANÁLISIS LITERARIO: identifica el tema central del texto, su estructura narrativa (planteamiento, desarrollo, desenlace, u otra que corresponda), el estilo y los recursos literarios o retóricos que usa el autor, la voz y perspectiva narrativa, y los símbolos o motivos recurrentes si los hay. Usa estas categorías (o las que de verdad apliquen) como ramas de Nivel 2: Tema central, Estructura, Estilo y recursos, Voz/Perspectiva, Símbolos/Motivos.`,
                retorico: `ANÁLISIS RETÓRICO/PERSUASIVO: identifica el propósito comunicativo del texto, la audiencia a la que parece dirigirse, las estrategias retóricas que usa (apelación a la razón, a la emoción, a la credibilidad del autor, u otras), el tono y registro del texto, y las técnicas persuasivas específicas que emplea. Usa estas categorías (o las que de verdad apliquen) como ramas de Nivel 2: Propósito, Audiencia, Estrategias retóricas, Tono/Registro, Técnicas persuasivas.`,
                comparativo: `ANÁLISIS COMPARATIVO DE POSTURAS: identifica las distintas posturas o posiciones que el texto presenta en tensión, los fundamentos o argumentos que sostienen a cada una, los puntos en que esas posturas coinciden, los puntos en que están en desacuerdo, y la tensión o pregunta que queda sin resolver. Usa estas categorías (o las que de verdad apliquen) como ramas de Nivel 2: Posturas identificadas, Fundamentos de cada postura, Puntos de acuerdo, Puntos de desacuerdo, Tensión sin resolver.`,
                custom: `ANÁLISIS SEGÚN LO QUE PIDIÓ EL USUARIO: analiza el texto específicamente desde este ángulo, en sus propias palabras: "${String(customType || '').slice(0, 200)}". Deriva las categorías de Nivel 2 que mejor respondan a ese pedido, usando el texto como única fuente — nunca inventes categorías que el usuario no pidió.`
            };
            const lens = ANALYSIS_LENSES[analysisType] || ANALYSIS_LENSES.custom;

            const schema = {
                type: 'OBJECT',
                properties: {
                    root: {
                        type: 'OBJECT',
                        description: 'Nivel 1: título del análisis (ej. "Análisis crítico de..." seguido de una referencia breve al texto o su tema).',
                        properties: {
                            id: { type: 'STRING' },
                            label: { type: 'STRING' },
                            sourceQuote: { type: 'STRING', description: 'Cadena vacía — no aplica al nodo raíz.' }
                        },
                        required: ["id", "label"]
                    },
                    branches: {
                        type: 'ARRAY',
                        description: 'Nivel 2: las categorías de análisis (ver instrucciones de la lente de análisis más abajo).',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING' },
                                relationship: { type: 'STRING', description: 'Conector de 1 a 3 palabras desde la raíz.' },
                                sourceQuote: { type: 'STRING', description: 'Cita literal breve del texto que mejor representa esta categoría, o cadena vacía.' }
                            },
                            required: ["id", "label", "relationship"]
                        }
                    },
                    subBranches: {
                        type: 'ARRAY',
                        description: 'Nivel 3: observaciones u elementos específicos encontrados en el texto para cada categoría de Nivel 2.',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                label: { type: 'STRING' },
                                parentId: { type: 'STRING', description: 'ID exacto del nodo en "branches" (Nivel 2) al que pertenece.' },
                                relationship: { type: 'STRING', description: 'Conector de 1 a 3 palabras desde su nodo padre.' },
                                sourceQuote: { type: 'STRING', description: 'Cita literal breve del texto, evidencia de este elemento específico, o cadena vacía.' }
                            },
                            required: ["id", "label", "parentId", "relationship"]
                        }
                    }
                },
                required: ["root", "branches", "subBranches"]
            };

            const response = await generateWithFallback({
                contents: `Analiza minuciosamente el siguiente texto y estructura ESE ANÁLISIS (no un resumen ni una extracción de sus temas) en un mapa conceptual de 3 niveles:
                """${text}"""

                ${lens}

                REGLAS ESTRICTAS:
                1. Esto NO es extraer los temas que el texto menciona — es analizarlo desde la lente indicada arriba. Cada nodo debe ser una observación analítica (qué hace o cómo funciona el texto), no solo un tema citado de él.
                2. ESTRUCTURA DE 3 NIVELES: nodo raíz (Nivel 1, el título del análisis), categorías de análisis (Nivel 2), y observaciones específicas encontradas en el texto para cada categoría (Nivel 3).
                3. FIDELIDAD AL TEXTO: toda observación debe estar fundamentada en lo que el texto realmente dice o hace — nunca inventes argumentos, posturas o recursos que no estén ahí. Si el texto es corto o simple, no fuerces una estructura más compleja de lo que da el material.
                4. Si alguna categoría de la lente no aplica a este texto en particular (ej. "Metodología" en un texto que no es un estudio), omítela en vez de forzarla con contenido vacío.
                5. "relationship": conectores precisos de 1 a 3 palabras.
                6. "sourceQuote": cita literal y breve (máx. 15 palabras), copiada EXACTAMENTE tal como aparece en el texto original, como evidencia de cada nodo. Nunca inventes ni parafrasees la cita.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            });
            return { statusCode: 200, body: response.text };
        }

        // ==========================================
        // 5c. EXTRAER TÉRMINOS CLAVE DE UN TEXTO
        // ==========================================
        if (action === 'extract_key_terms') {
            const schema = {
                type: 'OBJECT',
                properties: {
                    terms: {
                        type: 'ARRAY',
                        description: 'Entre 6 y 14 términos o frases cortas clave del texto, cada uno copiado literalmente (misma mayúscula/minúscula y forma) tal como aparece en el documento, para poder ubicarlos con una búsqueda exacta.',
                        items: { type: 'STRING' }
                    }
                },
                required: ["terms"]
            };

            const response = await generateWithFallback({
                contents: `Lee el siguiente texto y extrae los términos o frases clave (sustantivos o expresiones cortas, de 1 a 4 palabras) que mejor representan sus ideas centrales. Cada término DEBE aparecer copiado literalmente (exactamente igual, incluyendo mayúsculas/minúsculas) en el texto, para que pueda ser localizado con una búsqueda exacta de substring.\n\nTEXTO:\n"""${text.slice(0, 12000)}"""\n\nDevuelve entre 6 y 14 términos, sin duplicados, priorizando los más relevantes y distribuidos a lo largo del texto.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema
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
                    responseSchema: schema
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
                    responseSchema: schema
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
                config: {}
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
                    responseSchema: schema
                }
            });
            return { statusCode: 200, body: response.text };
        }

        // ==========================================
        // 12. TEXTO DE BIENVENIDA (asistente de primera visita, GRATIS)
        // ==========================================
        // Genera un texto de lectura breve, alineado con los intereses
        // académicos que la persona declaró en el asistente, con énfasis en las
        // BASES del tema. Ese texto se usa luego como fuente del primer esquema,
        // para mostrar el flujo "texto → esquema" de la herramienta.
        if (action === 'onboarding_text') {
            const ob = JSON.parse(event.body);
            const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
            const field = clip(topic, 200);
            if (!field) return { statusCode: 400, body: JSON.stringify({ error: 'Falta el campo de estudio' }) };
            const purpose = clip(ob.purpose, 60);
            const level = clip(ob.level, 30);
            const question = clip(ob.question, 400);
            const areas = (Array.isArray(ob.areas) ? ob.areas : []).slice(0, 3).map(a => clip(a, 50)).filter(Boolean);

            const schema = {
                type: 'OBJECT',
                properties: {
                    title: { type: 'STRING', description: lang === 'en' ? 'Short title (max 8 words) of the text, in English.' : 'Título corto (máximo 8 palabras) del texto, en español.' },
                    text: { type: 'STRING', description: lang === 'en' ? 'The full text, in English, 450 to 650 words, in paragraphs separated by a blank line. No markdown, no bullet lists, no headings with # or asterisks.' : 'El texto completo, en español, de 450 a 650 palabras, en párrafos separados por una línea en blanco. Sin markdown, sin listas con viñetas, sin encabezados con # ni asteriscos.' }
                },
                required: ['title', 'text']
            };

            const response = await generateWithFallback({
                contents: `Escribe un texto de estudio en ${lang === 'en' ? 'inglés' : 'español'} para una persona que quiere explorar este campo: "${field}".
${purpose ? `Lo estudia para: ${purpose}.` : ''}
${areas.length ? `Sus intereses académicos relacionados son: ${areas.join(', ')}.` : ''}
${level ? `Su nivel actual: ${level}.` : ''}
${question ? `Una duda que le intriga: "${question}".` : ''}

INSTRUCCIONES:
1. Explora con profundidad las BASES del tema: qué es exactamente, de dónde surge, sus conceptos y distinciones fundamentales, los supuestos sobre los que se apoya y las principales corrientes o enfoques.
2. Conecta el campo con los intereses académicos indicados (si hay): muestra cómo dialogan, qué se toman prestado y dónde chocan. Si no hay intereses, profundiza solo en el campo.
3. Ajusta el nivel de dificultad al nivel indicado; si es principiante, define cada término técnico la primera vez que aparezca.
4. Si hay una duda, respóndela dentro del texto de forma natural, sin hacer un apartado aparte.
5. NO inventes citas textuales, referencias bibliográficas, estudios, cifras ni fechas dudosas. Si algo es debatido o incierto, dilo claramente en vez de afirmarlo.
6. Es un texto para estudiar y para que se pueda convertir en un esquema conceptual: cada párrafo debe desarrollar una idea distinta y clara, con términos bien definidos.
7. Tono académico pero claro, en segunda persona del plural o impersonal; nada de saludos, ni "en este texto veremos".`,
                config: { responseMimeType: 'application/json', responseSchema: schema }
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
