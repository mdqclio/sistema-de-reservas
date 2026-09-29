# Cálculo inverso: total pactado → precio por noche — 2026-09-29

Branch: `feat/precio-desde-total` (desde `main` 08e7780).
Archivos: `index.html`, `tests/total.test.mjs` (nuevo), `.github/workflows/tests.yml`.

Pedido de Franco: escribir el total pactado con el huésped y que el sistema derive el precio por noche.

## UI (modal de reserva)

- Fila `Moneda | Precio por noche | Total`: el campo **Total** (`#res-total`, `type="number"`,
  editable) queda al lado del precio. En mobile: Moneda arriba, Precio y Total lado a lado.
- El "Total de la estadía" del bloque Pagos sigue mostrando el total formateado (readonly).
- Los dos campos se actualizan entre sí:
  - Escribe en **Precio** (`onPrecioReservaInput`) → modo normal, igual que antes: el Total se calcula.
  - Escribe en **Total** (`onTotalReservaInput`) → modo total pactado: el precio se deriva.
  - Borrar el Total vuelve al modo normal.
- Estado del modo: hidden `#res-total-manual` con el total escrito tal cual (vacío = modo normal).
- En modo total pactado, cambiar fechas, cabaña o cargos **re-deriva el precio** y el total
  pactado queda fijo (es lo que se le dijo al huésped).
- Desglose: `Total pactado $100.000 − cargos $15.000 ÷ 3 noches = $28.333,33/noche`, y si la
  división no es exacta: "(precio/noche redondeado; el total guardado es el pactado)".

## Derivación: `derivarPrecioDesdeTotal(total, noches, cargosTotal)` (pura)

- `precioNoche = round2((total − cargos tildados) / noches)`.
- Errores (no se deriva nada, no se guarda):
  - total no numérico / ≤ 0 → "El total tiene que ser mayor a 0"
  - noches < 1 → "Elegí fechas válidas (mínimo 1 noche)"
  - total ≤ cargos → "El total no cubre los cargos únicos tildados".
    Incluye `total = cargos` a propósito: daría precio/noche 0, y `precioOverride` 0 hace que
    `calcularPrecioReserva` **caiga a la cascada** → guardaría un total distinto del pactado.
- En el modal el error se muestra en rojo en el desglose (total y saldo "—"); en `saveReserva`
  se muestra `showNotif(error)` y se aborta antes de escribir nada.

## Guardado (`saveReserva`)

- Modo total pactado: `precio = precio derivado` → va como `precioOverride` (el mecanismo que ya
  existía para precio manual). **`total = Number(total escrito)`** — no se recalcula
  noches × precio redondeado. Ej.: 100.000 en 3 noches → precio 33.333,33, total 100.000 (no 99.999,99).
- `saldo = total − pagado` sobre el total escrito.
- Campo nuevo en la reserva: `totalManual` (bool). Las reglas de Firebase no validan el schema
  de reservas (solo `pendientes`), así que el campo no rompe escrituras.
- Resto de la app: `totalReserva(r)` usa `r.total` primero → check-in, listado y grilla ven el
  total pactado. Extender usa `r.precio` (el derivado) × noches extra, que es lo razonable.

## Editar una reserva existente

- `res-precio` = `r.precio`, `res-total` = `r.total`.
- Si `r.totalManual`: se reabre en modo total pactado con `r.total` exacto → re-guardar sin
  tocar nada no cambia el total.
- Si no: modo normal como hasta hoy (el Total muestra precio × noches + cargos).
  ⚠️ Preexistente, no cambiado: una reserva cargada por **cascada con precios variables**
  (ej. cruza finde) guarda `r.precio` = 1ª noche; al editarla, ese precio se toma como override
  uniforme y el total mostrado/guardado puede diferir del original. Ya pasaba antes de este cambio.

## Reglas duras

- Cascada de precios sin cambios (`precioNocheCascada`, `calcularPrecioReserva` intactas; el
  test de total mockea la cascada para que **tire error si se usa** con override → no se usa).
- `security/` y `firebase.json`: sin cambios.
- `window`: `onPrecioReservaInput` y `onTotalReservaInput` (llamadas desde `oninput`) registradas
  en `Object.assign(window)` — grep verificado. `derivarPrecioDesdeTotal` no se llama desde HTML.

## Verificación

| Chequeo | Resultado |
|---|---|
| `node --check` del `<script type="module">` | OK |
| `tests/precios.test.mjs` | 33 passed, 0 failed |
| `tests/today.test.mjs` | 4 passed, 0 failed |
| `tests/contabilidad.test.mjs` | 40 passed, 0 failed |
| `tests/fmt.test.mjs` | 17 passed, 0 failed |
| `tests/grilla.test.mjs` | 27 passed, 0 failed |
| `tests/total.test.mjs` (nuevo, agregado al CI) | 25 passed, 0 failed |

`tests/total.test.mjs`: total sin cargos, con cargos (todos / solo algunos tildados), división
no exacta ARS y USD con y sin cargos (total guardado = escrito, y control de que precio × noches
daría otro), 0 noches, noches negativas, total < cargos, total = cargos, 0, negativo, vacío, texto.

Smoke del modal con DOM falso (funciones reales): modo precio → Total 165.000; escribir Total
100.000 con cargo 15.000 en 3 noches → precio 28.333,33 y total 100.000; Total 10.000 → aviso
"no cubre los cargos"; volver a escribir precio → sale del modo manual y recalcula.

## Pendiente

- Probar en el navegador / iPhone el modal real (no se corrió browser en esta sesión).
