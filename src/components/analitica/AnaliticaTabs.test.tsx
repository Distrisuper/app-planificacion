import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AnaliticaTabs from './AnaliticaTabs'

it('marca como activa la pestaña de la ruta actual', () => {
    render(
        <MemoryRouter initialEntries={['/analitica/actividad']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Actividad' })).toHaveClass('border-slate-900')
    expect(screen.getByRole('link', { name: 'Analítica de visitas' })).toHaveClass('border-transparent')
})

it('apunta cada pestaña a su ruta', () => {
    render(
        <MemoryRouter initialEntries={['/analitica']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Analítica de visitas' })).toHaveAttribute('href', '/analitica')
    expect(screen.getByRole('link', { name: 'Actividad' })).toHaveAttribute('href', '/analitica/actividad')
})

it('muestra el badge "En vivo" solo cuando enVivo es true', () => {
    const { rerender } = render(
        <MemoryRouter initialEntries={['/analitica/actividad']}>
            <AnaliticaTabs enVivo={false} />
        </MemoryRouter>,
    )
    expect(screen.queryByText('En vivo')).not.toBeInTheDocument()

    rerender(
        <MemoryRouter initialEntries={['/analitica/actividad']}>
            <AnaliticaTabs enVivo />
        </MemoryRouter>,
    )
    expect(screen.getByText('En vivo')).toBeInTheDocument()
})

it('apunta la pestaña Ruta a /analitica/ruta', () => {
    render(
        <MemoryRouter initialEntries={['/analitica']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Ruta' })).toHaveAttribute(
        'href',
        '/analitica/ruta',
    )
})

it('marca Ruta como activa cuando es la ruta actual', () => {
    render(
        <MemoryRouter initialEntries={['/analitica/ruta']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Ruta' })).toHaveClass('border-slate-900')
})
