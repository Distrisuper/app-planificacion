# Semáforo de duración de la visita en curso, y el ＋ como afordancia

**Fecha:** 2026-09-11
**Estado:** implementado

## Problema

Tres cosas, todas en las dos pantallas de la visita abierta (la barra flotante sobre la
agenda y el sheet de rubros):

1. **El "en curso" no dice nada.** El cronómetro corre en ámbar de punta a punta. El
   vendedor no tiene forma de saber si la visita ya lleva el tiempo que la hace válida
   para la analítica, ni si se la dejó abierta.
2. **El párrafo introductorio del sheet cuesta más de lo que rinde.** Tres líneas
   ("Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se resuelven
   con «No lo ofrecí»") = ~54px de una pantalla donde entran unas 5 filas de tabla y hay
   que resolver 2 para poder cerrar.
3. **El ＋ no se ve.** El pie dice "Completá 2 rubros más" y no hay nada que explique
   *cómo*: el chip de resolución es gris claro sobre fondo blanco y se lee como
   decoración, no como el botón que es.

## El semáforo

### Los umbrales NO son el criterio de validez

`DURACION_ARRANQUE_MIN = 15` y `DURACION_LARGA_MIN = 90`, en `src/lib/estadoDuracion.ts`,
son **umbrales de UI**: una guía para el vendedor parado en el local.

El criterio de validez real vive en `pl_criterio_visita` (api-vendedores), no se expone
por API, y hoy es **mínimo 15 minutos, sin techo** — el techo de 90 se sacó a propósito
(ver `DURACION_MIN_VALIDA` en `analiticaFormat.ts`). **Esta feature no lo repone.** Una
visita de dos horas sigue siendo válida para la analítica; el ámbar de `larga` solo le
sugiere al vendedor que la cierre, porque el caso real es que se fue del local y se la
olvidó abierta.

Corolario: estos dos umbrales **no hay que sincronizarlos** con la base cuando el criterio
cambie. Son independientes por diseño. Tampoco se toca `ayudaEfectividadOperativa.tsx`.

### Los cuatro estados

`alejado` gana sobre cualquier duración: es el único de los cuatro que indica un problema
real (la visita puede terminar sin validar por geo).

| estado | color | barra flotante | eyebrow del sheet |
|---|---|---|---|
| `arranque` <15 min | ámbar `dsorange` | `Visitando a X` / `04:12` | `● EN CURSO · 04:12` |
| `valida` 15–90 min | verde `dsgreen` | `Visitando a X` / `22:40` | `● EN CURSO · 22:40` |
| `larga` >90 min | ámbar `dsorange` | `Visitando a X` / `1:34:02 · visita larga` | `● VISITA LARGA · 1:34:02` |
| `alejado` | rojo `dsred` | `Te alejaste de X…` (igual que antes) | `● TE ALEJASTE · 12:40` |

Los dos bordes son **inclusive**: a los 15:00 exactos ya es verde, y a los 90:00 exactos
sigue verde.

### Por qué ámbar en los dos extremos y no rojo arriba

`dsred` en esta app ya tiene un significado tomado y fuerte — *estás lejos del cliente*,
la misma paleta que el error de "Iniciar visita" (ver CLAUDE.md). Si `larga` fuera rojo,
rojo pasaría a significar dos cosas y se diluiría justo el estado que importa. La
ambigüedad entre los dos ámbares no existe en la práctica: al lado del color está el
cronómetro (`04:12` vs `1:34:02`) y el texto.

### Un solo módulo, dos pantallas

`estadoDuracion.ts` existe como módulo propio (y no como lógica en cada componente)
porque son **la misma visita** vista desde los dos lados del botón de minimizar. Con el
color armado a mano en cada uno, minimizar el sheet podría cambiar de verde a ámbar sin
que pasara nada.

### Dos cosas que caen de acá

- **`VisitaSheet` no recibía `alejado`.** Ahora sí, y el gate importa:
  `alejado={esClienteEnCurso && alejado}`, no `enCurso && alejado`. `alejado` se calcula
  contra las coords del cliente de *la visita en curso*, y el vendedor puede estar
  mirando la propuesta de otro cliente mientras la visita corre en otro lado.
- **`formatearDuracion` estaba roto arriba de una hora**: devolvía `94:02` a los 94
  minutos y `312:40` a las cinco horas — números que se leen como minutos. Ahora corta en
  la hora (`1:34:02`); abajo de los 60 min queda idéntico. Importa desde que existe un
  estado `larga`, que es justamente el que pasa la hora.

### El badge `EN CURSO` de `ClienteCard` no se toca

No tiene cronómetro: es una etiqueta de estado, no un indicador de duración. Decisión, no
olvido.

## El ＋

Tres cambios que trabajan juntos; ninguno solo alcanza. El eje es que **el vendedor tenga
un mismo verbo** desde la instrucción hasta el botón que lo bloquea.

**a. El header sticky dice el gesto.** `RUBRO` → `RUBRO · TOCÁ PARA CARGAR`, solo en la
tabla de una visita (`conChip`). Es el patrón que ya existía en *"Otros rubros del cliente
· tocá uno para agregarlo"*. Va acá y no en un `<p>` por dos razones: cuesta **cero px**
(la palabra "Rubro" ya ocupaba esa línea) y, al ser sticky, la instrucción **sigue a la
vista con el catálogo scrolleado** — que es justo cuando se necesita, y lo que el párrafo
de arriba no hacía.

**b. El chip pendiente pasa a navy relleno con el ＋ en blanco** (24px), en lugar del
`bg-[#F1F4F9]` con borde `#C9D2E3` y ＋ navy. Sobre el fondo blanco del sheet ese gris era
gris sobre gris. Un círculo oscuro sólido se lee como botón.

El ✓ verde y el número ámbar **siguen en tinte suave a propósito**: son *estados*, no
invitaciones. El contraste "oscuro sólido = falta tocar / tinte suave = ya está" es
justamente lo que hace legible qué queda pendiente — y es la razón de que el pendiente se
lleve 24px contra los 22 de los resueltos (entra en `ANCHO_CHIP`, 26px, sin correr ninguna
columna).

**c. El botón del pie usa el mismo verbo.** `Completá N rubros más` → `Cargá N rubros más`.
Chico, pero es lo que cierra el círculo: el header dice "tocá para **cargar**", el botón
pide "**cargá** 2 más". Con "Completá" no había de dónde agarrarse.

El párrafo introductorio **se borra**. Lo único accionable que decía se mudó al header.

### Lo que se perdió y se acepta

El párrafo era el único lugar que explicaba la convención de **"No lo ofrecí"** para los
rubros que el vendedor no llegó a ofrecer. Ese texto ya no está en ninguna parte de la
pantalla; la convención sigue viva en el propio formulario de resolución (el motivo está
en el catálogo, en el segmento correspondiente). Se acepta: el gesto de *cómo* cargar era
el problema real, y la pantalla tiene que priorizar filas de tabla sobre prosa.

## Archivos

| archivo | qué |
|---|---|
| `src/lib/estadoDuracion.ts` | **nuevo** — umbrales, `estadoVisitaVivo`, paleta y rótulos |
| `src/lib/visitaTimer.ts` | `formatearDuracion` con horas desde los 60 min |
| `src/components/VisitaEnCursoBar.tsx` | color del semáforo + `· visita larga` |
| `src/components/VisitaSheet.tsx` | prop `alejado`, eyebrow del semáforo, fuera el párrafo, verbo del botón |
| `src/components/VisitaFlow.tsx` | pasa `alejado={esClienteEnCurso && alejado}` |
| `src/components/propuesta/OfrecimientoTable.tsx` | header con el gesto, chip pendiente navy relleno |

Tests: `estadoDuracion.test.ts` (nuevo, con los bordes exactos 15:00/90:00 y la
precedencia de `alejado`), más los de `visitaTimer`, `VisitaEnCursoBar`, `VisitaSheet` y
`OfrecimientoTable`.
