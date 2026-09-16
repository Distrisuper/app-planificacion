# Marcas por rubro: qué marca ofrecer, y cuál se ofreció

Fecha: 2026-09-16
Estado: diseño aprobado, pendiente de implementación
Repos afectados: `app-planificacion` (front) y `api-vendedores` (dominios `sale` y `planificacion`)

## 1. El problema

La propuesta le dice al vendedor **qué rubro** está caído (`DISCOS, CAMP`, `KIT DISTRIBUCION`),
pero no **qué marca** conviene ofrecer dentro de ese rubro. Sin eso pasan dos cosas:

- Ofrece una marca y el cliente ya viene comprando otra: pierde la charla.
- El cliente está muy bien en una marca, y la oportunidad de **apalancar** con otra (la que
  dejó de comprar, o la que nunca llevó) no se ve.

Hoy la fila del rubro muestra `ACTUAL · M.ANT · P.6M` y nada más. Y lo que se registra al
resolver tampoco dice la marca: el motivo `NO_TRABAJA` pide "qué marca trabaja" en **texto
libre**, y `PRECIO` pide el competidor también en texto. Sobre eso no se puede hacer `GROUP BY`.

## 2. La decisión de fondo: contexto vivo y hecho estructurado, separados

Hay dos cosas distintas que se llaman "marca", y este spec las trata por separado:

| | qué es | dónde vive | cuándo se lee |
|---|---|---|---|
| **Qué marcas compra el cliente en este rubro** | contexto para decidir | warehouse (`fct_sales`) | en vivo, cada vez |
| **Qué marca ofreció el vendedor** | hecho declarado | `pl_ofrecimiento_alcance` (`tipo='marca'`) | al resolver el rubro |

- El contexto **no se congela** en la visita, igual que hoy no se congelan `ACTUAL` ni `P.6M`.
  Congelarlo lo desactualiza a la semana y agrega esquema para una analítica que nadie pidió.
- El hecho **sí se persiste estructurado**, con código de marca del catálogo, no como texto.
  Es lo que permite responder "qué marca ofrecemos en DISCOS y qué pasa" con un `GROUP BY`.
- El hecho es **opcional**: nunca bloquea el cierre ni cuenta para el mínimo de 2 rubros.
  Hacerlo obligatorio reintroduce la justificación forzada que
  [`docs/dominio/modelo.md`](../../dominio/modelo.md) ya descartó para los pendientes.

### 2.1 Regla escalable para lo que el sistema propone

No aplica a esta feature (el desglose de marcas es contexto, no propuesta), pero se deja
escrito para que marcas o artículos sugeridos por el sistema mañana entren por el mismo lugar:

> Todo lo que el sistema propone entra como fila de `pl_ofrecimiento` con `es_propuesto = 1`,
> un `origen` del catálogo de criterios, y sus números en las columnas o en `detalle JSON`.
> Nunca como texto libre, nunca con una tabla nueva por tipo.

`pl_ofrecimiento` ya es polimórfico (`tipo: rubro | marca | linea | articulo | accion`). Lo que
`RubroRecommendationService` hace en app-vendedores (artículos con `reason` en texto, sin
persistir qué se mostró ni qué pasó) es el anti-patrón: una lectura sin hecho, imposible de medir.

## 3. Datos: un endpoint de contexto, que reemplaza el parche actual

### 3.1 Cómo se obtienen los datos hoy

- **Antes de iniciar** (`PropuestaSheet`): `usePropuesta` → `POST /sale/rubro/recommendations/drops`
  para los rubros caídos, más `useRubroStatus` para los tres números.
- **Durante la visita** (`VisitaSheet`): `useOfrecimientos` → `GET /planificacion/visitas/:id/ofrecimientos`
  (MySQL, el hecho), más el mismo `useRubroStatus`. `filas.ts` cruza las dos listas por `rubroCode`.
