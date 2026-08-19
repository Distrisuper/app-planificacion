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
| **Efectividad operativa** | Puntaje de 0 a 100% (tope en 100%, nunca lo supera) de qué tan cerca estuvo el vendedor de su meta mensual de actividad | Promedio 50/50 entre: % de la meta de clientes distintos visitados y % de la meta de horas trabajadas, cada uno topeado a 100% antes de promediar. Se pide siempre con un rango de mes calendario completo. |
| **Visitas (mensual)** | Cantidad de visitas válidas en el mes | Solo cuentan visitas con GPS confirmado (dentro de 300 m del cliente). |
| **Horas (mensual)** | Horas totales dedicadas a esas mismas visitas válidas | Suma la duración de las visitas que cuentan en "Visitas" — consistente con esa columna, a diferencia del sistema viejo. |

**Explícitamente fuera de este bloque, por ahora:**
- **Cobertura del plan** (`cobertura`) — sigue existiendo en la tabla de rango libre, no se agrega acá.
- **Efectividad comercial** (`efectividadComercial`, ofrecimientos ganados/perdidos) — no se muestra en
  esta iteración. Queda pendiente para una futura que combine plan vs. visitas reales.

## Metas — corrección tras revisar `api-vendedores`

**Esta sección se escribió mal en la primera versión de este spec** (asumía que había que crear
`pl_objetivo` desde cero, con metas fijas hardcodeadas). Al revisar el repo real se encontró que **el
backend ya lo tiene implementado y mergeado en `master`** (`feat(analitica): backend de analítica de
visitas (#98)`, spec `docs/superpowers/specs/2026-08-03-analitica-visitas-backend-design.md` de ese
repo), con un diseño mejor que el que se iba a proponer acá:

- **`pl_objetivo` ya existe**, sembrada con los valores de mobiliza (160 clientes / 6000 min) vía
  `INSERT IGNORE`, con columnas `codigo_particular_vendedor` (NULL = objetivo global),
  `vigencia_desde`/`vigencia_hasta`. El objetivo propio del vendedor gana sobre el global si ambos
  están vigentes (`ObjetivoRepository.findVigentes`, `indicadores/objetivo.ts:resolverObjetivoVigente`).
  **No hay que crear nada nuevo.**
- **Prorratea** para rangos que no son mes calendario completo
  (`indicadores/objetivo.ts:prorratearObjetivo`, días hábiles del rango / 22 días típicos). No es un
  problema para este bloque: como el selector de mes de esta iteración siempre pide un rango de mes
  calendario completo, `esMesCalendarioCompleto` da `true` y el prorrateo no se aplica nunca en la
  práctica.
- **Cada componente se topea a 100% antes de promediar**
  (`Math.min(pctClientes, 100) * 0.5 + Math.min(pctMinutos, 100) * 0.5`) — a diferencia de mobiliza,
  acá `efectividadOperativa` **nunca supera el 100%**. Se adopta ese comportamiento tal cual está: no
  hay motivo para pedir un cambio de backend solo para poder superar el 100%.

## Arquitectura

- **`app-planificacion` sigue en Fase 1 (frontend sobre mock)** por ahora — el plan de implementación de
  este spec no cambia de mock a la API real, eso es un paso aparte (apagar `VITE_ANALITICA_MOCK`).
- El contrato de tipos (`IVendedorMetricas`) de `app-planificacion` **no cambia**: los campos
  `efectividadOperativa`, `pctCumplimientoClientes`, `pctCumplimientoMinutos`, `visitasValidas`,
  `clientesDistintos` ya existen y ya los devuelve el backend real tal cual.
- **Gap real encontrado, y único trabajo pendiente del lado backend:** `GET /planificacion/analitica/resumen`
  calcula `minutosTotales` internamente (lo necesita para `pctCumplimientoMinutos`) pero lo **descarta
  antes de responder** — no está en el `IVendedorMetricas` de `api-vendedores`
  (`AnaliticaService.ts`, función `defaultsActividad`: `const { minutosTotales, ...deLaFila } = act`).
  Sin ese campo no se puede mostrar "Horas (mensual)" como cantidad. Es un cambio chico y aditivo
  (dejar de descartar un valor que ya se calcula), documentado como tarea aparte en
  `api-vendedores` — ver el worktree `efectividad-operativa-kpi` de ese repo.
- El bloque nuevo pide su propio resumen llamando a `useResumen` con un `filtro` calculado a partir del
  mes elegido (primer y último día de ese mes calendario), en paralelo e independiente del `filtro` que
  ya usa el resto de la página. No hace falta un endpoint ni un hook nuevo — es el mismo
  `getResumen(filtro)` con otro rango.
- El mock actual (`analiticaMock.ts`) ya responde a cualquier rango que incluya el día de hoy
  (`dentroDelRango` usa `incluyeHoy`), así que el mes en curso por defecto va a traer datos sin tocar el
  mock.

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

- Mostrar "Efectividad comercial" o "Cobertura del plan" en este bloque.
- Cambiar de mock a la API real en `app-planificacion` (apagar `VITE_ANALITICA_MOCK`) — queda para
  cuando se confirme que `api-vendedores` ya expone `minutosTotales`.
