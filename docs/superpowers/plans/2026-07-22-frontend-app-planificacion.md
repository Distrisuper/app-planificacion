# Frontend `app-planificacion` (SPA web/PWA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mobile-first web/PWA SPA that lets a seller see their weekly/daily visit agenda, open a client's commercial proposal + Versus, start/close a visit (capturing geolocation at start and end), and register the result — consuming the `planificacion` domain of api-vendedores.

**Architecture:** Vite + React 19 SPA. Auth mirrors app-vendedores: a `?token=` captured from the URL before React mounts, stored in `localStorage['access_token']`, injected as a Bearer by a single axios client with a 401 auto-logout interceptor. Server state via React Query hooks over typed API functions; UI state local/Context. Geolocation via `navigator.geolocation.getCurrentPosition` (2 points only — start/end). Screens follow the validated prototype in `Prototipo/`.

**Tech Stack:** Vite, React 19, TypeScript 5, Tailwind + shadcn/ui (Radix), @tanstack/react-query, axios, react-router-dom, zod, vite-plugin-pwa, Vitest + @testing-library/react, Leaflet (map for the 2 geo points). Deploy: Firebase Hosting.

**Source spec:** `docs/superpowers/specs/2026-07-22-app-planificacion-design.md`
**Backend contract:** `docs/superpowers/plans/2026-07-22-backend-planificacion-api.md` (endpoint summary table). This plan assumes those endpoints exist under the api-vendedores base URL: `/planificacion/agenda/semana`, `/planificacion/agenda/dia`, `/planificacion/motivos`, `/planificacion/visitas/activa`, `/planificacion/visitas`, `/planificacion/visitas/:id/cerrar`, `/planificacion/visitas/no-visita`. Plus reused: `/sale/rubro/recommendations` (propuesta) and `/sale/analytics` (Versus).

**Repo:** NEW repo at `C:/Users/matia/Documents/distrisuper/app-planificacion` (currently holds only `Brainstorming.md`, `Prototipo/`, `docs/`, `CLAUDE.md`). All paths below are relative to that repo root. Run all commands from there.

**Visual reference:** `Prototipo/screenshots/*.png` and `Prototipo/Agenda Vendedor.dc.html` (exact colors, layout, copy). Header navy `#182645`, green accent `#16a34a`, red `#B42318`. Motivos catalog (prototype): Saqué pedido, Pasa pedido mañana, Pedido en la semana, Precio, DS, Flete, Poco trabajo, Estoy completo, Vacaciones.

---

## Conventions

- **Path alias:** `@/` → `src/` (match app-vendedores).
- **Types:** interface names prefixed `I` (`IAgendaClient`), matching the ecosystem.
- **API responses:** backend returns `{ ok: 1, data }`; API functions return `.data.data`.
- **Never use plain axios for backend calls** — always the shared `apiClient` (Bearer + 401 interceptor).
- **Prettier:** no semicolons, single quotes, `tabWidth: 4`, `trailingComma: all`, `arrowParens: avoid` (match app-vendedores `.prettierrc`).
- **Tests:** co-located `*.test.tsx`/`*.test.ts`, run with `npm test` (Vitest). Mock the API layer; never hit a real backend in tests.
- **Mobile-first:** design at 390px width; the prototype is a single-column phone layout.

---

## File Structure

```
app-planificacion/
├── index.html
├── package.json / tsconfig.json / vite.config.ts / vitest.config.ts
├── tailwind.config.cjs / postcss.config.cjs / src/index.css
├── firebase.json / .firebaserc
├── .env-example
├── public/  (PWA icons, manifest handled by vite-plugin-pwa)
└── src/
    ├── main.tsx                      # token capture → mount
    ├── App.tsx                       # providers + router
    ├── lib/queryClient.ts            # React Query client (copy from app-vendedores)
    ├── utils/initialURLCapture.ts    # capture ?token= before mount (copy pattern)
    ├── api/
    │   ├── apiClient.ts              # axios + interceptors (copy pattern)
    │   └── planificacion.ts          # typed API functions
    ├── types/planificacion.ts        # IMotivo, IAgendaClient, IVisita, DTOs
    ├── hooks/
    │   ├── useAgenda.ts              # useAgendaSemana / useAgendaDia
    │   ├── useMotivos.ts
    │   ├── useVisitas.ts             # activa + iniciar/cerrar/noVisita mutations
    │   ├── usePropuesta.ts           # rubro recommendations (reused endpoint)
    │   └── useGeolocation.ts
    ├── context/VisitaEnCursoContext.tsx   # active visit state across screens
    ├── router/ProtectedRoute.tsx
    ├── pages/
    │   ├── AgendaSemanaPage.tsx
    │   └── AgendaDiaPage.tsx
    └── components/
        ├── AppHeader.tsx             # DS header + week nav + progress
        ├── DiaTabs.tsx
        ├── ClienteCard.tsx
        ├── PropuestaSheet.tsx
        ├── VersusView.tsx
        ├── VisitaControls.tsx        # iniciar / en-curso
        ├── ResolucionSheet.tsx       # motivo multi-select + cerrar
        └── ui/                        # shadcn primitives (BottomSheet, Checkbox, Button…)
```

---

## Phase 0 — Scaffold

### Task 1: Initialize the Vite + React 19 + TS project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.env-example`, `.gitignore`

- [ ] **Step 1: Scaffold with Vite (React + TS template)**

Run:
```bash
npm create vite@latest . -- --template react-ts
```
When prompted about the non-empty directory, choose "Ignore files and continue" (keeps `Brainstorming.md`, `Prototipo/`, `docs/`, `CLAUDE.md`).

- [ ] **Step 2: Install React 19 + core deps**

Run:
```bash
npm install react@^19 react-dom@^19 react-router-dom@^6 axios@^1 @tanstack/react-query@^5 zod@^3
npm install -D @types/react@^19 @types/react-dom@^19 typescript@^5 vite@^5 @vitejs/plugin-react
```

- [ ] **Step 3: Configure the `@/` path alias**

In `tsconfig.json`, under `compilerOptions`, add:
```json
"baseUrl": ".",
"paths": { "@/*": ["src/*"] }
```
In `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: { host: true },
})
```

- [ ] **Step 4: Add `.env-example`**

```bash
# Base URL de api-vendedores (mismo backend que app-vendedores)
VITE_API_URL=
# URL del servicio de auth (login / validate token)
VITE_API_AUTH_URL=https://apidistri.distrisuper.com
```

- [ ] **Step 5: Verify dev server boots**

Run: `npm run dev`
Expected: Vite serves the default app on the network host with no errors. Stop it (Ctrl-C).

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold app-planificacion (Vite + React 19 + TS)"
```

### Task 2: Tailwind + shadcn/ui + design tokens

**Files:**
- Create: `tailwind.config.cjs`, `postcss.config.cjs`
- Modify: `src/index.css`

- [ ] **Step 1: Install Tailwind toolchain**

```bash
npm install -D tailwindcss@^3 postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge lucide-react
npx tailwindcss init -p
```
(This generates `tailwind.config.js` + `postcss.config.js`; rename both to `.cjs` to match the ecosystem, or keep `.js` — just be consistent.)

- [ ] **Step 2: Configure `tailwind.config.cjs`**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                dsnavy: '#182645',
                dsgreen: '#16a34a',
                dsred: '#B42318',
                dsmuted: '#697585',
            },
        },
    },
    plugins: [],
}
```

