# Resolución del ofrecimiento: bloques Objeción/Cierre/Pendientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reordenar el formulario de resolución de un rubro — Marca primero, sin bloque de Acción
Comercial, y el checklist "Resolución" agrupado en 3 bloques por `resultado` del motivo (Objeción /
Cierre / Pendientes) en vez del grid plano actual.

**Architecture:** Cambio contenido en dos componentes existentes: `ResolucionOfrecimiento.tsx`
(presentacional, recibe el catálogo por props) y `ResolucionWizard.tsx` (su wrapper, que hoy le
pasa `acciones`/`onAplicarAccion`). No hay componentes nuevos ni cambios de tipos ni de API — el
catálogo de motivos sigue viniendo de `useMotivos`/`pl_motivo` tal cual, agrupado en el front por
el campo `resultado` que ya trae cada `IMotivo`.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, Tailwind (clases inline, sin CSS
aparte).

## Global Constraints

- No se toca `api-vendedores` ni ningún endpoint — el catálogo de motivos ya viaja completo.
- No se purga `IAccionComercial` / el campo `accion` del resto del código (`useOfrecimientos`,
  `OfrecimientoTable`, `VisitaSheet`, `VisitaFlow`) — Marca sigue viajando sobre ese mismo objeto.
- El color de cada motivo sigue saliendo de `colorDeResultado(resultado)` — no se toca esa función.
- El detalle expandible (Marca/Competidor/%) sigue atado a `requiereDetalle`, nunca al nombre del
  motivo.
- La regla "un solo bucket de resultado a la vez" (motivos del mismo bucket conviven, de otro
  bucket reemplazan) no cambia — sigue viviendo en `toggle()`.

---

### Task 1: `ResolucionOfrecimiento` — sacar Acción Comercial, reordenar Marca, agrupar Resolución en 3 bloques

**Files:**
- Modify: `src/components/propuesta/ResolucionOfrecimiento.tsx`
- Test: `src/components/propuesta/ResolucionOfrecimiento.test.tsx`

**Interfaces:**
- Consumes: `IMotivo`, `ICatalogoItem`, `IAccionComercial`, `IOfrecimientoMotivo`, `ResultadoMotivo`
  (todos ya definidos en `src/types/planificacion.ts`, sin cambios).
- Produces: la nueva prop shape de `ResolucionOfrecimiento` — **quita** `acciones: ICatalogoItem[]`
  y `onAplicarAccion?: () => void`; todo lo demás (`motivos`, `marcas`, `marcasLoading`, `accion`,
  `onChangeAccion`, `value`, `onChange`, `rubrosRestantes`, `onAplicarMarca`) queda igual. Task 2
  depende de esta shape para actualizar `ResolucionWizard`.

- [ ] **Step 1: Reescribir el test para la nueva shape y agrupación (falla a propósito)**

