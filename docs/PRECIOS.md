# Cascada de precios

Un **único** punto calcula el precio de toda reserva: `calcularPrecioReserva()`
(index.html, ~línea 3321). Reemplaza el viejo `precio × noches` que estaba disperso
en `saveReserva` / `confirmCheckin` / `openPago` / grilla. Todos esos sitios ahora
llaman a la cascada.

El precio es **final al huésped, sin IVA discriminado** (el IVA se calcula recién en
Contabilidad, y solo sobre lo efectivamente facturado — ver más abajo).

## Los factores, en orden de aplicación

El precio por noche se arma **multiplicativo encadenado**. Cada factor se aplica sobre
el resultado del anterior:

```
noche = base                         // temporada  ó  fecha_especial (override absoluto)
noche *= (1 + dinámico%)             // ocupación + último momento   (si precios.dinamicos.activo)
noche *= (1 + finde%)                // recargo si la fecha cae en un finde/feriado configurado
noche *= (1 - promo%)                // descuento si la fecha cae en una promo vigente
noche  = round(noche)
total  = noche × noches  +  Σ cargos_únicos
```

Con `dinamicos`, `fines_semana_largos`, `promociones` y `fechas_especiales` **vacíos**
(estado por defecto del sistema), el resultado es idéntico a `precioDefaultCabana` → la
cascada no cambia nada de la operación viva. Los factores se “encienden” a medida que se
cargan en **Configuración → Precios**.

### 1. Base — temporada o fecha especial

- Por defecto: `precioDefaultCabana(hab, fecha)` → precio de temporada de esa cabaña
  (`precio_alta` / `precio_baja` / `precio_base` según en qué temporada cae la fecha).
- Si existe una entrada en `precios.fechas_especiales` cuya `fecha` coincide **exacto**
  con la noche, su `precio` es un **override absoluto**: reemplaza por completo el precio
  de temporada de esa noche. Finde / promo / dinámicos **siguen encadenando por encima**
  de ese valor.

### 2. Dinámico — ocupación + último momento

Solo si `precios.dinamicos.activo === true`. El ajuste total es la **suma** de dos tramos:

- **Ocupación** (`dinamicos.ocupacion[]`, cada tramo `{desde_pct, ajuste_pct}`): mide el %
  de cabañas ocupadas ese día (reservas `confirmada`/`checkin` que cubren la fecha).
  Se elige **el tramo de mayor `desde_pct`** que la ocupación alcanza.
- **Último momento** (`dinamicos.last_minute[]`, cada tramo `{dias, ajuste_pct}`): mide los
  días entre hoy y la fecha de entrada. Se elige **el tramo de menor `dias`** que la ventana
  cumple (`días_restantes <= dias`). El `ajuste_pct` suele ser negativo (descuento).

```
dinámico% = ajuste_ocupación + ajuste_últimoMomento
```

> **Prioridad** — la frase “promo > último momento > ocupación” describe el **orden de la
> cascada**, no una exclusión: los tres factores conviven. Ocupación y último momento se
> suman dentro del paso dinámico; la promo se aplica al final (multiplicativo) sobre todo lo
> anterior.

### 3. Finde / feriado

`precios.fines_semana_largos[]` (`{fecha_inicio, fecha_fin, recargo_pct}`). Si la noche cae
dentro de un rango, se aplica `× (1 + recargo_pct/100)`.

### 4. Promo

`precios.promociones[]` (`{tipo:'descuento_pct', fecha_inicio, fecha_fin, valor}`). Si la
noche cae dentro de una promo vigente, se aplica `× (1 - valor/100)`.

### 5. Cargos únicos (fijos por reserva)

`precios.cargos_unicos[]` (`{id, nombre, monto}`). NO son por noche: son montos **fijos por
reserva** (limpieza, ropa blanca, mascota, etc.). El staff los tilda en el selector del modal
de reserva; se guardan como lista de ids en `reserva.cargos`. `cargosReservaTotal(ids)` suma
sus `monto`. Se agregan al final, **fuera** de la multiplicación por noches.

## Notas de implementación

- **Precio por noche = fecha de entrada.** `calcularPrecioReserva` calcula la cascada UNA vez,
  para la fecha de `entrada`, y multiplica por la cantidad de noches. No recalcula noche por
  noche. (Simplificación consciente: una estadía que cruza cambio de temporada/finde usa el
  precio del día de entrada para toda la estadía.)
- **Override manual.** Si el staff fija un `precio/noche` manual en el modal (`precioOverride`
  > 0), ese valor **reemplaza** toda la cascada del paso “por noche”; los cargos únicos igual
  se suman.
- **Total autoritativo.** `totalReserva(r)` devuelve `r.total` guardado (calculado con la
  cascada al guardar) o, para reservas viejas sin `total`, lo recalcula respetando
  `r.precio` guardado y `r.cargos`.

