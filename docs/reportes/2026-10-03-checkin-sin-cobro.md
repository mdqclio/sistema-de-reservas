# Check-in separado del cobro

Branch: `feat/checkin-sin-cobro` (desde `main` ec08bfb). **No mergeado**: Leonardo verifica primero.

## Problema

`confirmCheckin` registraba el saldo pendiente como ingreso en caja (`cat: 'Reserva / Check-in'`) y
dejaba la reserva como pagada (`pagado = total`, `saldo = 0`). En la realidad el huésped paga durante
la estadía o al irse, así que Franco y Mariana no hacían el check-in para no registrar un cobro falso,
y el sistema no sabía quién estaba alojado.

## 1 — El check-in deja de cobrar

- Nueva `marcarCheckin(r, { hora, obs, llave })`: estado `checkin`, hora/obs, consume el token de pre
  check-in, `writeReserva`, cabaña `occupied`, auditoría. **No escribe movimientos ni toca
  `pagado` / `saldo` / `estadoPago`.** La usan el modal de check-in (`confirmCheckin`) y el
  recordatorio (punto 4): una sola lógica.
- Fuera del flujo: el registro del saldo, el cálculo del monto (cascada), y los campos de facturación
  del cobro (`ci-facturado`, `ci-comprobante`, `onCiFacturadoChange`, sacada también de `window`).
- El modal de check-in muestra, si hay, "Saldo pendiente $X · se registra con 💰 Cobrar cuando
  paguen", en texto neutro (sin alarma). La tabla "En el complejo" ya mostraba "Debe $X": sigue igual.
- La hora de ingreso por defecto ahora es la hora argentina (`ahoraArgentina()`), no la del dispositivo.
- El cobro sigue por 💰 Cobrar (`openPago` → `savePago`): **sin cambios**.
- La categoría `Reserva / Check-in` sigue existiendo en la lista de categorías (hay movimientos
  históricos con ella y se puede usar a mano).

### ⚠️ Decisión a revisar: comisión de plataforma

El check-in también registraba la **comisión de plataforma** (egreso, `cat: 'Comisión plataforma'`,
% del total, con guard `r.comisionRegistrada`). El pedido dice que el check-in no escriba movimientos,
pero borrarla dejaría de registrar comisiones (plata real que se le debe a Booking/Airbnb).
**La moví al check-out** (`registrarComisionPlataforma`, misma lógica y mismo guard, llamada desde
`doCheckout`): al concluir la estadía la comisión se devenga. Las reservas que ya la registraron en el
check-in viejo tienen el flag y **no duplican**. Si preferís otro momento (al crear la reserva, al
primer cobro, o manual), es mover una línea.

## 2 — Check-in / Check-out desde la ficha

- En el modal de reserva, junto a Cobrar / comprobante / link de pre check-in:
  - **✅ Check-in** si la reserva está `confirmada` → `closeModal('modalReserva'); doCheckin(id)`;
  - **🚪 Check-out** si está en `checkin` → `closeModal('modalReserva'); doCheckout(id)`.
- Reusan `doCheckin` / `doCheckout` (sin lógica duplicada). Se cierra la ficha antes de abrir el modal
  de check-in: mismo patrón que 💰 Cobrar, nunca quedan dos modales encimados (verificado).
- Check-out desde la ficha es directo (sin confirmación), igual que desde la sección Check-in.
- Después de check-in / check-out se refresca también la grilla si está abierta
  (`refrescarVistasEstadia`), para que la barra cambie de estado al instante.

## 3 — Orden de los pendientes (bug)

- `ordenarPendientesEstadia(lista, campo, hoy)`: **hoy primero** (por número de cabaña) y después los
  **atrasados, del más reciente al más viejo** (ayer, anteayer, …). Se aplica a check-in (por entrada)
  y check-out (por salida).
- Los atrasados llevan un badge "N días de atraso".
- Elegí atrasados de más reciente a más viejo porque continúa naturalmente desde "hoy"; los muy viejos
  (probables no-shows) quedan al final. Si lo querés al revés, es invertir un signo.

## 4 — Recordatorio de las 21:00

- Aviso emergente (`modalRecordatorio`) con **"Llegan hoy"** y, aparte, **"Atrasados"** (con días).
  Cada fila: **✅ Llegó** (marca el check-in directo con `marcarCheckin`, seguro porque no mueve plata)
  y **Abrir** (cierra el aviso y abre la ficha). Botón "Ir a Check-In / Out".
- Solo si hay pendientes; **una vez por día** (se guarda la fecha en `localStorage` de ese navegador,
  con respaldo en memoria si el storage no está disponible). Si se abre la app después de las 21:00
  (ej. 22:30), aparece igual.
- Se revisa cada minuto (`setInterval`). No aparece si hay otro modal abierto (no le tapa un formulario
  a nadie): se reintenta al minuto siguiente.
- Solo para quien puede hacer check-in: admin o permiso `checkin: 'rw'` (roles viejos sin la clave →
  recepción). Ventas y limpieza (`'r'`) no lo ven.
