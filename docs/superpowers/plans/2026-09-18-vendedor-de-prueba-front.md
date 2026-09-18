# Vendedor de prueba — Plan de implementación, parte 2: app-planificacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`../specs/2026-09-17-modo-prueba-gerencia-design.md`](../specs/2026-09-17-modo-prueba-gerencia-design.md).
**Depende de:** [`2026-09-18-vendedor-de-prueba-api.md`](2026-09-18-vendedor-de-prueba-api.md) deployado
(este plan consume `GET /planificacion/me` y `POST /planificacion/prueba/reiniciar`). Durante el
desarrollo se puede apuntar `VITE_API_URL` al preview del backend.

**Repo:** este (`app-planificacion`), rama desde `master`.

**Goal:** Que gerencia y `tester` entren a la app del vendedor con su usuario de siempre, vean un
banner ámbar que dice en qué están parados, elijan con qué cartera arrancar, puedan reiniciar, y
que el front decida con las capacidades del backend en vez de con una tabla de roles.

**Architecture:** `AuthContext` pide `GET /planificacion/me` después del `me` de auth y expone
`capacidades`, `vendedoresVisibles` y `vendedorDePrueba`. `roles.ts` deja de conocer roles: sus
predicados reciben capacidades. `ProtectedRoute` y `App.tsx` filtran por capacidad. Un
`BannerPrueba` fijo arriba (z-index por encima de los sheets) y un `CarteraDialog` para elegir origen
al reiniciar. Los textos que cambian en prueba leen `estaProbando` del contexto.

**Tech Stack:** Vite + React 19 + TypeScript, React Query v5, react-router-dom, Radix AlertDialog
(`ConfirmDialog`), Tailwind, Vitest + Testing Library.

## Global Constraints

- **El front no tiene tabla de roles.** Ningún literal `'admin'`, `'versus-ger'`, `'supervisor'`,
  `'tester'`, `'tv'` en `src/` salvo en tests. Un test lo verifica (Task 2).
- El vendedor real **no ve ningún cambio**: sin banner, sin diálogo, sin textos nuevos.
- Textos exactos:
  - Banner: `Modo prueba · {descripcion} · nada de esto cuenta ni llega a Cromo` (sin `descripcion`
    cuando es `null`: `Modo prueba · nada de esto cuenta ni llega a Cromo`).
  - Botones del banner: `Reiniciar`, `Volver a analítica`.
  - Acción de menú: `Probar la app del vendedor`.
  - Diálogo: título `¿Con qué cartera querés arrancar?`; opción `Arrancar vacío`; confirmación
    `Se borran todas tus visitas de prueba y la agenda vuelve a empezar. Los datos reales no se tocan.`;
    botón `Reiniciar`.
  - Aviso de coordenada en prueba: `En modo prueba la corrección no se guarda de forma permanente.`
  - Roster de ruta: `Mi vendedor de prueba`.
- Ámbar del banner: fondo `#FDE68A`, texto `#78350F`. No rojo (`dsred` es de `alejado`).
- Banner `fixed top-0 inset-x-0 z-[55]`: por encima del `BottomSheet` (`z-50`) y debajo del
  `ConfirmDialog` (`z-[60]`) y la `Notification` (`z-[70]`).
- Tests: `npm test` (vitest). Lint: `npm run lint`. Build: `npm run build`.
- Commits chicos, en español, prefijo `feat(prueba):` / `test(prueba):` / `docs(prueba):`, cerrando con
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Mapa de archivos

| archivo | responsabilidad |
|---|---|
| `src/types/planificacion.ts` (modificar) | `ICapacidades`, `IVendedorDePrueba`, `IMePlanificacion`. |
| `src/api/planificacion.ts` (modificar) | `getMePlanificacion()`, `reiniciarPrueba(origen)`. |
| `src/lib/roles.ts` (reescribir) | Predicados sobre capacidades; `rutaInicialPara(capacidades)`. |
| `src/context/AuthContext.tsx` (modificar) | Pide `/me`; expone `capacidades`, `vendedoresVisibles`, `vendedorDePrueba`, `refrescarMe`. |
| `src/router/ProtectedRoute.tsx`, `src/App.tsx` (modificar) | Guardas por capacidad. |
| `src/hooks/usePrueba.ts` (crear) | `useReiniciarPrueba()`. |
| `src/components/prueba/CarteraDialog.tsx` (crear) | Elegir origen + confirmar + reiniciar. |
| `src/components/prueba/BannerPrueba.tsx` (crear) | La franja ámbar. |
| `src/components/AccountMenu.tsx` (modificar) | Prop `acciones` opcional. |
| `src/pages/AgendaSemanaPage.tsx`, `AnaliticaPage.tsx`, `AnaliticaActividadPage.tsx`, `AnaliticaVendedorPage.tsx`, `RutaPage.tsx` (modificar) | Banner, entrada, roster. |
| `src/components/VisitaFlow.tsx`, `src/components/ClienteCard.tsx` (modificar) | Textos en prueba. |
| `CLAUDE.md`, `docs/dominio/modelo.md` (modificar) | Documentación viva. |

---

### Task 1: Tipos y llamadas a la API

**Files:**
- Modify: `src/types/planificacion.ts`
- Modify: `src/api/planificacion.ts`
- Test: `src/api/planificacion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ICapacidades {
      operaComoVendedor: boolean
      operaComoVendedorDePrueba: boolean
      superviseVendedores: boolean
  }
  export interface IVendedorDePrueba {
      codigo: string
      descripcion: string | null
      origenesDisponibles: string[]
  }
  export interface IMePlanificacion {
      rol: string
      capacidades: ICapacidades
      vendedoresVisibles: string[] | null
      vendedorDePrueba: IVendedorDePrueba | null
  }
  export const getMePlanificacion: () => Promise<IMePlanificacion>
  export const reiniciarPrueba: (origen: string | null) => Promise<IVendedorDePrueba>
  ```

- [ ] **Step 1: Tests que fallan**

Abrir `src/api/planificacion.test.ts`, copiar cómo mockea `apiClient` (busca `vi.mock('./apiClient'`
o `vi.mock('@/api/apiClient'`) y agregar:

```ts
describe('vendedor de prueba', () => {
    it('getMePlanificacion pega a GET /planificacion/me y devuelve data', async () => {
        const me = {
            rol: 'admin',
            capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
            vendedoresVisibles: null,
            vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2'] },
        }
        mockedGet.mockResolvedValue({ data: { ok: 1, data: me } })
        await expect(getMePlanificacion()).resolves.toEqual(me)
        expect(mockedGet).toHaveBeenCalledWith('/planificacion/me')
    })

    it('reiniciarPrueba manda { origen } al POST y devuelve el vendedorDePrueba', async () => {
        const vp = { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: ['V 2'] }
        mockedPost.mockResolvedValue({ data: { ok: 1, data: vp } })
        await expect(reiniciarPrueba('V 2')).resolves.toEqual(vp)
        expect(mockedPost).toHaveBeenCalledWith('/planificacion/prueba/reiniciar', { origen: 'V 2' })
    })

    it('reiniciarPrueba con null manda { origen: null } (arrancar vacío)', async () => {
        mockedPost.mockResolvedValue({ data: { ok: 1, data: {} } })
        await reiniciarPrueba(null)
        expect(mockedPost).toHaveBeenCalledWith('/planificacion/prueba/reiniciar', { origen: null })
    })
})
```

