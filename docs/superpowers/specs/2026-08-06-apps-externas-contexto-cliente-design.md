# Apps externas con contexto de cliente

**Fecha:** 2026-08-06
**Estado:** aprobado, pendiente de plan de implementación

## Problema

El vendedor, parado en la puerta del cliente, necesita ver cómo viene ese cliente en pagos, compras
y cuenta corriente. Hoy esa información vive en **pagos-lupa** (`pagos-lupa.web.app`), una app propia
y separada. Para verla tiene que salir de app-planificacion, loguearse de nuevo y buscar el cliente
a mano.

El objetivo es que app-planificacion sea la **única app que el vendedor abre**: desde la card de un
cliente, un tap lleva a la pantalla de pagos de *ese* cliente, ya autenticada y ya filtrada.

pagos-lupa es la primera, no la única. Va a haber más botones a más apps propias, así que lo que se
diseña acá no es un botón: es el **estándar** con el que se agregan las siguientes.

## Alcance

**Entra:**

- Un registro central de apps externas, con el contrato de contexto (cliente + sesión) tipado.
- Un contenedor de pantalla completa que embebe la app externa en un iframe, sin que el vendedor
  cambie de ventana.
- Un componente de acciones reutilizable, presente en la card de la agenda y en el sheet del cliente.
- pagos-lupa como primera y única app registrada.

**No entra:**

- Reimplementar los datos de pagos-lupa consumiendo sus endpoints (`/api/lupa-web/*`). Se evaluó y
  se descartó: la regla de negocio de "qué es deuda" debe vivir en un solo lugar. Se reusa **la UI**,
  no los datos.
- Cambios en el repo de pagos-lupa. Hay tres pedidos deseables (ver "Pedidos a pagos-lupa"), pero
  ninguno bloquea esta implementación.
- Escritura hacia la app externa (registrar un pago desde acá). El iframe es de lectura y de
  operación *dentro* de pagos-lupa; app-planificacion no interpreta el resultado.

## Decisión de fondo: iframe, no pestaña externa

Se evaluó abrir con `window.open(url, '_blank')` y **se descartó**, aunque es la opción de menor
riesgo técnico. El motivo es el caso de uso: un vistazo de segundos, de pie frente al cliente.
`_blank` no garantiza una experiencia de "ventana encima":

| Contexto | Qué hace `_blank` |
| --- | --- |
| PWA instalada, Android/Chrome | Custom Tab encima de la PWA, con origen visible y X que vuelve. Aceptable. |
| PWA instalada, iOS (agregar a inicio) | Inconsistente entre versiones: a veces vista in-app, a veces patea a Safari como app separada y se pierde el contexto. |
| Navegador móvil sin instalar | Pestaña real. Hay que usar el conmutador de pestañas. Inaceptable. |

No se puede prometer la ventana; solo la pestaña. Para el vistazo rápido eso es demasiada fricción,
así que se paga el costo del iframe.

## El contrato de handoff (ya existe)

pagos-lupa **ya implementa** el deep-link. Verificado leyendo su bundle de producción
(`/assets/index-ca5c7acd.js`):

```
{VITE_PAGOS_LUPA_URL}/auth/login?token=<access_token>&client=<codigoParticularCliente>
```

Comportamiento observado:

1. En `/auth/login`, si hay `?token`, lo guarda como `lupaToken` y setea `isAuthenticated`.
2. Lo valida con `POST distrimdp.dvrdns.org/api/authorization/decode-token`.
3. Normaliza el usuario (`rol`, `codigoparticular`) y **reconstruye los params preservando `client`**,
   navegando a `/?client=<cod>`:

   ```js
   const N = new URLSearchParams
   x && N.set("client", x)
   C && ["PPAL","DS"].includes(C) && N.set("type_operation", C)
   d(R ? `/?${R}` : "/")
   ```

4. El `client` **solo se aplica si `user.rol === "VENDEDOR"`** — el caso de esta app.

`type_operation` acepta `PPAL` o `DS`. **Se omite deliberadamente**: nadie en este proyecto sabe qué
significan, y omitirlo evita además una rama de redirect extra. Se agrega cuando alguien que conozca
pagos-lupa lo confirme.

La URL base va en `VITE_PAGOS_LUPA_URL` (`.env` y `.env-example`), no hardcodeada — hay al menos tres
deploys vivos (`web.app`, `pagos-lupa-v222.vercel.app`, previews de PR).

