# Aviso de "te alejaste del cliente" con la visita abierta

Fecha: 2026-09-08 · Actualizado: 2026-09-09

## Problema

Una vez iniciada la visita, la app deja de mirar dónde está el vendedor. `watchPosition` sólo
vive dentro de `IniciarVisitaMapa`, que se desmonta apenas la visita arranca; después el
vendedor queda en `VisitaSheet` o minimizado en `VisitaEnCursoBar`, ambos sin geolocalización.
La única captura posterior es el `capturarUbicacion()` puntual del cierre.

Consecuencia: el vendedor se va del cliente sin cerrar la visita y nada se lo dice. La visita
queda abierta, y cuando finalmente la cierra —si la cierra— la coordenada de fin se captura
donde esté en ese momento, que puede ser otro cliente.

Hay un segundo problema, anterior a esta feature y que la haría fallar en silencio: **la visita
en curso no sobrevive a recargar la app sin señal.** Ver "0. Persistir la visita en curso".

## Qué se descartó, y por qué

**Cerrar la visita automáticamente al salir del rango.** Fue el pedido original y se descartó
por cuatro razones, todas del dominio y no de implementación:

1. **La PWA no ve nada con la pantalla apagada.** Es la misma limitación que ya justifica no
   usar Capacitor. El vendedor sale del local con el celu en el bolsillo, `watchPosition` se
   congela, y el disparo llega recién cuando reabre la app — posiblemente ya en otro cliente.
   El cierre automático se ejecutaría con `coordFinal` en el lugar equivocado, rompiendo justo
   la métrica que la geolocalización existe para alimentar (`TOLERANCIA_METROS` de efectividad).
   El escenario que la feature quería resolver es el que peor funciona.
2. **El cierre es irreversible.** `pl_resolucion` tiene `UNIQUE (rotacion_cliente_id)` y no se
   reabre. Un fix grueso de wifi/antena que marca 400 m con el vendedor parado adentro del local
   cerraría la visita para siempre, y además dispararía el seguimiento a Cromo. En el gate del
   inicio un falso "lejos" sólo molesta; acá destruye datos.
3. **Se perderían los rubros sin cargar.** El sheet de una visita cerrada es de consulta
   (`esEditable` devuelve `!visitaCerrada`). Auto-cerrar al llegar al mínimo de 2 sobre 5
   propuestos descartaría los otros 3 sin que nadie lo decida.
4. **Cerrar es un acto declarativo del vendedor.** Auto-cerrar inventa un hecho comercial que
   nadie declaró — el mismo antipatrón que "auto-resolver pendientes", ya listado como idea
   descartada en `docs/dominio/modelo.md`.

