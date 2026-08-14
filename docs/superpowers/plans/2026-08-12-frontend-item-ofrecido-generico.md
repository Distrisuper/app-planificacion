# El ofrecimiento genérico — Frontend (app-planificacion)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor pueda cargar lo que realmente ofrece —una marca, una acción comercial como el plan cupo, y opcionalmente sobre qué alcance— en vez de solo rubros caídos, y que gerencia lo vea en analítica.

**Architecture:** Rename de "rubro" a "ofrecimiento" en tipos, API, hooks y componentes. El picker de alta gana un selector de tipo (`CatalogoPicker` ya es agnóstico del catálogo). Se agrega un paso opcional "acotar a…" para el alcance, deliberadamente feo pero funcional. La analítica suma un chip de tipo.

**Tech Stack:** Vite + React 19 + TypeScript, React Query, Tailwind + shadcn/ui, Vitest.

**Repo:** `C:/Users/matia/OneDrive/Documentos/distri/app-planificacion`

**Spec:** `docs/superpowers/specs/2026-08-12-item-ofrecido-generico-design.md`

## Global Constraints

- **PRERREQUISITO: el plan de backend tiene que estar desplegado.** Este plan consume `/planificacion/visitas/:id/ofrecimientos` y `/planificacion/acciones`. Sin eso, nada de acá funciona contra el entorno real.
- **El vendedor no ve ciclos ni rotaciones: ve zonas, días y clientes.** Restricción de diseño durable del proyecto. Ningún texto nuevo dirigido al vendedor puede decir "rotación", "ciclo" ni "semana N".
- **La UI del alcance es fea a propósito.** El rediseño del wizard es una iteración posterior; el objetivo acá es que entren datos reales para validar el modelo.
- **Los tests existentes deben pasar con cambios de NOMBRE únicamente.** Si una aserción necesita cambiar de valor esperado, el rename se llevó lógica puesta: parar y revisar.
- **No se escribe el campo `detalle`.** Existe en la base, vacío, y así queda.
- **Las horas se formatean con `horaNegocio` de `src/lib/fechas.ts`.** Nunca `slice(11,16)` ni `toLocaleTimeString()` pelado. (Aplica si se toca algo de analítica que muestre horas.)
- Enum de tipos, textual y exacto: `'rubro' | 'marca' | 'linea' | 'articulo' | 'accion'`.
- Tests: `npm test` (vitest). Lint: `npm run lint` (oxlint). Build: `npm run build`.

---

## File Structure

**Crear:**

| archivo | responsabilidad |
|---|---|
| `src/hooks/useAcciones.ts` | catálogo de acciones desde `GET /planificacion/acciones` |
| `src/components/propuesta/SelectorTipoOfrecimiento.tsx` | los tres chips de tipo del alta |
| `src/components/propuesta/AlcancePicker.tsx` | el paso opcional "acotar a…", multi-selección |
| `src/components/propuesta/AgregarOfrecimientoSheet.tsx` | alta de marca/acción (los rubros siguen entrando por la fila `agregable` de la tabla) |
| `src/lib/alcance.ts` | helpers puros del alcance (clave, toggle, resumen textual) |

**Renombrar** (contenido incluido): `src/hooks/useRubros.ts` → `useOfrecimientos.ts`, `src/lib/resolucionRubro.ts` → `resolucionOfrecimiento.ts`, `src/components/propuesta/ResolucionRubro.tsx` → `ResolucionOfrecimiento.tsx`, `src/components/propuesta/RubroTable.tsx` → `OfrecimientoTable.tsx`, y sus `.test.*` correspondientes.

**Modificar:** `src/types/planificacion.ts`, `src/types/analitica.ts`, `src/api/planificacion.ts`, `src/api/analitica.ts`, `src/components/propuesta/filas.ts`, `src/components/propuesta/ResolucionWizard.tsx`, `src/components/propuesta/ResolucionWizardAcciones.tsx`, `src/components/PropuestaSheet.tsx`, `src/components/VisitaFlow.tsx`, `src/components/VisitaSheet.tsx`, `src/components/ClienteCard.tsx`, `src/hooks/useVisitas.ts`, `src/hooks/useMotivos.ts`, `src/components/analitica/*`, `src/mocks/analiticaMock.ts`.

**Ojo con un choque de nombres:** ya existe `src/components/propuesta/ResolucionWizardAcciones.tsx`, donde "Acciones" son los **botones** del wizard (Atrás/Finalizar), no las acciones comerciales. **No renombrarlo y no confundirlo** con `useAcciones.ts`. Si al leer el diff aparece ambigüedad, el archivo nuevo es el del catálogo.

---

### Task 1: Tipos y capa de API

**Files:**
- Modify: `src/types/planificacion.ts`, `src/api/planificacion.ts`, `src/api/planificacion.test.ts`

**Interfaces:**
- Consumes: la API del plan de backend.
- Produces: `TipoOfrecimiento`, `TipoAlcance`, `IAlcance`, `IOfrecimientoMotivo`, `IOfrecimiento`, `IAgregarOfrecimientoDTO`, `IAccion`; y las funciones `getOfrecimientos`, `agregarOfrecimiento`, `resolverOfrecimiento`, `eliminarOfrecimiento`, `getAcciones`.

- [ ] **Step 1: Escribir el test que falla**

En `src/api/planificacion.test.ts`, agregar (siguiendo el molde de mock de `apiClient` que ya usa el archivo — leerlo primero):

```ts
describe('ofrecimientos de la visita', () => {
    it('getOfrecimientos pega a /ofrecimientos y devuelve data', async () => {
        mockedGet.mockResolvedValue({
            data: {
                data: [
                    {
                        id: 1,
                        resolucionId: 10,
                        tipo: 'accion',
                        codigo: 'CUPO',
                        descripcion: 'Plan cupo',
                        gapUnits: null,
                        esPropuesto: false,
                        resuelto: false,
                        motivos: [],
                        alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
                    },
                ],
            },
        })

        const ofrecimientos = await getOfrecimientos(10)

        expect(mockedGet).toHaveBeenCalledWith('/planificacion/visitas/10/ofrecimientos')
        expect(ofrecimientos[0].tipo).toBe('accion')
        expect(ofrecimientos[0].alcance).toEqual([
            { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
        ])
    })

    it('agregarOfrecimiento manda tipo, codigo, descripcion y alcance', async () => {
        mockedPost.mockResolvedValue({ data: { data: { ofrecimientoId: 99 } } })

        await agregarOfrecimiento(10, {
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })

        expect(mockedPost).toHaveBeenCalledWith('/planificacion/visitas/10/ofrecimientos', {
            tipo: 'accion',
            codigo: 'DESCUENTO',
            descripcion: 'Descuento',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })
    })

    it('getAcciones pega al catálogo', async () => {
        mockedGet.mockResolvedValue({
            data: { data: [{ codigo: 'CUPO', descripcion: 'Plan cupo' }] },
        })

        const acciones = await getAcciones()

        expect(mockedGet).toHaveBeenCalledWith('/planificacion/acciones')
        expect(acciones).toEqual([{ codigo: 'CUPO', descripcion: 'Plan cupo' }])
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: FAIL — `getOfrecimientos` / `agregarOfrecimiento` / `getAcciones` no existen.

- [ ] **Step 3: Escribir los tipos**

En `src/types/planificacion.ts`, reemplazar `IVisitaRubro`, `IRubroMotivo`, `IAgregarRubroDTO`, `IResolverRubroDTO`, `IResolverRubroResult` por los tipos del backend (idénticos, mismo contrato):

```ts
export type TipoOfrecimiento = 'rubro' | 'marca' | 'linea' | 'articulo' | 'accion'