## Arquitectura

Cuatro piezas, cada una con una responsabilidad y testeable por separado.

### 1. `src/lib/appsExternas.ts` — el registro

Única fuente de verdad. Agregar la próxima app es una entrada en un array; no se toca ningún
componente.

Dos ejes independientes, y hay que separarlos: **de dónde sale la credencial** (`token`) y **cómo se
le entrega a la app externa** (`handoff`). Mezclarlos en un solo `buildUrl` es lo que ataría el diseño
a apps que aceptan el token por query string.

```ts
/** De dónde sale la credencial que se le pasa a la app externa.
 *  'sesion' = el access_token de app-planificacion. Es el caso normal: las apps
 *  propias comparten el login. No es universal, por eso es un campo y no un supuesto. */
export type EstrategiaToken = 'sesion' | 'ninguno'

export interface AppExternaContext {
    cliente: IVisitClientCard
    /** null si la estrategia es 'ninguno'. */
    token: string | null
}

/** CÓMO se le entrega el contexto. Union discriminada a propósito: el contenedor
 *  hace un switch exhaustivo sobre `tipo`, así que sumar una variante es un cambio
 *  aditivo que el compilador señala, y ningún consumidor se toca. */
export type Handoff = {
    tipo: 'url'
    /** Se invoca UNA vez por apertura. Nunca en render. */
    url: (ctx: AppExternaContext) => string
}

export interface AppExterna {
    id: string
    label: string
    icon: LucideIcon
    token: EstrategiaToken
    handoff: Handoff
}
```

Entrada de pagos-lupa:

```ts
{
    id: 'pagos',
    label: 'Pagos',
    icon: Wallet,
    token: 'sesion',
    handoff: {
        tipo: 'url',
        url: ({ cliente, token }) => {
            const params = new URLSearchParams({
                token: token ?? '',
                client: cliente.codigoParticularCliente,
            })
            return `${PAGOS_LUPA_URL}/auth/login?${params}`
        },
    },
}
```

`EstrategiaToken` existe porque las apps propias **normalmente** comparten el token (mismo login),
pero no siempre. Modelarlo como campo desde el día uno evita que la primera app que no lo comparta
obligue a rediseñar el registro.

Una app sin `token` ni `handoff` declarados no se puede registrar: el tipo lo exige.

### Qué formas de handoff son posibles (y cuál no)

Se investigó contra la documentación de la plataforma web antes de fijar la forma del tipo. El
`Handoff` arranca con una sola variante (YAGNI: hoy hay una sola app), pero estas son las variantes
conocidas, con su forma ya definida, para que agregarlas sea mecánico:

| Cómo recibe la credencial la app externa | ¿Posible en un iframe? | Variante |
| --- | --- | --- |
| Query string (GET) | Sí. Es el caso de pagos-lupa. | `{ tipo: 'url', url }` — implementada |
| **Body de un POST** | **Sí.** Un `<form method="POST" target="<name del iframe>">` submiteado por JS navega el iframe con POST. Es el mismo mecanismo que el HTTP-POST binding de SAML. | `{ tipo: 'form', action, campos }` |
| Post-carga, por mensaje | Sí, pero exige que la app externa tenga un listener. **Es el más seguro**: la credencial no pasa por URL, ni por historial, ni por grabadores de sesión. | `{ tipo: 'postMessage', url, mensaje, origen }` |
| **Header HTTP custom** | **No, y no hay workaround.** No existe API para setear headers en una navegación de documento: ni `src=`, ni el submit de un form, exponen ese hook — el navegador retiene el control de los headers de navegación. | — |

**Límite arquitectónico explícito:** si una app externa **exige** la credencial en un header custom,
no se puede integrar por iframe. Punto. Las salidas son pedirle que acepte otro binding (`postMessage`
es el pedido correcto) o resignar el embebido para esa app. Queda escrito acá para que nadie invierta
tiempo buscando la forma de hacerlo: no existe.

### 2. `src/components/AppExternaSheet.tsx` — el contenedor

Pantalla completa propia. **No reusa `BottomSheet`**: ese primitivo topea en `85vh`, tiene padding
lateral y scroll interno, y los tres arruinan un iframe (viewport recortado, franjas blancas, doble
scroll). Sí reusa su patrón visual de header (título + botón de cierre) para que se sienta parte de
la app.

