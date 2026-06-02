# sistema-de-reservas

Sistema de administración de reservas hoteleras — **Cabañas Puerto Delfín** (Mar de las Pampas).

App de una sola página (`index.html`, vanilla JS sin build) sobre **Firebase Realtime Database**
y **Firebase Auth**. Gestiona reservas, huéspedes, check-in/out, mapa de cabañas, contabilidad,
caja, precios, pipeline de consultas, roles/usuarios y un chatbot (Groq, hoy desactivado).

## Características clave

- **Concurrencia segura:** reservas, huéspedes, movimientos y beds se guardan **por hijo**
  (`cabanas/{coleccion}/{id}`) con IDs push-key y 4 listeners `onValue` en vivo — dos usuarios
  simultáneos no se pisan registros.
- **Auto-login** al refrescar (persistencia local + `onAuthStateChanged`).
- **Fotos de DNI** en RTDB lazy (`fotos_huespedes/{id}`), comprimidas; sin Firebase Storage.
- **Saneado XSS** de datos de usuario en todos los renders (`escapeHtml`).
- **Precios por cabaña y temporada** (sin defaults fijos).

## Documentación

- [`docs/START_SESSION.md`](docs/START_SESSION.md) — arranque rápido y reglas de oro.
- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — modelo de datos, escritura por hijo,
  listeners, migración, fotos, Firestore legacy.
- [`docs/TAREAS.md`](docs/TAREAS.md) — estado: hecho y pendiente.
- [`docs/CHATBOT.md`](docs/CHATBOT.md) — bot (Groq) y `chat_logs` (Firestore desconectado).

## Estructura

- `index.html` — app de administración (RTDB).
- `checkin.html`, `guest-register.html` — formularios públicos (hoy sobre un **Firestore
  desconectado**; pendiente migrarlos al RTDB del admin).

## Desarrollo

Sin build. Para validar el JS del módulo: extraer el `<script type="module">` de `index.html` y
correr `node --check`. Trabajo directo en `main`, commits claros.
