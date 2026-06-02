# Arranque de sesión

> Orientación rápida para empezar a trabajar en este repo. Estado al 2026-06-02.

## Qué es

App de administración de reservas de **Cabañas Puerto Delfín**. Todo vive en un único
`index.html` (vanilla JS + Firebase **Realtime Database** + Firebase Auth). Sin build: se abre el
archivo / se sirve estático.

## Leé esto primero

- `docs/ARQUITECTURA.md` — modelo de datos, escritura por hijo, listeners, fotos, Firestore legacy.
- `docs/TAREAS.md` — qué está hecho y qué falta.
- `docs/CHATBOT.md` — bot (Groq, desactivado) y `chat_logs` (Firestore).

## Reglas de oro (no romper)

- **NO tocar la capa de concurrencia** salvo que la tarea lo pida explícito:
  `writeReserva/writeHuesped/writeMovimiento/writeBed` (+ `remove*`), los `onValue`,
  `loadAllData` (seeding) y `migrateNodeToIndexed`. Está testeada y funcionando.
- **Escritura siempre por hijo** en reservas/huespedes/movimientos/beds. Nunca `set` del nodo
  entero de esas colecciones (pisa registros de otros usuarios).
- **IDs nuevos con push-key** (`nuevaReservaId`/`nuevoHuespedId`/`nuevoMovimientoId`).
- **Escapar datos de usuario** con `escapeHtml(...)` antes de meterlos en HTML; en `onclick`
  pasar solo el `id`, nunca nombres/textos.
- **Fotos de DNI:** van a `fotos_huespedes/{id}` (top-level, fuera de `cabanas/`), lazy. No usar
  Storage (Blaze).
- **Identificadores `camaLabel`/`camaId`/`openCambioCama`/etc. NO se renombran** (solo se cambió
  el texto visible cama→cabaña).

## Estado al día de hoy

- ✅ Concurrencia, migración segura, XSS, borrado protegido, terminología (texto), precio por
  cabaña/temporada, auto-login, fotos lazy (implementadas).
- ⏳ Probar fotos en vivo; reglas de seguridad RTDB (+ regla fina `fotos_huespedes`); sacar
  Firestore de los forms públicos (`checkin.html`/`guest-register.html`); saldo del check-in a la
  caja; IDs robustos en config; pestaña de Configuración; carga desde la grilla.

## Workflow

- Trabajar directo en `main` salvo cambios de riesgo. Commits claros, push al terminar.
- Verificación mínima de JS: extraer el `<script type="module">` y correr `node --check`.
