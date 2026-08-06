# Apps externas con contexto de cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor abra, desde la card de un cliente y con un tap, la app propia
**pagos-lupa** embebida en pantalla completa, ya autenticada y ya filtrada por ese cliente — con un
registro reusable para que las próximas apps externas sean una entrada en un array.

**Architecture:** Cuatro piezas desacopladas. `appsExternas.ts` es el registro y única fuente de
verdad (qué apps hay, de dónde sale la credencial, cómo se entrega el contexto). `useAppExterna`
maneja el ciclo de vida de la instancia embebida: ejecuta el handoff **una sola vez** por
app+cliente y separa "oculta" de "desmontada", para que reabrir no recargue los 888 KB del bundle
ajeno. `AppExternaSheet` es el contenedor full-screen con el iframe. `AccionesExternas` son los
botones, renderizados en dos contextos (menú `⋯` de la card y fila dentro del sheet del cliente).

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind, Vitest + @testing-library/react.
**Cero dependencias nuevas** (ver Global Constraints).

**Spec:** `docs/superpowers/specs/2026-08-06-apps-externas-contexto-cliente-design.md`

## Global Constraints

- **Cero dependencias nuevas.** `iframe-resizer` resuelve el problema opuesto (alto según contenido);
  `penpal`/`post-me` solo valen con RPC bidireccional real. No se instala nada.
- **Contrato de handoff de pagos-lupa, verbatim (camino A, verificado en la Task 1):**
  `{VITE_PAGOS_LUPA_URL}/?client=<codigoParticularCliente>`
  **Sin token en la URL.** La sesión de pagos-lupa la crea el vendedor logueándose **una vez**
  dentro del iframe; el token de esta app no puede escribirse en el `localStorage` de otro origen.
  El lector del param es `ListPendings.tsx:519-526` del repo de pagos-lupa. **No** se usa
  `/auth/login?token=`: esa ruta guarda el token en `lupaToken` y lo valida contra `decode-token`
  de api-distri-node, que lo rechaza con `invalid signature` (ver "Verificación empírica" del spec).
- **El token NO viaja en la query string.** Además de que el camino A no lo necesita, pagos-lupa
  carga Microsoft Clarity (grabador de sesión): mandarlo ahí lo grabaría. Esto cierra el riesgo 4
  del spec.
- **`type_operation` se omite.** Acepta `PPAL` o `DS`, nadie confirmó qué significan.
- **La URL base va en `VITE_PAGOS_LUPA_URL`**, nunca hardcodeada: hay al menos tres deploys vivos.
- **`EstrategiaToken` y `resolverToken` se implementan igual**, aunque la app `pagos` declare
  `'ninguno'`. Son el seam que mantiene vivo el camino B (que pagos-lupa lea el token de la URL) y
  las apps futuras: de dónde sale la credencial es un campo declarado por app, no un supuesto del
  código. `resolverToken` lee `localStorage.getItem('access_token')`, la misma fuente que el
  interceptor de `src/api/apiClient.ts`. `AuthContext` **no** expone el token y **no se modifica**.
- **Alto en `dvh`, nunca `vh`.** Con `vh` la barra de URL de mobile tapa el fondo del iframe.
- **El iframe no lleva atributo `sandbox`.** Decisión explícita del spec: el `localStorage` de la app
  ajena exige `allow-same-origin`, y con eso más `allow-scripts` el sandbox no aporta defensa real
  contra una app propia mientras agrega rotura silenciosa.
- **El iframe lleva `name` desde v1** aunque no se use: es el gancho que hace aditiva la variante de
  handoff `'form'` (POST a un iframe por su `name`).
- **Estilo del repo:** indentación de 4 espacios, sin punto y coma, comillas simples, alias `@/`,
  comentarios en español y solo cuando explican un *por qué* no obvio. Vitest con globals
  (`describe`/`it` sin import; `vi` se importa).
- **Comandos:** `npm test` (una corrida), `npx vitest run <path>` (un archivo), `npm run lint`,
  `npm run build`.

---

### Task 1: Verificar el handoff contra pagos-lupa real

Sin esto no se escribe UI. Todo el diseño depende de que el `access_token` de esta app pase el
`decode-token` de pagos-lupa, que corre en **otro host** (`distrimdp.dvrdns.org`) que el emisor
(`apidistri.distrisuper.com`). Si no pasa, pagos-lupa hace `localStorage.clear()` y muestra su propio
login dentro del iframe — y el enfoque cambia.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-06-apps-externas-contexto-cliente-design.md` (agregar sección "Verificación empírica")

**Interfaces:**
- Consumes: nada.
- Produces: la confirmación (o refutación) de la que dependen todas las tareas siguientes. Si el
  riesgo 1 se confirma como bloqueante, **detener el plan y volver a brainstorming.**

- [ ] **Step 1: Obtener un `access_token` real**

Loguearse en la app (`npm run dev`, pantalla de login con credenciales de un usuario con
`rol: vendedor`) y copiar el token:

```js
// En la consola del navegador, sobre la app corriendo
localStorage.getItem('access_token')
```

- [ ] **Step 2: Probar el handoff a mano, en una pestaña normal**

Abrir en el navegador, reemplazando `<TOKEN>` y usando un `codigoParticularCliente` real de la agenda:

```
https://pagos-lupa.web.app/auth/login?token=<TOKEN>&client=<CODIGO_PARTICULAR>
```

Con la consola abierta. Resultado esperado (los logs son de pagos-lupa, están en su bundle):
- `🔗 Processing lupaToken from URL:` seguido de `✅ lupaToken validation succ...`
- Redirect a `/?client=<CODIGO_PARTICULAR>`
- La pantalla muestra los datos **de ese cliente**, no un selector vacío

Si aparece `❌ lupaToken validation failed` o `error`, el riesgo 1 del spec está confirmado: **parar
acá.**

- [ ] **Step 3: Probar la reapertura (riesgo 2 del spec)**

Sin limpiar el storage, volver a abrir **la misma URL** pero con **otro** `client=`. Verificar que
la pantalla muestre el segundo cliente y no vuelva a `/` pelado. Esto ejercita el segundo `useEffect`
de pagos-lupa que, ya autenticado, navega a `/` descartando el `client`.

- [ ] **Step 4: Probar dentro de un iframe (riesgo 3 del spec: storage particionado)**

Crear `/tmp/iframe-test.html` y abrirlo con `file://` o servirlo con `npx serve`:

```html
<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<iframe
    src="https://pagos-lupa.web.app/auth/login?token=<TOKEN>&client=<CODIGO_PARTICULAR>"
    style="position:fixed;inset:0;width:100%;height:100dvh;border:0"
></iframe>
```

