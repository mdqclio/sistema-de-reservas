# Sistema de Reservas — Cabañas Puerto Delfín

Sistema de gestión para cabañas, basado en el sistema del Alula Hostel (que ya funciona en producción).
Deployado en GitHub Pages. Un solo archivo `index.html` (~6.100 líneas, vanilla JS).

**Versión actual**: v1.1

## Stack

- **Frontend**: Vanilla JS + HTML + CSS (sin frameworks)
- **Base de datos**: Firebase Realtime Database (NO Firestore)
- **Auth**: Firebase Authentication
- **Bot**: la implementación se mueve al proyecto aparte **`mibot247/botcontrol`** (multi-tenant,
  Firebase propio `botcontrol-base`) + n8n en Hetzner. El chatbot embebido en el browser queda
  **deprecado/fallback**.
- **Hosting**: GitHub Pages (`mdqclio.github.io/sistema-de-reservas/`)

## Firebase

- **Proyecto**: `sistema-de-reservas-d9e54`
- **Auth domain**: `sistema-de-reservas-d9e54.firebaseapp.com`
- **DB URL**: `https://sistema-de-reservas-d9e54-default-rtdb.firebaseio.com`
- **Storage bucket**: `sistema-de-reservas-d9e54.firebasestorage.app`
- **API Key**: `AIzaSyBO6nDGdYWHWd5CQiYnbNojq8Yi7i1YJRc`
- **Sender ID**: `461330609922`
- **App ID**: `1:461330609922:web:70c6726069e21cf810341b`
- **Path en DB**: `/cabanas/` (NO usar `/alula/` que es del hostel)

## Admin / usuarios

⚠️ **El admin ya NO está hardcodeado en el código.**

- Los usuarios se crean manualmente en **Firebase Console → Authentication** (email + contraseña).
- Después se dan de alta en el nodo `/cabanas/usuarios/` con su email real y un rol.
- El login: Firebase Auth valida credenciales → busca el email en `usuarios` → resuelve el rol desde el nodo `roles` → aplica la UI según permisos.
- El seed inicial deja un usuario `Administrador` con email vacío (hay que completarlo).
- No se guardan contraseñas en el código.

## Archivos en el repo

```
index.html               ← sistema completo (v1.1)
docs/checkin.html        ← pre check-in público (link único por reserva)
docs/guest-register.html ← autocarga de datos de huéspedes
```

