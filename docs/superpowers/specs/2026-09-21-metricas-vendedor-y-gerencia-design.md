# Métricas del vendedor y de gerencia — diseño

**Fecha:** 2026-09-21
**Estado:** aprobado en conversación, pendiente de plan de implementación
**Repos afectados:** app-planificacion (front), api-vendedores (endpoint, `pl_objetivo`)

## Resumen

El vendedor pasa a tener dos secciones en la app: **Agenda** (lo que existe hoy) y **Mi cartera**
(métricas de su gestión y de su cartera, por mes). Gerencia recibe la misma pantalla como una
pestaña nueva de `/analitica`, con chips para elegir vendedor o el equipo completo.

La decisión central de diseño no es qué KPIs se muestran, sino **cómo se cambian**: gerencia va a
pedir métricas distintas y va a ir ajustándolas sobre la marcha. Por eso la pantalla es un render
genérico de un **catálogo de KPIs** declarado en un solo archivo del front, alimentado por **un
endpoint ancho** que devuelve todas las métricas del sujeto. Cambiar, sacar o reordenar un KPI
es tocar una entrada del catálogo; agregar uno con dato nuevo es un campo más en el endpoint y
una entrada más.

## Origen y qué se tomó del ejemplo

El pedido llegó con un dashboard de referencia ("Métricas VG", artefacto de gerencia con chips
por vendedor, ranking y promedio de equipo). De ahí se toman los KPIs, no el estilo ni la
estructura. Cruzados contra lo que ya expone api-vendedores:

| KPI del ejemplo | Decisión | Fuente |
|---|---|---|
| Visitas, clientes distintos, horas vs objetivo | entra | `AnaliticaService` + `pl_objetivo` |
| Clientes visitados / cartera (cobertura) | entra | `AnaliticaService` |
| Objeciones por motivo | entra, sin filtro por rubro en v1 | `AnaliticaService.getObjeciones` |
| Tasa de objeciones (objeciones / planificaciones) | no entra en v1 | derivable después |
| Facturación, unidades, super rubro vs objetivo | entra, objetivo **hardcodeado** | warehouse (`fct_sales`, `fct_client_rubro_month`) + `pl_objetivo` |
| Clientes con compra, tasa de cierre, ventas vs planner | se reemplazan por **efectividad comercial** (pedidos sobre ofrecidos) | `AnaliticaService` |
| Clientes por categoría de facturación (<1M, 1-3M…) | se reemplaza por **clientes por estado** (Activo / Pasivo / Inactivo / crítico) | `ClientStatusService` |
| Listado por categoría con actual vs prom. 6 meses | entra, dentro del sheet de cada estado | warehouse |
| Subieron / bajaron de categoría | se reemplaza por **clientes en caída** | `/sale/declines` |
| Ranking por vendedor, promedio equipo | **no entra** (fuera de alcance en CLAUDE.md) | — |

Razones de los reemplazos:

- **Clientes con compra / tasa de cierre.** No hay vínculo entre `pl_resolucion` y `fct_sales`.
  Lo que sí tenemos es lo que el vendedor declara en la visita: ofrecimientos con "Saqué pedido"
  sobre ofrecidos. Mide la gestión comercial en la visita, no la facturación posterior. Es
  honesto decirlo así en la ayuda del tile.
- **Categorías en pesos → estado.** Los cortes en pesos del ejemplo salieron de una planilla con
  toda la cartera de la empresa (7.035 clientes). Para un vendedor con ~150 clientes, cinco
  categorías dejan grupos de 5 o 10, poco para leer una distribución. El estado
  Activo / Pasivo / Inactivo ya está calculado por vendedor, es el vocabulario que el vendedor
  ve en Versus, y responde la pregunta accionable: "cuáles dejaron de comprar". La facturación por
  cliente (actual vs promedio 6 meses) se conserva como columna del listado.
- **Objetivos de venta.** No existen en ningún lado. Se hardcodean como fila global de
  `pl_objetivo` (ver más abajo). El día que haya objetivos reales por vendedor, son filas
  nuevas, sin código.

### Cambio de alcance declarado

CLAUDE.md lista "cumplimiento de objetivo / ranking de vendedores" como fuera de alcance para
el vendedor. Este spec **mete en alcance el cumplimiento de objetivo del propio vendedor**
(sus visitas, clientes, horas y ventas contra el objetivo del mes). El ranking sigue afuera.
Al implementar, actualizar la sección "Fuera de alcance" de CLAUDE.md.

## Navegación y estructura

### Vendedor

- Barra inferior fija con dos tabs, `Agenda` y `Mi cartera`, solo en el grupo de rutas del
  vendedor (`puedeOperarComoVendedor`). Rutas `/` y `/cartera`.
