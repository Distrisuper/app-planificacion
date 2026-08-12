# Ítem ofrecido genérico: de "rubro" a "qué le ofrecí"

**Fecha:** 2026-08-12
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** api-vendedores (dominio `planificacion`) + app-planificacion

---

## El problema

Hoy la propuesta comercial que ve el vendedor está **cableada a rubro** en tres capas
independientes:

| capa | dónde | qué asume |
|---|---|---|
| motor de recomendación | `POST /sale/rubro/recommendations/drops` | detecta caídas *por rubro* contra el promedio del cliente |
| congelado del hecho | `pl_visita_rubro` (`rubro_code`, `rubro_descripcion`) | la propuesta que el vendedor efectivamente vio |
| catálogo de motivos | `pl_motivo.nivel = 'rubro'` | el resultado comercial cuelga del rubro |

Pero el objetivo real del vendedor **no es vender un rubro: es armar un pedido.** Lo que ofrece
para llegar ahí es intercambiable — un rubro caído, una marca, un artículo, o una acción
comercial como un plan cupo.

Evidencia del mundo real, tomada de las notas que los vendedores cargan a mano en Cromo después
de cada visita:

- *"Ofrezco CUPO 1.5M 3% 2M 5%, este funde se va de vacas."*
- *"Ofrezco plan cupo 1M 5% saco pedido en DS SKF."*
- *"Fran no estaba. Lula, ofrezco cupo 1M 5% y saco pedido VTH MI."*

Nada de eso es un rubro. **"Cupo" no existe en el modelo** — se verificó: el término no aparece
en ninguna tabla, tipo ni componente del proyecto. Termina como texto libre en una nota, con
etiquetas puestas a mano (`CUPO`, `COBRANZA`, `CIERRE VTA VENDEDOR`) que son un intento tardío de
estructurar lo que ya se perdió.

Es exactamente el problema que este proyecto vino a resolver para los motivos: **sobre texto libre
no se puede hacer un `GROUP BY`.** No se puede responder *"de los cupos que ofrecimos este mes,
cuántos terminaron en pedido"*.

## La decisión

**`pl_visita_rubro` deja de ser "un rubro" y pasa a ser "un ítem ofrecido".** Rubro, marca, línea,
artículo y acción comercial son cinco formas del mismo slot: *esto le ofrecí, esto pasó*.

Y como una oferta real puede ser compuesta —*"descuento en la marca SKF, sobre estos dos
rubros"*— el ítem gana un **alcance** de 0..N destinos.

### Enfoque elegido: rename real, sin alias de campo

Se evaluaron tres caminos:

- **A. Rename real** — tabla, columnas, endpoints y tipos del front pasan a `item`.
- **B. Extender sin renombrar** — agregar `tipo` y dejar `rubro_code` conteniendo marcas.
- **C. Rename con alias de campo** — la API expone `item*` y `rubro*` en paralelo un release.

**Se eligió A.** Razón: esta app es el **único consumidor** de esos endpoints, no hay terceros que
romper, y la batería de tests existente cubre el camino. B deja deuda permanente — un campo
llamado `rubroCode` conteniendo `"SKF"` es precisamente el tipo de mentira que `docs/dominio/`
documenta como trampa, y alguien lo va a leer en seis meses asumiendo que es un rubro. C es costo
puro: dos nombres para lo mismo, y el viejo es el equivocado.

**Excepción deliberada: sí hay alias de *ruta* temporal.** Ver "Rollout".

---

## Esquema

### `pl_visita_rubro` → `pl_visita_item`

| columna | antes | ahora |
|---|---|---|
| `tipo` | — | `ENUM('rubro','marca','linea','articulo','accion') NOT NULL DEFAULT 'rubro'` |
| `codigo` | `rubro_code` | igual, **`NOT NULL`** |
| `descripcion` | `rubro_descripcion` | igual, snapshot |
| `detalle` | — | `JSON NULL` — ver "La columna `detalle`" |
| `gap_units` | igual | sigue nullable; solo tiene sentido con `tipo = 'rubro'` |
| `origen`, `es_propuesto` | igual | sin cambios |

