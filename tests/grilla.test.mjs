// Tests de saldoReserva (saldo único para listado/grilla), grillaBarraPos
// (barras de medio día de la grilla) y selección de rango por 2 clicks
// (2º click = fecha de salida). Extrae las funciones reales de index.html.
// Ejecutar:  node tests/grilla.test.mjs

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

// calcularPrecioReserva mockeado: 100 por noche (solo para el fallback de totalReserva).
const calcularPrecioReserva = (hab, e, s) => ({ total: 100 * Math.round((new Date(s) - new Date(e)) / 86400000) });
const { saldoReserva, grillaBarraPos, grillaRangoDesdeClicks, grillaPrimeraNocheOcupada, nightsBetween } = new Function('calcularPrecioReserva',
  grab('nightsBetween') + grab('totalReserva') + grab('saldoReserva') + grab('grillaBarraPos') +
  grab('addDaysStr') + grab('grillaRangoDesdeClicks') + grab('grillaPrimeraNocheOcupada') +
  '\nreturn { saldoReserva, grillaBarraPos, grillaRangoDesdeClicks, grillaPrimeraNocheOcupada, nightsBetween };')(calcularPrecioReserva);

let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ── saldoReserva ─────────────────────────────────────────────────────────────
eq('usa r.saldo guardado', saldoReserva({ saldo: 5000, total: 9000, pagado: 1000 }), 5000);
eq('saldo 0 guardado → 0 (no cae al fallback)', saldoReserva({ saldo: 0, total: 9000, pagado: 1000 }), 0);
eq('extender sin cobrar: r.saldo sube, r.total no → manda r.saldo',
  saldoReserva({ total: 1000, pagado: 1000, saldo: 300 }), 300);
eq('extender cobrando: r.pagado sube, r.total no → no inventa saldo negativo/erróneo',
  saldoReserva({ total: 1000, pagado: 1300, saldo: 0 }), 0);
eq('float sucio USD (caso Airbnb) → centavos', saldoReserva({ saldo: 241.53000000004, moneda: 'USD' }), 241.53);
eq('saldo guardado como string', saldoReserva({ saldo: '150.5' }), 150.5);
eq('nunca negativo', saldoReserva({ saldo: -20 }), 0);
eq('fallback sin r.saldo: total − pagado', saldoReserva({ total: 1000, pagado: 400 }), 600);
eq('fallback sin r.saldo ni total: cascada − pagado',
  saldoReserva({ entrada: '2026-10-01', salida: '2026-10-04', pagado: 50 }), 250);
eq('fallback saldo "" → total − pagado', saldoReserva({ saldo: '', total: 800, pagado: 0 }), 800);
eq('null → 0', saldoReserva(null), 0);

// ── grillaBarraPos ───────────────────────────────────────────────────────────
const INI = '2026-10-10', N = 14;
let p = grillaBarraPos('2026-10-12', '2026-10-15', INI, N);
eq('adentro: left = (2+0.5)/14', near(p.left, 2.5 / 14 * 100), true);
eq('adentro: width = 3 noches', near(p.width, 3 / 14 * 100), true);
eq('adentro: sin cortes', [p.cortaIzq, p.cortaDer], [false, false]);

// Recambio: A sale el 19, B entra el 19 → A termina donde B empieza (mitad de la celda)
const A = grillaBarraPos('2026-10-15', '2026-10-19', INI, N);
const B = grillaBarraPos('2026-10-19', '2026-10-22', INI, N);
eq('recambio: fin de A = inicio de B (sin hueco ni solape)', near(A.left + A.width, B.left), true);
eq('recambio: el corte cae en la mitad de la celda del 19', near(B.left, 9.5 / 14 * 100), true);

p = grillaBarraPos('2026-10-05', '2026-10-12', INI, N);
eq('empieza antes: recortada al borde izq', near(p.left, 0), true);
eq('empieza antes: width hasta la mitad del 12', near(p.width, 2.5 / 14 * 100), true);
eq('empieza antes: marca cortaIzq', [p.cortaIzq, p.cortaDer], [true, false]);

p = grillaBarraPos('2026-10-20', '2026-10-30', INI, N);
eq('termina después: llega al borde derecho', near(p.left + p.width, 100), true);
eq('termina después: marca cortaDer', [p.cortaIzq, p.cortaDer], [false, true]);

p = grillaBarraPos('2026-10-01', '2026-10-30', INI, N);
eq('cubre todo el rango: 0..100 con ambos cortes', [near(p.left, 0), near(p.width, 100), p.cortaIzq, p.cortaDer], [true, true, true, true]);

p = grillaBarraPos('2026-10-05', '2026-10-10', INI, N);
eq('sale el 1er día visible: media celda', [near(p.left, 0), near(p.width, 0.5 / 14 * 100)], [true, true]);

p = grillaBarraPos('2026-10-23', '2026-10-25', INI, N);
eq('entra el último día visible: media celda final + cortaDer', [near(p.left, 13.5 / 14 * 100), near(p.left + p.width, 100), p.cortaDer], [true, true, true]);

eq('termina antes del rango → null', grillaBarraPos('2026-10-01', '2026-10-09', INI, N), null);
eq('empieza después del rango → null', grillaBarraPos('2026-10-24', '2026-10-26', INI, N), null);
eq('0 noches (entrada = salida) → null', grillaBarraPos('2026-10-12', '2026-10-12', INI, N), null);

// ── Selección de rango: 2º click = fecha de salida ───────────────────────────
let rg = grillaRangoDesdeClicks('2026-10-02', '2026-10-04');
eq('clicks 2 y 4 → entrada 2, salida 4', rg, { entrada: '2026-10-02', salida: '2026-10-04' });
eq('clicks 2 y 4 → 2 noches', nightsBetween(rg.entrada, rg.salida), 2);
eq('clicks en orden inverso (4 y 2) → mismo rango', grillaRangoDesdeClicks('2026-10-04', '2026-10-02'), { entrada: '2026-10-02', salida: '2026-10-04' });
eq('clicks consecutivos (2 y 3) → 1 noche', nightsBetween('2026-10-02', grillaRangoDesdeClicks('2026-10-02', '2026-10-03').salida), 1);
rg = grillaRangoDesdeClicks('2026-10-02', '2026-10-02');
eq('misma celda → 1 noche (salida = día + 1), nunca 0', [rg.salida, nightsBetween(rg.entrada, rg.salida)], ['2026-10-03', 1]);
eq('cruce de mes (30/10 y 2/11) → 3 noches', nightsBetween('2026-10-30', grillaRangoDesdeClicks('2026-10-30', '2026-11-02').salida), 3);

// Validación de ocupación sobre [entrada, salida)
const ocup = set => f => set.includes(f);
eq('todas libres → null', grillaPrimeraNocheOcupada('2026-10-02', '2026-10-04', ocup([])), null);
eq('noche del medio ocupada → la detecta', grillaPrimeraNocheOcupada('2026-10-02', '2026-10-05', ocup(['2026-10-03'])), '2026-10-03');
eq('entrada ocupada → la detecta', grillaPrimeraNocheOcupada('2026-10-02', '2026-10-04', ocup(['2026-10-02'])), '2026-10-02');
eq('recambio: día de salida ocupado (entra otra) → OK', grillaPrimeraNocheOcupada('2026-10-02', '2026-10-04', ocup(['2026-10-04'])), null);
rg = grillaRangoDesdeClicks('2026-10-02', '2026-10-02');
eq('misma celda: valida solo esa noche', grillaPrimeraNocheOcupada(rg.entrada, rg.salida, ocup(['2026-10-03'])), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