Reemplazar el contenido completo de `src/components/propuesta/ResolucionOfrecimiento.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionOfrecimiento from './ResolucionOfrecimiento'
import type { ICatalogoItem, IMotivo, IOfrecimientoMotivo } from '@/types/planificacion'

// Nombres alineados al catálogo real (Objeción/Cierre/Pendientes) — el componente no
// hardcodea ninguno, así que estos IDs y descripciones son arbitrarios a propósito.
const motivos: IMotivo[] = [
    { motivoId: 20, nivel: 'ofrecimiento', descripcion: 'Precio', resultado: 'perdido', requiereDetalle: true },
    { motivoId: 21, nivel: 'ofrecimiento', descripcion: 'DS 100%', resultado: 'perdido', requiereDetalle: false },
    { motivoId: 22, nivel: 'ofrecimiento', descripcion: 'Dto', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 23, nivel: 'ofrecimiento', descripcion: 'Plazo', resultado: 'ganado', requiereDetalle: false },
    { motivoId: 24, nivel: 'ofrecimiento', descripcion: 'Cupo', resultado: 'diferido', requiereDetalle: false },
]

const marcas: ICatalogoItem[] = [
    { code: 'FR', description: 'Fric-Rot' },
    { code: 'FX', description: 'Fremax' },
]

function setup(value: IOfrecimientoMotivo[] = [], over: Record<string, unknown> = {}) {
    const onChange = vi.fn()
    const onChangeAccion = vi.fn()
    render(
        <ResolucionOfrecimiento
            motivos={motivos}
            marcas={marcas}
            accion={null}
            onChangeAccion={onChangeAccion}
            value={value}
            onChange={onChange}
            {...over}
        />,
    )
    return { onChange, onChangeAccion }
}

it('renderiza el catálogo recibido, sin nombres hardcodeados', () => {
    setup()
    expect(screen.getByText('Precio')).toBeInTheDocument()
    expect(screen.getByText('Cupo')).toBeInTheDocument()
    // "Poco trabajo" / "Estoy completo" eran del prototipo y NO están en el catálogo.
    expect(screen.queryByText('Poco trabajo')).not.toBeInTheDocument()
})

it('no muestra el bloque de Acción Comercial', () => {
    setup()
    expect(screen.queryByText(/acción comercial/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sin acción/i })).not.toBeInTheDocument()
})

it('Marca aparece antes que Resolución', () => {
    setup()
    const marca = screen.getByLabelText('Marca')
    const objecion = screen.getByText('Objeción')
    // compareDocumentPosition: Node.DOCUMENT_POSITION_FOLLOWING (4) = marca va antes.
    expect(marca.compareDocumentPosition(objecion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('tildar un motivo lo agrega con los detalles en null', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Precio'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 20, marca: null, competidor: null, pctDiferencia: null },
    ])
})

it('destildar un motivo lo saca', () => {
    const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByText('Precio'))
    expect(onChange).toHaveBeenCalledWith([])
})

it('el detalle aparece por requiereDetalle, no por el nombre del motivo', () => {
    setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    expect(screen.getByLabelText('Marca del motivo')).toBeInTheDocument()
    expect(screen.getByLabelText(/competidor/i)).toBeInTheDocument()
})

it('la marca del motivo se elige del catálogo, no se escribe', () => {
    setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByLabelText('Marca del motivo'))
    expect(screen.getByText('Fric-Rot')).toBeInTheDocument()
})

it('elegir una marca la guarda por su descripción', () => {
    const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.click(screen.getByLabelText('Marca del motivo'))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 20, marca: 'Fric-Rot', competidor: null, pctDiferencia: null },
    ])
})

it('competidor sigue siendo texto libre', () => {
    const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
    fireEvent.change(screen.getByLabelText(/competidor/i), { target: { value: 'Corven' } })
    expect(onChange).toHaveBeenCalledWith([
        { motivoId: 20, marca: null, competidor: 'Corven', pctDiferencia: null },
    ])
})

it('ofrece cargar una marca', () => {
    const { onChangeAccion } = setup()
    fireEvent.click(screen.getByLabelText('Marca'))
    fireEvent.click(screen.getByText('Fric-Rot'))
    expect(onChangeAccion).toHaveBeenCalledWith({ accion: null, marca: 'Fric-Rot' })
})

// Agrupación: cada motivo aparece bajo el título de bloque que le corresponde según
// `resultado`, sin que el componente conozca los nombres de los motivos.
describe('agrupación en 3 bloques', () => {
    it('perdido cae bajo Objeción', () => {
        setup()
        const bloque = screen.getByText('Objeción').closest('div')!.parentElement!
        expect(bloque).toHaveTextContent('Precio')
        expect(bloque).toHaveTextContent('DS 100%')
    })

    it('ganado cae bajo Cierre', () => {
        setup()
        const bloque = screen.getByText('Cierre').closest('div')!.parentElement!
        expect(bloque).toHaveTextContent('Dto')
        expect(bloque).toHaveTextContent('Plazo')
    })

    it('diferido cae bajo Pendientes', () => {
        setup()
        const bloque = screen.getByText('Pendientes').closest('div')!.parentElement!
        expect(bloque).toHaveTextContent('Cupo')
    })

    it('un motivo sin bucket reconocido (no_ofrecido o null) cae en Otros, sin perderse', () => {
        setup([], {
            motivos: [
                ...motivos,
                { motivoId: 30, nivel: 'ofrecimiento', descripcion: 'Fuera de catálogo', resultado: 'no_ofrecido', requiereDetalle: false },
            ],
        })
        expect(screen.getByText('Otros')).toBeInTheDocument()
        expect(screen.getByText('Fuera de catálogo')).toBeInTheDocument()
    })

    it('sin motivos de un bucket, no muestra su título', () => {
        setup([], { motivos: motivos.filter(m => m.resultado !== 'diferido') })
        expect(screen.queryByText('Pendientes')).not.toBeInTheDocument()
    })
})

// El color no depende del nombre del motivo, sino de `resultado`.
describe('color por resultado', () => {
    it('un motivo sin tildar no tiene color propio', () => {
        setup()
        const boton = screen.getByText('Precio').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#E4E8F0', background: '#fff' })
    })

    it('ganado se tilda en verde', () => {
        setup([{ motivoId: 22, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Dto').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#9BE3B4', background: '#EAFBF1' })
    })

    it('diferido se tilda en amarillo', () => {
        setup([{ motivoId: 24, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Cupo').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F7DD8F', background: '#FEF9E8' })
    })

    it('perdido se tilda en naranja', () => {
        setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
        const boton = screen.getByText('Precio').closest('button') as HTMLElement
        expect(boton).toHaveStyle({ borderColor: '#F3C8A0', background: '#FDF2E9' })
    })
})

// Varios motivos del mismo bucket conviven; uno de otro bucket reemplaza.
describe('un solo bucket de resultado a la vez', () => {
    it('dos motivos "perdido" conviven', () => {
        const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
        fireEvent.click(screen.getByText('DS 100%'))
        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 20, marca: null, competidor: null, pctDiferencia: null },
            { motivoId: 21, marca: null, competidor: null, pctDiferencia: null },
        ])
    })

    it('tildar un motivo "ganado" reemplaza uno "perdido" ya tildado', () => {
        const { onChange } = setup([{ motivoId: 20, marca: null, competidor: null, pctDiferencia: null }])
        fireEvent.click(screen.getByText('Dto'))
        expect(onChange).toHaveBeenCalledWith([
            { motivoId: 22, marca: null, competidor: null, pctDiferencia: null },
        ])
    })
})

// El check "Aplicar a restantes" de Marca sigue siendo el único que ofrece este
// componente ahora que Acción Comercial no está.
describe('aplicar a restantes: check de Marca', () => {
    it('sin marca, no se ofrece el check aunque haya rubros restantes', () => {
        setup([], { rubrosRestantes: 3 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('sin rubros restantes, no se ofrece el check aunque haya marca cargada', () => {
        setup([], { accion: { accion: null, marca: 'Fric-Rot' }, rubrosRestantes: 0 })
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('con marca y rubros restantes, ofrece el check y dispara onAplicarMarca', () => {
        const onAplicarMarca = vi.fn()
        setup([], { accion: { accion: null, marca: 'Fric-Rot' }, rubrosRestantes: 2, onAplicarMarca })
        fireEvent.click(screen.getByRole('checkbox'))
        expect(onAplicarMarca).toHaveBeenCalledTimes(1)
    })
})
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npm test -- ResolucionOfrecimiento.test.tsx`
Expected: FAIL — el componente actual sigue mostrando "Acción comercial" y no tiene bloques
"Objeción"/"Cierre"/"Pendientes".

