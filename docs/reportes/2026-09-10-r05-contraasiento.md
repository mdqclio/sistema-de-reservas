# R-05 (doble emisión de facturas) + contraasiento de movimientos

**Fecha:** 2026-09-10
**Branch:** `fix/contabilidad-r05` (desde `main` @ `6954a8f`)
**Archivos tocados:** `index.html` únicamente — +152 / −8 líneas.
**No se tocó:** `security/*.json`, `firebase.json`, ni Firebase (sesión del CLI cerrada a propósito).

Antecedente: `docs/reportes/2026-09-10-borrado-contabilidad.md`.

---

## Resumen

- **R-05 cerrado:** un ingreso ya referenciado por una factura viva (pendiente,
  procesando o emitida) desaparece del listado facturable. Tres barreras: listado,
  selección y revalidación en el momento de escribir.
- **Contraasiento agregado:** botón "Revertir" en la tabla de movimientos. Crea un
  movimiento nuevo de signo opuesto. El original no se borra ni se edita: solo se le
  marca `revertido: true`.
- **Un movimiento comprometido por una factura viva no se puede revertir**, en ninguno
  de los tres estados (`pendiente`, `procesando`, `emitida`). El mensaje distingue el
  caso con CAE del caso con solicitud en curso.
- **Append-only intacto:** no se habilitó borrado ni edición. `removeMovimiento`
  (`index.html:2176`) sigue sin un solo call site.
- **Ningún desnormalizado tocado:** `reserva.pagado`, `saldo` y `estadoPago` quedan
  como estaban, según lo pedido.
- Verificación completa en la sección final: sintaxis, 37 tests, exports y ausencia
  de `remove()`.

---

## Cambio 1 — R-05: evitar doble emisión

### El problema

`movimientosFacturables()` filtraba solo por `!m.facturado`. Ese flag se escribe
recién cuando la factura vuelve en estado `emitida` y `conciliarFacturasEmitidas()`
corre en algún cliente (`index.html:5363-5378`).

La ventana entre "solicité la factura" y "la factura volvió emitida" dejaba el mismo
ingreso disponible para tildar otra vez → **dos facturas fiscales por el mismo cobro**.

### La solución

Nuevo helper `movimientosComprometidos()` (`index.html:5387`). Recorre
`facturasEntries()` y devuelve un `Set` con todos los `movimientoIds` de las facturas
cuyo estado **no** es `error`:

```js
function movimientosComprometidos() {
  const ids = new Set();
  for (const [, f] of facturasEntries()) {
    if (!f || f.estado === FACTURA_ESTADOS.ERROR) continue;
    const arr = Array.isArray(f.movimientoIds) ? f.movimientoIds : [];
    arr.forEach(id => { if (id) ids.add(id); });
  }
  return ids;
}
```

Usa las constantes `FACTURA_ESTADOS` existentes (`index.html:5284`), sin strings sueltos.

**Las facturas en `error` sí liberan sus movimientos**, tal como se pidió: un fallo de
ARCA tiene que poder reintentarse.

**Decisión sobre facturas sin `estado`:** cuentan como comprometidas. La condición es
`f.estado === ERROR`, no `f.estado !== ERROR` invertida sobre un default. Es el lado
conservador — una factura legacy sin estado no libera el movimiento — y coincide con
el default que ya usa la tabla de facturas (`const est = f.estado || 'pendiente'`,
`index.html:5484`).

### Las tres barreras

| Punto | Línea | Qué hace |
|---|---|---|
| `movimientosFacturables()` | `index.html:5407` | El movimiento comprometido no se lista, así que no se puede tildar. |
| `facMovsSeleccionados()` | `index.html:5418` | Mismo filtro. Cubre el id que quedó en `facSeleccion` de un render anterior. |
| `crearSolicitudFactura()` | `index.html:5642` | Revalidación final justo antes del `set()`. |

La tercera es la que cubre la concurrencia real. El `confirm()` es bloqueante, pero el
listener de `/cabanas/facturas` actualiza `facturasData` en cuanto otro usuario escribe:

```js
if (facModo !== 'manual') {
  const comprometidos = movimientosComprometidos();
  const chocan = movimientoIds.filter(id => comprometidos.has(id));
  if (chocan.length) {
    chocan.forEach(id => facSeleccion.delete(id));
    showNotif(`${chocan.length} movimiento(s) ya tienen una factura en curso — se quitaron de la selección`, 'error');
    renderAcct('facturacion');
    return;
  }
}
```

Aborta antes de escribir, limpia los ids en conflicto de la selección y re-renderiza,
así el usuario ve exactamente qué quedó afuera.

El modo `manual` se saltea el chequeo a propósito: no referencia movimientos
(`movimientoIds = []`).

---

## Cambio 2 — Contraasiento (reversa)

### Por qué

Contabilidad es append-only y no hay forma de corregir un movimiento mal cargado. Con
Franco entrando a operar, eso aparece la primera semana. La salida no es habilitar
borrado ni edición, sino el mecanismo contable estándar: un asiento de signo opuesto.

### Cómo funciona

`revertirMovimiento(id)` (`index.html:5800`):

1. Revalida las guardas (el listener pudo cambiar el estado entre el render y el click).
2. Pide `confirm()` mostrando concepto, importe y fecha del original.
3. Crea un movimiento **nuevo** vía `writeMovimiento`:
   - `tipo` invertido (ingreso ↔ egreso)
   - mismo `monto`, `moneda`, `cat`, `metodo`, `proveedorId`, `tc`
   - `fecha: today()` — **fecha local, no UTC** (`today()` en `index.html:2792` está
     documentado justamente para no correr los cobros nocturnos al día siguiente)
   - `concepto: "Reversa de: <original>"`, truncado a 200
   - `reversaDe: <id del original>`
4. Reescribe el original **idéntico salvo el flag**: `writeMovimiento({ ...orig, revertido: true })`.
   Mismo patrón que usa `conciliarFacturasEmitidas`. No se borra ni se edita ningún otro campo.
5. Lo saca de `facSeleccion` (que no quede tildado en Facturación).
6. `auditLog('revertir', 'Movimiento', ...)`.

### Cuándo NO aparece el botón

`puedeRevertirMovimiento(m)` devuelve `false` si:

- `m.revertido === true` — no se revierte dos veces.
- `m.reversaDe` — una reversa no se revierte.
- `motivoBloqueoReversa(m)` devuelve un motivo — está ligado a una factura viva.

`motivoBloqueoReversa(m)` **reusa el `Set` de `movimientosComprometidos()`** del Cambio 1,
con la misma semántica: las facturas en `error` no cuentan, porque se reintentan o se
descartan. Devuelve el motivo en lugar de un booleano, para que el mensaje sea el correcto:

```js
function motivoBloqueoReversa(m) {
  if (!m || !m.id) return null;
  if (m.facturado === true) return 'emitida';
  if (!movimientosComprometidos().has(m.id)) return null;
  for (const [, f] of facturasEntries()) {
    if (!f || f.estado !== FACTURA_ESTADOS.EMITIDA) continue;
    const arr = Array.isArray(f.movimientoIds) ? f.movimientoIds : [];
    if (arr.includes(m.id)) return 'emitida';
  }
  return 'en_curso'; // pendiente / procesando / sin estado
}
```

El `Set` resuelve primero si hay bloqueo; solo cuando lo hay se recorren las facturas
para distinguir el caso. `facturado === true` implica emitida ya conciliada, y la
referencia directa se chequea igual por si la conciliación todavía no corrió en ese
cliente.

Las guardas se revalidan dentro de `revertirMovimiento`, no solo en el render: si alguien
intenta ejecutarla igual, aborta con `showNotif` y el mensaje según el motivo.

| Motivo | Mensaje |
|---|---|
| `emitida` | *"Tiene factura emitida con CAE: se anula con nota de crédito en ARCA, no acá"* |
| `en_curso` | *"Tiene una solicitud de factura en curso: resolvé o cancelá esa solicitud antes de revertir"* |

