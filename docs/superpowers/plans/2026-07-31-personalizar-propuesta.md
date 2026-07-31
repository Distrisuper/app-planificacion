# Personalizar la propuesta (catálogos de rubros y marcas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el vendedor pueda agregar a la visita un rubro que no está en la propuesta, y que el campo Marca del detalle de motivo se elija de un catálogo en vez de escribirse a mano.

**Architecture:** Un `CatalogoPicker` presentacional (lista buscable sobre `{ code, description }`) reusado en dos contenedores distintos: como vista del `BottomSheet` para rubros, e inline dentro del panel de detalle para marcas. Dos endpoints ya existentes de api-vendedores (`GET /sale/rubro/catalog`, `GET /sale/brand/catalog`), dos hooks de React Query con `staleTime` largo y carga bajo demanda. Cero cambios de backend.

**Tech Stack:** Vite + React 19 + TypeScript, React Query (@tanstack), axios, Tailwind, lucide-react, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-31-personalizar-propuesta-design.md`

## Global Constraints

- **Cero cambios de backend.** `marca` es `VARCHAR(100)` libre en `pl_visita_rubro_motivo` y no se valida contra catálogo. La normalización la aporta la UI.
- **Indentación de 4 espacios**, comillas simples, sin punto y coma final. Es el estilo de todo el repo.
- **Comentarios en castellano**, explicando el *por qué* (no el qué), como el resto de `src/components/propuesta/`.
- **Todo texto de UI en castellano rioplatense** ("Elegí", "Volvé", "Seguí").
- **Endpoint de rubros: `GET /sale/rubro/catalog`.** NO usar `GET /clients/getRubros` — es otra lista, sin cache, y no es la que el backend usa para validar la propuesta.
- **Tope de resultados renderizados: 50**, constante `TOPE` en `CatalogoPicker.tsx`.
- Tests: `npx vitest run <ruta>` para uno solo, `npm test` para la suite.
- Al terminar cada tarea: `npm test` y `npm run build` en verde antes del commit.

---

### Task 1: Capa de datos — tipo, endpoints y hooks de catálogo

**Files:**
- Modify: `src/types/planificacion.ts` (agregar `ICatalogoItem` cerca de `IMotivo`, arriba del archivo)
- Modify: `src/api/planificacion.ts` (nueva sección al final, después de `getRubroStatus`)
- Modify: `src/api/planificacion.test.ts` (imports + nuevo `describe`)
- Create: `src/hooks/useCatalogos.ts`

**Interfaces:**
- Consumes: `apiClient` de `src/api/apiClient.ts`.
- Produces:
  - `interface ICatalogoItem { code: string; description: string }`
  - `getRubroCatalog(): Promise<ICatalogoItem[]>`
  - `getBrandCatalog(): Promise<ICatalogoItem[]>`
  - `useRubroCatalog(enabled?: boolean)` y `useBrandCatalog(enabled?: boolean)` — `UseQueryResult<ICatalogoItem[]>`
  - `catalogoKeys = { rubros, marcas }`

- [ ] **Step 1: Escribir el test que falla**

En `src/api/planificacion.test.ts`, agregar `getRubroCatalog` y `getBrandCatalog` a la lista de imports desde `'./planificacion'`, y agregar este `describe` al final del archivo:

```tsx
describe('catálogos', () => {
    it('getRubroCatalog apunta a /sale/rubro/catalog', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([{ code: 'AMORT', description: 'Amortiguadores' }]))
        await expect(getRubroCatalog()).resolves.toEqual([
            { code: 'AMORT', description: 'Amortiguadores' },
        ])
        expect(apiClient.get).toHaveBeenCalledWith('/sale/rubro/catalog')
    })

    it('getBrandCatalog apunta a /sale/brand/catalog', async () => {
        ;(apiClient.get as any).mockResolvedValue(ok([{ code: 'FR', description: 'Fric-Rot' }]))
        await expect(getBrandCatalog()).resolves.toEqual([{ code: 'FR', description: 'Fric-Rot' }])
        expect(apiClient.get).toHaveBeenCalledWith('/sale/brand/catalog')
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: FAIL — no exporta `getRubroCatalog` / `getBrandCatalog`.

- [ ] **Step 3: Agregar el tipo**

En `src/types/planificacion.ts`, justo después de la definición de `IMotivo`:

```ts
/** Entrada de catálogo para poblar selects. Rubros y marcas comparten forma. */
export interface ICatalogoItem {
    code: string
    description: string
}
```

- [ ] **Step 4: Agregar los endpoints**

En `src/api/planificacion.ts`, agregar `ICatalogoItem` al bloque de `import type` (en orden alfabético, entre `IAgregarRubroResult` e `ICerrarCicloResult`), y agregar al final del archivo:

```ts
// ── Catálogos (endpoints reusados, fuera del dominio de planificación) ─────────

/** Rubros válidos para poblar selects. Es la MISMA lista contra la que el backend
 *  valida la propuesta (RubroCatalogService) — no confundir con /clients/getRubros,
 *  que es otra query sobre staging, sin cache y con filtros propios. */
export const getRubroCatalog = async (): Promise<ICatalogoItem[]> => {
    const res = await apiClient.get('/sale/rubro/catalog')
    return res.data.data
}

/** Marcas con ventas en los últimos 12 meses. Ordenadas por descripción del lado
 *  del server. */
export const getBrandCatalog = async (): Promise<ICatalogoItem[]> => {
    const res = await apiClient.get('/sale/brand/catalog')
    return res.data.data
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/api/planificacion.test.ts`
Expected: PASS.

- [ ] **Step 6: Crear los hooks**

`src/hooks/useCatalogos.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getBrandCatalog, getRubroCatalog } from '@/api/planificacion'

export const catalogoKeys = {
    rubros: ['catalogo', 'rubros'] as const,
    marcas: ['catalogo', 'marcas'] as const,
}

/** Son catálogos: el de rubros cambia de mes a mes y el de marcas se recalcula sobre
 *  12 meses de ventas. Del lado del server ya vienen cacheados en Redis, así que
 *  refetchear cada 5 minutos (el default de queryClient) sería puro ruido. */
const CATALOGO_STALE_MS = 30 * 60 * 1000

/** `enabled` existe para pedirlo recién cuando se abre el buscador: son vendedores
 *  en la calle con datos móviles. */
export function useRubroCatalog(enabled = true) {
    return useQuery({
        queryKey: catalogoKeys.rubros,
        queryFn: getRubroCatalog,
        staleTime: CATALOGO_STALE_MS,
        enabled,
    })
}

export function useBrandCatalog(enabled = true) {
    return useQuery({
        queryKey: catalogoKeys.marcas,
        queryFn: getBrandCatalog,
        staleTime: CATALOGO_STALE_MS,
        enabled,
    })
}
```

No llevan test propio: son `useQuery` sin transformación, igual que `usePropuesta` y `useMotivos`, que tampoco lo tienen.

- [ ] **Step 7: Suite completa y build**

Run: `npm test` — Expected: PASS
Run: `npm run build` — Expected: sin errores de tipos.

- [ ] **Step 8: Commit**

```bash
git add src/types/planificacion.ts src/api/planificacion.ts src/api/planificacion.test.ts src/hooks/useCatalogos.ts
git commit -m "feat(propuesta): endpoints y hooks de catálogo de rubros y marcas"
```

---

### Task 2: `CatalogoPicker` — lista buscable compartida

**Files:**
- Create: `src/components/propuesta/CatalogoPicker.tsx`
- Test: `src/components/propuesta/CatalogoPicker.test.tsx`

**Interfaces:**
- Consumes: `ICatalogoItem` de Task 1.
- Produces: `export default function CatalogoPicker(props: CatalogoPickerProps)` con las props exactas del Step 3. Lo usan Task 3 (rubros) y Task 4 (marcas).

- [ ] **Step 1: Escribir el test que falla**

`src/components/propuesta/CatalogoPicker.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import CatalogoPicker from './CatalogoPicker'
import type { ICatalogoItem } from '@/types/planificacion'

const items: ICatalogoItem[] = [
    { code: 'BAT', description: 'BATERÍAS' },
    { code: 'AMORT', description: 'Amortiguadores' },
    { code: 'FILT', description: 'Filtros' },
]

function setup(over: Record<string, unknown> = {}) {
    const onSelect = vi.fn()
    render(
        <CatalogoPicker
            items={items}
            onSelect={onSelect}
            placeholder="Buscar rubro…"
            {...over}
        />,
    )
    return { onSelect }
}

it('filtra ignorando acentos y mayúsculas', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('Buscar rubro…'), {
        target: { value: 'bateria' },
    })
    expect(screen.getByText('BATERÍAS')).toBeInTheDocument()
    expect(screen.queryByText('Filtros')).not.toBeInTheDocument()
})

it('no ofrece los codes excluidos', () => {
    setup({ excluir: ['FILT'] })
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.queryByText('Filtros')).not.toBeInTheDocument()
})

it('corta en 50 resultados y avisa que hay más', () => {
    const muchos: ICatalogoItem[] = Array.from({ length: 60 }, (_, i) => ({
        code: `M${i}`,
        description: `Marca ${i}`,
    }))
    setup({ items: muchos })
    expect(screen.getByText('Marca 49')).toBeInTheDocument()
    expect(screen.queryByText('Marca 50')).not.toBeInTheDocument()
    expect(screen.getByText(/seguí escribiendo/i)).toBeInTheDocument()
})

it('onSelect devuelve el ítem completo, no solo el texto', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getByText('Filtros'))
    expect(onSelect).toHaveBeenCalledWith({ code: 'FILT', description: 'Filtros' })
})

it('muestra un value que ya no está en el catálogo en vez de perderlo', () => {
    setup({ value: 'frikrot' })
    expect(screen.getByText('frikrot')).toBeInTheDocument()
})

it('con pendingCode deshabilita la lista y marca la fila en curso', () => {
    setup({ pendingCode: 'FILT' })
    expect(screen.getByRole('button', { name: 'Amortiguadores' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveAttribute('aria-busy', 'true')
})

it('avisa cuando la búsqueda no encuentra nada', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('Buscar rubro…'), {
        target: { value: 'zzz' },
    })
    expect(screen.getByText(/sin resultados/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/propuesta/CatalogoPicker.test.tsx`
Expected: FAIL — no existe `./CatalogoPicker`.

- [ ] **Step 3: Implementar el componente**

`src/components/propuesta/CatalogoPicker.tsx`:

```tsx
import { useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import type { ICatalogoItem } from '@/types/planificacion'

/** Los catálogos traen cientos de filas (el de marcas sale de 12 meses de ventas).
 *  Pintarlas todas en un sheet en un teléfono de gama baja se siente lento, y nadie
 *  scrollea 400 opciones: se busca. */
const TOPE = 50

interface CatalogoPickerProps {
    items: ICatalogoItem[]
    loading?: boolean
    /** Codes que no se ofrecen (ej. rubros ya en la visita). */
    excluir?: string[]
    /** Descripción del ítem ya elegido, para marcarlo con un tilde. Se compara por
     *  `description` y no por `code` porque es lo que persiste la columna `marca`:
     *  de un valor viejo en texto libre no hay code que buscar. */
    value?: string | null
    /** Code del ítem cuya mutación está en vuelo: esa fila muestra spinner y el resto
     *  de la lista queda deshabilitada. */
    pendingCode?: string | null
    onSelect: (item: ICatalogoItem) => void
    placeholder: string
    autoFocus?: boolean
}

/** Sin acentos ni mayúsculas: nadie tipea la tilde de "BATERÍAS" parado en un mostrador. */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

/** Lista buscable sobre un catálogo. No sabe qué catálogo muestra ni de dónde sale:
 *  lo usan tanto el alta de rubros (como vista del sheet) como el campo Marca del
 *  detalle de motivo (inline). */
export default function CatalogoPicker({
    items,
    loading,
    excluir,
    value,
    pendingCode,
    onSelect,
    placeholder,
    autoFocus,
}: CatalogoPickerProps) {
    const [busqueda, setBusqueda] = useState('')

    // Sin useMemo a propósito: `excluir` suele llegar como array literal, así que la
    // memo se invalidaría en cada render igual. Filtrar unos cientos de strings es
    // más barato que la ilusión de estar cacheando.
    const fuera = new Set(excluir ?? [])
    const q = normalizar(busqueda.trim())
    const filtrados = items.filter(
        i => !fuera.has(i.code) && (q === '' || normalizar(i.description).includes(q)),
    )
    const visibles = filtrados.slice(0, TOPE)
    const ocultos = filtrados.length - visibles.length

    // Un valor guardado que ya no está en el catálogo (marca vieja en texto libre, o
    // marca que dejó de vender y cayó de los 12 meses) se muestra igual, inerte:
    // perderlo en silencio sería peor que la inconsistencia que esto viene a arreglar.
    const huerfano = value && !items.some(i => i.description === value) ? value : null

    const bloqueada = pendingCode != null

    return (
        <div>
            <div className="relative mb-2">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A93A6]"
                    strokeWidth={2.4}
                />
                <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6]"
                />
            </div>

            {huerfano && (
                <div className="mb-2 flex items-center gap-2 rounded-[11px] border-[1.5px] border-[#B9CCEC] bg-[#EEF3FB] px-3 py-2.5">
                    <Check className="h-[15px] w-[15px] shrink-0 text-[#213D82]" strokeWidth={3} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#182645]">
                        {huerfano}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-dsmuted">
                        fuera de catálogo
                    </span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-dsmuted">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                    Cargando…
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {visibles.map(item => {
                        const enCurso = pendingCode === item.code
                        const elegido = value === item.description
                        return (
                            <button
                                key={item.code}
                                type="button"
                                disabled={bloqueada}
                                aria-busy={enCurso}
                                onClick={() => onSelect(item)}
                                className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans disabled:opacity-50 ${
                                    elegido
                                        ? 'border-[#B9CCEC] bg-[#EEF3FB]'
                                        : 'border-[#E4E8F0] bg-white'
                                }`}
                            >
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#3B4560]">
                                    {item.description}
                                </span>
                                {enCurso && (
                                    <Loader2
                                        className="h-4 w-4 shrink-0 animate-spin text-dsmuted"
                                        strokeWidth={2.4}
                                    />
                                )}
                                {!enCurso && elegido && (
                                    <Check
                                        className="h-4 w-4 shrink-0 text-[#213D82]"
                                        strokeWidth={3}
                                    />
                                )}
                            </button>
                        )
                    })}

                    {visibles.length === 0 && (
                        <div className="py-6 text-center text-sm text-dsmuted">
                            Sin resultados
                        </div>
                    )}

                    {ocultos > 0 && (
                        <div className="py-2 text-center text-[12px] font-semibold text-dsmuted">
                            +{ocultos} más. Seguí escribiendo para afinar.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/propuesta/CatalogoPicker.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Suite completa y build**

Run: `npm test` — Expected: PASS
Run: `npm run build` — Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/propuesta/CatalogoPicker.tsx src/components/propuesta/CatalogoPicker.test.tsx
git commit -m "feat(propuesta): CatalogoPicker, lista buscable sobre un catálogo"
```

---

### Task 3: Agregar un rubro a la visita

Deliverable: el vendedor abre "Agregar rubro" desde la lista de la visita, busca en el catálogo completo y el rubro queda pendiente en la lista.

**Files:**
- Create: `src/components/propuesta/AgregarRubroVista.tsx`
- Test: `src/components/propuesta/AgregarRubroVista.test.tsx`
- Modify: `src/components/VisitaSheet.tsx`
- Modify: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `CatalogoPicker` (Task 2), `useRubroCatalog` (Task 1), `useAgregarRubro` de `@/hooks/useRubros` (ya existe, hoy sin consumidores).
- Produces: `AgregarRubroVista({ visitaId, codesEnVisita, onVolver, onAgregado })`.

- [ ] **Step 1: Escribir el test que falla**

`src/components/propuesta/AgregarRubroVista.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import AgregarRubroVista from './AgregarRubroVista'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function renderVista(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onVolver = vi.fn()
    const onAgregado = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <AgregarRubroVista
                visitaId={42}
                codesEnVisita={['AMORT']}
                onVolver={onVolver}
                onAgregado={onAgregado}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onVolver, onAgregado }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getRubroCatalog as any).mockResolvedValue([
        { code: 'AMORT', description: 'Amortiguadores' },
        { code: 'FILT', description: 'Filtros' },
    ])
    ;(api.agregarRubro as any).mockResolvedValue({ visitaRubroId: 99 })
})

