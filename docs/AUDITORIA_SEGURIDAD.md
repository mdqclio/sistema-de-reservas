# Auditoría de seguridad — changelog completo y verificable

> Proyecto: `sistema-de-reservas-d9e54` · Repo: `mdqclio/sistema-de-reservas` · rama `main`
> Fecha: 2026-06-06 · App: HTML/JS vanilla single-file (`index.html`) + Firebase **RTDB** (no Firestore).
>
> Cada cambio cita archivo + función + línea (o commit) para que se pueda verificar contra el repo.
> Donde hay una falla en lo que hice, está marcada como tal — no se afirma "hecho" sin mostrar dónde.

---

## 1. Resumen — qué cambié y por qué (en orden)

| # | Commit | Qué |
|---|--------|-----|
| 1 | `d8f7ce2` | Saqué la API key de Groq de RTDB; saqué la contraseña en texto plano; escapé XSS en sinks de datos de admin; **agregué** escritura del nodo `cabanas/acl`; creé `.gitignore`, archivos de reglas (`security/`) y docs de auditoría. |
| 2 | `06749a2` | Doc del resultado de la pasada XSS (solo documentación). |
| 3 | `51fec9e` | Cerré el residual XSS de handler inline (`savePresupuesto`) + escapes en recurrentes / log de auditoría / link WhatsApp. |
| 4 | `7bce0d3` | `firebase.json` + `.firebaserc` (wiring para deploy de reglas). |
| 5 | `547f42b` | Endurecí `.gitignore` (service accounts) + borré `security/sa.` (archivo vacío). |

**Motivo:** auditoría de producción de 10 puntos. Lo crítico que motivó los cambios: secreto de terceros (Groq) viajando al cliente, contraseña en texto plano en la base, XSS por escape inconsistente, y ausencia de reglas de seguridad en la base.

---

## 2. Reglas RTDB — estado actual y corrección necesaria

