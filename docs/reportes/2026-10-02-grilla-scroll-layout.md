# Grilla: fix del scroll (rueda / trackpad / flechas) y barra de navegación en dos renglones

Branch: `fix/grilla-scroll-layout` (desde `main` c14ade8). **No mergeado**: Leonardo verifica primero.

## 1 — El scroll no funcionaba: causa real

**La sospecha (listeners colgados de un nodo que ya no existe) no era la causa.** Lo verifiqué
cargando el `index.html` real en Chromium (servido por HTTP, con Firebase y todo):

- `#grillaScroll` es HTML estático; existe cuando corre el módulo (`<script type="module">` es
  diferido). `initGrillaScroll()` se ejecuta y engancha (`dataset.scrollInit === "1"`).
- `renderGrilla()` reemplaza solo el `innerHTML` de `#grillaContainer` (hijo), nunca `#grillaScroll`.
- El elemento con `overflow-x: auto` es `#grillaScroll`, el mismo que se escucha. No hay ancestros
  con scroll horizontal (`.main` tiene `min-width: 0` desde el fix de la columna fija).
- Con 30 días a 1280px la rueda y las flechas **sí** scrolleaban (scrollLeft 0 → 120 → 166).

**Causa real: no había nada que scrollear.** Píxeles scrolleables de `#grillaScroll` en la app real:

| Ancho | 7 días | 14 días | 30 días |
|---|---|---|---|
| 1280px | 0 | 0 | 336 |
| 1440px | 0 | 0 | 176 |
| 1920px | 0 | 0 | 0 |
| iPhone 390px | 46 | 354 | 1058 |

Desde que el sidebar se oculta del todo, en desktop la grilla de 7 o 14 días (y la de 30 en monitores
grandes) **entra entera en pantalla**. El scroll estaba limitado a los días ya dibujados, así que
rueda, trackpad y flechas no tenían adónde ir. El código anterior además hacía `return` sin hacer nada
cuando no había overflow. La expectativa (Reservas.Travel) es que scrollear **recorra el tiempo**.

### Fix: scrollear = moverse en el tiempo

- Si al contenedor le queda lugar hacia ese lado → scroll en px como antes (rueda vertical traducida a
  horizontal; gesto horizontal del trackpad nativo, suave).
- Si no queda lugar (borde, o la grilla entra entera) → se corre la **fecha de inicio** día a día y se
  re-renderiza (como mucho 1 render por frame, con `requestAnimationFrame`).
- **Rueda de mouse (Mariana):** cada golpe mueve al menos 1 día (`deltaMode` en líneas o salto ≥50px),
  aunque la columna sea más ancha que el delta (a 7 días en desktop las columnas miden ~170px).
- **Trackpad (Franco):** deltas chicos en px que se acumulan; 1 día por cada ancho de columna recorrido.
  Funciona en horizontal y en vertical. Cambiar de sentido descarta lo acumulado.
- `preventDefault` también evita el "swipe atrás" del navegador en Mac cuando no hay overflow.
- **Flechas ← →:** una columna si hay lugar; si no, un día. Mantener repite. Mismas condiciones que
  antes (no con foco en input/select/textarea ni con modal abierto).
- La rueda/trackpad fuera de la grilla sigue scrolleando la página normal. **Cambio de comportamiento:**
  antes, en los bordes, la rueda sobre la grilla dejaba pasar el scroll vertical a la página; ahora sigue
  moviendo días (es el pedido). Para bajar la página con la rueda hay que tener el cursor fuera de la grilla.
- Listener global de wheel de los input number: sin tocar; no se pisan (el global solo hace blur, no
  llama `preventDefault`).
- De paso: `grillaNavegar` usa `addDaysStr` (strings) en vez del ida y vuelta por UTC de `new Date(str)`.

Funciones nuevas (puras, testeadas): `grillaHayLugar(scrollLeft, max, d)` y
`grillaWheelDias(acc, d, colW, golpe)`. No se llaman desde onclick.

## 2 — Barra de navegación en dos renglones

