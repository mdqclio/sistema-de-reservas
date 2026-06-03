# Arquitectura del Sistema

## Acceso a datos (helper `DB`)

Todos los datos viven bajo `/cabanas/` en Firebase Realtime Database y se acceden
mediante un helper global:

```js
const cache = {};                 // espejo local de /cabanas/
const pendingWrites = new Set();  // claves con escritura pendiente (evita race conditions)

const DB = {
  get: (k, def) => cache[k] ?? def,         // lee del cache
  set: async (k, v) => {                     // escribe cache + Firebase
    cache[k] = v;
    pendingWrites.add(k);
    await set(ref(db, 'cabanas/' + k), v);
    pendingWrites.delete(k);
  }
};
```

- `loadAllData()` baja todo `/cabanas/` de una y lo vuelca al `cache`,
  respetando las claves con escrituras pendientes.
- Las lecturas son `DB.get('nodo', default)`; las escrituras `DB.set('nodo', valor)`.

### Capa de colecciones vivas (concurrencia)

Los **nodos-colección** (listas de registros con `id`) NO usan `DB.set` directo: se
manejan con una factory genérica `makeLiveCollection(nombre, rerender, migrate?)` que
da escritura **por hijo** + sync en vivo, igual que ya hacían reservas/huéspedes/movimientos:

```js
const colRoles = makeLiveCollection('roles', liveRerender('roles', renderRoles));
colRoles.list();        // lectura → siempre array (Object.values del cache)
colRoles.write(reg);    // set(cabanas/roles/{reg.id}) — NO pisa el resto del nodo
colRoles.remove(id);    // remove(cabanas/roles/{id})
colRoles.nuevoId();     // push key de Firebase
```

- Cada colección tiene su `onValue` que mantiene el cache fresco y respeta las
  escrituras locales en vuelo (sets `pending` / `pendingDel`).
- Migración array→objeto indexado: `migrateNodeToIndexed(nodo)` (o una `migrate` custom
  para los que no traían `id`: presupuestos y knowledge_base). Corre **una sola vez**,
  gobernada por el flag persistente `cabanas/_migrado/{nodo}`, usando `update()` (merge);
  nunca hace un `set()` de nodo entero.
- Colecciones gobernadas así: `reservas, huespedes, movimientos, beds` (hechas antes) +
  `pipeline, roles, usuarios, categorias, proveedores, auditoria, cierres, tipo_cambio_historial, recurrentes, presupuestos, knowledge_base`.
- **`precios` y `bot_config` NO**: son objetos de configuración únicos, se escriben
  enteros con `DB.set` (no son colecciones de registros).

## Estructura de datos en Firebase RTDB (`/cabanas/`)

> **Formato de las colecciones:** las listas de registros se guardan como **objeto
> indexado por id** (`nodo/{id} = {...}`), NO como array. La notación `[ {...} ]` de abajo
> es ilustrativa del *registro*; el contenedor real es `{id: registro}`. Se lee como array
> con `col.list()` / `Object.values`. (Aplica a reservas, huespedes, movimientos, pipeline,
> roles, usuarios, categorias, proveedores, auditoria, cierres, tipo_cambio_historial,
> recurrentes, presupuestos, knowledge_base.)

```
/cabanas/
  init_cabanas: true            ← flag de inicialización (no borrar)
  config_groq_key: "gsk_..."    ← API key de Groq (chat desactivado por ahora)

  precios: {                    ← configuración de precios y catálogo de cabañas
    temporadas:        [{ id, nombre, fecha_inicio, fecha_fin, tipo, anual }]
    fines_semana_largos: [...]
    promociones:       [...]
    habitaciones:      [{ hab, nombre, capacidad, precio_base, precio_alta, precio_baja, moneda }]
    plataformas:       [{ plat, descuento, comision }]   // directo 0% / booking 15% / airbnb 12%
  }

  reservas: [ { id, huespedId, guestName, hab, cabaña, entrada, salida,
                precio, total, pagado, estado, plataforma, notas,
                checkinToken, guestDniPhoto,
                guestScore, guestScoreAvg, guestScoreComment } ]

  huespedes: [ { id, nombre, apellido, dni, nac, ciudad, tel, email, foto, estadias } ]

  beds: {                       ← estado del mapa (antes 'bedStates')
    "1": "free|dirty|maintenance|occupied"   // 1 unidad por cabaña; valor string u objeto {estado}
    "2": ...
  }

  pipeline: [ { id, nombre, etapa, ... } ]   ← CRM de leads (kanban)

  roles:    [ { id, nombre, permisos:{ modulo: 'rw'|'r'|'n' } } ]
  usuarios: [ { id, nombre, email, rol, estado, ultimoAcceso } ]

  ── Contabilidad ──
  movimientos: [...]            ← ingresos/egresos (antes 'caja')
  cierres:     [...]            ← cierres / arqueos de caja
  categorias:  [ { id, nombre, tipo: 'ingreso'|'egreso'|'devolucion'|'ambos' } ]
  proveedores: [...]
  recurrentes: [...]            ← gastos recurrentes (se aplican en login)
  presupuestos:[...]
  auditoria:   [...]            ← log de acciones (auditLog)
  tipo_cambio_historial: [...]  ← histórico de cotización del dólar

  ── Chatbot ──
  knowledge_base: [ { category, question, answer } ]
  bot_config: {                 ← info del hostel editable desde la app
    nombre_hostel, ubicacion, checkin, checkout,
    descripcion_cabanas, servicios, info_adicional,
    quick_replies: [{ label, msg }]
  }
```

> No existe nodo `chat_logs` (estaba previsto pero no se implementó).

