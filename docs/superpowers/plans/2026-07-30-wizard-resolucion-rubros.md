# Wizard de resolución de rubros (guardado diferido) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo "un rubro a la vez con guardado inmediato" de `VisitaSheet.tsx` /
`ResolucionRubro.tsx` por un wizard con navegación Atrás/Siguiente entre rubros y un solo guardado
en lote (`Guardar todo`), sin tocar el backend ni el catálogo de motivos.

**Architecture:** `ResolucionRubro.tsx` se reduce a contenido puro (checklist de motivos + detalle
de Precio, sin header ni botón propio). Un componente nuevo, `ResolucionWizard.tsx`, aporta el
chrome de navegación (contador de posición, Atrás/Siguiente, Guardar todo, avisos de bloqueo/
fallo) y es 100% controlado por props. `VisitaSheet.tsx` es el único que tiene estado: qué
subconjunto de rubros se está recorriendo, los borradores en memoria, la última versión persistida
por rubro (para saber qué cambió) y los que fallaron al guardar. El guardado en lote usa un hook
nuevo, `useResolverRubros`, que dispara un `PUT /planificacion/visitas/:id/rubros/:rubroId` por
rubro con cambios, en paralelo vía `Promise.allSettled` (un fallo no cancela a los demás).

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, TanStack Query, Tailwind.

## Global Constraints

- No se toca el backend: sigue siendo un `PUT` por rubro, solo cambia cuándo se dispara.
- No se toca `IRubroMotivo`, `IMotivo`, ni el catálogo de motivos.
- No se toca `ResolucionSheet.tsx` (flujo de "No visité", sin relación con esto).
- Estilo del repo: 4 espacios de indentación, comillas simples, sin punto y coma final solo donde
  el archivo ya lo omite (seguir el archivo que se edita).
- Todo string visible al vendedor va en español, con el mismo tono que el resto de la app.

---

### Task 1: Helpers puros de resolución de rubro

**Files:**
- Create: `src/lib/resolucionRubro.ts`
- Test: `src/lib/resolucionRubro.test.ts`

**Interfaces:**
- Produces: `detalleCompleto(m: IRubroMotivo): boolean`, `motivoIncompleto(motivos: IMotivo[], value: IRubroMotivo[]): IMotivo | null`, `tieneDetalleIncompleto(motivos: IMotivo[], value: IRubroMotivo[]): boolean`, `motivosIguales(a: IRubroMotivo[], b: IRubroMotivo[]): boolean` — usados por `ResolucionWizard.tsx` (Task 4) y `VisitaSheet.tsx` (Task 5).

- [ ] **Step 1: Escribir el test (falla: el módulo no existe todavía)**

`src/lib/resolucionRubro.test.ts`:

```ts
import { detalleCompleto, motivoIncompleto, tieneDetalleIncompleto, motivosIguales } from './resolucionRubro'
import type { IMotivo, IRubroMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
]

it('detalleCompleto es falso si falta cualquier campo', () => {
    expect(detalleCompleto({ motivoId: 13, marca: null, competidor: null, pctDiferencia: null })).toBe(false)
    expect(detalleCompleto({ motivoId: 13, marca: 'Fric-Rot', competidor: null, pctDiferencia: null })).toBe(false)
})

it('detalleCompleto es true con los tres campos cargados', () => {
    expect(detalleCompleto({ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 })).toBe(true)
})

it('motivoIncompleto devuelve null si no hay ningún motivo con requiereDetalle tildado', () => {
    const value: IRubroMotivo[] = [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]
    expect(motivoIncompleto(motivos, value)).toBeNull()
})

it('motivoIncompleto devuelve el motivo si Precio está tildado sin el detalle completo', () => {
    const value: IRubroMotivo[] = [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }]
    expect(motivoIncompleto(motivos, value)?.descripcion).toBe('Precio')
})

it('motivoIncompleto devuelve null si Precio está tildado con el detalle completo', () => {
    const value: IRubroMotivo[] = [{ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 }]
    expect(motivoIncompleto(motivos, value)).toBeNull()
})

it('tieneDetalleIncompleto refleja motivoIncompleto como booleano', () => {
    expect(tieneDetalleIncompleto(motivos, [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])).toBe(true)
    expect(tieneDetalleIncompleto(motivos, [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])).toBe(false)
})

it('motivosIguales es true para dos listas vacías', () => {
    expect(motivosIguales([], [])).toBe(true)
})

it('motivosIguales es false si difiere la cantidad', () => {
    const a: IRubroMotivo[] = [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }]
    expect(motivosIguales(a, [])).toBe(false)
})

it('motivosIguales es true sin importar el orden', () => {
    const a: IRubroMotivo[] = [
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
        { motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 },
    ]
    const b: IRubroMotivo[] = [
        { motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 },
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ]
    expect(motivosIguales(a, b)).toBe(true)
})

it('motivosIguales es false si cambió un campo de detalle', () => {
    const a: IRubroMotivo[] = [{ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 12 }]
    const b: IRubroMotivo[] = [{ motivoId: 13, marca: 'Fric-Rot', competidor: 'Corven', pctDiferencia: 15 }]
    expect(motivosIguales(a, b)).toBe(false)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/resolucionRubro.test.ts`
