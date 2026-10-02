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
const { saldoReserva, grillaBarraPos, grillaRangoDesdeClicks, grillaPrimeraNocheOcupada, nightsBetween, addDaysStr } = new Function('calcularPrecioReserva',
  grab('nightsBetween') + grab('totalReserva') + grab('saldoReserva') + grab('grillaBarraPos') +
  grab('addDaysStr') + grab('grillaRangoDesdeClicks') + grab('grillaPrimeraNocheOcupada') +
  '\nreturn { saldoReserva, grillaBarraPos, grillaRangoDesdeClicks, grillaPrimeraNocheOcupada, nightsBetween, addDaysStr };')(calcularPrecioReserva);

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

// ── grillaBarraPos con 7 y 30 días visibles ─────────────────────────────────
// Las barras se posicionan en % sobre los días visibles y las columnas son
// repeat(dias, 1fr): la celda i ocupa [i/dias, (i+1)/dias]. La barra debe arrancar y
// terminar en la MITAD de su celda para cualquier cantidad de días.
for (const D of [7, 14, 30]) {
  const centro = i => (i + 0.5) / D * 100;
  let q = grillaBarraPos('2026-10-11', '2026-10-13', INI, D);
  eq(`${D} días: arranca en la mitad de la celda 1`, near(q.left, centro(1)), true);
  eq(`${D} días: termina en la mitad de la celda 3`, near(q.left + q.width, centro(3)), true);
  const ult = addDaysStr(INI, D - 1);
  q = grillaBarraPos(addDaysStr(INI, D - 2), ult, INI, D);
  eq(`${D} días: sale el último día visible → termina en su mitad`, [near(q.left + q.width, centro(D - 1)), q.cortaDer], [true, false]);
  q = grillaBarraPos(addDaysStr(INI, D - 2), addDaysStr(INI, D), INI, D);
  eq(`${D} días: sale el día siguiente al rango → corta en 100% con cortaDer`, [near(q.left + q.width, 100), q.cortaDer], [true, true]);
  eq(`${D} días: entra el día siguiente al rango → null`, grillaBarraPos(addDaysStr(INI, D), addDaysStr(INI, D + 2), INI, D), null);
  q = grillaBarraPos('2026-09-01', '2026-12-31', INI, D);
  eq(`${D} días: cubre todo → 0..100`, [near(q.left, 0), near(q.width, 100)], [true, true]);
  const RA = grillaBarraPos(INI, addDaysStr(INI, 3), INI, D), RB = grillaBarraPos(addDaysStr(INI, 3), addDaysStr(INI, 5), INI, D);
  eq(`${D} días: recambio sin hueco ni solape`, near(RA.left + RA.width, RB.left), true);
}
// 30 días cruzando mes: del 1/1 al 30/1, entrada 31/12 (corta izq), salida 15/1 (celda 14)
{
  const q = grillaBarraPos('2026-12-31', '2027-01-15', '2027-01-01', 30);
  eq('30 días cruce de año: corta izq y termina en la mitad del 15/1', [near(q.left, 0), near(q.width, 14.5 / 30 * 100), q.cortaIzq], [true, true, true]);
}

