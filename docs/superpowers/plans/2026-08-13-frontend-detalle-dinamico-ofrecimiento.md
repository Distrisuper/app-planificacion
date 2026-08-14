# Detalle dinámico del ofrecimiento (frontend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar `detalle` (tramos umbral/% de Cupo) al alta de un ofrecimiento tipo `accion`, a
través de un registro de módulos por código de acción, sin tocar el cableado existente cuando se
sume una acción nueva más adelante.

**Architecture:** Un `Record<string, IModuloDetalleAccion>` (`accionDetalle/registro.ts`) keyed por
código de acción (`CUPO`), donde cada módulo trae su propio componente de edición, una función de
resumen para la tabla y una función de validez. `AgregarOfrecimientoSheet` y `OfrecimientoTable`
consultan el registro por código sin conocer a Cupo por nombre.

**Tech Stack:** React 19 + TypeScript, Tailwind, Vitest + Testing Library (`@testing-library/react`,
`@testing-library/user-event`).

## Global Constraints

- `detalle` es `unknown` en los tipos genéricos (`IOfrecimiento`, `IAgregarOfrecimientoDTO`,
  `IOfrecimientoFila`) — la forma concreta (`ICupoDetalle`) solo la conoce el módulo de Cupo.
- Los tramos quedan fijos tras el alta: no hay edición retroactiva en esta vuelta.
- Sin dependencias nuevas.
- Spec de referencia: `docs/superpowers/specs/2026-08-13-detalle-dinamico-ofrecimiento-design.md`.

---

### Task 1: Tipos + paso de `detalle` en `construirFilasVisita`

**Files:**
- Modify: `src/types/planificacion.ts:182-194` (interface `IOfrecimiento`)
- Modify: `src/types/planificacion.ts:337-342` (interface `IAgregarOfrecimientoDTO`)
- Modify: `src/components/propuesta/filas.ts:14-30` (interface `IOfrecimientoFila`)
- Modify: `src/components/propuesta/filas.ts:122-144` (`construirFilasVisita`)
- Test: `src/components/propuesta/filas.test.ts`

**Interfaces:**
- Produces: `IOfrecimiento.detalle?: unknown`, `IAgregarOfrecimientoDTO.detalle?: unknown`,
  `IOfrecimientoFila.detalle?: unknown` — usados por las Tasks 3 y 4.

- [ ] **Step 1: Agregar `detalle` a los tipos**

En `src/types/planificacion.ts`, dentro de `IOfrecimiento` (después de `alcance: IAlcance[]`):

```ts
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
    /** Parámetros propios de la oferta (ej. tramos de Cupo). Solo tiene sentido con
     *  tipo: 'accion' — el backend lo ignora en silencio para el resto. Su forma
     *  concreta la conoce el módulo del registro de detalle por código de acción
     *  (ver src/components/propuesta/accionDetalle/registro.ts). */
    detalle?: unknown
}
```

Y en `IAgregarOfrecimientoDTO`:

```ts
export interface IAgregarOfrecimientoDTO {
    tipo: TipoOfrecimiento
    codigo: string
    descripcion: string
    alcance?: IAlcance[]
    detalle?: unknown
}
```

- [ ] **Step 2: Escribir el test que falla, en `filas.test.ts`**

Agregar dentro de `describe('construirFilasVisita', ...)`, después del test "propaga el tipo y el
alcance del ofrecimiento a la fila":

```ts
it('propaga el detalle del ofrecimiento a la fila', () => {
    const filas = construirFilasVisita(
        [
            ofrecimiento({
                id: 9,
                codigo: 'CUPO',
                tipo: 'accion',
                detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
            }),
        ],
        [],
        { 9: { motivosCargados: 0, completo: false } },
        false,
        true,
    )
    expect(filas[0].detalle).toEqual({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run src/components/propuesta/filas.test.ts`
Expected: FAIL — `filas[0].detalle` es `undefined`, no el objeto esperado.