- **`useRubroStatus` es un parche**: `getRubroStatus` llama a `POST /sale/rubro/clients`, el
  endpoint **paginado de la lista de clientes de Versus**, pasando el código del cliente como
  `search` con `pageSize: 5`, y se queda con la entidad cuyo `particularCode` coincide. Funciona,
  pero es un endpoint de otra pantalla usado de costado.

Sumarle un cuarto endpoint sólo para marcas encima de eso sería apilar sobre el parche.

### 3.2 El endpoint nuevo: `POST /sale/rubro/client-context`

Vive en el dominio `sale` de api-vendedores, al lado de `drops`. Responde **"cómo viene comprando
este cliente, por rubro, con sus marcas"**.

```
POST /sale/rubro/client-context
body: { particularCode: string }

→ {
    particularCode, clientName,
    rubros: [{
      rubroCode, rubroDescription,
      totalsByPeriod: {
        thisMonth:   { amount, units },
        lastMonth:   { amount, units },
        last6Months: { amount, units }     // SUMA de 6 meses cerrados; el front divide
      },
      brands: [{
        brandCode, brandName,
        totalsByPeriod: { ...misma forma... },
        dropped: boolean                    // ver 3.3
      }]
    }]
  }
```

- **Fuente:** `analytics.fct_sales`, `GROUP BY rubro_code, brand_code, year_month`, filtrado por
  `account_particular_code`, con el mismo CTE `rubro_catalog` y el mismo scope de vendedor que ya
  aplica `SalesRepository.queryClientRubroMonthlyAmounts`. Una sola query trae rubro y marca; el
  total por rubro es la suma de sus marcas (incluida `SIN MARCA`, que **no** se lista como marca
  pero sí suma al rubro).
- **Períodos:** los tres que ya usa `sale` (`thisMonth`, `lastMonth`, `last6Months`), con
  `amount` **y** `units` en cada uno. `units` no se muestra hoy: existe para que el interruptor
  pesos/unidades que se viene sea un cambio sólo del front.
- **Orden:** rubros por `last6Months.amount` desc; marcas dentro del rubro igual. Sin límite de
  marcas del lado del server; el front decide cuántas muestra (ver 5.1).
- **Cache:** Redis, mismo namespace-pattern y TTL que `RubroDropsService`.
- **Consumidores declarados** en el JSDoc de la ruta: `app-planificacion` (PropuestaSheet,
  VisitaSheet). Versus puede consumirlo mañana en el detalle de un cliente sin adaptador; por eso
  el contrato es agnóstico de la pantalla (períodos crudos, sin `/6`, sin nombres de columna).

### 3.3 `dropped`: la marca que dejó de comprar

`dropped = last6Months.amount > 0 && thisMonth.amount === 0 && lastMonth.amount === 0`.

Es la señal más barata de "apalancar": tenía historia y hace dos meses no la lleva. Se calcula
en el server (es una regla de dato, no de pantalla) y se muestra como tag `dejó` en rojo. No hay
otra clasificación por ahora.

### 3.4 Qué pasa con `getRubroStatus`

Se **reemplaza**, no se suma. `getRubroStatus` pasa a llamar a `client-context` y a mapear al
tipo del front (ver 3.5). `POST /sale/rubro/clients` deja de usarse desde esta app. Misma
cantidad de requests que hoy, con las marcas adentro.

### 3.5 Tipos del front

`IRubroEstado` (`src/types/planificacion.ts`) suma `marcas`:

```ts
export interface IMarcaEstado {
    code: string
    nombre: string
    actual: number
    mesAnterior: number
    promedio6m: number   // last6Months.amount / 6, igual que en el rubro
    dejo: boolean
}
export interface IRubroEstado {
    rubroCode: string
    nombre: string
    actual: number
    mesAnterior: number
    promedio6m: number
    marcas: IMarcaEstado[]   // [] cuando no hay historial de marca
}
```

