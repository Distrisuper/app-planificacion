# Consumo del dominio de ciclos — Design

**Fecha:** 2026-07-28
**Alcance:** app-planificacion (front) + api-vendedores worktree `planificacion-backend` (dos endpoints
nuevos y una validación nueva).

## 1. Problema

El backend del dominio de planificación se reimplementó sobre ciclos (13 commits en el worktree
`planificacion-backend`, working tree limpio). El front sigue consumiendo el contrato anterior: pide
`?semana=s1`, lee un campo `visit` que ya no existe, manda motivos al cerrar la visita, y llama a un
endpoint de reintento de Cromo que fue eliminado. Nada de la pantalla funciona contra la API actual.

El contrato vigente es `src/docs/planificacion.yaml` en ese worktree (16 endpoints). El spec del
dominio es `docs/superpowers/specs/2026-07-27-planificacion-visitas-design.md`, y **manda sobre el
modelo de datos y los endpoints**.

### 1.1 Delta del contrato

| Front hoy | Contrato vigente |
|---|---|
| `GET /agenda/semana?semana=s1` | sin params — la vuelta es la que el vendedor tiene **abierta**; sin ella, `409 CICLO_NO_ABIERTO` |
| `GET /agenda/dia?dia&fecha` | solo `dia` |
| card con `visit: "s1d1"`, `resuelto?: boolean` | `cicloClienteId`, `dia`, `estado` (5 valores), `visitaId`, `rubrosPendientes` |
| `POST /visitas {codigoParticularCliente, nombreCliente, coordInicio}` | `{cicloClienteId, coordInicio}` → `{visitaId, rubros}` |
| `PUT /visitas/:id/cerrar {coordFinal, motivoIds}` | `{coordFinal}` **sin motivos** → `{visitaId, rubrosPendientes}` |
| `POST /visitas/no-visita {codigoParticularCliente, nombreCliente, motivoIds}` | `{cicloClienteId, motivoIds}` (motivos de nivel `visita`) |
| `getVisitaActiva` → `{visitaId, nombreCliente, seguimiento*}` | resolución cruda `{id, cicloClienteId, tipo, fechaInicio, fechaFin, coord*}` |
| `POST /visitas/:id/seguimiento` | **eliminado** — Cromo quedó fuera de alcance |
| `IMotivo {motivoId, descripcion}` | `+ nivel, resultado, requiereDetalle` |
| — | 7 endpoints nuevos: `ciclo/abrir`, `ciclo/actual`, `ciclo/cerrar`, `ciclo-cliente/:id/reagendar`, y los 4 de `visitas/:id/rubros` |

El cambio estructural: **el resultado comercial ya no se carga al cerrar la visita, se carga por
rubro** contra la propuesta congelada al iniciarla.

### 1.2 Qué define el prototipo y qué no

`Prototipo/` (mockups validados) define: el shell de agenda semanal, la resolución por rubro con
breadcrumb `Resolución → <rubro>`, el detalle inline de Precio (Marca / Competidor / % de
diferencia), Versus, Reagendar.

El prototipo tiene una lista **hardcodeada** de 9 motivos (`Agenda Vendedor.dc.html:351`) que **no
coincide** con el catálogo del backend: mezcla en un nivel lo que `pl_motivo` separó en `visita`
(Cerrado, Vacaciones, No atiende) y `rubro` (…, No lo ofrecí). Como el catálogo ahora es **dato**
(agregar un motivo es un INSERT), el front renderiza lo que devuelve `GET /motivos?nivel=`. Ningún
nombre de motivo queda escrito en el código.

El prototipo **no** cubre, porque son nuevos del backend: abrir/cerrar la vuelta, "no visité", y
retomar la carga de rubros de una visita cerrada con pendientes. El botón "Nota" que dibuja el
prototipo queda **fuera de alcance**: no existe en el front ni tiene endpoint en el contrato.

## 2. Decisiones

### 2.1 Un solo board con modo `operable | preview`

Las flechas de semana del header (hoy tiran un toast) pasan a ser el navegador de ciclos. Un estado
`semanaVista` decide todo:

