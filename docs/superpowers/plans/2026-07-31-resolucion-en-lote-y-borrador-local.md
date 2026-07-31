# Resolución en lote + borrador local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar de guardar contra el backend en cada paso del wizard de resolución de
rubros; en su lugar, todo lo que el vendedor tilda vive en un borrador local
(`localStorage`) que recién se manda completo al backend al tocar "Cerrar visita", y
agregar selección múltiple para aplicar una misma resolución a varios rubros a la vez.

**Architecture:** Un archivo nuevo (`src/lib/resolucionDraft.ts`) da lectura/escritura/
limpieza de un borrador por visita en `localStorage`, con el mismo patrón que ya usa
`src/lib/visitaTimer.ts`. `VisitaSheet` deja de tratar `borradores` como estado
efímero del wizard y pasa a tratarlo como la fuente de verdad de la resolución
mientras la visita está abierta: se inicializa desde el borrador persistido (o desde
los datos del servidor si no hay nada), se persiste en cada cambio, y solo se manda al
backend una vez, en un solo batch, al cerrar la visita. El wizard individual y una
vista nueva de "resolver en lote" (selección múltiple + un checklist compartido)
escriben sobre ese mismo borrador sin tocar la red.

**Tech Stack:** React 19 + TypeScript, React Query (`@tanstack/react-query`), Vitest +
Testing Library, Tailwind, `localStorage` nativo (sin librería de estado nueva).

## Global Constraints

- No se agrega ninguna librería nueva (ni Zustand, ni Redux, ni idb-keyval): la
  persistencia usa `localStorage.getItem/setItem` directo, igual que
  `src/lib/visitaTimer.ts`.
- Agregar/Eliminar rubro NO cambian: siguen guardando contra el backend al toque.
- Una visita cerrada es siempre de solo lectura — ya no puede cerrarse con rubros sin
  resolver, así que no hace falta el caso "cerrada pero con un pendiente para
  completar después" (se descarta explícitamente, no es un caso real hoy).
- Todo el texto visible va en español, en la línea del resto de la UI existente.
- Cada task termina con la suite completa en verde (`npx vitest run`) antes de pasar a
  la siguiente.

---

### Task 1: Borrador local en `localStorage`

**Files:**
- Create: `src/lib/resolucionDraft.ts`
- Test: `src/lib/resolucionDraft.test.ts`

**Interfaces:**
- Consumes: `IRubroMotivo` de `src/types/planificacion.ts` (ya existe).
- Produces: `leerBorrador(visitaId: number): Record<number, IRubroMotivo[]> | null`,
  `guardarBorrador(visitaId: number, borrador: Record<number, IRubroMotivo[]>): void`,
  `limpiarBorrador(visitaId: number): void`. Task 3 los consume tal cual.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/resolucionDraft.test.ts`:

```ts
import { leerBorrador, guardarBorrador, limpiarBorrador } from './resolucionDraft'

beforeEach(() => {
    localStorage.clear()
})

it('devuelve null si no hay borrador guardado', () => {
    expect(leerBorrador(42)).toBeNull()
})

it('guarda y relee un borrador', () => {
    const borrador = { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }] }
    guardarBorrador(42, borrador)
    expect(leerBorrador(42)).toEqual(borrador)
})

it('no mezcla borradores de visitas distintas', () => {
    guardarBorrador(42, { 7: [] })
    guardarBorrador(43, { 9: [] })
    expect(leerBorrador(42)).toEqual({ 7: [] })
    expect(leerBorrador(43)).toEqual({ 9: [] })
})

it('un JSON corrupto no rompe: devuelve null', () => {
    localStorage.setItem('visita-borrador-42', '{esto no es json')
    expect(leerBorrador(42)).toBeNull()
})

it('limpiarBorrador borra la entrada', () => {
    guardarBorrador(42, { 7: [] })
    limpiarBorrador(42)
    expect(leerBorrador(42)).toBeNull()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/resolucionDraft.test.ts`
Expected: FAIL — `resolucionDraft.ts` no existe.

- [ ] **Step 3: Implementar**

Crear `src/lib/resolucionDraft.ts`:

```ts
import type { IRubroMotivo } from '@/types/planificacion'

type Borrador = Record<number, IRubroMotivo[]>

function key(visitaId: number): string {
    return `visita-borrador-${visitaId}`
}

/** null si no hay borrador guardado, o si lo que hay no es JSON válido (dato
 *  corrupto o de una versión vieja): en ese caso se arranca en limpio desde los
 *  motivos que ya trae el servidor. */
export function leerBorrador(visitaId: number): Borrador | null {
    const raw = localStorage.getItem(key(visitaId))
    if (raw == null) return null
    try {
        return JSON.parse(raw) as Borrador
    } catch {
        return null
    }
}

export function guardarBorrador(visitaId: number, borrador: Borrador): void {
    localStorage.setItem(key(visitaId), JSON.stringify(borrador))
}

export function limpiarBorrador(visitaId: number): void {
    localStorage.removeItem(key(visitaId))
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/resolucionDraft.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolucionDraft.ts src/lib/resolucionDraft.test.ts
git commit -m "feat(planificacion): borrador local de resolución en localStorage"
```

---

### Task 2: Simplificar `ResolucionWizardAcciones` (sin guardado incremental)

**Files:**
- Modify: `src/components/propuesta/ResolucionWizardAcciones.tsx`
- Test: `src/components/propuesta/ResolucionWizardAcciones.test.tsx`

**Interfaces:**
- Consumes: `motivoIncompleto` de `src/lib/resolucionRubro.ts` (ya existe, sin
  cambios). Tipos `IMotivo`, `IRubroMotivo`, `IVisitaRubro` de
  `src/types/planificacion.ts` (ya existen).
- Produces: nueva forma de `ResolucionWizardAccionesProps`:
  `{ rubros: IVisitaRubro[]; index: number; motivos: IMotivo[]; borradores:
  Record<number, IRubroMotivo[]>; onIndexChange: (index: number) => void;
  onFinalizar: () => void }` — **sin** `guardados`, `fallidos` ni `guardando`. Task 3
  pasa exactamente estas props.

- [ ] **Step 1: Actualizar el test al comportamiento nuevo**

Reemplazar el contenido completo de
`src/components/propuesta/ResolucionWizardAcciones.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionWizardAcciones from './ResolucionWizardAcciones'
import type { IMotivo, IVisitaRubro } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

const rubros: IVisitaRubro[] = [
    {
        id: 7, resolucionId: 42, rubroCode: 'AMORT', rubroDescripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [],
    },
    {
        id: 8, resolucionId: 42, rubroCode: 'FILT', rubroDescripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: false, motivos: [],
    },
]

function setup(over: Record<string, unknown> = {}) {
    const onIndexChange = vi.fn()
    const onFinalizar = vi.fn()
    render(
        <ResolucionWizardAcciones
            rubros={rubros}
            index={0}
            motivos={motivos}
            borradores={{ 7: [], 8: [] }}
            onIndexChange={onIndexChange}
            onFinalizar={onFinalizar}
            {...over}
        />,
    )
    return { onIndexChange, onFinalizar }
}

it('en un rubro que no es el último, muestra Siguiente en vez de Finalizar', () => {
    setup()
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /finalizar/i })).not.toBeInTheDocument()
})

