# Remediación — estado de los arreglos

Fecha: 2026-06-05. ✅ hecho en código · 📄 entregado como archivo a desplegar · ⏳ pendiente (requiere acción externa).

## Hecho en este repo (working tree, sin commitear todavía)

| # | Arreglo | Estado | Dónde |
|---|---------|--------|-------|
| 1 | Key Groq deja de guardarse en RTDB (era secreto compartido a todos) | ✅ | `index.html` `saveApiKey()` |
| 2 | Contraseña en texto plano: deja de escribirse en RTDB + borra histórica (`delete u.pass`) | ✅ | `index.html` edición de usuario |
| 3 | Escapado XSS en sinks de datos de usuario (usuarios, proveedores, categorías, precios) | ✅ | `index.html` (9 sinks) |
| 4 | Escritura `/cabanas/acl/{uid}` en login para habilitar reglas por rol | ✅ | `index.html` `enterSession()` |
| 5 | `.gitignore` (evita commitear secretos a futuro) | ✅ | `.gitignore` |
| 6 | Reglas RTDB Tier 1 (cierra acceso anónimo/mundial) | 📄 | `security/database.rules.json` |
| 7 | Reglas RTDB Tier 2 por rol (plantilla) | 📄 | `security/database.rules.per-rol.template.json` |
| 8 | Reglas de Storage (bucket auth-only) | 📄 | `security/storage.rules` |

## Pendiente — acción del dueño (fuera del repo)

| # | Arreglo | Punto auditoría | Prioridad |
|---|---------|-----------------|-----------|
| A | **Desplegar `database.rules.json` (Tier 1) en Firebase Console** | 2 | 🔴 ya |
| B | **Desplegar `storage.rules`** | 2 | 🔴 ya |
| C | Revisar si las reglas test actuales ya expiraron (abierto/cerrado) | 2 | 🔴 ya |
| D | Mover la llamada a Groq a backend (n8n) con la key fuera del cliente | 1,4 | 🔴 |
| E | No exponer webhooks Beds24/n8n sin auth + las reglas (#A) | 4 | 🔴 |
| F | Desplegar reglas Tier 2 por rol tras poblar `acl` y probar en staging | 6 | 🟠 |
| G | Rate limiting en webhooks y en la llamada Groq (vía backend) | 7 | 🔴 |
| H | Separar entornos dev/staging/prod + variables de entorno | 5 | 🟠 |
| I | Monitoreo de errores + alertas de gasto (Groq/Firebase) + falla de sync Beds24 | 10 | 🔴 |
| J | Paginación / no bajar `/cabanas/` entero por login (escala) | 8,9 | 🟡 |

## Limitaciones de lo arreglado en código

- **XSS:** se cubrieron los sinks de datos de usuario más claros (tablas de usuarios,
  proveedores, categorías, precios). Quedan ~78 usos de `innerHTML` en total; conviene una
  pasada completa dedicada para auditar los restantes (mensajes de chat, pipeline de leads,
  detalle de huésped ya usaban `escapeHtml`).
- **Autorización:** el escape y la limpieza de secretos **no** reemplazan las reglas de
  Firebase. Mientras la base se baje entera al cliente, el aislamiento real depende del
  punto #A/#F. El `.admin-only` sigue siendo solo cosmético hasta desplegar Tier 2.
- Los cambios de código **no fueron commiteados** — revisar y commitear/desplegar la app
  para que tomen efecto.

## Verificación hecha

- `node --check` sobre el `<script type="module">` extraído → sintaxis OK.
- Confirmado: `config_groq_key`→DB eliminado, `u.pass = pass` eliminado, `acl` agregado.
</content>
