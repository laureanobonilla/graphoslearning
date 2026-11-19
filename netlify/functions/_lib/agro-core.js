// «Agro»: calculadoras para agricultores (mezcla de fumigación y costos/precio mínimo) con código de acceso y créditos.
// Los cálculos se hacen AQUÍ, en el servidor, para que el límite de créditos no se pueda saltar desde el navegador.
const crypto = require('crypto');
const { json, sb, ipOf, hashIp, today, contar } = require('./rot-core');

// >>> EDITA AQUÍ los precios, los créditos de la prueba y lo que incluye cada paquete (₡ = colones). <<<
const TRIAL = { creditos: 8, horas: 24 };
const PACKS = [
    { id: 'siempre', nombre: 'Para siempre', permanente: true, crc: 15000, detalle: 'Pague una vez y úselo siempre, sin límite de cálculos.' },
    { id: 'basico', nombre: 'Por uso: 30 créditos', creditos: 30, crc: 3000, dias: 180, detalle: 'Para ir probando con poco. Sale a ₡100 por cálculo.' },
    { id: 'finca', nombre: 'Por uso: 100 créditos', creditos: 100, crc: 7500, dias: 180, detalle: 'Sale a ₡75 por cálculo.' }
];
const SINPE = () => ({ numero: process.env.AGRO_SINPE_NUMBER || process.env.QER_SINPE_NUMBER || '8777-2993', nombre: process.env.AGRO_SINPE_NAME || process.env.QER_SINPE_NAME || 'Laureano Bonilla' });
const WHATSAPP = () => String(process.env.AGRO_WHATSAPP || '').replace(/\D/g, '');   // opcional: 506XXXXXXXX. Si está vacío, el botón no aparece
const HERRAMIENTAS = ['mezcla', 'costos'];

class Err extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const num = (v, nombre, min, max, opt = false) => {
    if (v === undefined || v === null || v === '') { if (opt) return null; throw new Err(`Falta: ${nombre}.`); }
    const n = Number(String(v).replace(',', '.'));
    if (!isFinite(n)) throw new Err(`${nombre}: escriba un número.`);
    if (n < min || n > max) throw new Err(`${nombre}: debe estar entre ${min} y ${max}.`);
    return n;
};
const txt = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const r2 = (x) => Math.round(x * 100) / 100;
const crc = (n) => '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- códigos ----------
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sin I, L, O, 0, 1 (se confunden)
function newCode() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length]; return `AG-${s.slice(0, 4)}-${s.slice(4)}`; }
// Acepta «ag 7k3q 9m2x», «7K3Q9M2X», con guiones o sin ellos.
function normCode(s) {
    const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const core = t.length === 10 && t.startsWith('AG') ? t.slice(2) : t.length === 8 ? t : '';
    return core ? `AG-${core.slice(0, 4)}-${core.slice(4)}` : '';
}
const MOTIVOS = {
    no_existe: 'Ese código no existe o ya no está activo. Revise que lo escribió igual que se lo enviaron.',
    vencido: 'Su código ya venció. Si le sirvió, compre el programa para siempre o recargue y le reactivo todo.',
    sin_creditos: 'Se le acabaron los créditos. Si le sirvió, compre el programa para siempre o recargue; lo que le sobre no se pierde.',
    demasiado_uso: 'Hoy se hicieron demasiados cálculos con este código (más de 150 en 24 horas). Intente mañana o escríbame.'
};
async function estadoDe(codigo) {
    const rows = await sb(`/rest/v1/agro_codigos?codigo=eq.${encodeURIComponent(codigo)}&select=tipo,creditos,usados,vence,activo,ilimitado`);
    const r = rows && rows[0]; if (!r || !r.activo) return null;
    if (r.ilimitado) return { tipo: 'pago', ilimitado: true, creditos: null, usados: r.usados, restantes: null, vence: null, vencido: false };
    const venceMs = r.vence ? new Date(r.vence).getTime() : null;
    return { tipo: r.tipo, ilimitado: false, creditos: r.creditos, usados: r.usados, restantes: Math.max(0, r.creditos - r.usados), vence: r.vence || null, vencido: venceMs != null && venceMs <= Date.now() };
}
// Protección contra adivinar códigos: tope de intentos fallidos por conexión y día.
async function falloDeCodigo(event) {
    try { const n = await contar(`ag:bad:${hashIp(ipOf(event))}:${today()}`, 25); return n < 0; } catch (e) { return false; }
}

