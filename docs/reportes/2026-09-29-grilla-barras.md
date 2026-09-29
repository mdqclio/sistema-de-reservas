# Grilla: barras de medio día + saldo unificado — 2026-09-29

Branch: `feat/grilla-barras` (desde `main` 283d6a6).
Archivos: `index.html`, `tests/grilla.test.mjs` (nuevo), `.github/workflows/tests.yml`.

> ⚠️ **VERIFICACIÓN VISUAL PENDIENTE DE LEONARDO.** Esto es un cambio de presentación
> y hay que verlo en pantalla (desktop + iPhone). Los tests cubren la geometría y el saldo,
> no cómo se ve. En esta sesión no se pudo sacar screenshot: el Chromium headless local
> no arranca (`libnspr4.so: cannot open shared object file`). Sí se renderizó la grilla con
> datos mock en Node y se inspeccionó el HTML generado (ver "Smoke con mock").

## Problema

Con colspan, una reserva ocupaba celdas enteras de noches. Si A sale el 19 y B entra el 19,
la celda del 19 pertenecía solo a B y visualmente el día de recambio no se leía como tal;
cuando no había llegada, la celda de salida aparecía vacía y Franco la leía como noche perdida.
La disponibilidad estaba bien (semiabierto `entrada <= f < salida`): era representación.

## Qué cambió en `renderGrilla`

**Estructura de fila** (una por cabaña):
- `<td class="cabaña-label">` sticky (sin cambios de contenido).
- `<td class="grilla-row" colspan="GRILLA_DIAS">` → `<div class="grilla-track">` con
  `position:relative` y `display:grid; grid-template-columns:repeat(14,1fr)`.
  El `colspan` acá es solo del contenedor de la fila (alinea con las 14 columnas del header);
  **las reservas ya no usan colspan**.
- Se eligió contenedor-en-td y no `position:relative` sobre el `<tr>` porque el soporte de
  posicionamiento en filas de tabla es poco confiable en Safari/iOS (lo usan en iPhone).

**Fondo** — una celda (`div.grilla-cell`) por día:
- Noche libre → `gc-free`, precio de la noche en la moneda de la cabaña, `onclick="grillaCellClick(...)"`
  (función sin cambios; `data-cab`/`data-fecha` y `gc-sel` iguales).
- Noche ocupada → `gc-busy`, **sin onclick**: no se puede iniciar una reserva encima.
- El precio se muestra en la **mitad derecha** de la celda (es la noche que arranca ese día,
  donde empezaría la barra de una reserva que entre ese día). Evita que la cola de una
  barra que sale ese día lo tape.

**Barras** — `div.grilla-barra` absoluta por reserva (mismos estados visibles que antes:
checkin / confirmada / checkout, misma cabaña):
- Posición por `grillaBarraPos(entrada, salida, inicio, dias)` (función pura nueva):
  `left = (díasDesdeInicio(entrada) + 0.5) / dias * 100`, fin en `díasDesdeInicio(salida) + 0.5`.
  Recambio: la barra saliente termina exactamente donde empieza la entrante (mitad de celda).
- Recorte al rango visible con marca de continuidad: borde recto + borde punteado + flecha
  `‹` / `›` del lado que sigue (`gb-cont-izq` / `gb-cont-der`).
- Se conserva: color por estado, nombre, `debe <saldo>` con `fmtPrecioCorto(saldo, r.moneda)`,
  elipsis (`.grilla-span-txt`, ahora `flex:1` dentro de la barra), `title` completo
  (nombre · saldo · fechas entrada → salida), y `onclick="editReserva(id)"`.

**CSS**: se sacaron las reglas muertas `.grilla-span*` y `.gc-occupied/confirmed/checkout`.
El header "Cabaña" pasó de estilo inline a clase `.grilla-corner`.

**Mobile (iPhone)**: la tabla ahora tiene `min-width` (820px; 720px en ≤768px) dentro del
contenedor existente `overflow-x:auto` → scroll horizontal en vez de columnas aplastadas.
En ≤768px la columna de cabaña baja de 180px a 96px y sigue sticky.

## Saldo unificado: `saldoReserva(r)`

Antes: listado leía `r.saldo`; grilla calculaba `(total || precio) − pagado`.
Esos caminos **divergen de verdad**, no solo en redondeo:
- Extender **sin cobrar** suma a `r.saldo` pero no toca `r.total` → la grilla no mostraba la deuda nueva.
- Extender **cobrando** suma a `r.pagado` pero no a `r.total` → la grilla mostraba menos deuda
  (o ninguna) aunque correspondiera.

Decisión: la fuente de verdad es `r.saldo` (lo mantienen `saveReserva`, `openPago`, extender y
check-in, y es lo que ve el listado, que Leonardo confirmó correcto). Fallback para reservas
viejas sin `r.saldo`: `totalReserva(r) − pagado`. Nunca negativo, redondeado a centavos.

Usado en: listado (`pagoBadge`, botón 💰 `hasSaldo`), grilla, detalle del mapa (`cycleBed`)
y tabla "En el hostel" del dashboard (las cuatro leían `r.saldo` o lo recalculaban).
Efecto visible: en reservas extendidas, la grilla ahora muestra el mismo saldo que el listado.

## Reglas duras

- Disponibilidad / conflictos / precios: sin cambios (`grillaCeldaOcupada`, `grillaCellClick`,
  `precioNocheCascada`, `calcularPrecioReserva`, `saveReserva` intactos). `grillaBarraPos` no
  decide ocupación; la ocupación de la celda de fondo usa el mismo criterio semiabierto de antes.
- `security/` y `firebase.json`: sin cambios.
- Funciones nuevas (`saldoReserva`, `grillaBarraPos`) no se llaman desde `onclick` → no van a
  `window`. Los onclick de la grilla son `editReserva` y `grillaCellClick`, ambos ya en
  `Object.assign(window)` (grep verificado).

## Verificación

| Chequeo | Resultado |
|---|---|
| `node --check` del `<script type="module">` | OK |
| `tests/precios.test.mjs` | 33 passed, 0 failed |
| `tests/today.test.mjs` | 4 passed, 0 failed |
| `tests/contabilidad.test.mjs` | 40 passed, 0 failed |
| `tests/fmt.test.mjs` | 17 passed, 0 failed |
| `tests/grilla.test.mjs` (nuevo, agregado al CI) | 27 passed, 0 failed |

`tests/grilla.test.mjs`: `saldoReserva` (guardado, 0, extender con/sin cobro, float USD,
string, negativo, fallbacks, null) y `grillaBarraPos` (adentro, recambio sin hueco ni
solape, recortes izq/der/ambos, media celda al borde, fuera de rango, 0 noches).

### Smoke con mock

`renderGrilla` real extraído y corrido en Node con 4 reservas mock (rango 10/10–23/10):
- Recambio 13/10: Sergio `left 0% width 25%` (cortada a izq) → Ana `left 25%`. Sin hueco.
- Ana (USD) → `debe US$ 241,53`; cabaña con moneda USD → precio `US$ 85,50`.
- Reserva hasta 30/10 → `gb-cont-der`, llega a 100%.

## Pendiente — Leonardo

1. **Ver la grilla en desktop y en iPhone** (scroll horizontal, columna sticky, legibilidad de
   barras cortas de 1 noche, flechas de continuidad).
2. Probar click en barra (abre edición), click en celda libre (selección de rango) y que
   una celda bajo barra no dispare selección.
3. Revisar un día de recambio real.
