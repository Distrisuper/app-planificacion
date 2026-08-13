# La acción comercial pasa a la resolución del rubro

**Fecha:** 2026-08-13
**Estado:** diseño aprobado, listo para plan de implementación
**Alcance:** app-planificacion (frontend) + api-vendedores (endpoint de resolución + seed de motivos)

Reemplaza el enfoque de
[`2026-08-13-detalle-dinamico-ofrecimiento-design.md`](2026-08-13-detalle-dinamico-ofrecimiento-design.md)
y [`2026-08-13-buscador-unificado-alcance-design.md`](2026-08-13-buscador-unificado-alcance-design.md)
en lo que hace al alta de acciones. El modelo de datos que aquellos specs construyeron
(`detalle` JSON, registro de módulos por código de acción, validadores espejo) **se
conserva y se reusa**; lo que cambia es **dónde** se carga.

## El problema

Hasta ahora, "Plan cupo" y "Descuento" se cargaban como un ofrecimiento propio
(`tipo: 'accion'`) con un `alcance` libre que podía apuntar a marcas y rubros. Eso deja
dos problemas:

1. **Duplicación con la propuesta.** Si el alcance de un Descuento apunta a
   "Amortiguadores", y "Amortiguadores" ya es una fila de la propuesta congelada, el
   vendedor tiene que resolver dos cosas para un solo hecho comercial. Se evaluó que
   resolver la acción auto-resolviera el rubro (hay evidencia de que en el mundo real el
   resultado es único: en `scripts/scripts/out/seguimientos.json`, ~90%+ de las notas
   donde una acción abarca varios rubros/marcas reportan **un solo** desenlace, no uno
   por ítem), pero sincronizar dos ofrecimientos agrega complejidad que este cambio
   evita de raíz: hay un solo ofrecimiento, el rubro.

2. **El catálogo de motivos no le sirve a una acción.** Los motivos actuales fueron
   diseñados para "ofrecí un rubro, ¿qué pasó?". Aplicados a un cupo, varios son opciones
   muertas y falta el desenlace más común. Evidencia de `seguimientos.json`:

   | Desenlace real de un cupo | ¿Existe hoy? |
   |---|---|
   | *"lo va a tener en cuenta"*, *"lo hablan internamente"*, *"lo revisa con Agus"* — **el más frecuente** | no |
   | *"anotamos en plan cupo"*, *"se suman al cupo 1.5M"*, *"renovación confirmada"* (alta sin pedido) | no |
   | *"no le interesa"*, *"no lo ve viable"*, *"no quiere asumirlo"* | no |
   | *"le parece mucho 1M"*, *"cupo le queda lejos"*, *"no cree que llegue"* (monto inalcanzable, ≠ Precio) | no |
   | *"tiene stock"*, *"no hacen stock, compran repo"* | no |

   Y al revés: **Flete** prácticamente nunca cierra un cupo, **No lo ofrecí** no aparece
   nunca en notas de cupo, y **Pasa pedido mañana** casi tampoco (el horizonte del cupo es
   fin de mes).

## La decisión

**La acción comercial deja de ser un ofrecimiento y pasa a ser una dimensión de la
resolución de un rubro.** Al resolver "Amortiguadores", el vendedor puede indicar que fue
con Plan cupo / Descuento, con qué marca, y con qué parámetros — y entonces el checklist
de motivos cambia al vocabulario propio de las acciones.

Se descartaron dos alternativas:

- **La acción como un motivo más del catálogo actual** (cero cambios de backend, incluso
  ya existe un motivo "DS"): el motivo "Plan cupo" ocuparía el slot de *qué pasó*, y
  entonces no queda dónde registrar el desenlace real — justo el dato que la evidencia
  muestra como más frecuente ("lo va a considerar").
- **Mantener dos ofrecimientos vinculados** (rubro + acción con alcance): es lo que
  existe hoy y lo que este cambio viene a evitar.

## Modelo de datos

El rubro resuelto guarda en su propio `detalle` (columna `pl_ofrecimiento.detalle JSON`,
ya existente):

```ts
interface IAccionComercial {
    /** Código del catálogo pl_accion: CUPO | DESCUENTO | PROMO | COBRANZA. */
    accion: string
    /** Marca elegida para ese rubro. null = la acción no es de una marca puntual. */
    marca: string | null
    /** Lo que produce el editor del registro de esa acción: {tramos} para Cupo,
     *  {pct} para Descuento. Sin módulo registrado, undefined. */
    params?: unknown
}
```

Los **motivos siguen siendo una lista aparte** (`pl_ofrecimiento_motivo`, sin cambios):
`detalle` dice *con qué se ofreció*, los motivos dicen *qué pasó*. Mantener esas dos
preguntas separadas es lo que hace que el caso "ofrecí un cupo y lo va a considerar" sea
representable.

**Lo que se deja de usar:** `tipo: 'accion'` como ofrecimiento propio. El front deja de
ofrecerlo en el alta y deja de escribir `alcance`. Nada se borra del backend — la columna,
la tabla `pl_ofrecimiento_alcance` y el tipo en el ENUM siguen existiendo, sin escritores
desde esta app.

## Catálogo de motivos de acción

Nivel nuevo `'accion'` en `pl_motivo`. **No requiere cambio de esquema:** `nivel` es
`VARCHAR(20)` (ver `docs/db-notes/planificacion-ciclo-tables.sql:35`), no un ENUM — es un
`INSERT IGNORE` más, con `motivo_id` explícito como el resto del seed.

