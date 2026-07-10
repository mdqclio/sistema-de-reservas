# TAREAS — Sistema de Reservas Puerto Delfín

> Backlog consolidado. Surgió de la revisión del código (3 archivos: `index.html`,
> `checkin.html`, `guest-register.html`) más las features nuevas planificadas.
> Orden pensado por **dependencias**, no por tamaño.

**Leyenda:** 🔴 rompe plata/datos en producción · 🟠 importante · 🟡 pulido · ✨ feature nueva

-----

## ✅ Hecho esta sesión (v1.2 — precios + check-in)

- 🔴 **Fix del saldo de check-in** (Bloque 0 #4): `confirmCheckin` ahora cobra el
  saldo pendiente y registra la comisión una sola vez (guard `comisionRegistrada`).
- ✨ **Flags de facturación** en movimientos: `facturado` + `nroComprobante`
  (default en `writeMovimiento`, checkbox + input en el modal de caja).
- ✨ **Cascada de precios unificada** (`calcularPrecioReserva` / `precioNocheCascada`):
  temporada → dinámicos → finde → promo → fechas especiales, + cargos únicos.
  Reemplaza el `precio × noches` disperso en saveReserva/confirmCheckin/openPago/grilla.
  La reserva guarda `total` autoritativo. Con los nodos nuevos vacíos, da exactamente
  `precio × noches` (cero cambio en la operación viva). Verificado con tests aislados.
- ✨ **Config de precios**: 3 pestañas nuevas — Precios dinámicos (ocupación +
  last-minute), Fechas especiales (precio absoluto por noche) y Cargos únicos.
- 🟠 **IDs de precios a push key** (`nuevoPrecioId`) en temporadas/findes/promos y los
  nodos nuevos.
- ✨ **Facturación completa** (resto de la sección C):
  - Checkbox "Facturar el saldo cobrado" + N° comprobante en el modal de check-in
    (el movimiento del saldo nace con el flag correcto, no siempre `false`).
  - `reservaId` en los movimientos de reserva (seña, saldo, comisión, pago parcial)
    para poder cruzar movimientos ↔ reserva.
  - Totales en Contabilidad → Resumen: Cobrado, Facturado, Sin facturar e **IVA
    calculado solo sobre `facturado:true`** (`facturado/1.21*0.21`).
  - Resumen por reserva en la lista: total / facturado / sin facturar
    (`resumenFacturacionReserva`).
- ✨ **Selector de cargos únicos por reserva**: checkboxes en el form de reserva
  (los cargos definidos en Config aparecen tildables, apagados por default),
  `saveReserva` manda los elegidos en `opts.cargos` y los guarda en `r.cargos`;
  desglose del precio (precio × noches + cada cargo = total) debajo del precio.
  Al editar, se pre-tildan los cargos que la reserva ya tenía.

> Línea de precios + facturación: **completa**. Próximos frentes (otras líneas del
> backlog): staging+validación, reglas de seguridad de Firebase, Beds24, bot.

## ✅ Hecho esta sesión (v1.1)

- **Concurrencia** en todos los nodos-colección (Bloque 0 #1) — `makeLiveCollection` + `liveRerender`.
- **Carga huésped+reserva desde la grilla** por 2 clicks (Bloque 1) + grilla rediseñada
  (barras `colspan`, precio/noche, `CABANA_CONFIG`).
- **Buscador con autocompletado** de huésped existente en el modal de reserva.
- **Log de auditoría integral**: `auditLog` en todas las mutaciones + login/logout (tope 1000);
  visor como sección propia ("Log de Actividad", grupo Configuración) con filtro por entidad.
- **Fix color del mapa**: la cabaña libre se ve verde aunque `beds` tenga un `'occupied'` viejo.

> Siguen pendientes: precio que defaultea a `510000`, escapar HTML en todos lados, IDs robustos,
> staging+validación, reglas de seguridad, saldo del check-in a caja, Beds24, y el bot en n8n/mibot247.

-----

## 🧱 Bloque 0 — Bases técnicas (PREREQUISITOS, antes de integrar nada externo)

- [x] 🔴 **Concurrencia. (HECHO)** `onValue` (cache vivo) + escritura por hijo en
  TODOS los nodos-colección. Antes solo lo tenían reservas/huéspedes/movimientos/beds;
  ahora también pipeline, roles, usuarios, categorías, proveedores, auditoría, cierres,
  tipo_cambio_historial, recurrentes, presupuestos y knowledge_base, vía la factory
  genérica `makeLiveCollection`. Ya no se pisa ningún array entero con `DB.set`.
  *(precios y bot_config quedan como objetos de config únicos — se escriben enteros a
  propósito, no son colecciones de registros.)* Prerrequisito de Beds24: cumplido.
- [ ] 🔴 **Completar el flujo de staging + validación** (antes era “unificar a RTDB”).
  El diseño original ya lo preveía (la UI dice “Pendiente confirmar”), pero quedó a medias:
  los formularios públicos escriben en Firestore y el admin solo lee RTDB.
  - [ ] Lo público (pre check-in + autocarga) escribe en un nodo de staging en RTDB
    (`/cabanas/pendientes`), NO en Firestore (evita mantener 2 bases y 2 SDK).
  - [ ] Bandeja “Pendientes de confirmar” en el admin que liste ese nodo.
  - [ ] Al confirmar: validar + sanitizar y promover a `reservas` / `huespedes`.
  - [ ] Sacar Firestore de `checkin.html` y `guest-register.html`.
    *Beneficio extra: la cuarentena mantiene input no confiable fuera de producción
    y el momento de promover es donde se escapa/valida el dato (mata el XSS).*
- [ ] 🔴 **Reglas de seguridad de Firebase** (RTDB + Storage), por rol.
  `pendientes` escribible por cualquiera (con límite de tamaño/tipo); `reservas`,
  `huespedes`, etc. solo staff. *Prerrequisito de salir a producción y de exponer
  cualquier webhook. Revisar la fecha de expiración de las reglas actuales.*
- [x] 🔴 **Saldo del check-in a la caja. (HECHO)** `confirmCheckin` cobraba el ingreso
  solo si `pagado === 0`; con seña previa (30% + saldo) el 70% nunca entraba a
  `movimientos`. Ahora registra `saldoPendiente = total − pagado` al hacer check-in.
  Además la comisión de plataforma vivía dentro del mismo branch, así que las reservas
  con seña tampoco registraban comisión: se sacó a un bloque propio con guard
  `comisionRegistrada` (una sola vez, sobre el total).

## 🎨 Bloque 1 — UI/UX y pestaña de Configuración

- [x] ✨ **Carga de huésped + reserva desde la grilla. (HECHO)** Selección de rango por
  **dos clicks** (inicio → fin) sobre celdas libres → abre el formulario unificado
  con cabaña y fechas pre-cargadas. Elegir huésped existente vía **buscador con autocompletado**
  (`filtrarHuespedes`/`seleccionarHuesped`, reemplaza el `<select>`) o "huésped nuevo".
- [ ] ✨ **Fotos de DNI a Firebase Storage.** Subir al bucket (ya existe) y guardar
  solo la URL, no el base64. El render no cambia (`<img src>` aguanta ambos).
  Tocar las 3-4 vías de carga. Cuidar reglas del bucket para uploads públicos.
  *(Opcional: comprimir/redimensionar la imagen en el cliente antes de subir.)*
- [ ] ✨ **Pestaña de Configuración (nueva).**
  - [ ] CRUD de ítems de contabilidad: categorías y proveedores (los nodos ya existen).
  - [ ] Definición de precios consolidada acá: temporadas, precio por cabaña
    (alta/base/baja), promos, finde largos, plataformas.
- [ ] 🟠 **Saneamiento de datos** (bugs detectados en la revisión):
  - [x] Precio: **(HECHO)** ya no defaultea a `510000`. El prefill y la grilla salen de
    `precioNocheCascada` (temporada por cabaña + cascada); el placeholder engañoso
    "510000" pasó a "auto según cabaña/temporada".
  - [ ] Escapar HTML de todo dato de usuario antes de meterlo en `innerHTML` (XSS).
  - [ ] IDs robustos (push de Firebase o UUID) en vez de `Date.now()` (colisiones).
    *Parcial: reservas, auditoría, cierres, tipo_cambio y ahora también los ítems de
    `precios` (temporadas/findes/promos/fechas_especiales/cargos_unicos, vía
    `nuevoPrecioId()`) usan push keys. Faltan roles/usuarios/categorías/proveedores/
    pipeline/recurrentes (siguen con `prefijo+Date.now()`, que igual funciona como
    clave de hijo; conviene unificar a push key).*

## 🔗 Bloque 2 — Beds24 (channel manager: Booking + Airbnb)

> Depende de Bloque 0 #1 y #2.

- [ ] ✨ **Decisión de arquitectura:** ¿quién es la fuente de verdad de la
  disponibilidad, Beds24 o la base propia? Define todo el resto.
- [ ] ✨ Mapeo de reservas externas → nodo `reservas` (con id externo de Beds24,
  `plataforma` y la comisión que ya está modelada).
- [ ] ✨ Webhook Beds24 → n8n (Hetzner) → escribe en RTDB y bloquea la grilla.
- [ ] ✨ Push de disponibilidad/tarifas hacia Beds24 (si la decisión lo requiere).

## 🤖 Bloque 3 — Chatbot en Hetzner/n8n + web pública

> **Dirección actual:** el bot se construye en el proyecto aparte **`mibot247/botcontrol`**
> (multi-tenant, Firebase propio `botcontrol-base`) + n8n en Hetzner. El chat embebido del
> browser queda deprecado/fallback.

- [ ] ✨ Flujo en n8n: webhook → consulta disponibilidad/precios/KB en RTDB → respuesta.
  Reusar la lógica de `buildSystemPrompt`, pero del lado de n8n.
- [ ] ✨ Fuentes del bot: `knowledge_base` + `bot_config` + disponibilidad en tiempo real.
- [ ] ✨ Canales: primero web (widget en `web-puertodelfin.html`), después
  WhatsApp / Instagram / Telegram.
- [ ] ✨ Elegir modelo (Groq vs Claude).
- [ ] ✨ Deprecar el chatbot viejo del browser (o dejarlo como fallback).
- [ ] ✨ Subir `web-puertodelfin.html` con fotos reales + widget del bot.

## 🧹 Pulido (cuando haya hueco)

- [ ] 🟡 Bloquear/avisar al borrar un huésped con reservas (evitar referencias huérfanas).
- [ ] 🟡 Consistencia de `beds` (valor string vs objeto `{estado}`).
- [ ] 🟡 Terminología “cama” → “cabaña” en la UI (modal “Cambio de Cama”, “Mapa Camas”, etc.).
- [ ] 🟡 Completar el email del usuario admin en `usuarios`.

-----

## Dependencias clave

- **Beds24 exige antes el #1 (concurrencia).** Beds24 escribe reservas de forma
  automática; sumar eso sobre el modelo de “pisar el array entero” multiplica la
  pérdida de datos, no la reduce.
- **Beds24 y el check-in público exigen el #2** (una sola base + flujo de validación).
- **Cualquier cosa que exponga la base a internet (webhooks de n8n, Beds24) exige
  el #3** (reglas reales) primero.
- **Un solo backend para dos integraciones:** el Hetzner+n8n que se monta para el bot
  puede recibir también los webhooks de Beds24. No hace falta armar dos cosas.

## Orden sugerido

1. Bloque 0 completo (destraba todo y es lo de mayor riesgo en producción).
1. Bloque 1 (features pedidas + saneamiento).
1. Bloque 2 y Bloque 3 en paralelo (comparten el backend en Hetzner).
1. Pulido, en cualquier momento.
