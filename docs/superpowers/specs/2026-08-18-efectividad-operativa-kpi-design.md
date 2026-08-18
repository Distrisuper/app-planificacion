# Efectividad operativa — KPIs mensuales de actividad

**Fecha:** 2026-08-18

## Contexto

El dashboard viejo de vendedores (`app-mobiliza`, backend `api-mobiliza`, endpoint `GET /sellerStats`)
mostraba una tabla por vendedor con columnas de actividad: "Efectividad Proyectada", "Visitas
Completas", "Hrs. Totales", "Visitas No Val.", "Clientes", etc. Ese sistema se está deprecando junto
con `api-mobiliza`, y gerencia necesita el mismo tipo de información en `/analitica` de
`app-planificacion`.

**Se leyó el código real de `api-mobiliza`** (`Mobiliza.server.js`, función `getStatsVendedores`,
líneas ~311-527) para no reinventar la fórmula a ciegas. Hallazgos relevantes:

- `efectividad = porcentajeEfectividadClientes * 0.5 + porcentajeEfectividadMinutos * 0.5` — 50/50
  entre clientes distintos y minutos trabajados, contra metas mensuales **hardcodeadas**:
  `OBJETIVO_CLIENTES_DISTINTOS = 160`, `OBJETIVO_MINUTOS_TOTALES = 6000` (100 hs), iguales para todos
  los vendedores. No hay tabla de configuración: son constantes en el código del backend.
- "Visita no válida" en ese sistema es **solo por GPS** (fuera de 300 m del cliente, con excepciones
  hardcodeadas por cliente y por fecha de corte). El filtro por duración mínima (los 20 minutos que se
  suponía existían) es **código muerto**: la variable existe pero nunca se incrementa en la ruta
  activa.
- Es inconsistente entre columnas: "Hrs. Totales" suma **todas** las visitas (válidas + no válidas),
  pero "Clientes distintos" solo cuenta las válidas. No se replica esa inconsistencia acá.
- El período es seleccionable (hoy/semana/mes/rango), y si no es un mes calendario completo, la meta
  se prorratea por días hábiles del rango sobre una constante fija de 22 días hábiles/mes. **No se
  replica el prorrateo**: acá el período es siempre mes calendario completo.

## Decisión de nombre

Nuestro `/analitica` ya tiene un campo `efectividadComercial` (`% ofrecimientos ganados / ofrecidos`
— resultado de venta, no actividad). Llamar "Efectividad comercial" a este KPI de actividad lo pisaría
y confundiría "cuánto trabajó" con "cuánto vendió". El KPI nuevo se llama **Efectividad operativa**,
reusando el nombre que ya existía reservado (sin implementar) en `IVendedorMetricas.efectividadOperativa`
del contrato de tipos.

## Qué se muestra (alcance de esta iteración)

Un bloque nuevo en `/analitica`, **con su propio selector de mes**, independiente del filtro
`desde/hasta` que ya usa el resto de la página (ese filtro sigue existiendo para cobertura,
actividad semanal y objeciones — no se toca).

Tres criterios únicamente, en lenguaje de gerencia:

| Columna | ¿Qué muestra? | Cómo se calcula |
|---|---|---|
| **Efectividad operativa** | Puntaje de 0 a 100% (puede superar 100%) de qué tan cerca estuvo el vendedor de su meta mensual de actividad | Promedio 50/50 entre: % de la meta de clientes distintos visitados (160/mes) y % de la meta de horas trabajadas (100 hs/mes). Siempre mensual, sin prorrateo. |
| **Visitas (mensual)** | Cantidad de visitas válidas en el mes | Solo cuentan visitas con GPS confirmado (dentro de 300 m del cliente). |
| **Horas (mensual)** | Horas totales dedicadas a esas mismas visitas válidas | Suma la duración de las visitas que cuentan en "Visitas" — consistente con esa columna, a diferencia del sistema viejo. |

**Explícitamente fuera de este bloque, por ahora:**
- **Cobertura del plan** (`cobertura`) — sigue existiendo en la tabla de rango libre, no se agrega acá.
- **Efectividad comercial** (`efectividadComercial`, ofrecimientos ganados/perdidos) — no se muestra en
  esta iteración. Queda pendiente para una futura que combine plan vs. visitas reales.

## Metas

- **Fijas para todos los vendedores**: 160 clientes distintos / mes, 100 horas (6000 min) / mes —
  mismos números que el sistema viejo, para continuidad histórica con lo que gerencia ya conoce.
- **Hardcodeadas como constante de negocio en el backend** (`api-vendedores`, dominio `planificacion`),
  no en una tabla de configuración. No se crea `pl_objetivo`: es un alcance mayor que esta iteración no
  pide.

## Arquitectura

- **Este spec y su implementación en `app-planificacion` son solo la Fase 1 (frontend sobre mock)**,
  igual que el resto de `/analitica`. El cálculo real vive después en `api-vendedores`, sobre
  `pl_resolucion` y la lógica de visita válida por GPS que ya existe en ese dominio — **no** sobre
  `Visitas`/`api-mobiliza`.
- El contrato de tipos (`IVendedorMetricas`) **no cambia**: los campos `efectividadOperativa`,
  `visitasValidas`, `minutosTotales`, `clientesDistintos` ya existen (reservados desde el plan de
  mock de analítica, sin usar hasta ahora). Se reutilizan tal cual.
- El bloque nuevo pide su propio resumen llamando a `useResumen` con un `filtro` calculado a partir del
  mes elegido (primer y último día de ese mes calendario), en paralelo e independiente del `filtro` que
  ya usa el resto de la página. No hace falta un endpoint ni un hook nuevo — es el mismo
  `getResumen(filtro)` con otro rango.
- El mock actual (`analiticaMock.ts`) solo cubre una semana (`2026-07-20` a `2026-07-24`) y
  `dentroDelRango` devuelve vacío fuera de ese rango. Para que el bloque mensual tenga datos en
  desarrollo, el mock necesita ampliar su rango cubierto o generar datos también para el mes calendario
  que lo contiene — detalle de implementación, no de este diseño.

## Componentes afectados

- **Nuevo:** un selector de mes (componente propio, ej. `SelectorMes`), acotado a mes calendario
  completo (no rango libre).
- **Nuevo:** una sección/tabla por vendedor con las tres columnas de la tabla de arriba, alimentada por
  el resumen del mes elegido. Puede vivir como tabla nueva (paralela a `TablaVendedores`, que sigue
  siendo la de rango libre/cobertura) o como extensión de `KpisEquipo` — se decide en el plan de
  implementación, no acá.
- **Sin cambios:** `TablaVendedores.tsx` (cobertura y actividad por rango libre), `types/analitica.ts`,
  `api/analitica.ts`, `hooks/useAnalitica.ts` — todos se reutilizan tal cual.

## Testing

- Fixture: casos borde ya cubiertos por `analiticaMock.test.ts` (vendedor sin objetivo → `s/d`) siguen
  aplicando. Se agrega cobertura para que el mock devuelva datos también en el mes calendario de
  referencia.
- Formato: reusar `formatPct`/`formatNumero`/`formatDuracion` de `analiticaFormat.ts`, sin fórmulas
  nuevas de formato.

## Fuera de alcance

- Metas configurables por vendedor/zona (`pl_objetivo` o similar).
- Mostrar "Efectividad comercial" o "Cobertura del plan" en este bloque.
- Implementación real en `api-vendedores` (queda para un plan y spec propios de ese repo).