Verificar en el inspector del iframe que `localStorage` tenga `lupaToken` y `user`, y que la pantalla
del cliente cargue. Si el storage aparece vacío o bloqueado, el riesgo 3 está confirmado.

- [ ] **Step 5: Documentar el resultado en el spec y commitear**

Agregar al final del spec una sección con lo observado, sea bueno o malo:

```markdown
## Verificación empírica (2026-08-06)

- Riesgo 1 (token cross-host): [PASA | FALLA] — <log observado>
- Riesgo 2 (client en reapertura): [PASA | FALLA] — <qué pasó al cambiar de client>
- Riesgo 3 (storage en iframe): [PASA | FALLA] — <claves presentes en localStorage>
```

```bash
git add docs/superpowers/specs/2026-08-06-apps-externas-contexto-cliente-design.md
git commit -m "docs(apps-externas): verificación empírica del handoff con pagos-lupa"
```

---

### Task 2: El registro de apps externas

**Files:**
- Create: `src/lib/appsExternas.ts`
- Create: `src/lib/appsExternas.test.ts`
- Modify: `.env` (agregar `VITE_PAGOS_LUPA_URL`)
- Modify: `.env-example` (agregar `VITE_PAGOS_LUPA_URL` documentada, sin valor)

**Interfaces:**
- Consumes: `IVisitClientCard` de `@/types/planificacion`.
- Produces:
  - `type EstrategiaToken = 'sesion' | 'ninguno'`
  - `interface AppExternaContext { cliente: IVisitClientCard; token: string | null }`
  - `type Handoff = { tipo: 'url'; url: (ctx: AppExternaContext) => string }`
  - `interface AppExterna { id: string; label: string; icon: LucideIcon; token: EstrategiaToken; handoff: Handoff }`
  - `type HandoffResuelto = { tipo: 'url'; url: string }`
  - `const APPS_EXTERNAS: AppExterna[]`
  - `function resolverToken(app: AppExterna): string | null`
  - `function resolverHandoff(app: AppExterna, cliente: IVisitClientCard): HandoffResuelto`

- [ ] **Step 1: Agregar la variable de entorno**

En `.env-example`, al final:

```
# Base URL de pagos-lupa (app propia que se embebe con contexto de cliente).
# Hay varios deploys vivos: web.app, Vercel, previews de PR — por eso es configurable.
VITE_PAGOS_LUPA_URL=https://pagos-lupa.web.app
```

En `.env`, la misma línea con el valor `https://pagos-lupa.web.app`.

- [ ] **Step 2: Escribir el test que falla**

Crear `src/lib/appsExternas.test.ts`:

```ts
import {
    APPS_EXTERNAS,
    resolverHandoff,
    resolverToken,
    type AppExterna,
} from './appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

const CLIENTE: IVisitClientCard = {
    codigoCliente: '900123',
    codigoParticularCliente: '05519',
    nombreCliente: 'AMATUCCI CARLOS',
}

function appDePagos(): AppExterna {
    const app = APPS_EXTERNAS.find(a => a.id === 'pagos')
    if (!app) throw new Error('la app "pagos" tiene que estar registrada')
    return app
}

describe('appsExternas', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('registra pagos-lupa sin credencial en el handoff', () => {
        const app = appDePagos()
        expect(app.label).toBe('Pagos')
        // Camino A: la sesión la crea el vendedor una vez dentro del iframe. No se puede
        // escribir en el localStorage de otro origen.
        expect(app.token).toBe('ninguno')
        expect(app.handoff.tipo).toBe('url')
    })

    it('arma la URL de handoff con el client en la raíz', () => {
        const resuelto = resolverHandoff(appDePagos(), CLIENTE)
        expect(resuelto.tipo).toBe('url')
        const url = new URL(resuelto.url)
        expect(url.pathname).toBe('/')
        expect(url.searchParams.get('client')).toBe('05519')
    })

    // pagos-lupa carga Microsoft Clarity (grabador de sesión): un token en la query string
    // quedaría grabado. El camino A no lo necesita, y así se cierra el riesgo 4 del spec.
    it('no filtra el token en la URL', () => {
        localStorage.setItem('access_token', 'tok-123')
        const { url } = resolverHandoff(appDePagos(), CLIENTE)
        expect(url).not.toContain('tok-123')
        expect(new URL(url).searchParams.has('token')).toBe(false)
    })

    // type_operation se omite a propósito (ver Global Constraints del plan).
    it('no manda type_operation', () => {
        const { url } = resolverHandoff(appDePagos(), CLIENTE)
        expect(new URL(url).searchParams.has('type_operation')).toBe(false)
    })

    // El seam que mantiene vivo el camino B y las apps futuras: de dónde sale la credencial
    // es un campo declarado por app, no un supuesto del código.
    it("resolverToken lee el access_token cuando la app declara 'sesion'", () => {
        localStorage.setItem('access_token', 'tok-123')
        const app: AppExterna = { ...appDePagos(), token: 'sesion' }
        expect(resolverToken(app)).toBe('tok-123')
    })

    it("resolverToken devuelve null cuando la app declara 'ninguno'", () => {
        localStorage.setItem('access_token', 'tok-123')
        expect(resolverToken(appDePagos())).toBeNull()
    })

    // El código sale de la API. Si alguna vez trajera un caracter reservado, concatenar a
    // mano rompería el param.
    it('escapa el código de cliente en vez de concatenarlo crudo', () => {
        const raro: IVisitClientCard = { ...CLIENTE, codigoParticularCliente: 'a&b=c' }
        const { url } = resolverHandoff(appDePagos(), raro)
        expect(new URL(url).searchParams.get('client')).toBe('a&b=c')
    })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/appsExternas.test.ts`
Expected: FAIL — no existe el módulo `./appsExternas`.

- [ ] **Step 4: Implementar el registro**

Crear `src/lib/appsExternas.ts`:

