# Pestañas del vendedor: Planificación | Métricas

Fecha: 2026-09-28 · Estado: front implementado con datos mock; endpoint pendiente en api-vendedores.

## Qué

La app del vendedor pasa a tener dos secciones con una tab bar fija abajo:

- **Plani** (`/`, pestaña "Plani"): la agenda de siempre, sin cambios.
- **Métricas** (`/metricas`): sus números del mes. Solo los suyos, sin ranking ni equipo.

## Contenido de Métricas

Selector ‹ Mes ›. Arranca en el mes en curso, que corta en **hoy**: el MMAA se compara
sobre el mismo rango un año atrás. Permite retroceder 12 meses y no avanzar al futuro.

**Productividad** (tiles 2×2):

| Tile | Cálculo |
|---|---|
| Clientes visitados | `clientesVisitados / cartera` |
| Clientes con compra | `clientesConCompra / cartera` |
| Tasa de cierre | `visitadosConCompra / clientesVisitados`, sin objetivo |
| Ventas vs planificación | `planificadosConCompra / planificados` |

**Vs objetivo del mes** (3 tiles: "real / objetivo", % y "faltan N" o "cumplido"; se descartaron las barras de progreso): visitas válidas, clientes distintos y horas en visita,
contra `objetivoVisitas`, `objetivoClientes` y `objetivoMinutos` de `pl_objetivo`. Si no
hay objetivo, el tile dice "sin objetivo" y no inventa un denominador.

**Ventas** (tres anillos): facturación ($M), unidades y super rubro. Los tres miden
**contra el MMAA, no contra una meta**.

Decisiones:

- **Sin metas de venta.** Las de app-vendedores (150 $M / 500 u. / 12 SR) están escritas
  a mano en `lib/metricas/objetivos.ts`, sin ninguna tabla detrás. Mostrarle al vendedor
  "88% de tu meta" con una meta que nadie fijó es peor que no mostrarla. Cuando haya metas
  reales en `pl_*`, el anillo cambia de denominador.
- **Productividad no tiene "vs MMAA".** Hace un año las visitas no se guardaban en
  `pl_*`, así que no hay contra qué comparar. Se suma cuando haya un año de historia.
- **"Horas" es tiempo en visita** (inicio a cierre, sumado), no jornada laboral: la
  jornada no se mide.
- **Tasa de cierre sin objetivo**, porque el 60% de app-vendedores también está escrito
  a mano.

## Navegación: la agenda no se desmonta

`VisitaFlow` y el estado de la visita en curso (watch de GPS de `alejado`,
`visitaEnCurso`, veto de re-adopción) viven dentro de `AgendaSemanaPage`. Por eso:

- `/` y `/metricas` son hijas de un solo layout, `VendedorShell`. La agenda se **oculta**
  (`hidden`) y nunca se desmonta. Métricas se monta la primera vez que se entra y después
  también queda montada.
- `TabBarVendedor` es un item del flex, no `fixed`, y los sheets (z-50) la tapan.
- `VisitaEnCursoBar` se dibuja en un **portal a `<body>`**: así se sigue viendo en Métricas
  aunque la agenda esté oculta. Flota por encima de la tab bar leyendo `--alto-tabbar`,
  que publica el shell. Tocarla desde Métricas navega a `/` y abre la visita.

## API (pendiente): `GET /planificacion/mis-metricas?desde&hasta`

- Va en `routes/planificacion.ts`, con `authorizeVendedor`. El código del vendedor sale
  del token, **nunca de un parámetro**.
- Reutiliza `MetricasService.getResumen` con el scope armado a partir de ese único código,
  y devuelve la fila plana (`IMisMetricas`, en `src/types/misMetricas.ts`) más
  `diasHabiles`, `diasHabilesTranscurridos` y `mesCompleto`.
- No se abre `/analitica/*` al vendedor: ese contrato es de gerencia y trae `equipo` y
  ranking.
- **Vendedor de prueba (`PRUEBA-*`)**: no existe en el warehouse, así que no tiene cartera. Se devuelve todo en cero con `sinVentas: true`, sin tocar el warehouse, y el front explica por qué no hay métricas. Se descartó
  reconstruir la parte de `pl_*`: sin cartera no hay denominador para ningún tile.

## Flag y mock

`METRICAS_VENDEDOR_HABILITADAS` (`lib/flags.ts`) y la fuente mock dependen de la misma
variable, `VITE_MIS_METRICAS_MOCK=1`. Sin ella no hay tab bar y `/metricas` redirige a
`/`, así que producción no cambia. Cuando exista el endpoint: el flag pasa a `true`, se
borran la variable y el mock.

## Espacio vertical de Plani

Con la tab bar abajo, la lista de clientes quedaba en card y media. Cambios, **solo en el
header y en las pestañas de días** (el tablero y las cards no se tocan):

- Se sacó la barra "Visitas completadas X / Y": era un dato sin valor para el vendedor.
- Quedan **tres líneas finas**: (1) marca DS · lupa · avatar, (2) ‹ zona · rango ›
  (en preview, el chip "Vista previa" en lugar del rango), (3) `DiaTabs`. Se probó una
  sola fila con las flechas al lado del avatar y quedaba incómoda: la zona tiene su
  propia línea.
- `DiaTabs` va en una línea: "LUN 28" y un punto verde en HOY, **sin el 0/0** (lo dice la
  banda del día del tablero). El tablero, su banda del día y el "+" no se tocan.
