// Tests de reservas de grupo.
//  · repartirPago: la suma de las partes cierra EXACTO con el monto (a centavos).
//  · savePago real en modo grupal: 1 movimiento por reserva, suma = monto.
//  · saveReserva real creando un grupo: N reservas independientes con el mismo grupoId.
//  · cancelar (deleteReserva real) una del grupo NO toca las otras.
// Extrae las funciones reales de index.html; DOM y Firebase mockeados.
// Ejecutar:  node tests/grupos.test.mjs

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

function grab(name) {
  const re = new RegExp('\\n(async )?function ' + name + '\\b[\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('no se encontró la función: ' + name);
  return m[0];
}

let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}
const clone = o => JSON.parse(JSON.stringify(o));

// ── Entorno mock compartido ─────────────────────────────────────────────────
let RESERVAS = [], WRITES = [], MOVS = [], REMOVED = [], idSeq = 0;
const EL = {};
const el = id => (EL[id] ||= { id, value: '', innerHTML: '', textContent: '', disabled: false, style: {}, checked: false, classList: { contains: () => false } });
const CHECKED = { cargos: [], pagoGrupo: [], pagoModo: 'solo' };
const document = {
  getElementById: el,
  querySelectorAll: (sel) => sel.includes('pago-grupo-chk') ? CHECKED.pagoGrupo.map(v => ({ value: v })) : CHECKED.cargos.map(v => ({ value: v })),
  querySelector: (sel) => sel.includes(':checked') ? { value: CHECKED.pagoModo } : { checked: false },
};
const PRECIOS = { habitaciones: [
  { hab: '1', tipo: 'Monoambiente', moneda: 'ARS' }, { hab: '2', tipo: 'Monoambiente', moneda: 'ARS' },
  { hab: '7', tipo: 'Loft', moneda: 'ARS' }, { hab: '9', tipo: '2 Ambientes', moneda: 'USD' },
], cargos_unicos: [] };
const env = {
  document, DB: { get: (k, d) => (k === 'precios' ? PRECIOS : d) },
  getReservas: () => RESERVAS,
  getHuespedes: () => [{ id: 'hCoord', nombre: 'Ana', apellido: 'Grupo' }],
  getHuespedNombre: (id, r) => (r && r.guestName) || id,
  precioNocheCascada: (hab) => (hab === '7' ? 150000 : hab === '9' ? 100 : 100000),
  today: () => '2026-10-01',
  nuevaReservaId: () => 'R' + (++idSeq), nuevoMovimientoId: () => 'M' + (++idSeq), nuevoHuespedId: () => 'H' + (++idSeq),
  writeReserva: async r => { WRITES.push(clone(r)); const i = RESERVAS.findIndex(x => x.id === r.id); if (i >= 0) RESERVAS[i] = r; else RESERVAS.push(r); },
  writeMovimiento: async m => { MOVS.push(clone(m)); },
  writeHuesped: async () => {},
  removeReserva: async id => { REMOVED.push(id); RESERVAS = RESERVAS.filter(r => r.id !== id); },
  refrescarTokenReserva: () => {}, // voucher: se testea en voucher.test.mjs
  auditLog: () => {}, closeModal: () => {}, showNotif: (m, t) => { env.lastNotif = [m, t]; }, renderReservas: () => {},
  renderHuespedes: () => {}, renderGrilla: () => {}, renderMapa: () => {}, fmtMoney: (m) => String(m), escapeHtml: s => String(s),
  ESTADO_RESERVA: Object.freeze({ CONFIRMADA: 'confirmada', CHECKIN: 'checkin', CHECKOUT: 'checkout', CANCELADA: 'cancelada' }),
};
const fnNames = ['nightsBetween', 'addDaysStr', 'cargosReservaTotal', 'calcularPrecioReserva', 'totalReserva', 'saldoReserva',
  'reservasDelGrupo', 'repartirPago', 'resumenGrupo', 'cabanaLibreParaGrupo', 'reservaCargosSeleccionados',
  'derivarPrecioDesdeTotal', 'reservasRepartibles', 'aplicarPagoReserva', 'savePago', 'saveReserva', 'deleteReserva'];
const keys = Object.keys(env).filter(k => k !== 'lastNotif');
const api = new Function(...keys,
  'let savingReserva = false; let grupoExtras = [];\n' + fnNames.map(grab).join('\n') +
  '\nreturn { ' + fnNames.join(', ') + ', setExtras: v => { grupoExtras = v; }, getExtras: () => grupoExtras };')(...keys.map(k => env[k]));