```ts
import { Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { IVisitClientCard } from '@/types/planificacion'

const PAGOS_LUPA_URL: string = import.meta.env.VITE_PAGOS_LUPA_URL || ''

/** De dónde sale la credencial que se le pasa a la app externa. 'sesion' = el
 *  access_token de esta app. Es el caso normal (las apps propias comparten el login),
 *  pero no es universal: por eso es un campo declarado y no un supuesto del código. */
export type EstrategiaToken = 'sesion' | 'ninguno'

export interface AppExternaContext {
    cliente: IVisitClientCard
    /** null si la app declara token: 'ninguno'. */
    token: string | null
}

/** CÓMO se le entrega el contexto. Union discriminada a propósito: resolverHandoff hace
 *  un switch exhaustivo, así que sumar una variante ('form' por POST al name del iframe,
 *  'postMessage' post-carga) es aditivo y el compilador marca dónde. Un header HTTP custom
 *  NO es una variante posible: no existe API para setear headers en una navegación de
 *  documento. Ver el spec. */
export type Handoff = {
    tipo: 'url'
    url: (ctx: AppExternaContext) => string
}

export interface AppExterna {
    id: string
    label: string
    icon: LucideIcon
    token: EstrategiaToken
    handoff: Handoff
}

export type HandoffResuelto = { tipo: 'url'; url: string }

export const APPS_EXTERNAS: AppExterna[] = [
    {
        id: 'pagos',
        label: 'Pagos',
        icon: Wallet,
        // Camino A: no se manda credencial. El vendedor se loguea una vez dentro del iframe y
        // pagos-lupa se queda con su propia sesión en el storage particionado de ese par
        // (nuestra app, pagos-lupa). Ver "Verificación empírica" del spec.
        token: 'ninguno',
        handoff: {
            tipo: 'url',
            // Contrato verificado contra el deploy: ListPendings lee `client` de la query y,
            // si el rol es VENDEDOR, carga ese cliente. NO se usa /auth/login?token=, que
            // valida contra decode-token y rechaza nuestro token. type_operation se omite.
            url: ({ cliente }) => {
                const params = new URLSearchParams({
                    client: cliente.codigoParticularCliente,
                })
                return `${PAGOS_LUPA_URL}/?${params}`
            },
        },
    },
]

/** Misma fuente de verdad que el interceptor de apiClient. AuthContext no expone el token. */
export function resolverToken(app: AppExterna): string | null {
    return app.token === 'sesion' ? localStorage.getItem('access_token') : null
}

/** Se invoca UNA vez por apertura (ver useAppExterna): re-ejecutarlo en cada render
 *  recargaría el bundle de la app ajena. */
export function resolverHandoff(app: AppExterna, cliente: IVisitClientCard): HandoffResuelto {
    const ctx: AppExternaContext = { cliente, token: resolverToken(app) }
    switch (app.handoff.tipo) {
        case 'url':
            return { tipo: 'url', url: app.handoff.url(ctx) }
        default: {
            // Al sumar una variante a Handoff, esta asignación deja de compilar y marca
            // exactamente el lugar donde falta la rama.
            const noManejado: never = app.handoff
            throw new Error(`Handoff no soportado: ${JSON.stringify(noManejado)}`)
        }
    }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/appsExternas.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/appsExternas.ts src/lib/appsExternas.test.ts .env-example
git commit -m "feat(apps-externas): registro de apps externas con handoff tipado"
```

Nota: `.env` está ignorado por git (verificar con `git check-ignore .env`); si no lo estuviera, **no**
commitearlo.

---

### Task 3: `useAppExterna` — ciclo de vida de la instancia

**Files:**
- Create: `src/hooks/useAppExterna.ts`
- Create: `src/hooks/useAppExterna.test.tsx`

**Interfaces:**
- Consumes: `AppExterna`, `HandoffResuelto`, `resolverHandoff` de `@/lib/appsExternas`;
  `IVisitClientCard` de `@/types/planificacion`.
- Produces:
  - `interface AppExternaMontada { app: AppExterna; cliente: IVisitClientCard; handoff: HandoffResuelto }`
  - `function useAppExterna(): { montada: AppExternaMontada | null; visible: boolean; abrir: (app: AppExterna, cliente: IVisitClientCard) => void; ocultar: () => void; desmontar: () => void }`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/hooks/useAppExterna.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Wallet } from 'lucide-react'
