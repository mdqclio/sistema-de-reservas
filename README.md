# Sistema de Reservas — Cabañas Puerto Delfín

Sistema de gestión para cabañas, basado en el sistema del Alula Hostel (que ya funciona en producción).
Deployado en GitHub Pages. Un solo archivo `index.html` (~6.100 líneas, vanilla JS).

**Versión actual**: v1.0

## Stack

- **Frontend**: Vanilla JS + HTML + CSS (sin frameworks)
- **Base de datos**: Firebase Realtime Database (NO Firestore)
- **Auth**: Firebase Authentication
- **Bot**: Groq API (llama-3.3-70b-versatile) — *actualmente DESACTIVADO temporalmente*
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
index.html          ← sistema completo (v1.0)
checkin.html        ← pre check-in público (link único por reserva)
guest-register.html ← autocarga de datos de huéspedes
```

> `kb_import.html` ya **no está en el repo** (era de uso único, se removió).
> `web-puertodelfin.html` (web pública nueva) todavía **no se subió**.

## Módulos del sistema

Dashboard · Mapa de Cabañas · Reservas · Grilla · Check-in/out · Pipeline CRM ·
Huéspedes · Lista Negra · Precios · Contabilidad · Caja Diaria · Usuarios ·
Roles y Permisos · Base de Conocimiento · Configuración del Bot · (Chat Asistente — desactivado)

## Pendientes

- [ ] **Reactivar el chatbot** (hoy está comentado en la UI y en `loadAllData`)
- [ ] Conectar bot a WhatsApp (Twilio, número nuevo)
- [ ] Conectar bot a Telegram (BotFather, gratis)
- [ ] Conectar bot a Instagram/Facebook (Meta API)
- [ ] Sincronización con Booking/Airbnb (Beds24 como channel manager)
- [ ] Completar email del usuario admin en el nodo `usuarios`
- [ ] Subir la web pública nueva (`web-puertodelfin.html`) con fotos reales
- [ ] Software predictivo de trading (libro pendiente de subir)

## Hecho recientemente

- [x] **Concurrencia resuelta en todos los nodos-colección**: `onValue` (cache vivo) +
  escritura por hijo (`nodo/{id}`) vía la factory `makeLiveCollection`. Dos usuarios ya no
  se pisan registros. Migración array→`{id:reg}` idempotente (flag `_migrado/{nodo}`).
- [x] Conocimiento del bot movido a `bot_config` + Base de Conocimiento (ya casi nada hardcodeado)
- [x] Módulo de Contabilidad completo (movimientos, presupuestos, recurrentes, proveedores, auditoría)
- [x] Caja diaria con arqueo y cierres
- [x] Pipeline CRM (kanban de leads)
- [x] Roles y permisos granulares por módulo
- [x] Score de huéspedes + Lista Negra con link público