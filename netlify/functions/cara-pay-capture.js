// «¿Tienes cara de culo?»: cobra (captura) la orden y entrega el informe.
// REGLA DE ORO: si PayPal cobró, la persona recibe su informe SIEMPRE. Si algo nuestro falla después de cobrar
// (por ejemplo, guardar en Supabase), igual se entrega y te llega un correo para revisarlo.
// Se puede llamar varias veces con la misma orden sin cobrar dos veces (PayPal no captura dos veces).
const core = require('./_lib/cara-core');
const { captureOrder, getOrder } = require('./_lib/paypal');

const entrega = (job) => core.json(200, { ok: true, si: job.veredicto === 'si', certeza: job.certeza, informe: job.informe });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), orderID = String(b.orderID || '');
    if (!core.UUID_RE.test(jobId) || !/^[A-Z0-9]{8,40}$/i.test(orderID)) return core.json(400, { error: 'Solicitud inválida' });

    let job;
    try { job = await core.getJob(jobId); }
    catch (e) {   // Supabase caído: NO se cobra (todavía no se capturó nada); la persona puede reintentar
        console.error('[cara-pay-capture] leer', e.message);
        return core.json(503, { error: 'No pudimos confirmar tu pago todavía. No se te ha cobrado. Inténtalo de nuevo en un momento.', reintentar: true });
    }
    if (!job || !job.informe) return core.json(404, { error: 'Ese análisis ya no existe, así que no te cobramos. Sube la foto otra vez.' });
    if (job.paid) return entrega(job);

    try {
        // La orden tiene que ser de ESTE análisis: la última creada, o una que lleve su jobId adentro (si tocó pagar dos veces).
        if (job.paypal_order !== orderID) {
            const o = await getOrder(orderID);
            if (!(o.purchase_units && o.purchase_units[0] && o.purchase_units[0].custom_id === jobId)) return core.json(400, { error: 'Esa orden no corresponde a este informe. No se te cobró.' });
        }
        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return core.json(402, { error: `PayPal no completó el pago (estado: ${order.status}). No se te cobró.` });
        const cap = order.purchase_units && order.purchase_units[0] && order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
        const payer = (order.payer && order.payer.email_address) || '';
        const pagado = cap && cap.amount ? Number(cap.amount.value) : null;
        if (!cap || cap.amount.currency_code !== 'USD' || pagado < Number(core.PRICE_USD) - 0.01) {
            // Raro (alguien manipuló el monto). Si hubo cobro, igual se entrega y se avisa, para no quedarnos con plata sin dar nada.
            console.error('[cara-pay-capture] monto no coincide', orderID, cap && cap.amount);
            core.aviso('Cara: REVISAR pago con monto distinto', `Orden ${orderID}\nAnálisis ${jobId}\nMonto: ${JSON.stringify(cap && cap.amount)}\nPagador: ${payer || '?'}\nSe le entregó el informe igual.`);
        }
        try {
            await core.saveJob({ id: jobId, paid: true, paid_at: new Date().toISOString(), paid_amount_usd: pagado, payer_email: payer || null, paypal_order: orderID });
        } catch (e) {
            console.error('[cara-pay-capture] cobrado pero no guardado', orderID, e.message);
            core.aviso('Cara: REVISAR pago cobrado pero no guardado', `Orden ${orderID}\nAnálisis ${jobId}\nPagador: ${payer || '?'}\nError: ${e.message}\nSe le entregó el informe igual.`);
        }
        core.aviso(`Cara: pago de US$${pagado}${payer ? ' · ' + payer : ''}`, `Pago recibido en «¿Tienes cara de culo?».\nMonto: US$${pagado}\nRespuesta: ${job.veredicto === 'si' ? 'SÍ' : 'NO'}\nPaís (aprox.): ${job.country || 'desconocido'}\nOrigen: ${job.ref || 'directo'}\nOrden PayPal: ${orderID}`);
        return entrega(job);
    } catch (e) {
        // No sabemos si PayPal alcanzó a cobrar: la página reintenta sola con la misma orden (no cobra dos veces).
        console.error('[cara-pay-capture]', orderID, e.message);
        core.aviso('Cara: falló la confirmación de un pago', `Orden ${orderID}\nAnálisis ${jobId}\nError: ${e.message}\nLa página reintenta sola. Si en PayPal aparece cobrado y la persona no recibió su informe, revisa aquí.`);
        return core.json(502, { error: 'No pudimos confirmar tu pago con PayPal todavía.', reintentar: true });
    }
};