- `semanaVista === cicloAbierto.semana` → board **operable** (visitas, resolución, reagendar)
- otra semana → mismo board en **preview**, cards sin acciones
- sin ciclo abierto → todas son preview, con CTA **"Abrir semana N"**

El vendedor puede espiar otras semanas con la vuelta en curso. Un componente de board y un endpoint
alimentan los tres estados, usando un control que el prototipo ya tiene dibujado en vez de agregar
pantallas.

### 2.2 Endpoint nuevo: `GET /planificacion/ciclo/preview?semana=N`

`semana` es **opcional**: si se omite, el backend usa `proponerSemana()` y **devuelve cuál eligió**.
Eso resuelve un problema que si no exigiría otro endpoint — sin ciclo abierto el front no puede
saber cuál semana proponer, porque no conoce la última cerrada.

```jsonc
{ "ok": 1, "data": {
    "semana": 3,
    "clientes": 39,
    "omitidos": ["6836"],           // en el insumo externo, no en el padrón
    "dias": { "LUN": [/* cards */], "MAR": [], "MIE": [], "JUE": [], "VIE": [] }
}}
```

**Por qué hace falta, si la rotación es fija.** El spec del backend asume que no hay decisión que
tomar: `proponerSemana()` da "la siguiente a la última cerrada, con wrap 5 → 1", y el parámetro
`semana` de `abrir` es un escape hatch. Bajo ese supuesto un preview es superfluo. Pero sigue
haciendo falta por dos razones que el propio backend expone:

1. Abrir **congela el plan y no hay forma de descartarlo** desde la app. Es la única acción
   irreversible del flujo y hoy se toma a ciegas.
2. `abrir()` devuelve `omitidos` **después** de congelar. Verlos antes es la diferencia entre
   arrancar sabiendo que faltan 3 clientes y descubrirlo con la vuelta abierta.

**Tres decisiones del endpoint:**

- **Las cards del preview son un tipo distinto.** Un preview no tiene fila de plan (sin
  `cicloClienteId`) ni resolución (sin `estado`/`visitaId`). Reusar `IAgendaClient` con esos campos
  nullables dejaría que una card de preview llegue a `iniciarVisita()` y falle en runtime. En cambio
  `IPreviewClient = IVisitClientCard & { dia }`, y **el compilador** garantiza la compuerta del modo,
  no un `if` que alguien puede olvidar.
- **`preview()` y `abrir()` comparten la lectura del plan.** Hoy `abrir()` filtra asignaciones por
  `s{n}d`, pide cards al padrón y separa válidas de omitidas, todo inline. Si el preview lo
  reimplementa, las dos divergen con el primer cambio y el vendedor previsualiza una cosa y congela
  otra. Se extrae un privado `resolverPlan(vendedor, semana) → { validas, omitidos }` y lo usan
  **las dos**.
- **El preview no rechaza una semana vacía.** `abrir()` tira `422 CICLO_SIN_CLIENTES` y está bien.
  Navegando, "esta semana no tiene clientes" es información legítima: `200` con `clientes: 0`. Si
  copiara el 422, hojear produciría errores en vez de datos.

No exige ciclo abierto. Lee el insumo externo **en vivo**, no un snapshot: si el área que mantiene
la asignación la edita entre que el vendedor mira y abre, lo congelado puede diferir. Es inherente al
modelo (el snapshot existe por eso) y la respuesta de `abrir` sigue siendo la verdad de qué quedó.

### 2.3 Gerencia no accede: queda vendedor-only

`GET /ciclo/preview` va con `authorize('vendedor')` como el resto del dominio. Hoy un rol de gerencia
recibe `403` en la ruta, y si llegara al servicio recibiría `400 SELLER_CODE_UNRESOLVED`, porque su
`sellerScope: 'unrestricted'` hace que `resolveSellerCodes()` devuelva `null` y
`resolveSellerCode()` lo colapse a `[]`. Las dos capas dicen lo mismo y **no es un bug**.

