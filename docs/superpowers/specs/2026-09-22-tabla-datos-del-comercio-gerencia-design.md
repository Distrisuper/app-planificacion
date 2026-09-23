# "Datos del comercio" en gerencia: la tabla de lo relevado

Fecha: 2026-09-22 (revisado el mismo día, después de que se mergeara el back de la ficha)
Estado: diseñado.
Continúa [`2026-09-22-relevamiento-datos-del-comercio-design.md`](2026-09-22-relevamiento-datos-del-comercio-design.md),
que dejó el relevamiento escribiendo en `pl_ficha_valor` sin ninguna forma de mirarlo.

## 1. Qué problema resuelve

Hoy el dato entra y desaparece. `pl_ficha_valor` se llena visita a visita y **no hay ninguna
pantalla que lo muestre**: el único lector es el gate del vendedor (que pregunta por un cliente)
y un cron ajeno (que pregunta por lo no sincronizado). Gerencia no tiene cómo responder ni "qué
se cargó" ni "cómo viene".

La primera pregunta no es de agregación, es de **inspección**: *¿qué está entrando, y sirve?* Un
vendedor que pone "Generalista" en los treinta clientes de la semana se ve mirando las filas, no
mirando un porcentaje.

## 2. Qué muestra

Una fila por **cliente con al menos un dato vigente**, lo más reciente primero.

| Cliente | Especialidad | Personas | Facturación | Vendedor | Relevado |
|---|---|---|---|---|---|
| #06856 · Nonno Suspension | Suspensión, Frenos | 4 | Mayor a 30M | V 2 · Pérez | 22/09 14:30 |

- **Especialidad** es `multiple = 1` en el catálogo: van todas, separadas por coma. Si incluye
  Monomarca, la marca va entre paréntesis — `Monomarca (Ford)` — porque `monomarca_marca` no se
  entiende suelto.
- **Los códigos se traducen con el CATÁLOGO, no con una constante del front.** `pl_ficha_valor`
  guarda el código (`'3'`, `'ford'`) y el label vive en `pl_ficha_campo.opciones`. La tabla lee
  el mismo `useCamposFicha` que dibuja el formulario del vendedor: un `Map<campo, Map<codigo,
  label>>` armado una vez. Es la consecuencia directa del spec del catálogo dirigido por la
  base — `TRAMOS_FACTURACION` y `ESPECIALIDADES` ya no existen en `src/lib/relevamientos.ts`, y
  reponerlas acá volvería a partir el dato en dos lugares.
- **Un valor que no matchea ningún código se muestra tal cual**: es lo que cargó la opción
  abierta ("Otros"), que guarda el texto y no el código. `Chery` se lee `Chery`, sin decoración.
  Es el mismo criterio con el que el formulario lo relee como "Otros".
- **Con el catálogo todavía en vuelo, la tabla no dibuja las celdas de opción con el código
  crudo**: espera. Ver un `3` en la columna Facturación es peor que ver la fila un instante más
  tarde, y el catálogo se cachea con `staleTime: Infinity` así que sólo pasa la primera vez.
- **Sólo el valor vigente** (`reemplazado_en IS NULL`). Corregir un dato **actualiza la fila**,
  no agrega una segunda: el cliente aparece una vez. `Relevado` es la fecha del dato más
  reciente de ese cliente.
- **Los clientes a medias también aparecen**, con la celda vacía. Cargó especialidad y no
  facturación es exactamente uno de los casos que hay que poder ver.
- **La fecha se formatea en TZ de negocio** (`horaNegocio`, `src/lib/fechas.ts`). Nunca
  `slice(11,16)` sobre el ISO ni `toLocaleTimeString()` pelado: la notebook de gerencia puede
  estar en otra zona.

Arriba de la tabla, una línea de total: **"124 de 380 clientes del plan relevados"**. El
denominador es `COUNT(DISTINCT codigo_particular_cliente)` sobre `pl_rotacion_cliente` de las
rotaciones abiertas de los vendedores del filtro. Con eso la pantalla también responde "cómo
viene el avance", que era la vista alternativa evaluada (§7).

## 3. El período es opcional

Las otras tres pantallas de gerencia filtran por `desde/hasta` con default "semana en curso",
porque miran **actividad**: visitas, que pasan todos los días. La ficha no es actividad, es un
**padrón acumulado** que se llena una vez por cliente y nunca más. Con el default de las otras
pantallas, gerencia abriría esta y vería cuatro filas.

**Arranca mostrando todo**, y el rango de fechas queda disponible para preguntar "qué se cargó
esta semana". En el endpoint eso es un `WHERE` opcional: sin `desde`/`hasta` no se filtra por
fecha. El filtro de vendedores funciona siempre.

## 4. El endpoint

`GET /planificacion/analitica/fichas?desde&hasta&vendedores`, en api-vendedores.

