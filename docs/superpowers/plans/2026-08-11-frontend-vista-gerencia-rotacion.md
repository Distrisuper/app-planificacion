# Frontend de la vista de gerencia de rotación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pestaña "Ruta" donde gerencia elige un vendedor, ve su rotación completa (todas las semanas × días) y reacomoda clientes arrastrándolos, además de encolar y nombrar rotaciones futuras.

**Architecture:** Página nueva `/analitica/ruta` dentro del grupo de rutas que ya protege los roles de gerencia. Reusa el shell de las páginas de Analítica (header + tabs + AccountMenu) pero con su propia barra (selector de vendedor + cola de rotaciones) en lugar de `FiltrosAnalitica`. El estado de servidor va todo por React Query contra un módulo de API nuevo, separado del de self-service. El drag and drop entra con `@dnd-kit/core`, la primera librería de DnD del repo.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind, React Query (@tanstack) v5, axios, react-router-dom, Vitest + @testing-library/react, `@dnd-kit/core` (nueva).

## Global Constraints

- **Repo:** `app-planificacion`, worktree `C:/Users/matia/orca/workspaces/app-planificacion/MatiasH11-plan-rotacion-editable-front`, rama `MatiasH11/plan-rotacion-editable-front`.
- **Tests:** Vitest. Suite completa: `npm test` (`vitest run`). Un archivo: `npx vitest run src/ruta/Archivo.test.tsx`. Compilación: `npx tsc -b`. Los tests viven al lado del fuente (`X.test.tsx` / `X.test.ts`), mockean módulos de API con `vi.mock('@/api/...')`.
- **Este plan depende del backend** descrito en `2026-08-11-backend-vista-gerencia-rotacion.md`. Los endpoints pueden no existir todavía cuando se implemente esto: **todos los tests mockean la capa de API**, así que la suite pasa sin backend. La verificación contra el server real queda para el final (Task 8, Step final) y puede quedar pendiente.
- **Envelope de la API:** el backend responde `{ ok: 1, data: ... }` y `apiClient` no lo desenvuelve solo — cada función de API devuelve `res.data.data`, como todo `src/api/planificacion.ts`.
- **Prefijo de rutas de gerencia:** `/planificacion/vendedores/:codigo/rotaciones...`. El `:codigo` va **URL-encodeado** (`encodeURIComponent`): los códigos de vendedor tienen espacios (`"V 2"`).
- **Roster de vendedores: NO se agrega endpoint.** Se reusa `useVendedores()` de `src/hooks/useAnalitica.ts`, que ya pega a `/planificacion/analitica/vendedores` y devuelve `IVendedorOpcion[]` (`{ codigoParticularVendedor, nombreVendedor }`).
- **Estados de rotación (valores exactos):** `'programada' | 'abierta' | 'cerrada' | 'cancelada'`.
- **Días (tipo ya existente):** `Dia = 'LUN' | 'MAR' | 'MIE' | 'JUE' | 'VIE'` en `src/types/planificacion.ts:1`. No crear otro.
- **Horas y fechas en TZ de negocio, nunca del dispositivo.** Se formatean con los helpers de `src/lib/fechas.ts` (anclados a `America/Argentina/Buenos_Aires`). Prohibido `slice(11,16)` sobre un ISO o `toLocaleString()` pelado.
- **Desktop-first.** Esta vista no se adapta a mobile: el grid es ancho y el drag and drop es de puntero. No agregar variantes táctiles.
- **No tocar el flujo del vendedor.** `src/api/planificacion.ts`, `useCiclo`, `useAgenda`, `ClienteCard`, `AgendaSemanaPage` quedan intactos salvo donde el plan lo diga explícitamente (solo la Task 1 toca un archivo compartido).
- Spec de referencia: `docs/superpowers/specs/2026-08-11-vista-gerencia-rotacion-design.md`.

## File Structure

**Modificados:**
- `src/lib/roles.ts` + `src/lib/roles.test.ts` — `ROLES_ANALITICA`/`esRolAnalitica` → `ROLES_GERENCIA`/`esRolGerencia`.
- `src/App.tsx` — ruta `/analitica/ruta`.
- `src/components/analitica/AnaliticaTabs.tsx` + `.test.tsx` — pestaña "Ruta".
- `src/router/ProtectedRoute.test.tsx` — usa el nombre nuevo del helper de roles.
- `src/types/planificacion.ts` — tipos del dominio de gerencia.
- `src/lib/fechas.ts` + `src/lib/fechas.test.ts` — `fechaHoraNegocio`.
- `package.json` — `@dnd-kit/core`.

**Creados:**
- `src/api/planificacionAdmin.ts` — las 8 llamadas de gerencia.
- `src/hooks/useRotacionAdmin.ts` + `.test.tsx` — queries y mutations.
- `src/pages/RutaPage.tsx` + `.test.tsx` — la página.
- `src/components/ruta/SelectorVendedor.tsx` + `.test.tsx`
- `src/components/ruta/ColaRotaciones.tsx` + `.test.tsx`
- `src/components/ruta/GridRotacion.tsx` + `.test.tsx`
- `src/components/ruta/ClienteCardRuta.tsx` + `.test.tsx`
- `src/components/ruta/DescripcionInline.tsx` + `.test.tsx`

---

### Task 1: Renombrar los roles de gerencia

**Files:**
- Modify: `src/lib/roles.ts`
- Modify: `src/lib/roles.test.ts`
- Modify: `src/App.tsx:6`, `:30`
- Modify: `src/router/ProtectedRoute.test.tsx:5`, `:33`

**Interfaces:**
- Consumes: nada.
- Produces: `ROLES_GERENCIA` y `esRolGerencia(rol)` — todas las tareas siguientes usan estos nombres. `esRolVendedor` y `rutaInicialPara` no cambian de nombre ni de comportamiento.

**Por qué:** la lista es "los roles de scope `unrestricted`", no "los roles de analítica", y a partir de este plan también guarda una ruta que no es analítica. El nombre viejo quedaría mintiendo en el único archivo donde se decide quién entra.

- [ ] **Step 1: Actualizar el test**

En `src/lib/roles.test.ts`, reemplazá cada `esRolAnalitica` por `esRolGerencia` (import incluido). El contenido de las aserciones no cambia: mismos tres roles, misma normalización de espacios y mayúsculas.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: FAIL — `esRolGerencia is not a function` (o error de import).

- [ ] **Step 3: Renombrar en `src/lib/roles.ts`**

```ts
/** Los roles de scope 'unrestricted' en api-vendedores/src/config/roles.ts.
 *  Si allá se agrega uno nuevo con ese scope, hay que sumarlo acá.
 *
 *  Se llaman "de gerencia" y no "de analítica" porque habilitan todo el grupo de rutas
 *  bajo /analitica, que además de los reportes incluye la edición de la ruta del vendedor
 *  (/analitica/ruta). */
export const ROLES_GERENCIA = ['admin', 'versus-ger', 'supervisor'] as const

const normalizar = (rol: string | undefined | null) => (rol ?? '').trim().toLowerCase()

export const esRolGerencia = (rol: string | undefined | null): boolean =>
    (ROLES_GERENCIA as readonly string[]).includes(normalizar(rol))

export const esRolVendedor = (rol: string | undefined | null): boolean =>
    normalizar(rol) === 'vendedor'

/** La pantalla donde arranca cada rol. null = sin acceso a la app. */
export const rutaInicialPara = (rol: string | undefined | null): string | null => {
    if (esRolVendedor(rol)) return '/'
    if (esRolGerencia(rol)) return '/analitica'
    return null
}
```

- [ ] **Step 4: Actualizar los dos consumidores**

En `src/App.tsx`, línea 6 y línea 30: `esRolAnalitica` → `esRolGerencia`.
En `src/router/ProtectedRoute.test.tsx`, línea 5 y línea 33: lo mismo.

- [ ] **Step 5: Compilar y correr la suite**

Run: `npx tsc -b && npm test`
Expected: compila limpio (si queda algún `esRolAnalitica`, `tsc` lo marca) y la suite pasa completa.

- [ ] **Step 6: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts src/App.tsx src/router/ProtectedRoute.test.tsx
git commit -m "refactor(roles): ROLES_GERENCIA describe mejor que ROLES_ANALITICA lo que habilita"
```

---

### Task 2: Tipos y capa de API de gerencia

**Files:**
- Modify: `src/types/planificacion.ts`
- Create: `src/api/planificacionAdmin.ts`
- Test: `src/api/planificacionAdmin.test.ts`

**Interfaces:**
- Consumes: `Dia`, `IAgendaClient` (ya existen en `src/types/planificacion.ts`).
- Produces (los usan todas las tareas siguientes):
  - `EstadoRotacion`, `IReacomodacionInfo`, `IAgendaClientAdmin`, `ISemanaRotacionAdmin`, `IRotacionResumen`, `IRotacionCompleta`
  - `getRotaciones(codigo): Promise<IRotacionResumen[]>`
  - `getRotacion(codigo, rotacionId): Promise<IRotacionCompleta>`
  - `crearRotacion(codigo): Promise<number>`
  - `reacomodarAdmin(codigo, rotacionId, rotacionClienteId, dto: IReacomodarDTO): Promise<void>`
  - `reordenarRotacion(codigo, rotacionId, orden): Promise<void>`
  - `cancelarRotacion(codigo, rotacionId): Promise<void>`
  - `editarDescripcionRotacion(codigo, rotacionId, descripcion): Promise<void>`
  - `editarDescripcionSemana(codigo, rotacionId, semana, descripcion): Promise<void>`

- [ ] **Step 1: Escribir el test que falla**

Creá `src/api/planificacionAdmin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from './apiClient'
import {
    cancelarRotacion,
    crearRotacion,
    editarDescripcionRotacion,
    editarDescripcionSemana,
    getRotacion,
    getRotaciones,
    reacomodarAdmin,
    reordenarRotacion,
} from './planificacionAdmin'

vi.mock('./apiClient', () => ({
    apiClient: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}))

beforeEach(() => vi.clearAllMocks())

describe('getRotaciones', () => {
    it('desenvuelve data.data y URL-encodea el código del vendedor', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: [{ id: 7, estado: 'abierta' }] },
        } as never)

        const cola = await getRotaciones('V 2')

        // El espacio del código tiene que viajar encodeado o el path se rompe.
        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones',
        )
        expect(cola).toEqual([{ id: 7, estado: 'abierta' }])
    })
})

describe('getRotacion', () => {
    it('pide el grid de una rotación puntual', async () => {
        vi.mocked(apiClient.get).mockResolvedValue({
            data: { ok: 1, data: { id: 7, semanas: [] } },
        } as never)

        const grid = await getRotacion('V 2', 7)

        expect(apiClient.get).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7',
        )
        expect(grid).toEqual({ id: 7, semanas: [] })
    })
})