import { vi } from 'vitest'
import { useAppExterna } from './useAppExterna'
import type { AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

function cliente(codigo: string): IVisitClientCard {
    return {
        codigoCliente: `9${codigo}`,
        codigoParticularCliente: codigo,
        nombreCliente: `CLIENTE ${codigo}`,
    }
}

/** App de prueba con el builder espiado: así se cuenta cuántas veces se ejecuta el handoff. */
function appEspia(url = vi.fn(() => 'https://ext.test/x')): AppExterna {
    return { id: 'espia', label: 'Espía', icon: Wallet, token: 'ninguno', handoff: { tipo: 'url', url } }
}

function Probe({ app }: { app: AppExterna }) {
    const { montada, visible, abrir, ocultar, desmontar } = useAppExterna()
    return (
        <div>
            <div data-testid="montada">{montada ? montada.cliente.codigoParticularCliente : ''}</div>
            <div data-testid="url">{montada?.handoff.url ?? ''}</div>
            <div data-testid="visible">{String(visible)}</div>
            <button onClick={() => abrir(app, cliente('111'))}>abrir-111</button>
            <button onClick={() => abrir(app, cliente('222'))}>abrir-222</button>
            <button onClick={ocultar}>ocultar</button>
            <button onClick={desmontar}>desmontar</button>
        </div>
    )
}

describe('useAppExterna', () => {
    it('ejecuta el handoff al abrir y expone la url resuelta', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia(url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        expect(screen.getByTestId('montada')).toHaveTextContent('111')
        expect(screen.getByTestId('url')).toHaveTextContent('https://ext.test/x')
        expect(screen.getByTestId('visible')).toHaveTextContent('true')
        expect(url).toHaveBeenCalledTimes(1)
    })

    // El bug que más caro sale: recalcular el handoff recarga el bundle de la app ajena
    // (888 KB en el caso de pagos-lupa) en cada render.
    it('NO vuelve a ejecutar el handoff al reabrir la misma app y el mismo cliente', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia(url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('ocultar'))
        await userEvent.click(screen.getByText('abrir-111'))
        expect(url).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('visible')).toHaveTextContent('true')
    })

    it('vuelve a ejecutar el handoff al abrir con otro cliente', async () => {
        const url = vi.fn(() => 'https://ext.test/x')
        render(<Probe app={appEspia(url)} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('abrir-222'))
        expect(url).toHaveBeenCalledTimes(2)
        expect(screen.getByTestId('montada')).toHaveTextContent('222')
    })

    // Ocultar ≠ desmontar: mantener la instancia viva es lo que hace instantánea la reapertura.
    it('ocultar deja la instancia montada', async () => {
        render(<Probe app={appEspia()} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('ocultar'))
        expect(screen.getByTestId('visible')).toHaveTextContent('false')
        expect(screen.getByTestId('montada')).toHaveTextContent('111')
    })

    it('desmontar suelta la instancia', async () => {
        render(<Probe app={appEspia()} />)
        await userEvent.click(screen.getByText('abrir-111'))
        await userEvent.click(screen.getByText('desmontar'))
        expect(screen.getByTestId('visible')).toHaveTextContent('false')
        expect(screen.getByTestId('montada')).toHaveTextContent('')
    })

    it('no rompe si se oculta sin haber abierto nada', () => {
        render(<Probe app={appEspia()} />)
        act(() => {
            screen.getByText('ocultar').click()
        })
        expect(screen.getByTestId('montada')).toHaveTextContent('')
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/hooks/useAppExterna.test.tsx`
Expected: FAIL — no existe el módulo `./useAppExterna`.

- [ ] **Step 3: Implementar el hook**

Crear `src/hooks/useAppExterna.ts`:

```ts
import { useCallback, useState } from 'react'
import { resolverHandoff, type AppExterna, type HandoffResuelto } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

export interface AppExternaMontada {
    app: AppExterna
    cliente: IVisitClientCard
    handoff: HandoffResuelto
}

/**
 * Ciclo de vida de la app externa embebida.
 *
 * Separa `montada` de `visible` a propósito: cerrar la pantalla OCULTA el iframe pero no lo
 * desmonta, así la próxima apertura del mismo cliente es instantánea en vez de recargar el
 * bundle entero de la app ajena. `desmontar` es lo que suelta la memoria — mantener una app
 * React ajena viva por cliente no es gratis en un Android de gama baja.
 */
export function useAppExterna() {
    const [montada, setMontada] = useState<AppExternaMontada | null>(null)
    const [visible, setVisible] = useState(false)

    const abrir = useCallback((app: AppExterna, cliente: IVisitClientCard) => {
        setMontada(previa =>
            previa &&
            previa.app.id === app.id &&
            previa.cliente.codigoParticularCliente === cliente.codigoParticularCliente
                ? previa // misma app + mismo cliente: se reusa la instancia viva
                : { app, cliente, handoff: resolverHandoff(app, cliente) },
        )
        setVisible(true)
    }, [])

    const ocultar = useCallback(() => setVisible(false), [])

    const desmontar = useCallback(() => {
        setVisible(false)
        setMontada(null)
    }, [])

    return { montada, visible, abrir, ocultar, desmontar }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/hooks/useAppExterna.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAppExterna.ts src/hooks/useAppExterna.test.tsx
git commit -m "feat(apps-externas): hook de ciclo de vida de la instancia embebida"
```

---

### Task 4: `AppExternaSheet` — el contenedor full-screen

**Files:**
- Create: `src/components/AppExternaSheet.tsx`
- Create: `src/components/AppExternaSheet.test.tsx`

**Interfaces:**
- Consumes: `AppExternaMontada` de `@/hooks/useAppExterna`.
- Produces: `default function AppExternaSheet(props: { montada: AppExternaMontada; visible: boolean; onClose: () => void })`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/AppExternaSheet.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Wallet } from 'lucide-react'
import { vi } from 'vitest'
import AppExternaSheet from './AppExternaSheet'
import type { AppExternaMontada } from '@/hooks/useAppExterna'

const MONTADA: AppExternaMontada = {
    app: {
        id: 'pagos',
        label: 'Pagos',
        icon: Wallet,
        token: 'sesion',
        handoff: { tipo: 'url', url: () => 'https://ext.test/x' },
    },
    cliente: {
        codigoCliente: '900123',
        codigoParticularCliente: '12345',
        nombreCliente: 'KIOSCO RUBEN SRL',
        nombreFantasia: 'Kiosco Rubén',
    },
    handoff: { tipo: 'url', url: 'https://ext.test/auth/login?token=t&client=12345' },
}

function renderSheet(over: Partial<Parameters<typeof AppExternaSheet>[0]> = {}) {
    const onClose = vi.fn()
    render(<AppExternaSheet montada={MONTADA} visible onClose={onClose} {...over} />)
    return { onClose }
}

describe('AppExternaSheet', () => {
    it('embebe la app externa en la url resuelta', () => {
        renderSheet()
        const iframe = screen.getByTitle('Pagos')
        expect(iframe).toHaveAttribute('src', 'https://ext.test/auth/login?token=t&client=12345')
    })

    // El vendedor tiene que saber de quién está viendo los pagos.
    it('muestra el nombre del cliente y la app en el header', () => {
        renderSheet()
        expect(screen.getByText('Kiosco Rubén')).toBeInTheDocument()
        expect(screen.getByText('Pagos')).toBeInTheDocument()
    })

    // Gancho para la variante de handoff 'form' (POST al iframe por su name). Va desde v1
    // porque agregarlo después obliga a tocar el contenedor.
    it('le pone name al iframe', () => {
        renderSheet()
        expect(screen.getByTitle('Pagos')).toHaveAttribute('name', 'app-externa-pagos')
    })

    // El bundle de pagos-lupa pesa 888 KB: sin overlay parece que se colgó.
    it('muestra el overlay de carga hasta el onLoad del iframe', () => {
        renderSheet()
        expect(screen.getByTestId('app-externa-cargando')).toBeInTheDocument()
        fireEvent.load(screen.getByTitle('Pagos'))
        expect(screen.queryByTestId('app-externa-cargando')).not.toBeInTheDocument()
    })

    it('cierra con el botón de cerrar', async () => {
        const { onClose } = renderSheet()
        await userEvent.click(screen.getByLabelText('Cerrar'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // Oculto pero montado: es lo que hace instantánea la reapertura. El iframe tiene que
    // seguir en el DOM y no puede interceptar taps de la agenda que está debajo.
    it('cuando no es visible sigue montado, invisible y sin capturar taps', () => {
        renderSheet({ visible: false })
        expect(screen.getByTitle('Pagos')).toBeInTheDocument()
        const contenedor = screen.getByTestId('app-externa-contenedor')
        expect(contenedor.className).toContain('invisible')
        expect(contenedor.className).toContain('pointer-events-none')
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/AppExternaSheet.test.tsx`
Expected: FAIL — no existe el módulo `./AppExternaSheet`.

- [ ] **Step 3: Implementar el contenedor**

Crear `src/components/AppExternaSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { titleCaseNombre } from '@/lib/textFormat'
import type { AppExternaMontada } from '@/hooks/useAppExterna'

interface AppExternaSheetProps {
    montada: AppExternaMontada
    /** false = sigue montado (reapertura instantánea) pero no se ve ni recibe taps. */
    visible: boolean
    onClose: () => void
}

/**
 * Pantalla completa que embebe una app propia.
 *
 * NO reusa BottomSheet: ese primitivo topea en 85vh, tiene padding lateral y scroll interno,
 * y los tres arruinan un iframe (viewport recortado, franjas blancas, doble scroll). Sí reusa
 * su lenguaje visual de header.
 */
export default function AppExternaSheet({ montada, visible, onClose }: AppExternaSheetProps) {
    const { app, cliente, handoff } = montada
    const [cargando, setCargando] = useState(true)

    // La instancia se reusa entre aperturas, pero al cambiar de cliente el src cambia y
    // arranca una carga nueva: hay que volver a mostrar el overlay.
    useEffect(() => {
        setCargando(true)
    }, [handoff.url])

    const nombre = titleCaseNombre(cliente.nombreFantasia || cliente.nombreCliente)

    return (
        <div
            data-testid="app-externa-contenedor"
            // `dvh` y no `vh`: con `vh` la barra de URL de mobile tapa el fondo del iframe.
            // overflow-hidden: el único scroll es el de la app embebida.
            className={`fixed inset-0 z-[60] flex flex-col overflow-hidden bg-white ${
                visible ? '' : 'invisible pointer-events-none'
            }`}
            style={{ height: '100dvh' }}
        >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EEF0F5] px-[18px] py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-dsnavy">
                        {app.label}
                    </span>
                    <h2 className="truncate text-[17px] font-extrabold leading-tight text-[#182645]">
                        {nombre}
                    </h2>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cerrar"
                    onClick={onClose}
                    className="h-[30px] w-[30px] shrink-0 bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                >
                    <X className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
            </div>

            <div className="relative min-h-0 flex-1">
                <iframe
                    // El name es el gancho de la variante de handoff 'form' (ver spec).
                    name={`app-externa-${app.id}`}
                    title={app.label}
                    src={handoff.url}
                    // Sin `sandbox`: la app ajena guarda su sesión en localStorage, que exige
                    // allow-same-origin; con eso más allow-scripts el sandbox no defiende de
                    // nada contra una app propia y sí agrega rotura silenciosa.
                    allow="clipboard-write"
                    onLoad={() => setCargando(false)}
                    className="h-full w-full border-0"
                />
                {cargando && (
                    <div
                        data-testid="app-externa-cargando"
                        className="absolute inset-0 grid place-items-center gap-2 bg-white"
                    >
                        <Loader2 className="h-6 w-6 animate-spin text-dsnavy" strokeWidth={2.4} />
                    </div>
                )}
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/AppExternaSheet.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AppExternaSheet.tsx src/components/AppExternaSheet.test.tsx
git commit -m "feat(apps-externas): contenedor full-screen del iframe embebido"
```

---

### Task 5: `AccionesExternas` — los botones, en dos variantes

**Files:**
- Create: `src/components/AccionesExternas.tsx`
- Create: `src/components/AccionesExternas.test.tsx`

**Interfaces:**
- Consumes: `APPS_EXTERNAS`, `AppExterna` de `@/lib/appsExternas`; `IVisitClientCard`.
- Produces: `default function AccionesExternas(props: { cliente: IVisitClientCard; variante: 'fila' | 'header'; onAbrir: (app: AppExterna, cliente: IVisitClientCard) => void })`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/AccionesExternas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AccionesExternas from './AccionesExternas'
import { APPS_EXTERNAS } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

const CLIENTE: IVisitClientCard = {
    codigoCliente: '900123',
    codigoParticularCliente: '12345',
    nombreCliente: 'KIOSCO RUBEN SRL',
}

describe('AccionesExternas', () => {
    // Lo que garantiza que la app número tres no requiera decisiones nuevas.
    it('renderiza un botón por app registrada', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={vi.fn()} />)
        for (const app of APPS_EXTERNAS) {
            expect(screen.getByRole('button', { name: app.label })).toBeInTheDocument()
        }
    })

    it('avisa qué app y qué cliente se abrieron', async () => {
        const onAbrir = vi.fn()
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={onAbrir} />)
        await userEvent.click(screen.getByRole('button', { name: 'Pagos' }))
        expect(onAbrir).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'pagos' }),
            CLIENTE,
        )
    })

    // La variante header comparte el lenguaje visual de las utilidades que ya viven
    // arriba de la card (Llamar / Reagendar): chip bajo de 32px, no botón de 44px.
    it('la variante header usa el alto de chip de las utilidades de la card', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="header" onAbrir={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Pagos' }).className).toContain('h-8')
    })

    it('la variante fila usa el alto de acción táctil', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Pagos' }).className).toContain('h-11')
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/AccionesExternas.test.tsx`
Expected: FAIL — no existe el módulo `./AccionesExternas`.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/AccionesExternas.tsx`:

```tsx
import { APPS_EXTERNAS, type AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

// La variante 'header' replica el chip de las utilidades de ClienteCard (Llamar /
// Reagendar). Se duplica el string en vez de importarlo de ClienteCard para no invertir
// la dependencia entre componentes hermanos; si alguna vez son tres los que lo usan,
// el constante se muda a src/lib.
const CHIP_HEADER =
    'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#F4F6FA] px-2.5 text-[11.5px] font-semibold text-[#54607A] hover:bg-[#EAEEF6]'
const BOTON_FILA =
    'inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#D8DEEA] bg-white text-[13px] font-semibold text-dsnavy hover:bg-dsnavy/5'

interface AccionesExternasProps {
    cliente: IVisitClientCard
    /** 'header' = chip bajo entre las utilidades de la card (no suma altura a la card).
     *  'fila' = botón táctil dentro de un sheet, donde hay espacio. */
    variante: 'fila' | 'header'
    onAbrir: (app: AppExterna, cliente: IVisitClientCard) => void
}

/** Único lugar donde se listan las apps externas para el usuario. Se renderiza en dos
 *  contextos (header de la card y sheet del cliente) para que agregar una app no obligue
 *  a decidir de nuevo dónde va. */
export default function AccionesExternas({ cliente, variante, onAbrir }: AccionesExternasProps) {
    const header = variante === 'header'
    return (
        <div className={header ? 'flex gap-1' : 'flex gap-1.5'}>
            {APPS_EXTERNAS.map(app => {
                const Icono = app.icon
                return (
                    <button
                        key={app.id}
                        type="button"
                        onClick={() => onAbrir(app, cliente)}
                        className={header ? CHIP_HEADER : BOTON_FILA}
                    >
                        <Icono
                            className={header ? 'h-[13px] w-[13px]' : 'h-[14px] w-[14px]'}
                            strokeWidth={2}
                        />
                        {app.label}
                    </button>
                )
            })}
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/AccionesExternas.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AccionesExternas.tsx src/components/AccionesExternas.test.tsx
git commit -m "feat(apps-externas): componente de acciones reutilizable"
```

---

### Task 6: Acceso desde la agenda (utilidades del header de la card)

**Sin menú `⋯`, y sin sheet intermedio.** La card fue rediseñada en `572f1f0`/`33a8ac8`: Llamar y
Reagendar se movieron al **header**, al lado del código del cliente, con este razonamiento ya escrito
en el código (`ClienteCard.tsx:22-25`):

> Utilidades (llamar/reagendar). Viven en el header, no en el área de acciones: son auxiliares al
> ciclo de la visita, y como fila propia de botones sumaban una cuarta caja que hacía la card
> innecesariamente alta en una columna de 7-8 clientes.

"Pagos" es exactamente eso: auxiliar al ciclo de la visita. Va al mismo lugar, con el mismo chip de
32px, y así **no suma altura a la card** — que era el problema real que el `⋯` intentaba resolver. El
área de acciones queda intacta con sus dos botones de tier 1 (Propuesta + Iniciar visita).

Con esto la card no necesita ninguna prop nueva de "abrir menú": recibe directamente el callback de
abrir una app.

**Files:**
- Modify: `src/components/ClienteCard.tsx` (nueva prop + `AccionesExternas` variante header)
- Modify: `src/components/ClienteCard.test.tsx` (nueva prop en los renders existentes + tests nuevos)
- Modify: `src/components/AgendaBoard.tsx` (pasar la prop hacia abajo)
- Modify: `src/components/AgendaBoard.test.tsx` (nueva prop en los renders existentes)
- Modify: `src/pages/AgendaSemanaPage.tsx` (`useAppExterna` + `AppExternaSheet`)
- Modify: `src/pages/AgendaSemanaPage.test.tsx` (test de flujo end-to-end de la agenda)

**Interfaces:**
- Consumes: `useAppExterna` (Task 3), `AppExternaSheet` (Task 4), `AccionesExternas` (Task 5).
- Produces: `onAbrirAppExterna: (app: AppExterna, cliente: IVisitClientCard) => void`, prop
  **requerida** en `ClienteCardProps` y en `AgendaBoardProps`. Mismo nombre y misma firma que la prop
  opcional de los sheets en la Task 7: un solo callback en todo el árbol.

- [ ] **Step 1: Escribir el test que falla en `ClienteCard.test.tsx`**

Agregar al `describe` existente. **Antes**, sumar `onAbrirAppExterna={vi.fn()}` al helper de render que
ya usa ese archivo (la prop es requerida: sin eso no compila ningún test del archivo).

```tsx
    it('ofrece las apps externas entre las utilidades del header', async () => {
        const onAbrirAppExterna = vi.fn()
        renderCard({ onAbrirAppExterna })
        await userEvent.click(screen.getByRole('button', { name: 'Pagos' }))
        expect(onAbrirAppExterna).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'pagos' }),
            expect.objectContaining({ codigoParticularCliente: CLIENTE.codigoParticularCliente }),
        )
    })

    // En preview (hojeando otra semana) no se opera: nada de apps externas.
    it('no ofrece apps externas en modo preview', () => {
        renderCard({ modo: 'preview' })
        expect(screen.queryByRole('button', { name: 'Pagos' })).not.toBeInTheDocument()
    })

    // Un cliente ya visitado también tiene pagos que mirar: la utilidad no depende de que
    // el ciclo esté pendiente, a diferencia de Llamar/Reagendar.
    it('sigue ofreciendo apps externas en un cliente ya resuelto', () => {
        renderCard({ cliente: { ...CLIENTE, estado: 'visitada' } })
        expect(screen.getByRole('button', { name: 'Pagos' })).toBeInTheDocument()
    })
```

Usar el nombre del fixture de cliente que ya exista en ese archivo en lugar de `CLIENTE` si difiere.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Expected: FAIL — no existe ningún botón "Pagos".

- [ ] **Step 3: Implementar en `ClienteCard.tsx`**

Imports nuevos:

```tsx
import AccionesExternas from './AccionesExternas'
import type { AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'
```

Agregar a `ClienteCardProps`:

```ts
    onAbrirAppExterna: (app: AppExterna, cliente: IVisitClientCard) => void
```

Agregarla al destructuring. En el bloque de utilidades del header, hoy envuelto en
`{operable && !resuelto && (<div className="-mr-0.5 -mt-0.5 flex shrink-0 gap-1"> … </div>)}`:

1. Cambiar la condición de ese `div` a `{operable && (` — las apps externas aplican también a un
   cliente resuelto, aunque Llamar/Reagendar no.
2. Mantener `telefonoLimpio &&` y el botón de Reagendar condicionados además a `!resuelto`, para que
   no aparezcan en un cliente ya resuelto como hasta ahora.
3. Agregar al final del `div`, después del botón de Reagendar:

```tsx
                        <AccionesExternas
                            cliente={cliente}
                            variante="header"
                            onAbrir={onAbrirAppExterna}
                        />
```

El resultado es que en un cliente pendiente el header muestra `Llamar · Reagendar · Pagos`, y en uno
resuelto solo `Pagos`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Pasar la prop por `AgendaBoard`**

En `AgendaBoard.tsx`: agregar
`onAbrirAppExterna: (app: AppExterna, cliente: IVisitClientCard) => void` a las props, al
destructuring, y pasarla a cada `<ClienteCard>`. En `AgendaBoard.test.tsx` sumar
`onAbrirAppExterna={vi.fn()}` a los renders existentes.

Run: `npx vitest run src/components/AgendaBoard.test.tsx`
Expected: PASS

- [ ] **Step 6: Escribir el test de integración en `AgendaSemanaPage.test.tsx`**

Agregar al describe existente, siguiendo el helper de render de ese archivo:

```tsx
    it('abre pagos-lupa embebido con el contexto del cliente desde la agenda', async () => {
        await renderPagina() // helper existente del archivo
        await userEvent.click(screen.getAllByRole('button', { name: 'Pagos' })[0])

        const iframe = screen.getByTitle('Pagos')
        const url = new URL(iframe.getAttribute('src') as string)
        expect(url.pathname).toBe('/')
        expect(url.searchParams.get('client')).toBeTruthy()
        expect(url.searchParams.has('token')).toBe(false)

        await userEvent.click(screen.getByLabelText('Cerrar'))
        // Oculto pero montado: reabrir tiene que ser instantáneo.
        expect(screen.getByTitle('Pagos')).toBeInTheDocument()
    })
```

- [ ] **Step 7: Correr y verificar que falla**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: FAIL — no hay botón "Pagos" conectado ni iframe.

- [ ] **Step 8: Conectar en `AgendaSemanaPage.tsx`**

Imports:

```tsx
import AppExternaSheet from '@/components/AppExternaSheet'
import { useAppExterna } from '@/hooks/useAppExterna'
```

Junto a los otros hooks de la página:

```tsx
    const appExterna = useAppExterna()
```

En `<AgendaBoard>`, sumar `onAbrirAppExterna={appExterna.abrir}`.

Al final del JSX, después de `<CerrarSemanaSheet ... />`:

```tsx
            {appExterna.montada && (
                <AppExternaSheet
                    montada={appExterna.montada}
                    visible={appExterna.visible}
                    onClose={appExterna.ocultar}
                />
            )}
```

- [ ] **Step 9: Correr toda la suite y el lint**

Run: `npm test`
Expected: PASS, sin regresiones (los archivos de test de ClienteCard/AgendaBoard/AgendaSemanaPage ya
tienen la prop nueva).

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add src/components/ClienteCard.tsx src/components/ClienteCard.test.tsx \
        src/components/AgendaBoard.tsx src/components/AgendaBoard.test.tsx \
        src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx
git commit -m "feat(apps-externas): abrir pagos-lupa embebido desde la card de la agenda"
```

---

### Task 7: Acceso desde el sheet del cliente

El otro de los dos lugares acordados. Acá hay espacio, así que va la variante `'fila'` con label.

**Files:**
- Modify: `src/components/PropuestaSheet.tsx` (nueva prop opcional + fila de acciones)
- Modify: `src/components/PropuestaSheet.test.tsx` (test nuevo)
- Modify: `src/components/VisitaSheet.tsx` (nueva prop opcional + fila de acciones)
- Modify: `src/components/VisitaSheet.test.tsx` (test nuevo)
- Modify: `src/components/VisitaFlow.tsx` (pasar la prop a los dos sheets)
- Modify: `src/pages/AgendaSemanaPage.tsx` (pasar `appExterna.abrir` a `VisitaFlow`)

**Interfaces:**
- Consumes: `AccionesExternas` (Task 5), `appExterna.abrir` (Task 3, ya instanciado en Task 6).
- Produces: prop **opcional** `onAbrirAppExterna?: (app: AppExterna, cliente: IVisitClientCard) => void`
  en `PropuestaSheet`, `VisitaSheet` y `VisitaFlow`. Opcional a propósito: si no se pasa, la fila no
  se renderiza y ningún test existente de esos componentes se rompe.

- [ ] **Step 1: Escribir el test que falla en `PropuestaSheet.test.tsx`**

```tsx
    it('ofrece las apps externas cuando se le pasa el callback y el cliente', async () => {
        const onAbrirAppExterna = vi.fn()
        renderSheet({ onAbrirAppExterna, cliente: CLIENTE }) // helper existente del archivo
        await userEvent.click(screen.getByRole('button', { name: 'Pagos' }))
        expect(onAbrirAppExterna).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'pagos' }),
            CLIENTE,
        )
    })

    it('no muestra apps externas si no se le pasa el callback', () => {
        renderSheet()
        expect(screen.queryByRole('button', { name: 'Pagos' })).not.toBeInTheDocument()
    })
