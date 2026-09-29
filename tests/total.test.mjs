// Tests del cálculo inverso: total pactado → precio manual por noche.
// Extrae derivarPrecioDesdeTotal (y calcularPrecioReserva real, para verificar que
// el precio derivado usado como precioOverride reproduce el total).
// Ejecutar:  node tests/total.test.mjs

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

function grab(name) {
  const re = new RegExp('\\nfunction ' + name + '\\b[\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('no se encontró la función: ' + name);
  return m[0];
}

let CARGOS = [];
const DB = { get: (k, d) => (k === 'precios' ? { cargos_unicos: CARGOS } : d) };
const precioNocheCascada = () => { throw new Error('la cascada NO debe usarse con override'); };
const { derivarPrecioDesdeTotal, calcularPrecioReserva, cargosReservaTotal } = new Function('DB', 'precioNocheCascada',
  grab('nightsBetween') + grab('addDaysStr') + grab('cargosReservaTotal') + grab('calcularPrecioReserva') + grab('derivarPrecioDesdeTotal') +
  '\nreturn { derivarPrecioDesdeTotal, calcularPrecioReserva, cargosReservaTotal };')(DB, precioNocheCascada);

let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}

// Simula lo que guarda saveReserva en modo total pactado.
function guardar(totalEscrito, entrada, salida, cargoIds) {
  const noches = Math.round((new Date(salida) - new Date(entrada)) / 86400000);
  const der = derivarPrecioDesdeTotal(totalEscrito, noches, cargosReservaTotal(cargoIds));
  if (!der.ok) return { guardado: false, error: der.error };
  const calc = calcularPrecioReserva('1', entrada, salida, { cargos: cargoIds, precioOverride: der.precioNoche });
  return { guardado: true, precio: der.precioNoche, total: Number(totalEscrito), totalCalc: calc.total };
}

// ── Sin cargos ──
eq('sin cargos, exacto: 300000 / 3 noches', derivarPrecioDesdeTotal(300000, 3, 0), { ok: true, precioNoche: 100000 });
let g = guardar('300000', '2026-10-01', '2026-10-04', []);
eq('sin cargos: total guardado = escrito', g.total, 300000);
eq('sin cargos exacto: override reproduce el total', g.totalCalc, 300000);

// ── Con cargos ──
CARGOS = [{ id: 'limp', monto: 15000 }, { id: 'masc', monto: 5000 }];
eq('con cargos: (320000 − 20000) / 3', derivarPrecioDesdeTotal(320000, 3, 20000), { ok: true, precioNoche: 100000 });
g = guardar('320000', '2026-10-01', '2026-10-04', ['limp', 'masc']);
eq('con cargos: precio derivado', g.precio, 100000);
eq('con cargos: total guardado = escrito', g.total, 320000);
eq('con cargos: solo cargos tildados (limp)', derivarPrecioDesdeTotal(315000, 3, cargosReservaTotal(['limp'])), { ok: true, precioNoche: 100000 });

// ── División no exacta ──
g = guardar('100000', '2026-10-01', '2026-10-04', []);
eq('no exacta: precio redondeado a centavos', g.precio, 33333.33);
eq('no exacta: total guardado ES el escrito (100000), no 99999.99', g.total, 100000);
eq('control: precio × noches daría otro total', g.totalCalc, 99999.99);
g = guardar('241.53', '2026-10-01', '2026-10-03', []);
eq('USD no exacta: 241.53 / 2 → 120.77 (redondeo)', g.precio, 120.77);
eq('USD: total guardado 241.53 exacto', g.total, 241.53);
g = guardar('100000', '2026-10-01', '2026-10-08', ['limp']);
eq('no exacta con cargos: (100000−15000)/7', g.precio, 12142.86);
eq('no exacta con cargos: total = escrito', g.total, 100000);

// ── 0 noches ──
eq('0 noches → error, no guarda', derivarPrecioDesdeTotal(100000, 0, 0).ok, false);
eq('0 noches vía guardar', guardar('100000', '2026-10-01', '2026-10-01', []).guardado, false);
eq('noches negativas → error', derivarPrecioDesdeTotal(100000, -2, 0).ok, false);

// ── Total menor (o igual) a los cargos ──
eq('total < cargos → error', derivarPrecioDesdeTotal(10000, 3, 20000).ok, false);
eq('total = cargos → error (precio/noche 0 activaría la cascada)', derivarPrecioDesdeTotal(20000, 3, 20000).ok, false);
eq('total < cargos vía guardar', guardar('19999', '2026-10-01', '2026-10-04', ['limp', 'masc']).guardado, false);

// ── Basura ──
eq('total 0 → error', derivarPrecioDesdeTotal(0, 3, 0).ok, false);
eq('total negativo → error', derivarPrecioDesdeTotal(-500, 3, 0).ok, false);
eq('total no numérico → error', derivarPrecioDesdeTotal('abc', 3, 0).ok, false);
eq('total vacío → error', derivarPrecioDesdeTotal('', 3, 0).ok, false);
eq('error trae mensaje', typeof derivarPrecioDesdeTotal(10, 3, 20).error, 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
