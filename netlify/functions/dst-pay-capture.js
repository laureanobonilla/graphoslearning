// Destila: cobra (captura) la orden y SOLO si PayPal confirma el monto marca el lote como pagado.
const store = require('./_lib/store');
const core = require('./_lib/dst-core');
const { captureOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), orderID = String(b.orderID || '');
    if (!core.UUID_RE.test(jobId) || !orderID) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(jobId);
        if (!job || job.paypal_order !== orderID) return core.json(400, { error: 'Esa orden no corresponde a este lote.' });
        if (job.paid) return core.json(200, { ok: true });
        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return core.json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        const pu = order.purchase_units && order.purchase_units[0], cap = pu && pu.payments && pu.payments.captures && pu.payments.captures[0];
        const due = Math.max(Number(job.price_usd) || 0, Number(job.paypal_amount_usd) || 0);   // si agregó audios después de crear la orden, vale el precio nuevo
        if (!cap || cap.amount.currency_code !== 'USD' || Number(cap.amount.value) < due - 0.01) { console.error('[dst-pay-capture] monto no coincide', orderID, cap && cap.amount); return core.json(402, { error: 'El monto pagado no corresponde al precio.' }); }
        const payer = (order.payer && order.payer.email_address) || '';
        await core.saveJob({ id: jobId, paid: true, paid_at: new Date().toISOString(), paid_amount_usd: Number(cap.amount.value), payer_email: payer || null });
        try { await store.logEvent(jobId, 'anon', job.anon_id || null, 'dst_paid', { usd: Number(cap.amount.value), count: job.count }, null, 'destila'); } catch (_e) { /* no crítico */ }
        if (process.env.RESEND_API_KEY) {   // aviso para ti (no bloquea la entrega)
            fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || 'bonillapretiz@gmail.com'], subject: `Destila: pago de US$${cap.amount.value} (${job.count} audios)${payer ? ' · ' + payer : ''}`, text: `Pago recibido en Destila.\nMonto: US$${cap.amount.value}\nAudios del lote: ${job.count}\nPagador: ${payer || '(PayPal no dio correo)'}\nLote: ${jobId}\nPaís (aprox.): ${job.country || 'desconocido'}` }) }).catch(() => {});
        }
        return core.json(200, { ok: true });
    } catch (e) { console.error('[dst-pay-capture]', e.message); return core.json(502, { error: 'No se pudo confirmar el pago con PayPal. Si el cargo sí se hizo, escríbenos y te lo resolvemos a mano.' }); }
};
