# Visita extra: el buscador de clientes del día

**Fecha:** 2026-08-12
**Estado:** diseño validado, pendiente de plan de implementación
**Depende de:** nada. Es independiente de
[`2026-08-12-semana-hecha-cierre-invisible-design.md`](2026-08-12-semana-hecha-cierre-invisible-design.md)
y se puede hacer antes o después.

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos mandan.

## El problema

**El vendedor no tiene forma de expresar "trabajo extra".** Toda resolución cuelga de una fila del plan
(`pl_resolucion.rotacion_cliente_id`, `UNIQUE`), así que lo único que puede hacer es resolver una fila
que ya existe. Si la de hoy ya está resuelta —o si el cliente no estaba en el plan de hoy— la única
fila disponible es una **futura**.

El caso que lo muestra: cliente quincenal con dos filas, `s1d3` y `s5d2`. El vendedor está en la zona 1,
ya lo visitó, y de paso le carga también la visita de la zona 5.

| | hoy |
|---|---|
| fila que se resuelve | la de la **zona 5** |
| cuando llegue la pasada por la zona 5 | la card aparece resuelta y no se puede volver a operar (`FILA_RESUELTA`) |
| lo que mide el sistema | **2/2 cubierto** |
| lo que pasó en la realidad | el cliente estuvo **un mes** sin que nadie pase |

Es el único lugar donde el conteo de visitas planificadas se puede satisfacer sin cumplir la intención,
y es indetectable: no hay nada anómalo que mirar. El trabajo extra se paga consumiendo trabajo
planificado futuro, y la cadencia se pierde sin dejar rastro.

## El cambio

**Un buscador en la agenda del día que le crea al vendedor la fila que le falta**, en lugar de
obligarlo a robarle una al futuro.

| | hoy | con buscador |
|---|---|---|
| fila que se resuelve | la de la zona 5 | una **nueva**, `(zona en curso, hoy)` |
| fila de la zona 5 | resuelta un mes antes | **pendiente y operable** |
| si esa fila no se visita | 2/2 — la cadencia se perdió invisible | **1/2 — la verdad** |

No se prohíbe nada: se le da la fila que le faltaba.

### La regla central

Sin esto el buscador es un agujero, porque pasa a ser el camino de menor resistencia: el vendedor busca
a un cliente que **sí** estaba en el plan de hoy, se le crea una fila extra, la resuelve, y la fila
planificada queda pendiente para siempre. Numerador en las extras, denominador nunca satisfecho.

> **El buscador nunca crea una fila si el cliente ya tiene una fila pendiente en la zona en curso: te
> lleva a esa. Solo crea cuando no hay ninguna disponible.**

Con esa regla sola el comportamiento sale bien en los cuatro casos, sin que el vendedor entienda nada:

| busca a… | qué pasa |
|---|---|
| cliente con fila **pendiente** en la zona en curso | abre **esa** card. No crea nada |
| cliente cuya fila de la zona en curso ya está resuelta | crea la **extra de hoy**. La de otra zona no se toca |
| cliente que no está en el plan de esta zona | crea la **extra de hoy** |
| cliente al que ya le hizo una extra hoy | abre la que ya existe — lo garantiza `uq_rotacion_cliente` |

Fijate que **nunca consume una fila de otra zona**. El caso del problema desaparece del camino natural.

### La marca: `es_extra`

Una columna en `pl_rotacion_cliente`: `es_extra TINYINT(1) NOT NULL DEFAULT 0`. Tiene precedente
literal un nivel más abajo: `pl_visita_rubro.es_propuesto = 0` marca el rubro que agregó el vendedor
(`planificacion-ciclo-tables.sql:280`).

**Por qué la columna y no una resolución sin fila del plan:** hacer `rotacion_cliente_id` nullable
rompería el `UNIQUE` que hoy hace imposible resolver dos veces la misma celda sin ningún check-then-act,
y **todas** las queries de analítica saltan de la resolución al plan. La columna cuesta un `ALTER` y no
toca ningún join.

### La medición

- **El denominador de cobertura excluye `es_extra = 1`.** El plan es el plan: hacer trabajo extra no
  puede cambiar la vara contra la que se te mide.
- **Las visitas extra se cuentan en un bucket propio** ("visitas fuera de plan").
- Consecuencia buscada: el ratio **no se mueve** por usar el buscador. No hay incentivo perverso en
  ninguna dirección — ni para inflar (agregar y resolver no sube el %) ni para esconder.
- Y gerencia gana una señal nueva y honesta: *"14 visitas fuera de plan esta vuelta"*. O la hoja de ruta
  está mal armada, o el vendedor está trabajando de más. Las dos cosas vale saberlas.

### Alcance del buscador

**La cartera del vendedor**, no el padrón del template. Un cliente que llamó y no está en la hoja de
ruta es justamente el caso que hay que poder atender. Como la fila queda marcada `es_extra`, no
contamina la línea de base: la próxima materialización sale del template igual que siempre, y el
cliente extra no reaparece.

