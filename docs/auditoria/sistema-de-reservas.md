# Informe de auditoría — sistema-de-reservas

> Fecha: 2026-06-05 · Repo: `mdqclio/sistema-de-reservas` · rama `main` · 115 commits.
> App de **alto riesgo**: maneja plata (contabilidad, caja, pagos), PII de huéspedes,
> documentos de identidad (DNI) y lista negra.
>
> **Dato estructural clave:** `loadAllData()` baja **todo** `/cabanas/` al navegador de
> cada usuario al loguear. Eso significa que cualquier usuario autenticado ya tiene la
> base completa en su browser, sin importar su rol. Esto reconfigura varios puntos.

Leyenda: 🟢 ok · 🟡 mejorable · 🔴 bloqueante.

---

## 1. Front comprimido, sin source maps, sin secretos cliente — 🔴 ROJO
336 KB sin minify/gzip, sin build. Peor: la **key de Groq (`gsk_`) se guardaba en RTDB**
(`config_groq_key`, "para todos los usuarios") y se bajaba al cliente — secreto real
saliendo por el navegador. Además `loadAllData()` vuelca la base entera al cliente.
La `apiKey` de Firebase es pública por diseño (no cuenta como secreto).
**Riesgo:** cualquier usuario logueado lee la key de Groq desde DevTools y la quema; toda la base viaja al browser.

## 2. Base de datos con RLS por usuario — 🔴 ROJO
Punto crítico, confirmado por la propia doc. `TAREAS.md:45` marca 🔴 *"Reglas de seguridad
de Firebase (RTDB + Storage), por rol"* como **pendiente**. `START SESSION.md:130`:
*"las reglas del RTDB tienen fecha de expiración — revisar si expiraron"* → reglas en modo
test. `loadAllData()` baja `/cabanas/` completo (contabilidad, caja, huéspedes, lista negra,
usuarios, roles, log) a todo usuario.
**Riesgo:** cualquier usuario autenticado —o el mundo si las reglas test expiraron en abierto— accede a plata, PII y documentos de todos. Brecha total.

## 3. Git sin secretos en historial — 🟢 VERDE (con nota)
Historial limpio: solo `apiKey` pública de Firebase + checklist Beds24 (sin token real).
La key Groq vivía en DB, no en git. Faltaba `.gitignore` (agregado).
**Riesgo:** bajo. Importa solo si las reglas RLS son débiles (punto 2).

## 4. APIs con auth, permisos, validación — 🔴 ROJO
Groq se llamaba **directo desde el navegador** con la key sacada de la DB → sin backend, sin
auth. Webhooks n8n + Beds24: `BEDS24 SETUP.md` advierte *"no exponer ningún webhook antes de
las reglas de seguridad #3"* — todavía pendiente.
**Riesgo:** abuso de la key Groq + webhooks expuestos sin auth.

## 5. Hosting, entornos separados, env vars — 🔴 ROJO
Un solo proyecto Firebase, sin dev/staging/prod (`TAREAS.md` lista "staging+validación" como
pendiente). Secretos en DB/localStorage, no en variables de entorno. Sin build ni deploy config.
**Riesgo:** se prueba sobre datos reales de plata y huéspedes; un error rompe producción viva.

## 6. Login, sesiones, vulns comunes — 🔴 ROJO
Firebase Auth + persistencia = base correcta. Pero:
- **Autorización = decorado CSS**: módulos sensibles (contabilidad, caja, lista negra, usuarios,
  roles, log) se ocultan con `display:none` / `.admin-only` (`index.html:2617`). Como
  `loadAllData()` ya bajó la base, un no-admin lee todo desde DevTools.
- **Contraseña en texto plano en RTDB**: al editar un usuario se escribía `u.pass = pass`
  (`index.html:4947`). El login usa Firebase Auth, no ese campo → el campo era un leak inútil.
  (Quitado — ver REMEDIACION.)
- **XSS almacenado**: existe `escapeHtml()` pero se aplicaba inconsistente entre **78** sinks
  `innerHTML`. (Pasada completa hecha el 2026-06-05: la superficie externa —conversaciones del
  widget, leads, chat— ya estaba escapada; se cerraron los huecos de datos admin. Queda 1
  residual de handler inline, ver `REMEDIACION.md`.)
**Riesgo:** escalada de privilegios trivial sobre datos financieros y PII (XSS ya mitigado).

## 7. Rate limiting — 🔴 ROJO
Ninguno. Groq desde cliente sin tope; webhooks sin tope.
**Riesgo:** quema de saldo Groq y abuso de webhooks.

## 8. Caché — 🟡 AMARILLO
Sí hay caché: espejo local `cache` de toda la base + `makeLiveCollection` con sync en vivo →
lecturas rápidas. Problema: cachea todo sin importar permisos (rápido para perf, pésimo para
seguridad — mismo hueco del punto 2/6).
**Riesgo:** perf OK; la estrategia de caché *es* parte del problema de aislamiento.

## 9. Escalabilidad — 🟡 AMARILLO
`loadAllData()` baja `/cabanas/` entero en cada login, sin paginación; las colecciones vivas
re-renderizan en cada cambio. Una propiedad (12 cabañas) va bien; años de historial o
multi-propiedad → el sync de árbol completo de RTDB ahoga al cliente. n8n single = SPOF para
bot/Beds24.
**Riesgo:** se arrastra a medida que crece el historial; no aguanta multi-propiedad sin rediseño.

## 10. Monitoreo de errores, rendimiento y gasto, con alertas — 🔴 ROJO
Cero. Sin tracking de errores, sin alerta de gasto Groq, sin alerta de falla de sync Beds24,
sin métricas. Solo `console.warn`.
**Riesgo:** ciego ante ataques, caídas de sync (= doble reserva) o picos de factura.

---

## Resumen

| # | Punto | Estado |
|---|-------|--------|
| 1 | Front / secretos cliente | 🔴 |
| 2 | RLS base de datos | 🔴 |
| 3 | Git sin secretos | 🟢 |
| 4 | APIs auth/validación | 🔴 |
| 5 | Hosting / entornos | 🔴 |
| 6 | Login / sesiones / vulns | 🔴 |
| 7 | Rate limiting | 🔴 |
| 8 | Caché | 🟡 |
| 9 | Escalabilidad | 🟡 |
| 10 | Monitoreo / alertas | 🔴 |

**Severidad global: no apto para producción con datos reales hasta cerrar puntos 2, 4, 6.**
Combina dinero + documentos de identidad → una fuga es incidente reportable.
</content>
