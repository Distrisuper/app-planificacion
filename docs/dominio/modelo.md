# El modelo: plan, hecho y ciclo

**Documento vivo.** Describe cómo funciona el dominio hoy y qué reglas hay que respetar al tocarlo. No
es el registro de una decisión: si el código y este archivo se contradicen, gana el código y hay que
corregir este archivo.

El esquema está en [`tablas.md`](tablas.md). Acá está el porqué.

## Por qué existe este documento

Casi todas las preguntas de diseño que aparecen en este dominio son la misma pregunta disfrazada:

- ¿El reagendar contempla si ya cerró una semana?
- ¿El vendedor tiene que justificar los clientes que no visitó?
- Si va un día a otra zona, ¿lo ajusta gerencia o lo registra él?
- ¿Las semanas deberían ser secuenciales?
- ¿Se pueden auto-resolver los pendientes al cerrar, para que la semana no quede colgada?
- Si visita a un cliente de otra semana, ¿dónde queda ese hecho?

**Ninguna es una pregunta de UI.** Las seis salen de no tener claros tres conceptos que están bien
separados en la base pero se mezclan al hablar: el plan, el hecho y el ciclo. Con esos tres fijados,
las respuestas caen solas.

## Las tres capas

```
┌─ PLAN ORIGINAL ─────────────────────────────────────────────────────────┐
│  reconstruible desde pl_reacomodacion                                   │
│  (semana_antes, dia_antes del primer movimiento de cada fila)           │
│  → qué se había planificado                                             │
└─────────────────────────────────────────────────────────────────────────┘
              │  reacomodar: UPDATE (semana, dia) — audita en pl_reacomodacion
              ▼
┌─ PLAN ACTUAL ───────────────────────────────────────────────────────────┐
│  pl_rotacion_cliente — una fila por celda (cliente, semana, día)        │
│  → dónde va el cliente ahora                                            │
└─────────────────────────────────────────────────────────────────────────┘
              │  la resolución cuelga de la fila del plan
              ▼
┌─ HECHO ─────────────────────────────────────────────────────────────────┐
│  pl_resolucion — una por fila del plan, inmutable                       │
│  → qué pasó, y cuándo                                                   │
└─────────────────────────────────────────────────────────────────────────┘

        ┌─ CICLO (al costado, NO en la cadena) ───────────────────────────┐
        │  pl_ciclo_semana                                                │
        │  → dónde estuvo trabajando el vendedor                          │
        └─────────────────────────────────────────────────────────────────┘
```

**El ciclo está al costado a propósito, y es la decisión central del modelo.** `pl_resolucion` no
tiene ni una columna que apunte al ciclo: referencia únicamente `rotacion_cliente_id`, más su
`fecha_inicio`. De ahí sale la regla que responde media docena de preguntas de golpe:

> **Un hecho nunca pertenece a un ciclo. Pertenece a un cliente y a un momento.**

La analítica va por el mismo camino: **todas** sus queries filtran por rango de `fecha_inicio` y recién
después saltan al plan. El ciclo no aparece en ese recorrido.

**Corolario práctico:** si el vendedor visita hoy a un cliente que el plan tenía en otra semana, el
hecho queda registrado **hoy**, sobre ese cliente, y **el plan no se toca**. No hay que "mover" nada
para que la visita cuente.

## Los dos ejes: quién escribe dónde

Una operación escribe en el plan **o** escribe en el hecho. **Nunca en los dos.** Corregir el plan no
dice nada sobre si el cliente se visitó, y registrar lo que pasó no corrige el plan.

| operación | eje | quién | efecto |
|---|---|---|---|
| Reagendar un cliente (sheet del vendedor) | plan | vendedor | `UPDATE semana, dia` + fila en `pl_reacomodacion`. Queda **pendiente** |
| Mover / intercambiar en el grid | plan | gerencia | N `UPDATE`s, ídem auditado |
| Iniciar + cerrar visita | hecho | vendedor | `pl_resolucion` tipo `visita`, 2 coords, duración |
| "No visité" + motivo | hecho | vendedor | `pl_resolucion` tipo `no_visita` + `pl_resolucion_motivo` |
| **Cerrar una semana** | **ninguno** | automático | registra *cuándo* se recorrió. **No escribe resolución** |