describe('crearRotacion', () => {
    it('devuelve el rotacionId de la programada nueva', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({
            data: { ok: 1, data: { rotacionId: 30 } },
        } as never)

        await expect(crearRotacion('V 2')).resolves.toBe(30)
        expect(apiClient.post).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones',
        )
    })
})

describe('reacomodarAdmin', () => {
    it('manda semana y dia al endpoint de la fila', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await reacomodarAdmin('V 2', 7, 11, { semana: 3, dia: 4 })

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/rotacion-cliente/11/reacomodar',
            { semana: 3, dia: 4 },
        )
    })

    it('sin semana manda solo el dia', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await reacomodarAdmin('V 2', 7, 11, { dia: 2 })

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/rotacion-cliente/11/reacomodar',
            { dia: 2 },
        )
    })
})

describe('reordenarRotacion', () => {
    it('manda la posición nueva', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await reordenarRotacion('V 2', 32, 1)

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/32/orden',
            { orden: 1 },
        )
    })
})

describe('cancelarRotacion', () => {
    it('pega al DELETE de la rotación', async () => {
        vi.mocked(apiClient.delete).mockResolvedValue({ data: { ok: 1 } } as never)

        await cancelarRotacion('V 2', 30)

        expect(apiClient.delete).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/30',
        )
    })
})

describe('descripciones', () => {
    it('la de la rotación va al PATCH de la rotación', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await editarDescripcionRotacion('V 2', 7, 'Ronda Agosto')

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7',
            { descripcion: 'Ronda Agosto' },
        )
    })

    it('la de la semana va al PATCH de la semana', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await editarDescripcionSemana('V 2', 7, 2, 'Buenos Aires')

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/semanas/2',
            { descripcion: 'Buenos Aires' },
        )
    })

    it('un nombre vacío se manda como null para borrarlo', async () => {
        vi.mocked(apiClient.patch).mockResolvedValue({ data: { ok: 1 } } as never)

        await editarDescripcionSemana('V 2', 7, 2, null)

        expect(apiClient.patch).toHaveBeenCalledWith(
            '/planificacion/vendedores/V%202/rotaciones/7/semanas/2',
            { descripcion: null },
        )
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/api/planificacionAdmin.test.ts`
Expected: FAIL — no existe el módulo `./planificacionAdmin`.

- [ ] **Step 3: Agregar los tipos**

En `src/types/planificacion.ts`, agregá al final:

```ts
// ── Gerencia: la rotación de OTRO vendedor ─────────────────────────────────────

export type EstadoRotacion = 'programada' | 'abierta' | 'cerrada' | 'cancelada'

/** Quién movió una fila del plan por última vez. `usuario` es un email (o el id como
 *  string): los usuarios viven en el servicio de auth externo, así que la bitácora del
 *  backend guarda texto, no una FK. */
export interface IReacomodacionInfo {
    origen: 'vendedor' | 'gerencia'
    usuario: string
    /** Instante ISO en UTC. Se muestra con fechaHoraNegocio(), nunca crudo. */
    fecha: string
}

/** Una card del grid de gerencia: los mismos datos que ve el vendedor, más la autoría. */
export interface IAgendaClientAdmin extends IAgendaClient {
    ultimoMovimiento: IReacomodacionInfo | null
}

export interface ISemanaRotacionAdmin {
    semana: number
    /** El nombre de la zona, ej. "Buenos Aires". null = sin nombre todavía. */
    descripcion: string | null
    dias: Record<Dia, IAgendaClientAdmin[]>
}

/** Una rotación de la cola del vendedor, sin su grid. */
export interface IRotacionResumen {
    id: number
    codigoParticularVendedor: string
    estado: EstadoRotacion
    /** null mientras está 'programada': todavía no se sabe cuándo arranca. */
    fechaInicio: string | null
    fechaFin: string | null
    descripcion: string | null
    /** Posición en la cola. null en cualquier estado que no sea 'programada'. */
    orden: number | null
}

/** El grid completo de una rotación, en un solo payload. */
export interface IRotacionCompleta extends IRotacionResumen {
    semanas: ISemanaRotacionAdmin[]
    /** Códigos que el template traía pero no se pudieron materializar. */
    omitidos?: string[]
}
```

- [ ] **Step 4: Crear el módulo de API**

Creá `src/api/planificacionAdmin.ts`:

```ts
import { apiClient } from './apiClient'
import type {
    IReacomodarDTO,
    IRotacionCompleta,
    IRotacionResumen,
} from '@/types/planificacion'

/**
 * Las llamadas de GERENCIA sobre la rotación de otro vendedor.
 *
 * Separado de `planificacion.ts` a propósito: allá el vendedor sale del token y no viaja
 * en la URL; acá el vendedor es un parámetro y el permiso lo da el rol. Mezclarlos haría
 * fácil llamar por accidente a la variante que no corresponde.
 */

/** Los códigos de vendedor tienen espacios ("V 2"): sin encodear, el path se rompe. */
const base = (codigo: string) =>
    `/planificacion/vendedores/${encodeURIComponent(codigo)}/rotaciones`

/** La cola operable: la rotación vigente y las programadas en orden. */
export const getRotaciones = async (codigo: string): Promise<IRotacionResumen[]> => {
    const res = await apiClient.get(base(codigo))
    return res.data.data
}

/** El grid completo de una rotación: semanas × días × clientes. */
export const getRotacion = async (
    codigo: string,
    rotacionId: number,
): Promise<IRotacionCompleta> => {
    const res = await apiClient.get(`${base(codigo)}/${rotacionId}`)
    return res.data.data
}

/** Encola una rotación programada nueva, materializada contra el template de ahora. */
export const crearRotacion = async (codigo: string): Promise<number> => {
    const res = await apiClient.post(base(codigo))
    return res.data.data.rotacionId
}

/** Mueve una fila del plan de día y/o semana. Sin `semana`, solo cambia el día. */
export const reacomodarAdmin = async (
    codigo: string,
    rotacionId: number,
    rotacionClienteId: number,
    dto: IReacomodarDTO,
): Promise<void> => {
    await apiClient.patch(
        `${base(codigo)}/${rotacionId}/rotacion-cliente/${rotacionClienteId}/reacomodar`,
        dto,
    )
}

/** Cambia la posición de una programada en la cola (1 = la próxima en activarse). */
export const reordenarRotacion = async (
    codigo: string,
    rotacionId: number,
    orden: number,
): Promise<void> => {
    await apiClient.patch(`${base(codigo)}/${rotacionId}/orden`, { orden })
}

/** Cancela una programada. La vigente y las cerradas rebotan 409. */
export const cancelarRotacion = async (
    codigo: string,
    rotacionId: number,
): Promise<void> => {
    await apiClient.delete(`${base(codigo)}/${rotacionId}`)
}

export const editarDescripcionRotacion = async (
    codigo: string,
    rotacionId: number,
    descripcion: string | null,
): Promise<void> => {
    await apiClient.patch(`${base(codigo)}/${rotacionId}`, { descripcion })
}

/** Nombra una semana (ej. "Buenos Aires"). Funciona aunque la semana esté vacía. */
export const editarDescripcionSemana = async (
    codigo: string,
    rotacionId: number,
    semana: number,
    descripcion: string | null,
): Promise<void> => {
    await apiClient.patch(`${base(codigo)}/${rotacionId}/semanas/${semana}`, {
        descripcion,
    })
}
```

**Nota sobre `IReacomodarDTO`:** ya existe en `src/types/planificacion.ts:120` como `{ semana?: number; dia: number }`. Se reusa tal cual — es el mismo contrato que el self-service.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run src/api/planificacionAdmin.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacionAdmin.ts src/api/planificacionAdmin.test.ts
git commit -m "feat(ruta): tipos y capa de API de gerencia para la rotacion de un vendedor"
```

---

### Task 3: Hooks de React Query

**Files:**
- Create: `src/hooks/useRotacionAdmin.ts`
- Test: `src/hooks/useRotacionAdmin.test.tsx`

**Interfaces:**
- Consumes: todo `src/api/planificacionAdmin.ts` (Task 2).
- Produces:
  - `rotacionAdminKeys.cola(codigo)` y `rotacionAdminKeys.grid(codigo, rotacionId)`
  - `useRotaciones(codigo: string | null)`
  - `useRotacion(codigo: string | null, rotacionId: number | null)`
  - `useCrearRotacion(codigo)`, `useReacomodarAdmin(codigo)`, `useReordenarRotacion(codigo)`, `useCancelarRotacion(codigo)`, `useEditarDescripcionRotacion(codigo)`, `useEditarDescripcionSemana(codigo)`

- [ ] **Step 1: Escribir el test que falla**

Creá `src/hooks/useRotacionAdmin.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/api/planificacionAdmin'
import {
    useCancelarRotacion,
    useCrearRotacion,
    useReacomodarAdmin,
    useRotacion,
    useRotaciones,
} from './useRotacionAdmin'

vi.mock('@/api/planificacionAdmin')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('useRotaciones', () => {
    it('no consulta sin vendedor elegido', () => {
        renderHook(() => useRotaciones(null), { wrapper })
        expect(api.getRotaciones).not.toHaveBeenCalled()
    })

    it('trae la cola del vendedor elegido', async () => {
        vi.mocked(api.getRotaciones).mockResolvedValue([
            {
                id: 7,
                codigoParticularVendedor: 'V 2',
                estado: 'abierta',
                fechaInicio: '2026-08-03T12:00:00.000Z',
                fechaFin: null,
                descripcion: 'Ronda Agosto',
                orden: null,
            },
        ])

        const { result } = renderHook(() => useRotaciones('V 2'), { wrapper })

        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(api.getRotaciones).toHaveBeenCalledWith('V 2')
        expect(result.current.data?.[0].descripcion).toBe('Ronda Agosto')
    })
})

describe('useRotacion', () => {
    it('no consulta sin rotación elegida', () => {
        renderHook(() => useRotacion('V 2', null), { wrapper })
        expect(api.getRotacion).not.toHaveBeenCalled()
    })

    it('pide el grid de la rotación elegida', async () => {
        vi.mocked(api.getRotacion).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: null,
            fechaFin: null,
            descripcion: null,
            orden: null,
            semanas: [],
        })

        renderHook(() => useRotacion('V 2', 7), { wrapper })

        await waitFor(() => expect(api.getRotacion).toHaveBeenCalledWith('V 2', 7))
    })
})

describe('useReacomodarAdmin', () => {
    it('manda vendedor, rotación, fila y destino', async () => {
        vi.mocked(api.reacomodarAdmin).mockResolvedValue(undefined)

        const { result } = renderHook(() => useReacomodarAdmin('V 2'), { wrapper })
        await result.current.mutateAsync({
            rotacionId: 7,
            rotacionClienteId: 11,
            semana: 3,
            dia: 4,
        })

        expect(api.reacomodarAdmin).toHaveBeenCalledWith('V 2', 7, 11, {
            semana: 3,
            dia: 4,
        })
    })
})

describe('useCrearRotacion', () => {
    it('devuelve el id de la rotación nueva', async () => {
        vi.mocked(api.crearRotacion).mockResolvedValue(30)

        const { result } = renderHook(() => useCrearRotacion('V 2'), { wrapper })

        await expect(result.current.mutateAsync()).resolves.toBe(30)
        expect(api.crearRotacion).toHaveBeenCalledWith('V 2')
    })
})

describe('useCancelarRotacion', () => {
    it('cancela por id', async () => {
        vi.mocked(api.cancelarRotacion).mockResolvedValue(undefined)

        const { result } = renderHook(() => useCancelarRotacion('V 2'), { wrapper })
        await result.current.mutateAsync(30)

        expect(api.cancelarRotacion).toHaveBeenCalledWith('V 2', 30)
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx`
Expected: FAIL — no existe `./useRotacionAdmin`.

- [ ] **Step 3: Implementar los hooks**

Creá `src/hooks/useRotacionAdmin.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    cancelarRotacion,
    crearRotacion,
    editarDescripcionRotacion,
    editarDescripcionSemana,
    getRotacion,
    getRotaciones,
    reacomodarAdmin,
    reordenarRotacion,
} from '@/api/planificacionAdmin'
import type { IReacomodarDTO } from '@/types/planificacion'

export const rotacionAdminKeys = {
    /** Toda la data de gerencia de un vendedor, para invalidar de una. */
    vendedor: (codigo: string) => ['rotacionAdmin', codigo] as const,
    cola: (codigo: string) => ['rotacionAdmin', codigo, 'cola'] as const,
    grid: (codigo: string, rotacionId: number) =>
        ['rotacionAdmin', codigo, 'grid', rotacionId] as const,
}

/** `codigo` null = todavía no se eligió vendedor: no se consulta nada. */
export function useRotaciones(codigo: string | null) {
    return useQuery({
        queryKey: rotacionAdminKeys.cola(codigo ?? ''),
        queryFn: () => getRotaciones(codigo as string),
        enabled: codigo !== null,
    })
}

export function useRotacion(codigo: string | null, rotacionId: number | null) {
    return useQuery({
        queryKey: rotacionAdminKeys.grid(codigo ?? '', rotacionId ?? 0),
        queryFn: () => getRotacion(codigo as string, rotacionId as number),
        enabled: codigo !== null && rotacionId !== null,
    })
}

/** Encola una programada nueva. Invalida la cola: hay un chip más. */
export function useCrearRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => crearRotacion(codigo),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

/**
 * Mover una card. Invalida solo el grid de ESA rotación: la cola no cambió y los grids de
 * las otras rotaciones tampoco — un reacomodo nunca cruza rotaciones.
 */
export function useReacomodarAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (
            args: { rotacionId: number; rotacionClienteId: number } & IReacomodarDTO,
        ) =>
            reacomodarAdmin(codigo, args.rotacionId, args.rotacionClienteId, {
                semana: args.semana,
                dia: args.dia,
            }),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}

export function useReordenarRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; orden: number }) =>
            reordenarRotacion(codigo, args.rotacionId, args.orden),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

export function useCancelarRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rotacionId: number) => cancelarRotacion(codigo, rotacionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

/** El nombre de la rotación se ve en el chip (cola) y en el grid: invalida los dos. */
export function useEditarDescripcionRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; descripcion: string | null }) =>
            editarDescripcionRotacion(codigo, args.rotacionId, args.descripcion),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.vendedor(codigo) })
        },
    })
}

export function useEditarDescripcionSemana(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: {
            rotacionId: number
            semana: number
            descripcion: string | null
        }) => editarDescripcionSemana(codigo, args.rotacionId, args.semana, args.descripcion),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/hooks/useRotacionAdmin.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRotacionAdmin.ts src/hooks/useRotacionAdmin.test.tsx
git commit -m "feat(ruta): hooks de React Query para la rotacion de gerencia"
```

---

### Task 4: Pestaña "Ruta", ruta y página con selector de vendedor

**Files:**
- Modify: `src/components/analitica/AnaliticaTabs.tsx`
- Modify: `src/components/analitica/AnaliticaTabs.test.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/ruta/SelectorVendedor.tsx`
- Create: `src/components/ruta/SelectorVendedor.test.tsx`
- Create: `src/pages/RutaPage.tsx`
- Create: `src/pages/RutaPage.test.tsx`

**Interfaces:**
- Consumes: `useVendedores()` de `src/hooks/useAnalitica.ts` (devuelve `IVendedorOpcion[]`), `useRotaciones` (Task 3), `esRolGerencia` (Task 1).
- Produces: ruta `/analitica/ruta` navegable; `RutaPage` con el vendedor elegido en estado local; `SelectorVendedor` con props `{ vendedores, elegido, onElegir }`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/components/analitica/AnaliticaTabs.test.tsx`, agregá la pestaña nueva a los dos tests existentes y uno propio:

```tsx
it('apunta la pestaña Ruta a /analitica/ruta', () => {
    render(
        <MemoryRouter initialEntries={['/analitica']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Ruta' })).toHaveAttribute(
        'href',
        '/analitica/ruta',
    )
})

it('marca Ruta como activa cuando es la ruta actual', () => {
    render(
        <MemoryRouter initialEntries={['/analitica/ruta']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Ruta' })).toHaveClass('border-slate-900')
})
```

Creá `src/components/ruta/SelectorVendedor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectorVendedor from './SelectorVendedor'

const VENDEDORES = [
    { codigoParticularVendedor: 'V 2', nombreVendedor: 'Juan Pérez' },
    { codigoParticularVendedor: 'V 5', nombreVendedor: 'Ana Gómez' },
]

describe('SelectorVendedor', () => {
    it('lista los vendedores disponibles', () => {
        render(
            <SelectorVendedor vendedores={VENDEDORES} elegido={null} onElegir={vi.fn()} />,
        )
        expect(screen.getByRole('option', { name: 'Juan Pérez' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Ana Gómez' })).toBeInTheDocument()
    })

    it('avisa el código elegido, no el nombre', async () => {
        const onElegir = vi.fn()
        render(
            <SelectorVendedor vendedores={VENDEDORES} elegido={null} onElegir={onElegir} />,
        )

        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 5')

        expect(onElegir).toHaveBeenCalledWith('V 5')
    })

    it('sin vendedor elegido muestra el placeholder', () => {
        render(
            <SelectorVendedor vendedores={VENDEDORES} elegido={null} onElegir={vi.fn()} />,
        )
        expect(screen.getByLabelText('Vendedor')).toHaveValue('')
    })
})
```

Creá `src/pages/RutaPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiAdmin from '@/api/planificacionAdmin'
import * as apiAnalitica from '@/api/analitica'
import RutaPage from './RutaPage'

vi.mock('@/api/planificacionAdmin')
vi.mock('@/api/analitica')
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { name: 'Jefa', rol: 'admin' }, logout: vi.fn() }),
}))

function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={['/analitica/ruta']}>
                <RutaPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiAnalitica.getVendedores).mockResolvedValue([
        { codigoParticularVendedor: 'V 2', nombreVendedor: 'Juan Pérez' },
    ])
})

