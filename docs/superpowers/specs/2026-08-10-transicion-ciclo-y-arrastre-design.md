# Transición de ciclo invisible y arrastre de pendientes

Fecha: 2026-08-10

## Problema

Hoy el vendedor tiene que administrar el ciclo a mano, y las dos operaciones que se le piden
son conceptos del sistema, no de su trabajo:

- **No puede abrir la semana nueva sin cerrar la vieja.** `pl_ciclo_semana` tiene un
  `UNIQUE (vendedor_abierto)` que garantiza un solo ciclo abierto por vendedor, y
  `CicloService.abrir` rechaza con 409 `CICLO_ABIERTO_EXISTENTE` si ya hay uno.
- **No puede cerrar la vieja sin resolver todo.** `CicloService.cerrar` devuelve
  `cerrado: false` si queda un solo cliente sin resolver (`clientesPendientes`) o una sola
  visita con rubros sin cargar (`visitasConRubrosPendientes`).

El resultado es un bloqueo circular el lunes a la mañana, y un vocabulario ("abrir semana",
"cerrar semana") que el vendedor no usa: él piensa "esta semana recorro esta zona".

Además falta la contraparte: **no hay forma de pasar un cliente a la próxima vuelta.**
`PATCH /planificacion/ciclo-cliente/:id/reagendar` solo mueve el `dia` (1..5) dentro del ciclo
abierto. El tipo de resolución `reagendada` existe en el esquema y en los tipos de ambos repos,
pero **ningún código lo escribe**.

## Qué decide este spec

La transición entre ciclos (cierre, apertura y arrastre de pendientes) y el reagendado a la
próxima vuelta, que es la puerta explícita al mismo mecanismo de arrastre.

**Qué no decide:** nada sobre desvíos de ruta dentro de la semana. Si la hoja de ruta está mal,
se corrige con el supervisor sobre el insumo externo, fuera de la app.

## El modelo: el ciclo es la semana laboral

Un ciclo **empieza el lunes y termina el viernes, siempre.** No es "una vuelta que dura lo que
dura". Esto es lo que ancla todo el resto.

Hoy `pl_ciclo_semana` solo tiene `fecha_apertura`, así que la vida del ciclo se tendría que
inferir de cuándo el vendedor tocó el primer botón — y de ahí sale un absurdo: un ciclo abierto
un viernes viviría hasta el viernes siguiente. Se agrega **`fecha_lunes DATE`**: la semana
calendario a la que el ciclo pertenece, resuelta en TZ de negocio
(`America/Argentina/Buenos_Aires`, la convención de `src/lib/fechas.ts`), no en la del
dispositivo.

Abrir un viernes graba el lunes de *esa* semana igual. El que empieza tarde no estira su vuelta:
le queda menos semana, y la cobertura lo muestra. Eso es correcto, no un caso a acomodar.

**Los feriados no son un caso especial.** La semana laboral sigue siendo lunes a viernes tenga
cuatro días útiles o cinco. Un feriado no cambia cuándo cierra el ciclo — cambia cuánto se pudo
visitar, que es exactamente lo que la cobertura tiene que reflejar y no compensar.

**Los días que ya pasaron no generan ninguna lógica.** Un cliente sin visitar el lunes sigue
pendiente, y el vendedor decide antes del viernes: moverlo a otro día de esta semana, pasarlo a
la próxima vuelta, o marcarlo como no visité. No hay "día vencido".

## Las dos transiciones

Son distintas y no hay que fundirlas: en una el vendedor no elige nada, en la otra está por
partir una vuelta al medio.

### La normal — cambio de semana laboral

El lunes, al entrar a la app, el ciclo de la semana que pasó **se cierra solo** (arrastre +
autocompletado de rubros) y **no se abre nada**: queda en **standby**. El calendario avanzó, el
vendedor no eligió nada, así que no se le pregunta. Solo se le avisa qué se arrastró.

### La excepcional — cambio de zona dentro de la misma semana laboral

Tiene la semana 2 abierta, es miércoles, y toca una acción sobre un cliente de la semana 4. Acá
**sí** hay cartel con la lista de pendientes y confirmación explícita. Es la única situación en
la que un tap parte una vuelta al medio.

El protocolo reusa una forma que ya existe en el dominio: el backend responde **409 con la lista
en `data`** — el mismo 409 irregular (`ok:0` con `data`, no con `code`) que hoy tiene
`/ciclo/cerrar` y que documenta `CerrarSemanaSheet.bloqueosDe`. El front muestra el cartel, el
vendedor confirma, y la acción se reenvía con `confirmarCambioDeSemana: true`.

