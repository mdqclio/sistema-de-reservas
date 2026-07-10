# Cascada de precios

Un **único** punto calcula el precio de toda reserva: `calcularPrecioReserva()`
(index.html, ~línea 3321). Reemplaza el viejo `precio × noches` que estaba disperso
en `saveReserva` / `confirmCheckin` / `openPago` / grilla. Todos esos sitios ahora
llaman a la cascada.

El precio es **final al huésped, sin IVA discriminado** (el IVA se calcula recién en
Contabilidad, y solo sobre lo efectivamente facturado — ver más abajo).

## Los factores, en orden de aplicación

El precio se calcula **noche por noche** y el total es la **suma de las noches** (una
estadía que cruza un finde o un cambio de temporada cobra bien cada noche — ver Ejemplo 2).
Cada noche se arma multiplicativo:

```
noche = base                         // temporada(fecha)
                                     //   ó fecha_especial → override ABSOLUTO que PISA
                                     //     base Y finde (es EL precio de esa noche)
noche *= (1 + finde%)                // recargo si la fecha cae en un finde/feriado
                                     //   configurado — SALVO que sea fecha_especial
── ajuste EXCLUSIVO (a lo sumo UNO), prioridad promo > último momento > ocupación ──
  · promo elegida y vigente esa noche → noche *= (1 - promo%)
  · si NO hay promo elegida y dinamicos.activo:
      último momento (ventana de días hasta la entrada) → noche *= (1 + ajuste%)
      si no aplica último momento, ocupación del día      → noche *= (1 + ajuste%)

noche  = round(noche)
total  = Σ noches  +  Σ cargos_únicos
```

Reglas duras:

- **La promo la elige el staff** (dropdown en el form → `r.promo`). NO se auto-aplica por
  fecha. Sin promo elegida, no hay descuento.
- **Los tres ajustes son mutuamente excluyentes.** A lo sumo uno modifica la noche.
  Si hay promo elegida, los dinámicos **no corren**. Sin promo, primero se prueba último
  momento; solo si no aplica se prueba ocupación.
- **`fecha_especial` es un override absoluto.** Reemplaza temporada **y** finde de esa
  noche; encima solo puede caer el ajuste exclusivo (promo o dinámico).

Con `dinamicos`, `fines_semana_largos`, `promociones` y `fechas_especiales` **vacíos**
(estado por defecto del sistema), el resultado es idéntico a `precioDefaultCabana` → la
cascada no cambia nada de la operación viva. Los factores se “encienden” a medida que se
cargan en **Configuración → Precios**.

### 1. Base — temporada o fecha especial

- Por defecto: `precioDefaultCabana(hab, fecha)` → precio de temporada de esa cabaña
  (`precio_alta` / `precio_baja` / `precio_base` según en qué temporada cae la fecha).
- Si existe una entrada en `precios.fechas_especiales` cuya `fecha` coincide **exacto**
  con la noche, su `precio` es un **override absoluto**: reemplaza por completo el precio
  de temporada de esa noche **y no recibe el recargo de finde**. Es EL precio de esa noche.
  Encima solo puede caer el ajuste exclusivo (promo o dinámico) del paso 3.

### 2. Finde / feriado

`precios.fines_semana_largos[]` (`{fecha_inicio, fecha_fin, recargo_pct}`). Si la noche cae
dentro de un rango, se aplica `× (1 + recargo_pct/100)` **sobre la base de temporada**.
No se aplica si la noche es una `fecha_especial` (el override ya la fijó).

### 3. Ajuste exclusivo — promo · último momento · ocupación

**A lo sumo UNO** de estos tres modifica la noche. Prioridad **promo > último momento >
ocupación**:

- **Promo** (`precios.promociones[]`, `{tipo:'descuento_pct', fecha_inicio, fecha_fin, valor}`):
  se aplica **solo si el staff la eligió** en el form (`r.promo`) **y** la noche cae dentro
  de su rango → `× (1 - valor/100)`. **Elegir una promo apaga los dinámicos** para toda la
  reserva (las noches fuera del rango de la promo quedan sin ajuste).
- **Último momento** (`dinamicos.last_minute[]`, `{dias, ajuste_pct}`): solo si NO hay promo
  elegida y `dinamicos.activo`. Mide los días entre hoy y la **fecha de entrada** (proximidad
  al check-in, igual para toda la estadía). Se elige el tramo de **menor `dias`** que la
  ventana cumple (`días_hasta_entrada <= dias`). Suele ser descuento (`ajuste_pct` negativo).
- **Ocupación** (`dinamicos.ocupacion[]`, `{desde_pct, ajuste_pct}`): solo si NO hay promo
  elegida, `dinamicos.activo` y **ningún tramo de último momento aplicó**. Mide el % de
  cabañas ocupadas esa noche (reservas `confirmada`/`checkin` que la cubren). Se elige el
  tramo de **mayor `desde_pct`** que la ocupación alcanza.

> Último momento y ocupación **ya no se suman** — son excluyentes. Si la ventana de último
> momento aplica, la ocupación se ignora esa reserva.

### 4. Cargos únicos (fijos por reserva)

`precios.cargos_unicos[]` (`{id, nombre, monto}`). NO son por noche: son montos **fijos por
reserva** (limpieza, ropa blanca, mascota, etc.). El staff los tilda en el selector del modal
de reserva; se guardan como lista de ids en `reserva.cargos`. `cargosReservaTotal(ids)` suma
sus `monto`. Se agregan al final, **fuera** de la multiplicación por noches.

## Notas de implementación