`IOfrecimientoFila` (`filas.ts`) suma `marcas: IMarcaEstado[]`, poblado desde `rubroStatus` en
`construirFilasPropuesta` y `construirFilasVisita`. Las filas de tipo `marca`, `accion`, etc.
llevan `[]`, igual que hoy no llevan números.

### 3.6 Criterio de arquitectura (se escribe en el CLAUDE.md de api-vendedores)

api-vendedores sirve a dos apps (app-vendedores, app-planificacion) y el criterio para que un
endpoint no quede huérfano ni mezclado es:

- **Los dominios se cortan por el dato, no por la app.** `sale/*` responde preguntas del warehouse
  que tienen sentido sin importar quién pregunta. `planificacion/*` maneja el dominio propio
  (tablas `pl_`, visita, resolución, propuesta congelada).
- **La composición va en el servicio de dominio**, no en un endpoint por pantalla
  (`VisitasService` ya importa `RubroDropsService` para congelar la propuesta).
- **Cada ruta declara sus consumidores** en el JSDoc. Sin consumidor listado, es candidata a
  borrarse.
- **Sin código preparado sin uso.** Lo que no se pide, se anota; no se codea.

No se hace una capa BFF por app: con dos apps, el mismo auth y el mismo warehouse, duplica
endpoints y es justamente lo que produce huérfanos.

## 4. Modelo: la marca ofrecida va en `pl_ofrecimiento_alcance`

Sin tabla nueva. `pl_ofrecimiento_alcance` ya significa "sobre qué aplica la oferta, 0..N
destinos", con `tipo IN (rubro | marca | linea | articulo)` y `UNIQUE (ofrecimiento_id, tipo,
codigo)`. Un rubro ofrecido en FREMAX y CORVEN son **dos filas de alcance `tipo='marca'`**
colgadas del ofrecimiento del rubro.

### 4.1 Cambio en `resolver`

Hoy `OfrecimientoRepository.resolver` no toca el alcance (sólo `crearFueraDePropuesta` lo escribe).
El DTO de `PUT /planificacion/visitas/:id/ofrecimientos/:ofrecimientoId` suma:

```ts
marcas?: { codigo: string; descripcion: string }[]
```

- `undefined` → no se toca el alcance (mismo criterio que `detalle`).
- `[]` → se borran las filas de alcance `tipo='marca'` de ese ofrecimiento.
- `[...]` → se reemplazan las filas `tipo='marca'`; **las de otros tipos no se tocan**.
- Validación: códigos no vacíos, sin duplicados, `descripcion` obligatoria (es snapshot, igual
  que el resto del alcance). No se valida contra el catálogo de marcas en el back: el front sólo
  ofrece códigos del catálogo o del desglose, y el catálogo es "marcas con venta en 12 meses",
  que puede excluir legítimamente una marca vieja que el vendedor sí ofreció.
- Se hace dentro de la misma operación que motivos y campos, en el mismo orden: primero
  `detalle`, después alcance, después motivos (o todo en una transacción, si `resolver` la tiene).

`listar` ya devuelve `alcance` por ofrecimiento, así que el front lo lee sin cambios.

### 4.2 Qué NO cambia

- No se agregan columnas a `pl_ofrecimiento` ni a `pl_ofrecimiento_motivo`.
- El campo `marca_trabaja` (texto) del motivo `NO_TRABAJA` y `competidor` de `PRECIO` quedan como
  están: son otra pregunta ("qué marca trabaja de la competencia"), no "qué marca ofrecí".
- Un ofrecimiento `tipo='marca'` agregado a mano sigue existiendo como puerta alternativa; no se
  toca ni se deprecia.

## 5. UI

### 5.1 La tabla (`OfrecimientoTable`)

Contexto: el sheet de la visita mide 5 filas de propuesta, y el vendedor ya tiene un gesto sobre
la fila (tocar = cargar el resultado). El diseño **no agrega íconos ni columnas**: parte la fila
en dos zonas.

- **Margen y caja.** El padding lateral del sheet baja de 18 a 12px. La tabla pierde borde y
  redondeo: quedan sólo los hairlines entre filas (con 42px de alto, sin ellos las filas se
  pegan). Las columnas numéricas pasan de 54 a 48px con la pastilla más apretada (`$ 1.664` del
  catálogo sigue entrando). Resultado: el nombre pasa de ~94 a ~128px a 360px de ancho;
  `KIT DISTRIBUCION` y `CRAPODINAS, ACOPLES` entran enteros.
- **Dos zonas en las filas destacadas de la visita** (las de `resolucion` presente):
  - **Izquierda, chip + nombre:** carga el resultado, como hoy. Es donde vive el estado
    (anillo / número / ✓), así que "tocar el estado para cambiarlo" cierra solo.
  - **Derecha, los tres números:** despliega debajo las sub-filas de marca. "Tocar los números
    para ver más números" también cierra solo.
- **Estado abierto:** la zona derecha se tiñe `#EEF3FB`, las pastillas pasan a fondo blanco. Las
  sub-filas van con fondo `#F7F8FB`, 30px de alto, tipografía 11.5px, mismas tres columnas. En el
  slot del chip, una barrita de 3×13: navy para la primera marca (la principal por `P.6M`), gris
  para el resto. La marca `dejo` lleva tag rojo `DEJÓ`. **Una sola fila abierta a la vez**; se
  cierra al tocar los números de nuevo o al abrir otra.
