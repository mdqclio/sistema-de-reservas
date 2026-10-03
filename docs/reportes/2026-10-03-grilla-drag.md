# Grilla: arrastrar con el cursor (como un mapa)

Branch: `feat/grilla-drag` (desde `main` 2092080). **No mergeado**: Leonardo verifica primero.

## Qué hace

Click sostenido sobre la grilla + mover el mouse → la grilla se desplaza en horizontal.
Implementado en `initGrillaDrag()` (nuevo, se llama una vez al cargar, después de `initGrillaScroll()`),
con Pointer Events sobre `#grillaScroll`, el contenedor con `overflow-x`.

- **Hacia dónde:** puntero a la izquierda → avanza en el tiempo; a la derecha → retrocede.
- **Misma regla que la rueda:** si al contenedor le queda lugar, mueve px exactos (sigue al cursor);
  si no (desktop con 7/14 días, donde la grilla entra entera, o al llegar al borde), corre la fecha de
  inicio un día por cada ancho de columna arrastrado. Sin esto el arrastre no haría nada en el caso
  más común de desktop, que es el mismo motivo por el que "no scrolleaba" la rueda. Reutiliza
  `grillaHayLugar`, `grillaWheelDias` y `grillaNavegar`; no se modificaron.
- **Cursor:** `grab` en reposo sobre las celdas y la columna de cabañas, `grabbing` mientras se
  arrastra (en toda la grilla). **Las barras de reserva conservan `pointer`** (la manito de
  "clickeable"), para que siga siendo evidente que abren la reserva. Si preferís `grab` también ahí,
  es una regla de CSS.

## Click vs. arrastre (lo crítico)

- Umbral `GRILLA_DRAG_UMBRAL = 5` px, distancia euclídea entre el `pointerdown` y la posición actual
  (`grillaEsArrastre(dx, dy)`, función pura y testeada).
  - Menos de 5px al soltar → **click**: no se hace nada, pasa normal a `editReserva` (barras) y a la
    selección de rango por dos clicks (celdas libres).
  - 5px o más → **arrastre**: se anula el click que el navegador dispara después del `pointerup`.
- **`setPointerCapture` recién al pasar el umbral**, no en el `pointerdown`: con captura el click se
  redirige al contenedor y los `onclick` de celdas y barras dejarían de dispararse en los clicks
  normales. Con captura desde el umbral el arrastre no se pierde al salir del elemento.
- Anulación: listener de `click` **en fase de captura** sobre el contenedor. Corre antes que los
  `onclick` inline de celdas/barras y hace `stopPropagation` + `preventDefault`.
- Si el click nunca llega (se soltó fuera de la grilla), el flag se limpia con `setTimeout(0)` para no
  comerse el siguiente click legítimo.
- `pointerdown` no hace `preventDefault`: el contenedor sigue tomando foco al hacer click (las flechas
  dependen de eso).
- Click sobre la barra de scroll nativa del contenedor: se ignora (no inicia arrastre).

## Touch (iPhone) y texto

- Solo `pointerType === 'mouse'` y botón principal. Touch y lápiz: no se registra nada, no hay
  `preventDefault`; el scroll nativo y el tap quedan como estaban.
- `user-select: none` **solo dentro de `#grillaScroll`** (si no, arrastrar selecciona los nombres de
  las barras/cabañas). El resto de la página selecciona texto normal. Al empezar un arrastre se
  limpia cualquier selección activa.

## Reglas duras

- Disponibilidad, precios y conflictos: sin tocar.
- Listener de wheel y de flechas (`initGrillaScroll`) y el listener global de wheel de los input
  number: sin tocar. El diff contra `main` son **solo líneas agregadas** (100 nuevas, 0 borradas).
- `security/` y `firebase.json`: sin tocar.
- Sin funciones nuevas llamadas desde `onclick` (todo son listeners): nada que registrar en `window`.

## Verificación

- `node --check` del módulo: OK.
- Nueve suites: contabilidad 40, fmt 17, **grilla 177 (antes 161)**, grupos 33, modal 33, precios 49,
  today 4, total 25, voucher 47 → **425 passed, 0 failed**.
- Tests nuevos: umbral `grillaEsArrastre` (0px, 4px, temblor 3,3, 5px, diagonal 4,3, vertical 6px,
  120px) e invariantes (solo mouse, `pointerdown` sin captura ni `preventDefault`, captura al pasar el
  umbral, anulación del click en captura, limpieza del flag, regla de lugar/fecha, CSS de cursores).
- **App real (`index.html` servido) en Chromium headless, 17/17 OK.** Barra de reserva simulada con
  `onclick` inline (mismo mecanismo que `editReserva`); celdas libres reales (selección de rango):
  - click quieto en celda → selecciona; temblor de 2.8px → sigue siendo click;
  - arrastre de 300px desde una celda (1440px, 14 días) → avanza 3 días y **no** selecciona;
    arrastre a la derecha → retrocede; durante el arrastre clase + cursor `grabbing`;
  - click en barra → abre; arrastre desde la barra → **no** abre; arrastre de 6px → **no** abre;
  - arrastre soltado fuera de la grilla → el siguiente click en una barra abre normal;
  - selección de texto en el título de la página → anda;
  - rueda y flechas siguen andando;
  - 1280px, 30 días: arrastre de 200px → `scrollLeft` exactamente 200, fecha igual; arrastre largo a la
    derecha → pasa el borde y retrocede días;
  - iPhone: pointer touch no activa el arrastre ni hace `preventDefault`; tap en celda sigue
    seleccionando.
- Sin login (sin reservas reales); el mouse lo maneja Playwright, no una persona.

## Pendiente de Leonardo

- **Prueba real: arrastrar la grilla con datos reales sin que se abran reservas ni se seleccionen
  rangos por accidente**, en desktop (Chrome y Safari), con 7/14/30 días.
- Confirmar que el iPhone sigue scrolleando y tocando celdas igual que antes.
- Evaluar si 5px de umbral se siente bien (si se abren reservas al intentar arrastrar, subirlo a 8).
