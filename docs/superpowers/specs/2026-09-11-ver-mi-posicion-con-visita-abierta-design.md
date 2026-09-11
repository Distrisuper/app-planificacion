# "Ver mi posición": salida manual del aviso de alejado

Fecha: 2026-09-11

Continúa [`2026-09-08-aviso-alejado-del-cliente-design.md`](2026-09-08-aviso-alejado-del-cliente-design.md).

## Problema

Con la visita abierta, el aviso de "te alejaste del cliente" **se queda pegado**, y el vendedor
no tiene ninguna forma de sacarlo. Hoy el sistema afirma que está lejos, él sabe que está parado
en el local, y la app no le ofrece ni una segunda medición ni una explicación.

La causa es una asimetría en `useAlejadoDelCliente`:

| | criterio |
|---|---|
| entrar a `alejado` | `distancia − precisión > RADIO_INICIO_METROS` |
| salir de `alejado` | `distancia ≤ RADIO_INICIO_METROS` (**cruda**, sin descontar precisión) |

Entre los dos queda una **banda muerta**: todo fix con `100 < d ≤ 100 + precisión` ni entra ni
sale. Y como el watch del hook corre `enableHighAccuracy: false` a propósito (una visita dura
media hora y no vale la pena el GPS fino todo ese rato), casi todos sus fixes caen ahí. El
resultado: se entra a `alejado` con un fix bueno, y después ningún fix grueso alcanza para
salir. Un fix de wifi/antena que marca 300 m con precisión 400 m no prueba nada — pero tampoco
puede desmentir nada, porque la salida le exige una distancia cruda que ese fix no sabe producir.

El aviso no bloquea el cierre (decisión vigente: cerrar nunca tuvo gate de distancia), así que
esto no traba a nadie. Pero le miente al vendedor durante toda la visita, y eso erosiona la
confianza en el único indicador de geolocalización que ve mientras trabaja.

## Alcance

Es una **salida de emergencia de uso raro**: aparece sólo con `alejado` activo, cuando el
vendedor está en desacuerdo con el sistema. No es parte del flujo normal de una visita.

## Diseño

### 1. Puerta de precisión en `useAlejadoDelCliente`

Un fix con `precisionM > RADIO_INICIO_METROS` **se descarta entero**: no entra, no sale, no
actualiza `distanciaM`. Es el mismo criterio que `estaFueraDeRango` ya documenta para el inicio
—ausencia de prueba no es prueba— aplicado también a la permanencia en el estado.

Esto arregla la banda muerta por el lado correcto. Hoy un fix grueso *puede* entrar (p=150,
d=400 cumple `d − p > 100`) pero nunca puede sacarte; con la puerta, simplemente no opina.

La histéresis entre entrada y salida **no se toca**: sobre fixes ya filtrados sigue siendo
`d − p > 100` para entrar y `d ≤ 100` para salir. Un umbral único haría que un fix oscilando en
el borde prendiera y apagara el aviso en cada tick.

**Se descartó** la alternativa simétrica (salir con `d − p ≤ 60`, es decir decidir siempre sobre
la distancia con la precisión descontada). Arreglaba la banda muerta sola, sin botón, pero
convertía un fix basura en evidencia de cercanía: con p=400 y d=300, `d − p < 0` apagaría el
aviso incluso con el vendedor genuinamente lejos. El aviso es informativo y no bloquea nada, así
que errar hacia "sigo avisando hasta que un fix confiable diga que volviste" es el lado barato
del error.

El watch pasivo **sigue en `enableHighAccuracy: false`**. La decisión de batería del spec
anterior sigue en pie; el fix fino se consigue por el camino explícito de abajo.

### 2. El mapa como la medición manual

`IniciarVisitaMapa` ya monta un `watchPosition` con `{ enableHighAccuracy: true, maximumAge: 5000 }`,
ya dibuja el pin del cliente, el punto del vendedor, el círculo de `RADIO_INICIO_METROS` y la
distancia en vivo, y ya tiene "Recalcular posición" con su manejo de `calculando` /
`errorActualizando`. **Abrir ese mapa ya es la actualización manual de posición.**