```

`PropuestaSheet` hoy recibe `codigoCliente` y `nombreCliente` pero **no** el objeto cliente, y
`AccionesExternas` necesita un `IVisitClientCard`. Agregar por eso una prop `cliente?: IVisitClientCard`
junto a `onAbrirAppExterna`: las dos van juntas o ninguna. Definir `CLIENTE` en el test como un
`IVisitClientCard` mínimo (`codigoCliente`, `codigoParticularCliente`, `nombreCliente`).

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/PropuestaSheet.test.tsx`
Expected: FAIL — no existe el botón "Pagos".

- [ ] **Step 3: Implementar en `PropuestaSheet.tsx`**

Agregar a las props:

```ts
    /** Cliente completo, solo para las apps externas. Va junto con onAbrirAppExterna. */
    cliente?: IVisitClientCard
    onAbrirAppExterna?: (app: AppExterna, cliente: IVisitClientCard) => void
```

Importar `AccionesExternas`, y los tipos `AppExterna` de `@/lib/appsExternas` e `IVisitClientCard` de
`@/types/planificacion`.

El contenido del sheet es un único `<div>` que abre con un `<p className="mb-3 …">` explicativo (en
`PropuestaSheet.tsx`, dentro del `<BottomSheet>`; ya **no** hay estado `vista`/`'list'` — la vista
"versus" se unificó en `RubroTable` en el commit `572f1f0`). Insertar la fila **antes** de ese `<p>`:
el vendedor mira cómo viene el cliente *antes* de leer la propuesta.

