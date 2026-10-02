// Tests del comprobante (voucher) público y de los datos del token.
//  · datosTokenReserva: solo campos permitidos (nada de DNI/email/tel), moneda, saldo.
//  · sin datos bancarios: ni en el token ni en el voucher (pedido de Franco, oct-2026).
//  · aplicarPagoReserva reescribe el token → el saldo del voucher queda al día.
//  · renderVoucher (docs/voucher.html): US$ en USD, etiqueta y valor en la misma fila,
//    sin filas repetidas en $0, escape de HTML.
// Ejecutar:  node tests/voucher.test.mjs

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const vhtml = fs.readFileSync(path.join(__dirname, '..', 'docs', 'voucher.html'), 'utf8');
const vsrc = vhtml.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

function grab(code, name, indent = '') {
  const re = new RegExp('\\n' + indent + '(async )?function ' + name + '\\b[\\s\\S]*?\\n' + indent + '\\}', 'm');
  const m = code.match(re);
  if (!m) throw new Error('no se encontró la función: ' + name);
  return m[0];
}

let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}

// ── index.html: helpers del token ───────────────────────────────────────────
const TOKENS = {};
let RESERVAS = [];
const env = {
  DB: { get: (k, d) => (k === 'bot_config' ? { checkin: '15:00', checkout: '10:00' } : k === 'precios' ? { habitaciones: [{ hab: '9', tipo: 'Loft' }] } : d) },
  colKnowledge: { list: () => [{ texto: 'Seña 30%\n- Banco Galicia · CBU: 000111 · Alias: prueba.alias\nOtra cosa' }] },
  getHuespedNombre: (id, r) => r.guestName, getReservas: () => RESERVAS,
  writeCheckinToken: async (t, d) => { TOKENS[t] = d; }, writeReserva: () => {}, writeMovimiento: () => {},
  nuevoMovimientoId: () => 'M1', today: () => '2026-10-01', calcularPrecioReserva: () => ({ total: 0 }),
  ESTADO_RESERVA: { CONFIRMADA: 'confirmada', CHECKIN: 'checkin', CHECKOUT: 'checkout', CANCELADA: 'cancelada' },
};
const names = ['nightsBetween', 'totalReserva', 'saldoReserva', 'datosTokenReserva', 'escribirTokenReserva', 'refrescarTokenReserva', 'aplicarPagoReserva'];
const keys = Object.keys(env);
const api = new Function(...keys, names.map(n => grab(src, n)).join('\n') + '\nreturn {' + names.join(',') + '};')(...keys.map(k => env[k]));

const rUSD = { id: '-OabcDEF123xyz', hab: '9', huespedId: 'h1', guestName: 'Ana Pérez', entrada: '2026-11-10', salida: '2026-11-13',
  pasajeros: 4, moneda: 'USD', total: 400, pagado: 158.47, saldo: 241.53000000004, estado: 'confirmada',
  dni: '30111222', email: 'ana@x.com', tel: '+54 9 11 5555', checkinToken: 'tok1' };
const t = api.datosTokenReserva(rUSD, { guestName: 'Ana Pérez', tipoCabana: 'Loft', ahora: 1 });
eq('token: campos permitidos exactos', Object.keys(t).sort(), ['actualizado', 'codigo', 'entrada', 'guestName', 'hab', 'horaCheckin', 'horaCheckout', 'moneda', 'noches', 'pagado', 'pasajeros', 'precheckinHecho', 'reservaId', 'saldo', 'salida', 'tipoCabana', 'total'].sort());
eq('token: sin DNI/email/tel en ningún valor', /30111222|ana@x\.com|5555/.test(JSON.stringify(t)), false);
eq('token: moneda USD', t.moneda, 'USD');
eq('token: saldo = saldoReserva (a centavos)', t.saldo, 241.53);
eq('token: noches y pasajeros', [t.noches, t.pasajeros], [3, 4]);
eq('token: código corto', t.codigo, '123XYZ');
eq('token: precheckin abierto si confirmada sin pre check-in', t.precheckinHecho, false);
eq('token: precheckin cerrado si ya lo hizo', api.datosTokenReserva({ ...rUSD, guestCheckinDone: true }).precheckinHecho, true);
eq('token: precheckin cerrado si ya hizo check-in', api.datosTokenReserva({ ...rUSD, estado: 'checkin' }).precheckinHecho, true);
eq('token: horarios default', [t.horaCheckin, t.horaCheckout], ['15:00', '10:00']);

