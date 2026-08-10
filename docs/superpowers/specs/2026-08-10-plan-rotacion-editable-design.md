# Plan de rotación editable: transición de ciclo invisible y reacomodación

Fecha: 2026-08-10

## Problema

**El vendedor administra el ciclo a mano, y las operaciones que se le piden son conceptos del
sistema, no de su trabajo.** No puede abrir la semana nueva sin cerrar la vieja (`pl_ciclo_semana`
tiene `UNIQUE (vendedor_abierto)` y `CicloService.abrir` rechaza con 409
`CICLO_ABIERTO_EXISTENTE`), y no puede cerrar la vieja sin resolver todo (`CicloService.cerrar`
devuelve `cerrado: false` con un solo cliente sin resolver o una sola visita con rubros sin cargar).
Es un bloqueo circular el lunes a la mañana, con un vocabulario —"abrir semana", "cerrar semana"—
que el vendedor no usa: él piensa "esta semana recorro esta zona".

**No hay forma de reacomodar la ruta.** `PATCH /planificacion/ciclo-cliente/:id/reagendar` solo
mueve el `dia` (1..5) dentro del ciclo abierto. Pasar un cliente a otra semana no existe y nunca
funcionó: hay cableado alrededor —el valor `'reagendada'` en los tipos de los dos repos,
`estadoCicloCliente.ts`, el badge de `ClienteCard.tsx:101`, el bucket `reagendados` de la
analítica— pero **ninguna línea escribe ese tipo**, así que todo eso está inalcanzable.

**Y el modelo actual pelea con el dominio.** El plan se congela por ciclo, y como el insumo que lo
alimenta sigue cambiando, cada corrección necesita su propio mecanismo de parche: una bandeja para
los reagendados, una columna para consumirla, otra para el día deseado, otra para las bajas, una
resincronización que persiga deltas de días y decida quién gana entre el vendedor y la hoja. Cada
caso nuevo pide otra cola.

Lo que pasa en el negocio es más simple: **un cliente cambia de lugar.** Es reacomodación, no
arrastre. Eso tiene que ser un `UPDATE`, no una intención esperando en una cola a que alguien la
consuma.

## La estructura: tres capas

```
TEMPLATE     warehouse / Flexxus (hoy agendaMock.json)     read-only, NUNCA lo escribimos
             campo visit = "s2d3"
                   │  se materializa UNA vez, al arrancar la rotación
                   ▼
PLAN         pl_rotacion_cliente (rotacion_id, cliente, semana, dia)     NUESTRO y editable
             una fila por cliente por rotación
                   │  reacomodar = UPDATE (semana, dia)
                   ▼
HECHO        pl_resolucion cuelga de esa fila             visita / no visité, inmutable
```

El congelamiento **no desaparece: se mueve al borde de la rotación.** `CLAUDE.md` lo justifica
así — si el plan se leyera en vivo, un cambio ajeno un miércoles movería la agenda a mitad de semana
y reescribiría la cobertura hacia atrás. Sigue valiendo: el ciclo lee una tabla **nuestra**, que
nadie externo toca. Flexxus cambia y eso aplica en la próxima materialización.

La diferencia es que ahora ocurre **una vez por rotación en lugar de cinco**, y sobre una tabla que
se puede editar en lugar de un snapshot que hay que parchear.

`pl_ciclo_semana` deja de tener plan. Queda como el registro de **cuándo** el vendedor recorrió la
semana N de la rotación R: `fecha_lunes`, apertura, cierre. El qué está en la capa del medio.

## La rotación

Una **rotación** se completa cuando se hicieron todas sus semanas. **Siempre todas, y no
necesariamente en orden.**

Eso hoy no existe: `pl_ciclo_semana` guarda `semana` (1..5) y nada agrupa las vueltas.
`proponerSemana()` calcula `(última cerrada % 5) + 1`, que asume orden y no sabe nada de
completitud — si el vendedor saltea la 3, la 3 no vuelve hasta la próxima vuelta completa, cinco
semanas sin pisar esa zona y sin que nada lo avise.

Se agrega `pl_rotacion`, con el mismo argumento que justificó `pl_ciclo_semana`: igual que la
etiqueta `s2` se repite cada cinco semanas, "la rotación" se repite, y sin la instancia concreta no
se puede responder qué semanas faltan ni sobre qué conjunto se mide la cobertura.

- **`proponerSemana()` propone una de las semanas que faltan en la rotación abierta**, no la
  siguiente por número. Saltear deja de tener un costo escondido.
- Una rotación se cierra cuando sus ciclos cubren todas sus semanas. El siguiente ciclo materializa
  una rotación nueva desde el template.
- **Señal, no bloqueo:** si le falta una semana para completar la rotación, se reporta. No se le
  impide nada.

