import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import VendedorShell from './VendedorShell'

const flags = vi.hoisted(() => ({ METRICAS_VENDEDOR_HABILITADAS: true, ALTAS_HABILITADAS: true }))
vi.mock('@/lib/flags', () => flags)

const contador = vi.hoisted(() => ({ montajesAgenda: 0 }))
vi.mock('@/pages/AgendaSemanaPage', async () => {
    const { useEffect } = await import('react')
    return {
        default: function AgendaFalsa() {
            useEffect(() => {
                contador.montajesAgenda++
            }, [])
            return <div>AGENDA</div>
        },
    }
})
vi.mock('@/pages/MetricasPage', () => ({ default: () => <div>METRICAS</div> }))

function renderShell(ruta = '/') {
    return render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route element={<VendedorShell />}>
                    <Route path="/" element={null} />
                    <Route path="/metricas" element={null} />
                </Route>
            </Routes>
        </MemoryRouter>,
    )
}

beforeEach(() => {
    contador.montajesAgenda = 0
    flags.METRICAS_VENDEDOR_HABILITADAS = true
})

it('cambiar a Métricas OCULTA la agenda sin desmontarla (la visita en curso vive ahí)', async () => {
    renderShell()
    expect(screen.getByTestId('seccion-planificacion')).not.toHaveClass('hidden')
    expect(screen.queryByText('METRICAS')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /Métricas/ }))
    expect(screen.getByTestId('seccion-planificacion')).toHaveClass('hidden')
    expect(screen.getByTestId('seccion-metricas')).not.toHaveClass('hidden')

    await userEvent.click(screen.getByRole('link', { name: /Plani/ }))
    expect(screen.getByTestId('seccion-planificacion')).not.toHaveClass('hidden')
    // Métricas queda montada (oculta) para no volver a pedir los datos.
    expect(screen.getByTestId('seccion-metricas')).toHaveClass('hidden')
    expect(contador.montajesAgenda).toBe(1)
})

it('entrar directo a /metricas (reload) igual monta la agenda, oculta', () => {
    renderShell('/metricas')
    expect(screen.getByTestId('seccion-planificacion')).toHaveClass('hidden')
    expect(screen.getByText('METRICAS')).toBeInTheDocument()
})

it('volver a Plani desde Métricas conserva la zona y el día que se estaban mirando', async () => {
    renderShell('/?dia=MIE&semana=3')
    await userEvent.click(screen.getByRole('link', { name: /Métricas/ }))
    expect(screen.getByRole('link', { name: /Plani/ })).toHaveAttribute('href', '/?dia=MIE&semana=3')
})

it('publica el alto de la tab bar para que la barra de visita flote encima', () => {
    renderShell()
    expect(document.documentElement.style.getPropertyValue('--alto-tabbar')).toContain('56px')
})

it('con el flag apagado no hay pestañas y /metricas vuelve a la agenda', () => {
    flags.METRICAS_VENDEDOR_HABILITADAS = false
    renderShell('/metricas')
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).not.toBeInTheDocument()
    expect(screen.getByText('AGENDA')).toBeInTheDocument()
    expect(screen.queryByText('METRICAS')).not.toBeInTheDocument()
})
