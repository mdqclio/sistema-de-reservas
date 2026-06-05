# Reglas de seguridad — Firebase

Proyecto: `sistema-de-reservas-d9e54`.

## Orden de despliegue recomendado

### 1. AHORA — cerrar el acceso anónimo (sin riesgo, sin cambios de app)

Pegá **`database.rules.json`** (Tier 1) en:
> Firebase Console → Realtime Database → pestaña **Reglas** → pegar → **Publicar**.

Esto hace que **todo** `/cabanas/` requiera usuario autenticado y deniega el resto por
defecto. Mata el riesgo de "base abierta al mundo / reglas test expiradas". La app sigue
funcionando igual (cualquier usuario logueado lee/escribe como hoy, pero ya no hay acceso
anónimo).

Pegá **`storage.rules`** en:
> Firebase Console → Storage → pestaña **Reglas** → pegar → **Publicar**.

### 2. DESPUÉS — aislamiento por rol (requiere prueba)

`database.rules.per-rol.template.json` es una **plantilla**, no la pegues a ciegas:

1. Desplegá la app con el cambio de `enterSession` que escribe `/cabanas/acl/{uid}` (ya está
   en `index.html`). Hacé que cada usuario loguee al menos una vez para poblar `acl`.
2. Verificá en la consola que `/cabanas/acl/{uid}` tiene `rolKey` correcto para cada uno.
3. Asegurá un admin bootstrap: si tu propio `acl/{uid}.rolKey` no es `admin`, ponelo a mano
   en la consola antes de publicar (si no, te bloqueás de los módulos admin).
4. Probá las reglas en un **proyecto staging** o con el simulador de reglas de la consola.
5. Recién ahí publicá la versión por rol.

> **Pendiente de diseño antes de producción:** que un usuario no pueda auto-asignarse
> `rolKey:'admin'` escribiendo su propio nodo `acl`. La fuente de verdad del rol es el nodo
> `usuarios` (que solo edita un admin); `acl` debe derivarse de ahí, no ser auto-editable.
> Idealmente migrar a Cloud Functions o re-keyear `usuarios` por `auth.uid`.

## Por qué no se despliega desde acá

No hay credenciales de Firebase en este entorno y desplegar reglas sobre una base de
producción viva es una acción irreversible que debe hacer una persona con acceso, revisando.
Estos archivos son para pegar/revisar.