it('Atrás está deshabilitado en el primer rubro', () => {
    setup()
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled()
})

it('Siguiente avanza el índice', () => {
    const { onIndexChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(onIndexChange).toHaveBeenCalledWith(1)
})

it('Atrás retrocede el índice', () => {
    const { onIndexChange } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(onIndexChange).toHaveBeenCalledWith(0)
})

it('en el último rubro, muestra Finalizar en vez de Siguiente, habilitado sin nada bloqueante', () => {
    setup({ index: 1 })
    expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finalizar$/i })).toBeEnabled()
})

it('Finalizar dispara onFinalizar', () => {
    const { onFinalizar } = setup({ index: 1 })
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))
    expect(onFinalizar).toHaveBeenCalled()
})

it('con el detalle de Precio incompleto en cualquier rubro, avisa cuál falta y bloquea Finalizar', () => {
    setup({
        index: 1,
        borradores: { 7: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
    })
    expect(screen.getByText(/completá el detalle de precio en amortiguadores/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finalizar$/i })).toBeDisabled()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/propuesta/ResolucionWizardAcciones.test.tsx`
Expected: FAIL — el componente actual todavía exige `guardados`/`fallidos` (TypeScript
no bloquea en test por props de más, pero puede fallar si el componente lee
`guardados`/`fallidos` de `undefined`).

- [ ] **Step 3: Reescribir el componente**

Reemplazar el contenido completo de
`src/components/propuesta/ResolucionWizardAcciones.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motivoIncompleto } from '@/lib/resolucionRubro'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionWizardAccionesProps {
    rubros: IVisitaRubro[]
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por rubroId — la única fuente de verdad mientras la
     *  visita está abierta; no se guarda contra el backend hasta "Cerrar visita"
     *  (ver VisitaSheet.cerrarConBorrador). */
    borradores: Record<number, IRubroMotivo[]>
    onIndexChange: (index: number) => void
    /** Cierra el wizard y vuelve a la lista. El cambio ya vive en `borradores` (se
     *  actualiza en cada tilde vía onCambiarBorrador), así que acá no hay nada que
     *  guardar ni ningún estado de carga. */
    onFinalizar: () => void
}

/** Atrás / Siguiente-o-Finalizar. Se renderiza en el pie FIJO del sheet (fuera del área
 *  de scroll) para que siga a la vista aunque el detalle de un motivo (ej. Precio) empuje
 *  el contenido hacia abajo — si viviera en el scroll, expandir el detalle lo tapa. */
export default function ResolucionWizardAcciones({
    rubros,
    index,
    motivos,
    borradores,
    onIndexChange,
    onFinalizar,
}: ResolucionWizardAccionesProps) {
    const esUltimo = index === rubros.length - 1

    let bloqueado: IVisitaRubro | null = null
    let motivoBloqueante: IMotivo | null = null
    for (const r of rubros) {
        const m = motivoIncompleto(motivos, borradores[r.id] ?? [])
        if (m) {
            bloqueado = r
            motivoBloqueante = m
            break
        }
    }
    const bloqueadoIndex = bloqueado ? rubros.findIndex(r => r.id === bloqueado!.id) : -1

    return (
        <div>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => onIndexChange(index - 1)}
                    className="h-12 flex-1 text-[13.5px] font-bold"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    Atrás
                </Button>
                {esUltimo ? (
                    <Button
                        onClick={onFinalizar}
                        disabled={!!bloqueado}
                        className="h-12 flex-1 bg-dsgreen text-[13.5px] hover:bg-dsgreen/90"
                    >
                        Finalizar
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        onClick={() => onIndexChange(index + 1)}
                        className="h-12 flex-1 text-[13.5px] font-bold"
                    >
                        Siguiente
                        <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    </Button>
                )}
            </div>

            {bloqueado && motivoBloqueante && (
                <p className="mt-2 text-[12.5px] font-semibold text-[#B45309]">
                    Completá el detalle de {motivoBloqueante.descripcion} en {bloqueado.rubroDescripcion} (rubro{' '}
                    {bloqueadoIndex + 1} de {rubros.length}).
                </p>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/propuesta/ResolucionWizardAcciones.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/ResolucionWizardAcciones.tsx src/components/propuesta/ResolucionWizardAcciones.test.tsx
git commit -m "refactor(planificacion): ResolucionWizardAcciones sin guardado incremental"
```

---

### Task 3: `VisitaSheet` — el borrador como fuente de verdad, "Cerrar visita" como único guardado

**Files:**
- Modify: `src/components/VisitaSheet.tsx`
- Test: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `leerBorrador`, `guardarBorrador`, `limpiarBorrador` de
  `src/lib/resolucionDraft.ts` (Task 1). `ResolucionWizardAcciones` con la firma nueva
  de Task 2. `tieneDetalleIncompleto`, `motivosIguales` de
  `src/lib/resolucionRubro.ts` (ya existen, sin cambios). `useResolverRubros` de
  `src/hooks/useRubros.ts` (ya existe, sin cambios — sigue devolviendo
  `Promise<IResolverRubrosResultado[]>` con `{ rubroId, error }`).
- Produces: el estado `borradores: Record<number, IRubroMotivo[]>` y la función
  `esEditable(r) => !visitaCerrada` que Task 4 reutiliza tal cual para agregar
  selección múltiple sobre las mismas filas.

Esta task deja la lista de rubros SIN checkboxes todavía (eso es Task 4) — el cambio
acá es puramente de guardado: nada se manda al backend hasta cerrar la visita.

- [ ] **Step 1: Reescribir el test al comportamiento nuevo**

Reemplazar el contenido completo de `src/components/VisitaSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaSheet from './VisitaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

const motivos = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const rubros = [
    {
        id: 7, resolucionId: 42, rubroCode: 'AMORT', rubroDescripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [],
    },
    {
        id: 8, resolucionId: 42, rubroCode: 'FILT', rubroDescripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: true,
        motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
    },
]

function renderSheet(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onCerrarVisita = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <VisitaSheet
                open
                visitaId={42}
                nombreCliente="Almacén Don José"
                visitaCerrada={false}
                onCerrarVisita={onCerrarVisita}
                onClose={() => {}}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onCerrarVisita }
}

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    ;(api.getRubros as any).mockResolvedValue(rubros)
    ;(api.getMotivos as any).mockResolvedValue(motivos)
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 0 })
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600, mesAnterior: 800, promedio6m: 1000 },
    ])
    ;(api.getRubroCatalog as any).mockResolvedValue([
        { code: 'BAT', description: 'Baterías' },
    ])
    ;(api.agregarRubro as any).mockResolvedValue({ visitaRubroId: 99 })
})

it('lista los rubros de la propuesta congelada', async () => {
    renderSheet()
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('pide el catálogo de nivel rubro, no el completo', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(api.getMotivos).toHaveBeenCalledWith('rubro')
})

it('entrar a un rubro abre el wizard de resolución', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
})

it('finalizar cierra el wizard sin llamar al backend: el cambio queda en el borrador', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))

    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
    expect(api.resolverRubro).not.toHaveBeenCalled()
    expect(screen.getByText('1 motivo cargado')).toBeInTheDocument()
})