(`mockedGet`/`mockedPost` son los nombres que el archivo ya use para `apiClient.get`/`.post`; si no
hay `post` mockeado, agregarlo igual que `get`.)

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: FAIL — funciones no exportadas.

- [ ] **Step 3: Implementar**

En `src/types/planificacion.ts`, al final, pegar las tres interfaces del bloque **Interfaces**.

En `src/api/planificacion.ts`, importar los tipos y agregar al final:

```ts
// ── Identidad y vendedor de prueba ──────────────────────────────────────────────

/** Qué puede hacer el usuario en planificación, según el backend. El front NO tiene tabla de
 *  roles: decide con esto (spec 2026-09-17, "GET /planificacion/me"). */
export const getMePlanificacion = async (): Promise<IMePlanificacion> => {
    const res = await apiClient.get('/planificacion/me')
    return res.data.data
}

/** Borra todo lo del vendedor de prueba del usuario y lo vuelve a crear como copia del plan de
 *  `origen`, o vacío con `null`. El código del vendedor de prueba nunca viaja: sale del token. */
export const reiniciarPrueba = async (origen: string | null): Promise<IVendedorDePrueba> => {
    const res = await apiClient.post('/planificacion/prueba/reiniciar', { origen })
    return res.data.data
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacion.ts src/api/planificacion.test.ts
git commit -m "feat(prueba): tipos y llamadas getMePlanificacion / reiniciarPrueba

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `roles.ts` deja de conocer roles

**Files:**
- Rewrite: `src/lib/roles.ts`
- Test: `src/lib/roles.test.ts` (crear)

**Interfaces:**
- Consumes: `ICapacidades` (Task 1).
- Produces:
  ```ts
  export const puedeOperarComoVendedor: (c: ICapacidades | null | undefined) => boolean
  export const supervisa: (c: ICapacidades | null | undefined) => boolean
  export const estaProbando: (c: ICapacidades | null | undefined) => boolean
  export const rutaInicialPara: (c: ICapacidades | null | undefined) => string | null
  ```
  **Se eliminan** `ROLES_GERENCIA`, `esRolGerencia`, `esRolVendedor`. Los callers se corrigen en
  Tasks 3 y 4 (hasta entonces el build rompe: es esperado, se hace en la misma rama).

- [ ] **Step 1: Test que falla**

```ts
// src/lib/roles.test.ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { estaProbando, puedeOperarComoVendedor, rutaInicialPara, supervisa } from './roles'

const cap = (o: Partial<{ v: boolean; p: boolean; s: boolean }>) => ({
    operaComoVendedor: o.v ?? false,
    operaComoVendedorDePrueba: o.p ?? false,
    superviseVendedores: o.s ?? false,
})

