# La propuesta como tabla expandible, con el estilo de Versus

## Contexto

La propuesta comercial pre-visita (`PropuestaSheet`) hoy muestra los rubros como cards
(`RubroCard`): nombre, badge de caída % y "Perdés ~$X/mes". Los números que sostienen ese
argumento — cuánto compró este mes, cuánto el mes anterior, cuál es su promedio de 6 meses — no se
ven. Están un tap más allá, en la sub-vista "Ver versus", que además es una pantalla distinta con
su propio header y botón de volver.

El vendedor ya sabe leer esa tabla: es la misma que usa todos los días en Versus
(`app-vendedores`, vista RubroV2). Mostrarla directamente en la propuesta le ahorra el tap y le da
el número, no el adjetivo.

El endpoint que alimenta "Ver versus" (`POST /sale/rubro/clients`, vía `useRubroStatus`) devuelve
**todos** los rubros del cliente con los tres períodos. La propuesta
(`POST /sale/rubro/recommendations/drops`) devuelve un subconjunto: los caídos más relleno.
Trabajo 100% de front, sin endpoints nuevos.

## Alcance

Cambia sólo `PropuestaSheet` (pre-visita) y la tabla compartida. **El comportamiento de
`VisitaSheet` no se toca**: mantiene su sub-vista de Versus, su botón "Ver versus" y su navegación
con botón de volver. Lo que sí hereda, por compartir el componente de tabla, es el estilo nuevo:
importes en miles, `–` para vacío, `PROM.6M` con badge `REF` y fila TOTALES. Es deseable — son las
mismas dos tablas y no deben verse distintas. Lo único que no aparece ahí es la marca de rubro
propuesto (`VisitaSheet` no le pasa el flag).

## Comportamiento

`PropuestaSheet` muestra **una sola tabla** con dos estados:

- **Colapsada** (default al abrir): sólo los rubros de la propuesta.
- **Expandida**, al tocar **Ver más**: todos los rubros del cliente, los de la propuesta primero
  y marcados. El botón pasa a **Ver menos**.

Desaparecen de este sheet la sub-vista `versus`, el header "Cómo viene comprando" y su botón de
volver: es la misma tabla creciendo, no otra pantalla. Al cerrar el sheet vuelve a colapsada.

El botón "Ver más" sólo se muestra cuando hay algo que expandir: existe al menos un rubro en
`useRubroStatus` que no está en la propuesta.

