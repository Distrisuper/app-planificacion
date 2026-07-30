# Analítica de visitas — vista de análisis para gerencia

**Fecha:** 2026-07-30
**Estado:** diseño aprobado, pendiente de plan de implementación
**Repos que toca:** `app-planificacion` (front) y `api-vendedores` (backend, dominio `planificacion`)

## Problema

El ciclo de visitas persiste el plan congelado, la resolución de cada cliente, las coordenadas de
inicio y fin, y el motivo estructurado de cada rubro (`pl_visita_rubro_motivo`) y de cada no-visita
(`pl_no_visita_motivo`). Hoy nadie puede leer nada de eso: los ocho
endpoints del dominio resuelven **el vendedor logueado** vía `sellerIdentity`, así que no existe
forma de ver al equipo completo ni de agregar nada.

Lo que se usa hoy para esa lectura es el dashboard de `app-mobiliza` (`/sellers-jbl`), respaldado
por `api-mobiliza`, que se está deprecando. Ese dashboard tiene dos límites de fondo:

1. **No tiene denominador.** Sabe cuántas visitas hizo un vendedor, no cuántas debía hacer. Sin el
   plan, la cobertura es incalculable — y la cobertura es el objetivo del proyecto.
2. **Las columnas MOTIVO y RESULTADO están vacías.** `PUT /Mobiliza/visita` recibe `motivos` y
   `resultado` del frontend y no los persiste. La tabla los muestra porque están previstos, pero
   nunca llegan datos.

Esta vista cubre las dos cosas y reemplaza al dashboard viejo.

## Alcance

Cuatro objetivos, confirmados con el usuario, que se mapean uno a uno con los tres niveles de la
interfaz más una sección propia:

- **Controlar al vendedor** — cobertura, actividad, duración, validación por GPS.
- **Medir efectividad comercial** — rubros ofrecidos vs. ganados / diferidos / perdidos.
- **Detectar objeciones del mercado** — ranking de motivos por zona y rubro.
- **Auditar una visita puntual** — del agregado al caso concreto.

**Fuera de alcance:** venta asociada (comprobantes, recibos, créditos, monto — requiere cruzar
`pl_visita` con `fct_sales`), mapa de calor, pestaña CRM/televentas, y ABM de objetivos por
pantalla (los valores se cargan por SQL en esta etapa).

Nota: el `CLAUDE.md` del repo listaba la vista supervisor como backlog v2. Este spec la abre
explícitamente.

## Nombre y acceso

El módulo se llama **analítica**, no "gerencia": se nombra por lo que hace, no por quién lo mira.
Si mañana lo usa supervisión o el área comercial no hay que renombrar rutas ni archivos — el
acceso ya lo resuelven los roles.

`api-vendedores` tiene una tabla central de políticas en `src/config/roles.ts`. Los roles
`admin`, `versus-ger` y `supervisor` son `sellerScope: 'unrestricted'`; `vendedor` es
`vendor-scoped`. El router nuevo usa `authorize('admin', 'versus-ger', 'supervisor')`, de modo
que el vendedor queda excluido por política, no por esconder el link en el front. El front, además,
no monta la ruta si el rol no corresponde.

No se crea ningún rol nuevo.

## Arquitectura

```
app-planificacion  /analitica  (desktop-first, layout propio)
        │
        │  GET /planificacion/analitica/*      (Bearer, rol unrestricted)
        ▼
api-vendedores
  src/routes/analitica.ts
  src/controllers/analiticaController.ts
  src/services/planificacion/AnaliticaService.ts     ← cálculo de indicadores
  src/repositories/AnaliticaRepository.ts            ← agregaciones SQL
        │
        ├─► MySQL distriap_distri (sequelizeWrite, conexión existente)
        │     pl_ciclo_semana, pl_ciclo_cliente, pl_visita,
        │     pl_no_visita_motivo, pl_visita_rubro,
        │     pl_visita_rubro_motivo, Motivos (lectura)
        │     pl_objetivo  ← TABLA NUEVA
        │
        └─► ClientRepository → fct_clients (coords del cliente, zona)
```

Sin joins contra ventas. Sin cambios en el warehouse.

`/analitica` es la primera pantalla **desktop-first** del repo. La app sigue siendo mobile-first
para el vendedor; esta vista vive en su propio `AnaliticaLayout`, con ancho amplio y tabla densa, y
no comparte componentes con la agenda salvo primitivas de shadcn.

## Endpoints

