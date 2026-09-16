# "Otros rubros" = la lista 80/20 mezclada con el historial del cliente

**Fecha:** 2026-09-16
**Estado:** implementado

## El problema

Un cliente **sin ningún movimiento** dejaba al vendedor sin nada que ofrecer. En
`#09301 · BALLESTER MOTOR S.A` y `#11251 · CAMARANO JUAN CARLOS`, la pantalla mostraba los
5 rubros de la propuesta (el fallback global de `/sale/rubro/recommendations/drops`) con
`–` en las tres columnas, y **nada abajo**: ni lista, ni banda, ni `＋`.

No es un bug de datos. `POST /sale/rubro/client-context` devuelve `rubros: []` porque el
cliente no compró nunca, y eso es correcto. El bug es que **el bloque de "otros rubros" se
derivaba del historial**:

- `construirFilasPropuesta` / `construirFilasVisita` armaban ese bloque con `rubroStatus`.
- `VisitaSheet`, `rubrosCatalogo` — el buscador de "Agregar ofrecimiento" — también.

Sin historial, las tres puertas quedaban cerradas.

## Es una regresión

Antes existía `AgregarRubroVista`, que buscaba sobre un universo independiente del
historial. En `572f1f0` ("RubroTable reemplaza VersusTable/RubroCard", #3) la tabla
absorbió el gesto de agregar desde la fila, esa vista se borró, y lo agregable quedó atado
a `rubroStatus`.

## La decisión

**El bloque de abajo es la lista 80/20 mezclada con el historial**, en las dos pantallas
(`PropuestaSheet` y `VisitaSheet`):

1. El universo es **`ORDER_RUBROS`** (`src/lib/ordenRubros.ts`), que ya vivía en el front
   para ordenar ese mismo bloque. No hace falta ningún endpoint nuevo: el `＋` no necesita
   más que código y nombre, y los dos están ahí.
2. El historial manda los números y el nombre; los rubros que el cliente no compra van en
   `–`. Nada que inventar: `fmtCelda(null)` ya pinta `–`.
3. Orden 80/20, el de siempre. Los rubros que el cliente compra y **no** están en el 80/20
   no se pierden: `ordenar80_20` los manda al final.
4. Se excluyen `TOTALES`, `OTROS` y `-1` (SIN SUPERRUBRO): son pseudo-filas del 80/20, no
   rubros ofrecibles. El backend descarta las mismas en `queryRubroCatalog`.
5. La banda dice **`Otros rubros`** (+ `· tocá uno para agregarlo` cuando son agregables).
   Se le saca "del cliente": abajo ahora hay rubros que el cliente nunca compró.

Un solo helper, `otrosRubros(rubroStatus, yaVisibles)` en `filas.ts`, alimenta las tres
puertas — las dos tablas y, vía `rubrosElegibles`, el buscador de "Agregar ofrecimiento".

**Se descartó traer el universo de `GET /sale/rubro/catalog`** (`RubroCatalogService`, que
existe y está cacheado). Habría sido un endpoint, un hook, un estado de carga y un modo
degradado offline para conseguir la misma lista que ya está compilada en el bundle. El
catálogo del server es más completo y más fresco, pero el 80/20 es **la** lista del negocio
(la que ordena la pantalla y la que usan api-vendedores y app-vendedores), y un rubro nuevo
ya obliga a tocar `ORDER_RUBROS` de los tres repos.

## Consecuencia esperada

`PropuestaSheet` ya no puede mostrar "Sin oportunidades destacadas": con propuesta vacía e
historial vacío, la tabla igual lista el 80/20 en `–`. Es el punto de todo esto — es el
cliente donde más importa tener algo que ofrecer.

## Alcance

Front solamente. Tres archivos:

| archivo | cambio |
|---|---|
| `src/components/propuesta/filas.ts` | `otrosRubros` (helper nuevo) + `rubrosElegibles` (export); los dos builders lo usan para el bloque de abajo |
| `src/components/VisitaSheet.tsx` | `rubrosCatalogo` = `rubrosElegibles(rubroStatus)`; `agregarDesdeTabla` resuelve la descripción ahí y no en `rubroStatus` |
| `src/components/propuesta/OfrecimientoTable.tsx` | la banda dice "Otros rubros" |

`agregarDesdeTabla` importa: resolvía la descripción con un `find` sobre `rubroStatus` y
hacía `return` silencioso si no la encontraba, así que el `＋` de una fila sin historial se
dibujaba y **no hacía nada**.

## Fuera de alcance

- Cualquier cambio en `client-context`. Devolver `rubros: []` para un cliente sin
  movimientos es la respuesta correcta.
- Marcas: sólo se listan las que el cliente compra. Una fila del 80/20 sin historial no
  tiene marcas que desplegar.