La propuesta comercial funciona para cualquier cliente (`RubroRecommendationService` es por cliente), así
que el flujo completo —propuesta, iniciar, cerrar, motivos por rubro— sirve sin cambios.

## Cuatro requisitos para que no rompa nada

1. **`sincronizarPadron` no puede barrer las extras.** Su sweep de bajas borra filas que no están en el
   template vía `eliminarSinResolver` (`RotacionService.ts:263-269`), y una extra creada y todavía sin
   resolver es exactamente eso. Hay que excluir `es_extra = 1` del barrido.
2. **El `CHECK (dia BETWEEN 1 AND 5)` no admite sábado** (`planificacion-ciclo-tables.sql:187`). Hoy no
   importa porque solo se resuelven filas que ya existen; con el buscador, "hoy" puede ser sábado y el
   `INSERT` rebota. **Se fija en viernes** (el último día de negocio de la semana laboral) antes que
   relajar el CHECK, que es una barrera que sirve.
3. **La extra se ve como extra**: chip **"Agregado"** en la card del vendedor y en la celda del grid de
   gerencia. Dice lo mismo que "fuera de plan" sin sonar a reproche. Sin la marca visible, la vuelta
   aparece con clientes que nadie planificó y no se entiende de dónde salieron.
4. **La zona y el día de la extra**: `(semana = zona del ciclo abierto, dia = hoy)`. Sin ciclo abierto
   (standby) vale la zona que el vendedor está mirando, que es la que `asegurar` abriría igual ante la
   primera acción.

Una extra sin resolver es reacomodable como cualquier fila; una vez resuelta no, y eso ya lo cubre
`FILA_RESUELTA` sin código nuevo.

## Lo que NO cierra

El caso del problema **sigue siendo alcanzable** por el otro camino: navegar a la zona 5 en preview y
resolver la card de ahí. Y está bien que se pueda — a veces el vendedor genuinamente está en esa zona
hoy, y "toda semana de la rotación es accionable" es una decisión ya tomada (`ClienteCard.tsx:11-14`).

El criterio es **no bloquearlo, y hacer que el camino fácil sea el correcto**: el buscador queda a mano
en la agenda del día, y drenar un slot futuro requiere irse a otra zona a propósito.

Y si igual alguien lo hace de forma sistemática, lo que lo muestra no es una restricción sino un
**indicador de cadencia** (días entre visitas al mismo cliente) — la métrica que este caso vulnera y que
hoy no existe. Queda anotado como pendiente, no como parte de este spec.

## Testing

**Backend:**

- Buscar un cliente con fila pendiente en la zona en curso **no crea** ninguna fila y devuelve la
  existente.
- Buscar un cliente cuya fila de la zona en curso está resuelta crea una fila `es_extra = 1` en
  `(zona en curso, hoy)`, y **no toca** su fila de otra zona.
- Un quincenal con las dos filas pendientes resuelve a la de la zona en curso, nunca a la de la otra.
- Segunda búsqueda del mismo cliente el mismo día devuelve la misma fila (`uq_rotacion_cliente`), no un
  duplicado ni un `ER_DUP_ENTRY` crudo.
- Un sábado, la extra se crea con `dia = 5` y no revienta contra el `CHECK`.
- `sincronizarPadron` **no borra** una extra sin resolver, y sigue borrando las filas del plan sin
  resolver que corresponde.
- El denominador de cobertura **no cambia** al crear y resolver una extra; el bucket "fuera de plan"
  sube 1.
- El buscador no encuentra clientes de otro vendedor.

**Front:**

- La card creada por el buscador aparece en el día y muestra el chip "Agregado".
- Buscar a un cliente que está pendiente hoy navega a su card en vez de duplicarla.
- El flujo completo (propuesta → iniciar → cerrar con motivos por rubro) funciona sobre una extra.
- El grid de gerencia muestra la extra en su celda, marcada.

## Descartado

- **Bloquear el camino de preview** para que la única forma de visitar fuera de plan sea el buscador.
  Contradice una decisión ya tomada y le saca al vendedor un caso legítimo. La respuesta correcta a lo
  que quedaría afuera es medir cadencia, no restringir.
- **Resolución sin fila del plan** (`rotacion_cliente_id` nullable). Rompe el `UNIQUE` que garantiza una
  resolución por celda y obliga a revisar todos los joins de analítica.
- **Contar las extras en el denominador.** Haría que trabajar de más te mueva la vara contra la que te
  miden, en cualquiera de las dos direcciones.
- **Restringir el buscador al padrón del template.** Deja afuera al cliente que llamó, que es la mitad
  del valor.
- **Impedir adelantar la visita de otra zona.** El vendedor puede tener razones legítimas, y el sistema
  no puede distinguirlas. Se resuelve dándole la alternativa correcta a mano, no prohibiendo.
