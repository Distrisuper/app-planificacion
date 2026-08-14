# Sección "Acciones" separada en OfrecimientoTable

**Fecha:** 2026-08-13
**Estado:** diseño aprobado, listo para implementar
**Alcance:** app-planificacion (frontend únicamente)

Continúa a [`2026-08-13-detalle-dinamico-ofrecimiento-design.md`](2026-08-13-detalle-dinamico-ofrecimiento-design.md).
Ese spec agregó el resumen de `detalle` (tramos de Cupo) a la fila de una acción; este resuelve
dónde vive esa fila dentro de la pantalla.

## El problema

Hoy "Plan cupo" (`tipo: 'accion'`) es una fila más dentro de la tabla RUBRO·ACTUAL·M.ANT·P.6M,
mezclada con los rubros de la visita. Ya se le sacaron las tres columnas numéricas (no aplican a
una acción), pero eso dejó la fila con un hueco vacío a la derecha y sin ninguna señal de que es
un tipo de ofrecimiento distinto — el vendedor la ve como un rubro más, en el mismo lugar, con la
misma forma.

## La decisión

Se separa la fila de cada acción en un bloque propio, **arriba de todo** (antes del bloque
destacado de rubros de la visita), afuera del contenedor con borde de la tabla — mismo criterio
que ya usa "Otros rubros del cliente" para su propia sub-sección, pero al principio en vez de al
final. Solo aparece si hay al menos una fila `tipo: 'accion'`; sin ninguna, no se renderiza nada
(ni etiqueta vacía).

**La fila en sí no cambia.** Sigue siendo el mismo componente de una línea (chip de estado, nombre,
chip de tipo, resumen de alcance/detalle, botón de borrar) que ya existe y ya está probado — lo
único que cambia es el contenedor donde vive. Se descartó una tarjeta con más aire/diseño nuevo:
no hay evidencia de que la fila actual necesite más espacio, y as reusar el mismo componente evita
duplicar estilos y tests.

**Etiqueta mínima, sin texto explicativo.** Un rótulo corto en mayúsculas ("ACCIONES"), mismo
estilo que ya usa la etiqueta de "Otros rubros del cliente" (`text-[9.5px] font-bold uppercase
tracking-wide text-dsmuted`). Nada de frases — el pedido explícito fue "cuanto menos texto,
mejor". El párrafo introductorio de `VisitaSheet` ("Cargá el resultado de cada rubro...") no se
toca.

### Por qué no un enfoque distinto

- **Filtrar inline dentro de `OfrecimientoTable`** (agregar un filtro más a la lógica de
  `destacada`/buscador que ya existe): se descartó porque el componente ya mezcla varias
  dimensiones de partición (destacada, agregable, buscador) y sumarle "es acción" ahí lo vuelve
  más denso de leer sin necesidad.
- **Cambiar la forma que devuelve `construirFilasVisita`** (que devuelva `{ acciones,
  ofrecimientos }` en vez de un array plano): se descartó por ser un cambio de modelo de datos
  para resolver algo que es puramente de presentación — rompería el tipo que ya consumen
  `VisitaSheet` y sus tests para un problema que se resuelve mejor en la capa de UI.

## Diseño técnico

### `separarAcciones` — nuevo helper puro en `src/components/propuesta/filas.ts`

```ts
export function separarAcciones(filas: IOfrecimientoFila[]): {
    acciones: IOfrecimientoFila[]
    resto: IOfrecimientoFila[]
} {
    return {
        acciones: filas.filter(f => f.tipo === 'accion'),
        resto: filas.filter(f => f.tipo !== 'accion'),
    }
}
```

Puro y testeable solo, sin JSX. No reordena ninguna de las dos listas.

### `OfrecimientoTable.tsx`

Al principio de la función, antes de calcular `bloqueArriba`/`bloqueAbajo`/`conChip`/
`conColumnaQuitar`, se llama `separarAcciones(filas)`. Toda la lógica existente (destacada,
buscador, columnas reservadas) sigue operando **solo sobre `resto`** — cero cambios de
comportamiento ahí, sigue siendo el código ya probado.

Se agrega un bloque nuevo, renderizado antes del contenedor de la tabla:

```tsx
{acciones.length > 0 && (
    <div className="mb-2">
        <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
            Acciones
        </p>
        <div className="w-full rounded-xl border border-dsline">
            {acciones.map((fila, i) => (
                <FilaOfrecimiento
                    key={`${fila.tipo}:${fila.codigo}`}
                    fila={fila}
                    conBorde={i < acciones.length - 1}
                    conChip={conChipAcciones}
                    conColumnaQuitar={conColumnaQuitarAcciones}
                    onResolucion={onResolucion}
                    onAgregar={onAgregar}
                    onEliminar={onEliminar}
                    agregandoCodes={agregandoCodes}
                    eliminandoIds={eliminandoIds}
                />
            ))}
        </div>
    </div>
)}
```

`conChipAcciones`/`conColumnaQuitarAcciones` se calculan igual que hoy (`some(f => f.resolucion)` /
`some(f => f.resolucion && !f.resolucion.esPropuesto)`), pero sobre `acciones`, no sobre `resto` —
son grillas independientes, cada una decide su propio ancho reservado.

Reusa `FilaOfrecimiento` tal cual (mismo componente, mismas props) — no hay columnas de
ACTUAL/M.ANT/P.6M que mostrar en este bloque porque ninguna fila de `acciones` las trae (ya se
ocultan por `tipo !== 'accion'` en `ContenidoFila`, sin cambios ahí tampoco).

## Testing

- `filas.test.ts`: `separarAcciones` — sin acciones (`resto` = todo, `acciones` vacío), con una
  acción (se separa, no queda en `resto`), con varias (todas en `acciones`, orden preservado),
  mezclado con rubros y marcas (solo `tipo: 'accion'` se separa).
- `OfrecimientoTable.test.tsx`: con una fila `tipo: 'accion'`, aparece la etiqueta "Acciones" y la
  fila fuera del contenedor de la tabla de rubros; sin ninguna fila de acción, no aparece la
  etiqueta; una fila de acción en ese bloque sigue disparando `onResolucion`/`onEliminar` con su
  `ofrecimientoId`; los tests existentes que no usan `tipo: 'accion'` (incluidos los de
  `PropuestaSheet`, que nunca produce filas de acción) no cambian su comportamiento.

## Fuera de alcance

- El párrafo introductorio de `VisitaSheet`.
- Cualquier cambio en `PropuestaSheet`: no gana esta sección porque `construirFilasPropuesta`
  nunca produce `tipo: 'accion'` — consecuencia de los datos, no requiere ningún guard especial.
- Rediseño de la fila en sí (tarjeta con más aire) — se mantiene el componente de una línea ya
  existente.
