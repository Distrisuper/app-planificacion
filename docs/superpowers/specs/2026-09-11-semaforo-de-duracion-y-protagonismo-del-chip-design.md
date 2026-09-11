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

**a. Una banda de ancho completo dice el gesto.** `Tu propuesta · tocá uno para cargar el
resultado`, arriba del bloque de ofrecimientos y solo en la tabla de una visita
(`conChip`). Es la gemela de la que ya existía abajo, *"Otros rubros del cliente · tocá uno
para agregarlo"*: dos bandas, misma gramática, **verbos opuestos** — arriba se carga, abajo
se agrega. Ese contraste es lo que hace que la pantalla se explique sola. Cuesta ~18px
contra los ~54px del párrafo.

> **Corrección (mismo día).** La primera versión metió la instrucción en el header de
> columnas (`RUBRO · TOCÁ PARA CARGAR`) con el argumento de que costaba "cero px". Estaba
> mal: esa columna es la que absorbe lo que sobra después de los 26px del chip y los
> 3×54px de números, así que en mobile mide ~60-100px y el texto salía cortado en
> `RUBRO · TOCÁ PARA C…`. Una instrucción truncada es peor que ninguna. **No volver a
> ponerla ahí.**
>
> La banda de arriba es **estática**, no sticky — y el argumento del "sigue a la vista con
> el catálogo scrolleado" también era flojo: el bloque que rotula son ~5 filas pegadas a
> ella, así que mientras se lo mira la banda está a la vista igual; y scrolleado más abajo
> el vendedor ya está en el catálogo, donde la instrucción que corresponde es la otra (esa
> sí es sticky, y por eso lo necesita).

**b. El chip pendiente es un anillo hueco** (`border-2 border-dsnavy` sobre blanco, 24px),
en lugar del hairline `#C9D2E3` original que era gris sobre gris e invisible.

Los tres estados del chip son un **checklist** — pendiente → parcial → completo — y la
contraparte natural de un ✓ es una casilla sin tildar.

> **Corrección (mismo día).** Este chip pasó por ＋ gris y después por **navy relleno con
> ＋ blanco**, y los dos se revirtieron. El problema no era el color: `＋` significa
> **"agregar algo nuevo"**, y en esa fila el rubro ya existe — viene de la propuesta
> congelada y lo que se hace es *registrar su resultado*. Y en **esta misma tabla**
> "agregar" ya es una acción distinta y real: las filas de *"Otros rubros del cliente ·
> tocá uno para agregarlo"*. O sea que el ＋ estaba pegado al verbo equivocado — en las
> filas que hay que completar, mientras las que sí agregan no llevan ícono.
>
> Lo que el ＋ compensaba era que **nada decía que la fila se toca**. Eso lo dice ahora la
> banda del punto (a), así que el chip pudo volver a ser lo único que tiene que ser: un
> indicador de estado. La visibilidad que se había ganado se conserva — un anillo navy de
> 2px no es el hairline gris de antes.

El ✓ verde y el número ámbar quedan en tinte suave, y el pendiente se lleva 24px contra
los 22 de los resueltos (entra en `ANCHO_CHIP`, 26px, sin correr ninguna columna).

**c. El botón del pie usa el mismo verbo.** `Completá N rubros más` → `Cargá N rubros más`.
Chico, pero es lo que cierra el círculo: la banda dice "tocá uno para **cargar** el
resultado", el botón pide "**cargá** 2 más". Con "Completá" no había de dónde agarrarse.

**d. Y deja de parecer un CTA roto.** El `disabled:opacity-40` del variant sobre
`bg-dsorange` daba un naranja lavado con texto blanco: del tamaño del botón principal,
gritando "tocame", ilegible, y sin comunicar que el que falta es el vendedor.

| | falta cargar | listo |
|---|---|---|
| antes | naranja al 40% · `Cargá 2 rubros más` | naranja · `Cerrar visita` |
| ahora | **gris `#F1F4F9` + texto `dsnavy`, opacidad plena** | naranja · `Cerrar visita` |

El naranja queda reservado para "ya podés cerrar", así que el salto de color se vuelve una
señal de progreso. El `disabled:opacity-100` explícito es necesario: el 40% del variant
también lavaría el gris y dejaría ilegible el texto del faltante, que es justo el único que
hay que poder leer en ese momento.

El faltante **sigue adentro del botón**, como estaba documentado en `VisitaSheet.tsx`: lo
que estaba mal era el color, no el lugar.

El párrafo introductorio **se borra**. Lo único accionable que decía se mudó a la banda.

## `M.Ant` en pantallas angostas

Los nombres de rubro llegaban truncados (`PARRILLAS, BRAZ…`): las tres columnas numéricas
se comen 162px de ~284 útiles. `M.Ant` se esconde abajo de **360px** (breakpoint `xs`,
propio — Tailwind no trae nada abajo de `sm`/640px) y esos 54px vuelven al nombre.

Es la menos cargada de las tres: la propuesta se arma comparando `ACTUAL` contra `P.6M`,
no contra el mes anterior. Dos reglas que van con esto:

- **El header y la celda se esconden juntos.** Si se escondiera uno solo, las tres columnas
  quedan corridas entre sí y el número deja de caer bajo su rótulo. Hay un test que fija
  ese pareo (jsdom no evalúa media queries, así que prueba el pareo, no el corte).
- **Son dos clases distintas** (`hidden xs:block` para el header, `hidden xs:flex` para la
  celda) y no una sola. El header es `block` y alinea con `text-right`; meterle `flex` hace
  que su texto pase a ser un item flex, `justify-content` pase a mandar y `text-right` deje
  de tener efecto. Pasó en la primera versión de este cambio, los tests no lo vieron (jsdom
  no aplica CSS) y hay un test nuevo que lo fija.

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
| `src/components/VisitaSheet.tsx` | prop `alejado`, eyebrow del semáforo, fuera el párrafo, verbo y color del botón |
| `src/components/VisitaFlow.tsx` | pasa `alejado={esClienteEnCurso && alejado}` |
| `src/components/propuesta/OfrecimientoTable.tsx` | banda con el gesto, chip pendiente en anillo, `M.Ant` oculta abajo de 360px |
| `tailwind.config.cjs` | breakpoint `xs: 360px` |

Tests: `estadoDuracion.test.ts` (nuevo, con los bordes exactos 15:00/90:00 y la
precedencia de `alejado`), más los de `visitaTimer`, `VisitaEnCursoBar`, `VisitaSheet` y
`OfrecimientoTable`.
