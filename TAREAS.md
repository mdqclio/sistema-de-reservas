# TAREAS — Sistema de Reservas Puerto Delfín

> Backlog consolidado. Surgió de la revisión del código (3 archivos: `index.html`,
> `checkin.html`, `guest-register.html`) más las features nuevas planificadas.
> Orden pensado por **dependencias**, no por tamaño.

**Leyenda:** 🔴 rompe plata/datos en producción · 🟠 importante · 🟡 pulido · ✨ feature nueva

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
- [ ] 🔴 **Saldo del check-in a la caja.** En `doCheckin`, el ingreso solo se registra
  si `pagado === 0`. Con seña previa (flujo normal: 30% + saldo), el 70% nunca entra
  a `movimientos`. Registrar el saldo al hacer check-in.

## 🎨 Bloque 1 — UI/UX y pestaña de Configuración

- [ ] ✨ **Carga de huésped + reserva desde la grilla.** Selección de rango por
  **dos clicks** (inicio → fin) sobre celdas libres → abre el formulario unificado
  con cabaña y fechas pre-cargadas. Mantener la opción de elegir huésped existente
  (evitar duplicados) además de “huésped nuevo”.
- [ ] ✨ **Fotos de DNI a Firebase Storage.** Subir al bucket (ya existe) y guardar
  solo la URL, no el base64. El render no cambia (`<img src>` aguanta ambos).
  Tocar las 3-4 vías de carga. Cuidar reglas del bucket para uploads públicos.
  *(Opcional: comprimir/redimensionar la imagen en el cliente antes de subir.)*
- [ ] ✨ **Pestaña de Configuración (nueva).**
  - [ ] CRUD de ítems de contabilidad: categorías y proveedores (los nodos ya existen).
  - [ ] Definición de precios consolidada acá: temporadas, precio por cabaña
    (alta/base/baja), promos, finde largos, plataformas.
- [ ] 🟠 **Saneamiento de datos** (bugs detectados en la revisión):
  - [ ] Precio: dejar de defaultear a `510000` en silencio. Exigirlo u obtenerlo
    de `precios` según la cabaña (hoy subcobra las de $637.500).
  - [ ] Escapar HTML de todo dato de usuario antes de meterlo en `innerHTML` (XSS).
  - [ ] IDs robustos (push de Firebase o UUID) en vez de `Date.now()` (colisiones).
    *Parcial: reservas, auditoría, cierres y tipo_cambio ya usan push keys de Firebase.
    Faltan roles/usuarios/categorías/proveedores/pipeline/recurrentes (siguen con
    `prefijo+Date.now()`, que igual funciona como clave de hijo; el riesgo de colisión
    es bajo pero conviene unificar a push key).*

## 🔗 Bloque 2 — Beds24 (channel manager: Booking + Airbnb)

> Depende de Bloque 0 #1 y #2.

- [ ] ✨ **Decisión de arquitectura:** ¿quién es la fuente de verdad de la
  disponibilidad, Beds24 o la base propia? Define todo el resto.
- [ ] ✨ Mapeo de reservas externas → nodo `reservas` (con id externo de Beds24,
  `plataforma` y la comisión que ya está modelada).
- [ ] ✨ Webhook Beds24 → n8n (Hetzner) → escribe en RTDB y bloquea la grilla.
- [ ] ✨ Push de disponibilidad/tarifas hacia Beds24 (si la decisión lo requiere).

## 🤖 Bloque 3 — Chatbot en Hetzner/n8n + web pública

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