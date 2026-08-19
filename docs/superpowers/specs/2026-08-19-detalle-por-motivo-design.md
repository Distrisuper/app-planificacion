# El detalle por motivo: un módulo por motivo, valores en filas

**Fecha:** 2026-08-19
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** api-vendedores + app-planificacion (dos planes, un solo contrato)

Continúa a [`2026-08-19-resolucion-bloques-objecion-cierre-pendientes-design.md`](2026-08-19-resolucion-bloques-objecion-cierre-pendientes-design.md),
que dejó el formulario de resolución agrupado en Objeción / Cierre / Pendientes y anotó que el panel
de detalle por motivo iba a necesitar campos nuevos.

---

## El problema

`pl_motivo.requiere_detalle` es un **booleano**, y lo que dispara es un formulario **fijo de tres
campos** cableado en `ResolucionOfrecimiento.tsx`: marca, competidor y % de diferencia. Esos tres
viven como columnas propias en `pl_ofrecimiento_motivo`.

Eso alcanzaba mientras el único motivo con detalle era "Precio". Los mockups validados muestran que
ya no: cuatro motivos piden detalle, **y ninguno entra en esas tres columnas**.

## La evidencia: qué pide cada motivo

| motivo | campos | derivado que se muestra |
|---|---|---|
| **Precio** | marca, nombre del competidor, precio del competidor, mi precio | `-13.3% más barato que el competidor` |
| **Plazo** | plazo solicitado (días) | — |
| **Flete** | valor del flete, compra en $ a futuro | `El flete representa el 2.0% de la compra` |
| **No trabaja la marca o cambio** | qué marca trabaja, por qué | — |

Tres cosas de acá definen el diseño:

1. **Hay valores derivados con fórmula, texto y color propios.** El `-13.3%` de Precio y el `2.0%`
   de Flete no son campos: son un cálculo, una frase y un color condicional.
2. **Los campos vienen de a pares con sentido de dominio.** "precio del competidor + mi precio" solo
   significa algo junto; lo mismo "valor del flete + compra a futuro".
3. **Precio cambió de forma.** El `%` ya no se tipea: se derivan de dos precios. Es mejor dato —
   quedan los dos valores, no solo el delta.

## La decisión

Se separan las dos mitades del problema, porque tienen respuestas distintas:

| | mecanismo | costo de sumar un motivo |
|---|---|---|
| **cómo se dibuja** | un módulo por motivo, en código | un archivo + una entrada en el registro |
| **dónde aterriza el dato** | una tabla de valores tipados | ninguno — la tabla no cambia |

### Por qué el formulario NO se define en la base

Se evaluó a fondo poner el formulario como schema JSON en `pl_motivo` (`[{campo, tipo, label, …}]`),
de modo que agregar un campo fuera un `UPDATE` y no un deploy. **Se descarta por la evidencia de
arriba:** un schema declarativo de tipos de input no puede expresar `-13.3% más barato que el
competidor` — hace falta una fórmula, una frase y un color. Meter eso en JSON significa inventar un
mini-lenguaje de expresiones, que es exactamente la escalada que el spec
[`2026-08-13-detalle-dinamico-ofrecimiento-design.md`](2026-08-13-detalle-dinamico-ofrecimiento-design.md)
ya rechazó al descartar las librerías de JSON Schema.

**Consecuencia explícita, para que no sorprenda: sumar un motivo con detalle nuevo, o cambiarle los
campos a uno existente, requiere deploy.** Lo que se gana es que ese deploy es un archivo chico y
aislado, no una cirugía sobre el wizard. Lo que NO se gana es editar formularios por SQL.

Sí se puede seguir sin deploy: dar de alta o de baja un **motivo** (`pl_motivo`), reordenarlo,
renombrar su descripción, o moverlo entre Objeción / Cierre / Pendientes. Un motivo sin módulo
registrado simplemente no pide detalle.

### Por qué el dato SÍ va a una tabla flexible

