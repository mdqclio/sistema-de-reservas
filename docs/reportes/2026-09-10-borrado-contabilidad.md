# Borrado en contabilidad: funciones, reglas y consistencia

**Fecha:** 2026-09-10
**Alcance:** solo lectura y análisis. No se ejecutó ningún comando de Firebase ni se modificó código.
**Código analizado:** `index.html` (7954 líneas) y `security/*.json` en `c85cda7`.
Los números de línea de este documento corresponden a esa revisión.

**Pregunta original:** ¿existe alguna vía para borrar movimientos, cierres de caja o
entradas de auditoría? ¿Las reglas lo permiten? ¿Qué se rompe si se borra a mano
desde la consola de Firebase?

---

## Resumen ejecutivo

- La UI **no expone ningún borrado contable**. Contabilidad es append-only por diseño.
- Las **reglas de staging sí permiten borrar** esos tres nodos a cualquier usuario staff.
  El append-only es una propiedad de la UI, no del backend.
- Borrar un movimiento a mano rompe **4 referencias cruzadas** y desalinea 5 agregados.
- El daño más grave es silencioso: `reserva.pagado` es un número guardado, no derivado.
  Borrar el ingreso no lo baja, y la reserva sigue reportando plata que ya no existe.
- Un movimiento con factura **emitida** (con CAE) no se debe borrar nunca.

---

## 1. Funciones de borrado en `index.html`

| Función | Línea | Nodo | ¿Expuesta en UI? |
|---|---|---|---|
| `removeMovimiento(id)` | `index.html:2176` | `cabanas/movimientos/{id}` | **No.** Cero call sites. No está en `Object.assign(window, {...})` (`index.html:7908-7952`), y el script es `<script type="module">` (`index.html:1779`) → tampoco alcanzable desde la consola del navegador. Código muerto. |
| `colCierres.remove(id)` | genérica en `index.html:2348` (`removeId` de `makeLiveCollection`), instancia en `index.html:2405` | `cabanas/cierres/{id}` | **No.** Cero call sites. `colCierres` es `const` de módulo, no exportada a `window`. |
| `colAuditoria.remove(id)` | misma fábrica, instancia en `index.html:2404` | `cabanas/auditoria/{id}` | **Solo interna y automática.** Único uso en `index.html:4789`, dentro de `auditLog()`, para podar a los últimos 1000 registros. Sin botón. |

Poda del log, `index.html:4788-4789`:

```js
const all = colAuditoria.list().slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
if (all.length > 1000) all.slice(0, all.length - 1000).forEach(e => { if (e?.id) colAuditoria.remove(e.id); });
```

No existe `deleteMovimiento`, `deleteCierre`, `deleteAuditoria`, `anularMovimiento`,
ni ninguna forma de contraasiento o reversa. Grep vacío.

### UI verificada — sin acciones destructivas en ninguna vista contable

- **Tabla de movimientos**, `renderAcct` (`index.html:4863-4890`): solo botón `+ Agregar`.
  Columnas Fecha / Concepto / Categoría / Monto / Método / Proveedor. Sin columna de acciones.
- **Caja diaria**, `renderCaja` (`index.html:5660-5668`): filas de solo lectura.
- **Historial de cierres** (`index.html:5669-5674`): últimos 3, solo lectura.
- **Auditoría**, `renderAuditoria` (`index.html:5082-5111`): filtro por entidad + tabla, solo lectura.

Tampoco hay edición: `openMovimientoModal` solo crea. No existe `editMovimiento`.

### Contraste con el resto del sistema

Otras entidades sí tienen borrado expuesto, lo que confirma que la ausencia en
contabilidad es deliberada y no un olvido:

- Reservas y huéspedes: botón 🗑 en `index.html:3281` y `index.html:4036` → `confirmDelete` (`index.html:6000`).
- Categorías (`5157`), proveedores (`5226-5228`), recurrentes (`5047-5048`), roles (`5814`),
  leads (`7458-7460`), knowledge base (`7559`): todos con `confirm()` + `.remove()`.

