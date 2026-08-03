# Personalizar la propuesta: catálogo de rubros y de marcas

## Contexto

`docs/superpowers/specs/2026-07-30-wizard-resolucion-rubros-design.md` dejó el wizard de
resolución navegable y con un solo guardado al final. Lo que sigue faltando es lo anterior al
wizard: **el vendedor no puede tocar qué rubros ofrece**. La lista es la propuesta congelada al
iniciar la visita y nada más.

Hoy la cadena para agregar un rubro está construida entera salvo la UI:

- `POST /planificacion/visitas/:id/rubros` — `RubrosService.agregar` (api-vendedores)
- `agregarRubro` — `src/api/planificacion.ts:128`
- `useAgregarRubro` — `src/hooks/useRubros.ts:73`, **sin ningún consumidor**

El síntoma visible es que `VisitaSheet.tsx:241` renderiza un botón de borrar para los rubros con
`!esPropuesto` — rubros agregados a mano que ninguna pantalla puede crear. Ese branch es código
muerto.

El eslabón que falta es el catálogo. El DTO exige `rubroCode` **y** `rubroDescripcion`, y el front
no tiene de dónde sacarlos: solo conoce la propuesta (ya recortada a caídas) y "Ver versus" (solo
lo que el cliente ya compró). El caso que importa — "este cliente nunca compró Amortiguadores, se
los quiero ofrecer" — no está en ninguna de las dos. Además `VisitasService.resolverPropuesta`
valida contra `RubroCatalogService.mapByCode()`, así que un código inventado se descarta del lado
del server.

El backend ya lo expone y dice para qué (`src/routes/sale.ts:138`, api-vendedores):

```
// Catálogo de rubros válidos — poblar selects (app-planificacion, etc.)
```

El segundo hueco es el campo **Marca** del detalle de motivo (`ResolucionRubro.tsx:87`), hoy texto
libre. El CLAUDE.md justifica persistir el motivo estructurado con que "sobre texto libre no se
puede hacer un `GROUP BY`". Pero la pregunta de negocio real de un motivo "Precio" no es cuántos
dijeron precio, es contra qué marca se está perdiendo — y ese campo es el único sin normalizar.
Con input libre la columna termina con `Fric Rot`, `fricrot` y `FRIC-ROT`. `GET /sale/brand/catalog`
ya devuelve las marcas con ventas en los últimos 12 meses, ordenadas y cacheadas en Redis.

## Alcance

Trabajo **100% de front**. El backend no cambia: `marca` es `VARCHAR(100)` libre en
`pl_visita_rubro_motivo` y `motivoValidation.validarMotivosDeRubro` no la valida contra catálogo.
La normalización la aporta la UI al restringir la elección.

## Qué cambia

```
src/types/planificacion.ts             ICatalogoItem
src/api/planificacion.ts               getRubroCatalog, getBrandCatalog
src/hooks/useCatalogos.ts              NUEVO  useRubroCatalog, useBrandCatalog
src/components/propuesta/CatalogoPicker.tsx     NUEVO
src/components/propuesta/AgregarRubroVista.tsx  NUEVO
src/components/propuesta/ResolucionRubro.tsx    Marca: input libre -> picker
src/components/propuesta/ResolucionWizard.tsx   pide el catálogo de marcas, lo baja como prop
src/components/VisitaSheet.tsx                  vista 'agregar' + botón
```

No cambia: el backend, `ResolucionWizardAcciones` (navegación y guardado en lote), `VersusTable`
(queda de solo lectura), `ResolucionSheet` (flujo de "No visité"), ni el contrato `IRubroMotivo`.

## Capa de datos

Los dos catálogos comparten forma, así que comparten tipo:

```ts
/** Entrada de catálogo para poblar selects. Rubros y marcas comparten forma. */
export interface ICatalogoItem {
    code: string
    description: string
}
```

`getRubroCatalog` → `GET /sale/rubro/catalog`, `getBrandCatalog` → `GET /sale/brand/catalog`. Los
dos devuelven `res.data.data`, ya ordenados por descripción desde el server. Van en la sección de
`planificacion.ts` que agrupa los endpoints reusados fuera del dominio, junto a `getPropuesta` y
`getRubroStatus`.

