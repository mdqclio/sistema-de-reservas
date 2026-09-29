// Tests de fmtPrecioCorto (formato de montos de la grilla).
// Extrae la función real de index.html y la corre en Node. Ejecutar:  node tests/fmt.test.mjs

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

const fmtPrecioCorto = new Function(grab('fmtPrecioCorto') + '\nreturn fmtPrecioCorto;')();

let pass = 0, fail = 0;
function eq(label, got, exp) {
  const ok = got === exp;
  console.log(`${ok ? '✅' : '❌'} ${label}  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}

// ARS ≥ 1000: abreviado en miles
eq('ARS 510000 → $510k', fmtPrecioCorto(510000, 'ARS'), '$510k');
eq('ARS 637500 → $637,5k', fmtPrecioCorto(637500, 'ARS'), '$637,5k');
eq('ARS 1000 → $1k', fmtPrecioCorto(1000, 'ARS'), '$1k');
eq('sin moneda = ARS (retrocompatible)', fmtPrecioCorto(637500), '$637,5k');
// ARS < 1000: formateado, nunca crudo
eq('ARS 500 → $500', fmtPrecioCorto(500, 'ARS'), '$500');
eq('ARS float sucio 241.53000000004 → $241,53', fmtPrecioCorto(241.53000000004, 'ARS'), '$241,53');
eq('ARS 999.5 → $999,5', fmtPrecioCorto(999.5), '$999,5');
// USD: completo, 2 decimales, separador es-AR, sin abreviar
eq('USD 241.53000000004 → US$ 241,53 (el caso de Airbnb)', fmtPrecioCorto(241.53000000004, 'USD'), 'US$ 241,53');
eq('USD 100 → US$ 100,00', fmtPrecioCorto(100, 'USD'), 'US$ 100,00');
eq('USD 1234.5 → US$ 1.234,50 (no abrevia)', fmtPrecioCorto(1234.5, 'USD'), 'US$ 1.234,50');
// 0 / null / undefined / basura
eq('0 ARS → $0', fmtPrecioCorto(0), '$0');
eq('0 USD → US$ 0,00', fmtPrecioCorto(0, 'USD'), 'US$ 0,00');
eq('null → $0', fmtPrecioCorto(null), '$0');
eq('undefined → $0', fmtPrecioCorto(undefined), '$0');
eq('NaN USD → US$ 0,00', fmtPrecioCorto(NaN, 'USD'), 'US$ 0,00');
eq('string numérico "241.5" USD', fmtPrecioCorto('241.5', 'USD'), 'US$ 241,50');

// Nunca más de 2 decimales: tras la coma decimal es-AR hay a lo sumo 2 dígitos,
// y no aparece un float crudo con punto decimal (ej. "241.53000000004").
const muestras = [0.1 + 0.2, 1 / 3, 241.53000000004, 999.999, 12.3456789, 1000.0001, 123456.789, 2 / 3 * 1000];
const malos = [];
for (const n of muestras) for (const mon of ['ARS', 'USD', undefined]) {
  const out = fmtPrecioCorto(n, mon);
  const dec = (out.match(/,(\d+)/) || [, ''])[1].length;
  if (dec > 2 || /\.\d{4,}/.test(out)) malos.push(out);
}
eq('ninguna salida tiene más de 2 decimales', malos.join(' | '), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