describe('roles.ts — predicados sobre capacidades', () => {
    it('vendedor: opera, no supervisa, no está probando, arranca en /', () => {
        const c = cap({ v: true })
        expect(puedeOperarComoVendedor(c)).toBe(true)
        expect(supervisa(c)).toBe(false)
        expect(estaProbando(c)).toBe(false)
        expect(rutaInicialPara(c)).toBe('/')
    })

    it('gerencia: opera (como prueba), supervisa, está probando, arranca en /analitica', () => {
        const c = cap({ p: true, s: true })
        expect(puedeOperarComoVendedor(c)).toBe(true)
        expect(supervisa(c)).toBe(true)
        expect(estaProbando(c)).toBe(true)
        expect(rutaInicialPara(c)).toBe('/analitica')
    })

    it('tester: opera como prueba, no supervisa, arranca en /', () => {
        const c = cap({ p: true })
        expect(puedeOperarComoVendedor(c)).toBe(true)
        expect(supervisa(c)).toBe(false)
        expect(estaProbando(c)).toBe(true)
        expect(rutaInicialPara(c)).toBe('/')
    })

    it('un TV futuro (supervisa, no prueba): arranca en /analitica y no opera como vendedor', () => {
        const c = cap({ s: true })
        expect(puedeOperarComoVendedor(c)).toBe(false)
        expect(rutaInicialPara(c)).toBe('/analitica')
    })

    it('sin capacidades (marketing) → sin acceso', () => {
        expect(rutaInicialPara(cap({}))).toBeNull()
        expect(rutaInicialPara(null)).toBeNull()
        expect(rutaInicialPara(undefined)).toBeNull()
    })

    it('el módulo no contiene ningún rol como literal (la tabla de roles vive en el backend)', () => {
        const fuente = readFileSync(resolve(__dirname, 'roles.ts'), 'utf8')
        for (const rol of ["'admin'", "'versus-ger'", "'supervisor'", "'tester'", "'tv'", "'vendedor'", "'marketing'"]) {
            expect(fuente).not.toContain(rol)
        }
    })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Implementar**

Reemplazar `src/lib/roles.ts` entero por:

```ts
import type { ICapacidades } from '@/types/planificacion'

/**
 * El front NO tiene tabla de roles. Qué puede hacer el usuario lo dice el backend en
 * `GET /planificacion/me` (`capacidades`), derivado de `config/roles.ts` de api-vendedores.
 * Acá solo se traducen esas capacidades a decisiones de navegación. Si una pantalla nueva
 * necesita saber "quién puede", la respuesta es una capacidad nueva en el backend, no un
 * `if (rol === ...)` acá. Spec 2026-09-17-modo-prueba-gerencia-design.md.
 */

type Cap = ICapacidades | null | undefined

/** Puede entrar al grupo de rutas del vendedor: el vendedor real, o quien tiene vendedor de prueba. */
export const puedeOperarComoVendedor = (c: Cap): boolean =>
    !!c && (c.operaComoVendedor || c.operaComoVendedorDePrueba)

/** Puede entrar al grupo /analitica (reportes, actividad, ruta). */
export const supervisa = (c: Cap): boolean => !!c && c.superviseVendedores

/** Está operando la app del vendedor como su vendedor de prueba (no es vendedor real). */
export const estaProbando = (c: Cap): boolean =>
    !!c && !c.operaComoVendedor && c.operaComoVendedorDePrueba

/** La pantalla donde arranca. null = sin acceso a la app. */
export const rutaInicialPara = (c: Cap): string | null => {
    if (supervisa(c)) return '/analitica'
    if (puedeOperarComoVendedor(c)) return '/'
    return null
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: PASS. (El resto del build está roto hasta Task 4; no correr la suite completa todavía.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts
git commit -m "feat(prueba): roles.ts decide con capacidades, sin tabla de roles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `AuthContext` pide `/planificacion/me` y expone capacidades

**Files:**
- Modify: `src/context/AuthContext.tsx`
- Test: `src/context/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `getMePlanificacion` (Task 1); `rutaInicialPara` (Task 2).
- Produces (en `AuthContextValue`):
  ```ts
  capacidades: ICapacidades | null
  vendedoresVisibles: string[] | null
  vendedorDePrueba: IVendedorDePrueba | null
  /** Vuelve a pedir /planificacion/me (después de reiniciar la prueba, para refrescar la descripción). */
  refrescarMe: () => Promise<void>
  ```
  `user` sigue siendo `{ name, rol }`; `rutaInicial` ahora se calcula desde `capacidades`.

- [ ] **Step 1: Tests que fallan**

En `src/context/AuthContext.test.tsx`, ampliar el mock y el `Probe`:

```ts
vi.mock('@/api/authApi', () => ({ login: vi.fn(), getMe: vi.fn() }))
vi.mock('@/api/planificacion', () => ({ getMePlanificacion: vi.fn() }))

import { login as loginApi, getMe } from '@/api/authApi'
import { getMePlanificacion } from '@/api/planificacion'

const ME_GERENCIA = {
    rol: 'admin',
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
    vendedoresVisibles: null,
    vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2'] },
}
const ME_VENDEDOR = {
    rol: 'vendedor',
    capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false },
    vendedoresVisibles: ['V 2'],
    vendedorDePrueba: null,
}
const ME_NADA = {
    rol: 'marketing',
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: false, superviseVendedores: false },
    vendedoresVisibles: null,
    vendedorDePrueba: null,
}
```

En `Probe`, agregar `<div data-testid="prueba">{vendedorDePrueba?.codigo ?? ''}</div>` y
`<div data-testid="cap">{capacidades ? JSON.stringify(capacidades) : ''}</div>`.

Reemplazar/agregar tests:

```ts
    it('valida el token, pide /planificacion/me y autentica a un vendedor en /', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Martín', rol: 'vendedor' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_VENDEDOR)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('ruta')).toHaveTextContent('/')
        expect(screen.getByTestId('prueba')).toHaveTextContent('')
    })

    it('gerencia arranca en /analitica y trae su vendedor de prueba', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Ana', rol: 'admin' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_GERENCIA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
        expect(screen.getByTestId('ruta')).toHaveTextContent('/analitica')
        expect(screen.getByTestId('prueba')).toHaveTextContent('PRUEBA-42')
    })

    it('sin capacidades queda unauthorized (no se adivina nada por rol)', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Mk', rol: 'marketing' })
        ;(getMePlanificacion as any).mockResolvedValue(ME_NADA)
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'))
    })

    it('si /planificacion/me falla, queda unauthorized y no se inventa acceso por rol', async () => {
        localStorage.setItem('access_token', 'tok')
        ;(getMe as any).mockResolvedValue({ name: 'Ana', rol: 'admin' })
        ;(getMePlanificacion as any).mockRejectedValue(new Error('500'))
        renderProbe()
        await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthorized'))
    })
```

Actualizar los tests preexistentes que mockean solo `getMe` para que también mockeen
`getMePlanificacion` con el `ME_*` correspondiente al rol.

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/context/AuthContext.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `AuthContext.tsx`:

```ts
import { getMePlanificacion } from '@/api/planificacion'
import type { ICapacidades, IVendedorDePrueba } from '@/types/planificacion'
// ...
interface AuthContextValue {
    status: AuthStatus
    user: AuthUser | null
    capacidades: ICapacidades | null
    vendedoresVisibles: string[] | null
    vendedorDePrueba: IVendedorDePrueba | null
    rutaInicial: string | null
    loginError: string | null
    loginLoading: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => void
    refrescarMe: () => Promise<void>
}
```

Estado nuevo: `const [me, setMe] = useState<IMePlanificacion | null>(null)`.

`validateAndSetUser`:

```ts
    async function validateAndSetUser(token: string) {
        try {
            const authMe = await getMe(token)
            setUser({ name: authMe.name, rol: authMe.rol })
        } catch {
            localStorage.removeItem('access_token')
            setUser(null)
            setMe(null)
            setStatus('unauthenticated')
            return
        }
        // Qué puede hacer lo dice planificación, no el rol: sin este dato no hay acceso.
        // Si falla, 'unauthorized' y no 'unauthenticated': el token es válido, lo que no
        // hay es una capacidad conocida — y no se adivina por rol.
        try {
            const mePlan = await getMePlanificacion()
            setMe(mePlan)
            setStatus(rutaInicialPara(mePlan.capacidades) === null ? 'unauthorized' : 'authenticated')
        } catch {
            setMe(null)
            setStatus('unauthorized')
        }
    }

    async function refrescarMe() {
        try {
            setMe(await getMePlanificacion())
        } catch {
            /* se conserva el último conocido */
        }
    }
```

En `logout`, agregar `setMe(null)`. En el `value`:

```ts
                capacidades: me?.capacidades ?? null,
                vendedoresVisibles: me?.vendedoresVisibles ?? null,
                vendedorDePrueba: me?.vendedorDePrueba ?? null,
                rutaInicial: rutaInicialPara(me?.capacidades),
                refrescarMe,
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/context/AuthContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context/AuthContext.tsx src/context/AuthContext.test.tsx
git commit -m "feat(prueba): AuthContext pide /planificacion/me y expone capacidades

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `ProtectedRoute` y `App.tsx` filtran por capacidad

**Files:**
- Modify: `src/router/ProtectedRoute.tsx`, `src/App.tsx`
- Test: `src/router/ProtectedRoute.test.tsx` (crear)

**Interfaces:**
- Consumes: `capacidades` del contexto (Task 3); `puedeOperarComoVendedor`, `supervisa` (Task 2).
- Produces: `ProtectedRoute({ permitir?: (c: ICapacidades | null) => boolean })`.

- [ ] **Step 1: Test que falla**

```tsx
// src/router/ProtectedRoute.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import { puedeOperarComoVendedor, supervisa } from '@/lib/roles'

const auth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth() }))

const cap = (v: boolean, p: boolean, s: boolean) => ({
    operaComoVendedor: v, operaComoVendedorDePrueba: p, superviseVendedores: s,
})

function montar(ruta: string, capacidades: ReturnType<typeof cap>) {
    auth.mockReturnValue({
        status: 'authenticated',
        capacidades,
        rutaInicial: supervisa(capacidades) ? '/analitica' : puedeOperarComoVendedor(capacidades) ? '/' : null,
    })
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route element={<ProtectedRoute permitir={puedeOperarComoVendedor} />}>
                    <Route path="/" element={<div>AGENDA</div>} />
                </Route>
                <Route element={<ProtectedRoute permitir={supervisa} />}>
                    <Route path="/analitica" element={<div>ANALITICA</div>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    )
}

