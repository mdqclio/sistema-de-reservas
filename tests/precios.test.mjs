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

const factory = new Function(
  'DB', 'getReservas', 'nightsBetween', 'today', 'precioDefaultCabana',
  [grab('addDaysStr'), grab('promoVigente'), grab('promosVigentesRango'),
   grab('tramoUltimoMomento'), grab('tramoOcupacion'), grab('precioNocheCascada'),
   grab('cargosReservaTotal'), grab('calcularPrecioReserva')].join('\n') +
  '\nreturn { calcularPrecioReserva, precioNocheCascada, promosVigentesRango };'
);
const { calcularPrecioReserva, precioNocheCascada, promosVigentesRango } =
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

// ── Resultado ─────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
