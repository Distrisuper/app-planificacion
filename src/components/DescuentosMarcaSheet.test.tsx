import { render, screen, fireEvent } from '@testing-library/react'
import DescuentosMarcaSheet from './DescuentosMarcaSheet'
import type { IVisitClientCard } from '@/types/planificacion'

function cliente(over: Partial<IVisitClientCard> = {}): IVisitClientCard {
    return {
        codigoCliente: '10034',
        codigoParticularCliente: '10034-1',
        nombreCliente: 'DERQUI AUTOPARTES SRL',
        bonusDiscount: 8,
        gmDiscount: 35,
        generalDiscount: 0,
        brandDiscounts: [
            { code: '141', value: 15, description: 'COBREQ # LIQUIDOS FRENO #' },
            { code: '039', value: 23, description: 'AG # RESORTES #' },
        ],
        ...over,
    }
}

function abrir(over: Partial<IVisitClientCard> = {}) {
    render(<DescuentosMarcaSheet open onClose={() => {}} cliente={cliente(over)} />)
}

it('lista las marcas ordenadas por % descendente', () => {
    abrir()
    const filas = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(filas[0]).toContain('AG · RESORTES')
    expect(filas[0]).toContain('23%')
    expect(filas[1]).toContain('COBREQ · LIQUIDOS FRENO')
    expect(filas[1]).toContain('15%')
})

it('el buscador filtra por nombre, sin acentos ni mayúsculas', () => {
    abrir()
    fireEvent.change(screen.getByPlaceholderText(/buscar marca/i), { target: { value: 'cobreq' } })
    expect(screen.getByText(/COBREQ/)).toBeInTheDocument()
    expect(screen.queryByText(/RESORTES/)).not.toBeInTheDocument()
})

it('el buscador sin resultados lo dice', () => {
    abrir()
    fireEvent.change(screen.getByPlaceholderText(/buscar marca/i), { target: { value: 'zzz' } })
    expect(screen.getByText(/ninguna marca/i)).toBeInTheDocument()
})

it('muestra sólo los chips de escalares mayores a cero', () => {
    abrir()
    expect(screen.getByText(/GM 35%/)).toBeInTheDocument()
    expect(screen.getByText(/Bonif\. 8%/)).toBeInTheDocument()
    // generalDiscount es 0 para todos los clientes (ETL roto, spec §3.2).
    expect(screen.queryByText(/Gral\./)).not.toBeInTheDocument()
})

describe('cliente suscriptor', () => {
    it('explica por qué no hay descuentos, con su propio %', () => {
        abrir({ bonusDiscount: 45 })
        expect(screen.getByText(/SUSCRIPTOR · 45%/)).toBeInTheDocument()
        expect(screen.getByText(/no se suman/i)).toBeInTheDocument()
    })

    it('el 49 no está hardcodeado en 45', () => {
        abrir({ bonusDiscount: 49 })
        expect(screen.getByText(/SUSCRIPTOR · 49%/)).toBeInTheDocument()
    })

    it('no lista marcas ni ofrece buscador', () => {
        abrir({ bonusDiscount: 45 })
        expect(screen.queryAllByRole('listitem')).toHaveLength(0)
        expect(screen.queryByPlaceholderText(/buscar marca/i)).not.toBeInTheDocument()
    })

    // El chip SUSCRIPTOR y el de Bonif. son el mismo número: mostrar los dos sugiere dos
    // beneficios distintos.
    it('el chip SUSCRIPTOR reemplaza al de Bonif., pero el de GM convive', () => {
        abrir({ bonusDiscount: 45 })
        expect(screen.queryByText(/Bonif\./)).not.toBeInTheDocument()
        expect(screen.getByText(/GM 35%/)).toBeInTheDocument()
    })
})

it('sin descuentos y sin ser suscriptor, lo dice sin insinuar que falta cargar algo', () => {
    abrir({ brandDiscounts: [] })
    expect(screen.getByText(/no tiene descuentos por marca/i)).toBeInTheDocument()
    expect(screen.queryByText(/SUSCRIPTOR/)).not.toBeInTheDocument()
})
