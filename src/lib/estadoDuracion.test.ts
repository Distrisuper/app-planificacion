import { describe, expect, it } from 'vitest'
import {
    DURACION_ARRANQUE_MIN,
    DURACION_LARGA_MIN,
    estadoVisitaVivo,
    PALETA_VISITA_VIVO,
} from './estadoDuracion'

const min = (m: number) => m * 60

describe('estadoVisitaVivo', () => {
    it('antes del piso es arranque', () => {
        expect(estadoVisitaVivo(0)).toBe('arranque')
        expect(estadoVisitaVivo(min(14) + 59)).toBe('arranque')
    })

    it('el piso exacto ya es valida (inclusive)', () => {
        expect(estadoVisitaVivo(min(DURACION_ARRANQUE_MIN))).toBe('valida')
    })

    it('el techo exacto sigue siendo valida (inclusive)', () => {
        expect(estadoVisitaVivo(min(DURACION_LARGA_MIN))).toBe('valida')
        expect(estadoVisitaVivo(min(DURACION_LARGA_MIN) + 1)).toBe('larga')
    })

    it('alejado gana sobre cualquier duración', () => {
        expect(estadoVisitaVivo(0, true)).toBe('alejado')
        expect(estadoVisitaVivo(min(30), true)).toBe('alejado')
        expect(estadoVisitaVivo(min(200), true)).toBe('alejado')
    })

    it('rojo es exclusivo de alejado: ningún estado por duración lo usa', () => {
        for (const estado of ['arranque', 'valida', 'larga'] as const) {
            expect(PALETA_VISITA_VIVO[estado].barra).not.toBe('bg-dsred')
        }
        expect(PALETA_VISITA_VIVO.alejado.barra).toBe('bg-dsred')
    })

    it('verde es exclusivo de valida', () => {
        expect(PALETA_VISITA_VIVO.valida.barra).toBe('bg-dsgreen')
        expect(PALETA_VISITA_VIVO.arranque.barra).not.toBe('bg-dsgreen')
        expect(PALETA_VISITA_VIVO.larga.barra).not.toBe('bg-dsgreen')
    })
})
