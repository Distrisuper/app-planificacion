# Quitar cliente de la rotación actual (soft-delete por vuelta)

**Fecha:** 2026-09-09
**Estado:** diseño validado, pendiente de plan de implementación
**Relacionado:** [`2026-09-09-agregar-cliente-extra-gerencia-design.md`](2026-09-09-agregar-cliente-extra-gerencia-design.md)
— es la operación inversa sobre la misma vista (`/analitica/ruta`), pero independiente: no depende de
que esa feature exista.

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos mandan.

## El problema

Gerencia no tiene forma de sacar a un cliente puntual de la rotación en curso. Hoy solo puede
**mover** filas (`reacomodar`, `intercambiar-dias`), nunca eliminarlas. El caso real: un cliente que
por algún motivo puntual (cerrado esta semana, de licencia, pidió que no lo pasen a ver esta vuelta) no
corresponde visitar en esta rotación — pero **sí** en las siguientes, así que no es una baja de cartera.

## El cambio

**Soft-delete scoped a la rotación**, no un estado nuevo del cliente ni de su relación con el
vendedor. Gerencia puede quitar una fila `pl_rotacion_cliente` pendiente de la grilla; la fila deja de
contar para esta vuelta, y la que viene la vuelve a traer sola porque **el template no se toca**.

### Por qué scoped a la rotación y no algo persistente

Cada rotación nueva se materializa del template (`RotacionService.materializarProgramada`), no de las
filas de la rotación anterior. Si el soft-delete vive únicamente en la fila de `pl_rotacion_cliente` de
**esta** rotación, la siguiente rotación ni se entera: reconstruye desde cero y el cliente vuelve a
aparecer. No hace falta ningún flag en el cliente, en el template, ni una tabla de "exclusiones" — el
mecanismo de materialización ya resuelve la reaparición gratis.

### Columna: `deleted_at` (+ `deleted_by`)

```sql
ALTER TABLE pl_rotacion_cliente
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by VARCHAR(64) NULL;
```

Mismo costo de intervención que el `ALTER` que ya se pagó para `es_extra`
(`2026-08-12-visita-extra-buscador-design.md`). `deleted_at` audita el cuándo; `deleted_by` el quién —
sin esa segunda columna se pierde exactamente el dato que `pl_reacomodacion` sí guarda para cada
movimiento (`usuario`), y agregarla no cuesta nada extra en este mismo `ALTER`.

**Por qué soft-delete y no hard-delete:** un hard-delete sin resolución ya existe hoy
(`RotacionService.eliminarSinResolver`, el sweep de `sincronizarPadron`), pero ahí no hace falta
trazabilidad porque es una baja de cartera real (el cliente ya no es del vendedor). Acá el borrado es
una decisión puntual de gerencia sobre un cliente que **sigue siendo** del vendedor, y sin quedar
registrado en algún lado no hay manera de responder después "¿por qué este cliente no aparece en el
histórico de esta vuelta?".

### Scope: solo filas realmente pendientes

Bloqueado si la fila tiene:

- **Una resolución** (`pl_resolucion.rotacion_cliente_id` apunta a ella) — ya hay un hecho real
  registrado; borrar la fila lo dejaría huérfano. Mismo principio que ya rige `FILA_RESUELTA` para
  reacomodar: resolver es una puerta sin retorno del dominio, y este caso no es la excepción.
- **Una visita en curso** — el vendedor está parado ahí ahora mismo. Borrar la fila mientras hay una
  sesión activa la huerfanaría a mitad de camino. `en_curso` no tiene fila en `pl_resolucion` todavía
  (se escribe recién al cerrar), así que el chequeo de "sin resolución" solo no alcanza acá.

Con ambos bloqueos, "pendiente" queda definido exactamente como lo define `docs/dominio/modelo.md`
(ausencia de resolución) **más** la ausencia de una sesión de visita activa sobre esa fila.

### Efecto en la medición

`deleted_at IS NOT NULL` saca la fila de:

- La grilla de gerencia (`GerenciaRotacionService.getRotacion`).
- El denominador de cobertura de **esta** rotación — todas las queries de analítica que ya filtran por
  `rotacion_id` necesitan sumar `AND deleted_at IS NULL`.

Esto reduce el denominador de la rotación en curso, a diferencia de reacomodar (que nunca lo cambia). Es
una consecuencia aceptada y no un descuido: el criterio para bloquear la baja es justamente que **no
haya un hecho pendiente de contarse** — si la fila está resuelta (visitada o `no_visita`), ya aporta al
numerador y no se puede tocar; si está genuinamente sin tocar, sacarla del denominador de esta vuelta es
correcto porque esta vuelta ya no la va a contar como una visita debida.