### Cuántas semanas tiene un vendedor

**No son siempre cinco.** Hay vendedores con 4. Hoy el 5 está clavado en cuatro lugares:
`CicloService.ts:20` (`SEMANAS_DEL_CICLO = 5`) y `:190` (la aritmética `(última % 5) + 1`),
`planificacionController.ts:66` (la validación del rango) y `AgendaSemanaPage.tsx:27, 94, 212` (la
constante, la validación de la URL y el wrap de las flechas).

Con un vendedor de 4 semanas, hoy: al cerrar su `s4`, `proponerSemana` devuelve `(4 % 5) + 1 = 5` y
abrirla explota con 422 `CICLO_SIN_CLIENTES`. Y con `pl_rotacion` sería peor: la rotación esperaría
cinco semanas y **nunca se completaría**.

**No hace falta ninguna columna para esto.** El set de semanas de una rotación son los valores
`semana` distintos de sus propias filas en `pl_rotacion_cliente`, que salieron del template al
materializar. Si ese vendedor no tiene ningún `s5*`, su rotación tiene cuatro semanas y se completa
con cuatro. **No se asume contigüidad**: un set `1, 2, 3, 5` funciona igual.

Y queda congelado por construcción, sin declararlo: si el template le agrega la `s5` a mitad de
rotación, esa rotación ya está materializada con cuatro y la siguiente nace con cinco.

## El ciclo es la semana laboral

Un ciclo **empieza el lunes y termina el viernes, siempre.** No es "una vuelta que dura lo que
dura". Hoy `pl_ciclo_semana` solo tiene `fecha_apertura`, así que la vida del ciclo habría que
inferirla de cuándo el vendedor tocó el primer botón, y de ahí sale un absurdo: un ciclo abierto un
viernes viviría hasta el viernes siguiente. Se agrega **`fecha_lunes DATE`**, resuelta en TZ de
negocio (`America/Argentina/Buenos_Aires`, la convención de `src/lib/fechas.ts`), no en la del
dispositivo.

Abrir un viernes graba el lunes de *esa* semana igual. El que empieza tarde no estira su vuelta: le
queda menos semana, y la cobertura lo muestra.

**Los feriados no son un caso especial.** La semana laboral es lunes a viernes tenga cuatro días
útiles o cinco. Un feriado no cambia cuándo cierra el ciclo — cambia cuánto se pudo visitar, que es
lo que la cobertura tiene que reflejar y no compensar. Si el lunes fue feriado y el vendedor arranca
el martes, no hay nada que ajustar.

**Los días que ya pasaron no generan ninguna lógica.** Un cliente sin visitar el lunes sigue
pendiente, y el vendedor decide antes del viernes: reacomodarlo a otro día, reacomodarlo a otra
semana, o marcarlo como no visité. No hay "día vencido".

## Las dos transiciones

### La normal — cambio de semana laboral

El lunes, al entrar a la app, el ciclo de la semana que pasó **se cierra solo** y **no se abre
nada**: queda en **standby**. El calendario avanzó, el vendedor no eligió nada, así que no se le
pregunta. Se le avisa qué quedó sin visitar.

### La excepcional — cambio de zona dentro de la misma semana laboral

Tiene la semana 2 abierta, es miércoles, y toca una acción sobre un cliente de la semana 4. Acá hay
cartel y confirmación explícita: cerrar la semana 2 la marca como hecha en la rotación, así que
`proponerSemana` no la va a volver a proponer y sus pendientes quedan sin visitar.

Como reacomodar ahora es una operación de primera clase, **el cartel puede ser accionable en vez de
solo una advertencia**: "te quedan 3 clientes en la semana 2 — ¿los reacomodás a otra semana antes
de cerrarla?".

El protocolo reusa una forma que ya existe en el dominio: 409 con la lista en `data` — el mismo 409
irregular (`ok:0` con `data`, no con `code`) que hoy tiene `/ciclo/cerrar` y que documenta
`CerrarSemanaSheet.bloqueosDe`. El front muestra el cartel, el vendedor confirma, y la acción se
reenvía con `confirmarCambioDeSemana: true`.

## Standby y apertura implícita

Se borran del front el CTA "Abrir semana" y `CerrarSemanaSheet.tsx` completo. `abrir()` y `cerrar()`
dejan de ser cosas que el vendedor invoca y pasan a ser pasos internos de **`asegurarCiclo(vendedor,
semana)`**:

- **Ciclo abierto de esa semana** → se devuelve.
- **Ciclo abierto de otra semana** → 409 con los pendientes (la transición excepcional). Con
  `confirmarCambioDeSemana: true`, cierra la vieja y sigue.
