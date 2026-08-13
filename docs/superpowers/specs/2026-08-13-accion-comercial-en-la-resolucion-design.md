# La acción comercial pasa a la resolución del rubro

**Fecha:** 2026-08-13
**Estado:** diseño aprobado, listo para plan de implementación
**Alcance:** app-planificacion (frontend) + api-vendedores (endpoint de resolución + seed de motivos)

Reemplaza el enfoque de
[`2026-08-13-detalle-dinamico-ofrecimiento-design.md`](2026-08-13-detalle-dinamico-ofrecimiento-design.md)
y [`2026-08-13-buscador-unificado-alcance-design.md`](2026-08-13-buscador-unificado-alcance-design.md)
en lo que hace al alta de acciones. El modelo de datos que aquellos specs construyeron
(`detalle` JSON, registro de módulos por código de acción, validadores) **se conserva y se
reusa**; lo que cambia es **dónde** se carga.

## Los dos ejes

Todo el diseño se apoya en separar dos preguntas que hoy se mezclan:

- **Con qué se ofreció** → `pl_ofrecimiento.detalle`: la acción comercial (Plan cupo,
  Descuento), su marca y sus parámetros.
- **Qué pasó** → los motivos, como siempre.

Los mismos datos, con dos ejemplos reales:

```
"Ofrecí Amortiguadores con plan cupo 2.5M→3%, lo va a tener en cuenta"
  ofrecimiento: tipo=rubro, codigo=AMORT
  detalle:      { accion: 'CUPO', marca: null, params: { tramos: [{umbral: 2500000, descuentoPct: 3}] } }
  motivos:      [Lo va a considerar]

"Ofrecí Amortiguadores con 5% en AG, saqué pedido"
  ofrecimiento: tipo=rubro, codigo=AMORT
  detalle:      { accion: 'DESCUENTO', marca: 'AG', params: { pct: 5 } }
  motivos:      [Saqué pedido]
```

**Por eso ningún motivo dice "cupo" ni "descuento".** Si lo dijera, el dato estaría cargado
dos veces y podría contradecirse (un motivo "Plan cupo" con `detalle.accion = 'DESCUENTO'`).
Distinguir una acción de otra es leer `detalle.accion`, y sigue siendo agrupable:
`GROUP BY detalle->>'$.accion'`, con MySQL indexando JSON vía columna generada — el camino
que el spec original ya dejó anotado.

## Problema 1: la acción no tiene dónde vivir

Hasta ahora, "Plan cupo" y "Descuento" se cargaban como un ofrecimiento propio
(`tipo: 'accion'`) con un `alcance` libre que podía apuntar a marcas y rubros. Si ese
alcance apuntaba a "Amortiguadores", y "Amortiguadores" ya era una fila de la propuesta
congelada, el vendedor tenía que resolver dos cosas para un solo hecho comercial.

Se evaluó que resolver la acción auto-resolviera el rubro — hay evidencia de que en el
mundo real el resultado es único: en `scripts/scripts/out/seguimientos.json`, ~90%+ de las
notas donde una acción abarca varios rubros/marcas reportan **un solo** desenlace, no uno
por ítem. Pero sincronizar dos ofrecimientos agrega complejidad que este cambio evita de
raíz: hay un solo ofrecimiento, el rubro, y la acción es un dato suyo.

## Problema 2: el catálogo de motivos está incompleto

Independiente de lo anterior, y confirmado con las mismas notas: el catálogo actual no
cubre lo que los vendedores efectivamente escriben. El caso más grave es que **el desenlace
más frecuente de todos no tiene dónde ir**.

| Lo que escriben | ¿Cae en algún motivo actual? |
|---|---|
| *"lo va a tener en cuenta"*, *"lo hablan internamente"*, *"lo revisa con Agus"*, *"va a analizar"* | **No.** Y no es "Pasa pedido mañana" ni "Pedido en la semana": esos son compromisos de pedido, no "lo va a pensar" |
| *"no le interesa"*, *"no quiere asumirlo"*, *"poco interés"* | **No** |
| *"tiene stock"*, *"por sobrestock"*, *"compra solo repo"*, *"no hacen stock"* | **No** |
| *"está atado al cupo de Expoyer"*, *"siguen trabajando con Mussio"*, *"compra directo a fábrica"* | **No.** No es "Precio": no discute el precio, ya está comprometido con otro |
| *"bajó mucho la venta"*, *"viene muy frenado el taller"*, *"arrancó flojo agosto"* | **No** |

