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
- **Contrato de handoff de pagos-lupa, verbatim:**
  `{VITE_PAGOS_LUPA_URL}/auth/login?token=<access_token>&client=<codigoParticularCliente>`
- **`type_operation` se omite.** Acepta `PPAL` o `DS`, nadie confirmó qué significan, y omitirlo evita
  una rama de redirect extra en la app ajena.
- **La URL base va en `VITE_PAGOS_LUPA_URL`**, nunca hardcodeada: hay al menos tres deploys vivos.
- **El token se lee de `localStorage.getItem('access_token')`**, la misma fuente que el interceptor de
  `src/api/apiClient.ts`. `AuthContext` **no** expone el token y **no se modifica**.
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
import { vi } from 'vitest'
import {
    APPS_EXTERNAS,
    resolverHandoff,
    resolverToken,
    type AppExterna,
} from './appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

const CLIENTE: IVisitClientCard = {
    codigoCliente: '900123',
    codigoParticularCliente: '12345',
    nombreCliente: 'KIOSCO RUBEN SRL',
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

    it('registra pagos-lupa con la credencial de sesión', () => {
        const app = appDePagos()
        expect(app.label).toBe('Pagos')
        expect(app.token).toBe('sesion')
        expect(app.handoff.tipo).toBe('url')
    })

    it('resolverToken lee el access_token de la sesión', () => {
        localStorage.setItem('access_token', 'tok-123')
        expect(resolverToken(appDePagos())).toBe('tok-123')
    })

    it("resolverToken devuelve null cuando la app declara 'ninguno'", () => {
        localStorage.setItem('access_token', 'tok-123')
        const app: AppExterna = { ...appDePagos(), token: 'ninguno' }
        expect(resolverToken(app)).toBeNull()
    })

    it('arma la URL de handoff con token y client', () => {
        localStorage.setItem('access_token', 'tok-123')
        const resuelto = resolverHandoff(appDePagos(), CLIENTE)
        expect(resuelto.tipo).toBe('url')
        const url = new URL(resuelto.url)
        expect(url.pathname).toBe('/auth/login')
        expect(url.searchParams.get('token')).toBe('tok-123')
        expect(url.searchParams.get('client')).toBe('12345')
    })

    // El token es un JWT: trae puntos, y su base64url puede traer '-' y '_'. Si algún día
    // el emisor cambia a un token con '+' o '/', concatenar a mano rompería el param.
    it('escapa el token en vez de concatenarlo crudo', () => {
        localStorage.setItem('access_token', 'a+b/c=d&e')
        const { url } = resolverHandoff(appDePagos(), CLIENTE)
        expect(url).not.toContain('a+b/c=d&e')
        expect(new URL(url).searchParams.get('token')).toBe('a+b/c=d&e')
    })

    // Sin token en storage el handoff no debe tirar: pagos-lupa mostrará su login, que es
    // una degradación aceptable y visible. Reventar acá dejaría la pantalla en blanco.
    it('no explota si no hay token en storage', () => {
        const { url } = resolverHandoff(appDePagos(), CLIENTE)
        expect(new URL(url).searchParams.get('token')).toBe('')
    })

    // type_operation se omite a propósito (ver Global Constraints del plan).
    it('no manda type_operation', () => {
        const { url } = resolverHandoff(appDePagos(), CLIENTE)
        expect(new URL(url).searchParams.has('type_operation')).toBe(false)
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
        token: 'sesion',
        handoff: {
            tipo: 'url',
            // Contrato que pagos-lupa ya implementa: guarda el token, lo valida, y preserva
            // `client` en su redirect interno a /?client=. Solo aplica el client si el rol
            // es VENDEDOR. type_operation se omite (ver spec).
            url: ({ cliente, token }) => {
                const params = new URLSearchParams({
                    token: token ?? '',
                    client: cliente.codigoParticularCliente,
                })
                return `${PAGOS_LUPA_URL}/auth/login?${params}`
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
- Produces: `default function AccionesExternas(props: { cliente: IVisitClientCard; variante: 'fila' | 'lista'; onAbrir: (app: AppExterna, cliente: IVisitClientCard) => void })`

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

    it('la variante lista renderiza los ítems a lo ancho', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="lista" onAbrir={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Pagos' }).className).toContain('w-full')
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/AccionesExternas.test.tsx`
Expected: FAIL — no existe el módulo `./AccionesExternas`.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/AccionesExternas.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { APPS_EXTERNAS, type AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

interface AccionesExternasProps {
    cliente: IVisitClientCard
    /** 'fila' = botones al lado del otro, dentro de un sheet con espacio.
     *  'lista' = ítems full-width, dentro del menú ⋯ de la card. */
    variante: 'fila' | 'lista'
    onAbrir: (app: AppExterna, cliente: IVisitClientCard) => void
}

/** Único lugar donde se listan las apps externas para el usuario. Se renderiza en dos
 *  contextos (menú de la card y sheet del cliente) para que agregar una app no obligue a
 *  decidir de nuevo dónde va. */
export default function AccionesExternas({ cliente, variante, onAbrir }: AccionesExternasProps) {
    const lista = variante === 'lista'
    return (
        <div className={lista ? 'flex flex-col gap-2' : 'flex gap-1.5'}>
            {APPS_EXTERNAS.map(app => {
                const Icono = app.icon
                return (
                    <Button
                        key={app.id}
                        variant="outline"
                        size="sm"
                        onClick={() => onAbrir(app, cliente)}
                        className={`h-11 border-[#D8DEEA] text-[13px] text-dsnavy ${
                            lista ? 'w-full justify-start' : 'flex-1'
                        }`}
                    >
                        <Icono className="h-[14px] w-[14px]" strokeWidth={2} />
                        {app.label}
                    </Button>
                )
            })}
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/AccionesExternas.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AccionesExternas.tsx src/components/AccionesExternas.test.tsx
git commit -m "feat(apps-externas): componente de acciones reutilizable"
```

---

### Task 6: Acceso desde la agenda (botón `⋯` en la card)

La card ya tiene tres acciones (Propuesta + Llamar + Estado) y en mobile no entra un cuarto botón con
label. El `⋯` **no abre un sheet propio por card** — hay hasta ~40 cards en pantalla: la card avisa
hacia arriba y la página abre una única instancia del menú.

**Files:**
- Modify: `src/components/ClienteCard.tsx` (nueva prop + botón `⋯`)
- Modify: `src/components/ClienteCard.test.tsx` (nueva prop en los renders existentes + tests nuevos)
- Modify: `src/components/AgendaBoard.tsx` (pasar la prop hacia abajo)
- Modify: `src/components/AgendaBoard.test.tsx` (nueva prop en los renders existentes)
- Modify: `src/pages/AgendaSemanaPage.tsx` (estado del menú + `useAppExterna` + `AppExternaSheet`)
- Modify: `src/pages/AgendaSemanaPage.test.tsx` (test de flujo end-to-end de la agenda)

**Interfaces:**
- Consumes: `useAppExterna` (Task 3), `AppExternaSheet` (Task 4), `AccionesExternas` (Task 5).
- Produces: `ClienteCardProps.onAppsExternas: (cliente: IAgendaClient) => void` (requerida) y
  `AgendaBoardProps.onAppsExternas: (cliente: IAgendaClient) => void` (requerida).

- [ ] **Step 1: Escribir el test que falla en `ClienteCard.test.tsx`**

Agregar al `describe` existente. **Antes**, sumar `onAppsExternas={vi.fn()}` al helper de render que
ya usa ese archivo (la prop es requerida: sin eso no compila ningún test del archivo).

```tsx
    it('avisa hacia arriba cuando se piden las apps externas del cliente', async () => {
        const onAppsExternas = vi.fn()
        renderCard({ onAppsExternas })
        await userEvent.click(screen.getByLabelText('Más opciones'))
        expect(onAppsExternas).toHaveBeenCalledWith(expect.objectContaining({ codigoParticularCliente: '12345' }))
    })

    // En preview (hojeando otra semana) no se opera: nada de apps externas.
    it('no muestra el botón de más opciones en modo preview', () => {
        renderCard({ modo: 'preview' })
        expect(screen.queryByLabelText('Más opciones')).not.toBeInTheDocument()
    })
```

Ajustar `codigoParticularCliente: '12345'` al valor que use el fixture del archivo.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Expected: FAIL — no existe el botón con `aria-label="Más opciones"`.

- [ ] **Step 3: Implementar en `ClienteCard.tsx`**

Agregar `MoreHorizontal` al import de `lucide-react`. Agregar a `ClienteCardProps`:

```ts
    onAppsExternas: (cliente: IAgendaClient) => void
```

Agregarla al destructuring del componente. En la fila de acciones del caso operable-no-resuelto,
después del botón de "Estado de la visita", agregar:

```tsx
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Más opciones"
                        onClick={() => onAppsExternas(cliente)}
                        className={ICON_BUTTON}
                    >
                        <MoreHorizontal className="h-[14px] w-[14px]" strokeWidth={2} />
                    </Button>
```

Agregar el mismo botón en la rama `operable && resuelto` (la del "Ver resumen"), envolviendo ambos en
`<div className="flex gap-1.5">`: ver los pagos de un cliente ya visitado sigue teniendo sentido.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/components/ClienteCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Pasar la prop por `AgendaBoard`**

En `AgendaBoard.tsx`: agregar `onAppsExternas: (cliente: IAgendaClient) => void` a las props, al
destructuring, y pasarla a cada `<ClienteCard>`. En `AgendaBoard.test.tsx` sumar
`onAppsExternas={vi.fn()}` a los renders existentes.

Run: `npx vitest run src/components/AgendaBoard.test.tsx`
Expected: PASS

- [ ] **Step 6: Escribir el test de integración en `AgendaSemanaPage.test.tsx`**

Agregar al describe existente, siguiendo el helper de render de ese archivo:

```tsx
    it('abre pagos-lupa embebido con el contexto del cliente desde la agenda', async () => {
        localStorage.setItem('access_token', 'tok-123')
        await renderPagina() // helper existente del archivo
        await userEvent.click(screen.getAllByLabelText('Más opciones')[0])
        await userEvent.click(screen.getByRole('button', { name: 'Pagos' }))

        const iframe = screen.getByTitle('Pagos')
        const url = new URL(iframe.getAttribute('src') as string)
        expect(url.pathname).toBe('/auth/login')
        expect(url.searchParams.get('token')).toBe('tok-123')
        expect(url.searchParams.get('client')).toBeTruthy()

        await userEvent.click(screen.getByLabelText('Cerrar'))
        // Oculto pero montado: reabrir tiene que ser instantáneo.
        expect(screen.getByTitle('Pagos')).toBeInTheDocument()
    })
```

- [ ] **Step 7: Correr y verificar que falla**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: FAIL — no hay botón "Más opciones" conectado ni iframe.

- [ ] **Step 8: Conectar en `AgendaSemanaPage.tsx`**

Imports:

```tsx
import BottomSheet from '@/components/ui/BottomSheet'
import AccionesExternas from '@/components/AccionesExternas'
import AppExternaSheet from '@/components/AppExternaSheet'
import { useAppExterna } from '@/hooks/useAppExterna'
```

Estado, junto a los otros `useState` de la página:

```tsx
    // Cliente cuyo menú de apps externas está abierto. Vive acá y no en la card: hay hasta
    // ~40 cards en pantalla y una sola instancia del menú.
    const [appsMenuCliente, setAppsMenuCliente] = useState<IAgendaClient | null>(null)
    const appExterna = useAppExterna()
```

En `<AgendaBoard>`, sumar `onAppsExternas={setAppsMenuCliente}`.

Al final del JSX, después de `<CerrarSemanaSheet ... />`:

```tsx
            <BottomSheet
                open={appsMenuCliente !== null}
                onClose={() => setAppsMenuCliente(null)}
                title={appsMenuCliente ? titleCaseNombre(appsMenuCliente.nombreFantasia || appsMenuCliente.nombreCliente) : ''}
                eyebrow="Más información"
                eyebrowClassName="text-dsnavy"
            >
                {appsMenuCliente && (
                    <AccionesExternas
                        cliente={appsMenuCliente}
                        variante="lista"
                        onAbrir={(app, cliente) => {
                            appExterna.abrir(app, cliente)
                            setAppsMenuCliente(null)
                        }}
                    />
                )}
            </BottomSheet>

            {appExterna.montada && (
                <AppExternaSheet
                    montada={appExterna.montada}
                    visible={appExterna.visible}
                    onClose={appExterna.ocultar}
                />
            )}
```

Importar `titleCaseNombre` de `@/lib/textFormat` si la página todavía no lo importa.

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
`@/types/planificacion`. En la vista `'list'`, arriba de la lista de rubros (el vendedor mira el estado
del cliente **antes** de ofrecer):

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

Mismo par de props (`cliente?`, `onAbrirAppExterna?`), mismo bloque en la vista `'list'`, y en
`VisitaSheet.test.tsx` los dos tests del Step 1 adaptados al helper de render de ese archivo.

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
        localStorage.setItem('access_token', 'tok-123')
        await renderPagina()
        await userEvent.click(screen.getAllByLabelText('Más opciones')[0])
        await userEvent.click(screen.getByRole('button', { name: 'Pagos' }))
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

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/pages/AgendaSemanaPage.test.tsx`
Expected: PASS

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 5: Verificar en dispositivo real**

Con `npm run dev -- --host` y el celular en la misma red (o el deploy de preview en Vercel), en
**Android/Chrome** y en **iOS/Safari**, instalando la PWA:

1. Abrir `⋯` → Pagos en un cliente: la app carga con el overlay y muestra **ese** cliente.
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
| Ubicación en `ClienteCard` (menú `⋯`) | 6 |
| Ubicación en el sheet del cliente | 7 |
| Desmontaje al cambiar de cliente/contexto | 8 |
| Riesgos 1, 2 y 3 (token cross-host, client en reapertura, storage particionado) | 1 |
| Verificación manual en Android e iOS | 8 |
| Cero dependencias nuevas | Global Constraints |

**Fuera de este plan, por decisión del spec:** los tres pedidos a pagos-lupa
(`frame-ancestors`, `?embed=1`, listener de `postMessage`), el token de handoff de un solo uso
(deuda reconocida por el riesgo 4: el token viaja en la query string y pagos-lupa carga Microsoft
Clarity), y el rediseño de la fila de acciones de la card si el `⋯` resulta estar en el camino
caliente.