describe('ProtectedRoute por capacidades', () => {
    it('gerencia entra a / y a /analitica', () => {
        montar('/', cap(false, true, true))
        expect(screen.getByText('AGENDA')).toBeInTheDocument()
    })
    it('gerencia entra a /analitica', () => {
        montar('/analitica', cap(false, true, true))
        expect(screen.getByText('ANALITICA')).toBeInTheDocument()
    })
    it('tester entra a / pero /analitica lo manda a /', () => {
        montar('/analitica', cap(false, true, false))
        expect(screen.getByText('AGENDA')).toBeInTheDocument()
    })
    it('vendedor entra a / pero /analitica lo manda a /', () => {
        montar('/analitica', cap(true, false, false))
        expect(screen.getByText('AGENDA')).toBeInTheDocument()
    })
    it('un TV futuro entra a /analitica y / lo manda a /analitica', () => {
        montar('/', cap(false, false, true))
        expect(screen.getByText('ANALITICA')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/router/ProtectedRoute.test.tsx`
Expected: FAIL (prop `permitir` inexistente; usa `permitirRol(user?.rol)`).

- [ ] **Step 3: Implementar**

`ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { ICapacidades } from '@/types/planificacion'

interface ProtectedRouteProps {
    /** Además de estar logueado, las capacidades tienen que cumplir esto para entrar a este
     *  grupo de rutas. Capacidades, no rol: el front no tiene tabla de roles. */
    permitir?: (capacidades: ICapacidades | null) => boolean
}

export default function ProtectedRoute({ permitir }: ProtectedRouteProps) {
    const { status, capacidades, rutaInicial } = useAuth()

    if (status === 'loading') {
        return <div className="min-h-full grid place-items-center text-dsmuted">Cargando...</div>
    }
    if (status === 'unauthorized') return <Navigate to="/sin-permisos" replace />
    if (status === 'unauthenticated') return <Navigate to="/login" replace />
    // Logueado pero sin la capacidad de este grupo (ej. un tester entrando a /analitica):
    // se lo manda a la pantalla que sí le corresponde.
    if (permitir && !permitir(capacidades)) {
        return <Navigate to={rutaInicial ?? '/'} replace />
    }
    return <Outlet />
}
```

`App.tsx`: reemplazar el import `import { esRolGerencia, esRolVendedor } from '@/lib/roles'` por
`import { puedeOperarComoVendedor, supervisa } from '@/lib/roles'`, y las dos rutas:

```tsx
                        <Route element={<ProtectedRoute permitir={puedeOperarComoVendedor} />}>
                            <Route path="/" element={<AgendaSemanaPage />} />
                        </Route>
                        <Route element={<ProtectedRoute permitir={supervisa} />}>
```

- [ ] **Step 4: Verificar que TODO compila y pasa**

Run: `npx tsc -b && npm test`
Expected: compila (ya no queda ningún caller de `esRol*`; si `tsc` marca alguno, corregirlo con el
predicado equivalente); suite PASS. Los tests de páginas que mockean `useAuth` con `{ user, logout }`
siguen pasando porque no leen capacidades todavía.

- [ ] **Step 5: Commit**

```bash
git add src/router/ProtectedRoute.tsx src/router/ProtectedRoute.test.tsx src/App.tsx
git commit -m "feat(prueba): ProtectedRoute y App filtran por capacidades

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `useReiniciarPrueba` y `CarteraDialog`

**Files:**
- Create: `src/hooks/usePrueba.ts`
- Create: `src/components/prueba/CarteraDialog.tsx`
- Test: `src/hooks/usePrueba.test.tsx`, `src/components/prueba/CarteraDialog.test.tsx`

**Interfaces:**
- Consumes: `reiniciarPrueba` (Task 1); `refrescarMe`, `vendedorDePrueba`, `capacidades` (Task 3);
  `useVendedores` (`@/hooks/useAnalitica`, solo si supervisa); `ConfirmDialog` (`@/components/ui/ConfirmDialog`).
- Produces:
  ```ts
  export function useReiniciarPrueba(): UseMutationResult<IVendedorDePrueba, unknown, string | null>
  export default function CarteraDialog(props: {
      open: boolean
      onOpenChange: (open: boolean) => void
      /** Se llama después de reiniciar con éxito. */
      onReiniciado: () => void
  }): JSX.Element
  ```

- [ ] **Step 1: Tests que fallan**

`src/hooks/usePrueba.test.tsx` (copiar el wrapper de QueryClient que usa `src/hooks/useVisitas.test.tsx`):

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useReiniciarPrueba } from './usePrueba'

vi.mock('@/api/planificacion', () => ({ reiniciarPrueba: vi.fn() }))
const refrescarMe = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ refrescarMe }) }))
import { reiniciarPrueba } from '@/api/planificacion'

it('reinicia, invalida TODAS las queries y refresca /me', async () => {
    ;(reiniciarPrueba as any).mockResolvedValue({ codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: [] })
    const { qc, wrapper } = crearWrapper() // helper del archivo vecino: QueryClient nuevo + Provider
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useReiniciarPrueba(), { wrapper })
    result.current.mutate('V 2')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(reiniciarPrueba).toHaveBeenCalledWith('V 2')
    expect(spy).toHaveBeenCalledWith() // sin filtro: TODO lo de planificación
    expect(refrescarMe).toHaveBeenCalledTimes(1)
})
```

`src/components/prueba/CarteraDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import CarteraDialog from './CarteraDialog'

const mutateAsync = vi.fn()
vi.mock('@/hooks/usePrueba', () => ({ useReiniciarPrueba: () => ({ mutateAsync, isPending: false }) }))
vi.mock('@/hooks/useAnalitica', () => ({
    useVendedores: () => ({ data: [{ codigoParticularVendedor: 'V 2', nombreVendedor: 'ROSSI MARTÍN' }] }),
}))
const auth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth() }))

const GERENCIA = {
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
    vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: ['V 2', 'NACHO'] },
}
const TESTER = {
    capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: false },
    vendedorDePrueba: { codigo: 'PRUEBA-9', descripcion: 'Cartera de V 2', origenesDisponibles: ['V 2', 'NACHO'] },
}

beforeEach(() => { vi.clearAllMocks(); mutateAsync.mockResolvedValue({}) })

it('lista los orígenes con nombre del roster cuando supervisa, más "Arrancar vacío"', async () => {
    auth.mockReturnValue(GERENCIA)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    expect(screen.getByText('¿Con qué cartera querés arrancar?')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ROSSI MARTÍN (V 2)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'NACHO' })).toBeInTheDocument() // sin nombre en roster: el código
    expect(screen.getByRole('option', { name: 'Arrancar vacío' })).toBeInTheDocument()
})

it('un tester ve los códigos pelados (no tiene roster)', () => {
    auth.mockReturnValue(TESTER)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    expect(screen.getByRole('option', { name: 'V 2' })).toBeInTheDocument()
})

it('elegir un origen y confirmar llama a reiniciar con ese código y avisa', async () => {
    auth.mockReturnValue(GERENCIA)
    const onReiniciado = vi.fn()
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={onReiniciado} />)
    await userEvent.selectOptions(screen.getByLabelText('Cartera'), 'NACHO')
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(mutateAsync).toHaveBeenCalledWith('NACHO')
    expect(onReiniciado).toHaveBeenCalledTimes(1)
})

it('"Arrancar vacío" manda null', async () => {
    auth.mockReturnValue(GERENCIA)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Cartera'), '')
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(mutateAsync).toHaveBeenCalledWith(null)
})

