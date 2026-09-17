# Visita de alta: "Cliente nuevo" en la agenda

**Fecha:** 2026-09-17
**Estado:** diseño validado con el usuario, pendiente de plan de implementación
**Alcance:** dos repos — `api-vendedores` (dos columnas, un endpoint, agenda, Cromo, analítica) y
`app-planificacion` (botón, formulario, card y sheet en variante alta)
**Depende de:** [`2026-08-12-visita-extra-buscador-design.md`](2026-08-12-visita-extra-buscador-design.md)
(introduce `es_extra` y `crearExtra`, el mecanismo que esta feature reusa) y
[`2026-09-11-observaciones-generales-de-la-visita-design.md`](2026-09-11-observaciones-generales-de-la-visita-design.md)
(el texto libre de la visita, que acá es el canal principal del "motivo").

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos mandan.

## El problema

Los vendedores hacen visitas para **dar de alta clientes nuevos**. El comercio todavía no existe como
cliente: no está en `fct_clients`, no tiene código, no tiene coordenadas, no tiene historial sobre el
que calcular una propuesta. Hoy el sistema no puede registrar esa visita, porque toda resolución cuelga
de una fila del plan y toda fila del plan exige un `codigo_particular_cliente` real.

En el sistema viejo (Lupa + api-mobiliza) la salida era un **cliente genérico compartido** por todos
los vendedores, para trackear al menos ubicación y tiempo. El registro comercial quedaba en Cromo,
escrito a mano sobre el cliente genérico **NUEVA ALTA CRM (código 09895)** con etiquetas como
`ALTA`, `PROPUESTA`, `SEGUIMIENTO`, `CUPO`: "nueva alta AUTOPARTES PICHE'S, hacemos nueva alta en
Salliqueló, indagamos que trabaja en amortiguador TRW…". Ese genérico no dejó rastro en ningún repo:
era una convención de datos en Cromo, no código.

Dos cosas del relevamiento fijan el diseño:

- **El alta normalmente viene pactada por otro canal y puede posponerse.** No es un hecho espontáneo:
  es algo que el vendedor sabe que va a hacer tal día, y que a veces se corre. Eso pide que exista en
  la agenda **antes** del hecho, con la posibilidad de moverlo.
- **El "motivo" del alta es texto libre.** Es lo que escriben hoy en Cromo y funciona para leer caso
  por caso. Lo estructurado que sí conviene guardar son los superrubros y artículos ofrecidos con su
  resultado por rubro, que el sistema ya tiene.

## La decisión: el alta es una fila del plan, no una tabla nueva

Se evaluaron tres caminos y se eligió reusar `pl_rotacion_cliente`:

| camino | por qué no / por qué sí |
|---|---|
| **Cliente genérico en el plan** (repetir el sistema viejo con el 09895 como `codigo_particular_cliente`) | El `UNIQUE (rotacion, cliente, semana, dia)` permite una sola alta por día por vendedor. La card mostraría dirección y descuentos de un cliente falso. La propuesta se calcularía sobre nada. Reintroduce lo que el modelo nuevo vino a sacar. |
| **Tabla `pl_prospecto` propia** con cita, estado y varios intentos | Aislada, pero duplica lo que la fila del plan ya hace: aparecer en la agenda de un día, moverse auditada, resolverse una vez. Y obliga a un segundo "reagendar" y a mezclar dos fuentes en la agenda. |
| **Fila del plan con `tipo = 'alta'`** ✔ | La fila del plan **ya es una cita**: vive en la agenda de un día, `reacomodar` la mueve con auditoría en `pl_reacomodacion`, y `pl_resolucion` la resuelve una sola vez. Los datos del comercio, que nadie agrupa, van en JSON como ya hace `pl_ofrecimiento.detalle`. La cobertura ya filtra `es_extra = 0`, así que una fila de alta marcada como extra queda fuera del denominador sin tocar la query. |

La regla del modelo se mantiene intacta: **un hecho pertenece a alguien y a un momento.** Acá ese
alguien es un comercio que todavía no es cliente, representado por su fila del plan.

## Datos

### `pl_rotacion_cliente`: dos columnas nuevas

```sql
ALTER TABLE pl_rotacion_cliente
  ADD COLUMN tipo    VARCHAR(20) NOT NULL DEFAULT 'cliente',  -- 'cliente' | 'alta'
  ADD COLUMN detalle JSON        NULL;                         -- solo tipo='alta'
```

- **`tipo`** es una columna propia y **no se recicla `es_extra`** para esto. La fila de alta lleva
  `es_extra = 1` porque está fuera del plan materializado, pero "fuera del plan" y "no es un
  cliente" son dos propiedades distintas: mañana puede haber una extra sobre un cliente real (ya
  existe) y un alta que sí venga planificada desde arriba.
