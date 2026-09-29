# Grilla: moneda y formato de montos — 2026-09-29

Branch: `fix/grilla-moneda` (desde `main` e3a7840). Archivos: `index.html`, `tests/fmt.test.mjs` (nuevo).

Disparador: primera reserva en USD (Airbnb) aparecía en la grilla como
`debe $241.53000000004`. El listado la mostraba bien (usa `fmtMoney(…, r.moneda)`).

## 1 — `fmtPrecioCorto(n, moneda = 'ARS')`

- Nuevo parámetro `moneda`, default `'ARS'` → retrocompatible.
- **USD**: `US$ ` + monto completo, siempre 2 decimales, separador es-AR, sin abreviar
  (`241.53000000004` → `US$ 241,53`; `1234.5` → `US$ 1.234,50`).
- **ARS ≥ 1000**: abreviatura en miles igual que antes (`$510k`, `$637,5k`).
- **ARS < 1000**: ya no concatena el número crudo; `toLocaleString('es-AR', {maximumFractionDigits: 2})`.
- Entradas no numéricas (`null`, `undefined`, `NaN`, basura) → 0.
- Llamadas en el archivo: solo 2, ambas en `renderGrilla`; las dos ahora pasan moneda.

## 2 — `renderGrilla` pasa la moneda

- Saldo de la barra de reserva: `res.moneda || 'ARS'` (moneda de ESA reserva).
- Precio de celda libre: `cfg.moneda || 'ARS'`, donde `cfg` es la entrada de
  `precios.habitaciones` de la cabaña (ya se resolvía en el loop).
- No hay conversión ni uso de cotización: cada monto en su moneda.
- El cálculo de `saldo` y de `precioNocheCascada` no se tocó; solo el formateo.

## 3 — Texto desbordado en la barra

- Causa real: `.grilla-span` ya tenía `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`,
  pero es `display:flex; justify-content:center`. En un flex container el texto es un
  ítem anónimo que desborda **por ambos lados** y la elipsis no aplica → se veía "go · debe".
- Fix: el contenido va dentro de `<span class="grilla-span-txt">` (block, `min-width:0`,
  `max-width:100%`, nowrap + overflow hidden + ellipsis). Ahora corta al final con "…".
- `title` del `.grilla-span` ahora tiene el texto completo: `Nombre · debe US$ 241,53`.
- Colspan / fusión de días: sin cambios (solo cambió el contenido interno del `<div>`).

## Reglas duras

- Sin cambios en disponibilidad, precios (motor/cascada) ni conflictos.
- Sin cambios en el render con colspan.
- Sin cambios en `security/` ni `firebase.json`.
- Sin funciones nuevas: `fmtPrecioCorto` no se llama desde `onclick`, no requiere `window`
  (grep en `Object.assign(window)` → 0, como antes).

## Verificación

| Chequeo | Resultado |
|---|---|
| `node --check` del `<script type="module">` | OK |
| `tests/precios.test.mjs` | 33 passed, 0 failed |
| `tests/today.test.mjs` | 4 passed, 0 failed |
| `tests/contabilidad.test.mjs` | 40 passed, 0 failed |
| `tests/fmt.test.mjs` (nuevo) | 17 passed, 0 failed |

`tests/fmt.test.mjs` cubre: ARS sobre/bajo 1000, sin moneda = ARS, float sucio en ARS y USD
(caso Airbnb), USD con decimales y ≥ 1000 sin abreviar, 0 en ambas monedas, null/undefined/NaN,
string numérico, y un barrido que verifica que ninguna salida tenga más de 2 decimales.

## Pendiente

- Ver en navegador la reserva USD real en la grilla (no se corrió browser en esta sesión).
- Nota: el `saldo` de la grilla se calcula como `total || precio − pagado`; el listado usa
  otra ruta (`fmtMoney` sobre sus propios cálculos). No se unificó: fuera de alcance.
