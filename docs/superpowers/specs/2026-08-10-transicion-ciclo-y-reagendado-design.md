# Transición de ciclo invisible y reagendado a la próxima vuelta

Fecha: 2026-08-10

## Problema

Hoy el vendedor tiene que administrar el ciclo a mano, y las dos operaciones que se le piden son
conceptos del sistema, no de su trabajo:

- **No puede abrir la semana nueva sin cerrar la vieja.** `pl_ciclo_semana` tiene un
  `UNIQUE (vendedor_abierto)` que garantiza un solo ciclo abierto por vendedor, y
  `CicloService.abrir` rechaza con 409 `CICLO_ABIERTO_EXISTENTE` si ya hay uno.
- **No puede cerrar la vieja sin resolver todo.** `CicloService.cerrar` devuelve `cerrado: false`
  si queda un solo cliente sin resolver (`clientesPendientes`) o una sola visita con rubros sin
  cargar (`visitasConRubrosPendientes`).

El resultado es un bloqueo circular el lunes a la mañana, y un vocabulario ("abrir semana",
"cerrar semana") que el vendedor no usa: él piensa "esta semana recorro esta zona".

Falta además la única forma sensata de mover un cliente a otra vuelta.
`PATCH /planificacion/ciclo-cliente/:id/reagendar` solo mueve el `dia` (1..5) **dentro** del ciclo
abierto. Reagendar a la semana que viene **no existe y nunca funcionó**: lo único que hay es el
cableado alrededor, todo inalcanzable porque ninguna línea de código escribe
`pl_resolucion.tipo = 'reagendada'` — el valor está en los tipos de los dos repos,
`estadoCicloCliente.ts` lo mapea, `ClienteCard.tsx:101` tiene el badge, `estaResuelto` lo cuenta
como resuelto y la analítica tiene el bucket `reagendados`.

## Qué decide este spec

Cómo empieza y termina un ciclo sin que el vendedor tenga que pensar en ciclos, y el reagendado a
la próxima vuelta.

**Qué NO decide:** nada mueve clientes solo. No hay arrastre automático de pendientes — ver
"Por qué no hay arrastre".

## El modelo: el ciclo es la semana laboral

Un ciclo **empieza el lunes y termina el viernes, siempre.** No es "una vuelta que dura lo que
dura".

Hoy `pl_ciclo_semana` solo tiene `fecha_apertura`, así que la vida del ciclo habría que inferirla
de cuándo el vendedor tocó el primer botón — y de ahí sale un absurdo: un ciclo abierto un viernes
viviría hasta el viernes siguiente. Se agrega **`fecha_lunes DATE`**: la semana calendario a la
que el ciclo pertenece, resuelta en TZ de negocio (`America/Argentina/Buenos_Aires`, la convención
de `src/lib/fechas.ts`), no en la del dispositivo.

Abrir un viernes graba el lunes de *esa* semana igual. El que empieza tarde no estira su vuelta:
le queda menos semana, y la cobertura lo muestra. Eso es correcto, no un caso a acomodar.

**Los feriados no son un caso especial.** La semana laboral es lunes a viernes tenga cuatro días
útiles o cinco. Un feriado no cambia cuándo cierra el ciclo — cambia cuánto se pudo visitar, que
es lo que la cobertura tiene que reflejar y no compensar. Si el lunes fue feriado y el vendedor
arranca el martes, no hay nada que ajustar.

**Los días que ya pasaron no generan ninguna lógica.** Un cliente sin visitar el lunes sigue
pendiente, y el vendedor decide antes del viernes: moverlo a otro día de esta semana, pasarlo a la
próxima vuelta, o marcarlo como no visité. No hay "día vencido".

## Las dos transiciones

Son distintas y no hay que fundirlas: en una el vendedor no elige nada, en la otra está por partir
una vuelta al medio.

### La normal — cambio de semana laboral

El lunes, al entrar a la app, el ciclo de la semana que pasó **se cierra solo** y **no se abre
nada**: queda en **standby**. El calendario avanzó, el vendedor no eligió nada, así que no se le
pregunta. Se le avisa qué quedó sin visitar.

### La excepcional — cambio de zona dentro de la misma semana laboral

Tiene la semana 2 abierta, es miércoles, y toca una acción sobre un cliente de la semana 4. Acá
**sí** hay cartel con la lista de pendientes y confirmación explícita: es la única situación en la
que un tap parte una vuelta al medio, y como **nada se arrastra**, esos clientes quedan sin
visitar de verdad. El cartel tiene que decirlo así.

El protocolo reusa una forma que ya existe en el dominio: el backend responde **409 con la lista en
`data`** — el mismo 409 irregular (`ok:0` con `data`, no con `code`) que hoy tiene `/ciclo/cerrar`
y que documenta `CerrarSemanaSheet.bloqueosDe`. El front muestra el cartel, el vendedor confirma, y
la acción se reenvía con `confirmarCambioDeSemana: true`.

