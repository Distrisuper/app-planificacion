# La visita en curso sobre la misma tabla: resolver y agregar desde la fila

## Contexto

`docs/superpowers/specs/2026-07-31-tabla-propuesta-design.md` convierte la propuesta pre-visita en
una tabla expandible con `ACTUAL · M.ANT · PROM.6M`. Este spec hace lo mismo con la pantalla de la
visita en curso (`VisitaSheet`) y **reemplaza la cláusula de su Alcance que decía que el
comportamiento de `VisitaSheet` no se tocaba**: sí se toca.

Hoy la visita en curso muestra una lista de cards (`RubroCard`) con nombre + botón "Resolución", y
los números viven detrás del botón "Ver versus", que empuja a otra pantalla. El vendedor está
parado frente al cliente decidiendo en qué insistir: necesita el número y la acción juntos.

Tres huecos más que se cierran acá:

- **"Agregar rubro" no puede partir de lo que el cliente ya compra.** Hoy el único camino es el
  catálogo completo (`AgregarRubroVista`). El caso frecuente —"esto lo compra y hoy no lo pedís"—
  está en la tabla de rubros del cliente, que es de solo lectura.
- **El tacho de borrar vive en la card**, a un tap de distancia del botón de resolución.
- **La selección múltiple** (`SeleccionBar`, `ResolverLoteVista`) compite por el tap de la fila con
  la acción de resolver.

Trabajo 100% de front. Ningún endpoint nuevo: `agregarRubro` y `useAgregarRubro` ya existen y hoy
no tienen consumidor desde la tabla.

## Comportamiento

Una sola tabla, los mismos dos estados que en la propuesta:

- **Colapsada** (default): los rubros de la visita (`useRubros`), en el orden que los devuelve el
  backend, marcados con la barra navy a la izquierda.
- **Expandida**, al tocar **Ver más**: debajo y separadas por un borde más marcado, el resto de los
  rubros del cliente. El botón pasa a **Ver menos**.