Expected: FAIL — no se puede resolver el módulo `./resolucionRubro`.

- [ ] **Step 3: Implementar**

`src/lib/resolucionRubro.ts`:

```ts
import type { IMotivo, IRubroMotivo } from '@/types/planificacion'

/** Un motivo con requiereDetalle exige los tres campos; el backend valida lo mismo
 *  (MOTIVO_DETALLE_REQUERIDO) — acá se previene para no gastar un viaje. */
export function detalleCompleto(m: IRubroMotivo): boolean {
    return !!m.marca?.trim() && !!m.competidor?.trim() && m.pctDiferencia !== null
}

/** El motivo con requiereDetalle que está tildado sin el detalle completo, o null si no
 *  hay ninguno. Se usa para señalar CUÁL motivo falta completar, no solo que falta algo. */
export function motivoIncompleto(motivos: IMotivo[], value: IRubroMotivo[]): IMotivo | null {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    return (
        motivos.find(
            cat => cat.requiereDetalle && porId.has(cat.motivoId) && !detalleCompleto(porId.get(cat.motivoId)!),
        ) ?? null
    )
}

export function tieneDetalleIncompleto(motivos: IMotivo[], value: IRubroMotivo[]): boolean {
    return motivoIncompleto(motivos, value) !== null
}

/** Compara dos listas de IRubroMotivo por contenido, sin importar el orden. La usa el
 *  wizard para saber si un rubro tiene cambios sin guardar (borrador vs. lo persistido). */
export function motivosIguales(a: IRubroMotivo[], b: IRubroMotivo[]): boolean {
    if (a.length !== b.length) return false
    const porId = new Map(a.map(m => [m.motivoId, m]))
    return b.every(m => {
        const otro = porId.get(m.motivoId)
        return (
            !!otro &&
            otro.marca === m.marca &&
            otro.competidor === m.competidor &&
            otro.pctDiferencia === m.pctDiferencia
        )
    })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/resolucionRubro.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolucionRubro.ts src/lib/resolucionRubro.test.ts
git commit -m "feat(planificacion): helpers puros para el wizard de resolución de rubros"
```

---

### Task 2: Hook de guardado en lote `useResolverRubros`

**Files:**
- Modify: `src/hooks/useRubros.ts`
- Modify: `src/hooks/useRubros.test.tsx`

**Interfaces:**
- Consumes: `resolverRubro(visitaId, rubroId, dto)` de `src/api/planificacion.ts` (sin cambios).
- Produces: `useResolverRubros(visitaId: number)` — mutación cuyo `mutateAsync` recibe
  `IResolverRubrosItem[]` (`{ rubroId: number; motivos: IRubroMotivo[] }[]`) y resuelve a
  `IResolverRubrosResultado[]` (`{ rubroId: number; error: string | null }[]`, mismo orden que el
  input). Usado por `VisitaSheet.tsx` (Task 5).
- Se elimina `useResolverRubro` (singular): solo lo usaba `VisitaSheet.tsx`, que pasa a usar la
  versión en lote.

- [ ] **Step 1: Escribir los tests (fallan: `useResolverRubros` no existe)**

Reemplazar en `src/hooks/useRubros.test.tsx` el test `'useResolverRubro manda los motivos del
rubro'` por estos dos, dejando los dos primeros (`useRubros...`) tal cual están:

```tsx
it('useResolverRubros manda un PUT por rubro y devuelve error null si todos guardan', async () => {
    ;(api.resolverRubro as any).mockResolvedValue({ rubrosPendientes: 0 })
    const { result } = renderHook(() => useResolverRubros(42), { wrapper })
    const items = [
        { rubroId: 7, motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }] },
        { rubroId: 8, motivos: [{ motivoId: 16, marca: null, competidor: null, pctDiferencia: null }] },
    ]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(items)
    })
    expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, { motivos: items[0].motivos })
    expect(api.resolverRubro).toHaveBeenCalledWith(42, 8, { motivos: items[1].motivos })
    expect(out).toEqual([
        { rubroId: 7, error: null },
        { rubroId: 8, error: null },
    ])
})

it('un fallo no descarta los que sí guardaron', async () => {
    ;(api.resolverRubro as any).mockImplementation((_visitaId: number, rubroId: number) =>
        rubroId === 8
            ? Promise.reject(new Error('Network Error'))
            : Promise.resolve({ rubrosPendientes: 0 }),
    )
    const { result } = renderHook(() => useResolverRubros(42), { wrapper })
    const items = [
        { rubroId: 7, motivos: [] },
        { rubroId: 8, motivos: [] },
    ]
    let out: any
    await waitFor(async () => {
        out = await result.current.mutateAsync(items)
    })
    expect(out).toEqual([
        { rubroId: 7, error: null },
        { rubroId: 8, error: 'Sin conexión. Volvé a intentar; no se perdió lo que cargaste.' },
    ])
})
```

