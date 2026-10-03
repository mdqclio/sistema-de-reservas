// Tests de los accesos del modal de reserva.
//  · guardarYEnviarVoucher: el comprobante se envía SOLO después de un guardado exitoso
//    y con el id de la reserva guardada; si el guardado falla no se envía nada.
//  · renderAccionesModalReserva: mismas condiciones que la fila del listado.
//  · enviarVoucher: la pestaña de WhatsApp se abre ANTES del await (iPhone/Safari).
//  · textoNochesModal / renderNochesModal: contador "N noches" junto a la salida.
// Ejecutar:  node tests/modal.test.mjs

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

const LOG = [];
const EL = {};
const el = id => (EL[id] ||= { id, value: '', innerHTML: '', style: {} });
let RESERVAS = [], HUESPEDES = [{ id: 'h1', nombre: 'Ana', apellido: 'P', tel: '+54 9 11 5555-1234' }, { id: 'h2', nombre: 'Beto', apellido: 'Q', tel: '' }];
let saveResult = null;
const fakeWin = () => { const w = { closed: false, location: { href: '' }, close() { w.closed = true; LOG.push('win.close'); } }; return w; };
const env = {
  document: { getElementById: el },
  window: { open: (u) => { LOG.push('window.open:' + (u || 'blank')); return fakeWin(); } },
  location: { href: 'https://x.github.io/sistema-de-reservas/' },
  navigator: { clipboard: { writeText: async () => { LOG.push('clipboard'); } } },
  getReservas: () => RESERVAS, getHuespedes: () => HUESPEDES,
  getHuespedNombre: (id) => (HUESPEDES.find(h => h.id === id) || {}).nombre || id,
  asegurarTokenReserva: async (r) => { LOG.push('token:' + r.id); return 'TOK'; },
  nightsBetween: () => 2, fmtFecha: s => s, auditLog: (a) => LOG.push('audit:' + a), showNotif: (m) => LOG.push('notif'),
  prompt: () => {}, saldoReserva: r => Number(r.saldo) || 0,
  ESTADO_RESERVA: { CONFIRMADA: 'confirmada', CHECKIN: 'checkin', CHECKOUT: 'checkout', CANCELADA: 'cancelada' },
  saveReserva: async () => { LOG.push('save'); return saveResult; },
};
const keys = Object.keys(env);
const api = new Function(...keys, 'let savingReserva = false;\n' +
  ['renderAccionesModalReserva', 'telHuespedModalReserva', 'guardarYEnviarVoucher', 'enviarVoucher'].map(grab).join('\n') +
  '\nreturn { renderAccionesModalReserva, guardarYEnviarVoucher, enviarVoucher };')(...keys.map(k => env[k]));

// ── Guardar y enviar: guardado falla ──
el('res-huesped-mode').value = 'nuevo'; el('hn-tel').value = '11 5555';
saveResult = undefined; LOG.length = 0;
await api.guardarYEnviarVoucher();
eq('falla el guardado: no genera token ni abre WhatsApp', LOG.some(x => x.startsWith('token:') || x.startsWith('audit:')), false);
eq('falla el guardado: la pestaña pre-abierta se cierra', LOG.includes('win.close'), true);

// ── Guardar y enviar: guardado OK (reserva NUEVA, id recién creado) ──
RESERVAS = [{ id: 'R-NUEVA', huespedId: 'h1', hab: '3', entrada: '2026-10-10', salida: '2026-10-12', estado: 'confirmada' }];
saveResult = RESERVAS[0]; LOG.length = 0;
await api.guardarYEnviarVoucher();
eq('orden: guardar → token de la reserva guardada', LOG.filter(x => x === 'save' || x.startsWith('token:')), ['save', 'token:R-NUEVA']);
eq('pestaña abierta ANTES de guardar (gesto del click) y una sola', LOG.filter(x => x.startsWith('window.open')), ['window.open:blank']);
eq('WhatsApp enviado y auditado', LOG.includes('audit:enviar voucher (WhatsApp)'), true);