Aceptar un código de vendedor desde el cliente es lo que el spec del backend prohíbe explícitamente.
El motivo es más fuerte que un permiso: el dominio es en primera persona. `pl_ciclo_semana` tiene
UNIQUE de una vuelta abierta **por vendedor** y `pl_resolucion` guarda `coord_inicio`/`coord_final`.
Si gerencia pasara `?codigoVendedor=X`, abrir un ciclo o iniciar una visita escribiría cobertura en
nombre de otro con la geolocalización del celular equivocado. No sería un permiso faltante: serían
datos falsos.

La necesidad legítima (gerencia quiere mirar) se resuelve con endpoints de lectura aparte, y está
anotada como backlog v2 en `CLAUDE.md` ("pantalla de control de cumplimiento… vista supervisor").
Cuando llegue, el seam correcto es `resolveSellerCodeFor(user, solicitado?)`, que acepte un código
explícito **solo cuando el scope del rol lo permite** (`allowedSellerCodes === null` = cualquiera;
lista = tiene que estar en ella), reusando el resolver que ya existe en vez de inventar reglas.

### 2.4 La geolocalización BLOQUEA — override de §6/§10 del spec del 22/07

`docs/superpowers/specs/2026-07-22-app-planificacion-design.md` decide lo contrario:

> **§6** — "si el vendedor no da permiso de ubicación, **se permite iniciar/cerrar la visita igual**
> (sin coords), con aviso — no se bloquea el flujo comercial."
> **§10** — "**no debe bloquear el flujo comercial** por un permiso de ubicación denegado."

**Este diseño lo revierte, a propósito.** El spec original tiene una contradicción interna: el mismo
§6 dice que el propósito del dato es la validación — "compara `coord_inicio` contra `coord_cliente`
dentro de una tolerancia en metros para marcar la visita como **válida** (que estuvo realmente en el
cliente)". Un dato cuyo fin es verificar presencia, pero cuya captura es voluntaria **para el
verificado**. Negar el permiso una vez deja todas las visitas con `null` y la métrica se vuelve
opt-out. La decisión vieja pesó "no frenar el flujo comercial" y no pesó que el vendedor puede
mentir.

**No modificar este bloqueo citando §6/§10: están superseded por este documento.**

Se distinguen dos fallas que el código actual colapsa en el mismo `null`:

```ts
type GeoResult =
    | { ok: true;  coord: string; precisionM: number }
    | { ok: false; motivo: 'denegado' | 'sin_senal' | 'no_soportado' }
```

Dos etapas, que es lo que hace **viable** bloquear:

1. `enableHighAccuracy: true`, timeout 8s → GPS fino.
2. Si falló por timeout o posición no disponible (**no** si fue denegado): reintento con
   `enableHighAccuracy: false`, timeout 15s → triangulación wifi/antena. Gruesa, pero devuelve fix
   casi siempre que el permiso esté dado, y para confirmar presencia contra `coord_cliente` alcanza.

`PERMISSION_DENIED` corta en seco sin etapa 2: es el caso deliberado. `sin_senal` bloquea también,
pero con "Reintentar" — el vendedor honesto sale a la puerta y resuelve. `no_soportado` escala a
sistemas.

Bloquea **inicio y cierre**: presencia y duración son las dos mitades del dato, y bloquear solo el
inicio deja el cierre falsificable.

**Validación en el backend, no solo en el front.** `POST /visitas` y `PUT /visitas/:id/cerrar`
rechazan con `400 COORD_REQUERIDA` si viene null; se agrega el código al enum de
`PlanificacionErrorResponse`. El front corre en el teléfono del vendedor, o sea en manos de quien
tiene el incentivo de esquivar la regla: validar solo ahí sería un cartel, no una garantía. Hoy el
controller hace `coordInicio ?? null` y **los specs del plan afirman `null` como camino válido**
(`VisitasService.iniciar(user, { cicloClienteId: 11, coordInicio: null })` y el equivalente en
`cerrar`); esos tests cambian. Las columnas del DDL quedan `NULL`: sin migración, y las filas
históricas siguen válidas.

**La trampa del subsuelo, y por qué es tolerable.** Si el vendedor inicia afuera y no puede cerrar
adentro, queda con la visita abierta y la semana no cierra. Tres cosas la desactivan:

1. La etapa 2 devuelve fix casi siempre que el permiso esté dado.
2. `PUT /visitas/:id/rubros/:rubroId` **no exige que la visita esté abierta ni cerrada**: el vendedor
   carga toda la resolución comercial igual. El bloqueo demora el cierre, **no el trabajo**.
3. Una visita abierta es recuperable en cuanto hay señal. Es demora, no pérdida de datos.

**Omisión consciente:** no se guarda la precisión del fix. Un punto de 8 m y uno de 600 m tienen
valor de verificación muy distinto, y la fórmula de efectividad compara con tolerancia en metros —
pero no hay columna, y meterla en `coord_inicio` (`"lat,lng,acc"`) rompería a quien parsee ese
string. Con la etapa 2 activa parte de los puntos van a ser gruesos y quien analice tiene que
saberlo.

### 2.5 La resolución por rubro ya está construida: se recablea, no se rediseña

`components/propuesta/ResolucionRubro.tsx` + `RubroCard.tsx` implementan la UI del prototipo. Lo que
no hacen es persistir: `TAGS` está hardcodeado con las 9 etiquetas del prototipo y
marca/competidor/diff viven en `useState` local que se descarta. El comentario del código lo dice:
*"not persisted anywhere… the real seguimiento is the per-visit motivo sent to Cromo at cierre"*.

Cuatro cambios:

- `TAGS` → prop `motivos: IMotivo[]` (nivel `rubro`), opciones keyeadas por `motivoId`, no por el
  string de la descripción.
- `tag === 'Precio'` → `motivo.requiereDetalle`. Agregar un motivo al catálogo es un INSERT y
  aparece solo.
- El detalle pasa a ser **por motivo, no por rubro**: en la tabla las columnas viven en la fila
  `(visita_rubro_id, motivo_id)`. Hoy da igual porque solo Precio pide detalle, pero modelarlo por
  motivo es lo que hace que un segundo motivo con `requiereDetalle` funcione sin tocar código.
- "Listo" persiste con `PUT /visitas/:id/rubros/:rubroId`. El PUT **reemplaza, no acumula**, así que
  reabrir y destildar borra bien.

### 2.6 Dos sheets con el mismo cromo visual

