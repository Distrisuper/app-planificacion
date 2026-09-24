# Pestaña "Métricas" en gerencia: ventas, visitas, objeciones y cartera en una pantalla

Fecha: 2026-09-24
Estado: diseñado.
Referencia visual: mockup `Métricas – Main (1).html`, que gerencia armó con datos de ejemplo. De ahí se toma
**qué** se muestra y **dónde**. **No** se toman los estilos: la pantalla usa el sistema visual de `/analitica`.

## 1. Qué problema resuelve

Hoy `/analitica` responde "¿el vendedor está visitando?": cobertura, visitas válidas, horas y
objeciones por motivo. Gerencia no tiene una pantalla que ponga eso **al lado de lo que se vendió**.
Por ejemplo: cuánto facturó el equipo contra el objetivo, cuántos de los clientes visitados compraron,
cómo se reparte la cartera por facturación, y detrás de cada objeción qué clientes hay y en qué
rubros y marcas.

La pestaña **"Métricas"** se agrega a `/analitica`, junto a *Analítica de visitas*, *Actividad*,
*Ruta* y *Datos del comercio*. No reemplaza nada: cuando esté completa, gerencia decide si absorbe
a "Analítica de visitas".

## 2. Qué muestra

### Encabezado y filtros

- **Vendedor** (Equipo completo | uno), **Sucursal**, **Zona** y **Localidad**, cada uno con "Todas".
- **Período**: Semana / Mes / Rango de fechas. Se reusa `SelectorPeriodo` y se le suma el modo rango.
- **"Ver proyectado"**: aparece solo en modo Mes y con el mes en curso (ver §3).
- Al cambiar un filtro geográfico, el vendedor vuelve a "Equipo completo" y se cierran los
  detalles abiertos. Es el mismo comportamiento del mockup.
- Las opciones de Zona y Localidad salen de los clientes del scope y se encadenan: con una
  zona elegida, Localidad lista solo las de esa zona.

### Métricas de ventas

| Elemento | Muestra |
|---|---|
| Facturación · Unidades · Super Rubro | real / objetivo, % de cumplimiento, badge **±N% vs MMAA** |
| Cantidad de visitas · Clientes visitados · Tasa de cierre · Horas totales | objetivo, real, % de cumplimiento |
| Rentabilidad de cartera | margen % |

- **Rentabilidad** con Semana o Rango de fechas se muestra **s/d**: el warehouse calcula el margen
  solo sobre meses completos (`queryDaily` no trae costo). No se inventa un margen parcial.
- **MMAA** es el mismo período del año anterior (mismo mes, o el mismo rango corrido un año).

### Métricas de objeciones

- **Una tarjeta por motivo**, con cantidad y porcentaje, ordenadas de mayor a menor.
- **Selector de rubro** ("Todos los rubros" | uno), para ver las objeciones de un solo rubro.
- **Tasa de objeciones**: total de objeciones / planificaciones.
- **Detalle al tocar una tarjeta**:
  - las 5 marcas que más se repiten entre los clientes con esa objeción;
  - los 5 rubros que más se repiten;
  - la tabla de clientes (Cliente, Dirección, Teléfono, Localidad, Vendedor), paginada de a 8 y
    ordenable por columna.

### Clientes por categoría

- **Cinco tramos** según la facturación del cliente en el mes: sin compras, < $1M, $1-3M, $3-5M
  y > $5M.
- **"N subieron / N bajaron de categoría"**: compara el tramo de cada cliente contra el que tenía
  el mes anterior.
- **Al tocar un tramo** se abre el listado de clientes: facturación actual, promedio de los 6
  meses cerrados anteriores y variación %. Va paginado de a 8 y se ordena por columna.
- **Con Semana o Rango de fechas**, el bloque usa el mes de la fecha "hasta" y lo dice en el
  subtítulo ("Septiembre 2026"). Los cortes en millones no significan nada sobre una semana suelta.

### Ranking por vendedor

- **Filas:** primero "Total equipo" y después una fila por vendedor.
- **Columnas:** Clientes totales · Clientes visitados · Clientes con compra · Tasa de cierre ·
  Horas vs objetivo · Ventas vs Planner. Cada celda lleva el valor y el porcentaje correspondiente.