- **Cuántas marcas:** máximo 3 sub-filas. Si hay más, la cuarta es una sub-fila no tocable con
  texto gris `+N marcas más`. El wizard (5.2) sí las lista todas.
- **Sin marcas:** tocar los números no hace nada y no hay señal, igual que hoy. Es el único
  caso mudo y se acepta; si molesta, un toast breve lo resuelve sin ocupar espacio.
- **Banda:** `TU PROPUESTA · TOCÁ EL RUBRO PARA CARGAR EL RESULTADO · LOS NÚMEROS, PARA VER SUS
  MARCAS`, con la segunda frase en `#8A93A6`. A 320px pasa a dos líneas.
- **Dónde NO aplica:** las filas del catálogo (`agregable`) no se partan: la fila entera sigue
  siendo "agregar". Las marcas se ven una vez que el rubro está en la visita. Las filas `tipo`
  `marca`/`accion` tampoco: no tienen números. Y en `PropuestaSheet` (antes de iniciar) las filas
  no tienen `resolucion`, así que **toda la fila** despliega: ahí no hay segunda acción con la
  que competir.
- **`M.Ant` a <360px** sigue escondiéndose (`xs`), en header, celda y sub-fila a la vez.

### 5.2 El wizard (`ResolucionWizard`)

Arriba del checklist `¿Qué pasó?`, una banda `¿QUÉ MARCA OFRECISTE? · opcional` con chips:

- Un chip por marca del desglose del rubro (**todas**, no sólo las 3 de la tabla), con sufijo gris
  `compra` (tiene `actual` o `mesAnterior` > 0) o `dejó`. Multi-selección, 32px de alto, tilde
  adentro cuando está elegido.
- Un chip `+ Otra` con borde punteado que abre el `MarcaOfrecimientoPicker` existente (catálogo
  `GET /sale/brand/catalog`). La marca elegida se suma como chip seleccionado.
- Si el rubro no tiene marcas en el historial, la banda muestra sólo `+ Otra`.
- Se guarda en el **borrador** del ofrecimiento (junto a motivos y acción) y viaja en el mismo
  `PUT` como `marcas`. Mismo comportamiento que los motivos ante "Limpiar" y ante el guardado en
  lote de `ResolucionWizardAcciones`.
- **No se replica** a los demás rubros con el check de "aplicar a todos": la marca es del rubro.
- Al reabrir un ofrecimiento ya resuelto, los chips se precargan desde `alcance` filtrado por
  `tipo='marca'`.

### 5.3 Degradación