describe('RutaPage', () => {
    it('sin vendedor elegido no pide ninguna rotación', async () => {
        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        expect(apiAdmin.getRotaciones).not.toHaveBeenCalled()
    })

    it('pide la cola del vendedor recién elegido', async () => {
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([])
        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })

        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')

        expect(apiAdmin.getRotaciones).toHaveBeenCalledWith('V 2')
    })

    it('invita a elegir un vendedor mientras no haya ninguno', async () => {
        renderPage()
        expect(await screen.findByText(/elegí un vendedor/i)).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ruta src/pages/RutaPage.test.tsx src/components/analitica/AnaliticaTabs.test.tsx`
Expected: FAIL — no existen `SelectorVendedor` ni `RutaPage`, y no hay link "Ruta".

- [ ] **Step 3: Agregar la pestaña**

En `src/components/analitica/AnaliticaTabs.tsx`, agregá después del `NavLink` de Actividad (antes de cerrar `</nav>`):

```tsx
            <NavLink
                to="/analitica/ruta"
                className={({ isActive }) => tabClase(isActive)}
            >
                Ruta
            </NavLink>
```

- [ ] **Step 4: Crear el selector**

Creá `src/components/ruta/SelectorVendedor.tsx`:

```tsx
import type { IVendedorOpcion } from '@/types/analitica'

interface SelectorVendedorProps {
    vendedores: IVendedorOpcion[]
    /** null = todavía no se eligió ninguno. */
    elegido: string | null
    onElegir: (codigo: string) => void
}

/**
 * Single-select, a diferencia del multi-select de `FiltrosAnalitica`: acá gerencia opera
 * sobre UN vendedor a la vez (su rotación es una), no compara varios como en un reporte.
 *
 * Es un `<select>` nativo y no un dropdown a mano: el repo no tiene primitiva de Select
 * (solo button/badge/avatar/BottomSheet/Notification), el nativo ya viene con teclado y
 * accesibilidad, y la lista de vendedores es corta.
 */
export default function SelectorVendedor({
    vendedores,
    elegido,
    onElegir,
}: SelectorVendedorProps) {
    return (
        <label className="flex flex-col text-xs font-medium text-slate-600">
            Vendedor
            <select
                aria-label="Vendedor"
                value={elegido ?? ''}
                onChange={e => onElegir(e.target.value)}
                className="mt-1 min-w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            >
                <option value="">Elegí un vendedor…</option>
                {vendedores.map(v => (
                    <option
                        key={v.codigoParticularVendedor}
                        value={v.codigoParticularVendedor}
                    >
                        {v.nombreVendedor}
                    </option>
                ))}
            </select>
        </label>
    )
}
```

- [ ] **Step 5: Crear la página**

Creá `src/pages/RutaPage.tsx`:

```tsx
import { useState } from 'react'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import AccountMenu from '@/components/AccountMenu'
import SelectorVendedor from '@/components/ruta/SelectorVendedor'
import { useAuth } from '@/context/AuthContext'
import { useVendedores } from '@/hooks/useAnalitica'
import { useRotaciones } from '@/hooks/useRotacionAdmin'

/**
 * Edición de la ruta (rotación) de un vendedor, para gerencia.
 *
 * Mismo shell que las páginas de Analítica (header + tabs + AccountMenu) pero SIN
 * `FiltrosAnalitica`: ese filtro es rango de fechas + multi-vendedor, pensado para
 * reportes. Acá se opera sobre un vendedor y una rotación a la vez.
 */
export default function RutaPage() {
    const { user, logout } = useAuth()
    const [vendedor, setVendedor] = useState<string | null>(null)

    const { data: roster } = useVendedores()
    const { data: cola, isLoading, isError } = useRotaciones(vendedor)

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1">
                    <AnaliticaTabs />
                </div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} />
            </header>

            <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-white px-6 py-4">
                <SelectorVendedor
                    vendedores={roster ?? []}
                    elegido={vendedor}
                    onElegir={codigo => setVendedor(codigo === '' ? null : codigo)}
                />
            </div>

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {vendedor === null && (
                    <p className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Elegí un vendedor para ver y editar su ruta.
                    </p>
                )}

                {vendedor !== null && isLoading && (
                    <p className="text-sm text-slate-500">Cargando…</p>
                )}

                {vendedor !== null && isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo cargar la ruta de este vendedor. Probá de nuevo en un
                        momento.
                    </p>
                )}

                {vendedor !== null && cola?.length === 0 && (
                    <p className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Este vendedor todavía no tiene ninguna rotación.
                    </p>
                )}
            </main>
        </div>
    )
}
```

- [ ] **Step 6: Montar la ruta**

En `src/App.tsx`, agregá el import y la ruta dentro del grupo de `esRolGerencia`:

```tsx
import RutaPage from '@/pages/RutaPage'
```

```tsx
                            <Route path="/analitica/ruta" element={<RutaPage />} />
