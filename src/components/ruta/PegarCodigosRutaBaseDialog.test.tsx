import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiAdmin from '@/api/planificacionAdmin'
import type { IResultadoSincronizarRutaBase } from '@/types/planificacion'
import PegarCodigosRutaBaseDialog from './PegarCodigosRutaBaseDialog'

vi.mock('@/api/planificacionAdmin')

const PREVIA: IResultadoSincronizarRutaBase = {
    entran: [{ codigoParticularCliente: 'P001', nombreCliente: 'KIOSCO UNO', dia: 1 }],
    salen: [{ id: 50, codigoParticularCliente: 'P050', nombreCliente: 'ALMACEN VIEJO', dia: 2 }],
    quedan: 3,
    noEncontrados: ['X999'],
    repetidos: [{ codigo: 'P002', dia: 2 }],
    aplicado: false,
}

function montar(onClose = vi.fn()) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={qc}>
            <PegarCodigosRutaBaseDialog
                open
                onClose={onClose}
                codigoVendedor="V 18"
                semana={4}
                zona="Campana"
            />
        </QueryClientProvider>,
    )
    return onClose
}

async function pegar(texto: string) {
    await userEvent.click(screen.getByRole('textbox', { name: 'Códigos' }))
    await userEvent.paste(texto)
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiAdmin.sincronizarRutaBase).mockResolvedValue(PREVIA)
})

describe('PegarCodigosRutaBaseDialog', () => {
    it('una grilla de Excel se revisa sin aplicar y muestra entran, salen, no encontrados y repetidos', async () => {
        montar()
        await pegar('P001\tP002\nP003\tP002')

        await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))

        await waitFor(() =>
            expect(apiAdmin.sincronizarRutaBase).toHaveBeenCalledWith('V 18', {
                semana: 4,
                dias: { '1': ['P001', 'P003'], '2': ['P002', 'P002'] },
                aplicar: false,
            }),
        )
        expect(await screen.findByText(/Kiosco Uno/)).toBeInTheDocument()
        expect(screen.getByText(/Almacen Viejo/)).toBeInTheDocument()
        expect(screen.getByText(/X999/)).toBeInTheDocument()
        expect(screen.getByText(/P002 \(MAR\)/)).toBeInTheDocument()
        // El aviso nombra los días que se reemplazan y deja claro que lo demás sale.
        expect(screen.getByText(/Se reemplazan LUN y MAR de la semana 4/)).toBeInTheDocument()
        expect(screen.getByText(/lo que no esté en la lista sale de esos días/)).toBeInTheDocument()
    })

    it('Aplicar manda lo mismo con aplicar en true y cierra', async () => {
        vi.mocked(apiAdmin.sincronizarRutaBase)
            .mockResolvedValueOnce(PREVIA)
            .mockResolvedValueOnce({ ...PREVIA, aplicado: true })
        const onClose = montar()
        await pegar('P001\tP002')
        await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))

        await userEvent.click(await screen.findByRole('button', { name: 'Aplicar' }))

        await waitFor(() =>
            expect(apiAdmin.sincronizarRutaBase).toHaveBeenLastCalledWith('V 18', {
                semana: 4,
                dias: { '1': ['P001'], '2': ['P002'] },
                aplicar: true,
            }),
        )
        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('una sola columna va al día que se elige', async () => {
        montar()
        await pegar('P001\nP002\n')

        await userEvent.click(screen.getByRole('button', { name: 'MIE' }))
        await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))

        await waitFor(() =>
            expect(apiAdmin.sincronizarRutaBase).toHaveBeenCalledWith('V 18', {
                semana: 4,
                dias: { '3': ['P001', 'P002'] },
                aplicar: false,
            }),
        )
        expect(await screen.findByText(/Se reemplaza MIE de la semana 4/)).toBeInTheDocument()
    })

    it('"Volver a editar" deja cambiar los códigos y hay que revisar de nuevo', async () => {
        montar()
        await pegar('P001')
        await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))
        await screen.findByRole('button', { name: 'Aplicar' })

        await userEvent.click(screen.getByRole('button', { name: 'Volver a editar' }))
        await pegar('\nP009')

        expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Revisar' })).toBeEnabled()
    })

    it('sin códigos no se puede revisar', () => {
        montar()
        expect(screen.getByRole('button', { name: 'Revisar' })).toBeDisabled()
    })
})
