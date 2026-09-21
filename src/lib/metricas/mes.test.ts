import { describe, expect, it } from 'vitest'
import { mesActual, mesAnterior, nombreDeMes } from './mes'

describe('mes', () => {
    it('mesActual respeta la TZ de negocio', () => {
        expect(mesActual(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09')   // 30/09 22:00 en BA
    })
    it('mesAnterior cruza el año', () => {
        expect(mesAnterior('2026-01')).toBe('2025-12')
        expect(mesAnterior('2026-09')).toBe('2026-08')
    })
    it('nombreDeMes en minúscula', () => {
        expect(nombreDeMes('2026-08')).toBe('agosto')
        expect(nombreDeMes('2026-01')).toBe('enero')
    })
})