// ---------- calculadora 1: mezcla de fumigación ----------
const AREA_HA = { ha: 1, m2: 0.0001, mz: 0.6987 };                    // manzana de Costa Rica ≈ 0,6987 ha
const PROD = { ml: { f: 1, fam: 'liq' }, l: { f: 1000, fam: 'liq' }, g: { f: 1, fam: 'sol' }, kg: { f: 1000, fam: 'sol' } };
const fmtProd = (base, fam) => fam === 'liq' ? (base >= 1000 ? { cantidad: r2(base / 1000), unidad: 'L' } : { cantidad: r2(base), unidad: 'mL' }) : (base >= 1000 ? { cantidad: r2(base / 1000), unidad: 'kg' } : { cantidad: r2(base), unidad: 'g' });
function calcMezcla(d) {
    const modo = ['por_100l', 'por_ha', 'por_bomba'].includes(d.modo) ? d.modo : null; if (!modo) throw new Err('Elija cómo viene la dosis en la etiqueta.');
    const pu = PROD[d.unidad_producto]; if (!pu) throw new Err('Elija la unidad del producto (mL, L, g o kg).');
    const dosis = num(d.dosis, 'Dosis', 0.0001, 1e6) * pu.f;
    const cap = num(d.bomba_l, 'Capacidad de la bomba (litros)', 1, 2000);
    const gasto = num(d.gasto_l_ha, 'Litros de mezcla que gasta por hectárea', 10, 5000);
    const au = AREA_HA[d.area_unidad]; if (!au) throw new Err('Elija la unidad del área (ha, m² o manzana).');
    const areaHa = num(d.area, 'Área', 0.0001, 1e6) * au; if (areaHa > 100000) throw new Err('Área demasiado grande.');
    const total = areaHa * gasto, bombas = total / cap, llenas = Math.floor(bombas + 1e-9);
    let resto = total - llenas * cap; if (resto < 0.05) resto = 0;
    const porL = modo === 'por_100l' ? dosis / 100 : modo === 'por_ha' ? dosis / gasto : dosis / cap;   // producto por litro de mezcla
    const porBomba = porL * cap, productoTotal = porL * total, productoResto = porL * resto;
    const avisos = [];
    if (gasto < 80) avisos.push('Gasta menos de 80 L por hectárea: es muy poco para cubrir bien las plantas. Revise ese dato.');
    if (gasto > 1500) avisos.push('Gasta más de 1.500 L por hectárea: revise si escribió litros por hectárea y no por manzana o por bomba.');
    if (porL > 50) avisos.push('La mezcla queda con más de 50 mL (o 50 g) de producto por cada litro. Es muy concentrada: compare con la etiqueta antes de aplicar.');
    // costo opcional
    let costo = null; const pe = num(d.precio_envase, 'Precio del envase', 0, 1e9, true), te = num(d.tamano_envase, 'Tamaño del envase', 0.0001, 1e7, true);
    if (pe != null && te != null) { const pe_u = PROD[d.unidad_envase]; if (!pe_u || pe_u.fam !== pu.fam) throw new Err('El tamaño del envase debe estar en la misma clase de unidad que la dosis (líquido o sólido).'); const porBase = pe / (te * pe_u.f); costo = { total: Math.round(productoTotal * porBase), por_bomba: Math.round(porBomba * porBase), por_ha: Math.round((productoTotal / areaHa) * porBase), envases: r2(productoTotal / (te * pe_u.f)) }; }
    return {
        herramienta: 'mezcla', producto: txt(d.producto, 60), area_ha: r2(areaHa), mezcla_total_l: r2(total), bomba_l: cap,
        bombas: { exactas: r2(bombas), llenas, resto_l: r2(resto) },
        por_bomba: fmtProd(porBomba, pu.fam), total: fmtProd(productoTotal, pu.fam), ultima_bomba: resto > 0 ? { litros: r2(resto), ...fmtProd(productoResto, pu.fam) } : null,
        por_litro: fmtProd(porL, pu.fam), costo, avisos
    };
}

