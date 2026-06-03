# BEDS24 — Checklist de configuración

> Qué dejar listo en Beds24 ahora (en paralelo al desarrollo) para que la
> integración con el sistema sea rápida cuando lleguemos a ella.
> Basado en la documentación de Beds24 (API V2 + channel manager).

## Encuadre: son DOS integraciones distintas

1. **Beds24 ↔ Booking/Airbnb** (el channel manager). Es independiente de nuestro
   código. Apenas conectes y mapees las OTAs, Beds24 ya evita las dobles reservas
   *entre* Booking y Airbnb. Esto se gana solo, ya.
1. **Beds24 ↔ nuestra app (Firebase)** vía API/webhook → n8n. Es la **Fase 2** y
   depende del Bloque 0 del TAREAS.md (#1 concurrencia, #2 una sola base + staging,
   #3 reglas de seguridad) antes de exponer cualquier webhook.

Toda la Fase 1 se puede hacer en el **free trial** de Beds24 (sin compromiso),
así no se arranca pagando.

-----

## Fase 1 — Configurar ahora (sin tocar código)

- [ ] Crear la cuenta y cargar la propiedad. Como alquilamos unidades completas,
  cada cabaña se define como una “Room” en Beds24 (aunque sea la unidad entera).
- [ ] Cargar las 12 cabañas con capacidades, fotos y tarifas (alta/base/baja),
  espejando lo que ya está en el sistema propio.
- [ ] Conectar las OTAs en *Settings → Channel Manager → Booking.com / Airbnb*.
  - Booking.com: la conexión se inicia desde el Extranet de Booking.
  - Airbnb: la conexión tiene que ser desde la **cuenta dueña** (no co-host).
- [ ] **Mapear cada habitación de la OTA a una Room de Beds24.** Crítico: una
  habitación de OTA sin mapear nunca se actualiza y puede causar sobreventas.
- [ ] Importar las reservas próximas que ya existan en Booking/Airbnb (para evitar
  dobles reservas). El botón de importar está disponible cuando el channel manager
  está configurado pero todavía no activado.
- [ ] Decidir *cuándo* activar la sincronización en vivo. Ojo: al activar el channel
  manager, el canal deja de enviar notificaciones (Beds24 pasa a manejar la sync).
  Activar recién con todo mapeado y revisado.

## Fase 2 — Dejar preparado para la integración con el sistema

- [ ] Generar acceso a la **API V2** (la recomendada para proyectos nuevos):
  panel → *Settings → Marketplace → API → “Generate invite code”*. El invite code
  se intercambia por un **refresh token** + token vía el endpoint /authentication/setup.
- [ ] Elegir los **scopes** justos: `bookings` (info básica), `bookings-personal`
  (datos del huésped), `bookings-financial` (info financiera). Para empezar,
  lectura de reservas alcanza.
- [ ] Guardar el **refresh token** en lugar seguro (después va en n8n). Los tokens
  de acceso expiran a las 24 h; el refresh token no expira mientras se use dentro de
  los 30 días. En n8n se arma un flujo que renueve el token cada 24 h (mismo patrón
  que Beds24 documenta para Make: un store con el token + un trigger cada 24 h).
- [ ] Ubicar (sin completar todavía) el webhook: *Settings → Properties → Access →
  Booking webhooks*. La URL apuntará a n8n, así que ese campo se completa en la Fase 2.
  Las reservas se pueden traer con GET /bookings, por webhook, o combinando las dos.
- [ ] (Recomendado) Crear una **propiedad de prueba** con reservas para testear la
  API sin tocar lo real.

-----

## Decisión grande a madurar mientras se configura

**¿La fuente de verdad de la disponibilidad va a ser Beds24 o la base propia?**

- Si las reservas directas también pasan por Beds24 → Beds24 es el hub central.
- Si las directas viven en el sistema propio → hay que sincronizar en ambos sentidos.

Conocer el panel ayuda a definirlo, y esa decisión define cómo se arma la Fase 2.

## Notas técnicas para la Fase 2 (n8n)

- Preferir **webhooks** sobre polling para reservas nuevas/modificadas.
- Cachear del lado propio lo que no cambia seguido (detalles de propiedad, amenities).
- Respetar los límites de uso de la API (backoff ante 429/500, no reintentar agresivo).
- Mapear la reserva externa → nodo `reservas` con: id externo de Beds24, `plataforma`
  (booking/airbnb) y la comisión que ya está modelada en `precios.plataformas`.
