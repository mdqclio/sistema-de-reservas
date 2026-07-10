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
- El segundo parámetro es un callback de re-render envuelto en
  `liveRerender(section, fn)` → `() => { if (sectionActive(section) && !anyModalOpen()) fn(); }`.
  Solo re-renderiza si esa sección está activa y no hay ningún modal abierto (evita pisar
  un formulario abierto). Ej.: `colAuditoria` usa `liveRerender('log', () => renderLog())`;
  los callbacks de `reservas`/`huespedes`/`beds` llaman `renderMapa()`/`renderGrilla()`, así
  el mapa y la grilla se auto-refrescan cuando cambian los datos.
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
    fines_semana_largos: [{ id, nombre, fecha_inicio, fecha_fin, recargo_pct }]
    promociones:       [{ id, nombre, fecha_inicio, fecha_fin, tipo:'descuento_pct', valor, condicion }]  // el staff la ELIGE en el form (r.promo), no se auto-aplica
    dinamicos: {                ← precios dinámicos (objeto único, no colección)
      activo,                   //   master on/off; si false, no se aplica ningún ajuste dinámico
      ocupacion:   [{ id, desde_pct, ajuste_pct }],   // recargo según % ocupación del día
      last_minute: [{ id, dias, ajuste_pct }]         // ajuste según días hasta la entrada (suele ser dto.)
    }
    fechas_especiales: [{ id, nombre, fecha, precio }]  // precio ABSOLUTO: pisa temporada Y finde de esa noche
    cargos_unicos:     [{ id, nombre, monto }]          // cargos FIJOS por reserva (limpieza, ropa, mascota…)
    habitaciones:      [{ hab, nombre, tipo, mts2, capacidad, precio_base, precio_alta, precio_baja, moneda }]
    plataformas:       [{ plat, descuento, comision }]   // directo 0% / booking 15% / airbnb 12%
  }
  // Cascada de precios completa: ver docs/PRECIOS.md

  reservas: [ { id, huespedId, guestName, hab, cabaña, entrada, salida,
                precio, total, cargos, promo, pagado, estado, plataforma, notas,
                comisionRegistrada,
                checkinToken, guestDniPhoto,
                guestScore, guestScoreAvg, guestScoreComment } ]
  //   precio  = precio/noche representativo (override manual del staff, o 1ª noche de la cascada)
  //   total   = total autoritativo, cascada NOCHE POR NOCHE al guardar (ver PRECIOS.md)
  //   cargos  = [id,…] de precios.cargos_unicos tildados en el modal (cargos fijos)
  //   promo   = id de la promo elegida por el staff en el form ('' = ninguna; NO se auto-aplica)
  //   comisionRegistrada = flag: la comisión de plataforma ya se asentó como egreso (una sola vez)

  huespedes: [ { id, nombre, apellido, dni, nac, ciudad, tel, email, foto, estadias } ]

  beds: {                       ← estado del mapa (antes 'bedStates')
    "1": "free|dirty|maintenance|occupied"   // 1 unidad por cabaña; valor string u objeto {estado}
    "2": ...
  }

  pipeline: [ { id, nombre, etapa, ... } ]   ← CRM de leads (kanban)

  roles:    [ { id, nombre, permisos:{ modulo: 'rw'|'r'|'n' } } ]
  usuarios: [ { id, nombre, email, rol, estado, ultimoAcceso } ]

  ── Contabilidad ──
  movimientos: [ { id, tipo:'ingreso'|'egreso', cat, moneda, monto, metodo, fecha, concepto,
                   reservaId, facturado, nroComprobante } ]   ← ingresos/egresos (antes 'caja')
  //   reservaId      = linkea el movimiento a su reserva (resumen cobrado/facturado por reserva)
  //   facturado      = bool; el IVA en el resumen se calcula SOLO sobre movimientos facturados
  //   nroComprobante = nº de factura/comprobante (se carga en el check-in y en movimientos)
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

