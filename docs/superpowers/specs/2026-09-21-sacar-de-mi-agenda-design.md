# "Sacar de mi agenda": el vendedor borra lo que agregó por error

**Fecha:** 2026-09-21
**Estado:** diseño validado con el usuario, pendiente de plan de implementación
**Alcance:** dos repos — `api-vendedores` (endpoint nuevo del vendedor sobre el soft-delete que ya
existe para gerencia) y `app-planificacion` (una salida más en `EstadoVisitaSheet`)
**Depende de:** [`2026-09-17-visita-de-alta-cliente-nuevo-design.md`](2026-09-17-visita-de-alta-cliente-nuevo-design.md)
(las filas `tipo='alta'`, y el patrón `filaAltaPropia` que acá se generaliza) y del buscador del `+`
(spec 2026-08-12), que es el que crea las filas `es_extra`.

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos mandan.

## El problema

El vendedor puede crear filas del plan a mano, por dos puertas:

- **"Agregado"** — el `+` del encabezado del día, opción *Agregar*: una pasada puntual fuera de plan,
  fila `es_extra = 1` (`POST /planificacion/buscador/cliente/:codigo/extra`).
- **"Cliente nuevo"** — una visita de alta, `tipo='alta'` (y también `es_extra = 1`).

Se equivoca: agrega el comercio que no era, tipea mal un cliente nuevo, o toca *Agregar* cuando
quería *Traer*. Hoy no tiene ninguna salida. Las que tiene a mano son las dos peores:

- **"No visité"** inventa un hecho comercial que nadie declaró: entra al `GROUP BY` de motivos, y
  deja la fila resuelta e irreversible (`FILA_RESUELTA`).
- **Dejarla pendiente** le ensucia la agenda del día con una card que no va a visitar nunca, y que
  no puede distinguir de las que sí.

Gerencia sí tiene la salida: `/analitica/ruta` ofrece "Quitar de esta vuelta" desde
`ClienteCardRuta`, contra `DELETE /vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id`.
O sea que **la operación ya existe entera en la base y en el repositorio**; lo único que falta es una
puerta para el vendedor, acotada a lo que él mismo creó.

## La decisión

**El vendedor puede sacar de su agenda cualquier fila que haya creado a mano (`es_extra = 1`) y que
todavía esté pendiente.** Las dos puertas —"Agregado" y "Cliente nuevo"— se comportan igual: la regla
que se le explica es *lo que agregaste, lo podés sacar*.

### Qué es "sacar", en términos del dominio

Es el **soft-delete de la fila de `pl_rotacion_cliente`** (`deleted_at` / `deleted_by`), scoped a esta
rotación: no toca el template, y la próxima vuelta el cliente vuelve solo si está en el plan.

**No es un hecho.** No crea `pl_resolucion`, no es `no_visita`, no aparece en ningún agrupamiento de
motivos. Es "esta fila nunca debió existir", y por eso —y solo por eso— se limita a `es_extra = 1`.
Sacar una fila planificada es otra cosa: es editar la línea de base, es decisión de gerencia, y ya
tiene su puerta en `/analitica/ruta`.

Tres consecuencias que hacen la operación barata y segura:

1. **No mueve ningún número.** El denominador de cobertura (`indicadores/cobertura.ts`) filtra
   `es_extra = 0`, y el bucket de extras cuenta solo las **resueltas**. Una extra pendiente hoy no
   suma a nada, así que borrarla no infla ni desinfla nada. Es exactamente lo contrario de borrar una
   fila planificada, que sí achicaría el denominador — y ahí está la razón del límite de alcance.
2. **Reusa las guardas que ya existen** en `RotacionClienteRepository.quitar()`: `409 FILA_RESUELTA`
   si ya hay resolución (incluye un `no_visita` ya declarado) y `409 VISITA_EN_CURSO` si la visita
   está abierta. **Resolver sigue siendo la única puerta sin retorno del dominio**: lo resuelto no se
   borra, ni por el vendedor ni por gerencia.
3. **`deleted_by` guarda al propio vendedor**, así que la auditoría distingue "lo sacó el vendedor"
   de "lo sacó gerencia" sin tabla nueva ni columna nueva.

No se escribe `pl_reacomodacion`: no es un movimiento de celda, es una baja — igual que el quitar de
gerencia, que tampoco lo escribe.

### La reversibilidad es de gerencia, no del vendedor

El vendedor **confirma antes y no tiene "deshacer"**. Es el mismo patrón que ya usa `ClienteCardRuta`:
un diálogo, y listo. La red de seguridad real es que el borrado es **soft**, así que
`PATCH .../rotacion-cliente/:id/restaurar` sigue disponible para gerencia sin límite de tiempo
mientras la rotación esté editable.

Se descartó el toast con "Deshacer" de 5 segundos: si el vendedor no llega a tocarlo —o pierde señal,
que es el escenario normal en la calle— no tiene segunda oportunidad, y la confirmación previa filtra
el mismo error con menos piezas móviles.