it('muestra la advertencia de borrado', () => {
    auth.mockReturnValue(GERENCIA)
    render(<CarteraDialog open onOpenChange={() => {}} onReiniciado={() => {}} />)
    expect(screen.getByText(/Se borran todas tus visitas de prueba/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/hooks/usePrueba.test.tsx src/components/prueba/CarteraDialog.test.tsx`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar el hook**

```ts
// src/hooks/usePrueba.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { reiniciarPrueba } from '@/api/planificacion'
import { useAuth } from '@/context/AuthContext'

/**
 * Reinicia el vendedor de prueba del usuario. Invalida TODO (sin filtro de key): después de
 * borrar y volver a crear la rotación no queda ninguna query de planificación que siga siendo
 * válida, y enumerar keys acá es garantía de olvidarse una. Y refresca /me, que es de donde
 * el banner lee la descripción de la cartera.
 */
export function useReiniciarPrueba() {
    const qc = useQueryClient()
    const { refrescarMe } = useAuth()
    return useMutation({
        mutationFn: (origen: string | null) => reiniciarPrueba(origen),
        onSuccess: async () => {
            await qc.invalidateQueries()
            await refrescarMe()
        },
    })
}
```

- [ ] **Step 4: Implementar el diálogo**

```tsx
// src/components/prueba/CarteraDialog.tsx
import { useState } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { useReiniciarPrueba } from '@/hooks/usePrueba'
import { supervisa } from '@/lib/roles'

interface CarteraDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Después de reiniciar con éxito (el caller navega/cierra). */
    onReiniciado: () => void
}

/**
 * "¿Con qué cartera querés arrancar?": el vendedor de prueba nace como FOTO del plan de un
 * vendedor real, o vacío. Sirve para la primera entrada y para cada "Reiniciar".
 *
 * El roster (nombres) solo lo tiene quien supervisa — `/analitica/vendedores` es de gerencia.
 * Un tester ve los códigos pelados, que alcanzan para elegir.
 */
export default function CarteraDialog({ open, onOpenChange, onReiniciado }: CarteraDialogProps) {
    const { capacidades, vendedorDePrueba } = useAuth()
    const puedeVerRoster = supervisa(capacidades)
    const { data: roster } = useVendedores({ enabled: puedeVerRoster })
    const reiniciar = useReiniciarPrueba()
    const origenes = vendedorDePrueba?.origenesDisponibles ?? []
    const [origen, setOrigen] = useState<string>(origenes[0] ?? '')

    const nombreDe = (codigo: string) => {
        const v = roster?.find(r => r.codigoParticularVendedor.toUpperCase() === codigo.toUpperCase())
        return v ? `${v.nombreVendedor} (${codigo})` : codigo
    }

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="¿Con qué cartera querés arrancar?"
            confirmLabel="Reiniciar"
            destructivo
            onConfirm={async () => {
                await reiniciar.mutateAsync(origen === '' ? null : origen)
                onReiniciado()
            }}
            description={
                <div className="space-y-3 text-left">
                    <label className="flex flex-col gap-1 text-[13px] font-semibold text-[#182645]">
                        Cartera
                        <select
                            aria-label="Cartera"
                            value={origen}
                            onChange={e => setOrigen(e.target.value)}
                            className="rounded-md border border-dsline px-2 py-2 text-sm font-normal text-[#182645]"
                        >
                            {origenes.map(c => (
                                <option key={c} value={c}>{nombreDe(c)}</option>
                            ))}
                            <option value="">Arrancar vacío</option>
                        </select>
                    </label>
                    <p className="text-[13px] leading-snug text-dsmuted">
                        Se borran todas tus visitas de prueba y la agenda vuelve a empezar. Los datos
                        reales no se tocan.
                    </p>
                </div>
            }
        />
    )
}
```

> `useVendedores` hoy no acepta opciones. Agregarle `(opts?: { enabled?: boolean })` y pasarlo al
> `useQuery` (`enabled: opts?.enabled ?? true`): cambio aditivo, los callers existentes no cambian.

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/hooks/usePrueba.test.tsx src/components/prueba/CarteraDialog.test.tsx src/hooks/useAnalitica.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePrueba.ts src/hooks/usePrueba.test.tsx src/components/prueba/CarteraDialog.tsx src/components/prueba/CarteraDialog.test.tsx src/hooks/useAnalitica.ts
git commit -m "feat(prueba): useReiniciarPrueba y CarteraDialog (elegir con qué cartera arrancar)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `BannerPrueba` y su montaje en la agenda

**Files:**
- Create: `src/components/prueba/BannerPrueba.tsx`
- Modify: `src/pages/AgendaSemanaPage.tsx`
- Test: `src/components/prueba/BannerPrueba.test.tsx`, `src/pages/AgendaSemanaPage.test.tsx`

**Interfaces:**
- Consumes: `estaProbando`, `supervisa` (Task 2); `vendedorDePrueba`, `capacidades` (Task 3);
  `CarteraDialog` (Task 5).
- Produces: `export default function BannerPrueba(): JSX.Element | null` (se auto-oculta si no
  está probando) y `export const ALTO_BANNER_PRUEBA = 36` (px, para el padding de la página).

- [ ] **Step 1: Tests que fallan**

```tsx
// src/components/prueba/BannerPrueba.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import BannerPrueba from './BannerPrueba'

const auth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth() }))
vi.mock('./CarteraDialog', () => ({ default: ({ open }: { open: boolean }) => (open ? <div>DIALOGO</div> : null) }))

const cap = (v: boolean, p: boolean, s: boolean) => ({ operaComoVendedor: v, operaComoVendedorDePrueba: p, superviseVendedores: s })
const montar = () => render(<MemoryRouter><BannerPrueba /></MemoryRouter>)

it('no se pinta para un vendedor real', () => {
    auth.mockReturnValue({ capacidades: cap(true, false, false), vendedorDePrueba: null })
    montar()
    expect(screen.queryByText(/Modo prueba/)).not.toBeInTheDocument()
})

it('gerencia: texto con la cartera, Reiniciar y Volver a analítica', () => {
    auth.mockReturnValue({
        capacidades: cap(false, true, true),
        vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: [] },
    })
    montar()
    expect(screen.getByText('Modo prueba · Cartera de V 2 · nada de esto cuenta ni llega a Cromo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reiniciar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a analítica' })).toHaveAttribute('href', '/analitica')
})

it('tester: sin descripción todavía, sin "Volver a analítica"', () => {
    auth.mockReturnValue({
        capacidades: cap(false, true, false),
        vendedorDePrueba: { codigo: 'PRUEBA-9', descripcion: null, origenesDisponibles: [] },
    })
    montar()
    expect(screen.getByText('Modo prueba · nada de esto cuenta ni llega a Cromo')).toBeInTheDocument()
    expect(screen.queryByText('Volver a analítica')).not.toBeInTheDocument()
})

it('Reiniciar abre el diálogo de cartera', async () => {
    auth.mockReturnValue({ capacidades: cap(false, true, true), vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: [] } })
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(screen.getByText('DIALOGO')).toBeInTheDocument()
})
```

En `src/pages/AgendaSemanaPage.test.tsx`, el mock de `useAuth` hoy devuelve `{ user, logout }`.
Ampliarlo a `{ user, logout, capacidades: cap(true,false,false), vendedorDePrueba: null }` para que
el vendedor real siga sin banner, y agregar un test:

```tsx
it('con capacidades de prueba muestra el banner arriba de la agenda', async () => {
    authMock.mockReturnValue({
        user: { name: 'Ana' }, logout: vi.fn(),
        capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
        vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: ['V 2'] },
    })
    renderPage() // el helper del archivo
    expect(await screen.findByText(/Modo prueba · Cartera de V 2/)).toBeInTheDocument()
})
```

(Convertir el `vi.mock('@/context/AuthContext', ...)` del archivo a uno que lea de un `authMock`
`vi.fn()` con un default en `beforeEach`, para poder pisarlo en este test.)

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/components/prueba/BannerPrueba.test.tsx src/pages/AgendaSemanaPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar el banner**

```tsx
// src/components/prueba/BannerPrueba.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { estaProbando, supervisa } from '@/lib/roles'
import CarteraDialog from './CarteraDialog'