Tres decisiones en `useCatalogos.ts`:

- **`staleTime` de 30 min**, igual que `useMotivos`. Son catálogos: el de rubros cambia de mes a
  mes y el de marcas se recalcula sobre 12 meses de ventas. Del lado del server ya vienen cacheados
  en Redis con TTL de analytics; refetchear cada 5 minutos (el default de `queryClient`) es ruido.
- **Se piden bajo demanda**, con `enabled`: el de rubros cuando se abre el buscador, el de marcas
  cuando hay tildado un motivo con `requiereDetalle`. Mismo criterio que `useRubroStatus`
  (`VisitaSheet.tsx:63`). Son vendedores en la calle con datos móviles.
- **Sin `select` de transformación**, a diferencia de `usePropuesta`: la respuesta ya tiene la forma
  final.

**No usar `GET /clients/getRubros`.** Es otra lista (`clientService.getRubros`, un `SELECT DISTINCT`
sobre `staging.stg_rubros`), sin cache y con filtros propios. `/sale/rubro/catalog` es la misma que
el backend usa para validar la propuesta.

## Componentes

### `CatalogoPicker` — presentacional puro

No sabe qué catálogo muestra ni de dónde sale.

```ts
interface CatalogoPickerProps {
    items: ICatalogoItem[]
    loading?: boolean
    /** Codes que no se ofrecen (ej. rubros ya en la visita). */
    excluir?: string[]
    /** Descripción del ítem ya elegido, para marcarlo con un tilde. Se compara por
     *  `description` y no por `code` porque es lo que persiste la columna `marca`:
     *  de un valor viejo en texto libre no hay code que buscar. */
    value?: string | null
    /** Code del ítem cuya mutación está en vuelo: esa fila muestra spinner y el resto
     *  de la lista queda deshabilitada. */
    pendingCode?: string | null
    onSelect: (item: ICatalogoItem) => void
    placeholder: string
    autoFocus?: boolean
}
```

- **Búsqueda insensible a acentos y mayúsculas** (`normalize('NFD')` + strip de diacríticos), por
  substring sobre `description`. "bateria" tiene que encontrar "BATERÍAS": nadie tipea la tilde en
  un celular parado en un mostrador.
- **Tope de 50 resultados renderizados**, con un pie de "Seguí escribiendo para afinar" cuando hay
  más. El catálogo de marcas sale de 12 meses de `fct_sales` y puede traer varios cientos de filas;
  pintarlas todas en un sheet en un teléfono de gama baja se siente lento. Virtualizar está fuera
  de alcance.
- **`value` fuera de `items` se muestra igual como seleccionado.** Si una resolución vieja tiene
  `marca` en texto libre, o la marca dejó de vender y cayó de los 12 meses, perder en silencio un
  dato ya cargado sería peor que la inconsistencia que se está arreglando.

### Dos contenedores, no uno

El picker de rubros se monta como **vista del sheet** (igual que `vista === 'versus'`, con su flecha
de volver). El de marcas se monta **inline**, dentro del bloque de detalle de Precio, que ya es un
panel que se expande.

La razón de no usar la misma envoltura: el estado de vista vive en `VisitaSheet`, y el campo Marca
está dos niveles más abajo (`ResolucionWizard` → `ResolucionRubro`). Hacer que el detalle de un
motivo abra una vista del sheet obliga a subir ese estado por prop drilling y a recordar a qué
rubro y motivo volver.

### `AgregarRubroVista`

Header con volver + `CatalogoPicker` alimentado por `useRubroCatalog`. Se queda con su propia
mutación (`useAgregarRubro`) en vez de subirla a `VisitaSheet`, que ya está en 276 líneas y cinco
piezas de estado. Solo necesita `visitaId` y los codes a excluir.

### `ResolucionWizard` pide el catálogo de marcas

No `ResolucionRubro`. El wizard es el ancestro más cercano que ve a la vez `motivos` y el borrador
actual, así que puede activar la query (`enabled`) solo cuando hay tildado un motivo con
`requiereDetalle`, y deja a `ResolucionRubro` presentacional puro — como ya es hoy, sin
`QueryClientProvider` en su test.