// ── repartirPago ────────────────────────────────────────────────────────────
const sum = partes => Math.round(partes.reduce((s, p) => s + p.monto * 100, 0));
let r = api.repartirPago(100, [{ id: 'a', saldo: 50 }, { id: 'b', saldo: 50 }, { id: 'c', saldo: 50 }]);
eq('100 entre 3 saldos iguales: partes', r.partes.map(p => p.monto), [33.34, 33.33, 33.33]);
eq('100 entre 3: suma exacta', sum(r.partes), 10000);
r = api.repartirPago(300000, [{ id: 'a', saldo: 300000 }, { id: 'b', saldo: 150000 }, { id: 'c', saldo: 150000 }]);
eq('proporcional al saldo', r.partes.map(p => p.monto), [150000, 75000, 75000]);
r = api.repartirPago(600000, [{ id: 'a', saldo: 300000 }, { id: 'b', saldo: 150000 }, { id: 'c', saldo: 150000 }]);
eq('pago total del grupo: cada una recibe su saldo', r.partes.map(p => p.monto), [300000, 150000, 150000]);
r = api.repartirPago(0.01, [{ id: 'a', saldo: 10 }, { id: 'b', saldo: 10 }]);
eq('1 centavo: una sola parte, suma exacta', [r.partes.length, sum(r.partes)], [1, 1]);
r = api.repartirPago(241.53, [{ id: 'a', saldo: 120.77 }, { id: 'b', saldo: 120.76 }]);
eq('USD con centavos: suma exacta', sum(r.partes), 24153);
eq('monto > suma de saldos → error', api.repartirPago(1000, [{ id: 'a', saldo: 400 }, { id: 'b', saldo: 500 }]).ok, false);
eq('ninguna con saldo → error', api.repartirPago(10, [{ id: 'a', saldo: 0 }]).ok, false);
eq('monto 0 → error', api.repartirPago(0, [{ id: 'a', saldo: 10 }]).ok, false);
eq('reserva sin saldo no recibe nada', api.repartirPago(50, [{ id: 'a', saldo: 0 }, { id: 'b', saldo: 80 }]).partes, [{ id: 'b', monto: 50 }]);
// Fuzz: 2000 repartos al azar → suma exacta y ninguna parte supera su saldo
let fuzzOk = true;
for (let k = 0; k < 2000; k++) {
  const n = 1 + (k % 6);
  const items = Array.from({ length: n }, (_, i) => ({ id: 'x' + i, saldo: Math.round(Math.random() * 50000000) / 100 }));
  const tot = items.reduce((s, it) => s + Math.round(it.saldo * 100), 0);
  if (!tot) continue;
  const monto = Math.max(1, Math.floor(Math.random() * tot)) / 100;
  const rr = api.repartirPago(monto, items);
  if (!rr.ok || sum(rr.partes) !== Math.round(monto * 100) ||
      rr.partes.some(p => Math.round(p.monto * 100) > Math.round(items.find(i => i.id === p.id).saldo * 100))) { fuzzOk = false; console.log('fuzz falla', monto, items, rr); break; }
}
eq('fuzz 2000 repartos: suma exacta y nadie recibe más que su saldo', fuzzOk, true);

// ── saveReserva real: crear grupo de 3 cabañas ─────────────────────────────
const setForm = v => Object.entries(v).forEach(([k, val]) => { el(k).value = val; });
setForm({ 'res-huesped-mode': 'existente', 'res-huesped': 'hCoord', 'res-hab': '1', 'res-cabaña': '1-1',
  'res-entrada': '2026-10-10', 'res-salida': '2026-10-13', 'res-edit-id': '', 'res-moneda': 'ARS',
  'res-promo': '', 'res-precio': '', 'res-total-manual': '', 'res-pagado': '50000', 'res-estado-pago': 'senia',
  'res-pago': 'efectivo', 'res-plat': 'directo', 'res-estado': 'confirmada', 'res-pasajeros': '', 'res-desayuno': 'si', 'res-notas': '' });
