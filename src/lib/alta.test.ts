import { describe, expect, it } from 'vitest'
import { esAlta, puedeCerrarAlta } from './alta'

describe('esAlta', () => {
    it('esAlta solo con tipo alta', () => {
        expect(esAlta({ tipo: 'alta' })).toBe(true)
        expect(esAlta({ tipo: 'cliente' })).toBe(false)
        expect(esAlta({})).toBe(false)
        expect(esAlta(null)).toBe(false)
    })
})

describe('puedeCerrarAlta', () => {
    it('un ofrecimiento completo o una observación no vacía', () => {
        expect(puedeCerrarAlta(0, '')).toBe(false)
        expect(puedeCerrarAlta(0, '   ')).toBe(false)
        expect(puedeCerrarAlta(1, '')).toBe(true)
        expect(puedeCerrarAlta(0, 'lo piensa')).toBe(true)
    })
})
