# Chatbot — Asistente Virtual Puerto Delfín

> ⚠️ **ESTADO: DESACTIVADO TEMPORALMENTE.**
> El chat está comentado en la UI (nav item y panel flotante) y `loadApiKeyFromDB()`
> está comentado dentro de `loadAllData()`. La lógica (`buildSystemPrompt`, `sendMessage`,
> `initChatbot`, etc.) sigue en el código, lista para reactivar descomentando esos bloques.

## Stack

- **Modelo**: Groq `llama-3.3-70b-versatile`
- **Límite gratuito**: 100.000 tokens/día (se resetea cada 24hs)
- **API Key**: se guarda en Firebase `/cabanas/config_groq_key` y en `localStorage('cabanas_groq_key')`

## Conocimiento del bot

El conocimiento ya **NO está hardcodeado** (cambio importante respecto a versiones viejas).
`buildSystemPrompt()` arma el prompt combinando tres fuentes:

### 1. `bot_config` (nodo en Firebase, editable desde 🤖 Configuración del Bot)

- `nombre_hostel`, `ubicacion`, `checkin`, `checkout`
- `descripcion_cabanas` (capacidades, vista al mar, distancia a la playa)
- `servicios` (desayuno, pileta, mascotas, parrilla, WiFi, TV, estacionamiento)
- `info_adicional`
- `quick_replies` (botones rápidos del chat)

### 2. `knowledge_base` (módulo 🧠 Base de Conocimiento)

- Preguntas y respuestas frecuentes
- Precios y políticas especiales
- Links (se renderizan clickeables automáticamente)

### 3. Tiempo real (se recalcula en cada mensaje, desde `reservas`, `beds`, `precios`)

- Cabañas en mantenimiento (según estado en `beds`)
- Ocupación de hoy, libres de hoy
- Check-ins de hoy y mañana, check-outs de hoy
- Precios por temporada y por cabaña (alta/base/baja) desde el nodo `precios`
- Disponibilidad calculada con `disponibilidadEnFecha()`

> Solo queda un string mínimo `infoCabañas` con las capacidades por rango de cabaña;
> el resto de la información ya es dinámico.

## Botones en cada respuesta

- **📋 Copiar** → copia texto plano al clipboard (para pegar en WhatsApp/Instagram)
- **✏️ Corregir → KB** → abre modal para editar la respuesta y guardarla en la Base de Conocimiento
  - Pre-carga la pregunta del usuario
  - Si ya existe una entrada con esa pregunta, la actualiza; si no, crea una nueva

## Quick replies

Definidos en `bot_config.quick_replies` y editables desde Configuración del Bot.
Por defecto: 💰 Precios · 🏕️ Cabañas · 📍 Ubicación · ⏰ Horarios · 🐾 Mascotas · 🥐 Desayuno · 🏊 Pileta · 📅 Reservar.

## Modo admin

Cuando el usuario logueado tiene rol admin, el bot acepta correcciones/actualizaciones
que se guardan en `knowledge_base`.

## Renderizado de respuestas

Las respuestas del bot soportan:

- `**texto**` → negrita
- `\n` → salto de línea
- `https://wa.me/...` → 💬 WhatsApp (link clickeable)
- `https://maps.google.com/...` o `https://goo.gl/maps/...` → 📍 Ver en Google Maps
- Cualquier otra URL → 🔗 link genérico

## Pendiente

- [ ] **Reactivar el chat** (descomentar nav item, panel flotante y `loadApiKeyFromDB()`)
- [ ] Conectar a WhatsApp (Twilio, número nuevo, ~$1/mes)
- [ ] Conectar a Telegram (BotFather, gratis, más simple)
- [ ] Conectar a Instagram DMs (Meta API)
- [ ] Conectar a Facebook Messenger (sale junto con Instagram)
- [ ] Considerar Claude Haiku en lugar de Groq para producción (más estable, sin límite diario)

## Funciones clave del chatbot en index.html

`buildSystemPrompt()` · `disponibilidadEnFecha()` · `getQuickReplies()` · `loadApiKeyFromDB()` ·
`initChatbot()` · `sendMessage()` / `sendChat()` · `sendQuickReply()` · `addBotMessage()` ·
`copyMsg()` · `editBotMsg()` / `saveEditedBotMsg()` · `renderBotConfig()` / `saveBotConfig()` ·
`saveQuickReplies()` · `toggleChatFloat()`

## Arquitectura multi-canal futura

```
Instagram DM  ─┐
Facebook MSG  ─┤→ Netlify Function webhook → Groq/Claude API
WhatsApp      ─┘         ↕
                    Firebase RTDB
Telegram ──────────→ Telegram Bot API    (reservas + KB)
```