```

- [ ] **Step 7: Correr y verificar que pasa**

Run: `npx tsc -b && npm test`
Expected: compila y la suite pasa completa, incluidos los tests nuevos.

- [ ] **Step 8: Commit**

```bash
git add src/components/analitica/AnaliticaTabs.tsx src/components/analitica/AnaliticaTabs.test.tsx src/App.tsx src/components/ruta/ src/pages/RutaPage.tsx src/pages/RutaPage.test.tsx
git commit -m "feat(ruta): pestana Ruta con selector de vendedor"
```

---

### Task 5: Cola de rotaciones (chips), crear y cancelar

**Files:**
- Create: `src/components/ruta/ColaRotaciones.tsx`
- Create: `src/components/ruta/ColaRotaciones.test.tsx`
- Modify: `src/pages/RutaPage.tsx`
- Modify: `src/pages/RutaPage.test.tsx`

**Interfaces:**
- Consumes: `IRotacionResumen` (Task 2), `useCrearRotacion`/`useCancelarRotacion` (Task 3).
- Produces: `ColaRotaciones` con props `{ rotaciones, activaId, onElegir, onCrear, onCancelar, creando }`. `RutaPage` sostiene `rotacionActivaId` en estado local.

- [ ] **Step 1: Escribir los tests que fallan**

Creá `src/components/ruta/ColaRotaciones.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ColaRotaciones from './ColaRotaciones'
import type { IRotacionResumen } from '@/types/planificacion'

const base = {
    codigoParticularVendedor: 'V 2',
    fechaInicio: null,
    fechaFin: null,
    descripcion: null,
} as const

const COLA: IRotacionResumen[] = [
    { ...base, id: 7, estado: 'abierta', orden: null, descripcion: 'Ronda Agosto' },
    { ...base, id: 30, estado: 'programada', orden: 1 },
    { ...base, id: 31, estado: 'programada', orden: 2, descripcion: 'Ronda Octubre' },
]

function renderCola(overrides = {}) {
    const props = {
        rotaciones: COLA,
        activaId: 7,
        onElegir: vi.fn(),
        onCrear: vi.fn(),
        onCancelar: vi.fn(),
        creando: false,
        ...overrides,
    }
    render(<ColaRotaciones {...props} />)
    return props
}