// sin datos bancarios
eq('token: sin datos bancarios (CBU/alias)', /CBU|alias/i.test(JSON.stringify(t)), false);
eq('datosSenaDesdeConfig ya no existe', /function datosSenaDesdeConfig\b/.test(src), false);

// pago → token reescrito con saldo nuevo
RESERVAS = [rUSD];
api.aplicarPagoReserva(rUSD, 41.53, 'transferencia', 'Pago');
await new Promise(r => setTimeout(r, 0));
eq('pago: token reescrito con saldo nuevo', TOKENS.tok1 && TOKENS.tok1.saldo, 200);
eq('pago: token con pagado nuevo', TOKENS.tok1 && TOKENS.tok1.pagado, 200);
eq('pago: token sin datos de seña aunque la KB tenga CBU', 'datosSena' in (TOKENS.tok1 || {}), false);
delete TOKENS.tok1;
api.aplicarPagoReserva({ ...rUSD, checkinToken: undefined, saldo: 100 }, 10, 'efectivo', 'Pago');
await new Promise(r => setTimeout(r, 0));
eq('pago sin link: no crea token', Object.keys(TOKENS).length, 0);

// El promover pre check-in ya no borra el token (reescribe con precheckinHecho).
eq('promover pre check-in: no llama removeCheckinToken', /removeCheckinToken/.test(grab(src, 'promoverPrecheckin')), false);