**Sale de `master`.** Cuando se escribió este spec las tablas vivían en una rama sin mergear;
el PR #126 se mergeó el 22/09 a la tarde y `pl_ficha_campo` / `pl_ficha_valor` ya están creadas
en `planificacion-prod`, con `idx_listado` incluido en el `CREATE`. O sea que **la sección 5 de
este spec ya está aplicada**: no hay `ALTER` pendiente.

Respeta el scope de vendedores como el resto (`resolverVendedoresPermitidos`), así que el
vendedor de prueba no se mezcla con la cartera real.

### 4.1 Los nombres salen del warehouse, y su caída no voltea la tabla

El dato vive en MySQL; del warehouse salen **sólo los nombres**. Se reusa el patrón exacto de
`AnaliticaService.getVisitas`:

- clientes: `ClientRepository.getVisitCardsByParticularCodes(codigos)`, dentro de `try/catch`;
- vendedores: `rosterSeguro()`, que ya existe y degrada a `''`.

Con el warehouse caído la tabla **igual se dibuja**, con el código y sin el nombre. Es la misma
decisión que ya tomó la analítica de visitas: el listado no depende del warehouse para existir,
sólo para ser lindo.

**Nunca se le manda un código `ALTA-…` al warehouse.** Es sintético, no tiene fila en Postgres.
El nombre de un cliente nuevo sale del `detalle` congelado en su fila de `pl_rotacion_cliente`.
Misma regla que ya siguen `getVisitas` y `getVisitaDetalle`.

### 4.2 El pivote se hace en memoria

`pl_ficha_valor` guarda una fila por dato: cuatro filas arman un renglón. El pivote va **en el
service**, no con `GROUP BY` + `MAX(CASE campo = … )`. A este volumen la query agrupada no compra
nada y cuesta legibilidad y tests; y el día que el catálogo tenga un quinto campo, el pivote en
memoria no hay que tocarlo. Es el patrón que ya usa `AnaliticaService`.

## 5. Los índices: la tabla NO estaba optimizada para esto (YA APLICADO)

`pl_ficha_valor` nació con dos índices, para las dos únicas lecturas que existían:

```sql
INDEX idx_vigente         (codigo_particular_cliente, campo, reemplazado_en)  -- el gate: UN cliente
INDEX idx_sin_sincronizar (sincronizado_en, reemplazado_en)                   -- el cron del ERP
```

El listado pregunta otra cosa: `WHERE reemplazado_en IS NULL … ORDER BY relevado_en DESC`.
**Ninguno de los dos arranca por una columna que ahí se filtre** — uno empieza por el cliente
(perfecto para uno, inútil para todos) y el otro por `sincronizado_en`. Plan resultante: full
scan más filesort.

**Cuánto importa hoy: nada.** Son ~4 filas por cliente, así que con la cartera entera relevada
son 15-20 mil filas y el scan tarda milisegundos. No es un problema de performance; es que el
plan no tiene nada que lo sostenga cuando la tabla crezca. Y cuesta una línea:

```sql
ALTER TABLE pl_ficha_valor ADD INDEX idx_listado (reemplazado_en, relevado_en);
```

**Esto ya está hecho.** El índice entró en el `CREATE TABLE` de
`planificacion-ficha-cliente.sql` antes de que ese script se aplicara a producción, así que
en `planificacion-prod` nació con los tres índices y no quedó ningún `ALTER` pendiente. El
`ALTER` de arriba sólo sirve para un entorno donde la tabla ya existiera de antes.

**El orden importa:** `reemplazado_en IS NULL` se resuelve como lookup sobre la primera columna,
y dentro de ese tramo el índice ya viene ordenado por `relevado_en` — sirve para el `WHERE` **y**
para el `ORDER BY DESC`, sin filesort.

**Un solo índice, no dos.** La tentación es sumar `relevado_por` para el filtro de vendedores:
en el medio rompe el `ORDER BY`, y en un índice aparte agrega escritura en una tabla que se
escribe en cada relevamiento, para ganar milisegundos sobre 20 mil filas. El filtro de vendedor
se aplica arriba.

Las otras dos lecturas de esta pantalla ya están cubiertas o resueltas:

- **El denominador** usa `idx_semana (rotacion_id, semana)` de `pl_rotacion_cliente`, que arranca
  justo por donde se filtra. Sin cambios.
- **El nombre de las altas** sale de `pl_rotacion_cliente`, cuyo índice útil arranca por
  `rotacion_id`: buscar por código de cliente **también escanea**. Por eso no va como join fila
  por fila — se juntan los códigos `ALTA-*` (que son poquitos) y se resuelven en **una sola**
  query con `IN (...)`. Un scan, no N.

## 6. La pantalla

Cuarta tab de gerencia: **`/analitica/fichas`**, etiqueta **"Datos del comercio"**, después de
Ruta. Dentro del `ProtectedRoute permitir={supervisa}` que ya agrupa las otras tres.