> Los dos formularios públicos viven en **`/docs/`**, no en la raíz.
> `kb_import.html` ya **no está en el repo** (era de uso único, se removió).
> `web-puertodelfin.html` (web pública nueva) todavía **no se subió**.
> ⚠️ `checkin.html` y `guest-register.html` siguen escribiendo en **Firestore**
> (`reservations`/`guests`); el admin lee de RTDB. Unificar es tarea abierta (Bloque 0 #2).

## Módulos del sistema (por grupo del nav)

- **Principal**: Dashboard · Mapa de Cabañas · Reservas · Grilla
- **Operaciones**: Check-in/out · Pipeline CRM · Conversaciones · Huéspedes
- **Administración**: Contabilidad · Caja Diaria · Lista Negra
- **Configuración**: Precios · Usuarios · Roles y Permisos · Log de Actividad

*(Base de Conocimiento y Configuración del Bot siguen existiendo; el Chat Asistente embebido
queda deprecado/fallback — el bot se mueve a `mibot247`.)*

## Pendientes

- [ ] **Facturación electrónica real (ARCA WSFEv1)**: Factura B/A con desglose de IVA,
  adaptación del skill `afip-facturacion`, corre en Hetzner vía n8n. (Hoy la app solo
  marca `facturado` + `nroComprobante` a mano; no emite comprobantes.) Ver TAREAS.md.
- [ ] **Flujo de staging/validación**: los formularios públicos escriben en un nodo
  `/cabanas/pendientes` (RTDB) en vez de Firestore + bandeja de "Pendientes" en el admin.
- [ ] **Reglas de seguridad de Firebase** (RTDB + Storage) por rol — antes de producción.
- [ ] **Reactivar el chatbot** (hoy está comentado en la UI y en `loadAllData`)
- [ ] Conectar bot a WhatsApp (Twilio, número nuevo)
- [ ] Conectar bot a Telegram (BotFather, gratis)
- [ ] Conectar bot a Instagram/Facebook (Meta API)
- [ ] Sincronización con Booking/Airbnb (Beds24 como channel manager)
- [ ] Completar email del usuario admin en el nodo `usuarios`
- [ ] Subir la web pública nueva (`web-puertodelfin.html`) con fotos reales
- [ ] Software predictivo de trading (libro pendiente de subir)

## Hecho recientemente

### Precios + facturación (v1.1)

- [x] **Rediseño del motor de precios** — cascada **noche por noche** (subtotal = Σ noches):
  base de temporada / **fecha especial** (override absoluto que pisa base y finde) → recargo
  de finde → **ajuste exclusivo** (a lo sumo uno de promo · último momento · ocupación,
  prioridad en ese orden). Punto único `calcularPrecioReserva`, reemplaza el `precio × noches`
  disperso. Ver **docs/PRECIOS.md**.
- [x] **Precios dinámicos** (ocupación del día + último momento), **fechas especiales**
  (precio absoluto por noche) y **cargos únicos** por reserva — con UI de config (3 pestañas).
- [x] **Promo manual**: el staff elige la promo en un dropdown del form (`r.promo`); ya **no**
  se auto-aplica por fecha. Elegir promo apaga los dinámicos de esa reserva.
- [x] **Facturación**: flag `facturado` + `nroComprobante` en movimientos; checkbox en el
  check-in y en caja; IVA calculado **solo sobre lo facturado**; resumen cobrado / facturado /
  sin facturar por reserva y en Contabilidad. Movimientos linkeados a la reserva (`reservaId`).
- [x] **Fix del saldo de check-in a caja**: `confirmCheckin` cobra el saldo pendiente (cuando
  hubo seña previa) y registra la comisión de plataforma una sola vez (guard `comisionRegistrada`).
- [x] **Tests del motor de precios** (`tests/precios.test.mjs`, 13 casos en verde).

### Sesión v1.1

- [x] **Concurrencia en TODOS los nodos-colección** vía `makeLiveCollection` (cache vivo con
  `onValue` + escritura por hijo + migración flag-gated). `liveRerender(section, fn)` re-renderiza
  solo si la sección está activa y no hay modal. `precios` y `bot_config` siguen siendo blobs.
- [x] **Grilla rediseñada**: ancho completo (`table-layout:fixed`; label 180px, columnas de fecha 60px);
  precio por noche en celdas libres (blanco); descripción de cabaña en blanco; cada reserva como UNA
  barra (`colspan`) con nombre+apellido centrado y "debe $X" (saldo) en rojo; `CABANA_CONFIG` como única
  fuente de tipo/m²/capacidad (Monoambiente 38m² 3pax = 1-4 · 2 Ambientes 38m² 4pax = 5,6,9,10 ·
  Loft 60m² 6pax = 7,8,11,12); selección por 2 clicks abre el modal unificado.
- [x] **Buscador con autocompletado de huésped** en el modal de reserva (reemplaza el `<select>`).
- [x] **Auditoría integral**: `auditLog` en todas las mutaciones + login/logout (tope 1000); el visor
  salió de Contabilidad y es su propia sección (**Log de Actividad**) con filtro por entidad.
- [x] **Nav reorganizado**: nuevo grupo "Configuración" (Precios, Usuarios, Roles, Log).
- [x] **Fix color del mapa**: cabaña sin reserva activa se ve Libre/verde aunque `beds` tenga un
  `'occupied'` viejo (la ocupación se deriva de las reservas).

### Anterior

- [x] **Concurrencia resuelta en todos los nodos-colección**: `onValue` (cache vivo) +
  escritura por hijo (`nodo/{id}`) vía la factory `makeLiveCollection`. Dos usuarios ya no
  se pisan registros. Migración array→`{id:reg}` idempotente (flag `_migrado/{nodo}`).
- [x] Conocimiento del bot movido a `bot_config` + Base de Conocimiento (ya casi nada hardcodeado)
- [x] Módulo de Contabilidad completo (movimientos, presupuestos, recurrentes, proveedores, auditoría)
- [x] Caja diaria con arqueo y cierres
- [x] Pipeline CRM (kanban de leads)
- [x] Roles y permisos granulares por módulo
- [x] Score de huéspedes + Lista Negra con link público