**Renglón 1** (grid izquierda / centro / derecha):
- izquierda: input de fecha;
- centro: `Hoy` · `◀ 1 día` `1 día ▶` · `◀ 7 días` `7 días ▶` · `◀ 1 mes` `1 mes ▶`. Cada par va
  agrupado (3px entre los dos botones, 14px entre pares), así ida y vuelta quedan pegados;
- derecha: selector `7 | 14 | 30 días`.

**`Hoy` al principio** del grupo: es el "volver al punto de partida", conviene encontrarlo siempre
en el mismo lugar, no después de cruzar los pares. Va en azul para que se distinga.

**Renglón 2**, centrado: los **12 meses** (el actual + 11, con año cuando cambia: `Oct · Nov · Dic ·
Ene 27 … Sep 27`) y el rango mostrado (`02/10 — 31/10`, en fuente mono).

**Mobile (≤768px):** renglón 1 = fecha a la izquierda y días a la derecha; los botones abajo (en iPhone
hacen wrap a 2 líneas sin separar los pares). Los 12 meses scrollean horizontal **en su propia fila**
(sin romper el ancho de la página) y el mes activo se centra solo en esa fila (sin mover la página);
el rango va debajo, centrado.

Bug que encontré y corregí antes de commitear: las reglas mobile de la barra quedaban antes que las
reglas base en el CSS (misma especificidad → ganaba la base) y la fila de meses ensanchaba la página a
533px en iPhone. Ahora están en un `@media` ubicado después de las reglas base.

## Reglas duras

- Disponibilidad, precios y conflictos: sin tocar.
- `security/` y `firebase.json`: sin tocar.
- Sin funciones nuevas llamadas desde onclick. Las de los botones (`grillaHoy`, `grillaNavegar`,
  `grillaNavegarMes`, `grillaSetDias`, `grillaIrFecha`, `grillaIrMes`) siguen registradas en `window`.

## Verificación

- `node --check` del módulo: OK.
- Nueve suites: contabilidad 40, fmt 17, **grilla 161 (antes 136)**, grupos 33, modal 33, precios 49,
  today 4, total 25, voucher 47 → **409 passed, 0 failed**.
- Tests nuevos: `grillaHayLugar` (5), `grillaWheelDias` (rueda, trackpad acumulado, cambio de sentido,
  golpe con columna ancha, sin resto), orden y agrupación de la barra, 12 meses, fila de meses con scroll.
- **App real (`index.html` servido) en Chromium headless, 37/37 OK:**
  - 1440px con 7 y 14 días (sin overflow, el caso del bug): rueda ↓ avanza 1 día y ↑ vuelve; trackpad
    horizontal (60×4px) y vertical (40×6px) avanza días y vuelve; → → = 2 días, ← = 1; rueda fuera de la
    grilla no la mueve; la página no se mueve;
  - 1280px con 30 días: rueda primero scrollea px (fecha igual), al llegar al borde sigue corriendo la
    fecha (02/10 → 12/10 y el header pasa a `Oct — Nov 2026`); → con lugar = 1 columna;
  - layout desktop: fecha pegada a la izquierda, días a la derecha, saltos centrados en un renglón, 12 meses;
  - iPhone 7 y 30 días: la página no se ensancha (390px), los meses scrollean en su fila (675 en 358px),
    saltar a `Mar 27` lo deja a la vista.
- Sin login (no hay reservas cargadas): el scroll y el layout no dependen de los datos. El trackpad se
  simuló con eventos `wheel` de deltas chicos, no con un Mac real.

## Pendiente de Leonardo

- Probar con datos reales: Mariana con rueda de mouse, Franco con trackpad en Mac (Safari y Chrome),
  en 7/14/30 días, y el iPhone.
- Evaluar la sensibilidad: 1 día por golpe de rueda, y 1 día por cada ancho de columna recorrido con
  el trackpad.
- Confirmar que está bien que la rueda sobre la grilla no baje la página (hay que poner el cursor afuera).