api.setExtras(['2', '7']);
await api.saveReserva();
const grupo = RESERVAS.filter(x => x.grupoId);
eq('grupo: se crean 3 reservas', RESERVAS.length, 3);
eq('grupo: una por cabaña', grupo.map(x => x.cabaña).sort(), ['1-1', '2-1', '7-1']);
eq('grupo: mismo grupoId en las 3', new Set(grupo.map(x => x.grupoId)).size === 1 && grupo.length === 3, true);
eq('grupo: mismas fechas', grupo.every(x => x.entrada === '2026-10-10' && x.salida === '2026-10-13'), true);
eq('grupo: contacto = titular que cargó', grupo.every(x => x.grupoContactoId === 'hCoord'), true);
eq('grupo: cada una cotizada sola (cascada por cabaña)', grupo.map(x => [x.hab, x.total]).sort(), [['1', 300000], ['2', 300000], ['7', 450000]]);
eq('grupo: el pago cargado va solo a la principal', grupo.map(x => [x.hab, x.pagado, x.saldo]).sort(), [['1', 50000, 250000], ['2', 0, 300000], ['7', 0, 450000]]);
eq('grupo: 1 movimiento (el de la seña de la principal)', MOVS.map(m => [m.monto, m.reservaId]), [[50000, grupo.find(x => x.hab === '1').id]]);
eq('grupo: se limpia la selección de extras', api.getExtras(), []);

// cabaña extra ocupada → no se escribe NADA
const antes = RESERVAS.length, writesAntes = WRITES.length;
setForm({ 'res-hab': '9', 'res-cabaña': '9-1', 'res-pagado': '' });
api.setExtras(['2']); // la 2 ya está ocupada por el grupo
await api.saveReserva();
eq('extra ocupada: no crea ninguna reserva', [RESERVAS.length, WRITES.length], [antes, writesAntes]);
eq('extra ocupada: avisa', /no está libre/.test(env.lastNotif[0]), true);

// ── savePago real, modo grupal ──────────────────────────────────────────────
MOVS = [];
const [g1, g2, g7] = ['1', '2', '7'].map(h => RESERVAS.find(x => x.hab === h));
el('pago-res-id').value = g1.id; el('pago-monto').value = '1000000'; el('pago-metodo').value = 'transferencia';
el('pago-concepto').value = 'Pago'; el('pago-grupo').style.display = '';
CHECKED.pagoModo = 'grupo'; CHECKED.pagoGrupo = [g1.id, g2.id, g7.id];
api.savePago();
eq('pago grupal: 1 movimiento por reserva', MOVS.map(m => m.reservaId).sort(), [g1.id, g2.id, g7.id].sort());
eq('pago grupal: suma de movimientos = monto', Math.round(MOVS.reduce((s, m) => s + m.monto * 100, 0)), 100000000);
eq('pago grupal: todos cobrados → saldos 0', [g1, g2, g7].map(x => x.saldo), [0, 0, 0]);
eq('pago grupal: movimientos sin campo de grupo (caja no sabe de grupos)', MOVS.every(m => !('grupoId' in m)), true);

// pago "solo esta": 1 movimiento, solo esa reserva
g2.saldo = 1000; g7.saldo = 1000; MOVS = [];
el('pago-res-id').value = g2.id; el('pago-monto').value = '400'; CHECKED.pagoModo = 'solo';
api.savePago();
eq('pago solo esta: 1 movimiento', MOVS.map(m => [m.reservaId, m.monto]), [[g2.id, 400]]);
eq('pago solo esta: la otra no cambia', g7.saldo, 1000);

// ── Cancelar una del grupo (deleteReserva real) ─────────────────────────────
const otrasAntes = clone(RESERVAS.filter(x => x.id !== g2.id));
await api.deleteReserva(g2.id);
eq('cancelar: borra solo esa reserva', REMOVED, [g2.id]);
eq('cancelar: las otras del grupo quedan idénticas', clone(RESERVAS.filter(x => x.grupoId)), otrasAntes.filter(x => x.grupoId));
eq('cancelar: el grupo sigue con las otras 2', api.reservasDelGrupo(g1.grupoId).length, 2);

// estado cancelada (dato) → fuera de totales y del reparto, las otras intactas
g7.estado = 'cancelada';
const res = api.resumenGrupo(api.reservasDelGrupo(g1.grupoId));
eq('resumen: la cancelada queda fuera de los totales', [res.activas.length, res.canceladas.length, res.porMoneda.ARS.total], [1, 1, 300000]);
eq('reparto: la cancelada no es repartible', api.reservasRepartibles(g1).map(x => x.id).includes(g7.id), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
