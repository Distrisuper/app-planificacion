# Semana hecha, y el cierre invisible para el vendedor

**Fecha:** 2026-08-12
**Estado:** diseño validado, pendiente de plan de implementación
**Reemplaza a:** [`2026-08-12-plan-hecho-ciclo-design.md`](2026-08-12-plan-hecho-ciclo-design.md) — mismo
diagnóstico, distinta solución. La sección "Por qué no la versión anterior" explica qué la bloqueaba.

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos mandan.

## El problema

Tres síntomas, una causa.

1. **Una zona cuenta como recorrida desde que se abre**, no desde que se termina.
   `RotacionRepository.semanasHechas` (`RotacionRepository.ts:73-86`) es un `SELECT DISTINCT semana
   FROM pl_ciclo_semana WHERE rotacion_id = :rotacionId`, **sin filtro por estado**.
2. **Volver a una zona ya recorrida es estructuralmente imposible**: `UNIQUE (rotacion_id, semana)` en
   `pl_ciclo_semana` prohíbe la segunda pasada.
3. **Visitar a un cliente de otra zona quema la zona en la que estás.** `asegurar` tira un 409
   `CAMBIO_DE_SEMANA` (`CicloService.ts:53-68`) y confirmarlo cierra la zona abierta, que con (1) pasa
   a hecha: `proponerSemana` no la vuelve a proponer y sus pendientes se van de la vuelta.

La causa es que el ciclo hace tres trabajos y uno lo hace mal:

| trabajo | ¿le corresponde? |
|---|---|
| Decidir qué agenda mostrar por defecto | Sí |
| Registrar **cuándo** recorrió la zona N | Sí — es su definición |
| Ser la fuente de "qué zonas están hechas" | Sí, pero **contando desde la apertura**, que es el bug |

## La restricción que ordena todo lo demás

Decisión del usuario, y es la que descarta media docena de soluciones posibles:

> **El vendedor no ve ciclos ni rotaciones. Ve zonas, días y clientes.**

Ciclo y rotación son andamiaje de medición: existen para que gerencia pueda contar. Que el vendedor
tenga que entenderlos es una filtración de la implementación. Corolario operativo: **no puede haber
ningún cierre que él dispare, confirme o vea** — ni cartel, ni botón, ni aviso que diga "cerramos".

Eso descarta de entrada cualquier variante que necesite preguntarle algo, incluido un botón explícito
"pasar a trabajar la zona N" (ver "Descartado").

## Por qué no la versión anterior

El spec anterior derivaba "semana hecha" de las resoluciones: *hecha = sus filas del plan están
resueltas*. Cuatro bloqueantes, todos verificados contra el código:

1. **La rotación no vuelve a cerrarse nunca.** El único lugar que cierra una rotación es
   `cerrarCiclo` (`CicloService.ts:180-182`), y pasaría a exigir 100% de filas resueltas. Como el
   modelo prohíbe —con razón— auto-resolver pendientes, eso no ocurre nunca: la cola de rotaciones
   programadas se tranca y el número que se reporta hacia arriba (el de la vuelta **cerrada**) no se
   emite más.
2. **`sincronizarPadron` empieza a tocar zonas ya recorridas.** Corre en cada apertura de la app sobre
   `semanasPendientes` (`RotacionService.ts:263-269`), con la invariante documentada de no tocar
   semanas cerradas. Con "pendiente = tiene filas sin resolver", una zona ya recorrida sigue siendo
   pendiente: da de alta clientes que nadie va a visitar y **borra filas sin resolver de zonas ya
   trabajadas**, moviendo el denominador de cobertura en background y sin auditoría.
3. **Los rubros quedan sin cerrar.** `autocompletarSinMotivos` llega a los rubros solo por el ciclo
   (`VisitaRubroRepository.ts:200-214`, `JOIN pl_ciclo_semana ON (rotacion_id, semana)`). Una visita en
   una zona sin ciclo no la alcanza ningún cierre, y sin el autocompletado las cargas pendientes pasan
   a dar 403 (ver el comentario en `CicloService.ts:70-78`).
4. **Sus piezas 2 y 3 se anulan.** La 2 existe para que la segunda pasada sea representable; la 3 hace
   que operar en otra zona no abra ningún ciclo, así que la segunda pasada nunca se escribe.

Y "no cambia ningún número" era falso en un sentido que importa: la fórmula de cobertura no cambia,
pero cambia **cuándo el número queda firme** (bloqueante 1) y el denominador se vuelve movible
(bloqueante 2).

## El cambio

Cinco piezas. Las cuatro primeras en api-vendedores, la quinta a los dos lados.

### 1. `semanasHechas` cuenta solo ciclos cerrados