---

## 2. Conclusión: append-only confirmado

**Contabilidad es append-only por diseño.** Ningún camino de la interfaz permite a un
usuario borrar un movimiento, un cierre de caja ni una entrada de auditoría. Las tres
colecciones solo crecen. Corregir un movimiento mal cargado es hoy imposible desde la
app: no hay borrado y tampoco hay edición.

La única poda existente es la rotación automática del log de auditoría a 1000 entradas
(`index.html:4789`).

**Caveat importante:** el append-only vive en el cliente. El backend no lo hace cumplir.
Ver sección 3.

---

## 3. Reglas de staging: sí permiten borrar

`security/database.rules.staging.json:13-15`:

```json
"cabanas": {
  ".read": "auth != null && auth.provider !== 'anonymous'",
  ".write": "auth != null && auth.provider !== 'anonymous'",
```

No hay bloque específico para `movimientos`, `cierres` ni `auditoria`: heredan ese
`.write` del padre. En Realtime Database, un `.write` concedido en un ancestro **otorga
borrado de todo el subárbol** — un `remove()` es un write de `null`, y las reglas hijas
no pueden revocar un permiso ya concedido más arriba.

**Resultado:** cualquier usuario staff autenticado (no anónimo) puede borrar
`cabanas/movimientos`, `cabanas/cierres` y `cabanas/auditoria`, enteros o por hijo, desde
la consola de Firebase, REST o cualquier SDK con su token.

Agravantes:

- No hay `.validate` que exija `newData.exists()` en esos nodos.
- No hay diferenciación de rol: `auth.provider !== 'anonymous'` es el único check.
- No hay custom claims. El rol se resuelve en el cliente desde `/cabanas/usuarios`,
  así que la distinción admin / recepción es exclusivamente de UI.

Los únicos nodos con reglas propias son `pendientes` (línea 16), `checkin_tokens` (33),
`emisores` (41), `facturas` (47) y `acl` (53). Ninguno restringe el borrado.

### Nota sobre la plantilla per-rol (Tier 2, sin desplegar)

`security/database.rules.per-rol.template.json` tampoco cubriría estos nodos. Nombra
`"contabilidad"`, `"caja"` y `"log"` — **nombres que no existen en la base**. Los nodos
reales son `movimientos`, `cierres` y `auditoria`, y caerían en el catch-all:

```json
"$resto": { ".write": "auth != null" }
```

Tal como está, la plantilla deja contabilidad escribible y borrable por cualquier
usuario autenticado. Corregir los nombres antes de considerar desplegarla.

---

## 4. Nodos que quedan inconsistentes si se borran movimientos a mano

### A. `cabanas/facturas/{key}.movimientoIds` — referencia dura, se rompe

`crearSolicitudFactura` guarda los ids en la solicitud (`index.html:5605`):

```js
movimientoIds = sel.map(m => m.id);
```

`conciliarFacturasEmitidas()` (`index.html:5352-5367`) los recorre:

```js
const m = cache.movimientos?.[id];
if (!m) continue;
```

Es tolerante a nulo, no crashea, pero la factura queda apuntando a ids inexistentes.

**Impacto real:** si la factura está en estado `emitida` con CAE de ARCA, se pierde el
respaldo del comprobante fiscal. La factura declara un importe cuyos movimientos ya no
existen. Irreconciliable contra ARCA.

### B. `cabanas/reservas/{id}.pagado` / `.saldo` / `.estadoPago` — desnormalizados, quedan mintiendo

`reserva.pagado` es un número **guardado, no derivado** de los movimientos. Se incrementa
en cada cobro:

- Alta de reserva: `index.html:3744`
- Check-in: `index.html:3825`
- `savePago`: `index.html:3878`
- Extensión: `index.html:3935`

Borrar el movimiento de ingreso **no baja `r.pagado`**. Consecuencias:

- `resumenFacturacionReserva(rid)` (`index.html:3466-3472`) recalcula `cobrado` desde los
  movimientos con `m.reservaId === rid` → devuelve menos que `r.pagado`. Dos verdades en
  pantalla para la misma reserva.
- `renderCuentasPorCobrar` (`index.html:4894-4903`) usa `r.pagado` → la reserva sigue
  figurando como cobrada aunque el ingreso ya no exista. **Plata desaparecida sin que
  Cuentas por Cobrar la reclame.**
- `doCheckin` (`index.html:3821`) lee `Number(r.pagado)` para calcular el saldo pendiente
  → cobraría de menos.
- La grilla (`index.html:6516`) muestra el saldo usando `res.pagado`.

Este es el daño más grave, y es silencioso: nada en la interfaz señala la divergencia.

### C. `cabanas/cierres/{id}` — snapshots congelados que dejan de cuadrar

`cerrarCaja()` (`index.html:5732-5757`) guarda agregados, **no ids**: `balanceARS`,
`balanceUSD`, `efectivoEsperado`, `arqueo`, `diferencia`, `tc`. Se calculan sobre
`getMovimientos().filter(m => m.fecha === tod)`.

Si se borra un movimiento de una fecha ya cerrada, el cierre conserva el balance viejo,
pero recalcular esa fecha desde los movimientos da otro número. El arqueo firmado
(`cerradoPor`) queda sin sustento.

Como los cierres no guardan `movimientoIds`, **no hay forma de saber qué movimiento
faltaba**: la inconsistencia es indetectable por diff, solo por total.

### D. `cabanas/auditoria` — no registra el borrado, y el rastro previo queda huérfano

`auditLog()` solo corre desde la app. Un delete por consola **no deja entrada**.

Peor: la entrada de `'registrar', 'Movimiento', ...` (`index.html:5705`) sigue en el log
describiendo un movimiento que ya no existe. El log dice que se creó y nada dice que se
borró. Además guarda texto libre (`${tipo} ${monto} — ${concepto}`), no el id, así que ni
siquiera se puede correlacionar mecánicamente.

### E. Agregados que cambian de valor en silencio

No quedan "inconsistentes" en la base, pero sí desalineados respecto de cualquier reporte
previo:

| Vista | Línea |
|---|---|
| Dashboard — ingresos de hoy | `index.html:2851` |
| Dashboard — serie mensual del gráfico | `index.html:2960-2984` |
| Resumen contable + IVA sobre facturado | `index.html:4799`, `4809-4816` |
| Presupuesto vs Real | `index.html:4930-4943` |
| Export CSV | `index.html:5232-5246` |
| `movimientosFacturables()` | `index.html:5372` |

El export CSV merece atención: el histórico exportado deja de coincidir con exports
anteriores, sin ninguna marca. Y en `movimientosFacturables()`, un ingreso borrado
simplemente nunca se factura, sin aviso.

### F. Dirección inversa, ya presente en producción

`deleteReserva` (`index.html:6042-6053`) borra la reserva pero **no** sus movimientos.
Los movimientos quedan con `reservaId` colgando. `renderFacturacion` (`index.html:5430`)
hace `reservas.find(...)` → `null`, y lo tolera.

Es coherente con el append-only (el dinero cobrado no se borra porque se borre la
reserva), pero significa que **ya hay `reservaId` huérfanos en la base**.

---

## 5. Orden correcto de borrado

> **Aviso previo:** un movimiento con factura **emitida** (con CAE) no se debe borrar
> nunca. Es el respaldo de un comprobante fiscal ya declarado ante ARCA. Para esos casos
> la corrección contable es una nota de crédito, no un delete. Lo que sigue aplica solo a
> movimientos sin factura emitida.

**Principio:** primero se limpian los punteros que *entran* al registro, después se borra
el destino, y al final se recalculan los agregados desnormalizados.

1. **Backup completo antes de tocar nada.** Export de `cabanas/movimientos`,
   `cabanas/facturas`, `cabanas/reservas` y `cabanas/cierres` a archivo. Sin esto no hay
   vuelta atrás: RTDB no tiene papelera.