- **Orden:** tocar el encabezado de una columna ordena de mejor a peor, y tocarlo de nuevo invierte
  el orden.
- **Selección:** tocar una fila elige ese vendedor en el filtro de arriba.

### Qué se deja afuera del mockup

- El ítem "Simulador" del navbar.
- Las leyendas "datos de ejemplo" y "datos reales TACO".
- La paleta propia del mockup: fondos de color por bloque, headers navy, donuts de colores y el
  semáforo azul/rojo/verde.

## 3. Definiciones

Estas definiciones son el contrato de la pantalla. Cualquier cambio en una de ellas se hace acá primero.

| Métrica | Definición | Fuente |
|---|---|---|
| **Conjunto de clientes** | Clientes principales (`is_secondary_account = false`) con `vendor_code` en los vendedores del filtro, recortados por zona (`zone_code`), localidad (`city`) y sucursal dominante | `fct_clients` |
| **Sucursal del cliente** | La `branch` que más le facturó en los 12 meses cerrados anteriores. Sin compras en ese lapso = sin sucursal (solo entra con "Todas") | `fct_sales` |
| **Clientes totales (cartera)** | Tamaño del conjunto de clientes. **No** son las filas del plan: el mockup los muestra distintos (145 vs 92) | `fct_clients` |
| **Facturación** | Suma de la expresión de monto de `warehouseExpressions` en el período, sobre el conjunto de clientes. Con sucursal elegida, además `branch = :sucursal` | `fct_sales` |
| **Unidades** | Suma de la expresión de unidades (`is_valid_for_units`) | `fct_sales` |
| **Super Rubro** | El **SR de la empresa**: pares cliente×rubro×mes que llegan a `rubro_min_units`. Es la misma métrica que Versus y `/report/kpi/sr`. **No** es la cantidad de rubros distintos | `getRubroMonthlyAchievements` |
| **Rentabilidad** | `1 − pp_cost_total / pp_sale_total` sobre líneas `is_valid_for_profitability`. Solo en meses completos | `fct_sales` / `fct_client_rubro_month` |
| **Clientes con compra** | Clientes del conjunto con facturación neta > 0 en el período | `fct_sales` |
| **Cantidad de visitas** | Visitas válidas del período (misma regla que `/analitica/resumen`) | `pl_resolucion` |
| **Clientes visitados** | Clientes distintos con al menos una visita en el período | `pl_resolucion` |
| **Horas totales** | Minutos de visita del período / 60 | `pl_resolucion` |
| **Tasa de cierre** | Clientes visitados que **además** compraron, sobre clientes visitados. Exigir la visita en el numerador es a propósito: si no, la tasa cuenta compras que no tienen nada que ver con la visita | cruce |
| **Planificaciones** | Filas del plan de los ciclos que solapan el período (el `planificados` de `/resumen`) | `pl_rotacion_cliente` |
| **Ventas vs Planner** | Planificados que compraron / planificados | cruce |
| **Objeción** | `pl_ofrecimiento_motivo` con `m.nivel = 'ofrecimiento'`: el mismo universo que cuenta hoy `/analitica/objeciones` (`AnaliticaRepository`), sin redefinirlo | `pl_*` |
| **Tasa de objeciones** | Objeciones / planificaciones | `pl_*` |
| **Tramo del cliente** | Facturación del cliente en el mes: 0 (o negativa) → sin compras; < 1M; [1M, 3M); [3M, 5M); ≥ 5M. Sale de `fct_sales` y no de `fct_client_rubro_month`, porque esa tabla no tiene `branch` y no respetaría el filtro de sucursal | `fct_sales` |

**Objetivos.** Los de visitas, clientes y horas siguen saliendo de `pl_objetivo`, igual que en
`/resumen`, prorrateados por días hábiles. Los **objetivos de venta no existen en ninguna tabla** y
por ahora son **constantes del front**, en `src/lib/metricas.ts`, definidas por vendedor y por mes:

```ts
export const OBJETIVOS_VENTA_POR_VENDEDOR = {
    facturacionM: 150, // $ millones
    unidades: 500,
    superRubro: 12,
} as const
export const OBJETIVO_TASA_CIERRE_PCT = 60
```