```tsx
            {cliente && onAbrirAppExterna && (
                <div className="mb-3">
                    <AccionesExternas cliente={cliente} variante="fila" onAbrir={onAbrirAppExterna} />
                </div>
            )}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/components/PropuestaSheet.test.tsx`
Expected: PASS

- [ ] **Step 5: Repetir en `VisitaSheet.tsx` con su propio test**

Mismo par de props (`cliente?`, `onAbrirAppExterna?`) y en `VisitaSheet.test.tsx` los dos tests del
Step 1 adaptados al helper de render de ese archivo.

El ancla acá es la rama `: (` del ternario `{wizard ? (…) : (<div> …`: insertar la fila **antes** del
`<p className="mb-3 …">` de ese `<div>`. Dentro del wizard **no** va — el vendedor está cargando
resultados rubro por rubro y ahí un botón que se lleva la pantalla completa es una trampa.

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS

- [ ] **Step 6: Cablear `VisitaFlow.tsx`**

Agregar a `VisitaFlowProps`:

```ts
    onAbrirAppExterna?: (app: AppExterna, cliente: IVisitClientCard) => void
```

Al destructuring, y pasar a los dos sheets `cliente={cliente ?? undefined}` (o
`visitaEnCurso.cliente` según cuál sheet esté abierto) más
`onAbrirAppExterna={onAbrirAppExterna}`. `IAgendaClient` extiende `IVisitClientCard`, así que pasa sin
conversión.

