// Verifica que today() (index.html) devuelva la fecha LOCAL del dispositivo y NO
// la fecha UTC de toISOString(). Bug de caja: entre 21:00 y 00:00 hora argentina
// (UTC-3) toISOString() adelanta el día → cobros nocturnos caían en la caja de mañana.
//
// Test TZ-independiente: se inyecta un Date falso cuyos getters LOCALES apuntan a un
// día (14) DISTINTO del que devuelve su toISOString() (15). today() debe tomar el
// local (14). Corre igual bajo cualquier TZ (incluida la UTC del runner de CI).
//   node tests/today.test.mjs

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

// Date falso: local = 2026-07-14 (getters), UTC = 2026-07-15 (toISOString).
// Simula un instante nocturno argentino (ej. 14/07 22:30 ART = 15/07 01:30 UTC).
class FakeDate {
  getFullYear() { return 2026; }
  getMonth() { return 6; }   // julio (0-based)
  getDate() { return 14; }   // día LOCAL
  toISOString() { return '2026-07-15T01:30:00.000Z'; } // día UTC (lo que usaría el bug)
}

const today = new Function('Date', grab('today') + '\nreturn today;')(FakeDate);

let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = got === exp;
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}

const utcDate = new FakeDate().toISOString().split('T')[0]; // '2026-07-15' (lo viejo)

eq('today() usa fecha LOCAL (día 14)', today(), '2026-07-14');
eq('today() NO usa la fecha UTC (día 15)', today() !== utcDate, true);
eq('control: la UTC del instante es el 15', utcDate, '2026-07-15');
eq('formato YYYY-MM-DD con cero-padding', /^\d{4}-\d{2}-\d{2}$/.test(today()), true);