- **Sin ciclo abierto (standby)** → abre el ciclo de esa semana, materializando la rotación si no
  hay ninguna abierta.

Lo dispara la primera acción real sobre un cliente (iniciar visita, no visité, reacomodar), no un
botón.

**Y abrir un ciclo dejó de ser irreversible.** Antes congelaba el plan y no había forma de
descartarlo; ahora solo registra que el vendedor empezó a recorrer la semana N. Lo único
irreversible que queda es materializar la rotación, y eso pasa una vez cada cinco semanas y no
depende de qué semana elija primero.

**La flexibilidad de zona sale gratis de acá.** La semana que se registra es la que el vendedor
estaba mirando cuando actuó. Si esta vuelta le toca la zona 4 en vez de la 3, arranca visitando en
la 4. Elegir es trabajar; no hay caso especial ni botón.

## Reacomodar: la única operación

**Reacomodar es mover una fila de `pl_rotacion_cliente`:** `UPDATE semana, dia`. Con eso, todas
estas son la misma operación y comparten un solo camino de código:

| caso | qué es |
|---|---|
| mover un cliente a otro día de esta semana | `UPDATE dia` |
| pasar un cliente a otra semana | `UPDATE semana, dia` |
| mover un día completo | N updates |
| traer un día de otra zona a esta semana | N updates |
| intercambiar dos días entre semanas | dos conjuntos de updates en direcciones opuestas |
| la excepción de ruta que ordena gerencia | los mismos updates, hechos por otro usuario |

Dos reglas, y son todas:

1. **Una fila con resolución no se mueve.** El hecho ya ocurrió. Si hay que corregir algo, se genera
   una visita nueva de ajuste (`CLAUDE.md`: no se editan ni reabren visitas cerradas).
2. **El destino tiene que ser una semana de la rotación**, y si es una semana ya cerrada la fila
   entra igual pero no va a ser recorrida hasta la próxima rotación — la UI no debería ofrecerlo.

No hay bandeja, no hay nada que consumir, no hay `dia_deseado` esperando: cuando el ciclo de la
semana destino arranque, la fila ya está ahí porque **es la misma fila**.

### No hay arrastre y no puede haberlo

Un cliente que no se visitó y cuya semana cerró queda con su fila sin resolver dentro de la
rotación. Cuenta como no cubierto. Nada lo mueve solo.

Si el vendedor lo quiere recuperar, lo **reacomoda** a una semana pendiente de la misma rotación.
Eso no es arrastrarlo: es una decisión explícita, de a uno, y el trabajo sigue siendo el mismo
trabajo dentro de la misma rotación.

## Cobertura

**La rotación es la unidad de medida.** El denominador es las filas de `pl_rotacion_cliente` de esa
rotación, y **reacomodar no lo cambia** — mover un cliente de la semana 2 a la 4 no agrega ni quita
trabajo, solo lo reubica. Cada cliente tiene exactamente una fila por rotación, así que no se puede
contar dos veces ni desaparecer.

Esa es una invariante bastante más fuerte que la de hoy, donde el denominador es la suma de cinco
snapshots independientes y cualquier movimiento entre ellos lo distorsiona.

**La vista semanal es un desglose, no la medida.** El corte por semana se calcula sobre
`semana = N`, así que **mientras la rotación está abierta puede moverse**: si un pendiente de la
semana 2 se reacomoda a la 4, la semana 2 mejora y la 4 empeora. Es correcto —el trabajo se movió—
y es la razón por la que el número que se reporta hacia arriba tiene que ser el de la rotación
cerrada, no el semanal en vivo.

Con esto **desaparece `en_plan`**. No hay "dentro y fuera del plan": hay una fila, que está en
alguna semana.

## Sincronizar el padrón (no el plan)

Una vez que reacomodar es una operación de primera clase, **los cambios de ruta del template dejan
de haber que perseguirlos**: si el área mueve un cliente de slot, gerencia lo reacomoda directo y el
template aplica en la próxima materialización. Se cae toda la resincronización de deltas de días, y
con ella la pregunta de quién gana entre el vendedor y la hoja.

Lo único que sigue necesitando llegar a mitad de rotación son **altas y bajas del padrón**:

- Un cliente **nuevo** que no está en la rotación no se visitaría hasta la próxima — hasta cinco
  semanas.
- Un cliente que **dejó de ser suyo** (baja, cambio de vendedor) sigue apareciendo como pendiente, y
  eso es peor: le pide trabajo imposible y ensucia el indicador con algo que nunca se va a poder
  cumplir.

Cuatro reglas:

| situación | qué se hace |
|---|---|
| fila **con resolución** | **nunca se toca**, pase lo que pase con el padrón |
| semana **ya cerrada** en esta rotación | **nunca se toca**: no se le cambia la cobertura a una semana ya reportada |
| baja, fila sin resolver, semana pendiente | se saca de la rotación |
| alta | entra en una semana **pendiente**, con el slot que diga el template |

Las dos primeras hacen que el sincronizar sea **idempotente y no pueda pisar trabajo hecho**, así
que puede correr en cada apertura de la app sin riesgo. Correrlo dos veces seguidas sin que el
padrón cambie no produce nada.

## Qué hace el cierre del ciclo

Una sola transacción:

1. Cada `pl_visita_rubro` **sin motivos** de las visitas del ciclo → `pl_visita_rubro_motivo` con
   `motivo_id = 16` (`'No lo ofrecí'`, `resultado = 'no_ofrecido'`).
2. El ciclo pasa a `cerrada` con `fecha_cierre`. Si con eso la rotación completó todas sus semanas,
   se cierra también.

Y nada más. **Los clientes sin resolver quedan sin resolver.**

### Pendiente y "no visité" NO son lo mismo

Es tentador que el cierre resuelva los pendientes como `no_visita` — parece prolijo y deja la semana
sin filas colgadas. **No hay que hacerlo**, y conviene que quede escrito porque es el tipo de detalle
que se agrega "para mejorar":

| | qué es | qué aporta |
|---|---|---|
| **sin resolución** | la ausencia de un hecho: nadie hizo nada | nada, y eso es el dato: no se cubrió |
| **`no_visita`** | un hecho declarado: el vendedor fue o intentó | un motivo agrupable (Cerrado, Vacaciones, No atiende) |

Auto-resolverlos rompe las dos puntas: inventa un hecho comercial que nadie declaró, y lo hace **sin
motivo**, así que llena `pl_resolucion_motivo` de filas vacías — la tabla existe justamente para
poder responder "cuál es la objeción más frecuente en la zona norte".

Es el mismo error que quitar el arrastre evitó, con otra etiqueta: auto-resolver un pendiente lo hace
desaparecer del problema en vez de registrarlo.

**Para la cobertura los dos casos son idénticos:** cero visitas. `noVisita` es un bucket separado de
`visitados` en `indicadores/cobertura.ts`, así que declarar un no visité **no sube la cobertura**.
Donde sí difieren es en *resueltos / total*, y de ahí sale la advertencia de la sección de riesgos.

`cerrar()` deja de exigir que no haya pendientes. Ese chequeo era el bloqueo circular, y la
cobertura ya mide lo que el bloqueo pretendía proteger.

Nota sobre el paso 1: en el modelo viejo era obligatorio porque
`RubrosService.resolveVisitaPropia` exige que la visita cuelgue del **ciclo abierto** (403
`VISITA_AJENA`), así que cerrar con rubros sin cargar rompía esas cargas. Con las resoluciones
colgando de la rotación, ese guard pasa naturalmente a ser "la resolución es tuya" y el
autocompletado **deja de ser una necesidad técnica**. Se mantiene igual porque es la decisión de
producto que ya se tomó: cerrar la semana cierra la carga.

## Ejemplo completo

Vendedor `V 2`, con **4 semanas** (su template no tiene ningún `s5*`). Se usan 8 clientes para que
se lea; en la realidad son ~200 filas.

### ① Template — lo que viene del warehouse (hoy `agendaMock.json`)

Read-only. Nunca lo escribimos.

| cliente | visit |
|---|---|
| 6836 | `s2d1` |
| 9301 | `s2d3` |
| 4412 | `s2d3` |
| 6612 | `s2d5` |
| 7750 | `s4d2` |
| 5120 | `s4d4` |
| 2088 | `s1d1` |
| 3401 | `s3d5` |

### ② Lunes 03/08 — standby, el vendedor toca "iniciar visita" en 6836

No hay rotación abierta, así que se materializa. Y no hay ciclo abierto, así que se abre el de la
semana 2 — **la que el vendedor estaba mirando**, no la que propone el sistema.

`pl_rotacion`

| id | vendedor | fecha_inicio | fecha_fin |
|---|---|---|---|
| 7 | V 2 | 2026-08-03 09:12 | NULL |

`pl_rotacion_cliente` — **el plan, y ya es editable**

| id | rotacion_id | cliente | semana | dia |
|---|---|---|---|---|
| 101 | 7 | 6836 | 2 | 1 |
| 102 | 7 | 9301 | 2 | 3 |
| 103 | 7 | 4412 | 2 | 3 |
| 104 | 7 | 6612 | 2 | 5 |
| 105 | 7 | 7750 | 4 | 2 |
| 106 | 7 | 5120 | 4 | 4 |
| 107 | 7 | 2088 | 1 | 1 |
| 108 | 7 | 3401 | 3 | 5 |