`AND estado = 'cerrada'` en la query de `RotacionRepository.ts:76-79`. Nada más.

"Hecha" sigue siendo una propiedad del ciclo —porque genuinamente lo es: *el vendedor recorrió la zona
y se fue*, con o sin pendientes— pero deja de mentir mientras la zona está en curso. `estado` ya es
`'abierta' | 'cerrada'` y `fecha_cierre` ya se escribe (`CicloRepository.ts:51-54`): no hay columnas
nuevas.

`semanasPendientes` y `proponerSemana` no se tocan y **conservan el significado que ya tienen**, que es
lo que salva a sus tres consumidores: `AgendaService.contexto` (`AgendaService.ts:67-70`, que viaja al
front y define en qué zona aterriza el vendedor), `proponerSemana` y `sincronizarPadron`.

### 2. `DROP INDEX uq_rotacion_semana` en `pl_ciclo_semana`

Habilita la **segunda pasada**: dos filas para la zona 2, cada una con su `fecha_lunes` real. Deja de
ser una anomalía y pasa a ser el dato correcto.

`uq_un_ciclo_abierto` **no se toca**: sigue habiendo un solo ciclo abierto por vendedor.

Consecuencia obligatoria: el join de `autocompletarSinMotivos` por `(rotacion_id, semana)` deja de ser
1:1 y barrería los rubros de las dos pasadas. Lo arregla la pieza 3.

### 3. Operar en otra zona no cierra nada, y el cierre de rubros pasa a ser temporal

`asegurar(semana)` queda con tres ramas y **ninguna lanza 409**:

| situación | qué hace |
|---|---|
| ciclo abierto de esa zona | lo devuelve (igual que hoy) |
| ciclo abierto de **otra** zona | **lo devuelve tal cual**: no cierra, no abre, no pregunta |
| sin ciclo abierto (standby) | abre el de la zona **pedida** (igual que hoy) |

La segunda rama es segura porque los llamadores usan del ciclo únicamente `rotacionId`, y la rotación
es la misma: `resolverFilaDelPlan` acota por `dto.semana` explícita
(`VisitasService.ts:329-343`). El hecho cuelga de la fila del plan, que es lo que el modelo ya dice
("un hecho pertenece a un cliente y a un momento, nunca a un ciclo").

La rama de carrera (`CicloService.ts:113-136`) sigue existiendo para el `UNIQUE vendedor_abierto`, pero
si el otro dispositivo abrió otra zona **devuelve ese ciclo** en vez de tirar 409. Con eso el código
`CAMBIO_DE_SEMANA` desaparece del sistema.

**`autocompletarSinMotivos` pasa a acotar por ventana temporal del ciclo** en lugar de por zona:
resoluciones cuyo `fecha_inicio` cae entre `fecha_apertura` y el cierre. Tres cosas de una:

- cierra los rubros de la visita hecha en otra zona (que si no, no los alcanza nadie);
- sobrevive a las dos pasadas de la pieza 2, porque la clave deja de ser `(rotacion, semana)`;
- expresa el criterio verdadero: *"se cierra la carga de lo que trabajé esta semana laboral"*, no
  *"de esta zona"*.

El `INDEX (fecha_inicio)` de `pl_resolucion` ya existe.

### 4. Volver a una zona es un acto explícito, nunca una propuesta

- `proponerSemana` sigue proponiendo **lo que falta** (zonas sin ciclo cerrado). No propone volver.
- Volver es navegar a la zona y operar: la validación de `asegurar` es contra el set de semanas
  (`SEMANA_FUERA_DEL_SET`), no contra las hechas, así que no hace falta ningún permiso nuevo. Las
  resoluciones quedan bien en los dos casos, pero **la segunda pasada solo se registra si vuelve
  estando en standby** (típicamente un lunes): con un ciclo abierto de otra zona, la pieza 3 devuelve
  ese ciclo y no abre nada. Es el mismo límite de "el ciclo registra la última zona que arrancó" — ver
  "Límites asumidos" — y es el caso en el que la pieza 2 es imprescindible.
- El front expone la afordancia en el vocabulario del vendedor: **"Zárate · 2 sin visitar"**. Nunca
  "cerrada".

La ventana de rescate **termina cuando cierra la vuelta** (todas las zonas con ciclo cerrado): ahí la
rotación pasa a `cerrada`, `findAbiertaByVendedor` devuelve null y toda acción da `FILA_AJENA`. Es
deliberado: es lo que le da fecha de corte al número que se reporta.

### 5. El vocabulario: zona, no semana