El montaje del iframe se resuelve con un `switch` exhaustivo sobre `handoff.tipo`. Hoy la única rama
es `'url'` (setea `src`); la rama `'form'` necesitaría además un `name` en el iframe y un form oculto
que se submitea contra ese `name`. Por eso el iframe **lleva `name` desde v1** aunque no se use: es el
gancho que hace aditiva esa variante.

Mecánica:

- `fixed inset-0`, alto en **`dvh`** — con `vh` la barra de URL de mobile tapa el fondo del iframe.
- `overflow: hidden` en el contenedor: el único scroll es el de la app externa.
- `border: 0` y ancho completo, para que la app externa reciba el ancho real del dispositivo como
  viewport y renderice su layout mobile. El `<meta viewport>` de pagos-lupa ya está correcto.
- Header con el nombre del cliente y la X. El vendedor tiene que saber de quién está viendo los pagos.
- Overlay de carga hasta el `onLoad` del iframe. El bundle de pagos-lupa pesa **888 KB**; en 4G son
  varios segundos de pantalla blanca y sin overlay parece colgado.
- `allow="clipboard-write"` — probable que se copien CBU/alias.
- **Sin atributo `sandbox`.** Decisión explícita, no omisión: el `localStorage` de la app externa
  exige `allow-same-origin`, y sumado a `allow-scripts` y `allow-forms` el sandbox no aporta defensa
  real contra una app propia mientras agrega una superficie de rotura silenciosa.

### 3. `src/hooks/useAppExterna.ts` — ciclo de vida de la instancia

Acá vive la eficiencia, y es lo que hace que se sienta "una sola app":

- El `handoff` se ejecuta **una vez por apertura** y su resultado se guarda en un `useRef`. Cualquier
  recálculo en render recarga los 888 KB. Esto vale para las tres variantes, no solo para `'url'`:
  re-submitear un form o re-emitir un `postMessage` en cada render sería igual de caro.
- El iframe se monta en un portal a nivel app, **keyed por `codigoParticularCliente`**, y se mantiene
  vivo mientras ese cliente sea el activo. Cerrar el sheet lo **oculta**, no lo desmonta → la segunda
  apertura es instantánea.
- Se desmonta al cambiar de cliente o al salir de la agenda. Mantener una app React entera en memoria
  por cliente en un Android de gama baja no es gratis.
- **Nunca** se navega cambiando el `src`: duplica entradas de historial y recarga todo.

### 4. `src/components/AccionesExternas.tsx` — los botones

Un componente, dos contextos de uso:

- **En `ClienteCard`**: como **chip entre las utilidades del header**, al lado del código del cliente,
  junto a Llamar y Reagendar. Ese es el patrón que la card ya tiene para acciones auxiliares al ciclo
  de la visita, elegido explícitamente para no sumar una cuarta caja de botones que haría la card
  innecesariamente alta en una columna de 7-8 clientes (`ClienteCard.tsx:22-25`). "Pagos" es
  exactamente una utilidad de ese tipo. **Sin menú `⋯` y sin sheet intermedio: un tap.**
- **En el sheet del cliente** (`VisitaSheet` / `PropuestaSheet`): como fila propia arriba de la
  propuesta, donde hay espacio y el vendedor mira el estado del cliente antes de ofrecer.

Que sea el mismo componente es lo que garantiza que la app número tres no requiera decisiones nuevas.

## Sin dependencias nuevas

Se evaluaron las librerías del rubro y ninguna aplica:

- `iframe-resizer` resuelve el problema opuesto (ajustar el alto del iframe al contenido, para embeds
  de escritorio). Acá el alto es fijo y full-bleed.
- `penpal` / `post-me` (RPC tipado sobre `postMessage`) solo valen con comunicación bidireccional real.
  El único mensaje previsto es "cambiá de cliente", y para eso alcanza `postMessage` directo.

## Pedidos a pagos-lupa

**v1 funciona hoy sin tocar la otra app.** Estos son mejoras, en orden de valor:

1. **`Content-Security-Policy: frame-ancestors https://<origin-de-app-planificacion>`** en su
   `firebase.json`. Hoy pagos-lupa es enmarcable por *ausencia* de header (no devuelve
   `X-Frame-Options` ni `frame-ancestors` — verificado con `curl -I`). Eso no es un contrato, es una
   config que nadie puso: un endurecimiento futuro nos rompe la pantalla sin que nadie ate la causa.
   Pedirlo explícito convierte el accidente en acuerdo.
2. **Modo `?embed=1`** que oculte navbar, sidebar y switch de tema. Es la diferencia entre "una app
   dentro de otra" y "una pantalla más".
3. **Listener de `postMessage`** para cambiar de cliente sin recargar. Chico de hacer, ahorra 888 KB
   en cada cambio de cliente.

## Riesgos

Ordenados por qué se verifica primero.

1. **¿El `access_token` de app-planificacion pasa el `decode-token` de pagos-lupa?**
   Esta app loguea en `apidistri.distrisuper.com/api/lupita/login`; pagos-lupa valida contra
   `distrimdp.dvrdns.org/api/authorization/decode-token`. Si no valida, pagos-lupa hace
   `localStorage.clear()` y muestra su pantalla de login dentro del iframe.
   **Todo el diseño depende de esto.** Se verifica con credenciales reales en un navegador, como
   primer paso del plan, antes de escribir una línea de UI.

2. **Race en la segunda apertura.** Hay un segundo `useEffect` en pagos-lupa que, si ya está
   autenticado, navega a `/` — y ese camino **descarta el `client`**. En la primera apertura no
   dispara (storage vacío); en la segunda podría. Se verifica empíricamente en el navegador: no se
   concluye razonando sobre código minificado. Si se confirma, el workaround es forzar el paso por
   `/auth/login` con token en cada apertura, y el fix correcto es el pedido nº 3.

3. **Storage particionado.** Chrome 115+ y Safari particionan `localStorage` por sitio top-level, así
   que el iframe no comparte sesión con pagos-lupa abierta aparte. A favor: la partición es estable y
   persistente, y pagos-lupa usa Bearer en `localStorage`, no cookies — que sí serían bloqueadas. Se
   espera que funcione; se confirma en el mismo spike que el riesgo 1.

4. **El token viaja en la query string y pagos-lupa carga Microsoft Clarity**
   (`clarity.ms/tag/stam0hwodw`, grabador de sesión). pagos-lupa limpia la URL después de procesar el
   token, pero Clarity captura antes. **Deuda técnica reconocida, no bloqueante.** El fix correcto es
   un token de handoff de un solo uso emitido por el backend; queda anotado y fuera de alcance.

## Testing

- **`appsExternas.ts`**: funciones puras. Test unitario del armado de URL y del escapado de params.
- **`useAppExterna`**: test de que el `handoff` se ejecuta **una sola vez** a lo largo de varios
  re-renders (el bug que más caro sale) y de que el desmontaje ocurre al cambiar de cliente. El test
  usa un `handoff` espía, no la entrada real de pagos-lupa: así sigue siendo válido cuando se sumen
  variantes.
- **`AppExternaSheet`**: el overlay de carga desaparece con `onLoad`; el header muestra el cliente
  correcto.
- **`AccionesExternas`**: renderiza una acción por app registrada, en los dos contextos de uso.
- El comportamiento del iframe en sí no se testea en jsdom. Es verificación manual en dispositivo
  real, Android y iOS.

## Duda cerrada: la ubicación en la card

La versión original de este spec proponía esconder las apps externas detrás de un `⋯`, asumiendo que
el vistazo a pagos era ocasional, y dejaba abierta la duda de si eso era un tap de más en el camino
caliente.

**Resuelto: van en el header, sin menú.** El rediseño de la card (`572f1f0`, `33a8ac8`) movió
Llamar/Reagendar al header como chips de 32px y dejó el área de acciones con dos botones de tier 1.
Ese patrón existente resuelve el problema que el `⋯` intentaba resolver — no sumar altura a la card —
sin costar un tap extra. No hay nada que decidir con uso real.

## Verificación empírica (2026-08-06)

Spike manual de la Task 1 del plan, con un `access_token` real de la app (usuario
`CAVALLARI LUCAS`, `rol: VENDEDOR`, `codigoparticular: 07537`) y un cliente real de su agenda
(`codigoParticularCliente: 05519`), sobre el deploy `https://pagos-lupa.web.app`.