- `AppHeader` queda en Agenda tal cual. Mi cartera tiene un header propio: marca, nombre y
  `AccountMenu`, sin navegador de zonas ni barra de progreso (son de la agenda).
- `VisitaEnCursoBar` se apoya **encima** de la barra de tabs, en los dos tabs. Tocarla desde
  Mi cartera navega a Agenda con el sheet de la visita abierto, igual que hoy.
- El tab elegido y el período **no se persisten**: al entrar siempre es Agenda, y al abrir Mi
  cartera siempre es "Este mes".
- El vendedor de prueba (`PRUEBA-*`) ve el tab con sus datos de `pl_*` y el bloque de ventas
  en "sin datos" (no existe en el warehouse). Nunca un error.

### Pantalla Mi cartera

De arriba hacia abajo:

1. Header propio.
2. Selector de período: dos chips, `Este mes` y `Mes anterior`. Mes calendario, no la vuelta:
   los objetivos son mensuales y es lo que mide gerencia.
3. Secciones en scroll. Título en mayúsculas chicas (misma gramática que las bandas de la tabla
   de la visita) y una grilla de 2 columnas de tiles. Las listas ocupan las 2 columnas.
4. Pie con "Datos actualizados: <fecha y hora>" desde `actualizadoEn`, porque las ventas del
   warehouse no son en tiempo real.

### Gerencia

- Pestaña nueva `Métricas` en `AnaliticaTabs`, ruta `/analitica/metricas`. Las tres pestañas
  actuales no se tocan.
- Arriba, chips: `Equipo` y uno por vendedor del scope (roster de `getVendedores`).
- Debajo, el mismo selector de período y las mismas secciones. Grilla de 4 columnas en
  desktop, 2 en mobile.
- Con `Equipo`, los valores son la **suma** del scope y los porcentajes se recalculan sobre esa
  suma (no promedio de porcentajes).
- Los títulos de sección cambian el sujeto: "Mi mes" → "<Nombre> · mes" / "Equipo · mes".
- Ranking no entra.

## Backend: un endpoint ancho

`GET /planificacion/metricas?mes=YYYY-MM&vendedor=<código|equipo>`

- Sin `vendedor`: el sujeto es el vendedor del token, o su vendedor de prueba si está probando
  (misma resolución que `ciclo/actual`).
- Con `vendedor`: exige `superviseVendedores` y que el código caiga en `salesScope`. Fuera de
  scope → 403. `vendedor=equipo` agrega todo el scope.
- `mes` se valida `YYYY-MM`, no puede ser futuro. "Este mes" va hasta hoy.
- Tres fuentes, compuestas en un `MetricasService` nuevo:
  1. **`AnaliticaService`** para `pl_*`: visitas válidas, clientes distintos, minutos,
     cobertura, ofrecimientos totales/ganados/diferidos/perdidos, efectividad comercial,
     objeciones top (misma lógica que `/analitica/resumen` y `/analitica/objeciones`, mes
     calendario, un solo vendedor o el scope).
  2. **`pl_objetivo`**: fila del vendedor si existe, si no la global (resolución que ya
     existe). Se agregan tres columnas: `facturacion_mes` (pesos), `unidades_mes`,
     `super_rubros_mes`, `NOT NULL DEFAULT 0`, sembradas en la fila global con valores fijos
     que gerencia tiene que pasar antes de la etapa 1 (hoy no existen en ningún lado). Si no
     llegan, se siembran en `0`. `0` = sin objetivo → el tile muestra "s/d".
  3. **Warehouse, solo lectura, sin cambios de esquema**: facturación y unidades del mes y del
     mes anterior (`fct_sales`, misma fórmula de precio que `ClientStatusService`), cantidad de
     super rubros activos del mes (`fct_client_rubro_month`), clientes por estado
     (`ClientStatusService`), clientes en caída (misma consulta que `/sale/declines`).
     Para el vendedor de prueba, esta fuente **no se consulta** y el bloque viene `null`.
- **Fallo parcial**: si el warehouse falla y `pl_*` responde, el bloque de ventas viene `null`
  y `fuentes.ventas = 'no_disponible'`. Un fallo parcial nunca tumba la respuesta. Si `pl_*`
  falla, es 5xx.
- `actualizadoEn`: instante ISO UTC del dato más viejo entre las fuentes consultadas.

### Forma de la respuesta

Objeto plano por sujeto. Cada métrica trae lo que su forma de tile necesita:

```ts
interface IMetricas {
    mes: string                       // YYYY-MM
    sujeto: { tipo: 'vendedor' | 'equipo'; codigo: string | null; nombre: string }
    actualizadoEn: string
    fuentes: { ventas: 'ok' | 'no_disponible' | 'no_aplica' }

    // Gestión (pl_*)
    visitas:            { actual: number; objetivo: number | null; anterior: number | null }
    clientesVisitados:  { actual: number; objetivo: number | null; anterior: number | null }
    minutos:            { actual: number; objetivo: number | null; anterior: number | null }
    efectividadOperativa: { actual: number | null; anterior: number | null }   // 0..1
    cobertura:          { actual: number | null; anterior: number | null }     // 0..1
    efectividadComercial: {
        actual: number | null; anterior: number | null                          // 0..1
        ofrecidos: number; ganados: number; diferidos: number; perdidos: number
    }
    objeciones: { total: number; top: { etiqueta: string; valor: number }[] }  // ordenado desc, ≤5

    // Cartera (warehouse). null entero si fuentes.ventas !== 'ok'
    ventas: null | {
        facturacion: { actual: number; objetivo: number | null; anterior: number | null } // pesos
        unidades:    { actual: number; objetivo: number | null; anterior: number | null }
        superRubros: { actual: number; objetivo: number | null; anterior: number | null }
        clientesPorEstado: { etiqueta: 'Activo' | 'Pasivo' | 'Inactivo' | 'Crítico'; valor: number }[]
        clientesEnCaida:   { etiqueta: string; valor: number }[]   // etiqueta = nombre, valor = % caída, ≤5
    }
}
```

El detalle de una lista (los clientes de un estado, o la lista completa en caída) se pide aparte,
solo al tocar: `GET /planificacion/metricas/clientes?mes=&vendedor=&estado=<Activo|…|caida>`,
que devuelve `{ codigoParticularCliente, nombre, actual, promedio6m, variacion }[]`. Es el listado
que el ejemplo despliega al tocar una categoría. Reusa `ClientStatusService.getClientStatusClients`
y `client-context`; sin paginación en v1 (una cartera son ~150 clientes).

### Capacidad nueva

`veSusMetricas: boolean` en `ICapacidades` (`GET /planificacion/me`), verdadera para quien
`operaComoVendedor` o `operaComoVendedorDePrueba`. El tab `Mi cartera` se muestra solo con
esa capacidad. Gerencia entra por `superviseVendedores`, que ya existe. No hay `if (rol ===)`
en el front (regla de `src/lib/roles.ts`).

## Front

### Datos

- `src/api/metricas.ts`: `getMetricas({ mes, vendedor? })` y `getMetricasClientes(...)`, con
  mock detrás de `VITE_METRICAS_MOCK=1` (`src/mocks/metricasMock.ts`), mismo patrón que
  analítica.
- `src/hooks/useMetricas.ts`: React Query, key `['metricas', mes, vendedor ?? 'yo']`,
  `staleTime` 5 min. La key entra en lo que vacía `cerrarSesionLocal` (ya vacía toda la caché;
  no hace falta nada más, pero se documenta).
- `src/types/metricas.ts`: `IMetricas` y `IMetricaCliente`.

### Catálogo

`src/lib/metricas/catalogo.ts`. Una lista de secciones; cada sección tiene `id`, `titulo`
(función del sujeto: "Mi mes" / "<Nombre> · mes") y `tiles`. Un tile declara:

```ts
type FormaTile = 'objetivo' | 'comparacion' | 'lista'
type Formato = 'numero' | 'porcentaje' | 'horas' | 'pesosMillones' | 'unidades'

interface TileObjetivo    { forma: 'objetivo';    leer: (m: IMetricas) => { actual: number; objetivo: number | null } | null }
interface TileComparacion { forma: 'comparacion'; leer: (m: IMetricas) => { actual: number; anterior: number | null } | null }
interface TileLista       { forma: 'lista';       leer: (m: IMetricas) => { etiqueta: string; valor: number }[] | null
                            detalle?: (fila) => { estado: string } }   // presente = tocable, abre sheet

type Tile = { id: string; titulo: string; ayuda: string; formato: Formato; soloVendedor?: boolean } & (TileObjetivo | TileComparacion | TileLista)
```

`leer` devuelve `null` cuando la métrica no está (bloque `ventas` en `null`): el tile pinta
"sin datos" con el título visible. La pantalla recorre el catálogo y renderiza; **no hay JSX
por KPI**.

### Catálogo inicial