## Roles de usuario

|ID (`roles`)   |rolKey     |Nombre        |
|---------------|-----------|--------------|
|`rol-admin`    |`admin`    |Administración|
|`rol-recepcion`|`recepcion`|Recepción     |
|`rol-ventas`   |`ventas`   |Ventas        |
|`rol-limpieza` |`limpieza` |Limpieza      |

- Los permisos son **granulares por módulo** (`rw` / `r` / `n`):
  dashboard, mapa, reservas, checkin, huespedes, precios, contabilidad, caja, roles.
- `rolToKey()` mapea el id del rol a la key corta.
- `applyRoleUI()` muestra/oculta elementos `.admin-only` y el nav de Lista Negra.
- Los roles viven en los nodos `roles`/`usuarios`. (NO se usan custom claims de Firebase Auth.)

## Cabañas

|Cabañas|Capacidad |Precio base |
|-------|----------|------------|
|1 - 4  |3 personas|$510.000 ARS|
|5 - 8  |4 personas|$510.000 ARS|
|9 - 12 |6 personas|$637.500 ARS|

Cada cabaña tiene además `precio_alta` y `precio_baja` en el nodo `precios.habitaciones`.

- Sin vista al mar (se escucha desde las cabañas)
- A 50m del mar, 4 cuadras del centro de Mar de las Pampas
- Desayuno incluido, parrilla individual, WiFi, TV LED, estacionamiento

## Módulos / secciones (`showSection`)

dashboard · mapa · reservas · grilla · checkin · pipeline · huespedes · listanegra ·
precios · contabilidad · caja · usuarios · roles · knowledge · botconfig
*(chatbot existe pero está desactivado)*

## Funciones clave en index.html

|Función                                                                  |Descripción                                            |
|-------------------------------------------------------------------------|-------------------------------------------------------|
|`loadAllData()`                                                          |Baja todo `/cabanas/` al cache                         |
|`initData()`                                                             |Seed inicial si es la primera vez (flag `init_cabanas`)|
|`DB.get/set`                                                             |Lectura/escritura sobre cache + Firebase               |
|`doLogin()`                                                              |Auth + resolución de usuario/rol desde nodos           |
|`buildSystemPrompt()`                                                    |Prompt del chat con disponibilidad en tiempo real      |
|`renderMapa()` / `renderMapaFecha()` / `cycleBed()`                      |Mapa de 12 cabañas                                     |
|`renderReservas()` / `saveReserva()` / `editReserva()`                   |Reservas                                               |
|`renderGrilla()`                                                         |Grilla tipo calendario                                 |
|`doCheckin()` / `confirmCheckin()` / `doCheckout()`                      |Check-in/out                                           |
|`renderPipeline()` / `saveLead()` / `moveLeadEtapa()`                    |CRM kanban                                             |
|`renderHuespedes()` / `renderListaNegra()` / `getScoreBadge()`           |Huéspedes + score                                      |
|`renderPrecios()` / `addTemporada()` / `addPromo()`                      |Precios                                                |
|`renderAcct()` / `renderCaja()` / `cerrarCaja()` / `aplicarRecurrentes()`|Contabilidad y caja                                    |
|`renderRoles()` / `renderUsuarios()` / `saveUsuario()`                   |Roles y usuarios                                       |
|`renderKnowledge()` / `renderBotConfig()`                                |KB y config del bot                                    |
|`fetchCotizacionDolar()`                                                 |Cotización del dólar                                   |
|`auditLog()`                                                             |Registro en `auditoria`                                |
|`habBeds(hab)`                                                           |Retorna `[{id, label}]` (1 unidad por cabaña)          |
|`camaLabel(camaId)`                                                      |Retorna “Cabaña X” — **NUNCA usar `cabañaLabel()`**    |
|`getHuespedNombre(id, reserva)`                                          |Nombre del huésped, con fallback a `reserva.guestName` |

## Pipeline CRM — etapas

`consulta` → `presupuesto` (Presupuesto enviado) → `confirmada` → `perdida`. Tablero kanban.

## Gotchas críticos

1. **`cabañaLabel` NO existe** — la función es `camaLabel()`. (Verificado: sin referencias rotas.)
1. **Terminología “cama” todavía visible en UI** — modal “Cambio de Cama”, “Mapa Camas” en `MODULE_LABELS`,
   tooltips “Cab./Cama”, opciones “Cama X”, funciones `openCambioCama/saveCambioCama`. Pendiente de pulir a “cabaña”.
1. **El path es `/cabanas/`** — no `/alula/` (hostel Alula, otro proyecto Firebase).
1. **`initData` no pisa la KB** — si `knowledge_base` ya tiene datos, no la reinicializa.
1. **Nodos renombrados**: `caja`→`movimientos`+`cierres`, `bedStates`→`beds`. Verificar al portar código viejo.
1. **Migración indexada idempotente**: el flag `cabanas/_migrado/{nodo}` marca los nodos ya
   convertidos de array a `{id:reg}`. No borrar esos flags (re-dispararía la migración). La
   migración usa `update()` merge, nunca `set()` de nodo entero, así no pisa hijos concurrentes.
1. **El replace `38→12`** en adaptaciones puede romper valores CSS en px (380px→120px). Siempre verificar después.
1. **`buildSystemPrompt()` lee del cache** — llamar `loadAllData()` antes para datos frescos.
1. **Firebase Realtime Database, NO Firestore** — el Firestore creado al inicio no se usa.
1. **Admin no hardcodeado** — usuarios se crean en Firebase Auth y se cargan en el nodo `usuarios`.
