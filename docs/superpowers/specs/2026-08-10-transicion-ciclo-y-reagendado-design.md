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

Cómo empieza y termina un ciclo sin que el vendedor tenga que pensar en ciclos, el reagendado a la
próxima vuelta, y cómo llega a un plan ya congelado un cambio de ruta hecho por el área.

**Qué NO decide:** los pendientes no se mueven solos. No hay arrastre automático — ver "Por qué no
hay arrastre".

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

## La rotación es una entidad

Una **rotación** se completa cuando se hicieron las cinco semanas, `s1` a `s5`. **Siempre las
cinco, y no necesariamente en orden.**

Hoy eso no existe en el modelo: `pl_ciclo_semana` guarda `semana` (1..5) y nada agrupa las cinco
vueltas. `proponerSemana()` calcula `(última cerrada % 5) + 1`, que asume orden y no sabe nada de
completitud — si el vendedor saltea la 3, la 3 no vuelve hasta la próxima vuelta completa, cinco
semanas sin pisar esa zona y sin que nada lo avise.

Se agrega `pl_rotacion` y un `rotacion_id` en `pl_ciclo_semana`. El argumento es el mismo que
justificó `pl_ciclo_semana`: igual que la etiqueta `s2` se repite cada cinco semanas, "la rotación"
se repite, y sin la instancia concreta no se puede responder qué semanas faltan.

Con eso:

- **`proponerSemana()` propone una de las semanas que faltan en la rotación abierta**, no la
  siguiente por número. Saltear deja de tener un costo escondido.
- Al congelar un ciclo se lo asigna a la rotación abierta del vendedor; si no hay o la anterior ya
  tiene sus cinco semanas, se abre una nueva.
- Una rotación se cierra cuando sus ciclos cubren las cinco semanas.
- **Señal, no bloqueo:** si el vendedor viene trabajando y le falta una semana para completar la
  rotación, eso se puede reportar ("te falta la s3"). No se le impide nada.

La rotación es además el reloj natural de las excepciones de ruta (spec 2): una excepción que mueve
un cliente de `s2` a `s1` atraviesa dos ciclos por definición, y **la garantía de que las dos puntas
se consuman es que las cinco semanas tienen que completarse.**