| Sección | Tile | Forma | Formato | Ayuda (resumen) |
|---|---|---|---|---|
| Mi mes | Visitas | objetivo | numero | visitas válidas del mes vs objetivo |
| Mi mes | Clientes visitados | objetivo | numero | clientes distintos visitados vs objetivo |
| Mi mes | Horas | objetivo | horas | minutos en visita vs objetivo |
| Mi mes | Efectividad | comparacion | porcentaje | promedio de los tres cumplimientos, topeados a 100% |
| Mis visitas | Cobertura de la ruta | comparacion | porcentaje | visitados sobre clientes planificados |
| Mis visitas | Pedidos sobre ofrecidos | comparacion | porcentaje | rubros con "Saqué pedido" sobre rubros ofrecidos |
| Mis visitas | Objeciones más frecuentes | lista | numero | motivos declarados al cerrar, top 5 |
| Mi cartera | Facturación | objetivo | pesosMillones | ventas del mes vs objetivo |
| Mi cartera | Unidades | objetivo | unidades | unidades del mes vs objetivo |
| Mi cartera | Super rubros | objetivo | numero | super rubros con venta en el mes vs objetivo |
| Mi cartera | Clientes por estado | lista, con detalle | numero | Activo / Pasivo / Inactivo / Crítico según Versus |
| Mi cartera | Clientes en caída | lista, con detalle | porcentaje | mayor caída vs promedio 6 meses |

Vocabulario del vendedor en todo el tab: "clientes de tu ruta", nunca "planificaciones",
"ciclo", "rotación" ni "semana N".

### Las tres formas de tile

- **Objetivo.** Título, número grande, barra de progreso y "82 de 100 hs". Semáforo de
  `/analitica` (rojo / ámbar / verde por tramo). `objetivo` null o 0 → "s/d", sin barra.
- **Comparación.** Título, número grande y "▲ 12% vs. agosto" (nombre del mes anterior).
  `anterior` null → sin línea.
- **Lista.** Ancho completo. Hasta 5 filas etiqueta + valor con barra proporcional al máximo.
  Con `detalle`, cada fila es tocable y abre un `BottomSheet` con la lista completa de clientes
  (nombre, actual, promedio 6 m, variación), pedida con `getMetricasClientes` al abrir.

Cada tile tiene un ícono de ayuda que abre un popover con `ayuda` (reusa `HelpPopover` de
analítica).

### Estados

- **Por tile**, no por pantalla: cargando → esqueletos con la forma del tile; `null` → "sin
  datos"; `fuentes.ventas === 'no_disponible'` → "sin datos por ahora" en los tiles de cartera.
- Fallo del endpoint entero: un aviso arriba con "Volver a intentar" (patrón de
  `fallóPropuestaDirecta`). Los tiles quedan en esqueleto.
- Mes sin ciclo ni ventas: todo "sin datos", sin aviso. Es normal para el mes de arranque.
- Gerencia con vendedor fuera de scope (URL a mano): 403 → "No tenés acceso a ese vendedor".

## Tests

- **api-vendedores**: `MetricasService` con un test por fuente; fallo parcial del warehouse;
  vendedor de prueba con `ventas: null` y `fuentes.ventas: 'no_aplica'`; `equipo` recalculando
  porcentajes sobre sumas; 403 fuera de scope; `mes` futuro → 400; resolución de `pl_objetivo`
  con las columnas nuevas (fila vendedor > fila global; 0 → null).
- **app-planificacion**: render del catálogo con un `IMetricas` fijo (cada forma pinta lo suyo,
  `null` → "sin datos", orden = orden del catálogo); barra de tabs en las dos pantallas con
  `VisitaEnCursoBar` encima y navegación al tocarla; sheet de detalle de una lista; pestaña de
  gerencia con chips y cambio de sujeto en los títulos.
- Fixture `metricasMock.ts` para iterar el diseño sin backend.

## Etapas

1. **Backend** (api-vendedores): columnas + semilla en `pl_objetivo`, `MetricasService`, los
   dos endpoints, capacidad `veSusMetricas`. Entregable solo.
2. **Vendedor** (app-planificacion): barra de tabs, pantalla Mi cartera, catálogo, las tres
   formas, estados, mock. Con `VisitaEnCursoBar` resuelta. Se puede hacer en paralelo con 1
   sobre el mock.
3. **Gerencia**: pestaña `Métricas` con chips y `Equipo`, reusando todo lo de 2.
4. **Detalles**: sheets de clientes por estado y en caída (`/metricas/clientes`).

## Fuera de este spec

Ranking y promedio de equipo, filtro de objeciones por rubro, tasa de objeciones, persistencia
del período elegido, catálogo servido por el backend (opción B descartada: más infraestructura
para una ventaja que hoy nadie pide, y un KPI nuevo igual necesita código en el backend),
categorías de clientes por facturación en pesos.
