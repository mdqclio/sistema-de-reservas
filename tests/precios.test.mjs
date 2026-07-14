// Tests del motor de precios (cascada unificada).
// Extrae las funciones puras de index.html y las corre en Node con mocks de
// DB / getReservas / today, sin DOM. Ejecutar:  node tests/precios.test.mjs
//
// Reglas cubiertas (ver docs/PRECIOS.md):
//  · fecha especial = override absoluto que PISA base + finde
//  · precio NOCHE POR NOCHE: subtotal = suma de las noches (cruza finde/temporada)
//  · promo MANUAL (opts.promo), nunca automática
//  · exclusividad promo > último momento > ocupación (a lo sumo uno)
//  · si hay promo elegida, los dinámicos no corren
//  · casos borde 12-20: cruce de temporada, borde de rango de finde/especial,
//    1 noche, temporada anual con wrap dic→ene (getTipoTemporada real), promo
//    parcial + finde, promo sobre override especial, toggle dinámicos off,
//    cargos por-reserva (1 vs 5 noches), 0 noches (entrada=salida)

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

// ── Entorno mock ────────────────────────────────────────────────────────────
let PRECIOS = {}, RESERVAS = [], TODAY = '2026-07-10';
const DB = { get: (k, d) => (k === 'precios' ? PRECIOS : d) };
const getReservas = () => RESERVAS;
const nightsBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const today = () => TODAY;
// Precio de temporada mockeado: alta si la fecha cae en un rango `temp_alta`, si no base.
function precioDefaultCabana(hab, fecha) {
  const h = (PRECIOS.habitaciones || []).find(x => x.hab === hab) || {};
  const alta = (PRECIOS.temp_alta || []).some(r => fecha >= r.desde && fecha <= r.hasta);
  return alta ? (Number(h.precio_alta) || Number(h.precio_base) || 0) : (Number(h.precio_base) || 0);
}

// Constante real de estados de reserva (la usa tramoOcupacion); se extrae de index.html.
const estadoConst = src.match(/const ESTADO_RESERVA = Object\.freeze\([^;]*\);/)[0];

const factory = new Function(
  'DB', 'getReservas', 'nightsBetween', 'today', 'precioDefaultCabana',
  estadoConst + '\n' +
  [grab('addDaysStr'), grab('getTipoTemporada'), grab('promoVigente'), grab('promosVigentesRango'),
   grab('tramoUltimoMomento'), grab('tramoOcupacion'), grab('precioNocheCascada'),
   grab('cargosReservaTotal'), grab('calcularPrecioReserva')].join('\n') +
  '\nreturn { calcularPrecioReserva, precioNocheCascada, promosVigentesRango, getTipoTemporada };'
);
const { calcularPrecioReserva, precioNocheCascada, promosVigentesRango, getTipoTemporada } =
  factory(DB, getReservas, nightsBetween, today, precioDefaultCabana);

// ── Runner ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}
function reset() { PRECIOS = { habitaciones: [{ hab: '9', precio_base: 500000, precio_alta: 600000 }] }; RESERVAS = []; TODAY = '2026-01-01'; }

// 1) Estado por defecto: sin factores, subtotal = base × noches.
reset();
eq('1 vacío: 3 noches', calcularPrecioReserva('9', '2026-01-10', '2026-01-13').total, 500000 * 3);

// 2) FECHA ESPECIAL pisa base Y finde: aunque haya finde ese día, vale el override.
reset();
PRECIOS.fines_semana_largos = [{ id: 'f1', fecha_inicio: '2026-01-10', fecha_fin: '2026-01-10', recargo_pct: 20 }];
PRECIOS.fechas_especiales = [{ id: 'e1', fecha: '2026-01-10', precio: 900000 }];
eq('2 fecha especial ignora finde', precioNocheCascada('9', '2026-01-10'), 900000);