Reusa sin tocar `AnaliticaTabs`, `FiltrosAnalitica` y `useFiltroAnalitica` — el filtro ya vive en
la URL, así que la vista es compartible por link. La tabla sigue el molde de `TablaVisitas`
(~90 líneas, presentacional pura): sin ordenamiento por columna ni export.

**Y sin paginación, a diferencia de visitas.** `getVisitas` sí devuelve una página
(`{ total, pagina, cant, visitas }`) porque las visitas crecen todos los días y sin techo. Las
fichas crecen **de a una por cliente, una sola vez en la vida de ese cliente**: el techo es la
cartera. La respuesta es una lista pelada y no una página, y cuando eso deje de alcanzar se
agrega — no antes.

**El cliente de API va en `src/api/analitica.ts`, no en `planificacion.ts`**, y respeta el
`USA_MOCK` (`VITE_ANALITICA_MOCK=1`) que tienen las otras cinco funciones de ese archivo: sin
una rama de mock, prender el flag deja esta tab rota mientras el resto de gerencia funciona.

Estados: spinner mientras carga, y el vacío con texto propio ("Todavía no se cargó ningún dato
del comercio") en vez de una tabla con encabezados y nada abajo.

## 7. Lo que queda afuera, y por qué

- **La vista de avance por vendedor** (un renglón por vendedor con completos/faltantes). Era la
  alternativa evaluada. Se descartó para la v1: la línea de total de §2 responde lo mismo sin
  una segunda pantalla, y lo primero que hace falta es ver el dato, no medirlo.
- **La columna "sincronizado al ERP"** (`sincronizado_en`). Cuesta poco y es tentadora, pero la
  sincronización la hace un proceso **ajeno a este dominio**, y tenerla en pantalla invita a que
  alguien pida un botón de "reintentar" que no nos corresponde. Si hay que auditarlo, es una
  pregunta a la base.
- **El historial de correcciones.** La tabla muestra lo vigente. El valor viejo está guardado
  (`reemplazado_en`) y se consulta el día que alguien lo pida.
- **Paginación, orden por columna y export.** Cuando el volumen lo justifique. Hoy no.

## 8. El vendedor de prueba no entra en este listado

Después de escrito este spec apareció `ambitoDe` (FichaRepository): las filas de un
`PRUEBA-<userId>` son suyas y no se mezclan con las reales. **El listado de gerencia usa el
ámbito REAL**, que es el default de `findVigentesPorClientes` — o sea que las fichas cargadas
en una demo no aparecen acá, y el denominador no las cuenta.

No es un filtro nuevo que haya que escribir: sale gratis de no pasar vendedor. Lo que sí hay
que respetar es **no pasarlo**, y por eso queda escrito.

## 9. Qué se toca

**api-vendedores** (rama nueva sobre `master`):

| archivo | qué |
|---|---|
| `src/repositories/FichaRepository.ts` | `findVigentesParaListado(filtro)` y el conteo del denominador |
| `src/services/planificacion/AnaliticaService.ts` | `getFichas`: pivote, nombres, degradación |
| `src/routes/planificacion.ts` | `GET /planificacion/analitica/fichas` |

**app-planificacion**:

| archivo | qué |
|---|---|
| `src/types/analitica.ts` | `IFichaFila`, `IFichasResponse` |
| `src/api/analitica.ts` | `getFichas(filtro)`, con su rama `USA_MOCK` |
| `src/mocks/analiticaMock.ts` | `MOCK_FICHAS`, para el modo demo |
| `src/hooks/useFichasRelevadas.ts` | el query |
| `src/components/analitica/TablaFichas.tsx` | la tabla; traduce códigos con `useCamposFicha` |
| `src/pages/AnaliticaFichasPage.tsx` | tabs + filtros + total + tabla |
| `src/components/analitica/AnaliticaTabs.tsx` | la cuarta tab |
| `src/App.tsx` | la ruta dentro de `supervisa` |

## 10. Tests

- **Repo:** sólo vigentes; el rango de fechas es opcional; el filtro de vendedores acota.
- **Service:** cuatro filas de un cliente arman un renglón; una especialidad múltiple se junta;
  Monomarca arrastra la marca; el cliente `ALTA-*` toma el nombre del detalle y **no** se le
  pregunta al warehouse; con el warehouse caído las filas salen igual con nombre vacío.
- **Front:** la tabla dibuja el label del CATÁLOGO y no el código (`'3'` → `Mayor a 30M`,
  `'ford'` → `Ford`); un valor fuera de la lista —el de la opción abierta— sale tal cual
  (`Chery`); Monomarca arrastra su marca entre paréntesis; con el catálogo en vuelo no se
  dibujan códigos crudos; la hora sale en TZ de negocio; el vacío muestra su texto; los filtros
  de la URL viajan al endpoint.
