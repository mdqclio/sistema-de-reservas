# "Datos del Complejo" + la app abre en la Grilla

Branch: `feat/datos-complejo` (desde `main` @ db137ee). **NO mergeado**: Leonardo verifica primero.

## 1 — "Config. del Bot" → "Datos del Complejo"

**Renombre**
- Nav: `⚙️ Config. del Bot` → `🏡 Datos del Complejo` (el ícono era ⚙️, no 🤖).
- Título de sección (`sectionTitles.botconfig`): "Configuración del Bot" → "Datos del Complejo".
- **`MODULE_LABELS` no tiene entrada de botconfig**: es la lista de módulos de la pantalla
  Roles y Permisos (dashboard, mapa, reservas, …) y la sección es solo admin (`.admin-only`),
  sin permiso por módulo. No agregué una entrada nueva para no crear un permiso que hoy no existe.
- La clave interna sigue siendo `botconfig` (`#nav-botconfig`, `#section-botconfig`,
  `showSection('botconfig')`), y el nodo sigue siendo `bot_config`. Solo cambió lo visible.

**Formulario**
- Quedan: **Check-in (desde)** y **Check-out (hasta)**. Card "🏡 Horarios" con la aclaración
  "Los ve el huésped en el comprobante de la reserva".
- Salieron del form: nombre del hostel, ubicación, descripción de cabañas, servicios,
  información adicional y la card entera de respuestas rápidas (`quick_replies`).
- Textos del chatbot quitados de la sección: "Usada por el asistente virtual" y "(aparece en
  el prompt del bot)". El comentario del nav que mencionaba "datos de transferencia" (ya no
  existen desde fix/franco-oct) también se actualizó.
- El texto de ~línea 1002 que habla del chatbot ("Esta información se inyecta automáticamente
  en cada conversación del chatbot…") **está en la sección Base de Conocimiento, no en esta**.
  No lo toqué.

**Guardado: merge, no reemplazo**
- Antes: `saveBotConfig` hacía `DB.set('bot_config', objetoEntero)` (set del nodo completo).
  Con el form recortado habría fallado al leer los inputs que ya no existen.
- Ahora: `update(ref(db, 'cabanas/bot_config'), { checkin, checkout })`. Firebase hace merge:
  `nombre_hostel`, `ubicacion`, `servicios`, `quick_replies`, etc. quedan **intactos**.
  El cache local se actualiza con el mismo merge. `pendingWrites` igual que `DB.set`.
- `datosComplejoPatch(checkin, checkout)` (nueva, pura): arma el patch; si falta algún
  horario devuelve null → aviso de error, no se escribe nada (el voucher usaría el default
  15:00/10:00 con un vacío, y es mejor no guardar un horario en blanco).
- `renderBotConfig` ahora solo carga los dos horarios.

**Sin tocar**: `buildSystemPrompt` y el resto del chat. Quedan `saveQuickReplies`,
`addQuickReply`, `removeQuickReply` y `renderQuickRepliesList` en el código (y en `window`) sin
uso desde la UI. `saveQuickReplies` sigue haciendo `DB.set` del nodo entero, pero ya no hay
botón que la llame. Si en algún momento se vuelve a usar, habría que pasarla a `update()`.
No se borra nada de Firebase.

## 2 — La app abre en la Grilla

- Login (`enterSession`): `showSection('dashboard')` → `showSection(seccionInicial(rolKey, rol))`.
- HTML inicial: `active` pasó de `#nav-dashboard` a `#nav-grilla`, y de `#section-dashboard`
  a `#section-grilla`.
- El Dashboard sigue en el menú, igual que antes.

**Permisos: cómo lo resolví** (`seccionInicial`, pura)
- No existe un permiso de módulo "grilla". La grilla muestra reservas, así que uso el
  permiso **`reservas`**.
- Admin (rolKey admin o `permisos.roles === 'rw'`, mismo criterio que `applyRoleUI`) → grilla.
- Rol sin objeto de permisos, o sin la clave del módulo → se considera con acceso (mismo
  criterio que el menú, que hoy no oculta ítems por permiso de módulo).
- Si `reservas` es `'n'`: primera sección del menú cuyo módulo sí pueda ver, en este orden:
  grilla → dashboard → mapa → reservas → checkin → huespedes → precios.
- Si todo está en `'n'` → dashboard (comportamiento anterior; caso teórico).
- Con los roles sembrados: Administración, Recepción y Ventas → **grilla**.
  Limpieza (`reservas:'n'`, `dashboard:'n'`, `mapa:'rw'`) → **Mapa de Cabañas**. Antes
  Limpieza abría en el Dashboard aunque lo tenía en `'n'`.
- Ojo, preexistente y fuera de alcance: el menú no oculta ítems según permisos de módulo
  (solo `.admin-only`). Limpieza puede seguir clickeando "Grilla" en el menú.

## Verificación

- `node --check` sobre el módulo de `index.html`: OK.
- 9 suites: precios 43, today 4, contabilidad 40, fmt 17, grilla 50 (+12), total 25,
  grupos 33, voucher 44 (+10), modal 33 → **289 passed, 0 failed**.
- Tests nuevos:
  - voucher: patch solo con horarios, horario vacío → no escribe; `saveBotConfig` usa
    `update()` en `cabanas/bot_config` y el cache conserva `nombre_hostel`/`servicios`/
    `quick_replies`; no hay `set()` del nodo; el form no tiene los campos del chatbot; nav y
    título renombrados; `buildSystemPrompt` sigue existiendo.
  - grilla: `seccionInicial` para admin, recepción, ventas, limpieza (→ mapa), rol legacy,
    sin permisos, todo en `'n'`; el login usa `seccionInicial`; `nav-grilla` y
    `section-grilla` arrancan `active`.
- grep de `window`: no hay funciones nuevas llamadas desde onclick (`saveBotConfig` y
  `renderBotConfig` ya estaban registradas). `seccionInicial` y `datosComplejoPatch` son internas.
- `security/` y `firebase.json`: sin cambios. Ningún `remove()` ni `set()` nuevo sobre Firebase.
- **No verificado en navegador** (requiere login). Para probar: entrar como admin → abre en
  Grilla; Datos del Complejo → cambiar un horario → Guardar → en la consola de Firebase
  `cabanas/bot_config` conserva `nombre_hostel`, `servicios`, `quick_replies`.