El 409 deja de ser un error a evitar: **es el mecanismo.**

## Standby y apertura implícita

Se borran del front el CTA "Abrir semana" y `CerrarSemanaSheet.tsx` completo. `abrir()` y
`cerrar()` dejan de ser cosas que el vendedor invoca y pasan a ser pasos internos de una operación
nueva, **`asegurarCiclo(vendedor, semana)`**:

- **Ciclo abierto de esa semana** → se devuelve.
- **Ciclo abierto de otra semana** → 409 con los pendientes (la transición excepcional). Con
  `confirmarCambioDeSemana: true`, cierra la vieja y sigue.
- **Sin ciclo abierto (standby)** → congela el plan de esa semana e **integra los reagendados
  pendientes**.

Lo dispara la primera acción real sobre un cliente (iniciar visita, no visité, reagendar), no un
botón. Eso hace que **congelar el plan pase a ser el efecto secundario de una decisión que el
vendedor ya tomó**, en vez de un compromiso irreversible que tiene que entender de antemano. Nadie
abre un ciclo por error porque nadie abre ciclos.

**La flexibilidad de zona sale gratis de acá.** La semana que se congela es la que el vendedor
estaba mirando cuando actuó. Si esta vuelta le toca la zona 4 en vez de la 3, arranca visitando en
la 4 y el ciclo de la 4 es el que nace. Elegir es trabajar; no hay caso especial ni botón.

Navegar entre semanas sigue siendo gratis y reversible: es `GET /planificacion/ciclo/preview`, que
no congela nada.

## Qué hace el cierre

Una sola transacción sobre el ciclo que se cierra:

1. Cada `pl_visita_rubro` **sin motivos** de las visitas del ciclo → `pl_visita_rubro_motivo` con
   `motivo_id = 16` (`'No lo ofrecí'`, `resultado = 'no_ofrecido'`).
2. El ciclo pasa a `cerrada` con `fecha_cierre`.

Y nada más. **Los clientes sin resolver quedan sin resolver**: sin fila en `pl_resolucion`, o sea
pendientes, o sea no cubiertos. Es el dato honesto de lo que pasó esa semana.

El paso 1 existe porque `RubrosService.resolveVisitaPropia` exige que la visita cuelgue del **ciclo
abierto** (403 `VISITA_AJENA`): si el ciclo se cerrara con rubros sin cargar, esas cargas pasarían
a fallar y el vendedor perdería el trabajo en silencio. Autocompletarlos al cerrar es lo que
permite que el guard quede como está.

`cerrar()` deja de exigir que no haya pendientes. Ese chequeo era el bloqueo circular; la cobertura
ya mide lo que el bloqueo pretendía proteger.

## Por qué no hay arrastre

Se evaluó arrastrar los pendientes al ciclo siguiente (automáticamente, con una resolución nueva
tipo `'arrastrada'` en la vuelta vieja) y **se descartó**.

Un ciclo es un ciclo. Traer pendientes en cantidad no tiene sentido: convierte cada vuelta en el
resto de la anterior, y un cliente que nunca se visita se re-arrastra para siempre sin que nada lo
delate. El único movimiento entre vueltas es **explícito y de a uno**: el vendedor reagenda ese
cliente porque decidió algo sobre él.

Consecuencia buscada: si el vendedor no hizo nada con un cliente, la semana cierra con ese cliente
como no cubierto. El costo del faltazo queda visible en la vuelta donde ocurrió, no diluido hacia
adelante.

## Reagendar a la próxima vuelta

El vendedor no piensa en fechas: piensa "lo veo la semana que viene". Eso **disuelve** la tensión
original ("reagendar se piensa por fecha, pero el ciclo se mide distinto") en vez de resolverla: la
fecha nunca entra al modelo.

Es importante porque el mapeo `fecha → (semana, día)` **no se puede hacer determinístico**: un
ciclo futuro no tiene fecha de apertura hasta que el vendedor actúa en él.

`EstadoVisitaSheet` gana una sección **"La semana que viene"** con sus cinco días, debajo de los de
la semana actual. Elegir uno graba `pl_resolucion` con `tipo = 'reagendada'` y
`dia_deseado = 1..5`. El cliente queda resuelto-como-reagendado en esta vuelta y aparece en el
próximo ciclo el día que el vendedor eligió.

El reagendado **dentro** de la semana no cambia: sigue moviendo `dia` y dejando al cliente
pendiente.

## La primitiva, y el lado que queda preparado

Mover un cliente entre vueltas es **una sola primitiva** vista desde dos lados:

- **Empujar** (se implementa ahora): desde la vuelta vieja, "lo veo la semana que viene".
- **Traer** (queda preparado, sin UI): desde la vuelta activa, sumar un cliente de otra.