/** Los tipos que pueden ser DESTINO de una oferta. 'accion' no: una acción no se
 *  aplica sobre otra acción. */
export type TipoAlcance = Exclude<TipoOfrecimiento, 'accion'>

export interface IAlcance {
    tipo: TipoAlcance
    codigo: string
    descripcion: string
}

/** Un motivo aplicado a un ofrecimiento. marca/competidor/pctDiferencia solo se usan cuando el
 *  motivo tiene requiereDetalle; en el resto van null. */
export interface IOfrecimientoMotivo {
    motivoId: number
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

/** Un ofrecimiento de la propuesta congelada. `resuelto` lo deriva el backend de motivos.length. */
export interface IOfrecimiento {
    id: number
    resolucionId: number
    tipo: TipoOfrecimiento
    codigo: string
    descripcion: string
    gapUnits: number | null
    esPropuesto: boolean
    resuelto: boolean
    motivos: IOfrecimientoMotivo[]
    /** Cero elementos = oferta global, no "falta cargar". */
    alcance: IAlcance[]
}

export interface IAgregarOfrecimientoDTO {
    tipo: TipoOfrecimiento
    codigo: string
    descripcion: string
    alcance?: IAlcance[]
}

export interface IResolverOfrecimientoDTO {
    motivos: IOfrecimientoMotivo[]
}

export interface IResolverOfrecimientoResult {
    ofrecimientosPendientes: number
}

/** Catálogo de acciones comerciales. Agregar una es un INSERT en el back, no un deploy. */
export interface IAccion {
    codigo: string
    descripcion: string
}
```

Cambios adicionales en el mismo archivo:
- `NivelMotivo`: `'visita' | 'rubro'` → `'visita' | 'ofrecimiento'`.
- `IAgendaClient.rubrosPendientes` → `ofrecimientosPendientes`.
- `ICerrarVisitaResult.rubrosAutocompletados` → `ofrecimientosAutocompletados`.
- El comentario de `ICatalogoItem` ("Rubros y marcas comparten forma") pasa a decir que lo comparten rubros, marcas y acciones.

**No tocar** `IRubroPropuesta`, `IRubroMonthDrop`, `IDroppedRubro`, `IRubroDropsResponse`, `IRubroEstado`, `IRubroClients*`, `IPropuestaRubroDTO`: son el motor de propuesta y los catálogos del warehouse, que siguen siendo por rubro.

- [ ] **Step 4: Escribir las funciones de API**

En `src/api/planificacion.ts`, renombrar la sección "Rubros de la visita" a "Ofrecimientos de la visita" y sus cuatro funciones (`getRubros` → `getOfrecimientos`, etc.), cambiando `/rubros` por `/ofrecimientos` en las cuatro URLs. `agregarOfrecimiento` recibe `IAgregarOfrecimientoDTO` completo (incluido el alcance) y lo manda tal cual.

Agregar en la sección de catálogos:

```ts
/** Acciones comerciales del catálogo propio (pl_accion): plan cupo, descuento, promo. */
export const getAcciones = async (): Promise<IAccion[]> => {
    const res = await apiClient.get('/planificacion/acciones')
    return res.data.data
}
```

Y en `getMotivos`, el default de nivel pasa de `'rubro'` a `'ofrecimiento'` si el archivo lo hardcodea en algún lado.

- [ ] **Step 5: Correr los tests de API**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: PASS, los tests viejos (renombrados) más los 3 nuevos.

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacion.ts src/api/planificacion.test.ts
git commit -m "feat: tipos y API del ofrecimiento generico"
```

El build queda roto hasta la Task 6. Es esperado.

---

### Task 2: Hooks

**Files:**
- Rename: `src/hooks/useRubros.ts` → `src/hooks/useOfrecimientos.ts`, `src/hooks/useRubros.test.tsx` → `src/hooks/useOfrecimientos.test.tsx`
- Create: `src/hooks/useAcciones.ts`, `src/hooks/useAcciones.test.tsx`
- Modify: `src/hooks/useMotivos.ts`, `src/hooks/useVisitas.ts`

**Interfaces:**
- Consumes: `getOfrecimientos`, `agregarOfrecimiento`, `resolverOfrecimiento`, `eliminarOfrecimiento`, `getAcciones` (Task 1).
- Produces: `useOfrecimientos(visitaId)`, `useResolverOfrecimientos(visitaId)`, `useAgregarOfrecimiento(visitaId)`, `useEliminarOfrecimiento(visitaId)`, `ofrecimientoKeys.deVisita(visitaId)`, `useAcciones()`.

- [ ] **Step 1: Renombrar el hook y su test**

```bash
git mv src/hooks/useRubros.ts src/hooks/useOfrecimientos.ts
git mv src/hooks/useRubros.test.tsx src/hooks/useOfrecimientos.test.tsx
```

Dentro: `rubroKeys` → `ofrecimientoKeys`, `useRubros` → `useOfrecimientos`, `useMutacionDeRubros` → `useMutacionDeOfrecimientos`, `useResolverRubros` → `useResolverOfrecimientos`, `IResolverRubrosItem` → `IResolverOfrecimientosItem` (con `rubroId` → `ofrecimientoId`), `useAgregarRubro` → `useAgregarOfrecimiento`, `useEliminarRubro` → `useEliminarOfrecimiento`.

**Conservar** el comentario de `useMutacionDeOfrecimientos` (por qué toda mutación invalida también la agenda) y el de `useResolverOfrecimientos` (por qué `Promise.allSettled` y no `Promise.all`) — documentan decisiones que se pagaron.

El texto de error de `useResolverOfrecimientos` no cambia: `'Sin conexión. Volvé a intentar; no se perdió lo que cargaste.'`

- [ ] **Step 2: Correr el test renombrado**

Run: `npx vitest run src/hooks/useOfrecimientos.test.tsx`
Expected: PASS, misma cantidad de tests que antes. Si falla por un valor esperado, parar.

- [ ] **Step 3: Escribir el test de `useAcciones`**

Crear `src/hooks/useAcciones.test.tsx`, siguiendo el molde de `useMotivos.test.tsx` (leerlo: tiene el wrapper de `QueryClientProvider` ya armado):

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useAcciones } from './useAcciones'
import * as api from '@/api/planificacion'
import { wrapper } from '@/test/queryWrapper'

