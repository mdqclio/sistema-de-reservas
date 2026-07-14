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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