it('el wizard conserva lo tildado en un rubro al navegar a otro y volver', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Saqué pedido').closest('button')).toHaveClass('border-[#B9CCEC]')
})

it('el cambio tildado en el wizard se persiste en localStorage al instante', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))

    await waitFor(() => {
        const borrador = JSON.parse(localStorage.getItem('visita-borrador-42') ?? '{}')
        expect(borrador[7]).toEqual([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    })
})

it('un rubro de la propuesta no se puede borrar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
})

it('con la visita cerrada no ofrece cerrarla de nuevo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /cerrar visita/i })).not.toBeInTheDocument()
})

it('con la visita cerrada, ningún rubro se puede reabrir (es solo resumen, aunque haya quedado sin resolver)', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /motivo cargado/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^resolución$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Amortiguadores'))
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('con la visita cerrada, un rubro ya resuelto no ofrece borrarlo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
})

it('con rubros sin completar, Cerrar visita está deshabilitado y avisa cuántos faltan', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.getByText(/faltan completar 1 rubro para poder cerrar la visita/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeDisabled()
})

it('con todos los rubros completos, Cerrar visita guarda el borrador en un solo batch y dispara el cierre', async () => {
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    const cerrarBtn = await screen.findByRole('button', { name: /cerrar visita/i })
    expect(cerrarBtn).toBeEnabled()
    fireEvent.click(cerrarBtn)

    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
    // Filtros no cambió respecto de lo que ya traía el servidor: no se manda su PUT.
    expect(api.resolverRubro).toHaveBeenCalledTimes(1)
    expect(onCerrarVisita).toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).toBeNull()
})

it('si el batch de cierre falla, no limpia el borrador ni dispara el cierre', async () => {
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))

    expect(await screen.findByText(/no se pudo guardar la resolución de algunos rubros/i)).toBeInTheDocument()
    expect(onCerrarVisita).not.toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).not.toBeNull()
})

it('en curso muestra el eyebrow naranja con cronómetro y el botón de minimizar', async () => {
    const onMinimize = vi.fn()
    renderSheet({ enCurso: true, onMinimize })
    await screen.findByText('Amortiguadores')
    expect(screen.getByText(/en curso/i)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Minimizar'))
    expect(onMinimize).toHaveBeenCalled()
})

it('sin enCurso no ofrece minimizar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByLabelText('Minimizar')).not.toBeInTheDocument()
})

it('sin codigoParticularCliente no ofrece ver versus', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /ver versus/i })).not.toBeInTheDocument()
})

it('con codigoParticularCliente, ver versus pide el estado de rubros y muestra la tabla', async () => {
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    expect(api.getRubroStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /ver versus/i }))
    expect(await screen.findByText('Cómo viene comprando')).toBeInTheDocument()
    await waitFor(() => expect(api.getRubroStatus).toHaveBeenCalledWith('10034'))
    expect(await screen.findByText('1.000')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Volver'))
    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
})

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
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
})

it('el buscador no ofrece rubros que ya están en la visita', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: /agregar rubro/i }))
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByText('Amortiguadores')).not.toBeInTheDocument()
})