Bloquear `pendiente` y `procesando`, y no solo `emitida`, cierra el agujero de revertir
un ingreso cuya solicitud sigue viva: n8n podría emitirla igual contra un movimiento ya
anulado.

### Presentación

- Fila revertida: `opacity:.55` + concepto tachado + badge rojo **Revertido**.
- La reversa: badge azul **Reversa**.
- Columna de acciones nueva (7ª). El `colspan` del estado vacío pasó de 6 a 7.
- `revertirMovimiento` registrado en `Object.assign(window, {...})` — sin eso el
  `onclick` no hace nada, porque el script es `type="module"`.

---

## Defecto detectado y corregido durante la implementación

La combinación de ambos cambios abría un agujero que ninguno tenía por separado:

1. Un **ingreso revertido** seguía apareciendo en `movimientosFacturables()`. El cobro
   quedó anulado por el contraasiento, pero se podía facturar igual.
2. La **reversa de un egreso es un ingreso**, y como tal también entraba al listado
   facturable. Es un asiento de corrección, no plata cobrada.

Ambos casos habrían producido facturas fiscales por importes inexistentes — exactamente
la clase de error que el Cambio 1 busca evitar.

Corregido con `movimientoAnulado(m)` (`index.html:5400`), aplicado en
`movimientosFacturables()` y `facMovsSeleccionados()`:

```js
function movimientoAnulado(m) {
  return !!m && (m.revertido === true || !!m.reversaDe);
}
```

Lo señalo explícitamente porque es alcance que no estaba en el pedido: lo tomé como
parte de entregar bien el Cambio 2, no como agregado propio.

---

## Reglas duras: cumplimiento

| # | Regla | Estado |
|---|---|---|
| 1 | No habilitar borrado ni edición | ✅ Solo reversa. `removeMovimiento` (`index.html:2176`) sigue con 0 call sites. |
| 2 | No tocar `reserva.pagado` ni desnormalizados | ✅ Ninguna escritura sobre `cabanas/reservas`. La reversa es puramente contable. |
| 3 | Movimiento con factura EMITIDA no se revierte | ✅ Botón oculto + aborto con `showNotif` si se fuerza. Doble chequeo (flag + referencia). Extendido a `pendiente` y `procesando`, con mensaje propio. |
| 4 | No tocar Firebase | ✅ Ningún comando de CLI ni MCP ejecutado. |
| 5 | No tocar reglas ni `firebase.json` | ✅ `git diff -- security/ firebase.json` vacío. |

---

## Verificación

| Chequeo | Resultado |
|---|---|
| `node --check` sobre el `<script type="module">` extraído (6316 líneas) | ✅ sin errores |
| `node tests/precios.test.mjs` | ✅ **33 passed, 0 failed** |
| `node tests/today.test.mjs` | ✅ **4 passed, 0 failed** |
| `revertirMovimiento` en `Object.assign(window, {...})` | ✅ presente |
| Handlers inline (`onclick`/`onchange`/`oninput`) sin exportar | ✅ ninguno — 146 handlers contra 194 exports |
| Llamadas a `remove()` sobre movimientos | ✅ ninguna (solo la definición muerta de `removeMovimiento`) |
| Sin referencias colgando a la función reemplazada (`movimientoFacturadoEmitido`) | ✅ eliminada por completo |
| `git diff -- security/ firebase.json` | ✅ vacío — intactos |
| `git status` | ✅ solo `index.html` y el reporte |

---

## Pendientes señalados, no implementados

1. **La reserva ligada queda desalineada, por diseño.** Si se revierte un ingreso con
   `reservaId`, `reserva.pagado` sigue contando esa plata. Es lo que se pidió
   ("lo resolvemos aparte"), pero mientras tanto Cuentas por Cobrar no refleja la reversa.

2. **Sin tests automatizados para lo nuevo.** `movimientosComprometidos`,
   `movimientoAnulado`, `motivoBloqueoReversa` y `puedeRevertirMovimiento` son funciones
   puras y testeables; hoy no hay cobertura. La suite existente no las toca.
