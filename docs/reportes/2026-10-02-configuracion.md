# Configuración: config de cabañas + horarios; Precios solo con tarifas

Branch: `feat/configuracion` (desde `main` @ 09c401a). **NO mergeado**: Leonardo verifica primero.

Idea: separar lo que casi no cambia (Configuración) de lo que cambia por temporada (Precios).

## 1 — Renombre

- Nav: `🏡 Datos del Complejo` → `⚙️ Configuración`.
- Título de sección (`sectionTitles.botconfig`) → "Configuración".
- **`MODULE_LABELS` no tiene entrada para esta sección** (ni antes ni ahora). Es la lista de
  módulos con permiso r/rw/n de la pantalla Roles y Permisos; esta sección no tiene permiso
  por módulo, es `.admin-only`. Agregarla crearía un permiso que no se aplica en ningún lado,
  así que no la agregué. Si se quiere que aparezca en Roles, hay que implementar el gate.
- El id interno **sigue siendo `botconfig`** (`#nav-botconfig`, `#section-botconfig`,
  `showSection('botconfig')`). No hubo que actualizar referencias.

## 2 — Config de cabañas: de Precios a Configuración

- Se movieron `TIPOS_CABANA`, `normalizarHabConfig`, `updateHabConfig` y la tabla
  Tipo / m² / Pax. La tabla ahora la pinta `renderConfigCabanas()` (nueva, interna; la llama
  `renderBotConfig` al abrir la sección y `updateHabConfig` si el valor es inválido).
- **Sigue escribiendo en `precios.habitaciones`**, mismo patrón (`DB.get('precios')` →
  fila → `DB.set('precios')`). El nodo no cambió. El auditLog ahora dice "Configuración".
- **Precios → Por Cabaña** queda con precio_base, precio_alta y precio_baja. **Moneda por
  cabaña no se editaba en esa tabla** (ni antes ni ahora): no la agregué porque el pedido
  era no mover nada de precios, no sumar campos. Si hace falta editarla, es un cambio aparte.
- Texto de Precios: "Precio por noche… Tipo, m² y capacidad se editan en Configuración."

## 3 — Horarios

Sin cambios funcionales: check-in/out en la misma pantalla, guardan con `update()` (merge) en
`bot_config.checkin` / `bot_config.checkout`. Solo cambió el texto del aviso y del auditLog.

## 4 — Campos del chatbot

Ya estaban fuera del formulario desde `feat/datos-complejo` (merge 09c401a), y
`saveBotConfig` ya guarda con merge (`update`), nunca reemplaza el objeto. Lo verifican los
tests de voucher (el cache conserva `nombre_hostel`, `servicios`, `quick_replies`).
`buildSystemPrompt` y el resto del chat: intactos.

**Texto del chatbot (~1002)**: era el párrafo "Esta información se inyecta automáticamente
en cada conversación del chatbot…". Está en la sección **Base de Conocimiento** (no en
Configuración). En el pedido anterior era condicional ("si quedó en esa sección") y no lo
toqué; esta vez el pedido es explícito, así que **lo saqué**. El resto de Base de
Conocimiento queda igual.

## 5 — Permisos: OJO, sí cambia quién puede editar la config de cabañas

- Configuración sigue siendo `.admin-only`, igual que hoy. Admin = rolKey `admin` o
  `permisos.roles === 'rw'` (`applyRoleUI`).
- **Precios NO es admin-only**: el nav se muestra a todos los roles, y la UI no aplica el
  permiso `precios` (Recepción y Ventas lo tienen en `'r'`, pero igual pueden editar).
  Las reglas RTDB dejan escribir a cualquier usuario staff autenticado.
- Consecuencia: **antes**, cualquier rol con sesión (Recepción, Ventas, Limpieza) podía
  editar tipo/m²/capacidad desde Precios → Por Cabaña, aunque solo como efecto de que la UI
  no aplica el `'r'`. **Ahora**, solo admin.
- Según el modelo de permisos esto es lo correcto (`precios:'r'` = solo lectura), pero en
  la práctica **a esos roles se les quita una edición que podían hacer**. Si Franco o
  Mariana no tienen rol admin, ya no van a poder corregir cabañas (ej. la 7 y la 8).
  Hay que confirmar sus roles antes de mergear.
- Si hace falta que un no-admin la edite, las opciones son: darle `roles:'rw'` al rol (lo
  hace admin para todo), o un gate propio para la tabla de cabañas (por ej. con
  `permisos.precios === 'rw'`). Ninguna implementada: es una decisión de producto.

## Reglas duras

- Cascada de precios, disponibilidad y facturación: sin cambios (los únicos cambios en
  `renderPrecios` son quitar 3 columnas y el texto de la tab Por Cabaña).
- `security/` y `firebase.json`: sin cambios. No se borra nada de Firebase.
- No hay funciones nuevas en onclick/onchange: `updateHabConfig` y `saveBotConfig` ya estaban
  en `window`. `renderConfigCabanas` es interna.

## Verificación

- `node --check` sobre el módulo de `index.html`: OK.
- 9 suites: precios 49 (+6), today 4, contabilidad 40, fmt 17, grilla 50, total 25,
  grupos 33, voucher 47 (+3), modal 33 → **298 passed, 0 failed**.
- Los tests de validación de config de cabañas siguen pasando sin cambios. Nuevos:
  `updateHabConfig` sigue escribiendo en `precios`, si el valor es inválido re-renderiza
  Configuración y no Precios, la tabla de Configuración edita tipo/m²/capacidad,
  `renderBotConfig` la pinta, Precios ya no la tiene y sigue editando base/alta/baja, nav
  "⚙️ Configuración" admin-only, la sección tiene cabañas + horarios, y no queda el texto
  de inyección en el chatbot.
- **No verificado en navegador** (requiere login).