**El set de semanas de la rotación es `{1, 2, 3, 4}`** — los valores distintos de esta columna. No
está declarado en ninguna parte y no hace falta: este vendedor tiene 4 semanas y su rotación se
completa con 4.

`pl_ciclo_semana` — solo *cuándo*, ningún plan

| id | rotacion_id | vendedor | semana | fecha_lunes | fecha_apertura | fecha_cierre | estado |
|---|---|---|---|---|---|---|---|
| 31 | 7 | V 2 | 2 | 2026-08-03 | 2026-08-03 09:12 | NULL | abierta |

### ③ Durante la semana

**Lunes:** visita 6836 y carga un rubro de los dos que le propuso el sistema.

`pl_resolucion`

| id | rotacion_cliente_id | tipo | fecha_inicio | fecha_fin | coord_inicio | coord_final |
|---|---|---|---|---|---|---|
| 51 | 101 | visita | 2026-08-03 10:05 | 2026-08-03 10:41 | -34.61,-58.43 | -34.61,-58.43 |

`pl_visita_rubro`

| id | resolucion_id | rubro_code | pesos_perdidos | origen | es_propuesto |
|---|---|---|---|---|---|
| 71 | 51 | LACTEOS | 48200.00 | caida | 1 |
| 72 | 51 | GALLETITAS | 15300.00 | caida | 1 |

`pl_visita_rubro_motivo` — el rubro 72 queda **sin cargar**

| visita_rubro_id | motivo_id |
|---|---|
| 71 | 10 (Saqué pedido) |

**Miércoles:** 9301 está cerrado.

`pl_resolucion` (+1) y `pl_resolucion_motivo`

| id | rotacion_cliente_id | tipo | fecha_inicio | fecha_fin |
|---|---|---|---|---|
| 52 | 102 | no_visita | 2026-08-05 11:20 | 2026-08-05 11:20 |

| resolucion_id | motivo_id |
|---|---|
| 52 | 1 (Cerrado) |

**Miércoles:** a 4412 no llega y lo pasa a la semana 4, día 1. **Esto es todo lo que pasa:**

```sql
UPDATE pl_rotacion_cliente SET semana = 4, dia = 1 WHERE id = 103;
```

| id | rotacion_id | cliente | semana | dia |
|---|---|---|---|---|
| 103 | 7 | 4412 | **4** ← era 2 | **1** ← era 3 |

Sin bandeja, sin resolución `reagendada`, sin nada que consumir después. La fila ya está donde tiene
que estar.

**Viernes:** a 6612 no lo visita y no hace nada con él. Su fila 104 sigue sin resolución.

### ④ Lunes 10/08 — `sincronizar`

**Cierra el ciclo 31** (su `fecha_lunes` 03/08 es anterior al lunes de esta semana):

- El rubro 72 no tiene motivos → se autocompleta: `pl_visita_rubro_motivo (72, 16)` — *No lo ofrecí*.
- Ciclo 31 → `cerrada`, `fecha_cierre = 2026-08-10 08:30`.
- La rotación 7 cubrió `{2}` de `{1, 2, 3, 4}` → **sigue abierta**.
- **La fila 104 (6612) queda sin resolución para siempre en esta rotación.** No se arrastra a ningún
  lado. Cuenta como no cubierto, que es el dato honesto.

**Sincroniza el padrón:** 2088 fue dado de baja, y hay un cliente nuevo 8890 (`s3d2`).

| id | rotacion_id | cliente | semana | dia | |
|---|---|---|---|---|---|
| ~~107~~ | ~~7~~ | ~~2088~~ | ~~1~~ | ~~1~~ | sale: sin resolución y la semana 1 no está cerrada |
| 109 | 7 | 8890 | 3 | 2 | entra: semana 3 está pendiente |

Si 2088 **hubiera tenido** una resolución, o si su semana 1 ya estuviera cerrada, la fila **no se
tocaría**. Esas son las dos invariantes que hacen que esto se pueda correr en cada apertura de la
app sin pisar nada.

### ⑤ Lunes 10/08 — arranca la semana 4, salteando la 1 y la 3

Está permitido: la rotación exige todas sus semanas, no un orden.

| id | rotacion_id | vendedor | semana | fecha_lunes | fecha_apertura | estado |
|---|---|---|---|---|---|---|
| 32 | 7 | V 2 | 4 | 2026-08-10 | 2026-08-10 08:31 | abierta |

Y la agenda de la semana 4 sale de leer `pl_rotacion_cliente WHERE rotacion_id = 7 AND semana = 4`:

| día | cliente | |
|---|---|---|
| 1 | 4412 | **el reacomodado de la semana 2, sin ningún paso de consumo** |
| 2 | 7750 | del template |
| 4 | 5120 | del template |