it('no ofrece los rubros que ya están en la visita', async () => {
    renderVista()
    expect(await screen.findByText('Filtros')).toBeInTheDocument()
    // El backend no deduplica: dos "Amortiguadores" serían dos pendientes distintos.
    expect(screen.queryByText('Amortiguadores')).not.toBeInTheDocument()
})

it('agrega el rubro elegido y vuelve a la lista', async () => {
    const { onAgregado } = renderVista()
    fireEvent.click(await screen.findByText('Filtros'))
    await waitFor(() =>
        expect(api.agregarRubro).toHaveBeenCalledWith(42, {
            rubroCode: 'FILT',
            rubroDescripcion: 'Filtros',
        }),
    )
    expect(onAgregado).toHaveBeenCalled()
})

it('si falla muestra el error y no cierra la vista', async () => {
    ;(api.agregarRubro as any).mockRejectedValue(new Error('offline'))
    const { onAgregado } = renderVista()
    fireEvent.click(await screen.findByText('Filtros'))
    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument()
    expect(onAgregado).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/propuesta/AgregarRubroVista.test.tsx`
Expected: FAIL — no existe `./AgregarRubroVista`.

- [ ] **Step 3: Implementar la vista**

`src/components/propuesta/AgregarRubroVista.tsx`:

```tsx
import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CatalogoPicker from './CatalogoPicker'
import { useRubroCatalog } from '@/hooks/useCatalogos'
import { useAgregarRubro } from '@/hooks/useRubros'
import type { ICatalogoItem } from '@/types/planificacion'

interface AgregarRubroVistaProps {
    visitaId: number
    /** Codes ya presentes en la visita. El backend NO deduplica
     *  (VisitaRubroRepository.crearFueraDePropuesta hace un INSERT ciego, sin índice
     *  único): dos "Filtros" serían dos pendientes distintos y ambos trabarían el
     *  cierre de la semana. El front es el único que puede evitarlo. */
    codesEnVisita: string[]
    onVolver: () => void
    onAgregado: () => void
}

/** Alta de un rubro fuera de la propuesta. Se queda con su propia mutación en vez de
 *  subirla a VisitaSheet, que ya tiene cinco piezas de estado propias. */
export default function AgregarRubroVista({
    visitaId,
    codesEnVisita,
    onVolver,
    onAgregado,
}: AgregarRubroVistaProps) {
    // El catálogo se pide al montar, y esta vista solo se monta cuando el vendedor
    // abre el buscador: no hay que pagarlo en cada visita.
    const { data: catalogo = [], isLoading } = useRubroCatalog()
    const agregar = useAgregarRubro(visitaId)
    const [error, setError] = useState<string | null>(null)
    const [pendingCode, setPendingCode] = useState<string | null>(null)

    async function elegir(item: ICatalogoItem) {
        setError(null)
        setPendingCode(item.code)
        try {
            await agregar.mutateAsync({
                rubroCode: item.code,
                rubroDescripcion: item.description,
            })
            onAgregado()
        } catch {
            setError('Sin conexión. Volvé a intentar; no se perdió lo que cargaste.')
        } finally {
            setPendingCode(null)
        }
    }

    return (
        <div>
            <div className="mb-3.5 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    aria-label="Volver"
                    onClick={onVolver}
                    className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="text-[13px] font-bold text-[#182645]">Agregar rubro</span>
            </div>

            {error && (
                <p className="mb-2.5 rounded-[10px] bg-[#FEECEC] px-3 py-2 text-[12.5px] font-semibold text-dsred">
                    {error}
                </p>
            )}

            <CatalogoPicker
                items={catalogo}
                loading={isLoading}
                excluir={codesEnVisita}
                pendingCode={pendingCode}
                onSelect={elegir}
                placeholder="Buscar rubro…"
                autoFocus
            />
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/propuesta/AgregarRubroVista.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Escribir el test de integración en VisitaSheet**

En `src/components/VisitaSheet.test.tsx`, agregar al `beforeEach` existente:

```tsx
    ;(api.getRubroCatalog as any).mockResolvedValue([
        { code: 'BAT', description: 'Baterías' },
    ])
    ;(api.agregarRubro as any).mockResolvedValue({ visitaRubroId: 99 })
```

y agregar estos tests al final del archivo:

```tsx
it('desde la lista se puede agregar un rubro fuera de la propuesta', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: /agregar rubro/i }))
    fireEvent.click(await screen.findByText('Baterías'))
    await waitFor(() =>
        expect(api.agregarRubro).toHaveBeenCalledWith(42, {
            rubroCode: 'BAT',
            rubroDescripcion: 'Baterías',
        }),
    )
    // Vuelve a la lista: el rubro nuevo es el feedback.
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
})

it('el buscador no ofrece rubros que ya están en la visita', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: /agregar rubro/i }))
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByText('Amortiguadores')).not.toBeInTheDocument()
})

// La pantalla de visita cerrada existe para VACIAR pendientes. Agregar ahí crearía
// uno nuevo y trabaría el cierre de la semana, aunque el backend lo permita.
it('no ofrece agregar rubros cuando la visita ya está cerrada', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /agregar rubro/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: FAIL — no existe el botón "Agregar rubro".

- [ ] **Step 7: Cablear en VisitaSheet**

En `src/components/VisitaSheet.tsx`:

1. Agregar `Plus` a los imports de `lucide-react` (junto a `ChevronLeft, Loader2, Maximize2, Trash2`).
2. Agregar el import: `import AgregarRubroVista from './propuesta/AgregarRubroVista'`
3. Cambiar el tipo de vista:

```tsx
type Vista = 'list' | 'versus' | 'agregar'
```

4. En el `footer`, la vista de alta no lleva pie propio — "Cerrar visita" ahí sería un botón para otra pantalla. Reemplazar la línea `const footer = wizard ? (` por:

```tsx
    const footer = wizard ? (
```

y la línea `    ) : (` que abre la rama del pie de la lista (justo antes de `<>` con `pendientes > 0`) por:

```tsx
    ) : vista === 'agregar' ? null : (
```

5. Dentro del render, agregar la rama de la vista nueva. Reemplazar `            ) : vista === 'versus' ? (` por:

```tsx
            ) : vista === 'agregar' ? (
                <AgregarRubroVista
                    visitaId={visitaId}
                    codesEnVisita={rubros.map(r => r.rubroCode)}
                    onVolver={() => setVista('list')}
                    onAgregado={() => setVista('list')}
                />
            ) : vista === 'versus' ? (
```

6. Agregar el botón en la vista `list`, arriba de "Ver versus". Reemplazar el bloque `{codigoParticularCliente && (` … `)}` del final por:

```tsx
                    {!visitaCerrada && (
                        <Button
                            variant="outline"
                            onClick={() => setVista('agregar')}
                            className="mt-3.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            Agregar rubro
                        </Button>
                    )}

                    {codigoParticularCliente && (
                        <Button
                            variant="outline"
                            onClick={() => setVista('versus')}
                            className="mt-2.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            Ver versus
                        </Button>
                    )}
```

(El `mt-3.5` pasa al botón nuevo y "Ver versus" baja a `mt-2.5` para que los dos queden separados de forma pareja.)

El `useEffect` de cierre del sheet ya hace `setVista('list')`, así que la vista de alta no queda abierta al reabrir. No hace falta tocarlo.

- [ ] **Step 8: Correr y verificar que pasa**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS.

- [ ] **Step 9: Suite completa y build**

Run: `npm test` — Expected: PASS
Run: `npm run build` — Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add src/components/propuesta/AgregarRubroVista.tsx src/components/propuesta/AgregarRubroVista.test.tsx src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(propuesta): agregar rubros fuera de la propuesta desde la visita"
```

---

### Task 4: Marca elegida de catálogo en vez de texto libre

**Files:**
- Modify: `src/components/propuesta/ResolucionRubro.tsx`
- Modify: `src/components/propuesta/ResolucionRubro.test.tsx`
- Modify: `src/components/propuesta/ResolucionWizard.tsx`
- Modify: `src/components/propuesta/ResolucionWizard.test.tsx`

**Interfaces:**
- Consumes: `CatalogoPicker` (Task 2), `useBrandCatalog` (Task 1).
- Produces: `ResolucionRubro` pasa a requerir dos props nuevas — `marcas: ICatalogoItem[]` y `marcasLoading?: boolean`. `ResolucionWizard` mantiene su firma actual (pide el catálogo él mismo).

- [ ] **Step 1: Actualizar y escribir los tests de ResolucionRubro**

En `src/components/propuesta/ResolucionRubro.test.tsx`:

1. Agregar el import del tipo: `import type { ICatalogoItem, IMotivo, IRubroMotivo } from '@/types/planificacion'` (reemplaza el import de tipos actual).
2. Agregar el catálogo de prueba debajo de `motivos`:

```tsx
const marcas: ICatalogoItem[] = [
    { code: 'FR', description: 'Fric-Rot' },
    { code: 'FX', description: 'Fremax' },
]
```

3. Cambiar `setup` para pasar las props nuevas:

```tsx
function setup(value: IRubroMotivo[] = []) {
    const onChange = vi.fn()
    render(
        <ResolucionRubro
            motivos={motivos}
            marcas={marcas}
            value={value}
            onChange={onChange}
        />,
    )
    return { onChange }
}
```

4. **Reemplazar** el test `'el detalle se edita por motivo'` (que hoy escribe en el input libre de marca) por estos tres:

```tsx
it('la marca se elige del catálogo, no se escribe', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByLabelText(/marca/i))
    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
})

it('elegir una marca la guarda por su descripción', () => {
    const { onChange } = setup([
        { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
    ])
    fireEvent.click(screen.getByLabelText(/marca/i))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 13, marca: 'Fric-Rot', competidor: null, pctDiferencia: null },
    ])
})

// Es una marca de afuera: no está en fct_sales, así que no hay catálogo que ofrecer.
it('competidor sigue siendo texto libre', () => {
    const { onChange } = setup([
        { motivoId: 13, marca: null, competidor: null, pctDiferencia: null },
    ])
    fireEvent.change(screen.getByLabelText(/competidor/i), { target: { value: 'Corven' } })
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 13, marca: null, competidor: 'Corven', pctDiferencia: null },
    ])
})
```

El test `'el detalle aparece por requiereDetalle, no por el nombre del motivo'` se deja como está: el botón de marca lleva `aria-label="Marca"`, así que `getByLabelText(/marca/i)` lo sigue encontrando.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/propuesta/ResolucionRubro.test.tsx`
Expected: FAIL — `marcas` no es una prop y el campo Marca sigue siendo un `<input>`.

- [ ] **Step 3: Cambiar el campo Marca en ResolucionRubro**

En `src/components/propuesta/ResolucionRubro.tsx`:

1. Imports — reemplazar las dos primeras líneas por:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import type { ICatalogoItem, IMotivo, IRubroMotivo } from '@/types/planificacion'
```

2. Props — agregar al `interface ResolucionRubroProps`, después de `motivos`:

```tsx
    /** Catálogo de marcas. Restringir la elección es lo único que hace agregable la
     *  columna `marca`: con texto libre conviven "Fric Rot", "fricrot" y "FRIC-ROT". */
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
```

3. Firma — `export default function ResolucionRubro({ motivos, marcas, marcasLoading, value, onChange }: ResolucionRubroProps) {`

4. Estado del panel, arriba de `const porId = ...`:

```tsx
    // Qué motivo tiene abierto su selector de marca (null = ninguno).
    const [marcaAbierta, setMarcaAbierta] = useState<number | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Sin esto el teclado virtual tapa la lista justo cuando aparece.
    useEffect(() => {
        if (marcaAbierta !== null) {
            panelRef.current?.scrollIntoView({ block: 'nearest' })
        }
    }, [marcaAbierta])
```

5. Reemplazar el `<label>` de Marca (el bloque que hoy contiene el `<input>` con `placeholder="Ej. Fric-Rot"`) por:

```tsx
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Marca
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="Marca"
                                            onClick={() =>
                                                setMarcaAbierta(
                                                    marcaAbierta === cat.motivoId
                                                        ? null
                                                        : cat.motivoId,
                                                )
                                            }
                                            className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                                        >
                                            <span
                                                className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                                    seleccionado.marca
                                                        ? 'text-[#182645]'
                                                        : 'text-[#8A93A6]'
                                                }`}
                                            >
                                                {seleccionado.marca ?? 'Elegí una marca'}
                                            </span>
                                            {seleccionado.marca && (
                                                <Check
                                                    className="h-4 w-4 shrink-0 text-[#213D82]"
                                                    strokeWidth={3}
                                                />
                                            )}
                                            <ChevronDown
                                                className="h-4 w-4 shrink-0 text-dsmuted"
                                                strokeWidth={2.4}
                                            />
                                        </button>
                                        {marcaAbierta === cat.motivoId && (
                                            <div ref={panelRef} className="mt-1.5">
                                                <CatalogoPicker
                                                    items={marcas}
                                                    loading={marcasLoading}
                                                    value={seleccionado.marca}
                                                    onSelect={item => {
                                                        setDetalle(
                                                            cat.motivoId,
                                                            'marca',
                                                            item.description,
                                                        )
                                                        setMarcaAbierta(null)
                                                    }}
                                                    placeholder="Buscar marca…"
                                                    autoFocus
                                                />
                                            </div>
                                        )}
                                    </div>
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/components/propuesta/ResolucionRubro.test.tsx`
Expected: PASS.

- [ ] **Step 5: Escribir el test de ResolucionWizard**

En `src/components/propuesta/ResolucionWizard.test.tsx`, el componente ahora usa React Query, así que el render necesita provider.

1. Reemplazar las tres primeras líneas de import por:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import ResolucionWizard from './ResolucionWizard'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')
```

2. Reemplazar el `setup` existente por esta versión (envuelve en provider; el resto de las props no cambia):

```tsx
function setup(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onCambiarBorrador = vi.fn()
    const onVolver = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <ResolucionWizard
                rubros={rubros}
                index={0}
                motivos={motivos}
                borradores={{ 7: [], 8: [] }}
                onCambiarBorrador={onCambiarBorrador}
                onVolver={onVolver}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onCambiarBorrador, onVolver }
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.getBrandCatalog as any).mockResolvedValue([{ code: 'FR', description: 'Fric-Rot' }])
})
```

3. Agregar estos dos tests al final. El fixture ya sirve tal cual: `motivos` tiene el id 13 ("Precio") con `requiereDetalle: true`, y el borrador por defecto de `setup` está vacío.

```tsx
it('no pide el catálogo de marcas si ningún motivo tildado lo necesita', () => {
    setup()
    // Son vendedores en la calle: no se paga un catálogo de cientos de marcas hasta
    // que alguien tilda un motivo que pide detalle.
    expect(api.getBrandCatalog).not.toHaveBeenCalled()
})

it('pide el catálogo de marcas cuando hay tildado un motivo con detalle', async () => {
    setup({
        borradores: {
            7: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }],
            8: [],
        },
    })
    await waitFor(() => expect(api.getBrandCatalog).toHaveBeenCalled())
})
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `npx vitest run src/components/propuesta/ResolucionWizard.test.tsx`
Expected: FAIL. El primer test pasa por accidente (nadie pide el catálogo todavía); el que falla es "pide el catálogo de marcas cuando hay tildado un motivo con detalle", porque `ResolucionWizard` aún no llama a `useBrandCatalog`. Además el build de tipos falla: `ResolucionRubro` ya exige la prop `marcas` y el wizard no se la pasa.

- [ ] **Step 7: Que ResolucionWizard pida el catálogo**

En `src/components/propuesta/ResolucionWizard.tsx`:

1. Agregar el import: `import { useBrandCatalog } from '@/hooks/useCatalogos'`
2. Debajo de `const rubro = rubros[index]`:

```tsx
    // El catálogo de marcas se pide desde acá y no desde ResolucionRubro: el wizard es
    // el ancestro más cercano que ve a la vez el catálogo de motivos y el borrador, así
    // que puede pedirlo SOLO cuando hace falta — y deja a ResolucionRubro presentacional
    // puro, sin React Query en su test.
    const necesitaMarcas = (borradores[rubro.id] ?? []).some(
        m => motivos.find(cat => cat.motivoId === m.motivoId)?.requiereDetalle,
    )
    const { data: marcas = [], isLoading: marcasLoading } = useBrandCatalog(necesitaMarcas)
```

3. Pasar las props al `<ResolucionRubro>`:

```tsx
            <ResolucionRubro
                motivos={motivos}
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={borradores[rubro.id] ?? []}
                onChange={m => onCambiarBorrador(rubro.id, m)}
            />
```

- [ ] **Step 8: Correr y verificar que pasa**

Run: `npx vitest run src/components/propuesta/ResolucionWizard.test.tsx`
Expected: PASS.

- [ ] **Step 9: Suite completa y build**

Run: `npm test` — Expected: PASS. Si `VisitaSheet.test.tsx` rompe, es porque su `beforeEach` no mockea `getBrandCatalog`: agregar `;(api.getBrandCatalog as any).mockResolvedValue([])`.
Run: `npm run build` — Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add src/components/propuesta/ResolucionRubro.tsx src/components/propuesta/ResolucionRubro.test.tsx src/components/propuesta/ResolucionWizard.tsx src/components/propuesta/ResolucionWizard.test.tsx
git commit -m "feat(propuesta): elegir la marca de un catálogo en vez de escribirla"
```

---

## Verificación final

- [ ] `npm test` en verde
- [ ] `npm run build` sin errores
- [ ] `npm run lint` sin errores
- [ ] Prueba manual con `npm run dev`: iniciar una visita → "Agregar rubro" → buscar sin acentos → el rubro aparece pendiente en la lista → entrar al wizard → tildar "Precio" → elegir marca del selector → Finalizar.
