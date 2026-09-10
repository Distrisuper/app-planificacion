# Agregar cliente extra desde la vista de gerencia (/analitica/ruta)

**Fecha:** 2026-09-09
**Estado:** diseño validado, pendiente de plan de implementación
**Depende de:** [`2026-08-12-visita-extra-buscador-design.md`](2026-08-12-visita-extra-buscador-design.md)
(introduce `es_extra` y el buscador self-service del vendedor) y
[`2026-08-11-vista-gerencia-rotacion-design.md`](2026-08-11-vista-gerencia-rotacion-design.md)
(el grid editable que esta feature extiende).

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos mandan.

## El problema

El vendedor ya puede agregarse a sí mismo un cliente de su cartera que no está en el plan (el buscador
de `2026-08-12-visita-extra-buscador-design.md`, fila marcada `es_extra`). **Gerencia no tiene el
equivalente** en `/analitica/ruta`: el grid editable solo permite mover filas que ya existen
(`reacomodar`, `intercambiar-dias`). Si gerencia detecta que a un vendedor le falta un cliente de su
cartera en la vuelta actual — un alta reciente, un cliente que llamó y pidió pasar a formar parte de la
rutina — no tiene forma de incorporarlo desde esta vista; hoy la única vía es pedirle al vendedor que lo
busque él mismo desde su agenda.

## El cambio

Un botón **"+"** en el header de cada columna de día del grid de la rotación **Actual**, que abre un
buscador sobre la cartera completa del vendedor (mismo alcance que el buscador self-service) y crea una
fila `es_extra = true` en la celda `(rotación, semana, día)` que corresponde al botón que se tocó.

Es el mismo mecanismo de `es_extra` ya validado — no se propone ninguna semántica nueva de datos, solo
un segundo punto de entrada, operado por gerencia en vez de por el vendedor.

### Por qué un servicio nuevo y no extender el buscador existente

`BuscadorService` (self-service) resuelve el vendedor y la zona desde el token del usuario logueado
(`resolveSellerCode(user)`, "zona en curso" = ciclo abierto). Gerencia necesita lo contrario: un
`:codigo` de vendedor explícito en la URL y un `rotacionId` explícito (el grid ya opera así en
`reacomodar` e `intercambiar-dias` — nunca resuelve "la rotación abierta" por su cuenta). Mezclar ambos
casos en un solo servicio obligaría a ramificar por rol en cada método. El repo ya resuelve esta misma
tensión separando `AgendaService` (self-service) de `GerenciaRotacionService` (explícito) — este cambio
sigue el mismo patrón: **`GerenciaBuscadorService` nuevo**, reusando sin tocar:

- `ClientRepository.getByVendor(codigo, ...)` — ya recibe el código como parámetro, no del token.
- `RotacionClienteRepository.crearExtra(rotacionId, codigoCliente, semana, dia)` — ya es idempotente
  contra `uq_rotacion_cliente`.

### Alcance: solo "Agregar", solo la rotación Actual

El buscador self-service tiene dos salidas ("Traer" reacomoda una fila pendiente en otra zona, "Agregar"
crea una extra). Esta feature **solo implementa "Agregar"**:

- "Traer" ya lo cubre el drag & drop que el grid de gerencia ya tiene — mover una fila pendiente a otra
  celda es exactamente `reacomodar`, no hace falta un buscador para eso.
- Limitar a la rotación **Actual** (la que está en curso): agregar un cliente a una rotación que todavía
  no empezó a ejecutarse no tiene urgencia operativa y complica innecesariamente la resolución de
  `rotacionId` en la cola (`ColaRotaciones`). Si aparece la necesidad, es una extensión chica —el
  endpoint ya recibe `rotacionId` explícito— pero no se construye sin un caso real.

## Contrato de API (api-vendedores)

Mismo prefijo y roles (`admin`, `versus-ger`, `supervisor`) que el resto de las rutas gerencia de
`/vendedores/:codigo/rotaciones/:rotacionId/...`:

```
GET  /planificacion/vendedores/:codigo/rotaciones/:rotacionId/buscador?q=texto
     → IResultadoBuscadorGeneral[]   (búsqueda en la cartera completa del vendedor, mín. 2 caracteres)

GET  /planificacion/vendedores/:codigo/rotaciones/:rotacionId/buscador/cliente/:codigoCliente
     → { yaPlanificado: boolean; semana?: number; dia?: number }
       (¿esta rotación ya tiene una fila para este cliente, y en qué celda?)

POST /planificacion/vendedores/:codigo/rotaciones/:rotacionId/buscador/cliente/:codigoCliente/extra
     body: { semana: number; dia: number }
     → IAgendaClientAdmin   (la fila creada, es_extra: true)
```

El tercer endpoint es idempotente si `(semana, dia)` coincide exactamente con una fila ya existente para
ese cliente en esa rotación (mismo comportamiento que `crearExtra` hoy) — devuelve la fila existente en
vez de duplicar o de reventar contra el `UNIQUE`.

