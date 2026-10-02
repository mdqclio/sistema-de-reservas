# Contador de noches: arriba y grande

Branch: `fix/noches-visible` (desde `main` @ 91c617d). **NO mergeado**: Leonardo verifica primero.

## Problema

Franco no veía el contador: 11px, debajo de Fecha Salida. Lo quiere arriba, al lado del
selector de cabaña, con el número bien visible.

## Cambio (`index.html`)

- **Ubicación:** `#res-noches` salió del form-group de Fecha Salida y pasó a la fila del
  selector de cabaña (`.form-row`, 2 columnas), como segunda celda: queda a la derecha
  del select. Esa celda estaba vacía (el otro hijo, `#res-cabaña`, es `display:none`).
- **Formato:** `<span class="rn-num">N</span><span class="rn-txt">noches</span>`.
  - Número: 24px, bold, `--text`.
  - Palabra: 14px (tamaño normal), `--text2`.
  - Alineado al pie de la celda (`align-self: end`) para quedar a la altura del select.
  - `aria-live="polite"` para lectores de pantalla.
- **Error** (salida <= entrada): mismo aviso de siempre, en rojo (`var(--red)`), 13px
  semibold (clase `rn-error`). Es una frase larga; con `min-width: 0` hace wrap dentro de
  su celda y no ensancha la fila.
- **Mobile (≤768px):** `.form-row` ya pasa a 1 columna → el contador cae debajo del select,
  con el mismo tamaño grande. Se le sacó el `min-height` y se acercó un poco al select
  (`margin-top: -6px`) para que no quede un hueco.
- **Recalculo:** sin cambios. `renderNochesModal()` se sigue llamando en `onEntradaChange`,
  en el `onchange` de la salida y en los 3 lugares que abren el modal. Sigue en `window`.

`renderNochesModal` solo cambió en cómo pinta: toma el texto que devuelve
`textoNochesModal` y, si es "N noche(s)", lo parte en número + palabra; si no (vacío o
aviso), lo pone como texto plano. **`textoNochesModal` no se tocó**, ni la validación de
fechas, ni precios, ni `security/` / `firebase.json`.

## Verificación

- `node --check` sobre el módulo de `index.html`: OK.
- 9 suites: precios 43, today 4, contabilidad 40, fmt 17, grilla 38, total 25, grupos 33,
  voucher 34, modal 33 → **267 passed, 0 failed**.
- `tests/modal.test.mjs` (+6): render número + palabra (plural y singular), sin rojo en
  estado normal, aviso en rojo con clase `rn-error`, vacío sin salida, `#res-noches` está en
  la fila del selector de cabaña a la derecha del select, ya no está bajo la salida, y hay
  uno solo.
- grep de `window`: `renderNochesModal` sigue registrada; no hay funciones nuevas.
- **No verificado en navegador** (la app pide login de Firebase). La parte visual — tamaño,
  alineación con el select, cómo cae en mobile — queda para la revisión de Leonardo.
