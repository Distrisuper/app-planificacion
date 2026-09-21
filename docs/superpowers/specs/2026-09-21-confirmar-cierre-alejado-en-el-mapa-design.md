# Confirmar el cierre de la visita en el mapa cuando el vendedor está alejado

Fecha: 2026-09-21

Continúa [`2026-09-08-aviso-alejado-del-cliente-design.md`](2026-09-08-aviso-alejado-del-cliente-design.md)
y [`2026-09-11-ver-mi-posicion-con-visita-abierta-design.md`](2026-09-11-ver-mi-posicion-con-visita-abierta-design.md).

## Problema

Con la visita abierta y el aviso de "te alejaste del cliente" activo, hoy el vendedor puede
tocar **Cerrar visita** y la visita se cierra sin que nada le haga notar que está cerrando
desde lejos. El aviso vive en una banda del pie, arriba del botón, y es **ignorable**: es un
cartel entre otros elementos de una pantalla cargada, en el momento en que el vendedor ya
decidió que terminó.

Las dos consecuencias:

1. **El vendedor no se entera.** La coordenada de cierre se guarda igual y después aparece en
   analítica como una visita cerrada a 400 m del cliente, sin que él haya tenido conciencia de
   eso en ningún momento.
2. **El que estaba bien ubicado no tiene cómo desmentirlo.** "Ver mi posición" existe
   justamente para eso (el mapa corre un watch de alta precisión y le reporta cada fix al
   hook), pero hay que saber que está ahí y tocarlo antes de cerrar. El que va directo al
   botón nunca le da al GPS la oportunidad de corregirse.

### La causa que no es "no vio el cartel"

Lo anterior asume que el aviso estaba y el vendedor no lo miró. Hay un segundo caso, y es
peor: **el aviso puede no haber existido nunca**, porque el estado del hook estaba congelado.

`useAlejadoDelCliente` corre su `watchPosition` sólo con la app al frente. Cuando el vendedor
guarda el teléfono —que es lo normal durante una visita— el navegador congela el watch, y
`alejado`/`distanciaM` se quedan con el último fix bueno: el de hace minutos. Al volver al
frente, el handler de `visibilitychange` pide un fix nuevo, pero con
`enableHighAccuracy: false`, **sin `timeout`** (si el GPS no responde, no vuelve nunca) y con
el `onError` en `() => {}` (falla en silencio). Entre que la app vuelve y ese fix llega, el
estado sigue siendo el viejo.

Así que un vendedor que se fue del local con el celular guardado y vuelve a abrir la app para
cerrar tiene buenas chances de tocar **Cerrar visita** con el hook todavía diciendo "cerca".
No ve ningún cartel porque no hay ningún cartel. La visita se cierra, y la coordenada que se
persiste —ésa sí capturada fresca, por `conUbicacion`— lo registra a 400 m.

**Esto es lo que hace que el disparador no pueda ser `alejado`.** Un desvío atado al aviso
hereda exactamente el estado congelado que causa el problema: molesta cuando el fix viejo dice
"lejos" sin serlo, y se calla cuando dice "cerca" sin serlo.

El aviso no bloquea el cierre y **no lo va a bloquear**: cerrar nunca tuvo gate de distancia
(a esa altura el vendedor ya puede haberse ido del local por cualquier motivo legítimo, y
bloquearlo dejaría visitas abiertas para siempre). Lo que falta no es un candado: es que el
vendedor **vea** dónde lo está ubicando el GPS antes de cerrar, y pueda corregirse si el GPS
está equivocado.

## Alcance

Sólo el camino "tocar Cerrar visita estando lejos del cliente". Todo lo demás queda intacto:

- **No se toca el backend.** `PUT /planificacion/visitas/:id/cerrar` sigue aceptando cerrar
  desde cualquier coordenada. Esto es una guía operativa del front, como el gate de los 100 m
  al iniciar, y por las mismas razones: es falsificable y no pretende no serlo.