- **Objetivo del equipo:** el valor por vendedor × la cantidad de vendedores con datos en el filtro.
- **Semana o rango:** se prorratea por días hábiles, con el mismo criterio que `pl_objetivo`.
- **El 12 de Super Rubro viene del mockup y no es realista para el SR de la empresa**, donde un
  vendedor suele tener decenas o cientos. Hay que ajustarlo cuando se vean los números reales, y
  si se necesita se muevan a `pl_objetivo`.

**Proyectado.** Multiplica los acumulados (ventas, visitas, horas y clientes) por
`días hábiles del mes / días hábiles transcurridos`. Los conteos de clientes se topean en la cartera.
Es un cálculo del front sobre la respuesta y no pide nada nuevo.

**Vendedor de prueba.** `PRUEBA-*` no existe en el warehouse, así que nunca entra al ranking ni a
los totales. El filtro se hace con `fragmentoVendedores`/`esVendedorDePrueba`, como el resto de la
analítica.

## 4. Arquitectura

### Backend (api-vendedores)

Todos los endpoints nuevos cuelgan de `src/routes/analitica.ts`, con el mismo guard (roles que
supervisan) y el mismo scope que `/resumen`. Comparten el contrato de filtros
`desde, hasta, vendedor?, sucursal?, zona?, localidad?`.

| Endpoint | Devuelve |
|---|---|
| `GET /planificacion/analitica/metricas/resumen` | Ventas (con MMAA), tiles de visita, rentabilidad y ranking por vendedor con fila de equipo |
| `GET /planificacion/analitica/metricas/objeciones?rubro=` | Motivos con cantidad y %, total y tasa |
| `GET /planificacion/analitica/metricas/objeciones/:motivoId?rubro=&pagina=&orden=` | Mix de marcas y de rubros (top 5) y clientes paginados |
| `GET /planificacion/analitica/metricas/categorias` | Conteo por tramo, subieron y bajaron, y el mes usado |
| `GET /planificacion/analitica/metricas/categorias/:tramo/clientes?pagina=&orden=` | Clientes del tramo (actual, promedio 6M, variación) paginados |
| `GET /planificacion/analitica/metricas/opciones` | Sucursales, zonas (con descripción de `fct_zones`) y localidades del scope, para los selects |

**Por qué varios endpoints y no uno.**
- **Latencia:** ventas y categorías son las consultas más pesadas del warehouse. En un endpoint
  único, las métricas de visita esperarían a esas.
- **Recálculo:** cambiar el rubro de objeciones recalcularía facturación y categorías, que no
  dependen de él.
- **Fallos:** un fallo del warehouse tiraría toda la pantalla, o necesitaría un parche como
  `ventas: null`.
- **Patrón:** es el que ya tiene `/analitica`, con `/resumen` y `/objeciones` separados.

**Lo compartido vive en el service.**
- **`ConjuntoClientesResolver`:** convierte filtros + scope en
  `{ codigoCliente, vendorCode, sucursal, zona, localidad }[]`. Guarda el resultado en la caché
  existente (`src/services/cache`), con clave por filtro y TTL corto (5 min). Como los endpoints se
  piden en paralelo, no resuelven tres veces lo mismo.
- **`MetricasService`:** arma cada bloque. Lo de visitas sale de `pl_*`, filtrando por los códigos
  del conjunto y reusando consultas de `AnaliticaRepository`. Lo de ventas sale del warehouse,
  reusando `warehouseExpressions` y `SalesRepository`, con `vendor_code`/`account_code` del conjunto.
- **El cruce MySQL ↔ warehouse se hace en memoria, en el service,** por código de cliente
  normalizado (misma comparación case-insensitive que `AnaliticaService`). Las dos bases no
  pueden hacer un JOIN entre sí.

**Arreglo de paso.** Hoy el filtro por rubro de `/analitica/objeciones` compara `vi.codigo = :rubro`
sin exigir `vi.tipo = 'rubro'`, así que una marca con el mismo código cuenta como si fuera ese
rubro. Se corrige en la consulta compartida.

### Front (app-planificacion)

- **Ruta:** `/analitica/metricas` en `App.tsx`, dentro del mismo grupo protegido que el resto de
  `/analitica`, y la pestaña "Métricas" en `AnaliticaTabs`.