|Cabañas      |Tipo         |m²  |Capacidad |Precio base |
|-------------|-------------|----|----------|------------|
|1, 2, 3, 4   |Monoambiente |38  |3 personas|$510.000 ARS|
|5, 6, 9, 10  |2 Ambientes  |38  |4 personas|$510.000 ARS|
|7, 8, 11, 12 |Loft         |60  |6 personas|$637.500 ARS|

> **Ojo:** la capacidad NO es contigua por número. Las de 6 pax (Loft) son 7, 8, 11, 12;
> las de 4 pax (2 Ambientes) son 5, 6, 9, 10. (Corrige el viejo "5-8 / 9-12" por rango.)

`CABANA_CONFIG` (constante en `index.html`, ~línea 1853) es la **única fuente de verdad** de
`tipo`/`mts2`/`capacidad` por cabaña. La usa el seed (`initData`), una migración una-sola-vez
(flag `cabanas/_migrado/habitaciones_config`, que corrige los datos ya cargados sin tocar precios)
y el render de la grilla (margen izquierdo). Cada cabaña tiene además `precio_alta` y `precio_baja`
en el nodo `precios.habitaciones`.

- Sin vista al mar (se escucha desde las cabañas)
- A 50m del mar, 4 cuadras del centro de Mar de las Pampas
- Desayuno incluido, parrilla individual, WiFi, TV LED, estacionamiento

## Módulos / secciones (`showSection`)

dashboard · mapa · reservas · grilla · checkin · pipeline · conversaciones · huespedes ·
listanegra · precios · contabilidad · caja · usuarios · roles · **log** · knowledge · botconfig
*(chatbot embebido existe pero está deprecado/fallback; se mueve a mibot247 — ver CHATBOT.md)*

Agrupación del nav (`sidebarNav`):

- **Principal**: Dashboard, Mapa, Reservas, Grilla
- **Operaciones**: Check-in/out, Pipeline, Conversaciones, Huéspedes
- **Administración** (`admin-only`): Contabilidad, Caja, Lista Negra
- **Configuración**: Precios (todos) · Usuarios, Roles, **Log de Actividad** (`admin-only`)

