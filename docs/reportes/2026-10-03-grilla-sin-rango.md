# Grilla: se elimina el rango de días del título

Branch: `fix/grilla-sin-rango`. **No mergeado**: Leonardo verifica primero.

## Paso previo: merges a main

El pedido indicaba partir de `main` "después de mergear `feat/grilla-drag` y `fix/grilla-rango-titulo`".
Ninguno de los dos estaba en `origin/main` (último: 2092080), así que los mergeé en ese orden
(`--no-ff`), corriendo las nueve suites después de cada uno, y pusheé:

| Merge | Suites |
|---|---|
| `feat/grilla-drag` | 425 passed, 0 failed |
| `fix/grilla-rango-titulo` (auto-merge sin conflictos en `index.html` y `grilla.test.mjs`) | 428 passed, 0 failed |

`origin/main` quedó en `ec08bfb81736f5ddba3245a74eb777fef11dc8c1`; este branch sale de ahí.

## Por qué

El mes (`grillaMesLabel` / `actualizarGrillaMesHeader`) sigue las columnas **visibles** y cambia al
scrollear; el rango mostraba los días **dibujados** y no cambiaba. Con 30 días y scroll no coincidían
(ej.: mes `Oct — Nov 2026` con rango `05/10 — 03/11`, o en iPhone `Octubre 2026` con `20/10 — 02/11`).

## Qué se sacó

- **HTML:** `<span id="grillaRangoLabel">` del encabezado y el wrapper `.grilla-titulo-centro`, que solo
  existía para apilar mes + rango. `#grillaMesHeader` vuelve a ser hijo directo de la topbar, como antes
  del cambio anterior.
- **CSS:** `.grilla-rango` (base y variante del título), `.grilla-titulo-centro` y la regla que ocultaba
  el rango junto con el mes. `.grilla-mes-header` recupera `flex: 1` (centrado entre el título y la
  fecha) y en mobile el `margin-left: 36px`, como estaba.
- **JS:** en `renderGrilla`, el bloque "Label de rango" que escribía `#grillaRangoLabel`. **Se conservó
  `fmt`** (dd/mm), que también se usa en el tooltip de las barras de reserva (`fmt(res.entrada)` →
  `fmt(res.salida)`).
- No había otra función que calculara ese rango: era una línea dentro de `renderGrilla`.
  (`grillaRangoDesdeClicks` es la selección de entrada/salida por dos clicks; no tiene relación y queda.)

Diff: `index.html` +4/−16, `tests/grilla.test.mjs` +3/−4.

## Qué queda igual

- Cálculo del mes visible (`grillaMesLabel`, `actualizarGrillaMesHeader`, listeners de scroll/resize):
  **sin tocar**, ninguna línea en el diff.
- Segundo renglón de navegación: solo los 12 meses (ya estaba así).
- `security/` y `firebase.json`: sin tocar.

## Tests

- Sacados: los 3 tests de `fix/grilla-rango-titulo` que fijaban el rango bajo el mes, su ocultamiento
  por CSS y su escritura en `renderGrilla`.
- Ajustado: el test del header ahora exige `#grillaMesHeader` como hijo directo de la topbar, seguido de
  `.topbar-right`.
- Nuevos: el rango no existe más (ni id, ni clases, ni la escritura en `renderGrilla`), y `fmt` sigue
  disponible para el tooltip de las barras.

## Verificación

- `node --check` del módulo: OK.
- Nueve suites: contabilidad 40, fmt 17, grilla 179, grupos 33, modal 33, precios 49, today 4, total 25,
  voucher 47 → **427 passed, 0 failed**.
- App real en Chromium headless (1280px y 390px, 30 días): la topbar muestra solo
  `Dashboard · Octubre 2026 · <fecha>`, sin rango; al scrollear al final el mes pasa a `Oct — Nov 2026`;
  página sin ensancharse.

## Pendiente de Leonardo

- Prueba visual en desktop e iPhone.
