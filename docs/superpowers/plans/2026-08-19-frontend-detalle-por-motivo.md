# Detalle por motivo — Frontend (app-planificacion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada motivo dibuje su propio formulario de detalle —con sus campos, su fórmula y su
copy— en vez del panel fijo de marca/competidor/% cableado en `ResolucionOfrecimiento.tsx`.

**Architecture:** Un módulo por motivo, keyed por `IMotivo.codigo`, con la misma forma que
`registroDetalleAccion` (que ya existe y ya funciona para Cupo y Descuento). La parte pura de cada
módulo (`campos`, `esValido`, `resumen`) vive separada de su `Editor` para que `lib/` no tenga que
importar componentes React. Los valores dejan de ser tres campos fijos y pasan a un
`Record<campo, valor>` que viaja a `pl_ofrecimiento_motivo_campo`.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest + Testing Library, Tailwind.

**Spec:** [`../specs/2026-08-19-detalle-por-motivo-design.md`](../specs/2026-08-19-detalle-por-motivo-design.md)

## Prerrequisitos

1. **El plan de backend mergeado y desplegado.** Este plan consume `IMotivo.codigo` y
   `IOfrecimientoMotivo.valores` tal como los define
   [`2026-08-19-backend-detalle-por-motivo.md`](2026-08-19-backend-detalle-por-motivo.md). Hasta que
   el endpoint devuelva `codigo`, ningún motivo va a encontrar su módulo y el detalle no se dibuja.
2. **PR #17 mergeado** (ya está, commit `cb440cb`). Este plan reemplaza el panel de detalle que vive
   dentro de `renderMotivo()`, la función que ese PR dejó aislada.

## Global Constraints

- **Los valores derivados (`-13.3%`, `2.0%`) se calculan al mostrarlos, nunca se guardan.** Solo
  viajan los inputs.
- **La marca sale del catálogo** (`CatalogoPicker`), no de un input libre: es lo único que evita que
  convivan "Fric Rot", "fricrot" y "FRIC-ROT". `competidor` y `marca_trabaja` sí son texto libre —
  son marcas de afuera y no están en `fct_sales`.
- **Un borrador con la forma vieja se descarta, no rompe.** Los teléfonos tienen
  `{marca, competidor, pctDiferencia}` guardado en localStorage.
- **Lo histórico se dibuja desde los valores guardados, no desde el módulo vigente.** Un campo que
  se saque después igual tiene que verse en el detalle de una visita ya cerrada.
- No se toca el gate de Atrás/Siguiente ni el segmentado Objeción/Cierre: siguen funcionando igual,
  solo cambia de dónde sale "este motivo está incompleto".

---

### Task 1: Tipos nuevos y validadores puros

**Files:**
- Modify: `src/types/planificacion.ts`
- Create: `src/components/propuesta/detalleMotivo/validadores.ts`
- Create: `src/components/propuesta/detalleMotivo/validadores.test.ts`
- Modify: `src/lib/resolucionOfrecimiento.ts`
- Modify: `src/lib/resolucionOfrecimiento.test.ts`

**Interfaces:**
- Produces: `IMotivo.codigo` (reemplaza `requiereDetalle`), `IOfrecimientoMotivo.valores`
  (reemplaza los tres campos), `validadoresDetalleMotivo` y `motivoIncompleto` basado en él.
  Todo lo demás del plan depende de esto.

- [ ] **Step 1: Actualizar los tipos**

En `src/types/planificacion.ts`:

```ts
export interface IMotivo {
    motivoId: number
    nivel: NivelMotivo
    descripcion: string
    resultado: ResultadoMotivo | null
    /** Llave estable del módulo de detalle (PRECIO, PLAZO, FLETE, NO_TRABAJA). `null` = este
     *  motivo no pide nada. NO se usa motivoId: los ids difieren entre ambientes. */
    codigo: string | null
}

/** Un motivo aplicado a un ofrecimiento, con lo que pidió su módulo de detalle. Las claves
 *  son los `campo` que ese módulo declara; sin entrada = sin cargar. */
export interface IOfrecimientoMotivo {
    motivoId: number
    valores: Record<string, string | number | null>
}
```

- [ ] **Step 2: Escribir el test de los validadores (falla)**

Crear `src/components/propuesta/detalleMotivo/validadores.test.ts`:

```ts
import { validadoresDetalleMotivo } from './validadores'

describe('PRECIO', () => {
    const v = validadoresDetalleMotivo.PRECIO
    const completo = { marca: 'Fric-Rot', competidor: 'Corven', precio_competidor: 150, mi_precio: 130 }

    it('declara sus cuatro campos', () => {
        expect(v.campos).toEqual(['marca', 'competidor', 'precio_competidor', 'mi_precio'])
    })

    it('es válido con los cuatro cargados', () => {
        expect(v.esValido(completo)).toBe(true)
    })

    it('no es válido si falta uno', () => {
        expect(v.esValido({ ...completo, mi_precio: null })).toBe(false)
    })

    it('un texto en blanco no cuenta como cargado', () => {
        expect(v.esValido({ ...completo, competidor: '   ' })).toBe(false)
    })

    // El resumen es lo que ve gerencia en la tabla de ofrecimientos.
    it('resume contra quién y por cuánto', () => {
        expect(v.resumen(completo)).toBe('Fric-Rot vs. Corven · -13.3%')
    })
})

describe('PLAZO', () => {
    const v = validadoresDetalleMotivo.PLAZO

    it('pide los días', () => {
        expect(v.esValido({ plazo_dias: 30 })).toBe(true)
        expect(v.esValido({ plazo_dias: null })).toBe(false)
    })

    // Un plazo de 0 días no es un plazo: es no haber cargado nada.
    it('cero no es un plazo válido', () => {
        expect(v.esValido({ plazo_dias: 0 })).toBe(false)
    })

    it('resume con la unidad', () => {
        expect(v.resumen({ plazo_dias: 30 })).toBe('30 días')
    })
})

describe('FLETE', () => {
    const v = validadoresDetalleMotivo.FLETE

    it('pide los dos montos', () => {
        expect(v.esValido({ valor_flete: 60000, compra_futuro: 3000000 })).toBe(true)
        expect(v.esValido({ valor_flete: 60000 })).toBe(false)
    })

    it('resume con el peso del flete sobre la compra', () => {
        expect(v.resumen({ valor_flete: 60000, compra_futuro: 3000000 })).toBe('Flete 2.0% de la compra')
    })
})

describe('NO_TRABAJA', () => {
    const v = validadoresDetalleMotivo.NO_TRABAJA

    it('pide la marca que trabaja', () => {
        expect(v.esValido({ marca_trabaja: 'Corven' })).toBe(true)
        expect(v.esValido({})).toBe(false)
    })

    // `por_que` es contexto para leer, no para agrupar: no se exige.
    it('el porqué es opcional', () => {
        expect(v.esValido({ marca_trabaja: 'Corven', por_que: null })).toBe(true)
    })
})
```

- [ ] **Step 3: Correr y confirmar que falla**

Run: `npx vitest run validadores.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 4: Escribir los validadores**

Crear `src/components/propuesta/detalleMotivo/validadores.ts`:

```ts
import type { ICatalogoItem } from '@/types/planificacion'

/** Los valores de un motivo, por `campo`. Espeja la tabla pl_ofrecimiento_motivo_campo. */
export type ValoresMotivo = Record<string, string | number | null>

/** Props de cualquier Editor de detalle. Vive acá y no en un módulo concreto para que
 *  plazo.tsx no tenga que importarle el tipo a precio.tsx: son hermanos, ninguno depende del
 *  otro. Es solo una forma, no arrastra React. */
export interface IPropsEditorMotivo {
    valores: ValoresMotivo
    /** Recibe SOLO los campos que cambian; el llamador hace el merge. */
    onChange: (parcial: ValoresMotivo) => void
    /** Para los módulos que eligen de un catálogo. */
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
}

export interface IValidadorDetalleMotivo {
    /** Los `campo` que este motivo escribe, en orden de pantalla. */
    campos: string[]
    /** Habilita Atrás/Siguiente en el wizard: false = detalle a medias. */
    esValido: (valores: ValoresMotivo) => boolean
    /** Una línea para la tabla de ofrecimientos y el detalle de gerencia. */
    resumen: (valores: ValoresMotivo) => string
}

/** Sin React a propósito: `lib/resolucionOfrecimiento.ts` importa de acá, y arrastrar
 *  componentes a un módulo de lib obligaría a su test a montar React sin necesidad. Los
 *  Editors viven en `registro.tsx`. */
function cargado(valor: string | number | null | undefined): boolean {
    if (valor === null || valor === undefined) return false
    if (typeof valor === 'number') return Number.isFinite(valor) && valor !== 0
    return valor.trim() !== ''
}

function todos(valores: ValoresMotivo, campos: string[]): boolean {
    return campos.every(c => cargado(valores[c]))
}

/** Cuánto más barato (negativo) o caro (positivo) soy respecto del competidor. */
export function pctVsCompetidor(valores: ValoresMotivo): number | null {
    const suyo = Number(valores.precio_competidor)
    const mio = Number(valores.mi_precio)
    if (!Number.isFinite(suyo) || !Number.isFinite(mio) || suyo === 0) return null
    return ((mio - suyo) / suyo) * 100
}

/** Qué porcentaje de la compra futura se lleva el flete. */
export function pctFleteSobreCompra(valores: ValoresMotivo): number | null {
    const flete = Number(valores.valor_flete)
    const compra = Number(valores.compra_futuro)
    if (!Number.isFinite(flete) || !Number.isFinite(compra) || compra === 0) return null
    return (flete / compra) * 100
}

const CAMPOS_PRECIO = ['marca', 'competidor', 'precio_competidor', 'mi_precio']

export const validadoresDetalleMotivo: Record<string, IValidadorDetalleMotivo> = {
    PRECIO: {
        campos: CAMPOS_PRECIO,
        esValido: v => todos(v, CAMPOS_PRECIO),
        resumen: v => {
            const pct = pctVsCompetidor(v)
            const base = `${v.marca ?? ''} vs. ${v.competidor ?? ''}`.trim()
            return pct === null ? base : `${base} · ${pct.toFixed(1)}%`
        },
    },
    PLAZO: {
        campos: ['plazo_dias'],
        esValido: v => cargado(v.plazo_dias),
        resumen: v => `${v.plazo_dias} días`,
    },
    FLETE: {
        campos: ['valor_flete', 'compra_futuro'],
        esValido: v => todos(v, ['valor_flete', 'compra_futuro']),
        resumen: v => {
            const pct = pctFleteSobreCompra(v)
            return pct === null ? 'Flete' : `Flete ${pct.toFixed(1)}% de la compra`
        },
    },
    NO_TRABAJA: {
        campos: ['marca_trabaja', 'por_que'],
        esValido: v => cargado(v.marca_trabaja),
        resumen: v => `Trabaja ${v.marca_trabaja ?? ''}`.trim(),
    },
}
```

- [ ] **Step 5: Correr y confirmar que pasa**

Run: `npx vitest run validadores.test.ts`
Expected: PASS

- [ ] **Step 6: Reescribir el test de `motivoIncompleto` (falla)**

En `src/lib/resolucionOfrecimiento.test.ts`, reemplazar las fixtures y los tests de
`detalleCompleto` / `motivoIncompleto` por:

```ts
import { motivoIncompleto, tieneDetalleIncompleto, motivosIguales } from './resolucionOfrecimiento'
import type { IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 30, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', codigo: 'PRECIO' },
    { motivoId: 35, nivel: 'ofrecimiento', descripcion: 'Dto', resultado: 'ganado', codigo: null },
]

