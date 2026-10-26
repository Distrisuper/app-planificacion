# "Visito más tarde": postergar una visita ya abierta

**Fecha:** 2026-09-22
**Estado:** diseño aprobado en conversación, pendiente de plan de implementación
**Repos:** api-vendedores (backend), app-planificacion (front)

## El problema

El gate de los 100 m empuja al vendedor a iniciar la visita en la vereda. Entra, pregunta, y el
dueño no está o el local cerró. Va a volver a las 17 hs. Hoy no tiene forma de decirlo:

- **Cerrar visita** declara una visita hecha, con pocos o cero rubros. Infla la cobertura y
  consume la fila del plan: a las 17 hs, `POST /planificacion/visitas` rebota con
  `409 CICLO_CLIENTE_YA_RESUELTO` ("Este cliente ya fue resuelto. Actualizamos tu agenda.").
- **No visité** también es una resolución, y bloquea el reintento exactamente igual. La puerta
  "correcta" para el local cerrado tampoco le permite volver.
- **El "+" del buscador** en el mismo día devuelve la misma fila resuelta (`crearExtra` es
  idempotente contra `uq_rotacion_cliente`), así que "Agregar" parece no hacer nada. Agregarlo en
  otro día de la zona sí crea una fila nueva, pero eso mueve el denominador por un problema del
  mismo día.

La causa es el modelo, no un bug: `pl_resolucion` tiene `UNIQUE (rotacion_cliente_id)` (un hecho
por fila del plan) y la fila del plan es única por `(rotacion_id, cliente, semana, dia)`. Una
celda con hecho está consumida.

## La decisión

**Se agrega una tercera salida de la visita abierta que NO deja hecho: "Visito más tarde".**
Borra la resolución abierta y sus hijos; la fila del plan vuelve a pendiente por ausencia de
resolución, que es exactamente cómo el modelo define "pendiente". A las 17 hs el vendedor inicia
una visita normal.

Es compatible con la inmutabilidad del hecho tal como la define `modelo.md`: **la inmutabilidad es
de la resolución CERRADA**. Esta nunca se cerró. No es una corrección de un hecho anterior: es
retirar una declaración que nunca llegó a hacerse.

Las tres salidas de una visita abierta, cada una con su significado:

| salida | qué declara | deja hecho | cuenta en cobertura |
|---|---|---|---|
| Cerrar visita | visité, con estos rubros | `visita` cerrada | sí |
| No visité | no lo voy a visitar en esta vuelta, por este motivo | `no_visita` | no (bucket aparte) |
| **Visito más tarde** | no estaba, vuelvo | **ninguno** | no (sigue pendiente) |

Si el vendedor nunca vuelve, el cliente queda pendiente y la cobertura lo cuenta como no cubierto.
Eso es lo honesto: nadie declaró nada.

### Qué se descartó y por qué