- **Noche por noche.** `calcularPrecioReserva` recorre cada noche `[entrada, salida)`,
  calcula su cascada y suma. Devuelve `preciosNoche[]` (una entrada por noche) + `subtotal`.
  El “precio por noche” representativo (`precioNoche`, para display y `r.precio`) es el de la
  **primera** noche.
- **Último momento se mide desde la entrada**, no desde cada noche: la ventana de proximidad
  al check-in es la misma para toda la estadía. Ocupación sí es por-noche.
- **Override manual.** Si el staff fija un `precio/noche` manual en el modal (`precioOverride`
  > 0), ese valor fijo **reemplaza** la cascada de todas las noches; los cargos únicos igual
  se suman.
- **Promo persistida.** La promo elegida se guarda en `r.promo` (id) y se re-pasa a la
  cascada al recalcular.
- **Total autoritativo.** `totalReserva(r)` devuelve `r.total` guardado (calculado con la
  cascada al guardar) o, para reservas viejas sin `total`, lo recalcula respetando
  `r.precio`, `r.cargos` y `r.promo` guardados.

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

### Ejemplo 2 — noche por noche: estadía que cruza un finde + promo elegida

3 noches (10→13 ene). Finde configurado 10–11/01 `recargo_pct: 20`. Staff **elige** la promo
“Enero −10%” (vigente todo enero). Base temporada $500.000.

- Promo elegida ⇒ **dinámicos apagados**.
- Finde es independiente del ajuste exclusivo: se aplica sobre la base y **además** la promo.
- Cada noche se calcula sola; el total es la suma:

| Noche | Base    | Finde        | Promo −10%   | **Noche (round)** |
|-------|---------|--------------|--------------|-------------------|
| 10/01 | 500.000 | ×1.20 → 600.000 | ×0.90 → 540.000 | **$540.000** |
| 11/01 | 500.000 | ×1.20 → 600.000 | ×0.90 → 540.000 | **$540.000** |
| 12/01 | 500.000 | — (no finde)    | ×0.90 → 450.000 | **$450.000** |

- Subtotal = 540.000 + 540.000 + 450.000 = **$1.530.000**
- Cargos: ninguno ⇒ **TOTAL = $1.530.000**

> Con el motor viejo (todo al precio del día de entrada) las 3 noches costaban 540.000 c/u
> = $1.620.000: **sobrecobraba** la noche del 12 que ya no es finde. Ese es el bug que
> corrige el cálculo noche por noche.

### Ejemplo 3 — fecha especial (pisa el finde) + último momento + cargo

Noche 31/12 con precio especial de Año Nuevo. Ese día también hay un finde configurado
(`recargo_pct: 20`) → se **ignora** (el override manda). Sin promo elegida, con dinámicos
activos y la reserva cargada a 2 días de la entrada (último momento −10%). 1 noche + cargo.

- `fechas_especiales`: `{ fecha: '2026-12-31', precio: 1.000.000 }` → **override absoluto**
- Finde `recargo_pct: 20` sobre el 31/12 → **no aplica** (es fecha especial)
- Sin promo → corre el ajuste dinámico exclusivo: último momento `−10%`
- Cargo único “Desayuno extra”: $20.000

| Paso                    | Cálculo             | Resultado      |
|-------------------------|---------------------|----------------|
| Base = fecha especial   | override absoluto   | $1.000.000     |
| Finde                   | **ignorado**        | $1.000.000     |
| Último momento −10%      | 1.000.000 × 0.90    | $900.000       |
| **Noche**               | round               | **$900.000**   |
| Subtotal                | 900.000 × 1 noche   | $900.000       |
| Cargos                  | Desayuno extra      | $20.000        |
| **TOTAL**               |                     | **$920.000**   |

> Ocupación no entra: al aplicar último momento, la ocupación se ignora (exclusividad).

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

| Función                              | Rol                                                        |
|--------------------------------------|------------------------------------------------------------|
| `precioDefaultCabana(hab,f)`         | Precio de temporada (alta/baja/base) — paso 1 base         |
| `promoVigente(promo,fecha)`          | ¿La promo cubre esa noche? (rango de fechas)               |
| `promosVigentesRango(entrada,salida)`| Promos elegibles para la estadía → alimenta el dropdown    |
| `tramoUltimoMomento(entrada,din)`    | Tramo de último momento por días hasta la entrada          |
| `tramoOcupacion(fecha,din)`          | Tramo de ocupación por % de cabañas ocupadas esa noche     |
| `precioNocheCascada(hab,fecha,opts)` | Precio de UNA noche con toda la cascada (`opts.entrada`, `opts.promoId`) |
| `cargosReservaTotal(ids)`            | Suma de cargos únicos por lista de ids                     |
| `calcularPrecioReserva(...)`         | Punto único, noche por noche: `{noches, precioNoche, preciosNoche, subtotal, cargosTotal, total}` |
| `totalReserva(r)`                    | Total autoritativo (guardado o recalculado con `r.promo`)  |
| `resumenFacturacionReserva(rid)`     | `{cobrado, facturado, sinFacturar}` desde movimientos      |
| `renderResPromos(id)`                | Puebla el dropdown de promo del form; conserva selección   |

## Tests

`tests/precios.test.mjs` extrae las funciones puras de `index.html` (regex + `new Function`,
sin DOM) y las corre con mocks. Cubre los tres desvíos corregidos: fecha especial pisa finde,
precio noche por noche (cruce de finde), promo manual y exclusividad promo > último momento >
ocupación.

```
node tests/precios.test.mjs      # 13 casos
```
