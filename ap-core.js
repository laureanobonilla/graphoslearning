// «aprender»: texto generado que Graphikosmos recoge al llegar desde /aprender/.
const { sbCfg } = require('./hf-core');
const H = (key, extra) => ({ apikey: key, Authorization: `Bearer ${key}`, ...(extra || {}) });

async function putText(sid, title, text, style) {
    const { url, key } = sbCfg();
    const res = await fetch(`${url}/rest/v1/ap_texts?on_conflict=sid`, { method: 'POST', headers: H(key, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ sid, title, text, style, created_at: new Date().toISOString(), claimed_at: null }) });
    if (!res.ok) throw new Error(`ap_texts HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}
async function getText(sid) {
    const { url, key } = sbCfg();
    const res = await fetch(`${url}/rest/v1/ap_texts?sid=eq.${encodeURIComponent(sid)}&select=title,text,style,claimed_at`, { headers: H(key) });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
}
async function claim(sid) {
    const { url, key } = sbCfg();
    await fetch(`${url}/rest/v1/ap_texts?sid=eq.${encodeURIComponent(sid)}&claimed_at=is.null`, { method: 'PATCH', headers: H(key, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({ claimed_at: new Date().toISOString() }) }).catch(() => {});
}
async function getAnswers(sid) {
    const { url, key } = sbCfg();
    const res = await fetch(`${url}/rest/v1/hf_responses?sid=eq.${encodeURIComponent(sid)}&tool=eq.aprende&select=answers`, { headers: H(key) });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] ? rows[0].answers || {} : null;
}
module.exports = { putText, getText, claim, getAnswers };