describe('ColaRotaciones', () => {
    it('usa la descripción como etiqueta cuando la rotación tiene una', () => {
        renderCola()
        expect(screen.getByRole('button', { name: /Ronda Agosto/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Ronda Octubre/ })).toBeInTheDocument()
    })

    it('sin descripción, etiqueta la vigente como Actual y las demás por posición', () => {
        renderCola({
            rotaciones: [
                { ...base, id: 7, estado: 'abierta', orden: null },
                { ...base, id: 30, estado: 'programada', orden: 1 },
            ],
        })
        expect(screen.getByRole('button', { name: /Actual/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Programada #1/ })).toBeInTheDocument()
    })

    it('avisa qué rotación se eligió', async () => {
        const props = renderCola()
        await userEvent.click(screen.getByRole('button', { name: /Ronda Octubre/ }))
        expect(props.onElegir).toHaveBeenCalledWith(31)
    })

    it('la rotación vigente no se puede cancelar', () => {
        renderCola()
        // Una sola acción de cancelar por cada programada, ninguna para la abierta.
        expect(screen.getAllByRole('button', { name: /cancelar/i })).toHaveLength(2)
    })

    it('pide confirmación antes de cancelar', async () => {
        const props = renderCola()
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)

        await userEvent.click(screen.getAllByRole('button', { name: /cancelar/i })[0])

        expect(confirmar).toHaveBeenCalled()
        expect(props.onCancelar).not.toHaveBeenCalled()
        confirmar.mockRestore()
    })

    it('cancela cuando se confirma', async () => {
        const props = renderCola()
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)

        await userEvent.click(screen.getAllByRole('button', { name: /cancelar/i })[0])

        expect(props.onCancelar).toHaveBeenCalledWith(30)
        confirmar.mockRestore()
    })

    it('el botón de agregar avisa y se bloquea mientras crea', async () => {
        const props = renderCola({ creando: true })
        const agregar = screen.getByRole('button', { name: /agregar rotación/i })

        expect(agregar).toBeDisabled()
        await userEvent.click(agregar)
        expect(props.onCrear).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ruta/ColaRotaciones.test.tsx`
Expected: FAIL — no existe `./ColaRotaciones`.

- [ ] **Step 3: Crear el componente**

Creá `src/components/ruta/ColaRotaciones.tsx`:

```tsx
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IRotacionResumen } from '@/types/planificacion'

interface ColaRotacionesProps {
    rotaciones: IRotacionResumen[]
    activaId: number | null
    onElegir: (rotacionId: number) => void
    onCrear: () => void
    onCancelar: (rotacionId: number) => void
    creando: boolean
}

/** El nombre que le puso gerencia, o una etiqueta derivada del estado. */
export function etiquetaDe(rotacion: IRotacionResumen): string {
    if (rotacion.descripcion) return rotacion.descripcion
    if (rotacion.estado === 'abierta') return 'Actual'
    return `Programada #${rotacion.orden ?? '?'}`
}

/**
 * La cola de rotaciones del vendedor: la vigente y las programadas, en orden.
 *
 * La vigente no se puede cancelar (el vendedor está trabajando sobre ella) ni reordenar
 * (no está en la cola). Las programadas sí.
 */
export default function ColaRotaciones({
    rotaciones,
    activaId,
    onElegir,
    onCrear,
    onCancelar,
    creando,
}: ColaRotacionesProps) {
    // Cancelar borra trabajo de planificación que puede haber llevado un rato, y el
    // backend no lo revierte: se confirma antes.
    const confirmarCancelar = (rotacion: IRotacionResumen) => {
        const ok = window.confirm(
            `¿Cancelar "${etiquetaDe(rotacion)}"? Se descarta su planificación.`,
        )
        if (ok) onCancelar(rotacion.id)
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {rotaciones.map(rotacion => {
                const activa = rotacion.id === activaId
                return (
                    <span
                        key={rotacion.id}
                        className={`inline-flex items-center gap-1 rounded-full border pl-1 ${
                            activa
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300 bg-white text-slate-700'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => onElegir(rotacion.id)}
                            className="rounded-full px-3 py-1 text-sm font-medium"
                        >
                            {etiquetaDe(rotacion)}
                        </button>
                        {rotacion.estado === 'programada' && (
                            <button
                                type="button"
                                aria-label={`Cancelar ${etiquetaDe(rotacion)}`}
                                onClick={() => confirmarCancelar(rotacion)}
                                className={`mr-1 rounded-full p-1 ${
                                    activa ? 'hover:bg-white/20' : 'hover:bg-slate-100'
                                }`}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </span>
                )
            })}

            <Button variant="outline" size="sm" onClick={onCrear} disabled={creando}>
                <Plus className="mr-1 h-4 w-4" />
                {creando ? 'Agregando…' : 'Agregar rotación'}
            </Button>
        </div>
    )
}
```

**Ojo con el nombre accesible del botón de agregar:** el test lo busca por `/agregar rotación/i`, y mientras `creando` es true el texto pasa a "Agregando…". El test que verifica el bloqueo pasa `creando: true`, así que buscá el botón por su estado deshabilitado y no por el texto si el matcher falla — o dejale un `aria-label="Agregar rotación"` fijo al `Button` para que el nombre no dependa del estado. **Hacelo con el `aria-label` fijo:** es más robusto y es lo que el test espera.

```tsx
            <Button
                variant="outline"
                size="sm"
                aria-label="Agregar rotación"
                onClick={onCrear}
                disabled={creando}
            >
```

- [ ] **Step 4: Enchufar la cola en la página**

En `src/pages/RutaPage.tsx`:

1. Agregá los imports:

```tsx
import ColaRotaciones from '@/components/ruta/ColaRotaciones'
import { useCancelarRotacion, useCrearRotacion, useRotaciones } from '@/hooks/useRotacionAdmin'
```

2. Agregá el estado de la rotación activa y las mutations. `vendedor ?? ''` en los hooks de mutation: no se disparan sin vendedor porque los botones no se renderizan, y así se evita un hook condicional.

```tsx
    const [rotacionActivaId, setRotacionActivaId] = useState<number | null>(null)

    const crear = useCrearRotacion(vendedor ?? '')
    const cancelar = useCancelarRotacion(vendedor ?? '')
```

3. Al cambiar de vendedor hay que soltar la rotación activa (es de otro vendedor):

```tsx
    const elegirVendedor = (codigo: string) => {
        setVendedor(codigo === '' ? null : codigo)
        // La rotación activa era del vendedor anterior: sin esto, el grid pediría un id
        // que no le pertenece y el backend contestaría 404.
        setRotacionActivaId(null)
    }
```

y pasale `onElegir={elegirVendedor}` al `SelectorVendedor`.

4. La rotación activa por defecto es la vigente del vendedor, o la primera de la cola:

```tsx
    const rotacionElegida =
        rotacionActivaId ??
        cola?.find(r => r.estado === 'abierta')?.id ??
        cola?.[0]?.id ??
        null
```

5. Renderizá la cola cuando haya uno o más chips, dentro del `<main>` y antes de los estados vacíos:

```tsx
                {vendedor !== null && cola && cola.length > 0 && (
                    <ColaRotaciones
                        rotaciones={cola}
                        activaId={rotacionElegida}
                        onElegir={setRotacionActivaId}
                        onCrear={() => crear.mutate()}
                        onCancelar={id => cancelar.mutate(id)}
                        creando={crear.isPending}
                    />
                )}
```

6. El estado vacío de "sin rotaciones" también tiene que ofrecer crear la primera. Reemplazá ese bloque por:

```tsx
                {vendedor !== null && cola?.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
                        <p className="text-sm text-slate-600">
                            Este vendedor todavía no tiene ninguna rotación.
                        </p>
                        <div className="mt-3 flex justify-center">
                            <ColaRotaciones
                                rotaciones={[]}
                                activaId={null}
                                onElegir={setRotacionActivaId}
                                onCrear={() => crear.mutate()}
                                onCancelar={id => cancelar.mutate(id)}
                                creando={crear.isPending}
                            />
                        </div>
                    </div>
                )}
```

- [ ] **Step 5: Agregar el test de integración de la página**

En `src/pages/RutaPage.test.tsx`, agregá:

```tsx
    it('muestra los chips de la cola y preselecciona la rotación vigente', async () => {
        vi.mocked(apiAdmin.getRotaciones).mockResolvedValue([
            {
                id: 7,
                codigoParticularVendedor: 'V 2',
                estado: 'abierta',
                fechaInicio: '2026-08-03T12:00:00.000Z',
                fechaFin: null,
                descripcion: 'Ronda Agosto',
                orden: null,
            },
            {
                id: 30,
                codigoParticularVendedor: 'V 2',
                estado: 'programada',
                fechaInicio: null,
                fechaFin: null,
                descripcion: null,
                orden: 1,
            },
        ])
        vi.mocked(apiAdmin.getRotacion).mockResolvedValue({
            id: 7,
            codigoParticularVendedor: 'V 2',
            estado: 'abierta',
            fechaInicio: '2026-08-03T12:00:00.000Z',
            fechaFin: null,
            descripcion: 'Ronda Agosto',
            orden: null,
            semanas: [],
        })

        renderPage()
        await screen.findByRole('option', { name: 'Juan Pérez' })
        await userEvent.selectOptions(screen.getByLabelText('Vendedor'), 'V 2')

        expect(await screen.findByRole('button', { name: /Ronda Agosto/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Programada #1/ })).toBeInTheDocument()
    })
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `npx tsc -b && npm test`
Expected: compila y suite verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/ruta/ColaRotaciones.tsx src/components/ruta/ColaRotaciones.test.tsx src/pages/RutaPage.tsx src/pages/RutaPage.test.tsx
git commit -m "feat(ruta): cola de rotaciones con alta y cancelacion"
```

---

### Task 6: Grid de semanas × días con card propia

**Files:**
- Modify: `src/lib/fechas.ts`
- Modify: `src/lib/fechas.test.ts`
- Create: `src/components/ruta/ClienteCardRuta.tsx`
- Create: `src/components/ruta/ClienteCardRuta.test.tsx`
- Create: `src/components/ruta/GridRotacion.tsx`
- Create: `src/components/ruta/GridRotacion.test.tsx`
- Modify: `src/pages/RutaPage.tsx`

**Interfaces:**
- Consumes: `IAgendaClientAdmin`, `ISemanaRotacionAdmin` (Task 2), `useRotacion` (Task 3), `titleCaseNombre` (`src/lib/textFormat.ts`), `estaResuelto` (`src/lib/estadoCiclo.ts`).
- Produces: `fechaHoraNegocio(iso)`; `ClienteCardRuta` con props `{ cliente }`; `GridRotacion` con props `{ semanas }`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/fechas.test.ts`, agregá:

```ts
describe('fechaHoraNegocio', () => {
    it('formatea en hora argentina, no en la del dispositivo', () => {
        // 14:05 UTC son 11:05 en Buenos Aires (-03:00).
        expect(fechaHoraNegocio('2026-08-11T14:05:00.000Z')).toBe('11/08 11:05')
    })

    it('null o basura devuelven guión', () => {
        expect(fechaHoraNegocio(null)).toBe('—')
        expect(fechaHoraNegocio('no-es-una-fecha')).toBe('—')
    })
})
```

(agregá `fechaHoraNegocio` al import de ese archivo)

Creá `src/components/ruta/ClienteCardRuta.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClienteCardRuta from './ClienteCardRuta'
import type { IAgendaClientAdmin } from '@/types/planificacion'

const CLIENTE = {
    rotacionClienteId: 11,
    codigoCliente: 'C001',
    codigoParticularCliente: 'P001',
    nombreCliente: 'KIOSCO DON JUAN',
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    rubrosPendientes: 0,
    ultimoMovimiento: null,
} as unknown as IAgendaClientAdmin

describe('ClienteCardRuta', () => {
    it('muestra el nombre en title case y el código particular', () => {
        render(<ClienteCardRuta cliente={CLIENTE} />)
        expect(screen.getByText('Kiosco Don Juan')).toBeInTheDocument()
        expect(screen.getByText('P001')).toBeInTheDocument()
    })

    it('sin movimientos no muestra autoría', () => {
        render(<ClienteCardRuta cliente={CLIENTE} />)
        expect(screen.queryByTitle(/movió/i)).not.toBeInTheDocument()
    })

    it('muestra quién movió la fila y cuándo, en hora de negocio', () => {
        render(
            <ClienteCardRuta
                cliente={{
                    ...CLIENTE,
                    ultimoMovimiento: {
                        origen: 'gerencia',
                        usuario: 'jefa@distrisuper.com',
                        fecha: '2026-08-11T14:05:00.000Z',
                    },
                }}
            />,
        )
        expect(
            screen.getByTitle('Movió gerencia (jefa@distrisuper.com) el 11/08 11:05'),
        ).toBeInTheDocument()
    })

    it('marca visualmente al cliente ya resuelto: no se puede mover', () => {
        render(<ClienteCardRuta cliente={{ ...CLIENTE, estado: 'visitada' }} />)
        expect(screen.getByTestId('card-cliente-11')).toHaveAttribute(
            'data-resuelto',
            'true',
        )
    })
})
```

Creá `src/components/ruta/GridRotacion.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GridRotacion from './GridRotacion'
import type { ISemanaRotacionAdmin } from '@/types/planificacion'

const vacia = () => ({ LUN: [], MAR: [], MIE: [], JUE: [], VIE: [] })

const SEMANAS: ISemanaRotacionAdmin[] = [
    {
        semana: 1,
        descripcion: 'Zona Norte',
        dias: {
            ...vacia(),
            LUN: [
                {
                    rotacionClienteId: 11,
                    codigoParticularCliente: 'P001',
                    nombreCliente: 'Kiosco Uno',
                    dia: 1,
                    estado: 'pendiente',
                    visitaId: null,
                    rubrosPendientes: 0,
                    ultimoMovimiento: null,
                },
            ] as never,
        },
    },
    { semana: 3, descripcion: null, dias: vacia() },
]

describe('GridRotacion', () => {
    it('rotula cada semana con su número y su zona', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        expect(screen.getByText(/Semana 1/)).toBeInTheDocument()
        expect(screen.getByText(/Zona Norte/)).toBeInTheDocument()
    })

    it('muestra las semanas vacías del set, no solo las que tienen clientes', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        // La semana 3 existe en el set y no tiene ni un cliente: tiene que estar igual,
        // porque es una celda válida para soltarle una card encima.
        expect(screen.getByText(/Semana 3/)).toBeInTheDocument()
    })

    it('encabeza las cinco columnas de días', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        for (const dia of ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']) {
            expect(screen.getByText(dia)).toBeInTheDocument()
        }
    })

    it('pone cada cliente en la celda de su día', () => {
        render(<GridRotacion semanas={SEMANAS} />)
        const celda = screen.getByTestId('celda-1-LUN')
        expect(celda).toContainElement(screen.getByTestId('card-cliente-11'))
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/fechas.test.ts src/components/ruta`
Expected: FAIL — `fechaHoraNegocio` no existe, ni los dos componentes.

- [ ] **Step 3: Agregar `fechaHoraNegocio`**

En `src/lib/fechas.ts`, después de `horaNegocio`:

```ts
const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ_NEGOCIO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})

/**
 * 'DD/MM HH:mm' en hora argentina a partir de un instante ISO 8601. null → '—'.
 *
 * Mismo motivo que `horaNegocio`: el backend manda instantes en UTC, y tanto
 * `slice()` sobre el ISO como `toLocaleString()` pelado mostrarían otra hora (Greenwich
 * el primero, la del dispositivo el segundo — una notebook de gerencia con otra TZ
 * correría los horarios de todo el equipo).
 */
export function fechaHoraNegocio(iso: string | null | undefined): string {
    if (!iso) return '—'
    const instante = new Date(iso)
    if (Number.isNaN(instante.getTime())) return '—'
    // es-AR intercala ', ' entre fecha y hora; acá se quiere un solo espacio.
    return FORMATO_FECHA_HORA.format(instante).replace(', ', ' ').replace(/^24:/, '00:')
}
```

**Si el test falla por el separador:** distintos runtimes de ICU emiten `'11/08, 11:05'` o `'11/08 11:05'`. El `.replace(', ', ' ')` cubre el primero. Si aparece otro separador (ej. un espacio fino U+202F), normalizá con `.replace(/[\s,\u202f]+/g, ' ').trim()` en lugar del replace simple.

- [ ] **Step 4: Crear la card**

Creá `src/components/ruta/ClienteCardRuta.tsx`:

```tsx
import { titleCaseNombre } from '@/lib/textFormat'
import { estaResuelto } from '@/lib/estadoCiclo'
import { fechaHoraNegocio } from '@/lib/fechas'
import type { IAgendaClientAdmin } from '@/types/planificacion'

interface ClienteCardRutaProps {
    cliente: IAgendaClientAdmin
}

/**
 * La card del grid de gerencia.
 *
 * NO reusa `ClienteCard` (la de la agenda del vendedor) a propósito: esa exige cuatro
 * callbacks del ciclo de la visita —`onAbrir`, `onEstadoVisita`, `onIniciarVisita`,
 * `onAbrirAppExterna`— que acá no significan nada. Gerencia no inicia visitas ni abre
 * Versus: mueve clientes de casillero. Pasarle handlers vacíos para reusarla habría dejado
 * botones muertos en pantalla.
 */
export default function ClienteCardRuta({ cliente }: ClienteCardRutaProps) {
    const resuelto = estaResuelto(cliente.estado)

    const autoria = cliente.ultimoMovimiento
        ? `Movió ${cliente.ultimoMovimiento.origen} (${cliente.ultimoMovimiento.usuario}) el ${fechaHoraNegocio(cliente.ultimoMovimiento.fecha)}`
        : null

    return (
        <div
            data-testid={`card-cliente-${cliente.rotacionClienteId}`}
            // Una fila ya resuelta no se puede mover: el backend la rechaza con
            // FILA_RESUELTA. Se marca en el DOM para que el grid la excluya del drag.
            data-resuelto={resuelto ? 'true' : 'false'}
            className={`rounded-md border px-2 py-1.5 text-xs ${
                resuelto
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-800'
            }`}
        >
            <p className="font-medium leading-tight">
                {titleCaseNombre(cliente.nombreCliente)}
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-1">
                <span className="text-[11px] text-slate-500">
                    {cliente.codigoParticularCliente}
                </span>
                {autoria && (
                    <span
                        title={autoria}
                        aria-label={autoria}
                        className="cursor-help text-[11px] text-slate-400"
                    >
                        ✎
                    </span>
                )}
            </div>
        </div>
    )
}
```

- [ ] **Step 5: Crear el grid**

Creá `src/components/ruta/GridRotacion.tsx`:

```tsx
import ClienteCardRuta from './ClienteCardRuta'
import type { Dia, ISemanaRotacionAdmin } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
}

/**
 * El plan completo de una rotación: una fila por semana, cinco columnas de día.
 *
 * Las semanas salen del payload tal como vienen —incluidas las vacías— porque el backend
 * las deriva del SET de la rotación (`pl_rotacion_semana`) y no de los clientes. Una
 * semana sin clientes sigue siendo un destino válido para arrastrar una card.
 */
export default function GridRotacion({ semanas }: GridRotacionProps) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-4xl border-separate border-spacing-1">
                <thead>
                    <tr>
                        <th className="w-40 text-left text-xs font-medium text-slate-500">
                            Semana
                        </th>
                        {DIAS.map(dia => (
                            <th
                                key={dia}
                                className="text-left text-xs font-semibold text-slate-600"
                            >
                                {dia}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {semanas.map(semana => (
                        <tr key={semana.semana}>
                            <th className="align-top text-left">
                                <span className="block text-sm font-semibold text-slate-900">
                                    Semana {semana.semana}
                                </span>
                                {semana.descripcion && (
                                    <span className="block text-xs font-normal text-slate-500">
                                        {semana.descripcion}
                                    </span>
                                )}
                            </th>
                            {DIAS.map(dia => (
                                <td
                                    key={dia}
                                    data-testid={`celda-${semana.semana}-${dia}`}
                                    className="min-w-40 space-y-1 rounded-md bg-white p-1.5 align-top"
                                >
                                    {semana.dias[dia].map(cliente => (
                                        <ClienteCardRuta
                                            key={cliente.rotacionClienteId}
                                            cliente={cliente}
                                        />
                                    ))}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
```

- [ ] **Step 6: Enchufar el grid en la página**

En `src/pages/RutaPage.tsx`, agregá el import de `GridRotacion` y el hook del grid, y renderizalo después de la cola:

```tsx
import GridRotacion from '@/components/ruta/GridRotacion'
import { useRotacion } from '@/hooks/useRotacionAdmin'
```

```tsx
    const { data: grid, isLoading: cargandoGrid } = useRotacion(vendedor, rotacionElegida)
```

```tsx
                {rotacionElegida !== null && cargandoGrid && (
                    <p className="text-sm text-slate-500">Cargando la ruta…</p>
                )}

                {grid && <GridRotacion semanas={grid.semanas} />}

                {grid?.omitidos && grid.omitidos.length > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {grid.omitidos.length} cliente(s) del template quedaron afuera por
                        no estar en el padrón: {grid.omitidos.join(', ')}.
                    </p>
                )}
```

- [ ] **Step 7: Correr y verificar que pasa**

Run: `npx tsc -b && npm test`
Expected: compila y suite verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fechas.ts src/lib/fechas.test.ts src/components/ruta/ src/pages/RutaPage.tsx
git commit -m "feat(ruta): grid de semanas por dia con card propia de gerencia"
```

---

### Task 7: Drag and drop de clientes entre celdas

**Files:**
- Modify: `package.json` (dependencia `@dnd-kit/core`)
- Modify: `src/components/ruta/GridRotacion.tsx`
- Modify: `src/components/ruta/GridRotacion.test.tsx`
- Modify: `src/components/ruta/ClienteCardRuta.tsx`
- Modify: `src/pages/RutaPage.tsx`

**Interfaces:**
- Consumes: `useReacomodarAdmin` (Task 3), `GridRotacion`/`ClienteCardRuta` (Task 6).
- Produces: `GridRotacion` gana la prop `onMover: (rotacionClienteId: number, semana: number, dia: number) => void`. `ClienteCardRuta` gana `arrastrable?: boolean`.

- [ ] **Step 1: Instalar `@dnd-kit/core` en su versión 6**

Run: `npm install @dnd-kit/core@^6.3.1`
Expected: queda `"@dnd-kit/core": "^6.3.1"` en `dependencies`. Es la primera librería de drag and drop del repo (verificado: no hay ninguna hoy). Sus peer deps son `react >=16.8.0`, así que React 19 está soportado.

> ⚠️ **Trampa de versiones — leer antes de tocar cualquier API de dnd-kit.**
> Existen DOS APIs distintas de dnd-kit y la documentación de `dndkit.com` describe la
> nueva:
>
> - **`@dnd-kit/core@6.3.1`** (la que usa este plan): `<DndContext onDragEnd>`,
>   `useDraggable` devuelve `{ attributes, listeners, setNodeRef, transform, isDragging }`,
>   `useDroppable` devuelve `{ setNodeRef, isOver }`.
> - **`@dnd-kit/react@0.5.0`** (la reescritura, todavía pre-1.0): `<DragDropProvider>`,
>   `useDraggable` devuelve `{ ref, isDragging }`, `useDroppable` devuelve
>   `{ ref, isDropTarget }`.
>
> Este plan usa la primera, a propósito: es estable (>1.0) y la del ecosistema maduro. Si
> buscás docs online vas a encontrar la segunda y va a parecer que el código del plan está
> mal — no lo está. Los nombres de este plan (`setNodeRef`, `isOver`, `DndContext`) son los
> correctos para `@dnd-kit/core@6`. Si algo no compila, la fuente de verdad son los `.d.ts`
> dentro de `node_modules/@dnd-kit/core`, no el sitio.

- [ ] **Step 2: Escribir el test que falla**

La regla de qué implica un drop se prueba como **función pura**, no simulando un arrastre de puntero: los gestos en jsdom son frágiles y lentos, y lo que hay que blindar son los tres casos que NO son un movimiento. Nada de exportar el handler del componente solo para el test.

En `src/components/ruta/GridRotacion.test.tsx`, agregá:

```tsx
import { movimientoDeDrop, parsearCelda } from './GridRotacion'

/** Dónde está hoy cada fila, como lo resolvería el grid a partir de sus semanas. */
const origenDe = (id: number) => (id === 11 ? { semana: 1, dia: 1 } : undefined)

describe('movimientoDeDrop', () => {
    it('traduce el drop a la fila y el destino', () => {
        expect(movimientoDeDrop('card-11', 'celda-3-JUE', origenDe)).toEqual({
            rotacionClienteId: 11,
            semana: 3,
            dia: 4,
        })
    })

    it('soltar en la misma celda no es un movimiento', () => {
        // Sin esto, cancelar un arrastre devolviendo la card a su lugar generaría un PATCH
        // y una fila de bitácora por cada intento.
        expect(movimientoDeDrop('card-11', 'celda-1-LUN', origenDe)).toBeNull()
    })

    it('soltar afuera de toda celda no es un movimiento', () => {
        expect(movimientoDeDrop('card-11', null, origenDe)).toBeNull()
    })

    it('ignora ids que no son de una card o de una celda', () => {
        expect(movimientoDeDrop('otra-cosa', 'celda-3-JUE', origenDe)).toBeNull()
        expect(movimientoDeDrop('card-11', 'header-LUN', origenDe)).toBeNull()
    })
})

describe('parsearCelda', () => {
    it('mapea cada día a su índice 1..5', () => {
        expect(parsearCelda('celda-2-LUN')).toEqual({ semana: 2, dia: 1 })
        expect(parsearCelda('celda-2-VIE')).toEqual({ semana: 2, dia: 5 })
    })

    it('null si el id no es de una celda', () => {
        expect(parsearCelda('card-11')).toBeNull()
    })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run src/components/ruta/GridRotacion.test.tsx`
Expected: FAIL — `movimientoDeDrop is not a function` / `parsearCelda is not a function`.

- [ ] **Step 4: Implementar la decisión del drop**

En `src/components/ruta/GridRotacion.tsx`, agregá arriba del componente:

```tsx
const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/** `celda-3-JUE` → `{ semana: 3, dia: 4 }`. null si el id no es de una celda. */
export function parsearCelda(id: string): { semana: number; dia: number } | null {
    const m = /^celda-(\d+)-(LUN|MAR|MIE|JUE|VIE)$/.exec(id)
    if (!m) return null
    return { semana: Number(m[1]), dia: DIAS.indexOf(m[2] as Dia) + 1 }
}

/** `card-11` → 11. null si el id no es de una card. */
export function parsearCard(id: string): number | null {
    const m = /^card-(\d+)$/.exec(id)
    return m ? Number(m[1]) : null
}

/**
 * Qué movimiento implica un drop, o null si no implica ninguno.
 *
 * Función pura y exportada para poder probar la regla sin simular un arrastre de
 * puntero: los tres casos que no son movimiento (soltar afuera, soltar en la misma
 * celda, ids que no matchean) son justamente los que hay que blindar.
 */
export function movimientoDeDrop(
    activeId: string,
    overId: string | null,
    origenDe: (rotacionClienteId: number) => { semana: number; dia: number } | undefined,
): { rotacionClienteId: number; semana: number; dia: number } | null {
    if (!overId) return null
    const rotacionClienteId = parsearCard(activeId)
    const destino = parsearCelda(overId)
    if (rotacionClienteId === null || !destino) return null

    const origen = origenDe(rotacionClienteId)
    // Soltar donde ya estaba no es un movimiento: evita un PATCH y una fila de bitácora
    // por cada arrastre que el usuario cancela devolviendo la card a su lugar.
    if (origen && origen.semana === destino.semana && origen.dia === destino.dia) {
        return null
    }
    return { rotacionClienteId, ...destino }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run src/components/ruta/GridRotacion.test.tsx`
Expected: PASS — los 6 tests nuevos de `movimientoDeDrop` y `parsearCelda`. Los tests de render del Task 6 siguen fallando hasta el Step 8, donde se les agrega la prop `onMover`.

- [ ] **Step 6: Hacer arrastrable la card y receptivas las celdas**

En `src/components/ruta/ClienteCardRuta.tsx`, agregá el draggable:

```tsx
import { useDraggable } from '@dnd-kit/core'
```

```tsx
interface ClienteCardRutaProps {
    cliente: IAgendaClientAdmin
    /** false = solo lectura (rotación cerrada, o fila ya resuelta). */
    arrastrable?: boolean
}
```

Dentro del componente, antes del `return`:

```tsx
    // Una fila resuelta nunca es arrastrable: el backend la rechaza con FILA_RESUELTA, y
    // dejar arrastrarla sería ofrecer una acción que va a fallar.
    const puedeMoverse = (arrastrable ?? true) && !resuelto

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `card-${cliente.rotacionClienteId}`,
        disabled: !puedeMoverse,
    })
```

y en el `<div>` raíz agregá:

```tsx
            ref={setNodeRef}
            {...(puedeMoverse ? { ...listeners, ...attributes } : {})}
            style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
```

sumando al `className` `${isDragging ? 'opacity-50' : ''} ${puedeMoverse ? 'cursor-grab' : ''}`.

Los nombres `setNodeRef`, `transform`, `isDragging`, `attributes` y `listeners` son los de `@dnd-kit/core@6` — verificados contra esa versión, no adivinados. Si algo no compila, revisá que no se haya instalado `@dnd-kit/react` por error (ver la advertencia del Step 1).

En `src/components/ruta/GridRotacion.tsx`, envolvé el grid en `DndContext` y hacé cada celda un droppable. Extraé la celda a un componente propio (una celda necesita su propio hook, y los hooks no van en un `.map`):

```tsx
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
```

```tsx
interface CeldaProps {
    semana: number
    dia: Dia
    clientes: IAgendaClientAdmin[]
    arrastrable: boolean
}

function Celda({ semana, dia, clientes, arrastrable }: CeldaProps) {
    const { setNodeRef, isOver } = useDroppable({ id: `celda-${semana}-${dia}` })

    return (
        <td
            ref={setNodeRef}
            data-testid={`celda-${semana}-${dia}`}
            className={`min-w-40 space-y-1 rounded-md p-1.5 align-top ${
                isOver ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-white'
            }`}
        >
            {clientes.map(cliente => (
                <ClienteCardRuta
                    key={cliente.rotacionClienteId}
                    cliente={cliente}
                    arrastrable={arrastrable}
                />
            ))}
        </td>
    )
}
```

y en `GridRotacion`:

```tsx
interface GridRotacionProps {
    semanas: ISemanaRotacionAdmin[]
    onMover: (rotacionClienteId: number, semana: number, dia: number) => void
    /** false = rotación cerrada: se ve pero no se toca. */
    editable?: boolean
}
```

```tsx
    // Índice fila → su posición actual, para descartar el drop en la misma celda.
    const origenDe = (rotacionClienteId: number) => {
        for (const semana of semanas) {
            for (const dia of DIAS) {
                if (
                    semana.dias[dia].some(c => c.rotacionClienteId === rotacionClienteId)
                ) {
                    return { semana: semana.semana, dia: DIAS.indexOf(dia) + 1 }
                }
            }
        }
        return undefined
    }

    const alSoltar = (evento: DragEndEvent) => {
        const mov = movimientoDeDrop(
            String(evento.active.id),
            evento.over ? String(evento.over.id) : null,
            origenDe,
        )
        if (mov) onMover(mov.rotacionClienteId, mov.semana, mov.dia)
    }
```

envolviendo el `<div className="overflow-x-auto">` en `<DndContext onDragEnd={alSoltar}>` y reemplazando los `<td>` del `.map` por `<Celda ... arrastrable={editable ?? true} />`.

- [ ] **Step 7: Enchufar el movimiento en la página**

En `src/pages/RutaPage.tsx`:

```tsx
import { useReacomodarAdmin } from '@/hooks/useRotacionAdmin'
```

```tsx
    const mover = useReacomodarAdmin(vendedor ?? '')
```

y pasale al grid:

```tsx
                {grid && (
                    <GridRotacion
                        semanas={grid.semanas}
                        // Una rotación cerrada se ve pero no se edita: el backend contesta
                        // 409 ROTACION_CERRADA.
                        editable={grid.estado === 'abierta' || grid.estado === 'programada'}
                        onMover={(rotacionClienteId, semana, dia) =>
                            mover.mutate({
                                rotacionId: grid.id,
                                rotacionClienteId,
                                semana,
                                dia,
                            })
                        }
                    />
                )}
```

Y mostrá el error de un movimiento rechazado, que es el caso real más probable (mover un cliente ya resuelto):

```tsx
                {mover.isError && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        No se pudo mover ese cliente. Puede que ya lo hayan visitado en esta
                        vuelta, o que la semana destino no exista en su ruta.
                    </p>
                )}
```

- [ ] **Step 8: Actualizar los tests del grid que ahora necesitan `onMover`**

Los tests del Task 6 renderizan `<GridRotacion semanas={SEMANAS} />` sin `onMover`, que ahora es obligatoria. Agregales `onMover={vi.fn()}`.

- [ ] **Step 9: Correr y verificar que pasa**

Run: `npx tsc -b && npm test`
Expected: compila y suite verde. Si `jsdom` se queja por APIs de puntero que `@dnd-kit` toca al montar `DndContext`, no agregues polyfills a ciegas: los tests no simulan gestos, así que montar el contexto tiene que alcanzar. Leé el error antes de tocar la config de Vitest.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/components/ruta/ src/pages/RutaPage.tsx
git commit -m "feat(ruta): mover clientes entre dias y semanas arrastrando"
```

---

### Task 8: Nombrar la rotación y las semanas

**Files:**
- Create: `src/components/ruta/DescripcionInline.tsx`
- Create: `src/components/ruta/DescripcionInline.test.tsx`
- Modify: `src/components/ruta/ColaRotaciones.tsx`
- Modify: `src/components/ruta/GridRotacion.tsx`
- Modify: `src/pages/RutaPage.tsx`

**Interfaces:**
- Consumes: `useEditarDescripcionRotacion`/`useEditarDescripcionSemana` (Task 3).
- Produces: `DescripcionInline` con props `{ valor, placeholder, etiquetaAccesible, onGuardar }`. `GridRotacion` gana `onRenombrarSemana`; `ColaRotaciones` gana `onRenombrarRotacion`.

- [ ] **Step 1: Escribir los tests que fallan**

Creá `src/components/ruta/DescripcionInline.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DescripcionInline from './DescripcionInline'

function renderInline(overrides = {}) {
    const props = {
        valor: null as string | null,
        placeholder: 'Sin nombre',
        etiquetaAccesible: 'Nombrar semana 2',
        onGuardar: vi.fn(),
        ...overrides,
    }
    render(<DescripcionInline {...props} />)
    return props
}

describe('DescripcionInline', () => {
    it('muestra el placeholder cuando no hay nombre', () => {
        renderInline()
        expect(screen.getByText('Sin nombre')).toBeInTheDocument()
    })

    it('muestra el nombre actual cuando lo hay', () => {
        renderInline({ valor: 'Buenos Aires' })
        expect(screen.getByText('Buenos Aires')).toBeInTheDocument()
    })

    it('al tocar el lápiz abre un input con el valor actual', async () => {
        renderInline({ valor: 'Buenos Aires' })

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))

        expect(screen.getByRole('textbox')).toHaveValue('Buenos Aires')
    })

    it('Enter guarda el valor recortado', async () => {
        const props = renderInline()

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))
        await userEvent.type(screen.getByRole('textbox'), '  Zona Sur  {Enter}')

        expect(props.onGuardar).toHaveBeenCalledWith('Zona Sur')
    })

    it('guardar vacío manda null para borrar el nombre', async () => {
        const props = renderInline({ valor: 'Buenos Aires' })

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))
        await userEvent.clear(screen.getByRole('textbox'))
        await userEvent.keyboard('{Enter}')

        expect(props.onGuardar).toHaveBeenCalledWith(null)
    })

    it('Escape cierra sin guardar', async () => {
        const props = renderInline({ valor: 'Buenos Aires' })

        await userEvent.click(screen.getByRole('button', { name: 'Nombrar semana 2' }))
        await userEvent.type(screen.getByRole('textbox'), ' cambiado{Escape}')

        expect(props.onGuardar).not.toHaveBeenCalled()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ruta/DescripcionInline.test.tsx`
Expected: FAIL — no existe `./DescripcionInline`.

- [ ] **Step 3: Crear el componente**

Creá `src/components/ruta/DescripcionInline.tsx`:

```tsx
import { useState } from 'react'
import { Pencil } from 'lucide-react'

interface DescripcionInlineProps {
    valor: string | null
    placeholder: string
    /** Nombre accesible del botón de editar, ej. "Nombrar semana 2". */
    etiquetaAccesible: string
    /** null = borrar el nombre. */
    onGuardar: (descripcion: string | null) => void
}

/**
 * Nombre editable en el lugar, para la rotación ("Ronda Agosto") y para cada semana
 * ("Buenos Aires").
 *
 * Un input inline y no un modal: son nombres de una línea que gerencia va a escribir
 * varias veces seguidas al armar una rotación, y un diálogo por cada uno sería un
 * ida y vuelta innecesario.
 */
export default function DescripcionInline({
    valor,
    placeholder,
    etiquetaAccesible,
    onGuardar,
}: DescripcionInlineProps) {
    const [editando, setEditando] = useState(false)
    const [borrador, setBorrador] = useState('')

    const abrir = () => {
        setBorrador(valor ?? '')
        setEditando(true)
    }

    const guardar = () => {
        const limpio = borrador.trim()
        // Vacío = borrar el nombre, no guardar un string vacío: la columna es nullable y
        // "sin nombre" y "nombre vacío" tienen que ser el mismo estado.
        onGuardar(limpio === '' ? null : limpio)
        setEditando(false)
    }

    if (editando) {
        return (
            <input
                autoFocus
                value={borrador}
                maxLength={120}
                onChange={e => setBorrador(e.target.value)}
                onBlur={guardar}
                onKeyDown={e => {
                    if (e.key === 'Enter') guardar()
                    if (e.key === 'Escape') setEditando(false)
                }}
                className="w-40 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-900"
            />
        )
    }

    return (
        <span className="inline-flex items-center gap-1">
            <span className={valor ? 'text-slate-500' : 'text-slate-400 italic'}>
                {valor ?? placeholder}
            </span>
            <button
                type="button"
                aria-label={etiquetaAccesible}
                onClick={abrir}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
                <Pencil className="h-3 w-3" />
            </button>
        </span>
    )
}
```

**Ojo con `onBlur={guardar}`:** el test de Escape verifica que no se guarde. `setEditando(false)` en el `onKeyDown` de Escape desmonta el input, y React puede disparar `onBlur` en el proceso. Si ese test falla porque `onGuardar` se llamó de todos modos, guardá una bandera de cancelación:

```tsx
    const [cancelado, setCancelado] = useState(false)
    // ...en Escape: setCancelado(true); setEditando(false)
    // ...en onBlur: if (!cancelado) guardar(); setCancelado(false)
```

Implementá directamente la versión con bandera si el test de Escape no pasa sin ella.

- [ ] **Step 4: Nombrar cada semana desde el grid**

En `src/components/ruta/GridRotacion.tsx`, agregá la prop y usala en el encabezado de fila:

```tsx
    onRenombrarSemana: (semana: number, descripcion: string | null) => void
```

Reemplazá el `<span>` de la descripción de semana por:

```tsx
                                <span className="block text-xs font-normal">
                                    <DescripcionInline
                                        valor={semana.descripcion}
                                        placeholder="Sin zona"
                                        etiquetaAccesible={`Nombrar semana ${semana.semana}`}
                                        onGuardar={d => onRenombrarSemana(semana.semana, d)}
                                    />
                                </span>
```

(el `{semana.descripcion && (...)}` desaparece: el lápiz tiene que estar visible también cuando no hay nombre, que es justo cuando hace falta ponerlo)

- [ ] **Step 5: Nombrar la rotación desde su chip**

En `src/components/ruta/ColaRotaciones.tsx`, agregá la prop `onRenombrarRotacion: (rotacionId: number, descripcion: string | null) => void` y, **solo en el chip activo** (para no llenar la fila de lápices), renderizá el editor al lado de la cola:

```tsx
            {activa && rotacion.estado !== 'cerrada' && (
                <span className="ml-1 mr-1 text-xs">
                    <DescripcionInline
                        valor={rotacion.descripcion}
                        placeholder="Sin nombre"
                        etiquetaAccesible={`Nombrar ${etiquetaDe(rotacion)}`}
                        onGuardar={d => onRenombrarRotacion(rotacion.id, d)}
                    />
                </span>
            )}
```

- [ ] **Step 6: Enchufar las mutations en la página**

En `src/pages/RutaPage.tsx`:

```tsx
import {
    useEditarDescripcionRotacion,
    useEditarDescripcionSemana,
} from '@/hooks/useRotacionAdmin'
```

```tsx
    const renombrarRotacion = useEditarDescripcionRotacion(vendedor ?? '')
    const renombrarSemana = useEditarDescripcionSemana(vendedor ?? '')
```

y pasá los handlers:

```tsx
                        onRenombrarSemana={(semana, descripcion) =>
                            renombrarSemana.mutate({
                                rotacionId: grid.id,
                                semana,
                                descripcion,
                            })
                        }
```

```tsx
                        onRenombrarRotacion={(rotacionId, descripcion) =>
                            renombrarRotacion.mutate({ rotacionId, descripcion })
                        }
```

- [ ] **Step 7: Actualizar los tests que ahora necesitan las props nuevas**

Los tests de `GridRotacion` y `ColaRotaciones` de las tareas anteriores no pasan `onRenombrarSemana`/`onRenombrarRotacion`, que ahora son obligatorias. Agregáselas con `vi.fn()`.

- [ ] **Step 8: Correr y verificar que pasa**

Run: `npx tsc -b && npm test`
Expected: compila y suite verde.

- [ ] **Step 9: Verificación manual contra el backend real**

Esto solo se puede hacer si el backend de `2026-08-11-backend-vista-gerencia-rotacion.md` ya está implementado y corriendo. Si no lo está, **registralo como pendiente y no lo fuerces**: la suite ya cubre la lógica con la API mockeada.

Levantá el front (`npm run dev`), entrá con un usuario `admin` y verificá:

1. La pestaña "Ruta" aparece junto a "Analítica de visitas" y "Actividad".
2. Un usuario con rol `vendedor` que entre a `/analitica/ruta` termina redirigido a `/`.
3. Elegir un vendedor carga sus chips; el chip de la rotación vigente queda preseleccionado.
4. El grid muestra todas las semanas, incluidas las que no tienen ningún cliente.
5. Arrastrar un cliente a otra celda lo deja ahí después de que refresca la query.
6. Arrastrar un cliente ya visitado no hace nada (la card no es arrastrable).
7. Nombrar la semana 2 como "Buenos Aires" persiste al recargar la página.
8. "Agregar rotación" suma un chip nuevo al final y abre su grid.

- [ ] **Step 10: Commit**

```bash
git add src/components/ruta/ src/pages/RutaPage.tsx
git commit -m "feat(ruta): nombrar la rotacion y sus semanas en el lugar"
```

---

### Task 9: Reordenar la cola de rotaciones programadas

**Files:**
- Modify: `src/components/ruta/ColaRotaciones.tsx`
- Modify: `src/components/ruta/ColaRotaciones.test.tsx`
- Modify: `src/pages/RutaPage.tsx`

**Interfaces:**
- Consumes: `useReordenarRotacion` (Task 3), `ColaRotaciones` (Task 5).
- Produces: `ColaRotaciones` gana `onReordenar: (rotacionId: number, orden: number) => void`.

> **Desviación del spec, para tu revisión.** El spec §7 dice "drag del chip mismo para
> reordenar". Este plan lo implementa con **flechas ◀ ▶** en cada chip programado. Razones:
> con 2-4 chips en una fila horizontal, dos botones son más claros que un arrastre, salen
> gratis en teclado y lector de pantalla, y no requieren `@dnd-kit/sortable` (otra
> dependencia) ni un segundo `DndContext` en la misma pantalla. El endpoint recibe una
> posición destino (`{ orden }`) en ambos casos, así que cambiar a drag después no toca
> backend ni hooks. **Si preferís el arrastre, decilo y lo cambio antes de implementar.**

- [ ] **Step 1: Escribir los tests que fallan**

En `src/components/ruta/ColaRotaciones.test.tsx`, agregá al `describe` existente:

```tsx
    it('la primera programada no puede subir más', () => {
        renderCola()
        // COLA tiene 30 (orden 1) y 31 (orden 2). La 30 ya es la próxima en activarse.
        expect(
            screen.getByRole('button', { name: /adelantar programada #1/i }),
        ).toBeDisabled()
    })

    it('la última programada no puede bajar más', () => {
        renderCola()
        expect(
            screen.getByRole('button', { name: /atrasar ronda octubre/i }),
        ).toBeDisabled()
    })

    it('adelantar manda la posición anterior', async () => {
        const props = renderCola()

        await userEvent.click(screen.getByRole('button', { name: /adelantar ronda octubre/i }))

        // 31 estaba en orden 2: adelantar la lleva a 1.
        expect(props.onReordenar).toHaveBeenCalledWith(31, 1)
    })

    it('atrasar manda la posición siguiente', async () => {
        const props = renderCola()

        await userEvent.click(screen.getByRole('button', { name: /atrasar programada #1/i }))

        expect(props.onReordenar).toHaveBeenCalledWith(30, 2)
    })

    it('la rotación vigente no tiene flechas: no está en la cola', () => {
        renderCola()
        expect(
            screen.queryByRole('button', { name: /adelantar ronda agosto/i }),
        ).not.toBeInTheDocument()
    })
```

Y agregá `onReordenar: vi.fn()` al objeto `props` de `renderCola`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ruta/ColaRotaciones.test.tsx`
Expected: FAIL — no existen los botones de adelantar/atrasar.

- [ ] **Step 3: Implementar las flechas**

En `src/components/ruta/ColaRotaciones.tsx`:

1. Agregá los íconos al import de `lucide-react`: `ChevronLeft`, `ChevronRight`.
2. Agregá la prop a la interfaz:

```tsx
    onReordenar: (rotacionId: number, orden: number) => void
```

3. Antes del `return`, calculá cuántas programadas hay (el tope para atrasar):

```tsx
    // Solo las programadas forman la cola: la vigente ya se está ejecutando y las
    // cerradas/canceladas no viajan en este payload.
    const programadas = rotaciones.filter(r => r.estado === 'programada')
    const ultimoOrden = programadas.length
```

4. Dentro del `map`, antes del botón de cancelar, agregá las flechas para las programadas:

```tsx
                        {rotacion.estado === 'programada' && (
                            <>
                                <button
                                    type="button"
                                    aria-label={`Adelantar ${etiquetaDe(rotacion)}`}
                                    disabled={(rotacion.orden ?? 1) <= 1}
                                    onClick={() =>
                                        onReordenar(rotacion.id, (rotacion.orden ?? 1) - 1)
                                    }
                                    className={`rounded-full p-1 disabled:opacity-30 ${
                                        activa ? 'hover:bg-white/20' : 'hover:bg-slate-100'
                                    }`}
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Atrasar ${etiquetaDe(rotacion)}`}
                                    disabled={(rotacion.orden ?? 1) >= ultimoOrden}
                                    onClick={() =>
                                        onReordenar(rotacion.id, (rotacion.orden ?? 1) + 1)
                                    }
                                    className={`rounded-full p-1 disabled:opacity-30 ${
                                        activa ? 'hover:bg-white/20' : 'hover:bg-slate-100'
                                    }`}
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )}
```

- [ ] **Step 4: Enchufar la mutation en la página**

En `src/pages/RutaPage.tsx`, agregá `useReordenarRotacion` al import de hooks, y:

```tsx
    const reordenar = useReordenarRotacion(vendedor ?? '')
```

pasándole a los dos usos de `ColaRotaciones`:

```tsx
                        onReordenar={(rotacionId, orden) =>
                            reordenar.mutate({ rotacionId, orden })
                        }
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx tsc -b && npm test`
Expected: compila y suite verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/ruta/ColaRotaciones.tsx src/components/ruta/ColaRotaciones.test.tsx src/pages/RutaPage.tsx
git commit -m "feat(ruta): reordenar la cola de rotaciones programadas"
```

---

## Notas de cierre

- **Este plan no puede verificarse de punta a punta sin el backend.** Toda la suite corre con la capa de API mockeada, así que pasa igual; la Task 8 Step 9 es la única verificación contra el server real y puede quedar pendiente hasta que el backend esté deployado. Cuando lo esté, sumale a esa checklist los puntos de reordenar (Task 9).
- **Deuda conocida:** el grid no tiene virtualización. Una rotación de 5 semanas × 5 días × ~40 clientes son ~200 cards en el DOM. Es aceptable para una vista de gerencia de uso ocasional en desktop; si empieza a sentirse pesado, ese es el punto a revisar antes que cualquier otro.
- **Una decisión de UI se desvía del spec y está marcada para revisión:** reordenar la cola con flechas en vez de arrastrando el chip (ver el recuadro de la Task 9). Es reversible sin tocar backend ni hooks.