Esa última fila es donde se concentra la confusión. Cerrar una semana no es un hecho comercial ni una
corrección de plan: es "el vendedor se movió de zona" o "el calendario avanzó".

### La distinción que hay que hacer antes de mover algo

- Si el cliente **de ahora en más** va en otra semana → es **plan**, se mueve.
- Si **hoy pasó por ahí y lo visitó** → es un **hecho**, se registra solo y el plan no se toca.

Mover el plan para reflejar una visita puntual lo corrompe: la próxima vuelta el cliente queda en la
zona equivocada y se pierde la línea de base de qué estaba planificado.

## Los tres valores del hecho

| | qué es | qué aporta |
|---|---|---|
| **sin resolución** | la ausencia de un hecho: nadie hizo nada | nada, **y eso es el dato**: no se cubrió |
| **`no_visita`** | un hecho declarado: fue o intentó | un motivo agrupable (Cerrado, Vacaciones, No atiende) |
| **`visitada`** | fue y estuvo | motivos por rubro + 2 coords comparables contra `coord_cliente` + duración |

**"Pendiente" no es un cuarto valor: es la ausencia de fila.** El enum del front
(`EstadoCicloCliente`) tiene cuatro valores —`pendiente | en_curso | visitada | no_visita`— y
`pendiente` se deriva de no tener resolución. **No existe un estado `reagendada`.**

## Cómo se mide

**La unidad de medida es la rotación, no la semana.** El denominador son las filas de
`pl_rotacion_cliente` de esa rotación, y **reacomodar no lo cambia**: mover un cliente de la semana 2
a la 4 no agrega ni quita trabajo, solo lo reubica.

**El denominador cuenta visitas planificadas, no clientes.** Un cliente quincenal tiene dos filas en la
rotación y aporta 2, que es la cantidad de visitas que se le deben. Ver el unique de
`pl_rotacion_cliente` en [`tablas.md`](tablas.md) — es la trampa más fácil de este esquema.

Tres consecuencias que hay que tener presentes:

- **La vista semanal es un desglose, no la medida.** Mientras la rotación está abierta el corte por
  semana se mueve: si un pendiente de la 2 se reacomoda a la 4, la 2 mejora y la 4 empeora. Es
  correcto —el trabajo se movió— y es por eso que el número que se reporta hacia arriba es el de la
  rotación **cerrada**, no el semanal en vivo.
- **`no_visita` no sube la cobertura.** Es un bucket separado de `visitados` en
  `indicadores/cobertura.ts`. Para la cobertura, pendiente y no visité son idénticos: cero visitas.
- **`resueltos / total` es gameable: no usarlo como cumplimiento.** `estaResuelto` devuelve `true` para
  `no_visita`, así que declarar "No visité · Cerrado" sobre todos los pendientes da 100% con cero
  visitas. Agrava que un `no_visita` **no captura ubicación** hoy: las columnas existen en
  `pl_resolucion` pero el flujo manda solo `motivoIds`, así que doce "Cerrado" cargados desde el sillón
  son indistinguibles de doce clientes realmente cerrados. La protección actual es que el indicador que
  importa son las visitas.

**Y el día real nunca se deriva del plan.** `iniciarVisita` no recibe fecha ni día: el instante sale del
servidor. Si el plan decía martes y visitó el miércoles, queda el miércoles y el plan sigue diciendo
martes — la divergencia se conserva, que es lo que hace medible la adherencia.

## El tiempo

- **El ciclo es la semana laboral: lunes a viernes, siempre.** `fecha_lunes` en TZ de negocio decide
  cuándo vence. Abrir un viernes graba el lunes de *esa* semana: el que empieza tarde no estira su
  vuelta, le queda menos semana y la cobertura lo muestra.
- **Los feriados no son un caso especial.** No cambian cuándo cierra el ciclo; cambian cuánto se pudo
  visitar, que es lo que la cobertura debe reflejar y no compensar.
- **Los días que ya pasaron no generan lógica.** No hay "día vencido": un cliente sin visitar el lunes
  sigue pendiente y el vendedor decide antes del viernes.
- **La rotación se completa cuando están todas sus semanas, y NO en orden.** `proponerSemana` propone
  una de las que **faltan**. Las semanas son **zonas**, y cuál se hace primero es una decisión del
  mundo real (el clima, un camión, un cliente que solo atiende martes).