- [ ] **Step 4: Implementar el paso de `detalle` en `filas.ts`**

Agregar `detalle?: unknown` a `IOfrecimientoFila` (después de `alcance: IAlcance[]`):

```ts
export interface IOfrecimientoFila {
    codigo: string
    nombre: string
    actual: number | null
    mesAnterior: number | null
    promedio6m: number | null
    destacada: boolean
    resolucion?: IOfrecimientoFilaResolucion
    agregable?: boolean
    tipo: TipoOfrecimiento
    alcance: IAlcance[]
    detalle?: unknown
}
```

Y en `construirFilasVisita`, dentro del `.map` que arma `bloqueArriba`, agregar `detalle: r.detalle`
junto a `tipo`/`alcance`:

```ts
    const bloqueArriba: IOfrecimientoFila[] = ofrecimientosVisita.map(r => {
        const s = status.get(r.codigo)
        const estado = estados[r.id]
        return {
            codigo: r.codigo,
            nombre: r.descripcion,
            actual: s?.actual ?? null,
            mesAnterior: s?.mesAnterior ?? null,
            promedio6m: s?.promedio6m ?? null,
            destacada: true,
            tipo: r.tipo,
            alcance: r.alcance,
            detalle: r.detalle,
            resolucion:
                editable && estado
                    ? {
                          ofrecimientoId: r.id,
                          motivosCargados: estado.motivosCargados,
                          completo: estado.completo,
                          esPropuesto: r.esPropuesto,
                      }
                    : undefined,
        }
    })
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/propuesta/filas.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/planificacion.ts src/components/propuesta/filas.ts src/components/propuesta/filas.test.ts
git commit -m "feat(ofrecimiento): agrega detalle a los tipos y a construirFilasVisita"
```

---

### Task 2: Registro de módulos de detalle + módulo de Cupo

**Files:**
- Create: `src/components/propuesta/accionDetalle/cupo.tsx`
- Create: `src/components/propuesta/accionDetalle/cupo.test.tsx`
- Create: `src/components/propuesta/accionDetalle/registro.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `ICupoDetalle`, `ICupoTramo`, `EditorCupo` (componente), `resumenCupo`, `esValidoCupo`,
  `IModuloDetalleAccion<T>`, `registroDetalleAccion: Record<string, IModuloDetalleAccion<any>>` —
  usados por las Tasks 3 y 4.

- [ ] **Step 1: Escribir los tests que fallan, en `cupo.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorCupo, esValidoCupo, resumenCupo } from './cupo'

describe('esValidoCupo', () => {
    it('undefined no es válido', () => {
        expect(esValidoCupo(undefined)).toBe(false)
    })

    it('sin tramos no es válido', () => {
        expect(esValidoCupo({ tramos: [] })).toBe(false)
    })

    it('un tramo sin umbral no es válido', () => {
        expect(esValidoCupo({ tramos: [{ umbral: 0, descuentoPct: 5 }] })).toBe(false)
    })

    it('un tramo sin descuento no es válido', () => {
        expect(esValidoCupo({ tramos: [{ umbral: 2_500_000, descuentoPct: 0 }] })).toBe(false)
    })

    it('un tramo completo es válido', () => {
        expect(esValidoCupo({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })).toBe(true)
    })

    it('si un tramo de varios está incompleto, no es válido', () => {
        expect(
            esValidoCupo({
                tramos: [
                    { umbral: 2_500_000, descuentoPct: 3 },
                    { umbral: 0, descuentoPct: 5 },
                ],
            }),
        ).toBe(false)
    })
})

describe('resumenCupo', () => {
    it('un tramo', () => {
        expect(resumenCupo({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })).toBe(
            '$2.500.000→3%',
        )
    })

    it('dos tramos, separados por ·', () => {
        expect(
            resumenCupo({
                tramos: [
                    { umbral: 2_500_000, descuentoPct: 3 },
                    { umbral: 3_200_000, descuentoPct: 5 },
                ],
            }),
        ).toBe('$2.500.000→3% · $3.200.000→5%')
    })
})