## Backend (api-vendedores)

**`DELETE /planificacion/rotacion-cliente/:id`**, con `authMiddleware + authorizeVendedor`, igual que
`/altas/:id`.

Método nuevo en **`VisitasService`** — donde ya vive el `reacomodar` del vendedor, que es la otra
operación en la que el vendedor edita su propio plan. Tres validaciones antes de delegar en
`RotacionClienteRepository.quitar(id, vendedor)`:

1. **La fila es suya**: pertenece a la rotación abierta de ese vendedor. Es el chequeo que
   `AltasService.filaAltaPropia` ya hace; se extrae a un helper compartido `filaPropia(user, id)`
   (sin el chequeo de `tipo='alta'`), y `filaAltaPropia` pasa a construirse sobre él. Fila de otro
   vendedor, o de otra rotación → `404 FILA_NOT_FOUND`, sin filtrar información.
2. **`es_extra = 1`** → si no, `409 FILA_PLANIFICADA`: *"Este cliente es parte de tu recorrido: para
   sacarlo hablá con tu supervisor."* La guarda vive en el backend y no solo en la UI, porque un
   bundle viejo cacheado se saltea cualquier gate de front (misma lección que el gate de cierre de
   `VisitaSheet`).
3. **Rotación editable** (`GerenciaRotacionService.requireRotacionEditableDe`), igual que altas.

`quitar()` ya aporta `FILA_RESUELTA` y `VISITA_EN_CURSO` por su cuenta; no se duplican acá.

## Front (app-planificacion)

- **`src/api/planificacion.ts`**: `eliminarFilaPropia(rotacionClienteId)` →
  `DELETE /planificacion/rotacion-cliente/:id`.
- **`src/hooks/useEliminarFila.ts`** (archivo propio, no dentro de `useAltas.ts`: la operación alcanza
  también a los extras del buscador): `useEliminarFila()` con el mismo `onSuccess` que
  las mutaciones de alta — invalida `agendaKeys.semana`, `['ciclo','preview']` y `cicloKeys.actual`,
  porque sacar una fila cambia tanto la agenda del día como el preview de la zona.
- **`EstadoVisitaSheet`**: prop nueva `onEliminar?: () => void`. Se pinta **solo si llega**, abajo de
  "No visité", separada por un hairline, en `dsred`: **"Sacar de mi agenda"**. El sheet no sabe qué es
  una extra; la página decide, y pasa `onEliminar` solo cuando
  `cliente.esExtra && cliente.estado === 'pendiente'`.
- **Confirmación**: *"¿Sacar a **{nombre}** de tu agenda? Solo se saca de esta vuelta."* →
  Cancelar / Sacar.
- **El 409 se muestra como aviso dentro del sheet**, con el mensaje del backend, y además **invalida
  la agenda**: un `FILA_RESUELTA` significa que la card que el vendedor está mirando ya está
  desactualizada, así que refrescarla es parte de la respuesta al error.

### Por qué en el sheet de Reagendar y no en el header de la card

`EstadoVisitaSheet` ya **es** el menú de "qué hago con esta card" (reagendar, no visité), así que la
tercera salida entra sin inventar un lugar nuevo, y el destructivo queda detrás de un toque en vez de
suelto. El header de `ClienteCard` está explícitamente marcado como apretado —el propio código
advierte que cuatro chips no entran en una fila— y un tacho icon-only al lado de "Llamar" es un
mis-tap esperando ocurrir en mobile.

### Vocabulario

**"Sacar de mi agenda"**, nunca "eliminar del plan" ni "de la rotación": el vendedor no ve ciclos ni
rotaciones, ve zonas, días y clientes. Y "Solo se saca de esta vuelta" es literal: el template no se
toca.

## Tests

**Backend** (`VisitasService.spec.ts`):
- fila de otro vendedor → `404 FILA_NOT_FOUND`
- fila planificada (`es_extra = 0`) → `409 FILA_PLANIFICADA`
- extra pendiente → soft-delete con `deleted_by` = el vendedor
- alta pendiente → soft-delete (las dos puertas se comportan igual)
- extra con resolución → `409 FILA_RESUELTA`
- extra con visita abierta → `409 VISITA_EN_CURSO`
- rotación no editable → rebota

**Front**:
- `EstadoVisitaSheet` no pinta la opción sin `onEliminar`, y la pinta con
- pide confirmación y solo llama a `onEliminar` si se confirma
- la página no pasa `onEliminar` para una fila planificada, ni para una `en_curso`
- un 409 deja el aviso visible y no cierra el sheet

## Fuera de alcance

- **Deshacer del lado del vendedor** — la restauración es de gerencia (ver arriba).
- **Una lista de "sacados"** en la app del vendedor: una fila sacada desaparece, y punto. Lo que se
  sacó es visible en `/analitica/ruta`, que es donde se puede restaurar.
- **Sacar filas planificadas** — sigue siendo decisión de gerencia.