Hoy el vendedor que quiere registrar "lo va a pensar" tiene que elegir "Pasa pedido mañana",
que dice algo distinto — y eso contamina el `GROUP BY` de la analítica con compromisos de
pedido que nunca existieron.

## La decisión

**1. La acción comercial se carga al resolver un rubro, y vive en su `detalle`.**

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

**2. Se suman cinco motivos al catálogo existente, en `nivel: 'ofrecimiento'`.**

| descripcion | resultado | evidencia |
|---|---|---|
| Lo va a considerar | `diferido` | *"lo va a tener en cuenta"*, *"lo revisa con Agus"* |
| No le interesa | `perdido` | *"no le interesa"*, *"no quiere asumirlo"* |
| Tiene stock | `perdido` | *"tiene stock"*, *"compra solo repo"* |
| Trabaja con otro | `perdido` | *"está atado al cupo de Expoyer"*, *"siguen trabajando con Mussio"* |
| Poca venta | `perdido` | *"bajó mucho la venta"*, *"viene muy frenado el taller"* |

`requiere_detalle` va en `0` para los cinco: ninguno pide marca/competidor/pctDiferencia
(esas columnas siguen siendo del motivo "Precio"). El `resultado` mantiene la analítica
existente funcionando sin tocar nada.

El checklist pasa de 7 a 12 opciones. Es un costo aceptado: son todas opciones que la
evidencia sostiene, y el catálogo ya convive con opciones que no aplican a todos los casos
(nadie elige "Flete" en la mayoría de los rubros).

**3. `tipo: 'accion'` deja de usarse como ofrecimiento propio.** El front deja de ofrecerlo
en el alta y deja de escribir `alcance`. Nada se borra del backend — la columna, la tabla
`pl_ofrecimiento_alcance` y el valor en el enum siguen existiendo, sin escritores desde
esta app.

### Lo que se descartó, y por qué

- **Un `nivel: 'accion'` en `pl_motivo`, con catálogo propio que reemplace al de rubro
  cuando hay acción.** `nivel` significa *qué entidad se resuelve*: `visita` resuelve una
  visita, `ofrecimiento` resuelve un ofrecimiento — ambas entidades reales con su fila en
  la base. Una acción **no es una entidad que se resuelva**; es cómo se ofreció ese rubro.
  Meterla como `nivel` mezcla dos ejes ("qué resuelvo" con "de qué manera lo ofrecí"), y
  encima justo después de sacar la acción como entidad propia. Al mirarlo así se ve que la
  mayoría de los motivos "de acción" no son de acción: *"tiene stock"* aplica igual a un
  rubro suelto — la evidencia lo muestra literalmente a nivel rubro (*"Rodamiento de rueda
  tiene inventario completo"*). Son motivos que le faltan al catálogo, y punto.

- **Motivos "Se sumó al plan" y "Le queda lejos el monto".** Aparecen en las notas
  (*"anotamos en plan cupo"*, *"le parece mucho 1M"*), pero no responden la pregunta que un
  motivo tiene que responder: *"ofrecí este rubro, ¿qué pasó con este rubro?"*. Que el
  cliente se anote en el cupo no dice si compró Amortiguadores; el monto es del cupo, no
  del rubro. Ambos hablan del cupo **como entidad**, que es justo lo que este cambio saca
  del modelo.

- **La acción como un motivo más del catálogo** (cero cambios de backend, incluso ya existe
  un motivo "DS"): el motivo "Plan cupo" ocuparía el slot de *qué pasó*, y no quedaría
  dónde registrar el desenlace real.

- **Mantener dos ofrecimientos vinculados** (rubro + acción con alcance): es lo que existe
  hoy y lo que este cambio viene a evitar.

## UI

En `ResolucionOfrecimiento.tsx`, arriba del checklist, una fila opcional: **"¿Con acción
comercial?"**, colapsada por defecto. Sin acción elegida la pantalla queda **exactamente
como hoy** — el caso simple no cambia en nada.

Al elegir una acción se expande: selector de acción, selector de marca, y el editor de
parámetros que corresponda (los ya existentes: `EditorCupo` con tramos, `EditorDescuento`
con %, vía `registroDetalleAccion`). **El checklist de motivos no cambia** — es el mismo
catálogo de `nivel: 'ofrecimiento'`, ahora completo.

Componente nuevo: `AccionComercialPicker` (acción + marca + editor de params), montado
dentro de `ResolucionOfrecimiento`. Los editores y el registro se reusan tal cual.

**Marca "de ese rubro":** el catálogo disponible hoy (`/sale/brand/catalog`) es global, no
filtrado por rubro. Esta vuelta usa ese catálogo con el `CatalogoPicker` que ya existe
(mismo componente que el campo Marca del motivo "Precio"). Filtrar por rubro queda
pendiente hasta que exista una fuente que lo permita — inventar el filtro en el front sobre
datos que el backend no tiene sería mentir sobre la relación marca↔rubro.

## Backend

**a) `resolverOfrecimiento` acepta y persiste `detalle`.** Hoy `detalle` solo se escribe al
**crear** un ofrecimiento (`crearFueraDePropuesta`), pero acá se carga al **resolverlo** —
así que `IResolverOfrecimientoDTO` suma `detalle?: IAccionComercial | null`, y
`OfrecimientoRepository.resolver` lo persiste junto con los motivos. `undefined` = no vino
en el body, no se toca la columna; `null` = se sacó la acción, se limpia.

