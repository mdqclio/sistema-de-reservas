# Contador de noches en el modal de reserva

Branch: `feat/noches-modal` (desde `main` @ 47f4e0d).

## Pedido (Franco)

Mostrar "N noches" junto a la fecha de salida al cargar una reserva, como control visual.
Útil ahora que en la grilla el 2º click es la fecha de salida.

## Cambio (`index.html`)

- Debajo del campo **Fecha Salida** del modal: `<div id="res-noches">`, texto chico (11px, `--text3`).
- `textoNochesModal(entrada, salida)` (pura): usa **`nightsBetween`**, la misma función que
  el motor de precios y la grilla. No se escribió un cálculo nuevo.
  - Falta alguna fecha → no muestra nada.
  - `salida <= entrada` → muestra en rojo **el mismo aviso que ya existe** en `saveReserva`:
    *"La salida debe ser posterior a la entrada (mínimo 1 noche)"*. Nunca un 0 ni un negativo.
  - "1 noche" / "N noches".
- `renderNochesModal()` pinta el texto. Se llama:
  - en `onEntradaChange` (al final, después de que ajusta `min`/salida);
  - en el `onchange` de la salida (agregado al final de la cadena existente);
  - en los 3 lugares que abren el modal con fechas precargadas: nueva reserva, editar
    reserva y carga desde la grilla (antes de `openModal`).
- `renderNochesModal` registrada en `window` (se llama desde `onchange`).
  `textoNochesModal` no se usa desde HTML.

Nota: `onEntradaChange` ya fuerza la salida a entrada+1 si queda <= entrada, así que el aviso
rojo aparece en la práctica cuando se cambia la **salida** a una fecha <= entrada.

**No se tocó**: la validación de fechas de `saveReserva`, `onEntradaChange` (solo se agregó la
llamada al final), `calcTotalReserva` ni el motor de precios. Tampoco `security/` ni `firebase.json`.

## Verificación

- `node --check` sobre el módulo de `index.html`: OK.
- 9 suites: precios 43, today 4, contabilidad 40, fmt 17, grilla 38, total 25, grupos 33,
  voucher 34, modal 27 (+13 nuevos) → **261 passed, 0 failed**.
- Tests nuevos (`tests/modal.test.mjs`): singular/plural, cruce de mes, fechas faltantes,
  salida = entrada y salida < entrada → aviso (mismo texto que `saveReserva`, verificado
  contra el código), usa `nightsBetween`, render con DOM mock (texto y color rojo), y que
  `onEntradaChange` y el `onchange` de la salida llaman a `renderNochesModal`.
- grep de `window`: `renderNochesModal` registrada.