// ── Guardar y enviar sin teléfono → copia link, no abre pestaña ──
RESERVAS = [{ id: 'R2', huespedId: 'h2', hab: '4', entrada: '2026-10-10', salida: '2026-10-12', estado: 'confirmada' }];
el('res-huesped-mode').value = 'existente'; el('res-huesped').value = 'h2';
saveResult = RESERVAS[0]; LOG.length = 0;
await api.guardarYEnviarVoucher();
eq('sin teléfono: no abre pestañas y copia el link', [LOG.some(x => x.startsWith('window.open')), LOG.includes('clipboard')], [false, true]);

// ── enviarVoucher desde el modal/listado: abre la pestaña antes del await ──
RESERVAS = [{ id: 'R3', huespedId: 'h1', hab: '5', entrada: '2026-10-10', salida: '2026-10-12', estado: 'confirmada' }];
LOG.length = 0;
await api.enviarVoucher('R3');
eq('enviarVoucher: window.open antes de generar el token', LOG.indexOf('window.open:blank') < LOG.indexOf('token:R3'), true);

// ── Visibilidad de accesos ──
const vis = r => { api.renderAccionesModalReserva(r); return { enviar: el('btnGuardarEnviar').style.display !== 'none', html: el('res-acciones').innerHTML, box: el('res-acciones').style.display !== 'none' }; };
let v = vis(null);
eq('nueva: "Guardar y enviar" visible, sin accesos', [v.enviar, v.box], [true, false]);
v = vis({ id: 'a', estado: 'confirmada', saldo: 100 });
eq('confirmada con saldo: 📄 💰 🔗', [v.enviar, /enviarVoucher\('a'\)/.test(v.html), /openPago\('a'\)/.test(v.html), /generarLinkPrecheckin\('a'\)/.test(v.html)], [true, true, true, true]);
eq('cobrar cierra el modal de reserva antes de abrir el de pago', /closeModal\('modalReserva'\);openPago\('a'\)/.test(v.html), true);
v = vis({ id: 'b', estado: 'confirmada', saldo: 0 });
eq('confirmada sin saldo: sin 💰', /openPago/.test(v.html), false);
v = vis({ id: 'c', estado: 'checkin', saldo: 50 });
eq('check-in: 📄 💰 sin 🔗', [/enviarVoucher/.test(v.html), /openPago/.test(v.html), /generarLinkPrecheckin/.test(v.html)], [true, true, false]);
// Check-in / Check-out desde la ficha: según estado, reusan doCheckin / doCheckout y
// cierran el modal de reserva antes (modales encimados, mismo patrón que Cobrar).
v = vis({ id: 'k1', estado: 'confirmada', saldo: 100 });
eq('confirmada: ✅ Check-in (cierra reserva → doCheckin), sin Check-out', [/closeModal\('modalReserva'\);doCheckin\('k1'\)/.test(v.html), /doCheckout/.test(v.html)], [true, false]);
v = vis({ id: 'k2', estado: 'checkin', saldo: 0 });
eq('en check-in: 🚪 Check-out (cierra reserva → doCheckout), sin Check-in', [/closeModal\('modalReserva'\);doCheckout\('k2'\)/.test(v.html), /doCheckin/.test(v.html)], [true, false]);
v = vis({ id: 'k3', estado: 'checkout', saldo: 0 });
eq('checkout / cancelada: ni Check-in ni Check-out', [/doCheckin|doCheckout/.test(v.html), /doCheckin|doCheckout/.test(vis({ id: 'k4', estado: 'cancelada' }).html)], [false, false]);
v = vis({ id: 'd', estado: 'checkout', saldo: 50 });
eq('checkout: sin "Guardar y enviar" ni accesos', [v.enviar, v.box], [false, false]);
v = vis({ id: 'e', estado: 'cancelada', saldo: 0 });
eq('cancelada: sin "Guardar y enviar" ni accesos', [v.enviar, v.box], [false, false]);