describe('EditorCupo', () => {
    it('arranca con un tramo vacío y sin botón de quitar', () => {
        render(<EditorCupo value={undefined} onChange={vi.fn()} />)
        expect(screen.getByLabelText(/tramo 1.*alcanza/i)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /quitar tramo/i })).not.toBeInTheDocument()
    })

    it('cargar el umbral dispara onChange con el tramo actualizado', () => {
        const onChange = vi.fn()
        render(<EditorCupo value={undefined} onChange={onChange} />)

        fireEvent.change(screen.getByLabelText(/tramo 1.*alcanza/i), {
            target: { value: '2500000' },
        })

        expect(onChange).toHaveBeenCalledWith({ tramos: [{ umbral: 2_500_000, descuentoPct: 0 }] })
    })

    it('cargar el descuento dispara onChange con el tramo actualizado', () => {
        const onChange = vi.fn()
        render(
            <EditorCupo
                value={{ tramos: [{ umbral: 2_500_000, descuentoPct: 0 }] }}
                onChange={onChange}
            />,
        )

        fireEvent.change(screen.getByLabelText(/tramo 1.*descuento/i), { target: { value: '3' } })

        expect(onChange).toHaveBeenCalledWith({ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] })
    })

    it('agregar tramo suma una fila nueva vacía', () => {
        const onChange = vi.fn()
        render(
            <EditorCupo
                value={{ tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: /agregar tramo/i }))

        expect(onChange).toHaveBeenCalledWith({
            tramos: [
                { umbral: 2_500_000, descuentoPct: 3 },
                { umbral: 0, descuentoPct: 0 },
            ],
        })
    })

    it('con más de un tramo, cada uno ofrece quitar', () => {
        render(
            <EditorCupo
                value={{
                    tramos: [
                        { umbral: 2_500_000, descuentoPct: 3 },
                        { umbral: 3_200_000, descuentoPct: 5 },
                    ],
                }}
                onChange={vi.fn()}
            />,
        )
        expect(screen.getByRole('button', { name: 'Quitar tramo 1' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Quitar tramo 2' })).toBeInTheDocument()
    })

    it('quitar un tramo lo saca de la lista', () => {
        const onChange = vi.fn()
        render(
            <EditorCupo
                value={{
                    tramos: [
                        { umbral: 2_500_000, descuentoPct: 3 },
                        { umbral: 3_200_000, descuentoPct: 5 },
                    ],
                }}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Quitar tramo 1' }))

        expect(onChange).toHaveBeenCalledWith({ tramos: [{ umbral: 3_200_000, descuentoPct: 5 }] })
    })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/propuesta/accionDetalle/cupo.test.tsx`
Expected: FAIL con "Failed to resolve import ./cupo" (el archivo no existe todavía).

- [ ] **Step 3: Implementar `cupo.tsx`**

```tsx
import { Plus, Trash2 } from 'lucide-react'

export interface ICupoTramo {
    umbral: number
    descuentoPct: number
}

export interface ICupoDetalle {
    tramos: ICupoTramo[]
}

const FMT_UMBRAL = new Intl.NumberFormat('es-AR')
const TRAMO_VACIO: ICupoTramo = { umbral: 0, descuentoPct: 0 }

function tramoValido(t: ICupoTramo): boolean {
    return t.umbral > 0 && t.descuentoPct > 0
}

/** Al menos un tramo, y todos válidos: un tramo a medio cargar no debería habilitar
 *  "Agregar" en AgregarOfrecimientoSheet. */
export function esValidoCupo(detalle: ICupoDetalle | undefined): boolean {
    return !!detalle && detalle.tramos.length > 0 && detalle.tramos.every(tramoValido)
}

/** "$2.500.000→3% · $3.200.000→5%". Se llama solo con `detalle` ya cargado (ver
 *  OfrecimientoTable), así que no contempla formatear tramos incompletos. */
export function resumenCupo(detalle: ICupoDetalle): string {
    return detalle.tramos
        .map(t => `$${FMT_UMBRAL.format(t.umbral)}→${t.descuentoPct}%`)
        .join(' · ')
}

interface EditorCupoProps {
    value: ICupoDetalle | undefined
    onChange: (detalle: ICupoDetalle) => void
}

/** Lista editable de tramos (umbral → % descuento). Arranca con un tramo vacío la
 *  primera vez que se muestra: el vendedor no tiene que tocar "Agregar tramo" para
 *  cargar el caso más común (un solo tramo, según la evidencia de Cromo). */
export function EditorCupo({ value, onChange }: EditorCupoProps) {
    const tramos = value?.tramos ?? [TRAMO_VACIO]

    function actualizar(i: number, campo: keyof ICupoTramo, valor: string) {
        const siguiente = tramos.map((t, idx) =>
            idx === i
                ? { ...t, [campo]: valor === '' ? 0 : Number(valor.replace(/[^0-9.]/g, '')) }
                : t,
        )
        onChange({ tramos: siguiente })
    }

    function agregar() {
        onChange({ tramos: [...tramos, TRAMO_VACIO] })
    }

    function quitar(i: number) {
        const siguiente = tramos.filter((_, idx) => idx !== i)
        onChange({ tramos: siguiente.length > 0 ? siguiente : [TRAMO_VACIO] })
    }

    return (
        <div className="mt-2 flex flex-col gap-2 rounded-[10px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                Tramos del cupo
            </span>
            {tramos.map((tramo, i) => (
                <div key={i} className="flex items-end gap-1.5">
                    <label className="flex flex-1 flex-col gap-1">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                            Tramo {i + 1} · Alcanza $
                        </span>
                        <input
                            value={tramo.umbral || ''}
                            onChange={e => actualizar(i, 'umbral', e.target.value)}
                            inputMode="decimal"
                            placeholder="0"
                            className="w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-right text-sm font-extrabold text-dsnavy outline-none"
                        />
                    </label>
                    <label className="flex shrink-0 flex-col gap-1">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                            Tramo {i + 1} · Descuento
                        </span>
                        <div className="flex items-center gap-1">
                            <input
                                value={tramo.descuentoPct || ''}
                                onChange={e => actualizar(i, 'descuentoPct', e.target.value)}
                                inputMode="decimal"
                                placeholder="0"
                                className="w-14 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-right text-sm font-extrabold text-dsnavy outline-none"
                            />
                            <span className="text-[13px] font-extrabold text-dsnavy">%</span>
                        </div>
                    </label>
                    {tramos.length > 1 && (
                        <button
                            type="button"
                            aria-label={`Quitar tramo ${i + 1}`}
                            onClick={() => quitar(i)}
                            className="shrink-0 pb-2 text-dsred"
                        >
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                onClick={agregar}
                className="flex items-center justify-center gap-1 text-[12.5px] font-bold text-dsnavy"
            >
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                Agregar tramo
            </button>
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/propuesta/accionDetalle/cupo.test.tsx`
Expected: PASS

- [ ] **Step 5: Implementar `registro.ts`**

```ts
import type { ComponentType } from 'react'
import { EditorCupo, esValidoCupo, resumenCupo, type ICupoDetalle } from './cupo'

/** Contrato que cualquier acción nueva cumple para sumarse al registro: un editor para
 *  el alta, un resumen de una línea para la tabla, y una validación para habilitar
 *  "Agregar" en AgregarOfrecimientoSheet. Sumar una acción nueva (Descuento, Promo,
 *  Cobranza) es un archivo como cupo.tsx + una entrada acá — no hay que tocar
 *  AgregarOfrecimientoSheet ni OfrecimientoTable de nuevo. */
export interface IModuloDetalleAccion<T = unknown> {
    Editor: ComponentType<{ value: T | undefined; onChange: (v: T) => void }>
    resumen: (detalle: T) => string
    esValido: (detalle: T | undefined) => boolean
}

const moduloCupo: IModuloDetalleAccion<ICupoDetalle> = {
    Editor: EditorCupo,
    resumen: resumenCupo,
    esValido: esValidoCupo,
}

// `any` en el valor del Record a propósito: cada módulo es internamente consistente
// (Editor/resumen/esValido comparten el mismo T), pero el registro es heterogéneo —
// distintas acciones van a tener distintas formas de detalle.
export const registroDetalleAccion: Record<string, IModuloDetalleAccion<any>> = {
    CUPO: moduloCupo,
}
```

No lleva test propio: su corrección la prueban las Tasks 3 y 4, que lo consumen de punta a punta.

- [ ] **Step 6: Correr todo el archivo de tests y verificar que sigue en verde**

Run: `npx vitest run src/components/propuesta/accionDetalle/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/propuesta/accionDetalle/
git commit -m "feat(ofrecimiento): registro de módulos de detalle por acción + módulo Cupo"
```

---

### Task 3: Integrar el registro en `AgregarOfrecimientoSheet`

**Files:**
- Modify: `src/components/propuesta/AgregarOfrecimientoSheet.tsx`
- Test: `src/components/propuesta/AgregarOfrecimientoSheet.test.tsx`

**Interfaces:**
- Consumes: `registroDetalleAccion` de `./accionDetalle/registro` (Task 2); `IAgregarOfrecimientoDTO`
  con `detalle?: unknown` (Task 1).

- [ ] **Step 1: Actualizar los tests existentes que ahora requieren tramos, y agregar los nuevos**

Reemplazar el contenido completo de `AgregarOfrecimientoSheet.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
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

function cargarTramoCupo() {
    fireEvent.change(screen.getByLabelText(/tramo 1.*alcanza/i), { target: { value: '2500000' } })
    fireEvent.change(screen.getByLabelText(/tramo 1.*descuento/i), { target: { value: '3' } })
}

describe('AgregarOfrecimientoSheet', () => {
    it('arranca en Rubro', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Rubro' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
    })

    it('agrega una acción con alcance y detalle sobre una marca', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))
        cargarTramoCupo()
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [{ tipo: 'marca', codigo: 'SKF', descripcion: 'SKF' }],
            detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
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

    it('cambiar de tipo limpia lo elegido, el alcance y el detalle', async () => {
        const onAgregar = vi.fn()
        render(<AgregarOfrecimientoSheet {...props} onAgregar={onAgregar} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        await userEvent.click(screen.getByRole('button', { name: /acotar/i }))
        await userEvent.click(screen.getByRole('button', { name: 'SKF' }))
        cargarTramoCupo()

        await userEvent.click(screen.getByRole('button', { name: 'Marca' }))
        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        // Sin volver a cargar tramos: si quedaran los anteriores, "Agregar" ya estaría habilitado.
        expect(screen.getByRole('button', { name: /agregar/i })).toBeDisabled()

        cargarTramoCupo()
        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))

        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'CUPO',
            descripcion: 'Plan cupo',
            alcance: [],
            detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
        })
    })

    it('no deja agregar sin elegir nada', () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        expect(screen.getByRole('button', { name: /agregar/i })).toBeDisabled()
    })

    it('elegir una acción con módulo de detalle (Plan cupo) muestra el editor de tramos', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))

        expect(screen.getByLabelText(/tramo 1.*alcanza/i)).toBeInTheDocument()
    })

    it('con Plan cupo elegido y sin tramos completos, Agregar queda deshabilitado', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))

        expect(screen.getByRole('button', { name: /agregar/i })).toBeDisabled()
    })

    it('completar los tramos habilita Agregar', async () => {
        render(<AgregarOfrecimientoSheet {...props} onAgregar={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Plan cupo' }))
        cargarTramoCupo()

        expect(screen.getByRole('button', { name: /agregar/i })).toBeEnabled()
    })

    it('una acción sin módulo de detalle registrado no muestra editor y agrega con solo el DTO base', async () => {
        const onAgregar = vi.fn()
        const otrasAcciones = [{ code: 'PROMO', description: 'Promo verano' }]
        render(
            <AgregarOfrecimientoSheet {...props} acciones={otrasAcciones} onAgregar={onAgregar} />,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Acción' }))
        await userEvent.click(screen.getByRole('button', { name: 'Promo verano' }))

        expect(screen.queryByLabelText(/tramo 1/i)).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /agregar/i }))
        expect(onAgregar).toHaveBeenCalledWith({
            tipo: 'accion',
            codigo: 'PROMO',
            descripcion: 'Promo verano',
            alcance: [],
        })
    })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/propuesta/AgregarOfrecimientoSheet.test.tsx`
Expected: FAIL — no existe el editor de tramos, "Agregar" nunca se deshabilita por Cupo incompleto,
y el DTO nunca incluye `detalle`.

- [ ] **Step 3: Implementar el cambio en `AgregarOfrecimientoSheet.tsx`**

Reemplazar el contenido completo del archivo:

```tsx
import { useState } from 'react'
import SelectorTipoOfrecimiento, { type TipoOfrecible } from './SelectorTipoOfrecimiento'
import CatalogoPicker from './CatalogoPicker'
import AlcancePicker from './AlcancePicker'
import { registroDetalleAccion } from './accionDetalle/registro'
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
    const [detalle, setDetalle] = useState<unknown>(undefined)

    if (!open) return null

    const catalogo = tipo === 'rubro' ? rubros : tipo === 'marca' ? marcas : acciones
    // Solo las acciones pueden traer un módulo de detalle (tramos de Cupo, etc.) — ver
    // el registro en accionDetalle/registro.ts. Una acción sin módulo registrado (ej.
    // Descuento, todavía sin diseñar) simplemente no muestra editor.
    const moduloDetalle =
        tipo === 'accion' && elegido ? registroDetalleAccion[elegido.code] : undefined

    // Cambiar de tipo invalida lo elegido, el alcance Y el detalle: un detalle cargado
    // para una acción no significa nada si el vendedor pasa a marca.
    function cambiarTipo(nuevo: TipoOfrecible) {
        setTipo(nuevo)
        setElegido(null)
        setAlcance([])
        setDetalle(undefined)
    }

    // Elegir un ítem distinto dentro del mismo tipo también descarta el detalle: un
    // tramo cargado para "Plan cupo" no debería sobrevivir si el vendedor elige otra
    // acción sin volver a tocar el selector de tipo.
    function elegir(item: ICatalogoItem) {
        setElegido(item)
        setDetalle(undefined)
    }

    function confirmar() {
        if (!elegido) return
        onAgregar({
            tipo,
            codigo: elegido.code,
            descripcion: elegido.description,
            alcance,
            ...(moduloDetalle ? { detalle } : {}),
        })
        cambiarTipo('rubro')
        onClose()
    }

    const puedeAgregar = !!elegido && (!moduloDetalle || moduloDetalle.esValido(detalle))

    return (
        <div className="flex flex-col gap-2 p-3">
            <SelectorTipoOfrecimiento value={tipo} onChange={cambiarTipo} />

            <CatalogoPicker
                items={catalogo}
                loading={tipo === 'marca' ? marcasLoading : false}
                value={elegido?.description ?? null}
                onSelect={elegir}
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

            {moduloDetalle && <moduloDetalle.Editor value={detalle} onChange={setDetalle} />}

            <button
                type="button"
                disabled={!puedeAgregar}
                onClick={confirmar}
                className="mt-1 rounded-[11px] bg-dsnavy px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
                Agregar
            </button>
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/propuesta/AgregarOfrecimientoSheet.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/AgregarOfrecimientoSheet.tsx src/components/propuesta/AgregarOfrecimientoSheet.test.tsx
git commit -m "feat(ofrecimiento): alta de acción muestra el editor de detalle del registro"
```

---

### Task 4: Mostrar el resumen de `detalle` en `OfrecimientoTable`

**Files:**
- Modify: `src/components/propuesta/OfrecimientoTable.tsx` (función `ContenidoFila`)
- Test: `src/components/propuesta/OfrecimientoTable.test.tsx`

**Interfaces:**
- Consumes: `registroDetalleAccion` de `./accionDetalle/registro` (Task 2); `fila.detalle` de
  `IOfrecimientoFila` (Task 1).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `OfrecimientoTable.test.tsx` (antes del cierre del archivo):

```tsx
it('una fila de Cupo con detalle muestra el resumen de tramos', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'CUPO',
                    nombre: 'Plan cupo',
                    tipo: 'accion',
                    detalle: { tramos: [{ umbral: 2_500_000, descuentoPct: 3 }] },
                }),
            ]}
        />,
    )
    expect(screen.getByText('$2.500.000→3%')).toBeInTheDocument()
})

