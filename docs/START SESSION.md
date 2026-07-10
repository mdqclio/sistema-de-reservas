# START SESSION — Sistema de Reservas Puerto Delfín

Usá este archivo al inicio de cada sesión para darle contexto a Claude.

## Contexto del proyecto

Sistema de gestión de reservas para **Cabañas Puerto Delfín** (Mar de las Pampas, Buenos Aires).
Basado en el sistema del Alula Hostel, adaptado para 12 cabañas.
Un solo archivo `index.html` (~6.100 líneas) deployado en GitHub Pages.

**Repo**: `mdqclio/sistema-de-reservas` → `mdqclio.github.io/sistema-de-reservas/`

## Cómo retomar

Hay dos formas:

1. **Subir el `index.html` actual** y decirle a Claude:
   *“Continuamos el sistema de reservas de Puerto Delfín. Te adjunto el index.html actual y los docs.”*
1. **Que Claude lo baje del repo** (más rápido, no hace falta subir nada):
   
   ```
   https://raw.githubusercontent.com/mdqclio/sistema-de-reservas/main/index.html
   ```
   
   (también `docs/checkin.html` y `docs/guest-register.html` — están en `/docs/`, no en la raíz)

Subí también los `.md` de `/docs/` si hay cambios importantes.

## Estado actual del sistema (v1.1)

### ✅ Funcionando

- **Concurrencia (multi-usuario) en todos los nodos-colección**: `onValue` + escritura por
  hijo vía `makeLiveCollection`. Reservas/huéspedes/pagos ya lo tenían; ahora también
  pipeline, roles, usuarios, categorías, proveedores, auditoría, cierres, tipo de cambio,
  recurrentes, presupuestos y KB. (precios y bot_config quedan como config de objeto único.)
  `liveRerender(section, fn)` re-renderiza solo si la sección está activa y no hay modal.
- Login + roles granulares (admin, recepcion, ventas, limpieza) con permisos por módulo
- Dashboard con métricas y gráficos (Chart.js) + fechas importantes
- Mapa de 12 cabañas con estados free/dirty/maintenance + ocupación derivada de las reservas;
  color **consistente con el badge** (un `'occupied'` viejo en `beds` ya no lo pinta ocupado).
  Se auto-refresca al cambiar reservas/huéspedes/beds.
- Reservas con grilla tipo Excel + **grilla calendario rediseñada** (ancho completo; cada reserva
  como una barra con nombre+apellido y "debe $X"; precio/noche en celdas libres; carga por 2 clicks)
- **Buscador con autocompletado de huésped** en el modal de reserva (reemplaza el viejo select)
- **Log de auditoría integral**: se registra toda mutación + login/logout; visor propio
  (sección "Log de Actividad", grupo Configuración) con filtro por entidad
- `CABANA_CONFIG`: tipo/m²/capacidad por cabaña (Mono 1-4 · 2 Amb 5,6,9,10 · Loft 7,8,11,12)
- Check-in / Check-out (sin campo de llave)
- Pipeline CRM (kanban de leads: consulta → presupuesto → confirmada → perdida)
- Huéspedes con ciudad, foto DNI, score (estrellas) y Lista Negra con link público
- Pre check-in público por link único por reserva (`docs/checkin.html`)
- Autocarga de huéspedes (`docs/guest-register.html`)
- **Motor de precios rediseñado** — cascada **noche por noche** (`calcularPrecioReserva`):
  temporada por cabaña (alta/base/baja) o **fecha especial** (override absoluto que pisa base
  y finde) → recargo de finde → **ajuste exclusivo** (promo · último momento · ocupación, en
  ese orden de prioridad). **Precios dinámicos** (ocupación + último momento), **cargos únicos**
  por reserva y **promo manual** (dropdown en el form → `r.promo`, no auto-aplica). Ver
  `docs/PRECIOS.md`. Con los nodos nuevos vacíos, da exactamente `precio × noches`.
- **Facturación**: `facturado` + `nroComprobante` en movimientos (check-in y caja), IVA solo
  sobre lo facturado, resumen cobrado/facturado/sin facturar por reserva y en Contabilidad,
  movimientos linkeados a la reserva por `reservaId`
- Contabilidad completa: movimientos, categorías, proveedores, presupuestos,
  gastos recurrentes, auditoría, exportar CSV
- Caja diaria con arqueo y cierres
- Cotización del dólar en vivo (`fetchCotizacionDolar`)
- Base de Conocimiento editable desde la app
- Configuración del Bot editable (`bot_config`: hostel, horarios, servicios, quick replies)
- Ubicación correcta: Mar de las Pampas (no Mar del Plata)

### ⏸️ Deprecado / fallback

- **Chatbot embebido**: comentado en la UI (nav + panel flotante) y `loadApiKeyFromDB()` comentado.
  La lógica sigue en el código pero **el bot se mueve a `mibot247/botcontrol` + n8n** (ver CHATBOT.md);
  el chat del browser queda como fallback.

### 🔧 Bugs conocidos / Pendientes técnicos