- [ ] **Step 3: Reescribir `ResolucionOfrecimiento.tsx`**

Reemplazar el contenido completo de `src/components/propuesta/ResolucionOfrecimiento.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import CatalogoPicker from './CatalogoPicker'
import MarcaOfrecimientoPicker from './MarcaOfrecimientoPicker'
import type { ICatalogoItem, IAccionComercial, IMotivo, IOfrecimientoMotivo, ResultadoMotivo } from '@/types/planificacion'

interface ResolucionOfrecimientoProps {
    /** Catálogo de nivel `ofrecimiento`. Nunca se hardcodea: agregar un motivo es un INSERT. */
    motivos: IMotivo[]
    /** Catálogo de marcas. Restringir la elección es lo único que hace agregable la
     *  columna `marca`: con texto libre conviven "Fric Rot", "fricrot" y "FRIC-ROT". */
    marcas: ICatalogoItem[]
    marcasLoading?: boolean
    /** La marca de este ofrecimiento viaja en `accion.marca` — el campo `accion.accion`
     *  ya no es seteable desde este formulario (se sacó Acción Comercial), pero el tipo
     *  se mantiene porque otras partes del código (useOfrecimientos, OfrecimientoTable)
     *  siguen leyendo el mismo objeto. */
    accion: IAccionComercial | null
    onChangeAccion: (accion: IAccionComercial | null) => void
    value: IOfrecimientoMotivo[]
    onChange: (motivos: IOfrecimientoMotivo[]) => void
    /** Cuántos rubros quedan por resolver además de este. 0 = no se ofrece el check de
     *  "aplicar a restantes" de Marca. */
    rubrosRestantes?: number
    /** Copia esta marca a los rubros restantes — una sola vez, al tildar SU check. */
    onAplicarMarca?: () => void
}

const VACIO = { marca: null, competidor: null, pctDiferencia: null }

/** Color del motivo tildado, según qué tan buena/mala es esa resolución — no según su
 *  nombre (eso hardcodearía la lista). `resultado` ya distingue exactamente esto:
 *  ganado = verde, diferido = amarillo, perdido = naranja, no_ofrecido = rojo. Sin
 *  tildar, el motivo queda neutro. */
function colorDeResultado(resultado: ResultadoMotivo | null): { border: string; bg: string; check: string } {
    switch (resultado) {
        case 'ganado':
            return { border: '#9BE3B4', bg: '#EAFBF1', check: '#009E4F' }
        case 'diferido':
            return { border: '#F7DD8F', bg: '#FEF9E8', check: '#B8860B' }
        case 'perdido':
            return { border: '#F3C8A0', bg: '#FDF2E9', check: '#B45309' }
        case 'no_ofrecido':
            return { border: '#F1B3AC', bg: '#FDECEB', check: '#B42318' }
        default:
            return { border: '#B9CCEC', bg: '#EEF3FB', check: '#213D82' }
    }
}

/** Los 3 bloques visibles del checklist, en el orden en que se dibujan. `no_ofrecido` y
 *  `null` no tienen bloque propio: son el fallback "Otros", para que un motivo del
 *  catálogo que todavía no se re-clasificó no desaparezca en silencio. */
const BLOQUES: { titulo: string; resultado: ResultadoMotivo | null }[] = [
    { titulo: 'Objeción', resultado: 'perdido' },
    { titulo: 'Cierre', resultado: 'ganado' },
]
const TITULO_PENDIENTES = 'Pendientes'
const TITULO_OTROS = 'Otros'

/** Checklist + detalle de un ofrecimiento. Sin header, nombre ni botón de guardar
 *  propios: eso lo aporta ResolucionWizard, que envuelve a este componente en su header
 *  fijo y es el único con estado de posición/guardado. */
export default function ResolucionOfrecimiento({
    motivos,
    marcas,
    marcasLoading,
    accion,
    onChangeAccion,
    value,
    onChange,
    rubrosRestantes = 0,
    onAplicarMarca,
}: ResolucionOfrecimientoProps) {
    const porId = new Map(value.map(m => [m.motivoId, m]))
    const resultadoPorId = new Map(motivos.map(m => [m.motivoId, m.resultado]))

    function onChangeMarcaChip(marca: string | null) {
        if (!accion?.accion && !marca) {
            onChangeAccion(null)
        } else {
            onChangeAccion({ accion: accion?.accion ?? null, marca, params: accion?.params })
        }
    }

    // Qué motivo tiene abierto su selector de marca (null = ninguno).
    const [marcaAbierta, setMarcaAbierta] = useState<number | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Sin esto el teclado virtual tapa la lista justo cuando aparece.
    useEffect(() => {
        const el = panelRef.current
        if (marcaAbierta !== null && el?.scrollIntoView) {
            el.scrollIntoView({ block: 'nearest' })
        }
    }, [marcaAbierta])

    // Varios motivos del MISMO bucket conviven (dos razones de un "perdido": Precio +
    // Trabaja con otro). Pero "ganado" y "perdido" a la vez no tienen sentido — tildar
    // uno de otro bucket reemplaza lo que había, no lo acumula.
    function toggle(motivoId: number) {
        if (porId.has(motivoId)) {
            onChange(value.filter(m => m.motivoId !== motivoId))
            return
        }
        const resultadoNuevo = resultadoPorId.get(motivoId) ?? null
        const mismoBucket = value.every(m => (resultadoPorId.get(m.motivoId) ?? null) === resultadoNuevo)
        onChange(mismoBucket ? [...value, { motivoId, ...VACIO }] : [{ motivoId, ...VACIO }])
    }

    // El detalle vive en la fila (ofrecimiento_id, motivo_id), así que se edita POR
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

    function renderMotivo(cat: IMotivo) {
        const seleccionado = porId.get(cat.motivoId)
        const on = !!seleccionado
        const color = colorDeResultado(cat.resultado)
        return (
            <div
                key={cat.motivoId}
                className={`flex flex-col gap-0 ${cat.requiereDetalle && on ? 'col-span-2' : ''}`}
            >
                <button
                    onClick={() => toggle(cat.motivoId)}
                    className="flex w-full items-center gap-2 rounded-[11px] border-[1.5px] px-2.5 py-2 text-left font-sans"
                    style={{
                        borderColor: on ? color.border : '#E4E8F0',
                        background: on ? color.bg : '#fff',
                    }}
                >
                    <span
                        className="grid h-[19px] w-[19px] shrink-0 place-items-center rounded-md border-[1.5px]"
                        style={{
                            borderColor: on ? color.check : '#CBD2E0',
                            background: on ? color.check : '#fff',
                            color: on ? '#fff' : 'transparent',
                        }}
                    >
                        <Check className="h-[12px] w-[12px]" strokeWidth={3.2} />
                    </span>
                    <span
                        className={`min-w-0 truncate text-[13px] font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}
                    >
                        {cat.descripcion}
                    </span>
                </button>

                {cat.requiereDetalle && on && (
                    <div
                        className="animate-panel-in ml-8 mt-2 mb-0.5 flex flex-col gap-2.5 rounded-[10px] border-[1.5px] bg-white p-2.5"
                        style={{ borderColor: color.border }}
                    >
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                Marca
                            </span>
                            <button
                                type="button"
                                aria-label="Marca del motivo"
                                onClick={() =>
                                    setMarcaAbierta(marcaAbierta === cat.motivoId ? null : cat.motivoId)
                                }
                                className="flex w-full items-center gap-2 rounded-lg border border-[#E1E6F0] px-2.5 py-2 text-left"
                            >
                                <span
                                    className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                                        seleccionado!.marca ? 'text-[#182645]' : 'text-[#8A93A6]'
                                    }`}
                                >
                                    {seleccionado!.marca ?? 'Elegí una marca'}
                                </span>
                                {seleccionado!.marca && (
                                    <Check className="h-4 w-4 shrink-0 text-[#213D82]" strokeWidth={3} />
                                )}
                                <ChevronDown
                                    className={`h-4 w-4 shrink-0 text-dsmuted transition-transform duration-150 ${
                                        marcaAbierta === cat.motivoId ? 'rotate-180' : ''
                                    }`}
                                    strokeWidth={2.4}
                                />
                            </button>
                            {marcaAbierta === cat.motivoId && (
                                <div ref={panelRef} className="animate-panel-in mt-1.5">
                                    <CatalogoPicker
                                        items={marcas}
                                        loading={marcasLoading}
                                        value={seleccionado!.marca}
                                        onSelect={item => {
                                            setDetalle(cat.motivoId, 'marca', item.description)
                                            setMarcaAbierta(null)
                                        }}
                                        placeholder="Buscar marca…"
                                        autoFocus
                                    />
                                </div>
                            )}
                        </div>
                        {marcaAbierta !== cat.motivoId && (
                            <>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                        Competidor
                                    </span>
                                    <input
                                        value={seleccionado!.competidor ?? ''}
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
                                            value={seleccionado!.pctDiferencia ?? ''}
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
                            </>
                        )}
                    </div>
                )}
            </div>
        )
    }

    const pendientes = motivos.filter(m => m.resultado === 'diferido')
    const otros = motivos.filter(m => m.resultado === null || m.resultado === 'no_ofrecido')

    return (
        <div>
            <MarcaOfrecimientoPicker
                marcas={marcas}
                marcasLoading={marcasLoading}
                value={accion?.marca ?? null}
                onChange={onChangeMarcaChip}
                rubrosRestantes={rubrosRestantes}
                onAplicarATodos={onAplicarMarca}
            />

            {/* Objeción y Cierre van en la misma fila: son conceptos simétricos (uno
             *  negativo, uno positivo) que se leen mejor comparados a la misma altura. */}
            <div className="mb-2 flex gap-2">
                {BLOQUES.map(({ titulo, resultado }) => {
                    const items = motivos.filter(m => m.resultado === resultado)
                    if (items.length === 0) return null
                    return (
                        <div
                            key={titulo}
                            className="flex flex-1 flex-col gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5"
                        >
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                                {titulo}
                            </span>
                            <div className="flex flex-col gap-2">{items.map(renderMotivo)}</div>
                        </div>
                    )
                })}
            </div>

            {pendientes.length > 0 && (
                <div className="mb-2 flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                        {TITULO_PENDIENTES}
                    </span>
                    <div className="grid grid-cols-2 gap-2">{pendientes.map(renderMotivo)}</div>
                </div>
            )}

            {otros.length > 0 && (
                <div className="flex flex-col gap-2 rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white p-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A93A6]">
                        {TITULO_OTROS}
                    </span>
                    <div className="grid grid-cols-2 gap-2">{otros.map(renderMotivo)}</div>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npm test -- ResolucionOfrecimiento.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/propuesta/ResolucionOfrecimiento.tsx src/components/propuesta/ResolucionOfrecimiento.test.tsx
git commit -m "feat(resolucion): agrupar el checklist en Objeción/Cierre/Pendientes y sacar Acción Comercial

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `ResolucionWizard` — dejar de pedir/pasar `acciones`

**Files:**
- Modify: `src/components/propuesta/ResolucionWizard.tsx`
- Test: `src/components/propuesta/ResolucionWizard.test.tsx`

**Interfaces:**
- Consumes: la nueva shape de `ResolucionOfrecimiento` del Task 1 (sin `acciones` ni
  `onAplicarAccion`).
- Produces: `ResolucionWizard` sigue exportando la misma `ResolucionWizardProps` que ya tenía
  (no cambia su contrato hacia `VisitaSheet`/`VisitaFlow`, que no se tocan en este plan).

- [ ] **Step 1: Ajustar el test (falla a propósito)**

En `src/components/propuesta/ResolucionWizard.test.tsx`:

1. Borrar la línea del mock de acciones en `beforeEach`:

```ts
;(api.getAcciones as any).mockResolvedValue([])
```

2. Reemplazar el test `'con acción cargada, ofrece SOLO el check de la acción (no el de marca)'`
   por este (ya no hay UI de acción, así que sin marca no hay ningún check):

```ts
it('con acción cargada pero sin marca, no ofrece ningún check (ya no hay UI de acción)', () => {
    setup({ detalles: { 7: { accion: 'CUPO', marca: null } } })
    expect(screen.queryByText('Aplicar a restantes')).not.toBeInTheDocument()
})
```

3. Reemplazar el test `'con acción y marca cargadas, ofrece un check en cada chip'` por:

```ts
it('con acción y marca cargadas, ofrece un único check (el de Marca)', () => {
    setup({ detalles: { 7: { accion: 'CUPO', marca: 'AG' } } })
    expect(screen.getAllByText('Aplicar a restantes')).toHaveLength(1)
})
```

4. Borrar el test `'tildar el check de Acción copia solo la acción, sin tocar la marca ya cargada del otro rubro'` — ya no existe ese checkbox.

5. En el test `'tildar el check de Marca copia solo la marca, sin tocar la acción ya cargada del otro rubro'`,
   cambiar `screen.getAllByRole('checkbox')[1]` por `screen.getAllByRole('checkbox')[0]` (ahora es
   el único checkbox, no el segundo):

```ts
it('tildar el check de Marca copia solo la marca, sin tocar la acción ya cargada del otro rubro', () => {
    const onCambiarAccion = vi.fn()
    setup({
        detalles: { 7: { accion: 'CUPO', marca: 'AG' }, 8: { accion: 'DESCUENTO', marca: null } },
        onCambiarAccion,
    })

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect(onCambiarAccion).toHaveBeenCalledWith(8, { accion: 'DESCUENTO', marca: 'AG' })
})
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npm test -- ResolucionWizard.test.tsx`
Expected: FAIL en los tests tocados en el Step 1 (el componente actual todavía muestra 2 checks
cuando hay acción y marca).

- [ ] **Step 3: Sacar `useAcciones`/`acciones` de `ResolucionWizard.tsx`**

En `src/components/propuesta/ResolucionWizard.tsx`:

1. Borrar el import:

```ts
import { useAcciones } from '@/hooks/useAcciones'
```

2. Borrar la línea:

```ts
const { data: acciones = [] } = useAcciones()
```

3. Borrar la función `aplicarAccion` completa (líneas 72-81 del archivo original):

```ts
function aplicarAccion() {
    for (const r of restantes) {
        const actual = detalles[r.id] ?? null
        onCambiarAccion(r.id, {
            accion: accion?.accion ?? null,
            marca: actual?.marca ?? null,
            params: accion?.params,
        })
    }
}
```

4. En el JSX que renderiza `<ResolucionOfrecimiento>`, sacar las props `acciones` y
   `onAplicarAccion`:

```tsx
<ResolucionOfrecimiento
    motivos={motivos}
    marcas={marcas}
    marcasLoading={marcasLoading}
    accion={accion}
    onChangeAccion={a => onCambiarAccion(ofrecimiento.id, a)}
    value={borradores[ofrecimiento.id] ?? []}
    onChange={m => onCambiarBorrador(ofrecimiento.id, m)}
    rubrosRestantes={restantes.length}
    onAplicarMarca={aplicarMarca}
/>
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npm test -- ResolucionWizard.test.tsx`
Expected: PASS

- [ ] **Step 5: Correr toda la suite del repo para descartar roturas en componentes que envuelven a estos dos (VisitaSheet, VisitaFlow, OfrecimientoTable)**

Run: `npm test`
Expected: PASS en todos los archivos. Si algo en `VisitaSheet.test.tsx`/`VisitaFlow.tsx` referencia
`acciones`/`getAcciones` de forma que ahora sobra, es señal de que ese mock ya no se ejercita —
dejarlo si sigue pasando (no es parte de este plan tocar esos archivos), y si falla por una
aserción real sobre el bloque de Acción Comercial dentro del wizard, ajustarla del mismo modo que
el Step 1 de este task.

- [ ] **Step 6: Commit**

```bash
git add src/components/propuesta/ResolucionWizard.tsx src/components/propuesta/ResolucionWizard.test.tsx
git commit -m "refactor(resolucion): sacar useAcciones/aplicarAccion del wizard, ya sin Acción Comercial

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Manual check (opcional pero recomendado)

Con `npm run dev`, abrir el flujo de resolución de un rubro (VisitaFlow → un cliente → iniciar
visita → resolver un ofrecimiento) y confirmar visualmente:
- Marca es el primer bloque.
- No aparece "Acción comercial".
- Los motivos con `resultado: 'perdido'`/`'ganado'` del catálogo real (el que sembraste en
  `pl_motivo`) aparecen en dos columnas lado a lado bajo "Objeción"/"Cierre".
- Los `'diferido'` aparecen debajo, en su propio bloque "Pendientes".
- Tildar "Precio" (o el motivo que tenga `requiereDetalle`) sigue abriendo el panel de
  Marca/Competidor/%.