// ── voucher.html: renderVoucher ─────────────────────────────────────────────
const v = new Function(['escapeHtml', 'fmtMonto', 'fmtFechaLarga', 'renderVoucher'].map(n => grab(vsrc, n, '  ')).join('\n') + '\nreturn { renderVoucher, fmtMonto };')();
const tv = { ...t, saldo: 241.53, pagado: 158.47, total: 400 };
const out = v.renderVoucher(tv);
const filas = [...out.matchAll(/<div class="row[^"]*"><span class="label">([^<]*)<\/span><span class="value">([^<]*)<\/span><\/div>/g)].map(m => [m[1], m[2]]);
const val = l => (filas.find(f => f[0] === l) || [])[1];
eq('voucher USD: total', val('Total de la estadía'), 'US$ 400,00');
eq('voucher USD: pagado', val('Pagado'), 'US$ 158,47');
eq('voucher USD: saldo', val('Saldo'), 'US$ 241,53');
eq('voucher: etiquetas únicas (sin filas repetidas)', filas.length === new Set(filas.map(f => f[0])).size, true);
eq('voucher: ninguna fila de monto en $0', filas.some(f => /^(US)?\$ 0(,00)?$/.test(f[1])), false);
eq('voucher: horarios', [val('Check-in'), val('Check-out')], ['desde las 15:00', 'hasta las 10:00']);
eq('voucher: cabaña con tipo', val('Cabaña'), 'Cabaña 9 · Loft');
eq('voucher: noches / pasajeros', [val('Noches'), val('Pasajeros')], ['3', '4']);
eq('voucher: dirección', out.includes('Delfín esq. Alfonsina Storni, Mar de las Pampas.'), true);
eq('voucher: incluye', ['Desayuno', 'Parrilla individual', 'WiFi', 'TV', '1 estacionamiento por cabaña'].every(x => out.includes(`<li>${x}</li>`)), true);
eq('voucher con saldo: línea neutra de formas de pago', out.includes('Consultanos por WhatsApp las formas de pago.'), true);
eq('voucher: sin sección de seña/transferencia', /seña|transferencia/i.test(out), false);
eq('voucher: token viejo con datosSena no se muestra', v.renderVoucher({ ...tv, datosSena: 'Banco X · CBU: 1' }).includes('CBU'), false);
const pagada = v.renderVoucher({ ...tv, saldo: 0, pagado: 400 });
eq('voucher pagado: "Sin saldo pendiente" y sin línea de formas de pago', [pagada.includes('Sin saldo pendiente'), pagada.includes('formas de pago')], [true, false]);
eq('voucher ARS', v.fmtMonto(300000, 'ARS'), '$ 300.000');
eq('voucher: escapa HTML del nombre', v.renderVoucher({ ...tv, guestName: '<img src=x onerror=alert(1)>' }).includes('<img'), false);
eq('voucher: no muestra reservaId interno', out.includes(rUSD.id), false);

// ── Datos del Complejo (bot_config): solo horarios, guardado por merge ──────
{
  const UPD = [], NOTIF = [], AUD = [];
  const DOMV = { 'bcf-checkin': { value: '14:00' }, 'bcf-checkout': { value: '11:00' } };
  const envDC = {
    document: { getElementById: id => DOMV[id] },
    cache: { bot_config: { nombre_hostel: 'Puerto Delfín', servicios: 'Desayuno', quick_replies: [{ label: 'a', msg: 'b' }], checkin: '15:00', checkout: '10:00' } },
    pendingWrites: new Set(), ref: (_db, path) => path, db: {},
    update: async (path, patch) => { UPD.push([path, patch]); },
    showNotif: (m, t) => NOTIF.push([m, t]), auditLog: (...a) => AUD.push(a),
  };
  const dk = Object.keys(envDC);
  const dc = new Function(...dk, ['datosComplejoPatch', 'saveBotConfig'].map(n => grab(src, n)).join('\n') +
    '\nreturn { datosComplejoPatch, saveBotConfig };')(...dk.map(k => envDC[k]));
  eq('complejo: patch solo con checkin/checkout', dc.datosComplejoPatch('14:00', '11:00'), { checkin: '14:00', checkout: '11:00' });
  eq('complejo: falta un horario → null', [dc.datosComplejoPatch('', '11:00'), dc.datosComplejoPatch('14:00', '')], [null, null]);
  await dc.saveBotConfig();
  eq('complejo: guarda con update() en cabanas/bot_config (merge)', UPD, [['cabanas/bot_config', { checkin: '14:00', checkout: '11:00' }]]);
  eq('complejo: cache conserva los campos del chatbot', envDC.cache.bot_config,
    { nombre_hostel: 'Puerto Delfín', servicios: 'Desayuno', quick_replies: [{ label: 'a', msg: 'b' }], checkin: '14:00', checkout: '11:00' });
  eq('complejo: saveBotConfig no hace set() del nodo entero', /DB\.set\(|\bset\(ref/.test(grab(src, 'saveBotConfig')), false);
  DOMV['bcf-checkout'].value = ''; UPD.length = 0;
  await dc.saveBotConfig();
  eq('complejo: horario vacío → no escribe y avisa', [UPD.length, NOTIF.at(-1)[1]], [0, 'error']);
  eq('complejo: form sin campos del chatbot', ['bcf-nombre', 'bcf-ubicacion', 'bcf-cabanas', 'bcf-servicios', 'bcf-adicional', 'qr-list'].some(id => html.includes(`id="${id}"`)), false);
  eq('complejo: nav "Datos del Complejo" con 🏡', /id="nav-botconfig"[^>]*>\s*<span class="icon">🏡<\/span> Datos del Complejo/.test(html), true);
  eq('complejo: título de sección', src.includes("botconfig:'Datos del Complejo'"), true);
  eq('complejo: buildSystemPrompt sigue existiendo', /\nfunction buildSystemPrompt\b/.test(src), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
