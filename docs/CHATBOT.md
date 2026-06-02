# Chatbot

> Estado al 2026-06-02, leído de `index.html`.

## Estado actual

El chatbot está **desactivado temporalmente** en el arranque (`loadApiKeyFromDB()` comentado en
`loadAllData`: `// CHAT DESACTIVADO TEMPORALMENTE`). El código del chat sigue presente y se puede
reactivar.

## Cómo funciona (cuando está activo)

- **Proveedor LLM:** Groq. La API key se guarda en `localStorage` bajo `cabanas_groq_key`
  (también puede leerse desde la DB con `loadApiKeyFromDB`). Se carga con `saveApiKey()` desde el
  input `chatApiKeyInput`.
- **Contexto:** `buildSystemPrompt()` arma el prompt con datos en vivo del sistema — ocupación,
  reservas, beds (cabañas), precios — más la **base de conocimiento** (`knowledge_base`) y la
  config del bot (`bot_config`), ambos en RTDB bajo `cabanas/`.
- **Render seguro:** los mensajes del usuario se escapan con `escapeHtml(...)` antes de
  inyectarse en el DOM. Las **quick replies** del chat pasan ahora el **índice**
  (`sendQuickReply(i)`) en lugar del texto del mensaje en el `onclick`, y resuelven el mensaje
  adentro (evita inyectar strings de usuario en atributos).

## `chat_logs` — vive en Firestore (desconectado)

- **No existe** un nodo `chat_logs` en la Realtime Database.
- Hay una colección **`chat_logs` en Firestore** (la base vieja, **desconectada** del admin RTDB
  actual) con mensajes reales del bot.
- Es parte del "Firestore desconectado" que también usan los formularios públicos
  (`checkin.html` → `reservations`, `guest-register.html` → `guests`). Ver `ARQUITECTURA.md`.