### ⑥ Cómo queda la cobertura

**Por rotación** (la medida): denominador = las 8 filas vivas de la rotación 7. Resueltas: 2 (una
visita, un no visité). El movimiento de 4412 **no cambió el denominador** — el trabajo se reubicó,
no desapareció ni se duplicó. La baja de 2088 lo bajó a 8 legítimamente: ese cliente ya no existe.

**Por semana** (el desglose): la semana 2 quedó con 3 filas (101, 102, 104) y no 4, porque 4412 se
fue a la 4. O sea que **la cobertura de la semana 2 mejoró cuando el vendedor reacomodó** — y eso es
exactamente por lo que el número que se reporta hacia arriba es el de la rotación cerrada y no el
semanal en vivo.

## Cambios de esquema

Esto **no es un ALTER, es una reestructuración** del dominio: cambia de qué cuelgan las
resoluciones.

```sql
-- La rotacion concreta. El set de semanas NO se declara: son los valores
-- distintos de semana en sus propias filas de pl_rotacion_cliente.
CREATE TABLE pl_rotacion (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_vendedor VARCHAR(50) NOT NULL,
  fecha_inicio               DATETIME    NOT NULL,
  fecha_fin                  DATETIME    NULL,       -- se completo
  INDEX idx_vendedor (codigo_particular_vendedor)
);

-- EL PLAN. Materializado del template al arrancar la rotacion, y editable:
-- reacomodar es un UPDATE de (semana, dia).
CREATE TABLE pl_rotacion_cliente (
  id                        INT         AUTO_INCREMENT PRIMARY KEY,
  rotacion_id               INT         NOT NULL,
  codigo_particular_cliente VARCHAR(50) NOT NULL,
  semana                    TINYINT     NOT NULL,
  dia                       TINYINT     NOT NULL,

  -- Un cliente, una fila, por rotacion. Es lo que hace imposible contarlo dos
  -- veces o perderlo al reacomodar.
  UNIQUE KEY uq_rotacion_cliente (rotacion_id, codigo_particular_cliente),
  INDEX idx_semana (rotacion_id, semana),
  FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id)
);

ALTER TABLE pl_ciclo_semana
  ADD COLUMN fecha_lunes DATE NOT NULL,              -- la semana laboral del ciclo
  ADD COLUMN rotacion_id INT  NOT NULL,
  ADD FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id);

-- La resolucion cuelga del plan de la rotacion, no del snapshot del ciclo.
ALTER TABLE pl_resolucion
  ADD COLUMN rotacion_cliente_id INT NULL,
  ADD FOREIGN KEY (rotacion_cliente_id) REFERENCES pl_rotacion_cliente (id);
-- despues del backfill: NOT NULL, UNIQUE, y se dropea ciclo_cliente_id
```

**Se van:** `pl_ciclo_cliente` entera (con su `en_plan`), el tipo `'arrastrada'` que un diseño
anterior proponía, y las columnas de bandeja (`dia_deseado`, `reagendado_de`, `excluido_en`) que
nunca llegaron a escribirse.

`pl_motivo` no cambia: el autocompletado usa el motivo 16 existente.

**Migración.** Los ALTER en este repo son intervención manual de ops, así que va todo documentado en
`docs/db-notes/` junto al `CREATE TABLE` consolidado. El orden: crear las tablas nuevas, fabricar
una rotación por vendedor que agrupe su historial (sin pretender reconstruir dónde empezaba y
terminaba cada una — el dato no existe), volcar `pl_ciclo_cliente` a `pl_rotacion_cliente`,
repuntar `pl_resolucion`, y recién entonces dropear.

## Cambios de API

- **`POST /planificacion/ciclo/sincronizar`** (nuevo). Idempotente, llamado al montar y al volver al
  foco. Cierra el ciclo abierto si su `fecha_lunes` es anterior al lunes de esta semana, y
  sincroniza el padrón de la rotación abierta. Devuelve el resumen para los avisos. Sin ciclo
  abierto es un no-op con resumen vacío, nunca un error. Endpoint propio y no un efecto lateral de
  `GET /ciclo/actual`, para que un GET no mute.
- **`PATCH /planificacion/rotacion-cliente/:id/reacomodar`** (nuevo, reemplaza a
  `/ciclo-cliente/:id/reagendar`). Recibe `{ semana?, dia }`. Es la única operación de movimiento.
- **Acciones sobre clientes** (iniciar visita, no visité): aceptan `(semana,
  codigoParticularCliente)` además del id, y un flag `confirmarCambioDeSemana`. Hoy las cards del
  preview no tienen id y el front lo rellena con `-1`.