// 3) NOCHE POR NOCHE: estadía que cruza un finde cobra distinto cada noche.
//    10 y 11 = finde (+20% s/500k=600k); 12 = normal (500k). Subtotal = 600+600+500 = 1.700k.
reset();
PRECIOS.fines_semana_largos = [{ id: 'f1', fecha_inicio: '2026-01-10', fecha_fin: '2026-01-11', recargo_pct: 20 }];
const r3 = calcularPrecioReserva('9', '2026-01-10', '2026-01-13');
eq('3 precios por noche', r3.preciosNoche, [600000, 600000, 500000]);
eq('3 subtotal cruza finde', r3.subtotal, 1700000);

// 4) PROMO NO automática: existe promo vigente pero NO se elige → sin descuento.
reset();
PRECIOS.promociones = [{ id: 'p1', tipo: 'descuento_pct', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31', valor: 10 }];
eq('4a promo no elegida = sin dto', precioNocheCascada('9', '2026-01-10'), 500000);
eq('4b promo elegida = -10%', precioNocheCascada('9', '2026-01-10', { promoId: 'p1' }), 450000);

// 5) Promo solo descuenta las noches dentro de su rango (por-noche).
reset();
PRECIOS.promociones = [{ id: 'p1', tipo: 'descuento_pct', fecha_inicio: '2026-01-10', fecha_fin: '2026-01-10', valor: 10 }];
const r5 = calcularPrecioReserva('9', '2026-01-10', '2026-01-12', { promo: 'p1' });
eq('5 promo solo su noche', r5.preciosNoche, [450000, 500000]);

// 6) EXCLUSIVIDAD: promo elegida ⇒ dinámicos NO corren (aunque haya último momento activo).
reset();
TODAY = '2026-01-08'; // entrada a 2 días → dispararía último momento -10%
PRECIOS.dinamicos = { activo: true, last_minute: [{ id: 'l1', dias: 3, ajuste_pct: -10 }] };
PRECIOS.promociones = [{ id: 'p1', tipo: 'descuento_pct', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31', valor: 20 }];
eq('6 promo apaga dinámicos', precioNocheCascada('9', '2026-01-10', { entrada: '2026-01-10', promoId: 'p1' }), 400000); // solo -20%, no -10%

// 7) Prioridad último momento > ocupación (sin promo): aplica SOLO último momento, no ambos.
reset();
TODAY = '2026-01-08';
RESERVAS = Array.from({ length: 11 }, (_, i) => ({ id: 'r' + i, estado: 'confirmada', entrada: '2026-01-01', salida: '2026-01-31' })); // ~92% ocup / 12
PRECIOS.dinamicos = {
  activo: true,
  ocupacion: [{ id: 'o1', desde_pct: 80, ajuste_pct: 15 }],
  last_minute: [{ id: 'l1', dias: 3, ajuste_pct: -10 }],
};
eq('7 último momento gana a ocupación', precioNocheCascada('9', '2026-01-10', { entrada: '2026-01-10' }), 450000); // 500k×0.9, NO ×1.15

// 8) Ocupación aplica solo si NO hay último momento en ventana.
reset();
TODAY = '2025-12-01'; // entrada lejos → sin último momento
RESERVAS = Array.from({ length: 11 }, (_, i) => ({ id: 'r' + i, estado: 'confirmada', entrada: '2026-01-01', salida: '2026-01-31' }));
PRECIOS.dinamicos = {
  activo: true,
  ocupacion: [{ id: 'o1', desde_pct: 80, ajuste_pct: 15 }],
  last_minute: [{ id: 'l1', dias: 3, ajuste_pct: -10 }],
};
eq('8 ocupación cuando no hay last-minute', precioNocheCascada('9', '2026-01-10', { entrada: '2026-01-10' }), 575000); // 500k×1.15

// 9) Cargos únicos: fijos por reserva, fuera del × noches.
reset();
PRECIOS.cargos_unicos = [{ id: 'c1', monto: 15000 }, { id: 'c2', monto: 8000 }];
const r9 = calcularPrecioReserva('9', '2026-01-10', '2026-01-13', { cargos: ['c1', 'c2'] });
eq('9 cargos sumados al total', r9.total, 500000 * 3 + 23000);

// 10) Override manual: precio/noche fijo, saltea cascada; cargos igual suman.
reset();
PRECIOS.fines_semana_largos = [{ id: 'f1', fecha_inicio: '2026-01-10', fecha_fin: '2026-01-31', recargo_pct: 20 }];
const r10 = calcularPrecioReserva('9', '2026-01-10', '2026-01-12', { precioOverride: 400000 });
eq('10 override ignora finde', r10.preciosNoche, [400000, 400000]);

// 11) promosVigentesRango: solo promos que se solapan con la estadía.
reset();
PRECIOS.promociones = [
  { id: 'p1', tipo: 'descuento_pct', fecha_inicio: '2026-01-05', fecha_fin: '2026-01-11', valor: 10 }, // solapa
  { id: 'p2', tipo: 'descuento_pct', fecha_inicio: '2026-02-01', fecha_fin: '2026-02-10', valor: 15 }, // no
];
eq('11 dropdown solo promos del rango', promosVigentesRango('2026-01-10', '2026-01-13').map(p => p.id), ['p1']);

// 12) CRUZA dos temporadas: 3 noches, 2 en baja/base + 1 en alta → cada noche su base.
//     precio_base=500k (baja/base), precio_alta=600k. temp_alta cubre SOLO la 3ª noche (12/01).
reset();
PRECIOS.temp_alta = [{ desde: '2026-01-12', hasta: '2026-01-12' }];
const r12 = calcularPrecioReserva('9', '2026-01-10', '2026-01-13');
eq('12 cada noche con base de SU temporada', r12.preciosNoche, [500000, 500000, 600000]);
eq('12 subtotal cruza temporada', r12.subtotal, 1600000);

// 13) FECHA ESPECIAL cuyo día es el borde exacto de inicio del rango de finde (viernes 16/01).
//     El override absoluto PISA el recargo de finde ese día, aun siendo el primer día del rango.
reset();
PRECIOS.fines_semana_largos = [{ id: 'f1', fecha_inicio: '2026-01-16', fecha_fin: '2026-01-18', recargo_pct: 25 }]; // 16/01 = viernes, inicio de rango
eq('13a control: sin especial, finde aplica', precioNocheCascada('9', '2026-01-16'), 625000); // 500k×1.25
PRECIOS.fechas_especiales = [{ id: 'e1', fecha: '2026-01-16', precio: 800000 }];
eq('13 especial pisa finde en borde de inicio', precioNocheCascada('9', '2026-01-16'), 800000);

// 14) 1 SOLA noche (entrada viernes 16/01) → base + finde, sin off-by-one en el loop [entrada,salida).
//     salida = sábado 17/01 NO se cobra (checkout). Debe cobrar exactamente la noche del viernes.
reset();
PRECIOS.fines_semana_largos = [{ id: 'f1', fecha_inicio: '2026-01-16', fecha_fin: '2026-01-17', recargo_pct: 20 }];
const r14 = calcularPrecioReserva('9', '2026-01-16', '2026-01-17');
eq('14 una noche cuenta 1', r14.noches, 1);
eq('14 base + finde sin off-by-one', r14.preciosNoche, [600000]); // 500k×1.20, solo el viernes

// 15) Temporada ANUAL que envuelve el cambio de año (20-dic a 28-feb, anual:true).
//     El motor REAL (getTipoTemporada) compara MM-DD y soporta el wrap dic→ene:
//     30/12 y 02/01 caen ambos en la temporada; una fecha fuera (15/03) no.
//     ⇒ El motor SÍ soporta el wrap — casos en verde (ver reporte).
reset();
PRECIOS.temporadas = [{ id: 't1', fecha_inicio: '2025-12-20', fecha_fin: '2026-02-28', tipo: 'alta', anual: true }];
eq('15a wrap: 30/12 dentro de temporada anual', getTipoTemporada('2026-12-30'), 'alta');
eq('15b wrap: 02/01 dentro de temporada anual', getTipoTemporada('2027-01-02'), 'alta');
eq('15c fuera del rango anual', getTipoTemporada('2026-03-15'), 'media');

// 16) PROMO cubre SOLO parte de la estadía + finde en la parte NO cubierta.
//     Elegir promo APAGA dinámicos para TODA la reserva (dinámicos activos acá lo prueban).
//     10/01: promo −10% (base 500k, sin finde) → 450k
//     11/01: fuera de promo, sin finde, dinámicos apagados por promo elegida → 500k
//     12/01: fuera de promo, finde +20%, dinámicos apagados → 600k
reset();
TODAY = '2026-01-09'; // entrada a 1 día → dispararía último momento si corriera
PRECIOS.dinamicos = { activo: true, last_minute: [{ id: 'l1', dias: 3, ajuste_pct: -10 }] };
PRECIOS.promociones = [{ id: 'p1', tipo: 'descuento_pct', fecha_inicio: '2026-01-10', fecha_fin: '2026-01-10', valor: 10 }];
PRECIOS.fines_semana_largos = [{ id: 'f1', fecha_inicio: '2026-01-12', fecha_fin: '2026-01-12', recargo_pct: 20 }];
const r16 = calcularPrecioReserva('9', '2026-01-10', '2026-01-13', { promo: 'p1' });
eq('16 promo parcial: promo, base, finde (dinámicos off)', r16.preciosNoche, [450000, 500000, 600000]);

// 17) Estadía completa dentro de fecha especial + promo elegida.
//     Código: la promo (ajuste exclusivo) cae ENCIMA del override → descuenta sobre el especial.
//     PRECIOS.md §1 lo define: "encima solo puede caer el ajuste exclusivo (promo o dinámico)".
//     900k override × 0.90 promo = 810k cada noche.
reset();
PRECIOS.fechas_especiales = [{ id: 'e1', fecha: '2026-01-10', precio: 900000 }, { id: 'e2', fecha: '2026-01-11', precio: 900000 }];
PRECIOS.promociones = [{ id: 'p1', tipo: 'descuento_pct', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31', valor: 10 }];
const r17 = calcularPrecioReserva('9', '2026-01-10', '2026-01-12', { promo: 'p1' });
eq('17 promo descuenta sobre override especial', r17.preciosNoche, [810000, 810000]);

// 18) Último momento y ocupación AMBOS apagados por toggle (dinamicos.activo=false) → base puro.
//     Aunque la ventana de último momento y la ocupación alta se cumplan, no se aplica nada.
reset();
TODAY = '2026-01-08'; // entrada a 2 días → último momento se cumpliría
RESERVAS = Array.from({ length: 11 }, (_, i) => ({ id: 'r' + i, estado: 'confirmada', entrada: '2026-01-01', salida: '2026-01-31' })); // ocupación alta
PRECIOS.dinamicos = {
  activo: false, // TOGGLE OFF
  ocupacion: [{ id: 'o1', desde_pct: 80, ajuste_pct: 15 }],
  last_minute: [{ id: 'l1', dias: 3, ajuste_pct: -10 }],
};
eq('18 toggle off = base puro', precioNocheCascada('9', '2026-01-10', { entrada: '2026-01-10' }), 500000);

// 19) Cargos únicos: fijos POR RESERVA, no por noche. 1 noche vs 5 noches → mismo cargosTotal.
reset();
PRECIOS.cargos_unicos = [{ id: 'c1', monto: 15000 }];
const r19a = calcularPrecioReserva('9', '2026-01-10', '2026-01-11', { cargos: ['c1'] }); // 1 noche
const r19b = calcularPrecioReserva('9', '2026-01-10', '2026-01-15', { cargos: ['c1'] }); // 5 noches
eq('19a cargo fijo en 1 noche', r19a.cargosTotal, 15000);
eq('19b cargo fijo en 5 noches (mismo monto)', r19b.cargosTotal, 15000);
eq('19a total 1 noche', r19a.total, 500000 * 1 + 15000);
eq('19b total 5 noches', r19b.total, 500000 * 5 + 15000);

// 20) entrada = salida mismo día (0 noches) → total 0 controlado, sin NaN ni negativos.
reset();
const r20 = calcularPrecioReserva('9', '2026-01-10', '2026-01-10');
eq('20a cero noches', r20.noches, 0);
eq('20b subtotal 0', r20.subtotal, 0);
eq('20c total 0', r20.total, 0);
eq('20d total no NaN/negativo', Number.isFinite(r20.total) && r20.total >= 0, true);

// ── Resultado ─────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