2. **Verificar las facturas que referencian el movimiento.** Buscar en `cabanas/facturas`
   todo registro cuyo `movimientoIds` contenga el id.
   - Si alguna está en estado `emitida` → **abortar el borrado de ese movimiento.**
   - Si están en `pendiente` o con error → continuar.

3. **Limpiar el puntero en la factura.** Sacar el id de `movimientoIds` y ajustar
   `importe`, `desde` y `hasta` en consecuencia; o borrar la solicitud entera si queda
   vacía y sin sentido.
   Este paso va **antes** del borrado: si se borra el movimiento primero, queda una
   ventana en la que la factura apunta a la nada, y `conciliarFacturasEmitidas` corre en
   cada carga de sesión.

4. **Anotar los datos necesarios para recalcular:** `reservaId`, `monto`, `moneda`,
   `fecha`, `metodo`, `tipo`. Después del delete no se recuperan.

5. **Borrar el movimiento:** `cabanas/movimientos/{id}`.

6. **Recalcular `reserva.pagado`** si el movimiento tenía `reservaId`. El nuevo valor es
   la suma de `monto` de los movimientos con `tipo === 'ingreso'` que queden con ese
   `reservaId` y la misma moneda. Actualizar además `saldo` (`total - pagado`) y
   `estadoPago` para que sean coherentes.
   **Paso obligatorio:** sin él, la reserva reporta plata que no está en ningún lado.

7. **Corregir el cierre de caja de esa fecha**, si existe uno en `cabanas/cierres` con
   `fecha` igual a la del movimiento borrado. Recalcular `balanceARS`, `balanceUSD`,
   `efectivoEsperado` y `diferencia` sobre los movimientos restantes, y dejar constancia
   en `obs` de que el cierre fue ajustado a mano y por qué.
   *Alternativa igualmente defendible:* dejar los números intactos (el cierre es un acta
   histórica de lo que se contó ese día) y anotar el ajuste solo en `obs`. Lo que no
   sirve es dejarlo sin ninguna marca.

8. **Escribir la entrada de auditoría a mano** en `cabanas/auditoria/{push-key}`, con la
   forma que usa `auditLog()` (`index.html:4770-4786`):
   `{id, fecha, hora, usuario, accion:'borrar', entidad:'Movimiento', detalle, ts}`.
   En `detalle`: el id borrado, el monto y el motivo. Es el único registro que va a quedar
   de la operación.

9. **Verificar en la app:** abrir Contabilidad → Resumen, Caja y la reserva afectada.
   Comprobar que `pagado` coincide con la suma de ingresos y que Cuentas por Cobrar
   muestra lo que corresponde.

### Orden resumido — nunca al revés

```
facturas.movimientoIds  →  movimientos/{id}  →  reservas.pagado  →  cierres  →  auditoria
```

---

## Recomendaciones derivadas

Fuera del alcance de la pregunta original, pero surgen directamente del análisis:

1. **Cerrar el borrado en las reglas.** Los nodos `movimientos`, `cierres` y `auditoria`
   deberían tener una regla explícita que exija `newData.exists()`, de modo que el
   append-only lo haga cumplir el backend y no solo la UI.

2. **Corregir los nombres de nodo en la plantilla per-rol.** Hoy protege
   `contabilidad` / `caja` / `log`, que no existen. Ver sección 3.

3. **Considerar guardar `movimientoIds` en los cierres de caja.** Hoy un cierre es un
   total sin trazabilidad: no se puede auditar qué lo compuso.

4. **Evaluar derivar `reserva.pagado`** en lugar de mantenerlo desnormalizado, o al menos
   agregar una verificación de consistencia que compare el campo contra la suma de
   movimientos.

5. **Eliminar el código muerto** (`removeMovimiento`, `index.html:2176`) o documentarlo
   como deliberadamente no expuesto. Hoy es una función de borrado sin uso que puede
   inducir a error a quien lea el archivo.