`AgendaService.contexto` pasa a devolver `{ semana, descripcion }[]` en vez de `number[]`.
`pl_rotacion_semana.descripcion` ya existe y ya se hereda de la vuelta anterior ("Buenos Aires",
"Zárate") justamente para esto.

Con eso **la palabra "semana" desaparece de la app del vendedor** y queda reservada al calendario. Hoy
"semana" significa tres cosas distintas —la zona (`s1..s5`), la semana laboral (`fecha_lunes`) y la
pasada (la fila de ciclo)—, y ese solapamiento es lo que hizo descarrilar al spec anterior.

Inventario de lo que se le filtra hoy y en qué se convierte:

| dónde | hoy | pasa a ser |
|---|---|---|
| header (`AgendaSemanaPage.tsx:373`) | "Semana 3 · 13–17 Jul" | "Zárate · 13–17 Jul" |
| aviso del lunes (`AgendaSemanaPage.tsx:106-113`) | "**Cerramos tu semana 2** — 2 clientes quedaron sin visitar" | "Zárate: quedaron 3 visitas sin hacer" |
| flechas del header (`AppHeader.tsx:62,69,88`) | "Semana anterior/siguiente" | "Zona anterior/siguiente" |
| `CICLO_NO_ABIERTO` (`CicloService.ts:251`) | "No tenés ninguna semana abierta. **Abrí una** para empezar a trabajar." | mensaje interno: el front no ramifica sobre él (`useAgenda.ts:12`) y le pide una acción que no existe |
| `ROTACION_COMPLETA` | "Esta rotación ya tiene todas sus semanas hechas" | mensaje interno, nunca visible |

Y **el aviso cuenta visitas, no clientes**: `findCodigosSinResolver`
(`RotacionClienteRepository.ts:222-241`) devuelve códigos **sin `DISTINCT`**, así que un cliente con dos
filas en la misma zona (`s1d3` y `s1d5`) aparece dos veces y hoy el texto dice "3 clientes" cuando son
2 clientes y 3 visitas. Se corrige el texto, no la query: **visitas es lo correcto**, es lo que cuenta
el denominador.

## Qué se borra en el front

Igual que en el spec anterior, el arreglo **quita** código:

- `CambioDeSemanaDialog.tsx` y su test.
- El estado `cambioDeSemana`, `reintentando` y `manejarCambioDeSemana` en `AgendaSemanaPage`.
- `confirmarCambioDeSemana` de `IIniciarVisitaDTO` / `INoVisitaDTO`, su plumbing en `VisitaFlow`, y del
  lado del backend el parámetro de `asegurar`, el campo en `types/planificacion.ts:252` y el swagger de
  `routes/planificacion.ts:90`.

Y a diferencia del spec anterior, **el borrado es seguro**: ahí quedaba la rama de carrera lanzando
`CAMBIO_DE_SEMANA` sin nadie que lo manejara.

`ClienteCard.modo` **se deja como está** (declarada y sin usar, `ClienteCard.tsx:11-14`). Desgatearla
fue una decisión deliberada del plan del 2026-08-10 —"toda semana de la rotación es accionable"— y
volver a gatearla contradiría la pieza 3. Si alguna vez se usa, es para un matiz **visual**: una banda
"estás mirando Zárate, arrancaste en Buenos Aires", nunca un bloqueo de acciones.

## Qué NO se toca

`pl_resolucion` (ni una columna nueva, sigue sin apuntar al ciclo) · el plan y su unique · la fórmula
de cobertura y su denominador · `uq_un_ciclo_abierto` · `sincronizarPadron` · las reglas de quién puede
mover el plan.

## Qué se gana

- Una zona en curso deja de contar como recorrida. Es el bug real.
- Volver a una zona queda posible, registrado y con su fecha.
- La visita en otra zona deja de ser destructiva y deja de pedir confirmación.
- La rotación **sigue cerrándose**, que es donde se trababa la versión anterior.
- El vendedor deja de ver vocabulario de implementación.
- Sin columnas ni tablas nuevas. Una línea de DDL (`DROP INDEX`), sin migración de datos.

## Límites asumidos

**El ciclo abierto deja de ser "dónde está el vendedor" y pasa a ser "la última zona que arrancó".** Si
el miércoles se muda de verdad a otra zona y trabaja ahí toda la semana, el ciclo sigue diciendo la
zona vieja hasta el lunes, y la zona nueva recién recibe su ciclo cuando él actúe ahí después del
cierre automático. Consecuencias: la vuelta puede llevar una semana extra de contabilidad, y el
`fecha_lunes` de esa pasada queda una semana corrido.

Se acepta porque:

- **los hechos —lo que se mide— siempre quedan correctos y con su fecha real**; lo que se corre es el
  registro de la pasada, que solo alimenta "qué zonas faltan";
