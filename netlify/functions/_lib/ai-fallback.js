// Respaldo con Claude (API de Anthropic) para las llamadas de gemini.js: si Gemini falla o se cuelga, el mismo pedido se hace a Claude
// y se devuelve con la forma de una respuesta de Gemini ({ text }) para que el resto del código no cambie.
// Solo cubre pedidos de texto/imagen/PDF. Audio o herramientas de Gemini (búsqueda en la web, etc.) no se pueden pasar: ahí se omite (err.skip).
const { _toJsonSchema: toJsonSchema } = require('./qer-gemini');

const model = () => process.env.GK_CLAUDE_MODEL || process.env.QER_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const skip = (m) => Object.assign(new Error(m), { skip: true });
const IMG = /^image\/(png|jpeg|gif|webp)$/;

function toBlocks(parts) {
    const out = [];
    for (const p of parts || []) {
        if (p == null) continue;
        if (typeof p.text === 'string') { if (p.text) out.push({ type: 'text', text: p.text }); continue; }
        const d = p.inlineData;
        if (d && d.data) {
            if (IMG.test(d.mimeType || '')) out.push({ type: 'image', source: { type: 'base64', media_type: d.mimeType, data: d.data } });
            else if (d.mimeType === 'application/pdf') out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.data } });
            else throw skip('Tipo de archivo no compatible con Claude: ' + d.mimeType);
            continue;
        }
        throw skip('Parte del pedido no compatible con Claude');
    }
    return out;
}

function toMessages(contents) {
    if (typeof contents === 'string') return [{ role: 'user', content: contents }];
    const items = Array.isArray(contents) ? contents : (contents && contents.parts ? [contents] : null);
    if (!items) throw skip('Pedido sin formato conocido');
    const msgs = [];
    for (const it of items) {
        const role = it && it.role === 'model' ? 'assistant' : 'user';
        const blocks = typeof it === 'string' ? [{ type: 'text', text: it }] : toBlocks(it && it.parts);
        if (!blocks.length) continue;
        const last = msgs[msgs.length - 1];
        if (last && last.role === role) last.content.push(...blocks); else msgs.push({ role, content: blocks });
    }
    if (!msgs.length || msgs[0].role !== 'user') throw skip('Pedido sin mensaje de usuario');
    return msgs;
}

function systemOf(si) {
    if (!si) return '';
    if (typeof si === 'string') return si;
    return (si.parts || []).map((p) => p && p.text || '').join('\n');
}

// payload: lo mismo que se le manda a ai.models.generateContent ({ contents, config }). Devuelve { text, candidates, _provider, _model }.
async function callClaudeForPayload(payload, timeoutMs) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw skip('Sin ANTHROPIC_API_KEY');
    const cfg = (payload && payload.config) || {};
    if (cfg.tools && cfg.tools.length) throw skip('El pedido usa herramientas de Gemini');
    const messages = toMessages(payload.contents);
    const wantsJson = cfg.responseMimeType === 'application/json';
    let system = systemOf(cfg.systemInstruction);
    const body = { model: model(), max_tokens: Math.max(1024, Math.min(Number(cfg.maxOutputTokens) || 8192, 16000)), messages };
    if (cfg.responseSchema) {
        body.tools = [{ name: 'responder', description: 'Entrega la respuesta final con el formato pedido.', input_schema: toJsonSchema(cfg.responseSchema) }];
        body.tool_choice = { type: 'tool', name: 'responder' };
    } else if (wantsJson) {
        system = (system ? system + '\n\n' : '') + 'Responde SOLO con un JSON válido, sin texto antes ni después ni bloques de código.';
    }
    if (system) body.system = system;
    const ac = new AbortController();
    const timer = timeoutMs ? setTimeout(() => ac.abort(), timeoutMs) : null;
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', signal: ac.signal,
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw Object.assign(new Error(`Claude ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`), { soft: true });
        const data = await res.json();
        if (data.stop_reason === 'max_tokens') throw Object.assign(new Error('Claude cortó la respuesta (max_tokens)'), { soft: true });
        let text;
        if (cfg.responseSchema) {
            const b = (data.content || []).find((x) => x.type === 'tool_use');
            if (!b || !b.input) throw Object.assign(new Error(`Claude sin resultado (stop_reason: ${data.stop_reason || '?'})`), { soft: true });
            text = JSON.stringify(b.input);
        } else {
            text = (data.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
            if (wantsJson) text = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
            if (!text) throw Object.assign(new Error('Claude respondió vacío'), { soft: true });
        }
        return { text, candidates: [{ finishReason: data.stop_reason }], _provider: 'anthropic', _model: body.model };
    } catch (err) {
        if (err && err.name === 'AbortError') throw Object.assign(new Error(`tiempo agotado (${Math.round((timeoutMs || 0) / 1000)} s) esperando a Claude`), { isTimeout: true });
        throw err;
    } finally { if (timer) clearTimeout(timer); }
}

module.exports = { callClaudeForPayload };