Todos bajo `/planificacion/analitica`, todos con `desde` y `hasta` obligatorios (`YYYY-MM-DD`).

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/resumen?desde&hasta&vendedores[]` | KPIs del equipo + una fila por vendedor + fila `PROMEDIOS` |
| GET | `/visitas?desde&hasta&vendedor&cliente&pagina&cant` | tabla de visitas paginada |
| GET | `/visitas/:id` | detalle de una visita: rubros, motivos, coords |
| GET | `/objeciones?desde&hasta&zona&rubro` | ranking de motivos con conteo y % |

`vendedores[]` vacío o ausente = todos los que el scope del usuario permita.

## Eje temporal y denominador

El eje es el **rango de fechas** (como mobiliza), porque gerencia mira a todo el equipo a la vez y
cada vendedor puede estar en una semana distinta de su rotación de 5.

Como el plan congelado vive en el ciclo y no en el rango, la cobertura se calcula sobre **los ciclos
que solapan el rango**:

```sql
fecha_apertura <= :hasta AND (fecha_cierre >= :desde OR fecha_cierre IS NULL)
```

Los ciclos aún abiertos se cuentan, y la UI muestra al lado del porcentaje un contador
`⊙ N ciclos en curso`. Sin esa marca, un 45% se lee como bajo rendimiento cuando en realidad es
"la semana va por la mitad".

## Indicadores

### Cobertura (lo que mobiliza no puede calcular)

Denominador = filas de `pl_ciclo_cliente` de los ciclos que solapan.

- `planificados`, `visitados`, `noVisita`, `reagendados`, `pendientes`
- `cobertura` = `visitados / planificados`
- `ciclosEnCurso` = cuántos de esos ciclos siguen abiertos

### Actividad y calidad

- `visitasTotales`; `visitasValidas` = distancia(`coord_inicio`, coord del cliente) ≤ **300 m**;
  `visitasNoValidadas` = las que exceden esa tolerancia.
- Si el cliente **no tiene coords** en `fct_clients`, la visita **no es verificable**: se cuenta en
  `visitasSinCoord` y **no** suma a `visitasNoValidadas`. Es el mismo criterio que hoy, donde
  `geo === undefined` se da por buena.
- `duracionPromedioMin` = `fecha_fin - fecha_inicio`, promediada **solo sobre visitas válidas**
  (igual que mobiliza).
- `visitasCortas` = duración < 20 min, como columna **informativa aparte**. Mobiliza tenía la
  intención (`cantidadCortas`) pero el contador nunca se incrementa; si ahora se restaran de las
  válidas, el dashboard nuevo daría menos que el viejo sin explicación visible.
- `visitasPorDia` = `visitados / días hábiles del rango`.
- `clientesDistintos` = `codigo_particular_cliente` distintos con visita válida.

### Objetivos y cumplimiento

Los objetivos de mobiliza **no salen de ninguna tabla**: son constantes en
`api-mobiliza/src/Mobiliza/Mobiliza.server.js` (`OBJETIVO_CLIENTES_DISTINTOS = 160`,
`OBJETIVO_MINUTOS_TOTALES = 6000`, ambos mensuales, y `8` visitas / `300` minutos diarios usados
por el aviso de Slack `reportarObjetivosDiarios`).

Se formalizan en una tabla nueva **`pl_objetivo`** sembrada con esos mismos valores, para que
cambiarlos no exija un deploy:

```
pl_objetivo
  id
  codigo_particular_vendedor  NULL = objetivo global (default)
  clientes_mes                160
  minutos_mes                 6000
  vigencia_desde              DATE
  vigencia_hasta              DATE NULL