- **`GET /ciclo/actual` y `GET /ciclo/preview`** devuelven el set de semanas de la rotación y cuáles
  faltan. Es lo que le permite al front dejar de tener el 5 clavado. La validación de `semana` en
  `planificacionController.ts:66` pasa de `<= SEMANAS_DEL_CICLO` a pertenencia a ese set.
- **`POST /ciclo/abrir` y `POST /ciclo/cerrar`**: el front deja de llamarlos.

## Cambios de front

- Se borran `CerrarSemanaSheet.tsx`, el hook `useCerrarCiclo` y el CTA de abrir semana.
- **`operable` cambia de semántica.** Hoy es `ciclo != null && semanaEfectiva === ciclo.semana`.
  Pasa a: con ciclo abierto, solo esa semana es accionable; **en standby, la semana que se está
  mirando es accionable** y la primera acción abre el ciclo.
- **Se va la constante `SEMANAS = 5`** (`AgendaSemanaPage.tsx:27`). La validación de `?semana=`
  (`:94`) valida pertenencia al set, y `moverSemana` (`:212`) recorre el set en vez de hacer
  aritmética módulo 5 — que asume cinco semanas contiguas y se rompe con un vendedor de cuatro o con
  un set `1, 2, 3, 5`.
- `EstadoVisitaSheet` gana la sección **"Otra semana"**: los días de las semanas pendientes de la
  rotación, además de los de la semana actual. Es el mismo `reacomodar` con `semana` o sin ella.
- Cartel de cambio de zona intra-semana, alimentado por el 409, con la opción de reacomodar esos
  clientes antes de cerrar.