it('no ofrece agregar rubros cuando la visita ya está cerrada', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /agregar rubro/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: FAIL — varios casos nuevos (Cerrar visita deshabilitado, no llamar a
`resolverRubro` en Finalizar, persistencia en localStorage) todavía no existen en el
componente actual.

- [ ] **Step 3: Reescribir `VisitaSheet.tsx`**

Reemplazar el contenido completo de `src/components/VisitaSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Maximize2, Plus, Trash2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import AgregarRubroVista from './propuesta/AgregarRubroVista'
import ResolucionWizard from './propuesta/ResolucionWizard'
import ResolucionWizardAcciones from './propuesta/ResolucionWizardAcciones'
import VersusTable from './propuesta/VersusTable'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubros, useEliminarRubro } from '@/hooks/useRubros'
import { useRubroStatus } from '@/hooks/useRubroStatus'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { formatearDuracion } from '@/lib/visitaTimer'
import { motivosIguales, tieneDetalleIncompleto } from '@/lib/resolucionRubro'
import { leerBorrador, guardarBorrador, limpiarBorrador } from '@/lib/resolucionDraft'
import type { IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

type Vista = 'list' | 'versus' | 'agregar'

interface VisitaSheetProps {
    open: boolean
    visitaId: number
    nombreCliente: string
    /** true = se entró solo a completar rubros de una visita ya cerrada. */
    visitaCerrada: boolean
    /** true = la visita está en curso (no cerrada): pinta el eyebrow naranja + cronómetro. */
    enCurso?: boolean
    /** Si se pasa, habilita "Ver versus" (cómo viene comprando el cliente) durante la
     *  visita, igual que en la Propuesta previa. */
    codigoParticularCliente?: string
    onCerrarVisita: () => void
    onClose: () => void
    /** Si se pasa (y enCurso), aparece el botón de minimizar en el header. */
    onMinimize?: () => void
    cerrando?: boolean
}

export default function VisitaSheet({
    open,
    visitaId,
    nombreCliente,
    visitaCerrada,
    enCurso,
    codigoParticularCliente,
    onCerrarVisita,
    onClose,
    onMinimize,
    cerrando,
}: VisitaSheetProps) {
    const segundos = useVisitaTimer(visitaId)
    const { data: rubros = [], isSuccess: rubrosCargados } = useRubros(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('rubro')
    const resolverTodos = useResolverRubros(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [wizard, setWizard] = useState<{ rubros: IVisitaRubro[]; index: number } | null>(null)
    // Fuente de verdad de la resolución mientras la visita está abierta: se inicializa
    // desde localStorage (o desde `rubros` si no había nada) y se persiste en cada
    // cambio. No se manda al backend hasta "Cerrar visita" — ver cerrarConBorrador.
    const [borradores, setBorradores] = useState<Record<number, IRubroMotivo[]>>({})
    const [borradorListo, setBorradorListo] = useState(false)
    const [guardandoBorrador, setGuardandoBorrador] = useState(false)
    const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
    const [vista, setVista] = useState<Vista>('list')

    // Solo se pide cuando el vendedor la abre: TODOS los rubros del cliente
    // (Actual/M.Ant/Prom.6M), independiente de la propuesta/lista de caídas.
    const { data: rubroStatus = [], isLoading: rubroStatusLoading } = useRubroStatus(
        vista === 'versus' ? (codigoParticularCliente ?? null) : null,
    )

    useEffect(() => {
        if (!open) {
            setWizard(null)
            setBorradores({})
            setBorradorListo(false)
            setErrorGuardado(null)
            setVista('list')
        }
    }, [open])

    // Corre cada vez que `rubros` cambia (primera carga, o un refetch tras agregar/
    // eliminar). La primera vez (borradores todavía vacío) arranca desde localStorage;
    // las siguientes solo completan ids nuevos, sin pisar lo que el vendedor ya tildó
    // en memoria.
    useEffect(() => {
        if (!open || !rubrosCargados) return
        setBorradores(prev => {
            const base = Object.keys(prev).length > 0 ? prev : (leerBorrador(visitaId) ?? {})
            const next = { ...base }
            for (const r of rubros) if (!(r.id in next)) next[r.id] = r.motivos
            return next
        })
        setBorradorListo(true)
    }, [open, rubrosCargados, visitaId, rubros])

    // Recién después de inicializar (ver arriba): si esto corriera antes, un objeto
    // vacío pisaría un borrador ya guardado de una sesión anterior.
    useEffect(() => {
        if (!open || !borradorListo) return
        guardarBorrador(visitaId, borradores)
    }, [open, borradorListo, visitaId, borradores])

    // Una visita cerrada no se reedita (se genera una visita de ajuste aparte). Ya no
    // puede cerrarse con rubros sin cargar (ver cerrarConBorrador), así que no hace
    // falta el caso "cerrada pero con un rubro sin resolver todavía".
    function esEditable(_r: IVisitaRubro) {
        return !visitaCerrada
    }

    function abrirWizard(rubro: IVisitaRubro) {
        const subset = rubros.filter(esEditable)
        const index = subset.findIndex(r => r.id === rubro.id)
        setWizard({ rubros: subset, index })
    }

    // El wizard ya escribió todo en `borradores` en cada tilde (ver onCambiarBorrador
    // más abajo) — acá solo queda cerrar y volver a la lista.
    function finalizar() {
        setWizard(null)
    }

    function rubroCompleto(r: IVisitaRubro): boolean {
        const motivosDelRubro = borradores[r.id] ?? r.motivos
        return motivosDelRubro.length > 0 && !tieneDetalleIncompleto(motivos, motivosDelRubro)
    }

    const pendientes = rubros.filter(r => !rubroCompleto(r)).length

    // Único punto de guardado contra el backend: junta todo lo que cambió contra lo
    // que ya tiene el servidor, lo manda en un solo batch y, si sale bien, recién ahí
    // limpia el borrador y dispara el cierre real (geolocalización + endpoint), que
    // maneja el padre (VisitaFlow) vía onCerrarVisita.
    async function cerrarConBorrador() {
        setErrorGuardado(null)
        const cambios = rubros
            .filter(r => !motivosIguales(borradores[r.id] ?? [], r.motivos))
            .map(r => ({ rubroId: r.id, motivos: borradores[r.id] ?? [] }))

        if (cambios.length > 0) {
            setGuardandoBorrador(true)
            try {
                const resultados = await resolverTodos.mutateAsync(cambios)
                if (resultados.some(res => res.error)) {
                    setErrorGuardado(
                        'No se pudo guardar la resolución de algunos rubros. Volvé a intentar.',
                    )
                    return
                }
            } finally {
                setGuardandoBorrador(false)
            }
        }

        limpiarBorrador(visitaId)
        onCerrarVisita()
    }

    // El pie es fijo (fuera del scroll) tanto en list (Cerrar visita) como en el
    // wizard (Atrás/Siguiente-o-Finalizar): así no se oculta al expandir el detalle de
    // un motivo (ej. Precio), que empuja el contenido hacia abajo.
    const footer = wizard ? (
        <ResolucionWizardAcciones
            rubros={wizard.rubros}
            index={wizard.index}
            motivos={motivos}
            borradores={borradores}
            onIndexChange={index => setWizard(w => (w ? { ...w, index } : w))}
            onFinalizar={finalizar}
        />
    ) : vista === 'agregar' ? null : (
        <>
            {pendientes > 0 && (
                <p className="mb-2 text-center text-[12px] font-semibold text-[#B45309]">
                    Faltan completar {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} para
                    poder cerrar la visita.
                </p>
            )}
            {errorGuardado && (
                <p className="mb-2 text-center text-[12.5px] font-semibold text-dsred">
                    {errorGuardado}
                </p>
            )}
            {!visitaCerrada && (
                <Button
                    onClick={cerrarConBorrador}
                    disabled={pendientes > 0}
                    loading={cerrando || guardandoBorrador}
                    className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                >
                    {guardandoBorrador ? 'Guardando…' : cerrando ? 'Cerrando…' : 'Cerrar visita'}
                </Button>
            )}
        </>
    )

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            onMinimize={enCurso ? onMinimize : undefined}
            title={nombreCliente}
            eyebrow={enCurso ? `● En curso · ${formatearDuracion(segundos)}` : 'Propuesta comercial'}
            eyebrowClassName={enCurso ? 'text-[#B45309]' : undefined}
            footer={footer}
        >
            {wizard ? (
                <ResolucionWizard
                    rubros={wizard.rubros}
                    index={wizard.index}
                    motivos={motivos}
                    borradores={borradores}
                    onCambiarBorrador={(rubroId, m) => setBorradores(prev => ({ ...prev, [rubroId]: m }))}
                    onVolver={() => setWizard(null)}
                />
            ) : vista === 'agregar' ? (
                <AgregarRubroVista
                    visitaId={visitaId}
                    codesEnVisita={rubros.map(r => r.rubroCode)}
                    onVolver={() => setVista('list')}
                    onAgregado={() => setVista('list')}
                />
            ) : vista === 'versus' ? (
                <div>
                    <div className="mb-3.5 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label="Volver"
                            onClick={() => setVista('list')}
                            className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                        >
                            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                        </Button>
                        <span className="text-[13px] font-bold text-[#182645]">
                            Cómo viene comprando
                        </span>
                    </div>
                    {rubroStatusLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-dsmuted">
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                            Cargando…
                        </div>
                    ) : (
                        <VersusTable rubros={rubroStatus} />
                    )}
                </div>
            ) : (
                <div>
                    <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                        Cargá el resultado de cada rubro que ofreciste. Los que no ofreciste se
                        resuelven con <b className="font-bold text-[#182645]">“No lo ofrecí”</b>.
                    </p>

                    <div className="flex flex-col gap-2.5">
                        {rubros.map(r => {
                            const editable = esEditable(r)
                            return (
                                <div key={r.id} className="flex items-start gap-1.5">
                                    <div
                                        className={`min-w-0 flex-1 ${editable ? 'cursor-pointer' : ''}`}
                                        onClick={editable ? () => abrirWizard(r) : undefined}
                                    >
                                        <RubroCard
                                            nombre={r.rubroDescripcion}
                                            motivosCargados={(borradores[r.id] ?? r.motivos).length}
                                            onResolucion={editable ? () => abrirWizard(r) : undefined}
                                        />
                                    </div>
                                    {/* Los de la propuesta NO se borran (RUBRO_DE_PROPUESTA):
                                        si no se ofreció, se resuelve con "No lo ofrecí". */}
                                    {!r.esPropuesto && editable && (
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            aria-label={`Quitar ${r.rubroDescripcion}`}
                                            onClick={() => eliminar.mutate(r.id)}
                                            className="mt-1 h-9 w-9 shrink-0 border-[#E1E6F0] text-dsmuted"
                                        >
                                            <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                        {rubros.length === 0 && (
                            <div className="text-sm text-dsmuted">
                                Esta visita no tiene rubros propuestos.
                            </div>
                        )}
                    </div>

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
                </div>
            )}
        </BottomSheet>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 5: Correr la suite completa**

Run: `npx vitest run`
Expected: PASS — sin regresiones en otros archivos (`ResolucionWizard.test.tsx`,
`ResolucionRubro.test.tsx`, etc. no deberían verse afectados: sus props no cambiaron).

- [ ] **Step 6: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(planificacion): borrador local como fuente de verdad, Cerrar visita como único guardado"
```

---

### Task 4: Selección múltiple — checkboxes, barra de acciones y vista de resolución en lote

**Files:**
- Create: `src/components/propuesta/SeleccionBar.tsx`
- Create: `src/components/propuesta/SeleccionBar.test.tsx`
- Create: `src/components/propuesta/ResolverLoteVista.tsx`
- Create: `src/components/propuesta/ResolverLoteVista.test.tsx`
- Create: `src/components/propuesta/ResolverLoteAcciones.tsx`
- Create: `src/components/propuesta/ResolverLoteAcciones.test.tsx`
- Modify: `src/components/propuesta/RubroCard.tsx` (agrega `aria-label` al botón de
  Resolución — necesario para distinguir "tocar la card" de "tocar Resolución" en los
  tests, y es una mejora de accesibilidad genuina: hoy dos filas sin resolver tienen
  botones con el mismo nombre accesible "Resolución").
- Modify: `src/components/VisitaSheet.tsx`
- Modify: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `borradores`/`setBorradores`, `motivos`, `esEditable` de Task 3 (sin
  cambios de firma). `ResolucionRubro` (ya existe, sin cambios: `{ motivos, marcas,
  marcasLoading, value, onChange }`). `useBrandCatalog` de `src/hooks/useCatalogos.ts`
  (ya existe, sin cambios).
- Produces: nada que otra task consuma — es la última pieza del feature.

- [ ] **Step 1: Agregar `aria-label` a RubroCard (paso previo, sin test nuevo)**

En `src/components/propuesta/RubroCard.tsx`, el botón de Resolución pasa de:

```tsx
<Button
    variant="outline"
    size="sm"
    onClick={onResolucion}
    className={`mt-2 h-10 w-full text-[12.5px] font-bold ${
        resuelto
            ? 'border-[#BFE6CE] bg-[#F3FAF5] text-dsgreen'
            : 'border-[#D8DEEA] text-dsnavy'
    }`}
>
```

a:

```tsx
<Button
    variant="outline"
    size="sm"
    aria-label={`Resolución de ${nombre}`}
    onClick={onResolucion}
    className={`mt-2 h-10 w-full text-[12.5px] font-bold ${
        resuelto
            ? 'border-[#BFE6CE] bg-[#F3FAF5] text-dsgreen'
            : 'border-[#D8DEEA] text-dsnavy'
    }`}
>
```

(El texto visible del botón —"Resolución" o "N motivos cargados"— no cambia; solo se
agrega el nombre accesible.)

- [ ] **Step 2: Escribir el test de `SeleccionBar` (falla)**

Crear `src/components/propuesta/SeleccionBar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import SeleccionBar from './SeleccionBar'

it('muestra la cantidad seleccionada en singular', () => {
    render(<SeleccionBar cantidad={1} onCancelar={vi.fn()} onResolver={vi.fn()} />)
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument()
})

it('muestra la cantidad seleccionada en plural', () => {
    render(<SeleccionBar cantidad={3} onCancelar={vi.fn()} onResolver={vi.fn()} />)
    expect(screen.getByText('3 seleccionados')).toBeInTheDocument()
})

it('Cancelar dispara onCancelar', () => {
    const onCancelar = vi.fn()
    render(<SeleccionBar cantidad={2} onCancelar={onCancelar} onResolver={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onCancelar).toHaveBeenCalled()
})

it('Resolver seleccionados dispara onResolver', () => {
    const onResolver = vi.fn()
    render(<SeleccionBar cantidad={2} onCancelar={vi.fn()} onResolver={onResolver} />)
    fireEvent.click(screen.getByRole('button', { name: /resolver seleccionados/i }))
    expect(onResolver).toHaveBeenCalled()
})
```

Run: `npx vitest run src/components/propuesta/SeleccionBar.test.tsx`
Expected: FAIL — `SeleccionBar.tsx` no existe.

- [ ] **Step 3: Implementar `SeleccionBar`**

Crear `src/components/propuesta/SeleccionBar.tsx`:

```tsx
import { Button } from '@/components/ui/button'

interface SeleccionBarProps {
    cantidad: number
    onCancelar: () => void
    onResolver: () => void
}

/** Pie fijo del sheet mientras hay rubros seleccionados en la lista — reemplaza al pie
 *  normal (Cerrar visita), igual que el wizard reemplaza el suyo. */
export default function SeleccionBar({ cantidad, onCancelar, onResolver }: SeleccionBarProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="flex-1 text-[13px] font-bold text-[#182645]">
                {cantidad} {cantidad === 1 ? 'seleccionado' : 'seleccionados'}
            </span>
            <Button variant="outline" onClick={onCancelar} className="h-11 text-[13px] font-bold">
                Cancelar
            </Button>
            <Button onClick={onResolver} className="h-11 bg-dsnavy text-[13px] hover:bg-dsnavy/90">
                Resolver seleccionados
            </Button>
        </div>
    )
}
```

Run: `npx vitest run src/components/propuesta/SeleccionBar.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 4: Escribir el test de `ResolverLoteVista` (falla)**

Crear `src/components/propuesta/ResolverLoteVista.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolverLoteVista from './ResolverLoteVista'
import type { IMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
]

it('muestra cuántos rubros se van a resolver, en plural', () => {
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={3} value={[]} onChange={vi.fn()} onVolver={vi.fn()} />,
    )
    expect(screen.getByText('Resolver 3 rubros')).toBeInTheDocument()
})

