# Notificación persistente de "visita en curso"

Fecha: 2026-09-09

Depende de [`2026-09-08-aviso-alejado-del-cliente-design.md`](2026-09-08-aviso-alejado-del-cliente-design.md):
reusa `useAlejadoDelCliente` y `src/lib/visitaEnCurso.ts` (la persistencia de la visita en
curso en `localStorage`, sección "0" de ese spec) tal cual. No se implementa sin eso — la
reconciliación de huérfanos (más abajo) depende directamente de esa persistencia.

## Problema

El spec del aviso resuelve "adentro de la app": toast al cruzar + `VisitaEnCursoBar` en rojo.
Pero el vendedor no mira la pantalla todo el rato que dura una visita — el celular vuelve al
bolsillo. Ahí el toast ya se borró solo y la barra roja nadie la ve.

Lo que sí se ve con el celular guardado es la bandeja de notificaciones y la pantalla de
bloqueo. Este spec agrega esa capa: una notificación que **vive durante toda la visita**, sin
push, sin backend, y **tappable** — tocarla vuelve a la app en el flujo de esa visita.

Flota: mitad Android, mitad iPhone. Ver la matriz de degradación más abajo — el diseño es
mejora progresiva, no asume ninguna de las dos plataformas.

## Qué se descartó, y por qué

**Push desde el servidor (VAPID + suscripciones).** No hace falta: nada de esto depende de que
el *servidor* sepa que el vendedor se alejó — la detección sigue siendo 100% del front, igual
que en el spec base. Push resolvería *entregar* un mensaje que el servidor origina; acá el
mensaje lo origina el propio cliente. Meter VAPID, tabla de suscripciones y un endpoint de alta
sería infraestructura sin ningún caso de uso todavía.

**Notificación "ongoing" al estilo descarga de Android (no descartable).** No existe en la web:
no hay equivalente de `setOngoing(true)`, ninguna notificación web se puede hacer indescartable.
Lo más cerca que se llega es una notificación con `tag` fijo que se **reemplaza** en vez de
apilarse y que, en Android, no se autodescarta como un toast — se acepta que el vendedor la
pueda deslizar y listo, no se pelea eso.

**Cronómetro en vivo dentro de la notificación.** Actualizar el texto exige volver a llamar a
`showNotification`, y con la página oculta los timers están limitados a ~1/min o congelados.
En vez de perseguir un contador que se desincroniza, el cuerpo muestra la hora de inicio, fija
("iniciada 14:32") — siempre correcta, cero actualizaciones.

**Botón "Cerrar visita" como `action` de la notificación.** Se puede, y es la primera idea que
aparece. Se descarta: saltearía el gate de `min(2, ofrecidos)` rubros y el chequeo de
`ofrecimientosCargados` de `VisitaSheet`, y el cierre es irreversible
(`UNIQUE (rotacion_cliente_id)`). La única acción sana es volver a la visita, nunca cerrarla
desde afuera del flujo. Además, en iOS las notificaciones no tienen `actions` — tocar el cuerpo
es la única interacción que existe ahí, así que ni conviene depender de un botón.

## Diseño

Una sola notificación por visita, identificada por `tag: 'visita-activa'` — nunca se apila.
Cambia de contenido según el mismo estado que ya pinta `VisitaEnCursoBar`.

### El permiso

Se pide con `Notification.requestPermission()` en el tap de **"Iniciar visita"** — nunca al
abrir la app. Tiene que salir de un gesto del usuario (obligatorio en iOS, buena práctica en
Android). Si lo niega, o el navegador no soporta la API, todo esto queda en no-op: el vendedor
se queda exactamente con el spec base (toast + barra roja). No hay segundo pedido en la misma
visita si lo negó.

### Contenido, por estado

Vía `registration.showNotification(...)` — **no** `new Notification(...)`: en Android tira
`NotSupportedError` fuera de la página. Siempre por el `ServiceWorkerRegistration`.

| momento | título / cuerpo | `silent` | `renotify` |
|---|---|---|---|
| al iniciar la visita | "Visita en curso" / "Kiosco Rubén · iniciada 14:32" | `true` | — |
| al cruzar a `alejado` | "Visita en curso" / "Te alejaste de Kiosco Rubén y la visita sigue abierta" | `false` | `true` |
| al volver al rango | vuelve al texto neutro de arriba | `true` | `false` |
| al cerrar la visita | se cierra (`getNotifications({tag}).forEach(n => n.close())`) | — | — |

`silent: true` en el estado neutro es a propósito: no tiene que vibrar cada vez que se
actualiza. `renotify: true` solo en el cruce a `alejado`, para que suene/vibre una vez — igual
histéresis que el toast del spec base, un aviso por cruce.

Se dispara desde `useAlejadoDelCliente` (o un hook hermano que lo envuelve,
`useNotificacionVisita`), en los mismos puntos donde ya se dispara `onAviso`. No es lógica
nueva de detección — es una salida más de la máquina de estados que el spec base ya define.