**`codigo` es `NOT NULL`, incluso para acciones.** Durante el diseño se consideró hacerlo nullable
porque "un cupo global no es de ninguna marca". Es un error: el cupo **sí tiene código** —
el de la acción (`CUPO`), del catálogo `pl_accion`. Lo que no tiene es *alcance*, que es otra cosa
y tiene su propia tabla. Con `codigo` nullable MySQL no habría impedido cargar tres cupos en la
misma visita, porque los NULL no colisionan entre sí.

**El unique `(resolucion_id, rubro_code)` se cae y NO se reemplaza por otro unique.** Pasa a ser
índice común sobre `(resolucion_id, tipo, codigo)`. Motivo: con alcance, dos descuentos en la misma
visita sobre marcas distintas son legítimos, y cualquier unique sobre `(resolucion_id, tipo,
codigo)` los bloquearía. **Es una garantía que se pierde a conciencia:** evitar el duplicado exacto
—misma acción, mismo conjunto de alcance— pasa a ser responsabilidad del service, y la base ya no
lo impide sola. Si en el futuro se quiere recuperar la garantía en la base, el camino es una
columna generada con el hash del alcance; no se hace ahora.

### `pl_visita_item_alcance` (nueva)

`(id, visita_item_id, tipo, codigo, descripcion)` — **0..N filas por ítem**, misma forma que el
ítem. Es sobre qué aplica la oferta.

| oferta real | ítem | alcance |
|---|---|---|
| rubro caído (lo que existe hoy) | `rubro / RODAM` | — |
| cupo global | `accion / CUPO` | — |
| plan cupo de SKF | `accion / CUPO` | `marca / SKF` |
| descuento en SKF, rubros A y B | `accion / DESCUENTO` | `marca / SKF`, `rubro / A`, `rubro / B` |

Cero filas de alcance significa **oferta global**, no "falta cargar". Todo lo que existe hoy en
producción es un rubro sin alcance, así que la migración no toca esta tabla.

Se descartó meter el alcance dentro del `detalle` JSON: el alcance es justamente lo que más se va a
querer agrupar (*"descuentos ofrecidos sobre SKF y cómo terminaron"*), y sin claves declaradas
vuelve a ser difícil de consultar donde más importa.

### `pl_accion` (nueva)

Catálogo sembrado: `(codigo, descripcion, activo)`. Mismo patrón que `pl_motivo` — agregar "Plan
cupo" o "Promo verano" es un `INSERT`, no un deploy.

Existe porque rubros, marcas y artículos salen del warehouse, pero **las acciones comerciales no
tienen ninguna fuente**. Sin esta tabla el cupo vuelve a ser texto tipeado por cada vendedor, y
conviven "CUPO 1.5M 3%", "cupo 1.5 3%" y "plan cupo" como tres cosas distintas — el problema
original por otra puerta.

Los parámetros negociados (1.5M al 3%) **no** son entradas distintas del catálogo: el catálogo
tiene "Cupo" una sola vez, y los números son dato de la fila.

### `pl_visita_rubro_motivo` → `pl_visita_item_motivo`

Rename de tabla y de FK (`visita_rubro_id` → `visita_item_id`). **Las columnas de detalle
(`marca`, `competidor`, `pct_diferencia`) no se tocan:** siguen siendo el detalle del motivo
"Precio".

### `pl_motivo.nivel`: `'rubro'` → `'item'`

Un solo catálogo de motivos para todos los tipos de ítem. "Saqué pedido", "Precio" y "Flete"
aplican igual a un cupo que a un rubro. Motivos distintos según el tipo es una complicación que
nadie pidió.

### La columna `detalle`

`JSON NULL` en `pl_visita_item`. **Se crea ahora y ningún código la escribe todavía.**