it('en singular con un solo rubro', () => {
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={1} value={[]} onChange={vi.fn()} onVolver={vi.fn()} />,
    )
    expect(screen.getByText('Resolver 1 rubro')).toBeInTheDocument()
})

it('tildar un motivo dispara onChange con el borrador compartido', () => {
    const onChange = vi.fn()
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={2} value={[]} onChange={onChange} onVolver={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('Volver dispara onVolver', () => {
    const onVolver = vi.fn()
    render(
        <ResolverLoteVista motivos={motivos} marcas={[]} cantidad={2} value={[]} onChange={vi.fn()} onVolver={onVolver} />,
    )
    fireEvent.click(screen.getByLabelText('Volver'))
    expect(onVolver).toHaveBeenCalled()
})
```

Run: `npx vitest run src/components/propuesta/ResolverLoteVista.test.tsx`
Expected: FAIL — `ResolverLoteVista.tsx` no existe.

- [ ] **Step 5: Implementar `ResolverLoteVista`**

Crear `src/components/propuesta/ResolverLoteVista.tsx`:

```tsx
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionRubro from './ResolucionRubro'
import type { ICatalogoItem, IMotivo, IRubroMotivo } from '@/types/planificacion'

interface ResolverLoteVistaProps {
    motivos: IMotivo[]
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    cantidad: number
    /** Borrador ÚNICO compartido por todos los rubros seleccionados — no uno por
     *  rubro, a diferencia del wizard individual. */
    value: IRubroMotivo[]
    onChange: (motivos: IRubroMotivo[]) => void
    onVolver: () => void
}

/** Mismo checklist que el wizard individual (ResolucionRubro), pero con un solo
 *  borrador compartido: lo que se tilde acá se fusiona en los N rubros seleccionados
 *  al confirmar (ver VisitaSheet.aplicarLote). */
export default function ResolverLoteVista({
    motivos,
    marcas,
    marcasLoading,
    cantidad,
    value,
    onChange,
    onVolver,
}: ResolverLoteVistaProps) {
    return (
        <div>
            <div className="sticky top-0 z-10 -mx-[18px] mb-3 flex items-center gap-2 border-b border-[#EEF0F5] bg-white px-[18px] pb-2.5">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onVolver}
                    aria-label="Volver"
                    className="h-[29px] w-[29px] shrink-0 border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#182645]">
                    Resolver {cantidad} {cantidad === 1 ? 'rubro' : 'rubros'}
                </span>
            </div>

            <ResolucionRubro
                motivos={motivos}
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={value}
                onChange={onChange}
            />
        </div>
    )
}
```

Run: `npx vitest run src/components/propuesta/ResolverLoteVista.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Escribir el test de `ResolverLoteAcciones` (falla)**

Crear `src/components/propuesta/ResolverLoteAcciones.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolverLoteAcciones from './ResolverLoteAcciones'
import type { IMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

it('sin motivos tildados, Aplicar queda deshabilitado', () => {
    render(<ResolverLoteAcciones motivos={motivos} value={[]} cantidad={3} onCancelar={vi.fn()} onAplicar={vi.fn()} />)
    expect(screen.getByRole('button', { name: /aplicar a 3 rubros/i })).toBeDisabled()
})

it('con un motivo simple tildado, Aplicar se habilita', () => {
    render(
        <ResolverLoteAcciones
            motivos={motivos}
            value={[{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]}
            cantidad={3}
            onCancelar={vi.fn()}
            onAplicar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /aplicar a 3 rubros/i })).toBeEnabled()
})

it('con Precio tildado sin detalle, Aplicar queda deshabilitado y avisa', () => {
    render(
        <ResolverLoteAcciones
            motivos={motivos}
            value={[{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }]}
            cantidad={2}
            onCancelar={vi.fn()}
            onAplicar={vi.fn()}
        />,
    )
    expect(screen.getByRole('button', { name: /aplicar a 2 rubros/i })).toBeDisabled()
    expect(screen.getByText(/completá el detalle de precio/i)).toBeInTheDocument()
})

it('Aplicar dispara onAplicar', () => {
    const onAplicar = vi.fn()
    render(
        <ResolverLoteAcciones
            motivos={motivos}
            value={[{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]}
            cantidad={1}
            onCancelar={vi.fn()}
            onAplicar={onAplicar}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /aplicar a 1 rubro/i }))
    expect(onAplicar).toHaveBeenCalled()
})

it('Cancelar dispara onCancelar', () => {
    const onCancelar = vi.fn()
    render(<ResolverLoteAcciones motivos={motivos} value={[]} cantidad={1} onCancelar={onCancelar} onAplicar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onCancelar).toHaveBeenCalled()
})
```

Run: `npx vitest run src/components/propuesta/ResolverLoteAcciones.test.tsx`
Expected: FAIL — `ResolverLoteAcciones.tsx` no existe.

- [ ] **Step 7: Implementar `ResolverLoteAcciones`**

Crear `src/components/propuesta/ResolverLoteAcciones.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { motivoIncompleto } from '@/lib/resolucionRubro'
import type { IMotivo, IRubroMotivo } from '@/types/planificacion'

interface ResolverLoteAccionesProps {
    motivos: IMotivo[]
    value: IRubroMotivo[]
    cantidad: number
    onCancelar: () => void
    onAplicar: () => void
}

/** Pie fijo de ResolverLoteVista: Cancelar / Aplicar a N rubros. Bloquea Aplicar si
 *  no hay nada tildado, o si "Precio" está tildado sin marca/competidor/% —
 *  misma regla que ya usa el wizard individual. */
export default function ResolverLoteAcciones({
    motivos,
    value,
    cantidad,
    onCancelar,
    onAplicar,
}: ResolverLoteAccionesProps) {
    const bloqueante = motivoIncompleto(motivos, value)

    return (
        <div>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onCancelar} className="h-12 flex-1 text-[13.5px] font-bold">
                    Cancelar
                </Button>
                <Button
                    onClick={onAplicar}
                    disabled={!!bloqueante || value.length === 0}
                    className="h-12 flex-1 bg-dsgreen text-[13.5px] hover:bg-dsgreen/90"
                >
                    Aplicar a {cantidad} {cantidad === 1 ? 'rubro' : 'rubros'}
                </Button>
            </div>

            {bloqueante && (
                <p className="mt-2 text-[12.5px] font-semibold text-[#B45309]">
                    Completá el detalle de {bloqueante.descripcion} antes de aplicar.
                </p>
            )}
        </div>
    )
}
```

Run: `npx vitest run src/components/propuesta/ResolverLoteAcciones.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 8: Actualizar `VisitaSheet.test.tsx` al comportamiento nuevo**

Reemplazar el contenido completo de `src/components/VisitaSheet.test.tsx` (agrega el
fixture `getBrandCatalog`, cambia los clicks que abrían el wizard tocando el texto del
rubro por el botón "Resolución de <nombre>" —porque ahora tocar la card selecciona—, y
suma los tests de selección múltiple):

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import VisitaSheet from './VisitaSheet'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

const motivos = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const rubros = [
    {
        id: 7, resolucionId: 42, rubroCode: 'AMORT', rubroDescripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [],
    },
    {
        id: 8, resolucionId: 42, rubroCode: 'FILT', rubroDescripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: true,
        motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
    },
]

function renderSheet(over: Record<string, unknown> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onCerrarVisita = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <VisitaSheet
                open
                visitaId={42}
                nombreCliente="Almacén Don José"
                visitaCerrada={false}
                onCerrarVisita={onCerrarVisita}
                onClose={() => {}}
                {...over}
            />
        </QueryClientProvider>,
    )
    return { onCerrarVisita }
}

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    ;(api.getRubros as any).mockResolvedValue(rubros)
    ;(api.getMotivos as any).mockResolvedValue(motivos)
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 0 })
    ;(api.getRubroStatus as any).mockResolvedValue([
        { rubroCode: 'AMORT', nombre: 'Amortiguadores', actual: 600, mesAnterior: 800, promedio6m: 1000 },
    ])
    ;(api.getRubroCatalog as any).mockResolvedValue([
        { code: 'BAT', description: 'Baterías' },
    ])
    ;(api.agregarRubro as any).mockResolvedValue({ visitaRubroId: 99 })
    ;(api.getBrandCatalog as any).mockResolvedValue([{ code: 'FR', description: 'Fric-Rot' }])
})

it('lista los rubros de la propuesta congelada', async () => {
    renderSheet()
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('pide el catálogo de nivel rubro, no el completo', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(api.getMotivos).toHaveBeenCalledWith('rubro')
})

it('el botón Resolución abre el wizard de resolución', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
})

it('finalizar cierra el wizard sin llamar al backend: el cambio queda en el borrador', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^finalizar$/i }))

    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
    expect(api.resolverRubro).not.toHaveBeenCalled()
    expect(screen.getByText('1 motivo cargado')).toBeInTheDocument()
})

it('el wizard conserva lo tildado en un rubro al navegar a otro y volver', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Saqué pedido').closest('button')).toHaveClass('border-[#B9CCEC]')
})

it('el cambio tildado en el wizard se persiste en localStorage al instante', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))

    await waitFor(() => {
        const borrador = JSON.parse(localStorage.getItem('visita-borrador-42') ?? '{}')
        expect(borrador[7]).toEqual([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    })
})

it('un rubro de la propuesta no se puede borrar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
})

it('con la visita cerrada no ofrece cerrarla de nuevo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /cerrar visita/i })).not.toBeInTheDocument()
})

it('con la visita cerrada, ningún rubro se puede reabrir ni seleccionar (es solo resumen)', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /resolución de/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /seleccionar/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Amortiguadores'))
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
    expect(screen.getByText('Filtros')).toBeInTheDocument()
})

it('con la visita cerrada, un rubro ya resuelto no ofrece borrarlo', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Filtros')
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
})

it('con rubros sin completar, Cerrar visita está deshabilitado y avisa cuántos faltan', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.getByText(/faltan completar 1 rubro para poder cerrar la visita/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeDisabled()
})

it('con todos los rubros completos, Cerrar visita guarda el borrador en un solo batch y dispara el cierre', async () => {
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    const cerrarBtn = await screen.findByRole('button', { name: /cerrar visita/i })
    expect(cerrarBtn).toBeEnabled()
    fireEvent.click(cerrarBtn)

    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
    expect(api.resolverRubro).toHaveBeenCalledTimes(1)
    expect(onCerrarVisita).toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).toBeNull()
})

it('si el batch de cierre falla, no limpia el borrador ni dispara el cierre', async () => {
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))

    expect(await screen.findByText(/no se pudo guardar la resolución de algunos rubros/i)).toBeInTheDocument()
    expect(onCerrarVisita).not.toHaveBeenCalled()
    expect(localStorage.getItem('visita-borrador-42')).not.toBeNull()
})

it('tocar la card de un rubro (fuera del botón Resolución) lo selecciona, no abre el wizard', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(screen.queryByText('1 de 2')).not.toBeInTheDocument()
    expect(await screen.findByText('1 seleccionado')).toBeInTheDocument()
})

it('seleccionar varios rubros muestra la barra con la cantidad correcta', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(screen.getByText('Filtros'))
    expect(await screen.findByText('2 seleccionados')).toBeInTheDocument()
})

it('Cancelar en la barra de selección limpia la selección y vuelve a mostrar Cerrar visita', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByRole('button', { name: /^cancelar$/i }))
    expect(screen.queryByText('1 seleccionado')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cerrar visita/i })).toBeInTheDocument()
})

it('Resolver seleccionados fusiona el motivo en el borrador de cada rubro elegido', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(screen.getByText('Filtros'))
    fireEvent.click(await screen.findByRole('button', { name: /resolver seleccionados/i }))

    expect(await screen.findByText('Resolver 2 rubros')).toBeInTheDocument()
    fireEvent.click(screen.getByText('No lo ofrecí'))
    fireEvent.click(screen.getByRole('button', { name: /aplicar a 2 rubros/i }))

    await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })
    expect(api.resolverRubro).not.toHaveBeenCalled()

    const borrador = JSON.parse(localStorage.getItem('visita-borrador-42') ?? '{}')
    // Amortiguadores no tenía nada: queda solo con "No lo ofrecí".
    expect(borrador[7]).toEqual([{ motivoId: 16, marca: null, competidor: null, pctDiferencia: null }])
    // Filtros ya tenía "Saqué pedido": el lote lo suma, no lo reemplaza.
    expect(borrador[8]).toEqual(
        expect.arrayContaining([
            { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
            { motivoId: 16, marca: null, competidor: null, pctDiferencia: null },
        ]),
    )
})

it('en curso muestra el eyebrow naranja con cronómetro y el botón de minimizar', async () => {
    const onMinimize = vi.fn()
    renderSheet({ enCurso: true, onMinimize })
    await screen.findByText('Amortiguadores')
    expect(screen.getByText(/en curso/i)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Minimizar'))
    expect(onMinimize).toHaveBeenCalled()
})

it('sin enCurso no ofrece minimizar', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByLabelText('Minimizar')).not.toBeInTheDocument()
})

it('sin codigoParticularCliente no ofrece ver versus', async () => {
    renderSheet()
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /ver versus/i })).not.toBeInTheDocument()
})

it('con codigoParticularCliente, ver versus pide el estado de rubros y muestra la tabla', async () => {
    renderSheet({ codigoParticularCliente: '10034' })
    await screen.findByText('Amortiguadores')
    expect(api.getRubroStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /ver versus/i }))
    expect(await screen.findByText('Cómo viene comprando')).toBeInTheDocument()
    await waitFor(() => expect(api.getRubroStatus).toHaveBeenCalledWith('10034'))
    expect(await screen.findByText('1.000')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Volver'))
    expect(await screen.findByText('Cargá el resultado de cada rubro que ofreciste.', { exact: false })).toBeInTheDocument()
})

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
    expect(await screen.findByText('Amortiguadores')).toBeInTheDocument()
})

it('el buscador no ofrece rubros que ya están en la visita', async () => {
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: /agregar rubro/i }))
    expect(await screen.findByText('Baterías')).toBeInTheDocument()
    expect(screen.queryByText('Amortiguadores')).not.toBeInTheDocument()
})

it('no ofrece agregar rubros cuando la visita ya está cerrada', async () => {
    renderSheet({ visitaCerrada: true })
    await screen.findByText('Amortiguadores')
    expect(screen.queryByRole('button', { name: /agregar rubro/i })).not.toBeInTheDocument()
})
```

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: FAIL — la selección múltiple todavía no existe en el componente.

- [ ] **Step 9: Wirear selección múltiple en `VisitaSheet.tsx`**

Agregar el import de `Check` (junto a los demás iconos de lucide-react), los tres
componentes nuevos, y `useBrandCatalog`:

```tsx
import { Check, ChevronLeft, Loader2, Maximize2, Plus, Trash2 } from 'lucide-react'
```

```tsx
import SeleccionBar from './propuesta/SeleccionBar'
import ResolverLoteVista from './propuesta/ResolverLoteVista'
import ResolverLoteAcciones from './propuesta/ResolverLoteAcciones'
import { useBrandCatalog } from '@/hooks/useCatalogos'
```

Cambiar el tipo `Vista`:

```tsx
type Vista = 'list' | 'versus' | 'agregar' | 'resolverLote'
```

Agregar estado nuevo (junto a los del Task 3):

```tsx
const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
const [loteMotivos, setLoteMotivos] = useState<IRubroMotivo[]>([])
```

En el efecto de reset al cerrar, sumar la limpieza de este estado:

```tsx
useEffect(() => {
    if (!open) {
        setWizard(null)
        setBorradores({})
        setBorradorListo(false)
        setErrorGuardado(null)
        setVista('list')
        setSeleccionados(new Set())
        setLoteMotivos([])
    }
}, [open])
```

Agregar la función de toggle y la de aplicar en lote (junto a `abrirWizard`/`finalizar`):

```tsx
function toggleSeleccion(rubroId: number) {
    setSeleccionados(prev => {
        const next = new Set(prev)
        if (next.has(rubroId)) next.delete(rubroId)
        else next.add(rubroId)
        return next
    })
}

// Fusiona (por motivoId) el borrador compartido del lote en cada rubro seleccionado,
// sin pisar los motivos que ya tuviera cargados. Igual que el wizard individual, no
// llama al backend: el cambio queda en `borradores` (y por lo tanto en localStorage).
function aplicarLote() {
    setBorradores(prev => {
        const next = { ...prev }
        for (const rubroId of seleccionados) {
            const actual = next[rubroId] ?? []
            const porId = new Map(actual.map(m => [m.motivoId, m]))
            for (const m of loteMotivos) porId.set(m.motivoId, m)
            next[rubroId] = [...porId.values()]
        }
        return next
    })
    setSeleccionados(new Set())
    setLoteMotivos([])
    setVista('list')
}
```

Agregar, junto a la carga de `motivos`, el catálogo de marcas para el lote (mismo
patrón que ya usa `ResolucionWizard.tsx`: solo se pide si algún motivo tildado en el
borrador compartido lo necesita):

```tsx
const necesitaMarcasLote = loteMotivos.some(
    m => motivos.find(cat => cat.motivoId === m.motivoId)?.requiereDetalle,
)
const { data: marcasLote = [], isLoading: marcasLoteLoading } = useBrandCatalog(
    vista === 'resolverLote' && necesitaMarcasLote,
)
```

Cambiar el `footer` para que contemple `resolverLote` y la barra de selección:

```tsx
const footer = wizard ? (
    <ResolucionWizardAcciones
        rubros={wizard.rubros}
        index={wizard.index}
        motivos={motivos}
        borradores={borradores}
        onIndexChange={index => setWizard(w => (w ? { ...w, index } : w))}
        onFinalizar={finalizar}
    />
) : vista === 'agregar' ? null : vista === 'resolverLote' ? (
    <ResolverLoteAcciones
        motivos={motivos}
        value={loteMotivos}
        cantidad={seleccionados.size}
        onCancelar={() => {
            setVista('list')
            setLoteMotivos([])
        }}
        onAplicar={aplicarLote}
    />
) : seleccionados.size > 0 ? (
    <SeleccionBar
        cantidad={seleccionados.size}
        onCancelar={() => setSeleccionados(new Set())}
        onResolver={() => setVista('resolverLote')}
    />
) : (
    <>
        {pendientes > 0 && (
            <p className="mb-2 text-center text-[12px] font-semibold text-[#B45309]">
                Faltan completar {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} para
                poder cerrar la visita.
            </p>
        )}
        {errorGuardado && (
            <p className="mb-2 text-center text-[12.5px] font-semibold text-dsred">
                {errorGuardado}
            </p>
        )}
        {!visitaCerrada && (
            <Button
                onClick={cerrarConBorrador}
                disabled={pendientes > 0}
                loading={cerrando || guardandoBorrador}
                className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
            >
                {guardandoBorrador ? 'Guardando…' : cerrando ? 'Cerrando…' : 'Cerrar visita'}
            </Button>
        )}
    </>
)
```

Agregar la rama de contenido para `resolverLote`, antes de la rama `agregar`:

```tsx
) : vista === 'resolverLote' ? (
    <ResolverLoteVista
        motivos={motivos}
        marcas={marcasLote}
        marcasLoading={marcasLoteLoading}
        cantidad={seleccionados.size}
        value={loteMotivos}
        onChange={setLoteMotivos}
        onVolver={() => {
            setVista('list')
            setLoteMotivos([])
        }}
    />
) : vista === 'agregar' ? (
```

Y por último, cambiar el renderizado de cada fila de la lista para agregar el checkbox
y hacer que tocar la card seleccione en vez de abrir el wizard:

```tsx
{rubros.map(r => {
    const editable = esEditable(r)
    const marcado = seleccionados.has(r.id)
    return (
        <div key={r.id} className="flex items-start gap-1.5">
            {editable && (
                <button
                    type="button"
                    aria-label={`Seleccionar ${r.rubroDescripcion}`}
                    onClick={() => toggleSeleccion(r.id)}
                    className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg border-[1.5px]"
                    style={{
                        borderColor: marcado ? '#213D82' : '#CBD2E0',
                        background: marcado ? '#213D82' : '#fff',
                        color: marcado ? '#fff' : 'transparent',
                    }}
                >
                    <Check className="h-[15px] w-[15px]" strokeWidth={3} />
                </button>
            )}
            <div
                className={`min-w-0 flex-1 ${editable ? 'cursor-pointer' : ''}`}
                onClick={editable ? () => toggleSeleccion(r.id) : undefined}
            >
                <RubroCard
                    nombre={r.rubroDescripcion}
                    motivosCargados={(borradores[r.id] ?? r.motivos).length}
                    onResolucion={editable ? () => abrirWizard(r) : undefined}
                />
            </div>
            {!r.esPropuesto && editable && (
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Quitar ${r.rubroDescripcion}`}
                    onClick={() => eliminar.mutate(r.id)}
                    className="mt-1 h-9 w-9 shrink-0 border-[#E1E6F0] text-dsmuted"
                >
                    <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                </Button>
            )}
        </div>
    )
})}
```

- [ ] **Step 10: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 11: Correr la suite completa, build y lint**

Run: `npx vitest run`
Expected: PASS, 0 failures

Run: `npm run build`
Expected: build limpio (puede quedar el warning preexistente de chunk size, no
relacionado)

Run: `npm run lint`
Expected: sin warnings nuevos (puede quedar el warning preexistente de
`AuthContext.tsx`)

- [ ] **Step 12: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx \
        src/components/propuesta/RubroCard.tsx \
        src/components/propuesta/SeleccionBar.tsx src/components/propuesta/SeleccionBar.test.tsx \
        src/components/propuesta/ResolverLoteVista.tsx src/components/propuesta/ResolverLoteVista.test.tsx \
        src/components/propuesta/ResolverLoteAcciones.tsx src/components/propuesta/ResolverLoteAcciones.test.tsx
git commit -m "feat(planificacion): selección múltiple de rubros para resolver en lote"
```

---

## Verificación final

Tras completar las 4 tasks:

1. `npx vitest run` — suite completa en verde.
2. `npm run build` — sin errores.
3. `npm run lint` — sin warnings nuevos.
4. Manual (`npm run dev`, requiere backend corriendo): abrir una visita, tildar un
   motivo simple en un rubro, cerrar y reabrir la app (o refrescar) sin tocar "Cerrar
   visita" — el tilde debe seguir ahí. Seleccionar 2+ rubros desde la lista, aplicar
   "Saqué pedido" en lote, confirmar que ambos se pintan como resueltos sin haber
   llamado a la red todavía (Network tab). Completar todo y tocar "Cerrar visita":
   recién ahí deben verse los `PUT` de resolución seguidos del cierre real.