Encima de la tabla se mantiene la bajada actual ("Cayeron los últimos 2 meses vs. el promedio de 6
meses del cliente:") y se agrega una línea de contexto en 11px muted:
**"Actual: N de M días del mes"**, con el `daysElapsed`/`totalDays` que ya trae la respuesta de la
propuesta. Sin ese dato, una columna ACTUAL en rojo el día 3 del mes se lee como "este cliente se
cayó" cuando dice "todavía no facturó el mes" — ver la nota sobre coloreado más abajo.

Estados de carga y vacío:

| Situación | Qué se ve |
|---|---|
| `useRubroStatus` cargando | spinner + "Cargando…" (el mismo bloque que hoy usa la vista versus) |
| Propuesta vacía, hay otros rubros | "Sin oportunidades destacadas." + botón "Ver más" |
| Propuesta vacía y sin otros rubros | "Sin oportunidades destacadas." |
| `useRubroStatus` falla | la tabla cae a los números de la propuesta, sin botón "Ver más" |

## La tabla

Columnas, unificadas para las dos pantallas que usan el componente:
`RUBRO · ACTUAL · M.ANT · PROM.6M`. Es el orden que ya tenía la tabla de Versus de esta app; la
propuesta se alinea a él en lugar de inventar el suyo.

Primera fila **TOTALES** en bold con la suma de cada columna sobre las filas visibles: en
colapsada suma sólo la propuesta (lo que está en juego en esta visita), en expandida suma todo.

Los rubros de la propuesta se distinguen dentro de la tabla con **barra vertical navy de 3px al
inicio de la fila y nombre en negrita**. No consume ancho de columna, que en 375px con 4 columnas
es el recurso escaso.

### Estilo tomado de app-vendedores

Verificado contra `src/components/DataTable/cells/PillCell.tsx`,
`src/components/DataTable/cells/NumericCell.tsx`, `src/components/RubroV2/fmtAmount.tsx` y
`src/utils/cellColorV2.ts` de `app-vendedores`:

- **Importes en miles**, con el `$` más chico y gris: `$940.911` se muestra `$ 941`. El separador
  entre signo y número es un non-breaking space, y arriba de 7 caracteres la fuente se achica en
  `em` para que la celda nunca desborde. Se porta `fmtAmount` tal cual. Motivo doble: es el mismo
  número que el vendedor ve en Versus (si no coincidieran, desconfía de los dos), y en pesos
  completos las 4 columnas no entran cómodas en 375px.
- **`–` para vacío**, incluyendo el cero: `formatNumericValue` devuelve `'–'` para `0`, `null` y
  `NaN`. Un `0` renderizado se lee como "no compró", que es una afirmación distinta de "no hay
  dato".
- **`lining-nums tabular-nums slashed-zero whitespace-nowrap`**, alineado a la derecha, y cada
  celda numérica como pill redondeado (`px-1.5 py-0.5 rounded-md`).
- **`PROM.6M` va neutra, sin color**, con badge `REF`: es la referencia contra la que se colorean
  las otras, no se compara consigo misma.

### Coloreado

**Rojo binario**: `ACTUAL` y `M.ANT` se pintan de rojo cuando el valor está por debajo del
`PROM.6M` del propio rubro (`promedio6m > 0 && valor < promedio6m`). Si el valor es `–`, no hay
rojo. La misma regla se aplica a la fila TOTALES sobre las sumas.

Se evaluaron y **se descartaron** dos cosas que Versus sí hace, por decisión explícita de mantener
la señal simple en una pantalla de 375px:

- La escala de 5 niveles de `cellColorV2` (≥1.3 verde · ≥0.9 neutro · ≥0.7 amarillo · ≥0.2
  naranja · <0.2 rojo). Consecuencia asumida: una caída del 1% se pinta igual que una del 95%.
- Colorear `ACTUAL` por la proyección a fin de mes mostrando el número crudo, que es lo que hace
  `rubroTableColumns.tsx` (`computeV2ColorClass(projectedForColor, ref6m)`). Consecuencia asumida:
  los primeros días del mes casi toda la columna `ACTUAL` va en rojo. Se mitiga con la línea
  "Actual: N de M días del mes", no cambiando la lógica de color.

## Datos

**Los números salen siempre de `/sale/rubro/clients`** (`useRubroStatus`), en los dos estados de
la tabla. Es la decisión que más importa acá: los dos endpoints calculan el promedio de 6 meses
distinto — la propuesta usa `current.baseline` (promedio de los 6 meses *previos* al actual) y el
de clientes usa `last6Months / 6`. Mezclarlos en una misma tabla haría que el mismo rubro muestre
dos `PROM.6M` distintos según la fila, o que los números se muevan al expandir. Una tabla, una
fuente. `last6Months / 6` es además exactamente lo que Versus muestra en su columna `P.6M`.

La propuesta aporta lo que no es número: qué rubros van marcados, en qué orden, el
`daysElapsed`/`totalDays` de la línea de contexto, y el DTO que se congela al iniciar visita
(`toPropuestaDTO`, sin cambios).

Las dos queries arrancan al abrir el sheet (hoy `useRubroStatus` esperaba a que el vendedor
entrara a la sub-vista). **"Iniciar visita" no depende de `useRubroStatus`**: si esa query tarda o
falla, la visita arranca igual con los datos de la propuesta. Una tabla de display no puede
bloquear el flujo — es exactamente el bug que ya se pagó una vez en el `select` de `usePropuesta`
(un campo de display faltante dejaba la visita en un spinner infinito con un 200 en la red; hay un
test de regresión por eso).

**Fallback por fila**: un rubro de la propuesta que no aparezca en la respuesta de
`/sale/rubro/clients` se muestra igual, con sus propios números (`current.actual`, `prev.actual`,
`current.baseline`) y `–` donde falten. Un rubro que el vendedor tiene que ofrecer no puede
desaparecer de la pantalla porque el otro endpoint no lo trajo. `current` y `prev` son opcionales
a propósito en el tipo — ya se vio una respuesta 200 sin ellos.

## Código

| Pieza | Cambio |
|---|---|
| `src/components/propuesta/VersusTable.tsx` | → `RubroTable.tsx`. Ya no es "de versus": lo usan las dos pantallas. Números `number \| null`, marca de propuesta por fila, fila TOTALES, estilo nuevo. |
| `src/components/propuesta/filas.ts` | **nuevo**. Funciones puras: merge propuesta + rubros, orden, fallback por fila, colapsado/expandido, totales. |
| `src/lib/fmtAmount.tsx` | **nuevo**. Portado de `app-vendedores`. |
| `src/components/PropuestaSheet.tsx` | el estado `vista: 'list' \| 'versus'` pasa a `expandido: boolean`; se borra el render de la sub-vista y su header. |
| `src/components/propuesta/RubroCard.tsx` | pierde `caidaPct`, `pesosPerdidos` e `isFallback` — sin consumidor tras el cambio (`VisitaSheet`, su único uso restante, no las pasa). |
| `src/components/VisitaSheet.tsx` | sólo lo que exija el rename del componente. |

`IRubroFila = { rubroCode, nombre, actual, mesAnterior, promedio6m, esPropuesta }` con los tres
números `number | null`. `getRubroStatus` sigue devolviendo `number` (su `?? 0` no se toca): el
`null` lo introduce únicamente el camino de fallback de la propuesta.

Toda la lógica real de esta feature vive en `filas.ts`, que no renderiza nada y se testea sin
DOM. `RubroTable` queda como presentación pura y `PropuestaSheet` como orquestación de dos queries
y un booleano.

## Tests

- `filas.test.ts` — orden propuesta-primero; marca `esPropuesta`; colapsada trae sólo la
  propuesta; expandida trae todos sin duplicar; rubro propuesto ausente de `rubroStatus` usa su
  fallback; totales suman sólo las filas visibles.
- `fmtAmount.test.ts` — miles; `–` en 0 y en importes < 500; negativos con el signo fuera del `$`.
- `RubroTable.test.tsx` — orden de columnas; rojo en `ACTUAL`/`M.ANT` bajo el `PROM.6M`; sin rojo
  cuando el valor es `–`; `PROM.6M` sin color; barra de propuesta; fila TOTALES.
- `PropuestaSheet.test.tsx` — los tres tests actuales siguen válidos, agregando el mock de
  `getRubroStatus`; "Ver más" trae un rubro que no está en la propuesta; con `getRubroStatus`
  caído se ve la tabla y se puede iniciar visita.
- `VisitaSheet.test.tsx` — hay que subir de magnitud los fixtures. Hoy usa `600 / 800 / 1000` y
  asserta el texto `'1.000'`; en miles esos tres valores colapsan al mismo `$ 1`. Van a importes
  del orden de los reales (cientos de miles / millones), que además es lo que hace que el test
  distinga una columna de otra.

## Fuera de alcance

La escala de 5 colores y el coloreado por proyección (descartados arriba, no pendientes). Sort por
columna, drill-down por celda, columnas `P.3M`/`P.12M` y filtro de canal: existen en Versus y no
hacen falta para decidir qué ofrecer en la puerta del cliente. La marca de propuesta en la tabla
de `VisitaSheet`.

## Nota para después

`docs/superpowers/plans/2026-07-31-personalizar-propuesta.md` agrega un botón en esta misma vista
descrito como "arriba de Ver versus". Con este cambio el botón queda debajo de la tabla y el texto
es "Ver más" — releer ese paso antes de ejecutarlo.