Precedente en este mismo dominio: las tres columnas `seguimiento_*` de `pl_resolucion` están
creadas y vacías, y `docs/dominio/tablas.md` explica por qué — *"acá un `ALTER` en producción es
intervención manual de ops, y así reponer el aviso es solo código de servicio"*. Mismo
razonamiento: una columna JSON vacía no cuesta nada; pedirle a ops un `ALTER` dentro de seis meses
cuesta una coordinación.

**Qué va a vivir ahí:** lo que *ofrecí* con parámetros propios de la oferta — el 5% del descuento,
el monto del cupo. **Qué NO va ahí:** lo que *pasó*, que ya tiene lugar en
`pl_visita_item_motivo` (`marca` / `competidor` / `pct_diferencia`).

**No reusar `pct_diferencia` para el porcentaje del cupo.** Esa columna significa "% por debajo del
competidor"; meter ahí el 5% de un descuento es sobrecarga semántica y contamina el `GROUP BY` que
la columna existe para servir.

**Disciplina de claves, para cuando se use:** JSON sin disciplina es texto libre con llaves. Si un
camino escribe `{"pct": 5}` y otro `{"porcentaje": "5%"}`, se repite el problema un nivel más
abajo. La contención es que **las claves las declare el catálogo, no cada pantalla** — `pl_accion`
dice qué campos pide esa acción y de qué tipo, y la UI se renderiza desde ahí. Es la
generalización natural de `pl_motivo.requiere_detalle`. **No se construye en esta v1:** el contrato
de claves se define cuando aparezca el primer caso real, con ese caso a la vista.

Para analítica futura, MySQL indexa JSON vía columna generada
(`pct_ofrecido DOUBLE AS (detalle->>'$.pct') STORED` + índice), así que el `GROUP BY` sigue
disponible. **A verificar en el plan:** que la instancia soporte tipo `JSON` (MySQL 5.7+). Si fuera
5.6, el fallback es `TEXT` con la misma disciplina de claves, perdiendo el indexado por columna
generada.

### Migración

Script idempotente en `docs/db-notes/` de api-vendedores, aplicado como `ALTER` manual de ops según
la convención del proyecto. Pasos: `RENAME TABLE` (ítem y tabla de motivos) → `CHANGE` de las dos
columnas → `ADD COLUMN tipo DEFAULT 'rubro'` y `detalle JSON NULL` → swap del unique por índice →
`CREATE TABLE pl_accion` y `pl_visita_item_alcance` → seed de acciones → `UPDATE pl_motivo SET
nivel='item' WHERE nivel='rubro'` con su cambio de ENUM.

El backfill es trivial: **todo lo existente es un rubro**, que es el default de la columna nueva.
Reversible.

---

## Sin cambios: dónde NO se toca

**El motor de propuesta sigue siendo por rubro.** `POST /sale/rubro/recommendations/drops` y los
catálogos reusados (`/sale/brand/catalog`, `/sale/rubro/clients`) viven fuera del dominio
`planificacion` y no se modifican. Lo único que cambia es que su salida entra al ítem con
`tipo: 'rubro'`.

**Consecuencia explícita:** la propuesta precargada que el vendedor ve al llegar al cliente **sigue
siendo solo rubros calculados**. Marca, artículo y acción entran por el picker manual, por el
camino `es_propuesto = 0` que ya existe.