- [ ] **Step 3: Replace `src/index.css` with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body { margin: 0; background: #eef1f6; -webkit-tap-highlight-color: transparent; }
```

- [ ] **Step 4: Render a Tailwind-styled smoke element in `src/App.tsx`**

```tsx
export default function App() {
    return (
        <div className="min-h-full grid place-items-center text-dsnavy font-bold">
            app-planificacion
        </div>
    )
}
```

- [ ] **Step 5: Verify Tailwind compiles**

Run: `npm run dev` — confirm the text renders in navy. Stop it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add Tailwind + design tokens"
```

---

## Phase 1 — Testing setup + auth + API foundation

### Task 3: Vitest + React Testing Library

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install test deps**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
    },
})
```

- [ ] **Step 3: Create `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test scripts to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a trivial passing test to verify the harness**

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react'
import App from './App'

it('renders the app name', () => {
    render(<App />)
    expect(screen.getByText('app-planificacion')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run it**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Vitest + React Testing Library"
```

### Task 4: Initial URL token capture

**Files:**
- Create: `src/utils/initialURLCapture.ts`
- Test: `src/utils/initialURLCapture.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/initialURLCapture.test.ts
import { captureInitialURL, getInitialURLCapture } from './initialURLCapture'

describe('captureInitialURL', () => {
    it('captures the token from the query string', () => {
        window.history.replaceState({}, '', '/?token=abc123')
        const capture = captureInitialURL()
        expect(capture.params.token).toBe('abc123')
        expect(getInitialURLCapture()?.params.token).toBe('abc123')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/initialURLCapture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/utils/initialURLCapture.ts`**

> Trimmed copy of the app-vendedores pattern (only what this app needs: token).

```typescript
export interface InitialURLCapture {
    pathname: string
    search: string
    params: { token: string | null }
    capturedAt: number
}

let initialCapture: InitialURLCapture | null = null

export function captureInitialURL(): InitialURLCapture {
    if (initialCapture !== null) return initialCapture
    const urlParams = new URLSearchParams(window.location.search)
    initialCapture = {
        pathname: window.location.pathname,
        search: window.location.search,
        params: { token: urlParams.get('token') },
        capturedAt: Date.now(),
    }
    return initialCapture
}

export function getInitialURLCapture(): InitialURLCapture | null {
    return initialCapture
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/initialURLCapture.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire token capture into `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { captureInitialURL } from '@/utils/initialURLCapture'
import App from './App'
import './index.css'

// MUST run before React mounts (mirrors app-vendedores).
const capture = captureInitialURL()
if (capture.params.token) {
    localStorage.setItem('access_token', capture.params.token)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: capture ?token= into localStorage before mount"
```

### Task 5: API client with auth interceptors

**Files:**
- Create: `src/api/apiClient.ts`
- Test: `src/api/apiClient.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/api/apiClient.test.ts
import { apiClient } from './apiClient'

describe('apiClient', () => {
    it('adds the Bearer token from localStorage to requests', async () => {
        localStorage.setItem('access_token', 'tok-1')
        const config = await (apiClient.interceptors.request as any).handlers[0].fulfilled({
            headers: {},
        })
        expect(config.headers.Authorization).toBe('Bearer tok-1')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/api/apiClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/api/apiClient.ts`**

> Copy of the app-vendedores interceptor logic (Bearer inject + 401 auto-logout, letting `CRM_*` errors bubble).

```typescript
import axios from 'axios'

const apiUrl: string = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
    baseURL: apiUrl,
    headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(config => {
    const token = localStorage.getItem('access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

apiClient.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            const code: string | undefined = error.response?.data?.code
            if (code?.startsWith('CRM_')) {
                return Promise.reject(error)
            }
            localStorage.removeItem('access_token')
            if (window.location.pathname !== '/login') {
                window.location.reload()
            }
        }
        return Promise.reject(error)
    },
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/api/apiClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: shared axios client with Bearer + 401 interceptors"
```

### Task 6: React Query client + providers + router skeleton

**Files:**
- Create: `src/lib/queryClient.ts`, `src/router/ProtectedRoute.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/lib/queryClient.ts`** (copy from app-vendedores)

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: true,
            refetchOnMount: false,
            refetchOnReconnect: false,
        },
        mutations: { retry: 0 },
    },
})
```

- [ ] **Step 2: Write the failing test for ProtectedRoute**

```tsx
// src/router/ProtectedRoute.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

function renderAt(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<div>agenda</div>} />
                </Route>
                <Route path="/sin-acceso" element={<div>sin acceso</div>} />
            </Routes>
        </MemoryRouter>,
    )
}

it('renders the child route when a token exists', () => {
    localStorage.setItem('access_token', 'tok')
    renderAt('/')
    expect(screen.getByText('agenda')).toBeInTheDocument()
})

it('redirects to /sin-acceso when there is no token', () => {
    localStorage.removeItem('access_token')
    renderAt('/')
    expect(screen.getByText('sin acceso')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/router/ProtectedRoute.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/router/ProtectedRoute.tsx`**

```tsx
import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedRoute() {
    const token = localStorage.getItem('access_token')
    if (!token) return <Navigate to="/sin-acceso" replace />
    return <Outlet />
}
```

- [ ] **Step 5: Compose providers + router in `src/App.tsx`**

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import ProtectedRoute from '@/router/ProtectedRoute'
import AgendaSemanaPage from '@/pages/AgendaSemanaPage'
import AgendaDiaPage from '@/pages/AgendaDiaPage'

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route path="/" element={<AgendaSemanaPage />} />
                        <Route path="/dia/:dia" element={<AgendaDiaPage />} />
                    </Route>
                    <Route
                        path="/sin-acceso"
                        element={
                            <div className="min-h-full grid place-items-center p-6 text-center text-dsmuted">
                                Ingresá desde Versus para acceder a tu agenda.
                            </div>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    )
}
```

> `AgendaSemanaPage`/`AgendaDiaPage` don't exist yet — create temporary stubs returning `<div/>` so the build compiles; they're implemented in Phase 4. Update `src/App.test.tsx` to render within a router or delete it now (superseded by page tests).

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: ProtectedRoute tests PASS. (Remove/replace the obsolete `App.test.tsx` name assertion.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: query client, ProtectedRoute, router skeleton"
```

---

## Phase 2 — Types + API functions + hooks

### Task 7: Shared types

**Files:**
- Create: `src/types/planificacion.ts`

> **⚠️ Corrected 2026-07-23:** the shapes below were updated to match what the backend
> actually implements in `api-vendedores` (`.worktrees/planificacion-backend/src/types/planificacion.ts`),
> which diverged from this plan's original assumption during backend implementation. Real
> differences from the original plan:
> - `IAgendaClient` has **no `rubro`/`direccion`/`telefono`/`horario`** — the source CSV mock
>   has none of those, only `barrio` and a `diaVisita` rotation key (e.g. `"s1d1"` = semana 1,
>   día 1). `descripcionSemana` is a temporary mock-era zone/rotation label.
> - `IVisita` has 3 extra `seguimiento*` fields (Cromo sync state living on the visita row).
> - Visit-closing results are `ISeguimientoResult` (used by both cerrar and no-visita), with
>   `motivoPendiente`/`descripcionParaReintentar` for the retry flow — not just a bare boolean.
> - There's a `/visitas/:id/seguimiento` retry endpoint with its own DTO (see Task 8/17 below).
>
> If you're implementing this and the real backend contract has since changed again, trust the
> actual `src/types/planificacion.ts` in `api-vendedores` over this snippet — verify before coding.

- [ ] **Step 1: Create the types (mirror the backend contract)**

```typescript
export type Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'

export interface IMotivo {
    motivoId: number
    descripcion: string
}

export interface IAgendaClient {
    codigoParticularCliente: string
    nombreCliente: string
    barrio?: string
    diaVisita: string // e.g. "s1d1" — semana 1, día 1 (lunes)
    resuelto?: boolean // undefined in weekly view (only /agenda/dia populates it)
    descripcionSemana?: string // temporary mock-era zone/rotation label
}

export type SemanaAgenda = Record<Dia, IAgendaClient[]>

export interface IVisita {
    visitaId: number
    codigoParticularVendedor: string
    codigoParticularCliente: string
    nombreCliente: string
    fechaInicio: string
    fechaFin: string | null
    coordInicio: string | null
    coordFinal: string | null
    coordCliente: string | null
    seguimientoPendiente: boolean
    seguimientoMotivoPendiente: string | null
    seguimientoDescripcionPendiente: string | null
}

export interface IIniciarVisitaDTO {
    codigoParticularCliente: string
    nombreCliente: string
    coordInicio: string | null
}

export interface ISeguimientoResult {
    seguimientoPendiente: boolean
    motivoPendiente?: string // CRM_NOT_LINKED | CRM_TOKEN_EXPIRED | CRM_CLIENT_NOT_FOUND | CRM_UNAVAILABLE | CRM_UNKNOWN
    descripcionParaReintentar?: string
}

export interface ICerrarVisitaResult extends ISeguimientoResult {}

export interface INoVisitaResult extends ISeguimientoResult {
    visitaId: number
}

export interface IReintentarSeguimientoDTO {
    motivoIds?: number[] // optional override; if omitted, backend retries with the persisted descripcion
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/planificacion.ts
git commit -m "feat: planificacion shared types"
```

### Task 8: API functions

**Files:**
- Create: `src/api/planificacion.ts`
- Test: `src/api/planificacion.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/api/planificacion.test.ts
import { vi } from 'vitest'
import { apiClient } from './apiClient'
import { getMotivos, iniciarVisita, cerrarVisita } from './planificacion'

vi.mock('./apiClient', () => ({
    apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

describe('planificacion API', () => {
    beforeEach(() => vi.clearAllMocks())

    it('getMotivos unwraps data.data', async () => {
        ;(apiClient.get as any).mockResolvedValue({
            data: { ok: 1, data: [{ motivoId: 1, descripcion: 'Precio' }] },
        })
        const motivos = await getMotivos()
        expect(apiClient.get).toHaveBeenCalledWith('/planificacion/motivos')
        expect(motivos).toEqual([{ motivoId: 1, descripcion: 'Precio' }])
    })

    it('iniciarVisita posts the DTO and returns { visitaId }', async () => {
        ;(apiClient.post as any).mockResolvedValue({ data: { ok: 1, data: { visitaId: 42 } } })
        const res = await iniciarVisita({
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            coordInicio: '-34.6,-58.6',
        })
        expect(apiClient.post).toHaveBeenCalledWith('/planificacion/visitas', {
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            coordInicio: '-34.6,-58.6',
        })
        expect(res.visitaId).toBe(42)
    })

    it('cerrarVisita PUTs to the visita id with coordFinal + motivoIds', async () => {
        ;(apiClient.put as any).mockResolvedValue({
            data: { ok: 1, data: { seguimientoPendiente: false } },
        })
        const res = await cerrarVisita(42, { coordFinal: null, motivoIds: [1, 2] })
        expect(apiClient.put).toHaveBeenCalledWith('/planificacion/visitas/42/cerrar', {
            coordFinal: null,
            motivoIds: [1, 2],
        })
        expect(res.seguimientoPendiente).toBe(false)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/api/planificacion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/api/planificacion.ts`**

```typescript
import { apiClient } from './apiClient'
import type {
    IAgendaClient,
    IIniciarVisitaDTO,
    IMotivo,
    INoVisitaResult,
    ICerrarVisitaResult,
    IReintentarSeguimientoDTO,
    ISeguimientoResult,
    IVisita,
    SemanaAgenda,
} from '@/types/planificacion'

// `semana` is an optional rotation key (e.g. "s1") the backend currently defaults to 's1' —
// there is no resolved "current week" business rule yet (see AgendaService.DEFAULT_SEMANA).
// Accept it as an optional param now so callers aren't blocked later; the UI doesn't need to
// pass it for the MVP.
export const getAgendaSemana = async (semana?: string): Promise<SemanaAgenda> => {
    const res = await apiClient.get('/planificacion/agenda/semana', {
        params: semana ? { semana } : undefined,
    })
    return res.data.data
}

export const getAgendaDia = async (
    dia: string,
    fecha: string,
): Promise<IAgendaClient[]> => {
    const res = await apiClient.get('/planificacion/agenda/dia', {
        params: { dia, fecha },
    })
    return res.data.data
}

export const getMotivos = async (): Promise<IMotivo[]> => {
    const res = await apiClient.get('/planificacion/motivos')
    return res.data.data
}

export const getVisitaActiva = async (): Promise<IVisita | null> => {
    const res = await apiClient.get('/planificacion/visitas/activa')
    return res.data.data
}

export const iniciarVisita = async (
    dto: IIniciarVisitaDTO,
): Promise<{ visitaId: number }> => {
    const res = await apiClient.post('/planificacion/visitas', dto)
    return res.data.data
}

export const cerrarVisita = async (
    visitaId: number,
    body: { coordFinal: string | null; motivoIds: number[] },
): Promise<ICerrarVisitaResult> => {
    const res = await apiClient.put(`/planificacion/visitas/${visitaId}/cerrar`, body)
    return res.data.data
}

export const registrarNoVisita = async (body: {
    codigoParticularCliente: string
    nombreCliente: string
    motivoIds: number[]
}): Promise<INoVisitaResult> => {
    const res = await apiClient.post('/planificacion/visitas/no-visita', body)
    return res.data.data
}

/** Retries a failed Cromo sync for a visita that has `seguimientoPendiente: true`. */
export const reintentarSeguimiento = async (
    visitaId: number,
    body: IReintentarSeguimientoDTO = {},
): Promise<ISeguimientoResult> => {
    const res = await apiClient.post(`/planificacion/visitas/${visitaId}/seguimiento`, body)
    return res.data.data
}

/** Reused endpoint: commercial proposal (rubros below average). */
export const getPropuesta = async (
    codigoParticularCliente: string,
): Promise<any> => {
    const res = await apiClient.post('/sale/rubro/recommendations', {
        clientCode: codigoParticularCliente,
    })
    return res.data.data ?? res.data
}
```

> Confirm the exact request shape of `/sale/rubro/recommendations` for a single client against app-vendedores `getRubroRecommendations` / the backend; adjust the body if it expects `sellerCode`/`path` instead of `clientCode`. Type the return with a proper interface once the shape is confirmed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/api/planificacion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/planificacion.ts src/api/planificacion.test.ts
git commit -m "feat: planificacion API functions"
```

### Task 9: React Query hooks (queries)

**Files:**
- Create: `src/hooks/useAgenda.ts`, `src/hooks/useMotivos.ts`
- Test: `src/hooks/useAgenda.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useAgenda.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useAgendaSemana } from './useAgenda'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('useAgendaSemana returns the weekly agenda', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'A' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    const { result } = renderHook(() => useAgendaSemana(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.LUN).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useAgenda.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/useAgenda.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { getAgendaSemana, getAgendaDia } from '@/api/planificacion'

export const agendaKeys = {
    semana: ['agenda', 'semana'] as const,
    dia: (dia: string, fecha: string) => ['agenda', 'dia', dia, fecha] as const,
}

export function useAgendaSemana() {
    return useQuery({
        queryKey: agendaKeys.semana,
        queryFn: getAgendaSemana,
    })
}

export function useAgendaDia(dia: string, fecha: string, enabled = true) {
    return useQuery({
        queryKey: agendaKeys.dia(dia, fecha),
        queryFn: () => getAgendaDia(dia, fecha),
        enabled,
    })
}
```

- [ ] **Step 4: Implement `src/hooks/useMotivos.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { getMotivos } from '@/api/planificacion'

export function useMotivos() {
    return useQuery({
        queryKey: ['motivos'],
        queryFn: getMotivos,
        staleTime: 30 * 60 * 1000,
    })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/hooks/useAgenda.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAgenda.ts src/hooks/useMotivos.ts src/hooks/useAgenda.test.tsx
git commit -m "feat: agenda + motivos query hooks"
```

### Task 10: Visit mutation hooks

**Files:**
- Create: `src/hooks/useVisitas.ts`
- Test: `src/hooks/useVisitas.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useVisitas.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { useIniciarVisita } from './useVisitas'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

it('useIniciarVisita calls the API and returns the visitaId', async () => {
    ;(api.iniciarVisita as any).mockResolvedValue({ visitaId: 42 })
    const { result } = renderHook(() => useIniciarVisita(), { wrapper })
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync({
            codigoParticularCliente: '10034',
            nombreCliente: 'GIONTO',
            coordInicio: null,
        })
    })
    expect(out.visitaId).toBe(42)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useVisitas.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/useVisitas.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    getVisitaActiva,
    iniciarVisita,
    cerrarVisita,
    registrarNoVisita,
} from '@/api/planificacion'
import { agendaKeys } from './useAgenda'

export function useVisitaActiva() {
    return useQuery({ queryKey: ['visita-activa'], queryFn: getVisitaActiva })
}

export function useIniciarVisita() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: iniciarVisita,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visita-activa'] }),
    })
}

export function useCerrarVisita() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: {
            visitaId: number
            coordFinal: string | null
            motivoIds: number[]
        }) => cerrarVisita(args.visitaId, { coordFinal: args.coordFinal, motivoIds: args.motivoIds }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['visita-activa'] })
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['agenda', 'dia'] })
        },
    })
}

export function useNoVisita() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: registrarNoVisita,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: agendaKeys.semana })
            qc.invalidateQueries({ queryKey: ['agenda', 'dia'] })
        },
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useVisitas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVisitas.ts src/hooks/useVisitas.test.tsx
git commit -m "feat: visit mutation hooks (iniciar/cerrar/no-visita)"
```

---

## Phase 3 — Geolocation

### Task 11: useGeolocation hook

**Files:**
- Create: `src/hooks/useGeolocation.ts`
- Test: `src/hooks/useGeolocation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/useGeolocation.test.ts
import { vi } from 'vitest'
import { getCurrentCoord } from './useGeolocation'

describe('getCurrentCoord', () => {
    it('resolves "lat,lng" when permission is granted', async () => {
        const getCurrentPosition = vi.fn((ok: any) =>
            ok({ coords: { latitude: -34.6, longitude: -58.6 } }),
        )
        ;(global.navigator as any).geolocation = { getCurrentPosition }
        const coord = await getCurrentCoord()
        expect(coord).toBe('-34.6,-58.6')
    })

    it('resolves null when the user denies permission', async () => {
        const getCurrentPosition = vi.fn((_ok: any, err: any) => err({ code: 1 }))
        ;(global.navigator as any).geolocation = { getCurrentPosition }
        const coord = await getCurrentCoord()
        expect(coord).toBeNull()
    })

    it('resolves null when geolocation is unavailable', async () => {
        ;(global.navigator as any).geolocation = undefined
        const coord = await getCurrentCoord()
        expect(coord).toBeNull()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/useGeolocation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/useGeolocation.ts`**

```typescript
import { useState } from 'react'

/**
 * Captures ONE position as "lat,lng". Returns null if geolocation is
 * unavailable or the user denies permission — never rejects, so the visit
 * flow is never blocked by a location issue (spec §6/§10).
 */
export function getCurrentCoord(): Promise<string | null> {
    return new Promise(resolve => {
        if (!navigator.geolocation) {
            resolve(null)
            return
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        )
    })
}

/** Hook wrapper: exposes a `capture()` action + the last captured coord + loading state. */
export function useGeolocation() {
    const [coord, setCoord] = useState<string | null>(null)
    const [capturing, setCapturing] = useState(false)

    async function capture(): Promise<string | null> {
        setCapturing(true)
        const c = await getCurrentCoord()
        setCoord(c)
        setCapturing(false)
        return c
    }

    return { coord, capturing, capture }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/useGeolocation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGeolocation.ts src/hooks/useGeolocation.test.ts
git commit -m "feat: geolocation capture (2-point, never blocks)"
```

---

## Phase 4 — Screens

> UI tasks: provide the full component; test the logic-bearing behavior (rendering the right data, the motivo multi-select, disabled/resolved states), not pixel layout. Match the prototype's structure/colors.

### Task 12: App header (DS + week nav + progress)

**Files:**
- Create: `src/components/AppHeader.tsx`
- Test: `src/components/AppHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/AppHeader.test.tsx
import { render, screen } from '@testing-library/react'
import AppHeader from './AppHeader'

it('shows the visit progress out of the total', () => {
    render(<AppHeader vendedorNombre="Martín Rossi" completadas={3} total={40} rangoSemana="13 – 17 Jul" />)
    expect(screen.getByText('3 / 40')).toBeInTheDocument()
    expect(screen.getByText('Martín Rossi')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/AppHeader.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/AppHeader.tsx`**

```tsx
interface AppHeaderProps {
    vendedorNombre: string
    completadas: number
    total: number
    rangoSemana: string
}

export default function AppHeader({ vendedorNombre, completadas, total, rangoSemana }: AppHeaderProps) {
    const pct = total > 0 ? Math.round((completadas / total) * 100) : 0
    return (
        <header className="bg-dsnavy text-white px-4 pt-3 pb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded bg-white/15 text-xs font-bold">DS</span>
                    <div>
                        <div className="text-sm font-bold leading-tight">DistriSuper</div>
                        <div className="text-[11px] text-white/60">Ruta de reparto</div>
                    </div>
                </div>
                <div className="text-right text-sm font-semibold">{vendedorNombre}</div>
            </div>
            <div className="mt-3 text-center text-sm font-bold">Semana {rangoSemana}</div>
            <div className="mt-2">
                <div className="flex justify-between text-[11px] text-white/70">
                    <span>Visitas completadas</span>
                    <span>{completadas} / {total}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded bg-white/20">
                    <div className="h-full rounded bg-dsgreen" style={{ width: `${pct}%` }} />
                </div>
            </div>
        </header>
    )
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm test -- src/components/AppHeader.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppHeader.tsx src/components/AppHeader.test.tsx
git commit -m "feat: app header with week nav + progress"
```

### Task 13: Day tabs

**Files:**
- Create: `src/components/DiaTabs.tsx`
- Test: `src/components/DiaTabs.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/DiaTabs.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import DiaTabs from './DiaTabs'

it('renders each day with its count and fires onSelect', async () => {
    const onSelect = vi.fn()
    render(
        <DiaTabs
            activo="LUN"
            counts={{ LUN: { done: 3, total: 8 }, MAR: { done: 0, total: 8 }, MIE: { done: 0, total: 8 }, JUE: { done: 0, total: 8 }, VIE: { done: 0, total: 8 } }}
            onSelect={onSelect}
        />,
    )
    expect(screen.getByText('LUN')).toBeInTheDocument()
    await userEvent.click(screen.getByText('MAR'))
    expect(onSelect).toHaveBeenCalledWith('MAR')
})
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- src/components/DiaTabs.test.tsx` → FAIL.

- [ ] **Step 3: Implement `src/components/DiaTabs.tsx`**

```tsx
import type { Dia } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface DiaTabsProps {
    activo: Dia
    counts: Record<Dia, { done: number; total: number }>
    onSelect: (dia: Dia) => void
}

export default function DiaTabs({ activo, counts, onSelect }: DiaTabsProps) {
    return (
        <div className="flex gap-2 overflow-x-auto px-3 py-3">
            {DIAS.map(d => {
                const c = counts[d]
                const isActive = d === activo
                return (
                    <button
                        key={d}
                        onClick={() => onSelect(d)}
                        className={`flex min-w-[64px] flex-col items-center rounded-lg border px-3 py-2 text-xs font-semibold ${
                            isActive ? 'border-dsnavy bg-dsnavy text-white' : 'border-slate-200 bg-white text-dsnavy'
                        }`}
                    >
                        <span>{d}</span>
                        <span className={isActive ? 'text-white/70' : 'text-dsmuted'}>
                            {c.done}/{c.total}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiaTabs.tsx src/components/DiaTabs.test.tsx
git commit -m "feat: day tabs with counts"
```

### Task 14: Client card

**Files:**
- Create: `src/components/ClienteCard.tsx`
- Test: `src/components/ClienteCard.test.tsx`

> **⚠️ Corrected 2026-07-23:** the prototype's card shows horario/dirección/teléfono, but the
> real `IAgendaClient` (Task 7) doesn't have those fields yet — the backend's agenda source
> (CSV mock) only provides `barrio` and `descripcionSemana`. Render what's actually available;
> don't invent placeholder direccion/telefono/horario values. This is a known MVP gap, not a
> bug — see the plan's "Known follow-ups" section.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ClienteCard.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ClienteCard from './ClienteCard'

const cliente = {
    codigoParticularCliente: '10034',
    nombreCliente: 'Almacén Don José',
    barrio: 'Centro',
    diaVisita: 's1d1',
    descripcionSemana: 'ALMIRANTE BROWN',
}

it('shows resolved styling and hides the actions when resuelto', () => {
    render(<ClienteCard cliente={{ ...cliente, resuelto: true }} onAbrir={vi.fn()} />)
    expect(screen.getByText('Almacén Don José')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
})

it('fires onAbrir when tapped and not resolved', async () => {
    const onAbrir = vi.fn()
    render(<ClienteCard cliente={cliente} onAbrir={onAbrir} />)
    await userEvent.click(screen.getByText('Almacén Don José'))
    expect(onAbrir).toHaveBeenCalledWith('10034')
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement `src/components/ClienteCard.tsx`**

```tsx
import { Check } from 'lucide-react'
import type { IAgendaClient } from '@/types/planificacion'

interface ClienteCardProps {
    cliente: IAgendaClient
    onAbrir: (codigo: string) => void
}

export default function ClienteCard({ cliente, onAbrir }: ClienteCardProps) {
    const resuelto = !!cliente.resuelto
    return (
        <div
            onClick={() => !resuelto && onAbrir(cliente.codigoParticularCliente)}
            className={`rounded-xl border p-3 ${resuelto ? 'border-dsgreen/40 bg-dsgreen/5' : 'border-slate-200 bg-white'}`}
        >
            <div className="flex items-start justify-between">
                {cliente.descripcionSemana && (
                    <div className="text-xs font-semibold text-dsgreen">{cliente.descripcionSemana}</div>
                )}
                {resuelto && <Check className="h-5 w-5 rounded-full bg-dsgreen p-0.5 text-white" />}
            </div>
            <div className={`mt-1 font-bold text-dsnavy ${resuelto ? 'line-through opacity-70' : ''}`}>
                {cliente.nombreCliente}
            </div>
            {cliente.barrio && <div className="mt-1 text-xs text-dsmuted">📍 {cliente.barrio}</div>}
            {!resuelto && (
                <button
                    onClick={e => {
                        e.stopPropagation()
                        onAbrir(cliente.codigoParticularCliente)
                    }}
                    className="mt-3 w-full rounded-lg bg-dsnavy py-2 text-sm font-semibold text-white"
                >
                    Iniciar visita
                </button>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ClienteCard.tsx src/components/ClienteCard.test.tsx
git commit -m "feat: client card with resolved state"
```

### Task 15: Bottom sheet primitive

**Files:**
- Create: `src/components/ui/BottomSheet.tsx`
- Test: `src/components/ui/BottomSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/BottomSheet.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import BottomSheet from './BottomSheet'

it('renders children when open and fires onClose', async () => {
    const onClose = vi.fn()
    render(
        <BottomSheet open onClose={onClose} title="Propuesta">
            <div>contenido</div>
        </BottomSheet>,
    )
    expect(screen.getByText('contenido')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Cerrar'))
    expect(onClose).toHaveBeenCalled()
})

it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} title="X"><div>c</div></BottomSheet>)
    expect(screen.queryByText('c')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement `src/components/ui/BottomSheet.tsx`**

```tsx
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface BottomSheetProps {
    open: boolean
    onClose: () => void
    title: string
    eyebrow?: string
    children: ReactNode
}

export default function BottomSheet({ open, onClose, title, eyebrow, children }: BottomSheetProps) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
            <div
                className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5"
                onClick={e => e.stopPropagation()}
            >
                <div className="mx-auto mb-3 h-1 w-10 rounded bg-slate-300" />
                <div className="flex items-start justify-between">
                    <div>
                        {eyebrow && <div className="text-[11px] font-bold uppercase tracking-wide text-dsgreen">{eyebrow}</div>}
                        <h2 className="text-lg font-bold text-dsnavy">{title}</h2>
                    </div>
                    <button aria-label="Cerrar" onClick={onClose} className="rounded-full bg-slate-100 p-1.5 text-slate-500">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="mt-3">{children}</div>
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/BottomSheet.tsx src/components/ui/BottomSheet.test.tsx
git commit -m "feat: bottom sheet primitive"
```

### Task 16: Resolución sheet (motivo multi-select + cerrar)

**Files:**
- Create: `src/components/ResolucionSheet.tsx`
- Test: `src/components/ResolucionSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ResolucionSheet.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ResolucionSheet from './ResolucionSheet'

const motivos = [
    { motivoId: 1, descripcion: 'Saqué pedido' },
    { motivoId: 4, descripcion: 'Precio' },
]

it('toggles motivos and submits the selected ids', async () => {
    const onConfirm = vi.fn()
    render(
        <ResolucionSheet open motivos={motivos} confirmLabel="Cerrar visita" onConfirm={onConfirm} onClose={vi.fn()} />,
    )
    await userEvent.click(screen.getByText('Saqué pedido'))
    await userEvent.click(screen.getByText('Precio'))
    await userEvent.click(screen.getByText('Saqué pedido')) // toggle off
    await userEvent.click(screen.getByRole('button', { name: /cerrar visita/i }))
    expect(onConfirm).toHaveBeenCalledWith([4])
})

it('disables confirm when nothing is selected', () => {
    render(<ResolucionSheet open motivos={motivos} confirmLabel="Cerrar visita" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeDisabled()
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement `src/components/ResolucionSheet.tsx`**

```tsx
import { useState } from 'react'
import BottomSheet from './ui/BottomSheet'
import type { IMotivo } from '@/types/planificacion'

interface ResolucionSheetProps {
    open: boolean
    motivos: IMotivo[]
    confirmLabel: string
    onConfirm: (motivoIds: number[]) => void
    onClose: () => void
    submitting?: boolean
}

export default function ResolucionSheet({ open, motivos, confirmLabel, onConfirm, onClose, submitting }: ResolucionSheetProps) {
    const [selected, setSelected] = useState<number[]>([])

    function toggle(id: number) {
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    }

    return (
        <BottomSheet open={open} onClose={onClose} title="Resolución" eyebrow="Propuesta comercial">
            <div className="flex flex-col gap-2">
                {motivos.map(m => {
                    const on = selected.includes(m.motivoId)
                    return (
                        <button
                            key={m.motivoId}
                            onClick={() => toggle(m.motivoId)}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm font-semibold ${
                                on ? 'border-dsnavy bg-dsnavy/5 text-dsnavy' : 'border-slate-200 text-dsnavy'
                            }`}
                        >
                            <span className={`grid h-5 w-5 place-items-center rounded ${on ? 'bg-dsnavy text-white' : 'border border-slate-300'}`}>
                                {on ? '✓' : ''}
                            </span>
                            {m.descripcion}
                        </button>
                    )
                })}
            </div>
            <button
                disabled={selected.length === 0 || submitting}
                onClick={() => onConfirm(selected)}
                className="mt-4 w-full rounded-lg bg-dsgreen py-3 text-sm font-bold text-white disabled:opacity-40"
            >
                {submitting ? 'Guardando…' : confirmLabel}
            </button>
        </BottomSheet>
    )
}
```

- [ ] **Step 4: Run to verify it passes** — PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ResolucionSheet.tsx src/components/ResolucionSheet.test.tsx
git commit -m "feat: resolucion sheet (motivo multi-select)"
```

### Task 17: Propuesta sheet + Versus view

**Files:**
- Create: `src/hooks/usePropuesta.ts`, `src/components/PropuestaSheet.tsx`, `src/components/VersusView.tsx`
- Test: `src/components/PropuestaSheet.test.tsx`

- [ ] **Step 1: Implement `src/hooks/usePropuesta.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { getPropuesta } from '@/api/planificacion'

export function usePropuesta(codigoCliente: string | null) {
    return useQuery({
        queryKey: ['propuesta', codigoCliente],
        queryFn: () => getPropuesta(codigoCliente as string),
        enabled: !!codigoCliente,
    })
}
```

- [ ] **Step 2: Write the failing test for PropuestaSheet**

```tsx
// src/components/PropuestaSheet.test.tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import PropuestaSheet from './PropuestaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrap(ui: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

it('shows the rubros returned by the proposal endpoint', async () => {
    ;(api.getPropuesta as any).mockResolvedValue({ rubros: [{ nombre: 'Amortiguadores' }] })
    render(
        wrap(
            <PropuestaSheet open codigoCliente="10034" nombreCliente="Don José" onIniciarVisita={vi.fn()} onClose={vi.fn()} />,
        ),
    )
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run to verify it fails** — FAIL.

- [ ] **Step 4: Implement `src/components/PropuestaSheet.tsx`**

> Renders the proposal (rubros below average) and the CTA to start the visit. The exact `data` shape depends on `/sale/rubro/recommendations` — adapt the `.rubros` mapping to the confirmed shape (Task 8 note). Keep the render defensive (optional chaining).

```tsx
import BottomSheet from './ui/BottomSheet'
import { usePropuesta } from '@/hooks/usePropuesta'

interface PropuestaSheetProps {
    open: boolean
    codigoCliente: string | null
    nombreCliente: string
    onIniciarVisita: () => void
    onVerVersus?: () => void
    onClose: () => void
}

export default function PropuestaSheet({ open, codigoCliente, nombreCliente, onIniciarVisita, onVerVersus, onClose }: PropuestaSheetProps) {
    const { data, isLoading } = usePropuesta(open ? codigoCliente : null)
    const rubros: Array<{ nombre: string }> = data?.rubros ?? []

    return (
        <BottomSheet open={open} onClose={onClose} title={nombreCliente} eyebrow="Propuesta comercial">
            <p className="text-[13px] text-dsmuted">
                Rubros donde compra <b className="text-dsred">por debajo del promedio</b> de la zona. Oportunidad de propuesta:
            </p>
            {isLoading ? (
                <div className="mt-3 text-sm text-dsmuted">Cargando propuesta…</div>
            ) : (
                <ul className="mt-3 flex flex-col gap-2">
                    {rubros.map((r, i) => (
                        <li key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-dsnavy">
                            {r.nombre}
                        </li>
                    ))}
                    {rubros.length === 0 && <li className="text-sm text-dsmuted">Sin oportunidades destacadas.</li>}
                </ul>
            )}
            <div className="mt-4 flex gap-2">
                {onVerVersus && (
                    <button onClick={onVerVersus} className="flex-1 rounded-lg border border-dsnavy py-3 text-sm font-semibold text-dsnavy">
                        Versus
                    </button>
                )}
                <button onClick={onIniciarVisita} className="flex-1 rounded-lg bg-dsnavy py-3 text-sm font-bold text-white">
                    Iniciar visita
                </button>
            </div>
        </BottomSheet>
    )
}
```

- [ ] **Step 5: Implement a minimal `src/components/VersusView.tsx`**

> Versus reuses the existing `/sale/analytics` motor. For the MVP, embed the seller/client sales view. Start with a focused placeholder that fetches and shows the client's sales summary; expand against the real analytics shape.

```tsx
interface VersusViewProps {
    codigoCliente: string
    onBack: () => void
}

export default function VersusView({ codigoCliente, onBack }: VersusViewProps) {
    return (
        <div className="p-4">
            <button onClick={onBack} className="text-sm font-semibold text-dsnavy">‹ Volver</button>
            <h2 className="mt-2 text-lg font-bold text-dsnavy">Versus — {codigoCliente}</h2>
            <p className="mt-2 text-sm text-dsmuted">
                Vista de ventas/propuestas del cliente (motor `/sale/analytics`). Integrar la vista de evolución por SR.
            </p>
        </div>
    )
}
```

> This VersusView is intentionally minimal for the MVP walking skeleton. A follow-up task should wire it to `/sale/analytics` reusing app-vendedores' analytics components; scope that once the primary flow works end-to-end.

- [ ] **Step 6: Run to verify PropuestaSheet passes** — `npm test -- src/components/PropuestaSheet.test.tsx` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePropuesta.ts src/components/PropuestaSheet.tsx src/components/VersusView.tsx src/components/PropuestaSheet.test.tsx
git commit -m "feat: propuesta sheet + versus view stub"
```

---

## Phase 5 — Pages (compose the flow)

### Task 18: AgendaSemanaPage

**Files:**
- Create: `src/pages/AgendaSemanaPage.tsx`
- Test: `src/pages/AgendaSemanaPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/AgendaSemanaPage.test.tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AgendaSemanaPage from './AgendaSemanaPage'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrap(ui: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
}

it('renders clients from the weekly agenda', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'Almacén Don José' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    render(wrap(<AgendaSemanaPage />))
    expect(await screen.findByText('Almacén Don José')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement `src/pages/AgendaSemanaPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import AppHeader from '@/components/AppHeader'
import DiaTabs from '@/components/DiaTabs'
import ClienteCard from '@/components/ClienteCard'
import PropuestaSheet from '@/components/PropuestaSheet'
import ResolucionSheet from '@/components/ResolucionSheet'
import { useAgendaSemana } from '@/hooks/useAgenda'
import { useMotivos } from '@/hooks/useMotivos'
import { useIniciarVisita, useCerrarVisita, useVisitaActiva } from '@/hooks/useVisitas'
import { getCurrentCoord } from '@/hooks/useGeolocation'
import type { Dia, IAgendaClient } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

export default function AgendaSemanaPage() {
    const { data: semana } = useAgendaSemana()
    const { data: motivos = [] } = useMotivos()
    const { data: visitaActiva } = useVisitaActiva()
    const iniciar = useIniciarVisita()
    const cerrar = useCerrarVisita()

    const [diaActivo, setDiaActivo] = useState<Dia>('LUN')
    const [propuestaCliente, setPropuestaCliente] = useState<IAgendaClient | null>(null)
    const [resolviendo, setResolviendo] = useState(false)

    const counts = useMemo(() => {
        const c = {} as Record<Dia, { done: number; total: number }>
        for (const d of DIAS) {
            const clientes = semana?.[d] ?? []
            c[d] = { done: clientes.filter(x => x.resuelto).length, total: clientes.length }
        }
        return c
    }, [semana])

    const totalClientes = DIAS.reduce((n, d) => n + (semana?.[d]?.length ?? 0), 0)
    const totalDone = DIAS.reduce((n, d) => n + (semana?.[d]?.filter(x => x.resuelto).length ?? 0), 0)
    const clientesDia = semana?.[diaActivo] ?? []

    async function abrirCliente(codigo: string) {
        const cliente = clientesDia.find(c => c.codigoParticularCliente === codigo) ?? null
        setPropuestaCliente(cliente)
    }

    async function onIniciarVisita() {
        if (!propuestaCliente) return
        const coord = await getCurrentCoord()
        await iniciar.mutateAsync({
            codigoParticularCliente: propuestaCliente.codigoParticularCliente,
            nombreCliente: propuestaCliente.nombreCliente,
            coordInicio: coord,
        })
        setResolviendo(true)
    }

    async function onCerrar(motivoIds: number[]) {
        if (!visitaActiva) return
        const coord = await getCurrentCoord()
        const res = await cerrar.mutateAsync({ visitaId: visitaActiva.visitaId, coordFinal: coord, motivoIds })
        setResolviendo(false)
        setPropuestaCliente(null)
        if (res.seguimientoPendiente) {
            window.alert('Visita cerrada. El seguimiento en Cromo quedó pendiente de sincronizar.')
        }
    }

    return (
        <div className="min-h-full">
            <AppHeader vendedorNombre="" completadas={totalDone} total={totalClientes} rangoSemana="" />
            <DiaTabs activo={diaActivo} counts={counts} onSelect={setDiaActivo} />
            <div className="flex flex-col gap-3 px-3 pb-24">
                {clientesDia.map(c => (
                    <ClienteCard key={c.codigoParticularCliente} cliente={c} onAbrir={abrirCliente} />
                ))}
                {clientesDia.length === 0 && (
                    <div className="mt-8 text-center text-sm text-dsmuted">Sin clientes para {diaActivo}.</div>
                )}
            </div>

            <PropuestaSheet
                open={!!propuestaCliente && !resolviendo}
                codigoCliente={propuestaCliente?.codigoParticularCliente ?? null}
                nombreCliente={propuestaCliente?.nombreCliente ?? ''}
                onIniciarVisita={onIniciarVisita}
                onClose={() => setPropuestaCliente(null)}
            />
            <ResolucionSheet
                open={resolviendo}
                motivos={motivos}
                confirmLabel="Cerrar visita"
                submitting={cerrar.isPending}
                onConfirm={onCerrar}
                onClose={() => setResolviendo(false)}
            />
        </div>
    )
}
```

> `AppHeader` receives empty `vendedorNombre`/`rangoSemana` here — wire the real seller name (from the auth `/me` or token claims) and computed week range in a follow-up; the walking skeleton renders and the flow works without them.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Delete the temporary `AgendaDiaPage` stub route or implement it**

For the MVP the day view is folded into the weekly page via tabs, so `AgendaDiaPage` is optional. Either implement it as a filtered view reusing the same components, or remove its route from `App.tsx`. Decide and make the build consistent.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: agenda semana page composing the full visit flow"
```

### Task 19: Reagendar / No visito action

**Files:**
- Modify: `src/components/ClienteCard.tsx`, `src/pages/AgendaSemanaPage.tsx`
- Test: `src/pages/AgendaSemanaPage.noVisita.test.tsx`

- [ ] **Step 1: Add a "No visito" affordance to `ClienteCard`**

Add a secondary button (only when not resuelto), next to "Iniciar visita":
```tsx
<button
    onClick={e => { e.stopPropagation(); onNoVisita?.(cliente.codigoParticularCliente) }}
    className="mt-2 w-full rounded-lg border border-slate-300 py-2 text-sm font-semibold text-dsmuted"
>
    Reagendar / No visito
</button>
```
Add `onNoVisita?: (codigo: string) => void` to `ClienteCardProps`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/pages/AgendaSemanaPage.noVisita.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AgendaSemanaPage from './AgendaSemanaPage'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrap(ui: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
}

it('opens the resolución sheet for no-visita and calls the API', async () => {
    ;(api.getAgendaSemana as any).mockResolvedValue({
        LUN: [{ codigoParticularCliente: '1', nombreCliente: 'Don José' }],
        MAR: [], MIE: [], JUE: [], VIE: [],
    })
    ;(api.getMotivos as any).mockResolvedValue([{ motivoId: 9, descripcion: 'Vacaciones' }])
    ;(api.getVisitaActiva as any).mockResolvedValue(null)
    ;(api.registrarNoVisita as any).mockResolvedValue({ visitaId: 77, seguimientoPendiente: false })

    render(wrap(<AgendaSemanaPage />))
    await userEvent.click(await screen.findByRole('button', { name: /reagendar \/ no visito/i }))
    await userEvent.click(await screen.findByText('Vacaciones'))
    await userEvent.click(screen.getByRole('button', { name: /registrar/i }))
    expect(api.registrarNoVisita).toHaveBeenCalledWith(
        expect.objectContaining({ codigoParticularCliente: '1', motivoIds: [9] }),
    )
})
```

- [ ] **Step 3: Run to verify it fails** — FAIL.

- [ ] **Step 4: Wire no-visita in `AgendaSemanaPage`**

Add `useNoVisita`, a `noVisitaCliente` state, a second `ResolucionSheet` with `confirmLabel="Registrar"`:
```tsx
import { useNoVisita } from '@/hooks/useVisitas'
// ...
const noVisita = useNoVisita()
const [noVisitaCliente, setNoVisitaCliente] = useState<IAgendaClient | null>(null)

async function onNoVisita(codigo: string) {
    const cliente = clientesDia.find(c => c.codigoParticularCliente === codigo) ?? null
    setNoVisitaCliente(cliente)
}

async function onConfirmNoVisita(motivoIds: number[]) {
    if (!noVisitaCliente) return
    const res = await noVisita.mutateAsync({
        codigoParticularCliente: noVisitaCliente.codigoParticularCliente,
        nombreCliente: noVisitaCliente.nombreCliente,
        motivoIds,
    })
    setNoVisitaCliente(null)
    if (res.seguimientoPendiente) {
        window.alert('Registrado. El seguimiento en Cromo quedó pendiente de sincronizar.')
    }
}
```
Pass `onNoVisita` to each `ClienteCard`, and render:
```tsx
<ResolucionSheet
    open={!!noVisitaCliente}
    motivos={motivos}
    confirmLabel="Registrar"
    submitting={noVisita.isPending}
    onConfirm={onConfirmNoVisita}
    onClose={() => setNoVisitaCliente(null)}
/>
```

- [ ] **Step 5: Run to verify it passes** — PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: reagendar/no-visito flow"
```

---

## Phase 6 — PWA + deploy

### Task 20: PWA (installable)

**Files:**
- Modify: `vite.config.ts`, `index.html`
- Create: PWA icons under `public/`

- [ ] **Step 1: Install the plugin**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Configure `vite-plugin-pwa` in `vite.config.ts`**

```typescript
import { VitePWA } from 'vite-plugin-pwa'
// inside plugins: [...]
VitePWA({
    registerType: 'autoUpdate',
    manifest: {
        name: 'DistriSuper — Planificación',
        short_name: 'Planificación',
        theme_color: '#182645',
        background_color: '#eef1f6',
        display: 'standalone',
        start_url: '/',
        icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
    },
})
```

- [ ] **Step 3: Add the two PNG icons to `public/`** (192×192 and 512×512, DS navy background).

- [ ] **Step 4: Verify the production build emits a manifest + service worker**

Run: `npm run build`
Expected: `dist/manifest.webmanifest` and `dist/sw.js` (or `registerSW.js`) are generated, no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PWA manifest + service worker (installable)"
```

### Task 21: Firebase Hosting

**Files:**
- Create: `firebase.json`, `.firebaserc`

- [ ] **Step 1: Create `firebase.json`** (SPA rewrite to `index.html`, matching app-vendedores)

```json
{
    "hosting": {
        "public": "dist",
        "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
        "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
}
```

- [ ] **Step 2: Create `.firebaserc`**

```json
{ "projects": { "default": "<firebase-project-id>" } }
```
> Use a NEW Firebase project id for this app (do NOT reuse app-vendedores' `app-vendedores-taco`). Confirm the project id with the team.

- [ ] **Step 3: Build and deploy (manual, requires firebase login)**

```bash
npm run build
npx firebase-tools deploy --only hosting
```
Expected: deploy succeeds and prints the hosting URL. Open it on a phone, add to home screen, and verify the app loads with a valid `?token=`.

- [ ] **Step 4: Commit**

```bash
git add firebase.json .firebaserc
git commit -m "chore: Firebase Hosting config"
```

---

## Self-review notes (traceability to spec)

- Spec §2/§5 flujo → AgendaSemanaPage (Task 18) composes agenda → propuesta → iniciar → resolución → cerrar; no-visita (Task 19).
- Spec §3 stack (Vite + React 19 + PWA + Tailwind + React Query + axios) → Tasks 1–6, 20.
- Spec §5 auth (token via URL, Bearer, 401 logout) → Tasks 4–5 (mirrors app-vendedores).
- Spec §6 geolocation (2 points, never blocks) → useGeolocation (Task 11); wired at iniciar/cerrar (Task 18).
- Spec §7 duplicados (resolved card) → `resuelto` flag on ClienteCard (Task 14); backend `getDia`/`getSemana` supplies it.
- Spec §8 motivos (read-only picklist, multi-select) → useMotivos (Task 9) + ResolucionSheet (Task 16).
- Spec §9 Cromo pending → `seguimientoPendiente` surfaced to the user on close/no-visita (Tasks 18–19).
- Spec §10 errors → 401 interceptor (Task 5); geoloc denied → null coords accepted (Task 11); Cromo pending alert (Tasks 18–19).

## Known follow-ups (out of MVP walking skeleton, track separately)

- Wire real seller name + week range into `AppHeader` (from auth `/me` or token claims).
- Flesh out `VersusView` against `/sale/analytics` reusing app-vendedores analytics components.
- Confirm `/sale/rubro/recommendations` request/response shape and type `getPropuesta` + `PropuestaSheet` accordingly.
- Map the 2 geo points on a Leaflet map in the visit detail (spec mentions Leaflet; the MVP captures/stores coords without needing to render them).
- Decide AgendaDiaPage (separate route) vs. tabs-only (current) and make routing consistent.
- Build a retry UI for `seguimientoPendiente` visits using `reintentarSeguimiento` (Task 8) —
  the MVP only surfaces the pending state via `window.alert`; the backend already persists
  `motivoPendiente`/`descripcionParaReintentar` so a later pass can offer a real "reintentar" action.
- Render `barrio`/`descripcionSemana` is a stand-in for the missing dirección/teléfono/horario —
  revisit `ClienteCard` once the warehouse's real `DIAVISITA`/contact fields ship (see backend's
  `docs/superpowers/plans/2026-07-22-backend-findings.md` Step 2).