**b) Se relaja la regla de `tipo === 'accion'`.** `crearFueraDePropuesta` hoy descarta
`detalle` en silencio si el tipo no es acción (regla del spec anterior); ahora un rubro
también puede tenerlo.

**c) La validación del detalle busca por `detalle.accion`, no por el código del
ofrecimiento.** Antes el detalle era `{tramos}` colgando de un ofrecimiento con código
`'CUPO'`, así que `accionDetalleValidators[dto.codigo]` encontraba el validador. Ahora el
detalle es `{accion: 'CUPO', ...}` colgando de un ofrecimiento con código `'RODAM'`: sin
este cambio, el detalle viajaría **sin validar**. Se valida tanto al crear como al resolver.

**d) Seed de los cinco motivos** en `nivel: 'ofrecimiento'` — `INSERT IGNORE`, sin `ALTER`.

**Sin cambios:** `NivelMotivo` (sigue siendo `'visita' | 'ofrecimiento'`),
`validarMotivosDeOfrecimiento`, esquema de la base, `pl_accion`,
`pl_ofrecimiento_alcance`, y los validadores de Cupo/Descuento en sí.

## Testing

**Frontend**
- `AccionComercialPicker.test.tsx` (nuevo): elegir una acción muestra su editor de params;
  cambiar de acción descarta los params de la anterior; volver a "sin acción" deja el
  detalle en `null`; elegir marca la incluye; una acción sin módulo registrado no muestra
  editor.
- `ResolucionOfrecimiento.test.tsx` (ampliar): **sin** acción, el checklist es el de siempre
  (regresión — el caso simple no cambió); cargar acción+marca+params produce el `detalle`
  con la forma esperada.
- `VisitaSheet.test.tsx` (ampliar): la acción cargada viaja en el batch de "Cerrar visita".

**Backend**
- `OfrecimientoRepository.spec.ts`: `resolver` persiste `detalle`; sin `detalle` no toca la
  columna; `detalle: null` la limpia; `crearFueraDePropuesta` persiste `detalle` también
  para `tipo: 'rubro'` (invierte el test que hoy afirma lo contrario).
- `ofrecimientoValidation.spec.ts`: el detalle se valida por `detalle.accion`; una acción
  sin validador registrado acepta cualquier `params`; un detalle sin `accion` se rechaza.

## Fuera de alcance

- **El alta al cupo no tiene dónde registrarse.** *"anotamos en plan cupo"*, *"renovación
  confirmada"* son hechos **a nivel cliente**, no de un rubro, y hoy no hay lugar para eso:
  los motivos de `nivel: 'visita'` existen solo para el caso "no visité", y cerrar una
  visita real no toma motivos. Es una pérdida consciente de esta vuelta.
- **Acciones sin rubro asociado.** El cupo global (*"Ofrezco CUPO 1.5M 3% 2M 5%"* sin
  mencionar rubro) queda sin vía de carga estructurada, porque el alta de acciones sueltas
  se saca.
- **Filtrar marcas por rubro** — no hay fuente hoy (ver UI).
- **Migrar ofrecimientos `tipo: 'accion'`** ya cargados probando — no hay datos productivos.
- **Borrar el código de alcance** (`AlcancePicker`, `AlcanceBuscador`) más allá de sacarlo
  del alta: queda sin uso, se limpia cuando esté confirmado que no vuelve.