**Rastreo en segundo plano, de cualquier forma.** No existe en la plataforma web, y **no es un
permiso que falte**: `navigator.geolocation` está expuesto sólo en `Window`, no en el service
worker, y Android corta el proveedor de ubicación cuando el navegador pasa a segundo plano
([Chromium #506435](https://bugs.chromium.org/p/chromium/issues/detail?id=506435),
[Bugzilla #1249130](https://bugzilla.mozilla.org/show_bug.cgi?id=1249130)). En iOS es más
estricto todavía: WebKit suspende el JS apenas la pantalla se bloquea, y suele descartar la
página entera.

El pedido lleva diez años en la W3C: [`w3c/geolocation-sensor` issue #22](https://github.com/w3c/geolocation-sensor/issues/22)
sigue abierto con 73 comentarios y movimiento reciente ([jun 2025](https://lists.w3.org/Archives/Public/public-device-apis-log/2025Jun/0000.html),
[nov 2025](https://lists.w3.org/Archives/Public/public-device-apis-log/2025Nov/0000.html)), con
dos APIs propuestas —Geofencing y Background Geotracking— pero **ningún vendor se comprometió a
implementarlas**; las trabas son privacidad y batería. La vieja Geofencing API de la W3C está
abandonada, el [intent to implement en chromium-dev](https://groups.google.com/a/chromium.org/g/chromium-dev/c/kDq4t93zbpA)
nunca prosperó, y no hay intent to prototype en Chrome para 2026.

Corolario: **el escenario "se fue con el celu en el bolsillo" no se resuelve en web.** Se
resuelve el día que haya APK — Capacitor + plugin nativo, o una TWA con el geofencing nativo
escrito a mano (el demo oficial está [pedido y sin implementar](https://github.com/GoogleChrome/android-browser-helper/issues/496)).
Hasta entonces, el disparador 2 es el techo. No volver a proponerlo sin releer esto.

**Push desde el servidor.** No aplica. Push resuelve *entregar* un mensaje; acá el problema es
*detectar* la condición, y el servidor no sabe dónde está el vendedor. (Lo que el servidor sí
podría disparar —"tenés una visita abierta hace 50 minutos"— es otra feature, con backend, cron
y permiso propios.)

**Mantener la página viva reproduciendo audio.** Reproducir audio audible exime a la página del
*freezing* de Chrome, y el truco es real. No sirve acá: mantiene viva la **página**, no la
**geolocalización** — son dos canillas distintas. Y el otro uso legítimo del truco, la precisión
del cronómetro, tampoco hace falta: `segundosTranscurridos` recalcula desde un timestamp
(`visitaTimer.ts`), no acumula ticks, así que el estrangulamiento en background no lo afecta. A
cambio secuestra los controles de media del teléfono, se corta con cualquier audio de WhatsApp o
llamada entrante, no funciona en iOS y depende de una heurística que puede cambiar sin aviso.

**Empujar a cerrar desde el aviso** (barra que ofrezca el botón de cierre destacado si ya hay
2 rubros resueltos). Descartado a pedido: el aviso es informativo. Meterle lógica de "cierre
sugerido" agrega una regla de negocio que hoy no existe, a cambio de poco.

**Notificación del sistema.** *No* descartada: **diferida a un spec propio.** El argumento
original —"en background la geolocalización está congelada, así que no habría nada que dispare
la notificación"— era el equivocado: habla de la detección, y lo que la notificación aporta no
es detección sino **persistencia**. El toast se borra solo y la barra roja se ve únicamente
adentro de la app; una notificación queda en la bandeja y en la pantalla de bloqueo, o sea que
se ve con el celu ya guardado — que es el caso que importa. Va aparte, en
[`2026-09-09-notificacion-visita-en-curso-design.md`](2026-09-09-notificacion-visita-en-curso-design.md),
porque arrastra otra columna vertebral: permiso nuevo, migración a `injectManifest` (hace falta
un handler `notificationclick` para que tocarla devuelva a la visita), matriz de degradación
iOS/Android, y reconciliación de notificaciones huérfanas cuando el navegador mata la app.

## Diseño

Detectar que el vendedor está lejos del cliente de la visita en curso, y decírselo. Nada más:
no cierra, no bloquea, no escribe en el backend.

### 0. Persistir la visita en curso

Bug que ya existe hoy, sin ninguna feature nueva: `visitaEnCurso` es `useState` en memoria
(`AgendaSemanaPage.tsx:240`) y se restaura de una sola forma — buscando un cliente con
`estado === 'en_curso'` dentro de `agenda`, que es una query al servidor
(`AgendaSemanaPage.tsx:255-273`). No hay persister de React Query: el `gcTime` de 30 min es
memoria pura y se evapora al recargar.

Entonces, si el vendedor recarga la app sin señal, la agenda falla, `visitaEnCurso` queda `null`
y **la app le muestra que no tiene ninguna visita abierta** — cuando en el backend sigue
abierta. Sin barra flotante, sin cronómetro y, con esta feature, sin watch y sin aviso.

Es llamativo que hoy se persistan el timestamp del cronómetro (`visita-inicio-N`,
`visitaTimer.ts`) y el borrador de rubros (`visita-borrador-N`, `resolucionDraft.ts`), pero no
el hecho de que hay una visita abierta. Se persiste el detalle y no el ancla.

**Diseño:** una clave `visita-en-curso` en `localStorage`, en un `src/lib/visitaEnCurso.ts` con
la misma forma que sus dos vecinos. Es singleton y no lleva id en la clave: hay una sola visita
abierta a la vez, cosa que la app ya asume (`bloqueadoPorOtraVisita`). Guarda el
`IVisitaEnCurso` entero —`{ cliente, visitaId }`— y eso no es duplicación caprichosa: la barra
necesita el nombre del cliente y el aviso necesita `latitud/longitud`, y los dos tienen que
funcionar **antes** de que la agenda cargue.

- Se escribe al iniciar la visita, junto a `marcarInicioVisita`.
- Al montar `AgendaSemanaPage`, `visitaEnCurso` se hidrata desde ahí en vez de arrancar en
  `null`.
- Cuando la agenda llega, **gana el servidor**: es exactamente la lógica de sincronización que
  ya existe en ese efecto, sin cambios, más un `limpiar()` cuando suelta el puntero.
- Se borra al cerrar la visita, junto a `limpiarInicioVisita`.

Nota aparte, que **este spec no toca**: `refetchOnReconnect: false` (`queryClient.ts:9`) hace
que al volver la señal no se refetchee nada, y la recuperación quede colgada de
`refetchOnWindowFocus`. Para una app de campo parece al revés, pero hay que entender por qué se
puso antes de cambiarlo.

### Detección

Misma definición que usa el gate del inicio: `estaFueraDeRango(distanciaM, precisionM)` de
`src/lib/distancia.ts`, con la misma constante `RADIO_INICIO_METROS`. Al descontar el margen de
error del propio fix, sólo dispara con evidencia positiva de lejanía — un fix grueso no alcanza
para avisar en falso.

`enableHighAccuracy: false` en el watch. Una visita dura media hora y el GPS fino la
tendría prendida todo ese tiempo; y como el margen de error ya se descuenta, un fix grueso
simplemente no dispara en vez de disparar mal. Para una advertencia, pecar de conservador es
lo correcto.

### Dos disparadores

1. **`watchPosition`** mientras la app está al frente — cubre "se va caminando con la app abierta".
2. **Chequeo puntual con `getCurrentPosition` en `visibilitychange`** al volver del background —
   cubre el escenario real: se fue, guardó el celu, y lo saca de nuevo en el próximo cliente.
   El aviso llega tarde, pero llega.

Sin el segundo disparador la feature no cubre su caso principal.

### Mantener la pantalla despierta

`navigator.wakeLock.request('screen')` mientras hay una visita en curso. No es un lujo: es lo
que hace que el disparador 1 exista de verdad. Sin el lock, el vendedor apoya el celu treinta
segundos, la pantalla se apaga, la página se congela y el watch deja de entregar fixes — el
cruce no se detecta nunca y la feature queda colgada sólo del disparador 2.

El lock se libera solo cuando la pestaña pasa a `hidden`, así que hay que volver a pedirlo en
`visibilitychange`: el mismo listener que el hook ya monta.

Best-effort de punta a punta: si la API no existe, o `request()` rechaza (con batería baja
algunos navegadores rechazan), no se avisa nada y se sigue. Se toma al iniciar y se libera al
cerrar — nunca fuera de una visita, porque el costo es batería.

### Histéresis

Se **entra** en `alejado` con `estaFueraDeRango(d, precisión)` (distancia menos precisión mayor
al radio). Se **sale** sólo cuando la distancia cruda vuelve a estar dentro del radio, sin
descontar precisión. Los dos umbrales son distintos a propósito: con un solo umbral, un
vendedor parado en el borde con fixes que oscilan dispararía el toast una y otra vez.

### Dónde vive

- **`src/lib/visitaEnCurso.ts`** (nuevo). `guardar` / `leer` / `limpiar` sobre la clave
  `visita-en-curso`, con el mismo `try/catch` sobre JSON inválido que usa `leerBorrador`.
- **`src/hooks/useAlejadoDelCliente.ts`** (nuevo). Recibe las coordenadas del cliente y si la
  visita está activa. Monta el watch, el listener de `visibilitychange` y el wake lock. Devuelve
  `{ alejado, distanciaM }`. Si el cliente no tiene coordenadas, queda inactivo.
- **`VisitaFlow`** lo consume. Ahí y no en `VisitaSheet`: el sheet se minimiza y desmontaría el
  watch justo cuando más se necesita. Las coordenadas salen de `visitaEnCurso.cliente`, no del
  `cliente` abierto — el vendedor puede estar mirando la propuesta de otro mientras la visita
  corre.
- **`VisitaEnCursoBar`** recibe `alejado` y pinta el estado.

Nota: se usa `cliente.latitud/longitud`, no el `clienteOverride` efímero de la reposición del
pin al iniciar. Ese override no sobrevive al inicio y no vale la pena arrastrarlo para un
aviso informativo.

### Qué ve el vendedor

- Al **cruzar de dentro a fuera**, una sola vez por cruce (no en cada tick del watch): un toast
  por el `onAviso` que ya existe — *"Te alejaste de Kiosco Rubén y la visita sigue abierta."*
- **Mientras siga lejos**, `VisitaEnCursoBar` pasa de naranja a rojo y muestra ese texto en vez
  de "Visitando a X". El cronómetro se queda. Tocarla hace lo mismo que hoy: abre el sheet.

El estado persistente en la barra es lo que hace que el aviso funcione: el toast es efímero
(`useNotificacion` lo borra solo a los pocos segundos y no tiene cola), así que por sí solo se
pierde exactamente en el caso que importa — el vendedor que no estaba mirando la pantalla.

## Fuera de alcance

No persiste el estado de `alejado`: si recarga la app, se recalcula con el primer fix. No hay
permiso nuevo — el de geolocalización ya está dado, si no la visita no habría podido iniciarse.
No toca api-vendedores: la regla vive entera en el front, igual que `RADIO_INICIO_METROS`.

- **Notificación del sistema y badge en el ícono** — spec propio, ver arriba.
- **Cerrar la visita sin conexión.** Hoy no se puede: `mutations: { retry: 0 }` y no hay cola.
  Y **no alcanza con encolar** el request con Workbox Background Sync: `cerrarVisita` manda sólo
  `coordFinal` (`src/api/planificacion.ts:105`), o sea que **`fecha_fin` la estampa el
  servidor** — un cierre que se drena 40 minutos más tarde registra una visita 40 minutos más
  larga y corrompe la métrica de duración (`visitasCortas`). Hacerlo seguro necesita que el
  front mande `fechaFin`, y eso es un cambio en api-vendedores. Queda anotado como pendiente en
  `docs/dominio/modelo.md`. Vale tenerlo presente porque **este aviso le mete presión**: le dice
  "cerrá" justo cuando se está yendo, que es el momento de peor señal.

## Tests

Persistencia de la visita en curso (`visitaEnCurso.ts` + `AgendaSemanaPage`):

- hidrata la barra flotante desde `localStorage` cuando la agenda todavía no cargó o falló;
- cuando la agenda llega y el cliente ya no está `en_curso`, suelta el puntero y limpia la clave;
- se limpia al cerrar la visita;
- JSON inválido en la clave no rompe: arranca sin visita en curso.

`useAlejadoDelCliente`, con el mock de `navigator.geolocation` que ya usa
`IniciarVisitaMapa.test.tsx`:

- dispara `alejado` cuando el fix está francamente lejos;
- **no** dispara con un fix grueso a distancia moderada (la precisión lo cubre);
- no re-dispara el aviso oscilando en el borde (histéresis);
- chequea la posición al volver del background (`visibilitychange`);
- queda inactivo si el cliente no tiene coordenadas;
- pide el wake lock al activarse, lo libera al desmontarse, y lo vuelve a pedir al volver del
  background;
- no rompe si `navigator.wakeLock` no existe o si `request()` rechaza;
- limpia el watch y el listener al desmontarse.

`VisitaEnCursoBar`: la variante roja con el texto de alejado, y que el cronómetro se siga
mostrando.
