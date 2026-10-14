// tu-audio: cobra (captura) la orden y SOLO si PayPal confirma el monto marca el trabajo como pagado.
const store = require('./_lib/store');
const core = require('./_lib/aud-core');
const { captureOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), orderID = String(b.orderID || '');
    if (!core.UUID_RE.test(jobId) || !orderID) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(jobId);
        if (!job || job.paypal_order !== orderID) return core.json(400, { error: 'Esa orden no corresponde a este trabajo.' });
        if (job.paid) return core.json(200, { ok: true });
        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return core.json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        const cap = order.purchase_units && order.purchase_units[0] && order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
        if (!cap || cap.amount.currency_code !== 'USD' || Number(cap.amount.value) < Number(job.price_usd) - 0.01) { console.error('[aud-pay-capture] monto no coincide', orderID, cap && cap.amount); return core.json(402, { error: 'El monto pagado no corresponde al precio.' }); }
        const payer = (order.payer && order.payer.email_address) || '';
        await core.saveJob({ id: jobId, paid: true, paid_at: new Date().toISOString(), paid_amount_usd: Number(cap.amount.value), payer_email: payer || null });
        try { await store.logEvent(jobId, 'anon', job.anon_id || null, 'aud_paid', { usd: Number(cap.amount.value) }, null, 'tu-audio'); } catch (_e) { /* no crítico */ }
        if (process.env.RESEND_API_KEY) {   // aviso para ti (no bloquea la entrega)
            fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || 'bonillapretiz@gmail.com'], subject: `tu-audio (${job.tool}): pago de US$${cap.amount.value}${payer ? ' · ' + payer : ''}`, text: `Pago recibido en tu-audio (herramienta: ${job.tool}).\nMonto: US$${cap.amount.value}\nPagador: ${payer || '(PayPal no dio correo)'}\nTrabajo: ${jobId}\nPaís (aprox.): ${job.country || 'desconocido'}` }) }).catch(() => {});
        }
        return core.json(200, { ok: true });
    } catch (e) { console.error('[aud-pay-capture]', e.message); return core.json(502, { error: 'No se pudo confirmar el pago con PayPal. Si el cargo sí se hizo, escríbenos y te lo resolvemos a mano.' }); }
};
