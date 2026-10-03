# Grilla: el rango mostrado pasa al título

Branch: `fix/grilla-rango-titulo` (desde `main` 2092080). **No mergeado**: Leonardo verifica primero.

## Qué cambió

- El rango (`02/10 — 31/10`) sale del segundo renglón de navegación.
- Va al encabezado, **debajo del mes, en chico**:

  ```
        Oct — Nov 2026        ← mes visible (20px, color acento), como estaba
         27/10 — 25/11        ← rango (12px, mono, gris tenue)
  ```

  **Por qué esta opción y no "Octubre 2026 · 02/10 — 31/10" en una línea:** el mes sigue siendo lo
  primero que se lee, el rango es dato secundario y queda con menos peso visual; y en una sola línea
  el centro de la topbar se alargaba bastante (con `Dic 2026 — Ene 2027` ocupaba casi todo el espacio
  entre el título y la fecha). En mobile van apilados igual, alineados a la izquierda con el título.
- El segundo renglón queda **solo con los 12 meses**, centrados (en mobile siguen scrolleando en su
  fila, alineados a la izquierda para que no se corte el primero).

## Cómo (sin tocar JS)

- HTML: `#grillaMesHeader` y `#grillaRangoLabel` ahora son hermanos dentro de un `.grilla-titulo-centro`
  en la topbar. Los ids no cambiaron.
- `renderGrilla` sigue escribiendo el rango en `#grillaRangoLabel` igual que antes, y
  `actualizarGrillaMesHeader` sigue escribiendo el mes en `#grillaMesHeader`. **Cálculo y navegación
  intactos; el diff es solo HTML y CSS.**
- Fuera de la grilla: `showSection` sigue poniendo `hidden` solo al mes; el rango se oculta con él por
  CSS (`.grilla-mes-header[hidden] + .grilla-rango { display: none }`).

## Actualización

Igual que antes: al navegar (botones, meses, fecha, rueda/flechas/arrastre cuando corren la fecha) y al
cambiar 7/14/30, porque se escribe en cada `renderGrilla`.

**Ojo con una diferencia que ahora queda a la vista** (ya existía, no la cambié porque la regla es no
tocar el cálculo): el **mes** se calcula con las columnas *visibles* y cambia al scrollear; el **rango**
son los días *dibujados* y no cambia al scrollear en px. Ejemplo en iPhone, 14 días desde el 20/10: se
ven 6 columnas → mes `Octubre 2026`, rango `20/10 — 02/11`. Si se prefiere que el rango también muestre
solo lo visible, es un cambio chico en `actualizarGrillaMesHeader` (pero toca el cálculo: queda para
que Leonardo decida).

## Reglas duras

- Navegación y cálculo del rango: sin tocar (cero líneas de JS en el diff).
- `security/` y `firebase.json`: sin tocar.

## Verificación

- `node --check` del módulo: OK.
- Nueve suites: contabilidad 40, fmt 17, grilla 164 (3 tests actualizados a la nueva ubicación + 3
  nuevos: rango fuera de la nav y bajo el mes, se oculta con el mes, `renderGrilla` lo escribe igual),
  grupos 33, modal 33, precios 49, today 4, total 25, voucher 47 → **412 passed, 0 failed**.
- App real en Chromium headless (desktop 1440 e iPhone 390): rango debajo del mes; renglón 2 solo con
  meses; página sin ensancharse; se actualiza al navegar (+7 días) y al cambiar a 30 días; se oculta
  fuera de la grilla. 11/12 OK; el que falló fue una expectativa mal puesta del propio chequeo (esperaba
  `Oct — Nov` en iPhone, donde solo se ve octubre: es la diferencia mes-visible / rango-dibujado de arriba).
- Nota: este branch sale de `main`, que **no** incluye `feat/grilla-drag` (no mergeado). No se pisan:
  `feat/grilla-drag` no toca la topbar ni la nav.

## Pendiente de Leonardo

- Prueba visual en desktop e iPhone.
- Decidir si el rango debería seguir lo visible al scrollear (hoy: días dibujados).