## Contrato de API (api-vendedores)

Mismo prefijo y roles que el resto del grid de gerencia:

```
DELETE /planificacion/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:rotacionClienteId
       → 204 si se pudo soft-deletear
       → 409 { codigo: 'FILA_RESUELTA' }      si ya tiene pl_resolucion
       → 409 { codigo: 'VISITA_EN_CURSO' }    si hay una sesión de visita activa sobre la fila
```

Reusa el código `FILA_RESUELTA` que ya devuelve `reacomodar` para el mismo caso — es el mismo bloqueo
conceptual (fila resuelta = intocable), no hace falta un código nuevo para esa rama.

## Frontend

- Acción **"Quitar de esta vuelta"** en el menú/hover de `ClienteCardRuta`, visible solo cuando la fila
  está en estado `pendiente` (mismo criterio que ya usa el componente para habilitar el drag: si está
  resuelta, `useDraggable` ya la deshabilita — el botón de quitar sigue la misma condición).
- Confirmación simple (sin motivo obligatorio, según lo definido) antes de disparar el `DELETE`.
- Nuevo hook `useQuitarClienteAdmin` en `src/hooks/useRotacionAdmin.ts`, mismo patrón de invalidación
  que `useReacomodarAdmin`. Si el backend responde `VISITA_EN_CURSO`, mostrar el mensaje explicando que
  el vendedor está ahí ahora mismo y no se puede quitar hasta que cierre la visita.

## Fuera de alcance

- **Deshacer la baja** (nulear `deleted_at` desde la UI). Si gerencia se equivoca, hoy no hay botón de
  "restaurar" — es simétrico a que tampoco hay "deshacer" un reacomodo. Si aparece el caso real, es una
  extensión chica sobre la misma columna.
- **Quitar una fila ya resuelta o con visita en curso.** Bloqueado a propósito (ver arriba).
- **Cualquier baja de cartera real** (que el cliente deje de ser del vendedor). Eso es dato del
  warehouse/`sNdM`, no de `pl_rotacion_cliente`, y está totalmente fuera de este dominio.
- **Un bucket de reporte tipo "clientes quitados esta vuelta"** para gerencia. Es una señal
  potencialmente útil (análoga a "visitas fuera de plan" del spec de `es_extra`), pero no se construye
  sin un caso de uso que lo pida.

## Testing

**Backend:**

- Quitar una fila pendiente sin visita activa la soft-deletea (`deleted_at`, `deleted_by` seteados) y
  devuelve 204.
- Quitar una fila con `pl_resolucion` devuelve 409 `FILA_RESUELTA` y no toca la fila.
- Quitar una fila con una visita en curso devuelve 409 `VISITA_EN_CURSO` y no toca la fila.
- Una fila soft-deleteada desaparece de `GerenciaRotacionService.getRotacion`.
- El denominador de cobertura de la rotación baja en 1 tras la baja; el numerador no se toca.
- Al materializar la rotación siguiente, el cliente vuelve a aparecer con una fila nueva y limpia (sin
  `deleted_at`) — el soft-delete no se propaga ni se hereda entre rotaciones.
- Reacomodar o resolver una fila ya soft-deleteada no es posible (no aparece en las queries que las dos
  operaciones usan para encontrar la fila).

**Front:**

- "Quitar de esta vuelta" solo aparece sobre cards pendientes, igual que el criterio de drag habilitado.
- Confirmar la baja la saca de la grilla sin recargar la página.
- El 409 `VISITA_EN_CURSO` muestra un mensaje explicando por qué no se pudo, sin dejar la UI en un
  estado inconsistente (rollback del optimistic update si lo hay).

## Descartado

- **Tabla de exclusiones separada, en vez de columna en `pl_rotacion_cliente`.** No hace falta: el
  soft-delete ya vive naturalmente en la fila que representa la celda, y la materialización siguiente
  ni la lee.
- **Persistir la baja más allá de la rotación** (que el cliente no vuelva en la próxima vuelta). Eso
  sería una baja de cartera real, y esa decisión no es de este dominio — vendría del lado del `sNdM`/
  warehouse, no de `pl_rotacion_cliente`.
- **Permitir la baja sobre filas resueltas.** Borraría o dejaría huérfano un hecho real
  (`pl_resolucion`), violando la inmutabilidad que el dominio ya garantiza para las resoluciones.
- **Motivo obligatorio para la baja.** Se decidió que el timestamp + usuario alcanza como auditoría
  para este caso puntual; si en el futuro se necesita el "por qué" agregable (`GROUP BY`), es una
  columna más sobre la misma fila, no un rediseño.