/** Alto fijo del banner: la página que lo monta se corre esto hacia abajo. */
export const ALTO_BANNER_PRUEBA = 36

/**
 * La franja que dice en qué está parado el usuario. Es lo que resuelve la confusión que
 * motivó descartar un staging: una sola app, y lo que se está mirando se lee sin pensar.
 *
 * `fixed` y z-[55]: por encima del BottomSheet (z-50, así también se ve con la visita o el
 * mapa abiertos) y por debajo del ConfirmDialog (z-[60]) y la Notification (z-[70]).
 * Ámbar (color de "atención" del semáforo), nunca rojo: rojo es `alejado`.
 */
export default function BannerPrueba() {
    const { capacidades, vendedorDePrueba } = useAuth()
    const [eligiendo, setEligiendo] = useState(false)
    if (!estaProbando(capacidades)) return null

    const partes = ['Modo prueba', vendedorDePrueba?.descripcion, 'nada de esto cuenta ni llega a Cromo']
    const texto = partes.filter(Boolean).join(' · ')

    return (
        <>
            <div
                role="status"
                style={{ height: ALTO_BANNER_PRUEBA }}
                className="fixed inset-x-0 top-0 z-[55] flex items-center justify-between gap-2 bg-[#FDE68A] px-3 text-[12px] font-bold text-[#78350F]"
            >
                <span className="truncate">{texto}</span>
                <span className="flex shrink-0 items-center gap-3">
                    <button type="button" onClick={() => setEligiendo(true)} className="underline">
                        Reiniciar
                    </button>
                    {supervisa(capacidades) && (
                        <Link to="/analitica" className="underline">
                            Volver a analítica
                        </Link>
                    )}
                </span>
            </div>
            <CarteraDialog open={eligiendo} onOpenChange={setEligiendo} onReiniciado={() => setEligiendo(false)} />
        </>
    )
}
```

- [ ] **Step 4: Montarlo en `AgendaSemanaPage`**

Importar `BannerPrueba, { ALTO_BANNER_PRUEBA }` y `estaProbando`; leer `capacidades` y
`vendedorDePrueba` de `useAuth()`; definir `const probando = estaProbando(capacidades)`.

En el `return` principal, el `div` raíz pasa a:

```tsx
        <div
            className="flex h-dvh flex-col overflow-hidden bg-[#EEF1F6]"
            style={probando ? { paddingTop: ALTO_BANNER_PRUEBA } : undefined}
        >
            <BannerPrueba />
            <AppHeader ... />
```

En el estado vacío ("Todavía no tenés una ruta asignada"), que es donde cae un vendedor de prueba
que nunca reinició, distinguir el caso:

```tsx
    if (cicloResuelto && semanaEfectiva === null) {
        if (probando) {
            return (
                <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#EEF1F6] px-8 text-center" style={{ paddingTop: ALTO_BANNER_PRUEBA }}>
                    <BannerPrueba />
                    <p className="text-[14px] font-semibold leading-snug text-[#182645]">
                        Tu vendedor de prueba todavía no tiene agenda.
                    </p>
                    <button
                        type="button"
                        onClick={() => setEligiendoCartera(true)}
                        className="rounded-xl bg-dsnavy px-4 py-2.5 text-[13px] font-bold text-white"
                    >
                        Elegir cartera
                    </button>
                    <CarteraDialog open={eligiendoCartera} onOpenChange={setEligiendoCartera} onReiniciado={() => setEligiendoCartera(false)} />
                </div>
            )
        }
        return ( /* el bloque existente del vendedor real, sin cambios */ )
    }
```

con `const [eligiendoCartera, setEligiendoCartera] = useState(false)` junto a los otros `useState`
(antes de cualquier `return` condicional).

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/components/prueba src/pages/AgendaSemanaPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/prueba/BannerPrueba.tsx src/components/prueba/BannerPrueba.test.tsx src/pages/AgendaSemanaPage.tsx src/pages/AgendaSemanaPage.test.tsx
git commit -m "feat(prueba): BannerPrueba fijo arriba de la agenda y primera elección de cartera

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Entrada desde `/analitica` — acción en `AccountMenu`

**Files:**
- Modify: `src/components/AccountMenu.tsx`
- Modify: `src/pages/AnaliticaPage.tsx`, `src/pages/AnaliticaActividadPage.tsx`, `src/pages/AnaliticaVendedorPage.tsx`, `src/pages/RutaPage.tsx`
- Test: `src/components/AppHeader.test.tsx` (ya cubre AccountMenu vía AppHeader; agregar un test directo en `src/components/AccountMenu.test.tsx`)

**Interfaces:**
- Produces: `AccountMenu({ nombre, onLogout, acciones?: { label: string; onClick: () => void }[] })`.

- [ ] **Step 1: Test que falla**

```tsx
// src/components/AccountMenu.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AccountMenu from './AccountMenu'

it('pinta las acciones extra antes de "Cerrar sesión" y las ejecuta', async () => {
    const probar = vi.fn()
    render(<AccountMenu nombre="Ana" onLogout={() => {}} acciones={[{ label: 'Probar la app del vendedor', onClick: probar }]} />)
    await userEvent.click(screen.getByLabelText('Cuenta'))
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent('Probar la app del vendedor')
    expect(items[1]).toHaveTextContent('Cerrar sesión')
    await userEvent.click(items[0])
    expect(probar).toHaveBeenCalledTimes(1)
})

