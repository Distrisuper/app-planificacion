# Acción comercial en la resolución (frontend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al resolver un rubro, el vendedor puede indicar que fue con una acción comercial (Plan cupo / Descuento), con qué marca y con qué parámetros — y entonces el checklist de motivos pasa al vocabulario propio de las acciones.

**Architecture:** Un `AccionComercialPicker` nuevo, presentacional puro, montado en `ResolucionOfrecimiento` arriba del checklist. La acción cargada viaja en un borrador paralelo al de motivos (`detalles`, misma mecánica de localStorage) y se manda en el mismo batch de "Cerrar visita". El alta de ofrecimientos deja de ofrecer `'accion'` como tipo.

**Tech Stack:** React 19 + TypeScript, Tailwind, Vitest + Testing Library.

## Global Constraints

- El caso simple **no cambia**: sin acción elegida, la pantalla de resolución queda exactamente como hoy.
- Los editores de parámetros (`EditorCupo`, `EditorDescuento`) y `registroDetalleAccion` se **reusan tal cual**, sin modificarlos.
- `ResolucionOfrecimiento` sigue siendo **presentacional puro** (sin React Query en su test): los catálogos llegan por props desde `ResolucionWizard`.
- **Borrador paralelo, no cambio de forma:** `borradores` (motivos) queda como está y se agrega `detalles` al lado. Cambiar la forma de `borradores` obligaría a tocar `VisitaSheet`, `ResolucionWizard`, `ResolucionWizardAcciones` y sus tests a la vez, y rompería en silencio los borradores ya guardados en localStorage de una visita en curso.
- Spec de referencia: `docs/superpowers/specs/2026-08-13-accion-comercial-en-la-resolucion-design.md`.
- **Depende del backend:** el plan `2026-08-13-backend-accion-comercial-en-la-resolucion.md` (repo `api-vendedores`) tiene que estar aplicado para que la resolución con motivos de nivel `'accion'` no sea rechazada con `MOTIVO_NIVEL_INVALIDO`.

---

### Task 1: Tipos y catálogo de nivel `'accion'`

**Files:**
- Modify: `src/types/planificacion.ts` (`NivelMotivo`, `IResolverOfrecimientoDTO`, nuevo `IAccionComercial`)
- Modify: `src/api/planificacion.ts` — sin cambios de firma, se verifica que el DTO ya viaja entero
- Test: `src/hooks/useMotivos.test.tsx` (si no existe, se crea)

**Interfaces:**
- Produces: `NivelMotivo = 'visita' | 'ofrecimiento' | 'accion'`; `IAccionComercial { accion: string; marca: string | null; params?: unknown }`; `IResolverOfrecimientoDTO.detalle?: IAccionComercial | null` — usados por las Tasks 2, 3 y 4.

- [ ] **Step 1: Ampliar los tipos**

En `src/types/planificacion.ts`, reemplazar la declaración de `NivelMotivo`:

```ts
export type NivelMotivo = 'visita' | 'ofrecimiento' | 'accion'
```

Agregar, junto a los tipos de ofrecimiento:

```ts
/** La acción comercial con la que se resolvió un ofrecimiento (Plan cupo, Descuento).
 *  Vive en `pl_ofrecimiento.detalle` del propio ofrecimiento — NO es un ofrecimiento
 *  aparte. `params` es lo que produce el editor del registro de esa acción
 *  (`{tramos}` para Cupo, `{pct}` para Descuento); `unknown` acá a propósito: la forma
 *  concreta solo la conoce su módulo. */
export interface IAccionComercial {
    accion: string
    marca: string | null
    params?: unknown
}
```

Y en `IResolverOfrecimientoDTO`:

```ts
export interface IResolverOfrecimientoDTO {
    motivos: IOfrecimientoMotivo[]
    /** `undefined` = no se toca lo guardado. `null` = se sacó la acción. */
    detalle?: IAccionComercial | null
}
```

- [ ] **Step 2: Escribir el test que falla, en `src/hooks/useMotivos.test.tsx`**

Crear el archivo (o agregar el caso si ya existe):

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useMotivos } from './useMotivos'
import * as api from '@/api/planificacion'

