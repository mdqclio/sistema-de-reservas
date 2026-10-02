# Precios: edición de tipo, m² y capacidad por cabaña

Branch: `feat/precios-habitaciones` (desde `main` @ 02813d7, independiente de `fix/franco-oct`).

## Problema

Franco detectó que las cabañas 7 y 8 figuran con 4 pax cuando son Lofts de 6. La única
forma de corregir tipo/m²/capacidad era `migrateHabitacionesConfig`, que corre una sola
vez (flag `cabanas/_migrado/habitaciones_config`) y ya corrió. No había edición en la app.

## Cambio

Pantalla **Precios → tab "🏕 Por Cabaña"**: tres columnas nuevas por fila, antes de los precios:
- **Tipo**: select con Monoambiente / 2 Ambientes / Loft (`TIPOS_CABANA`).
  Si una cabaña tiene en la DB un tipo fuera de la lista, se muestra igual como opción
  (no se pisa en silencio); si no tiene tipo, aparece "—" hasta que se elija uno.
- **m²** y **Pax** (capacidad): inputs numéricos.

Escritura: `updateHabConfig(hab, field, val)`, mismo patrón que `updateHabPrecio`
(`DB.get('precios')` → modifica la fila de `precios.habitaciones` → `DB.set('precios')` +
`auditLog('editar','Precios', ...)`). Registrada en `window`.

Validación (`normalizarHabConfig`, pura): tipo ∈ lista; m² y capacidad enteros > 0. Si el
valor es inválido (vacío, 0, negativo, decimal): aviso de error, no guarda, y re-renderiza
la tabla para volver al valor guardado.

**No se tocó** `migrateHabitacionesConfig` ni su flag, ni `CABANA_CONFIG`.

Quien lee estos campos (grilla, carga de grupo, voucher/token, bot) ya los toma de
`precios.habitaciones`, así que la corrección se refleja en todos lados sin más cambios.

## Para Franco

Precios → Por Cabaña → cabañas 7 y 8: Tipo = Loft, Pax = 6 (y m² = 60 si hace falta).
Se guarda al salir del campo.

## Verificación

- `node --check` sobre el módulo de `index.html`: OK.
- 9 suites: precios 43 (+10 nuevos), today 4, contabilidad 40, fmt 17, grilla 27, total 25,
  grupos 33, voucher 34, modal 14 → **237 passed, 0 failed**.
  (grilla 27 y no 38: esta rama sale de `main`, sin los tests de `fix/franco-oct`.)
- grep de `window`: `updateHabConfig` registrado; es la única función nueva en `onchange`.
- Diff no toca `migrateHabitacionesConfig`, `_migrado`, `security/` ni `firebase.json`.