- **`detalle`** guarda lo del **comercio**, que es estable entre intentos:

  ```json
  { "nombre": "Autopartes Piche's", "razonSocial": "Piche Hnos. S.R.L.", "direccion": "Av. San Martín 811, Salliqueló" }
  ```

  Solo `nombre` es obligatorio. `razonSocial` y `direccion` son opcionales y editables mientras la fila
  esté pendiente o la visita abierta. Va en JSON y no en columnas porque **nadie va a hacer `GROUP BY`
  razón social**; el criterio de "columnas para agrupar" de `pl_resolucion_motivo` no aplica acá. Es
  `NULL` para toda fila `tipo = 'cliente'`.

- **`codigo_particular_cliente`** lleva un **código sintético generado por la API**: `ALTA-` +
  el `id` de la fila con ceros a la izquierda (`ALTA-000123`). La columna es `NOT NULL` y forma
  parte del `UNIQUE`, así que no puede ir vacía ni valer el 09895 de Cromo (dos altas el mismo día
  chocarían). Como el `id` es `AUTO_INCREMENT` y el código lo incluye, el insert es en dos pasos
  dentro de una transacción: se crea la fila con un código provisorio único
  (`ALTA-<uuid>`) y se actualiza al definitivo con el `id` ya asignado. El prefijo `ALTA-` no
  colisiona con ningún código real: los códigos particulares son numéricos.
- El `UNIQUE (rotacion_id, codigo_particular_cliente, semana, dia)` sigue valiendo: cada alta tiene su
  propio código, así que N altas el mismo día son N filas.

### `pl_resolucion`: una columna nueva

```sql
ALTER TABLE pl_resolucion ADD COLUMN detalle JSON NULL;  -- solo visitas de una fila tipo='alta'
```

Guarda lo de la **persona contactada en esa visita**, que puede cambiar entre intentos (la primera
vez atendió el encargado, la segunda el dueño):

```json
{ "contacto": "Gustavo", "fechaNacimiento": "1978-03-14" }
```

Ambos opcionales. Se escriben al cerrar (`PUT /visitas/:id/cerrar`) o al registrar `no_visita`, junto
con `observaciones`. **`tipo` de la resolución no cambia:** la visita de un alta es una resolución
`visita` o `no_visita` común. Su naturaleza de alta la da el `tipo` de la fila del plan, no la
resolución. Así `TipoResolucion` sigue con dos valores y nada de lo que ramifica por tipo se toca.

### Lo que NO se agrega

- Ninguna tabla nueva.
- Ningún nivel nuevo en `pl_motivo`. El "por qué no se dio de alta" queda en `observaciones`, como
  hoy en Cromo. El dato estructurado del alta son los ofrecimientos con su resultado: con eso se
  responde "cuántas altas terminaron en pedido". Si gerencia pide agrupar por objeción, se siembra un
  nivel `alta` en el catálogo, que es un `INSERT` y no un deploy.
- Ningún vínculo con el cliente real que después se cree en `client-service`. Cuando aparezca la
  necesidad de cerrar ese ciclo, es una clave más dentro de `detalle` (`codigoClienteFinal`).

## El ciclo de vida, con lo que ya existe

| momento | qué pasa | mecanismo |
|---|---|---|
| **Pactó el alta** | Toca "Cliente nuevo" en la agenda del día, carga nombre (obligatorio), razón social y dirección (opcionales), elige el día. Aparece la card. | endpoint nuevo `POST /planificacion/altas` → fila `tipo='alta'`, `es_extra=1`, en `(zona en curso, dia)` |
| **Se corrió de día** | "Reagendar" en la card, como cualquier cliente. Queda pendiente. | `reacomodar`, auditado en `pl_reacomodacion` con `origen='vendedor'` |
| **Llegó** | "Iniciar visita". Captura ubicación. **Sin gate de distancia**: no hay coordenada contra la que comparar, y la app ya va al flujo sin mapa cuando el cliente no tiene lat/lng. | `iniciarVisita` común. `coord_inicio` pasa a ser **la ubicación real del comercio**, dato que el genérico viejo nunca dio |
| **Ofreció** | Sheet de visita en variante alta: sin propuesta congelada (no hay historial), solo la banda "Otros rubros" sobre el catálogo de superrubros y el buscador de artículos. Resultado por rubro con el catálogo de siempre. | `pl_ofrecimiento` con `es_propuesto=0`, `origen='manual'`, `tipo` `rubro`/`articulo`; `pl_ofrecimiento_motivo` |
| **Cerró** | Contacto, fecha de nacimiento y observación libre. Captura ubicación. | `cerrarVisita` con `detalle` y `observaciones` |
| **No se concretó** | "No visité" con motivo del picklist (Cerrado, No atiende…) y observación. | `no_visita` común. La fila queda resuelta |
| **Va a volver a intentar** | Desde la card resuelta como `no_visita`: "Volver a agendar" crea **otra** fila de alta copiando `detalle`, en el día elegido. | `crearExtra`-like con el JSON copiado. Igual que el buscador crea una extra cuando la anterior ya está resuelta. Las filas resueltas no se mueven (`FILA_RESUELTA`), así que el segundo intento es una fila nueva a propósito |
| **Se cayó** | Fila pendiente que ya no tiene sentido: "Quitar" de la agenda. | el soft-delete de fila que ya existe (`deleted_at`, spec `2026-09-09-quitar-cliente-rotacion-actual`) |