beforeEach(() => {
    vi.restoreAllMocks()
})

describe('useAcciones', () => {
    it('trae el catálogo de acciones', async () => {
        vi.spyOn(api, 'getAcciones').mockResolvedValue([
            { codigo: 'CUPO', descripcion: 'Plan cupo' },
        ])

        const { result } = renderHook(() => useAcciones(), { wrapper })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual([{ codigo: 'CUPO', descripcion: 'Plan cupo' }])
    })
})
```

Si el helper `wrapper` está en otro path, usar el que ya usa `useMotivos.test.tsx`.

- [ ] **Step 4: Correr y verificar que falla**

Run: `npx vitest run src/hooks/useAcciones.test.tsx`
Expected: FAIL — no existe `./useAcciones`.

- [ ] **Step 5: Implementar `useAcciones`**

Crear `src/hooks/useAcciones.ts`, con el mismo `staleTime` largo que usa `useMotivos` (es un catálogo, cambia por `INSERT`, no por deploy — leer `useMotivos.ts` y copiar el valor):

```ts
import { useQuery } from '@tanstack/react-query'
import { getAcciones } from '@/api/planificacion'

export const accionesKeys = {
    catalogo: ['acciones'] as const,
}

/** Catálogo de acciones comerciales. Cambia por INSERT en el back, no por deploy, así
 *  que se cachea largo igual que el de motivos. */
export function useAcciones() {
    return useQuery({
        queryKey: accionesKeys.catalogo,
        queryFn: getAcciones,
        staleTime: 5 * 60 * 1000,
    })
}
```

- [ ] **Step 6: Correr el test**

Run: `npx vitest run src/hooks/useAcciones.test.tsx`
Expected: PASS.

- [ ] **Step 7: Ajustar `useMotivos` y `useVisitas`**

- `useMotivos.ts`: el nivel `'rubro'` pasa a `'ofrecimiento'` donde aparezca.
- `useVisitas.ts`: `rubrosPendientes` → `ofrecimientosPendientes`, `rubros` → `ofrecimientos` en el resultado de iniciar visita.

Run: `npx vitest run src/hooks/`
Expected: PASS, todos los hooks.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/
git commit -m "feat: hooks de ofrecimientos y catalogo de acciones"
```

---

### Task 3: Helpers del alcance

**Files:**
- Create: `src/lib/alcance.ts`, `src/lib/alcance.test.ts`
- Rename: `src/lib/resolucionRubro.ts` → `src/lib/resolucionOfrecimiento.ts` (+ su test)

**Interfaces:**
- Consumes: `IAlcance` (Task 1).
- Produces: `claveAlcance(a): string`, `toggleAlcance(lista, destino): IAlcance[]`, `resumenAlcance(lista): string`.
- También: `detalleCompleto`, `motivoIncompleto`, `tieneDetalleIncompleto`, `motivosIguales` (renombrados de `resolucionRubro.ts`, sin cambios de lógica).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/alcance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { claveAlcance, resumenAlcance, toggleAlcance } from './alcance'
import type { IAlcance } from '@/types/planificacion'

const skf: IAlcance = { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }
const rodam: IAlcance = { tipo: 'rubro', codigo: 'RODAM', descripcion: 'Rodamientos' }

describe('claveAlcance', () => {
    it('combina tipo y código: el mismo código en dos tipos son destinos distintos', () => {
        expect(claveAlcance(skf)).toBe('marca:SKF')
        expect(claveAlcance({ ...skf, tipo: 'rubro' })).toBe('rubro:SKF')
    })
})

describe('toggleAlcance', () => {
    it('agrega un destino que no estaba', () => {
        expect(toggleAlcance([], skf)).toEqual([skf])
    })

    it('saca un destino que ya estaba', () => {
        expect(toggleAlcance([skf, rodam], skf)).toEqual([rodam])
    })

    it('no duplica: togglear dos veces vuelve al estado inicial', () => {
        expect(toggleAlcance(toggleAlcance([], skf), skf)).toEqual([])
    })
})