const completo: IOfrecimientoMotivo = {
    motivoId: 30,
    valores: { marca: 'Fric-Rot', competidor: 'Corven', precio_competidor: 150, mi_precio: 130 },
}

it('un motivo sin codigo nunca está incompleto: no pide nada', () => {
    expect(motivoIncompleto(motivos, [{ motivoId: 35, valores: {} }])).toBeNull()
})

it('señala CUÁL motivo tiene el detalle a medias', () => {
    const incompleto = { motivoId: 30, valores: { marca: 'Fric-Rot' } }
    expect(motivoIncompleto(motivos, [incompleto])?.descripcion).toBe('Precio')
})

it('con el detalle completo no señala nada', () => {
    expect(motivoIncompleto(motivos, [completo])).toBeNull()
})

// Un motivo cuyo codigo no tiene módulo registrado (catálogo por delante del deploy) no
// puede bloquear al vendedor: si no hay formulario que completar, no hay nada a medias.
it('un codigo sin módulo registrado no bloquea', () => {
    const raro: IMotivo[] = [{ ...motivos[0], codigo: 'TODAVIA_NO_EXISTE' }]
    expect(motivoIncompleto(raro, [{ motivoId: 30, valores: {} }])).toBeNull()
})

it('tieneDetalleIncompleto es el booleano de lo mismo', () => {
    expect(tieneDetalleIncompleto(motivos, [{ motivoId: 30, valores: {} }])).toBe(true)
    expect(tieneDetalleIncompleto(motivos, [completo])).toBe(false)
})

describe('motivosIguales', () => {
    it('compara los valores, no solo los ids', () => {
        const otro = { motivoId: 30, valores: { ...completo.valores, mi_precio: 999 } }
        expect(motivosIguales([completo], [otro])).toBe(false)
    })

    it('no depende del orden', () => {
        const a = [completo, { motivoId: 35, valores: {} }]
        const b = [{ motivoId: 35, valores: {} }, completo]
        expect(motivosIguales(a, b)).toBe(true)
    })
})
```

- [ ] **Step 7: Correr y confirmar que falla**

Run: `npx vitest run resolucionOfrecimiento.test.ts`
Expected: FAIL — `motivoIncompleto` todavía mira `requiereDetalle` y los tres campos.

- [ ] **Step 8: Reescribir `lib/resolucionOfrecimiento.ts`**

Reemplazar el contenido completo:

```ts
import { validadoresDetalleMotivo } from '@/components/propuesta/detalleMotivo/validadores'
import type { IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

/** El motivo tildado cuyo módulo dice que le falta algo, o null. Se usa para señalar CUÁL
 *  falta completar, no solo que falta algo.
 *
 *  Un motivo sin `codigo`, o con un `codigo` que todavía no tiene módulo (el catálogo puede
 *  ir por delante del deploy), NUNCA bloquea: si no hay formulario, no hay nada a medias. */
export function motivoIncompleto(
    motivos: IMotivo[],
    value: IOfrecimientoMotivo[],
): IMotivo | null {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    return (
        motivos.find(cat => {
            const seleccionado = porId.get(cat.motivoId)
            if (!seleccionado) return false
            const modulo = cat.codigo ? validadoresDetalleMotivo[cat.codigo] : undefined
            return !!modulo && !modulo.esValido(seleccionado.valores)
        }) ?? null
    )
}

export function tieneDetalleIncompleto(
    motivos: IMotivo[],
    value: IOfrecimientoMotivo[],
): boolean {
    return motivoIncompleto(motivos, value) !== null
}

/** Compara dos listas por contenido, sin importar el orden. La usa VisitaSheet para saber si
 *  un ofrecimiento tiene cambios sin guardar (borrador vs. lo persistido). */
export function motivosIguales(a: IOfrecimientoMotivo[], b: IOfrecimientoMotivo[]): boolean {
    if (a.length !== b.length) return false
    const porId = new Map(a.map(m => [m.motivoId, m]))
    return b.every(m => {
        const otro = porId.get(m.motivoId)
        if (!otro) return false
        const claves = new Set([...Object.keys(otro.valores), ...Object.keys(m.valores)])
        return [...claves].every(k => (otro.valores[k] ?? null) === (m.valores[k] ?? null))
    })
}
```

- [ ] **Step 9: Correr los dos tests**

Run: `npx vitest run validadores.test.ts resolucionOfrecimiento.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/types/planificacion.ts src/components/propuesta/detalleMotivo src/lib/resolucionOfrecimiento.ts src/lib/resolucionOfrecimiento.test.ts
git commit -m "feat(resolucion): validadores de detalle por motivo y tipos nuevos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: El módulo de Precio

**Files:**
- Create: `src/components/propuesta/detalleMotivo/precio.tsx`
- Create: `src/components/propuesta/detalleMotivo/precio.test.tsx`
- Create: `src/components/propuesta/detalleMotivo/registro.ts`

**Interfaces:**
- Consumes: `ValoresMotivo` y `pctVsCompetidor` (Task 1).
- Produces: `IPropsEditorMotivo` y `registroDetalleMotivo` — el contrato que consumen los módulos
  de la Task 3 y el render de la Task 4.

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/components/propuesta/detalleMotivo/precio.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { EditorPrecio } from './precio'
import type { ICatalogoItem } from '@/types/planificacion'

const marcas: ICatalogoItem[] = [
    { code: 'FR', description: 'Fric-Rot' },
    { code: 'FX', description: 'Fremax' },
]

function setup(valores: Record<string, string | number | null> = {}) {
    const onChange = vi.fn()
    render(<EditorPrecio valores={valores} onChange={onChange} marcas={marcas} />)
    return { onChange }
}

it('la marca se elige del catálogo, no se escribe', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Marca'))
    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
})

