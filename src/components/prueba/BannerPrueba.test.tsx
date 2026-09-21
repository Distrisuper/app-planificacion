import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import BannerPrueba from './BannerPrueba'

const auth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth() }))
vi.mock('./CarteraDialog', () => ({ default: ({ open }: { open: boolean }) => (open ? <div>DIALOGO</div> : null) }))

const cap = (v: boolean, p: boolean, s: boolean) => ({ operaComoVendedor: v, operaComoVendedorDePrueba: p, superviseVendedores: s, veSusMetricas: true })
const montar = () => render(<MemoryRouter><BannerPrueba /></MemoryRouter>)

it('no se pinta para un vendedor real', () => {
    auth.mockReturnValue({ capacidades: cap(true, false, false), vendedorDePrueba: null })
    montar()
    expect(screen.queryByText(/Modo prueba/)).not.toBeInTheDocument()
})

it('gerencia: texto con la cartera, Reiniciar y Volver a analítica', () => {
    auth.mockReturnValue({
        capacidades: cap(false, true, true),
        vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: 'Cartera de V 2', origenesDisponibles: [] },
    })
    montar()
    expect(screen.getByText('Modo prueba · Cartera de V 2 · nada de esto cuenta ni llega a Cromo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reiniciar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a analítica' })).toHaveAttribute('href', '/analitica')
})

it('tester: sin descripción todavía, sin "Volver a analítica"', () => {
    auth.mockReturnValue({
        capacidades: cap(false, true, false),
        vendedorDePrueba: { codigo: 'PRUEBA-9', descripcion: null, origenesDisponibles: [] },
    })
    montar()
    expect(screen.getByText('Modo prueba · nada de esto cuenta ni llega a Cromo')).toBeInTheDocument()
    expect(screen.queryByText('Volver a analítica')).not.toBeInTheDocument()
})

it('Reiniciar abre el diálogo de cartera', async () => {
    auth.mockReturnValue({ capacidades: cap(false, true, true), vendedorDePrueba: { codigo: 'PRUEBA-42', descripcion: null, origenesDisponibles: [] } })
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(screen.getByText('DIALOGO')).toBeInTheDocument()
})