vi.mock('@/api/planificacion')

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('useMotivos', () => {
    it('pide el catálogo de nivel accion cuando se le pasa ese nivel', async () => {
        ;(api.getMotivos as any).mockResolvedValue([
            { motivoId: 22, nivel: 'accion', descripcion: 'Lo va a considerar', resultado: 'diferido', requiereDetalle: false },
        ])

        const { result } = renderHook(() => useMotivos('accion'), { wrapper })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(api.getMotivos).toHaveBeenCalledWith('accion')
        expect(result.current.data?.[0].nivel).toBe('accion')
    })
})
```

- [ ] **Step 3: Correr el test y verificar que pasa**

Run: `npx vitest run src/hooks/useMotivos.test.tsx`
Expected: PASS — `useMotivos` ya acepta cualquier `NivelMotivo`; el test confirma que `'accion'` es ahora un nivel válido para TypeScript (sin el cambio de la Step 1 no compilaría).

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: sin salida

- [ ] **Step 5: Commit**

```bash
git add src/types/planificacion.ts src/hooks/useMotivos.test.tsx
git commit -m "feat(motivos): nivel accion y tipo IAccionComercial"
```

---

### Task 2: `AccionComercialPicker`

**Files:**
- Create: `src/components/propuesta/AccionComercialPicker.tsx`
- Create: `src/components/propuesta/AccionComercialPicker.test.tsx`

**Interfaces:**
- Consumes: `IAccionComercial` (Task 1); `registroDetalleAccion` de `./accionDetalle/registro` (ya existe); `CatalogoPicker` (ya existe).
- Produces: `AccionComercialPicker` (default export) con props
  `{ acciones: ICatalogoItem[]; marcas: ICatalogoItem[]; marcasLoading?: boolean; value: IAccionComercial | null; onChange: (v: IAccionComercial | null) => void }` — usado por la Task 3.

- [ ] **Step 1: Escribir los tests que fallan**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccionComercialPicker from './AccionComercialPicker'

const acciones = [
    { code: 'CUPO', description: 'Plan cupo' },
    { code: 'DESCUENTO', description: 'Descuento' },
]
const marcas = [{ code: 'AG', description: 'AG' }]

describe('AccionComercialPicker', () => {
    it('sin acción elegida, solo muestra el disparador', () => {
        render(
            <AccionComercialPicker acciones={acciones} marcas={marcas} value={null} onChange={vi.fn()} />,
        )

        expect(screen.getByText(/con acción comercial/i)).toBeInTheDocument()
        expect(screen.queryByText('Plan cupo')).not.toBeInTheDocument()
    })

    it('abrir muestra las acciones del catálogo', () => {
        render(
            <AccionComercialPicker acciones={acciones} marcas={marcas} value={null} onChange={vi.fn()} />,
        )

        fireEvent.click(screen.getByText(/con acción comercial/i))

        expect(screen.getByRole('button', { name: 'Plan cupo' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Descuento' })).toBeInTheDocument()
    })

    it('elegir una acción avisa con marca en null y sin params', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker acciones={acciones} marcas={marcas} value={null} onChange={onChange} />,
        )

        fireEvent.click(screen.getByText(/con acción comercial/i))
        fireEvent.click(screen.getByRole('button', { name: 'Descuento' }))

        expect(onChange).toHaveBeenCalledWith({ accion: 'DESCUENTO', marca: null })
    })

    it('con una acción con módulo registrado, muestra su editor de params', () => {
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.getByLabelText(/% de descuento/i)).toBeInTheDocument()
    })

    it('cargar los params avisa con la acción completa', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={onChange}
            />,
        )

        fireEvent.change(screen.getByLabelText(/% de descuento/i), { target: { value: '5' } })

        expect(onChange).toHaveBeenCalledWith({
            accion: 'DESCUENTO',
            marca: null,
            params: { pct: 5 },
        })
    })

    it('elegir una marca la guarda por su descripción', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByLabelText(/marca/i))
        fireEvent.click(screen.getByText('AG'))

        expect(onChange).toHaveBeenCalledWith({ accion: 'DESCUENTO', marca: 'AG' })
    })

    // Los params de Cupo (tramos) no significan nada para Descuento (%).
    it('cambiar de acción descarta los params de la anterior', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: 'AG', params: { pct: 5 } }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))

        expect(onChange).toHaveBeenCalledWith({ accion: 'CUPO', marca: 'AG' })
    })

    it('sacar la acción avisa con null', () => {
        const onChange = vi.fn()
        render(
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                value={{ accion: 'DESCUENTO', marca: null }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: /sin acción/i }))

        expect(onChange).toHaveBeenCalledWith(null)
    })

    it('una acción sin módulo registrado no muestra editor de params', () => {
        render(
            <AccionComercialPicker
                acciones={[{ code: 'PROMO', description: 'Promoción' }]}
                marcas={marcas}
                value={{ accion: 'PROMO', marca: null }}
                onChange={vi.fn()}
            />,
        )

        expect(screen.queryByLabelText(/% de descuento/i)).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/tramo 1/i)).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/propuesta/AccionComercialPicker.test.tsx`