- la alternativa (cerrar en silencio la zona vieja y abrir la nueva ante cualquier acción) tiene un
  efecto colateral peor: `cerrarCiclo` autocompleta los rubros sin cargar con el motivo 16, así que una
  visita suelta en otra zona le cerraría la carga de la visita que hizo esa misma mañana;
- la única solución exacta es preguntarle, y la restricción de arriba lo prohíbe.

Si algún día molesta, el camino es un registro **derivado** de pasadas incidentales (escrito al cerrar,
desde las resoluciones de la ventana, marcado como incidental y excluido de `semanasHechas`). Queda
fuera de este spec: mal hecho —sin la marca— una sola visita suelta marcaría la zona como hecha y le
saltearía 39 clientes.

## Testing

**Backend:**

- `semanasHechas` **no** cuenta una zona con ciclo `abierta`; sí cuenta la misma zona una vez cerrado.
- Una zona con ciclo cerrado **y pendientes** cuenta como hecha, y `proponerSemana` no la vuelve a
  proponer.
- `asegurar` con ciclo abierto de otra zona **devuelve el ciclo abierto**, no cierra nada y no tira
  409. Y la resolución se crea sobre la fila correcta.
- Dos ciclos para la misma `(rotacion_id, semana)` con `fecha_lunes` distintos conviven; el segundo se
  abre por la vía normal de `asegurar` estando la zona ya hecha.
- `uq_un_ciclo_abierto` sigue valiendo: sacar `uq_rotacion_semana` no habilita dos ciclos abiertos.
- `cerrarCiclo` cierra la rotación cuando **todas** las zonas del set tienen ciclo cerrado, y no antes.
- `autocompletarSinMotivos` alcanza los rubros de una visita hecha en una zona **sin ciclo propio**, y
  con dos pasadas por la misma zona solo barre los de su propia ventana temporal.
- La rama de carrera devuelve el ciclo ganador incluso si es de otra zona, sin 409.
- `contexto` devuelve la `descripcion` de cada zona, y `null` no rompe el header.
- Un quincenal (dos filas) cuenta 2 en el denominador y resolver una celda no marca la otra.

**Front:**

- `AgendaSemanaPage` ya no maneja `CAMBIO_DE_SEMANA` ni monta el diálogo.
- El header muestra el nombre de la zona; cae al número si `descripcion` es null.
- El aviso del lunes no dice "cerramos" y cuenta **visitas**.
- Una zona ya recorrida con pendientes se muestra operable, con "N sin visitar" y sin la palabra
  "cerrada".

## Documentos vivos a corregir al implementar

No se tocan antes: describen el sistema **de hoy**, y hasta que esto esté mergeado el de hoy es el
viejo.

- `docs/dominio/modelo.md`: "Las dos transiciones" (la excepcional con cartel deja de existir), la
  "Limitación conocida" (se resuelve), y sumar la restricción de vocabulario como regla durable.
- `docs/dominio/tablas.md`: el `UNIQUE (rotacion_id, semana)` de `pl_ciclo_semana` y su nota sobre
  "COUNT DISTINCT confiable".
- `CLAUDE.md`: la viñeta del cierre automático y la de la rotación completa.

## Descartado

- **Derivar "hecha" de las resoluciones** — el spec anterior. Cuatro bloqueantes arriba.
- **Un botón "pasar a trabajar la zona N"** — es la única forma exacta de distinguir "pasé por un
  cliente" de "me mudé de zona", y por eso se evaluó. Lo prohíbe la restricción de vocabulario: es
  pedirle al vendedor que administre el ciclo.
- **Cerrar en silencio la zona vieja al operar en otra** — cumple la restricción pero le autocompleta
  con "No lo ofrecí" los rubros de la mañana. Ver "Límites asumidos".
- **Volver a gatear `ClienteCard.modo`** — contradice la pieza 3 y revierte una decisión ya tomada.
- Las cuatro ideas de siempre —auto-resolver pendientes, justificación obligatoria, semanas
  secuenciales, UI de rescate masivo— siguen descartadas con su razón en `docs/dominio/modelo.md`,
  sección "Lo que NO hay que hacer". Ninguna se reabre acá.

## Fuera de este spec

El **caso del cliente quincenal adelantado**: al no tener forma de expresar "trabajo extra", el
vendedor que visita hoy a un cliente de otra zona consume su fila futura, y el cliente queda 2/2
cubierto habiendo estado un mes sin atención. No lo bloquea este cambio y tiene su propio spec:
[`2026-08-12-visita-extra-buscador-design.md`](2026-08-12-visita-extra-buscador-design.md).