El prototipo muestra una hoja continua ("PROPUESTA COMERCIAL / Almacén Don José" → "‹ Resolución /
Amortiguadores"); eso se conserva pasando el mismo `title`/`eyebrow` al `BottomSheet`. Por dentro son
dos estados con datos de distinta forma:

- **`PropuestaSheet`** (existente, pre-visita): rubros desde `usePropuesta`
  (`/sale/rubro/recommendations`), solo lectura, + "Ver versus" + **"Iniciar visita"**.
- **`VisitaSheet`** (nuevo, visita en curso o cerrada con pendientes): rubros desde
  `getRubros(visitaId)` — la **propuesta congelada** — resolubles uno por uno, + "Cerrar visita". Un
  flag `visitaCerrada` esconde el CTA de cierre cuando se entra solo a completar rubros.

Son dos fuentes a propósito: antes de iniciar no existe snapshot, y una vez que existe **el snapshot
es la verdad**. Ambas salen del mismo `RubroRecommendationService`, así que la lista se ve igual; lo
que cambia es que una está congelada.

**Consecuencia del modelo que la UI tiene que hacer visible:** los rubros propuestos **no se pueden
borrar** (`RUBRO_DE_PROPUESTA`). Si el vendedor no ofreció uno, el único camino es resolverlo con
**"No lo ofrecí"**. Si eso no queda evidente, se queda con rubros pendientes que no puede sacar y la
semana no cierra.

## 3. Arquitectura del front

### 3.1 Tipos

Hoy `IAgendaClient` mezcla datos del cliente, posición en la agenda y campos solo-front, con casi
todo opcional *"porque esta app es un consumidor parcial/defensivo"*. Esa opcionalidad ahora es un
riesgo: con `cicloClienteId` opcional, `iniciarVisita({ cicloClienteId: undefined })` **compila**.
Regla nueva: **lo que el OpenAPI marca `required`, es requerido en el tipo**.

```
IVisitClientCard                        // datos de fct_clients (se extrae)
IAgendaClient  extends IVisitClientCard // + cicloClienteId, dia, estado, visitaId, rubrosPendientes
IPreviewClient extends IVisitClientCard // + dia  → no se puede operar
```

Se borran `visit`, `resuelto`, `enCurso`, `ISeguimientoResult`, `IReintentarSeguimientoDTO` y la
función `reintentarSeguimiento()`. `horaVisita` sobrevive (sigue sin backend, `mockAgendaData.ts`).

`resuelto` se reemplaza por `lib/estadoCiclo.ts`:

```ts
// visitada | no_visita | reagendada cuentan como resueltos.
// 'en_curso' NO: la visita está abierta y la semana no puede cerrar con eso.
export const estaResuelto = (e: EstadoCicloCliente) =>
    e === 'visitada' || e === 'no_visita' || e === 'reagendada'
```

Este helper vive en el front (el backend contesta esa pregunta en SQL para no traer las 40 filas):
acá los contadores de `DiaTabs` y el progreso del header lo necesitan sobre datos ya en memoria.

### 3.2 Capa de API

`src/api/planificacion.ts` — 16 wrappers finos que devuelven `res.data.data`:

| función | endpoint |
|---|---|
| `getCicloActual()` | `GET /ciclo/actual` |
| `getCicloPreview(semana?)` | `GET /ciclo/preview` ← nuevo |
| `abrirCiclo(semana?)` | `POST /ciclo/abrir` |
| `cerrarCiclo()` | `POST /ciclo/cerrar` |
| `reagendarCicloCliente(id, dia)` | `PATCH /ciclo-cliente/:id/reagendar` |
| `getAgendaSemana()` | `GET /agenda/semana` — sin params |
| `getAgendaDia(dia)` | `GET /agenda/dia` — sin `fecha` |
| `getMotivos(nivel?)` | `GET /motivos` |
| `getVisitaActiva()` | `GET /visitas/activa` |
| `iniciarVisita({cicloClienteId, coordInicio})` | `POST /visitas` |
| `cerrarVisita(id, {coordFinal})` | `PUT /visitas/:id/cerrar` |
| `registrarNoVisita({cicloClienteId, motivoIds})` | `POST /visitas/no-visita` |
| `getRubros(visitaId)` | `GET /visitas/:id/rubros` |
| `agregarRubro(visitaId, dto)` | `POST /visitas/:id/rubros` |
| `resolverRubro(visitaId, rubroId, {motivos})` | `PUT /visitas/:id/rubros/:rubroId` |
| `eliminarRubro(visitaId, rubroId)` | `DELETE /visitas/:id/rubros/:rubroId` |

`getPropuesta()` (`POST /sale/rubro/recommendations`) queda **sin cambios**: ese endpoint no es parte
del dominio de planificación y sigue alimentando la vista pre-visita de `PropuestaSheet` (§2.6).

`src/lib/apiError.ts` (nuevo): el front ramifica por `code`, no por status — `409` significa cinco
cosas distintas. Un `errorCode(err): string | null` en un solo lugar, en vez de destripar
`err.response.data.code` en cada componente.

`src/api/apiClient.ts`: se elimina la excepción `code?.startsWith('CRM_')` del interceptor de 401.
Su único consumidor era `reintentarSeguimiento`, cuyo endpoint desaparece — dejar un caso especial
cuya justificación ya no existe es peor que sacarlo.

### 3.3 Hooks

Nuevos: `useCiclo.ts` (`useCicloActual`, `useCicloPreview`, `useAbrirCiclo`, `useCerrarCiclo`,
`useReagendar`) y `useRubros.ts` (`useRubros`, `useResolverRubro`, `useAgregarRubro`,
`useEliminarRubro`). `useVisitas` pierde el seguimiento y cambia firmas.

Invalidaciones: las mutaciones que tocan el plan invalidan `agendaKeys.semana` + `['ciclo','actual']`;
las de rubros invalidan `['rubros', visitaId]` **y** la agenda, porque `rubrosPendientes` vive en la
card.

### 3.4 Componentes

`AgendaSemanaPage` (hoy 176 líneas) queda como shell delgado: dueño de `semanaVista`, decide `modo` y
qué hook alimenta el board. Con ciclo + preview + no-visita + rubros + cerrar semana metidos ahí se
iría de las manos, así que:

- **`VisitaFlow`** (nuevo) — el flujo completo: propuesta → iniciar → rubros → cerrar.
- **`VisitaSheet`** (nuevo) — rubros congelados + resolución por rubro (§2.6).
- **`CerrarSemanaSheet`** (nuevo) — las dos listas de bloqueo del 409.
- **`ResolucionSheet`** (existente) — se reusa para "no visité", con `motivos` de nivel `visita`.
- **`AppHeader`** — recibe `modo` para diferenciar preview de operable y hospedar el CTA "Abrir
  semana N"; las flechas mueven `semanaVista` con wrap 1..5.
- **`AccountMenu`** — recibe "Cerrar semana". Es una acción de una vez por semana: no merece espacio
  permanente en la pantalla de trabajo.

**`ClienteCard`** — tres acciones no entran en fila en una columna de 273px ("Reagendar" con ícono no
cabe en ~77px). Layout que además respeta el peso visual del prototipo:

```
┌───────────────────────────┐
│ ◴ 08:30      2 sin cargar │
│ Almacén Don José          │
│ ◎ Av. San Martín 100      │
│ ✆ (0351) 15-600-0000      │
│ ┌───────────────────────┐ │
│ │   ⚡ Propuesta        │ │
│ └───────────────────────┘ │
│ ┌─────────┐ ┌──────────┐  │
│ │Reagendar│ │No visité │  │
│ └─────────┘ └──────────┘  │
└───────────────────────────┘
```

Los estados pasan de 2 a 5: `pendiente` (default), `en_curso` (badge naranja, existe), `visitada`
(check verde + tachado, existe), y dos nuevos `no_visita` y `reagendada`. Más el badge de
`rubrosPendientes > 0` sobre una visitada, que es la entrada para retomar la carga.

## 4. Errores

**Lo que parece error y es un estado.** `409 CICLO_NO_ABIERTO` no debería llegar nunca como error:
`GET /ciclo/actual` devuelve `200` con `data: null`, así que el front **sabe antes de preguntar** —
`useAgendaSemana({ enabled: !!cicloActual })`. El 409 queda como red de contención para la carrera
(cerraste la vuelta en otra pestaña). Ramificar la pantalla sobre un error HTTP sería frágil;
ramificar sobre `cicloActual === null` es un dato.

`409` en `/ciclo/cerrar` es **el único endpoint con forma irregular**: devuelve `ok: 0` pero **con
`data`** (las dos listas), no con `code`. El front lee `err.response.data.data`.

| código | reacción |
|---|---|
| `VISITA_YA_CERRADA` | **tratar como éxito.** La visita está cerrada, que es lo que el vendedor quería. Invalida y cierra el sheet, sin cartel de error. |
| `CICLO_ABIERTO_EXISTENTE` | ya hay vuelta (otra pestaña / doble tap). Refetch de `cicloActual` y entrar al board. |
| `VISITA_ACTIVA_EXISTENTE`, `CICLO_CLIENTE_YA_RESUELTO` | la agenda está vieja. Invalidar agenda + avisar, sin dejarlo reintentando contra datos rancios. |
| `CICLO_SIN_CLIENTES` (422) | la carrera del insumo en vivo: viste clientes en el preview y al abrir ya no estaban. Refetch del preview. |
| `SELLER_CODE_UNRESOLVED` / `_AMBIGUOUS` | **no reintentable.** Es configuración de la cuenta: mensaje distinto, sin botón de reintentar. |
| `COORD_REQUERIDA` | no alcanzable por UI (el front bloquea antes). Fallback. |
| `MOTIVO_DETALLE_REQUERIDO`, `PCT_DIFERENCIA_INVALIDO` | prevenidos en el cliente (confirmar deshabilitado hasta completar). Fallback igual. |
| `RUBRO_DE_PROPUESTA` | no alcanzable (el borrar solo aparece con `esPropuesto === false`); fallback que apunta a "No lo ofrecí". |

**Fallo de red no pierde lo tipeado.** No hay cola offline en el alcance (el PWA da shell offline, no
mutaciones diferidas). Si el `PUT` del rubro falla, el sheet **mantiene su estado** en lugar de
cerrarse: el vendedor escribió marca, competidor y porcentaje, y perder eso por un bache de señal lo
entrena a no cargarlo más.

## 5. Testing

Vitest. El repo tiene test por componente y por hook, así que esto es tanto trabajo como el código.
TDD igual que el plan del backend: test primero, verificar que falla, implementar.

**Front:**

- `api/planificacion.test.ts` — las 16 funciones: URL, params y **forma exacta del body**. Acá van
  los tests de regresión del contrato viejo: que `cerrarVisita` mande **solo** `coordFinal` y nunca
  `motivoIds`, que `getAgendaSemana` no mande `semana`, que `iniciarVisita` mande `cicloClienteId` y
  no `codigoParticularCliente`.
- `lib/geolocation.test.ts` — el más importante: denegado ⇒ `getCurrentPosition` llamado **una sola
  vez** (no hay etapa 2); timeout ⇒ segunda llamada con `enableHighAccuracy: false`; etapa 2 exitosa
  ⇒ `ok: true`; ambas fallan ⇒ `sin_senal`.
- `AgendaSemanaPage.test.tsx` — la máquina de modos: `cicloActual === null` ⇒ picker y **cero
  llamadas a `/agenda/semana`**; `semanaVista ≠ abierta` ⇒ preview sin botones de acción; iguales ⇒
  operable.
- `ResolucionRubro.test.tsx` — que no quede **ningún nombre de motivo hardcodeado**: se renderiza lo
  que trae el catálogo, y el detalle se pide por `requiereDetalle`, no por `descripcion === 'Precio'`.
- `CerrarSemanaSheet.test.tsx` — la forma irregular del 409 (`data` en un `ok: 0`).
- Actualizados: `ClienteCard.test.tsx` (5 estados, badge de pendientes, 3 acciones), `useVisitas`,
  `useAgenda`, `useMotivos`. Nuevos: `useCiclo`, `useRubros`, `VisitaSheet`, `lib/estadoCiclo`,
  `lib/apiError`.

**Backend:**

- `CicloService.preview` — semana omitida ⇒ usa la propuesta y la devuelve; semana vacía ⇒ `200` con
  `clientes: 0` (no 422); omitidos reportados.
- **Un test del invariante, no de las funciones por separado:** `preview()` y `abrir()` sobre el mismo
  fixture ven **el mismo conjunto de clientes**. Es la propiedad que importa (que no divergan), y
  probar cada una aislada no la cubre.
- Validación de coords: `400 COORD_REQUERIDA` en iniciar y cerrar, **y actualizar los specs
  existentes** que hoy afirman que `null` es válido.

## 6. Trabajo en el repo del backend

Va en el worktree `planificacion-backend`, en commits propios:

1. `CicloService.preview()` + `resolverPlan()` extraído de `abrir()`, `previewCiclo` en el controller
   (mismo `try/catch` inline con `CustomError`), ruta, tipos, schema + path en `docs/planificacion.yaml`,
   specs de servicio y controller.
2. Validación `COORD_REQUERIDA` en `iniciarVisita` y `cerrarVisita`, código en el enum de
   `PlanificacionErrorResponse`, y actualización de los specs que afirman `null` válido.

## 7. Fuera de alcance

- Vista supervisor / acceso de gerencia (§2.3) — backlog v2.
- Aviso a Cromo: fuera de alcance en el backend, así que no hay nada que consumir. Se borra el código
  del front que lo intentaba.
- Botón "Nota" del prototipo: sin endpoint en el contrato.
- Cola de mutaciones offline.
- Guardar la precisión del fix de geolocalización (§2.4).
- Horarios de visita reales: `horaVisita` sigue mockeado en `mockAgendaData.ts`.