it('elegir la marca la guarda por su descripción', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText('Marca'))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChange).toHaveBeenCalledWith({ marca: 'Fric-Rot' })
})

// Es una marca de afuera: no está en fct_sales, así que no hay catálogo que ofrecer.
it('el competidor es texto libre', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText(/nombre del competidor/i), {
        target: { value: 'Corven' },
    })
    expect(onChange).toHaveBeenCalledWith({ competidor: 'Corven' })
})

it('los precios se guardan como número', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText(/precio del competidor/i), { target: { value: '150' } })
    expect(onChange).toHaveBeenCalledWith({ precio_competidor: 150 })
})

describe('el % contra el competidor', () => {
    it('no se muestra hasta tener los dos precios', () => {
        setup({ precio_competidor: 150 })
        expect(screen.queryByText(/más barato|más caro/i)).not.toBeInTheDocument()
    })

    it('más barato se anuncia como tal', () => {
        setup({ precio_competidor: 150, mi_precio: 130 })
        expect(screen.getByText(/-13\.3% más barato que el competidor/i)).toBeInTheDocument()
    })

    it('más caro también, para que el vendedor lo vea antes de ofrecer', () => {
        setup({ precio_competidor: 130, mi_precio: 150 })
        expect(screen.getByText(/15\.4% más caro que el competidor/i)).toBeInTheDocument()
    })

    // Dividir por cero no puede pintar NaN en pantalla.
    it('con el precio del competidor en cero no muestra nada', () => {
        setup({ precio_competidor: 0, mi_precio: 150 })
        expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Correr y confirmar que falla**

Run: `npx vitest run precio.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `src/components/propuesta/detalleMotivo/precio.tsx`:

```tsx
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from '../CatalogoPicker'
import { pctVsCompetidor, type IPropsEditorMotivo } from './validadores'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

function aNumero(texto: string): number | null {
    const limpio = texto.replace(/[^0-9.]/g, '')
    return limpio === '' ? null : Number(limpio)
}

/** Precio: contra qué marca, contra quién, y a cuánto cada uno. El % NO se tipea — se deriva
 *  de los dos precios, así queda el dato completo y no solo el delta. */
export function EditorPrecio({ valores, onChange, marcas, marcasLoading }: IPropsEditorMotivo) {
    const [buscadorAbierto, setBuscadorAbierto] = useState(false)
    const pct = pctVsCompetidor(valores)

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
                <span className={LABEL}>Marca</span>
                {buscadorAbierto ? (
                    <CatalogoPicker
                        items={marcas}
                        loading={marcasLoading}
                        value={(valores.marca as string) ?? null}
                        onSelect={item => {
                            onChange({ marca: item.description })
                            setBuscadorAbierto(false)
                        }}
                        placeholder="Buscar marca…"
                        autoFocus
                        ocultarContadorRestantes
                    />
                ) : (
                    <button
                        type="button"
                        aria-label="Marca"
                        onClick={() => setBuscadorAbierto(true)}
                        className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                    >
                        <span
                            className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                valores.marca ? 'text-[#182645]' : 'text-[#8A93A6]'
                            }`}
                        >
                            {(valores.marca as string) ?? 'Elegí una marca'}
                        </span>
                        {valores.marca && (
                            <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                        )}
                        <ChevronDown className="h-4 w-4 shrink-0 text-dsmuted" strokeWidth={2.4} />
                    </button>
                )}
            </div>

            <label className="flex flex-col gap-1">
                <span className={LABEL}>Nombre del competidor</span>
                <input
                    value={(valores.competidor as string) ?? ''}
                    onChange={e => onChange({ competidor: e.target.value })}
                    placeholder="Ej. Corven"
                    className={INPUT}
                />
            </label>

            <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={LABEL}>Precio del competidor</span>
                    <input
                        value={(valores.precio_competidor as number) ?? ''}
                        onChange={e => onChange({ precio_competidor: aNumero(e.target.value) })}
                        inputMode="decimal"
                        className={INPUT}
                    />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={LABEL}>Mi precio</span>
                    <input
                        value={(valores.mi_precio as number) ?? ''}
                        onChange={e => onChange({ mi_precio: aNumero(e.target.value) })}
                        inputMode="decimal"
                        className={INPUT}
                    />
                </label>
            </div>

            {/* Verde cuando somos más baratos, ámbar cuando no: el vendedor tiene que ver de
             *  qué lado está parado ANTES de ofrecer, no después. */}
            {pct !== null && (
                <p
                    className={`rounded-[10px] px-3 py-2 text-center text-[12.5px] font-bold ${
                        pct <= 0 ? 'bg-[#EAFBF1] text-[#047857]' : 'bg-[#FEF9E8] text-[#B45309]'
                    }`}
                >
                    {pct.toFixed(1)}% más {pct <= 0 ? 'barato' : 'caro'} que el competidor
                </p>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Crear el registro**

Crear `src/components/propuesta/detalleMotivo/registro.ts`:

```ts
import type { ComponentType } from 'react'
import { EditorPrecio } from './precio'
import type { IPropsEditorMotivo } from './validadores'

export type { IPropsEditorMotivo }

/** Un módulo por motivo, buscado por `IMotivo.codigo`. Sumar un motivo con detalle es un
 *  archivo como precio.tsx más una entrada acá — no se toca ResolucionOfrecimiento.
 *
 *  La parte pura (campos/esValido/resumen) vive en `validadores.ts`, que `lib/` importa sin
 *  arrastrar React. Acá viven solo los Editors. */
export const registroDetalleMotivo: Record<string, ComponentType<IPropsEditorMotivo>> = {
    PRECIO: EditorPrecio,
}
```

- [ ] **Step 5: Correr y confirmar que pasa**

Run: `npx vitest run precio.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/propuesta/detalleMotivo
git commit -m "feat(resolucion): módulo de detalle de Precio con el % derivado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Los módulos de Plazo, Flete y No trabaja

**Files:**
- Create: `src/components/propuesta/detalleMotivo/plazo.tsx`
- Create: `src/components/propuesta/detalleMotivo/flete.tsx`
- Create: `src/components/propuesta/detalleMotivo/noTrabaja.tsx`
- Create: `src/components/propuesta/detalleMotivo/modulos.test.tsx`
- Modify: `src/components/propuesta/detalleMotivo/registro.ts`

**Interfaces:**
- Consumes: `IPropsEditorMotivo` (Task 2), `pctFleteSobreCompra` (Task 1).
- Produces: las tres entradas restantes de `registroDetalleMotivo`.

- [ ] **Step 1: Escribir el test (falla)**

Crear `src/components/propuesta/detalleMotivo/modulos.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { EditorPlazo } from './plazo'
import { EditorFlete } from './flete'
import { EditorNoTrabaja } from './noTrabaja'

const props = { marcas: [], onChange: vi.fn() }

describe('Plazo', () => {
    it('guarda los días como número', () => {
        const onChange = vi.fn()
        render(<EditorPlazo {...props} valores={{}} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/plazo solicitado/i), { target: { value: '30' } })
        expect(onChange).toHaveBeenCalledWith({ plazo_dias: 30 })
    })
})

describe('Flete', () => {
    it('guarda los dos montos como número', () => {
        const onChange = vi.fn()
        render(<EditorFlete {...props} valores={{}} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/valor del flete/i), { target: { value: '60000' } })
        expect(onChange).toHaveBeenCalledWith({ valor_flete: 60000 })
    })

    it('muestra cuánto pesa el flete sobre la compra', () => {
        render(<EditorFlete {...props} valores={{ valor_flete: 60000, compra_futuro: 3000000 }} />)
        expect(screen.getByText(/el flete representa el 2\.0% de la compra/i)).toBeInTheDocument()
    })

    it('sin la compra cargada no muestra el porcentaje', () => {
        render(<EditorFlete {...props} valores={{ valor_flete: 60000 }} />)
        expect(screen.queryByText(/representa/i)).not.toBeInTheDocument()
    })
})

describe('No trabaja la marca', () => {
    it('guarda qué marca trabaja', () => {
        const onChange = vi.fn()
        render(<EditorNoTrabaja {...props} valores={{}} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/qué marca trabaja/i), { target: { value: 'Corven' } })
        expect(onChange).toHaveBeenCalledWith({ marca_trabaja: 'Corven' })
    })

    it('el porqué es un textarea: es contexto para leer, no un dato corto', () => {
        render(<EditorNoTrabaja {...props} valores={{}} />)
        expect(screen.getByLabelText(/por qué/i).tagName).toBe('TEXTAREA')
    })
})
```

- [ ] **Step 2: Correr y confirmar que falla**

Run: `npx vitest run modulos.test.tsx`
Expected: FAIL — los tres módulos no existen.

- [ ] **Step 3: Escribir `plazo.tsx`**

```tsx
import type { IPropsEditorMotivo } from './validadores'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

/** Un plazo es una cantidad de días (30, 40, 1). Se guarda como número y no como texto para
 *  que se pueda promediar — es la diferencia entre poder responder "cuántos días piden en
 *  promedio" y no poder. */
export function EditorPlazo({ valores, onChange }: IPropsEditorMotivo) {
    return (
        <label className="flex flex-col gap-1">
            <span className={LABEL}>Plazo solicitado</span>
            <input
                value={(valores.plazo_dias as number) ?? ''}
                onChange={e => {
                    const limpio = e.target.value.replace(/[^0-9]/g, '')
                    onChange({ plazo_dias: limpio === '' ? null : Number(limpio) })
                }}
                inputMode="numeric"
                placeholder="Ej. 30"
                className={INPUT}
            />
        </label>
    )
}
```

- [ ] **Step 4: Escribir `flete.tsx`**

```tsx
import { pctFleteSobreCompra, type IPropsEditorMotivo } from './validadores'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

function aNumero(texto: string): number | null {
    const limpio = texto.replace(/[^0-9.]/g, '')
    return limpio === '' ? null : Number(limpio)
}

/** Flete: cuánto cuesta contra cuánto se compraría. El % es el argumento de venta —
 *  "$60.000 de flete" no dice nada solo; "el 2% de la compra" sí. */
export function EditorFlete({ valores, onChange }: IPropsEditorMotivo) {
    const pct = pctFleteSobreCompra(valores)

    return (
        <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
                <span className={LABEL}>Valor del flete</span>
                <input
                    value={(valores.valor_flete as number) ?? ''}
                    onChange={e => onChange({ valor_flete: aNumero(e.target.value) })}
                    inputMode="decimal"
                    className={INPUT}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className={LABEL}>Compra en $ a futuro</span>
                <input
                    value={(valores.compra_futuro as number) ?? ''}
                    onChange={e => onChange({ compra_futuro: aNumero(e.target.value) })}
                    inputMode="decimal"
                    className={INPUT}
                />
            </label>
            {pct !== null && (
                <p className="rounded-[10px] bg-[#FEF9E8] px-3 py-2 text-center text-[12.5px] font-bold text-[#B45309]">
                    El flete representa el {pct.toFixed(1)}% de la compra
                </p>
            )}
        </div>
    )
}
```

- [ ] **Step 5: Escribir `noTrabaja.tsx`**

```tsx
import type { IPropsEditorMotivo } from './validadores'

const INPUT =
    'w-full rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-sm font-semibold text-[#182645] outline-none'
const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]'

/** Qué marca trabaja el cliente y por qué. `marca_trabaja` es texto libre y no catálogo: es
 *  una marca de la competencia, no está en fct_sales. `por_que` es lo único deliberadamente
 *  no analizable del dominio — contexto para leer, no para agrupar. */
export function EditorNoTrabaja({ valores, onChange }: IPropsEditorMotivo) {
    return (
        <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
                <span className={LABEL}>¿Qué marca trabaja?</span>
                <input
                    value={(valores.marca_trabaja as string) ?? ''}
                    onChange={e => onChange({ marca_trabaja: e.target.value })}
                    placeholder="Ej. Corven"
                    className={INPUT}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className={LABEL}>¿Por qué?</span>
                <textarea
                    value={(valores.por_que as string) ?? ''}
                    onChange={e => onChange({ por_que: e.target.value })}
                    placeholder="Motivo del cliente"
                    rows={3}
                    className={`${INPUT} resize-none`}
                />
            </label>
        </div>
    )
}
```

- [ ] **Step 6: Registrar los tres**

En `src/components/propuesta/detalleMotivo/registro.ts`:

```ts
import type { ComponentType } from 'react'
import { EditorPrecio } from './precio'
import type { IPropsEditorMotivo } from './validadores'
import { EditorPlazo } from './plazo'
import { EditorFlete } from './flete'
import { EditorNoTrabaja } from './noTrabaja'

export type { IPropsEditorMotivo }

export const registroDetalleMotivo: Record<string, ComponentType<IPropsEditorMotivo>> = {
    PRECIO: EditorPrecio,
    PLAZO: EditorPlazo,
    FLETE: EditorFlete,
    NO_TRABAJA: EditorNoTrabaja,
}
```

- [ ] **Step 7: Correr y confirmar que pasa**

Run: `npx vitest run modulos.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/propuesta/detalleMotivo
git commit -m "feat(resolucion): módulos de detalle de Plazo, Flete y No trabaja la marca

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `ResolucionOfrecimiento` dibuja el módulo del motivo

**Files:**
- Modify: `src/components/propuesta/ResolucionOfrecimiento.tsx`
- Modify: `src/components/propuesta/ResolucionOfrecimiento.test.tsx`

**Interfaces:**
- Consumes: `registroDetalleMotivo` (Tasks 2 y 3), `IMotivo.codigo` (Task 1).
- Produces: ningún cambio en las props del componente — sigue recibiendo `motivos`, `marcas`,
  `value`, `onChange`, etc. Solo cambia qué dibuja adentro de `renderMotivo`.

- [ ] **Step 1: Ajustar las fixtures y agregar los tests (falla)**

En `src/components/propuesta/ResolucionOfrecimiento.test.tsx`, cambiar las fixtures de `motivos`
para usar `codigo` en vez de `requiereDetalle` (el de Precio pasa a `codigo: 'PRECIO'`, el resto
`codigo: null`) y todos los `value` para usar `valores: {}` en vez de los tres campos. Después
reemplazar los tests del detalle por:

```tsx
describe('el detalle lo dibuja el módulo del motivo', () => {
    it('sin el motivo tildado no se dibuja nada', () => {
        setup()
        expect(screen.queryByLabelText('Marca')).not.toBeInTheDocument()
    })

    it('tildar Precio dibuja su módulo', () => {
        setup([{ motivoId: 20, valores: {} }])
        expect(screen.getByLabelText('Marca')).toBeInTheDocument()
        expect(screen.getByLabelText(/nombre del competidor/i)).toBeInTheDocument()
    })

    // Un motivo sin codigo no tiene formulario: el checkbox es todo lo que hay.
    it('un motivo sin codigo no dibuja detalle', () => {
        setup([{ motivoId: 21, valores: {} }])
        expect(screen.queryByLabelText(/nombre del competidor/i)).not.toBeInTheDocument()
    })

    // El catálogo puede tener un codigo cuyo módulo todavía no se deployó. No puede romper la
    // pantalla: se dibuja el motivo sin su detalle.
    it('un codigo sin módulo registrado no rompe: dibuja el motivo sin detalle', () => {
        const raros = motivos.map(m =>
            m.motivoId === 20 ? { ...m, codigo: 'TODAVIA_NO_EXISTE' } : m,
        )
        setup([{ motivoId: 20, valores: {} }], { motivos: raros })
        expect(screen.getByText('Precio')).toBeInTheDocument()
        expect(screen.queryByLabelText('Marca')).not.toBeInTheDocument()
    })

    it('lo que carga el módulo viaja mergeado con lo que ya había', () => {
        const { onChange } = setup([{ motivoId: 20, valores: { marca: 'Fric-Rot' } }])
        fireEvent.change(screen.getByLabelText(/nombre del competidor/i), {
            target: { value: 'Corven' },
        })
        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 20, valores: { marca: 'Fric-Rot', competidor: 'Corven' } },
        ])
    })
})
```

- [ ] **Step 2: Correr y confirmar que falla**

Run: `npx vitest run ResolucionOfrecimiento.test.tsx`
Expected: FAIL — el panel sigue siendo el fijo de marca/competidor/%.

- [ ] **Step 3: Reemplazar el panel cableado por el módulo**

En `src/components/propuesta/ResolucionOfrecimiento.tsx`:

Agregar el import:

```ts
import { registroDetalleMotivo } from './detalleMotivo/registro'
```

Reemplazar `setDetalle` por el merge de valores:

```ts
    /** El módulo manda solo los campos que tocó; acá se mergean con lo que ya tenía ese
     *  motivo. Así un Editor no necesita conocer el resto del formulario. */
    function setValores(motivoId: number, parcial: Record<string, string | number | null>) {
        onChange(
            value.map(m =>
                m.motivoId !== motivoId ? m : { ...m, valores: { ...m.valores, ...parcial } },
            ),
        )
    }
```

Reemplazar el bloque `{cat.requiereDetalle && on && (...)}` completo dentro de `renderMotivo` por:

```tsx
                {on && Editor && (
                    <div
                        className="animate-panel-in ml-8 mt-2 mb-0.5 rounded-[10px] border-[1.5px] bg-white p-2.5"
                        style={{ borderColor: color.border }}
                    >
                        <Editor
                            valores={seleccionado!.valores}
                            onChange={parcial => setValores(cat.motivoId, parcial)}
                            marcas={marcas}
                            marcasLoading={marcasLoading}
                        />
                    </div>
                )}
```

Y arriba de ese `return`, dentro de `renderMotivo`, resolver el módulo:

```ts
        // Un codigo sin módulo registrado (catálogo por delante del deploy) dibuja el motivo
        // sin detalle en vez de romper la pantalla.
        const Editor = cat.codigo ? registroDetalleMotivo[cat.codigo] : undefined
```

Finalmente, cambiar la condición del `col-span-2` para que use el módulo en vez de
`requiereDetalle`:

```tsx
                className={`flex flex-col gap-0 ${Editor && on ? 'col-span-2' : ''}`}
```

Actualizar `toggle` para la forma nueva — es el único otro lugar que construye un
`IOfrecimientoMotivo`. Reemplazar las dos apariciones de `{ motivoId, ...VACIO }` por
`{ motivoId, valores: {} }`:

```ts
        const compatibles = value.filter(m =>
            conviven(resultadoPorId.get(m.motivoId) ?? null, resultadoNuevo),
        )
        onChange([...compatibles, { motivoId, valores: {} }])
```

Con esto quedan **sin uso** y hay que eliminarlos: la constante `VACIO`, el import de
`CatalogoPicker`, `ChevronDown` de lucide, el estado `marcaAbierta`, el `panelRef`, el `useEffect`
del `scrollIntoView` y la función `setDetalle` vieja. El módulo de Precio ya trae su propio picker
con su propio scroll. `Check` **sí sigue en uso** (el tilde del checkbox del motivo), no borrarlo.

- [ ] **Step 4: Correr y confirmar que pasa**

Run: `npx vitest run ResolucionOfrecimiento.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/ResolucionOfrecimiento.tsx src/components/propuesta/ResolucionOfrecimiento.test.tsx
git commit -m "feat(resolucion): el detalle lo dibuja el módulo del motivo, no un panel fijo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Borradores viejos, analítica y mocks

**Files:**
- Modify: `src/lib/resolucionDraft.ts`
- Modify: `src/lib/resolucionDraft.test.ts`
- Modify: `src/components/analitica/DetalleVisitaPanel.tsx`
- Modify: `src/types/analitica.ts`
- Modify: `src/mocks/analiticaMock.ts`
- Modify: `src/components/VisitaSheet.test.tsx`, `src/components/propuesta/ResolucionWizard.test.tsx`, `src/hooks/useOfrecimientos.test.tsx`, `src/api/planificacion.test.ts`

**Interfaces:**
- Consumes: `IOfrecimientoMotivo.valores` (Task 1).
- Produces: nada nuevo. Cierra los usos que quedaron con la forma vieja.

- [ ] **Step 1: Escribir el test del borrador viejo (falla)**

En `src/lib/resolucionDraft.test.ts`:

```ts
// Los teléfonos tienen guardado {marca, competidor, pctDiferencia}. Es JSON válido, así que
// el try/catch no lo ataja: hay que reconocer la forma. Si se colara, el primer render
// explota al leer `valores` de undefined.
it('descarta un borrador con la forma vieja, sin romper', () => {
    localStorage.setItem(
        'visita-borrador-42',
        JSON.stringify({ 7: [{ motivoId: 13, marca: 'X', competidor: 'Y', pctDiferencia: 12 }] }),
    )
    expect(leerBorrador(42)).toBeNull()
})

it('lee un borrador con la forma nueva', () => {
    const nuevo = { 7: [{ motivoId: 30, valores: { marca: 'Fric-Rot' } }] }
    localStorage.setItem('visita-borrador-42', JSON.stringify(nuevo))
    expect(leerBorrador(42)).toEqual(nuevo)
})

it('un borrador vacío sigue siendo válido', () => {
    localStorage.setItem('visita-borrador-42', JSON.stringify({ 7: [] }))
    expect(leerBorrador(42)).toEqual({ 7: [] })
})
```

- [ ] **Step 2: Correr y confirmar que falla**

Run: `npx vitest run resolucionDraft.test.ts`
Expected: FAIL — `leerBorrador` devuelve el borrador viejo tal cual.

- [ ] **Step 3: Descartar el borrador viejo**

En `src/lib/resolucionDraft.ts`, reemplazar `leerBorrador`:

```ts
/** Un motivo de la forma nueva trae `valores`; el de la vieja traía marca/competidor/
 *  pctDiferencia sueltos. Los dos son JSON válido, así que el try/catch no alcanza. */
function esFormaNueva(borrador: unknown): boolean {
    if (typeof borrador !== 'object' || borrador === null) return false
    return Object.values(borrador as Record<string, unknown>).every(
        lista =>
            Array.isArray(lista) &&
            lista.every(m => typeof m === 'object' && m !== null && 'valores' in m),
    )
}

/** null si no hay borrador guardado, si lo que hay no es JSON válido, o si tiene la forma
 *  anterior al detalle por motivo: en cualquiera de los tres casos se arranca en limpio desde
 *  los motivos que ya trae el servidor. Descartar es correcto y no una pérdida: lo que estaba
 *  guardado contra el servidor sigue estando. */
export function leerBorrador(visitaId: number): Borrador | null {
    const raw = localStorage.getItem(key(visitaId))
    if (raw == null) return null
    try {
        const parsed = JSON.parse(raw) as Borrador
        return esFormaNueva(parsed) ? parsed : null
    } catch {
        return null
    }
}
```

- [ ] **Step 4: Actualizar la analítica**

En `src/types/analitica.ts` (~línea 122), reemplazar las tres propiedades por:

```ts
    /** Los valores tal como se guardaron. NO se filtran contra el módulo vigente: un campo
     *  que se sacó después igual tiene que verse en una visita ya cerrada. */
    valores: Record<string, string | number | null>
```

En `src/components/analitica/DetalleVisitaPanel.tsx` (~línea 130), reemplazar las tres líneas de
`m.marca` / `m.competidor` / `m.pctDiferencia` por el resumen del módulo, con fallback:

```tsx
                                    {r.motivos.map((m, i) => (
                                        <p key={i} className="mt-1 text-xs text-slate-600">
                                            {m.descripcion} · {etiqueta(m.resultado)}
                                            {resumenValores(m.valores) && ` · ${resumenValores(m.valores)}`}
                                        </p>
                                    ))}
```

Y arriba del componente:

```tsx
/** Los valores guardados, en una línea. Se listan tal cual vinieron y NO se piden al módulo
 *  del motivo: el módulo dice qué preguntar hoy, y esto es historia — un campo que se sacó
 *  después tiene que seguir viéndose. Mismo criterio que `incluirInactivos` en el backend. */
function resumenValores(valores: Record<string, string | number | null>): string {
    return Object.entries(valores)
        .filter(([, v]) => v !== null && v !== '')
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(' · ')
}
```

- [ ] **Step 5: Actualizar el mock de analítica**

En `src/mocks/analiticaMock.ts`, reemplazar los dos bloques que arman `marca`/`competidor`/
`pctDiferencia` (~líneas 500 y 528) por `valores`:

```ts
                                  valores:
                                      fila.resultado === 'perdido'
                                          ? { marca: 'YPF', competidor: 'Shell', precio_competidor: 150, mi_precio: 130 }
                                          : {},
```

y

```ts
                        valores: {},
```

- [ ] **Step 6: Correr toda la suite y cerrar lo que quede**

Run: `npx vitest run`
Expected: fallan los tests que todavía construyen motivos con la forma vieja
(`VisitaSheet.test.tsx`, `ResolucionWizard.test.tsx`, `useOfrecimientos.test.tsx`,
`planificacion.test.ts`). En todos, reemplazar
`{ motivoId: N, marca: null, competidor: null, pctDiferencia: null }` por
`{ motivoId: N, valores: {} }`, y las fixtures de `IMotivo` que usen `requiereDetalle` por `codigo`.

Repetir hasta que la suite quede verde.

- [ ] **Step 7: Typecheck y lint**

Run: `npx tsc -b --noEmit && npx oxlint src`
Expected: `tsc` sin salida; `oxlint` exit 0 (las 10 warnings de `only-export-components` son
preexistentes — `precio.tsx` exporta el tipo `IPropsEditorMotivo` además del componente, así que
puede sumar una: es aceptable y consistente con `cupo.tsx`/`descuento.tsx`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(resolucion): descartar borradores viejos y adaptar analítica y mocks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Verificación manual

Con `npm run dev`, entrar a una visita y resolver un rubro:

- Tildar **Precio** abre marca (catálogo), competidor, los dos precios, y la banda con el % —
  verde si sos más barato, ámbar si más caro.
- Tildar **Plazo** pide solo los días.
- Tildar **Flete** muestra "El flete representa el X% de la compra".
- Tildar **No trabaja la marca** pide qué marca y el porqué en textarea.
- Con un detalle a medias, **Atrás y Siguiente quedan bloqueados** y el aviso nombra el motivo.
- Cerrar la visita y volver a abrirla: los valores siguen ahí.
