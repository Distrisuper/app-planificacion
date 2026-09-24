import { describe, expect, it } from 'vitest'
import { formatearValor, formatearVariacion, semaforo, variacion } from './formato'

describe('formato', () => {
    it('formatearValor por formato', () => {
        expect(formatearValor('numero', 1234)).toBe('1.234')
        expect(formatearValor('porcentaje', 0.4267)).toBe('43%')
        expect(formatearValor('horas', 2460)).toBe('41 hs')
        expect(formatearValor('horas', 90)).toBe('1,5 hs')
        expect(formatearValor('pesosMillones', 132_400_000)).toBe('$132,4M')
        expect(formatearValor('pesosMillones', 850_000)).toBe('$0,9M')
        expect(formatearValor('unidades', 430)).toBe('430 u.')
        expect(formatearValor('numero', null)).toBe('s/d')
    })
    it('semaforo por tramos', () => {
        expect(semaforo(40, 100)).toBe('rojo')
        expect(semaforo(50, 100)).toBe('ambar')
        expect(semaforo(75, 100)).toBe('verde')
        expect(semaforo(120, 100)).toBe('verde')
    })
    it('variacion y su formato', () => {
        expect(variacion(112, 100)).toBeCloseTo(0.12)
        expect(variacion(100, 0)).toBeNull()
        expect(variacion(null, 100)).toBeNull()
        expect(formatearVariacion(0.12)).toBe('▲ 12%')
        expect(formatearVariacion(-0.084)).toBe('▼ 8%')
        expect(formatearVariacion(0)).toBe('= 0%')
        expect(formatearVariacion(null)).toBe('')
    })
})