it('sin acciones, solo "Cerrar sesión" (como siempre)', async () => {
    render(<AccountMenu nombre="Ana" onLogout={() => {}} />)
    await userEvent.click(screen.getByLabelText('Cuenta'))
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/AccountMenu.test.tsx`
Expected: FAIL (prop desconocida, un solo menuitem).

- [ ] **Step 3: Implementar**

En `AccountMenu.tsx`:

```tsx
interface AccountMenuProps {
    nombre: string
    onLogout: () => void
    /** Acciones de cuenta además de cerrar sesión (ej. "Probar la app del vendedor"). Van
     *  antes del logout, que siempre es el último. */
    acciones?: { label: string; onClick: () => void }[]
}
```

y dentro del `div role="menu"`, entre el nombre y el botón de logout:

```tsx
                    {acciones?.map(a => (
                        <button
                            key={a.label}
                            role="menuitem"
                            onClick={() => {
                                setOpen(false)
                                a.onClick()
                            }}
                            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold text-[#182645] hover:bg-[#F1F4F9]"
                        >
                            {a.label}
                        </button>
                    ))}
```

En las cuatro páginas de `/analitica` (`AnaliticaPage`, `AnaliticaActividadPage`,
`AnaliticaVendedorPage`, `RutaPage`), donde hoy dice
`<AccountMenu nombre={user?.name ?? ''} onLogout={logout} />`, pasar a:

```tsx
<AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
```

con, en cada página:

```tsx
    const { user, logout, capacidades } = useAuth()
    const navigate = useNavigate()
    // Es una acción de menú, no un botón protagonista: probar no es el trabajo diario de
    // gerencia. Si nunca reinició, la agenda le pide la cartera al entrar.
    const accionesDeCuenta = capacidades?.operaComoVendedorDePrueba
        ? [{ label: 'Probar la app del vendedor', onClick: () => navigate('/') }]
        : undefined
```

(Para no repetir cuatro veces, crear `src/hooks/useAccionesDeCuenta.ts` que devuelva ese array y
usarlo en las cuatro. Cuerpo: exactamente las cuatro líneas de arriba, con `useNavigate` adentro.)

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/components/AccountMenu.test.tsx src/components/AppHeader.test.tsx src/pages`
Expected: PASS (los tests de páginas de analítica mockean `useAuth`; si el mock no trae
`capacidades`, `accionesDeCuenta` es `undefined` y el menú queda como antes).

- [ ] **Step 5: Commit**

```bash
git add src/components/AccountMenu.tsx src/components/AccountMenu.test.tsx src/hooks/useAccionesDeCuenta.ts src/pages/AnaliticaPage.tsx src/pages/AnaliticaActividadPage.tsx src/pages/AnaliticaVendedorPage.tsx src/pages/RutaPage.tsx
git commit -m "feat(prueba): acción \"Probar la app del vendedor\" en el menú de cuenta de analítica

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Textos que cambian en prueba (coordenada y seguimiento)

**Files:**
- Modify: `src/components/VisitaFlow.tsx` (línea ~291), `src/components/ClienteCard.tsx` (línea ~79)
- Test: `src/components/VisitaFlow.test.tsx`, `src/components/ClienteCard.test.tsx`

- [ ] **Step 1: Tests que fallan**

En `ClienteCard.test.tsx`, junto a los tests de "Reintentar sincronización":

```tsx
it('con seguimiento pendiente por MODO_PRUEBA no ofrece reintentar (no serviría)', () => {
    renderCard({
        ...clienteVisitado, // fixture del archivo con visitaId y estado 'visitada'
        seguimiento: { estado: 'pendiente', motivo: 'MODO_PRUEBA', mensaje: 'En modo prueba el seguimiento no se manda a Cromo.' },
    })
    expect(screen.queryByRole('button', { name: /reintentar sincronización/i })).not.toBeInTheDocument()
    expect(screen.getByText('En modo prueba el seguimiento no se manda a Cromo.')).toBeInTheDocument()
})
```

(Si la card no muestra hoy `seguimiento.mensaje` como texto cuando está pendiente, agregarlo al
lado del botón: un `<p className="text-[12px] text-dsmuted">` con `cliente.seguimiento.mensaje`.)

En `VisitaFlow.test.tsx`, ubicar el test de "límite alcanzado" y agregar su gemelo en prueba,
mockeando `useAuth` para que devuelva capacidades de prueba:

```tsx
it('en modo prueba el aviso de corrección dice que no se guarda de forma permanente', async () => {
    authMock.mockReturnValue({ capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true } })
    // ... mismo setup que el test de "límite alcanzado": iniciar con clienteOverride y
    // respuesta correccionPermanenteAplicada: false ...
    expect(onAviso).toHaveBeenCalledWith('info', 'En modo prueba la corrección no se guarda de forma permanente.')
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/components/VisitaFlow.test.tsx src/components/ClienteCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`ClienteCard.tsx` línea ~79:

```ts
    // MODO_PRUEBA: el aviso nunca sale (es la salida esperada del vendedor de prueba), así
    // que reintentar no serviría y confundiría. Se muestra el mensaje, sin botón.
    const puedeReintentar =
        cliente.visitaId !== null &&
        cliente.seguimiento.estado === 'pendiente' &&
        cliente.seguimiento.motivo !== 'MODO_PRUEBA'
```

`VisitaFlow.tsx`: importar `useAuth` y `estaProbando`; dentro del componente
`const { capacidades } = useAuth()`; y en la línea ~291:

```ts
                    if (clienteOverride && correccionPermanenteAplicada === false) {
                        onAviso?.(
                            'info',
                            estaProbando(capacidades)
                                ? 'En modo prueba la corrección no se guarda de forma permanente.'
                                : 'Esta corrección ya no se guarda de forma permanente (límite alcanzado).',
                        )
                    }
```

Si `VisitaFlow.test.tsx` no mockea `useAuth` todavía, agregar
`vi.mock('@/context/AuthContext', () => ({ useAuth: () => authMock() }))` con default
`{ capacidades: { operaComoVendedor: true, operaComoVendedorDePrueba: false, superviseVendedores: false } }`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/components/VisitaFlow.test.tsx src/components/ClienteCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/VisitaFlow.tsx src/components/VisitaFlow.test.tsx src/components/ClienteCard.tsx src/components/ClienteCard.test.tsx
git commit -m "feat(prueba): textos de coordenada y seguimiento en modo prueba

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Roster de `/analitica/ruta` — "Mi vendedor de prueba" y `vendedoresVisibles`

**Files:**
- Modify: `src/pages/RutaPage.tsx` (línea ~44 y ~95)
- Test: `src/pages/RutaPage.test.tsx` (crear si no existe; si existe, agregar)

- [ ] **Step 1: Test que falla**

```tsx
it('el selector suma "Mi vendedor de prueba" al final, y acota el roster a vendedoresVisibles', async () => {
    authMock.mockReturnValue({
        user: { name: 'Ana' }, logout: vi.fn(),
        capacidades: { operaComoVendedor: false, operaComoVendedorDePrueba: true, superviseVendedores: true },
        vendedoresVisibles: ['V 2'],
        vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: [] },
    })
    vendedoresMock.mockReturnValue({ data: [
        { codigoParticularVendedor: 'V 2', nombreVendedor: 'ROSSI' },
        { codigoParticularVendedor: 'NACHO', nombreVendedor: 'NACHO' },
    ] })
    renderPage()
    const opciones = (await screen.findAllByRole('option')).map(o => o.textContent)
    expect(opciones).toContain('ROSSI')
    expect(opciones).not.toContain('NACHO')            // fuera de vendedoresVisibles
    expect(opciones[opciones.length - 1]).toBe('Mi vendedor de prueba')
})
```

(Con `vi.mock('@/hooks/useAnalitica', () => ({ useVendedores: () => vendedoresMock() }))` y el
mock de `useAuth` como en Task 6.)

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/pages/RutaPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `RutaPage.tsx`, después de `const { data: roster } = useVendedores()`:

```ts
    const { vendedoresVisibles, vendedorDePrueba } = useAuth()
    // El roster del warehouse no conoce a PRUEBA-*: se agrega a mano, al final y separado.
    // Y se acota a lo que el backend va a aceptar (`requireVendedorEnScope`): un TV futuro
    // no tiene que ver vendedores que después le rebotan con 403.
    const rosterVisible = useMemo(() => {
        const base = (roster ?? []).filter(
            v => vendedoresVisibles === null || vendedoresVisibles.some(c => c.toUpperCase() === v.codigoParticularVendedor.toUpperCase()),
        )
        return vendedorDePrueba
            ? [...base, { codigoParticularVendedor: vendedorDePrueba.codigo, nombreVendedor: 'Mi vendedor de prueba' }]
            : base
    }, [roster, vendedoresVisibles, vendedorDePrueba])
```

y en el JSX `vendedores={rosterVisible}` en lugar de `vendedores={roster ?? []}`. (Importar `useMemo`.)

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/pages/RutaPage.test.tsx src/components/ruta`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/RutaPage.tsx src/pages/RutaPage.test.tsx
git commit -m "feat(prueba): roster de ruta con \"Mi vendedor de prueba\" y acotado a vendedoresVisibles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Documentación viva y verificación final

**Files:**
- Modify: `CLAUDE.md`, `docs/dominio/modelo.md`

- [ ] **Step 1: `docs/dominio/modelo.md` — sección "El vendedor de prueba"**

Agregar al final, textual:

```markdown
## El vendedor de prueba

Gerencia y el rol `tester` operan la app del vendedor como un vendedor sintético propio,
`PRUEBA-<userId>`, para probar y mostrar sin ensuciar datos. No es un "modo": es una identidad.

**El prefijo `PRUEBA-` es un espacio reservado del código de vendedor, con dos invariantes:**

1. Un código con ese prefijo nunca existe en el warehouse.
2. Un código con ese prefijo nunca entra en una agregación que cruce vendedores, ni dispara un
   efecto fuera de `pl_*`.

Sus filas viven en `pl_*` como las de cualquier vendedor (misma partición por
`codigo_particular_vendedor`), y tres guardas lo mantienen aislado, todas preguntando al módulo
`vendedorPrueba.ts` de api-vendedores:

- **Lecturas de gerencia:** `fragmentoVendedores` agrega siempre `NOT LIKE 'PRUEBA-%'`. Regla:
  toda query que agrupe o filtre ENTRE vendedores pasa por el fragmento (hay un test de contrato).
- **Efectos externos:** Cromo (`MODO_PRUEBA`, nunca se envía) y client-service (sin `PATCH`
  permanente; la corrección efímera sí funciona).
- **Decisiones sobre datos reales:** el cupo de 3 correcciones por cliente ignora las filas de
  prueba. Regla: los datos de prueba no escriben afuera y no influyen en decisiones sobre datos reales.

Arranca como **foto** de la cartera de un vendedor real elegido al reiniciar (o vacío), y su cartera
para buscar y agregar es **toda la base**. Quién puede probar y quién supervisa lo dice
`config/roles.ts` de api-vendedores (`operaComoVendedorDePrueba`, `superviseVendedores`), y el front
lo lee de `GET /planificacion/me`: **el front no tiene tabla de roles**.

Spec: `docs/superpowers/specs/2026-09-17-modo-prueba-gerencia-design.md`.
```

- [ ] **Step 2: `CLAUDE.md`**

(a) En el bloque del ecosistema, corregir `MySQL distriap_distri (MISMA conexión existente sequelizeWrite…)`
por: `MySQL planificacion (base propia, conexión sequelizeWritePlanificacion)`.

(b) En "Decisiones no obvias", agregar:

```markdown
- **El vendedor de prueba (`PRUEBA-<userId>`) es una identidad, no un modo.** Gerencia y `tester`
  operan la app como su vendedor sintético; el prefijo es un espacio reservado con dos invariantes
  (nunca existe en el warehouse; nunca cruza vendedores ni sale de `pl_*`). Ante cualquier efecto
  externo nuevo o agregación entre vendedores, preguntar `esVendedorDePrueba` /
  `fragmentoVendedores` en api-vendedores. **El front no tiene tabla de roles**: decide con las
  capacidades de `GET /planificacion/me` (`src/lib/roles.ts` solo traduce capacidades a rutas). Si
  una pantalla nueva necesita "quién puede", es una capacidad nueva en el backend, no un
  `if (rol === ...)`. El warehouse **no se modifica ni se extiende bajo ninguna forma**. Ver
  `docs/dominio/modelo.md`, "El vendedor de prueba".
```

- [ ] **Step 3: Verificación final**

Run: `npm run lint && npx tsc -b && npm test && npm run build`
Expected: todo en verde.

Run (grep de la restricción global): `grep -rn "'admin'\|'versus-ger'\|'supervisor'\|'tester'" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
Expected: sin resultados.

Smoke manual contra el preview del backend (`VITE_API_URL`):
1. Login con `admin` → cae en `/analitica`; menú de cuenta → "Probar la app del vendedor" → `/`
   con el estado "Tu vendedor de prueba todavía no tiene agenda" → "Elegir cartera" → V 2 →
   agenda con las zonas de V 2 y banner "Modo prueba · Cartera de V 2 · …".
2. Iniciar una visita reposicionando el cliente → aviso "En modo prueba la corrección no se guarda…".
3. Cerrar la visita → la card queda visitada con el mensaje de Cromo en modo prueba, sin
   "Reintentar sincronización".
4. Buscador → buscar un cliente de otro vendedor → aparece → agregarlo al plan → aparece en la agenda.
5. "Volver a analítica" → `/analitica` sin la prueba en los números; `/analitica/ruta` → selector
   con "Mi vendedor de prueba" → grid editable.
6. "Reiniciar" → arrancar vacío → agenda vacía, banner "Modo prueba · Sin cartera · …".
7. Login con un `vendedor` real → ninguna diferencia visible.

- [ ] **Step 4: Commit y PR**

```bash
git add CLAUDE.md docs/dominio/modelo.md
git commit -m "docs(prueba): el vendedor de prueba en modelo.md y CLAUDE.md; corrige la base de pl_*

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

PR contra `master`: "Vendedor de prueba: banner, elección de cartera y capacidades desde /me".
Descripción con link al spec y al plan de la API, el checklist de smoke de arriba, y cerrar con
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Self-review contra el spec

| sección del spec | task |
|---|---|
| Frontend → Roles (sin tabla, `rutaInicialPara(capacidades)`) | 2, 3 |
| Frontend → Entrada (menú de cuenta; tester arranca en `/` con el diálogo) | 6, 7 |
| Frontend → Rutas (`ProtectedRoute` por capacidad) | 4 |
| Frontend → Banner (texto, ámbar, z-index, acciones según capacidad) | 6 |
| Frontend → Reiniciar (diálogo con cartera, `POST`, invalidar, `/me`) | 5 |
| Frontend → Buscador | sin cambios de UI (lo resuelve el backend) |
| Frontend → Roster de ruta ("Mi vendedor de prueba", `vendedoresVisibles`) | 9 |
| Frontend → Textos (coordenada, seguimiento sin reintentar) | 8 |
| `GET /planificacion/me` consumido en `AuthContext` | 1, 3 |
| Documentación (`modelo.md`, `CLAUDE.md` con la corrección de la base) | 10 |
| Vendedor real sin cambios | tests de vendedor en 3, 4, 6, 8 + smoke 7 |
