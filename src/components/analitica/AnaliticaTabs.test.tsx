import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AnaliticaTabs from './AnaliticaTabs'

it('gerencia ve solo Métricas, Ruta y Altas, en ese orden', () => {
    render(
        <MemoryRouter initialEntries={['/analitica/metricas']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual(['Métricas', 'Ruta', 'Altas'])
})

it('tiene la pestaña Métricas apuntando a /analitica/metricas', () => {
    render(
        <MemoryRouter initialEntries={['/analitica/metricas']}>
            <AnaliticaTabs />
        </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Métricas' })
    expect(link).toHaveAttribute('href', '/analitica/metricas')
    expect(link).toHaveClass('border-slate-900')
})

it('apunta la pestaña Ruta a /analitica/ruta', () => {
    render(
        <MemoryRouter initialEntries={['/analitica/metricas']}>
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
    expect(screen.getByRole('link', { name: 'Métricas' })).toHaveClass('border-transparent')
})

it('apunta la pestaña Altas a /analitica/altas, después de Ruta', () => {
    render(<MemoryRouter initialEntries={['/analitica/metricas']}><AnaliticaTabs /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Altas' })).toHaveAttribute('href', '/analitica/altas')
    const nombres = screen.getAllByRole('link').map(l => l.textContent)
    expect(nombres.indexOf('Altas')).toBe(nombres.indexOf('Ruta') + 1)
})