- **Página:** `src/pages/AnaliticaMetricasPage.tsx`. Es dueña del estado de filtros y período y se
  lo pasa a cada bloque.
- **Componentes** en `src/components/metricas/`: `FiltrosMetricas`, `BloqueVentas`,
  `BloqueObjeciones` (+ `DetalleObjecion`), `BloqueCategorias` (+ `ClientesDeTramo`) y
  `RankingVendedores`.
- **Datos:** `src/api/metricas.ts` y `src/hooks/useMetricas.ts`, con un hook por endpoint y claves
  de query que incluyen todos los filtros. Los detalles usan `enabled` y solo se piden al tocar
  una tarjeta o un tramo.
- **Modo mock:** se respeta `VITE_ANALITICA_MOCK=1`, como en `src/api/analitica.ts`, con fixtures
  en `src/mocks/metricasMock.ts`.
- **Estilos del sistema:**
  - tarjetas de bloque `rounded-lg border border-slate-200 bg-white p-4`, como
    `EfectividadOperativaSection`;
  - tiles con `KpiTile`;
  - tablas con el formato de `TablaEfectividadOperativa`;
  - el cumplimiento usa el semáforo que ya tiene la analítica, sin paleta propia.
- **Los tres indicadores de venta** son tiles con barra de progreso, no donuts. Si al implementar
  hace falta un gráfico, se consulta el skill `dataviz` y se usa la paleta del sistema.
- **Formatos:** `analiticaFormat.ts` (`formatNumero`, `formatHoras`, s/d para null). Los montos en
  $M llevan un decimal.

## 5. Errores y estados

- **Cada bloque tiene su spinner y su error**, con "Volver a intentar". Si falla un bloque, los
  demás se siguen viendo.
- **Sin denominador, el porcentaje es s/d y nunca 0%.** Pasa, por ejemplo, con un vendedor sin
  visitas y su tasa de cierre, o con un equipo sin planificaciones y su Ventas vs Planner.
- **Filtros sin resultados:** si el conjunto de clientes queda vacío, cada bloque dice
  "Sin clientes para estos filtros". No se muestran ceros que parezcan datos.
- **Rentabilidad fuera de modo Mes:** s/d, con una ayuda (`HelpPopover`) que explica por qué.
- **Warehouse caído:** los bloques de ventas y categorías fallan solos. Objeciones sigue
  funcionando. Las tiles de visita del resumen también necesitan el conjunto de clientes, así que
  el resumen entero falla, y se acepta: sin el warehouse no se sabe qué clientes entran en el
  filtro.

## 6. Tests

**Backend (Jest):**
- **`ConjuntoClientesResolver`:** cada filtro por separado y combinados, la sucursal dominante
  (incluido el empate y el cliente sin compras) y la exclusión de `PRUEBA-*`.
- **`MetricasService`:** cada métrica de §3 sobre fixtures chicos. Tasa de cierre exige la visita,
  Ventas vs Planner sale sobre planificados y los tramos incluyen el borde exacto de $1M, $3M y $5M.
  También subieron/bajaron, la rentabilidad s/d fuera de mes y el MMAA.
- **Objeciones:** el arreglo de `tipo = 'rubro'` y el top 5 de marcas y de rubros.

**Front (Vitest):**
- **`metricas.ts`:** proyección (incluido el tope en la cartera), cumplimiento y objetivos × cantidad
  de vendedores y prorrateados.
- **Cada bloque:** carga, error, vacío, s/d, orden y paginado, y la apertura y cierre del detalle.
- **Filtros:** el encadenamiento zona → localidad y que un filtro geográfico resetee al vendedor.
- **Ruta:** `ProtectedRoute` deja entrar a gerencia a `/analitica/metricas` y rebota al vendedor
  y al tester.

## 7. Fuera de alcance

- **Objetivos de venta editables o por vendedor:** quedan como constantes. Se mueven a
  `pl_objetivo` el día que se necesiten.
- **Asignar sucursal a los vendedores:** la sucursal es de la factura y el filtro recorta clientes,
  no vendedores.
- **El "Simulador" del mockup.**
- **Reemplazar "Analítica de visitas":** lo decide gerencia cuando la pestaña esté completa.