Los cuatro formularios necesitan 4, 1, 2 y 2 valores respectivamente. No entran en
`marca` / `competidor` / `pct_diferencia`, y agregar una columna por campo devuelve el problema al
punto de partida. Una tabla de valores lo resuelve de una vez y **no vuelve a cambiar** cuando se
sume el quinto motivo.

## El esquema

```
pl_motivo                            ← el catálogo: qué motivos existen
   motivo_id, descripcion, resultado
   codigo VARCHAR(50) ───────────┐     la llave estable del módulo
                                 │
                                 │ el front y el back buscan su módulo por acá
                                 ▼
                        registroDetalleMotivo[codigo]   (código, no base)
                                 │
                                 │ declara qué `campo`s escribe
                                 ▼
pl_ofrecimiento_motivo           ← el hecho: este rubro se resolvió con este motivo
   PK (ofrecimiento_id, motivo_id)
              │
              │ 1 a N
              ▼
pl_ofrecimiento_motivo_campo     ← qué se respondió
   PK (ofrecimiento_id, motivo_id, campo)
   valor_texto | valor_num
```

**De qué es extensión cada parte** — es lo que hace que el modelo se entienda:

- **El `codigo` extiende al motivo.** Es una propiedad suya, como `resultado`.
- **Los valores no pueden extender ni al motivo ni a la resolución.** Del motivo no: dos visitas que
  eligen "Precio" tienen competidores distintos, así que el valor es de *este uso* del motivo. De
  `pl_resolucion` tampoco: esa es de la visita entera, y el dato es de un rubro puntual con un motivo
  puntual. El único ancla correcto es el par `(ofrecimiento, motivo)`, y por eso la tabla hereda esa
  PK y le suma `campo`.

**No es una entidad nueva.** `marca`, `competidor` y `pct_diferencia` ya son exactamente esto; solo
pasan de columnas fijas a filas.

### `pl_motivo.codigo` — por qué hace falta

El registro no puede indexarse por `motivo_id`: los ids **difieren entre ambientes**. Ya pasó en este
proyecto — el catálogo nuevo usó 20-30 en dev mientras en prod 17-21 estaban tomados por otra
migración, y un `INSERT IGNORE` los salteaba en silencio. Un registro keyed por número heredaría esa
fragilidad y rompería en prod y no en dev.

`codigo VARCHAR(50) NULL UNIQUE` (`'PRECIO'`, `'PLAZO'`, `'FLETE'`, `'NO_TRABAJA'`) es la llave
estable. Es además exactamente lo que ya hace `pl_accion`, cuyo `codigo VARCHAR(50)` es la PK y la
llave de `registroDetalleAccion`.

**`requiere_detalle` se elimina.** Con el registro, "este motivo pide detalle" es simplemente
"existe `registroDetalleMotivo[codigo]`". Un flag en la base que puede contradecir al código es peor
que no tenerlo.

### La tabla de valores

```sql
CREATE TABLE IF NOT EXISTS pl_ofrecimiento_motivo_campo (
  ofrecimiento_id INT          NOT NULL,
  motivo_id       INT          NOT NULL,
  campo           VARCHAR(50)  NOT NULL,

  -- Una sola de las dos se llena, según el tipo del campo. Lo garantiza el módulo al
  -- escribir. Es lo que mantiene el dato agrupable, que es el punto de todo esto.
  valor_texto     VARCHAR(200)  NULL,
  valor_num       DECIMAL(12,2) NULL,

  PRIMARY KEY (ofrecimiento_id, motivo_id, campo),
  INDEX idx_campo_texto (campo, valor_texto),
  INDEX idx_campo_num   (campo, valor_num),
  FOREIGN KEY (ofrecimiento_id, motivo_id)
    REFERENCES pl_ofrecimiento_motivo (ofrecimiento_id, motivo_id)
);
```