// ── Navegación: saltar a mes, ±1 mes, días visibles ─────────────────────────
{
  const { grillaSumarMeses, grillaMesesProximos } = new Function(
    src.match(/\nconst GRILLA_MESES_CORTOS = [^\n]*/)[0] + grab('grillaSumarMeses') + grab('grillaMesesProximos') +
    '\nreturn { grillaSumarMeses, grillaMesesProximos };')();
  eq('+1 mes conserva el día', grillaSumarMeses('2026-10-15', 1), '2026-11-15');
  eq('-1 mes', grillaSumarMeses('2026-10-15', -1), '2026-09-15');
  eq('+1 mes cruza año', grillaSumarMeses('2026-12-10', 1), '2027-01-10');
  eq('-1 mes cruza año', grillaSumarMeses('2027-01-10', -1), '2026-12-10');
  eq('31/01 + 1 mes → 28/02 (mes corto)', grillaSumarMeses('2027-01-31', 1), '2027-02-28');
  eq('31/01 + 1 mes en bisiesto → 29/02', grillaSumarMeses('2028-01-31', 1), '2028-02-29');
  eq('31/10 + 1 mes → 30/11', grillaSumarMeses('2026-10-31', 1), '2026-11-30');
  eq('+12 meses', grillaSumarMeses('2026-10-02', 12), '2027-10-02');

  let ms = grillaMesesProximos('2026-10-02');
  eq('meses: 6, arranca en el actual', ms.length, 6);
  eq('meses: labels con año cuando cambia', ms.map(m => m.label), ['Oct', 'Nov', 'Dic', 'Ene 27', 'Feb 27', 'Mar 27']);
  eq('meses: cada uno arranca el día 1', ms.map(m => m.inicio), ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']);
  eq('meses: clave YYYY-MM para marcar el visto', ms[3].mes, '2027-01');
  ms = grillaMesesProximos('2026-03-31');
  eq('meses: desde el 31 no saltea meses cortos', ms.map(m => m.label), ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago']);
  eq('meses: hoy en enero → sin año en ninguno', grillaMesesProximos('2027-01-20').some(m => / \d/.test(m.label)), false);

  eq('días: opciones 7/14/30', /const GRILLA_DIAS_OPCIONES = \[7, 14, 30\];/.test(src), true);
  eq('días: arranca en 14, en variable (no Firebase)', /\nlet grillaDias = 14;/.test(src), true);
  eq('días: renderGrilla genera grillaDias fechas', /for \(let i = 0; i < grillaDias; i\+\+\)/.test(grab('renderGrilla')), true);
  eq('días: barras y track usan fechas.length', [/grillaBarraPos\(.*fechas\[0\], fechas\.length\)/.test(grab('renderGrilla')), /repeat\(\$\{fechas\.length\},1fr\)/.test(grab('renderGrilla'))], [true, true]);
  eq('días: grillaSetDias no toca DB', /DB\.|set\(|update\(/.test(grab('grillaSetDias')), false);
  eq('días: ancho mínimo por columna (scroll horizontal, no se comprime)',
    [/\.grilla-table \{[^}]*min-width: calc\(180px \+ var\(--gd, 14\) \* \d+px\)/.test(html), /\.grilla-table \{ min-width: calc\(96px \+ var\(--gd, 14\) \* \d+px\); \}/.test(html), /style="--gd:\$\{fechas\.length\}"/.test(src)], [true, true, true]);
  eq('nav: input date, ±1 mes y selector de días en el HTML',
    [/type="date" id="grillaFechaInput"[^>]*onchange="grillaIrFecha\(this\.value\)"/.test(html), html.includes('grillaNavegarMes(-1)'), html.includes('grillaNavegarMes(1)'), ['7', '14', '30'].every(n => html.includes(`grillaSetDias(${n})`))],
    [true, true, true, true]);
  const win = src.match(/Object\.assign\(window, \{([\s\S]*?)\}\);/)[1];
  eq('window: funciones nuevas registradas', ['grillaNavegarMes', 'grillaIrMes', 'grillaIrFecha', 'grillaSetDias', 'toggleSidebar'].every(f => new RegExp('\\b' + f + '\\b').test(win)), true);
}

// ── Columna de cabaña fija (sticky) ─────────────────────────────────────────
// Verificado además en Chromium headless (desktop 1440 / iPhone 390, 7/14/30 días):
// hit-test y píxeles reales. Acá quedan los invariantes de CSS que lo hacen funcionar.
{
  const regla = sel => (html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}')) || [])[1] || '';
  const zi = sel => Number((regla(sel).match(/z-index: (\d+)/) || [])[1]);
  const corner = regla('.grilla-table th.grilla-corner'), label = regla('.grilla-table td.cabaña-label');
  eq('sticky: esquina y celdas de cabaña con position:sticky; left:0', [/position: sticky; left: 0/.test(corner), /position: sticky; left: 0/.test(label)], [true, true]);
  eq('sticky: z-index barras < columna fija < esquina', zi('.grilla-barra') < zi('.grilla-table td.cabaña-label') && zi('.grilla-table td.cabaña-label') < zi('.grilla-table th.grilla-corner'), true);
  eq('sticky: fondo opaco (surface2 sin alfa)', [/background: var\(--surface2\)/.test(corner), /background: var\(--surface2\)/.test(label), /--surface2: #[0-9a-f]{6};/.test(html)], [true, true, true]);
  eq('sticky: .grilla-track no crea contexto de apilamiento (barras compiten con la columna)', /z-index|transform|isolation/.test(regla('.grilla-track')), false);
  eq('sticky: sin border-left en la columna fija (por ahí asomaba la barra)', /\.grilla-table th\.grilla-corner, \.grilla-table td\.cabaña-label \{ border-left: none; \}/.test(html), true);
  eq('sticky: .main con min-width:0 (scrollea la grilla, no la página)', /\.main \{[^}]*min-width: 0;/.test(html), true);
}

// ── Sidebar colapsable (desktop) ────────────────────────────────────────────
{
  eq('sidebar: arranca colapsado', [/<div id="app" class="sb-colapsado"/.test(html), /\nlet sidebarColapsado = true;/.test(src)], [true, true]);
  eq('sidebar: reglas de colapso solo en desktop (min-width: 769px)', /@media \(min-width: 769px\) \{[\s\S]*?#app\.sb-colapsado \.sidebar \{ width: 56px; \}[\s\S]*?#app\.sb-colapsado \.sidebar:hover \{ width: 220px;/.test(html), true);
  eq('sidebar: mobile sigue como overlay (.open)', /@media \(max-width: 768px\) \{\n  \.hamburger \{ display: flex; \}\n  \.sidebar \{\n    transform: translateX\(-100%\);/.test(html), true);
  const ts = grab('toggleSidebar');
  eq('sidebar: toggle en desktop alterna colapsado; en mobile .open', [/sidebarColapsado = !sidebarColapsado/.test(ts), /classList\.toggle\('open'\)/.test(ts)], [true, true]);
}

// ── Sección inicial: la app abre en la grilla (respetando permisos) ─────────
{
  const sm = src.match(/\nconst SECCIONES_INICIO = [\s\S]*?\];/)[0];
  const seccionInicial = new Function(sm + grab('seccionInicial') + '\nreturn seccionInicial;')();
  const P = (o) => ({ permisos: o });
  eq('inicio: admin → grilla', seccionInicial('admin', P({ reservas: 'n' })), 'grilla');
  eq('inicio: recepción (reservas rw) → grilla', seccionInicial('recepcion', P({ dashboard: 'r', reservas: 'rw' })), 'grilla');
  eq('inicio: ventas (reservas rw) → grilla', seccionInicial('ventas', P({ dashboard: 'r', mapa: 'r', reservas: 'rw' })), 'grilla');
  eq('inicio: limpieza (reservas n, dashboard n) → mapa', seccionInicial('limpieza', P({ dashboard: 'n', mapa: 'rw', reservas: 'n', checkin: 'r' })), 'mapa');
  eq('inicio: sin reservas pero con dashboard → dashboard', seccionInicial('x', P({ reservas: 'n', dashboard: 'r' })), 'dashboard');
  eq('inicio: rol sin objeto de permisos → grilla', seccionInicial('recepcion', null), 'grilla');
  eq('inicio: rol legacy sin clave reservas → grilla', seccionInicial('recepcion', P({ dashboard: 'r' })), 'grilla');
  eq('inicio: permisos de rol admin (roles rw) → grilla', seccionInicial('otro', P({ roles: 'rw', reservas: 'n' })), 'grilla');
  eq('inicio: todo en n → dashboard (comportamiento anterior)', seccionInicial('x', P({ dashboard: 'n', mapa: 'n', reservas: 'n', checkin: 'n', huespedes: 'n', precios: 'n' })), 'dashboard');
  eq('inicio: login usa seccionInicial', /showSection\(seccionInicial\(rolKey, rol\)\)/.test(src), true);
  eq('inicio: nav-grilla arranca active, nav-dashboard no', [/class="nav-item active"[^>]*id="nav-grilla"/.test(html), /class="nav-item active"[^>]*id="nav-dashboard"/.test(html)], [true, false]);
  eq('inicio: section-grilla arranca active', [html.includes('id="section-grilla" class="section active"'), html.includes('id="section-dashboard" class="section active"')], [true, false]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