```

Resolución: objetivo del vendedor vigente en la fecha; si no hay, el global; si no hay ninguno,
los indicadores de cumplimiento se devuelven en `null` y la UI los muestra como "s/d" (nunca 0%,
que se leería como incumplimiento).

Prorrateo, idéntico a mobiliza: si el rango es un mes calendario completo se usa el objetivo tal
cual; si no, `objetivo * díasHábiles / 22`.

- `pctCumplimientoClientes` = `clientesDistintos * 100 / objetivoClientes`
- `pctCumplimientoMinutos` = `minutosTotales * 100 / objetivoMinutos`
- `efectividadOperativa` = `min(pctClientes,100) * 0.5 + min(pctMinutos,100) * 0.5`

Se replica la fórmula exacta (50/50, capada a 100) para que los números coincidan el día que se
comparen lado a lado con el dashboard viejo.

### Efectividad comercial (lo nuevo)

Sobre el campo `resultado` de los motivos de nivel `rubro` en `pl_visita_rubro_motivo`
(`ganado` | `diferido` | `perdido` | `no_ofrecido`):

- `rubrosOfrecidos` = rubros resueltos con `resultado != 'no_ofrecido'`
- `rubrosGanados`, `rubrosDiferidos`, `rubrosPerdidos`
- `efectividadComercial` = `rubrosGanados / rubrosOfrecidos`; con `rubrosOfrecidos = 0` devuelve
  `null`, nunca `0` ni división por cero
- `pctNoOfrecidos` = rubros que la propuesta marcó y se cerraron sin ofrecer, sobre el total de
  propuestos. Responde algo que hoy no se puede preguntar: si la propuesta se usa o se ignora.
- `rubrosSinResolver` = rubros con `resuelto = false` en visitas ya cerradas. Mide calidad del
  dato, no al vendedor, y se muestra en una sección aparte.

### Semáforo

**Relativo al equipo**, como mobiliza: rojo si el vendedor está por debajo del **70% del promedio
del equipo** en cobertura, visitas/día, clientes distintos, minutos y efectividad comercial. El
promedio del equipo se calcula sobre los vendedores del filtro y se muestra siempre como fila
`PROMEDIOS` fija arriba de la tabla.

Se conservan además las dos reglas absolutas que mobiliza ya aplicaba:

- `duracionPromedioMin < 20` → rojo
- `visitasNoValidadas >= visitasTotales * 0.5` → rojo

### Criterios de mobiliza que NO se arrastran

- **`FECHA_MINIMA_GEOLOCALIZACION` (`2025-01-14`)**: acá `coord_inicio` es obligatoria desde el día
  uno — el backend rechaza con `COORD_REQUERIDA`. No hay período histórico que perdonar.
- **Equipos excluidos (`003`, `008`, `010`, `016`)**: no existe nada equivalente en este dominio. El
  vendedor se identifica por `codigo_particular_vendedor`, sin `idEquipo`.
- **Clientes genéricos (`09895`, `11620`)**: el plan congelado solo contiene clientes reales.
- **`minutosMin=10` / `minutosMax=90`**: se reciben y nunca se usan en el código actual.

Se conserva la **tolerancia de 300 m**, único criterio con historia detrás.

## Pantallas

### Nivel 1 — `/analitica`

Barra de filtros fija arriba: rango de fechas con atajos ("esta semana", "este mes", "mes pasado") y
multi-select de vendedores.

Debajo, KPIs del equipo: cobertura, efectividad comercial, visitas válidas, % no validadas.

Después, **la tabla de vendedores**, corazón de la pantalla: una fila por vendedor, columnas
ordenables por click en el header (como mobiliza), semáforo por celda, fila `PROMEDIOS` fija.

Al pie, **Objeciones del mercado**: ranking de motivos con conteo y porcentaje, filtrable por zona y
por rubro. Vive en el nivel 1 porque es una lectura del mercado, no de un vendedor.

### Nivel 2 — `/analitica/vendedor/:codigo`

Se llega clickeando una fila; el rango de fechas se conserva.

Arriba, los indicadores de ese vendedor contra el promedio del equipo. Debajo, **su tabla de
visitas**: fecha, inicio, duración, distancia, cliente, motivo, resultado — la misma tabla del
dashboard viejo, con las dos últimas columnas efectivamente llenas.

La distancia se pinta verde/rojo según los 300 m. Las visitas sin coord del cliente muestran "s/d"
en gris, en lugar de un número absurdo tipo `7307510 m` como pasa hoy.

### Nivel 3 — panel lateral sobre el nivel 2

Click en una visita abre un panel (no una página nueva: no se pierde la tabla). Contiene horario y
duración, los **dos puntos de GPS sobre un mapa Leaflet** junto a la coord del cliente y los
círculos de 300 m, y la lista de rubros de esa visita con motivo, resultado y
marca/competidor/`pctDiferencia` cuando el motivo tiene `requiereDetalle`.

Responde "¿por qué este vendedor tiene la efectividad baja?" mirando un caso concreto.

### Estado en la URL

`?desde=&hasta=&vendedores=` en la query. Gerencia puede mandar un link a un estado puntual del
dashboard.

## Errores y datos faltantes

- **Sin ciclos en el rango**: estado vacío explícito ("no hay ciclos entre X e Y"), nunca un 0% que
  parezca desempeño.
- **Clientes sin coord**: se informan como "N visitas no verificables" para que el % de validación
  no se lea como cobertura de GPS completa.
- **Sin objetivo vigente**: los indicadores de cumplimiento van en `null` y se muestran "s/d".
- **`rubrosOfrecidos = 0`**: efectividad comercial en `null`, no `0`.
- **403**: el front muestra la pantalla `SinPermisos` ya existente.

## Orden de implementación: front sobre mock primero

El contrato de los cuatro endpoints queda cerrado en este spec, así que el front se construye e
itera **antes** que el backend, contra un mock tipado.

- `src/mocks/analiticaMock.ts` — fixture tipada con las mismas interfaces que consume la UI. Al
  estar tipada, el compilador garantiza que el mock respeta el contrato: si el contrato cambia, el
  mock deja de compilar.
- `src/api/analitica.ts` — única capa que decide. Si `VITE_ANALITICA_MOCK=1` devuelve el fixture
  (con un delay artificial corto, para que los estados de carga se vean); si no, pega contra
  `apiClient`. Ningún componente ni hook sabe de la existencia del mock.
- El día que el backend exista, se apaga el flag. No hay código de UI que desmontar.

No se agregan dependencias (nada de MSW): el repo hoy no la tiene y la capa `api/` ya es un seam
suficiente.

**El fixture debe cubrir los casos borde, que son los que rompen el diseño de una tabla.** Además de
~10 vendedores verosímiles con un buen desempeño, uno malo y el resto en el medio:

- un vendedor con **ciclo en curso** (cobertura ~40% legítima) → valida el indicador `⊙ N en curso`
- uno con **> 50% de visitas no validadas** y otro con **duración promedio < 20 min** → las dos
  reglas absolutas del semáforo
- clientes **sin coord** → celdas "s/d" (el caso que hoy imprime `7307510 m`)
- un vendedor con **cero rubros ofrecidos** → `efectividadComercial: null`, la UI no muestra `0%`
- un vendedor **sin objetivo vigente** → cumplimiento en "s/d"
- un rango sin ciclos → estado vacío explícito

Los filtros de fecha y de vendedores operan de verdad sobre el fixture: controles que no filtran
nada dan una falsa sensación de que la pantalla funciona.

Fases: (1) front sobre mock hasta que el dashboard convenza; (2) backend en `api-vendedores` contra
el mismo contrato, más `pl_objetivo`; (3) apagar el flag y verificar end-to-end.

## Tests

**Backend (Vitest/Jest según el repo):**

- cobertura con un ciclo abierto a medias del rango
- distancia exactamente en 300 m (límite inclusivo) y visita sin coord de cliente
- prorrateo por días hábiles: mes calendario completo vs. rango parcial
- efectividad comercial con `rubrosOfrecidos = 0` → `null`, sin división por cero
- resolución de objetivo: por vendedor > global > ninguno
- `authorize`: rol `vendedor` recibe 403 en las cuatro rutas

**Front (Vitest + Testing Library, como el resto del repo):**

- tabla de vendedores: orden por columna y clases del semáforo contra el promedio
- drill-down nivel 1 → 2 → 3 conservando el rango de fechas
- estados vacíos y "s/d"

## Decisiones no obvias

- **El eje es el rango de fechas, pero el denominador es el ciclo.** Un rango que corta un ciclo por
  la mitad da una cobertura baja legítima; por eso el contador de ciclos en curso no es decorativo,
  es lo que evita leer mal el número.
- **"Efectividad" cambia de significado respecto de mobiliza.** Allá era cumplimiento de objetivo;
  acá `efectividadComercial` es rubros ganados sobre ofrecidos, y el cumplimiento se llama
  `efectividadOperativa` y `cobertura`. Hay que avisarle a gerencia del cambio de vocabulario antes
  de reemplazar el dashboard viejo.
- **Las visitas cortas no se restan de las válidas**, para no producir una diferencia inexplicable
  contra los números del dashboard que se está reemplazando.
- **No se valida GPS contra el cliente cuando el cliente no tiene coords.** Castigar al vendedor por
  un dato maestro faltante haría que el indicador mida la calidad de `fct_clients`, no su trabajo.
- **`pl_objetivo` nace sin ABM.** Formalizar cuatro constantes en una tabla ya elimina la necesidad
  de un deploy para cambiarlas; la pantalla de edición se agrega si gerencia la pide.