it('una fila con detalle pero sin módulo registrado para su código no rompe ni muestra nada', () => {
    render(
        <OfrecimientoTable
            filas={[
                fila({
                    codigo: 'PROMO',
                    nombre: 'Promo verano',
                    tipo: 'accion',
                    detalle: { algo: 'lo que sea' },
                }),
            ]}
        />,
    )
    expect(screen.getByText('Promo verano')).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/propuesta/OfrecimientoTable.test.tsx`
Expected: FAIL — el primer test no encuentra el texto del resumen (`ContenidoFila` todavía no lo
renderiza).

- [ ] **Step 3: Implementar el cambio en `OfrecimientoTable.tsx`**

Agregar el import al tope del archivo (junto a los demás imports):

```ts
import { registroDetalleAccion } from './accionDetalle/registro'
```

Y reemplazar `ContenidoFila` por:

```tsx
function ContenidoFila({ fila }: { fila: IOfrecimientoFila }) {
    const moduloDetalle = registroDetalleAccion[fila.codigo]
    return (
        <>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#182645]">{fila.nombre}</span>
                    {fila.tipo !== 'rubro' && (
                        <span className="shrink-0 rounded-full bg-[#EEF3FB] px-1.5 py-0.5 text-[10px] font-bold text-[#213D82]">
                            {TIPO_LABEL[fila.tipo]}
                        </span>
                    )}
                </div>
                {fila.alcance.length > 0 && (
                    <div className="truncate text-[11px] font-semibold text-dsmuted">
                        {resumenAlcance(fila.alcance)}
                    </div>
                )}
                {fila.detalle != null && moduloDetalle && (
                    <div className="truncate text-[11px] font-semibold text-dsmuted">
                        {moduloDetalle.resumen(fila.detalle)}
                    </div>
                )}
            </div>
            <Celda valor={fila.actual} promedio6m={fila.promedio6m} />
            <Celda valor={fila.mesAnterior} promedio6m={fila.promedio6m} />
            <Celda valor={fila.promedio6m} promedio6m={fila.promedio6m} referencia />
        </>
    )
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/propuesta/OfrecimientoTable.test.tsx`
Expected: PASS

- [ ] **Step 5: Correr la suite completa del repo**

Run: `npx vitest run`
Expected: PASS (todos los archivos, incluidos los tocados en las Tasks 1-3)

- [ ] **Step 6: Type-check y lint**

Run: `npx tsc -b --noEmit`
Expected: sin salida (sin errores)

Run: `npx oxlint`
Expected: sin warnings nuevos respecto a antes de este plan

- [ ] **Step 7: Commit**

```bash
git add src/components/propuesta/OfrecimientoTable.tsx src/components/propuesta/OfrecimientoTable.test.tsx
git commit -m "feat(ofrecimiento): muestra el resumen de detalle en la tabla"
```