**El mínimo de rubros para cerrar cambia solo para el alta.** Con clientes es `min(2, ofrecidos)`;
en un alta no hay propuesta, así que `ofrecidos` arranca en 0 y ese mínimo se auto-satisface. Para
que no quede una visita vacía, el alta exige **al menos un ofrecimiento resuelto o una observación
no vacía**. Es un gate del front, igual que el actual.

## Cromo

Se mantiene la costumbre de los vendedores, pero automatizada: el evento del alta se manda al cliente
genérico de Cromo con la etiqueta que ya usan.

- `CrmEventoVisitaService.notificar` recibe la fila. Con `fila.tipo === 'alta'`:
  - **no busca la ficha en el warehouse** (hoy `getVisitCardsByParticularCodes` → un alta caería en
    `CLIENTE_SIN_FICHA` y quedaría pendiente para siempre);
  - `codigo_cliente: '09895'`, `client_name` y `telefono_1` salen de `fila.detalle` (teléfono vacío);
  - agrega la etiqueta **`ALTA`** a las que ya arma por tipo y por resultado de rubro;
  - la narrativa arranca con el comercio: `Nueva alta <nombre> (<razón social>, <dirección>). ` y sigue
    con la narrativa de rubros de siempre, el contacto si lo hay, y la observación al final vía
    `conObservacion`.
- El `09895` va en `config/cromoTags.ts` como constante nombrada (`CLIENTE_GENERICO_ALTA`), al lado
  de `TAG_POR_TIPO`, con el mismo criterio de ese archivo: es una llave fija que un seed mal cargado
  dejaría en silencio.
- La idempotencia (`yaSeEnvioSeguimiento`) y el fire-and-forget no cambian.

## Analítica

- **Cobertura:** sin cambios. `findCobertura` ya filtra `rc.es_extra = 0`, y las altas son extra.
- **Fuera de plan:** `findVisitasFueraDePlan` suma `AND rc.tipo = 'cliente'`. Sin eso las altas se
  contarían como visitas extra a clientes, que es otra cosa.
- **Todo lo demás** (visitas, rubros, motivos) hace `JOIN` a `pl_rotacion_cliente` después de filtrar
  por `fecha_inicio`, y una visita de alta tiene fila del plan, así que **entra** en esos reportes con
  su nombre de comercio en lugar del nombre del cliente. Es correcto: son visitas reales con
  ofrecimientos reales. Donde el reporte pinta el nombre desde la ficha del warehouse, cae al
  `detalle.nombre` de la fila, con el mismo fallback que la agenda.
- Un indicador de altas propio (cuántas, cuántas con pedido) **no se construye en este spec**. Queda
  como extensión chica: `WHERE rc.tipo = 'alta'` sobre las queries existentes.

## API (`api-vendedores`)

```
POST /planificacion/altas
     body: { dia: 1..5; nombre: string; razonSocial?: string; direccion?: string }
     → IAgendaClient  (la fila creada, tipo: 'alta', esExtra: true)
     Crea en la zona en curso (ciclo abierto del vendedor del token), como el buscador self-service.
     400 ALTA_SIN_NOMBRE si `nombre` viene vacío tras trim.

PUT  /planificacion/altas/:rotacionClienteId
     body: { nombre?: string; razonSocial?: string; direccion?: string }
     → IAgendaClient
     Edita `detalle` de una fila tipo='alta' propia, mientras esté pendiente o con visita abierta.
     409 FILA_RESUELTA si ya cerró. 404 si la fila no es tipo='alta' o no es del vendedor.

POST /planificacion/altas/:rotacionClienteId/reintentar
     body: { dia: 1..5 }
     → IAgendaClient  (fila nueva, detalle copiado)
     Solo sobre una fila tipo='alta' resuelta como no_visita. 409 ALTA_CONCRETADA si fue visita.
```

Los endpoints existentes que se extienden, sin cambiar su forma:

- `PUT /visitas/:id/cerrar` y `POST /visitas/no-visita` / `POST /visitas/:id/no-visita` aceptan
  `detalle?: { contacto?: string; fechaNacimiento?: string }`. Se valida `fechaNacimiento` como
  `YYYY-MM-DD` y se ignora `detalle` si la fila no es `tipo = 'alta'`.