Si `client-context` falla o está en vuelo, la tabla se ve **igual que hoy**: números en `–` donde
falten, sin desglose, sin error visible; el wizard muestra sólo `+ Otra`. Nada de esta feature
puede bloquear el cierre: el gate `ofrecimientosCargados` sigue mirando sólo a los ofrecimientos.

## 6. Tests

**api-vendedores**

- `ClientContextService`: agrupa rubro→marcas, `SIN MARCA` suma al rubro y no se lista, orden por
  `last6Months.amount`, `dropped` en los bordes (promedio > 0 con dos meses en cero → `true`;
  con `lastMonth > 0` → `false`; sin historia → `false`), scope de vendedor aplicado.
- `OfrecimientoRepository.resolver` con `marcas`: `undefined` no toca alcance; `[]` borra sólo
  `tipo='marca'`; `[...]` reemplaza y deja intactas las filas de otros tipos; rechaza duplicados.
- Ruta: consumidores en JSDoc, `authorize(...ALL_ROLES)` + `salesScopeMiddleware` como `drops`.

**app-planificacion**

- `getRubroStatus` mapea `client-context` (divide `last6Months` por 6, `marcas: []` cuando no hay).
- `filas.ts`: `construirFilasPropuesta` y `construirFilasVisita` pasan `marcas` a la fila; filas
  de catálogo y de tipo no-rubro llevan `[]`.
- `OfrecimientoTable`: tocar el nombre abre la resolución; tocar los números despliega; una sola
  abierta; tocar los números de una fila sin marcas no hace nada; cuarta marca se colapsa en
  `+N marcas más`; filas `agregable` no se partan; en modo propuesta toda la fila despliega.
- `ResolucionWizard`: chips desde `marcas` del rubro; selección va al borrador; `+ Otra` agrega el
  chip; precarga desde `alcance` `tipo='marca'`; el `PUT` lleva `marcas`.
- Degradación: con `rubroStatus` en error, la tabla renderiza como hoy y el wizard sólo `+ Otra`.

## 7. Fuera de alcance, con su razón

- **Marcas que el cliente NO compra pero se venden fuerte en su zona.** Es la otra mitad de
  "apalancar" y el contrato está preparado para sumarlas como filas con una bandera (`fuente:
  'cliente' | 'zona'`), pero **nadie lo pidió todavía**. No se codea nada. Cuando se pida, la
  comparación es contra los clientes de la misma `zone_code`, con fallback a toda Distri si la
  zona tiene pocos clientes; y si la sugerencia pasa a ser del sistema, entra por
  `pl_ofrecimiento` con `origen` propio (ver 2.1).
- **Congelar el desglose de marcas en la visita.** Ver sección 2.
- **Interruptor pesos/unidades.** El endpoint ya devuelve `units`; la UI no se toca en esta
  iteración.
- **Unificar `drops` y `client-context`.** Son dos preguntas distintas (qué cayó vs. cómo viene
  comprando) y `drops` lo consume también `VisitasService` para congelar la propuesta.
- **Marca a nivel de `pl_ofrecimiento_motivo`** (por motivo, no por ofrecimiento). Multiplica
  la carga y no responde ninguna pregunta que "marca por ofrecimiento" no responda.

## 8. Referencias

- [`docs/dominio/modelo.md`](../../dominio/modelo.md), "Los tres valores del hecho" e ideas
  descartadas (justificación obligatoria).
- [`docs/dominio/tablas.md`](../../dominio/tablas.md), `pl_ofrecimiento` / `pl_ofrecimiento_alcance`.
- api-vendedores: `SalesRepository.queryClientRubroMonthlyAmounts` (patrón de query sobre el
  cliente con `rubro_catalog` y scope), `RubroDropsService` (cache), `OfrecimientoRepository.resolver`.
- Mockups de la sesión: `.superpowers/brainstorm/4473-1789558979/content/marcas-v9.html` (tabla,
  versión final) y `marcas-v2.html` (chips del wizard). No están versionados.