// ---------- calculadora 2: costos y precio mínimo ----------
const CATS = { insumos: 'Insumos (semilla, abono, agroquímicos)', mano_obra: 'Mano de obra', alquiler: 'Alquiler o tierra', transporte: 'Transporte y empaque', maquinaria: 'Maquinaria y combustible', otros: 'Otros' };
function calcCostos(d) {
    const items = Array.isArray(d.costos) ? d.costos : []; if (!items.length) throw new Err('Agregue al menos un costo.');
    if (items.length > 40) throw new Err('Máximo 40 costos.');
    const lista = items.map((x) => ({ concepto: txt(x && x.concepto, 60) || 'Sin nombre', cat: CATS[x && x.cat] ? x.cat : 'otros', monto: num(x && x.monto, `Monto de «${txt(x && x.concepto, 30) || 'costo'}»`, 0, 1e10) }));
    const costoTotal = lista.reduce((a, x) => a + x.monto, 0); if (costoTotal <= 0) throw new Err('Los costos suman cero: escriba al menos un monto.');
    const rend = num(d.rendimiento, 'Cosecha esperada', 0.0001, 1e9), merma = num(d.merma_pct, 'Pérdida o merma (%)', 0, 90, true) || 0, vendible = rend * (1 - merma / 100);
    const unidad = txt(d.unidad_venta, 20) || 'unidad', margen = num(d.margen_pct, 'Ganancia deseada (%)', 0, 1000, true); const mg = margen == null ? 25 : margen;
    const au = AREA_HA[d.area_unidad || 'ha'], area = num(d.area, 'Área', 0.0001, 1e6, true), areaHa = area != null && au ? area * au : null;
    const porCat = Object.keys(CATS).map((k) => { const t = lista.filter((x) => x.cat === k).reduce((a, x) => a + x.monto, 0); return { cat: k, nombre: CATS[k], total: Math.round(t), pct: r2((t / costoTotal) * 100) }; }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
    const costoUnidad = costoTotal / vendible, out = {
        herramienta: 'costos', cultivo: txt(d.cultivo, 60), unidad, costo_total: Math.round(costoTotal), por_categoria: porCat, vendible: r2(vendible), merma_pct: merma,
        costo_unidad: r2(costoUnidad), precio_minimo: Math.ceil(costoUnidad), margen_pct: mg, precio_sugerido: Math.ceil(costoUnidad * (1 + mg / 100)),
        costo_ha: areaHa ? Math.round(costoTotal / areaHa) : null, rendimiento_ha: areaHa ? r2(rend / areaHa) : null, avisos: []
    };
    const precio = num(d.precio_actual, 'Precio al que vende hoy', 0, 1e9, true);
    if (precio) {
        const ingreso = precio * vendible, util = ingreso - costoTotal;
        out.venta = { precio, ingreso: Math.round(ingreso), utilidad: Math.round(util), utilidad_unidad: r2(precio - costoUnidad), utilidad_pct: r2((util / costoTotal) * 100), equilibrio_unidades: r2(costoTotal / precio), caida_max_pct: r2(((precio - costoUnidad) / precio) * 100),
            escenarios: [-20, -10, 0, 10, 20].map((p) => ({ cambio_pct: p, precio: Math.round(precio * (1 + p / 100)), utilidad: Math.round(precio * (1 + p / 100) * vendible - costoTotal) })) };
        if (util < 0) out.avisos.push(`Con ese precio pierde ${crc(Math.abs(util))} por ciclo. Para no perder necesita vender a ${crc(out.precio_minimo)} o más por ${unidad}.`);
    }
    if (porCat[0] && porCat[0].pct >= 50) out.avisos.push(`Más de la mitad del costo (${porCat[0].pct}%) es «${porCat[0].nombre}». Ahí está lo que más puede ahorrar.`);
    if (merma === 0) out.avisos.push('Puso 0% de pérdida. Casi siempre algo se daña o no se vende; con 5% a 10% el resultado es más realista.');
    return out;
}
const CALC = { mezcla: calcMezcla, costos: calcCostos };
module.exports = { json, sb, ipOf, hashIp, today, contar, Err, TRIAL, PACKS, SINPE, WHATSAPP, HERRAMIENTAS, newCode, normCode, MOTIVOS, estadoDe, falloDeCodigo, CALC, calcMezcla, calcCostos, CATS, txt };