## Cerrar una zona, y por qué el vendedor no lo ve

**La única transición existente es el cambio de semana laboral.** El lunes, al entrar a la app, el
ciclo de la zona que pasó **se cierra solo y no se abre nada**: queda en standby. El calendario avanzó
y el vendedor no eligió nada, así que no se le pregunta; se le avisa cuántas visitas quedaron sin
hacer. Pasa dentro de `sincronizar`, que es idempotente y se llama al montar y al volver del
background.

**No hay una transición "excepcional" con cartel.** Antes, tocar una acción sobre un cliente de otra
zona (semana 2 abierta, miércoles, acción sobre un cliente de la 4) exigía confirmar un 409
`CAMBIO_DE_SEMANA` que cerraba la 2 de una. Ese código **ya no existe**: operar sobre otra zona
devuelve el ciclo abierto tal cual — no cierra nada, no abre nada, no pregunta. El hecho cuelga de la
fila del plan (acotada por la semana explícita del objetivo), nunca del ciclo, así que no hace falta
tocar el ciclo para que la visita cuente. Ver
`docs/superpowers/specs/2026-08-12-semana-hecha-cierre-invisible-design.md`.

**El vendedor no cierra la semana, y tampoco ve que algo se cerró.** No existe una pantalla ni un
endpoint que invoque desde el front, y el cierre —cuando ocurre, siempre el lunes— es invisible:
**el vendedor no ve ciclos ni rotaciones. Ve zonas, días y clientes.** Ciclo y rotación son andamiaje
de medición para gerencia; que el vendedor tenga que entenderlos es una filtración de la
implementación. Por eso "semana N" no aparece en su UI — aparece el nombre de la zona
(`pl_rotacion_semana.descripcion`), con el número como único fallback si esa zona nunca se nombró. Y
**cerrar no crea resoluciones** — los pendientes quedan pendientes y la cobertura los cuenta como no
cubiertos.

**Límite asumido:** el ciclo abierto pasa a significar "la última zona que el vendedor arrancó", no
"dónde está ahora mismo". Si se muda de zona a mitad de semana, el registro de esa pasada llega
recién el lunes siguiente. Los HECHOS —lo que se mide— quedan siempre correctos con su fecha real; lo
que se corre es solo el registro de cuándo se recorrió la zona. La alternativa exacta (preguntarle al
vendedor) está descartada por la restricción de arriba.

## Volver a una zona ya recorrida

**Es posible, es un acto explícito del vendedor, y nunca una propuesta del sistema.** No hay
`UNIQUE (rotacion_id, semana)` en `pl_ciclo_semana`: una zona puede tener más de una pasada,
cada una con su propio `fecha_lunes`. `proponerSemana` sigue proponiendo únicamente lo que falta —
nunca sugiere volver—, y la ventana para rescatar pendientes de una zona ya cerrada **termina cuando
cierra la rotación completa**: ahí el número queda firme y es el que se reporta hacia arriba.

## Quién puede mover el plan

**Los dos pueden, y cada movimiento queda atribuido** en `pl_reacomodacion` con antes, después, origen
(`vendedor` | `gerencia`) y usuario. Por eso el plan puede ser mutable sin perder la línea de base.

El criterio para no restringir: **la fricción es inmediata y el daño es revisable.** Si el vendedor
tiene que pedir autorización, paga la fricción parado frente al cliente, cada vez. Si mueve algo que no
correspondía, gerencia lo ve después y lo corrige.