Cada motivo lleva su `resultado` para que la analítica existente (que agrupa por
`ganado`/`diferido`/`perdido`/`no_ofrecido`) siga funcionando sin tocar nada:

| descripcion | resultado | por qué |
|---|---|---|
| Se sumó al plan | `ganado` | *"anotamos en plan cupo"*, *"renovación confirmada"* |
| Saqué pedido | `ganado` | *"Ofrezco CUPO 2.2M 3% 3M 5%, saco pedido"* |
| Lo va a considerar | `diferido` | el desenlace más frecuente de todos |
| No le interesa | `perdido` | *"no le interesa"*, *"no quiere asumirlo"* |
| Le queda lejos el monto | `perdido` | *"le parece mucho 1M"*, *"no cree que llegue"* |
| Tiene stock | `perdido` | *"tiene stock"*, *"compra solo repo"* |

`requiere_detalle` va en 0 para todos: el detalle de la acción vive en `detalle`, no en
las columnas `marca`/`competidor`/`pct_diferencia` del motivo (esas siguen siendo del
motivo "Precio"). En particular **no se reusa `pct_diferencia`** para el porcentaje de un
descuento — es la trampa que `CLAUDE.md` marca explícitamente.

El tipo `NivelMotivo` pasa a `'visita' | 'ofrecimiento' | 'accion'` en los dos repos.

## UI

En `ResolucionOfrecimiento.tsx`, arriba del checklist, una fila opcional: **"¿Con acción
comercial?"**, por defecto en "Ninguna". Sin acción elegida la pantalla queda
**exactamente como hoy** — el caso simple no cambia en nada.

Al elegir una acción se expande, debajo: selector de acción, selector de marca, y el
editor de parámetros que corresponda (los ya existentes: `EditorCupo` con tramos,
`EditorDescuento` con %, vía `registroDetalleAccion`). Y el checklist de motivos pasa a
mostrar los de `nivel: 'accion'` en vez de los de `'ofrecimiento'`.

Componente nuevo: `AccionComercialPicker` (acción + marca + editor de params), montado
dentro de `ResolucionOfrecimiento`. Los editores de Cupo/Descuento y el registro se reusan
tal cual, sin cambios.

**Marca "de ese rubro":** el catálogo disponible hoy (`/sale/brand/catalog`) es global, no
filtrado por rubro. Esta vuelta usa ese catálogo con el `CatalogoPicker` que ya existe
(mismo componente que el campo Marca del motivo "Precio"). Filtrar por rubro queda
pendiente hasta que exista una fuente que lo permita — inventar el filtro en el front
sobre datos que el backend no tiene sería mentir sobre la relación marca↔rubro.

## Backend

**a) `resolverOfrecimiento` acepta y persiste `detalle`.** Hoy `detalle` solo se escribe
al **crear** un ofrecimiento (`crearFueraDePropuesta`), pero acá se carga al **resolverlo**
— así que `IResolverOfrecimientoDTO` suma `detalle?: unknown`, y
`OfrecimientoRepository.resolver` lo persiste junto con los motivos. Este es el cambio más
real del backend: es un endpoint tocado, no solo datos sembrados.

**b) Se relaja la regla de `tipo === 'accion'`.** `crearFueraDePropuesta` hoy descarta
`detalle` en silencio si el tipo no es acción (regla del spec anterior); ahora un rubro
también puede tenerlo. La regla se saca en los dos caminos (crear y resolver).

**c) Seed de los motivos de acción** (tabla de arriba) y ampliación de `NivelMotivo`.

**Sin cambios:** validación de `detalle` (`accionDetalleValidators` ya valida por código de
acción y se sigue usando igual), esquema de la base, `pl_accion`, `pl_ofrecimiento_alcance`.

## Testing

**Frontend**
- `AccionComercialPicker.test.tsx` (nuevo): elegir una acción muestra su editor de params;
  cambiar de acción descarta los params de la anterior; volver a "Ninguna" deja el detalle
  en `undefined`; elegir marca la incluye en el detalle.
- `ResolucionOfrecimiento.test.tsx` (ampliar): **sin** acción el checklist es el de
  siempre (regresión — el caso simple no cambió); **con** acción el checklist pasa a los
  motivos de nivel `'accion'`; cargar acción+marca+params produce el `detalle` con la forma
  esperada.
- `useMotivos` / wizard: se pide el nivel `'accion'` solo cuando hay acción elegida.

**Backend**
- `OfrecimientoRepository.spec.ts`: `resolver` persiste `detalle` junto con los motivos;
  resolver sin `detalle` no lo pisa con null.
- `crearFueraDePropuesta` persiste `detalle` también para `tipo: 'rubro'` (invierte el test
  que hoy afirma lo contrario).
- `MotivosService`: `list('accion')` devuelve solo los de ese nivel.

## Fuera de alcance

- **Filtrar marcas por rubro** — no hay fuente hoy (ver UI).
- **Acciones sin rubro asociado.** El cupo global del cliente (*"Ofrezco CUPO 1.5M 3% 2M
  5%"* sin mencionar rubro) queda sin vía de carga estructurada en esta vuelta, porque el
  alta de acciones sueltas se saca. Es una pérdida consciente respecto del estado anterior;
  si aparece como necesidad real, se resuelve después.
- **Migrar ofrecimientos `tipo: 'accion'`** ya cargados probando — no hay datos productivos.
- **Borrar el código de alcance** (`AlcancePicker`, `AlcanceBuscador`) más allá de sacarlo
  del alta: queda sin uso, se limpia cuando esté confirmado que no vuelve.