Las dos terminan en lo mismo: **una fila `pl_ciclo_cliente` en el ciclo destino con
`en_plan = 0`**, y opcionalmente un `reagendado_de` apuntando a la resolución que la originó. Que
esa columna sea nullable es lo que deja el lado "traer" preparado: una fila `en_plan = 0` sin
origen es un cliente sumado a mano, sin reagendado previo.

Mientras el ciclo destino no exista, la intención vive en la resolución `reagendada`. La bandeja es
**derivada, no una tabla**: resoluciones `tipo = 'reagendada'` del vendedor que ninguna fila
`pl_ciclo_cliente.reagendado_de` referencie todavía. El `UNIQUE` sobre esa columna hace imposible
consumir dos veces el mismo reagendado.

Al congelar el plan de un ciclo nuevo, cada reagendado pendiente inserta su fila con
`dia = dia_deseado`. Si el cliente **ya estaba** en el plan congelado de esa semana (pasa cuando la
rotación vuelve a su zona), el `UNIQUE uq_ciclo_cliente (ciclo_semana_id,
codigo_particular_cliente)` impide el duplicado: se marca `reagendado_de` sobre la fila existente y
el `dia_deseado` pisa el día del plan, porque es intención explícita del vendedor.

### Por qué `en_plan = 0`

`AnaliticaRepository` (línea 121) y `CicloClienteRepository.findCodigosSinResolver` (línea 84) ya
filtran `cc.en_plan = 1`. Un cliente traído con `en_plan = 0` queda entonces, **sin tocar ninguna
query**, fuera del denominador de cobertura de la vuelta que lo recibe.

Eso es lo que se busca: la cobertura de la semana 3 mide la zona 3. El cliente reagendado ya se
contó en la semana 2 —donde se decidió sobre él— y visitarlo en la 3 no infla ni desinfla el
denominador de esa zona.

## Cambios de esquema

```sql
ALTER TABLE pl_ciclo_semana
  ADD COLUMN fecha_lunes DATE NOT NULL;              -- la semana laboral del ciclo

ALTER TABLE pl_resolucion
  ADD COLUMN dia_deseado TINYINT NULL;               -- 1..5, solo en tipo='reagendada'

ALTER TABLE pl_ciclo_cliente
  ADD COLUMN reagendado_de INT NULL,
  ADD UNIQUE KEY uq_reagendado_de (reagendado_de),   -- imposible consumir dos veces
  ADD FOREIGN KEY (reagendado_de) REFERENCES pl_resolucion (id);
```

**No** hace falta ningún valor nuevo de `pl_resolucion.tipo`: se usa `'reagendada'`, que ya está
enhebrado por los tipos, el badge y la analítica. `pl_motivo` tampoco cambia: el autocompletado usa
el motivo 16 existente.

Los ALTER en este repo son intervención manual de ops, así que van documentados en
`docs/db-notes/` junto al `CREATE TABLE` consolidado.

## Cambios de API

- **`POST /planificacion/ciclo/sincronizar`** (nuevo). Idempotente. El front lo llama al montar y
  al volver al foco. Si hay un ciclo abierto cuya `fecha_lunes` es anterior al lunes de esta
  semana, lo cierra. Devuelve el resumen (semana cerrada, clientes que quedaron sin visitar,
  visitas autocompletadas) para el aviso. Endpoint propio y no un efecto lateral de
  `GET /ciclo/actual`, para que un GET no mute. Sin ciclo abierto, o con uno de esta misma semana
  laboral, es un no-op con resumen vacío — nunca un error.
- **Acciones sobre clientes** (iniciar visita, no visité, reagendar): aceptan
  `(semana, codigoParticularCliente)` además de `cicloClienteId`, y un flag
  `confirmarCambioDeSemana`. Es el cambio de contrato más grande de la entrega: hoy las cards del
  preview no tienen `cicloClienteId` y el front lo rellena con `-1`.
- **`PATCH /ciclo-cliente/:id/reagendar`**: acepta `proximaVuelta: true`, que en vez de mover el
  `dia` graba la resolución `reagendada` con `dia_deseado`.
- **`POST /ciclo/abrir` y `POST /ciclo/cerrar`**: el front deja de llamarlos.

## Cambios de front

- Se borran `CerrarSemanaSheet.tsx`, el hook `useCerrarCiclo` y el CTA de abrir semana.
- **`operable` cambia de semántica.** Hoy es `ciclo != null && semanaEfectiva === ciclo.semana`.
  Pasa a: con ciclo abierto, solo esa semana es accionable (igual que hoy, y es lo que sostiene
  "seguí el ciclo"); **en standby, la semana que se está mirando es accionable** y la primera
  acción la congela.
