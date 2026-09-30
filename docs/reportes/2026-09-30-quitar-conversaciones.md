# Quitar Conversaciones (inbox omnicanal) — 2026-09-30

Branch: `fix/quitar-conversaciones` (desde `main` e655848). Archivo: `index.html` (−232 / +2).

> Recordatorio: `main` = producción (GitHub Pages). Mergear este branch lo publica.

Decisión: el inbox no se usa; el bot web vive en otro proyecto Firebase (botcontrol-base) con su
propio panel. Se elimina del sistema.

## Qué se borró de `index.html`

| Qué | Dónde estaba |
|---|---|
| CSS del inbox: `.conv-layout`, `.conv-list-pane`, `.conv-item`, `.conv-item:hover`, `.conv-item-active`, `.conv-badge`, `.conv-thread-pane`, `.conv-header`, `.conv-chip`, `.conv-msgs`, `.conv-bubble` (+ `.de-contacto`/`.de-saliente`), `.conv-msg-autor`, `.conv-msg-hora`, `.conv-input-box` (+ `textarea`) | ~391–408. Todas exclusivas del inbox (grep: ninguna otra sección usa `conv-`). |
| Nav-item `#nav-conversaciones` | ~642 |
| Sección `#section-conversaciones` (lista, hilo, input) | ~1042–1059 |
| `colConversaciones` (live collection) y su comentario | ~2494–2496 |
| `conversaciones:'Conversaciones'` en `sectionTitles` | ~2808 (el pedido decía `MODULE_LABELS`: esa constante **no** tenía conversaciones; la entrada estaba en `sectionTitles`) |
| Branch `if (s === 'conversaciones') …` de `showSection` | ~2833 |
| Bloque JS "CONVERSACIONES (INBOX OMNICANAL)": `convActiva`, `convHiloUnsub`, `CANAL_ICON`, `convId`, `renderConversaciones`, `abrirConversacion` (y su `onValue` sobre `/cabanas/mensajes/{id}`), render de header e hilo, `togglePausaBot`, `enviarMensajeConv`, `convInputKey`, `seedConversacionesDemo` y `window.seedConversacionesDemo` | ~7815–7999 (186 líneas) |
| En `Object.assign(window)`: `renderConversaciones, abrirConversacion, togglePausaBot, enviarMensajeConv, convInputKey` | ~8737 |

Además se ajustó un comentario de `ESTADO_RESERVA` que mencionaba "pipeline/mensajes" → "pipeline/pendientes".

## Cuidados

- **`CANAL_ICON`**: solo se usaba dentro del inbox (lista y header). Se borró con el bloque.
- **Pipeline CRM y Lista Negra: sin cambios.** Las únicas líneas borradas que mencionan el pipeline
  son lecturas que hacía el header del inbox (`conv.leadId` → `colPipeline.list()` / `ETAPAS`),
  que se fueron con él. `colPipeline`, `ETAPAS`, `renderPipeline`, `openLeadModal`,
  `renderListaNegra` siguen intactos. El encabezado `// ===== PIPELINE CRM =====` ahora queda
  pegado a `const ETAPAS` (antes el inbox estaba metido en el medio).
- `MODULE_LABELS` (permisos por rol) no tenía el módulo: no cambia nada en Roles.

## Datos en Firebase — PENDIENTE DE LEONARDO

El código ya **no lee ni escribe** `/cabanas/conversaciones` ni `/cabanas/mensajes`. Los nodos
**no se tocaron** (la sesión del CLI está cerrada). Si quedaron datos de prueba (p. ej. los de
`seedConversacionesDemo`), borrarlos a mano desde la consola de Firebase:
- `/cabanas/conversaciones`
- `/cabanas/mensajes`

Nota: mientras existan, `loadAllData()` los sigue bajando dentro de `/cabanas` (lee el nodo entero),
así que conviene borrarlos también por peso de carga.

## Reglas duras

- `security/` y `firebase.json`: sin cambios.

## Verificación

| Chequeo | Resultado |
|---|---|
| `node --check` del `<script type="module">` | OK |
| precios / today / contabilidad / fmt / grilla | 33 / 4 / 40 / 17 / 27 passed, 0 failed |
| total / grupos / voucher / modal | 25 / 33 / 34 / 14 passed, 0 failed |
| grep `Object.assign(window)` | sin funciones del inbox |
| grep final (case-insensitive) `conversacion`, `mensajes`, `CANAL_ICON`, `conv-`, `convId`, `convActiva`, `PausaBot`, `MensajeConv`, `convInputKey` en `index.html` | **0 resultados** |