El 409 deja de ser un error a evitar: **es el mecanismo.**

## Standby y apertura implícita

Se borran del front el CTA "Abrir semana" y `CerrarSemanaSheet.tsx` completo. `abrir()` y
`cerrar()` dejan de ser cosas que el vendedor invoca y pasan a ser pasos internos de una
operación nueva, **`asegurarCiclo(vendedor, semana)`**:

- **Ciclo abierto de esa semana** → se devuelve.
- **Ciclo abierto de otra semana** → 409 con los pendientes (la transición excepcional). Con
  `confirmarCambioDeSemana: true`, cierra la vieja con arrastre y sigue.
- **Sin ciclo abierto (standby)** → congela el plan de esa semana e **integra la bandeja de
  arrastre**.

Lo dispara la primera acción real sobre un cliente (iniciar visita, no visité, reagendar), no un
botón. Eso hace que **congelar el plan pase a ser el efecto secundario de una decisión que el
vendedor ya tomó**, en vez de un compromiso irreversible que tiene que entender de antemano.
Nadie abre un ciclo por error porque nadie abre ciclos.

**La flexibilidad de zona sale gratis de acá.** La semana que se congela es la que el vendedor
estaba mirando cuando actuó. Si esta vuelta le toca la zona 4 en vez de la 3, arranca visitando
en la 4 y el ciclo de la 4 es el que nace. Elegir es trabajar; no hay caso especial.

Navegar entre semanas sigue siendo gratis y reversible: es `GET /planificacion/ciclo/preview`,
que no congela nada.

## Qué hace la rotación

Una sola transacción sobre el ciclo que se cierra:

1. Cada `pl_ciclo_cliente` **sin resolución** → `pl_resolucion` de tipo **`arrastrada`** (valor
   nuevo), `fecha_inicio = fecha_fin = ahora`, sin coords ni motivos.
2. Cada `pl_visita_rubro` **sin motivos** de las visitas del ciclo → `pl_visita_rubro_motivo`
   con `motivo_id = 16` (`'No lo ofrecí'`, `resultado = 'no_ofrecido'`).
3. El ciclo pasa a `cerrada` con `fecha_cierre`.

El paso 1 **incluye las filas `en_plan = 0`**: un arrastrado que tampoco se visitó se vuelve a
arrastrar en vez de desaparecer de la bandeja. Es una query aparte de
`CicloClienteRepository.findCodigosSinResolver`, que filtra `en_plan = 1`.

## El arrastre

Un cliente que quedó sin visitar entra al **ciclo siguiente, aunque sea otra zona**. Las zonas de
la rotación son geográficamente cercanas, así que mezclar no es un problema operativo — es
información del negocio, no una deducción del modelo.

Al integrar la bandeja, por cada resolución `arrastrada` sin consumir del vendedor se inserta un
`pl_ciclo_cliente` en el ciclo nuevo con:

- `en_plan = 0`
- `dia = dia_deseado ?? el día que tenía en su zona`
- `arrastrado_de` = id de la resolución que lo originó

Si el cliente **ya estaba en el plan congelado** de esta semana (pasa cuando la rotación vuelve a
su zona), el `UNIQUE uq_ciclo_cliente (ciclo_semana_id, codigo_particular_cliente)` impide el
duplicado: se marca `arrastrado_de` sobre la fila existente y la bandeja se consume igual. Si esa
resolución traía `dia_deseado`, la intención explícita del vendedor pisa el día del plan; si es
un arrastre automático (`dia_deseado NULL`), gana el día del plan.

### Por qué `en_plan = 0`

`AnaliticaRepository` (línea 121) y `CicloClienteRepository.findCodigosSinResolver` (línea 84) ya
filtran `cc.en_plan = 1`. Un arrastrado con `en_plan = 0` queda entonces, **sin tocar ninguna
query**, fuera del denominador de cobertura y fuera de los pendientes.

Eso es lo que se busca: la cobertura de la semana 3 mide la zona 3, y el faltazo se cuenta **una
sola vez, en la semana donde ocurrió**, en vez de inflar el denominador de cada semana en la que
el cliente siga postergado.

### Por qué la fila vieja se resuelve como `arrastrada` y no queda pendiente

Tres opciones se evaluaron para la fila del ciclo viejo:

| | la semana cierra | cobertura | qué se pierde |
|---|---|---|---|
| queda pendiente | con filas colgadas adentro | honesta: no cubierto | no se distingue "lo pasé" de "lo ignoré" |
| resolución `reagendada` | limpia | cuenta como **resuelto** | cumplimiento inflable con dos clicks |
| resolución `arrastrada` | limpia | no cubierto, contado aparte | nada; cuesta un valor de `tipo` y un bucket |

Se eligió `arrastrada`. Ocupa el slot de `pl_resolucion` (que es `UNIQUE` por `ciclo_cliente`, así
que el cliente no puede resolverse dos veces en la misma vuelta), deja cerrar sin filas colgadas,
y **no entra en el numerador de cubierto** — así que no reintroduce el cumplimiento inflable que
`CLAUDE.md` decidió evitar cuando definió que reagendar dentro del ciclo no resuelve.

## Reagendar a la próxima vuelta

El vendedor no piensa en fechas: piensa "lo veo la semana que viene". Eso **disuelve** la tensión
original ("reagendar se piensa por fecha, pero el ciclo se mide distinto") en vez de resolverla:
la fecha nunca entra al modelo.

Es importante porque el mapeo `fecha → (semana, día)` **no se puede hacer determinístico**: un
ciclo futuro no tiene fecha de apertura hasta que el vendedor actúa en él.

`EstadoVisitaSheet` gana una sección **"La semana que viene"** con sus cinco días, debajo de los
de la semana actual. Elegir uno crea la resolución `arrastrada` con `dia_deseado`. El cliente
queda resuelto-como-arrastrado en esta vuelta (o sea: **no cubierto**) y aparece en el próximo
ciclo el día que el vendedor eligió.

El reagendado **dentro** de la semana no cambia: sigue moviendo `dia` y dejando al cliente
pendiente.

## Cambios de esquema

```sql
ALTER TABLE pl_ciclo_semana
  ADD COLUMN fecha_lunes DATE NOT NULL;              -- la semana laboral del ciclo

ALTER TABLE pl_resolucion
  ADD COLUMN dia_deseado TINYINT NULL;               -- 1..5, solo en tipo='arrastrada' explícita

ALTER TABLE pl_ciclo_cliente
  ADD COLUMN arrastrado_de INT NULL,
  ADD UNIQUE KEY uq_arrastrado_de (arrastrado_de),   -- imposible consumir dos veces el arrastre
  ADD FOREIGN KEY (arrastrado_de) REFERENCES pl_resolucion (id);
```

Más el valor `'arrastrada'` en `pl_resolucion.tipo` (columna `VARCHAR`, no hay enum que migrar).

`pl_motivo` **no** cambia: el autocompletado usa el motivo 16 existente.

Los ALTER en este repo son intervención manual de ops, así que van documentados en
`docs/db-notes/` junto al `CREATE TABLE` consolidado.

## Cambios de API

- **`POST /planificacion/ciclo/sincronizar`** (nuevo). Idempotente. El front lo llama al montar y
  al volver al foco. Si hay un ciclo abierto cuya `fecha_lunes` es anterior al lunes de esta
  semana, rota. Devuelve el resumen de lo que hizo (semana cerrada, clientes arrastrados, visitas
  autocompletadas) para el aviso. Endpoint propio y no un efecto lateral de `GET /ciclo/actual`,
  para que un GET no mute. Sin ciclo abierto, o con uno de esta misma semana laboral, es un no-op
  que devuelve el resumen vacío — nunca un error.
- **Acciones sobre clientes** (iniciar visita, no visité, reagendar): pasan a aceptar
  `(semana, codigoParticularCliente)` además de `cicloClienteId`, y un flag
  `confirmarCambioDeSemana`. Es el cambio de contrato más grande de la entrega: hoy las cards del
  preview no tienen `cicloClienteId` y el front lo rellena con `-1`.
- **`PATCH /ciclo-cliente/:id/reagendar`**: acepta `proximaVuelta: true`, que en vez de mover el
  `dia` crea la resolución `arrastrada` con `dia_deseado`.
- **`POST /ciclo/abrir` y `POST /ciclo/cerrar`**: el front deja de llamarlos.

## Cambios de front

- Se borran `CerrarSemanaSheet.tsx`, el hook `useCerrarCiclo` y el CTA de abrir semana.
- **`operable` cambia de semántica.** Hoy es
  `ciclo != null && semanaEfectiva === ciclo.semana`. Pasa a: con ciclo abierto, solo esa semana
  es accionable (igual que hoy, y es lo que sostiene "seguí el ciclo"); **en standby, la semana
  que se está mirando es accionable** y la primera acción la congela.