describe('resumenAlcance', () => {
    it('sin destinos dice que la oferta es para todo el cliente', () => {
        expect(resumenAlcance([])).toBe('Todo el cliente')
    })

    it('con un destino muestra su descripción', () => {
        expect(resumenAlcance([skf])).toBe('SKF')
    })

    it('con varios destinos los junta', () => {
        expect(resumenAlcance([skf, rodam])).toBe('SKF · Rodamientos')
    })

    // Parado en un mostrador nadie lee ocho nombres en una línea.
    it('con más de tres corta y cuenta el resto', () => {
        const muchos: IAlcance[] = [
            skf,
            rodam,
            { tipo: 'marca', codigo: 'C', descripcion: 'Corven' },
            { tipo: 'marca', codigo: 'D', descripcion: 'Dana' },
            { tipo: 'marca', codigo: 'E', descripcion: 'Elring' },
        ]
        expect(resumenAlcance(muchos)).toBe('SKF · Rodamientos · Corven +2')
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/alcance.test.ts`
Expected: FAIL — no existe `./alcance`.

- [ ] **Step 3: Implementar**

Crear `src/lib/alcance.ts`:

```ts
import type { IAlcance } from '@/types/planificacion'

const TOPE_VISIBLE = 3

/** El mismo código puede existir como marca y como rubro: la identidad es el par. */
export const claveAlcance = (a: IAlcance): string => `${a.tipo}:${a.codigo}`

/** Agrega o saca un destino. El alcance es un CONJUNTO: no hay duplicados y el orden
 *  no significa nada. */
export function toggleAlcance(lista: IAlcance[], destino: IAlcance): IAlcance[] {
    const clave = claveAlcance(destino)
    return lista.some(a => claveAlcance(a) === clave)
        ? lista.filter(a => claveAlcance(a) !== clave)
        : [...lista, destino]
}

/** Texto corto para la tarjeta del ofrecimiento. Lista vacía = oferta global, y eso se dice
 *  explícito: "sin alcance" se leería como "falta cargar algo". */
export function resumenAlcance(lista: IAlcance[]): string {
    if (lista.length === 0) return 'Todo el cliente'

    const visibles = lista.slice(0, TOPE_VISIBLE).map(a => a.descripcion)
    const ocultos = lista.length - visibles.length
    const texto = visibles.join(' · ')
    return ocultos > 0 ? `${texto} +${ocultos}` : texto
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/lib/alcance.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Renombrar `resolucionRubro`**

```bash
git mv src/lib/resolucionRubro.ts src/lib/resolucionOfrecimiento.ts
git mv src/lib/resolucionRubro.test.ts src/lib/resolucionOfrecimiento.test.ts
```

Dentro: `IRubroMotivo` → `IOfrecimientoMotivo`. **Nada más cambia** — `detalleCompleto`, `motivoIncompleto`, `tieneDetalleIncompleto` y `motivosIguales` conservan su lógica y sus comentarios.

Run: `npx vitest run src/lib/resolucionOfrecimiento.test.ts`
Expected: PASS, misma cantidad de tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/
git commit -m "feat: helpers del alcance de la oferta"
```

---

### Task 4: Selector de tipo y picker de alcance

**Files:**
- Create: `src/components/propuesta/SelectorTipoOfrecimiento.tsx`, `src/components/propuesta/SelectorTipoOfrecimiento.test.tsx`, `src/components/propuesta/AlcancePicker.tsx`, `src/components/propuesta/AlcancePicker.test.tsx`

**Interfaces:**
- Consumes: `CatalogoPicker`, `useAcciones` (Task 2), `toggleAlcance` / `resumenAlcance` (Task 3), `getBrandCatalog`.
- Produces:
  - `<SelectorTipoOfrecimiento value={TipoOfrecible} onChange={(t: TipoOfrecible) => void} />`
  - `<AlcancePicker value={IAlcance[]} onChange={(a: IAlcance[]) => void} marcas={ICatalogoItem[]} rubros={ICatalogoItem[]} />`
  - `export type TipoOfrecible = 'rubro' | 'marca' | 'accion'`

**Contexto:** `TipoOfrecible` es un subconjunto de `TipoOfrecimiento` a propósito. `linea` y `articulo` existen en el enum del backend pero **no tienen catálogo verificado en api-vendedores**, así que el picker no los ofrece. Cuando aparezca la fuente, se agregan acá y en ningún otro lado.

- [ ] **Step 1: Escribir el test del selector**

Crear `src/components/propuesta/SelectorTipoOfrecimiento.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SelectorTipoOfrecimiento from './SelectorTipoOfrecimiento'

describe('SelectorTipoOfrecimiento', () => {
    it('muestra los tres tipos con catálogo', () => {
        render(<SelectorTipoOfrecimiento value="rubro" onChange={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Rubro' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Marca' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument()
    })

    // linea y articulo existen en el back pero no tienen catálogo: no se ofrecen.
    it('no ofrece línea ni artículo', () => {
        render(<SelectorTipoOfrecimiento value="rubro" onChange={vi.fn()} />)

        expect(screen.queryByRole('button', { name: 'Línea' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Artículo' })).not.toBeInTheDocument()
    })

    it('marca el tipo activo', () => {
        render(<SelectorTipoOfrecimiento value="marca" onChange={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Marca' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
    })

    it('avisa el cambio de tipo', async () => {
        const onChange = vi.fn()
        render(<SelectorTipoOfrecimiento value="rubro" onChange={onChange} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))

        expect(onChange).toHaveBeenCalledWith('accion')
    })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/propuesta/SelectorTipoOfrecimiento.test.tsx`
Expected: FAIL — no existe el componente.

- [ ] **Step 3: Implementar el selector**

Crear `src/components/propuesta/SelectorTipoOfrecimiento.tsx`:

```tsx
export type TipoOfrecible = 'rubro' | 'marca' | 'accion'

/** Subconjunto de TipoOfrecimiento a propósito: `linea` y `articulo` existen en el enum del
 *  backend pero no tienen catálogo verificado, así que no se ofrecen todavía. Cuando
 *  aparezca la fuente se agregan acá. */
const TIPOS: { valor: TipoOfrecible; label: string }[] = [
    { valor: 'rubro', label: 'Rubro' },
    { valor: 'marca', label: 'Marca' },
    { valor: 'accion', label: 'Acción' },
]

interface SelectorTipoOfrecimientoProps {
    value: TipoOfrecible
    onChange: (tipo: TipoOfrecible) => void
}

export default function SelectorTipoOfrecimiento({ value, onChange }: SelectorTipoOfrecimientoProps) {
    return (
        <div className="mb-2 flex gap-1.5">
            {TIPOS.map(t => {
                const on = value === t.valor
                return (
                    <button
                        key={t.valor}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(t.valor)}
                        className={`flex-1 rounded-[11px] border-[1.5px] px-3 py-2 text-sm font-bold ${
                            on
                                ? 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                                : 'border-[#E4E8F0] bg-white text-[#3B4560]'
                        }`}
                    >
                        {t.label}
                    </button>
                )
            })}
        </div>
    )
}
```

Los colores salen de `ResolucionRubro.tsx` (el patrón seleccionado/no seleccionado ya existe ahí). Verificar contra ese archivo antes de inventar valores.

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/components/propuesta/SelectorTipoOfrecimiento.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Escribir el test del picker de alcance**

Crear `src/components/propuesta/AlcancePicker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AlcancePicker from './AlcancePicker'

const marcas = [
    { code: 'SKF', description: 'SKF' },
    { code: 'CORVEN', description: 'Corven' },
]
const rubros = [{ code: 'RODAM', description: 'Rodamientos' }]

describe('AlcancePicker', () => {
    it('arranca colapsado y dice que la oferta es global', () => {
        render(<AlcancePicker value={[]} onChange={vi.fn()} marcas={marcas} rubros={rubros} />)

        expect(screen.getByText('Todo el cliente')).toBeInTheDocument()
    })

    it('al expandir muestra el buscador de marcas', async () => {
        render(<AlcancePicker value={[]} onChange={vi.fn()} marcas={marcas} rubros={rubros} />)

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))

        expect(screen.getByPlaceholderText('Buscar marca…')).toBeInTheDocument()
    })

    it('elegir una marca la agrega al alcance', async () => {
        const onChange = vi.fn()
        render(<AlcancePicker value={[]} onChange={onChange} marcas={marcas} rubros={rubros} />)

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))

        expect(onChange).toHaveBeenCalledWith([
            { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
        ])
    })

    // Multi-selección: el caso real es "descuento en SKF, sobre estos rubros".
    it('elegir una segunda marca no reemplaza a la primera', async () => {
        const onChange = vi.fn()
        const yaElegido = [{ tipo: 'marca' as const, codigo: 'SKF', descripcion: 'SKF' }]
        render(
            <AlcancePicker value={yaElegido} onChange={onChange} marcas={marcas} rubros={rubros} />,
        )

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Corven' }))

        expect(onChange).toHaveBeenCalledWith([
            { tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' },
            { tipo: 'marca', codigo: 'CORVEN', descripcion: 'Corven' },
        ])
    })

    it('volver a tocar un destino elegido lo saca', async () => {
        const onChange = vi.fn()
        const yaElegido = [{ tipo: 'marca' as const, codigo: 'SKF', descripcion: 'SKF' }]
        render(
            <AlcancePicker value={yaElegido} onChange={onChange} marcas={marcas} rubros={rubros} />,
        )

        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))

        expect(onChange).toHaveBeenCalledWith([])
    })

    it('muestra el resumen de lo elegido', () => {
        const yaElegido = [
            { tipo: 'marca' as const, codigo: 'SKF', descripcion: 'SKF' },
            { tipo: 'rubro' as const, codigo: 'RODAM', descripcion: 'Rodamientos' },
        ]
        render(
            <AlcancePicker value={yaElegido} onChange={vi.fn()} marcas={marcas} rubros={rubros} />,
        )

        expect(screen.getByText('SKF · Rodamientos')).toBeInTheDocument()
    })
})
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `npx vitest run src/components/propuesta/AlcancePicker.test.tsx`
Expected: FAIL — no existe el componente.

- [ ] **Step 7: Implementar el picker de alcance**

Crear `src/components/propuesta/AlcancePicker.tsx`. Reusa `CatalogoPicker` (que ya sabe buscar, normalizar acentos y acotar el alto) con dos sub-pestañas, marca y rubro:

```tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import { resumenAlcance, toggleAlcance } from '@/lib/alcance'
import type { IAlcance, ICatalogoItem, TipoAlcance } from '@/types/planificacion'

interface AlcancePickerProps {
    value: IAlcance[]
    onChange: (alcance: IAlcance[]) => void
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
}

/**
 * "Acotar a…": sobre qué aplica la oferta. Opcional y colapsado por defecto, porque la
 * mayoría de las ofertas son globales y el vendedor está parado en un mostrador.
 *
 * Lista vacía se muestra como "Todo el cliente" y NO como "sin alcance": lo segundo se
 * leería como que falta cargar algo.
 *
 * UI deliberadamente mínima — el rediseño del wizard es una iteración aparte. Lo que
 * importa acá es que el dato se pueda cargar para validar el modelo con uso real.
 */
export default function AlcancePicker({
    value,
    onChange,
    marcas,
    rubros,
    marcasLoading,
}: AlcancePickerProps) {
    const [abierto, setAbierto] = useState(false)
    const [tipo, setTipo] = useState<TipoAlcance>('marca')

    const items = tipo === 'marca' ? marcas : rubros
    const elegidos = new Set(value.map(a => `${a.tipo}:${a.codigo}`))

    return (
        <div className="mt-2 rounded-[10px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
            <button
                type="button"
                onClick={() => setAbierto(!abierto)}
                className="flex w-full items-center gap-2 text-left"
            >
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                    Acotar a
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#182645]">
                    {resumenAlcance(value)}
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-dsmuted transition-transform duration-150 ${
                        abierto ? 'rotate-180' : ''
                    }`}
                    strokeWidth={2.4}
                />
            </button>

            {abierto && (
                <div className="animate-panel-in mt-2">
                    <div className="mb-2 flex gap-1.5">
                        {(['marca', 'rubro'] as TipoAlcance[]).map(t => (
                            <button
                                key={t}
                                type="button"
                                aria-pressed={tipo === t}
                                onClick={() => setTipo(t)}
                                className={`flex-1 rounded-lg border px-2 py-1.5 text-[12.5px] font-bold ${
                                    tipo === t
                                        ? 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                                        : 'border-[#E1E6F0] bg-white text-[#3B4560]'
                                }`}
                            >
                                {t === 'marca' ? 'Marcas' : 'Rubros'}
                            </button>
                        ))}
                    </div>

                    <CatalogoPicker
                        items={items}
                        loading={tipo === 'marca' ? marcasLoading : false}
                        onSelect={item =>
                            onChange(
                                toggleAlcance(value, {
                                    tipo,
                                    codigo: item.code,
                                    descripcion: item.description,
                                }),
                            )
                        }
                        placeholder={tipo === 'marca' ? 'Buscar marca…' : 'Buscar rubro…'}
                    />

                    {value.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {value.map(a => (
                                <button
                                    key={`${a.tipo}:${a.codigo}`}
                                    type="button"
                                    onClick={() => onChange(toggleAlcance(value, a))}
                                    className="rounded-full border-[1.5px] border-[#B9CCEC] bg-[#EEF3FB] px-2.5 py-1 text-[12px] font-bold text-[#182645]"
                                >
                                    {a.descripcion} ✕
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
```

`elegidos` queda disponible por si el diseño futuro quiere tildar en la lista; si oxlint marca la variable sin usar, **borrarla** en vez de silenciar la regla.

- [ ] **Step 8: Correr el test**

Run: `npx vitest run src/components/propuesta/AlcancePicker.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/propuesta/SelectorTipoOfrecimiento.tsx src/components/propuesta/SelectorTipoOfrecimiento.test.tsx src/components/propuesta/AlcancePicker.tsx src/components/propuesta/AlcancePicker.test.tsx
git commit -m "feat: selector de tipo y picker de alcance"
```

---

### Task 5: Wizard y tabla de la propuesta

**Files:**
- Rename: `ResolucionRubro.tsx` → `ResolucionOfrecimiento.tsx`, `RubroTable.tsx` → `OfrecimientoTable.tsx` (+ sus tests)
- Modify: `src/components/propuesta/filas.ts`, `filas.test.ts`, `ResolucionWizard.tsx`, `ResolucionWizard.test.tsx`, `ResolucionWizardAcciones.tsx`, `src/components/PropuestaSheet.tsx`, `PropuestaSheet.test.tsx`, `src/lib/resolucionDraft.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el flujo de alta con tipo + alcance, y la tarjeta del ofrecimiento mostrando su alcance.

- [ ] **Step 1: Renombrar los componentes**

```bash
git mv src/components/propuesta/ResolucionRubro.tsx src/components/propuesta/ResolucionOfrecimiento.tsx
git mv src/components/propuesta/ResolucionRubro.test.tsx src/components/propuesta/ResolucionOfrecimiento.test.tsx
git mv src/components/propuesta/RubroTable.tsx src/components/propuesta/OfrecimientoTable.tsx
git mv src/components/propuesta/RubroTable.test.tsx src/components/propuesta/OfrecimientoTable.test.tsx
```

Dentro de los cuatro: `IRubroMotivo` → `IOfrecimientoMotivo`, `ResolucionRubro` → `ResolucionOfrecimiento`, `RubroTable` → `OfrecimientoTable`, y los props/variables `rubro*` → `ofrecimiento*`.

En `filas.ts`: `IRubroFilaResolucion` → `IOfrecimientoFilaResolucion` (con `visitaRubroId` → `ofrecimientoId`), `IRubroFila` → `IOfrecimientoFila` (con `rubroCode` → `codigo`, más un campo `tipo: TipoOfrecimiento` y `alcance: IAlcance[]`), `IRubroFilaTotales` → `IOfrecimientoFilaTotales`. El comentario sobre `RUBRO_DE_PROPUESTA` pasa a decir `OFRECIMIENTO_DE_PROPUESTA`.

En `resolucionDraft.ts`: los ids de borrador `rubroId` → `ofrecimientoId`.

- [ ] **Step 2: Correr los tests renombrados**

Run: `npx vitest run src/components/propuesta/`
Expected: PASS, misma cantidad que antes del rename. Si algún valor esperado cambia, parar.

- [ ] **Step 3: Entender el flujo de alta real ANTES de tocarlo**

**Esto no es como parece y es el punto donde el plan puede descarrilar.** El alta de un rubro **no usa ningún picker**: `OfrecimientoTable` lista TODOS los rubros del cliente (de `useRubroStatus`, "cómo viene comprando", con sus números de venta), y los que la visita permite agregar vienen marcados `agregable`. El vendedor **toca la fila** y eso dispara `agregar.mutate(...)` — ver `VisitaSheet.tsx:59` y `filas.ts:147`.

Consecuencias:

1. **Para marca y acción no existe ninguna lista equivalente.** No hay "cómo viene comprando por marca" en esa tabla. Hace falta una **puerta de entrada nueva**: un sheet chico de alta.
2. **El camino del rubro NO se toca.** Seguir tocando la fila sigue funcionando igual. Es el flujo que el vendedor ya conoce y el que tiene los números al lado.
3. **`agregandoCodes` está indexado por `rubroCode`** (`VisitaSheet.tsx`, un `Set<string>`). Con ofrecimientos genéricos dos tipos distintos pueden compartir código, así que la clave pasa a ser `` `${tipo}:${codigo}` ``. El comentario largo que explica por qué ese estado vive en el sheet y no en la mutación **se conserva**: documenta un bug ya pagado (dos filas tocadas a la vez apagaban el spinner de la primera).

- [ ] **Step 4: Escribir el test del sheet de alta**

Crear `src/components/propuesta/AgregarOfrecimientoSheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AgregarOfrecimientoSheet from './AgregarOfrecimientoSheet'

const acciones = [{ code: 'CUPO', description: 'Plan cupo' }]
const marcas = [{ code: 'SKF', description: 'SKF' }]
const rubros = [{ code: 'RODAM', description: 'Rodamientos' }]

const props = {
    open: true,
    onClose: vi.fn(),
    acciones,
    marcas,
    rubros,
}

describe('AgregarOfrecimientoSheet', () => {
    it('arranca en Rubro', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Rubro' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
    })

    it('agrega una acción con alcance sobre una marca', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
        })
    })

    it('agrega una marca sin alcance', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'marca',
            codigo: 'SKF',
            descripcion: 'SKF',
            alcance: [],
        })
    })

    // El alcance solo tiene sentido sobre una acción: acotar un rubro a otro rubro no
    // significa nada.
    it('no ofrece acotar cuando el tipo es marca o rubro', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.queryByRole('button', { name: /acotar/i })).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        expect(screen.queryByRole('button', { name: /acotar/i })).not.toBeInTheDocument()
    })

    it('cambiar de tipo limpia lo elegido y el alcance', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [],
        })
    })

    it('no deja agregar sin elegir nada', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: /agregar/i })).toBeDisabled()
    })
})
```

- [ ] **Step 5: Correr y verificar que falla**

Run: `npx vitest run src/components/propuesta/AgregarOfrecimientoSheet.test.tsx`
Expected: FAIL — no existe el componente.

- [ ] **Step 6: Implementar `AgregarOfrecimientoSheet`**

Crear `src/components/propuesta/AgregarOfrecimientoSheet.tsx`. Es un sheet chico con tres piezas ya construidas:

```tsx
import { useState } from 'react'
import SelectorTipoOfrecimiento, { type TipoOfrecible } from './SelectorTipoOfrecimiento'
import CatalogoPicker from './CatalogoPicker'
import AlcancePicker from './AlcancePicker'
import type { IAgregarOfrecimientoDTO, IAlcance, ICatalogoItem } from '@/types/planificacion'

interface AgregarOfrecimientoSheetProps {
    open: boolean
    onClose: () => void
    onAgregar: (dto: IAgregarOfrecimientoDTO) => void
    acciones: ICatalogoItem[]
    marcas: ICatalogoItem[]
    rubros: ICatalogoItem[]
    marcasLoading?: boolean
}

/**
 * Alta de un ofrecimiento que NO sale de la tabla de "cómo viene comprando".
 *
 * Los rubros se siguen agregando tocando su fila en OfrecimientoTable, que además muestra los
 * números de venta al lado — ese camino no se toca. Marcas y acciones no tienen tabla
 * equivalente, y esta es su puerta de entrada.
 *
 * UI deliberadamente mínima: el rediseño del wizard es una iteración aparte.
 */
export default function AgregarOfrecimientoSheet({
    open,
    onClose,
    onAgregar,
    acciones,
    marcas,
    rubros,
    marcasLoading,
}: AgregarOfrecimientoSheetProps) {
    const [tipo, setTipo] = useState<TipoOfrecible>('rubro')
    const [elegido, setElegido] = useState<ICatalogoItem | null>(null)
    const [alcance, setAlcance] = useState<IAlcance[]>([])

    if (!open) return null

    const catalogo = tipo === 'rubro' ? rubros : tipo === 'marca' ? marcas : acciones

    // Cambiar de tipo invalida lo elegido Y el alcance: un alcance cargado para una
    // acción no significa nada si el vendedor pasa a marca.
    function cambiarTipo(nuevo: TipoOfrecible) {
        setTipo(nuevo)
        setElegido(null)
        setAlcance([])
    }

    function confirmar() {
        if (!elegido) return
        onAgregar({
            tipo,
            codigo: elegido.code,
            descripcion: elegido.description,
            alcance,
        })
        cambiarTipo('rubro')
        onClose()
    }

    return (
        <div className="flex flex-col gap-2 p-3">
            <SelectorTipoOfrecimiento value={tipo} onChange={cambiarTipo} />

            <CatalogoPicker
                items={catalogo}
                loading={tipo === 'marca' ? marcasLoading : false}
                value={elegido?.description ?? null}
                onSelect={setElegido}
                placeholder={
                    tipo === 'rubro'
                        ? 'Buscar rubro…'
                        : tipo === 'marca'
                          ? 'Buscar marca…'
                          : 'Buscar acción…'
                }
            />

            {tipo === 'accion' && (
                <AlcancePicker
                    value={alcance}
                    onChange={setAlcance}
                    marcas={marcas}
                    rubros={rubros}
                    marcasLoading={marcasLoading}
                />
            )}

            <button
                type="button"
                disabled={!elegido}
                onClick={confirmar}
                className="mt-1 rounded-[11px] bg-dsnavy px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
                Agregar
            </button>
        </div>
    )
}
```

Envolverlo en el mismo primitivo de sheet que usa el resto de la app (mirar cómo monta `VisitaSheet` su contenedor) en vez de inventar uno. `bg-dsnavy` tiene que existir en el tema — verificarlo en `tailwind.config`; si no, usar el color que usan los botones primarios del wizard.

- [ ] **Step 6b: Correr el test**

Run: `npx vitest run src/components/propuesta/AgregarOfrecimientoSheet.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6c: Montarlo en `VisitaSheet` y arreglar la clave de `agregandoCodes`**

En `src/components/VisitaSheet.tsx`:

1. Estado `[altaAbierta, setAltaAbierta] = useState(false)` y un botón "Agregar otra cosa" cerca de la tabla, que lo abre.
2. Montar `<AgregarOfrecimientoSheet>` con `acciones` de `useAcciones()` (mapeando `IAccion` → `ICatalogoItem`: `{ code: a.codigo, description: a.descripcion }`), `marcas` del hook de marcas que ya usa `ResolucionOfrecimiento`, y `rubros` derivados de `rubroStatus`.
3. `onAgregar={dto => agregar.mutate(dto)}`.
4. **`agregandoCodes` pasa de estar indexado por `rubroCode` a `` `${tipo}:${codigo}` ``.** Actualizar los tres lugares: donde se agrega al `Set`, donde se saca, y donde `OfrecimientoTable` lo consulta (`OfrecimientoTable.tsx:157`). Conservar entero el comentario que explica por qué ese estado no vive en la mutación.

Test de regresión en `VisitaSheet.test.tsx`:

```tsx
it('dos ofrecimientos del mismo código y distinto tipo no comparten el spinner', async () => {
    // …montar con la visita abierta; agregar rubro "X" y marca "X"
    // El spinner de uno no debe encenderse por el otro.
})
```

Si montar ese caso resulta artificial con los mocks existentes, reemplazarlo por un test directo del helper de clave — pero **no borrarlo sin reemplazo**: es la razón del cambio.

- [ ] **Step 6d: Correr los tests del sheet**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS.

- [ ] **Step 7: Mostrar tipo y alcance en la tarjeta**

En `OfrecimientoTable.tsx`, cada fila muestra el chip de tipo (salvo `rubro`, que es el caso por defecto y no aporta) y, si tiene alcance, el `resumenAlcance` en una línea chica debajo de la descripción.

Test:

```tsx
it('muestra el alcance de una acción', () => {
    // …montar OfrecimientoTable con un ofrecimiento tipo accion, codigo CUPO y alcance [SKF]
    expect(screen.getByText('Plan cupo')).toBeInTheDocument()
    expect(screen.getByText('SKF')).toBeInTheDocument()
})

it('un rubro común no muestra chip de tipo', () => {
    // …montar con un ofrecimiento tipo rubro
    expect(screen.queryByText('Rubro')).not.toBeInTheDocument()
})
```

- [ ] **Step 8: Correr todos los tests de propuesta**

Run: `npx vitest run src/components/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/ src/lib/resolucionDraft.ts
git commit -m "feat: alta de ofrecimientos por tipo con alcance opcional"
```

---

### Task 6: Analítica y cierre

**Files:**
- Modify: `src/types/analitica.ts`, `src/api/analitica.ts`, `src/mocks/analiticaMock.ts`, `src/components/analitica/TablaVisitas.tsx`, `TablaActividad.tsx`, `DetalleVisitaPanel.tsx`, `ObjecionesMercado.tsx`, `src/components/ClienteCard.tsx`, `src/components/VisitaFlow.tsx`, `src/components/VisitaSheet.tsx` (+ sus tests)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la analítica leyendo ofrecimientos con su tipo.

- [ ] **Step 1: Renombrar en los tipos de analítica**

En `src/types/analitica.ts`: `IVisitaRubroMotivoDetalle` → `IOfrecimientoMotivoDetalle`, `IVisitaRubroDetalle` → `IOfrecimientoDetalle` (con `rubroCode` → `codigo`, `rubroDescripcion` → `descripcion`, más `tipo: TipoOfrecimiento` y `alcance: IAlcance[]`), `IVisitaDetalle.rubros` → `ofrecimientos`.

Los indicadores de `IEfectividad` (líneas 57-66): `rubrosOfrecidos` → `ofrecimientosTotales`, `rubrosGanados` → `ofrecimientosGanados`, `rubrosDiferidos` → `ofrecimientosDiferidos`, `rubrosPerdidos` → `ofrecimientosPerdidos`, `rubrosSinResolver` → `ofrecimientosSinResolver`. Actualizar los comentarios (`/** 0..1 = ganados/ofrecidos… */`).

**Los mapas de `resultado`** (`ganado`/`diferido`/`perdido`/`no_ofrecido`) en `TablaVisitas.tsx:12-22`, `TablaActividad.tsx:12-22`, `DetalleVisitaPanel.tsx:14-17` y `ObjecionesMercado.tsx:13-16` **no se tocan**.

- [ ] **Step 2: Actualizar el mock de analítica**

`src/mocks/analiticaMock.ts` alimenta los tests y el sandbox. Renombrar sus campos y **agregar al menos un ofrecimiento de tipo `accion` con alcance**, para que el chip y el resumen se vean en el sandbox sin depender del backend:

```ts
{
    tipo: 'accion' as const,
    codigo: 'CUPO',
    descripcion: 'Plan cupo',
    esPropuesto: false,
    resuelto: true,
    alcance: [{ tipo: 'marca' as const, codigo: 'SKF', descripcion: 'SKF' }],
    motivos: [{ descripcion: 'Saqué pedido', resultado: 'ganado' as const, marca: null, competidor: null, pctDiferencia: null }],
},
```

- [ ] **Step 3: Escribir el test del chip de tipo**

En `src/components/analitica/DetalleVisitaPanel.test.tsx`:

```tsx
it('muestra el tipo y el alcance de un ofrecimiento que no es rubro', () => {
    // …montar el panel con el detalle que incluye el ofrecimiento de tipo accion del mock
    expect(screen.getByText('Plan cupo')).toBeInTheDocument()
    expect(screen.getByText('Acción')).toBeInTheDocument()
    expect(screen.getByText('SKF')).toBeInTheDocument()
})
```

Run: `npx vitest run src/components/analitica/DetalleVisitaPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Pintar el chip**

En `DetalleVisitaPanel.tsx` y `TablaVisitas.tsx`, agregar el chip de tipo junto a la descripción, con el mismo mapa de etiquetas en un solo lugar:

```ts
const TIPO_LABEL: Record<TipoOfrecimiento, string> = {
    rubro: 'Rubro',
    marca: 'Marca',
    linea: 'Línea',
    articulo: 'Artículo',
    accion: 'Acción',
}
```

**El chip no se pinta para `rubro`**: es el caso por defecto y repetirlo en cada fila es ruido. `"SKF"` sin decir que es una marca sí es ambiguo, y esa es la razón del chip.

- [ ] **Step 5: Correr los tests de analítica**

Run: `npx vitest run src/components/analitica/ src/api/analitica.test.ts src/mocks/`
Expected: PASS.

- [ ] **Step 6: Renombrar los campos arrastrados en el resto de la UI**

- `ClienteCard.tsx`: `rubrosPendientes` → `ofrecimientosPendientes`. El texto visible al vendedor **no dice "ofrecimiento"**: si hoy dice "3 rubros sin resolver", pasa a decir algo como "3 sin resolver" o "3 propuestas sin resolver". El vendedor no habla en tipos de dato.
- `VisitaFlow.tsx` y `VisitaSheet.tsx`: los mismos renames, y `ofrecimientosAutocompletados` donde corresponda.

Run: `grep -rn "rubro\|Rubro" src/ --include=*.ts --include=*.tsx | grep -v "IRubroPropuesta\|IRubroMonthDrop\|IDroppedRubro\|IRubroDrops\|IRubroEstado\|IRubroClients\|IPropuestaRubroDTO\|sale/rubro\|getRubroStatus\|usePropuesta\|useRubroStatus"`
Expected: solo quedan referencias al **motor de propuesta** y a los catálogos del warehouse, más los textos donde "rubro" es la palabra correcta para el vendedor.

- [ ] **Step 7: Build, lint y suite completa**

Run: `npm run build`
Expected: cero errores. Primera vez desde la Task 1 que el build tiene que estar limpio.

Run: `npm run lint`
Expected: cero errores.

Run: `npm test`
Expected: PASS, toda la suite.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "feat: analitica de ofrecimientos con chip de tipo y alcance"
```

---

### Task 7: Verificación en la app real

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar la app contra el backend local**

```bash
npm run dev
```

- [ ] **Step 2: Recorrer el flujo del vendedor**

En un viewport mobile (DevTools, 390×844):

1. Abrir la agenda, entrar a un día, iniciar una visita.
2. En la propuesta, tocar **Agregar otra cosa** → elegir **Acción** → **Plan cupo**.
3. Tocar **Acotar a** → pestaña **Marcas** → elegir SKF y Corven.
4. Confirmar. Verificar que la tarjeta muestra "Plan cupo" con el chip **Acción** y el resumen "SKF · Corven".
5. Resolver ese ofrecimiento con "Saqué pedido". Verificar que el contador de pendientes baja.
6. Cerrar la visita y volver a la vista semanal: el cliente queda tildado.

- [ ] **Step 3: Verificar el teclado virtual**

Con el picker de alcance abierto y el teclado del emulador desplegado, confirmar que el pie del sheet sigue alcanzable y que la lista scrollea en su lugar en vez de empujar el resto fuera de vista. Es el problema que `CatalogoPicker` ya resuelve con `max-h-[min(200px,26dvh)]` — si el `AlcancePicker` lo rompió, se nota acá.

- [ ] **Step 4: Verificar el caso global**

Agregar una segunda acción **sin** tocar "Acotar a". La tarjeta tiene que decir **"Todo el cliente"**, no "sin alcance" ni un espacio vacío.

- [ ] **Step 5: Verificar el duplicado**

Intentar agregar otra vez "Plan cupo" con el mismo alcance (SKF + Corven). Esperado: el backend responde 409 `OFRECIMIENTO_DUPLICADO` y la UI muestra el mensaje sin romperse. Cambiar el alcance a otra marca: entra bien.

- [ ] **Step 6: Verificar la analítica**

Entrar a `/analitica`, abrir el detalle de esa visita y confirmar que el ofrecimiento aparece con su chip de tipo, su alcance y su resultado.

- [ ] **Step 7: Actualizar la documentación viva**

En `CLAUDE.md`, el diagrama del ecosistema lista las tablas `pl_`: renombrar `pl_visita_rubro` → `pl_ofrecimiento`, `pl_visita_rubro_motivo` → `pl_ofrecimiento_motivo`, y agregar `pl_ofrecimiento_alcance` y `pl_accion` con su descripción de una línea.

Si `docs/dominio/tablas.md` no quedó actualizado por el plan de backend (Task 10), hacerlo acá.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: ofrecimiento generico en el mapa del ecosistema"
```

---

## Notas de despliegue

1. Confirmar que api-vendedores con el dominio de ofrecimientos **ya está en producción**.
2. Desplegar esta app.
3. Confirmar en los logs que nadie pega más a `/planificacion/visitas/:id/rubros` — recién entonces se pueden borrar los alias del backend.