- **No se toca el banner del pie** de `VisitaSheet` ("Te alejaste del cliente · Ver mi
  posición"). Sigue siendo la puerta temprana; el botón de cerrar pasa a ser una segunda
  puerta a la misma pantalla.
- **No aplica a `no_visita`**, que no captura ubicación a propósito, ni a la visita de alta
  (`tipo='alta'`), que no tiene coordenada del cliente contra la cual medir.
- **Un cliente sin coordenadas nunca llega acá**: no hay contra qué medir, así que no hay
  desvío posible y el flujo es idéntico a hoy.

## Diseño

### 1. El disparador es la coordenada definitiva, no el aviso

`VisitaFlow.onCerrarVisita` pasa a **medir antes de decidir**, con el mismo fix fresco que se
va a persistir. Es el espejo exacto de lo que `onIniciar` ya hace y documenta como *"segunda
verificación, con la coordenada DEFINITIVA (la que se persiste)"*:

```
VisitaSheet.cerrarConBorrador
  → guarda el batch de rubros contra el backend      (sin cambios)
  → limpia borradores locales                        (sin cambios)
  → onCerrarVisita(observaciones, detalle)
        → conUbicacion(geo => {                       ← capturarUbicacion(): coord + precisionM
              d = distanciaMetros(geo, visitaEnCurso.cliente)
              ├─ sin coords del cliente, o !estaFueraDeRango(d, geo.precisionM)
              │     → ejecutarCierre(geo, observaciones, detalle)     ← cierra, sin desvío
              └─ estaFueraDeRango(d, geo.precisionM)
                    → evaluarFix(geo)                 ← sincroniza el hook con la verdad
                    → setCierrePendiente({observaciones, detalle})
                                                      ← se abre MapaVisita modo 'cerrar'
          })
```

**No agrega ninguna espera.** `conUbicacion` ya corría antes de cerrar, para obtener la
coordenada que se guarda en `coord_final`. Lo único nuevo es que su resultado, además de
viajar al backend, se usa para decidir.

El criterio es `estaFueraDeRango(d, precisionM)` —`d − precisión > RADIO_INICIO_METROS`, la
misma función que gobierna el gate de inicio y la entrada del aviso—: evidencia positiva de
lejanía aun en el mejor caso para el fix. Un fix grueso de wifi/antena no manda a nadie al
mapa por ser impreciso. **Esto no es un gate**: el resultado de estar lejos es un desvío que
se puede atravesar, no un bloqueo.

#### Sincronizar el hook al entrar

Al desviar se llama a **`evaluarFix(lat, lon, geo.precisionM)`** con la coordenada definitiva,
por el seam que el hook ya expone para esto. Sin esa llamada, el hook podría seguir con su fix
viejo diciendo `alejado: false`, y el mapa —cuyo CTA lee `alejado`, ver §2— abriría en verde
"Cerrar visita", contradiciendo el motivo por el que se abrió.

Con la llamada, el hook queda en el mismo estado que la medición que disparó el desvío (el
criterio de entrada de `evaluarFix` es `estaFueraDeRango`, el mismo que acaba de dar
verdadero), el cartel del pie se pone al día, y a partir de ahí el watch de alta precisión del
mapa puede apagarlo solo. Es el efecto colateral correcto: el estado congelado se descongela
justo cuando importa.

#### `ejecutarCierre` y la recaptura al confirmar

El cuerpo actual de `onCerrarVisita` (el `cerrar.mutateAsync` + limpieza de anclas +
`cerrarFlujo`) se extrae a **`ejecutarCierre(geo, observaciones, detalle)`**, que ahora recibe
el `geo` en vez de capturarlo. Su lógica no cambia.

En el camino directo se le pasa el `geo` de la medición, sin recapturar. En el camino del
desvío, confirmar **vuelve a capturar** con `conUbicacion`: entre que el vendedor tocó Cerrar
visita y que confirma pueden pasar minutos de recalcular y mirar el mapa, y `coord_final`
tiene que ser dónde estaba al cerrar, no dónde estaba al empezar a dudar. La segunda captura
es rápida —el GPS quedó caliente y el mapa lo tuvo en alta precisión todo el rato— y reusa el
mismo camino, incluido el manejo de permiso denegado (`onGeoBloqueada`), que no se duplica.

#### Por qué el desvío vive en `VisitaFlow` y no en `VisitaSheet`

Para cuando `onCerrarVisita` corre, `cerrarConBorrador` ya persistió el batch de rubros contra
el backend. Interceptar después significa que cancelar el mapa **no pierde nada**: los rubros
ya están guardados, y el state del sheet conserva observaciones y contacto, así que un segundo
intento de cerrar re-arma los mismos valores y vuelve a medir. Interceptar antes obligaría a
meter el mapa dentro del sheet y a decidir si el batch se guarda o no antes de una
confirmación que el vendedor todavía puede cancelar.

**El desvío es incondicional**: no hay "ya lo vio una vez". Si cancela y vuelve a tocar Cerrar
visita, se vuelve a medir, y si sigue lejos vuelve al mapa. Es un estado menos que mantener, y
al medir de nuevo cada vez, el que se acercó mientras tanto pasa derecho.

### 2. Modo `'cerrar'` en `MapaVisita`

Se suma un cuarto valor a `modo`: `'iniciar' | 'consulta' | 'ubicar' | 'cerrar'`.

Es **`'consulta'` con CTA**: pin del cliente, círculo de rango, posición propia en vivo con
watch de alta precisión, distancia en vivo, "Recalcular posición" y "¿Cómo llegar?". Sin
reposicionar el cliente —ajustar el pin es una decisión del inicio de la visita, no del
cierre— y sin "Restablecer".

**"Recalcular posición" es el protagonista de esta pantalla, no un accesorio heredado de
`'consulta'`.** Es la respuesta concreta al caso de mala señal o actualización congelada: el
botón que el vendedor toca para decirle al sistema "medime de nuevo, estoy acá". Ya existe y
no cambia; lo que cambia es que ahora aparece en el momento en que sirve para algo.

Como en `'consulta'`, cada fix se reporta por `onFix` → `evaluarFix` del hook — tanto los del
watch como el de "Recalcular posición". Eso es lo que hace que el mapa pueda apagar el aviso
solo, a los pocos segundos de abrirse, si el vendedor tiene razón.

Y el mapa **no se puede saltear**: es full-screen y la única salida hacia adelante es el CTA.
Ése es el punto de toda la feature — que nadie cierre lejos sin haberlo visto.

#### El CTA y sus dos caras

La cara del botón la gobierna el prop **`alejado`** que baja de `useAlejadoDelCliente`, **no**
el `fueraDeRango` que el mapa calcula internamente para pintar el texto de la distancia. Es
deliberado: la histéresis simétrica del hook (entra con `d − p > radio`, sale con
`d + p ≤ radio`) es la única fuente de verdad sobre si el vendedor está lejos, y duplicar ese
criterio dentro del mapa es abrir la puerta a que las dos pantallas discrepen. El mapa sigue
mostrando la distancia desde su propio fix, como ya hace hoy.

| `alejado` | botón | al tocar |
|---|---|---|
| `true` | ámbar, `Cerrar igual · estás a 340 m` | abre el `ConfirmDialog` |
| `false` | verde, `Cerrar visita` | ejecuta el cierre, sin diálogo |

El segundo caso es el premio por reposicionarse: el vendedor recalculó, el GPS confirmó que
está en el local, el aviso se apagó y el botón se volvió un cierre normal. Un toque más que
en el camino de hoy, pero nada se cierra sin que lo pida en la pantalla que está mirando.

#### El CTA nunca queda deshabilitado

Ni mientras el primer fix se resuelve (`calculando`), ni si el GPS falla del todo
(`sinUbicacion`), ni si un refresco posterior falla (`errorActualizando`). En todos esos casos
el botón muestra su cara de "Cerrar igual" —al entrar al mapa ya sabemos que está alejado, ese
es el motivo del desvío— y el vendedor puede cerrar con la confirmación.

Es la diferencia explícita con el modo `'iniciar'`, donde `calculando` **sí** deshabilita.
Ahí el gate de 100 m es real y el estado transitorio existe para no habilitar un botón como si
la cercanía ya estuviera confirmada. Acá no hay gate, y un GPS que no responde no puede trabar
un cierre: eso reintroduciría por la ventana el bloqueo que el dominio saca a propósito.

### 3. La confirmación

`ConfirmDialog` (el `AlertDialog` de Radix que la app ya usa), sobre el mapa. Su overlay y su
contenido están en `z-[60]` y el mapa en `z-50`, así que monta encima sin tocar nada.

- **Título:** `¿Cerrar la visita lejos del cliente?`
- **Descripción:** `Estás a 340 m de DERQUI AUTOPARTES. La visita va a quedar registrada
  igual, con esta ubicación.` — la distancia sale del fix vivo del mapa, con `formatDistancia`.
- **Confirmar:** `Cerrar igual` · **Cancelar:** `Cancelar`
- **No es `destructivo`.** El rojo está reservado para acciones que descartan trabajo; esto
  registra un hecho legítimo. Que sea irreversible (`pl_resolucion` es inmutable) lo cubre el
  texto, no el color.

`onConfirm` devuelve la promesa de `ejecutarCierre`, así que el diálogo **espera** en vez de
cerrarse al toque: mientras el cierre está en vuelo muestra su propio estado de trabajo, y
recién se va cuando la llamada vuelve. `ejecutarCierre` **nunca rechaza** —atrapa el error
adentro y lo reporta por `onAviso`, igual que hoy—, así que el diálogo siempre resuelve y se
cierra; el error se ve en el toast, no en la descripción del diálogo.

Va sobre `AlertDialog` y no sobre `BottomSheet` aunque esto sea pantalla de vendedor: el mapa
es full-screen y un sheet subiendo desde abajo sobre otro full-screen se lee como una tercera
capa de navegación. Una confirmación es un corte, no un paso.

### 4. Errores y estados de carga

- Mientras la medición inicial corre (el `capturarUbicacion` de `onCerrarVisita`), el botón
  del **sheet** muestra "Cerrando…" como hoy. Si el resultado es un desvío, el sheet vuelve a
  su estado normal detrás del mapa.
- Mientras la recaptura + `ejecutarCierre` corren, el CTA del **mapa** muestra su spinner. Es
  un prop nuevo, **`cerrando`**, paralelo a `iniciando` y no un renombre: `iniciando` sigue
  siendo del modo `'iniciar'` y los dos modos nunca están montados a la vez, pero un solo
  prop compartido obligaría a leer `modo` para saber qué significa.
- **Permiso de ubicación denegado o GPS caído** en cualquiera de las dos capturas:
  `conUbicacion` llama a `onGeoBloqueada` y no cierra, igual que hoy. Sin cambios — y sin
  desvío, porque sin coordenada no hay nada que medir ni que mostrar en un mapa.
- **Éxito:** `ejecutarCierre` ya hace `cerrarFlujo()`, que desmonta todo el flujo —mapa
  incluido—. `cierrePendiente` se limpia junto con el resto del state del flujo.
- **Fallo:** el toast de error (`No se pudo cerrar la visita. Volvé a intentar.`) ya sale de
  `ejecutarCierre`. El diálogo se cierra al resolver la promesa y el mapa se cierra con él
  (`setCierrePendiente(null)`): el vendedor vuelve al sheet, que es donde está el botón para
  reintentar y donde el toast queda legible. Reintentar vuelve a pasar por el desvío.
- **`VISITA_YA_CERRADA`:** se trata como éxito, igual que hoy. Sin cambios.

## Impacto sobre el cierre normal

El que cierra parado en el local **no ve ningún cambio**: ni un toque ni un segundo de más.
La captura de coordenada ya ocurría igual antes de cerrar, y el desvío exige
`distancia − precisión > 100 m`, o sea evidencia de lejanía aun en el mejor caso para el fix
— un GPS impreciso no manda a nadie al mapa por ser impreciso.

El falso positivo que importaría es **la coordenada del cliente mal guardada**: el vendedor
parado en el local midiendo 400 m contra un punto equivocado, y comiéndose el desvío en cada
cierre de ese cliente sin tener ninguna culpa. Dos cosas lo contienen:

1. **La medición usa `visitaEnCurso.cliente`, que ya lleva la corrección.** Si el vendedor
   reposicionó el pin al iniciar, `clienteParaVisita` guardó la coordenada nueva como ancla de
   toda la visita, exactamente para que el aviso de "te alejaste" no dispare estando parado
   donde reposicionó. El cierre hereda eso gratis. **No medir contra `cliente` ni contra el
   card de la agenda**, que pueden traer la coordenada vieja del warehouse.
2. **Para haber iniciado, ya tuvo que estar a menos de 100 m de esa misma ancla.** El gate de
   inicio sí bloquea. O reposicionó, o estaba cerca: en los dos casos el ancla contra la que
   se mide al cerrar es una que él validó con el cuerpo media hora antes. Un falso positivo
   exigiría que la coordenada estuviera mal *y* que el inicio no lo hubiera detectado.

Queda un residuo, chico y asumido:

- **Inició sin GPS.** Con el "No pudimos ubicarte, pero podés iniciar igual" no hubo gate, así
  que el ancla pudo quedar mal sin que nadie lo notara. Al cerrar con señal buena, desvío. Es
  raro, y discutiblemente correcto: la app realmente no sabe dónde está el local.
- **Deriva del GPS adentro del local.** Un fix de 150 m con precisión 30 dispara el desvío.
  No es una fuente *nueva* de falsos positivos —es el mismo criterio que el cartel del pie ya
  usa hoy—; lo que cambia es la consecuencia, de una banda ignorable a una pantalla completa.
  Ése es el intercambio que la feature compra a propósito.

En los dos casos el costo tiene techo: no es un bloqueo. Ve el mapa, toca "Recalcular
posición" o directamente "Cerrar igual", y confirma. Dos toques de más en un caso raro, contra
cerrar a ciegas en el caso frecuente.

## Qué NO se hace

- **No se agrega un gate de distancia al cierre.** Decisión vigente del dominio, reafirmada:
  el vendedor puede haberse ido del local por motivos legítimos y bloquearlo dejaría visitas
  abiertas para siempre.
- **No se espera unos segundos antes de habilitar el CTA.** Se consideró arrancar el botón
  deshabilitado mientras el GPS intenta un fix mejor. Traba a quien ya sabe que está lejos, y
  el vendedor que quiere un fix mejor tiene "Recalcular posición" a mano.
- **No se guarda "ya vio el mapa en esta visita"**, por lo dicho en §1.
- **No se manda nada nuevo al backend.** La coordenada de cierre que se persiste sigue siendo
  la de `conUbicacion`, capturada al confirmar — no el fix del watch del mapa, que es sólo
  visual. Nada de esto toca `pl_resolucion` ni api-vendedores.
- **No se muestra el detalle técnico del fix** (precisión en metros, antigüedad de la
  medición). Se evaluó como ayuda de diagnóstico —distinguir a simple vista un GPS malo de
  una medición vieja— y se descartó: el vendedor no tiene por qué leer metros de precisión, y
  el mapa con el pin, el círculo y la distancia en vivo ya le dice lo único que necesita
  saber. Si más adelante hace falta analizar el fenómeno con datos, el camino es persistir
  precisión y antigüedad junto a `coord_final`, que es columna nueva en `pl_resolucion` y
  cambio en api-vendedores — otro spec.
- **No se desvía cuando el fix es demasiado impreciso para concluir.** `distancia − precisión`
  nunca supera el radio si la precisión es enorme, así que un fix de 400 m con precisión 500 m
  cierra sin pasar por el mapa. Es un agujero conocido en el objetivo de "que no pueda cerrar
  lejos sin darse cuenta", y se acepta a propósito: ante la duda el sistema no interrumpe, y
  la alternativa —desviar a todo fix con precisión mayor que el radio— manda al mapa a gente
  parada en el local con un fix de antena, con el CTA en "Cerrar igual" sin que esté lejos de
  verdad. Eso erosiona la señal justo donde la feature necesita que se le crea. **Disparador
  para revisarlo:** si en la práctica aparecen cierres lejanos que se escaparon del desvío,
  la salida es desviar también con precisión > `RADIO_INICIO_METROS`. Lo que NO hay que hacer
  es comparar la distancia cruda ignorando la precisión: ese criterio ya se descartó dos veces
  en este repo por generar avisos falsos.
- **No se toca `useAlejadoDelCliente`.** El `watchPosition` sigue en baja precisión (batería),
  el `visibilitychange` sigue como está y el `onError` silencioso también. El fix viejo deja
  de importar para el cierre porque el cierre ya no lo consulta, no porque el hook mejore.

## Tests

`VisitaFlow.test.tsx`:

- Con la coordenada definitiva **lejos** del cliente, tocar Cerrar visita **no** llama al
  endpoint de cierre y abre el mapa.
- Con la coordenada definitiva **cerca**, el cierre es directo: ni mapa ni diálogo, y el
  endpoint recibe la coordenada ya capturada (una sola captura, sin recaptura).
- **Con `alejado` en `false` por fix viejo pero la coordenada definitiva lejos, igual desvía.**
  Es el caso que motiva el diseño: el estado congelado del hook no puede dejar pasar un cierre
  lejano en silencio.
- Con `alejado` en `true` por fix viejo pero la coordenada definitiva cerca, cierra directo
  sin molestar.
- Confirmar en el diálogo llama al endpoint una sola vez, con las observaciones y el detalle
  que venían del sheet, y con la coordenada de la **recaptura**, no la de la medición inicial.
- Cancelar el mapa no cierra la visita y devuelve al sheet; volver a tocar Cerrar visita
  vuelve a medir y vuelve a abrir el mapa.
- Un fallo del endpoint cierra el mapa y muestra el toast de error, sin marcar la visita como
  cerrada.
- Permiso de ubicación denegado: no cierra, no abre el mapa, llama a `onGeoBloqueada`.

`MapaVisita.test.tsx`:

- Modo `'cerrar'`: renderiza el CTA y "Recalcular posición", no renderiza "Reposicionar
  cliente" ni "Restablecer".
- Con `alejado` en `true` el CTA es "Cerrar igual" con la distancia; con `false`, "Cerrar
  visita".
- El CTA está habilitado mientras `calculando` y con `sinUbicacion`.

`useAlejadoDelCliente.test.ts`: sin cambios — el hook no se toca.