// ── Contador de noches junto a la fecha de salida ──
{
  const realNights = new Function(grab('nightsBetween') + '\nreturn nightsBetween;')();
  const n = new Function('nightsBetween', grab('textoNochesModal') + grab('renderNochesModal') +
    '\nreturn { textoNochesModal, renderNochesModal };')(realNights);
  const AVISO = 'La salida debe ser posterior a la entrada (mínimo 1 noche)';
  eq('noches: 1 noche (singular)', n.textoNochesModal('2026-10-02', '2026-10-03'), { txt: '1 noche', error: false });
  eq('noches: 3 noches (plural)', n.textoNochesModal('2026-10-02', '2026-10-05'), { txt: '3 noches', error: false });
  eq('noches: cruce de mes', n.textoNochesModal('2026-10-30', '2026-11-02').txt, '3 noches');
  eq('noches: falta salida → nada', n.textoNochesModal('2026-10-02', ''), { txt: '', error: false });
  eq('noches: falta entrada → nada', n.textoNochesModal('', '2026-10-05'), { txt: '', error: false });
  eq('noches: salida = entrada → aviso', n.textoNochesModal('2026-10-02', '2026-10-02'), { txt: AVISO, error: true });
  eq('noches: salida < entrada → aviso, sin número negativo', n.textoNochesModal('2026-10-05', '2026-10-02'), { txt: AVISO, error: true });
  eq('noches: aviso = el mismo texto que saveReserva', grab('saveReserva').includes(AVISO), true);
  eq('noches: usa nightsBetween (no cálculo propio)', /nightsBetween\(/.test(grab('textoNochesModal')), true);
  // render con el DOM mockeado
  const cls = new Set();
  const D = { 'res-entrada': { value: '2026-10-02' }, 'res-salida': { value: '2026-10-04' },
    'res-noches': { textContent: '', innerHTML: '', style: {}, classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c) } } };
  const rn = new Function('document', 'nightsBetween', grab('textoNochesModal') + grab('renderNochesModal') + '\nreturn renderNochesModal;')({ getElementById: id => D[id] }, realNights);
  rn();
  eq('noches: render número grande + palabra', D['res-noches'].innerHTML, '<span class="rn-num">2</span><span class="rn-txt">noches</span>');
  eq('noches: render normal sin rojo', [D['res-noches'].style.color, cls.has('rn-error')], ['', false]);
  D['res-salida'].value = '2026-10-03'; rn();
  eq('noches: render singular', D['res-noches'].innerHTML, '<span class="rn-num">1</span><span class="rn-txt">noche</span>');
  D['res-salida'].value = '2026-10-01'; rn();
  eq('noches: render con salida <= entrada → aviso en rojo', [D['res-noches'].textContent, D['res-noches'].style.color, cls.has('rn-error')], [AVISO, 'var(--red)', true]);
  D['res-salida'].value = ''; D['res-noches'].innerHTML = 'x'; rn();
  eq('noches: render sin salida → vacío', D['res-noches'].textContent, '');
  // Ubicación: en la fila del selector de cabaña, a su derecha; ya no bajo la salida.
  const filaCab = html.match(/<div class="form-row">\s*<div class="form-group"><label>Cabaña \*<\/label>[\s\S]*?\n    <\/div>\n/)[0];
  eq('noches: #res-noches en la fila del selector de cabaña', /<\/select>\s*<\/div>\s*<div id="res-noches"/.test(filaCab), true);
  eq('noches: #res-noches ya no está en el form-group de la salida', /id="res-salida"[^\n]*res-noches"/.test(html), false);
  eq('noches: un solo #res-noches', (html.match(/id="res-noches"/g) || []).length, 1);
  eq('noches: onEntradaChange recalcula el contador', grab('onEntradaChange').includes('renderNochesModal()'), true);
  eq('noches: onchange de la salida recalcula el contador', /id="res-salida" onchange="[^"]*renderNochesModal\(\)/.test(html), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