- `EstadoVisitaSheet`: sección "La semana que viene".
- Cartel de cambio de zona intra-semana, alimentado por el 409, diciendo explícitamente que esos
  clientes quedan sin visitar.
- Aviso post-cierre con `useNotificacion` ("Cerramos la semana 2 · 3 clientes quedaron sin
  visitar").
- Badge para las cards con `reagendado_de` (vienen de otra vuelta). El badge "Reagendada" del lado
  que empuja ya existe.
- `proponerSemana()` pasa de `(última cerrada % 5) + 1` a **la vuelta cerrada más antigua**, para
  que saltear una zona no la deje cinco semanas sin visitar en silencio.

## Analítica

No hace falta ningún bucket nuevo: `reagendados` ya existe en `indicadores/cobertura.ts` y en
`AnaliticaRepository`, y hasta ahora daba siempre cero porque nada escribía ese tipo. Los
`en_plan = 0` ya quedan fuera del denominador por el filtro existente.

## Decisiones asumidas

- **El autocompletado de rubros usa el motivo 16 y queda indistinguible de un "No lo ofrecí"
  declarado por el vendedor.** Se evaluó un motivo `'Sin declarar'` con el mismo
  `resultado = 'no_ofrecido'` (un `INSERT`, porque `pl_motivo` está diseñada para que agregar un
  motivo no sea un deploy) y se descartó. Consecuencia aceptada: sobre esos datos no se puede
  distinguir comportamiento comercial de falta de carga.
- **Reagendar a la próxima vuelta resuelve al cliente en la vuelta vieja** (`estaResuelto` ya
  devuelve `true` para `reagendada`), así que en principio se podría "limpiar" una semana
  reagendando todo. En la práctica el incentivo desaparece: como el cierre ya no exige resolver
  nada, no hay nada que se destrabe reagendando. Y el bucket `reagendados` está separado de
  `visitados`, así que el patrón sería visible.
- **No hay convivencia de ciclos abiertos**: el `UNIQUE vendedor_abierto` queda.
- **No se reabren ciclos cerrados.**
- **El guard `VISITA_AJENA` de `RubrosService.resolveVisitaPropia` queda como está**, sostenido por
  el autocompletado de rubros al cerrar.

## Fuera de alcance

- **UI para traer un cliente de otra vuelta al ciclo activo.** El modelo queda preparado
  (`en_plan = 0` con `reagendado_de` nullable); la pantalla no se hace.
- **Arrastre automático de pendientes**, en cualquier forma.
- Fechas o calendario en el reagendado.
- Sumar clientes puntuales de otra zona a la vuelta en curso sin pasar por la primitiva.

## Riesgos y casos borde

- **Doble `sincronizar` concurrente** (dos pestañas, o montar + foco casi simultáneos). La
  transacción y el `UNIQUE vendedor_abierto` lo hacen seguro, pero el segundo llamado tiene que
  devolver "no hice nada" y no un error.
- **Congelar por accidente.** La acción que congela es explícita (iniciar visita / no visité /
  reagendar), nunca el scroll ni la navegación. El costo de equivocarse es real: no hay endpoint
  para descartar un ciclo, y los pendientes de la vuelta que se cierra **no** se recuperan solos.
  Por eso el cartel del cambio de zona intra-semana es obligatorio.
- **Reagendado que nunca se consume.** Si el vendedor reagenda a la próxima vuelta y después pasa
  cinco semanas sin abrir un ciclo, la fila sigue en la bandeja derivada y entra en el primer ciclo
  que congele, con un `dia_deseado` que ya no significa nada. Aceptado: entra en el día pedido de
  la vuelta que sea.
- **`fecha_lunes` en los ciclos existentes.** El ALTER es `NOT NULL`: hay que backfillearlo desde
  `fecha_apertura` en la misma intervención.

## Testing

- `fecha_lunes` se calcula en TZ de negocio: un ciclo abierto un domingo 23:30 de Buenos Aires
  pertenece a la semana que arranca al día siguiente, no a la anterior.
- El cierre es una transacción: si falla el autocompletado de rubros, el ciclo no queda cerrado.
- Cerrar **no** crea ninguna resolución para los clientes sin resolver, y esos clientes siguen
  contando como pendientes en la cobertura de esa vuelta.
- Congelar un ciclo consume los reagendados pendientes del vendedor y solo esos.
- Consumir un reagendado sobre un cliente que ya está en el plan congelado no duplica la fila y el
  `dia_deseado` pisa el día del plan.
- Un reagendado ya consumido no vuelve a entrar en el próximo ciclo (lo garantiza
  `uq_reagendado_de`).
- El 409 de cambio de zona trae la lista en `data`, y con `confirmarCambioDeSemana` la acción pasa.
- En standby, actuar sobre la semana que se está mirando congela **esa** semana y no la propuesta.