El **Log de Actividad** (`section-log` / `renderLog`) es ahora su propia sección; antes era una
pestaña dentro de Contabilidad. `renderLog()` reusa el visor `renderAuditoria(c)` sobre `#logContent`,
con filtro por entidad (`setAuditFiltro` / `currentAuditFiltro`).

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
|`filtrarHuespedes(q)` / `seleccionarHuesped(id)`                         |Buscador con autocompletado de huésped en el modal de reserva (input visible `res-huesped-buscar` + oculto `res-huesped`) |
|`renderGrilla()`                                                         |Grilla calendario; cada reserva = UNA barra (`colspan`) con nombre+apellido centrado y "debe $X" en rojo; celdas libres muestran precio/noche y abren el modal con selección por 2 clicks |
|`fmtPrecioCorto(n)`                                                      |Precio abreviado en miles (`$510k`, `$637,5k`)         |
|`precioDefaultCabana(hab, fecha)`                                        |Precio por noche según temporada (alta/baja/base) desde `precios.habitaciones` |
|`calcularPrecioReserva(hab, entrada, salida, opts)`                      |**Punto único** de cálculo de precio, **noche por noche** (subtotal = Σ noches). Por noche: base/fecha especial → finde → ajuste EXCLUSIVO (promo > último momento > ocupación) + cargos únicos. Respeta `opts.precioOverride` y `opts.promo`. Devuelve `{noches, precioNoche, preciosNoche, subtotal, cargosTotal, total}`. Ver **docs/PRECIOS.md** |
|`precioNocheCascada(hab, fecha, opts)`                                   |Precio de UNA noche con toda la cascada (`opts.entrada`, `opts.promoId`) |
|`promosVigentesRango(...)` / `renderResPromos(id)`                       |Promos elegibles para la estadía + dropdown de promo (manual) en el form |
|`totalReserva(r)` / `cargosReservaTotal(ids)`                            |Total autoritativo de una reserva (guardado o recalculado); suma de cargos únicos |
|`resumenFacturacionReserva(rid)`                                         |`{cobrado, facturado, sinFacturar}` de una reserva desde sus movimientos (`reservaId`); IVA solo sobre `facturado` |
|`doCheckin()` / `confirmCheckin()` / `doCheckout()`                      |Check-in/out                                           |
|`renderPipeline()` / `saveLead()` / `moveLeadEtapa()`                    |CRM kanban                                             |
|`renderHuespedes()` / `renderListaNegra()` / `getScoreBadge()`           |Huéspedes + score                                      |
|`renderPrecios()` / `addTemporada()` / `addPromo()`                      |Precios                                                |
|`renderAcct()` / `renderCaja()` / `cerrarCaja()` / `aplicarRecurrentes()`|Contabilidad y caja                                    |
|`renderRoles()` / `renderUsuarios()` / `saveUsuario()`                   |Roles y usuarios                                       |
|`renderLog()` / `setAuditFiltro(v)`                                      |Visor del log de auditoría (sección propia) + filtro por entidad |
|`renderKnowledge()` / `renderBotConfig()`                                |KB y config del bot                                    |
|`fetchCotizacionDolar()`                                                 |Cotización del dólar                                   |
|`auditLog(accion, entidad, detalle)`                                     |Registro en `auditoria` (por hijo). Ahora se llama en **todas** las mutaciones (reservas, huéspedes, checkin/out, precios, usuarios, roles, pipeline, `cycleBed`, KB, bot config) + login/logout. Tope: 1000 registros |
|`habBeds(hab)`                                                           |Retorna `[{id, label}]` (1 unidad por cabaña)          |
|`camaLabel(camaId)`                                                      |Retorna “Cabaña X” — **NUNCA usar `cabañaLabel()`**    |
|`getHuespedNombre(id, reserva)`                                          |Nombre del huésped, con fallback a `reserva.guestName` |

## Pipeline CRM — etapas

`consulta` → `presupuesto` (Presupuesto enviado) → `confirmada` → `perdida`. Tablero kanban.

## Mapa de cabañas — color y auto-refresh

`renderMapa()` deriva la **ocupación de las reservas activas** (estado `checkin`/`confirmada`
que cubren la fecha consultada), NO del nodo `beds`. En la rama "sin reserva activa", el color
solo respeta los overlays **manuales** del nodo `beds`: `dirty` (naranja) y `maintenance` (rojo);
cualquier otro valor (ej. un `'occupied'` viejo de un check-in cuya reserva terminó sin checkout)
se ignora → la cabaña se ve **Libre/verde**, consistente con el badge (que también sale de las
reservas). El checkout sí setea `beds` a `'dirty'` a propósito; `cycleBed` cicla los overlays
manuales. El mapa se auto-refresca: los callbacks en vivo de `reservas`/`huespedes`/`beds`
llaman `renderMapa()`.

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
1. **Handlers inline → `Object.assign(window, {...})`** — toda función usada desde un
   `onclick`/`onchange`/`oninput` inline DEBE estar registrada en el bloque `Object.assign(window, …)`
   (el script es `type="module"`, así que su scope no es global). `node --check` **NO** detecta si falta;
   se rompe recién en runtime. Ej. de esta sesión: `setAuditFiltro`, `filtrarHuespedes`, `seleccionarHuesped`.
1. **El nodo `beds` puede tener un `'occupied'` viejo** — de un check-in cuya reserva terminó sin
   checkout. Es inofensivo: `renderMapa` lo ignora (solo respeta `dirty`/`maintenance`) y deriva la
   ocupación de las reservas. No hace falta limpiarlo.