## Frontend

- **Entry point:** ícono "+" en el header de cada columna de día (`GridRotacion.tsx`), visible
  únicamente en el grid de la rotación marcada "Actual" — las rotaciones de `ColaRotaciones` no lo
  muestran.
- Semana y día quedan fijados por el botón que se tocó: no hace falta un selector de semana/día en el
  modal, a diferencia del buscador self-service (que infiere la zona del ciclo abierto).
- Nuevo componente `AgregarClienteExtraSheet` en `src/components/ruta/`, clon de `BuscadorDiaSheet` con
  la diferencia de que llama a los endpoints gerencia-scoped de arriba en vez de a `/buscador/*`.
- Nuevo hook `useAgregarClienteExtraAdmin` en `src/hooks/useRotacionAdmin.ts`, mismo patrón que
  `useReacomodarAdmin`: invalida la query del grid al confirmar.
- La fila creada llega con `esExtra: true` — `IAgendaClientAdmin` ya tiene ese campo (hoy lo usa para
  extras creadas por el vendedor desde su propio buscador), así que la celda ya la va a pintar marcada
  sin cambios adicionales de render.

### Manejo de duplicados dentro de la misma rotación

Al elegir un cliente del buscador, antes de confirmar se consulta si ya tiene fila en esta rotación
(segundo endpoint):

| resultado de la consulta | comportamiento |
|---|---|
| no tiene fila en esta rotación | confirma directo, `POST .../extra` |
| tiene fila en **otra** celda de esta rotación | aviso bloqueante: *"\<Cliente\> ya está planificado el \<día\> - Semana \<N\> de esta rotación. ¿Agregar igual otra visita el \<día\> - Semana \<N\>?"* con botones "Cancelar" / "Agregar de todos modos" |
| tiene fila en la **misma celda exacta** que se está por crear | no se ofrece la acción — se muestra "ya está planificado acá", sin opción de forzar (sería un duplicado literal de la misma visita) |

El bloqueo existe porque el mismo cliente en dos celdas de una rotación es válido para clientes
quincenales (dos filas por diseño, ver `docs/dominio/modelo.md`), pero agregarlo dos veces **por error**
desde este buscador sería fácil de hacer sin darse cuenta — de ahí el aviso, no una prohibición.

## Fuera de alcance

- "Traer" un cliente pendiente de otra zona (ya lo cubre el drag & drop existente).
- Agregar sobre rotaciones que no sean la Actual.
- Editar o quitar una fila extra ya creada desde esta vista (mismas reglas que cualquier fila: se
  reacomoda o se resuelve, no se borra).
- Cualquier cambio al modelo de datos — `es_extra` y `crearExtra` ya existen y no se tocan.

## Testing

**Backend:**

- El buscador de cartera de gerencia no devuelve clientes de otro vendedor.
- Crear una extra en una celda vacía crea la fila con `es_extra = 1` y `dia`/`semana` según el body.
- Repetir la creación con la misma `(rotacionId, cliente, semana, dia)` devuelve la fila existente, no
  duplica ni revienta contra `uq_rotacion_cliente`.
- La consulta de "ya planificado" detecta una fila del cliente en otra celda de la misma rotación y
  devuelve su `semana`/`dia`.
- Crear una extra sobre una rotación que no es la vigente del vendedor no está expuesto por ningún botón
  de la UI, pero si se llama igual al endpoint con un `rotacionId` de otra rotación de ese vendedor,
  funciona igual (el backend no restringe por estado de la rotación — la restricción es solo de UI,
  igual que documenta el patrón de "el gate es solo del front" en otras partes de este dominio).

**Front:**

- El botón "+" solo aparece en el grid de la rotación Actual, no en `ColaRotaciones`.
- Buscar y confirmar un cliente sin fila previa en la rotación crea la fila y la celda la muestra
  marcada como extra sin recargar la página.
- Buscar un cliente que ya está en otra celda de la misma rotación muestra el aviso bloqueante con la
  celda existente correcta, y "Agregar de todos modos" crea la segunda fila.
- Buscar un cliente que ya está exactamente en la celda que se abrió no ofrece la acción de agregar.

## Descartado

- **Extender `BuscadorService` self-service con un modo gerencia.** Obligaría a ramificar por rol en
  cada método entre "resolver del token" y "recibir explícito", cuando el repo ya tiene el patrón
  correcto (servicios gerencia separados con parámetros explícitos) aplicado en `GerenciaRotacionService`.
- **Incluir "Traer" en el buscador de gerencia.** Ya existe una vía para eso (drag & drop /
  `reacomodar`); duplicar la funcionalidad con otro flujo agrega superficie sin agregar capacidad.
- **Habilitar el botón en rotaciones de la cola.** Sin caso de uso real hoy, y complica la resolución de
  a qué `rotacionId` cae la fila extra cuando la cola tiene varias programadas.
