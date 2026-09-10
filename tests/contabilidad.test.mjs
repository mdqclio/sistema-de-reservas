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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
