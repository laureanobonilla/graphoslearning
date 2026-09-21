const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Agregamos maxNodes (por defecto 3)
        const { action, topic, contextPath, maxNodes = 3 } = JSON.parse(event.body);

        if (action === 'expand') {
            const schema = { /* ... mantén tu schema intacto ... */ };

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
        
        if (action === 'define') {
            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Concepto a definir: "${topic}".
                Ruta contextual en el mapa conceptual: "${contextPath}".
                
                INSTRUCCIONES CRÍTICAS:
                1. Redacta la definición en máximo 2 párrafos cortos.
                2. Usa ÚNICAMENTE TEXTO PLANO. Está ESTRICTAMENTE PROHIBIDO usar formato Markdown (nada de asteriscos ** o *).
                3. Determina si requiere su contexto teórico o si es universal.`,
                config: { temperature: 0.2 }
            });
            return { statusCode: 200, body: JSON.stringify({ definition: response.text }) };
        }

        return { statusCode: 400, body: JSON.stringify({ error: 'Acción no válida' }) };

    // Aquí estaba el error, este catch debe cerrar el try
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