Se le agregan dos props:

- `modo: 'iniciar' | 'consulta'` (default `'iniciar'`, así las llamadas existentes no cambian).
  En `'consulta'` no se renderiza el pie de iniciar (CTA, `error`, `iniciando`) ni el botón de
  reposicionar; el resto del componente no se entera.
- `onFix?: (lat, lon, precisionM) => void` — se llama con cada fix del watch y de "Recalcular".

`useAlejadoDelCliente` expone su `evaluarFix` hacia afuera, y `VisitaFlow` lo pasa como `onFix`.
Con eso el mapa alimenta al hook con fixes finos: **si el vendedor está donde dice, el aviso se
apaga solo a los pocos segundos de abrir el mapa**, sin que tenga que tocar "Recalcular".

Mientras el mapa está abierto conviven dos watches (el grueso del hook y el fino del mapa). No
se contradicen, y es la puerta de precisión de §1 la que lo garantiza: los fixes gruesos del
hook se descartan y sólo deciden los finos del mapa. Una sola fuente de verdad por momento.

El componente se renombra a **`MapaVisita`**: con `modo` presente, `IniciarVisitaMapa` es un
nombre falso en la mitad de sus usos. Alcance del rename: `IniciarVisitaMapa.tsx` y su test, el
import y el uso en `VisitaFlow.tsx` y `VisitaFlow.test.tsx`, y las menciones en comentarios de
`useAlejadoDelCliente.ts`, `geolocation.ts` y `types/planificacion.ts`. Es mecánico.

### 3. El botón, en el pie del sheet

En la rama de **lista** del pie de `VisitaSheet` —no en el wizard—, con `alejado && !visitaCerrada`,
una fila de aviso con el texto corto y un botón secundario **"Ver mi posición"** que abre
`MapaVisita` en `modo='consulta'`.

Va ahí porque es el momento que el vendedor describe: está por cerrar y quiere resolver el
desacuerdo antes. Minimizado, `VisitaEnCursoBar` ya es un botón que expande al sheet, así que no
hace falta una segunda entrada.

`VisitaFlow` le pasa a `VisitaSheet` `alejado` y `onVerPosicion`. El mapa se abre con las
coordenadas de `visitaEnCurso.cliente` —no las del cliente en pantalla, y ya con el override de
reposicionamiento aplicado si lo hubo—, igual que hace el hook. Sin coordenadas del cliente el
hook queda inactivo, así que el botón nunca aparece.

**Nada de esto toca el gate de cierre.** Cerrar sigue sin bloquear por distancia.

### Se descartó

**Un botón "Actualizar mi posición" de un tap, con toast.** Sería la misma operación que el mapa
pero con menos información y con su propio `watchPosition`, habilitado a mostrar una distancia
distinta de la que el mapa muestra en pantalla. Y un toast que dice "estás a 340 m" repite la
afirmación que el vendedor ya dejó de creer; el mapa le muestra por qué. Dos botones acá no son
más opciones: son una inconsistencia esperando.

**Un componente de mapa nuevo, de sólo lectura.** Duplicaría el setup de Leaflet, el watch, el
círculo y el formateo de distancia — unas 150 líneas — para no agregar una prop.

**Reposicionar el pin del cliente desde acá.** Si la coordenada del cliente estuviera mal, el
vendedor no habría podido iniciar la visita: ese gate sí bloquea, y la corrección ya vive ahí.

## Tests (vitest)

`useAlejadoDelCliente.test.ts`
- un fix con `precisión > 100` no entra a `alejado`, aunque `d − p > 100`;
- un fix con `precisión > 100` no apaga un aviso ya prendido;
- `evaluarFix` con un fix fino y cercano (`p=15`, `d=40`) apaga el aviso.

`MapaVisita.test.tsx`
- en `modo='consulta'` no se dibuja el CTA de iniciar ni el botón de reposicionar;
- cada fix del watch llama a `onFix` con lat/lon/precisión.

`VisitaSheet.test.tsx`
- "Ver mi posición" sólo se renderiza con `alejado` y la visita abierta.
