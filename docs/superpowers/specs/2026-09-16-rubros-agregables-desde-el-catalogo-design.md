# Rubros agregables desde el catálogo (no desde el historial del cliente)

**Fecha:** 2026-09-16
**Estado:** aprobado

## El problema

Un cliente **sin ningún movimiento** deja al vendedor sin nada que ofrecer. En la visita de
`#11251 · CAMARANO JUAN CARLOS` la tabla mostraba los 5 rubros de la propuesta (los del fallback
global de `/sale/rubro/recommendations/drops`) con `–` en las tres columnas, y **el bloque de
"otros rubros del cliente" vacío**: ninguna fila para agregar.

No es un bug de datos. `POST /sale/rubro/client-context` devuelve `rubros: []` porque el cliente
no compró nunca, y eso es correcto. El bug es que **la lista de rubros agregables se derivaba del
historial del cliente**:

- `construirFilasVisita` arma el bloque de abajo con `rubroStatus` (client-context).
- `VisitaSheet.tsx:450`, `rubrosCatalogo` — el buscador de "Agregar ofrecimiento" — también.

Sin historial, las dos puertas quedan cerradas.

## Es una regresión, no una feature

Antes existía `AgregarRubroVista`, que buscaba sobre el **catálogo completo** de rubros válidos
(`useRubroCatalog()` → `GET /sale/rubro/catalog`), independiente del historial. En `572f1f0`
("RubroTable reemplaza VersusTable/RubroCard", #3) la tabla absorbió el gesto de agregar desde la
fila, esa vista se borró, y con ella `getRubroCatalog`, `catalogoKeys.rubros` y `useRubroCatalog`.
Desde ahí lo agregable quedó atado a `rubroStatus`.

El endpoint sigue vivo e intacto del lado de api-vendedores (`RubroCatalogService.list()`:
`{code, description}[]` ordenado por descripción, cacheado en Redis). Este spec lo repone y lo
enchufa en la puerta nueva.

## La decisión

**En la visita, el bloque de abajo pasa a ser `historial ∪ catálogo`.**

1. Primero los rubros con historial que no están ya en la visita, con el orden 80/20 de hoy
   (`ordenar80_20`) y sus números.
2. Después el resto del catálogo, en el orden alfabético que ya devuelve el endpoint, con `–` en
   ACTUAL/M.ANT/P.6M. No hay que inventar nada: `construirFilasVisita` ya cae a `null` y
   `fmtCelda` los pinta `–`.
3. Cada fila del catálogo es `agregable`: mismo `＋` gris, mismo gesto, misma sección. Para el
   vendedor no hay dos clases de fila — hay rubros que el cliente compra (tienen números) y
   rubros que no.

**Una sola lista, no dos secciones.** Los números ya distinguen unos de otros sin rotularlo, el
buscador sticky sigue filtrando una lista sola, y una banda más en una pantalla donde entran ~5
filas cuesta más de lo que aclara.

**La banda deja de decir "del cliente" justo donde deja de ser cierto.** Se deriva de
`bloqueExtraEsAgregable`, sin prop nueva:

- con filas agregables → `Otros rubros · tocá uno para agregarlo`
- sin ellas → `Otros rubros del cliente` (como hoy)

**Sólo con la visita abierta y editable.** La visita cerrada es de consulta (`esEditable` es
`!visitaCerrada`) y ahí no hay nada que agregar; la propuesta previa (`PropuestaSheet`) tampoco lo
lleva: el vendedor está leyendo cómo viene comprando, no cargando, y decenas de filas inertes en
`–` son ruido. Las dos caen del mismo lado porque en las dos `editable` es `false`.

**El buscador de "Agregar ofrecimiento" se arregla por la misma puerta:** `rubrosCatalogo` pasa a
ser catálogo ∪ `rubroStatus`, dedupeado por código. La unión y no el reemplazo: un rubro con venta
que el filtro del catálogo excluya no tiene que desaparecer del buscador.

**El catálogo no es un gate.** Si el GET falla o está en vuelo, la tabla queda como hoy (historial
solo) y no se bloquea nada. Acá no aplica el patrón de `ofrecimientosCargados` de `VisitaSheet`
—que existe porque ahí lo que se auto-satisfacía era el mínimo de cierre—: no tener el catálogo no
habilita nada de más.

El `enabled` del hook (`open && !visitaCerrada`) es lo que evita pagarlo donde no se usa. La razón
es la del comentario original: son vendedores en la calle con datos móviles.

## Alcance

Front solamente. Cinco archivos, ninguno de api-vendedores:

| archivo | cambio |
|---|---|
| `src/api/planificacion.ts` | restaurar `getRubroCatalog()` → `GET /sale/rubro/catalog` |
| `src/hooks/useCatalogos.ts` | restaurar `catalogoKeys.rubros` + `useRubroCatalog(enabled)` |
| `src/components/propuesta/filas.ts` | `construirFilasVisita` toma `catalogoRubros`, y suma los códigos que no estén ni en la visita ni en `rubroStatus`, sólo si `expandido && editable` |
| `src/components/VisitaSheet.tsx` | `useRubroCatalog(open && !visitaCerrada)`; pasarlo a `construirFilasVisita`; `rubrosCatalogo` = unión |
| `src/components/propuesta/OfrecimientoTable.tsx` | texto de la banda derivado de `bloqueExtraEsAgregable` |

## Fuera de alcance

- Tocar `construirFilasPropuesta` o `PropuestaSheet`.
- Filtrar el catálogo del lado del front (como se hizo con `MARCAS_EXCLUIDAS`): el de rubros ya
  viene filtrado en la query (`queryRubroCatalog` descarta `SIN SUPERRUBRO`, `%borrar%`, `%no
  usa%`, `ZZ%` y los códigos administrativos).
- Cualquier cambio en `client-context`. Devolver `rubros: []` para un cliente sin movimientos es
  la respuesta correcta.