### Riesgo 1 (token cross-host) — **FALLA. Bloqueante.**

`POST https://distrimdp.dvrdns.org/api/authorization/decode-token` responde **HTTP 200 con
`ok: 0`**:

```json
{"ok":0,"error":[{"name":"JsonWebTokenError","message":"invalid signature",
  "stack":"... at Object.decodeClientToken (api-distri-node/services/authService.js:44:9)"}]}
```

Reproducido 3 veces, incluso con el `localStorage` del origen de pagos-lupa borrado por completo.
La causa es exactamente la que anticipaba el riesgo: nuestro token lo **emite** Laravel en
`apidistri.distrisuper.com` (`iss: http://localhost/api/lupita/login`) y lo **verifica**
api-distri-node en `distrimdp.dvrdns.org` con **otro secreto JWT**. La firma no valida.

La consecuencia en la UI es la que temía el spec, y está en el código de pagos-lupa
(`src/pages/Authentication/LoginBoxed.tsx:126-131`):

```ts
if (res.ok === 0) {
    console.log('❌ lupaToken validation failed')
    localStorage.clear()
    sessionStorage.clear()
    navigate('/auth/login')
}
```

Es decir: **dentro del iframe el vendedor ve el formulario de login de pagos-lupa.** Verificado.

Dato tranquilizador: el handoff **no invalida** nuestro token. Después del intento fallido,
`GET /api/auth/me` y `GET /planificacion/ciclo/actual` siguen respondiendo 200 con el mismo
`access_token`. El fallo es de verificación, no de revocación.

### Riesgo 2 (`client` en la reapertura) — **FALLA, por una razón distinta a la prevista**

No hace falta llegar a la reapertura: el `client` **se pierde ya en la primera apertura**. En
`LoginBoxed.tsx` hay dos `useEffect` que compiten:

- el de la línea 92 es el que preserva el contexto (`params.set('client', client)` →
  `navigate('/?client=...')`), pero depende de `[lupaToken]`, que en el primer render vale `null`
  porque se lee en la línea 21 **antes** de que el efecto de la línea 81 lo escriba;
- el de la línea 141 depende de `[isAuthenticated]` y hace `navigate('/')` **pelado**. Solo
  preserva `type_operation`, nunca `client`.

Observado: la primera apertura terminó en `https://pagos-lupa.web.app/` con el selector de cliente
vacío ("Por favor, ingrese el código del cliente…"). Como el plan decidió **omitir**
`type_operation`, se cae siempre en la rama `navigate('/')` de la línea 148 — omitirlo no evita una
rama de redirect, garantiza la peor.

### Riesgo 3 (storage particionado en iframe) — **NO SE PUDO EVALUAR**

Bloqueado por el riesgo 1: sin token válido no hay sesión que observar dentro del iframe. Queda
pendiente para cuando el riesgo 1 esté resuelto.

### Nota sobre el repo de pagos-lupa

`C:\Users\matia\OneDrive\Documentos\distri\Pagos-Lupa`. El working copy tiene ediciones que **no
compilan** y por lo tanto no son lo desplegado: `LoginBoxed.tsx:71` (`\ ELIMINADO`),
`LoginBoxed.tsx:124` (`` navigate(`\?${query}`) ``, backslash literal en la query) y
`api_auth.ts:34` (`` `${...}\api\auth\login` ``). Cualquier arreglo del handoff arranca por
sincronizar ese repo con lo que está en producción.

### Consecuencia para el plan

El handoff por URL contra el deploy actual **no funciona**, y el arreglo no está del lado de esta
app: hay que tocar pagos-lupa y/o el backend. Las tareas 2 a 8 quedan detenidas.

## Segunda vuelta del spike: sí comparten el login (2026-08-06)

La primera vuelta concluyó "bloqueante" mirando solo la ruta `lupaToken` → `decode-token`. Al leer el
repo de pagos-lupa apareció que **hay dos rutas de auth**, y la segunda sí sirve.

### Hallazgo: `VITE_API_DISTRI_API` es nuestro propio emisor

Extraído del bundle desplegado (`/assets/index-ca5c7acd.js`), pagos-lupa habla con **dos** backends:

| Ruta de auth | Endpoint | Verifica con |
| --- | --- | --- |
| `lupaToken` (la del `?token=` en la URL) | `POST distrimdp.dvrdns.org/api/authorization/decode-token` | secreto de api-distri-node → **rechaza nuestro token** |
| `access_token` | `GET apidistri.distrisuper.com/api/auth/me` | **el mismo emisor que nuestra app** |

`AuthContext.tsx:50-98` elige la ruta según qué clave haya en `localStorage`: si hay `lupaToken` usa
`decode-token`; si no, y hay `access_token`, usa `/auth/me`. Y `loginUser` (`api_auth.ts:33`) postea a
`apidistri.distrisuper.com/api/auth/login` — las mismas credenciales que nuestro login.

**Conclusión: el token de esta app es válido para pagos-lupa. El bug es que el handoff por URL lo
guarda en la clave equivocada.**

### Verificado empíricamente

Con el `localStorage` del origen de pagos-lupa borrado, poniendo **solo** nuestro `access_token` sin
modificar y navegando a `https://pagos-lupa.web.app/?client=05519` (sin `/auth/login`, sin `?token=`):

- Sesión válida, sin formulario de login.
- Input "Ingrese código cliente" precargado con `05519`.
- Las facturas pendientes de ese cliente cargadas (FA-9242, FA-9264, FA-9542, …).

El lector del param existe y funciona: `ListPendings.tsx:519-526` — con `user.rol === 'VENDEDOR'` y
`?client=` presente, setea `clientCodeInput` y `cpCliente`. **El contrato de contexto es `/?client=`,
no `/auth/login?...&client=`.**

### Riesgo: `frame-ancestors` — **NO ES UN PROBLEMA**

pagos-lupa **se deja embeber**. Iframe inyectado desde `http://localhost:5173` cargando
`https://pagos-lupa.web.app/?client=05519`: `onload` dispara, la UI renderiza completa, cero errores
de CSP o `X-Frame-Options` en consola. El "pedido a pagos-lupa" de `frame-ancestors` que anotaba este
spec **no hace falta**.

### Riesgo 3 (storage particionado) — **CONFIRMADO**

Dentro del iframe aparece el login de pagos-lupa, **aunque el origen top-level tenga sesión válida**.
Chrome particiona el storage por par (sitio top-level, origen embebido): la partición
`(localhost, pagos-lupa)` es otra, y arranca vacía. Esto es lo que decide entre los dos caminos de
abajo.

## Los dos caminos viables

### Camino A — cero cambios en pagos-lupa: login manual una vez dentro del iframe

El vendedor se loguea **una sola vez** dentro del iframe (login propio de pagos-lupa, mismas
credenciales, mismo backend). Eso escribe `access_token` en la partición
`(nuestra-app, pagos-lupa)`, y de ahí en más el handoff es solo `/?client=<codigo>`. Todo lo que
hace falta está verificado: el framing anda, `/auth/me` acepta el token, `?client=` se lee.

Costo: la primera vez el vendedor tipea usuario y contraseña dentro del iframe. Y **cuánto dura esa
sesión no está verificado**: el storage particionado persiste en Chrome, pero la ITP de Safari/iOS
capa el storage escrito por script (histórico: 7 días), así que en iOS "una vez" puede volverse
"cada tanto". Requiere probarlo con credenciales reales en un iPhone antes de prometerlo.

### Camino B — dos ediciones chicas en pagos-lupa, y el handoff queda invisible

En `src/pages/Authentication/LoginBoxed.tsx`:

1. Línea 86: guardar el token de la URL en **`access_token`** en vez de `lupaToken` — o intentar
   `decode-token` y, si devuelve `ok: 0`, caer a la ruta `/auth/me`. Con eso el token de esta app
   valida por el camino que ya existe.
2. Línea 148: preservar `client` en ese `navigate('/')`, que hoy lo descarta (hoy solo preserva
   `type_operation`).

Ventajas sobre A: no hay login manual, y el storage particionado **deja de importar** porque el token
llega en la URL en cada apertura. El estado final de este camino es exactamente el que se verificó
arriba, así que no hay incógnita técnica: solo hace falta que alguien toque ese repo.

Recomendación: **B**, con A como puente si B tarda en coordinarse. Los dos comparten el mismo diseño
del lado de esta app — cambia una línea del registro (`/?client=` vs `/auth/login?token=&client=`),
que es justamente lo que `appsExternas.ts` aísla.
