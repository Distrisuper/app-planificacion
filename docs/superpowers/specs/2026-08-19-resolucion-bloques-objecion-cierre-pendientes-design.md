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

### 3. "Resolución" pasa de grid plano a un segmentado Objeción/Cierre + Pendientes

Se probó primero con Objeción y Cierre **lado a lado** en dos columnas. En un teléfono de 360px
cada columna queda en ~165px: las etiquetas largas ("No trabaja la marca o cambio") desbordaban
generando scroll horizontal, y sobre todo **no queda lugar para los paneles de detalle** — el de
Precio (marca/competidor/%) ya vive apretado, y hay más por venir (Plazo va a pedir días). Se
descartó por eso.

El layout final alterna Objeción y Cierre en el mismo espacio, a ancho completo:

```
┌────────────────────────────────┐
│ MARCA (opcional)               │
│ AG                          ✓ ⌄│
└────────────────────────────────┘
┌───────────────┬────────────────┐
│ ◤ OBJECIÓN    │     CIERRE     │  ← segmentado
└───────────────┴────────────────┘
┌────────────────────────────────┐
│ ☐ Precio                       │
│ ☐ DS 100%                      │
│ ☐ Plazo                        │
│    └─ días: [____]             │
│ ☐ Flete                        │
│ ☐ No trabaja la marca o cambio │
└────────────────────────────────┘
┌────────────────────────────────┐
│ PENDIENTES                     │
│ ☐ Cupo         ☐ Suscriptor    │
└────────────────────────────────┘
```

- **Objeción** = `resultado: 'perdido'`; **Cierre** = `resultado: 'ganado'`; **Pendientes** =
  `resultado: 'diferido'`.
- **Que Objeción y Cierre sean excluyentes no es una decisión de layout**: `ganado` y `perdido`
  ya no podían convivir en el dato. El segmentado hace visible esa regla en vez de que el vendedor
  la descubra viendo cómo se le destilda algo solo.
- **Pendientes se muestra SOLO en el segmento Objeción.** Acompaña a una objeción y no convive con
  un cierre (ver la regla de convivencia): ofrecerlo del lado de Cierre sería poner a la vista un
  tilde que borra lo que el vendedor acaba de cargar. La regla igual vive en `conviven()` — el
  layout la hace difícil de alcanzar, no innecesaria.
- Como los pendientes se esconden junto con Objeción, **el contador del segmento Objeción los
  suma**. Sin eso, un Cupo tildado quedaría invisible *y* sin contar al pasar a Cierre.
- **Cambiar de segmento no borra nada.** Es una vista, no un reset: limpiar lo tildado al tocar
  una pestaña sería pérdida silenciosa. Solo tildar descarta lo incompatible.
- **El segmento muestra un contador** de lo tildado de su lado. Es el corolario obligatorio de lo
  anterior: sin él, lo cargado del otro lado quedaría seleccionado pero invisible.
- **El segmento inicial es Objeción**, salvo que el borrador ya traiga un motivo de Cierre tildado
  — ahí abre en Cierre, para no obligar a buscar la carga propia.
- Con **un solo bloque con motivos** (catálogo a medio migrar) no se dibuja el segmentado: ese
  bloque se muestra con su título, como Pendientes. Un segmentado con una pestaña muerta invita
  a tocarla.
- El color de cada checkbox sigue saliendo de `colorDeResultado(resultado)` — esa función no cambia.
- **Fallback defensivo:** si algún motivo llega con `resultado: 'no_ofrecido'` o `null`, se agrupa
  en una sección "Otros" al final. Evita que un motivo se pierda en silencio si el catálogo real
  todavía no está migrado del todo.

### 3b. Qué resoluciones conviven

La regla de "un solo bucket a la vez" se afina — antes los tres buckets eran mutuamente
excluyentes, y eso contradecía el negocio:

| combinación | ¿convive? | por qué |
|---|---|---|
| dos del mismo `resultado` | sí | dos razones de una misma pérdida |
| Objeción + Pendiente | **sí** | "no compró por precio, pero le queda el cupo" |
| Cierre + Pendiente | **no** | si cerró, no quedó nada pendiente |
| Objeción + Cierre | no | contradicción directa |

Se implementa con un helper `conviven(a, b)` y un `filter` en `toggle()` (conservar lo compatible)
en vez del `every` + vaciado anterior. Filtrar en vez de vaciar es lo que hace que el resultado no
dependa del orden en que se tildan.

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
- El panel de detalle de "Plazo" (días) y cualquier otro campo nuevo por motivo. El layout deja
  lugar para eso, pero `requiereDetalle` hoy solo modela marca/competidor/%: sumar un campo
  distinto es otra tarea.

## El catálogo tarda hasta 35 minutos en reflejar un cambio en la base

No es un bug, pero cuesta media hora de confusión cada vez que se descubre de nuevo. Dar de baja
un motivo (`activo = 0`) no se ve al instante porque hay **dos caches en serie**:

| capa | dónde | TTL |
|---|---|---|
| backend | `MotivosService.ts` — variable de módulo, no se invalida al escribir en la base | 5 min |
| frontend | `useMotivos.ts` — `staleTime` de React Query, en memoria | 30 min |

El del frontend es el que más engaña: navegar dentro de la SPA no refetchea, así que el catálogo
viejo sobrevive hasta que se recargue la página. Para forzar el refresco: reiniciar `api-vendedores`
y hacer un hard reload del browser.

Los dos TTL se dejan como están — el catálogo es dato que casi no cambia, y el vendedor está en la
calle con datos móviles.

## Limitación conocida (no la arregla este cambio)

**La marca elegida no se persiste.** `marca` viaja dentro del mismo campo `detalle` que `accion`
(un JSON en `pl_ofrecimiento.detalle`), y `validarDetalleAccion` en
`api-vendedores/src/services/planificacion/ofrecimientoValidation.ts` **rechaza con 400
(`DETALLE_INVALIDO`) todo `detalle` cuyo `accion` no sea un string no vacío**. Al sacar Acción
Comercial del formulario ya no queda forma de setear ese código, así que `VisitaSheet` (que ya
contemplaba el caso) manda `detalle: null` y la marca queda solo como borrador en pantalla.

Esto ya pasaba antes si el vendedor cargaba marca sin elegir acción; lo que cambia es que ahora es
el único camino posible. Arreglarlo requiere relajar esa validación en `api-vendedores` — otro
repo, fuera del alcance de este cambio front-only. Queda anotado acá para no re-descubrirlo.
