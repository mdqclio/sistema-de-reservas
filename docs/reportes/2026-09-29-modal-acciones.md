# Accesos de la reserva dentro del modal — 2026-09-29

Branch: `feat/modal-acciones` (desde `main` 8a7fb84).
Archivos: `index.html`, `tests/modal.test.mjs` (nuevo), `.github/workflows/tests.yml`.

> ⚠️ **Prueba visual en iPhone PENDIENTE DE LEONARDO**: layout de los botones en pantalla chica,
> "Guardar y enviar comprobante" abriendo WhatsApp, y cobrar desde el modal. No se corrió navegador
> en esta sesión (el Chromium local no arranca).
>
> Recordatorio: `main` = producción (GitHub Pages). Mergear este branch lo publica.

## 1 — Dos botones al guardar

Footer del modal de reserva: **Cancelar · Guardar y enviar comprobante · Guardar Reserva/Guardar cambios**.

- "Guardar" sigue siendo `saveReserva()` sin cambios.
- "Guardar y enviar comprobante" → `guardarYEnviarVoucher()`:
  1. `await saveReserva()` (la misma función, mismas validaciones y mensajes de error).
  2. **Solo si el guardado fue exitoso**, `enviarVoucher(reg.id)` con la reserva ya creada/actualizada.
  3. Si el guardado falla (campos, fechas, conflicto, grupo, total pactado) no se envía nada; el error
     se muestra como hoy.
- Único cambio en `saveReserva`: al final, `return reg;` (antes no devolvía nada). Los returns de
  error siguen devolviendo `undefined`. No se tocó guardado, validación, precios ni disponibilidad.
- Visibilidad (misma condición que 📄 en el listado, `canCheckin || canCheckout`):
  - Reserva nueva: visible (el form solo permite Confirmada / Check-in, las dos admiten comprobante).
  - Reserva existente: visible si está `confirmada` o `checkin`; oculto en checkout/cancelada.

## 2 — Accesos en el modal de una reserva existente

Al abrir una reserva guardada (grilla o listado → `editReserva`), bajo el título aparece un bloque con
los mismos accesos de la fila, **con las mismas condiciones**:

| Acceso | Condición (igual al listado) | Llama a |
|---|---|---|
| 📄 Enviar comprobante | `canCheckin \|\| canCheckout` | `enviarVoucher(id)` |
| 💰 Cobrar | `(canCheckin \|\| canCheckout) && saldo > 0` | `closeModal('modalReserva'); openPago(id)` |
| 🔗 Link de pre check-in | `canCheckin` | `generarLinkPrecheckin(id)` |

- Sin lógica duplicada: se llaman las funciones existentes.
- **Modal sobre modal**: "Cobrar" cierra el de reserva antes de abrir el de pago (mismo patrón que la
  vista de grupo). No quedan dos overlays abiertos.
- Nota en el bloque: "Usan los datos ya guardados de la reserva" (si se editó algo y no se guardó,
  el comprobante sale con lo guardado; para eso está "Guardar y enviar").
- Reserva nueva: el bloque no se muestra (todavía no existe).
- El **listado no cambió**: sus botones siguen igual.

## iPhone: WhatsApp y el bloqueo de ventanas emergentes

Safari (iPhone) bloquea `window.open` si no ocurre dentro del click: después de un `await` (escritura
del token, guardado) se pierde el gesto. `enviarVoucher` ya hacía `window.open` después de
`await asegurarTokenReserva(...)` → **probablemente ya fallaba en iPhone desde el listado**.
Ahora:
- `enviarVoucher(rid, win)` abre la pestaña **antes** de esperar (si el huésped tiene teléfono) y al
  final le pone la URL de `wa.me`. Si no hay teléfono, no abre nada y copia el link como antes.
- `guardarYEnviarVoucher` abre la pestaña en el click (si el teléfono que va a quedar en la reserva
  no está vacío: `hn-tel` para huésped nuevo, o el del existente elegido), guarda, y se la pasa a
  `enviarVoucher`. Si el guardado falla, la cierra.
- Si falla la generación del token, la pestaña se cierra y se avisa.
- Efecto posible en iPhone: se ve un instante una pestaña en blanco antes de saltar a WhatsApp.
  Esto hay que verlo en el teléfono.

## Mobile

- Footer con `flex-wrap`; en ≤480px cada botón ocupa el ancho completo (uno por renglón).
- Bloque de accesos con `flex-wrap`; en ≤480px dos botones por renglón.

## Reglas duras

- Guardado / validación / precios / disponibilidad: sin cambios (solo `return reg` al final de `saveReserva`).
- Listado: sin cambios.
- `security/` y `firebase.json`: sin cambios.
- `window`: `guardarYEnviarVoucher` (nueva, onclick) registrada. Las demás del onclick
  (`enviarVoucher`, `openPago`, `generarLinkPrecheckin`, `closeModal`) ya estaban. Helpers
  `renderAccionesModalReserva` y `telHuespedModalReserva` no se llaman desde HTML.

## Verificación

| Chequeo | Resultado |
|---|---|
| `node --check` del `<script type="module">` de `index.html` | OK |
| precios / today / contabilidad / fmt | 33 / 4 / 40 / 17 passed, 0 failed |
| grilla / total / grupos / voucher | 27 / 25 / 33 / 34 passed, 0 failed |
| `tests/modal.test.mjs` (nuevo, agregado al CI) | 14 passed, 0 failed |
| grep `Object.assign(window)` | `guardarYEnviarVoucher`, `enviarVoucher`, `openPago`, `generarLinkPrecheckin`, `closeModal` presentes |

`tests/modal.test.mjs` (funciones reales, `saveReserva` y Firebase mockeados): guardado fallido → no
hay token ni WhatsApp y la pestaña se cierra; guardado ok → orden guardar → token de **esa** reserva →
WhatsApp auditado, con una sola pestaña abierta en el click; sin teléfono → copia link sin abrir
pestaña; `enviarVoucher` abre la pestaña antes del await; visibilidad para nueva / confirmada con y
sin saldo / check-in / checkout / cancelada; cobrar cierra el modal de reserva antes del de pago.