- Avisos con `useNotificacion`: post-cierre ("Cerramos la semana 2 · 3 clientes quedaron sin
  visitar") y post-sincronización del padrón, si hubo altas o bajas.
- **El cableado muerto de `reagendada` se elimina** en vez de reusarse: el valor en `TipoResolucion` y
  `EstadoCicloCliente` de los dos repos, el `case` de `estadoCicloCliente.ts`, el badge de
  `ClienteCard.tsx:101` y la rama de `estaResuelto`. Reacomodar **no es una resolución**, es un
  `UPDATE`: el cliente simplemente deja de estar en esa semana y aparece en la otra. No hay estado
  intermedio que mostrar y no hay badge que poner.

## Analítica

El bucket `reagendados` de `indicadores/cobertura.ts` y `AnaliticaRepository` pierde sentido: mover
un cliente ya no es una resolución, es un `UPDATE`. Lo que aparece es la **cobertura por rotación**,
que hoy es incalculable por falta de la entidad y que probablemente sea el número de negocio más
importante.

Las queries que hoy filtran `cc.en_plan = 1` (`AnaliticaRepository:121`,
`CicloClienteRepository:84`) se reescriben contra `pl_rotacion_cliente`, sin el filtro: ya no hay
filas fuera del plan.

## Decisiones asumidas

- **El autocompletado de rubros usa el motivo 16** y queda indistinguible de un "No lo ofrecí"
  declarado por el vendedor. Se evaluó un motivo `'Sin declarar'` con el mismo
  `resultado = 'no_ofrecido'` (un `INSERT`, porque `pl_motivo` está diseñada para que agregar un
  motivo no sea un deploy) y se descartó. Consecuencia aceptada: sobre esos datos no se puede
  distinguir comportamiento comercial de falta de carga.
- **La cobertura semanal es móvil mientras la rotación está abierta.** El número que se reporta es
  el de la rotación cerrada.
- **Lo permanente va por Flexxus.** Nuestras ediciones son de la rotación en curso; el template no
  se escribe nunca. Un cambio de ruta definitivo se hace en el origen y entra en la próxima
  materialización.
- **No hay convivencia de ciclos abiertos:** el `UNIQUE vendedor_abierto` queda.
- **No se reabren ciclos ni visitas cerradas.**

## Fuera de alcance

- **La vista de gerencia** para reacomodar (spec 2). Este spec deja la primitiva y el endpoint; la
  pantalla, los permisos por rol, la auditoría de quién movió qué y el reporte de excepciones
  repetidas van aparte. Sin esa auditoría, "excepcional" se vuelve el mecanismo normal y el template
  se muere de a poco sin que nadie se entere.
- **Reacomodar hacia la próxima rotación.** Solo se mueve dentro de la rotación abierta: la
  siguiente todavía no está materializada.
- **UI de movimiento en lote** para el vendedor. El endpoint acepta de a uno; mover un día completo
  desde la app del vendedor no se hace en esta entrega.
- Fechas o calendario en el reacomodado: el vendedor piensa en semanas y días de rotación, y el
  mapeo `fecha → (semana, día)` no se puede hacer determinístico porque una rotación futura no tiene
  fecha hasta que se materializa.

## Riesgos y casos borde

- **La migración es lo más riesgoso de la entrega**, y no tiene vuelta atrás fácil: cambia de qué
  cuelgan las resoluciones. Conviene hacerla con el volumen productivo actual, que es chico, y con
  un script verificable (conteos antes/después por vendedor y por ciclo).
- **`AgendaRepository.findVisitAssignments` quedó como la pieza más cargada del diseño**: de ahí
  salen el plan materializado, el set de semanas de la rotación y las altas y bajas del padrón. Hoy
  es un `Record` sobre un JSON con **un solo vendedor** (`V 2`), así que los bordes de este spec no
  se pueden ejercitar contra datos reales: hay que agregar al mock un vendedor con set corto y otro
  con set no contiguo.
- **Doble `sincronizar` concurrente** (dos pestañas, o montar + foco casi simultáneos). La
  transacción y el `UNIQUE vendedor_abierto` lo hacen seguro, pero el segundo llamado tiene que
  devolver "no hice nada" y no un error.
- **Una rotación que nunca se completa.** Si el vendedor deja de hacer una semana para siempre, la
  rotación queda abierta y `proponerSemana` va a insistir con esa semana. Es la señal correcta, pero
  conviene que el reporte lo muestre en vez de dejarlo solo en la propuesta.
- **Materializar dos rotaciones a la vez** (dos dispositivos en standby actuando al mismo tiempo).
  Hace falta que la materialización sea atómica y que el segundo la encuentre hecha.
- **`resueltos / total` es gameable, y `no_visita` no deja rastro de presencia.** Si alguna vez se usa
  *resueltos* como número de cumplimiento del vendedor —tentador, porque `estaResuelto` ya devuelve
  `true` para `no_visita`— apretar "No visité · Cerrado" el viernes sobre todos los pendientes da
  100% con cero visitas. Hoy la protección es que el indicador que importa son las visitas.
  Agrava el hueco que **un `no_visita` no captura ubicación**: `pl_resolucion` tiene
  `coord_inicio`/`coord_final` nullables, pero el flujo (`onConfirmNoVisita` manda solo `motivoIds`)
  no las llena, así que doce "Cerrado" cargados desde el sillón son indistinguibles de doce clientes
  realmente cerrados — mientras una visita sí deja dos puntos comparables contra `coord_cliente`.
  Y es raro conceptualmente: "Cerrado" significa "fui y estaba cerrado", así que la ubicación en ese
  momento es tan relevante como en una visita. Fuera de alcance acá; sería un spec chico que reusa el
  mismo `navigator.geolocation` y el mismo manejo de permisos de `VisitaFlow`.

## Testing

Rotación y semanas:

- `proponerSemana` nunca propone una semana ya hecha en la rotación abierta.
- Hacer las semanas en orden salteado (`s3, s1, s5, s2, s4`) completa la rotación igual.
- Un vendedor cuyo template solo tiene `s1..s4` **completa la rotación con cuatro semanas**, y nunca
  se le propone la 5.
- Un set no contiguo (`1, 2, 3, 5`) funciona: `moverSemana` recorre el set y no cae en una semana
  inexistente.
- Si el template gana una semana a mitad de rotación, esa rotación se completa igual con las que
  tenía y la siguiente nace con la nueva.
- Un vendedor sin ninguna asignación es el error de cuenta que ya existe, no una rotación vacía.

Ciclo:

- `fecha_lunes` se calcula en TZ de negocio: un ciclo abierto un domingo 23:30 de Buenos Aires
  pertenece a la semana que arranca al día siguiente, no a la anterior.
- El cierre es una transacción: si falla el autocompletado de rubros, el ciclo no queda cerrado.
- Cerrar **no** crea ninguna resolución para los clientes sin resolver.
- En standby, actuar sobre la semana que se está mirando abre **esa** semana y no la propuesta.
- El 409 de cambio de zona trae la lista en `data`, y con `confirmarCambioDeSemana` la acción pasa.

Reacomodar:

- Mover el `dia` y mover `semana + dia` recorren el mismo camino.
- Una fila con resolución **no se puede mover**.
- Reacomodar no cambia el denominador de la rotación, y sí el desglose semanal.
- Un cliente reacomodado aparece en el ciclo de la semana destino sin ningún paso de consumo.

Sincronizar el padrón:

- Una fila con resolución no se toca aunque el cliente esté de baja.
- Una semana ya cerrada no se toca, ni para altas ni para bajas.
- Una baja sin resolver en semana pendiente sale de la rotación.
- Un alta entra en una semana pendiente con el slot del template.
- Correrlo dos veces sin cambios en el padrón no produce ningún efecto.
