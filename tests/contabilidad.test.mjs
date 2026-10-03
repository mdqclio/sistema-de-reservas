// Tests de las barreras de contabilidad: R-05 (doble emisión de facturas) y
// contraasiento (reversa de movimientos). Ver docs/reportes/2026-09-10-r05-contraasiento.md
//
// Mismo patrón que tests/precios.test.mjs: se EXTRAEN las funciones reales del
// <script type="module"> de index.html y se corren en Node, sin DOM ni Firebase.
// La única dependencia mockeada es el espejo `facturasData` (el nodo
// /cabanas/facturas); `facturasEntries()` también se extrae del archivo real.
// Ejecutar:  node tests/contabilidad.test.mjs
//
// Reglas cubiertas:
//  · movimientosComprometidos(): 'error' NO compromete (se reintenta o se
//    descarta); pendiente / procesando / emitida SÍ; factura sin estado también.
//    movimientoIds ausente, null o no-array no rompe.
//  · movimientoAnulado(): true para un movimiento revertido y para una reversa.
//  · motivoBloqueoReversa(): distingue 'emitida' (CAE, va nota de crédito en
//    ARCA) de 'en_curso' (hay que resolver o cancelar la solicitud primero).
//  · puedeRevertirMovimiento(): false si ya está revertido, si es una reversa, o
//    si tiene factura emitida / pendiente / procesando. true en el caso normal.

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

