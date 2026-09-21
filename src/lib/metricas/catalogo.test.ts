import { describe, expect, it } from 'vitest'
import { CATALOGO } from './catalogo'
import { MOCK_METRICAS } from '@/mocks/metricasMock'

describe('catalogo', () => {
    it('ids únicos y orden de secciones del spec', () => {
        const ids = CATALOGO.flatMap(s => s.tiles.map(t => t.id))
        expect(new Set(ids).size).toBe(ids.length)
        expect(CATALOGO.map(s => s.id)).toEqual(['mes', 'visitas', 'cartera'])
    })
    it('títulos según sujeto', () => {
        const [mes] = CATALOGO
        expect(mes.titulo({ propio: true, nombre: 'X' })).toBe('Mi mes')
        expect(mes.titulo({ propio: false, nombre: 'ACOSTA' })).toBe('ACOSTA · mes')
    })
    it('con el fixture completo ningún tile devuelve null', () => {
        for (const t of CATALOGO.flatMap(s => s.tiles)) expect(t.leer(MOCK_METRICAS), t.id).not.toBeNull()
    })
    it('sin ventas, solo los tiles de cartera devuelven null', () => {
        const sinVentas = { ...MOCK_METRICAS, ventas: null }
        for (const s of CATALOGO) for (const t of s.tiles) {
            if (s.id === 'cartera') expect(t.leer(sinVentas), t.id).toBeNull()
            else expect(t.leer(sinVentas), t.id).not.toBeNull()
        }
    })
    it('las listas con detalle mapean la fila a un estado', () => {
        const estado = CATALOGO[2].tiles.find(t => t.id === 'clientesPorEstado')!
        expect(estado.forma).toBe('lista')
        if (estado.forma === 'lista') expect(estado.detalle!({ etiqueta: 'Inactivo', valor: 1 })).toBe('Inactivo')
        const caida = CATALOGO[2].tiles.find(t => t.id === 'clientesEnCaida')!
        if (caida.forma === 'lista') expect(caida.detalle!({ etiqueta: 'X', valor: 1 })).toBe('caida')
    })
})
