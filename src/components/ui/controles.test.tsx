import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import EstadoVista from './EstadoVista'
import PasoPeriodo from './PasoPeriodo'
import Pestanas from './Pestanas'
import Segmentado from './Segmentado'

describe('Segmentado', () => {
    it('es un grupo con nombre; la opción activa va con aria-pressed y tocar otra la elige', () => {
        const onCambiar = vi.fn()
        render(
            <Segmentado
                etiqueta="Período"
                opciones={[{ valor: 'semana', etiqueta: 'Semana' }, { valor: 'mes', etiqueta: 'Mes' }]}
                valor="mes"
                onCambiar={onCambiar}
            />,
        )
        expect(screen.getByRole('group', { name: 'Período' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'false')
        fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
        expect(onCambiar).toHaveBeenCalledWith('semana')
    })
})

describe('Pestanas', () => {
    it('es una navegación con nombre; la activa va con aria-current y tocar otra la elige', () => {
        const onCambiar = vi.fn()
        render(
            <Pestanas
                etiqueta="Métricas"
                opciones={[{ valor: 'a', etiqueta: 'Productividad' }, { valor: 'b', etiqueta: 'Facturación' }]}
                valor="a"
                onCambiar={onCambiar}
            />,
        )
        expect(screen.getByRole('navigation', { name: 'Métricas' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Productividad' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('button', { name: 'Facturación' })).not.toHaveAttribute('aria-current')
        fireEvent.click(screen.getByRole('button', { name: 'Facturación' }))
        expect(onCambiar).toHaveBeenCalledWith('b')
    })
})

describe('PasoPeriodo', () => {
    it('muestra el período entre dos botones con nombre que avanzan y retroceden', () => {
        const onAnterior = vi.fn()
        const onSiguiente = vi.fn()
        render(<PasoPeriodo unidad="Mes" texto="Octubre 2026" onAnterior={onAnterior} onSiguiente={onSiguiente} />)
        expect(screen.getByRole('group', { name: 'Mes' })).toHaveTextContent('Octubre 2026')
        fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
        expect(onAnterior).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
        expect(onSiguiente).toHaveBeenCalledTimes(1)
    })
})

describe('EstadoVista', () => {
    it('cargando se anuncia y no muestra texto de error', () => {
        render(<EstadoVista estado="cargando" />)
        expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument()
    })

    it('el error dice qué pasó y ofrece reintentar', () => {
        const onReintentar = vi.fn()
        render(<EstadoVista estado="error" titulo="No se pudo cargar." onReintentar={onReintentar} />)
        expect(screen.getByText('No se pudo cargar.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
        expect(onReintentar).toHaveBeenCalledTimes(1)
    })

    it('el vacío dice qué hacer', () => {
        render(<EstadoVista estado="vacio" titulo="Sin actividad" texto="Probá con otro período." />)
        expect(screen.getByText('Sin actividad')).toBeInTheDocument()
        expect(screen.getByText('Probá con otro período.')).toBeInTheDocument()
    })
})
