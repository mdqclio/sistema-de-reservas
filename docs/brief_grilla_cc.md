# Brief para Claude Code — Grilla: fix duplicados + carga unificada huésped/reserva

> Pegá este archivo (o su contenido) al iniciar la sesión de Claude Code.
> Repo: `mdqclio/sistema-de-reservas` → archivo `index.html` (vanilla JS, un solo archivo).

## Setup / base

- **Antes de empezar, commitear el fix de concurrencia** (el `index.html` nuevo con la factory
  `makeLiveCollection`). Si CC parte del `main` actual sin ese commit, igual funciona porque
  `writeReserva()` / `writeHuesped()` ya existen en `main`, pero conviene trabajar sobre la
  versión con concurrencia para no pisar ese trabajo.
- Stack: Vanilla JS + Firebase Realtime Database (NO Firestore). Path `/cabanas/`.
- Restricciones: **no romper la capa de concurrencia** (escritura por hijo). Toda escritura
  de reserva va por `writeReserva(reg)` y la de huésped por `writeHuesped(reg)` — NUNCA
  `DB.set('reservas', …)`. Escapar HTML de todo dato de usuario (`escapeHtml`) antes de `innerHTML`.

-----

## Tarea 1 — Bug: cabañas duplicadas en la grilla

**Causa (ya diagnosticada):** en `renderGrilla()` (≈ línea 5103), el loop `for (h = 1..12)`
emite por cada cabaña DOS filas:

```js
// fila-cabecera redundante (herencia del hostel: "habitación" con varias "camas")
html += `<tr class="grilla-hab-header"><td colspan="${fechas.length + 1}">Cabaña ${h}</td></tr>`;
beds.forEach(b => {
  html += `<tr><td class="cabaña-label">Cabaña ${b.label}</td>` // ← fila real de datos
  ...
```

Como `habBeds(h)` devuelve **una sola unidad** por cabaña (`[{ id:'1-1', label:'1' }]`),
la cabecera "Cabaña N" queda pegada a la fila "Cabaña N" → se ve duplicado.

**Fix:** eliminar la fila `grilla-hab-header`. Dejar solo la fila de datos por cabaña.
(Opcional: como `beds` siempre tiene 1 elemento, se puede simplificar el `beds.forEach`.)
Verificar que el `colspan`, los estilos sticky y el matcheo de reservas (`r.cabaña === b.id`)
sigan intactos.

-----

## Tarea 2 — La grilla como punto de carga de huésped + reserva

**Objetivo:** marcar un rango de fechas sobre una fila de cabaña (celdas libres) abre una
pantalla para cargar **todos los datos del huésped** y **todos los datos de la reserva**,
con cabaña y fechas pre-cargadas.

### UX de selección

- Selección por **dos clicks** sobre celdas libres de una misma fila de cabaña:
  1er click = fecha de entrada, 2º click = fecha de salida (la salida es exclusiva, igual que
  hoy: `entrada <= f < salida`). Resaltar el rango tentativo entre ambos clicks.
- Solo permitir el rango si **todas** las celdas intermedias están libres (sin reserva en
  estados `confirmada|checkin|checkout`). Si hay una ocupada en el medio, avisar y cancelar.
- Hoy las celdas libres NO tienen `onclick` (solo el span de reserva tiene `cycleBed`).
  Hay que agregar el handler a las celdas `gc-free`, llevando `cabaña id (b.id)`, `hab` y la fecha.

### La pantalla (formulario unificado)

Una pantalla/modal con dos bloques. Pre-cargar: cabaña (`hab` + `cabaña`=b.id) y fechas
(entrada/salida del rango marcado).

**Bloque Huésped** — dos modos (como pide TAREAS.md):
- **Huésped existente**: selector (reusar el `<select id="res-huesped">` que ya arma
  `openNuevaReserva`). Evita duplicados.
- **Huésped nuevo**: campos del modelo `huespedes`:
  `nombre, apellido, dni, nac, ciudad, tel, email` (+ `foto` opcional). Al guardar, crear el
  huésped con `writeHuesped({ id: nuevoHuespedId(), … })` y linkear su `id` a la reserva.
  *(Referencia de campos: `guest-register.html` y `checkin.html`.)*

**Bloque Reserva** — reusar los campos del modal actual (`openNuevaReserva` / `saveReserva`):
`res-entrada, res-salida, res-precio, res-moneda, res-pagado, res-pago, res-estado-pago,
res-estado, res-plat, res-notas, res-pasajeros, res-desayuno`.
- **Precio:** NO defaultear a `510000`. Tomarlo de `precios.habitaciones` según la cabaña
  (`hab`) y la temporada de la fecha (hay `getTipoTemporada(fecha)` y precios alta/base/baja).
  Esto también cierra un ítem de saneamiento del TAREAS.md (hoy subcobra las cabañas de $637.500).

### Guardado

1. Si huésped nuevo → `writeHuesped(huesped)`; obtener su `id`.
2. Construir la reserva con `hab`, `cabaña = b.id` (formato `'N-1'`), `huespedId`, fechas,
   precio, etc., con `id: nuevaReservaId()`.
3. Guardar con `writeReserva(reserva)` (por hijo).
4. Cerrar y re-renderizar grilla (el `onValue` de reservas ya refresca solo, pero forzar
   `renderGrilla()` para feedback inmediato).

-----

## Puntos de integración (nombres y formatos reales)

- `renderGrilla()` ≈ 5103 · `habBeds(h)` → `[{id:'h-1', label:'h'}]` · `camaLabel()`.
- Reserva: tiene **`hab`** (`'1'..'12'`) y **`cabaña`** (id de unidad, `'1-1'`). La grilla
  matchea por `r.cabaña === b.id`. Mantener ambos campos.
- Catálogo de cabañas: `precios.habitaciones` = `[{hab, nombre, capacidad, precio_base,
  precio_alta, precio_baja, moneda}]`.
- Huésped: `getHuespedes()`, modelo `{id, nombre, apellido, dni, nac, ciudad, tel, email, foto, estadias}`.
- Escrituras por hijo: `writeReserva` / `removeReserva` / `nuevaReservaId`;
  `writeHuesped` / `nuevoHuespedId` (verificar el nombre exacto del helper de id de huésped).
- Reusar `escapeHtml`, `showNotif`, `openModal/closeModal`, `calcTotalReserva`, `disponibilidadEnFecha`.

## Decisiones a confirmar con el usuario (Franco)

1. ¿La pantalla es un **modal grande** (como los actuales) o una **vista a pantalla completa**?
2. ¿Qué campos del huésped son **obligatorios** para crear la reserva? (mínimo sugerido:
   nombre, apellido, tel; DNI/foto opcionales y completables luego en el pre check-in).
3. ¿Selección por **dos clicks** (recomendado en mobile) o click-drag?
4. ¿La carga unificada **reemplaza** el botón "Nueva Reserva" actual o convive con él?

## Verificación al terminar

- `node --check` del bloque `<script type="module">` (ver comandos en START_SESSION.md).
- Grilla sin filas duplicadas; rango de 2 clicks abre el form con cabaña+fechas correctas.
- Crear reserva con huésped nuevo y con huésped existente; confirmar que aparece en grilla,
  en Reservas y que el huésped quedó en Huéspedes.
- Confirmar que el precio sale de `precios` (no 510000 fijo) y que el saldo/seña se reflejan.
- Probar con la cabaña correcta cuando la fila es "Cabaña 9–12" ($637.500).
