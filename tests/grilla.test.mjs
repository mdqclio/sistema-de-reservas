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

  let ms = grillaMesesProximos('2026-10-02', 6);
  eq('meses: 6, arranca en el actual', ms.length, 6);
  eq('meses: labels con año cuando cambia', ms.map(m => m.label), ['Oct', 'Nov', 'Dic', 'Ene 27', 'Feb 27', 'Mar 27']);
  eq('meses: cada uno arranca el día 1', ms.map(m => m.inicio), ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']);
  eq('meses: clave YYYY-MM para marcar el visto', ms[3].mes, '2027-01');
  eq('meses: 12 desde octubre → Oct … Sep 27', grillaMesesProximos('2026-10-02', 12).map(m => m.label), ['Oct', 'Nov', 'Dic', 'Ene 27', 'Feb 27', 'Mar 27', 'Abr 27', 'May 27', 'Jun 27', 'Jul 27', 'Ago 27', 'Sep 27']);
  ms = grillaMesesProximos('2026-03-31', 6);
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
  eq('sidebar: colapso total solo en desktop (translateX -100%, main sin margen)', /@media \(min-width: 769px\) \{[\s\S]*?#app\.sb-colapsado \.sidebar \{ transform: translateX\(-100%\);[\s\S]*?\.main \{ margin-left: 0; \}/.test(html), true);
  eq('sidebar: ya no hay franja de 56px', /sb-colapsado[^{]*\{[^}]*56px/.test(html), false);
  eq('sidebar: overlay transparente en desktop para click afuera', /@media \(min-width: 769px\) \{[\s\S]*?\.sidebar-overlay\.open \{ display: block; background: transparent;/.test(html), true);
  const cs = grab('closeSidebar');
  eq('sidebar: closeSidebar en desktop colapsa; mobile sigue sacando .open', [/sidebarColapsado = true/.test(cs), /classList\.remove\('open'\)/.test(cs)], [true, true]);
  eq('sidebar: nav items cierran al elegir sección', (html.match(/onclick="showSection\('[a-z]+'\);closeSidebar\(\)"/g) || []).length >= 10, true);
  eq('sidebar: mobile sigue como overlay (.open)', /@media \(max-width: 768px\) \{\n  \.hamburger \{ display: flex; \}\n  \.sidebar \{\n    transform: translateX\(-100%\);/.test(html), true);
  const ts = grab('toggleSidebar');
  eq('sidebar: toggle en desktop alterna colapsado; en mobile .open', [/sidebarColapsado = !sidebarColapsado/.test(ts), /classList\.toggle\('open'\)/.test(ts)], [true, true]);
}

// ── Mes visible en el encabezado ────────────────────────────────────────────
{
  const grillaMesLabel = new Function(
    src.match(/\nconst GRILLA_MESES_CORTOS = [^\n]*/)[0] + src.match(/\nconst GRILLA_MESES_LARGOS = [^\n]*/)[0] + grab('grillaMesLabel') +
    '\nreturn grillaMesLabel;')();
  eq('mes: mismo mes → nombre largo', grillaMesLabel('2026-10-01', '2026-10-30'), 'Octubre 2026');
  eq('mes: cruza dos meses', grillaMesLabel('2026-10-20', '2026-11-02'), 'Oct — Nov 2026');
  eq('mes: cruza año', grillaMesLabel('2026-12-20', '2027-01-18'), 'Dic 2026 — Ene 2027');
  eq('mes: 30 días desde el 31/1 (3 meses) → primero — último', grillaMesLabel('2027-01-31', '2027-03-01'), 'Ene — Mar 2027');
  eq('mes: un solo día', grillaMesLabel('2026-02-14', '2026-02-14'), 'Febrero 2026');
  eq('mes: header en la topbar, oculto fuera de la grilla', [/<h1 id="pageTitle">Dashboard<\/h1>\s*<div class="grilla-titulo-centro">\s*<div id="grillaMesHeader" class="grilla-mes-header" hidden><\/div>/.test(html), /grillaMesHeader'\)\.hidden = s !== 'grilla'/.test(grab('showSection'))], [true, true]);
  eq('mes: se actualiza al render, al scrollear y al resize', [/actualizarGrillaMesHeader\(\);\n\}/.test(grab('renderGrilla')), /addEventListener\('scroll'[\s\S]*?actualizarGrillaMesHeader/.test(grab('initGrillaScroll')), /addEventListener\('resize', actualizarGrillaMesHeader\)/.test(grab('initGrillaScroll'))], [true, true, true]);
  eq('mes: th de fechas con data-fecha', /<th data-fecha="\$\{f\}"/.test(grab('renderGrilla')), true);
}

// ── Scroll con teclado y rueda ──────────────────────────────────────────────
{
  const mk = (active, modal) => ({
    activeElement: active,
    body: BODY,
    getElementById: id => id === 'section-grilla' ? { classList: { contains: c => c === 'active' && GRILLA_ACTIVA } } : null,
    querySelector: q => q === '.modal-overlay.open' && modal ? {} : null,
  });
  const BODY = { tagName: 'BODY' };
  let GRILLA_ACTIVA = true;
  const el = (tagName, extra = {}) => ({ tagName, isContentEditable: false, closest: sel => (extra.enGrilla && sel === '#grillaScroll') ? {} : null, ...extra });
  const teclas = d => new Function('document', grab('grillaTeclasActivas') + '\nreturn grillaTeclasActivas();')(d);
  eq('teclas: sin foco (body) → mueve', teclas(mk(BODY)), true);
  eq('teclas: foco en la grilla → mueve', teclas(mk(el('DIV', { enGrilla: true }))), true);
  eq('teclas: foco en botón de navegación → mueve', teclas(mk(el('BUTTON'))), true);
  eq('teclas: tipeando en input → NO', teclas(mk(el('INPUT'))), false);
  eq('teclas: en select → NO', teclas(mk(el('SELECT'))), false);
  eq('teclas: en textarea → NO', teclas(mk(el('TEXTAREA'))), false);
  eq('teclas: contenteditable → NO', teclas(mk(el('DIV', { isContentEditable: true }))), false);
  eq('teclas: input date de la grilla (no está dentro del scroll) → NO', teclas(mk(el('INPUT'))), false);
  eq('teclas: modal abierto → NO', teclas(mk(BODY, true)), false);
  GRILLA_ACTIVA = false;
  eq('teclas: otra sección → NO', teclas(mk(BODY)), false);
  GRILLA_ACTIVA = true;

  const ini = grab('initGrillaScroll');
  eq('teclas: una columna por pulsación, solo ← →, sin modificadores', [/grillaAnchoColumna\(sc\)/.test(ini), /e\.key !== 'ArrowLeft' && e\.key !== 'ArrowRight'/.test(ini), /e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey/.test(ini)], [true, true, true]);
  eq('wheel: listener no pasivo con preventDefault y scrollLeft += delta', [/addEventListener\('wheel'[\s\S]*?\{ passive: false \}/.test(ini), /e\.preventDefault\(\);\s*sc\.scrollLeft \+= d;/.test(ini)], [true, true]);
  eq('wheel: con lugar, horizontal nativo y vertical → scrollLeft; sin lugar → corre la fecha', [/if \(!horiz\) \{ e\.preventDefault\(\); sc\.scrollLeft \+= d; \}/.test(ini), /grillaNavegar\(n\)/.test(ini)], [true, true]);
  eq('wheel: trackpad horizontal también se maneja (deltaX)', /horiz \? e\.deltaX : e\.deltaY/.test(ini), true);
  eq('teclas: sin lugar → un día', /else grillaNavegar\(dir\)/.test(ini), true);
  // Convivencia con el listener global de los input number: sigue igual (captura, solo blur).
  eq('wheel: listener global de input number intacto', /document\.addEventListener\('wheel', \(e\) => \{\n  const t = e\.target;\n  if \(t instanceof HTMLInputElement && t\.type === 'number' && document\.activeElement === t\) t\.blur\(\);\n\}, \{ passive: false, capture: true \}\);/.test(src), true);
  eq('wheel: el global no llama preventDefault (no pisa al de la grilla)', /type === 'number'[^\n]*preventDefault/.test(src), false);
  eq('scroll: contenedor con id y foco', /<div id="grillaScroll" class="grilla-scroll" tabindex="0"/.test(html), true);
}

// ── Scroll a través del tiempo (fix: la grilla entra entera y no había qué scrollear) ──
{
  const { grillaHayLugar, grillaWheelDias } = new Function(grab('grillaHayLugar') + grab('grillaWheelDias') + '\nreturn { grillaHayLugar, grillaWheelDias };')();
  eq('lugar: sin overflow (max 0) → no hay lugar en ningún sentido', [grillaHayLugar(0, 0, 1), grillaHayLugar(0, 0, -1)], [false, false]);
  eq('lugar: al inicio → solo hacia adelante', [grillaHayLugar(0, 300, 1), grillaHayLugar(0, 300, -1)], [true, false]);
  eq('lugar: al final → solo hacia atrás', [grillaHayLugar(300, 300, 1), grillaHayLugar(300, 300, -1)], [false, true]);
  eq('lugar: al medio → ambos', [grillaHayLugar(150, 300, 1), grillaHayLugar(150, 300, -1)], [true, true]);
  eq('lugar: subpíxel al final cuenta como final', grillaHayLugar(299.4, 300, 1), false);
  let r = grillaWheelDias(0, 100, 46);
  eq('rueda: 100px con columna 46 → 2 días, resto 8', [r.dias, Math.round(r.acc)], [2, 8]);
  r = grillaWheelDias(0, 4, 46);
  eq('trackpad: delta chico → 0 días, acumula', [r.dias, r.acc], [0, 4]);
  let acc = 0, total = 0;
  for (let i = 0; i < 23; i++) { const x = grillaWheelDias(acc, 4, 46); acc = x.acc; total += x.dias; }
  eq('trackpad: 23 eventos de 4px (92px) → 2 días', total, 2);
  r = grillaWheelDias(-40, 10, 46);
  eq('cambio de sentido descarta el resto', [r.dias, r.acc], [0, 10]);
  r = grillaWheelDias(0, -120, 46);
  eq('hacia atrás → días negativos', r.dias, -2);
  r = grillaWheelDias(0, 120, 100);
  eq('rueda de mouse típica (120) con columna ancha (100) → 1 día', r.dias, 1);
  eq('golpe de rueda con columna más ancha (174px) → 1 día igual', grillaWheelDias(0, 120, 174, true).dias, 1);
  eq('golpe de rueda hacia atrás → -1 día', grillaWheelDias(0, -120, 174, true).dias, -1);
  eq('golpe de rueda grande (360px, col 46) → 8 días', grillaWheelDias(0, 360, 46, true).dias, 8);
  eq('golpe no deja resto', grillaWheelDias(30, 120, 46, true).acc, 0);
  eq('grillaNavegar usa addDaysStr (sin ida y vuelta por UTC)', /addDaysStr\(grillaFechaInicio \|\| today\(\), dias\)/.test(grab('grillaNavegar')), true);
}

// ── Barra de navegación en dos renglones ────────────────────────────────────
{
  const nav = html.slice(html.indexOf('<div class="grilla-nav">'), html.indexOf('<div id="grillaScroll"'));
  const orden = ['grillaFechaInput', 'grillaHoy()', 'grillaNavegar(-1)', 'grillaNavegar(1)', 'grillaNavegar(-7)', 'grillaNavegar(7)', 'grillaNavegarMes(-1)', 'grillaNavegarMes(1)', 'grillaDiasSel', 'grillaMeses'].map(x => nav.indexOf(x));
  eq('nav: orden fecha · Hoy · pares día/7/mes · días · meses', orden.every((x, i) => x > 0 && (i === 0 || x > orden[i - 1])), true);
  const f1 = nav.slice(nav.indexOf('grilla-nav-fila"'), nav.indexOf('grilla-nav-fila2'));
  eq('nav: renglón 1 = fecha + saltos + días; renglón 2 = solo los meses', [f1.includes('grillaFechaInput'), f1.includes('grillaDiasSel'), !f1.includes('grillaMeses'), /<div class="grilla-nav-fila2">\s*<div id="grillaMeses" class="grilla-meses"><\/div>\s*<\/div>/.test(nav)], [true, true, true, true]);
  eq('rango: fuera de la nav, en el título debajo del mes', [nav.includes('grillaRangoLabel'), /<div id="grillaMesHeader" class="grilla-mes-header" hidden><\/div>\s*<span id="grillaRangoLabel" class="grilla-rango"><\/span>/.test(html)], [false, true]);
  eq('rango: se oculta con el mes fuera de la grilla (CSS hermano)', /\.grilla-mes-header\[hidden\] \+ \.grilla-rango \{ display: none; \}|\.grilla-mes-header\[hidden\], \.grilla-mes-header\[hidden\] \+ \.grilla-rango \{ display: none; \}/.test(html), true);
  eq('rango: renderGrilla lo sigue escribiendo igual (cálculo intacto)', /document\.getElementById\('grillaRangoLabel'\)\.textContent =\s*`\$\{fmt\(fechas\[0\]\)\} — \$\{fmt\(fechas\[fechas\.length-1\]\)\}`/.test(grab('renderGrilla')), true);
  eq('nav: pares agrupados (3 .grilla-par de 2 botones)', (nav.match(/<span class="grilla-par">\s*<button[^>]*>[^<]*<\/button>\s*<button[^>]*>[^<]*<\/button>\s*<\/span>/g) || []).length, 3);
  eq('nav: renglón 1 en grid izq/centro/der', /\.grilla-nav-fila \{ display: grid; grid-template-columns: 1fr auto 1fr;/.test(html), true);
  eq('nav: 12 meses', /grillaMesesProximos\(today\(\), 12\)/.test(grab('renderGrillaNav')), true);
  eq('nav: meses scrollean en su fila (sin wrap) y el activo queda a la vista', [/\.grilla-meses \{[^}]*overflow-x: auto/.test(html), /meses\.scrollLeft \+=/.test(grab('renderGrillaNav'))], [true, true]);
}

// ── Diseño: precio tenue, finde, hoy ────────────────────────────────────────
{
  const rg = grab('renderGrilla');
  eq('diseño: precio libre tenue (text3, no blanco)', /\.grilla-cell \.grilla-precio \{[^}]*color: var\(--text3\)/.test(html), true);
  eq('diseño: celdas y th de fin de semana marcados', [/gc-finde/.test(rg), /\.grilla-track \.grilla-cell\.gc-finde \{ background:/.test(html), /th\.gc-finde \{ background:/.test(html)], [true, true, true]);
  eq('diseño: hoy = columna teñida (no solo borde izq)', [/\.grilla-track \.grilla-cell\.gc-today \{ background:/.test(html), /gc-today \{ border-left/.test(html)], [true, false]);
  eq('diseño: selección le gana al finde/hoy', /\.grilla-track \.grilla-cell\.gc-sel \{ background: var\(--accent2\); \}/.test(html) && html.indexOf('.grilla-track .grilla-cell.gc-sel') > html.indexOf('.grilla-track .grilla-cell.gc-today {'), true);
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