- `GET /planificacion/agenda/...`: `AgendaService` hoy **omite** la fila si no hay ficha en el
  warehouse (`log.warn('Cliente del plan ausente en fct_clients; se omite')`). Con `tipo = 'alta'`
  arma la card desde `detalle`: `nombreCliente = detalle.nombre`, `direccion = detalle.direccion`,
  `latitud/longitud = null`, sin descuentos ni condición de pago. `IAgendaClient` suma
  `tipo: 'cliente' | 'alta'` y `detalleAlta?: { razonSocial?, direccion? }`.
- `GET /propuesta/:codigo`: no se llama para una fila de alta. El front no la pide, y si la pidiera con
  `ALTA-…` el backend devuelve `rubros: []` sin ir al warehouse.
- El grid de gerencia (`GerenciaRotacionService`) usa la misma construcción de card, así que la fila
  de alta se dibuja con su nombre y se puede mover como cualquier otra.

## App (`app-planificacion`)

- **Botón "Cliente nuevo"** en la agenda del día, junto al buscador de clientes. Abre un sheet con
  nombre del comercio (obligatorio), razón social, dirección, y el día (por defecto el que se está
  viendo). Vocabulario del vendedor: "Cliente nuevo", nunca "alta", "prospecto" ni "extra".
- **Card de alta** en `ClienteCard`: distintivo "Cliente nuevo", nombre y dirección del JSON, sin
  teléfono ni chips de descuento ni condición de pago. Mismas acciones que una card normal (Iniciar
  visita, Reagendar, No visité), más "Editar datos" mientras esté pendiente. Resuelta como `no_visita`
  suma "Volver a agendar".
- **`VisitaFlow`** con `cliente.tipo === 'alta'`: no pide propuesta, va directo a iniciar sin mapa
  (es el camino `!tieneCoords` que ya existe), y no muestra `MapaVisita` en ningún momento.
- **`VisitaSheet`** en variante alta: sin la banda "Tu propuesta", con "Otros rubros" como única
  fuente de filas (superrubros del catálogo y buscador de artículos). El pie cambia el gate: el botón
  de cerrar queda gris hasta que haya al menos un ofrecimiento resuelto o texto en observaciones, con
  el texto `Cargá lo que ofreciste o dejá una observación`. En el cierre se agregan dos campos:
  "Con quién hablaste" y "Cumpleaños" (opcional, fecha).
- **`useAlejadoDelCliente`** no corre para un alta: no hay coordenada del cliente. El cronómetro y el
  semáforo de duración sí, son los mismos.
- **Grid de gerencia** (`/analitica/ruta`): la card de alta se distingue con el mismo distintivo, y
  se puede mover con drag & drop como cualquier fila.

## Lo que se acepta como costo

- **El alta queda atada a la rotación.** Si la vuelta cierra con un alta pendiente, la rotación nueva
  se materializa desde el template y el alta no viene. No se arrastra en este spec; si aparece el caso,
  `materializar` copia las filas `tipo = 'alta'` pendientes de la rotación anterior. Hasta entonces,
  el vendedor la vuelve a crear.
- **Dos altas al mismo comercio son dos filas sin vínculo estructural entre sí**, salvo el
  `detalle` copiado. El hilo queda en Cromo sobre el 09895, que es donde hoy lo leen.
- **El código sintético `ALTA-…` aparece en cualquier lugar que pinte
  `codigo_particular_cliente`** sin pasar por la card (logs, exports crudos). No se esconde: es
  reconocible a simple vista.

## Fuera de alcance

Indicador de altas en `/analitica`, vínculo con el cliente real cuando se cree en `client-service`,
arrastre de altas pendientes al materializar la rotación siguiente, geocodificación inversa de la
dirección desde `coord_inicio`, y un nivel `alta` en el catálogo de motivos.

## Testing

- **api-vendedores:** `POST /altas` crea fila con `tipo='alta'`, `es_extra=1` y código `ALTA-<id>`;
  dos altas el mismo día no chocan; `AgendaService` arma la card desde `detalle` en vez de omitir la
  fila; `findVisitasFueraDePlan` excluye `tipo='alta'`; `findCobertura` no cuenta la fila;
  `CrmEventoVisitaService` manda a `09895` con etiqueta `ALTA` sin tocar el warehouse;
  `reintentar` rechaza una fila concretada; `PUT /altas/:id` rechaza una fila resuelta.
- **app-planificacion:** el botón crea y navega a la card; la card de alta no muestra descuentos ni
  mapa; `VisitaFlow` no pide propuesta con `tipo='alta'`; el gate de cierre del alta exige un
  ofrecimiento resuelto o una observación; los campos de contacto viajan en el cierre y en `no_visita`.
