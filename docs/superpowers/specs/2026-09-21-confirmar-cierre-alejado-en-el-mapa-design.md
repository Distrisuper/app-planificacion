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

El aviso no bloquea el cierre y **no lo va a bloquear**: cerrar nunca tuvo gate de distancia
(a esa altura el vendedor ya puede haberse ido del local por cualquier motivo legítimo, y
bloquearlo dejaría visitas abiertas para siempre). Lo que falta no es un candado: es que el
vendedor **vea** dónde lo está ubicando el GPS antes de cerrar, y pueda corregirse si el GPS
está equivocado.

## Alcance

Sólo el camino "tocar Cerrar visita con `alejado` activo". Todo lo demás queda intacto:

- **No se toca el backend.** `PUT /planificacion/visitas/:id/cerrar` sigue aceptando cerrar
  desde cualquier coordenada. Esto es una guía operativa del front, como el gate de los 100 m
  al iniciar, y por las mismas razones: es falsificable y no pretende no serlo.
- **No se toca el banner del pie** de `VisitaSheet` ("Te alejaste del cliente · Ver mi
  posición"). Sigue siendo la puerta temprana; el botón de cerrar pasa a ser una segunda
  puerta a la misma pantalla.
- **No aplica a `no_visita`**, que no captura ubicación a propósito, ni a la visita de alta
  (`tipo='alta'`), que no tiene coordenada del cliente contra la cual medir.
- **Un cliente sin coordenadas nunca llega acá**: `useAlejadoDelCliente` queda inactivo sin
  `latitud`/`longitud`, así que `alejado` es siempre `false` y el flujo es idéntico a hoy.

## Diseño

### 1. El desvío vive en `VisitaFlow`, no en `VisitaSheet`

`VisitaFlow.onCerrarVisita` pasa a ser un desvío **simétrico al de iniciar**. El flujo de
inicio ya tiene exactamente esta forma —`propuestaPendiente` → `MapaVisita` →
`onConfirmarEnMapa`— y el de cierre la copia:

```
VisitaSheet.cerrarConBorrador
  → guarda el batch de rubros contra el backend      (sin cambios)
  → limpia borradores locales                        (sin cambios)
  → onCerrarVisita(observaciones, detalle)
        ├─ alejado && esClienteEnCurso → setCierrePendiente({observaciones, detalle})
        │                                 → se abre MapaVisita modo 'cerrar'
        └─ si no                       → ejecutarCierre(observaciones, detalle)
```

El cuerpo actual de `onCerrarVisita` (el `conUbicacion` + `cerrar.mutateAsync` + limpieza de
anclas + `cerrarFlujo`) se extrae tal cual a **`ejecutarCierre(observaciones, detalle)`**. No
cambia una línea de su lógica: cambia sólo quién lo llama y cuándo.

**Por qué en `VisitaFlow` y no antes, dentro del sheet:** para cuando `onCerrarVisita` corre,
`cerrarConBorrador` ya persistió el batch de rubros contra el backend. Interceptar después
significa que cancelar el mapa **no pierde nada**: los rubros ya están guardados, y el state
del sheet conserva observaciones y contacto, así que un segundo intento de cerrar re-arma los
mismos valores y vuelve a pasar por el mismo desvío. Interceptar antes obligaría a meter el
mapa dentro del sheet y a decidir si el batch se guarda o no antes de una confirmación que el
vendedor todavía puede cancelar.

**El desvío es incondicional mientras `alejado` esté activo**: si el vendedor ve el mapa,
cancela y vuelve a tocar Cerrar visita, pasa de nuevo por el mapa. No hay "ya lo vio una vez".
Es un estado menos que mantener, y el caso que evita —cancelar y reintentar sin haberse
movido— es justamente el caso donde el desvío tiene algo que decir.

### 2. Modo `'cerrar'` en `MapaVisita`

Se suma un cuarto valor a `modo`: `'iniciar' | 'consulta' | 'ubicar' | 'cerrar'`.

Es **`'consulta'` con CTA**: pin del cliente, círculo de rango, posición propia en vivo con
watch de alta precisión, distancia en vivo, "Recalcular posición" y "¿Cómo llegar?". Sin
reposicionar el cliente —ajustar el pin es una decisión del inicio de la visita, no del
cierre— y sin "Restablecer".

Como en `'consulta'`, cada fix se reporta por `onFix` → `evaluarFix` del hook. Eso es lo que
hace que el mapa pueda apagar el aviso solo, a los pocos segundos de abrirse, si el vendedor
tiene razón.

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

- Mientras `ejecutarCierre` corre, el CTA del mapa muestra su spinner. Es un prop nuevo,
  **`cerrando`**, paralelo a `iniciando` y no un renombre: `iniciando` sigue siendo del modo
  `'iniciar'` y los dos modos nunca están montados a la vez, pero un solo prop compartido
  obligaría a leer `modo` para saber qué significa.
- **Éxito:** `ejecutarCierre` ya hace `cerrarFlujo()`, que desmonta todo el flujo —mapa
  incluido—. `cierrePendiente` se limpia junto con el resto del state del flujo.
- **Fallo:** el toast de error (`No se pudo cerrar la visita. Volvé a intentar.`) ya sale de
  `ejecutarCierre`. El diálogo se cierra al resolver la promesa y el mapa se cierra con él
  (`setCierrePendiente(null)`): el vendedor vuelve al sheet, que es donde está el botón para
  reintentar y donde el toast queda legible. Reintentar vuelve a pasar por el desvío.
- **`VISITA_YA_CERRADA`:** se trata como éxito, igual que hoy. Sin cambios.

## Qué NO se hace

- **No se agrega un gate de distancia al cierre.** Decisión vigente del dominio, reafirmada:
  el vendedor puede haberse ido del local por motivos legítimos y bloquearlo dejaría visitas
  abiertas para siempre.
- **No se espera unos segundos antes de habilitar el CTA.** Se consideró arrancar el botón
  deshabilitado mientras el GPS intenta un fix mejor. Traba a quien ya sabe que está lejos, y
  el vendedor que quiere un fix mejor tiene "Recalcular posición" a mano.
- **No se guarda "ya vio el mapa en esta visita"**, por lo dicho en §1.
- **No se manda nada nuevo al backend.** La coordenada de cierre que se persiste sigue siendo
  la de `conUbicacion` dentro de `ejecutarCierre`, capturada al confirmar — no el fix del
  watch del mapa, que es sólo visual.

## Tests

`VisitaFlow.test.tsx`:

- Con `alejado` activo, tocar Cerrar visita **no** llama al endpoint de cierre y abre el mapa.
- Confirmar en el diálogo llama al endpoint una sola vez, con las observaciones y el detalle
  que venían del sheet.
- Cancelar el mapa no cierra la visita y devuelve al sheet; volver a tocar Cerrar visita
  vuelve a abrir el mapa.
- Con `alejado` en `false`, el cierre es directo: ni mapa ni diálogo.
- Un fallo del endpoint cierra el mapa y muestra el toast de error, sin marcar la visita como
  cerrada.

`MapaVisita.test.tsx`:

- Modo `'cerrar'`: renderiza el CTA, no renderiza "Reposicionar cliente" ni "Restablecer".
- Con `alejado` en `true` el CTA es "Cerrar igual" con la distancia; con `false`, "Cerrar
  visita".
- El CTA está habilitado mientras `calculando` y con `sinUbicacion`.