- [ ] **Step 7: Cablear la página**

En `AgendaSemanaPage.tsx`, en `<VisitaFlow>`, sumar:

```tsx
                onAbrirAppExterna={appExterna.abrir}
```

- [ ] **Step 8: Correr toda la suite, el lint y el build**

Run: `npm test`
Expected: PASS, sin regresiones.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build OK (verifica que no haya errores de tipos que Vitest no atrape).

- [ ] **Step 9: Commit**

```bash
git add src/components/PropuestaSheet.tsx src/components/PropuestaSheet.test.tsx \
        src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx \
        src/components/VisitaFlow.tsx src/pages/AgendaSemanaPage.tsx
git commit -m "feat(apps-externas): ofrecer apps externas dentro del sheet del cliente"
```

---

### Task 8: Verificación en dispositivo real y desmontaje

El comportamiento del iframe no se puede testear en jsdom. Esta tarea es la que cierra el trabajo, y
la que puede descubrir que hay que pedirle algo a pagos-lupa.

**Files:**
- Modify: `src/pages/AgendaSemanaPage.tsx` (desmontar al salir del contexto del cliente)
- Modify: `src/pages/AgendaSemanaPage.test.tsx` (test del desmontaje)
- Modify: `docs/superpowers/specs/2026-08-06-apps-externas-contexto-cliente-design.md` (resultado en dispositivo)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada nuevo de código; cierra el plan.

