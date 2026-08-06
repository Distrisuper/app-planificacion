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

```ts
/** De dónde sale el token que se le pasa a la app externa.
 *  'sesion' = el access_token de app-planificacion. Es el caso normal: las apps
 *  propias comparten el login. No es universal, por eso es un campo y no un supuesto. */
export type EstrategiaToken = 'sesion' | 'ninguno'

export interface AppExternaContext {
    cliente: IVisitClientCard
    /** null si la estrategia es 'ninguno'. */
    token: string | null
}

export interface AppExterna {
    id: string
    label: string
    icon: LucideIcon
    token: EstrategiaToken
    /** Se invoca UNA vez por apertura. Nunca en render. */
    buildUrl: (ctx: AppExternaContext) => string
}
```

Entrada de pagos-lupa:

```ts
{
    id: 'pagos',
    label: 'Pagos',
    icon: Wallet,
    token: 'sesion',
    buildUrl: ({ cliente, token }) => {
        const params = new URLSearchParams({
            token: token ?? '',
            client: cliente.codigoParticularCliente,
        })
        return `${PAGOS_LUPA_URL}/auth/login?${params}`
    },
}
```

`EstrategiaToken` existe porque las apps propias **normalmente** comparten el token (mismo login),
pero no siempre. Modelarlo como campo desde el día uno evita que la primera app que no lo comparta
obligue a rediseñar el registro. Arranca con dos valores; cuando aparezca un caso real de token
propio se suma una variante (`{ tipo: 'propio', obtener: () => Promise<string> }`) sin romper a las
demás.

Una app sin token declarado no se puede registrar: el tipo lo exige.

### 2. `src/components/AppExternaSheet.tsx` — el contenedor

Pantalla completa propia. **No reusa `BottomSheet`**: ese primitivo topea en `85vh`, tiene padding
lateral y scroll interno, y los tres arruinan un iframe (viewport recortado, franjas blancas, doble
scroll). Sí reusa su patrón visual de header (título + botón de cierre) para que se sienta parte de
la app.

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

- El `src` se calcula **una vez por apertura** y se guarda en un `useRef`. Cualquier recálculo en
  render recarga los 888 KB.
- El iframe se monta en un portal a nivel app, **keyed por `codigoParticularCliente`**, y se mantiene
  vivo mientras ese cliente sea el activo. Cerrar el sheet lo **oculta**, no lo desmonta → la segunda
  apertura es instantánea.
- Se desmonta al cambiar de cliente o al salir de la agenda. Mantener una app React entera en memoria
  por cliente en un Android de gama baja no es gratis.
- **Nunca** se navega cambiando el `src`: duplica entradas de historial y recarga todo.

### 4. `src/components/AccionesExternas.tsx` — los botones

Un componente, dos contextos de uso:

- **En `ClienteCard`**: detrás de un cuarto botón `⋯`, que abre un sheet chico con la lista de apps.
  La fila de acciones de la card ya está llena (Propuesta + Llamar + Estado) y en mobile no entra un
  cuarto botón con label.
- **En el sheet del cliente** (`VisitaSheet` / propuesta): como fila propia, donde hay espacio.

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
- **`useAppExterna`**: test de que el `src` se calcula **una sola vez** a lo largo de varios
  re-renders (el bug que más caro sale) y de que el desmontaje ocurre al cambiar de cliente.
- **`AppExternaSheet`**: el overlay de carga desaparece con `onLoad`; el header muestra el cliente
  correcto.
- **`AccionesExternas`**: renderiza una acción por app registrada, en los dos contextos de uso.
- El comportamiento del iframe en sí no se testea en jsdom. Es verificación manual en dispositivo
  real, Android y iOS.

## Duda abierta

La ubicación en `ClienteCard` detrás de `⋯` asume que el vistazo a pagos es ocasional. Si en la
práctica el vendedor lo hace en casi toda visita, ese `⋯` es un tap de más en el camino caliente y
conviene rediseñar la fila de acciones de la card en serio. Se decide con uso real, no ahora.
