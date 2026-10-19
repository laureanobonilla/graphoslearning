// Ordena: cobra (captura) la orden y SOLO si PayPal confirma el monto extiende el acceso de la cuenta.
const core = require('./_lib/ordena-core');
const { captureOrder } = require('./_lib/paypal');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const user = core.requireUser(context);
    if (!user) return core.json(401, { error: 'Inicia sesión para activar tu plan.' });
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const orderID = String(b.orderID || '');
    if (!orderID) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const ord = await core.one('ordena_orders', 'order_id', orderID);
        if (!ord || ord.user_id !== user.id) return core.json(400, { error: 'Esa orden no corresponde a tu cuenta.' });
        if (ord.status === 'paid') return core.json(200, { ok: true, access: await core.getAccess(user) });
        const plan = core.PLANS[ord.plan];
        if (!plan) return core.json(400, { error: 'Plan no válido' });

        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return core.json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
        if (!cap || cap.amount.currency_code !== 'USD' || Number(cap.amount.value) < Number(plan.usd) - 0.01) {
            console.error('[ordena-pay-capture] monto no coincide', orderID, cap && cap.amount);
            return core.json(402, { error: 'El monto pagado no corresponde al plan.' });
        }
        const payer = (order.payer && order.payer.email_address) || null;
        const prev = await core.one('ordena_access', 'user_id', user.id);
        const paidUntil = core.extendFrom(prev && prev.paid_until, plan.months, plan.days);
        await core.upsert('ordena_orders', { order_id: orderID, user_id: user.id, status: 'paid', paid_at: new Date().toISOString(), paid_amount_usd: Number(cap.amount.value), payer_email: payer });
        await core.upsert('ordena_access', { user_id: user.id, email: user.email, plan: ord.plan, paid_until: paidUntil });

        if (process.env.RESEND_API_KEY) {   // aviso para el dueño (no bloquea)
            fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: 'Ordena <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || 'bonillapretiz@gmail.com'], subject: `Ordena: pago de US$${cap.amount.value} · ${plan.label}`, text: `Nuevo pago en Ordena.\nPlan: ${plan.label}\nMonto: US$${cap.amount.value}\nCuenta: ${user.email}\nPagador PayPal: ${payer || '(sin correo)'}\nAcceso hasta: ${paidUntil}` }) }).catch(() => {});
        }
        return core.json(200, { ok: true, access: await core.getAccess(user) });
    } catch (e) {
        console.error('[ordena-pay-capture]', e.message);
        return core.json(502, { error: 'No se pudo confirmar el pago con PayPal. Si el cargo sí se hizo, escríbenos y lo resolvemos a mano.' });
    }
};