- **El día, dentro de su semana: del vendedor.** Es táctico, y es información que solo él tiene ("pasá
  el jueves que hoy no está el encargado de compras").
- **La semana: puede, pero es lo que gerencia debería revisar.** Cambiar a un cliente de zona es
  estructural, no táctico. Queda marcado con `origen = 'vendedor'`.

**Lo que falta para que eso sea gobernable no es un permiso menos, es una superficie de revisión.** Hoy
`ultimoMovimiento` se muestra como un `✎` con tooltip por card en el grid de gerencia: con 200 clientes
nadie lo encuentra, y no hay vista agregada. `pl_reacomodacion` ya tiene los datos.

## Lo que NO hay que hacer

Cuatro ideas que aparecen sistemáticamente, son razonables a primera vista, y están descartadas. Se
escriben acá porque son del tipo que alguien agrega "para mejorar".

### No auto-resolver los pendientes como `no_visita`

Ni al cerrar la semana, ni como paso previo a rescatar clientes. Parece prolijo y deja la semana sin
filas colgadas, pero:

- **Inventa un hecho comercial que nadie declaró.** `no_visita` significa "fue o intentó".
- **Lo hace sin motivo**, llenando `pl_resolucion_motivo` de filas vacías — la tabla existe justamente
  para poder responder "cuál es la objeción más frecuente en la zona norte".
- **Se descalifica solo:** una fila resuelta **no se puede reacomodar** (`FILA_RESUELTA`). Auto-resolver
  no es el paso previo a rescatar al cliente, es lo que lo impide. Resolver es la única puerta sin
  retorno del dominio.

Y no gana nada: para la cobertura, pendiente y `no_visita` son idénticos (cero visitas).

### No exigir que el vendedor justifique cada cliente no visitado

- Fabrica el mismo hecho inventado, **pero peor**: un motivo elegido para salir del paso *parece* real y
  contamina el `GROUP BY` de forma indetectable. Auto-resolver al menos dejaba el motivo vacío y por lo
  tanto visiblemente sintético.
- Convierte `resueltos / total` en 100% por construcción.
- **No hay dónde ponerlo.** El vendedor ya no cierra la semana: el cierre pasa solo al abrir la app o
  como paso interno de una acción. Pedir 26 justificaciones en el arranque es un muro.

Si alguna vez hace falta trazabilidad de por qué una vuelta perdió N clientes, la respuesta es **una**
razón por evento de cierre (cambió de zona, licencia, imprevisto), no N razones por cliente — y como
picklist, no texto libre.

### No volver a semanas secuenciales (1, 2, 3…)

Es el modelo viejo y se sacó a propósito. `proponerSemana` era `(última % 5) + 1`, y esa aritmética
asume cinco semanas contiguas: saltear una la dejaba una vuelta entera sin visitar, y a un vendedor de
cuatro semanas le proponía una quinta inexistente. No aporta a la medición, porque la cobertura es a
nivel rotación y no le importa el orden.

### No poner una UI de rescate masivo de pendientes en el cambio de semana

Pedirle una decisión de planificación al vendedor parado frente a un cliente, con la visita sin
arrancar, es el peor momento posible. El movimiento en bloque ya existe y está mejor ubicado: el grid
de gerencia, con la rotación entera a la vista y sin apuro.

## Resuelto: "semana hecha" ya no se deriva de abrir el ciclo

Hasta el spec del 2026-08-12 (`2026-08-12-semana-hecha-cierre-invisible-design.md`), una zona contaba
como recorrida **desde que se abría** el ciclo, no desde que se terminaba:

```sql
SELECT DISTINCT semana FROM pl_ciclo_semana WHERE rotacion_id = :rotacionId
```

Sin filtro por estado. Y `UNIQUE (rotacion_id, semana)` en `pl_ciclo_semana` impedía
estructuralmente una segunda pasada por esa zona, así que cerrar una zona con pendientes se los
llevaba de la vuelta para siempre, y operar sobre un cliente de otra zona la cerraba de una (con
cartel de confirmación — ver la sección de arriba).

**La corrección fue acotar el predicado, no cambiar de dónde sale el dato:**
`RotacionRepository.semanasHechas` ahora filtra `AND estado = 'cerrada'`. "Hecha" sigue siendo una
propiedad del ciclo —el vendedor recorrió la zona y se fue, con o sin pendientes—, pero deja de
mentir mientras la zona sigue en curso. La alternativa evaluada (derivar "hecha" de que todas las
filas del plan estén resueltas) se descartó: con la regla de no auto-resolver pendientes, una zona no
llega a 100% resuelta casi nunca, y la rotación dejaba de poder cerrarse — ver la sección "Por qué no
la versión anterior" del spec.

El ciclo sigue haciendo exactamente los mismos dos trabajos que le corresponden — decidir qué agenda
mostrar por defecto, y registrar cuándo se recorrió cada zona —, ahora sin el bug de contar desde la
apertura.