- [ ] **Step 1: Escribir el test del desmontaje**

Mantener una app React ajena viva por cliente no es gratis en un Android de gama baja: cuando el
vendedor cambia de día o cierra el contexto del cliente, hay que soltarla.

En `AgendaSemanaPage.test.tsx`:

```tsx
    it('suelta la instancia embebida al cambiar de día', async () => {
        await renderPagina()
        await userEvent.click(screen.getAllByRole('button', { name: 'Pagos' })[0])
        expect(screen.getByTitle('Pagos')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /MAR/i }))
        expect(screen.queryByTitle('Pagos')).not.toBeInTheDocument()
    })
```

Ajustar el selector del tab de día al que use `DiaTabs` en ese archivo de test.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: FAIL — el iframe sigue montado tras cambiar de día.

- [ ] **Step 3: Implementar el desmontaje**

En `AgendaSemanaPage.tsx`, agregar:

```tsx
    // La instancia embebida es del cliente que se estaba mirando. Al cambiar de día ese
    // contexto ya no aplica: se suelta la memoria en vez de quedar una app React ajena viva.
    useEffect(() => {
        appExterna.desmontar()
    }, [diaActivo, appExterna.desmontar])
```

`diaActivo` ya no es un `useState`: se deriva del search param de la URL
(`AgendaSemanaPage.tsx:116`). Como dependencia del efecto funciona igual — sigue siendo un valor que
cambia cuando el vendedor cambia de día. El test tiene que cambiar de día por el mismo camino que usen
los demás tests del archivo (router + tab), no seteando estado a mano.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: PASS

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 5: Verificar en dispositivo real**

Con `npm run dev -- --host` y el celular en la misma red (o el deploy de preview en Vercel), en
**Android/Chrome** y en **iOS/Safari**, instalando la PWA:

0. **La primera vez** el iframe muestra el login de pagos-lupa (camino A): loguearse ahí con las
   credenciales del vendedor. Verificar que **no se vuelva a pedir** en las aperturas siguientes,
   ni después de cerrar y reabrir la PWA. Este punto es el que valida el camino A; en iOS es el que
   más riesgo tiene (la ITP de Safari expira el storage escrito por script).
1. Abrir Pagos en un cliente: la app carga con el overlay y muestra **ese** cliente.
2. Cerrar y reabrir el mismo cliente: tiene que ser **instantáneo** (sin overlay de carga).
3. Abrir otro cliente: carga de nuevo y muestra el cliente correcto (ejercita el riesgo 2 del spec).
4. Scroll dentro del iframe: **un solo** scroll, sin franja blanca abajo (verifica el `dvh`).
5. Enfocar un input dentro de pagos-lupa: el teclado no debe tapar el campo ni romper el layout.
6. Rotar el dispositivo: el iframe se reajusta.

- [ ] **Step 6: Documentar el resultado y commitear**

Agregar al spec, bajo la sección de verificación empírica:

```markdown
### En dispositivo (fecha)

- Android/Chrome, PWA instalada: <resultado de los 6 puntos>
- iOS/Safari, PWA instalada: <resultado de los 6 puntos>
- Pedidos a pagos-lupa que la verificación confirmó como necesarios: <lista o "ninguno">
```

```bash
git add src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx \
        docs/superpowers/specs/2026-08-06-apps-externas-contexto-cliente-design.md
git commit -m "feat(apps-externas): soltar la instancia embebida al cambiar de contexto"
```

---

## Cobertura del spec

| Sección del spec | Tarea |
| --- | --- |
| Contrato de handoff (`?token&client`, sin `type_operation`) | 2 |
| Registro `appsExternas.ts`, `EstrategiaToken`, `Handoff` union | 2 |
| `VITE_PAGOS_LUPA_URL` configurable | 2 |
| Variantes de handoff posibles / límite del header custom | 2 (comentario del tipo + guarda de exhaustividad) |
| `useAppExterna`: handoff una vez, oculta ≠ desmontada | 3 |
| `AppExternaSheet`: `dvh`, sin sandbox, `name`, overlay de carga | 4 |
| `AccionesExternas` en dos variantes | 5 |
| Ubicación en `ClienteCard` | 6 — **el spec decía menú `⋯`; se implementa como utilidad del header.** Ver abajo. |
| Ubicación en el sheet del cliente | 7 |
| Desmontaje al cambiar de cliente/contexto | 8 |
| Riesgos 1, 2 y 3 (token cross-host, client en reapertura, storage particionado) | 1 |
| Verificación manual en Android e iOS | 8 |
| Cero dependencias nuevas | Global Constraints |

## Desvío del spec: dónde va el botón en la card

El spec propuso un menú `⋯` porque la card tenía tres acciones (Propuesta + Llamar + Estado) y no
entraba una cuarta. **Eso dejó de ser cierto:** los commits `572f1f0` y `33a8ac8` rediseñaron la card
y movieron Llamar/Reagendar al header, dejando el área de acciones con dos botones de tier 1
(Propuesta + Iniciar visita) y un patrón explícito para utilidades — chips de 32px en el header, junto
al código del cliente, elegido justamente para no sumar altura en una columna de 7-8 clientes
(`ClienteCard.tsx:22-25`).

"Pagos" es una utilidad auxiliar al ciclo de la visita, igual que Llamar. Va al header, sin menú y sin
sheet intermedio: **un tap en vez de dos**, sin altura extra, siguiendo un patrón que ya existe en vez
de introduciendo uno nuevo. Esto además cierra la "duda abierta" del spec (si el `⋯` era un tap de más
en el camino caliente): con el header no hay tap de más que discutir.

**Fuera de este plan, por decisión del spec:** los tres pedidos a pagos-lupa
(`frame-ancestors`, `?embed=1`, listener de `postMessage`), el token de handoff de un solo uso
(deuda reconocida por el riesgo 4: el token viaja en la query string y pagos-lupa carga Microsoft
Clarity), y el rediseño de la fila de acciones de la card si el `⋯` resulta estar en el camino
caliente.
