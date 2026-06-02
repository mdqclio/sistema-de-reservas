# Arquitectura — Sistema de Reservas (Cabañas Puerto Delfín)

> Documento generado leyendo `index.html` (estado al 2026-06-02). Refleja el código actual.

## Stack

- **App admin:** un único archivo `index.html` (~5900 líneas), vanilla JS (ES modules), sin build.
- **Backend:** Firebase **Realtime Database (RTDB)**, SDK modular `firebase-database@12.10.0`.
- **Auth:** Firebase Auth (`firebase-auth`), persistencia local (`browserLocalPersistence`) + `onAuthStateChanged` para auto-login al refrescar.
- **NO se usa Firebase Storage** (ver "Fotos de DNI") **ni Firestore** desde `index.html`.

Toda la data del admin cuelga del nodo raíz **`cabanas/`** en RTDB.

## Modelo de datos — escritura por hijo (concurrencia)

Las 4 colecciones de alta concurrencia son **objeto indexado por id**, NO arrays, y se escriben
**por hijo** (nunca el nodo entero), para que dos usuarios simultáneos no se pisen registros.

| Colección    | Ruta                          | Clave                         | Helpers                                    |
|--------------|-------------------------------|-------------------------------|--------------------------------------------|
| reservas     | `cabanas/reservas/{id}`       | push-key (`nuevaReservaId`)   | `writeReserva` / `removeReserva` / `getReservas` |
| huespedes    | `cabanas/huespedes/{id}`      | push-key (`nuevoHuespedId`)   | `writeHuesped` / `removeHuesped` / `getHuespedes` |
| movimientos  | `cabanas/movimientos/{id}`    | push-key (`nuevoMovimientoId`)| `writeMovimiento` / `removeMovimiento` / `getMovimientos` |
| beds         | `cabanas/beds/{cabId}`        | id de cabaña (ej. `"1-1"`)    | `writeBed` / `removeBed` / `getBeds`       |

- **Escritura:** `set(ref(db,'cabanas/{coleccion}/{id}'), reg)` o `remove(...)`. Nunca
  `set` del nodo completo de estas colecciones.
- **Lectura:** `getReservas/getHuespedes/getMovimientos` → `Object.values(cache.X || {})`
  (devuelven array para que `.filter/.map/.sort` sigan funcionando). `getBeds` → `cache.beds || {}`.
- **IDs push-key** para reservas/huespedes/movimientos (orden cronológico, sin colisiones).
  `beds` se indexa por la cabaña (string tipo `"1-1"`); su valor puede ser string
  (`'free'`/`'dirty'`/`'maintenance'`) u objeto `{estado}` — ambos formatos se preservan.

### Sync en vivo — 4 listeners `onValue`

`attachReservasLive` / `attachHuespedesLive` / `attachMovimientosLive` / `attachBedsLive`
escuchan `cabanas/{coleccion}` y, en cada cambio remoto:
1. reconstruyen `cache.{coleccion}` desde el snapshot,
2. respetan escrituras locales en vuelo (`pendingX` / `pendingXDel`) para no pisar lo que se
   está guardando,
3. re-renderizan solo las vistas activas (`rerenderReservasViews`, etc.).

### `loadAllData` (arranque)

- Lee `cabanas/` una sola vez.
- **Siembra** el cache de `reservas/huespedes/movimientos/beds` la primera vez (normalizando
  array→objeto si hiciera falta) y **no vuelve a pisar** esos 4 nodos: a partir de ahí los
  gobierna `onValue`.
- El resto de los nodos (config) se copian al cache salvo los que tengan escritura pendiente.
- Llama a `initReservasLive/initHuespedesLive/initMovimientosLive/initBedsLive` (cada uno
  engancha su listener una vez por sesión).

### Migración legacy (array → objeto)

`migrateNodeToIndexed(coleccion)` para `reservas/huespedes/movimientos` (beds nunca fue array):
- **Idempotente y gobernada por flag persistente** `cabanas/_migrado/{coleccion}`: si el flag
  está puesto, no toca el nodo.
- Convierte datos viejos con **`update()` (merge)**: re-escribe cada registro con su id como
  clave y borra solo la clave numérica vieja. **Nunca** hace `set` del nodo entero (eso pisaría
  escrituras concurrentes y borraría registros — era el bug original).

### Nodos NO migrados (config) — se siguen escribiendo enteros con `DB.set`

`precios`, `roles`, `usuarios`, `knowledge_base`, `bot_config`, `auditoria`, `recurrentes`,
`proveedores`, `categorias`, `tipo_cambio_historial`, `init_cabanas`. Usan el helper `DB.set(k,v)`
→ `set(ref(db,'cabanas/'+k), v)`. Sus IDs internos aún se generan con `Date.now()` (ver TAREAS:
"IDs robustos" pendiente).

## Fotos de DNI — RTDB lazy (NO Storage)

> **Decisión:** Firebase Storage se **descartó**: requiere plan Blaze (pago, desde feb-2026).

- Las fotos van a un nodo **top-level** `fotos_huespedes/{id}` — **fuera de `cabanas/`** — para
  que `loadAllData` y el `onValue` de huéspedes **no las bajen** (son pesadas).
- Se guardan como **dataURL comprimido** (`compressImageToDataUrl`, ~1000px de ancho, JPEG 0.7).
- **Carga lazy:** se leen solo al abrir la ficha del huésped (`getFoto(id)`), que rellena un
  `<img>` oculto.
- El registro del huésped lleva **`tieneFoto: true|false`** en vez del base64.
- **Retrocompat:** si un huésped viejo tiene `foto` (base64) embebido en su registro, se sigue
  mostrando directo.
- Helpers: `writeFoto(id, dataUrl)` / `getFoto(id)` / `removeFoto(id)`. `deleteHuesped` borra
  también la foto (`removeFoto`).
- **Pendiente:** regla de seguridad fina para `fotos_huespedes` (ver TAREAS / reglas).

## Seguridad

- **XSS:** `escapeHtml(t)` aplica el escape estándar de 5 chars (`& < > " '`, seguro también
  dentro de atributos) y se usa en **todos** los datos de usuario interpolados en los renders
  (huéspedes, reservas, leads, roles, quick replies, concepto de movimientos, inputs de config).
  Los `onclick` ya **no** reciben strings de usuario: pasan solo el `id` y la función resuelve el
  nombre adentro (`confirmDelete`). Ver `CHATBOT.md` para el chat.
- **Borrado protegido:** no se puede borrar un huésped con reservas asociadas
  (`deleteHuesped`/`confirmDelete` abortan con aviso).
- **Pendiente:** reglas de seguridad de RTDB (hoy en modo test). Ver TAREAS.

## Firestore desconectado (legacy)

`index.html` **no** usa Firestore. Existe un Firestore aparte (base vieja, **desconectada** del
admin RTDB) que conserva datos reales:
- **`chat_logs`** — colección en Firestore con mensajes reales del bot (NO existe nodo `chat_logs`
  en RTDB).
- Los **formularios públicos** `checkin.html` y `guest-register.html` todavía escriben/leen ese
  Firestore (colecciones `reservations` y `guests`), no el RTDB del admin.
- **Pendiente:** migrar los forms públicos fuera de Firestore. Ver TAREAS.