### 2.a Lo que HAY commiteado hoy en `security/database.rules.json` (commit `d8f7ce2`) — **DEFECTUOSO**

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "cabanas": {
      ".read": "auth != null",
      ".write": "auth != null",
      "acl": {
        "$uid": {
          ".write": "auth != null && auth.uid === $uid"
        }
      }
    }
  }
}
```

Explicación bloque por bloque:
- **`".read": false` / `".write": false`** (raíz): deny-by-default. Todo lo no abierto explícitamente queda negado.
- **`cabanas` → `auth != null`**: cualquier usuario autenticado lee/escribe todo `/cabanas/*`.
- **`acl/$uid` → `auth.uid === $uid`**: *intención* de que cada usuario escriba solo su propio `acl`. **No funciona — ver 2.c y sección 4.**

### 2.b ⚠️ Falla: esta regla ROMPE las fotos de DNI

Las fotos viven en `/fotos_huespedes/` (raíz, **fuera** de `/cabanas/` — ver sección 3). Como esta regla niega la raíz y solo abre `/cabanas`, el path `/fotos_huespedes/` queda **bloqueado** → lectura y escritura de fotos rotas si se deploya tal cual. **No estaba contemplado en la regla commiteada.**

### 2.c Reglas CORREGIDAS (propuestas — NO commiteadas todavía)

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "cabanas": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "fotos_huespedes": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

- Se **agrega** `fotos_huespedes` con `auth != null` → arregla la rotura del 2.b.
- Se **quita** el bloque `acl` → bajo estas reglas no aporta seguridad (ver sección 4) y confunde.
- Postura: deny-by-default en la raíz; solo usuarios autenticados acceden a `/cabanas` y `/fotos_huespedes`. **Esto NO da aislamiento por rol** (cualquier autenticado ve todo); el aislamiento por rol queda pendiente (sección 7).

---

## 3. Fotos de DNI — siguen en la RAÍZ `/fotos_huespedes/{id}`

**NO se movieron.** Siguen top-level, fuera de `/cabanas/`. Verificable en `index.html`:

| Acción | Función / contexto | Línea | Código |
|---|---|---|---|
| Comentario que lo documenta | (sobre `subirFotoHuesped`) | ~3823 | "nodo TOP-LEVEL /fotos_huespedes/{id} (FUERA de /cabanas/)" |
| **Escritura** | `subirFotoHuesped` | ~3826 | `set(ref(db, 'fotos_huespedes/' + id), dataUrl)` |
| **Lectura** | (helper get) | ~3829 | `get(ref(db, 'fotos_huespedes/' + id))` |
| **Borrado** | (helper remove) | ~3833 | `remove(ref(db, 'fotos_huespedes/' + id))` |
| Lazy-load en detalle | `renderGuestDetail` | ~3736–3739 | lee `/fotos_huespedes/{id}` si `tieneFoto` |
| Escritura admin | `saveHuesped` | ~3853–3855 | sube foto antes de guardar el huésped |
| Escritura público | auto-registro | ~5242–5251 | mismo patrón desde `guest-register` embebido |

**Ninguna de estas funciones fue modificada en la auditoría.** Las fotos son base64 dataURL en RTDB (no Cloud Storage).

**¿Se contempló?** **No.** La regla commiteada (2.a) bloquea `/fotos_huespedes/`. Además, `security/storage.rules` protege un path de Cloud Storage `/huespedes/` que **la app no usa** (`grep getStorage` = 0) → reglas de Storage apuntando al lugar equivocado. La corrección está en 2.c (agregar `fotos_huespedes` a las reglas de RTDB).

---

## 4. Nodo `cabanas/acl/$uid`

- **Qué guarda:** `{ rol, rolKey, email }` del usuario logueado.
- **Quién lo escribe:** `enterSession` en `index.html`, **~línea 2581** (commit `d8f7ce2`):
  `set(ref(db, 'cabanas/acl/' + auth.currentUser.uid), { rol: u.rol, rolKey, email: u.email })`.
- **Quién lo lee:** **ninguna función de la app** (`grep "cabanas/acl"` solo encuentra el write). Lo único que lo referencia es la plantilla `security/database.rules.per-rol.template.json` (Tier 2), no deployada → hoy es **dato muerto, write-only**.

### Cascada de reglas — confirmado: la restricción NO se aplica

En RTDB las reglas **cascadean** y **un hijo no puede revocar lo que un ancestro concede** (las reglas hijas solo pueden *otorgar* acceso adicional, nunca restringir). Como `/cabanas` ya da `".write": "auth != null"`, eso aplica a TODO lo de abajo, incluido `acl/$uid`. Por lo tanto `"auth.uid === $uid"` es un **no-op**: **cualquier usuario autenticado puede escribir cualquier `cabanas/acl/*`**.

**¿Se sabía?** Parcialmente. En `security/README.md` y en la plantilla Tier 2 se advirtió el riesgo de **auto-escalada** (que un usuario se asigne `rolKey:'admin'`). **No se explicó** que bajo estas reglas (Tier 1) la regla hija ya es inerte por la cascada. La observación es correcta.

**Qué se pretendía:** sembrar `uid → rol` para que reglas Tier 2 (donde `/cabanas` no daría `.write` general) pudieran leer el rol. Pero el diseño es defectuoso: (a) inútil en Tier 1 por la cascada; (b) peligroso en Tier 2 porque el propio usuario escribe su `acl` (auto-escalada). **Modelo correcto:** `acl` escrito solo por un admin, o derivado del nodo `usuarios`, o vía custom claims — nunca por el propio usuario. Por eso 2.c **quita** el bloque `acl`.

---

## 5. Archivos tocados

**Solo se modificó `index.html`** (+ docs y archivos de config). **NO se tocaron `docs/checkin.html` ni `docs/guest-register.html`** (no aparecen en ningún commit de la auditoría). **NO se tocó Firestore** — la app usa solo RTDB (`grep getFirestore|firebase-firestore` = 0).

### Cambios en `index.html`

| Función | Línea (aprox) | Commit | Cambio |
|---|---|---|---|
| `enterSession` | ~2581 | d8f7ce2 | **AGREGA write** `set(ref(db,'cabanas/acl/'+uid), {rol,rolKey,email})` (nodo de sección 4) |
| `renderFechasImportantes` | ~2835 | 51fec9e | `${e.tel}` → `${encodeURIComponent(e.tel)}` en href de WhatsApp |
| `renderPrecios` | ~3932 | d8f7ce2 | `escapeHtml(h.hab)`, `escapeHtml(h.nombre)` |
| `populateProvSelect` | ~4170 | d8f7ce2 | `escapeHtml(p.id)`, `escapeHtml(p.nombre)` en `<option>` |
| `renderPresupuesto` | ~4376, ~4382 | d8f7ce2 / 51fec9e | `escapeHtml(r.cat.nombre)`; input pasa a `data-cat`/`data-mes` + `onchange="savePresupuesto(this)"` |
| `savePresupuesto` | ~4399 | 51fec9e | **cambia firma** `(cat,mes,monto)` → `(el)`, lee de `el.dataset`. El write `colPresupuestos.write({id,cat,mes,monto})` no cambia en contenido |
| `renderListaCategorias` | ~4552 | d8f7ce2 | `escapeHtml(c.nombre)` |
| `renderRecurrentes` | ~4415 | 51fec9e | `escapeHtml` en `concepto`, `cat`, `metodo` |
| `renderAuditoria` | ~4526 | 51fec9e | `escapeHtml` en `usuario`, `accion`, `entidad`, `detalle` |
| `renderProveedores` | ~4607 | d8f7ce2 | `escapeHtml` en `nombre`/`cuit`/`rubro`/`contacto`/`notas` |
| `renderUsuarios` | ~4875 | d8f7ce2 | `escapeHtml(u.nombre)`, `escapeHtml(u.email)` |
| `saveUsuario` | ~4955 | d8f7ce2 | **cambia write:** `u.pass = pass` → `delete u.pass` (afecta `colUsuarios.write(u)`, set por hijo) |
| `saveApiKey` | ~5898 | d8f7ce2 | **quita write:** elimina `DB.set('config_groq_key', key)` |

### Rutas de escritura a Firebase tocadas
Sí, tres:
1. **Quitada:** `DB.set('config_groq_key', key)` en `saveApiKey` (~5898). La key de Groq ya no se persiste en RTDB.
2. **Cambiada:** `saveUsuario` (~4955) — `delete u.pass` antes de `colUsuarios.write(u)`; el registro de usuario ya no lleva contraseña en texto plano.
3. **Agregada:** `enterSession` (~2581) — `set(ref(db,'cabanas/acl/'+uid), {...})` (nodo defectuoso de sección 4).

La escritura de `savePresupuesto` no cambió en contenido (solo de dónde toma los argumentos).

### Otros archivos creados/modificados (no `index.html`)
- `.gitignore` (d8f7ce2, endurecido en 547f42b)
- `firebase.json`, `.firebaserc` (7bce0d3)
- `security/database.rules.json`, `security/database.rules.per-rol.template.json`, `security/storage.rules`, `security/README.md` (d8f7ce2)
- `docs/auditoria/README.md`, `docs/auditoria/REMEDIACION.md`, `docs/auditoria/sistema-de-reservas.md` (d8f7ce2, 06749a2)

---

## 6. Pendientes / asunciones

1. **🔴 Las reglas commiteadas rompen las fotos de DNI** (sección 2.b/3). `security/database.rules.json` no incluye `/fotos_huespedes`. **No deployar tal cual.** Corrección propuesta en 2.c, **sin aplicar**.
2. **🔴 El nodo `acl` y su regla son defectuosos** (sección 4): no-op en Tier 1, riesgo de auto-escalada en Tier 2. El write en `enterSession` (~2581) sigue escribiendo dato muerto. Decisión pendiente: quitarlo o rediseñar (admin-only / custom claims).
3. **`security/storage.rules` apunta a un path inexistente** (`/huespedes/` en Cloud Storage, que la app no usa). Inofensivo pero inútil; corregir o eliminar.
4. **XSS:** se cubrieron los sinks de datos de admin y se verificó que los externos (conversaciones del widget) ya escapaban. **No** se re-auditó cada uno de los ~78 sinks `innerHTML` con datos de producción reales.
5. **Asunción no confirmada:** que la credencial de n8n (httpQueryAuth) bypassa las reglas (legacy DB secret) y por eso el bot seguiría leyendo tras deployar. **No verificado contra n8n** → probar el bot después de publicar.
6. **Tier 2 (per-rol):** plantilla sin probar, depende del `acl` defectuoso. No usable como está.
7. **Nada deployado:** todas las reglas siguen sin publicar en Firebase.

---

_Generado como parte de la auditoría de seguridad. Las líneas son aproximadas (el archivo se editó entre commits); las funciones y los commits son la referencia estable para verificar._