Y actualizar el import del archivo:

```tsx
import { useRubros, useResolverRubros } from './useRubros'
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/hooks/useRubros.test.tsx`
Expected: FAIL — `useResolverRubros` no es exportado por `./useRubros`.

- [ ] **Step 3: Implementar**

Reemplazar en `src/hooks/useRubros.ts` la función `useResolverRubro` (y su import de
`resolverRubro` se mantiene) por:

```ts
export interface IResolverRubrosItem {
    rubroId: number
    motivos: IRubroMotivo[]
}

export interface IResolverRubrosResultado {
    rubroId: number
    /** null si guardó bien. */
    error: string | null
}

/** Guarda varios rubros en paralelo con Promise.allSettled: el fallo de uno no debe
 *  descartar los que sí llegaron a guardarse. El wizard usa `error` para reintentar
 *  solo los que fallaron, sin volver a mandar los que ya quedaron guardados. */
export function useResolverRubros(visitaId: number) {
    return useMutacionDeRubros(
        visitaId,
        async (items: IResolverRubrosItem[]): Promise<IResolverRubrosResultado[]> => {
            const resultados = await Promise.allSettled(
                items.map(item => resolverRubro(visitaId, item.rubroId, { motivos: item.motivos })),
            )
            return items.map((item, i) => ({
                rubroId: item.rubroId,
                error:
                    resultados[i].status === 'rejected'
                        ? 'Sin conexión. Volvé a intentar; no se perdió lo que cargaste.'
                        : null,
            }))
        },
    )
}
```

El resto del archivo (`rubroKeys`, `useRubros`, `useMutacionDeRubros`, `useAgregarRubro`,
`useEliminarRubro`) queda igual.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/hooks/useRubros.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRubros.ts src/hooks/useRubros.test.tsx
git commit -m "feat(planificacion): reemplazar useResolverRubro por guardado en lote useResolverRubros"
```

---

### Task 3: `ResolucionRubro.tsx` pasa a ser contenido puro

**Files:**
- Modify: `src/components/propuesta/ResolucionRubro.tsx`
- Modify: `src/components/propuesta/ResolucionRubro.test.tsx`

**Interfaces:**
- Produces: `<ResolucionRubro rubro motivos value onChange />` (sin `onGuardar`, `onBack`,
  `guardando`) — consumido por `ResolucionWizard.tsx` (Task 4).

- [ ] **Step 1: Escribir el test (falla: el componente sigue pidiendo `onGuardar`/`onBack`)**

Reemplazar todo `src/components/propuesta/ResolucionRubro.test.tsx` por:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionRubro from './ResolucionRubro'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'rubro', descripcion: 'Saqué pedido', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 13, nivel: 'rubro', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 16, nivel: 'rubro', descripcion: 'No lo ofrecí', resultado: 'no_ofrecido', requiereDetalle: false },
]

const rubro: IVisitaRubro = {
    id: 7,
    resolucionId: 42,
    rubroCode: 'AMORT',
    rubroDescripcion: 'Amortiguadores',
    gapUnits: 12,
    esPropuesto: true,
    resuelto: false,
    motivos: [],
}

function setup(value: IRubroMotivo[] = []) {
    const onChange = vi.fn()
    render(<ResolucionRubro rubro={rubro} motivos={motivos} value={value} onChange={onChange} />)
    return { onChange }
}

it('renderiza el catálogo recibido, sin nombres hardcodeados', () => {
    setup()
    expect(screen.getByText('Saqué pedido')).toBeInTheDocument()
    expect(screen.getByText('No lo ofrecí')).toBeInTheDocument()
    // "Poco trabajo" / "Estoy completo" eran del prototipo y NO están en el catálogo.
    expect(screen.queryByText('Poco trabajo')).not.toBeInTheDocument()
})

it('muestra el rubro que se está resolviendo', () => {
    setup()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('tildar un motivo lo agrega con los detalles en null', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('destildar un motivo lo saca', () => {
    const { onChange } = setup([{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onChange).toHaveBeenCalledWith([])
})

it('el detalle aparece por requiereDetalle, no por el nombre del motivo', () => {
    setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByLabelText(/marca/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/competidor/i)).toBeInTheDocument()
})

it('el detalle se edita por motivo', () => {
    const { onChange } = setup([{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: 'Fric-Rot' } })
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 13, marca: 'Fric-Rot', competidor: null, pctDiferencia: null },
    ])
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/propuesta/ResolucionRubro.test.tsx`
Expected: FAIL — TypeScript se queja de props faltantes (`onGuardar`, `onBack` requeridas) o, si
el componente viejo sigue montado, aparecen el botón "Guardar" y el header "Resolución" que el
test nuevo ya no busca pero que rompen el resto (el componente actual no compila con las props
nuevas porque le siguen faltando `onGuardar`/`onBack`).