**Por qué una tabla y no un `valores JSON` en la fila.** Se evaluó; es bastante menos maquinaria.
El argumento de performance **no aplica y no se usa**: a ~14 vendedores × ~200 clientes × ~12 vueltas
× ~5 rubros ≈ 50-100k filas por año, un scan sobre JSON es milisegundos. La higiene del dato tampoco
decide: validando por tipo al escribir se consigue igual sobre JSON.

La razón real es **descubribilidad**. El análisis "tiene que poder hacerse en el futuro", y ese futuro
probablemente lo escribe alguien con acceso SQL que no participó de esta decisión:

```sql
-- Con la tabla: te asomás y ves qué campos existen.
SELECT DISTINCT campo FROM pl_ofrecimiento_motivo_campo;
SELECT AVG(valor_num) FROM pl_ofrecimiento_motivo_campo WHERE campo = 'plazo_dias';

-- Con JSON: hay que saber de antemano que la clave existe y qué forma tiene.
```

**Costo asumido:** un reporte que cruce varios campos necesita pivotear. Es conocido, acotado, y se
paga cuando se escriba ese reporte.

## Los cuatro módulos

Cada uno declara qué `campo`s escribe. Ese es el contrato con la tabla.

| `codigo` | campo | tipo | columna |
|---|---|---|---|
| `PRECIO` | `marca` | catálogo de marcas | `valor_texto` |
| | `competidor` | texto | `valor_texto` |
| | `precio_competidor` | número | `valor_num` |
| | `mi_precio` | número | `valor_num` |
| `PLAZO` | `plazo_dias` | número | `valor_num` |
| `FLETE` | `valor_flete` | número | `valor_num` |
| | `compra_futuro` | número | `valor_num` |
| `NO_TRABAJA` | `marca_trabaja` | texto | `valor_texto` |
| | `por_que` | texto largo | `valor_texto` |

- **`marca` sigue saliendo del catálogo**, no de un input libre. El mockup la muestra como texto
  tipeado, pero restringirla es lo único que hace agregable esa columna: con texto libre conviven
  "Fric Rot", "fricrot" y "FRIC-ROT" (está comentado en `ResolucionOfrecimiento.tsx`).
  `competidor` y `marca_trabaja` sí son texto libre — son marcas de afuera, no están en `fct_sales`
  y no hay catálogo que ofrecer.
- **`plazo_dias` es un número**, no texto: un plazo es una cantidad de días (30, 40, 1, 2). Así queda
  promediable, que es justamente lo que el texto libre habría impedido.
- **`por_que` es texto largo** (textarea). Es el único campo deliberadamente no analizable: es
  contexto para leer, no para agrupar.

El contrato del módulo espeja el de `registroDetalleAccion`, que ya existe y ya funciona:

```ts
export interface IModuloDetalleMotivo<T = unknown> {
    Editor: ComponentType<{ value: T; onChange: (v: T) => void }>
    /** Resumen de una línea para la tabla de ofrecimientos. */
    resumen: (valores: T) => string
    /** Habilita Siguiente/Atrás en el wizard — ver el gate de detalle incompleto. */
    esValido: (valores: T) => boolean
    /** Los `campo` que este módulo escribe. */
    campos: string[]
}
```

## Los valores derivados se calculan, no se guardan

`-13.3%` y `2.0%` se derivan de los inputs en el momento de mostrarlos. **No se persisten.** Una sola
fuente de verdad: guardados podrían quedar inconsistentes con sus inputs si la fórmula cambia, y en
SQL recalcularlos es trivial. Es también la razón por la que Precio pasa a guardar los dos precios en
vez del `%` tipeado: del delta no se puede volver a los valores, de los valores sí se llega al delta.

## Qué pasa cuando se saca un campo

Va a pasar seguido. A nivel base **no rompe nada** —no hay FK del `campo` a nada— y las filas
históricas quedan. Pero solo es seguro con tres reglas, que son diseño y no detalle:

**1. Lo histórico se dibuja desde las filas guardadas, no desde el módulo vigente.**
Si el panel de detalle de visita itera los `campos` del módulo actual, un valor que sí se recolectó
se vuelve invisible. El módulo es *qué preguntar hoy*; las filas son *qué pasó*. Precedente exacto en
el repo: `AnaliticaService` lee el catálogo con `incluirInactivos: true` para que un motivo dado de
baja no borre la historia que lo referencia.

**2. Un valor de un `campo` que ya no existe se descarta al escribir; no se rechaza.**
Rechazar con 400 dejaría al vendedor sin poder cerrar la visita si su borrador en localStorage tiene
el campo viejo. Es el mismo bug que se arregló hoy con los motivos dados de baja
(`MOTIVO_INEXISTENTE`): se poda, no se explota. El front poda el borrador al leerlo; el back ignora
campos desconocidos al persistir.

**3. Un `campo` no se reusa con otro significado.**
Volver a declarar `precio_competidor` para otra cosa fusiona en silencio dos series. El label se
cambia libremente; el `campo` es la identidad del dato y es inmutable una vez que hay filas.

## Migración

**No hay resoluciones cargadas en producción**, así que las tres columnas se van en el mismo paso.

Reduce el riesgo un hallazgo de la investigación: **la analítica no agrupa por ninguna de las tres
todavía.** `AnaliticaService.ts:389` solo las pasa a `IVisitaOfrecimientoDetalle`, que alimenta un
panel de detalle. El `INDEX idx_competidor` estaba puesto para un futuro que no llegó. Así que el
ripple en analítica es **mapeo de display, no reescritura de queries**.

1. `ALTER TABLE pl_motivo ADD codigo VARCHAR(50) NULL UNIQUE`, `DROP requiere_detalle`.
2. Sembrar `codigo` en los cuatro motivos con detalle.
3. `CREATE TABLE pl_ofrecimiento_motivo_campo`.
4. `ALTER TABLE pl_ofrecimiento_motivo DROP marca, DROP competidor, DROP pct_diferencia`
   (con su `INDEX idx_competidor`).

**Los borradores en localStorage** llevan la forma vieja (`{marca, competidor, pctDiferencia}`) en el
teléfono del vendedor. `leerBorrador` ya devuelve `null` ante JSON inválido, pero esto es JSON válido
con forma vieja: necesita un chequeo de forma explícito que lo descarte. **Es el detalle que muerde
si no se anticipa**, y ya hay precedente en la misma semana.

## Validación

Espejada, como el resto del dominio:

- **Frontend**: `esValido` del módulo alimenta `motivoIncompleto`, que bloquea Atrás/Siguiente en el
  wizard. Se previene acá para no gastar un viaje.
- **Backend**: un validador por `codigo` (espejo de `accionDetalleValidators`) más una validación
  genérica de que cada `campo` recibido sea uno de los declarados y su tipo cierre. Sigue tirando
  `MOTIVO_DETALLE_REQUERIDO` para no cambiar el contrato de errores.

## El tipo en el front

```ts
// antes
interface IOfrecimientoMotivo {
    motivoId: number
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

// después
interface IOfrecimientoMotivo {
    motivoId: number
    /** Por `campo`. Sin entrada = sin cargar. */
    valores: Record<string, string | number | null>
}
```

Es **la parte más cara del cambio**, no por dificultad sino por alcance: ~14 archivos no-test
(6 front, 8 back) y ~12 de tests mencionan los tres campos.

## Fuera de alcance

- **Editar formularios por SQL.** Queda explícitamente descartado por la evidencia de los mockups;
  ver "Por qué el formulario NO se define en la base".
- **Reportes nuevos** sobre los campos. La tabla los hace posibles; escribirlos es otro trabajo.
- **Tipos compuestos** (arrays, tramos umbral→descuento). Para eso ya está `registroDetalleAccion`.
- **El link "Registrar otra visita"** que aparece en los mockups: no se analizó en este spec.
