# Pedidos de Franco (oct-2026) — rango en grilla, voucher sin datos bancarios, colores por pago

Branch: `fix/franco-oct` (desde `main` @ 02813d7).

## 1 — Selección de rango en la grilla: el 2º click es la salida

**Antes:** el 2º click era la ÚLTIMA NOCHE y la salida = esa noche + 1.
**Ahora:** el 2º click ES la fecha de salida. Clicks 2 y 4 → entrada 2, salida 4, 2 noches.

Cambios en `index.html`:
- `grillaRangoDesdeClicks(a, b)` (nueva, pura): ordena los clicks y devuelve `{entrada, salida}`.
- `grillaPrimeraNocheOcupada(entrada, salida, ocupada)` (nueva, pura): valida las noches
  `[entrada, salida)` — hasta la anterior a la salida inclusive. Devuelve la primera ocupada o `null`.
- `grillaCellClick` usa las dos anteriores. Ninguna de las nuevas se llama desde `onclick`
  (solo `grillaCellClick`, que ya estaba en `window`).

**Caso borde — misma celda dos veces: DECISIÓN = 1 noche (salida = día + 1).**
Es lo más natural para "quiero esa noche" y nunca produce 0 noches. Cubierto por test.

**Caso recambio (consecuencia del cambio de convención):** con la convención nueva, para
salir el día en que entra otra reserva hay que clickear ese día, que en la grilla es una
celda ocupada (antes no tenía `onclick`). Para no romper el recambio:
- Las celdas ocupadas ahora tienen `onclick="grillaCellClick(..., true)"`.
- Como **1er click** no hacen nada (no se puede empezar una reserva en una noche ocupada).
- Como **2º click** valen como salida; la validación `[entrada, salida)` no mira la noche de
  salida, así que el recambio pasa. Si el click ocupado queda antes del 1er click (sería la
  entrada), la validación lo rechaza con el aviso de siempre.
- Limitación visual: la barra de la reserva entrante tapa la mitad derecha de su día de
  entrada; la parte clickeable es la mitad izquierda de esa celda.

La disponibilidad del resto del sistema NO cambió (`grillaCeldaOcupada`, intervalo
semiabierto, conflictos y precios intactos).

## 2 — Voucher sin datos bancarios

- `docs/voucher.html`: eliminada la sección "Datos para la seña (transferencia)" y su CSS
  `.sena`. En su lugar, cuando hay saldo: *"Consultanos por WhatsApp las formas de pago."*
  Sin saldo no se muestra nada (igual que antes la sección).
- `datosSenaDesdeConfig` no la usaba nadie más → **borrada**.
- El campo `datosSena` se sacó también del nodo público `/cabanas/checkin_tokens/{token}`
  (`datosTokenReserva` / `escribirTokenReserva`): ya no tiene sentido publicar el CBU.
  Las reglas (`security/`) no validan campos del token → no hubo que tocarlas.
- **Ojo:** los tokens ya escritos en Firebase conservan `datosSena` hasta que se refresquen
  (pago/edición de la reserva). El voucher nuevo ya no lo muestra igual. Si se quiere
  limpiar de inmediato, hay que borrar ese hijo a mano en la consola.

## 3 — Colores de la barra por estado de pago

Decide `saldoReserva(r)`:
- **Celeste** (`gb-debe`): saldo > 0, falta ingresar.
- **Verde** (`gb-pagada`): saldo = 0, ya pagaron.

**Choque con estados existentes: SÍ, el pago manda.** Antes el estado se distinguía solo por
el color de fondo (checkin azul, confirmada teal, checkout gris), que es justo lo que ahora
usa el pago. Se mantuvo la distinción con otras marcas:
- `checkin`: borde izquierdo blanco marcado.
- `checkout`: barra atenuada (opacidad 50%).
- `confirmada`: sin marca.
- `cancelada`: la grilla nunca las mostró (no están en `estadosVisibles`); sin cambio.

El texto "debe $X" pasó a rojo oscuro para leerse sobre celeste.

## Verificación

- `node --check` sobre el módulo de `index.html` y de `docs/voucher.html`: OK.
- 9 suites: precios 33, today 4, contabilidad 40, fmt 17, grilla 38, total 25, grupos 33,
  voucher 34, modal 14 → **238 passed, 0 failed**.
- `tests/grilla.test.mjs`: +13 casos de selección de rango (2 y 4 → 2 noches, orden inverso,
  consecutivos, misma celda → 1 noche, cruce de mes, validación `[entrada, salida)`, recambio).
- `tests/voucher.test.mjs`: casos de seña reemplazados por: token sin CBU/alias, función
  borrada, línea neutra presente con saldo, ausente sin saldo, token viejo con `datosSena`
  no se muestra.
- grep de `window`: el único handler nuevo en `onclick` es `grillaCellClick` (ya registrado).
- `security/` y `firebase.json`: sin cambios.
