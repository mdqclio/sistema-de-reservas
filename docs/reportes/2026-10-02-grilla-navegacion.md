# Navegación de la grilla y sidebar colapsable

Branch: `feat/grilla-navegacion` (desde `main` d061842). Mergeado a `main` por pedido de Leonardo ("merge y push").
Pedidos de Franco: mirar meses a futuro en la grilla sin navegar de a 7 días, y más ancho para la grilla.

## 1 — Saltar a un mes

- Fila de meses a la derecha de los botones: el actual + 5 siguientes (`grillaMesesProximos(hoy, 6)`).
  Click → la grilla arranca el día 1 de ese mes (`grillaIrMes`).
- El mes que se está viendo (mes de la fecha de inicio de la grilla) queda marcado (`.grilla-mes.activo`).
- Si el año difiere del de hoy se agrega: hoy 02/10/2026 → `Oct · Nov · Dic · Ene 27 · Feb 27 · Mar 27`.
- Botones `◀ 1 mes` / `1 mes ▶` a los costados de los de ±7 días (`grillaNavegarMes`).
  Conservan el día; si el mes destino es más corto queda en su último día (31/01 → 28/02).
  `grillaSumarMeses` trabaja solo con strings `YYYY-MM-DD` (sin problemas de zona horaria).

## 2 — Selector de fecha

- `<input type="date" id="grillaFechaInput">` primero a la izquierda de la barra de navegación.
  Al elegir fecha la grilla arranca ahí (`grillaIrFecha`). Si se vacía el input, no se mueve.
- El input se sincroniza con la fecha de inicio en cada render (también al usar los botones).

## 3 — Cuántos días se ven

- `GRILLA_DIAS` (constante 14) → `let grillaDias = 14` + `GRILLA_DIAS_OPCIONES = [7, 14, 30]`.
- Selector segmentado `7 | 14 | 30 días` junto a la navegación (`grillaSetDias`). Activo marcado.
- Solo en memoria (variable): no se escribe en Firebase. Se pierde al recargar la página.
- **Alineación de barras**: `grillaBarraPos` ya recibía `dias` como parámetro y `renderGrilla` le pasa
  `fechas.length`, el mismo valor que usa el track (`repeat(N, 1fr)`) y el `colspan`. No hubo que
  tocar el cálculo. Tests nuevos para 7, 14 y 30 días: arranque/fin en la mitad de la celda, borde
  derecho, salida en el último día visible, fuera de rango, cubre todo, recambio sin hueco ni solape,
  y cruce de año a 30 días.
- **Ancho mínimo por columna**: la tabla recibe `style="--gd:N"` y el CSS calcula
  `min-width: calc(180px + N*46px)` (desktop) / `calc(96px + N*44px)` (≤768px). Antes eran 820/720
  fijos (≈ lo mismo para 14 días). A 30 días el contenedor (`overflow-x:auto`, ya existía) scrollea en
  horizontal en vez de comprimir; la columna de cabañas sigue sticky.

## 4 — Sidebar colapsable (solo desktop)

- Desktop (≥769px): arranca colapsado a una franja de 56px con solo los íconos. Al pasar el mouse se
  expande a 220px **encima** del contenido (no reacomoda la grilla). El hamburger ahora también se ve
  en desktop (arriba a la izquierda, dentro de la franja) y alterna entre colapsado y fijo expandido.
- Contenido principal: `margin-left` 56px colapsado / 220px fijo expandido.
- Colapsado sin hover: se ocultan títulos de sección, usuario y botón de cerrar sesión; los textos de
  los ítems quedan recortados por el ancho (overflow hidden, nowrap).
- Estado en variable `sidebarColapsado` (dura la sesión de la pestaña, no se guarda en ningún lado).
- Mobile (≤768px): sin cambios. Todas las reglas nuevas están dentro de `@media (min-width: 769px)`;
  `toggleSidebar` en mobile sigue haciendo el toggle de `.open` igual que antes.

## 5 — Columna de cabaña fija al scrollear

- **Bug de fondo encontrado**: `.main` es ítem flex sin `min-width: 0`, así que crecía al ancho de la
  tabla (30 días, o cualquier ancho en iPhone) y scrolleaba **la página entera**, no el contenedor de
  la grilla. El sticky existente (`left: 0`) es relativo al contenedor, que nunca scrolleaba → la
  columna se iba con el resto. Fix: `.main { min-width: 0 }`.