## Ejemplos numéricos

### Ejemplo 1 — sin factores (estado por defecto)

Cabaña en temporada base, todos los factores vacíos, 3 noches, sin cargos.

| Paso              | Cálculo              | Resultado    |
|-------------------|----------------------|--------------|
| Base temporada    | —                    | $500.000     |
| Dinámico (off)    | ×1                   | $500.000     |
| Finde (ninguno)   | ×1                   | $500.000     |
| Promo (ninguna)   | ×1                   | $500.000     |
| **Noche**         | round                | **$500.000** |
| Subtotal          | 500.000 × 3 noches   | $1.500.000   |
| Cargos            | —                    | $0           |
| **TOTAL**         |                      | **$1.500.000** |

### Ejemplo 2 — cascada completa (dinámico + finde + promo + cargo)

Temporada alta, dinámicos activos, la fecha cae en finde largo y en una promo, 2 noches,
+ cargo de limpieza.

- Ocupación del día: 85% → tramo `desde_pct: 80` → **+15%**
- Reserva a 5 días vista → tramo `dias: 7` → **−10%**  ⇒ dinámico% = 15 − 10 = **+5%**
- Finde largo: `recargo_pct: 20`
- Promo vigente: `valor: 10` (descuento)
- Cargo único “Limpieza”: $30.000

| Paso              | Cálculo                   | Resultado    |
|-------------------|---------------------------|--------------|
| Base temp. alta   | —                         | $600.000     |
| Dinámico +5%      | 600.000 × 1.05            | $630.000     |
| Finde +20%        | 630.000 × 1.20            | $756.000     |
| Promo −10%        | 756.000 × 0.90            | $680.400     |
| **Noche**         | round                     | **$680.400** |
| Subtotal          | 680.400 × 2 noches        | $1.360.800   |
| Cargos            | Limpieza                  | $30.000      |
| **TOTAL**         |                           | **$1.390.800** |

### Ejemplo 3 — fecha especial (override absoluto) + finde + cargo

Noche 31/12 con precio especial de Año Nuevo que reemplaza la temporada; encima cae un
recargo de finde; 1 noche + cargo de desayuno extra.

- `fechas_especiales`: `{ fecha: '2026-12-31', precio: 1.000.000 }` → **override**, ignora temporada
- Finde largo `recargo_pct: 20`
- Dinámicos off, sin promo
- Cargo único “Desayuno extra”: $20.000

| Paso                 | Cálculo               | Resultado      |
|----------------------|-----------------------|----------------|
| Base = fecha especial| override absoluto      | $1.000.000     |
| Dinámico (off)       | ×1                    | $1.000.000     |
| Finde +20%           | 1.000.000 × 1.20      | $1.200.000     |
| Promo (ninguna)      | ×1                    | $1.200.000     |
| **Noche**            | round                 | **$1.200.000** |
| Subtotal             | 1.200.000 × 1 noche   | $1.200.000     |
| Cargos               | Desayuno extra        | $20.000        |
| **TOTAL**            |                       | **$1.220.000** |

## Facturación e IVA (Contabilidad)

El precio de la cascada **no** discrimina IVA. En Contabilidad, cada movimiento de ingreso
lleva un flag `facturado` (bool) y `nroComprobante`, y queda linkeado a su reserva por
`reservaId`. El resumen calcula el IVA **solo sobre lo facturado**, tomando el monto como
IVA-incluido:

```
IVA = facturado / 1.21 * 0.21          // 21%, monto ya con IVA
```

- `resumenFacturacionReserva(rid)` → `{ cobrado, facturado, sinFacturar }` de una reserva
  (suma sus movimientos de ingreso por `reservaId`).
- La comisión de plataforma se registra una sola vez por reserva, gobernada por el flag
  `reserva.comisionRegistrada`, como movimiento de egreso linkeado por `reservaId`.

## Dónde vive cada cosa (index.html)

| Función                       | Rol                                                        |
|-------------------------------|------------------------------------------------------------|
| `precioDefaultCabana(hab,f)`  | Precio de temporada (alta/baja/base) — paso 1 base         |
| `ajusteDinamicoPct(fecha,din)`| Suma ocupación + último momento → % dinámico               |
| `precioNocheCascada(hab,fecha)`| Precio por noche con toda la cascada aplicada             |
| `cargosReservaTotal(ids)`     | Suma de cargos únicos por lista de ids                     |
| `calcularPrecioReserva(...)`  | Punto único: `{noches, precioNoche, subtotal, cargosTotal, total}` |
| `totalReserva(r)`             | Total autoritativo (guardado o recalculado)                |
| `resumenFacturacionReserva(rid)`| `{cobrado, facturado, sinFacturar}` desde movimientos    |
