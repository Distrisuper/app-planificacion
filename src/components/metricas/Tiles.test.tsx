import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TileObjetivo from './TileObjetivo'
import TileComparacion from './TileComparacion'
import TileLista from './TileLista'
import TileSinDatos from './TileSinDatos'

describe('tiles', () => {
    it('objetivo: número, pie "actual de objetivo" y semáforo rojo', () => {
        render(<TileObjetivo titulo="Visitas" ayuda="a" formato="numero" valor={{ actual: 64, objetivo: 160 }} />)
        expect(screen.getByText('64')).toBeInTheDocument()
        expect(screen.getByText('64 de 160')).toBeInTheDocument()
        expect(screen.getByTestId('barra-objetivo')).toHaveClass('bg-dsred')
        expect(screen.getByTestId('barra-objetivo')).toHaveStyle({ width: '40%' })
    })
    it('objetivo horas: "41 de 100 hs"', () => {
        render(<TileObjetivo titulo="Horas" ayuda="a" formato="horas" valor={{ actual: 2460, objetivo: 6000 }} />)
        expect(screen.getByText('41 de 100 hs')).toBeInTheDocument()
    })
    it('objetivo sin objetivo: sin barra y aviso', () => {
        render(<TileObjetivo titulo="Super rubros" ayuda="a" formato="numero" valor={{ actual: 10, objetivo: null }} />)
        expect(screen.queryByTestId('barra-objetivo')).toBeNull()
        expect(screen.getByText('Sin objetivo cargado')).toBeInTheDocument()
    })
    it('comparacion: variación contra el mes anterior', () => {
        render(<TileComparacion titulo="Cobertura" ayuda="a" formato="porcentaje" valor={{ actual: 0.55, anterior: 0.5 }} mes="2026-09" />)
        expect(screen.getByText('55%')).toBeInTheDocument()
        expect(screen.getByText('▲ 10% vs. agosto')).toHaveClass('text-dsgreen')
    })
    it('comparacion sin anterior: sin línea', () => {
        render(<TileComparacion titulo="Cobertura" ayuda="a" formato="porcentaje" valor={{ actual: 0.55, anterior: null }} mes="2026-09" />)
        expect(screen.queryByText(/vs\./)).toBeNull()
    })
    it('lista: filas tocables cuando hay onFila', () => {
        const onFila = vi.fn()
        render(<TileLista titulo="Clientes por estado" ayuda="a" formato="numero"
            filas={[{ etiqueta: 'Activo', valor: 52 }, { etiqueta: 'Inactivo', valor: 70 }]} onFila={onFila} />)
        fireEvent.click(screen.getByRole('button', { name: /Inactivo/ }))
        expect(onFila).toHaveBeenCalledWith({ etiqueta: 'Inactivo', valor: 70 })
        expect(screen.getByText('70')).toBeInTheDocument()
    })
    it('lista sin onFila: no hay botones; vacía: mensaje', () => {
        render(<TileLista titulo="Objeciones" ayuda="a" formato="numero" filas={[{ etiqueta: 'Precio', valor: 3 }]} />)
        expect(screen.queryByRole('button', { name: /Precio/ })).toBeNull()
        render(<TileLista titulo="Objeciones 2" ayuda="a" formato="numero" filas={[]} />)
        expect(screen.getByText('Nada para mostrar este mes')).toBeInTheDocument()
    })
    it('sin datos: título visible y mensaje', () => {
        render(<TileSinDatos titulo="Facturación" ayuda="a" mensaje="Sin datos por ahora" />)
        expect(screen.getByText('Facturación')).toBeInTheDocument()
        expect(screen.getByText('Sin datos por ahora')).toBeInTheDocument()
    })
})