Expected: FAIL con "Failed to resolve import ./AccionComercialPicker"

- [ ] **Step 3: Implementar el componente**

```tsx
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import { registroDetalleAccion } from './accionDetalle/registro'
import type { IAccionComercial, ICatalogoItem } from '@/types/planificacion'

interface AccionComercialPickerProps {
    acciones: ICatalogoItem[]
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    value: IAccionComercial | null
    onChange: (value: IAccionComercial | null) => void
}

/** "¿Con acción comercial?": con qué se ofreció este rubro (Plan cupo, Descuento),
 *  sobre qué marca y con qué parámetros. Colapsado por defecto y opcional — la mayoría
 *  de los rubros se resuelven sin acción, y ahí la pantalla queda igual que siempre.
 *
 *  Presentacional puro: los catálogos llegan por props (los pide ResolucionWizard), así
 *  que su test no necesita React Query. Los editores de parámetros salen del registro
 *  por código de acción (accionDetalle/registro.ts) — sumar una acción con parámetros
 *  nuevos no toca este archivo. */
export default function AccionComercialPicker({
    acciones,
    marcas,
    marcasLoading,
    value,
    onChange,
}: AccionComercialPickerProps) {
    const [abierto, setAbierto] = useState(!!value)
    const [marcaAbierta, setMarcaAbierta] = useState(false)

    const moduloDetalle = value ? registroDetalleAccion[value.accion] : undefined

    // Cambiar de acción descarta los params: los tramos de un Cupo no significan nada
    // para un Descuento (que es un % suelto).
    function elegirAccion(item: ICatalogoItem) {
        onChange({ accion: item.code, marca: value?.marca ?? null })
    }

    if (!abierto && !value) {
        return (
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="mb-3 flex w-full items-center gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-left"
            >
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#8A93A6]">
                    ¿Con acción comercial?
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
            </button>
        )
    }

    return (
        <div className="animate-panel-in mb-3 flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#B9CCEC] bg-white p-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Acción comercial
            </span>

            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => {
                        onChange(null)
                        setAbierto(false)
                    }}
                    className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold ${
                        value
                            ? 'border-[#E1E6F0] bg-white text-[#3B4560]'
                            : 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                    }`}
                >
                    Sin acción
                </button>
                {acciones.map(a => {
                    const on = value?.accion === a.code
                    return (
                        <button
                            key={a.code}
                            type="button"
                            onClick={() => elegirAccion(a)}
                            className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold ${
                                on
                                    ? 'border-[#B9CCEC] bg-[#EEF3FB] text-[#182645]'
                                    : 'border-[#E1E6F0] bg-white text-[#3B4560]'
                            }`}
                        >
                            {a.description}
                        </button>
                    )
                })}
            </div>

            {value && (
                <>
                    <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                            Marca
                        </span>
                        <button
                            type="button"
                            aria-label="Marca"
                            onClick={() => setMarcaAbierta(!marcaAbierta)}
                            className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                        >
                            <span
                                className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                    value.marca ? 'text-[#182645]' : 'text-[#8A93A6]'
                                }`}
                            >
                                {value.marca ?? 'Todas / no aplica'}
                            </span>
                            {value.marca && (
                                <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                            )}
                            <ChevronDown
                                className={`h-4 w-4 shrink-0 text-dsmuted transition-transform duration-150 ${
                                    marcaAbierta ? 'rotate-180' : ''
                                }`}
                                strokeWidth={2.4}
                            />
                        </button>
                        {marcaAbierta && (
                            <div className="animate-panel-in mt-1.5">
                                <CatalogoPicker
                                    items={marcas}
                                    loading={marcasLoading}
                                    value={value.marca}
                                    onSelect={item => {
                                        onChange({ ...value, marca: item.description })
                                        setMarcaAbierta(false)
                                    }}
                                    placeholder="Buscar marca…"
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>

                    {moduloDetalle && (
                        <moduloDetalle.Editor
                            value={value.params}
                            onChange={params => onChange({ ...value, params })}
                        />
                    )}
                </>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/propuesta/AccionComercialPicker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/AccionComercialPicker.tsx src/components/propuesta/AccionComercialPicker.test.tsx
git commit -m "feat(resolucion): AccionComercialPicker (accion + marca + params)"
```

---

### Task 3: Montarlo en `ResolucionOfrecimiento` y cambiar el catálogo de motivos

**Files:**
- Modify: `src/components/propuesta/ResolucionOfrecimiento.tsx`
- Modify: `src/components/propuesta/ResolucionWizard.tsx`
- Test: `src/components/propuesta/ResolucionOfrecimiento.test.tsx`

**Interfaces:**
- Consumes: `AccionComercialPicker` (Task 2); `IAccionComercial` (Task 1).
- Produces: `ResolucionOfrecimiento` suma props
  `{ acciones: ICatalogoItem[]; accion: IAccionComercial | null; onChangeAccion: (v: IAccionComercial | null) => void }` — usadas por la Task 4 vía `ResolucionWizard`.

- [ ] **Step 1: Escribir los tests que fallan**

En `ResolucionOfrecimiento.test.tsx`, actualizar el `setup` y agregar casos:

```tsx
const acciones: ICatalogoItem[] = [{ code: 'CUPO', description: 'Plan cupo' }]

function setup(value: IOfrecimientoMotivo[] = [], over: Record<string, unknown> = {}) {
    const onChange = vi.fn()
    const onChangeAccion = vi.fn()
    render(
        <ResolucionOfrecimiento
            motivos={motivos}
            marcas={marcas}
            acciones={acciones}
            accion={null}
            onChangeAccion={onChangeAccion}
            value={value}
            onChange={onChange}
            {...over}
        />,
    )
    return { onChange, onChangeAccion }
}
```

Y al final del archivo:

```tsx
// El caso simple no cambió: sin acción, la pantalla es la de siempre.
it('sin acción comercial, el checklist es el de motivos de ofrecimiento', () => {
    setup()
    expect(screen.getByText('Saqué pedido')).toBeInTheDocument()
    expect(screen.getByText(/con acción comercial/i)).toBeInTheDocument()
})

it('ofrece cargar una acción comercial arriba del checklist', () => {
    const { onChangeAccion } = setup()
    fireEvent.click(screen.getByText(/con acción comercial/i))
    fireEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
    expect(onChangeAccion).toHaveBeenCalledWith({ accion: 'CUPO', marca: null })
})

// Con acción, el vocabulario correcto es el de la acción: "Flete" no cierra un cupo.
it('con acción comercial, el checklist muestra los motivos que recibe (nivel accion)', () => {
    const motivosAccion: IMotivo[] = [
        { motivoId: 22, nivel: 'accion', descripcion: 'Lo va a considerar', resultado: 'diferido', requiereDetalle: false },
    ]
    setup([], { accion: { accion: 'CUPO', marca: null }, motivos: motivosAccion })

    expect(screen.getByText('Lo va a considerar')).toBeInTheDocument()
    expect(screen.queryByText('Saqué pedido')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/propuesta/ResolucionOfrecimiento.test.tsx`
Expected: FAIL — no existe el disparador "¿Con acción comercial?" ni las props nuevas.

- [ ] **Step 3: Montar el picker en `ResolucionOfrecimiento`**

Agregar el import al tope:

```ts
import AccionComercialPicker from './AccionComercialPicker'
import type { IAccionComercial } from '@/types/planificacion'
```

Ampliar las props de la interfaz (`ResolucionOfrecimientoProps`) con:

```ts
    /** Catálogo de acciones comerciales (pl_accion). */
    acciones: ICatalogoItem[]
    /** La acción con la que se resolvió este ofrecimiento, si hubo. */
    accion: IAccionComercial | null
    onChangeAccion: (accion: IAccionComercial | null) => void
```

Sumarlas a la desestructuración de la función, y renderizar el picker como primer hijo del
`<div>` que devuelve el componente, antes del `<div className="flex flex-col gap-2">` del
checklist:

```tsx
        <div>
            <AccionComercialPicker
                acciones={acciones}
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={accion}
                onChange={onChangeAccion}
            />

            <div className="flex flex-col gap-2">
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/propuesta/ResolucionOfrecimiento.test.tsx`
Expected: PASS

- [ ] **Step 5: Pasar las props desde `ResolucionWizard`**

En `src/components/propuesta/ResolucionWizard.tsx`:

Agregar el import del hook de acciones y el tipo:

```ts
import { useAcciones } from '@/hooks/useAcciones'
import type { IAccionComercial, IMotivo, IOfrecimiento, IOfrecimientoMotivo } from '@/types/planificacion'
```

Sumar a `ResolucionWizardProps`:

```ts
    /** Motivos de nivel 'accion', para cuando el ofrecimiento se resuelve con una. */
    motivosAccion: IMotivo[]
    /** Acción comercial por ofrecimientoId — borrador paralelo al de motivos. */
    detalles: Record<number, IAccionComercial | null>
    onCambiarAccion: (ofrecimientoId: number, accion: IAccionComercial | null) => void
```

Dentro del componente, después de `const ofrecimiento = ofrecimientos[index]`:

```ts
    const { data: acciones = [] } = useAcciones()
    const accion = detalles[ofrecimiento.id] ?? null
    // Con acción cargada, el checklist cambia al vocabulario de la acción: los motivos
    // de rubro no la cierran ("Flete" no cierra un cupo; falta "lo va a considerar").
    const motivosVisibles = accion ? motivosAccion : motivos
```

El catálogo de marcas ya no se pide solo cuando hay un motivo con `requiereDetalle`: también
hace falta cuando hay acción (para elegir su marca). Reemplazar la línea de `necesitaMarcas`:

```ts
    const necesitaMarcas =
        accion !== null ||
        (borradores[ofrecimiento.id] ?? []).some(
            m => motivos.find(cat => cat.motivoId === m.motivoId)?.requiereDetalle,
        )
```

Y en el render de `<ResolucionOfrecimiento ...>`, pasar `motivos={motivosVisibles}` en vez de
`motivos={motivos}`, más las tres props nuevas:

```tsx
                <ResolucionOfrecimiento
                    motivos={motivosVisibles}
                    marcas={marcas}
                    marcasLoading={marcasLoading}
                    acciones={acciones.map(a => ({ code: a.codigo, description: a.descripcion }))}
                    accion={accion}
                    onChangeAccion={a => onCambiarAccion(ofrecimiento.id, a)}
                    value={borradores[ofrecimiento.id] ?? []}
                    onChange={m => onCambiarBorrador(ofrecimiento.id, m)}
                />
```

- [ ] **Step 6: Correr los tests del wizard**

Run: `npx vitest run src/components/propuesta/ResolucionWizard.test.tsx`
Expected: FAIL — el `setup` del test no pasa las props nuevas. Agregar a su render:
`motivosAccion={[]}`, `detalles={{}}` y `onCambiarAccion={vi.fn()}`, y volver a correr hasta PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/propuesta/ResolucionOfrecimiento.tsx src/components/propuesta/ResolucionOfrecimiento.test.tsx src/components/propuesta/ResolucionWizard.tsx src/components/propuesta/ResolucionWizard.test.tsx
git commit -m "feat(resolucion): accion comercial arriba del checklist, con su catalogo de motivos"
```

---

### Task 4: Borrador de acciones y envío al cerrar

**Files:**
- Modify: `src/lib/resolucionDraft.ts`
- Modify: `src/components/VisitaSheet.tsx`
- Modify: `src/hooks/useOfrecimientos.ts` (`IResolverOfrecimientosItem`)
- Test: `src/components/VisitaSheet.test.tsx`

**Interfaces:**
- Consumes: `IAccionComercial` (Task 1); las props de `ResolucionWizard` (Task 3).
- Produces: `leerDetalles/guardarDetalles/limpiarDetalles` en `resolucionDraft.ts`;
  `IResolverOfrecimientosItem` suma `detalle?: IAccionComercial | null`.

- [ ] **Step 1: Agregar el borrador paralelo en `resolucionDraft.ts`**

Al final del archivo:

```ts
/** Borrador de acciones comerciales, por ofrecimientoId. Va en su propia clave y no
 *  dentro de `Borrador`: cambiar la forma del borrador de motivos obligaría a tocar
 *  VisitaSheet, el wizard y su pie a la vez, y dejaría ilegibles los borradores que ya
 *  hay guardados de una visita en curso. */
type BorradorDetalles = Record<number, IAccionComercial | null>

function keyDetalles(visitaId: number): string {
    return `visita-detalles-${visitaId}`
}

export function leerDetalles(visitaId: number): BorradorDetalles | null {
    const raw = localStorage.getItem(keyDetalles(visitaId))
    if (raw == null) return null
    try {
        return JSON.parse(raw) as BorradorDetalles
    } catch {
        return null
    }
}

export function guardarDetalles(visitaId: number, detalles: BorradorDetalles): void {
    localStorage.setItem(keyDetalles(visitaId), JSON.stringify(detalles))
}

export function limpiarDetalles(visitaId: number): void {
    localStorage.removeItem(keyDetalles(visitaId))
}
```

Y agregar el import del tipo al tope: `import type { IAccionComercial, IOfrecimientoMotivo } from '@/types/planificacion'`.

- [ ] **Step 2: Escribir el test que falla, en `VisitaSheet.test.tsx`**

```tsx
it('la acción comercial cargada viaja en el batch de cierre', async () => {
    ;(api.getMotivos as any).mockImplementation((nivel: string) =>
        Promise.resolve(
            nivel === 'accion'
                ? [{ motivoId: 22, nivel: 'accion', descripcion: 'Lo va a considerar', resultado: 'diferido', requiereDetalle: false }]
                : motivos,
        ),
    )
    ;(api.getAcciones as any).mockResolvedValue([{ codigo: 'DESCUENTO', descripcion: 'Descuento' }])

    const { onCerrarVisita } = renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Resolución de Amortiguadores' }))

    fireEvent.click(await screen.findByText(/con acción comercial/i))
    fireEvent.click(await screen.findByRole('button', { name: 'Descuento' }))
    fireEvent.change(screen.getByLabelText(/% de descuento/i), { target: { value: '5' } })
    fireEvent.click(await screen.findByText('Lo va a considerar'))
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^finalizar$/i }))

    fireEvent.click(await screen.findByRole('button', { name: /cerrar visita/i }))

    await waitFor(() =>
        expect(api.resolverOfrecimiento).toHaveBeenCalledWith(42, 7, {
            motivos: [{ motivoId: 22, marca: null, competidor: null, pctDiferencia: null }],
            detalle: { accion: 'DESCUENTO', marca: null, params: { pct: 5 } },
        }),
    )
    expect(onCerrarVisita).toHaveBeenCalled()
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: FAIL — no existe el disparador de acción en el wizard montado desde `VisitaSheet`.

- [ ] **Step 4: Sumar el estado `detalles` en `VisitaSheet`**

Ampliar los imports:

```ts
import { useMotivos } from '@/hooks/useMotivos'
import {
    leerBorrador,
    guardarBorrador,
    limpiarBorrador,
    leerDetalles,
    guardarDetalles,
    limpiarDetalles,
} from '@/lib/resolucionDraft'
import type { IAccionComercial, IOfrecimiento, IOfrecimientoMotivo, IVisitClientCard } from '@/types/planificacion'
```

Agregar el catálogo de motivos de acción, junto al de ofrecimiento:

```ts
    const { data: motivos = [] } = useMotivos('ofrecimiento')
    const { data: motivosAccion = [] } = useMotivos('accion')
```

Agregar el estado, junto a `borradores`:

```ts
    const [detalles, setDetalles] = useState<Record<number, IAccionComercial | null>>({})
```

En el `useEffect` de cierre (`if (!open)`), sumar `setDetalles({})`.

En el `useEffect` que inicializa el borrador, sumar la carga de detalles:

```ts
        setDetalles(prev => (Object.keys(prev).length > 0 ? prev : (leerDetalles(visitaId) ?? {})))
```

En el `useEffect` que persiste, sumar:

```ts
        guardarDetalles(visitaId, detalles)
```

y agregar `detalles` a su array de dependencias.

En `cerrarConBorrador`, incluir el detalle en cada cambio y limpiar su borrador:

```ts
        const cambios = ofrecimientos
            .filter(
                r =>
                    !motivosIguales(borradores[r.id] ?? [], r.motivos) ||
                    detalles[r.id] !== undefined,
            )
            .map(r => ({
                ofrecimientoId: r.id,
                motivos: borradores[r.id] ?? [],
                ...(detalles[r.id] !== undefined ? { detalle: detalles[r.id] } : {}),
            }))
```

y después de `limpiarBorrador(visitaId)`:

```ts
        limpiarDetalles(visitaId)
```

Finalmente, pasar las props nuevas al `<ResolucionWizard ...>`:

```tsx
                        motivosAccion={motivosAccion}
                        detalles={detalles}
                        onCambiarAccion={(ofrecimientoId, accion) =>
                            setDetalles(prev => ({ ...prev, [ofrecimientoId]: accion }))
                        }
```

- [ ] **Step 5: Mandar `detalle` en la mutación**

En `src/hooks/useOfrecimientos.ts`, ampliar la interfaz y el llamado:

```ts
export interface IResolverOfrecimientosItem {
    ofrecimientoId: number
    motivos: IOfrecimientoMotivo[]
    detalle?: IAccionComercial | null
}
```

y dentro de `useResolverOfrecimientos`, reemplazar la llamada por:

```ts
                items.map(item =>
                    resolverOfrecimiento(visitaId, item.ofrecimientoId, {
                        motivos: item.motivos,
                        ...(item.detalle !== undefined ? { detalle: item.detalle } : {}),
                    }),
                ),
```

más el import del tipo `IAccionComercial` en ese archivo.

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/VisitaSheet.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/resolucionDraft.ts src/components/VisitaSheet.tsx src/components/VisitaSheet.test.tsx src/hooks/useOfrecimientos.ts
git commit -m "feat(resolucion): borrador de acciones comerciales y envio en el batch de cierre"
```

---

### Task 5: Sacar `'accion'` del alta de ofrecimientos

**Files:**
- Modify: `src/components/propuesta/OfrecimientoBuscador.tsx`
- Modify: `src/components/propuesta/AgregarOfrecimientoSheet.tsx`
- Test: `src/components/propuesta/OfrecimientoBuscador.test.tsx`, `src/components/propuesta/AgregarOfrecimientoSheet.test.tsx`

**Interfaces:**
- Consumes: nada de las tasks anteriores.
- Produces: `TipoOfrecible = 'rubro' | 'marca'`; `AgregarOfrecimientoSheet` deja de recibir `acciones` y de renderizar `AlcancePicker`.

- [ ] **Step 1: Actualizar los tests de `OfrecimientoBuscador`**

Sacar `acciones` de las props en todos los `render(...)` del archivo, sacar `'DESCUENTO'` del
fixture, y reemplazar los tres tests que lo ejercitan
(`'sin escribir nada, mezcla rubro, marca y acción...'`, `'sin escribir nada, las acciones van
primero'`, `'tocar un resultado de acción...'`) por:

```tsx
    it('sin escribir nada, mezcla rubro y marca en una sola lista', () => {
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

        expect(screen.getByRole('button', { name: /bujes/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /skf/i })).toBeInTheDocument()
    })

    // Las acciones ya no se agregan como ofrecimiento: se cargan al RESOLVER un rubro
    // (ver spec de la acción comercial en la resolución).
    it('no ofrece acciones', () => {
        render(<OfrecimientoBuscador rubros={rubros} marcas={marcas} onSelect={vi.fn()} />)

        expect(screen.queryByText('Acción')).not.toBeInTheDocument()
    })
```

Ajustar también los `describe('colapso tras elegir')` que usan `value={{ tipo: 'accion', ... }}`
para que usen `{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }` y busquen `/skf/i`.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/propuesta/OfrecimientoBuscador.test.tsx`
Expected: FAIL — el componente todavía exige la prop `acciones`.

- [ ] **Step 3: Sacar acciones de `OfrecimientoBuscador`**

- En `TipoOfrecible`, dejar `export type TipoOfrecible = 'rubro' | 'marca'`.
- Sacar `accion: 'Acción'` de `TIPO_OFRECIBLE_LABEL`.
- Sacar `acciones` de `OfrecimientoBuscadorProps` y de la desestructuración.
- En `combinados`, sacar la línea de acciones y dejar rubros y marcas:

```ts
    const combinados: Resultado[] = [
        ...rubros.map(r => ({ tipo: 'rubro' as const, ...r })),
        ...(marcasLoading ? [] : marcas.map(m => ({ tipo: 'marca' as const, ...m }))),
    ]
```

- Actualizar el placeholder del input a `"Buscar rubro o marca…"` y el comentario del
  componente (ya no mezcla tres catálogos).

- [ ] **Step 4: Sacar el alcance y las acciones de `AgregarOfrecimientoSheet`**

- Sacar el import de `AlcancePicker` y el bloque `{elegido?.tipo === 'accion' && (<AlcancePicker ... />)}`.
- Sacar el import de `registroDetalleAccion` y todo lo relativo a `moduloDetalle` y `detalle`
  (el estado, el reset en `elegir`, el spread en `confirmar`, y el `<moduloDetalle.Editor ...>`).
- Sacar `acciones` de las props y del `<OfrecimientoBuscador ...>`.
- `puedeAgregar` queda simplemente `!!elegido`.
- `confirmar` manda `{ tipo, codigo, descripcion, alcance: [] }`.

Actualizar `AgregarOfrecimientoSheet.test.tsx`: sacar `acciones` de `props`, borrar los tests que
ejercitan Plan cupo/tramos/alcance (`'agrega una acción con alcance y detalle sobre una marca'`,
`'elegir una acción con módulo de detalle...'`, `'con Plan cupo elegido...'`, `'completar los
tramos...'`, `'una acción sin módulo de detalle registrado...'`, `'no ofrece "Para"...'`,
`'elegir otra cosa limpia el alcance y el detalle ya cargados'`), y dejar los de rubro y marca.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/propuesta/`
Expected: PASS

- [ ] **Step 6: Sacar `acciones` del llamador**

En `src/components/VisitaSheet.tsx`, sacar la prop `acciones={accionesCatalogo}` del
`<AgregarOfrecimientoSheet ...>` y la constante `accionesCatalogo` si queda sin uso.
`useAcciones` sigue usándose — ahora lo consume `ResolucionWizard` (Task 3).

- [ ] **Step 7: Correr la suite completa, type-check y lint**

Run: `npx vitest run`
Expected: PASS

Run: `npx tsc -b --noEmit`
Expected: sin salida

Run: `npx oxlint`
Expected: sin warnings nuevos respecto del estado previo al plan

- [ ] **Step 8: Commit**

```bash
git add src/components/propuesta/OfrecimientoBuscador.tsx src/components/propuesta/OfrecimientoBuscador.test.tsx src/components/propuesta/AgregarOfrecimientoSheet.tsx src/components/propuesta/AgregarOfrecimientoSheet.test.tsx src/components/VisitaSheet.tsx
git commit -m "feat(ofrecimiento): el alta deja de ofrecer acciones (se cargan al resolver)"
```
