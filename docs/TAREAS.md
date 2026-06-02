# Tareas / Estado

> Estado al 2026-06-02, contrastado contra `index.html`. Estructura nueva (no había doc previo).

## ✅ Hecho

- **Concurrencia — escritura por hijo + sync en vivo** en `reservas`, `huespedes`, `movimientos`
  y `beds` (objeto-por-id, `writeX`/`removeX`, 4 listeners `onValue`, IDs push-key). Ver
  `ARQUITECTURA.md`.
- **Migración segura** (`migrateNodeToIndexed`): idempotente, gobernada por flag persistente
  `cabanas/_migrado/{coleccion}`, con `update()` merge en vez de `set` del nodo entero.
- **Fotos de DNI — implementada** (lazy en RTDB, nodo `fotos_huespedes/{id}`, dataURL comprimido,
  `tieneFoto`, retrocompat con base64 viejo). Storage descartado (Blaze). **Falta solo PROBAR EN
  VIVO** (carga de foto en el admin → ver que quede URL/dataURL y que la ficha la muestre).
- **XSS / saneamiento** (`escapeHtml` 5 chars incl. comillas, aplicado a todos los datos de
  usuario en los renders; `onclick` sin strings de usuario, solo id).
- **Borrado protegido:** no se borra un huésped con reservas (antes hacía cascada; ahora aborta).
- **Terminología cama→cabaña (texto visible):** migrado por completo — modal "Cambio de Cabaña",
  "Mapa Cabañas", "Cabaña X" en el select, "Cab. / Cabaña" en resúmenes y **"Cabaña actual"**
  (la antes "Cama actual", ya corregida). Identificadores `camaLabel`/`camaId` se mantienen a
  propósito (no se renombran).
- **Precio de reserva:** se eliminó el default fijo `510000` que subcobraba las cabañas 9-12.
  Helper `precioDefaultCabana(hab, fecha)` saca el precio de `precios.habitaciones` según cabaña y
  temporada (`getTipoTemporada` → alta/base/baja; 0 si no hay dato). Lo usan `saveReserva`
  (fallback) y `onHabChange` (autocompleta el precio al elegir cabaña en reserva nueva).
- **Auto-login:** `browserLocalPersistence` + `onAuthStateChanged`; el ingreso se centraliza en
  `enterSession(email)` (idempotente); al refrescar entra directo sin re-login.

## ⏳ Pendiente

- **Staging / validación + sacar Firestore de los formularios públicos.** `checkin.html` y
  `guest-register.html` todavía leen/escriben el Firestore desconectado (colecciones
  `reservations`/`guests`). Migrarlos al RTDB del admin.
- **Reglas de seguridad** (RTDB y, si se usara, Storage). Hoy en modo test. Incluye la **regla
  fina de `fotos_huespedes`** (lectura solo logueados; escritura pública acotada con límite de
  tamaño para el formulario público).
- **Saldo del check-in a la caja** (flujo contable pendiente).
- **IDs robustos (`Date.now()` → push key)** en las entidades de config que aún usan
  `'x'+Date.now()`: temporadas, findes, promos, auditoría, usuarios, proveedores, categorías.
- **Pestaña de Configuración.**
- **Carga (de reservas) desde la grilla.**
- **Probar fotos de DNI en vivo** (la feature está implementada; falta verificación real).

> Nota: la tarea original pedía documentar la línea 4724 ("Cama actual") como pendiente, pero ya
> fue corregida a "Cabaña actual" (commit `7a4f97a`); por eso figura en "Hecho".