- `EstadoVisitaSheet`: sección "La semana que viene".
- Cartel de cambio de zona intra-semana, alimentado por el 409.
- Aviso post-rotación con `useNotificacion` ("Cerramos la semana 2 · 3 clientes pasan a esta
  vuelta") y badge *arrastrado* en las cards con `arrastrado_de`.
- `estadoCicloCliente` gana el estado `arrastrada`; `estaResuelto('arrastrada')` es `true`
  (está resuelto en esa vuelta, aunque no cubierto).
- `proponerSemana()` pasa de `(última cerrada % 5) + 1` a **la vuelta cerrada más antigua**, para
  que saltear una zona no la deje cinco semanas sin visitar en silencio.

## Analítica

Un bucket nuevo `arrastrados` junto a `visitados / enCurso / noVisita / reagendados /
pendientes`, en `indicadores/cobertura.ts` y en `AnaliticaRepository`. El filtro `tipo` de
`getVisitas` acepta `arrastrada`.

Los `en_plan = 0` ya quedan fuera del denominador por el filtro existente.

## Decisiones asumidas

- **El autocompletado de rubros usa el motivo 16 y queda indistinguible de un "No lo ofrecí"
  declarado por el vendedor.** Se evaluó un motivo `'Sin declarar'` con el mismo
  `resultado = 'no_ofrecido'` (un `INSERT`, porque `pl_motivo` está diseñada para que agregar un
  motivo no sea un deploy) y se descartó. Consecuencia aceptada: sobre esos datos no se puede
  distinguir comportamiento comercial de falta de carga.
- **No hay escape dentro de la app para sumar clientes puntuales de otra zona a la vuelta en
  curso.** Se evaluó traerlos al ciclo abierto con `en_plan = 0` y se descartó: el objetivo de la
  app es que se siga el ciclo lo más posible, y el desvío se resuelve con el supervisor sobre la
  hoja de ruta. Esto **no** es lo mismo que la transición excepcional: ahí el vendedor cambia de
  zona entero (cierra la vuelta y arranca otra), no mezcla clientes de dos zonas en una vuelta.
- **No hay convivencia de ciclos abiertos**: el `UNIQUE vendedor_abierto` queda.
- **No se reabren ciclos cerrados.**
- **El guard `VISITA_AJENA` de `RubrosService.resolveVisitaPropia` queda como está.** Exige que
  la visita cuelgue del ciclo abierto; como los rubros se autocompletan al rotar, nunca queda
  carga pendiente sobre un ciclo cerrado.

## Riesgos y casos borde

- **Arrastre indefinido.** Un cliente que nunca se visita se re-arrastra cada semana para
  siempre, y como está `en_plan = 0` no aparece en ningún pendiente que lo delate. No se
  implementa nada por ahora, pero es el candidato natural a un indicador ("clientes arrastrados
  N vueltas consecutivas").
- **Doble sincronizar concurrente** (dos pestañas, o montar + foco casi simultáneos). La
  transacción y el `UNIQUE vendedor_abierto` lo hacen seguro, pero el segundo llamado tiene que
  devolver "no hice nada" y no un error.
- **Congelar por accidente.** La acción que congela es explícita (iniciar visita / no visité /
  reagendar), nunca el scroll ni la navegación. Y si igual pasa, nada se pierde: los pendientes
  se arrastran.
- **`fecha_lunes` en los ciclos existentes.** El ALTER es `NOT NULL`: hay que backfillearlo desde
  `fecha_apertura` en la misma intervención.

## Testing

- `fecha_lunes` se calcula en TZ de negocio: un ciclo abierto un domingo 23:30 de Buenos Aires
  pertenece a la semana que arranca al día siguiente, no a la anterior.
- La rotación es una transacción: si falla el autocompletado de rubros, el ciclo no queda cerrado.
- El paso de arrastre incluye `en_plan = 0`.
- Integrar la bandeja sobre un cliente que ya está en el plan congelado no duplica y consume el
  arrastre igual; `dia_deseado` pisa el día del plan, `NULL` no.
- `arrastrada` no entra en el numerador de cobertura y sí en su propio bucket.
- El 409 de cambio de zona trae la lista en `data`, y con `confirmarCambioDeSemana` la acción
  pasa.
- En standby, actuar sobre la semana que se está mirando congela **esa** semana y no la propuesta.
