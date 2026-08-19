# Resolución del ofrecimiento: bloques Objeción/Cierre/Pendientes

**Fecha:** 2026-08-19
**Estado:** aprobado

## Contexto

El formulario de resolución de un rubro (`ResolucionOfrecimiento`, dentro de `ResolucionWizard`)
hoy muestra, en este orden: chip de **Acción Comercial** (Sin acción / Plan cupo / Descuento /
Promoción / Cobranza), chip de **Marca**, y un checklist plano de **Resolución** en grid de 2
columnas, coloreado por `resultado` del motivo (verde=ganado, amarillo=diferido, naranja=perdido,
rojo=no_ofrecido) pero sin agrupación visual explícita.

El pedido es reordenar y reagrupar ese formulario. Es un cambio de **presentación**, no de datos:
el catálogo de motivos (`pl_motivo`) ya viaja completo desde el backend vía `useMotivos`/`getMotivos`,
y el componente ya lo renderiza sin hardcodear nombres — solo cambia cómo se agrupa lo que llega.
Los ítems nuevos del catálogo (PRECIO, DS 100%, PLAZO, FLETE, NO TRABAJA LA MARCA O CAMBIO / DTO,
PLAZO, FLETE, DS / CUPO, SUSCRIPTOR) los siembra el usuario directo en base de datos — **no es parte
de este cambio** ni requiere tocar `api-vendedores`.

## Qué cambia

### 1. Se quita el bloque "Acción Comercial"

Deja de renderizarse `<AccionComercialPicker>` dentro de `ResolucionOfrecimiento`, junto con:
- el helper `onChangeAccionChip` que lo alimentaba,
- la prop `onAplicarAccion` / botón "Aplicar a restantes" de Acción,
- en `ResolucionWizard`: la función `aplicarAccion`, el `useAcciones()` y la prop `acciones` que
  bajaba a `ResolucionOfrecimiento`.

**No se purga** el tipo `IAccionComercial` ni el campo `accion` en el resto del código
(`useOfrecimientos`, `OfrecimientoTable`, `VisitaSheet`, `VisitaFlow`, backend): Marca sigue
viajando sobre el mismo objeto (`{ accion: null, marca }`), así que tocar ese contrato es un cambio
más grande y fuera de alcance. Queda como deuda menor aceptada: el código que lee `accion.accion`
en otros componentes simplemente nunca lo va a ver seteado desde este formulario.

### 2. Marca es el primer bloque

`<MarcaOfrecimientoPicker>` se renderiza primero (antes iba segundo). Su comportamiento no cambia:
elegir del catálogo de marcas, chip "Aplicar a restantes" propio.

### 3. "Resolución" pasa de grid plano a 3 bloques agrupados por `resultado`

En vez de un `grid-cols-2` con todos los motivos mezclados, se arma:

```
┌─ OBJECIÓN ──────┐ ┌─ CIERRE ────────┐
│ ☐ Precio        │ │ ☐ Dto           │
│ ☐ DS 100%       │ │ ☐ Plazo         │
│ ☐ Plazo         │ │ ☐ Flete         │
│ ☐ Flete         │ │ ☐ DS            │
│ ☐ No trabaja... │ │                 │
└─────────────────┘ └─────────────────┘
┌─ PENDIENTES ───────────────────────────┐
│ ☐ Cupo              ☐ Suscriptor       │
└─────────────────────────────────────────┘
```

- **Objeción** = motivos con `resultado: 'perdido'`.
- **Cierre** = motivos con `resultado: 'ganado'`.
- Objeción y Cierre van en la misma fila (2 columnas, mitad y mitad) porque son conceptos
  simétricos — uno negativo, uno positivo — y se leen mejor comparados a la misma altura.
- **Pendientes** = motivos con `resultado: 'diferido'`, en su propia fila debajo, ancho completo.
- Dentro de cada bloque, los motivos van en **una sola columna** (no 2, como hoy), porque los
  bloques ya son más angostos que el grid completo anterior.
- El color de cada checkbox sigue saliendo de `colorDeResultado(resultado)` — no cambia esa función,
  solo dónde se posiciona cada motivo.
- **Fallback defensivo:** si algún motivo llega con `resultado: 'no_ofrecido'` o `null` (no debería
  pasar con el catálogo nuevo, pero el componente no puede asumir que el backend nunca lo mande),
  se agrupa en una sección "Otros" al final, sin título destacado. Esto evita que un motivo se
  pierda silenciosamente si el catálogo real todavía no está migrado del todo.

### 4. El detalle expandible no cambia de lógica

Sigue atado a `requiereDetalle` (no al nombre del motivo), así que seguirá funcionando para el
motivo PRECIO de Objeción sin tocar esa parte del código. Se expande dentro de su propio bloque,
empujando hacia abajo el resto de esa columna; no afecta al bloque Cierre.

### 5. Tests a actualizar

- `ResolucionOfrecimiento.test.tsx`: se borran los tests de Acción Comercial y de "aplicar a
  restantes" de acción (`onAplicarAccion`, prop `acciones`); las fixtures de `motivos` se ajustan
  para cubrir los 3 buckets con nombres nuevos; se agregan tests de agrupación (cada motivo aparece
  bajo el título de bloque correcto).
- `ResolucionWizard.test.tsx`: se ajusta donde referencie `acciones`/`useAcciones`/`onAplicarAccion`.

## Fuera de alcance

- Cambios en `api-vendedores` o en el esquema de `pl_motivo` — no hacen falta.
- Sembrar los motivos nuevos en la base — lo hace el usuario directamente.
- Purgar `IAccionComercial`/`accion` del resto del código (`OfrecimientoTable`, `useOfrecimientos`,
  backend) — Marca sigue dependiendo de ese contrato.
- Cambiar la lógica de "un solo bucket de resultado a la vez" (motivos del mismo bucket conviven,
  de otro bucket reemplazan) — no se toca, solo se reagrupa visualmente.