- Capas explícitas: celdas de día (auto) < barras (`z-index: 1`) < columna de cabaña (`4`) <
  esquina (`5`). `.grilla-track` no crea contexto de apilamiento, así que barras y columna fija
  compiten en el mismo contexto y la columna gana.
- Fondo opaco (`--surface2: #162540`, sin alfa).
- **Barra asomando 1px**: con `border-collapse`, el borde izquierdo (translúcido) de la celda sticky no
  lleva su fondo y por ahí se veía una línea de color de la barra. Fix: `border-left: none` en la
  columna fija. El divisor derecho va como `box-shadow` inset (los bordes colapsados no viajan con la
  celda sticky).
- El encabezado de fechas **no** es sticky en vertical (el contenedor no tiene alto fijo); la esquina
  igual tiene el z-index mayor por si se agrega.

### Cómo se verificó

Harness con Chromium headless (Playwright) usando el CSS real de `index.html` y el mismo markup que
genera `renderGrilla`, 12 filas con una barra que cubre todo el rango (el peor caso), contenedor
scrolleado al final. Desktop 1440px e iPhone 390px (DPR 3, media query mobile), con 7/14/30 días:

| Caso | Scrollea el contenedor | Página scrollea | Columna fija (hit-test, 12/12) | Píxeles de barra sobre la columna |
|---|---|---|---|---|
| desktop 7 | no (entra) | no | ✅ | 0 |
| desktop 14 | no (entra) | no | ✅ | 0 |
| desktop 30 | sí (232px) | no | ✅ | 0 |
| iPhone 7 | sí (46px) | no | ✅ | 0 |
| iPhone 14 | sí (354px) | no | ✅ | 0 |
| iPhone 30 | sí (1058px) | no | ✅ | 0 |

- Controles negativos: con `z-index: auto` en la columna el hit-test falla en las 4 vistas que
  scrollean; antes del fix de `border-left` el chequeo de píxeles daba 6–12 píxeles de barra.
- Antes del fix de `.main`, `scrollable` era `false` en los 6 casos (scrolleaba la página).
- 6 tests estáticos nuevos en `grilla.test.mjs` fijan los invariantes de CSS (sticky, orden de
  z-index, fondo opaco, track sin contexto de apilamiento, sin border-left, `.main` min-width 0).
- El harness no es un dispositivo real: Safari iOS sigue pendiente de prueba en el iPhone.

## Reglas duras

- No se tocó lógica de disponibilidad, precios ni conflictos (`renderGrilla` solo cambió la cantidad de
  días y el atributo `--gd`; `resEnFecha`, `precioNocheCascada`, `grillaCeldaOcupada` intactos).
- No se tocó `security/` ni `firebase.json`.
- Funciones nuevas llamadas desde onclick/onchange registradas en `window`:
  `grillaNavegarMes`, `grillaIrMes`, `grillaIrFecha`, `grillaSetDias` (`toggleSidebar` ya estaba).

## Verificación

- `node --check` del script del módulo: OK.
- Nueve suites: contabilidad 40, fmt 17, **grilla 104 (antes 50)**, grupos 33, modal 33, precios 49,
  today 4, total 25, voucher 47 → 352 passed, 0 failed.
- grep de window: las 4 funciones nuevas aparecen en `Object.assign(window, …)` (también verificado
  por test).

## Pendiente de Leonardo

- **Prueba visual**: desktop y iPhone, con los tres anchos de grilla (7 / 14 / 30). En particular:
  - barras alineadas con las columnas en los tres valores;
  - scroll horizontal a 30 días en iPhone y legibilidad de precios en columnas de 44px;
  - sidebar en desktop: hover, hamburger, que no tape nada importante; mobile igual que antes;
  - columna de cabaña fija al scrollear en Safari iOS real (verificado solo en Chromium headless).
- Decisión a revisar: el sidebar arranca **colapsado** en desktop. Si prefieren que arranque expandido,
  es cambiar `sidebarColapsado = true` y la clase inicial `sb-colapsado` de `#app`.