// Extrae una función top-level por nombre (declaración `function nombre(...) { ... }`).
function grab(name) {
  const re = new RegExp('\\nfunction ' + name + '\\b[\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('no se encontró la función: ' + name);
  return m[0];
}

// Constante real de estados de factura (la usan movimientosComprometidos y
// motivoBloqueoReversa); se extrae de index.html, no se reescribe acá.
const estadosConst = src.match(/const FACTURA_ESTADOS = Object\.freeze\([^;]*\);/)[0];

// ── Entorno mock ────────────────────────────────────────────────────────────
// facturasData es el espejo de /cabanas/facturas. Se pasa UNA sola vez al
// factory y se muta en el lugar, para que facturasEntries() lo lea siempre vivo.
const facturasData = {};
function setFacturas(obj) {
  Object.keys(facturasData).forEach(k => delete facturasData[k]);
  Object.assign(facturasData, obj || {});
}

const factory = new Function(
  'facturasData',
  estadosConst + '\n' +
  [grab('facturasEntries'), grab('movimientosComprometidos'), grab('movimientoAnulado'),
   grab('motivoBloqueoReversa'), grab('puedeRevertirMovimiento')].join('\n') +
  '\nreturn { movimientosComprometidos, movimientoAnulado, motivoBloqueoReversa, puedeRevertirMovimiento };'
);
const { movimientosComprometidos, movimientoAnulado, motivoBloqueoReversa, puedeRevertirMovimiento } =
  factory(facturasData);

// Estados reales, leídos de la constante extraída (no strings sueltos en el test).
const EST = new Function(estadosConst + '\nreturn FACTURA_ESTADOS;')();

// ── Runner ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}
// Un Set no serializa con JSON.stringify: se compara como array ordenado.
const setArr = s => [...s].sort();

// Factura mínima con los campos que miran las funciones bajo test.
const fac = (estado, movimientoIds, extra = {}) => ({ estado, movimientoIds, creado: 1, ...extra });
// Movimiento mínimo: un ingreso normal, sin facturar ni revertir.
const mov = (extra = {}) => ({ id: 'm1', tipo: 'ingreso', monto: 1000, moneda: 'ARS', ...extra });

// ════════════════════════════════════════════════════════════════════════════
// 1) movimientosComprometidos(): qué estados toman un movimiento
// ════════════════════════════════════════════════════════════════════════════

// 1a) Sin facturas, no hay nada comprometido.
setFacturas({});
eq('1a sin facturas: Set vacío', setArr(movimientosComprometidos()), []);

// 1b) 'error' NO compromete: esa factura se reintenta o se descarta, y el
//     movimiento tiene que volver a estar disponible para facturar.
setFacturas({ f1: fac(EST.ERROR, ['m1']) });
eq('1b factura error NO compromete', setArr(movimientosComprometidos()), []);

// 1c/d/e) Los tres estados vivos SÍ comprometen.
setFacturas({ f1: fac(EST.PENDIENTE, ['m1']) });
eq('1c pendiente compromete', setArr(movimientosComprometidos()), ['m1']);
setFacturas({ f1: fac(EST.PROCESANDO, ['m1']) });
eq('1d procesando compromete', setArr(movimientosComprometidos()), ['m1']);
setFacturas({ f1: fac(EST.EMITIDA, ['m1']) });
eq('1e emitida compromete', setArr(movimientosComprometidos()), ['m1']);

// 1f) Factura sin `estado` (dato legacy): cuenta como comprometida. Lado
//     conservador — mismo default que usa la tabla de facturas.
setFacturas({ f1: fac(undefined, ['m1']) });
eq('1f sin estado compromete', setArr(movimientosComprometidos()), ['m1']);

// 1g) Varias facturas a la vez: se acumulan, y la 'error' no aporta.
setFacturas({
  f1: fac(EST.PENDIENTE, ['m1', 'm2']),
  f2: fac(EST.EMITIDA,   ['m3']),
  f3: fac(EST.ERROR,     ['m4']),
});
eq('1g acumula y excluye la error', setArr(movimientosComprometidos()), ['m1', 'm2', 'm3']);

// 1h) El mismo id en dos facturas aparece una sola vez (es un Set).
setFacturas({ f1: fac(EST.PENDIENTE, ['m1']), f2: fac(EST.EMITIDA, ['m1']) });
eq('1h id repetido no se duplica', setArr(movimientosComprometidos()), ['m1']);

// ── Datos rotos: no tienen que romper el listado de facturación ────────────

// 1i) movimientoIds ausente (modo manual: la factura no referencia movimientos).
setFacturas({ f1: fac(EST.PENDIENTE, undefined) });
eq('1i movimientoIds ausente no rompe', setArr(movimientosComprometidos()), []);

// 1j) movimientoIds null.
setFacturas({ f1: fac(EST.PENDIENTE, null) });
eq('1j movimientoIds null no rompe', setArr(movimientosComprometidos()), []);

// 1k) movimientoIds no-array (string / objeto / número).
setFacturas({ f1: fac(EST.PENDIENTE, 'm1'), f2: fac(EST.PENDIENTE, { 0: 'm2' }), f3: fac(EST.PENDIENTE, 7) });
eq('1k movimientoIds no-array no rompe', setArr(movimientosComprometidos()), []);

// 1l) Array con huecos: los falsy se descartan, los válidos entran.
setFacturas({ f1: fac(EST.PENDIENTE, ['m1', null, '', undefined, 'm2']) });
eq('1l array con huecos filtra falsy', setArr(movimientosComprometidos()), ['m1', 'm2']);

// 1m) Entradas basura en el nodo (null / string): facturasEntries las filtra.
setFacturas({ f1: null, f2: 'basura', f3: fac(EST.PENDIENTE, ['m1']) });
eq('1m entradas basura no rompen', setArr(movimientosComprometidos()), ['m1']);

// ════════════════════════════════════════════════════════════════════════════
// 2) movimientoAnulado(): revertido y reversa salen del circuito facturable
// ════════════════════════════════════════════════════════════════════════════

eq('2a movimiento normal NO está anulado', movimientoAnulado(mov()), false);
eq('2b revertido está anulado',            movimientoAnulado(mov({ revertido: true })), true);
eq('2c reversa está anulada',              movimientoAnulado(mov({ id: 'm2', reversaDe: 'm1' })), true);
// revertido:false explícito no anula (solo el true).
eq('2d revertido:false NO anula',          movimientoAnulado(mov({ revertido: false })), false);
// Defensivo: null / undefined devuelven false, no explotan.
eq('2e null no rompe',                     movimientoAnulado(null), false);
eq('2f undefined no rompe',                movimientoAnulado(undefined), false);

// ════════════════════════════════════════════════════════════════════════════
// 3) motivoBloqueoReversa(): distingue el CAE de la solicitud en curso
// ════════════════════════════════════════════════════════════════════════════

// 3a) Sin factura, no hay bloqueo.
setFacturas({});
eq('3a sin factura: sin bloqueo', motivoBloqueoReversa(mov()), null);

// 3b) facturado:true implica emitida ya conciliada.
eq('3b facturado:true → emitida', motivoBloqueoReversa(mov({ facturado: true })), 'emitida');

// 3c) Referencia directa desde una factura emitida, aunque el flag no esté
//     escrito todavía (la conciliación no corrió en este cliente).
setFacturas({ f1: fac(EST.EMITIDA, ['m1']) });
eq('3c emitida sin flag → emitida', motivoBloqueoReversa(mov()), 'emitida');

// 3d/e) Solicitud viva pero sin CAE: el mensaje tiene que ser el otro.
setFacturas({ f1: fac(EST.PENDIENTE, ['m1']) });
eq('3d pendiente → en_curso', motivoBloqueoReversa(mov()), 'en_curso');
setFacturas({ f1: fac(EST.PROCESANDO, ['m1']) });
eq('3e procesando → en_curso', motivoBloqueoReversa(mov()), 'en_curso');

// 3f) 'error' no bloquea: la solicitud falló, el movimiento queda libre.
setFacturas({ f1: fac(EST.ERROR, ['m1']) });
eq('3f error: sin bloqueo', motivoBloqueoReversa(mov()), null);

// 3g) Emitida gana sobre en curso: si el movimiento está en dos facturas y una
//     tiene CAE, el motivo es 'emitida' (el mensaje del CAE es el correcto).
setFacturas({ f1: fac(EST.PENDIENTE, ['m1']), f2: fac(EST.EMITIDA, ['m1']) });
eq('3g emitida gana sobre en_curso', motivoBloqueoReversa(mov()), 'emitida');

// 3h) Otro movimiento comprometido no bloquea a este.
setFacturas({ f1: fac(EST.PENDIENTE, ['m9']) });
eq('3h factura de otro movimiento no bloquea', motivoBloqueoReversa(mov()), null);

// 3i) Defensivo: sin movimiento o sin id, no hay motivo.
eq('3i null no rompe',   motivoBloqueoReversa(null), null);
eq('3j sin id no rompe', motivoBloqueoReversa({ tipo: 'ingreso' }), null);

// ════════════════════════════════════════════════════════════════════════════
// 4) puedeRevertirMovimiento(): la guarda que muestra u oculta el botón
// ════════════════════════════════════════════════════════════════════════════

// 4a) Caso normal: ingreso sin facturar, sin revertir, sin factura → se revierte.
setFacturas({});
eq('4a movimiento normal SÍ se revierte', puedeRevertirMovimiento(mov()), true);
// Un egreso normal también (la reversa invierte el signo en cualquier dirección).
eq('4b egreso normal SÍ se revierte', puedeRevertirMovimiento(mov({ tipo: 'egreso' })), true);

// 4c) Ya revertido: no se revierte dos veces.
eq('4c revertido NO se revierte', puedeRevertirMovimiento(mov({ revertido: true })), false);

// 4d) Es una reversa: no se revierte una reversa.
eq('4d reversa NO se revierte', puedeRevertirMovimiento(mov({ id: 'm2', reversaDe: 'm1' })), false);

// 4e) Con CAE: se anula con nota de crédito en ARCA, no acá.
eq('4e facturado con CAE NO se revierte', puedeRevertirMovimiento(mov({ facturado: true })), false);
setFacturas({ f1: fac(EST.EMITIDA, ['m1']) });
eq('4f factura emitida NO se revierte', puedeRevertirMovimiento(mov()), false);

// 4g/h) Solicitud viva: primero hay que resolverla o cancelarla. Este es el
//       agujero que cerró el commit de bloqueo por factura en curso.
setFacturas({ f1: fac(EST.PENDIENTE, ['m1']) });
eq('4g factura pendiente NO se revierte', puedeRevertirMovimiento(mov()), false);
setFacturas({ f1: fac(EST.PROCESANDO, ['m1']) });
eq('4h factura procesando NO se revierte', puedeRevertirMovimiento(mov()), false);

// 4i) 'error': la solicitud falló, el movimiento vuelve a ser reversible.
setFacturas({ f1: fac(EST.ERROR, ['m1']) });
eq('4i factura error SÍ se revierte', puedeRevertirMovimiento(mov()), true);

// 4j) Defensivo: sin movimiento o sin id, false (no se dibuja el botón).
setFacturas({});
eq('4j null NO se revierte',   puedeRevertirMovimiento(null), false);
eq('4k sin id NO se revierte', puedeRevertirMovimiento({ tipo: 'ingreso' }), false);

// ── Check-in sin cobro (feat/checkin-sin-cobro) ─────────────────────────────
// Premisa nueva: el check-in marca la llegada y NO escribe movimientos ni toca
// pagado/saldo. El cobro va por 💰 Cobrar (savePago). La comisión de plataforma pasa
// al check-out, una sola vez.
{
  const grabAsync = (name) => {
    const m = src.match(new RegExp('\\nasync function ' + name + '\\b[\\s\\S]*?\\n\\}', 'm'));
    if (!m) throw new Error('no se encontró la función: ' + name);
    return m[0];
  };
  const LOG = [];
  const DOMV = {};
  const domEl = (id) => (DOMV[id] ||= { value: '', innerHTML: '', style: {}, classList: { contains: () => false } });
  let RES = [];
  let PRECIOS = { plataformas: [{ plat: 'booking', comision: 15 }] };
  const env = {
    document: { getElementById: domEl, querySelector: () => null },
    getReservas: () => RES,
    getHuespedNombre: () => 'Ana',
    removeCheckinToken: async (t) => LOG.push('removeToken:' + t),
    writeReserva: async (r) => LOG.push('writeReserva:' + r.estado),
    writeBed: async (c, st) => LOG.push('writeBed:' + c + ':' + st),
    writeMovimiento: async (m) => LOG.push('writeMovimiento:' + m.cat + ':' + m.monto),
    auditLog: (a) => LOG.push('audit:' + a),
    closeModal: (id) => LOG.push('close:' + id),
    showNotif: () => {}, renderReservas: () => {}, renderCheckin: () => {}, renderMapa: () => {}, renderGrilla: () => {},
    DB: { get: (k, d) => (k === 'precios' ? PRECIOS : d) },
    calcularPrecioReserva: () => ({ total: 1000 }),
    nuevoMovimientoId: () => 'M1', today: () => '2026-10-03',
    ESTADO_RESERVA: { CONFIRMADA: 'confirmada', CHECKIN: 'checkin', CHECKOUT: 'checkout', CANCELADA: 'cancelada' },
  };
  const keys = Object.keys(env);
  const ci = new Function(...keys, [grabAsync('confirmCheckin'), grabAsync('marcarCheckin'), grabAsync('registrarComisionPlataforma'), grabAsync('doCheckout'), grab('refrescarVistasEstadia')].join('\n') +
    '\nreturn { confirmCheckin, marcarCheckin, registrarComisionPlataforma, doCheckout };')(...keys.map(k => env[k]));

  const r = { id: 'R1', huespedId: 'h', hab: '4', cabaña: 'c4', estado: 'confirmada', total: 1000, pagado: 300, saldo: 700, estadoPago: 'senia', plataforma: 'booking', checkinToken: 'tok' };
  RES = [r];
  Object.assign(domEl('ci-res-id'), { value: 'R1' }); Object.assign(domEl('ci-llave'), { value: '' });
  Object.assign(domEl('ci-hora'), { value: '15:30' }); Object.assign(domEl('ci-obs'), { value: 'llegó con perro' });
  await ci.confirmCheckin();
  eq('5a check-in: NO escribe movimientos (ni saldo ni comisión)', LOG.filter(x => x.startsWith('writeMovimiento')), []);
  eq('5b check-in: pagado / saldo / estadoPago intactos (sigue debiendo)', [r.pagado, r.saldo, r.estadoPago], [300, 700, 'senia']);
  eq('5c check-in: estado checkin, hora y obs guardadas', [r.estado, r.horaCheckin, r.obsCheckin], ['checkin', '15:30', 'llegó con perro']);
  eq('5d check-in: cabaña ocupada, reserva escrita, token consumido', [LOG.includes('writeBed:c4:occupied'), LOG.includes('writeReserva:checkin'), LOG.includes('removeToken:tok'), r.checkinToken], [true, true, true, undefined]);
  eq('5e check-in: no marca la comisión como registrada', r.comisionRegistrada, undefined);
  eq('5f check-in: sin campos de facturación del cobro', /ci-facturado|ci-comprobante|ciFacturado|ciComprobante/.test(html), false);

  LOG.length = 0;
  await ci.doCheckout('R1');
  eq('5g check-out: registra la comisión de plataforma (15% de 1000)', LOG.filter(x => x.startsWith('writeMovimiento')), ['writeMovimiento:Comisión plataforma:150']);
  eq('5h check-out: estado checkout y cabaña sucia', [r.estado, LOG.includes('writeBed:c4:dirty'), r.comisionRegistrada], ['checkout', true, true]);
  LOG.length = 0;
  await ci.registrarComisionPlataforma(r);
  eq('5i comisión: guard anti-duplicado', LOG.filter(x => x.startsWith('writeMovimiento')), []);
  const vieja = { id: 'R2', cabaña: 'c5', hab: '5', estado: 'checkin', total: 1000, plataforma: 'booking', comisionRegistrada: true };
  RES = [vieja]; LOG.length = 0;
  await ci.doCheckout('R2');
  eq('5j check-out de reserva que ya registró comisión en el check-in viejo: no duplica', LOG.filter(x => x.startsWith('writeMovimiento')), []);
  const directa = { id: 'R3', cabaña: 'c6', hab: '6', estado: 'checkin', total: 1000, plataforma: 'directo' };
  RES = [directa]; LOG.length = 0;
  await ci.doCheckout('R3');
  eq('5k check-out directo (sin comisión configurada): no escribe movimientos', LOG.filter(x => x.startsWith('writeMovimiento')), []);
  eq('5l savePago sigue registrando el cobro (flujo de cobro intacto)', /writeMovimiento|aplicarPagoReserva/.test(grab('savePago')), true);
}

// ── Cajas por ubicación (feat/cajas) ────────────────────────────────────────
{
  const cst = (n) => { const m = src.match(new RegExp('\\nconst ' + n + ' = [^\\n]*')); if (!m) throw new Error('const ' + n); return m[0]; };
  const seedConst = src.match(/\nconst CAJAS_SEED = \{[\s\S]*?\n\};/)[0];
  const helpers = ['cajaDeMovimiento', 'esTransferencia', 'signoEnCaja', 'cajasOrdenadas', 'nombreCaja', 'cajaPorDefecto', 'saldosPorCaja',
    'resumenCajaDia', 'resumenPorCategoria', 'validarTransferencia', 'armarTransferencia', 'movimientosDeCaja', 'puedeBorrarCaja', 'normalizarCajaCampo'];
  let CAJAS_LIVE = [];
  const K = new Function('colCajas',
    ['CAJA_PRINCIPAL', 'TIPOS_CAJA', 'MONEDAS_CAJA', 'CAJA_POR_METODO', 'TIPO_TRANSFERENCIA', 'redondeo2'].map(cst).join('') + seedConst +
    grab('getCajas') + helpers.map(grab).join('\n') + '\nreturn { CAJAS_SEED, getCajas, ' + helpers.join(', ') + ' };')({ list: () => CAJAS_LIVE });
  const CAJAS = Object.values(K.CAJAS_SEED);
  const J = JSON.stringify;

  // Seed
  eq('6a seed: Franco, Jesús, Banco, Mercado Pago (en orden)', K.cajasOrdenadas(CAJAS).map(c => c.nombre), ['Franco (efectivo)', 'Jesús (efectivo)', 'Banco', 'Mercado Pago']);
  eq('6b seed: tipos', K.cajasOrdenadas(CAJAS).map(c => c.tipo), ['efectivo', 'efectivo', 'banco', 'digital']);
  eq('6c seed con flag propio (_migrado/cajas_seed), no pisa cajas existentes', [/_migrado\/cajas_seed/.test(src), /if \(!actual\[id\]\) faltan\[id\] = c;/.test(src)], [true, true]);
  eq('6d sin nodo cargado: getCajas cae al seed', K.getCajas().length, 4);

  // Movimiento sin caja → principal
  eq('6e movimiento SIN campo caja se lee como de la principal (Franco)', K.cajaDeMovimiento({ tipo: 'ingreso', monto: 10 }), 'caja-franco');
  eq('6f movimiento con caja → esa caja', K.cajaDeMovimiento({ caja: 'caja-jesus' }), 'caja-jesus');

  // Saldos por caja y moneda
  const MOVS = [
    { id: 'v1', tipo: 'ingreso', moneda: 'ARS', monto: 100000, fecha: '2026-09-01' },                    // viejo sin caja → Franco
    { id: 'j1', tipo: 'ingreso', moneda: 'ARS', monto: 340000, fecha: '2026-10-01', caja: 'caja-jesus' },
    { id: 'j2', tipo: 'ingreso', moneda: 'USD', monto: 200, fecha: '2026-10-01', caja: 'caja-jesus' },
    { id: 'j3', tipo: 'egreso', moneda: 'ARS', monto: 15000, fecha: '2026-10-02', caja: 'caja-jesus' },  // insumos
    { id: 'b1', tipo: 'ingreso', moneda: 'ARS', monto: 50000, fecha: '2026-10-02', caja: 'caja-banco' },
    { id: 'd1', tipo: 'devolucion', moneda: 'ARS', monto: 5000, fecha: '2026-10-02', caja: 'caja-banco' },
  ];
  let sal = K.saldosPorCaja(MOVS, CAJAS);
  eq('6g saldo Jesús: $325.000 y US$ 200, separados', sal['caja-jesus'], { ARS: 325000, USD: 200 });
  eq('6h saldo Franco incluye el movimiento viejo sin caja', sal['caja-franco'], { ARS: 100000 });
  eq('6i saldo Banco: ingreso − devolución', sal['caja-banco'], { ARS: 45000 });
  eq('6j pesos y dólares nunca se suman (no hay clave total)', Object.keys(sal['caja-jesus']).sort(), ['ARS', 'USD']);
  eq('6k caja sin movimientos → vacío (saldo 0)', sal['caja-mp'], {});

  // Transferencias
  const t = { origen: 'caja-jesus', destino: 'caja-franco', moneda: 'ARS', monto: 300000, fecha: '2026-10-03', concepto: 'retiro' };
  eq('6l validar: transferencia OK', K.validarTransferencia(t, CAJAS), '');
  eq('6m validar: misma caja → error', K.validarTransferencia({ ...t, destino: 'caja-jesus' }, CAJAS) !== '', true);
  eq('6n validar: monedas distintas → error', /monedas distintas/.test(K.validarTransferencia({ ...t, monedaDestino: 'USD' }, CAJAS)), true);
  eq('6o validar: monto 0 / negativo → error', [K.validarTransferencia({ ...t, monto: 0 }, CAJAS) !== '', K.validarTransferencia({ ...t, monto: -5 }, CAJAS) !== ''], [true, true]);
  eq('6p validar: caja inactiva → error', K.validarTransferencia(t, CAJAS.map(c => c.id === 'caja-jesus' ? { ...c, activa: false } : c)) !== '', true);
  const [ts, te] = K.armarTransferencia(t, { transferenciaId: 'T1', salida: 'tS', entrada: 'tE' }, CAJAS);
  eq('6q armar: dos movimientos vinculados, mismo monto y moneda', [ts.transferenciaId, te.transferenciaId, ts.monto, te.monto, ts.moneda, te.moneda], ['T1', 'T1', 300000, 300000, 'ARS', 'ARS']);
  eq('6r armar: salida en origen, entrada en destino, tipo transferencia', [ts.caja, ts.direccion, te.caja, te.direccion, ts.tipo, te.tipo], ['caja-jesus', 'salida', 'caja-franco', 'entrada', 'transferencia', 'transferencia']);
  const CON = [...MOVS, ts, te];
  sal = K.saldosPorCaja(CON, CAJAS);
  eq('6s transferencia mueve saldo: Jesús $25.000 · Franco $400.000', [sal['caja-jesus'].ARS, sal['caja-franco'].ARS], [25000, 400000]);
  const totalARS = x => Object.values(x).reduce((a, c) => a + (c.ARS || 0), 0);
  eq('6t transferencia no cambia el total de plata (suma de todas las cajas)', totalARS(K.saldosPorCaja(CON, CAJAS)), totalARS(K.saldosPorCaja(MOVS, CAJAS)));

  // Transferencias fuera de ingresos / egresos
  const ingARS = ms => ms.filter(m => m.tipo === 'ingreso' && m.moneda === 'ARS').reduce((a, b) => a + Number(b.monto), 0);
  const egARS = ms => ms.filter(m => (m.tipo === 'egreso' || m.tipo === 'devolucion') && m.moneda === 'ARS').reduce((a, b) => a + Number(b.monto), 0);
  eq('6u totales de Contabilidad (filtro por tipo): transferencia NO suma ingresos ni egresos', [ingARS(CON), egARS(CON)], [ingARS(MOVS), egARS(MOVS)]);
  eq('6v resumen por categoría: sin transferencias', Object.keys(K.resumenPorCategoria(CON)).includes('Transferencia entre cajas'), false);
  const rj = K.resumenCajaDia(CON, 'caja-jesus', '2026-10-03'), rf = K.resumenCajaDia(CON, 'caja-franco', '2026-10-03');
  eq('6w cierre del día: transferencia fuera de ingresos/egresos, va aparte', [rj.ARS.ingresos, rj.ARS.egresos, rj.ARS.transfSalida, rj.ARS.neto, rf.ARS.ingresos, rf.ARS.transfEntrada, rf.ARS.neto], [0, 0, 300000, -300000, 0, 300000, 300000]);
  const r2 = K.resumenCajaDia(MOVS, 'caja-banco', '2026-10-02');
  eq('6x cierre del día: solo la caja pedida, egresos incluyen devoluciones', [r2.ARS.ingresos, r2.ARS.egresos, r2.ARS.neto], [50000, 5000, 45000]);
  eq('6y cierre del día: movimiento viejo sin caja cae en la principal', K.resumenCajaDia(MOVS, 'caja-franco', '2026-09-01').ARS.ingresos, 100000);
  eq('6z una transferencia no se revierte (se corrige con otra)', puedeRevertirMovimiento(ts), false);
  // Barrido estático: ningún total suma "todo lo que no es ingreso" como egreso.
  eq('6aa sin sumas por descarte de tipo (else / !== ingreso) fuera de signoEnCaja', /else porCat\[k\]\.eg|\.tipo ?!== ?'ingreso'/.test(src.replace(grab('resumenPorCategoria'), '')), false);
  eq('6ab facturación: solo tipo ingreso (transferencias afuera)', /m\.tipo === 'ingreso' && !m\.facturado/.test(src), true);

  // Saldo inicial
  const CI = CAJAS.map(c => c.id === 'caja-franco' ? { ...c, saldoInicial: { ARS: 80000, USD: 50, desde: '2026-10-01' } } : c);
  eq('6ac saldo inicial: parte de lo contado e ignora lo anterior a la fecha', K.saldosPorCaja(MOVS, CI)['caja-franco'], { ARS: 80000, USD: 50 });

  // Defaults por método, borrado, validación de campos
  eq('6ad caja por defecto según método', ['efectivo', 'transferencia', 'mercadopago', 'tarjeta', 'raro'].map(m => K.cajaPorDefecto(m, CAJAS)), ['caja-franco', 'caja-banco', 'caja-mp', 'caja-banco', 'caja-franco']);
  eq('6ae caja por defecto inactiva → principal', K.cajaPorDefecto('mercadopago', CAJAS.map(c => c.id === 'caja-mp' ? { ...c, activa: false } : c)), 'caja-franco');
  eq('6af borrar: con movimientos no; sin movimientos sí; principal nunca', [K.puedeBorrarCaja('caja-jesus', MOVS), K.puedeBorrarCaja('caja-mp', MOVS), K.puedeBorrarCaja('caja-franco', [])], [false, true, false]);
  eq('6ag campos: nombre vacío / tipo raro inválidos; orden entero', [K.normalizarCajaCampo('nombre', '  '), K.normalizarCajaCampo('tipo', 'cripto'), K.normalizarCajaCampo('orden', '3'), K.normalizarCajaCampo('orden', '2.5')], [undefined, undefined, 3, undefined]);

  // writeMovimiento: caja solo en movimientos NUEVOS; los existentes no se tocan
  {
    const SETS = [];
    const cacheW = { movimientos: { viejo: { id: 'viejo', tipo: 'ingreso', monto: 1, metodo: 'efectivo' } } };
    const wm = new Function('cache', 'ensureMovimientosObj', 'pendingMovimientos', 'set', 'ref', 'db', 'cajaPorDefecto',
      src.match(/\nasync function writeMovimiento\b[\s\S]*?\n\}/)[0] + '\nreturn writeMovimiento;')(
      cacheW, () => {}, new Set(), async (r, v) => SETS.push([r, v]), (d, path) => path, null, (m) => K.cajaPorDefecto(m, CAJAS));
    await wm({ id: 'nuevo', tipo: 'ingreso', monto: 5, metodo: 'transferencia' });
    await wm({ ...cacheW.movimientos.viejo, facturado: true, nroComprobante: '0001' }); // reescritura (conciliar factura)
    await wm({ id: 'nuevo2', tipo: 'ingreso', monto: 5, metodo: 'efectivo', caja: 'caja-jesus' });
    eq('6ah writeMovimiento: nuevo sin caja → default por método', SETS[0][1].caja, 'caja-banco');
    eq('6ai writeMovimiento: reescritura de uno existente sin caja NO le agrega caja', 'caja' in SETS[1][1], false);
    eq('6aj writeMovimiento: caja explícita se respeta', SETS[2][1].caja, 'caja-jesus');
  }
  eq('6ak reversa: misma caja que el original', /caja: cajaDeMovimiento\(orig\)/.test(src), true);
  eq('6al cierre por caja: guarda caja y no toca cierres viejos (solo write de uno nuevo)', [/caja: cajaVista,/.test(grab('cerrarCaja')), /colCierres\.(remove|write\(\{\s*\.\.\.)/.test(src)], [true, false]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