// ── Recordatorio de check-in: hora ARGENTINA explícita (no UTC, no zona del dispositivo) ──
{
  const J = (x) => JSON.stringify(x);
  const cst = (n) => src.match(new RegExp('\\nconst ' + n + ' = [^\\n]*'))[0];
  const ESTADO_RESERVA = { CONFIRMADA: 'confirmada', CHECKIN: 'checkin', CHECKOUT: 'checkout', CANCELADA: 'cancelada' };
  const fns = new Function('ESTADO_RESERVA',
    cst('AR_TZ') + cst('RECORDATORIO_HORA') + grab('nightsBetween') + grab('ordenarPendientesEstadia') + grab('ahoraArgentina') +
    grab('pendientesCheckinDia') + grab('debeMostrarRecordatorio') +
    '\nreturn { ahoraArgentina, ordenarPendientesEstadia, pendientesCheckinDia, debeMostrarRecordatorio };')(ESTADO_RESERVA);

  // 03/10 00:30 UTC = 02/10 21:30 en Argentina (UTC-3): el server/CI en UTC diría el 3.
  let a = fns.ahoraArgentina(new Date('2026-10-03T00:30:00Z'));
  eq('AR: 00:30 UTC del 3 → 2 de octubre 21:30 en Argentina', J([a.fecha, a.hora, a.hhmm]), J(['2026-10-02', 21, '21:30']));
  a = fns.ahoraArgentina(new Date('2026-10-02T23:59:00Z'));
  eq('AR: 23:59 UTC → 20:59 AR (todavía no es la hora)', J([a.fecha, a.hora]), J(['2026-10-02', 20]));
  a = fns.ahoraArgentina(new Date('2026-10-03T02:59:00Z'));
  eq('AR: 02:59 UTC → 23:59 AR del día anterior', J([a.fecha, a.hhmm]), J(['2026-10-02', '23:59']));
  a = fns.ahoraArgentina(new Date('2026-10-03T03:00:00Z'));
  eq('AR: 03:00 UTC → 00:00 AR, día nuevo', J([a.fecha, a.hhmm]), J(['2026-10-03', '00:00']));

  // Orden de pendientes: hoy primero, después atrasados del más reciente al más viejo.
  const R = (id, entrada, hab, estado = 'confirmada') => ({ id, entrada, salida: '2026-10-20', hab, estado });
  const lista = [R('a3', '2026-09-28', '2'), R('h2', '2026-10-02', '7'), R('a1', '2026-10-01', '5'), R('h1', '2026-10-02', '3'), R('a2', '2026-09-30', '1')];
  const ord = fns.ordenarPendientesEstadia(lista, 'entrada', '2026-10-02');
  eq('orden: hoy (por cabaña) y después atrasados de 1, 2, 4 días', J(ord.map(x => x.r.id + ':' + x.atraso)), J(['h1:0', 'h2:0', 'a1:1', 'a2:2', 'a3:4']));
  eq('orden: entrada con hora (ISO) también calcula atraso', J(fns.ordenarPendientesEstadia([R('x', '2026-10-01T14:00', '1')], 'entrada', '2026-10-02').map(x => x.atraso)), J([1]));
  eq('orden: checkout por salida', J(fns.ordenarPendientesEstadia([{ id: 's1', salida: '2026-09-30', hab: '1' }, { id: 's0', salida: '2026-10-02', hab: '9' }], 'salida', '2026-10-02').map(x => x.r.id + ':' + x.atraso)), J(['s0:0', 's1:2']));

  const p = fns.pendientesCheckinDia([...lista, R('fut', '2026-10-05', '4'), R('ya', '2026-10-02', '6', 'checkin'), R('can', '2026-10-02', '8', 'cancelada')], '2026-10-02');
  eq('aviso: hoy y atrasados separados; sin futuras, ni hechas, ni canceladas', J([p.hoy.map(x => x.r.id), p.atrasados.map(x => x.r.id)]), J([['h1', 'h2'], ['a1', 'a2', 'a3']]));

  const A = (fecha, hora) => ({ fecha, hora });
  eq('aviso: 21:00 con pendientes y no mostrado hoy → sí', fns.debeMostrarRecordatorio(A('2026-10-02', 21), '', 3), true);
  eq('aviso: 20:xx → no', fns.debeMostrarRecordatorio(A('2026-10-02', 20), '', 3), false);
  eq('aviso: 23:xx (abrió la app tarde) → sí', fns.debeMostrarRecordatorio(A('2026-10-02', 23), '2026-10-01', 1), true);
  eq('aviso: ya mostrado hoy → no (una vez por día)', fns.debeMostrarRecordatorio(A('2026-10-02', 22), '2026-10-02', 3), false);
  eq('aviso: sin pendientes → no', fns.debeMostrarRecordatorio(A('2026-10-02', 21), '', 0), false);

  const rev = grab('revisarRecordatorioCheckin');
  eq('aviso: no tapa un modal abierto (reintenta al minuto)', /\.modal-overlay\.open'\)\) return/.test(rev), true);
  eq('aviso: usa ahoraArgentina, no today()', [/ahoraArgentina\(\)/.test(rev), /today\(\)/.test(rev)].join(), 'true,false');
  eq('aviso: solo con permiso de check-in', /if \(!puedeHacerCheckin\(\)\) return;/.test(rev), true);
  eq('aviso: revisión cada minuto', /\nsetInterval\(revisarRecordatorioCheckin, 60 \* 1000\);/.test(src), true);
  const marcar = src.match(/\nasync function recordatorioMarcarLlegada\b[\s\S]*?\n\}/)[0];
  eq('aviso: "Llegó" reusa marcarCheckin (sin movimientos)', [/await marcarCheckin\(r,/.test(marcar), /writeMovimiento/.test(marcar)].join(), 'true,false');
  eq('aviso: recordatorioMarcarLlegada registrada en window', /Object\.assign\(window, \{[\s\S]*\brecordatorioMarcarLlegada\b[\s\S]*?\}\);/.test(src), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
