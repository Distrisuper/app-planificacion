import { describe, expect, it } from 'vitest'
import { formatHoras, formatMillones, formatVariacion, rangoDelMes, razon, tonoCumplimiento, variacion } from './misMetricas'

describe('misMetricas', () => {
    it('razon sin denominador es null, no 0', () => {
        expect(razon(3, 0)).toBeNull()
        expect(razon(3, null)).toBeNull()
        expect(razon(1, 4)).toBe(0.25)
    })

    it('variacion contra MMAA en cero no existe', () => {
        expect(variacion(10, 0)).toBeNull()
        expect(variacion(90, 100)).toBeCloseTo(-0.1)
    })

    it('formatea variación con signo, horas y millones con coma', () => {
        expect(formatVariacion(0.06)).toBe('+6%')
        expect(formatVariacion(-0.1)).toBe('-10%')
        expect(formatHoras(4932)).toBe('82,2')
        expect(formatMillones(132_400_000)).toBe('132,4')
    })

    it('semáforo de cumplimiento', () => {
        expect(tonoCumplimiento(null)).toBe('neutro')
        expect(tonoCumplimiento(0.82)).toBe('ok')
        expect(tonoCumplimiento(0.6)).toBe('medio')
        expect(tonoCumplimiento(0.3)).toBe('bajo')
    })

    it('el mes en curso corta en hoy (el MMAA se compara sobre el mismo rango)', () => {
        const hoy = new Date(2026, 8, 28)
        expect(rangoDelMes(new Date(2026, 8, 1), hoy)).toEqual({ desde: '2026-09-01', hasta: '2026-09-28', enCurso: true })
    })

    it('un mes pasado va completo', () => {
        const hoy = new Date(2026, 8, 28)
        expect(rangoDelMes(new Date(2026, 1, 1), hoy)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28', enCurso: false })
    })
})