- **Hora argentina:** `ahoraArgentina()` usa `Intl.DateTimeFormat` con `timeZone:
  'America/Argentina/Buenos_Aires'`: fecha y hora de Argentina sin importar la zona del dispositivo ni
  UTC. Nota: no modifiqué `today()` (usa la fecha *local del dispositivo*, que en los equipos del
  complejo es la argentina) porque lo usan caja y contabilidad; cambiarlo es otro alcance. El aviso no
  depende de `today()`.
- `recordatorioMarcarLlegada` registrada en `window`.

## 5 — Datos ya cargados: cómo detectar cobros falsos de check-in

**No se tocó ningún dato desde el código.** Los ingresos que generaba el check-in viejo tienen:

- ruta: `cabanas/movimientos/{id}`
- `tipo: 'ingreso'`, `cat: 'Reserva / Check-in'`
- `concepto` que empieza con `Saldo check-in …` o `Pago check-in …`
- `reservaId` de la reserva

**Opción A — exportar y filtrar (no requiere tocar reglas):** en la consola de Firebase → Realtime
Database → `cabanas/movimientos` → ⋮ → Export JSON, y después:

```bash
jq -r 'to_entries[] | .value
  | select(.cat == "Reserva / Check-in" and .tipo == "ingreso" and (.revertido != true) and (.reversaDe == null))
  | [.fecha, .id, .reservaId, .moneda, .monto, .metodo, .concepto] | @tsv' movimientos.json | sort
```

(Queda afuera lo ya revertido y las reversas.) Para cada fila, confirmar con Franco/Mariana si ese
cobro ocurrió de verdad ese día.

**Opción B — en la app:** Contabilidad → Ingresos, filtrar por categoría `Reserva / Check-in`.

**Para revertir uno falso:** el botón de reversa de Contabilidad (`revertirMovimiento`) crea el
contraasiento con fecha de hoy y marca el original como revertido. Si tiene factura emitida (CAE) la
app lo bloquea: va nota de crédito en ARCA.

**⚠️ Importante:** el contraasiento **no** corrige la reserva. El check-in viejo había puesto
`pagado = total`, `saldo = 0`, `estadoPago = 'total'`; después de revertir, la reserva va a seguir
figurando como pagada. Hay que editar esa reserva y devolver `pagado`/`saldo` a lo que realmente
entró, si no la grilla la va a mostrar en verde y 💰 Cobrar no va a aparecer. No lo automaticé (la
regla es no tocar datos desde el código), pero si son muchas se puede armar una herramienta aparte.

Las comisiones registradas en esos check-ins (`cat: 'Comisión plataforma'`, mismo `reservaId`) son
correctas si la estadía se concretó: no hace falta revertirlas salvo no-show.

## Reglas duras

- Cascada de precios y disponibilidad: sin tocar (`calcularPrecioReserva` solo se *llama* en la
  comisión, igual que antes).
- `savePago`: sin tocar.
- `security/` y `firebase.json`: sin tocar.
- `window`: `recordatorioMarcarLlegada` (nueva, desde onclick). Los botones nuevos de la ficha y del
  aviso llaman a `doCheckin`, `doCheckout`, `closeModal`, `editReserva`, `showSection`: todas ya
  registradas.

## Verificación

- `node --check` del módulo: OK.
- Nueve suites → **362 passed, 0 failed**: contabilidad 52 (+12), fmt 17, grilla 180, grupos 33,
  modal 36 (+3), precios 49, today 23 (+19), total 25, voucher 47.
- Tests de contabilidad: **ningún test existente asumía que el check-in registraba un movimiento** (no
  había tests de `confirmCheckin`). Se agregó la premisa nueva: check-in sin movimientos y con
  pagado/saldo intactos, token consumido, cabaña ocupada, sin campos de facturación; comisión al
  check-out, una vez, sin duplicar en reservas viejas; `savePago` sigue registrando.
- today: hora argentina en los bordes (00:30 UTC → 21:30 AR del día anterior; 03:00 UTC → 00:00 AR),
  orden de pendientes, separación hoy/atrasados, regla de una vez por día, guardas del aviso.
- modal: Check-in / Check-out visibles según estado y cerrando la ficha antes.
- **Chromium headless** (CSS, modales y funciones reales; datos simulados; dispositivo en **UTC a
  propósito**), desktop e iPhone, 28/28: 20:59 AR no aparece; 21:02 AR (ya día siguiente en UTC)
  aparece con hoy (2) y atrasados (1, "2 días de atraso"), sin futuras; "Llegó" escribe reserva y
  cabaña y **ningún movimiento**, el huésped sigue debiendo, hora 21:02; la lista se actualiza; "Abrir"
  cierra el aviso y abre la ficha; no se repite el mismo día; con otro modal abierto espera; ficha →
  Check-in deja un solo modal y confirma sin movimientos; luego la ficha muestra Check-out. Se corrigió
  en el camino que en iPhone los botones del aviso quedaban fuera de vista (la regla mobile de tablas).

## Pendiente de Leonardo

- Decidir dónde va la **comisión de plataforma** (hoy: al check-out).
- Revisar los movimientos `Reserva / Check-in` existentes con la consulta de arriba y, si corresponde,
  revertirlos **y corregir pagado/saldo de la reserva**.
- Prueba real: check-in desde la ficha y desde la sección, cobro posterior con 💰 Cobrar, aviso de las
  21:00 con la app abierta.