Fuera de alcance por ahora, pero vale anotarlo: la cobertura por rotación ("¿visité a todos mis
clientes en esta rotación?") es probablemente el número de negocio más importante, y hoy no se puede
calcular por falta de esta entidad.

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

## Cuando el área cambia la ruta

El caso real: el vendedor ya tenía planificados sus ciclos 1 al 5, y el jefe de área hace un viaje
excepcional porque necesita hablar con unos clientes urgente. Para eso **hizo cambiar el día de
visita de esos clientes** en la hoja de ruta, porque esas visitas pasan a ser prioridad.

El congelamiento del plan **bloquea eso a propósito**: existe para que un cambio ajeno a mitad de
semana no le mueva la agenda al vendedor. Con el ciclo ya congelado, el cambio del jefe no llega, y
recién entraría en la próxima vuelta por esa semana — hasta cinco semanas de demora para algo
urgente.

La salida no es darle al vendedor una herramienta para reacomodar días. **La decisión no es suya:**
la tomó el área, y ya está expresada en la hoja de ruta. Lo que falta es que ese cambio llegue.

**Un solo mecanismo cubre todos los casos.** "Mover un día completo", "traer clientes de otra
semana" e "intercambiar días entre semanas" son, desde nuestro lado, la misma cosa: **cambió la
asignación `sNdM` de un puñado de clientes**. No hay tres operaciones que modelar, hay una:
resincronizar el plan congelado contra el insumo.

Además mantiene la decisión donde corresponde. El jefe cambia la hoja y eso vale para todas las
vueltas futuras. Un botón en la app para reacomodar días viviría solo en nuestro snapshot, se
evaporaría en la próxima vuelta, y el área que administra las rutas nunca se enteraría de que la
ruta real era otra.

### Cómo funciona

Detectarlo es la misma lectura en vivo que ya hace `preview`
(`AgendaRepository.findVisitAssignments`, filtrada por `s{semana}d*`), comparada contra el plan
congelado del ciclo abierto. **Se compara solo contra las filas `en_plan = 1`**: las de
`en_plan = 0` vienen de reagendados y no salen del insumo, así que la resincronización no las toca
nunca.

Se aplica **solo, sin confirmación**, y se le notifica al vendedor qué cambió. Es una urgencia del
área: si el vendedor pudiera posponerla o ignorarla, no se cumpliría. Pero se entera siempre.

Cuatro deltas, y las dos reglas que importan son las de los clientes ya resueltos:

| delta | qué se hace |
|---|---|
| entra un cliente a la semana | `INSERT` con `en_plan = 1` y el `dia` del insumo — el área dice que este cliente es de esta semana, así que cuenta en el denominador |
| cambia el día, sin resolver | `UPDATE dia` |
| sale de la semana, sin resolver | se excluye **con motivo** (ver abajo) |
| ya resuelto (visitado, no visité, reagendado) | **no se toca**, cambie de día o salga. El hecho ya ocurrió y no se reescribe |

### Los que salen: exclusión con motivo, no baja silenciosa

Sacar un cliente del plan es **el único movimiento capaz de inflar el cumplimiento**:
`AnaliticaRepository` (línea 121) y `CicloClienteRepository.findCodigosSinResolver` (línea 84)
filtran `cc.en_plan = 1`, así que bajar esa columna a 0 borra la fila del denominador y la cobertura
sube sin que nadie haya visitado a nadie.

Acá la baja es legítima —el área movió al cliente, el vendedor no tiene culpa y no corresponde
penalizarlo— pero tiene que quedar **auditable**: se setea `en_plan = 0` **y** `excluido_en`. Las
queries existentes siguen siendo correctas sin tocarlas, y la exclusión queda distinguible.

Eso deja `en_plan = 0` con dos causas opuestas, así que conviene decirlo explícito para que nadie lo
lea mal: **`en_plan = 1` significa "cuenta en el denominador de cobertura de esta vuelta"**, y hay
dos motivos distintos para valer 0 — `reagendado_de` seteado (llegó de otra vuelta) o `excluido_en`
seteado (el área lo sacó de esta semana).

### Decisión asumida: la hoja gana

Si el vendedor había movido a un cliente de día dentro de la semana y después la hoja cambia el día
de ese mismo cliente, **gana la hoja**. `pl_ciclo_cliente` no tiene `updated_at`, así que no hay
forma de saber cuál de las dos decisiones es más nueva, y la hoja es la autoridad de ruta. La
notificación menciona el cambio de día, así que el vendedor lo ve.

## Cambios de esquema

```sql
-- La rotacion concreta: s1..s5 completas, en cualquier orden.
CREATE TABLE pl_rotacion (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_vendedor VARCHAR(50) NOT NULL,
  fecha_inicio               DATETIME    NOT NULL,
  fecha_fin                  DATETIME    NULL,      -- se completo (5 semanas)
  INDEX idx_vendedor (codigo_particular_vendedor)
);

ALTER TABLE pl_ciclo_semana
  ADD COLUMN fecha_lunes DATE NOT NULL,             -- la semana laboral del ciclo
  ADD COLUMN rotacion_id INT  NOT NULL,
  ADD FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id);

ALTER TABLE pl_resolucion
  ADD COLUMN dia_deseado TINYINT NULL;               -- 1..5, solo en tipo='reagendada'

ALTER TABLE pl_ciclo_cliente
  ADD COLUMN reagendado_de INT      NULL,
  ADD COLUMN excluido_en   DATETIME NULL,           -- el area lo saco de esta semana
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
  al volver al foco. Endpoint propio y no un efecto lateral de `GET /ciclo/actual`, para que un GET
  no mute. Hace dos cosas, en este orden:
  1. Si hay un ciclo abierto cuya `fecha_lunes` es anterior al lunes de esta semana, **lo cierra**.
  2. Si queda un ciclo abierto (el de esta semana), **resincroniza su plan** contra el insumo.

  Devuelve un resumen de las dos cosas (semana cerrada, clientes que quedaron sin visitar, visitas
  autocompletadas, y los deltas de ruta) para los avisos. Sin ciclo abierto es un no-op con resumen
  vacío — nunca un error.
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
- Aviso de cambio de ruta, también con `useNotificacion` ("La hoja de ruta cambió · 2 clientes
  nuevos, 1 pasó al jueves, 1 salió de tu semana"), con acceso a esa lista. No bloqueante y sin
  confirmación: el cambio ya se aplicó.
- Badge para las cards con `reagendado_de` (vienen de otra vuelta). El badge "Reagendada" del lado
  que empuja ya existe.
- `proponerSemana()` pasa de `(última cerrada % 5) + 1` a **una de las semanas que faltan en la
  rotación abierta** (ver "La rotación es una entidad").

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
- **UI para que el vendedor mueva días de a lote** — ni dentro de su semana, ni trayendo un día de
  otra, ni intercambiando días entre semanas. Las tres se evaluaron y se descartaron: cuando el
  cambio viene del área (que es el caso real), ya lo cubre la resincronización, y la decisión no es
  del vendedor. Si en algún momento se pide "llovió el miércoles, paso todo al jueves" por decisión
  propia del vendedor, eso sí es una función nueva: reagendar en lote dentro del plan congelado, sin
  riesgo de cobertura porque no saca a nadie del denominador.

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
- **`fecha_lunes` y `rotacion_id` en los ciclos existentes.** Los dos ALTER son `NOT NULL`:
  `fecha_lunes` se backfillea desde `fecha_apertura`, y hay que fabricar rotaciones para el
  historial existente (lo más simple: una rotación por vendedor que agrupe todo lo ya cerrado, sin
  pretender reconstruir dónde empezaba y terminaba cada una).
- **Una rotación que nunca se completa.** Si el vendedor deja de hacer una semana para siempre, la
  rotación queda abierta indefinidamente y `proponerSemana` va a insistir con esa semana. Es la
  señal correcta, pero conviene que el reporte lo muestre en vez de dejarlo solo en la propuesta.
- **La resincronización corre en cada montada y cada vuelta al foco.** Si el insumo se edita a mano
  y queda a medio guardar, el vendedor puede ver un cambio que se revierte al rato. La
  resincronización es idempotente y converge, pero el aviso puede aparecer dos veces con
  información distinta.
- **Un cliente excluido por el área y después devuelto a la semana.** El insumo vuelve a apuntar a
  `sNdX` y la resincronización lo trata como "entra": hay que reactivar la fila existente
  (`en_plan = 1`, `excluido_en = NULL`) en vez de intentar un `INSERT` que choca contra
  `uq_ciclo_cliente`.

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

Rotación:

- `proponerSemana` nunca propone una semana ya hecha en la rotación abierta.
- Hacer las cinco semanas en orden salteado (`s3, s1, s5, s2, s4`) completa la rotación igual.
- Al completarse la quinta, la rotación se cierra y la siguiente semana congelada abre una nueva.
- Un vendedor sin historial arranca con una rotación nueva y las cinco semanas pendientes.

Resincronización:

- No toca las filas `en_plan = 0`: un cliente que llegó por reagendado no se excluye porque el
  insumo no lo mencione.
- Un cliente **ya resuelto** no se toca, ni si le cambia el día ni si sale de la semana.
- Un cliente sin resolver que sale queda con `en_plan = 0` **y** `excluido_en`, y desaparece del
  denominador — no queda contado como no cubierto.
- Un cliente excluido que vuelve reactiva la fila existente y no rompe `uq_ciclo_cliente`.
- Correrla dos veces seguidas sin que el insumo cambie no produce ningún delta.
- Si el vendedor movió el día y el insumo lo mueve a otro, gana el insumo.