Un catálogo de campañas vigentes cargadas por gerencia (una tabla `pl_campania` que inyecte "Plan
cupo agosto" en la propuesta de toda visita del período) es la evolución natural de esto y quedó
**fuera de alcance**: no cambia el esquema del ítem, solo agrega una fuente más de `origen`.

---

## API

### Rutas

| hoy | pasa a ser |
|---|---|
| `GET /planificacion/visitas/:id/rubros` | `GET /planificacion/visitas/:id/items` |
| `POST /planificacion/visitas/:id/rubros` | `POST /planificacion/visitas/:id/items` |
| `PUT /planificacion/visitas/:id/rubros/:rubroId` | `PUT /planificacion/visitas/:id/items/:itemId` |
| `DELETE /planificacion/visitas/:id/rubros/:rubroId` | `DELETE /planificacion/visitas/:id/items/:itemId` |
| — | `GET /planificacion/acciones` (catálogo, `activo = 1`) |
| `GET /planificacion/motivos?nivel=rubro` | `?nivel=item` |

### DTOs

```ts
interface IAlcanceDTO {
    tipo: TipoItem
    codigo: string
    descripcion: string
}

interface IAgregarItemDTO {
    tipo: 'rubro' | 'marca' | 'linea' | 'articulo' | 'accion'
    codigo: string
    descripcion: string
    alcance?: IAlcanceDTO[]   // ausente o vacío = oferta global
}
```

`resolverItem` **no cambia de forma**: sigue recibiendo `{ motivos: IItemMotivo[] }` y sigue
**reemplazando** los motivos en vez de acumular. Es la parte que ya era genérica.

### Campos que se arrastran fuera del módulo

Los tres viajan en respuestas de otras pantallas y son fáciles de olvidar:

- `IAgendaClient.rubrosPendientes` → `itemsPendientes` (viaja en la card de la vista semanal).
- `iniciarVisita` devuelve `{ visitaId, rubros }` → `{ visitaId, items }`.
- `ICerrarVisitaResult.rubrosAutocompletados` → `itemsAutocompletados`.

### Validaciones nuevas en el service

- `codigo` debe existir en el catálogo de su `tipo` (`pl_accion` para acciones, warehouse para el
  resto). **Sin esto `tipo` es decorativo** y el `GROUP BY` se rompe igual que con texto libre.
  Misma validación para cada fila de `alcance`.
- `gapUnits` solo se acepta con `tipo = 'rubro'`.
- Rechazo del duplicado exacto (mismo `tipo`, mismo `codigo`, mismo conjunto de alcance) — la
  garantía que dejó de dar el unique.
- `RUBRO_DE_PROPUESTA` → `ITEM_DE_PROPUESTA`, mismo significado: no se borra lo que propuso el
  sistema. Citado en `src/lib/apiError.ts`.

### Estado del ítem: derivado, nunca guardado

**No se crea ninguna tabla de resolución por ítem, ni columna `estado`.**

El estado ya está derivado y eso es deliberado: `pl_visita_rubro` hoy no tiene `estado` porque
*"un ítem está resuelto si tiene motivos"*. Es el mismo principio que gobierna el dominio entero
(*"pendiente no es un estado, es la ausencia de resolución"*). Un estado guardado puede contradecir
a los motivos; uno derivado no puede.

El resultado comercial vive en `pl_motivo.resultado` (`ganado`/`diferido`/`perdido`/`no_ofrecido`),
que la analítica ya lee por motivo.

**Regla nueva — precedencia de resultado por ítem.** Un ítem puede tener dos motivos con resultado
distinto ("Saqué pedido" + "Precio"), y con cupos negociados eso va a ser **más frecuente** que con
rubros. El resultado del ítem se calcula con una precedencia única, en un solo helper del service:

```
ganado > diferido > perdido > no_ofrecido
```

Si se sacó el pedido, lo demás es color. Derivado y cambiable, sin riesgo de desincronización.

**Asimetría intencional, para que no se lea como incoherencia:** `pl_resolucion` es inmutable, pero
los motivos del ítem se reemplazan. Mientras la visita está abierta el detalle es borrador; cerrar
la visita es lo que lo congela.

---

## UI

Deliberadamente mínima. La prioridad es dejar el back sólido; el rediseño del wizard es una
iteración posterior.

**Picker de alta.** `CatalogoPicker` ya es agnóstico del catálogo que muestra, así que lo único
nuevo es un selector de tipo arriba — *Rubro · Marca · Acción* — que decide qué catálogo se le
pasa. Sin rediseño.

**Alcance: sí se expone en la v1**, aunque sea feo. Un "acotar a…" opcional, multi-selección,
reusando el mismo picker; por defecto la oferta es global.

La razón de no diferirlo pese a que el foco es el backend: **si la tabla existe pero no hay forma
de cargar datos, el modelo no se valida nunca.** Se mergearía un esquema que nadie ejercitó, y el
primer dato real entraría meses después junto con el rediseño — justo cuando descubrir que el
alcance debía ser otra cosa cuesta caro. Dos semanas de uso real con un flujo feo dicen si
"acción + alcance" es la forma correcta.

**Resto del wizard**: sin cambios de diseño. `ResolucionRubro` → `ResolucionItem`, mostrando
`descripcion` en vez de nombre de rubro. El checklist de motivos y el detalle de "Precio" quedan
tal cual.

**Tipos disponibles en el picker.** `linea` y `articulo` quedan declarados en el ENUM porque
agregarlos ahora es gratis, pero **el picker solo ofrece los tipos que tengan catálogo**. De marcas
hay endpoint (`/sale/brand/catalog`); de líneas y artículos **no se verificó que exista fuente en
api-vendedores** — el plan debe confirmarlo. Si no existe, esos dos tipos quedan sin UI hasta que
aparezca.

---

## Analítica

Cambios de rename, no de lógica. `TablaVisitas.tsx`, `TablaActividad.tsx`, `DetalleVisitaPanel.tsx`
y `ObjecionesMercado.tsx` leen ítems en vez de rubros. Los mapas de `resultado` no se tocan.

Se agrega un **chip de tipo** junto a la descripción: "SKF" sin decir que es una marca es ambiguo.

Vistas nuevas de análisis por tipo o por alcance: **fuera de alcance de esta v1.** Primero que
entren datos.

---

## Rollout

**Alias de ruta temporal, un release.** Las rutas `/rubros` quedan apuntando al mismo controller y
se borran después.

Esto matiza el "rename sin alias" elegido más arriba, y la distinción importa: los alias
rechazados eran de **nombres de campo** (deuda permanente); estos son de **ruta** y con fecha de
vencimiento. El motivo es que esta app es una **PWA con service worker**: hay clientes instalados
en los teléfonos con la versión vieja cacheada. Si la API renombra las rutas antes de que el
teléfono actualice, ese vendedor recibe 404 **parado frente al cliente**. Un campo mal nombrado
confunde a un dev; un 404 deja al vendedor sin poder cargar la visita.

---

## Testing

- **Los tests existentes son la red de seguridad del refactor.** `RubroTable.test.tsx`,
  `ResolucionWizard.test.tsx`, `resolucionRubro.test.ts`, `useRubros.test.tsx` y compañía se
  renombran y **deben pasar sin cambios de comportamiento, solo de nombres**. Si alguno necesita
  cambiar una aserción, es señal de que el rename se llevó puesta lógica.
- Tests nuevos: validación de `codigo` contra el catálogo de su `tipo`; rechazo de `gapUnits` fuera
  de `rubro`; alta con alcance y alta global; rechazo del duplicado exacto; tabla de precedencia de
  resultado.
- Test de regresión sobre el alias de ruta temporal, para que se note si alguien lo borra antes de
  tiempo.

---

## Fuera de alcance

- Motor de recomendación para marcas, líneas o artículos (hoy solo existe por rubro).
- `pl_campania`: campañas vigentes cargadas por gerencia e inyectadas en la propuesta.
- Escritura de la columna `detalle` y el contrato de claves declaradas por catálogo.
- Vistas de analítica agregadas por tipo o por alcance.
- Rediseño del wizard de resolución.

## Documentación viva a actualizar

Al implementar, `docs/dominio/tablas.md` debe reflejar: `pl_visita_item`, `pl_visita_item_motivo`,
`pl_visita_item_alcance`, `pl_accion`, el `nivel = 'item'` de `pl_motivo`, y sumar
`pl_visita_rubro` / `pl_visita_rubro_motivo` a la tabla de "tablas que ya no existen".