- ✅ **Color del mapa: RESUELTO** — una cabaña sin reserva activa solo respeta dirty/maintenance;
  ignora un `'occupied'` viejo del nodo `beds` → se ve Libre/verde (consistente con el badge).
- ✅ **Precio default `510000`: RESUELTO** — el prefill y la grilla salen de `precioNocheCascada`
  (temporada por cabaña); ya no hay número fijo. (El `510000` que queda es solo el seed de
  `initData` para las cabañas 1-8, dato real, no un default de cálculo.)
- ✅ **Total de la reserva: RESUELTO** — `calcTotalReserva` calcula con solo cabaña + fechas
  (sin precio manual usa la cascada); el precio manual pasó a ser override opcional.
- ✅ **IDs de precios: RESUELTO** — temporadas/findes/promos/fechas_especiales/cargos_unicos
  usan push key (`nuevoPrecioId`), ya no `Date.now()`. (Siguen con `Date.now()`
  roles/usuarios/categorías/proveedores/pipeline/recurrentes — funcionan como clave de hijo,
  conviene unificar.)
- La función se llama `camaLabel()`, NUNCA `cabañaLabel()` (bug histórico, hoy OK)
- **Terminología “cama” todavía en la UI**: modal “Cambio de Cama”, “Mapa Camas”,
  tooltips “Cab./Cama”, opciones “Cama X”. Pendiente cambiar a “cabaña”.
- El usuario admin del seed tiene email vacío — hay que completarlo en `usuarios`

### 📋 Features pendientes

- [ ] **Facturación electrónica ARCA (WSFEv1)** — Factura B/A con desglose de IVA, adaptando
  el skill `afip-facturacion`, corriendo en Hetzner vía n8n. Hoy solo hay flags manuales
  (`facturado`/`nroComprobante`); no se emiten comprobantes. Ver TAREAS.md (Bloque 4).
- [ ] **Staging/validación**: los formularios públicos (`checkin.html`/`guest-register.html`)
  **todavía escriben en Firestore**, sin auth anónima ni nodo `/cabanas/pendientes` — sin
  implementar. Migrar a un nodo de staging en RTDB + bandeja de pendientes en el admin.
- [ ] **Reglas de seguridad de Firebase** (RTDB + Storage) por rol.
- [ ] **Bot → `mibot247/botcontrol` + n8n (Hetzner)** (multi-tenant; el chat embebido del browser
  queda como fallback). WhatsApp / Telegram / Instagram-Facebook se conectan desde ahí.
- [ ] Sincronización Booking/Airbnb (Beds24)
- [ ] Web pública nueva (`web-puertodelfin.html`, falta subir con fotos reales)
- [ ] Fotos: carpetas en Google Drive `1DrbkTibO1MuH68dRpFMKzrefFmqokWDj` y `1w5_P6GUOsITiCe7CLkIDTR242RtOVzM_`

## Comandos útiles de verificación

```bash
# Bajar el index actual del repo
curl -s -o index.html https://raw.githubusercontent.com/mdqclio/sistema-de-reservas/main/index.html

# Verificar sintaxis del JS
node --input-type=module << 'EOF'
import { readFileSync, writeFileSync } from 'fs';
const c = readFileSync('index.html', 'utf8');
const s = c.indexOf('<script type="module">');
const e = c.lastIndexOf('</script>');
writeFileSync('/tmp/t.mjs', c.slice(s+22, e));
EOF
node --check /tmp/t.mjs

# Verificar que las funciones usadas en handlers inline (onclick/onchange/oninput)
# estén registradas en Object.assign(window, {...}). node --check NO lo detecta:
# se rompe recién en runtime. Lista los nombres llamados inline para chequear a ojo.
grep -ohE 'on(click|change|input|focus|blur)="([a-zA-Z0-9_]+)\(' index.html \
  | sed -E 's/.*"([a-zA-Z0-9_]+)\(.*/\1/' | sort -u

# Verificar que no queden referencias a cabañaLabel
grep "cabañaLabel" index.html

# Ver cuántos lugares dicen "cama" todavía
grep -niE "cama" index.html | grep -viE "camalabel|camaid"

# Verificar Firebase config y path de DB
grep "sistema-de-reservas-d9e54" index.html
grep "ref(db, 'cabanas'" index.html
```

## Nota sobre la base de datos

El sistema usa **Firebase Realtime Database** (NO Firestore).

- Proyecto: `sistema-de-reservas-d9e54`
- Path: `/cabanas/`
- Acceso vía helper `DB.get(k, def)` / `DB.set(k, v)` sobre un `cache` local
- Nodos actuales: `reservas, huespedes, beds, precios, roles, usuarios, pipeline, conversaciones, movimientos, cierres, categorias, proveedores, recurrentes, presupuestos, auditoria, tipo_cambio_historial, knowledge_base, bot_config, config_groq_key, init_cabanas`
  *(no existe `/cabanas/pendientes`: el flujo de staging aún no se implementó.)*
- El Firestore que se creó al inicio existe pero NO se usa
- Las reglas del RTDB tienen fecha de expiración — revisar si expiraron