"Ver versus" pasa a llamarse **Ver más** y desaparece la sub-vista `versus` (su header "Cómo viene
comprando" y su botón de volver). Es la misma tabla creciendo.

El orden de las filas de la visita **no cambia al resolver**. Reordenar dejando los pendientes
arriba haría saltar la fila que el vendedor acaba de tocar; cuántos faltan ya lo dice el pie
("Faltan completar N rubros…").

### Fila de la visita: dos líneas

Cada rubro de la visita ocupa dos líneas dentro de la tabla:

```
┌──────────────────────────────────────┐
│ RUBRO      ACTUAL  M.ANT  P.6M       │
├──────────────────────────────────────┤
│ TOTALES     $ 12   $ 34   $ 28       │
│┃AMORTIG.    $ 3    $ 12   $ 14       │
│┃ └[   ✓ 2 motivos cargados    ]      │
│┃BUJES       $ 2    $ 6     $ 7       │
│┃ └[       Resolución          ]      │
├──────────────────────────────────────┤
│ EMBRAGUE    $ 8    $ 9     $ 9    ＋ │
│ FILTRO      $ 4    $ 4     $ 4    ＋ │
│ BATERIAS    –      $ 2     $ 1    ＋ │
└──────────────────────────────────────┘
```

Arriba, nombre y los tres números. Abajo, un botón al ancho de la fila — el mismo que hoy vive en
`RubroCard`, con el mismo criterio de estado: borde gris y texto navy "Resolución" si está
pendiente, verde "✓ N motivos cargados" si ya se cargó. Se descartó una columna angosta con chip o
un chevron: la acción tiene que ser legible como acción sin que nadie la explique, y en una fila de
tabla eso pide un botón con texto. El costo asumido es la altura — entran ~4 rubros por pantalla en
375px en lugar de ~7.

El estado "resuelto" se sigue calculando con `rubroCompleto` sobre el borrador local (motivos
cargados y sin detalle incompleto), no con el `resuelto` del backend.

### Fila fuera de la visita: una línea con ＋

Las filas de abajo son de una línea, con un **＋ de ~28px al final** que agrega el rubro a la
visita (`useAgregarRubro`). La asimetría con las de arriba es deliberada: abajo puede haber 40
rubros para escanear y no pueden medir el doble cada uno.

Mientras la mutación corre, ese ＋ muestra spinner y queda deshabilitado. Al terminar se invalida
`useRubros` y el merge reubica la fila en el bloque de arriba, ya con su botón de "Resolución": el
＋ *sube* el rubro, que es exactamente lo que el vendedor quiso hacer.

El botón **"Agregar rubro"** (catálogo, `AgregarRubroVista`) se mantiene debajo de la tabla. Un
rubro que el cliente nunca compró no aparece en la tabla —no hay fila que subir— y ese es
justamente el caso que motivó el catálogo.

### Visita cerrada

Con `visitaCerrada` la tabla es de solo lectura: sin botón de resolución, sin ＋, sin "Agregar
rubro". **"Ver más" sí sigue disponible**: consultar cómo viene comprando el cliente no es editar
la visita.

### Selección múltiple

Se desconecta de la UI, sin borrar código. `seleccionados` nunca se puebla, así que `SeleccionBar`,
`ResolverLoteVista` y `ResolverLoteAcciones` quedan inalcanzables (y sus tests unitarios siguen
verdes). Se mantienen intactos el borrador local por rubro en `localStorage` y el guardado único al
cerrar visita — son otra cosa, y son la mecánica que sostiene el wizard.

### Quitar un rubro agregado a mano

El tacho se va de la fila. "Quitar rubro" pasa **dentro del wizard de resolución**, visible sólo
para rubros con `!esPropuesto` y visita editable. Los de la propuesta no se borran (el backend
responde `RUBRO_DE_PROPUESTA`): si no se ofreció, se resuelve con "No lo ofrecí". Poner el borrado
detrás de una intención explícita lo saca de al lado del target grande de la fila.

## Datos

Los números salen de `useRubroStatus(codigoParticularCliente)`, ahora pedido **al abrir el sheet**
y no al entrar a una sub-vista. Se mergean con `useRubros` por `rubroCode` — el mismo `filas.ts`
del spec de la propuesta.

**Nada de esto bloquea la pantalla.** Mientras `useRubroStatus` carga (o si falla), la tabla se
renderiza igual con los rubros de la visita, las tres columnas en `–` y los botones de "Resolución"
operativos; los números aparecen cuando llegan. Acá el contenido de la pantalla es la acción, no la
tabla: hacer esperar al vendedor por unos importes de consulta sería peor que mostrarlos tarde.
(En la propuesta pre-visita la decisión es la opuesta —ahí sí spinner— porque la tabla *es* el
contenido.) Consecuencia: "Ver más" sólo aparece cuando `useRubroStatus` respondió con al menos un
rubro que no está en la visita.

Un rubro de la visita que no esté en la respuesta de `/sale/rubro/clients` —típicamente uno
agregado desde el catálogo, que el cliente nunca compró— se muestra con las tres columnas en `–`.
Es la verdad, y explica por qué no estaba en la tabla para subirlo.

Sin `codigoParticularCliente` la tabla muestra los rubros de la visita con las columnas en `–` y
sin "Ver más". En el único caller (`VisitaFlow.tsx:252`) el código sale de
`cliente.codigoParticularCliente`, que es requerido, así que es un camino teórico que igual queda
coherente.

La fila TOTALES viene heredada del componente: colapsada suma los rubros de la visita, expandida
suma todo.

## Código

| Pieza | Cambio |
|---|---|
| `src/components/propuesta/RubroTable.tsx` | Gana la segunda línea de fila (un `<tr>` con `colSpan` para no descuadrar las columnas numéricas), la columna del ＋ y los callbacks `onResolucion` / `onAgregar`. Sigue siendo presentacional: no conoce visitas ni mutaciones. |
| `src/components/propuesta/filas.ts` | Gana `construirFilasVisita(rubrosVisita, rubroStatus, { expandido, editable })`. |
| `src/components/VisitaSheet.tsx` | Se borra el render de `RubroCard` y de la sub-vista `versus`. `Vista` queda `'list' \| 'agregar' \| 'resolverLote'` y se agrega `expandido: boolean`. `seleccionados`/`loteMotivos` quedan pero sin forma de poblarse desde la UI. |
| `src/components/propuesta/RubroCard.tsx` | **Se borra.** Tras este cambio y el de la propuesta no le queda ningún consumidor. No tiene test propio. Su botón de resolución (clases y criterio de estado) se muda a la segunda línea de `RubroTable`. |
| `src/components/propuesta/ResolucionWizard.tsx` | Gana "Quitar rubro" para `!esPropuesto` + visita editable, consumiendo `useEliminarRubro`. |

Esto reemplaza la fila de la tabla de código del spec de la propuesta que decía que `RubroCard`
"pierde `caidaPct`, `pesosPerdidos` e `isFallback`": el archivo se va completo.

`IRubroFila` se extiende con lo que la fila necesita para actuar, manteniendo `RubroTable` tonta:

```ts
interface IRubroFila {
    rubroCode: string
    nombre: string
    actual: number | null
    mesAnterior: number | null
    promedio6m: number | null
    /** Barra navy + negrita: está en la propuesta (o en la visita). */
    destacada: boolean
    /** Presente ⇒ segunda línea con el botón de resolución. */
    resolucion?: { visitaRubroId: number; motivosCargados: number; completo: boolean }
    /** true ⇒ ＋ al final de la fila. */
    agregable?: boolean
}
```

## Tests

- `filas.test.ts` — `construirFilasVisita`: orden del backend respetado; `destacada` en las de la
  visita; rubro de la visita ausente de `rubroStatus` queda en `–`; expandida agrega las faltantes
  con `agregable`; visita cerrada sin `resolucion` ni `agregable`.
- `RubroTable.test.tsx` — segunda línea con "Resolución" vs. "✓ N motivos cargados" según
  `completo`; el ＋ dispara `onAgregar` con el `rubroCode`; en solo lectura no se renderiza ninguna
  acción.
- `VisitaSheet.test.tsx`:
  - siguen válidos, con los fixtures de importes subidos a magnitud real (ver el spec de la
    propuesta): el botón "Resolución" abre el wizard, el borrador, el cierre en batch, el pie con
    los pendientes, el eyebrow en curso, el catálogo.
  - se reescriben: `'sin codigoParticularCliente no ofrece ver versus'` → "no ofrece Ver más";
    `'con codigoParticularCliente, ver versus…'` → los números aparecen en la tabla sin navegar;
    los dos de borrado (`'un rubro de la propuesta no se puede borrar'`,
    `'con la visita cerrada, un rubro ya resuelto no ofrece borrarlo'`) apuntan al wizard;
    `'con la visita cerrada, ningún rubro se puede reabrir ni seleccionar'` pierde la parte de
    seleccionar.
  - se borran los cuatro de selección múltiple (`'tocar la card de un rubro…lo selecciona'`,
    `'seleccionar varios rubros muestra la barra'`, `'Cancelar en la barra de selección'`,
    `'Resolver seleccionados fusiona el motivo…'`): ya no hay forma de llegar a ese flujo desde la
    UI. Los tests unitarios de `SeleccionBar`, `ResolverLoteVista` y `ResolverLoteAcciones` quedan.
  - nuevo: el ＋ de un rubro fuera de la visita llama a `agregarRubro` y la fila pasa al bloque de
    arriba con su botón de "Resolución".
  - nuevo: si `getRubroStatus` falla, la tabla igual lista los rubros de la visita y el botón de
    "Resolución" funciona.

## Fuera de alcance

Reordenar por estado o por columna, el drill-down por celda de Versus, resolución en lote (queda el
código, sin UI), y agregar desde la tabla un rubro que el cliente nunca compró (para eso está el
catálogo).