## Flujo y bordes

**Duplicados.** El picker de rubros excluye los que ya están en la visita. No es cosmético:
`VisitaRubroRepository.crearFueraDePropuesta` hace un `INSERT` ciego, sin índice único. Dos
"Filtros" serían dos filas pendientes distintas, y ambas traban el cierre de la semana. El front es
el único que puede evitarlo.

**"Agregar rubro" no aparece con `visitaCerrada`.** El backend lo permitiría — `RubrosService.agregar`
solo exige que la visita sea del ciclo abierto, no que esté en curso. Pero esa pantalla existe para
*vaciar* pendientes, y agregar ahí crea uno nuevo. Ofrecer el botón sería invitar al vendedor a
trabarse la semana.

**Durante la mutación**, el ítem tocado queda en loading (`pendingCode`) y el resto de la lista se deshabilita — sin
doble tap accidental, que en un celular con 3G es el error más fácil de cometer. Si falla, el error
se muestra inline en la misma vista, con el mismo tono que ya usa el wizard ("Sin conexión. Volvé a
intentar; no se perdió lo que cargaste"), sin cerrar nada.

**Al agregar bien, vuelve a la lista** y el rubro queda pendiente. Sin toast: la `Notification` vive
en `AgendaSemanaPage` (`:305`) y bajarla hasta acá sería atravesar tres componentes para decir algo
que la fila nueva ya dice. La propuesta tiene pocos rubros, así que la fila entra en pantalla sola.

La invalidación ya está resuelta: `useMutacionDeRubros` (`useRubros.ts:27`) invalida
`rubroKeys.deVisita` y `agendaKeys.semana`, porque `rubrosPendientes` viaja en la card del cliente.

**Marca.** Al elegir, el panel se cierra y muestra la marca elegida; tocarlo de nuevo lo reabre con
el valor marcado. Se guarda la `description`, que es lo que espera la columna. **Competidor sigue
siendo texto libre**: es una marca de afuera, no está en `fct_sales`.

**Teclado.** `autoFocus` en el buscador en los dos casos, y el panel inline de marca hace
`scrollIntoView({ block: 'nearest' })` al abrirse — si no, el teclado lo tapa justo cuando aparece.

## Tests

Vitest + Testing Library, al lado de cada componente.

`CatalogoPicker.test.tsx` — es donde está la lógica real:

- filtra por substring ignorando acentos y mayúsculas ("bateria" encuentra "BATERÍAS")
- no ofrece los codes de `excluir`
- con más de 50 coincidencias muestra el tope y el pie de "seguí escribiendo"
- `onSelect` devuelve el ítem completo (`code` + `description`), no solo el texto
- `value` fuera de `items` se muestra igual como seleccionado
- con `pendingCode`, esa fila muestra spinner y las demás quedan deshabilitadas

`AgregarRubroVista.test.tsx`:

- excluye los rubros que ya están en la visita
- al elegir, llama al endpoint con `{ rubroCode, rubroDescripcion }` y vuelve a la lista
- si la mutación falla, muestra el error y no cierra la vista

`ResolucionRubro.test.tsx` (ampliar):

- el detalle de un motivo con `requiereDetalle` renderiza el picker de marca, no un input libre
- elegir una marca la escribe en `onChange` como `marca: description`
- Competidor sigue siendo texto libre

`VisitaSheet.test.tsx` (ampliar):

- el botón "Agregar rubro" no está cuando `visitaCerrada`

Los hooks de catálogo no llevan test propio: son `useQuery` sin transformación, y
`usePropuesta`/`useMotivos` tampoco lo tienen.

## Fuera de alcance

- Virtualización de la lista del picker.
- Marca fuera del catálogo ("otra, a mano"). Reintroduciría el texto libre que este spec viene a
  sacar, y sin una columna que distinga "del catálogo" de "a mano" el reporte no sabría cuál creer.
- Agregar rubros desde la tabla de "Ver versus" (el `＋` por fila). Versus queda de solo lectura.
- Agregar rubros a visitas ya cerradas.
