import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ResolucionWizardAcciones from './ResolucionWizardAcciones'
import type { IMotivo, IOfrecimiento } from '@/types/planificacion'

const motivos: IMotivo[] = [
    { motivoId: 10, nivel: 'ofrecimiento', descripcion: 'Saqué pedido', resultado: 'ganado', codigo: null, campos: [] },
    {
        motivoId: 13,
        nivel: 'ofrecimiento',
        descripcion: 'Precio',
        resultado: 'perdido',
        codigo: 'PRECIO',
        campos: [
            { campo: 'marca', tipo: 'catalogo_marca', label: 'Marca', placeholder: null, unidad: null, requerido: true, orden: 10 },
            { campo: 'competidor', tipo: 'texto', label: 'Competidor', placeholder: 'Ej. Corven', unidad: null, requerido: true, orden: 20 },
            { campo: 'precio_competidor', tipo: 'numero', label: 'Precio del competidor', placeholder: null, unidad: '$', requerido: true, orden: 30 },
            { campo: 'mi_precio', tipo: 'numero', label: 'Mi precio', placeholder: null, unidad: '$', requerido: true, orden: 40 },
        ],
    },
]

const ofrecimientos: IOfrecimiento[] = [
    {
        id: 7, resolucionId: 42, tipo: 'rubro', codigo: 'AMORT', descripcion: 'Amortiguadores',
        gapUnits: 12, esPropuesto: true, resuelto: false, motivos: [], alcance: [],
    },
    {
        id: 8, resolucionId: 42, tipo: 'rubro', codigo: 'FILT', descripcion: 'Filtros',
        gapUnits: null, esPropuesto: false, resuelto: false, motivos: [], alcance: [],
    },
]

/** Precio (codigo: 'PRECIO') tildado sin sus cuatro campos: el detalle a medias. */
const PRECIO_A_MEDIAS = [{ motivoId: 13, valores: {} }]
const PRECIO_COMPLETO = [
    { motivoId: 13, valores: { marca: 'Fric-Rot', competidor: 'Corven', precio_competidor: 150, mi_precio: 132 } },
]

function setup(over: Record<string, unknown> = {}) {
    const onIndexChange = vi.fn()
    const onFinalizar = vi.fn()
    render(
        <ResolucionWizardAcciones
            ofrecimientos={ofrecimientos}
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

it('en un ofrecimiento que no es el último, muestra Siguiente', () => {
    setup()
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ver resumen/i })).not.toBeInTheDocument()
})

it('Atrás está deshabilitado en el primer ofrecimiento', () => {
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

it('minimizar sale del wizard sin tocar el índice', () => {
    const { onFinalizar, onIndexChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /minimizar/i }))
    expect(onFinalizar).toHaveBeenCalled()
    expect(onIndexChange).not.toHaveBeenCalled()
})

// El botón del último paso NO cierra la visita ni completa nada: vuelve a la lista, igual
// que el ⌄ de los pasos anteriores. Se llama "Ver resumen" y no "Finalizar" porque eso
// prometía un cierre que no hace — el único que termina la visita es el naranja de la lista.
describe('el último paso vuelve al resumen, no finaliza', () => {
    it('muestra "Ver resumen" en vez de Siguiente', () => {
        setup({ index: 1 })
        expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /ver resumen/i })).toBeEnabled()
    })

    it('no duplica la salida: en el último paso no hay además un botón de minimizar', () => {
        setup({ index: 1 })
        expect(screen.queryByRole('button', { name: /minimizar/i })).not.toBeInTheDocument()
    })

    it('"Ver resumen" dispara onFinalizar', () => {
        const { onFinalizar } = setup({ index: 1 })
        fireEvent.click(screen.getByRole('button', { name: /ver resumen/i }))
        expect(onFinalizar).toHaveBeenCalled()
    })
})

// El detalle a medias se ataja EN EL RUBRO donde está, no al final del wizard: así el
// vendedor nunca queda con un cartel que lo manda a arreglar algo tres rubros atrás. El
// texto de "qué falta" no vive acá (ver ResolucionOfrecimiento) — este componente solo
// deshabilita, para no hacer crecer/encoger el pie fijo con cada tilde.
describe('un detalle a medias bloquea la navegación del rubro actual', () => {
    it('Siguiente se bloquea', () => {
        setup({ borradores: { 7: PRECIO_A_MEDIAS, 8: [] } })
        expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled()
    })

    it('Atrás también se bloquea', () => {
        setup({ index: 1, borradores: { 7: [], 8: PRECIO_A_MEDIAS } })
        expect(screen.getByRole('button', { name: /atrás/i })).toBeDisabled()
    })

    it('el detalle a medias de OTRO rubro no bloquea la navegación de este', () => {
        setup({ index: 1, borradores: { 7: PRECIO_A_MEDIAS, 8: [] } })
        expect(screen.getByRole('button', { name: /atrás/i })).toBeEnabled()
    })

    it('con el detalle completo, la navegación queda libre', () => {
        setup({ borradores: { 7: PRECIO_COMPLETO, 8: [] } })
        expect(screen.getByRole('button', { name: /siguiente/i })).toBeEnabled()
    })

    // La salida NUNCA se deshabilita: es la vía de escape de quien entró por error y no
    // quiere cargar nada. Y salir no pierde nada — el rubro queda marcado como incompleto
    // en la lista y "Cerrar visita" sigue bloqueado hasta completarlo.
    it('minimizar sigue habilitado', () => {
        const { onFinalizar } = setup({ borradores: { 7: PRECIO_A_MEDIAS, 8: [] } })
        fireEvent.click(screen.getByRole('button', { name: /minimizar/i }))
        expect(onFinalizar).toHaveBeenCalled()
    })

    it('"Ver resumen" del último paso también sigue habilitado', () => {
        const { onFinalizar } = setup({ index: 1, borradores: { 7: [], 8: PRECIO_A_MEDIAS } })
        fireEvent.click(screen.getByRole('button', { name: /ver resumen/i }))
        expect(onFinalizar).toHaveBeenCalled()
    })
})