### Tocarla vuelve a la visita

Requiere `injectManifest`: `generateSW` no deja escribir un handler de eventos custom, y
`notificationclick` es justamente eso. Migración:

```ts
// vite.config.ts
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  injectManifest: { injectionPoint: undefined },
  registerType: 'autoUpdate',
  // manifest, icons: igual que hoy
})
```

```ts
// src/sw.ts
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== 'visita-activa') return
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existente = clients[0]
      if (existente) return existente.focus()
      return self.clients.openWindow('/')
    }),
  )
})
```

`workbox-core` y `workbox-precaching` pasan a devDependencies. El registro sigue siendo
automático (`injectRegister` default) — hoy no hay `useRegisterSW` en el código
(`src/main.tsx` no lo usa), así que no hay que tocar el flujo de actualización del SW para
nada de esto.

Tocar la notificación **no** reabre el sheet de la visita puntual (`postMessage` al cliente
para eso es una mejora aparte, no bloqueante): enfoca o abre la ventana de la app. Con
`visitaEnCurso` persistido (spec base, sección 0), la barra flotante aparece sola apenas la
app está al frente — alcanza.

### Badge en el ícono

`navigator.setAppBadge()` al iniciar la visita, `navigator.clearAppBadge()` al cerrarla o al
cruzar de vuelta a dentro del rango (el badge marca "hay algo pendiente de tu atención", no
"estás lejos" — se enciende con la visita, no con la distancia). Mismo permiso que la
notificación en la práctica (Badging va atado a notificaciones en iOS), cero costo adicional
de implementación: dos llamadas más en los mismos puntos.

### Reconciliar huérfanos al arrancar

Si el navegador mata la app o el celular se reinicia, la notificación y el badge sobreviven
—viven en el origen y en el ícono, no en la página— y quedan diciendo "visita en curso" para
siempre si nadie los limpia.

Al montar `AgendaSemanaPage`, después de que `visitaEnCurso` se resuelve (leído de
`localStorage` primero, confirmado o descartado contra el servidor después — spec base,
sección 0): si **no** hay visita en curso, se cierran todas las notificaciones con
`tag: 'visita-activa'` y se limpia el badge. Es la razón por la que este spec no se puede
implementar sin la persistencia del spec base: sin ella, "¿hay visita en curso?" es una
pregunta que solo el servidor contesta, y reconciliar quedaría bloqueado por red igual que el
problema que se está arreglando.

### Matriz de degradación

| | Android Chrome | iOS instalada (16.4+) | iOS pestaña Safari |
|---|---|---|---|
| Notificación persistente por `tag` | ✅ | ✅ (sin nada que la deslice antes) | ❌ `Notification` no existe |
| Tappable → vuelve a la app | ✅ | ✅ (toca el cuerpo, no hay `actions`) | ❌ |
| Badge en el ícono | ✅ | ✅ | ❌ |
| Capa base (spec anterior) | ✅ | ✅ | ✅ |

En pestaña de Safari, `Notification` es `undefined` — no es que el permiso falle, no hay nada
que pedir. Todo este spec queda en no-op y el vendedor se queda con la capa base. No hay forma
de detectar "está en pestaña vs. instalada" de antemano ni de empujarlo a instalar desde acá;
si la adopción importa, es una conversación operativa, no de este spec.

## Fuera de alcance

Push server-side. Cronómetro en vivo dentro de la notificación. Acción de cerrar la visita
desde la notificación. Prompt para instalar la PWA en iOS. Reabrir el sheet exacto de la
visita al tocar la notificación (hoy alcanza con enfocar la ventana; la barra flotante hace el
resto).

## Tests

`useNotificacionVisita` (o equivalente), con `Notification` y `registration.showNotification`
mockeados:

- pide permiso al iniciar la visita, no antes;
- si el permiso es denegado, no vuelve a pedirlo ni intenta mostrar nada;
- muestra la notificación neutra al iniciar, con la hora de inicio en el cuerpo;
- al cruzar a `alejado`, reemplaza el contenido (mismo `tag`) con `renotify: true`;
- al volver al rango, reemplaza de nuevo al texto neutro con `renotify: false`;
- al cerrar la visita, cierra todas las notificaciones con ese `tag`;
- si `Notification`/`registration.showNotification` no existen (Safari en pestaña), no rompe
  y no intenta nada.

Reconciliación al arrancar (`AgendaSemanaPage`):

- sin visita en curso (ni en `localStorage` ni en el servidor), cierra cualquier notificación
  huérfana con `tag: 'visita-activa'` y limpia el badge.

Service worker (manual / smoke, no vitest): `notificationclick` sobre una notificación con
`tag: 'visita-activa'` enfoca una ventana existente o abre una nueva; sobre cualquier otro
`tag` no hace nada.