- [ ] **Step 3: Implementar**

Reemplazar todo `src/components/propuesta/ResolucionRubro.tsx` por:

```tsx
import { Check } from 'lucide-react'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionRubroProps {
    rubro: IVisitaRubro
    /** Catálogo de nivel `rubro`. Nunca se hardcodea: agregar un motivo es un INSERT. */
    motivos: IMotivo[]
    value: IRubroMotivo[]
    onChange: (motivos: IRubroMotivo[]) => void
}

const VACIO = { marca: null, competidor: null, pctDiferencia: null }

/** Checklist + detalle de un rubro. Sin header ni botón de guardar propios: la navegación
 *  entre rubros y el guardado en lote los aporta ResolucionWizard, que envuelve a este
 *  componente y es el único con estado de posición/guardado. */
export default function ResolucionRubro({ rubro, motivos, value, onChange }: ResolucionRubroProps) {
    const porId = new Map(value.map(m => [m.motivoId, m]))

    function toggle(motivoId: number) {
        onChange(
            porId.has(motivoId)
                ? value.filter(m => m.motivoId !== motivoId)
                : [...value, { motivoId, ...VACIO }],
        )
    }

    // El detalle vive en la fila (visita_rubro_id, motivo_id), así que se edita POR
    // MOTIVO. Hoy solo "Precio" lo pide, pero modelarlo así hace que un segundo motivo
    // con requiereDetalle funcione sin tocar este código.
    function setDetalle(motivoId: number, campo: keyof typeof VACIO, valor: string) {
        onChange(
            value.map(m =>
                m.motivoId !== motivoId
                    ? m
                    : {
                          ...m,
                          [campo]:
                              campo === 'pctDiferencia'
                                  ? valor === ''
                                      ? null
                                      : Number(valor)
                                  : valor === ''
                                    ? null
                                    : valor,
                      },
            ),
        )
    }

    return (
        <div>
            <div className="mb-3 text-[12.5px] font-semibold text-dsmuted">{rubro.rubroDescripcion}</div>

            <div className="flex flex-col gap-2">
                {motivos.map(cat => {
                    const seleccionado = porId.get(cat.motivoId)
                    const on = !!seleccionado
                    return (
                        <div key={cat.motivoId} className="flex flex-col gap-0">
                            <button
                                onClick={() => toggle(cat.motivoId)}
                                className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left font-sans ${
                                    on ? 'border-[#B9CCEC] bg-[#EEF3FB]' : 'border-[#E4E8F0] bg-white'
                                }`}
                            >
                                <span
                                    className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md border-[1.5px]"
                                    style={{
                                        borderColor: on ? '#213D82' : '#CBD2E0',
                                        background: on ? '#213D82' : '#fff',
                                        color: on ? '#fff' : 'transparent',
                                    }}
                                >
                                    <Check className="h-[13px] w-[13px]" strokeWidth={3.2} />
                                </span>
                                <span
                                    className={`text-sm font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}
                                >
                                    {cat.descripcion}
                                </span>
                            </button>

                            {cat.requiereDetalle && on && (
                                <div className="ml-8 mt-2 mb-0.5 flex flex-col gap-2.5 rounded-[10px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Marca
                                        </span>
                                        <input
                                            value={seleccionado.marca ?? ''}
                                            onChange={e => setDetalle(cat.motivoId, 'marca', e.target.value)}
                                            placeholder="Ej. Fric-Rot"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                            Competidor
                                        </span>
                                        <input
                                            value={seleccionado.competidor ?? ''}
                                            onChange={e => setDetalle(cat.motivoId, 'competidor', e.target.value)}
                                            placeholder="Ej. Corven"
                                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none"
                                        />
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <label
                                            htmlFor={`pct-${cat.motivoId}`}
                                            className="text-[12.5px] font-bold text-[#3B4560]"
                                        >
                                            % de diferencia
                                        </label>
                                        <div className="flex flex-1 items-center justify-end gap-1">
                                            <input
                                                id={`pct-${cat.motivoId}`}
                                                value={seleccionado.pctDiferencia ?? ''}
                                                onChange={e =>
                                                    setDetalle(
                                                        cat.motivoId,
                                                        'pctDiferencia',
                                                        e.target.value.replace(/[^0-9.]/g, ''),
                                                    )
                                                }
                                                inputMode="decimal"
                                                placeholder="0"
                                                className="w-16 rounded-lg border border-[#E1E6F0] px-2 py-1.5 text-right text-sm font-extrabold text-dsnavy outline-none"
                                            />
                                            <span className="text-[15px] font-extrabold text-dsnavy">%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/propuesta/ResolucionRubro.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/ResolucionRubro.tsx src/components/propuesta/ResolucionRubro.test.tsx
git commit -m "refactor(planificacion): ResolucionRubro pasa a ser contenido puro sin header ni guardado propio"
```

---

### Task 4: Componente `ResolucionWizard`

**Files:**
- Create: `src/components/propuesta/ResolucionWizard.tsx`
- Test: `src/components/propuesta/ResolucionWizard.test.tsx`

**Interfaces:**
- Consumes: `ResolucionRubro` (Task 3) — `<ResolucionRubro rubro motivos value onChange />`.
  `motivoIncompleto`, `motivosIguales` de `src/lib/resolucionRubro.ts` (Task 1).
- Produces:

```ts
interface ResolucionWizardProps {
    /** Subconjunto fijo de rubros que se está recorriendo (ya filtrado por el llamador). */
    rubros: IVisitaRubro[]
    /** Posición actual dentro de `rubros`. */
    index: number
    motivos: IMotivo[]
    /** Borrador en memoria por rubroId — lo que el vendedor tildó, guardado o no. */
    borradores: Record<number, IRubroMotivo[]>
    /** Última versión CONFIRMADA por el servidor por rubroId — contra esto se calculan
     *  los cambios pendientes. */
    guardados: Record<number, IRubroMotivo[]>
    /** rubroId -> mensaje de error, para los que fallaron en el último intento de guardado. */
    fallidos: Record<number, string>
    guardando?: boolean
    onIndexChange: (index: number) => void
    onCambiarBorrador: (rubroId: number, motivos: IRubroMotivo[]) => void
    onGuardarTodo: () => void
    onVolver: () => void
}
```

Consumido por `VisitaSheet.tsx` (Task 5).

- [ ] **Step 1: Escribir el test (falla: el componente no existe)**

`src/components/propuesta/ResolucionWizard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionWizard from './ResolucionWizard'
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
    const onCambiarBorrador = vi.fn()
    const onGuardarTodo = vi.fn()
    const onVolver = vi.fn()
    render(
        <ResolucionWizard
            rubros={rubros}
            index={0}
            motivos={motivos}
            borradores={{ 7: [], 8: [] }}
            guardados={{ 7: [], 8: [] }}
            fallidos={{}}
            onIndexChange={onIndexChange}
            onCambiarBorrador={onCambiarBorrador}
            onGuardarTodo={onGuardarTodo}
            onVolver={onVolver}
            {...over}
        />,
    )
    return { onIndexChange, onCambiarBorrador, onGuardarTodo, onVolver }
}

it('muestra la posición y el rubro actual', () => {
    setup()
    expect(screen.getByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByText('Amortiguadores')).toBeInTheDocument()
})

it('Atrás está deshabilitado en el primer rubro', () => {
    setup()
    expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled()
})

it('Siguiente está deshabilitado en el último rubro', () => {
    setup({ index: 1 })
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled()
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

it('tildar un motivo avisa con el rubro actual', () => {
    const { onCambiarBorrador } = setup()
    fireEvent.click(screen.getByText('Saqué pedido'))
    expect(onCambiarBorrador).toHaveBeenCalledWith(7, [
        { motivoId: 10, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('sin cambios pendientes, Guardar todo está deshabilitado', () => {
    setup()
    expect(screen.getByRole('button', { name: /guardar todo/i })).toBeDisabled()
})

it('con un cambio pendiente, Guardar todo se habilita, muestra la cuenta y dispara onGuardarTodo', () => {
    const { onGuardarTodo } = setup({
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
    })
    const boton = screen.getByRole('button', { name: /guardar todo \(1\)/i })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    expect(onGuardarTodo).toHaveBeenCalled()
})

it('con el detalle de Precio incompleto, avisa cuál falta y bloquea Guardar todo', () => {
    setup({
        borradores: { 7: [{ motivoId: 13, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
    })
    expect(screen.getByText(/completá el detalle de precio en amortiguadores/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar todo/i })).toBeDisabled()
})

it('con fallidos, el botón pasa a Reintentar y lista los rubros que fallaron', () => {
    setup({
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
        fallidos: { 7: 'Sin conexión.' },
    })
    expect(screen.getByRole('button', { name: /reintentar \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText(/no se pudo guardar.*amortiguadores/i)).toBeInTheDocument()
})

it('mientras guarda, el botón muestra el estado de carga', () => {
    setup({
        borradores: { 7: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }], 8: [] },
        guardando: true,
    })
    expect(screen.getByText(/guardando/i)).toBeInTheDocument()
})

it('Volver dispara onVolver', () => {
    const { onVolver } = setup()
    fireEvent.click(screen.getByLabelText('Volver'))
    expect(onVolver).toHaveBeenCalled()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/propuesta/ResolucionWizard.test.tsx`
Expected: FAIL — no se puede resolver el módulo `./ResolucionWizard`.

- [ ] **Step 3: Implementar**

`src/components/propuesta/ResolucionWizard.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ResolucionRubro from './ResolucionRubro'
import { motivoIncompleto, motivosIguales } from '@/lib/resolucionRubro'
import type { IMotivo, IRubroMotivo, IVisitaRubro } from '@/types/planificacion'

interface ResolucionWizardProps {
    rubros: IVisitaRubro[]
    index: number
    motivos: IMotivo[]
    borradores: Record<number, IRubroMotivo[]>
    guardados: Record<number, IRubroMotivo[]>
    fallidos: Record<number, string>
    guardando?: boolean
    onIndexChange: (index: number) => void
    onCambiarBorrador: (rubroId: number, motivos: IRubroMotivo[]) => void
    onGuardarTodo: () => void
    onVolver: () => void
}

export default function ResolucionWizard({
    rubros,
    index,
    motivos,
    borradores,
    guardados,
    fallidos,
    guardando,
    onIndexChange,
    onCambiarBorrador,
    onGuardarTodo,
    onVolver,
}: ResolucionWizardProps) {
    const rubro = rubros[index]

    // Contra `guardados`, no contra `rubros[i].motivos`: ese último queda congelado al
    // abrir el wizard, así que un guardado exitoso a mitad de recorrido no lo actualiza.
    const pendientes = rubros.filter(r => !motivosIguales(borradores[r.id] ?? [], guardados[r.id] ?? []))

    let bloqueado: IVisitaRubro | null = null
    let motivoBloqueante: IMotivo | null = null
    for (const r of pendientes) {
        const m = motivoIncompleto(motivos, borradores[r.id] ?? [])
        if (m) {
            bloqueado = r
            motivoBloqueante = m
            break
        }
    }
    const bloqueadoIndex = bloqueado ? rubros.findIndex(r => r.id === bloqueado!.id) : -1

    const fallidosRubros = rubros.filter(r => fallidos[r.id])
    const hayFallidos = fallidosRubros.length > 0
    const puedeGuardar = pendientes.length > 0 && !bloqueado

    return (
        <div>
            <div className="mb-1 flex items-center justify-between gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={onVolver}
                    aria-label="Volver"
                    className="h-[29px] w-[29px] border-[#E1E6F0] text-dsmuted"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
                <span className="text-[12.5px] font-bold text-dsmuted">
                    {index + 1} de {rubros.length}
                </span>
            </div>

            <ResolucionRubro
                rubro={rubro}
                motivos={motivos}
                value={borradores[rubro.id] ?? []}
                onChange={m => onCambiarBorrador(rubro.id, m)}
            />

            <div className="mt-4 flex items-center gap-2">
                <Button
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => onIndexChange(index - 1)}
                    className="h-11 flex-1 text-[13.5px] font-bold"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    Atrás
                </Button>
                <Button
                    variant="outline"
                    disabled={index === rubros.length - 1}
                    onClick={() => onIndexChange(index + 1)}
                    className="h-11 flex-1 text-[13.5px] font-bold"
                >
                    Siguiente
                    <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </Button>
            </div>

            {bloqueado && motivoBloqueante && (
                <p className="mt-2 text-[12.5px] font-semibold text-[#B45309]">
                    Completá el detalle de {motivoBloqueante.descripcion} en {bloqueado.rubroDescripcion} (rubro{' '}
                    {bloqueadoIndex + 1} de {rubros.length}).
                </p>
            )}

            {hayFallidos && (
                <p className="mt-2 text-[12.5px] font-semibold text-dsred">
                    No se pudo guardar: {fallidosRubros.map(r => r.rubroDescripcion).join(', ')}.
                </p>
            )}

            <Button
                onClick={onGuardarTodo}
                disabled={!puedeGuardar}
                loading={guardando}
                className={`mt-2 h-12 w-full text-[14.5px] ${
                    hayFallidos ? 'bg-dsred hover:bg-dsred/90' : 'bg-dsgreen hover:bg-dsgreen/90'
                }`}
            >
                {guardando
                    ? 'Guardando…'
                    : hayFallidos
                      ? `Reintentar (${pendientes.length})`
                      : pendientes.length > 0
                        ? `Guardar todo (${pendientes.length})`
                        : 'Guardar todo'}
            </Button>
        </div>
    )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/propuesta/ResolucionWizard.test.tsx`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/ResolucionWizard.tsx src/components/propuesta/ResolucionWizard.test.tsx
git commit -m "feat(planificacion): componente ResolucionWizard con navegación y guardado en lote"
```

---

### Task 5: Integrar el wizard en `VisitaSheet`

**Files:**
- Modify: `src/components/VisitaSheet.tsx`
- Modify: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `ResolucionWizard` (Task 4), `useResolverRubros` (Task 2), `motivosIguales` (Task 1).
- No produce interfaces nuevas para otros archivos — es la hoja del árbol de esta feature.

- [ ] **Step 1: Escribir/actualizar los tests (fallan: el sheet sigue usando el flujo viejo)**

En `src/components/VisitaSheet.test.tsx`:

1. Reemplazar el test `'entrar a un rubro abre su resolución'` por:

```tsx
it('entrar a un rubro abre el wizard de resolución', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
})
```

2. Reemplazar el test `'guardar persiste los motivos del rubro'` por:

```tsx
it('guardar todo persiste solo los rubros con cambios', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /guardar todo/i }))
    await waitFor(() =>
        expect(api.resolverRubro).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 10, marca: null, competidor: null, pctDiferencia: null }],
        }),
    )
    // Filtros no cambió: no se manda su PUT.
    expect(api.resolverRubro).toHaveBeenCalledTimes(1)
})
```

3. Reemplazar el test `'si el guardado falla, NO vuelve a la lista y conserva lo tildado'` por:

```tsx
it('si guardar todo falla, no se pierde lo tildado y ofrece reintentar', async () => {
    ;(api.resolverRubro as any).mockRejectedValue(new Error('Network Error'))
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /guardar todo/i }))
    expect(await screen.findByRole('button', { name: /reintentar \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText(/no se pudo guardar.*amortiguadores/i)).toBeInTheDocument()
})
```

4. Reemplazar el test `'con la visita cerrada, un rubro TODAVÍA sin resolver se puede completar'` por:

```tsx
it('con la visita cerrada, un rubro TODAVÍA sin resolver se puede completar', async () => {
    // Amortiguadores no tiene motivos: es justo lo que el aviso de "rubros sin cargar"
    // invita a venir a completar, aunque la visita ya haya cerrado. Filtros ya está
    // resuelto y queda fuera del recorrido (subset de 1).
    renderSheet({ visitaCerrada: true })
    fireEvent.click(await screen.findByText('Amortiguadores'))
    expect(await screen.findByText('1 de 1')).toBeInTheDocument()
})
```

5. Agregar un test nuevo de navegación, después del anterior:

```tsx
it('el wizard conserva lo tildado en un rubro al navegar a otro y volver', async () => {
    renderSheet()
    fireEvent.click(await screen.findByText('Amortiguadores'))
    fireEvent.click(await screen.findByText('Saqué pedido'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('2 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /atrás/i }))
    expect(await screen.findByText('1 de 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar todo \(1\)/i })).toBeInTheDocument()
})
```

El resto de los tests del archivo (lista de rubros, borrar rubro, cerrar visita, en curso/
minimizar, ver versus) no referencian el flujo de resolución y quedan sin cambios.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: FAIL — sigue apareciendo el botón "Guardar" viejo y el header "Resolución"; no existe
"Guardar todo" ni el contador "N de M" todavía.

- [ ] **Step 3: Implementar**

En `src/components/VisitaSheet.tsx`:

Reemplazar los imports:

```ts
import { useEffect, useState } from 'react'
import { ChevronLeft, Maximize2, Trash2 } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import RubroCard from './propuesta/RubroCard'
import ResolucionWizard from './propuesta/ResolucionWizard'
import VersusTable from './propuesta/VersusTable'
import { useMotivos } from '@/hooks/useMotivos'
import { useRubros, useResolverRubros, useEliminarRubro } from '@/hooks/useRubros'
import { usePropuesta } from '@/hooks/usePropuesta'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'
import { formatearDuracion } from '@/lib/visitaTimer'
import { motivosIguales } from '@/lib/resolucionRubro'
import type { IRubroMotivo, IVisitaRubro } from '@/types/planificacion'
```

Reemplazar el estado y las funciones `abrirRubro`/`guardar` (todo el bloque entre la declaración
de `resolver`/`eliminar` y el `return`) por:

```ts
    const { data: rubros = [] } = useRubros(open ? visitaId : null)
    const { data: motivos = [] } = useMotivos('rubro')
    const resolverTodos = useResolverRubros(visitaId)
    const eliminar = useEliminarRubro(visitaId)

    const [wizard, setWizard] = useState<{ rubros: IVisitaRubro[]; index: number } | null>(null)
    const [borradores, setBorradores] = useState<Record<number, IRubroMotivo[]>>({})
    const [guardados, setGuardados] = useState<Record<number, IRubroMotivo[]>>({})
    const [fallidos, setFallidos] = useState<Record<number, string>>({})
    const [vista, setVista] = useState<Vista>('list')

    const { data: propuesta } = usePropuesta(
        vista === 'versus' ? (codigoParticularCliente ?? null) : null,
    )

    useEffect(() => {
        if (!open) {
            setWizard(null)
            setBorradores({})
            setGuardados({})
            setFallidos({})
            setVista('list')
        }
    }, [open])

    // Una visita cerrada no se reedita (se genera una visita de ajuste aparte) — salvo
    // los rubros que quedaron sin cargar, que es justamente lo que el aviso de "rubros
    // sin cargar" invita a venir a completar acá mismo.
    function esEditable(r: IVisitaRubro) {
        return !visitaCerrada || !r.resuelto
    }

    function abrirWizard(rubro: IVisitaRubro) {
        const subset = rubros.filter(esEditable)
        const index = subset.findIndex(r => r.id === rubro.id)
        setBorradores(prev => {
            const next = { ...prev }
            for (const r of subset) if (!(r.id in next)) next[r.id] = r.motivos
            return next
        })
        setGuardados(prev => {
            const next = { ...prev }
            for (const r of subset) if (!(r.id in next)) next[r.id] = r.motivos
            return next
        })
        setWizard({ rubros: subset, index })
    }

    async function guardarTodo() {
        if (!wizard) return
        const cambios = wizard.rubros
            .filter(r => !motivosIguales(borradores[r.id] ?? [], guardados[r.id] ?? []))
            .map(r => ({ rubroId: r.id, motivos: borradores[r.id] ?? [] }))
        if (cambios.length === 0) return

        const resultados = await resolverTodos.mutateAsync(cambios)

        setFallidos(prev => {
            const next = { ...prev }
            for (const res of resultados) {
                if (res.error) next[res.rubroId] = res.error
                else delete next[res.rubroId]
            }
            return next
        })
        setGuardados(prev => {
            const next = { ...prev }
            for (const res of resultados) {
                if (!res.error) next[res.rubroId] = borradores[res.rubroId] ?? []
            }
            return next
        })
    }

    const pendientes = rubros.filter(r => !r.resuelto).length
```

Reemplazar el bloque de render (el `{activo ? (...) : vista === 'versus' ? (...) : (...)}`)
completo por:

```tsx
            {wizard ? (
                <ResolucionWizard
                    rubros={wizard.rubros}
                    index={wizard.index}
                    motivos={motivos}
                    borradores={borradores}
                    guardados={guardados}
                    fallidos={fallidos}
                    guardando={resolverTodos.isPending}
                    onIndexChange={index => setWizard(w => (w ? { ...w, index } : w))}
                    onCambiarBorrador={(rubroId, m) => setBorradores(prev => ({ ...prev, [rubroId]: m }))}
                    onGuardarTodo={guardarTodo}
                    onVolver={() => setWizard(null)}
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
                    <VersusTable rubros={propuesta?.rubros ?? []} />
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
                                            motivosCargados={r.motivos.length}
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

                    {codigoParticularCliente && (
                        <Button
                            variant="outline"
                            onClick={() => setVista('versus')}
                            className="mt-3.5 h-[46px] w-full border-[#C9D2E3] text-[14px] font-bold text-dsnavy"
                        >
                            <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            Ver versus
                        </Button>
                    )}

                    {!visitaCerrada && (
                        <Button
                            onClick={onCerrarVisita}
                            loading={cerrando}
                            className="mt-3.5 h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                        >
                            {cerrando ? 'Cerrando…' : 'Cerrar visita'}
                        </Button>
                    )}

                    {pendientes > 0 && (
                        <p className="mt-2 text-center text-[12px] font-semibold text-[#B45309]">
                            {pendientes} {pendientes === 1 ? 'rubro' : 'rubros'} sin cargar. Podés
                            cerrar la visita y completarlos después, pero la semana no cierra
                            hasta que estén.
                        </p>
                    )}
                </div>
            )}
```

El resto del archivo (props, `BottomSheet` wrapper, eyebrow de "en curso") no cambia.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 5: Correr la suite completa**

Run: `npx vitest run`
Expected: PASS — sin regresiones en otros archivos que importaban `ResolucionRubro` con las
props viejas (solo `VisitaSheet.tsx` lo usaba, vía `ResolucionWizard` ahora) ni en `useRubros.ts`
(`useResolverRubro` ya no se usa en ningún otro lado).

- [ ] **Step 6: Commit**

```bash
git add src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx
git commit -m "feat(planificacion): integrar el wizard de resolución de rubros en VisitaSheet"
```

---

## Self-Review

**Cobertura del spec:**
- Layout (Volver arriba / Atrás-Siguiente-Guardar todo abajo) → Task 4, render de `ResolucionWizard`.
- Modelo de estado (`wizard`, `borradores`/`guardados` separados, `fallidos`) → Task 5.
- Navegación por índice, sin recalcular el subset mientras el wizard está abierto → Task 5
  (`wizard.rubros` se fija una sola vez en `abrirWizard`, comparación siempre contra `guardados`).
- Guardado en lote con `Promise.allSettled` y reintento selectivo → Task 2.
- `Guardar todo` persistente en todos los pasos, no solo al final → Task 4 (siempre visible,
  deshabilitado solo por falta de cambios o bloqueo de detalle).
- Validación de detalle no bloquea navegación, sí bloquea guardado, con mensaje posicional →
  Task 1 (`motivoIncompleto`) + Task 4 (mensaje con nombre de motivo, rubro y posición).
- Aviso de fallidos con nombres de rubro, no genérico → Task 4.

**Placeholders:** ninguno — cada paso tiene código completo, sin TODOs.

**Consistencia de tipos:** `IResolverRubrosItem`/`IResolverRubrosResultado` (Task 2) coinciden
entre el hook y su uso en `guardarTodo` (Task 5). `ResolucionWizardProps` (Task 4) coincide con
las props que le pasa `VisitaSheet.tsx` (Task 5) campo por campo. `ResolucionRubroProps` (Task 3)
coincide con el único consumo, dentro de `ResolucionWizard` (Task 4).