- **Permitir más de una resolución por fila del plan** (relajar `uq_resolucion` a "una abierta por
  fila", agenda y analítica leyendo la última). Cubre el caso pero exige ALTER en producción
  (intervención manual de ops), tocar el `LEFT JOIN` de la agenda, `estaResuelto` y todas las
  queries de analítica, y abre la puerta a re-visitar un cliente ya `visitada`, que sí duplica
  visitas a discreción. Demasiado costo para un problema que se resuelve sin hecho.
- **Marcar la resolución como cancelada** en vez de borrarla. Deja rastro, pero el `UNIQUE`
  impide la visita nueva después. Exige el mismo ALTER.
- **Copiar a una tabla de auditoría y borrar.** Deja rastro sin tocar el unique, pero es tabla
  nueva (mismo costo de ops) para un dato que nadie pidió. **Queda anotada como pendiente**: si
  gerencia quiere saber cuántas veces se posterga, ese es el camino, y da a la vez el conteo y la
  posibilidad de un límite real.
- **Límite de una postergación por día.** Postergar no tiene premio: no mejora cobertura ni
  motivos, así que el abuso no gana nada. Hacerlo en serio requiere la tabla de auditoría; hacerlo
  solo en el front con localStorage es un candado de mentira (se saltea borrando datos o cambiando
  de teléfono). Y rompe un caso legítimo: a las 10 le dicen "volvé a las 14", a las 14 "volvé a
  las 17" — con el límite, la segunda vez lo obligamos a declarar algo falso, que es el problema
  que este spec viene a sacar. **Tampoco se agrega un "empujón" textual** ("ya postergaste hoy"):
  se evaluó y se dejó afuera para no sumar estado local sin pedido concreto.
- **Cancelar y reagendar en un paso** (elegir día desde el mismo sheet). Mezcla un hecho
  descartado con un movimiento del plan. Se eligió que "Visito más tarde" solo devuelva la fila a
  pendiente en el mismo día; si después quiere pasarlo al jueves, usa el "Reagendar" de siempre
  sobre la card pendiente. Dos gestos, cada uno significa una sola cosa.

## Backend (api-vendedores)

### Endpoint

`DELETE /planificacion/visitas/:id` → `204`.

### Servicio: `VisitasService.postergar(user, visitaId)`

Reusa la guarda que ya usan `cerrar` y `noVisitaSobreVisitaAbierta` (la visita existe, es tipo
`visita`, pertenece a la rotación abierta del vendedor). Reglas propias:

| condición | respuesta |
|---|---|
| no existe | `404 VISITA_NOT_FOUND` (el que ya usa la guarda) |
| es `no_visita` | `409 RESOLUCION_NO_ES_VISITA` (el que ya usa la guarda) |
| de otro vendedor | `403 VISITA_AJENA` |
| `fecha_fin` no es null | `409 VISITA_YA_CERRADA` — misma respuesta que hoy da cerrar dos veces |

Sin gate de distancia, sin captura de ubicación: es la salida del vendedor que está adentro del
local y no puede visitar. Sin aviso a Cromo: no hubo hecho. Sin lógica de vendedor de prueba: solo
toca filas `pl_*` del propio vendedor, así que los dos invariantes se cumplen solos.

### Borrado

Una transacción sobre `sequelizeWritePlanificacion`, hijos primero porque **ningún FK tiene
`ON DELETE CASCADE`**:

1. `pl_ofrecimiento_alcance` de los ofrecimientos de la visita.
2. `pl_visita_rubro_motivo` de los ofrecimientos de la visita.
3. `pl_ofrecimiento` de la visita.
4. `pl_resolucion_motivo` de la visita (defensivo: una visita abierta no debería tener, pero el
   FK rebotaría si hubiera).
5. `pl_resolucion`.

El `WHERE` del último paso incluye `fecha_fin IS NULL`, y si afecta 0 filas la transacción se
revierte con `409 VISITA_YA_CERRADA`: así una carrera entre "Cerrar visita" y "Visito más tarde"
desde dos pestañas no borra una visita que acaba de cerrarse. Es el mismo criterio que
`assertSinResolver`: el check del servicio da el mensaje legible, la condición en el `UPDATE`/
`DELETE` da la garantía.

Se pierden el `coord_inicio` y lo que haya cargado en ese arranque. Se acepta: si el cliente no
estaba, no ofreció nada.

### Tests (backend)

- Borra resolución y sus hijos; la fila queda sin resolución y `iniciar` sobre ella vuelve a
  funcionar.
- Rebota cerrada (`409`), `no_visita` (`409`), ajena (`403`), inexistente (`404`).
- Con `fecha_fin` seteado entre el check y el `DELETE`, la transacción se revierte y no queda
  nada borrado.

## Front (app-planificacion)

### Dónde vive

**Dos puertas para la misma acción**, con el mismo patrón que hoy tiene "No visité":

1. **`VisitaSheet`**, en la línea de identidad del header, al lado de "No visité". No detrás de un
   `⋯`: el criterio de ese header ya está escrito en el componente (un control que el vendedor
   necesita encontrar rápido, parado en el local, no va detrás de un menú). Mismo rectángulo
   `rounded-lg` con ícono + texto que "No visité", pero **neutro** (borde y texto `dsnavy` sobre
   fondo claro), no rojo: rojo es la salida negativa, y postergar no es negativo. Ícono `Clock`.
   Texto: **"Más tarde"** (corto, porque comparte línea con "No visité" y el chip de descuentos;
   el eyebrow del diálogo dice el nombre completo). Solo con la visita abierta (`!visitaCerrada`),
   igual que "No visité". Aplica también a la visita de alta, sin diferencia.
2. **`EstadoVisitaSheet`** (el "Reagendar" de la card de un cliente `en_curso`), como tercera
   opción junto a los días y "No visité", **solo cuando el cliente tiene visita abierta**. Es la
   misma acción por la otra puerta, igual que hoy "No visité" se ofrece desde las dos.

Si la línea del header no entra en 360 px con los tres controles, el chip de descuentos cede
primero (es consulta, y ya tiene su propia sección en el sheet). Se verifica en el plan.

### Qué hace

Toca "Más tarde" → `ConfirmDialog`:

> **Visito más tarde**
> El cliente vuelve a quedar pendiente para hoy. Lo que cargaste en esta visita se descarta.
> [Volver] [Postergar]

Al confirmar, en este orden:

1. `DELETE /planificacion/visitas/:id` vía un hook nuevo `usePostergarVisita` en `useVisitas.ts`,
   que invalida agenda y ciclo como los demás.
2. Limpieza local de esa visita, **la misma que hace "No visité" sobre visita abierta** en
   `VisitaFlow` y `AgendaSemanaPage`: `limpiarInicioVisita(id)`, `limpiarVisitaEnCurso()`, y los
   borradores de `resolucionDraft.ts` (`limpiarBorrador`, `limpiarDetalles`,
   `limpiarObservaciones`, `limpiarMarcasOfrecidas`). Hoy esa limpieza está repetida en las dos
   puertas de "No visité"; el plan la extrae a una función única `limpiarLocalDeVisita(id)` para
   que las cuatro llamadas (dos de no-visita, dos de postergar) no diverjan.
3. `setVisitaEnCurso(null)`, cerrar el sheet, sacar `VisitaEnCursoBar`.
4. Aviso: **"Visita postergada. El cliente sigue pendiente."**

La card vuelve a dibujarse como pendiente: sin tilde, con "Reagendar" e "Iniciar visita".

### Errores

| código | tratamiento |
|---|---|
| `VISITA_YA_CERRADA` | aviso informativo "Esta visita ya estaba cerrada. Actualizamos tu agenda.", limpieza local igual, refetch — mismo trato que hoy recibe `CICLO_CLIENTE_YA_RESUELTO` |
| cualquier otro | aviso de error "No se pudo postergar. Volvé a intentar.", **sin** limpieza local (la visita sigue abierta) |

### Tests (front)

- "Más tarde" aparece solo con la visita abierta, en `VisitaSheet` y en `EstadoVisitaSheet`.
- Confirmar llama al endpoint con el id correcto, limpia todas las claves `visita-*` de esa visita
  y deja `visita-en-curso` vacío.
- Con `VISITA_YA_CERRADA` limpia local y muestra el aviso informativo; con otro error no limpia.
- `limpiarLocalDeVisita` borra las seis claves y nada más.

## Orden de despliegue

**Primero backend, después front.** Un front con el botón contra una API sin el endpoint le da un
error al vendedor en el peor momento. Al revés no pasa nada: el endpoint sin botón es inerte.

## Documentación a actualizar

- `docs/dominio/modelo.md`, sección "Los tres valores del hecho": sumar "Visito más tarde" como la
  salida que NO deja hecho, con la tabla de las tres salidas; y en la lista de pendientes con razón,
  la auditoría del arranque abortado.
- `CLAUDE.md`, "Decisiones no obvias": una entrada corta que apunte a este spec y a la razón por
  la que no hay límite diario.

## Fuera de alcance

Auditoría de postergaciones, límite por día, elegir día al postergar, re-visitar un cliente ya
`visitada` o `no_visita` en la misma fila, corrección hacia atrás de visitas ya cerradas por este
motivo (las corrige gerencia).
